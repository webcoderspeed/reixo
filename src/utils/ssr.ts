import type { HeadersRecord } from '../types/http-well-known';
import { HTTPOptions } from './http';

/**
 * A function that returns the headers to forward for an SSR request.
 * May be synchronous or async (e.g. when reading from Next.js `headers()`).
 */
export type HeaderProvider = () => HeadersRecord | Promise<HeadersRecord>;

/**
 * Creates a request interceptor that forwards headers from an SSR context.
 * Useful for Next.js, Nuxt, etc. to forward cookies/auth headers to backend services.
 *
 * @example
 * // Next.js App Router
 * import { headers } from 'next/headers';
 * const ssrInterceptor = createSSRInterceptor(async () => {
 *   const headersList = await headers();
 *   return {
 *     Cookie: headersList.get('cookie') ?? '',
 *     Authorization: headersList.get('authorization') ?? '',
 *   };
 * });
 * client.interceptors.request.push(ssrInterceptor);
 */
export function createSSRInterceptor(
  headerProvider: HeaderProvider,
  whitelist?: string[]
): { onFulfilled: (config: HTTPOptions) => Promise<HTTPOptions> } {
  return {
    onFulfilled: async (config: HTTPOptions): Promise<HTTPOptions> => {
      try {
        const ssrHeaders = await headerProvider();

        const headersToForward: HeadersRecord = whitelist
          ? (Object.fromEntries(
              Object.entries(ssrHeaders).filter(([key]) =>
                whitelist.some((w) => key.toLowerCase() === w.toLowerCase())
              )
            ) as HeadersRecord)
          : ssrHeaders;

        // Merge SSR headers under any per-request headers (request-level wins)
        const existing =
          config.headers instanceof Headers
            ? (Object.fromEntries(config.headers.entries()) as HeadersRecord)
            : Array.isArray(config.headers)
              ? (Object.fromEntries(config.headers) as HeadersRecord)
              : (config.headers ?? {});

        config.headers = { ...headersToForward, ...existing } as HeadersRecord;
      } catch (error) {
        if (typeof console !== 'undefined') {
          console.warn('[Reixo] SSR Header Forwarding failed:', error);
        }
      }
      return config;
    },
  };
}
