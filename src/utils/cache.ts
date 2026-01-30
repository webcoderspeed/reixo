import { generateKey } from './keys';

export interface CacheEntry<T> {
  data: T;
  expiry: number; // Timestamp when the entry expires
  createdAt: number;
  tags?: string[];
}

export interface StorageAdapter {
  get(key: string): CacheEntry<unknown> | null;
  set(key: string, entry: CacheEntry<unknown>): void;
  delete(key: string): void;
  clear(): void;
  size(): number;
  keys(): IterableIterator<string> | string[];
}

export class MemoryAdapter implements StorageAdapter {
  private cache = new Map<string, CacheEntry<unknown>>();
  private readonly maxEntries: number;

  constructor(maxEntries: number = 100) {
    this.maxEntries = maxEntries;
  }

  get(key: string): CacheEntry<unknown> | null {
    const entry = this.cache.get(key);
    return entry || null;
  }

  set(key: string, entry: CacheEntry<unknown>): void {
    if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, entry);
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  keys(): IterableIterator<string> {
    return this.cache.keys();
  }
}

export class WebStorageAdapter implements StorageAdapter {
  private storage: Storage;
  private prefix: string;

  constructor(type: 'local' | 'session', prefix: string = 'reixo-cache:') {
    if (typeof window === 'undefined' || !window[`${type}Storage`]) {
      throw new Error(`Storage type "${type}" is not available in this environment.`);
    }
    this.storage = window[`${type}Storage`];
    this.prefix = prefix;
  }

  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  get(key: string): CacheEntry<unknown> | null {
    const item = this.storage.getItem(this.getKey(key));
    if (!item) return null;
    try {
      return JSON.parse(item) as CacheEntry<unknown>;
    } catch {
      return null;
    }
  }

  set(key: string, entry: CacheEntry<unknown>): void {
    try {
      this.storage.setItem(this.getKey(key), JSON.stringify(entry));
    } catch (e) {
      console.warn('Failed to save to storage', e);
    }
  }

  delete(key: string): void {
    this.storage.removeItem(this.getKey(key));
  }

  clear(): void {
    const keysToRemove: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key && key.startsWith(this.prefix)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => this.storage.removeItem(key));
  }

  size(): number {
    let count = 0;
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key && key.startsWith(this.prefix)) {
        count++;
      }
    }
    return count;
  }

  keys(): string[] {
    const keys: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key && key.startsWith(this.prefix)) {
        keys.push(key.slice(this.prefix.length));
      }
    }
    return keys;
  }
}

export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  maxEntries?: number; // Maximum number of entries in cache (Memory only)
  storage?: 'memory' | 'local' | 'session' | StorageAdapter;
  keyPrefix?: string;
  strategy?: 'cache-first' | 'network-only' | 'stale-while-revalidate';
}

/**
 * Cache manager with support for Memory, LocalStorage, and SessionStorage.
 */
export class CacheManager {
  private adapter: StorageAdapter;
  private readonly defaultTTL: number;

  constructor(options: CacheOptions = {}) {
    this.defaultTTL = options.ttl || 60000; // Default 1 minute

    if (typeof options.storage === 'object') {
      this.adapter = options.storage;
    } else if (options.storage === 'local') {
      this.adapter = new WebStorageAdapter('local', options.keyPrefix);
    } else if (options.storage === 'session') {
      this.adapter = new WebStorageAdapter('session', options.keyPrefix);
    } else {
      this.adapter = new MemoryAdapter(options.maxEntries || 100);
    }
  }

  /**
   * Generates a cache key from URL and options.
   * Delegates to the shared utility.
   */
  public generateKey(url: string, params?: Record<string, string | number | boolean>): string {
    return generateKey(url, params);
  }

  public set<T>(key: string, data: T, ttl: number = this.defaultTTL, tags: string[] = []): void {
    this.adapter.set(key, {
      data,
      expiry: Date.now() + ttl,
      createdAt: Date.now(),
      tags,
    });
  }

  /**
   * Returns the raw cache entry including metadata.
   * Does NOT auto-delete expired entries.
   */
  public getEntry<T>(key: string): CacheEntry<T> | null {
    const entry = this.adapter.get(key);
    return entry ? (entry as CacheEntry<T>) : null;
  }

  public get<T>(key: string): T | null {
    const entry = this.getEntry<T>(key);

    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiry) {
      this.adapter.delete(key);
      return null;
    }

    return entry.data;
  }

  public delete(key: string): void {
    this.adapter.delete(key);
  }

  public invalidateByTag(tag: string): void {
    const keys = Array.from(this.adapter.keys());
    for (const key of keys) {
      const entry = this.adapter.get(key);
      if (entry && entry.tags && entry.tags.includes(tag)) {
        this.adapter.delete(key);
      }
    }
  }

  public invalidateByPattern(pattern: RegExp | string): void {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    const keys = Array.from(this.adapter.keys());
    for (const key of keys) {
      if (regex.test(key)) {
        this.adapter.delete(key);
      }
    }
  }

  public clear(): void {
    this.adapter.clear();
  }

  public get size(): number {
    return this.adapter.size();
  }
}
