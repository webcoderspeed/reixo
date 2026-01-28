import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../src/utils/retry';

describe('Retry Utility', () => {
  it('should return result immediately if successful', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRetry(fn);

    expect(result.result).toBe('success');
    expect(result.attempts).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and succeed', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('fail 1')).mockResolvedValue('success');

    const result = await withRetry(fn, {
      maxRetries: 3,
      initialDelayMs: 1,
    });

    expect(result.result).toBe('success');
    expect(result.attempts).toBe(2);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should fail after max retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    await expect(
      withRetry(fn, {
        maxRetries: 2,
        initialDelayMs: 1,
      })
    ).rejects.toThrow('fail');

    expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
  });

  it('should use default retry condition (always retry)', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValue('success');

    // Not providing retryCondition implies default () => true
    await withRetry(fn, { initialDelayMs: 1 });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should respect custom retry condition', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fatal'));

    await expect(
      withRetry(fn, {
        maxRetries: 3,
        initialDelayMs: 1,
        retryCondition: (err: unknown) => (err instanceof Error ? err.message : '') !== 'fatal',
      })
    ).rejects.toThrow('fatal');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should call onRetry callback', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValue('success');

    const onRetry = vi.fn();

    await withRetry(fn, {
      initialDelayMs: 1,
      onRetry,
    });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, expect.any(Number));
  });

  it('should calculate delay without jitter', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValue('success');

    const onRetry = vi.fn();

    await withRetry(fn, {
      initialDelayMs: 100,
      backoffFactor: 2,
      jitter: false,
      onRetry,
    });

    // First retry delay should be initialDelayMs * (2 ^ (1-1)) = 100
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, 100);
  });

  it('should calculate delay with backoff', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');

    const onRetry = vi.fn();

    await withRetry(fn, {
      initialDelayMs: 10,
      backoffFactor: 2,
      jitter: false,
      onRetry,
    });

    // Retry 1: 10ms
    // Retry 2: 10 * 2^1 = 20ms
    expect(onRetry).toHaveBeenNthCalledWith(1, expect.any(Error), 1, 10);
    expect(onRetry).toHaveBeenNthCalledWith(2, expect.any(Error), 2, 20);
  });

  it('should cap delay at maxDelayMs', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValue('success');

    const onRetry = vi.fn();

    await withRetry(fn, {
      initialDelayMs: 100,
      maxDelayMs: 50, // Max is less than initial
      jitter: false,
      onRetry,
    });

    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, 50);
  });
});
