import { describe, it, expect, vi } from 'vitest';
import { createAuthRefreshInterceptor } from '../src/utils/auth';
import { HTTPClient } from '../src/core/http-client';
import { HTTPError, HTTPOptions } from '../src/utils/http';

const createTestContext = () => {
  const client = {
    request: vi.fn().mockResolvedValue({ status: 200, data: 'success', headers: {} }),
  } as unknown as HTTPClient;

  const refreshTokenCall = vi.fn().mockResolvedValue('new-token');
  const shouldRefresh = vi.fn().mockReturnValue(true);

  const interceptor = createAuthRefreshInterceptor({
    client,
    refreshTokenCall,
    shouldRefresh,
  });

  return { client, refreshTokenCall, shouldRefresh, interceptor };
};

const createError = (
  status = 401,
  config: Partial<HTTPOptions> = { url: '/test', headers: {} }
) => {
  return new HTTPError('Unauthorized', { status, config: config as HTTPOptions });
};

describe('Auth Refresh Interceptor', () => {
  it('should pass through if error is not HTTPError', async () => {
    const { interceptor } = createTestContext();
    const error = new Error('Network Error');
    if (interceptor.onRejected) {
      await expect(interceptor.onRejected(error)).rejects.toThrow(error);
    }
  });

  it('should pass through if shouldRefresh returns false', async () => {
    const { interceptor, shouldRefresh } = createTestContext();
    shouldRefresh.mockReturnValue(false);
    const error = createError();
    if (interceptor.onRejected) {
      await expect(interceptor.onRejected(error)).rejects.toThrow(error);
    }
  });

  it('should pass through if request has already been retried', async () => {
    const { interceptor } = createTestContext();
    const error = createError(401, { url: '/test', headers: {}, _retry: true });
    if (interceptor.onRejected) {
      await expect(interceptor.onRejected(error)).rejects.toThrow(error);
    }
  });

  it('should refresh token and retry request', async () => {
    const { interceptor, refreshTokenCall, client } = createTestContext();
    const error = createError();

    if (interceptor.onRejected) {
      await interceptor.onRejected(error);
    }

    expect(refreshTokenCall).toHaveBeenCalled();
    expect(client.request).toHaveBeenCalledWith(
      '/test',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer new-token',
        }),
      })
    );
  });

  it('should queue concurrent requests while refreshing', async () => {
    const { interceptor, refreshTokenCall, client } = createTestContext();
    // Simulate slow refresh
    refreshTokenCall.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve('slow-token'), 10))
    );

    const error1 = createError(401, { url: '/1', headers: {} });
    const error2 = createError(401, { url: '/2', headers: {} });

    if (interceptor.onRejected) {
      const p1 = interceptor.onRejected(error1);
      const p2 = interceptor.onRejected(error2);

      await Promise.all([p1, p2]);
    }

    expect(refreshTokenCall).toHaveBeenCalledTimes(1); // Only one refresh call
    expect(client.request).toHaveBeenCalledTimes(2);
    expect(client.request).toHaveBeenCalledWith(
      '/1',
      expect.objectContaining({ headers: { Authorization: 'Bearer slow-token' } })
    );
    expect(client.request).toHaveBeenCalledWith(
      '/2',
      expect.objectContaining({ headers: { Authorization: 'Bearer slow-token' } })
    );
  });

  it('should handle refresh failure', async () => {
    const { interceptor, refreshTokenCall, client } = createTestContext();
    const refreshError = new Error('Refresh failed');
    refreshTokenCall.mockRejectedValue(refreshError);

    const error = createError();

    if (interceptor.onRejected) {
      await expect(interceptor.onRejected(error)).rejects.toThrow(refreshError);
    }
    expect(client.request).not.toHaveBeenCalled();
  });

  it('should support cookie auth type', async () => {
    const { client, refreshTokenCall, shouldRefresh } = createTestContext();
    const interceptor = createAuthRefreshInterceptor({
      client,
      refreshTokenCall,
      shouldRefresh,
      authType: 'cookie',
    });

    const error = createError();
    if (interceptor.onRejected) {
      await interceptor.onRejected(error);
    }

    expect(client.request).toHaveBeenCalledWith(
      '/test',
      expect.objectContaining({
        // Should not add Bearer header
        headers: {},
      })
    );
  });

  it('should support custom token attachment', async () => {
    const { client, refreshTokenCall, shouldRefresh } = createTestContext();
    const interceptor = createAuthRefreshInterceptor({
      client,
      refreshTokenCall,
      shouldRefresh,
      attachToken: (config, token) => ({
        ...config,
        headers: { ...config.headers, 'X-Custom-Token': token },
      }),
    });

    const error = createError();
    if (interceptor.onRejected) {
      await interceptor.onRejected(error);
    }

    expect(client.request).toHaveBeenCalledWith(
      '/test',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Custom-Token': 'new-token',
        }),
      })
    );
  });

  it('should reject queued requests if refresh fails', async () => {
    const { interceptor, refreshTokenCall } = createTestContext();
    // Simulate slow refresh that fails
    refreshTokenCall.mockImplementation(
      () => new Promise((_, reject) => setTimeout(() => reject(new Error('Refresh failed')), 10))
    );

    const error1 = createError(401, { url: '/1', headers: {} });
    const error2 = createError(401, { url: '/2', headers: {} });

    if (interceptor.onRejected) {
      const p1 = interceptor.onRejected(error1);
      const p2 = interceptor.onRejected(error2);

      await expect(p1).rejects.toThrow('Refresh failed');
      await expect(p2).rejects.toThrow('Refresh failed');
    }
  });

  it('should queue requests and use cookie auth', async () => {
    const { client, shouldRefresh } = createTestContext();
    const interceptor = createAuthRefreshInterceptor({
      client,
      refreshTokenCall: () => new Promise((r) => setTimeout(() => r('cookie-val'), 10)),
      shouldRefresh,
      authType: 'cookie',
    });

    const error1 = createError(401, { url: '/1', headers: {} });
    const error2 = createError(401, { url: '/2', headers: {} });

    if (interceptor.onRejected) {
      await Promise.all([interceptor.onRejected(error1), interceptor.onRejected(error2)]);
    }

    // Verify calls didn't get bearer token
    expect(client.request).toHaveBeenCalledWith(
      '/2',
      expect.not.objectContaining({
        headers: expect.objectContaining({ Authorization: expect.any(String) }),
      })
    );
  });

  it('should queue requests and use custom attachToken', async () => {
    const { client, shouldRefresh } = createTestContext();
    const interceptor = createAuthRefreshInterceptor({
      client,
      refreshTokenCall: () => new Promise((r) => setTimeout(() => r('custom-token'), 10)),
      shouldRefresh,
      attachToken: (config, token) => ({
        ...config,
        headers: { ...config.headers, 'X-Auth': token },
      }),
    });

    const error1 = createError(401, { url: '/1', headers: {} });
    const error2 = createError(401, { url: '/2', headers: {} });

    if (interceptor.onRejected) {
      await Promise.all([interceptor.onRejected(error1), interceptor.onRejected(error2)]);
    }

    expect(client.request).toHaveBeenCalledWith(
      '/2',
      expect.objectContaining({ headers: expect.objectContaining({ 'X-Auth': 'custom-token' }) })
    );
  });
});
