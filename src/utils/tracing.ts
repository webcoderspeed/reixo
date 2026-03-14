import type { KnownRequestHeader } from '../types/http-well-known';
import type { HTTPOptions } from './http';

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
    // eslint-disable-next-line sonarjs/pseudo-random -- trace IDs are not security-sensitive; Math.random() is sufficient
    (() => Math.random().toString(36).slice(2, 15) + Math.random().toString(36).slice(2, 15));

  return {
    onFulfilled: (options: HTTPOptions): HTTPOptions => {
      // Normalise existing headers to a plain object so we can do a key-lookup
      let existing: Record<string, string>;
      if (options.headers instanceof Headers) {
        existing = Object.fromEntries(options.headers.entries());
      } else if (Array.isArray(options.headers)) {
        existing = Object.fromEntries(options.headers);
      } else {
        existing = (options.headers ?? {}) as Record<string, string>;
      }

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
