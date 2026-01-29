import { describe, it, expect, vi } from 'vitest';
import { createSSRInterceptor } from '../src/utils/ssr';
import { HTTPOptions } from '../src/utils/http';

describe('SSR Header Forwarding', () => {
  it('should forward headers from provider', async () => {
    const provider = vi.fn().mockResolvedValue({
      Cookie: 'session=123',
      'x-request-id': 'req-abc',
    });

    const interceptor = createSSRInterceptor(provider);
    const config: HTTPOptions = { headers: { 'Content-Type': 'application/json' } };

    const result = await interceptor.onFulfilled(config);

    expect(result.headers).toEqual({
      Cookie: 'session=123',
      'x-request-id': 'req-abc',
      'Content-Type': 'application/json',
    });
  });

  it('should respect whitelist', async () => {
    const provider = vi.fn().mockReturnValue({
      Cookie: 'session=123',
      Authorization: 'Bearer token',
      'x-ignored': 'should-not-pass',
    });

    const interceptor = createSSRInterceptor(provider, ['cookie', 'authorization']);
    const config: HTTPOptions = {};

    const result = await interceptor.onFulfilled(config);

    expect(result.headers).toEqual({
      Cookie: 'session=123',
      Authorization: 'Bearer token',
    });
    expect(result.headers).not.toHaveProperty('x-ignored');
  });

  it('should preserve existing headers (overwrite if conflict)', async () => {
    const provider = vi.fn().mockResolvedValue({
      Authorization: 'Bearer ssr-token',
    });

    const interceptor = createSSRInterceptor(provider);
    // Explicit header should take precedence over SSR header?
    // Actually, in my implementation:
    // config.headers = { ...headersToForward, ...existingHeaders };
    // So existing headers take precedence. This is correct behavior (manual override).

    const config: HTTPOptions = {
      headers: { Authorization: 'Bearer manual-token' },
    };

    const result = await interceptor.onFulfilled(config);

    expect(result.headers).toEqual({
      Authorization: 'Bearer manual-token',
    });
  });

  it('should handle provider errors gracefully', async () => {
    const provider = vi.fn().mockRejectedValue(new Error('SSR Context not available'));
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const interceptor = createSSRInterceptor(provider);
    const config: HTTPOptions = { headers: { Accept: 'application/json' } };

    const result = await interceptor.onFulfilled(config);

    expect(result.headers).toEqual({ Accept: 'application/json' });
    expect(consoleSpy).toHaveBeenCalledWith(
      '[Reixo] SSR Header Forwarding failed:',
      expect.any(Error)
    );

    consoleSpy.mockRestore();
  });
});
