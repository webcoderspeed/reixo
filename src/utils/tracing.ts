import { HTTPOptions } from './http';

export interface TracingConfig {
  /**
   * Header name for the trace ID (default: 'x-request-id')
   */
  headerName?: string;

  /**
   * Function to generate a trace ID.
   * Defaults to a random UUID-like string.
   */
  generateId?: () => string;
}

/**
 * Creates a request interceptor that injects a unique Trace ID into every request.
 * Useful for distributed tracing and log correlation.
 */
export function createTraceInterceptor(config: TracingConfig = {}) {
  const headerName = config.headerName || 'x-request-id';
  const generateId =
    config.generateId ||
    (() =>
      Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15));

  return {
    onFulfilled: (options: HTTPOptions) => {
      // Don't overwrite if already present
      if (options.headers && (options.headers as Record<string, string>)[headerName]) {
        return options;
      }

      options.headers = {
        ...options.headers,
        [headerName]: generateId(),
      };
      return options;
    },
  };
}
