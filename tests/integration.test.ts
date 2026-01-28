import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Reixo } from '../src';

// Helper to mock fetch response
const mockFetchResponse = (ok: boolean, status: number, data: any) => {
  return Promise.resolve({
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    headers: new Map([['content-type', 'application/json']]),
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as unknown as Response);
};

describe('Reixo Integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should retry requests within a queue', async () => {
    const queue = new Reixo.TaskQueue({ concurrency: 1 });
    const client = Reixo.HTTPBuilder.create('https://api.example.com')
      .withRetry({ maxRetries: 2, initialDelayMs: 100 })
      .build();

    const fetchMock = global.fetch as any;
    fetchMock
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValueOnce(mockFetchResponse(true, 200, { id: 1 }));

    const task = queue.add(() => client.get('/test'));

    // Run timers for retry delays
    await vi.runAllTimersAsync();

    const result = await task;
    expect(result.data).toEqual({ id: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('should use interceptors for auth refresh', async () => {
    const client = Reixo.HTTPBuilder.create('https://api.example.com').build();
    const refreshLogic = vi.fn().mockResolvedValue('new-token');

    const interceptor = Reixo.createAuthRefreshInterceptor({
      client,
      refreshTokenCall: refreshLogic,
      shouldRefresh: (err: unknown) => (err as any).status === 401,
    });

    client.interceptors.response.push(interceptor);

    const fetchMock = global.fetch as any;
    fetchMock
      .mockResolvedValueOnce(mockFetchResponse(false, 401, { error: 'Unauthorized' }))
      .mockResolvedValueOnce(mockFetchResponse(true, 200, { success: true }));

    const result = await client.get('/protected');

    expect(refreshLogic).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.data).toEqual({ success: true });
  });
});
