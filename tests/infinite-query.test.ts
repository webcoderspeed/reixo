import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HTTPBuilder } from '../src/core/http-client';

// Mock fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

// Ensure Headers is available
if (typeof Headers === 'undefined') {
  global.Headers = class Headers extends Map {
    append(key: string, value: string) {
      this.set(key, value);
    }
    get(key: string): string | null {
      return (super.get(key) as string) || null;
    }
  } as any;
}

describe('InfiniteQuery', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    // Default implementation to catch unexpected calls
    fetchMock.mockImplementation(() => {
      console.warn('Unexpected fetch call');
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => JSON.stringify({}),
        headers: new Headers([['content-type', 'application/json']]),
      });
    });
  });

  it('should fetch next page correctly', async () => {
    const client = HTTPBuilder.create('https://api.test').build();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ items: [1, 2], nextCursor: 2 }),
      text: async () => JSON.stringify({ items: [1, 2], nextCursor: 2 }),
      headers: new Headers([['content-type', 'application/json']]),
    });

    const query = client.infiniteQuery<any>('/items', {
      initialPageParam: 1,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      params: (pageParam) => ({ cursor: pageParam as number }),
    });

    // First fetch
    await query.fetchNextPage();

    expect(query.data.pages).toHaveLength(1);
    expect(query.data.pages[0].items).toEqual([1, 2]);
    expect(query.data.pageParams).toEqual([1]);
    expect(fetchMock).toHaveBeenCalledWith('https://api.test/items?cursor=1', expect.anything());

    // Mock second page
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ items: [3, 4], nextCursor: null }),
      text: async () => JSON.stringify({ items: [3, 4], nextCursor: null }),
      headers: new Headers([['content-type', 'application/json']]),
    });

    // Second fetch
    await query.fetchNextPage();

    expect(query.data.pages).toHaveLength(2);
    expect(query.data.pages[1].items).toEqual([3, 4]);
    expect(query.data.pageParams).toEqual([1, 2]);
    expect(fetchMock).toHaveBeenCalledWith('https://api.test/items?cursor=2', expect.anything());

    expect(query.hasNextPage).toBe(false);
  });

  it('should fetch previous page correctly', async () => {
    const client = HTTPBuilder.create('https://api.test').build();

    // Mock middle page
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ items: [3, 4], prevCursor: 1, nextCursor: 3 }),
      text: async () => JSON.stringify({ items: [3, 4], prevCursor: 1, nextCursor: 3 }),
      headers: new Headers([['content-type', 'application/json']]),
    });

    const query = client.infiniteQuery<any>('/items', {
      initialPageParam: 2,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      getPreviousPageParam: (firstPage) => firstPage.prevCursor,
      params: (pageParam) => ({ cursor: pageParam as number }),
    });

    // Initial fetch (middle page)
    await query.fetchNextPage();
    expect(query.data.pages[0].items).toEqual([3, 4]);

    // Mock previous page
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ items: [1, 2], prevCursor: null, nextCursor: 2 }),
      text: async () => JSON.stringify({ items: [1, 2], prevCursor: null, nextCursor: 2 }),
      headers: new Headers([['content-type', 'application/json']]),
    });

    // Fetch previous
    await query.fetchPreviousPage();

    expect(query.data.pages).toHaveLength(2);
    expect(query.data.pages[0].items).toEqual([1, 2]); // Should be first now
    expect(query.data.pages[1].items).toEqual([3, 4]);
    expect(query.data.pageParams).toEqual([1, 2]);

    expect(fetchMock).toHaveBeenCalledWith('https://api.test/items?cursor=1', expect.anything());
    expect(query.hasPreviousPage).toBe(false);
  });

  it('should handle errors', async () => {
    const client = HTTPBuilder.create('https://api.test').withRetry(false).build();

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({ message: 'Error' }),
      text: async () => JSON.stringify({ message: 'Error' }),
      headers: new Headers([['content-type', 'application/json']]),
    });

    const query = client.infiniteQuery<any>('/items', {
      initialPageParam: 1,
      getNextPageParam: () => null,
    });

    await expect(query.fetchNextPage()).rejects.toThrow('Internal Server Error');
    expect(query.error).toBeTruthy();
    expect(query.isFetching).toBe(false);
  });
});
