import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HTTPBuilder, HTTPClient } from '../src/core/http-client';
import { HTTPResponse } from '../src/utils/http';

// Mock fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('HTTPClient', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('should make a GET request', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ id: 1 }),
      text: async () => JSON.stringify({ id: 1 })
    });

    const client = HTTPBuilder.create('https://api.test').build();
    const response = await client.get('/users');

    expect(fetchMock).toHaveBeenCalledWith('https://api.test/users', expect.objectContaining({
      method: 'GET'
    }));
    expect(response.data).toEqual({ id: 1 });
  });

  it('should use interceptors', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map(),
      json: async () => ({}),
      text: async () => '{}'
    });

    const client = HTTPBuilder.create('https://api.test')
      .addRequestInterceptor((config) => {
        config.headers = { ...config.headers, 'X-Custom': 'true' };
        return config;
      })
      .build();

    await client.get('/test');

    expect(fetchMock).toHaveBeenCalledWith('https://api.test/test', expect.objectContaining({
      headers: expect.objectContaining({ 'X-Custom': 'true' })
    }));
  });

  it('should retry on failure', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ success: true }),
        text: async () => '{"success":true}'
      });

    const client = HTTPBuilder.create('https://api.test')
      .withRetry({ maxRetries: 1, initialDelayMs: 10 })
      .build();

    const response = await client.get('/retry');
    expect(response.data).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
