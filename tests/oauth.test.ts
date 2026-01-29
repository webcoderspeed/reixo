import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clientCredentialsFlow, refreshTokenFlow } from '../src/utils/oauth';

describe('OAuth2 Helpers', () => {
  const mockFetcher = vi.fn();

  beforeEach(() => {
    mockFetcher.mockReset();
  });

  it('should perform client credentials flow', async () => {
    mockFetcher.mockResolvedValue({
      data: {
        accessToken: 'access-123',
        expiresIn: 3600,
        tokenType: 'Bearer',
      },
    });

    const token = await clientCredentialsFlow(
      {
        tokenUrl: 'https://auth.com/token',
        clientId: 'my-client',
        clientSecret: 'my-secret',
        scope: 'read:users',
      },
      mockFetcher
    );

    expect(token.accessToken).toBe('access-123');

    expect(mockFetcher).toHaveBeenCalledWith(
      'https://auth.com/token',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: expect.stringContaining('grant_type=client_credentials'),
      })
    );

    // Check body content
    const callArgs = mockFetcher.mock.calls[0];
    const body = new URLSearchParams(callArgs[1].body);
    expect(body.get('client_id')).toBe('my-client');
    expect(body.get('client_secret')).toBe('my-secret');
    expect(body.get('scope')).toBe('read:users');
  });

  it('should perform refresh token flow', async () => {
    mockFetcher.mockResolvedValue({
      data: {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      },
    });

    const token = await refreshTokenFlow(
      {
        tokenUrl: 'https://auth.com/token',
        clientId: 'my-client',
        clientSecret: 'my-secret',
      },
      'old-refresh-token',
      mockFetcher
    );

    expect(token.accessToken).toBe('new-access-token');

    expect(mockFetcher).toHaveBeenCalledWith(
      'https://auth.com/token',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('grant_type=refresh_token'),
      })
    );

    const callArgs = mockFetcher.mock.calls[0];
    const body = new URLSearchParams(callArgs[1].body);
    expect(body.get('refresh_token')).toBe('old-refresh-token');
  });
});
