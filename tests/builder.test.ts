import { describe, it, expect, vi } from 'vitest';
import { HTTPBuilder } from '../src/core/http-client';
import { MemoryAdapter } from '../src/utils/cache';

describe('HTTPBuilder Extended Methods', () => {
  const baseURL = 'https://api.example.com';

  it('should configure rate limit via withRateLimit', () => {
    const client = HTTPBuilder.create(baseURL)
      .withRateLimit({ requests: 10, interval: 1000 })
      .build();

    // Access private config to verify
    const config = (client as any).config;
    expect(config.rateLimit).toEqual({ requests: 10, interval: 1000 });
  });

  it('should configure offline queue via withOfflineQueue', () => {
    const client = HTTPBuilder.create(baseURL).withOfflineQueue(true).build();

    const config = (client as any).config;
    expect(config.offlineQueue).toBe(true);

    const clientWithConfig = HTTPBuilder.create(baseURL)
      .withOfflineQueue({ storage: new MemoryAdapter() })
      .build();

    const config2 = (clientWithConfig as any).config;
    expect(config2.offlineQueue).toEqual({ storage: expect.any(MemoryAdapter) });
  });

  it('should configure deduplication via withDeduplication', () => {
    const client = HTTPBuilder.create(baseURL).withDeduplication(true).build();

    const config = (client as any).config;
    expect(config.enableDeduplication).toBe(true);

    const clientDisabled = HTTPBuilder.create(baseURL).withDeduplication(false).build();
    expect((clientDisabled as any).config.enableDeduplication).toBe(false);
  });

  it('should configure metrics via withMetrics', () => {
    const onUpdate = vi.fn();
    const client = HTTPBuilder.create(baseURL).withMetrics(true, onUpdate).build();

    const config = (client as any).config;
    expect(config.enableMetrics).toBe(true);
    expect(config.onMetricsUpdate).toBe(onUpdate);
  });

  it('should allow chaining all new methods', () => {
    const client = HTTPBuilder.create(baseURL)
      .withRateLimit({ requests: 5, interval: 500 })
      .withOfflineQueue(true)
      .withDeduplication(true)
      .withMetrics(true)
      .build();

    const config = (client as any).config;
    expect(config.rateLimit).toEqual({ requests: 5, interval: 500 });
    expect(config.offlineQueue).toBe(true);
    expect(config.enableDeduplication).toBe(true);
    expect(config.enableMetrics).toBe(true);
  });
});
