import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NetworkMonitor } from '../src/utils/network';

describe('NetworkMonitor Polling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());

    // Reset singleton state
    const monitor = NetworkMonitor.getInstance();
    (monitor as any).isOnline = true;
    monitor.stopPolling();
    monitor.removeAllListeners();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    const monitor = NetworkMonitor.getInstance();
    monitor.stopPolling();
  });

  it('should detect offline status when fetch fails', async () => {
    const monitor = NetworkMonitor.getInstance();

    // Initial state
    expect(monitor.online).toBe(true);

    // Mock fetch failure
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

    // Start polling
    monitor.startPolling(1000);

    const offlineSpy = vi.fn();
    monitor.on('offline', offlineSpy);

    // Advance time
    await vi.advanceTimersByTimeAsync(1100);

    expect(fetch).toHaveBeenCalled();
    expect(offlineSpy).toHaveBeenCalled();
    expect(monitor.online).toBe(false);
  });

  it('should detect online status when fetch succeeds', async () => {
    const monitor = NetworkMonitor.getInstance();

    // Force offline first (simulating previous failure)
    (monitor as any).isOnline = false;

    // Mock success
    vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200 } as Response);

    const onlineSpy = vi.fn();
    monitor.on('online', onlineSpy);

    // Start polling
    monitor.startPolling(1000);

    // Advance time
    await vi.advanceTimersByTimeAsync(1100);

    expect(fetch).toHaveBeenCalled();
    expect(onlineSpy).toHaveBeenCalled();
    expect(monitor.online).toBe(true);
  });
});
