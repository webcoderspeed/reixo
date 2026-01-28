import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Reixo, CircuitState } from '../src';

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

  it('should handle complex scenario: Queue + Circuit Breaker + Retry', async () => {
    // Scenario:
    // 1. Queue throttles requests
    // 2. Endpoint fails -> Retry kicks in
    // 3. Persistent failure -> Circuit Breaker opens
    // 4. Subsequent queue tasks fail fast due to open circuit

    const queue = new Reixo.TaskQueue({ concurrency: 1 });
    const circuitBreaker = new Reixo.CircuitBreaker({
      failureThreshold: 2,
      resetTimeoutMs: 1000,
    });

    const client = Reixo.HTTPBuilder.create('https://api.example.com')
      .withRetry({ maxRetries: 1, initialDelayMs: 10 }) // Short retry
      .build();

    // Wrap client request with circuit breaker
    const protectedRequest = (url: string) => circuitBreaker.execute(() => client.get(url));

    const fetchMock = global.fetch as any;

    // Request 1: Fails twice (original + 1 retry) -> Circuit Breaker records 1 failure
    // Note: Circuit breaker counts the whole execution (including retries) as 1 failure if it propagates error
    fetchMock.mockRejectedValueOnce(new Error('Fail 1'));
    fetchMock.mockRejectedValueOnce(new Error('Fail 1 Retry'));

    // Request 2: Fails twice -> Circuit Breaker records 2nd failure -> Opens
    fetchMock.mockRejectedValueOnce(new Error('Fail 2'));
    fetchMock.mockRejectedValueOnce(new Error('Fail 2 Retry'));

    // Request 3: Should fail fast (Circuit Open)

    // Add tasks to queue
    const t1 = queue.add(() => protectedRequest('/1'));
    const t2 = queue.add(() => protectedRequest('/2'));
    const t3 = queue.add(() => protectedRequest('/3'));

    // Attach expectations immediately to handle rejections that occur during runAllTimersAsync
    const p1 = expect(t1).rejects.toThrow('Fail 1 Retry');
    const p2 = expect(t2).rejects.toThrow('Fail 2 Retry');
    const p3 = expect(t3).rejects.toThrow('CircuitBreaker: Circuit is OPEN');

    // Run timers for retries
    await vi.runAllTimersAsync();

    await Promise.all([p1, p2, p3]);

    expect(circuitBreaker.currentState).toBe(CircuitState.OPEN);
  });

  it('should batch HTTP requests using BatchProcessor', async () => {
    const fetchMock = global.fetch as any;
    fetchMock.mockResolvedValue(mockFetchResponse(true, 200, { results: ['A', 'B'] }));

    const client = Reixo.HTTPBuilder.create('https://api.example.com').build();

    // Batch function that takes IDs and returns promises
    const batchProcessor = new Reixo.BatchProcessor<string, string>(
      async (ids) => {
        const response = await client.post<{ results: string[] }>('/batch', { ids });
        return response.data.results;
      },
      { maxBatchSize: 2, batchDelayMs: 50 }
    );

    const p1 = batchProcessor.add('1');
    const p2 = batchProcessor.add('2');

    // Should wait for delay or size
    await vi.advanceTimersByTimeAsync(60);

    const results = await Promise.all([p1, p2]);
    expect(results).toEqual(['A', 'B']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/batch'),
      expect.objectContaining({
        body: JSON.stringify({ ids: ['1', '2'] }),
      })
    );
  });

  it('should prioritize requests in Queue', async () => {
    const queue = new Reixo.TaskQueue({ concurrency: 1 });
    const client = Reixo.HTTPBuilder.create('https://api.example.com').build();
    const fetchMock = global.fetch as any;
    fetchMock.mockResolvedValue(mockFetchResponse(true, 200, { ok: true }));

    const order: string[] = [];

    // Pause queue to build up backlog
    queue.pause();

    // Add low priority task
    queue.add(
      async () => {
        await client.get('/low');
        order.push('low');
      },
      { priority: 1 }
    );

    // Add high priority task
    queue.add(
      async () => {
        await client.get('/high');
        order.push('high');
      },
      { priority: 10 }
    );

    queue.resume();
    await vi.runAllTimersAsync();

    expect(order).toEqual(['high', 'low']);
  });
});
