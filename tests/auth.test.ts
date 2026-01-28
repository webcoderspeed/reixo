import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAuthRefreshInterceptor } from '../src/utils/auth';
import { HTTPClient } from '../src/core/http-client';
import { HTTPError } from '../src/utils/http';

describe('Auth Refresh Interceptor', () => {
  let client: HTTPClient;
  let refreshTokenCall: any;
  let shouldRefresh: any;
  let interceptor: any;

  beforeEach(() => {
    client = {
      request: vi.fn().mockResolvedValue({ status: 200, data: 'success', headers: {} }),
    } as any;
    refreshTokenCall = vi.fn().mockResolvedValue('new-token');
    shouldRefresh = vi.fn().mockReturnValue(true);

    interceptor = createAuthRefreshInterceptor({
      client,
      refreshTokenCall,
      shouldRefresh,
    });
  });

  const createError = (status = 401, config = { url: '/test', headers: {} }) => {
    return new HTTPError('Unauthorized', { status, config: config as any });
  };

  it('should pass through if error is not HTTPError', async () => {
    const error = new Error('Network Error');
    await expect(interceptor.onRejected(error)).rejects.toThrow(error);
  });

  it('should pass through if shouldRefresh returns false', async () => {
    shouldRefresh.mockReturnValue(false);
    const error = createError();
    await expect(interceptor.onRejected(error)).rejects.toThrow(error);
  });

  it('should pass through if request has already been retried', async () => {
    const error = createError(401, { url: '/test', headers: {}, _retry: true } as any);
    await expect(interceptor.onRejected(error)).rejects.toThrow(error);
  });

  it('should refresh token and retry request', async () => {
    const error = createError();

    await interceptor.onRejected(error);

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
    // Simulate slow refresh
    refreshTokenCall.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve('slow-token'), 10))
    );

    const error1 = createError(401, { url: '/1', headers: {} } as any);
    const error2 = createError(401, { url: '/2', headers: {} } as any);

    const p1 = interceptor.onRejected(error1);
    const p2 = interceptor.onRejected(error2);

    await Promise.all([p1, p2]);

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
    const refreshError = new Error('Refresh failed');
    refreshTokenCall.mockRejectedValue(refreshError);

    const error = createError();

    await expect(interceptor.onRejected(error)).rejects.toThrow(refreshError);
    expect(client.request).not.toHaveBeenCalled();
  });

  it('should support cookie auth type', async () => {
    interceptor = createAuthRefreshInterceptor({
      client,
      refreshTokenCall,
      shouldRefresh,
      authType: 'cookie',
    });

    const error = createError();
    await interceptor.onRejected(error);

    expect(client.request).toHaveBeenCalledWith(
      '/test',
      expect.objectContaining({
        // Should not add Bearer header
        headers: {},
      })
    );
  });

  it('should support custom token attachment', async () => {
    interceptor = createAuthRefreshInterceptor({
      client,
      refreshTokenCall,
      shouldRefresh,
      attachToken: (config, token) => ({
        ...config,
        headers: { ...config.headers, 'X-Custom-Token': token },
      }),
    });

    const error = createError();
    await interceptor.onRejected(error);

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
    // Simulate slow refresh that fails
    refreshTokenCall.mockImplementation(
      () => new Promise((_, reject) => setTimeout(() => reject(new Error('Refresh failed')), 10))
    );

    const error1 = createError(401, { url: '/1', headers: {} } as any);
    const error2 = createError(401, { url: '/2', headers: {} } as any);

    const p1 = interceptor.onRejected(error1);
    const p2 = interceptor.onRejected(error2);

    await expect(p1).rejects.toThrow('Refresh failed');
    await expect(p2).rejects.toThrow('Refresh failed');
  });

  it('should queue requests and use cookie auth', async () => {
    interceptor = createAuthRefreshInterceptor({
      client,
      refreshTokenCall: () => new Promise((r) => setTimeout(() => r('cookie-val'), 10)),
      shouldRefresh,
      authType: 'cookie',
    });

    const error1 = createError(401, { url: '/1', headers: {} } as any);
    const error2 = createError(401, { url: '/2', headers: {} } as any);

    await Promise.all([interceptor.onRejected(error1), interceptor.onRejected(error2)]);

    // Verify calls didn't get bearer token
    expect(client.request).toHaveBeenCalledWith(
      '/2',
      expect.not.objectContaining({
        headers: expect.objectContaining({ Authorization: expect.any(String) }),
      })
    );
  });

  it('should queue requests and use custom attachToken', async () => {
    interceptor = createAuthRefreshInterceptor({
      client,
      refreshTokenCall: () => new Promise((r) => setTimeout(() => r('custom-token'), 10)),
      shouldRefresh,
      attachToken: (config, token) => ({
        ...config,
        headers: { ...config.headers, 'X-Auth': token },
      }),
    });

    const error1 = createError(401, { url: '/1', headers: {} } as any);
    const error2 = createError(401, { url: '/2', headers: {} } as any);

    await Promise.all([interceptor.onRejected(error1), interceptor.onRejected(error2)]);

    expect(client.request).toHaveBeenCalledWith(
      '/2',
      expect.objectContaining({ headers: expect.objectContaining({ 'X-Auth': 'custom-token' }) })
    );
  });
});
