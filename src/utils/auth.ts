import { HTTPClient, RequestInterceptor, ResponseInterceptor } from '../core/http-client';
import { HTTPOptions } from './http';

export interface AuthRefreshOptions {
  client: HTTPClient;
  refreshTokenCall: () => Promise<string>; // Returns new access token
  shouldRefresh: (error: unknown) => boolean;
  attachToken?: (config: HTTPOptions, token: string) => HTTPOptions;
}

export function createAuthRefreshInterceptor(options: AuthRefreshOptions): ResponseInterceptor {
  let isRefreshing = false;
  let failedQueue: { resolve: (value: unknown) => void; reject: (reason?: unknown) => void; config: HTTPOptions }[] = [];

  const processQueue = (error: unknown, token: string | null = null) => {
    failedQueue.forEach(prom => {
      if (error) {
        prom.reject(error);
      } else {
        // Retry with new token
        const newConfig = options.attachToken 
          ? options.attachToken(prom.config, token!) 
          : { ...prom.config, headers: { ...prom.config.headers, Authorization: `Bearer ${token}` } };
        
        options.client.request(prom.config.url || '', newConfig)
          .then(prom.resolve)
          .catch(prom.reject);
      }
    });
    failedQueue = [];
  };

  return {
    onRejected: async (error: unknown) => {
      const originalRequest = (error as any)?.config as HTTPOptions | undefined;

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
          const newConfig = options.attachToken 
            ? options.attachToken(originalRequest, newToken) 
            : { ...originalRequest, headers: { ...originalRequest.headers, Authorization: `Bearer ${newToken}` } };
            
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
