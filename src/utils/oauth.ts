import { HTTPOptions, HTTPResponse } from './http';

export interface TokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType?: string;
}

export interface OAuth2Config {
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  scope?: string;
}

/**
 * Helper to perform OAuth2 Client Credentials flow to obtain a token.
 *
 * @param config OAuth2 configuration
 * @param fetcher Function to make the HTTP request (usually Reixo.http)
 * @returns Promise resolving to the token response
 */
export async function clientCredentialsFlow(
  config: OAuth2Config,
  fetcher: (url: string, options: HTTPOptions) => Promise<HTTPResponse<unknown>>
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.clientId,
  });

  if (config.clientSecret) {
    body.append('client_secret', config.clientSecret);
  }
  if (config.scope) {
    body.append('scope', config.scope);
  }

  const response = await fetcher(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  return response.data as TokenResponse;
}

/**
 * Helper to perform OAuth2 Refresh Token flow.
 *
 * @param config OAuth2 configuration
 * @param refreshToken The refresh token string
 * @param fetcher Function to make the HTTP request
 * @returns Promise resolving to the token response
 */
export async function refreshTokenFlow(
  config: OAuth2Config,
  refreshToken: string,
  fetcher: (url: string, options: HTTPOptions) => Promise<HTTPResponse<unknown>>
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.clientId,
  });

  if (config.clientSecret) {
    body.append('client_secret', config.clientSecret);
  }

  const response = await fetcher(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  return response.data as TokenResponse;
}
