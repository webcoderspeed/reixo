import { generateKey } from './keys';

export interface CacheEntry<T> {
  data: T;
  expiry: number; // Timestamp when the entry expires
  createdAt: number;
}

export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  maxEntries?: number; // Maximum number of entries in cache
}

/**
 * Simple in-memory cache with TTL support.
 */
export class CacheManager {
  private cache = new Map<string, CacheEntry<unknown>>();
  private readonly defaultTTL: number;
  private readonly maxEntries: number;

  constructor(options: CacheOptions = {}) {
    this.defaultTTL = options.ttl || 60000; // Default 1 minute
    this.maxEntries = options.maxEntries || 100;
  }

  /**
   * Generates a cache key from URL and options.
   * Delegates to the shared utility.
   */
  public generateKey(url: string, params?: Record<string, string | number | boolean>): string {
    return generateKey(url, params);
  }

  public set<T>(key: string, data: T, ttl: number = this.defaultTTL): void {
    // Eviction policy: LRU-like (delete oldest if full)
    // Note: Map preserves insertion order. To strictly implement LRU, we'd re-insert on access.
    // For simplicity, if full, we just delete the first key (oldest inserted).
    if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      data,
      expiry: Date.now() + ttl,
      createdAt: Date.now(),
    });
  }

  public get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  public delete(key: string): void {
    this.cache.delete(key);
  }

  public clear(): void {
    this.cache.clear();
  }

  public get size(): number {
    return this.cache.size;
  }
}
