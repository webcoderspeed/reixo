import { describe, it, expect, vi } from 'vitest';
import { CircuitBreaker, CircuitState } from '../src/utils/circuit-breaker';

const createBreaker = (options = {}) =>
  new CircuitBreaker({
    failureThreshold: 3,
    resetTimeoutMs: 100,
    halfOpenRetries: 1,
    ...options,
  });

const failTimes = async (breaker: CircuitBreaker, count: number, error: Error) => {
  if (count <= 0) return;
  try {
    await breaker.execute(() => Promise.reject(error));
  } catch {
    // ignore
  }
  await failTimes(breaker, count - 1, error);
};

describe('CircuitBreaker', () => {
  it('should start in CLOSED state', () => {
    const breaker = createBreaker();
    expect(breaker.currentState).toBe(CircuitState.CLOSED);
  });

  it('should execute function successfully in CLOSED state', async () => {
    const breaker = createBreaker();
    const fn = vi.fn().mockResolvedValue('success');
    const result = await breaker.execute(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalled();
  });

  it('should switch to OPEN state after failure threshold is reached', async () => {
    const breaker = createBreaker();
    const fn = vi.fn().mockRejectedValue(new Error('failed'));

    // 3 failures
    await expect(breaker.execute(fn)).rejects.toThrow('failed');
    await expect(breaker.execute(fn)).rejects.toThrow('failed');
    await expect(breaker.execute(fn)).rejects.toThrow('failed');

    expect(breaker.currentState).toBe(CircuitState.OPEN);
  });

  it('should reject immediately in OPEN state', async () => {
    const breaker = createBreaker();
    const fn = vi.fn().mockResolvedValue('success');

    // Force OPEN by failing 3 times
    await failTimes(breaker, 3, new Error('failed'));

    await expect(breaker.execute(fn)).rejects.toThrow('CircuitBreaker: Circuit is OPEN');
    expect(fn).not.toHaveBeenCalled();
  });

  it('should switch to HALF_OPEN after reset timeout', async () => {
    const breaker = createBreaker();

    // Fail 3 times
    await failTimes(breaker, 3, new Error('failed'));

    expect(breaker.currentState).toBe(CircuitState.OPEN);

    // Wait for timeout
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Next call should be allowed (HALF_OPEN)
    const successFn = vi.fn().mockResolvedValue('success');
    const result = await breaker.execute(successFn);

    expect(result).toBe('success');
    expect(breaker.currentState).toBe(CircuitState.CLOSED);
  });

  it('should switch back to OPEN if HALF_OPEN attempt fails', async () => {
    const breaker = createBreaker();
    const fn = vi.fn().mockRejectedValue(new Error('failed'));

    // Fail 3 times
    await failTimes(breaker, 3, new Error('failed'));

    // Wait for timeout
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Next call fails
    await expect(breaker.execute(fn)).rejects.toThrow('failed');
    expect(breaker.currentState).toBe(CircuitState.OPEN);
  });

  it('should call onStateChange callback when state changes', async () => {
    const onStateChange = vi.fn();
    const breakerWithCallback = createBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 100,
      onStateChange,
    });

    const fn = vi.fn().mockRejectedValue(new Error('failed'));

    await expect(breakerWithCallback.execute(fn)).rejects.toThrow('failed');

    expect(onStateChange).toHaveBeenCalledWith(CircuitState.OPEN);
  });
});
