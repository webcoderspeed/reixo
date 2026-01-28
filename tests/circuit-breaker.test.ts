import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CircuitBreaker, CircuitState } from '../src/utils/circuit-breaker';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 100,
      halfOpenRetries: 1, // Simplify test
    });
  });

  it('should start in CLOSED state', () => {
    expect(breaker.currentState).toBe(CircuitState.CLOSED);
  });

  it('should execute function successfully in CLOSED state', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await breaker.execute(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalled();
  });

  it('should switch to OPEN state after failure threshold is reached', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('failed'));

    // 3 failures
    await expect(breaker.execute(fn)).rejects.toThrow('failed');
    await expect(breaker.execute(fn)).rejects.toThrow('failed');
    await expect(breaker.execute(fn)).rejects.toThrow('failed');

    expect(breaker.currentState).toBe(CircuitState.OPEN);
  });

  it('should reject immediately in OPEN state', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    // Force OPEN
    (breaker as any).state = CircuitState.OPEN;
    (breaker as any).failures = 3;
    (breaker as any).nextAttempt = Date.now() + 1000;

    await expect(breaker.execute(fn)).rejects.toThrow('CircuitBreaker: Circuit is OPEN');
    expect(fn).not.toHaveBeenCalled();
  });

  it('should switch to HALF_OPEN after reset timeout', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('failed'));

    // Fail 3 times
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(fn);
      } catch {
        /* ignore */
      }
    }

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
    const fn = vi.fn().mockRejectedValue(new Error('failed'));

    // Fail 3 times
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(fn);
      } catch {
        /* ignore */
      }
    }

    // Wait for timeout
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Next call fails
    await expect(breaker.execute(fn)).rejects.toThrow('failed');
    expect(breaker.currentState).toBe(CircuitState.OPEN);
  });
});
