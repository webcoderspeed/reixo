import { describe, it, expect, vi } from 'vitest';
import { HTTPClient } from '../src/core/http-client';

describe('Chaos Testing', () => {
  it('should simulate latency', async () => {
    const transport = vi.fn().mockResolvedValue({ status: 200, data: {}, headers: new Headers() });
    const client = new HTTPClient({
      chaos: {
        enabled: true,
        latency: 100, // 100ms
      },
      transport: transport as any,
    });

    const start = Date.now();
    await client.request('/test');
    const end = Date.now();

    // Allow some buffer for execution time
    expect(end - start).toBeGreaterThanOrEqual(95);
    expect(transport).toHaveBeenCalled();
  });

  it('should simulate errors', async () => {
    const transport = vi.fn().mockResolvedValue({ status: 200, data: {}, headers: new Headers() });
    const client = new HTTPClient({
      chaos: {
        enabled: true,
        errorRate: 1.0, // Always fail
        failWith: new Error('Chaos Error'),
      },
      transport: transport as any,
    });

    await expect(client.request('/test')).rejects.toThrow('Chaos Error');
    expect(transport).not.toHaveBeenCalled();
  });

  it('should not simulate when disabled', async () => {
    const transport = vi.fn().mockResolvedValue({ status: 200, data: {}, headers: new Headers() });
    const client = new HTTPClient({
      chaos: {
        enabled: false,
        latency: 1000,
        errorRate: 1.0,
      },
      transport: transport as any,
    });

    const start = Date.now();
    await client.request('/test');
    const end = Date.now();

    expect(end - start).toBeLessThan(100);
    expect(transport).toHaveBeenCalled();
  });
});
