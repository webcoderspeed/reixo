import type { KnownRequestHeader } from '../types/http-well-known';
import { HTTPOptions } from './http';

export interface TracingConfig {
  /**
   * Header name for the trace ID.
   * Well-known tracing headers are suggested by IntelliSense.
   * @default 'x-request-id'
   */
  headerName?: KnownRequestHeader;

  /**
   * Function to generate a trace ID.
   * Defaults to a random UUID-like string.
   */
  generateId?: () => string;
}

/**
 * Creates a request interceptor that injects a unique Trace ID into every request.
 * Useful for distributed tracing and log correlation.
 *
 * @example
 * client.interceptors.request.push(
 *   createTraceInterceptor({ headerName: 'X-Correlation-ID' })
 * );
 */
export function createTraceInterceptor(config: TracingConfig = {}) {
  const headerName: string = config.headerName ?? 'x-request-id';
  const generateId =
    config.generateId ??
    (() =>
      Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15));

  return {
    onFulfilled: (options: HTTPOptions): HTTPOptions => {
      // Normalise existing headers to a plain object so we can do a key-lookup
      const existing: Record<string, string> =
        options.headers instanceof Headers
          ? Object.fromEntries(options.headers.entries())
          : Array.isArray(options.headers)
            ? Object.fromEntries(options.headers)
            : (options.headers ?? {});

      // Don't overwrite if the header is already present
      if (existing[headerName]) {
        return options;
      }

      return {
        ...options,
        headers: { ...existing, [headerName]: generateId() },
      };
    },
  };
}
