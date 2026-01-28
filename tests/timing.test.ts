import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce, throttle, delay } from '../src/utils/timing';

describe('Timing Utils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('delay', () => {
    it('should wait for specified time', async () => {
      const promise = delay(1000);

      vi.advanceTimersByTime(500);
      // Not resolved yet

      vi.advanceTimersByTime(500);
      await promise;
    });
  });

  describe('debounce', () => {
    it('should delay execution', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 1000);

      debounced();
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(500);
      debounced(); // Reset timer

      vi.advanceTimersByTime(500);
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(500);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should pass arguments', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 1000);

      debounced('arg1', 'arg2');
      vi.advanceTimersByTime(1000);
      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should execute immediately if leading is true', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 1000, { leading: true, trailing: false });

      debounced();
      expect(fn).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1000);
      expect(fn).toHaveBeenCalledTimes(1); // No trailing execution
    });
  });

  describe('throttle', () => {
    it('should limit execution frequency', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 1000);

      throttled(); // Executed immediately (leading=true)
      expect(fn).toHaveBeenCalledTimes(1);

      throttled(); // Ignored but scheduled (trailing=true)

      vi.advanceTimersByTime(500);
      throttled(); // Ignored but updates scheduled call

      vi.advanceTimersByTime(500);
      // Trailing execution happens here (1000ms passed)
      expect(fn).toHaveBeenCalledTimes(2);

      throttled(); // Should execute immediately again as throttle period expired
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should pass arguments', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 1000);

      throttled('arg1');
      expect(fn).toHaveBeenCalledWith('arg1');
    });

    it('should not execute immediately if leading is false', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 1000, { leading: false });

      throttled();
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1000);
      expect(fn).toHaveBeenCalledTimes(1); // Trailing execution
    });

    it('should respect trailing: false option', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 1000, { trailing: false });

      throttled(); // Leading execution
      expect(fn).toHaveBeenCalledTimes(1);

      throttled(); // Ignored

      vi.advanceTimersByTime(1000);
      expect(fn).toHaveBeenCalledTimes(1); // No trailing execution
    });

    it('should not execute at all if leading: false and trailing: false', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 1000, { leading: false, trailing: false });

      throttled();
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1000);
      expect(fn).not.toHaveBeenCalled();
    });
  });
});
