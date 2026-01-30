import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HTTPBuilder } from '../src/core/http-client';

const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('SWR and Prefetch Strategies', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.useFakeTimers();

    // Default mock response
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers([['content-type', 'application/json']]),
      json: async () => ({ id: 1, value: 'fresh' }),
      text: async () => JSON.stringify({ id: 1, value: 'fresh' }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should support stale-while-revalidate strategy', async () => {
    const client = HTTPBuilder.create('https://api.test')
      .withCache({ strategy: 'stale-while-revalidate', ttl: 1000 })
      .build();

    // Manually inject stale data into cache via a first request
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ value: 'stale' }),
      text: async () => JSON.stringify({ value: 'stale' }),
    });

    // 1. First request: populate cache
    await client.get('/data', { responseType: 'json' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Fast forward time to expire the cache item (TTL 1000)
    vi.advanceTimersByTime(1500);

    // Now set up fetch for fresh data
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ value: 'fresh' }),
      text: async () => JSON.stringify({ value: 'fresh' }),
    });

    // Setup listener for revalidation
    const revalidateSpy = vi.fn();
    client.on('cache:revalidate', revalidateSpy);

    // 2. Second request: should return stale data immediately AND trigger revalidation
    const response = await client.get('/data', { responseType: 'json' });

    // Should return stale data
    expect(response.data).toEqual({ value: 'stale' });

    // Wait for the background promise to resolve
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(revalidateSpy).toHaveBeenCalled();
    });

    expect(revalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { value: 'fresh' },
      })
    );

    // 3. Third request: should return fresh data (from cache, as it was updated)
    const response3 = await client.get('/data');
    expect(response3.data).toEqual({ value: 'fresh' });
  });

  it('should support prefetch', async () => {
    const client = HTTPBuilder.create('https://api.test')
      .withCache({ strategy: 'cache-first' })
      .build();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ value: 'prefetched' }),
      text: async () => JSON.stringify({ value: 'prefetched' }),
    });

    // Prefetch
    client.prefetch('/prefetch-data', { responseType: 'json' });

    // Wait for prefetch to complete
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    // Requesting same URL should use cache (no new fetch)
    const response = await client.get('/prefetch-data', { responseType: 'json' });
    expect(response.data).toEqual({ value: 'prefetched' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  describe('Auto Revalidation', () => {
    let windowEvents: Record<string, any[]> = {};

    beforeEach(() => {
      windowEvents = {};
      vi.stubGlobal('window', {
        addEventListener: (event: string, cb: any) => {
          if (!windowEvents[event]) windowEvents[event] = [];
          windowEvents[event].push(cb);
        },
        removeEventListener: (event: string, cb: any) => {
          if (windowEvents[event]) {
            windowEvents[event] = windowEvents[event].filter((l) => l !== cb);
          }
        },
      });
      vi.stubGlobal('document', {
        visibilityState: 'visible',
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('should revalidate on window focus', async () => {
      const client = HTTPBuilder.create('https://api.test')
        .withRevalidation({ focus: true })
        .build();

      // Setup subscription
      const onChange = vi.fn();
      client.subscribe('/focus-data', onChange);

      // Mock fetch for revalidation
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ value: 'focused' }),
        text: async () => JSON.stringify({ value: 'focused' }),
      });

      // Trigger focus
      const focusHandlers = windowEvents['focus'];
      expect(focusHandlers).toBeDefined();
      focusHandlers.forEach((handler) => handler());

      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith('https://api.test/focus-data', expect.anything());
      });
    });

    it('should revalidate on network reconnect', async () => {
      const client = HTTPBuilder.create('https://api.test')
        .withRevalidation({ reconnect: true })
        .build();

      // Setup subscription
      const onChange = vi.fn();
      client.subscribe('/online-data', onChange);

      // Mock fetch for revalidation
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ value: 'online' }),
        text: async () => JSON.stringify({ value: 'online' }),
      });

      // Trigger online
      const onlineHandlers = windowEvents['online'];
      expect(onlineHandlers).toBeDefined();
      onlineHandlers.forEach((handler) => handler());

      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith('https://api.test/online-data', expect.anything());
      });
    });

    it('should support optimistic updates via mutate', async () => {
      const client = HTTPBuilder.create('https://api.test')
        .withCache({ strategy: 'cache-first' })
        .build();

      // 1. Prime cache
      client.setQueryData('/todos', [{ id: 1, text: 'old' }]);

      // 2. Optimistic update
      const updatePromise = client.mutate<any[]>(
        '/todos',
        (old) => {
          return [...(old || []), { id: 2, text: 'new' }];
        },
        { revalidate: true }
      );

      // Check cache immediately (optimistic)
      expect(client.getQueryData('/todos')).toEqual([
        { id: 1, text: 'old' },
        { id: 2, text: 'new' },
      ]);

      // Mock server response for revalidation
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => [
          { id: 1, text: 'old' },
          { id: 2, text: 'new (confirmed)' },
        ],
        text: async () =>
          JSON.stringify([
            { id: 1, text: 'old' },
            { id: 2, text: 'new (confirmed)' },
          ]),
      });

      // Wait for revalidation
      await updatePromise;

      // Check cache after revalidation
      expect(client.getQueryData('/todos')).toEqual([
        { id: 1, text: 'old' },
        { id: 2, text: 'new (confirmed)' },
      ]);
    });

    it('should support Suspense via read method', async () => {
      const client = HTTPBuilder.create('https://api.test')
        .withCache({ strategy: 'cache-first' })
        .withDeduplication(true)
        .build();

      // 1. First call: should throw promise
      let thrown: any;
      try {
        client.read('/suspense-data');
      } catch (e) {
        thrown = e;
      }

      expect(thrown).toBeInstanceOf(Promise);

      // Mock response
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ value: 'suspended' }),
        text: async () => JSON.stringify({ value: 'suspended' }),
      });

      // Wait for promise
      await thrown;

      // 2. Second call: should return data
      const data = client.read('/suspense-data');
      expect(data).toEqual({ value: 'suspended' });
    });
  });
});
