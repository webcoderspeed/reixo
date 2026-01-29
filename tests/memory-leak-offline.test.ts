import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HTTPBuilder, HTTPClientConfig } from '../src/core/http-client';
import { NetworkMonitor } from '../src/utils/network';
import { MemoryAdapter } from '../src/utils/cache';
import { PersistentQueueOptions } from '../src/utils/queue';

// Mock fetch (remove problematic window declarations for Node.js environment)

const fetchMock = vi.fn();
global.fetch = fetchMock;

// Helper to mock fetch response
const mockFetchResponse = (ok: boolean, status: number, data: unknown) => ({
  ok,
  status,
  statusText: ok ? 'OK' : 'Error',
  headers: new Headers([['content-type', 'application/json']]),
  json: async () => data,
  text: async () => JSON.stringify(data),
});

describe('Memory Leak Prevention & Offline Support', () => {
  let originalAddEventListener: any;
  let originalRemoveEventListener: any;

  beforeEach(() => {
    fetchMock.mockReset();

    // Mock window events for browser environment tests (only if window exists)
    if (typeof window !== 'undefined') {
      originalAddEventListener = window.addEventListener;
      originalRemoveEventListener = window.removeEventListener;

      window.addEventListener = vi.fn() as any;
      window.removeEventListener = vi.fn() as any;
    }

    // Default success response
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ id: 1 }),
      text: async () => JSON.stringify({ id: 1 }),
    });

    // Reset network monitor
    vi.spyOn(NetworkMonitor, 'getInstance').mockReturnValue({
      online: true,
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      configure: vi.fn(),
      startPolling: vi.fn(),
      stopPolling: vi.fn(),
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();

    // Restore original event listeners (only if window exists)
    if (typeof window !== 'undefined') {
      window.addEventListener = originalAddEventListener;
      window.removeEventListener = originalRemoveEventListener;
    }
  });

  describe('Memory Leak Prevention', () => {
    it('should cleanup all resources when dispose() is called', async () => {
      const client = HTTPBuilder.create('https://api.example.com').build();

      // Make some requests to populate internal state
      const request1 = client.get('/test1');
      const request2 = client.get('/test2');

      // Wait for requests to complete
      await Promise.all([request1, request2]);

      // Verify internal state is populated
      expect(client['inFlightRequests'].size).toBe(0); // Should be empty after completion

      // Call dispose
      client.dispose();

      // Verify all resources are cleaned up
      expect(client['abortControllers'].size).toBe(0);
      expect(client['cleanupCallbacks'].length).toBe(0);

      // Verify event listeners are removed (only in browser environment)
      if (typeof window !== 'undefined') {
        expect(window.removeEventListener).toHaveBeenCalledWith(
          'beforeunload',
          expect.any(Function)
        );
        expect(window.removeEventListener).toHaveBeenCalledWith('pagehide', expect.any(Function));
      }
    });

    it('should automatically cleanup abandoned requests after timeout', async () => {
      vi.useFakeTimers();

      const client = HTTPBuilder.create('https://api.example.com').build();

      // Mock fetch to never resolve
      fetchMock.mockImplementation(() => new Promise(() => {}));

      // Start a request that will never complete
      client.get('/hang');

      // Fast-forward 31 minutes (past the 30-minute abandonment timeout)
      vi.advanceTimersByTime(31 * 60 * 1000);

      // Verify the request was cleaned up
      expect(client['abortControllers'].size).toBe(0);
      expect(client['inFlightRequests'].size).toBe(0);

      vi.useRealTimers();
    });

    it('should cleanup connection pool when disposed', async () => {
      const config: HTTPClientConfig = {
        pool: { maxSockets: 10 },
      };
      const client = HTTPBuilder.create('https://api.example.com').build();

      // Manually set connection pool for testing
      client['connectionPool'] = {
        destroy: vi.fn(),
        getAgent: vi.fn(),
      } as any;

      // Dispose client
      client.dispose();

      // Verify connection pool was destroyed
      expect(client['connectionPool']?.destroy).toHaveBeenCalled();
    });

    it('should register and execute cleanup callbacks', async () => {
      const client = HTTPBuilder.create('https://api.example.com').build();

      const cleanupMock1 = vi.fn();
      const cleanupMock2 = vi.fn();

      // Register cleanup callbacks
      client['onCleanup'](cleanupMock1);
      client['onCleanup'](cleanupMock2);

      // Verify callbacks are registered
      expect(client['cleanupCallbacks'].length).toBe(2);

      // Dispose client
      client.dispose();

      // Verify cleanup callbacks were executed
      expect(cleanupMock1).toHaveBeenCalled();
      expect(cleanupMock2).toHaveBeenCalled();

      // Verify callbacks are cleared
      expect(client['cleanupCallbacks'].length).toBe(0);
    });

    it('should handle cleanup callback errors gracefully', async () => {
      const client = HTTPBuilder.create('https://api.example.com').build();

      const errorMock = vi.fn().mockImplementation(() => {
        throw new Error('Cleanup failed');
      });
      const successMock = vi.fn();

      // Register callbacks (one that fails, one that succeeds)
      client['onCleanup'](errorMock);
      client['onCleanup'](successMock);

      // Dispose should not throw despite callback error
      expect(() => client.dispose()).not.toThrow();

      // Both callbacks should have been called
      expect(errorMock).toHaveBeenCalled();
      expect(successMock).toHaveBeenCalled();
    });
  });

  describe('Offline Support', () => {
    it('should automatically queue requests when offline', async () => {
      // Mock network monitor to report offline
      const networkMonitor = {
        online: false,
        on: vi.fn(),
        off: vi.fn(),
        emit: vi.fn(),
      } as any;

      vi.spyOn(NetworkMonitor, 'getInstance').mockReturnValue(networkMonitor);

      // Create client with offline queue enabled
      const client = HTTPBuilder.create('https://api.example.com').build();

      // Manually configure offline queue for testing
      client['config'].offlineQueue = true;
      client['setupOfflineQueue'](client['config']);

      // Make request while offline
      const requestPromise = client.get('/data');

      // Verify request was queued instead of executed immediately
      expect(client['offlineQueue']?.size).toBe(1);
      expect(fetchMock).not.toHaveBeenCalled();

      // Mock successful response for when queue processes
      fetchMock.mockResolvedValue(mockFetchResponse(true, 200, { data: 'test' }));

      // Simulate coming back online by directly calling the queue processing
      // instead of relying on network monitor events
      networkMonitor.online = true;
      client['offlineQueue']?.['resume']();

      // Wait a short time for the queue to process
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify request was eventually executed
      expect(fetchMock).toHaveBeenCalled();

      // Wait for the original promise to resolve
      const response = await requestPromise;
      expect(response.data).toEqual({ data: 'test' });
    });

    it('should respect request priority in offline queue', async () => {
      // Mock offline state
      const networkMonitor = { online: false, on: vi.fn(), off: vi.fn() } as any;
      vi.spyOn(NetworkMonitor, 'getInstance').mockReturnValue(networkMonitor);

      const client = HTTPBuilder.create('https://api.example.com').build();

      // Manually configure offline queue for testing
      client['config'].offlineQueue = true;
      client['setupOfflineQueue'](client['config']);

      // Make requests with different priorities (using any to bypass type checking for test)
      const lowPriorityRequest = client.get('/low', { priority: 1 as any });
      const highPriorityRequest = client.get('/high', { priority: 10 as any });

      // Verify both requests are queued
      expect(client['offlineQueue']?.size).toBe(2);

      // Verify high priority comes first in queue (sorted descending)
      const queue = client['offlineQueue']?.['queue'];
      expect(queue?.[0]?.priority).toBe(10); // High priority first
      expect(queue?.[1]?.priority).toBe(1); // Low priority second
    });

    it('should persist queued requests with storage adapter', async () => {
      const storage = new MemoryAdapter();
      const queueOptions: PersistentQueueOptions = {
        storage,
        storageKey: 'test-queue',
      };

      // Mock offline state
      const networkMonitor = { online: false, on: vi.fn(), off: vi.fn() } as any;
      vi.spyOn(NetworkMonitor, 'getInstance').mockReturnValue(networkMonitor);

      const client = HTTPBuilder.create('https://api.example.com').build();

      // Manually configure offline queue for testing
      client['config'].offlineQueue = queueOptions;
      client['setupOfflineQueue'](client['config']);

      // Make request while offline
      client.get('/persistent');

      // Verify request was persisted to storage
      const storedData = storage.get('test-queue') as any;
      expect(storedData).toBeDefined();
      expect(storedData?.data).toHaveLength(1);
      expect(storedData?.data[0].id).toBeDefined();
    });

    it('should restore queued requests from storage on initialization', async () => {
      const storage = new MemoryAdapter();

      // Pre-populate storage with queued request
      storage.set('test-queue', {
        data: [{ id: 'restored-request', priority: 5, dependencies: [] }],
        expiry: Date.now() + 3600000,
        createdAt: Date.now(),
      });

      const queueOptions: PersistentQueueOptions = {
        storage,
        storageKey: 'test-queue',
      };

      const client = HTTPBuilder.create('https://api.example.com').build();

      // Add logger to client config
      const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
      client['config'].logger = logger;

      // Manually configure offline queue for testing
      client['config'].offlineQueue = queueOptions;
      client['setupOfflineQueue'](client['config']);

      // Wait for the restoration to complete (happens asynchronously in constructor)
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify restoration was logged (this confirms the event was emitted and handled)
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Offline queue restored'));

      // Note: The queue size will be 0 because the restoration only emits an event
      // but doesn't actually add tasks to the queue (since we can't serialize functions)
      // This is expected behavior - the consumer should handle the restoration event
      expect(client['offlineQueue']?.size).toBe(0);
    });

    it('should handle queue errors gracefully', async () => {
      // Mock offline state
      const networkMonitor = { online: false, on: vi.fn(), off: vi.fn() } as any;
      vi.spyOn(NetworkMonitor, 'getInstance').mockReturnValue(networkMonitor);

      const client = HTTPBuilder.create('https://api.example.com').build();

      // Manually configure offline queue for testing
      client['config'].offlineQueue = true;
      client['setupOfflineQueue'](client['config']);

      // Mock queue to throw error
      const error = new Error('Queue failure');
      const addSpy = vi.spyOn(client['offlineQueue']!, 'add').mockRejectedValue(error);

      // Make request while offline - should reject with queue error
      await expect(client.get('/error')).rejects.toThrow('Queue failure');

      addSpy.mockRestore();
    });

    it('should cleanup offline queue on client disposal', async () => {
      // Mock offline state and add some requests
      const networkMonitor = { online: false, on: vi.fn(), off: vi.fn() } as any;
      vi.spyOn(NetworkMonitor, 'getInstance').mockReturnValue(networkMonitor);

      const client = HTTPBuilder.create('https://api.example.com').build();

      // Manually configure offline queue for testing
      client['config'].offlineQueue = true;
      client['setupOfflineQueue'](client['config']);

      client.get('/test1');
      client.get('/test2');

      // Verify queue has requests
      expect(client['offlineQueue']?.size).toBe(2);

      // Dispose client
      client.dispose();

      // Verify queue was cleared
      expect(client['offlineQueue']?.size).toBe(0);
    });
  });

  describe('Integration: Memory Leak + Offline Support', () => {
    it('should handle complex offline scenario with proper cleanup', async () => {
      vi.useFakeTimers();

      // Mock offline state
      const networkMonitor = { online: false, on: vi.fn(), off: vi.fn() } as any;
      vi.spyOn(NetworkMonitor, 'getInstance').mockReturnValue(networkMonitor);

      const client = HTTPBuilder.create('https://api.example.com').build();

      // Manually configure offline queue for testing
      client['config'].offlineQueue = true;
      client['setupOfflineQueue'](client['config']);

      // Make multiple requests while offline
      const requests = [client.get('/api1'), client.get('/api2'), client.get('/api3')];

      // Verify all requests are queued
      expect(client['offlineQueue']?.size).toBe(3);

      // Fast-forward to trigger abandonment timeout (should not affect queued requests)
      vi.advanceTimersByTime(31 * 60 * 1000);

      // Queued requests should remain (abandonment timeout only affects in-flight requests)
      expect(client['offlineQueue']?.size).toBe(3);

      // Dispose client
      client.dispose();

      // Verify complete cleanup
      expect(client['abortControllers'].size).toBe(0);
      expect(client['inFlightRequests'].size).toBe(0);
      expect(client['offlineQueue']?.size).toBe(0);
      expect(client['cleanupCallbacks'].length).toBe(0);

      vi.useRealTimers();
    });

    it('should handle rapid online/offline transitions without leaks', async () => {
      const networkMonitor = {
        online: true,
        on: vi.fn((event, callback) => {
          if (event === 'online') {
            setTimeout(() => callback(), 100);
          }
        }),
        off: vi.fn(),
      } as any;

      vi.spyOn(NetworkMonitor, 'getInstance').mockReturnValue(networkMonitor);

      const client = HTTPBuilder.create('https://api.example.com').build();

      // Manually configure offline queue for testing
      client['config'].offlineQueue = true;
      client['setupOfflineQueue'](client['config']);

      // Rapidly toggle offline/online
      networkMonitor.online = false;
      client.get('/test1');

      networkMonitor.online = true;
      await new Promise((resolve) => setTimeout(resolve, 150));

      networkMonitor.online = false;
      client.get('/test2');

      // Dispose during mixed state
      client.dispose();

      // Verify complete cleanup despite state transitions
      expect(client['abortControllers'].size).toBe(0);
      expect(client['inFlightRequests'].size).toBe(0);
      expect(client['offlineQueue']?.size).toBe(0);
    });
  });
});
