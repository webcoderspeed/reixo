import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HTTPClient } from '../src/core/http-client';
import { createAuthInterceptor, AuthConfig } from '../src/utils/auth';

// Mock fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('Auth Interceptor Complete Flow', () => {
  let client: HTTPClient;
  let accessToken = 'valid-token';
  let refreshCount = 0;

  const authConfig: AuthConfig = {
    getAccessToken: vi.fn(() => accessToken),
    refreshTokens: vi.fn(async () => {
      refreshCount++;
      await new Promise((resolve) => setTimeout(resolve, 50)); // Simulate network delay
      accessToken = 'new-token-' + refreshCount;
      return accessToken;
    }),
    onRefreshFailed: vi.fn(),
  };

  beforeEach(() => {
    client = new HTTPClient({ baseURL: 'https://api.test' });
    createAuthInterceptor(client, authConfig);
    fetchMock.mockReset();
    accessToken = 'valid-token';
    refreshCount = 0;
    vi.clearAllMocks();
  });

  it('should handle single 401 and retry', async () => {
    // 1. First call fails with 401
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: new Headers(),
      json: async () => ({ error: 'Unauthorized' }),
      text: async () => JSON.stringify({ error: 'Unauthorized' }),
    });

    // 2. Retry succeeds
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ data: 'success' }),
      text: async () => JSON.stringify({ data: 'success' }),
    });

    const response = await client.request('/test');

    expect(response.status).toBe(200);
    expect(authConfig.refreshTokens).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Check headers of the retry
    const retryCall = fetchMock.mock.calls[1];
    const headers = retryCall[1].headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer new-token-1');
  });

  it('should queue concurrent 401 requests', async () => {
    // Both requests fail with 401 initially
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: new Headers(),
      json: async () => ({}),
      text: async () => '{}',
    });
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: new Headers(),
      json: async () => ({}),
      text: async () => '{}',
    });

    // Both retries succeed
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      json: async () => ({ id: 1 }),
      text: async () => '{"id": 1}',
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      json: async () => ({ id: 2 }),
      text: async () => '{"id": 2}',
    });

    const [res1, res2] = await Promise.all([client.request('/test1'), client.request('/test2')]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(authConfig.refreshTokens).toHaveBeenCalledTimes(1); // Should only refresh once
    expect(fetchMock).toHaveBeenCalledTimes(4); // 2 fails + 2 retries
  });

  it('should wait for refresh if new request starts during refreshing', async () => {
    // This tests the "Optimization" we plan to add
    // 1. Request A starts and gets 401
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: new Headers(),
      json: async () => ({}),
      text: async () => '{}',
    });
    // 2. Retry A succeeds
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      json: async () => ({ id: 'A' }),
      text: async () => '{"id": "A"}',
    });
    // 3. Request B succeeds (should use new token immediately)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      json: async () => ({ id: 'B' }),
      text: async () => '{"id": "B"}',
    });

    const reqA = client.request('/testA');

    // Wait a bit to ensure reqA triggers refresh
    await new Promise((r) => setTimeout(r, 10));

    // Start reqB while refresh is pending (refresh takes 50ms)
    const reqB = client.request('/testB');

    const [resA, resB] = await Promise.all([reqA, reqB]);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    expect(authConfig.refreshTokens).toHaveBeenCalledTimes(1);

    // Verify reqB used the new token
    // If the optimization is working, reqB should have waited for refresh
    // and used 'new-token-1'.
    // If not, it might have used 'valid-token' (old) and maybe got 401 (if we mocked it)
    // or just sent a request with old token.

    // In this test setup, if reqB used old token, it would have succeeded (mock 3 doesn't check token).
    // We should inspect the headers of call 3 to see which token was used.

    // Calls: 1=ReqA(401), 2=RetryA(200), 3=ReqB(200) OR ReqB(401)->RetryB
    // If optimization works: 1=ReqA(401), 2=RetryA, 3=ReqB (with new token)

    // Let's verify headers of the call for /testB
    const calls = fetchMock.mock.calls;
    const reqBCall = calls.find((call) => (call[0] as string).includes('/testB'));

    if (reqBCall) {
      const headers = reqBCall[1].headers as Record<string, string>;
      // This assertion will likely fail before implementation
      expect(headers['Authorization']).toBe('Bearer new-token-1');
    } else {
      throw new Error('Request B was not made');
    }
  });
});
