import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HTTPBuilder } from '../src/core/http-client';
import { GraphQLClient } from '../src/core/graphql-client';
import { generateKey } from '../src/utils/keys';
import { sha256, simpleHash } from '../src/utils/hash';

// Mock fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('Modern Data Synchronization Features', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    // Default success response
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers([['content-type', 'application/json']]),
      json: async () => ({ data: { id: 1 } }),
      text: async () => JSON.stringify({ data: { id: 1 } }),
    });
  });

  describe('Persisted Queries (APQ)', () => {
    it('should perform Automatic Persisted Query flow', async () => {
      const client = new GraphQLClient('https://graphql.api', {
        enablePersistedQueries: true,
      });

      const query = 'query { user { id name } }';
      const hash = await sha256(query);

      // 1. First request: Send Hash only
      // Mock server returning "PersistedQueryNotFound"
      fetchMock.mockResolvedValueOnce({
        ok: true, // GraphQL often returns 200 even for errors
        status: 200,
        headers: new Headers([['content-type', 'application/json']]),
        json: async () => ({
          errors: [{ message: 'PersistedQueryNotFound' }],
        }),
        text: async () =>
          JSON.stringify({
            errors: [{ message: 'PersistedQueryNotFound' }],
          }),
      });

      // 2. Second request: Send Full Query + Hash
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers([['content-type', 'application/json']]),
        json: async () => ({ data: { user: { id: 1, name: 'Test' } } }),
        text: async () => JSON.stringify({ data: { user: { id: 1, name: 'Test' } } }),
      });

      const result = await client.query(query);

      expect(result.data).toEqual({ user: { id: 1, name: 'Test' } });
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // Verify first call (Hash only)
      const firstCallBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(firstCallBody.extensions.persistedQuery.sha256Hash).toBe(hash);
      expect(firstCallBody.query).toBeUndefined();

      // Verify second call (Query + Hash)
      const secondCallBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
      expect(secondCallBody.query).toBe(query);
      expect(secondCallBody.extensions.persistedQuery.sha256Hash).toBe(hash);
    });

    it('should use hash directly if server accepts it', async () => {
      const client = new GraphQLClient('https://graphql.api', {
        enablePersistedQueries: true,
      });

      const query = 'query { simple }';
      const hash = await sha256(query);

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers([['content-type', 'application/json']]),
        json: async () => ({ data: { simple: true } }),
        text: async () => JSON.stringify({ data: { simple: true } }),
      });

      await client.query(query);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.extensions.persistedQuery.sha256Hash).toBe(hash);
      expect(body.query).toBeUndefined();
    });
  });

  describe('Hashed Cache Keys', () => {
    it('should hash long keys', () => {
      const shortUrl = 'https://api.test/short';
      const shortKey = generateKey(shortUrl);
      expect(shortKey).toBe(shortUrl);

      const longUrl = 'https://api.test/long/' + 'a'.repeat(300);
      const longKey = generateKey(longUrl);

      expect(longKey).not.toBe(longUrl);
      expect(longKey).toContain('hash:');
      expect(longKey.length).toBeLessThan(longUrl.length);
      expect(longKey).toContain(simpleHash(longUrl));
    });
  });

  describe('Optimistic Updates', () => {
    it('should update cache optimistically via mutate', async () => {
      const client = HTTPBuilder.create('https://api.test')
        .withCache({ strategy: 'cache-first' })
        .build();

      const url = '/user';

      // Seed cache
      client.setQueryData(url, { name: 'Old' });
      expect(client.getQueryData(url)).toEqual({ name: 'Old' });

      // Mutate optimistically
      await client.mutate(url, { name: 'New' }, { revalidate: false });

      expect(client.getQueryData(url)).toEqual({ name: 'New' });
      expect(fetchMock).not.toHaveBeenCalled(); // No network request
    });

    it('should support functional updates', async () => {
      const client = HTTPBuilder.create('https://api.test').withCache(true).build();

      const url = '/count';
      client.setQueryData(url, { count: 1 });

      await client.mutate<{ count: number }>(url, (old) => ({ count: (old?.count ?? 0) + 1 }));

      expect(client.getQueryData(url)).toEqual({ count: 2 });
    });

    it('should revalidate after mutation if requested', async () => {
      const client = HTTPBuilder.create('https://api.test').withCache(true).build();

      const url = '/refresh';
      client.setQueryData(url, { val: 1 });

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers([['content-type', 'application/json']]),
        json: async () => ({ val: 100 }),
        text: async () => JSON.stringify({ val: 100 }),
      });

      await client.mutate(url, { val: 2 }, { revalidate: true });

      // Should be updated from network response
      // Wait, mutate calls request, which updates cache.
      // But request is async.

      // Let's verify network call happened
      expect(fetchMock).toHaveBeenCalled();

      // And cache should be updated with NETWORK data, overriding optimistic data
      expect(client.getQueryData(url)).toEqual({ val: 100 });
    });
  });

  describe('Suspense Support', () => {
    it('should throw promise if data is missing', () => {
      const client = HTTPBuilder.create('https://api.test').withCache(true).build();

      try {
        client.read('/suspense');
        // Should not reach here
        expect(true).toBe(false);
      } catch (promise) {
        expect(promise).toBeInstanceOf(Promise);
      }
    });

    it('should return data if cached', () => {
      const client = HTTPBuilder.create('https://api.test').withCache(true).build();

      client.setQueryData('/cached', { success: true });
      const data = client.read('/cached');

      expect(data).toEqual({ success: true });
    });
  });
});
