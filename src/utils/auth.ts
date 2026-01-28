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
  let isRefreshing = false;
  let failedQueue: { resolve: (value: unknown) => void; reject: (reason?: unknown) => void; config: HTTPOptions }[] = [];

  const processQueue = (error: unknown, token: string | null = null) => {
    failedQueue.forEach(prom => {
      if (error) {
        prom.reject(error);
      } else {
        // Retry with new token or cookie
        let newConfig: HTTPOptions;
        
        if (options.attachToken) {
          newConfig = options.attachToken(prom.config, token!);
        } else if (options.authType === 'cookie') {
          // For cookie auth, just retry the original request - browser will handle cookies
          newConfig = { ...prom.config };
        } else {
          // Default to bearer token
          newConfig = { 
            ...prom.config, 
            headers: { ...prom.config.headers, Authorization: `Bearer ${token}` } 
          };
        }
        
        options.client.request(prom.config.url || '', newConfig)
          .then(prom.resolve)
          .catch(prom.reject);
      }
    });
    failedQueue = [];
  };

  return {
    onRejected: async (error: unknown) => {
      const originalRequest = error instanceof HTTPError ? error.config : undefined;

      if (originalRequest && options.shouldRefresh(error) && !originalRequest._retry) {
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject, config: originalRequest });
          });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          const newToken = await options.refreshTokenCall();
          isRefreshing = false;
          processQueue(null, newToken);

          // Return retried request
          let newConfig: HTTPOptions;
          
          if (options.attachToken) {
            newConfig = options.attachToken(originalRequest, newToken);
          } else if (options.authType === 'cookie') {
            // For cookie auth, just retry the original request
            newConfig = { ...originalRequest };
          } else {
            // Default to bearer token
            newConfig = { 
              ...originalRequest, 
              headers: { ...originalRequest.headers, Authorization: `Bearer ${newToken}` } 
            };
          }
          
          return options.client.request(originalRequest.url || '', newConfig);
        } catch (refreshError) {
          isRefreshing = false;
          processQueue(refreshError, null);
          throw refreshError;
        }
      }

      throw error;
    },
  };
}
