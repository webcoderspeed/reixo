import { describe, it, expect, vi, afterEach } from 'vitest';
import { HTTPClient } from '../src/core/http-client';
import * as httpUtils from '../src/utils/http';
import { MetricsCollector } from '../src/utils/metrics';

describe('MetricsCollector', () => {
  it('should track successful requests', async () => {
    const collector = new MetricsCollector();
    const startTime = Date.now();

    collector.record({
      url: '/test',
      method: 'GET',
      startTime,
      endTime: startTime + 100,
      status: 200,
      success: true,
    });

    const snapshot = collector.getSnapshot();
    expect(snapshot.requestCount).toBe(1);
    expect(snapshot.errorCount).toBe(0);
    expect(snapshot.totalLatency).toBe(100);
    expect(snapshot.averageLatency).toBe(100);
  });

  it('should track failed requests', async () => {
    const collector = new MetricsCollector();
    const startTime = Date.now();

    collector.record({
      url: '/error',
      method: 'GET',
      startTime,
      endTime: startTime + 50,
      status: 500,
      success: false,
    });

    const snapshot = collector.getSnapshot();
    expect(snapshot.requestCount).toBe(1);
    expect(snapshot.errorCount).toBe(1);
    expect(snapshot.totalLatency).toBe(50);
  });

  it('should maintain log size limit', () => {
    const collector = new MetricsCollector(2);
    const baseMetric = {
      url: '/test',
      method: 'GET',
      startTime: 0,
      endTime: 10,
      status: 200,
      success: true,
    };

    collector.record(baseMetric);
    collector.record(baseMetric);
    collector.record(baseMetric);

    expect(collector.getRecentRequests().length).toBe(2);
  });

  it('should notify listeners on update', () => {
    const onUpdate = vi.fn();
    const collector = new MetricsCollector(100, onUpdate);

    collector.record({
      url: '/test',
      method: 'GET',
      startTime: 0,
      endTime: 10,
      status: 200,
      success: true,
    });

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestCount: 1,
        totalLatency: 10,
      })
    );
  });
});

describe('HTTPClient Metrics Integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should record metrics when enabled', async () => {
    const client = new HTTPClient({
      enableMetrics: true,
    });

    const httpSpy = vi.spyOn(httpUtils, 'http').mockResolvedValue({
      status: 200,
      data: {},
      headers: {},
    } as any);

    await client.request('/metrics-test');

    expect(client.metrics).toBeDefined();
    const snapshot = client.metrics!.getSnapshot();
    expect(snapshot.requestCount).toBe(1);
    expect(snapshot.errorCount).toBe(0);
    expect(snapshot.totalLatency).toBeGreaterThanOrEqual(0);
  });

  it('should record error metrics', async () => {
    const client = new HTTPClient({
      enableMetrics: true,
    });

    vi.spyOn(httpUtils, 'http').mockRejectedValue({
      status: 500,
      message: 'Server Error',
    });

    try {
      await client.request('/error-test');
    } catch {
      // Ignore error
    }

    const snapshot = client.metrics!.getSnapshot();
    expect(snapshot.requestCount).toBe(1);
    expect(snapshot.errorCount).toBe(1);
  });
});
