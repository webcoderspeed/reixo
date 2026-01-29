import { describe, it, expect, vi } from 'vitest';
import { createBatchTransport, BatchRequestItem } from '../src/utils/batch-transport';
import { HTTPOptions, HTTPResponse } from '../src/utils/http';

describe('Batch Transport', () => {
  const mockResponse = <T>(data: T): HTTPResponse<T> => ({
    data,
    status: 200,
    statusText: 'OK',
    headers: new Headers(),
    config: {},
  });

  it('should batch requests when predicate matches', async () => {
    const innerTransport = vi.fn().mockResolvedValue(mockResponse({ id: 'individual' }));
    const executeBatch = vi.fn().mockImplementation(async (items: BatchRequestItem[]) => {
      return items.map((item, index) => mockResponse({ id: `batch-${index}` }));
    });

    const transport = createBatchTransport(innerTransport, {
      shouldBatch: (url) => url.startsWith('/batch'),
      executeBatch,
      maxBatchSize: 2,
      batchDelayMs: 10,
    });

    const p1 = transport('/batch/1', {});
    const p2 = transport('/batch/2', {});
    const p3 = transport('/individual', {});

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    expect(executeBatch).toHaveBeenCalledTimes(1);
    expect(executeBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ url: '/batch/1' }),
        expect.objectContaining({ url: '/batch/2' }),
      ])
    );

    expect(innerTransport).toHaveBeenCalledTimes(1);
    expect(innerTransport).toHaveBeenCalledWith('/individual', expect.anything());

    expect(r1.data).toEqual({ id: 'batch-0' });
    expect(r2.data).toEqual({ id: 'batch-1' });
    expect(r3.data).toEqual({ id: 'individual' });
  });

  it('should handle batch errors', async () => {
    const innerTransport = vi.fn();
    const executeBatch = vi.fn().mockRejectedValue(new Error('Batch Failed'));

    const transport = createBatchTransport(innerTransport, {
      shouldBatch: () => true,
      executeBatch,
      batchDelayMs: 10,
    });

    const p1 = transport('/1', {});
    const p2 = transport('/2', {});

    await expect(Promise.all([p1, p2])).rejects.toThrow('Batch Failed');
  });
});
