import { describe, it, expect, vi } from 'vitest';
import { HTTPClient } from '../src/core/http-client';

describe('API Versioning', () => {
  it('should add version header by default', async () => {
    const transport = vi.fn().mockResolvedValue({ status: 200, data: {}, headers: new Headers() });
    const client = new HTTPClient({
      apiVersion: 'v1',
      transport: transport as any,
    });

    await client.request('/users');

    expect(transport).toHaveBeenCalledWith(
      '/users',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-API-Version': 'v1',
        }),
      })
    );
  });

  it('should use custom version header', async () => {
    const transport = vi.fn().mockResolvedValue({ status: 200, data: {}, headers: new Headers() });
    const client = new HTTPClient({
      apiVersion: '2023-01-01',
      versionHeader: 'Accept-Version',
      transport: transport as any,
    });

    await client.request('/users');

    expect(transport).toHaveBeenCalledWith(
      '/users',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Accept-Version': '2023-01-01',
        }),
      })
    );
  });

  it('should prepend version to URL when strategy is url', async () => {
    const transport = vi.fn().mockResolvedValue({ status: 200, data: {}, headers: new Headers() });
    const client = new HTTPClient({
      apiVersion: 'v2',
      versioningStrategy: 'url',
      transport: transport as any,
    });

    await client.request('/users');

    // URL passed to transport should be /v2/users
    expect(transport).toHaveBeenCalledWith('/v2/users', expect.any(Object));
  });

  it('should handle URL versioning with leading/trailing slashes', async () => {
    const transport = vi.fn().mockResolvedValue({ status: 200, data: {}, headers: new Headers() });
    const client = new HTTPClient({
      apiVersion: '/v3/',
      versioningStrategy: 'url',
      transport: transport as any,
    });

    await client.request('users'); // no leading slash

    expect(transport).toHaveBeenCalledWith('/v3/users', expect.any(Object));
  });

  it('should not modify absolute URLs with url strategy', async () => {
    const transport = vi.fn().mockResolvedValue({ status: 200, data: {}, headers: new Headers() });
    const client = new HTTPClient({
      apiVersion: 'v1',
      versioningStrategy: 'url',
      transport: transport as any,
    });

    await client.request('https://other-api.com/users');

    expect(transport).toHaveBeenCalledWith('https://other-api.com/users', expect.any(Object));
  });
});
