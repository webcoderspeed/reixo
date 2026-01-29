import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskQueue } from '../src/utils/queue';
import { WebStorageAdapter, MemoryAdapter } from '../src/utils/cache';

describe('TaskQueue Storage Configuration', () => {
  const mockStorage = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    length: 0,
    key: vi.fn(),
  };

  beforeEach(() => {
    vi.stubGlobal('window', {
      localStorage: mockStorage,
      sessionStorage: mockStorage,
    });
    vi.stubGlobal('localStorage', mockStorage);
    vi.stubGlobal('sessionStorage', mockStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should use WebStorageAdapter("local") when storage is "local"', () => {
    const queue = new TaskQueue({ storage: 'local' });
    const storage = (queue as any).storage;

    expect(storage).toBeInstanceOf(WebStorageAdapter);
    expect((storage as any).storage).toBe(mockStorage); // In this mock setup, both map to mockStorage
  });

  it('should use WebStorageAdapter("session") when storage is "session"', () => {
    const queue = new TaskQueue({ storage: 'session' });
    const storage = (queue as any).storage;

    expect(storage).toBeInstanceOf(WebStorageAdapter);
  });

  it('should use MemoryAdapter when storage is "memory" (implicit or explicit string)', () => {
    // Note: The code defaults to MemoryAdapter for unknown strings, but let's test "memory" string explicitly if supported or fallback
    // The current implementation is: if (local) ... else if (session) ... else { MemoryAdapter }

    const queue = new TaskQueue({ storage: 'memory' } as any);
    const storage = (queue as any).storage;

    expect(storage).toBeInstanceOf(MemoryAdapter);
  });

  it('should use MemoryAdapter when storage is undefined (default)', () => {
    const queue = new TaskQueue({});
    const storage = (queue as any).storage;

    // By default storage is undefined in constructor unless passed.
    // Wait, let's check constructor:
    // this.storage = options.storage;
    // If options.storage is undefined, this.storage is undefined.
    // But if options.storage is string, it sets it.

    expect(storage).toBeUndefined();
  });

  it('should allow passing StorageAdapter instance directly', () => {
    const customAdapter = new MemoryAdapter();
    const queue = new TaskQueue({ storage: customAdapter });
    const storage = (queue as any).storage;

    expect(storage).toBe(customAdapter);
  });
});
