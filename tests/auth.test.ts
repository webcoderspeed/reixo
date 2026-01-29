import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HTTPClient } from '../src/core/http-client';
import { createAuthInterceptor } from '../src/utils/auth';
import { HTTPError, HTTPOptions } from '../src/utils/http';

describe('Auth Interceptor', () => {
  let client: HTTPClient;
  let transport: any;
  let getAccessToken: any;
  let refreshTokens: any;
  let onRefreshFailed: any;

  beforeEach(() => {
    transport = vi.fn();
    client = new HTTPClient({ transport });
    getAccessToken = vi.fn();
    refreshTokens = vi.fn();
    onRefreshFailed = vi.fn();

    createAuthInterceptor(client, {
      getAccessToken,
      refreshTokens,
      onRefreshFailed,
    });
  });

  it('should attach access token to requests', async () => {
    getAccessToken.mockResolvedValue('valid-token');
    transport.mockResolvedValue({
      status: 200,
      data: {},
      headers: new Headers(),
      config: {},
    });

    await client.get('/protected');

    expect(transport).toHaveBeenCalledWith(
      '/protected',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer valid-token',
        }),
      })
    );
  });

  it('should refresh token on 401 and retry', async () => {
    getAccessToken.mockResolvedValue('expired-token');

    // First call fails with 401
    transport.mockRejectedValueOnce(
      new HTTPError('Unauthorized', {
        status: 401,
        config: { url: '/protected', headers: { Authorization: 'Bearer expired-token' } },
      })
    );

    // Second call (retry) succeeds
    transport.mockResolvedValueOnce({
      status: 200,
      data: { success: true },
      headers: new Headers(),
      config: {},
    });

    refreshTokens.mockImplementation(async () => {
      getAccessToken.mockResolvedValue('new-token'); // Update token state
      return 'new-token';
    });

    const result = await client.get('/protected');

    expect(refreshTokens).toHaveBeenCalled();
    expect(transport).toHaveBeenCalledTimes(2);
    // First call
    expect(transport).toHaveBeenNthCalledWith(1, '/protected', expect.anything());
    // Second call (retry with new token)
    expect(transport).toHaveBeenNthCalledWith(
      2,
      '/protected',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer new-token',
        }),
      })
    );
    expect(result.data).toEqual({ success: true });
  });

  it('should queue concurrent requests during refresh', async () => {
    getAccessToken.mockResolvedValue('expired-token');

    // All initial requests fail with 401
    transport
      .mockRejectedValueOnce(
        new HTTPError('Unauthorized', {
          status: 401,
          config: { url: '/req1', headers: { Authorization: 'Bearer expired-token' } },
        })
      )
      .mockRejectedValueOnce(
        new HTTPError('Unauthorized', {
          status: 401,
          config: { url: '/req2', headers: { Authorization: 'Bearer expired-token' } },
        })
      );

    // Retries succeed
    transport.mockResolvedValue({
      status: 200,
      data: { success: true },
      headers: new Headers(),
      config: {},
    });

    // Refresh takes some time
    refreshTokens.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return 'new-token';
    });

    const p1 = client.get('/req1');
    const p2 = client.get('/req2');

    await Promise.all([p1, p2]);

    expect(refreshTokens).toHaveBeenCalledTimes(1); // Only one refresh
    expect(transport).toHaveBeenCalledTimes(4); // 2 initial failures + 2 retries
  });

  it('should fail all requests if refresh fails', async () => {
    getAccessToken.mockResolvedValue('expired-token');

    transport.mockRejectedValue(
      new HTTPError('Unauthorized', {
        status: 401,
        config: { url: '/protected', headers: { Authorization: 'Bearer expired-token' } },
      })
    );

    refreshTokens.mockRejectedValue(new Error('Refresh failed'));

    await expect(client.get('/protected')).rejects.toThrow('Refresh failed');
    expect(onRefreshFailed).toHaveBeenCalled();
  });
});
