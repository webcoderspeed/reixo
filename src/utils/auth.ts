import type { HTTPClient } from '../core/http-client';
import type { KnownRequestHeader } from '../types/http-well-known';
import type { HTTPError, HTTPOptions } from './http';

/**
 * Type guard for HTTPError.
 * Replaces the unsafe `error as HTTPError` cast in the 401 interceptor.
 */
function isHTTPError(error: unknown): error is HTTPError {
  return (
    error !== null &&
    typeof error === 'object' &&
    'status' in error &&
    typeof (error as Record<string, unknown>)['status'] === 'number'
  );
}

export interface AuthConfig {
  /**
   * Function to retrieve the current access token.
   */
  getAccessToken: () => string | null | Promise<string | null>;

  /**
   * Function to refresh the tokens.
   * Should throw if refresh fails.
   * Should return the new access token.
   */
  refreshTokens: (client: HTTPClient) => Promise<string>;

  /**
   * Callback when refresh fails (e.g. logout user).
   */
  onRefreshFailed?: (error: unknown) => void;

  /**
   * Header name used to attach the access token. Common header names are
   * suggested by IntelliSense.
   * @default 'Authorization'
   */
  headerName?: KnownRequestHeader;

  /**
   * Token prefix (default: 'Bearer ')
   */
  tokenPrefix?: string;
}

/**
 * Creates an authentication interceptor that handles:
 * 1. Attaching the access token to requests.
 * 2. Intercepting 401 errors.
 * 3. Refreshing the token.
 * 4. Retrying the original request.
 */
export function createAuthInterceptor(client: HTTPClient, config: AuthConfig): void {
  let isRefreshing = false;
  let failedQueue: Array<{
    resolve: (token: string) => void;
    reject: (error: unknown) => void;
  }> = [];

  const processQueue = (error: unknown, token: string | null = null) => {
    for (const prom of failedQueue) {
      if (error) {
        prom.reject(error);
      } else {
        prom.resolve(token!);
      }
    }
    failedQueue = [];
  };

  const headerName = config.headerName || 'Authorization';
  const tokenPrefix = config.tokenPrefix || 'Bearer ';

  // Request Interceptor: Attach Token
  client.interceptors.request.push({
    onFulfilled: async (options) => {
      // If token refresh is in progress, wait for it to complete
      if (isRefreshing) {
        try {
          await new Promise<string>((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          });
        } catch (error) {
          // If refresh fails, the request should probably fail too
          return Promise.reject(error);
        }
      }

      const token = await config.getAccessToken();
      if (token) {
        options.headers = {
          ...options.headers,
          [headerName]: `${tokenPrefix}${token}`,
        };
      }
      return options;
    },
  });

  // Response Interceptor: Handle 401
  client.interceptors.response.push({
    onRejected: async (error: unknown) => {
      // Type-safe guard: only proceed if this is genuinely an HTTPError.
      // A direct `as HTTPError` cast is unsafe — the error could be a plain Error,
      // a string, or any other rejection value.
      if (!isHTTPError(error)) {
        return Promise.reject(error);
      }
      const httpError = error;
      const originalRequest = httpError.config as HTTPOptions & { _retry?: boolean };

      if (httpError.status === 401 && !originalRequest._retry) {
        if (isRefreshing) {
          try {
            const token = await new Promise<string>((resolve, reject) => {
              failedQueue.push({ resolve, reject });
            });

            originalRequest.headers = {
              ...originalRequest.headers,
              [headerName]: `${tokenPrefix}${token}`,
            };
            return client.request(originalRequest.url || '', originalRequest);
          } catch (err) {
            return Promise.reject(err);
          }
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          const newToken = await config.refreshTokens(client);
          isRefreshing = false;
          processQueue(null, newToken);

          originalRequest.headers = {
            ...originalRequest.headers,
            [headerName]: `${tokenPrefix}${newToken}`,
          };

          return client.request(originalRequest.url || '', originalRequest);
        } catch (err) {
          isRefreshing = false;
          processQueue(err, null);
          if (config.onRefreshFailed) {
            config.onRefreshFailed(err);
          }
          return Promise.reject(err);
        }
      }

      return Promise.reject(error);
    },
  });
}
