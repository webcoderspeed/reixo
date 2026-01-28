import { describe, it, expect, vi, afterEach } from 'vitest';
import { HTTPClient } from '../src/core/http-client';
import { http, HTTPResponse } from '../src/utils/http';

// Mock the underlying http function
vi.mock('../src/utils/http', () => ({
  http: vi.fn(),
  HTTPError: class extends Error {
    constructor(
      public message: string,
      public status: number,
      public code: string
    ) {
      super(message);
    }
  },
}));

function mockFetchResponse<T>(data: T, delayMs = 0): Promise<HTTPResponse<T>> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        data,
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        config: { url: 'https://api.example.com/data' },
      });
    }, delayMs);
  });
}

const createClient = (enableDeduplication = true) =>
  new HTTPClient({
    baseURL: 'https://api.example.com',
    enableDeduplication,
  });

describe('HTTPClient Deduplication', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should deduplicate identical concurrent GET requests', async () => {
    const client = createClient();
    const responseData = { id: 1, name: 'Test' };

    // Mock http to return a promise that resolves after a delay
    vi.mocked(http).mockImplementation(
      () => mockFetchResponse(responseData, 50) as Promise<HTTPResponse<unknown>>
    );

    // Launch two identical requests concurrently
    const req1 = client.get('/users/1');
    const req2 = client.get('/users/1');

    const [res1, res2] = await Promise.all([req1, req2]);

    expect(res1.data).toEqual(responseData);
    expect(res2.data).toEqual(responseData);

    // Underlying http function should be called only once
    expect(http).toHaveBeenCalledTimes(1);
  });

  it('should not deduplicate if enableDeduplication is false', async () => {
    const client = createClient(false);

    const responseData = { id: 1, name: 'Test' };
    vi.mocked(http).mockImplementation(
      () => mockFetchResponse(responseData, 50) as Promise<HTTPResponse<unknown>>
    );

    const req1 = client.get('/users/1');
    const req2 = client.get('/users/1');

    await Promise.all([req1, req2]);

    expect(http).toHaveBeenCalledTimes(2);
  });

  it('should not deduplicate non-GET requests', async () => {
    const client = createClient();
    const responseData = { id: 1, name: 'Created' };
    vi.mocked(http).mockImplementation(
      () => mockFetchResponse(responseData, 50) as Promise<HTTPResponse<unknown>>
    );

    const req1 = client.post('/users', { name: 'A' });
    const req2 = client.post('/users', { name: 'B' });

    await Promise.all([req1, req2]);

    expect(http).toHaveBeenCalledTimes(2);
  });

  it('should deduplicate based on query parameters', async () => {
    const client = createClient();
    const responseData = { results: [] };
    vi.mocked(http).mockImplementation(
      () => mockFetchResponse(responseData, 50) as Promise<HTTPResponse<unknown>>
    );

    const req1 = client.get('/search', { params: { q: 'foo' } });
    const req2 = client.get('/search', { params: { q: 'foo' } });
    const req3 = client.get('/search', { params: { q: 'bar' } });

    await Promise.all([req1, req2, req3]);

    // req1 and req2 are identical -> 1 call
    // req3 is different -> 1 call
    // Total 2 calls
    expect(http).toHaveBeenCalledTimes(2);
  });

  it('should make new request after previous one completes', async () => {
    const client = createClient();
    const responseData = { id: 1 };
    vi.mocked(http).mockImplementation(
      () => mockFetchResponse(responseData, 10) as Promise<HTTPResponse<unknown>>
    );

    // First request
    await client.get('/users/1');

    // Second request after first one finished
    await client.get('/users/1');

    expect(http).toHaveBeenCalledTimes(2);
  });

  it('should handle errors correctly and clean up in-flight map', async () => {
    const client = createClient();
    const error = new Error('Network Error');
    vi.mocked(http).mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      throw error;
    });

    const req1 = client.get('/error');
    const req2 = client.get('/error');

    await expect(req1).rejects.toThrow('Network Error');
    await expect(req2).rejects.toThrow('Network Error');

    expect(http).toHaveBeenCalledTimes(1);

    // Subsequent request should try again
    vi.mocked(http).mockImplementation(
      () => mockFetchResponse({ ok: true }) as Promise<HTTPResponse<unknown>>
    );
    await client.get('/error');
    expect(http).toHaveBeenCalledTimes(2);
  });
});
