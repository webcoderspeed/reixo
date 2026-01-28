import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskQueue } from '../src/utils/queue';
import { NetworkMonitor } from '../src/utils/network';

describe('TaskQueue Network Sync', () => {
  beforeEach(() => {
    // Reset singleton if possible or mock its internals
    // Since NetworkMonitor is a singleton, we need to be careful.
    // However, for testing, we can mock the browser APIs it relies on.

    // Mock window and navigator
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    vi.stubGlobal('navigator', { onLine: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    // We can't easily reset singleton instance without exposing a reset method
    // But we can manipulate its state if we had access.
    // For this test, assuming NetworkMonitor re-reads navigator.onLine on instantiation isn't enough because it's a singleton.
    // We might need to expose a way to reset it or just trigger events.
  });

  it('should pause queue when offline and resume when online', () => {
    // We need to access the singleton instance to trigger events manually if we can't fully reset it.
    // Or we rely on the fact that `TaskQueue` subscribes to the singleton.

    // Force online initially
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });

    const queue = new TaskQueue({ syncWithNetwork: true });
    const pauseSpy = vi.spyOn(queue, 'pause');
    const resumeSpy = vi.spyOn(queue, 'resume');

    // Simulate offline
    // We need to trigger the event listener registered by NetworkMonitor.
    // Since NetworkMonitor is already instantiated (singleton), it might have registered listeners long ago.
    // If this test runs after others, the listeners are already there.
    // But we mocked `window.addEventListener` in THIS test's beforeEach.
    // If NetworkMonitor was created in a previous test (it wasn't used before), it would be fine.
    // BUT `NetworkMonitor.getInstance()` creates it once.

    // To make this test robust, let's just emit events on the NetworkMonitor instance directly?
    // But `queue.ts` imports `NetworkMonitor` class.

    const monitor = NetworkMonitor.getInstance();

    // Manually emit 'offline' on the monitor
    monitor.emit('offline');
    expect(pauseSpy).toHaveBeenCalled();

    // Manually emit 'online' on the monitor
    monitor.emit('online');
    expect(resumeSpy).toHaveBeenCalled();
  });
});
