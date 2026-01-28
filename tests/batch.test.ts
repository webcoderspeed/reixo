import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BatchProcessor } from '../src/utils/batch';

describe('BatchProcessor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should process batch when size limit is reached', async () => {
    const processFn = vi.fn().mockResolvedValue(['result1', 'result2']);
    const batch = new BatchProcessor<string, string>(processFn, {
      maxBatchSize: 2,
      batchDelayMs: 1000,
    });

    const p1 = batch.add('item1');
    const p2 = batch.add('item2');

    const results = await Promise.all([p1, p2]);

    expect(results).toEqual(['result1', 'result2']);
    expect(processFn).toHaveBeenCalledTimes(1);
    expect(processFn).toHaveBeenCalledWith(['item1', 'item2']);
  });

  it('should process batch when timeout is reached', async () => {
    const processFn = vi.fn().mockResolvedValue(['result1']);
    const batch = new BatchProcessor<string, string>(processFn, {
      maxBatchSize: 5,
      batchDelayMs: 1000,
    });

    const p1 = batch.add('item1');

    // Fast forward time
    vi.advanceTimersByTime(1000);

    const result = await p1;

    expect(result).toBe('result1');
    expect(processFn).toHaveBeenCalledTimes(1);
    expect(processFn).toHaveBeenCalledWith(['item1']);
  });

  it('should handle processing errors', async () => {
    const error = new Error('Processing failed');
    const processFn = vi.fn().mockRejectedValue(error);
    const batch = new BatchProcessor<string, string>(processFn, {
      maxBatchSize: 1,
      batchDelayMs: 1000,
    });

    await expect(batch.add('item1')).rejects.toThrow('Processing failed');
  });

  it('should map results to correct items', async () => {
    // Process function that reverses strings
    const processFn = vi.fn(async (items: string[]) => {
      return items.map((i) => i.split('').reverse().join(''));
    });

    const batch = new BatchProcessor<string, string>(processFn, {
      maxBatchSize: 2,
      batchDelayMs: 1000,
    });

    const p1 = batch.add('abc');
    const p2 = batch.add('xyz');

    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1).toBe('cba');
    expect(r2).toBe('zyx');
  });
});
