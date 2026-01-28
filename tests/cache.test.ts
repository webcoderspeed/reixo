import { describe, it, expect, vi, afterEach } from 'vitest';
import { CacheManager } from '../src/utils/cache';
import { HTTPClient } from '../src/core/http-client';
import * as httpUtils from '../src/utils/http';

describe('CacheManager', () => {
  it('should store and retrieve data', () => {
    const cache = new CacheManager();
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('should expire entries after TTL', async () => {
    const cache = new CacheManager({ ttl: 10 }); // 10ms TTL
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(cache.get('key1')).toBeNull();
  });

  it('should respect max entries limit (LRU-like)', () => {
    const cache = new CacheManager({ maxEntries: 2 });
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3'); // Should evict key1

    expect(cache.get('key1')).toBeNull();
    expect(cache.get('key2')).toBe('value2');
    expect(cache.get('key3')).toBe('value3');
  });

  it('should generate consistent keys', () => {
    const cache = new CacheManager();
    const key1 = cache.generateKey('/api/users', { page: 1, limit: 10 });
    const key2 = cache.generateKey('/api/users', { limit: 10, page: 1 }); // Different order
    expect(key1).toBe(key2);
  });
});

describe('HTTPClient Caching', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should cache GET requests', async () => {
    const client = new HTTPClient({
      cacheConfig: true,
    });

    const httpSpy = vi.spyOn(httpUtils, 'http').mockResolvedValue({
      data: { id: 1 },
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      config: {},
    });

    // First request - network hit
    await client.request('/users/1');
    expect(httpSpy).toHaveBeenCalledTimes(1);

    // Second request - cache hit
    const response = await client.request('/users/1');
    expect(httpSpy).toHaveBeenCalledTimes(1); // Should still be 1
    expect(response.data).toEqual({ id: 1 });
    expect(response.statusText).toBe('OK (Cached)');
  });

  it('should distinguish requests by query params', async () => {
    const client = new HTTPClient({
      cacheConfig: true,
    });

    const httpSpy = vi.spyOn(httpUtils, 'http').mockResolvedValue({
      data: { id: 1 },
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      config: {},
    });

    await client.request('/users', { params: { page: 1 } });
    await client.request('/users', { params: { page: 2 } });

    expect(httpSpy).toHaveBeenCalledTimes(2);
  });

  it('should bypass cache if cacheConfig is false in request', async () => {
    const client = new HTTPClient({
      cacheConfig: true,
    });

    const httpSpy = vi.spyOn(httpUtils, 'http').mockResolvedValue({
      data: { id: 1 },
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      config: {},
    });

    await client.request('/users/1');
    await client.request('/users/1', { cacheConfig: false });

    expect(httpSpy).toHaveBeenCalledTimes(2);
  });
});
