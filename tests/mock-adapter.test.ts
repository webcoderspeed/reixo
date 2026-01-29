import { describe, it, expect, beforeEach } from 'vitest';
import { MockAdapter } from '../src/utils/mock-adapter';
import { HTTPClient } from '../src/core/http-client';

describe('MockAdapter', () => {
  let mock: MockAdapter;
  let client: HTTPClient;

  beforeEach(() => {
    mock = new MockAdapter();
    client = new HTTPClient({
      transport: mock.transport,
    });
  });

  it('should mock GET requests', async () => {
    mock.onGet('/users').reply(200, { users: [] });

    const response = await client.get('/users');
    expect(response.status).toBe(200);
    expect(response.data).toEqual({ users: [] });
  });

  it('should mock POST requests', async () => {
    mock.onPost('/users').reply(201, { id: 1 });

    const response = await client.post('/users', { name: 'Test' });
    expect(response.status).toBe(201);
    expect(response.data).toEqual({ id: 1 });
  });

  it('should mock errors', async () => {
    mock.onGet('/error').networkError();

    await expect(client.get('/error')).rejects.toThrow('Network Error');
  });

  it('should mock timeouts', async () => {
    mock.onGet('/timeout').timeout();

    await expect(client.get('/timeout')).rejects.toThrow('Timeout');
  });

  it('should support replyOnce', async () => {
    mock.onGet('/count').replyOnce(200, { count: 1 });
    mock.onGet('/count').reply(200, { count: 2 });

    const res1 = await client.get('/count');
    expect(res1.data).toEqual({ count: 1 });

    const res2 = await client.get('/count');
    expect(res2.data).toEqual({ count: 2 });
  });

  it('should default to 404 if no handler matches', async () => {
    await expect(client.get('/unknown')).rejects.toThrow('Mock: No handler found');
  });

  it('should record request history', async () => {
    mock.onGet('/test').reply(200);

    await client.get('/test');

    expect(mock.historyLength).toBe(1);
    expect(mock.latestRequest.url).toBe('/test');
  });

  it('should simulate delay', async () => {
    mock.delayResponse = 20;
    mock.onGet('/delayed').reply(200);

    const start = Date.now();
    await client.get('/delayed');
    const diff = Date.now() - start;

    expect(diff).toBeGreaterThanOrEqual(15);
  });

  it('should reset handlers and history', async () => {
    mock.onGet('/test').reply(200);
    await client.get('/test');

    expect(mock.historyLength).toBe(1);

    mock.reset();

    expect(mock.historyLength).toBe(0);
    await expect(client.get('/test')).rejects.toThrow();
  });
});
