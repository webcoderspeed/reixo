import { HTTPClient, ResponseInterceptor } from '../core/http-client';
import { HTTPOptions, HTTPError } from './http';

export interface AuthRefreshOptions {
  client: HTTPClient;
  refreshTokenCall: () => Promise<string>; // Returns new access token or cookie value
  shouldRefresh: (error: unknown) => boolean;
  attachToken?: (config: HTTPOptions, token: string) => HTTPOptions;
  authType?: 'bearer' | 'cookie';
  cookieName?: string;
}

export function createAuthRefreshInterceptor(options: AuthRefreshOptions): ResponseInterceptor {
  const state = {
    isRefreshing: false,
    failedQueue: [] as {
      resolve: (value: unknown) => void;
      reject: (reason?: unknown) => void;
      config: HTTPOptions;
    }[],
  };

  const processQueue = (error: unknown, token: string | null = null) => {
    state.failedQueue.forEach((prom) => {
      if (error) {
        prom.reject(error);
      } else {
        // Retry with new token or cookie
        const newConfig = options.attachToken
          ? options.attachToken(prom.config, token!)
          : options.authType === 'cookie'
            ? { ...prom.config }
            : {
                ...prom.config,
                headers: { ...prom.config.headers, Authorization: `Bearer ${token}` },
              };

        options.client
          .request(prom.config.url || '', newConfig)
          .then(prom.resolve)
          .catch(prom.reject);
      }
    });
    state.failedQueue = [];
  };

  return {
    onRejected: async (error: unknown) => {
      const originalRequest = error instanceof HTTPError ? error.config : undefined;

      if (originalRequest && options.shouldRefresh(error) && !originalRequest._retry) {
        if (state.isRefreshing) {
          return new Promise((resolve, reject) => {
            state.failedQueue.push({ resolve, reject, config: originalRequest });
          });
        }

        originalRequest._retry = true;
        state.isRefreshing = true;

        try {
          const newToken = await options.refreshTokenCall();
          state.isRefreshing = false;
          processQueue(null, newToken);

          // Return retried request
          const newConfig = options.attachToken
            ? options.attachToken(originalRequest, newToken)
            : options.authType === 'cookie'
              ? { ...originalRequest }
              : {
                  ...originalRequest,
                  headers: { ...originalRequest.headers, Authorization: `Bearer ${newToken}` },
                };

          return options.client.request(originalRequest.url || '', newConfig);
        } catch (refreshError) {
          state.isRefreshing = false;
          processQueue(refreshError, null);
          throw refreshError;
        }
      }

      throw error;
    },
  };
}
