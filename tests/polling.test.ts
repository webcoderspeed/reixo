import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { poll, PollingController } from '../src/utils/polling';
import { delay } from '../src/utils/timing';

describe('Polling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.restoreAllMocks();
  });

  it('should poll until stop condition is met', async () => {
    let count = 0;
    const task = vi.fn().mockImplementation(async () => {
      count++;
      return count;
    });

    const { promise } = poll(task, {
      interval: 100,
      stopCondition: (result) => result === 3,
    });

    await vi.advanceTimersByTimeAsync(350);

    const result = await promise;
    expect(result).toBe(3);
    expect(task).toHaveBeenCalledTimes(3);
  });

  it('should respect max attempts', async () => {
    const task = vi.fn().mockResolvedValue('pending');

    const { promise } = poll(task, {
      interval: 100,
      maxAttempts: 3,
    });

    // Attach catch handler before advancing timers to avoid unhandled rejection
    const expectPromise = expect(promise).rejects.toThrow('Max polling attempts reached');

    await vi.advanceTimersByTimeAsync(350);

    await expectPromise;
    expect(task).toHaveBeenCalledTimes(3);
  });

  it('should support manual cancellation', async () => {
    const task = vi.fn().mockResolvedValue('pending');

    const { promise, cancel } = poll(task, {
      interval: 100,
    });

    // Run twice
    await vi.advanceTimersByTimeAsync(250);
    expect(task).toHaveBeenCalledTimes(3); // 0, 100, 200

    cancel();

    // Should not run again
    await vi.advanceTimersByTimeAsync(200);
    expect(task).toHaveBeenCalledTimes(3);
  });

  it('should implement backoff', async () => {
    const task = vi.fn().mockResolvedValue('pending');

    poll(task, {
      interval: 100,
      backoff: {
        factor: 2,
        maxInterval: 1000,
      },
    });

    // 1st call at 0ms
    await vi.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledTimes(1);

    // 2nd call at 100ms
    await vi.advanceTimersByTimeAsync(100);
    expect(task).toHaveBeenCalledTimes(2);

    // 3rd call at 100 + 200 = 300ms
    await vi.advanceTimersByTimeAsync(200);
    expect(task).toHaveBeenCalledTimes(3);

    // 4th call at 300 + 400 = 700ms
    await vi.advanceTimersByTimeAsync(400);
    expect(task).toHaveBeenCalledTimes(4);
  });
});
