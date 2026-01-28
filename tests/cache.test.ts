import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
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

describe('Storage Adapters', () => {
  let storageMock: any;

  beforeEach(() => {
    let store: Record<string, string> = {};
    storageMock = {
      getItem: vi.fn((key: string) => store[key] || null),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = value.toString();
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key];
      }),
      clear: vi.fn(() => {
        store = {};
      }),
      key: vi.fn((index: number) => Object.keys(store)[index] || null),
      get length() {
        return Object.keys(store).length;
      },
    };

    vi.stubGlobal('localStorage', storageMock);
    vi.stubGlobal('sessionStorage', storageMock);
    vi.stubGlobal('window', {
      localStorage: storageMock,
      sessionStorage: storageMock,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('should use MemoryAdapter by default', () => {
    const cache = new CacheManager();
    cache.set('mem', 'val');
    expect(cache.get('mem')).toBe('val');
    // Should NOT use localStorage
    expect(storageMock.setItem).not.toHaveBeenCalled();
  });

  it('should use LocalStorageAdapter when specified', () => {
    const cache = new CacheManager({ storage: 'local' });
    cache.set('loc', 'val');

    // Check internal storage call
    expect(storageMock.setItem).toHaveBeenCalledWith(
      expect.stringContaining('reixo-cache:loc'),
      expect.stringContaining('val')
    );

    // Retrieve
    expect(cache.get('loc')).toBe('val');
  });

  it('should handle SessionStorageAdapter', () => {
    const cache = new CacheManager({ storage: 'session' });
    cache.set('sess', 'val');

    expect(storageMock.setItem).toHaveBeenCalled();
    expect(cache.get('sess')).toBe('val');
  });

  it('should respect custom prefix', () => {
    const cache = new CacheManager({ storage: 'local', keyPrefix: 'custom:' });
    cache.set('key', 'val');

    expect(storageMock.setItem).toHaveBeenCalledWith('custom:key', expect.any(String));
  });

  it('should clear all keys with prefix', () => {
    const cache = new CacheManager({ storage: 'local', keyPrefix: 'app:' });
    cache.set('k1', 'v1');
    cache.set('k2', 'v2');

    // Manually add unrelated key
    storageMock.setItem('other:k3', 'v3');

    cache.clear();

    expect(storageMock.removeItem).toHaveBeenCalledWith('app:k1');
    expect(storageMock.removeItem).toHaveBeenCalledWith('app:k2');
    // Should not remove unrelated key (though our mock implementation logic in clear() relies on calls)
    // In our mock, we check if logic calls removeItem correctly.
    // The WebStorageAdapter.clear() iterates and removes.
  });

  it('should handle corrupted JSON in storage', () => {
    const cache = new CacheManager({ storage: 'local' });
    storageMock.setItem('reixo-cache:bad', '{bad-json');

    expect(cache.get('bad')).toBeNull();
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

    await client.request('/users/1', { cacheConfig: false });
    await client.request('/users/1', { cacheConfig: false });

    expect(httpSpy).toHaveBeenCalledTimes(2);
  });
});
