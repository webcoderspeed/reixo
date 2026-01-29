import { HTTPOptions } from './http';

export type HeaderProvider = () => Record<string, string> | Promise<Record<string, string>>;

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
 *     Cookie: headersList.get('cookie') || '',
 *     Authorization: headersList.get('authorization') || '',
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

        const headersToForward = whitelist
          ? Object.fromEntries(
              Object.entries(ssrHeaders).filter(([key]) =>
                whitelist.some((w) => key.toLowerCase() === w.toLowerCase())
              )
            )
          : ssrHeaders;

        config.headers = {
          ...headersToForward,
          ...(config.headers as Record<string, string>),
        };
      } catch (error) {
        // In some contexts (e.g. client-side rendering where ssr function might fail),
        // we might want to ignore or log.
        // For now, we'll just log warning if console exists and proceed.
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[Reixo] SSR Header Forwarding failed:', error);
        }
      }
      return config;
    },
  };
}
