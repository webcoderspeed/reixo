import { describe, it, expect } from 'vitest';
import { RateLimiter } from '../src/utils/rate-limiter';

describe('RateLimiter', () => {
  it('should consume tokens when available', () => {
    const limiter = new RateLimiter(5, 1000); // 5 requests per second
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(true);
  });

  it('should not consume tokens when limit reached', () => {
    const limiter = new RateLimiter(1, 1000); // 1 request per second
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(false);
  });

  it('should return wait time when limit reached', () => {
    const limiter = new RateLimiter(1, 1000);
    limiter.tryConsume();
    const waitTime = limiter.getTimeToWait();
    expect(waitTime).toBeGreaterThan(0);
    expect(waitTime).toBeLessThanOrEqual(1000);
  });

  it('should refill tokens after interval', async () => {
    const limiter = new RateLimiter(1, 100); // 1 request per 100ms
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(limiter.tryConsume()).toBe(true);
  });
});
