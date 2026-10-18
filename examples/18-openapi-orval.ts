/**
 * Example 18 — reixo as the HTTP client for orval-generated API code
 *
 * orval (https://orval.dev) generates typed functions from an OpenAPI spec and
 * calls a "mutator" for every request. Point the mutator at reixo and every
 * generated call gets retry, circuit breaking, caching, dedup and tracing.
 *
 * orval.config.ts:
 *
 *   export default defineConfig({
 *     api: {
 *       input: './openapi.yaml',
 *       output: {
 *         target: './src/api/generated.ts',
 *         httpClient: 'axios', // 'fetch' works too; the mutator is the same
 *         override: {
 *           mutator: { path: './src/api/reixo-instance.ts', name: 'reixoInstance' },
 *         },
 *       },
 *     },
 *   });
 *
 * Copy this file to src/api/reixo-instance.ts and import from 'reixo' instead
 * of '../src/index'. Tested with orval 8.43.
 */

import { HTTPClient, type HTTPMethod, type HTTPOptions } from '../src/index';

export const client = new HTTPClient({
  baseURL: process.env.API_URL ?? 'http://localhost:4010',
  retry: true,
});

type OrvalRequest = {
  url: string;
  method: HTTPMethod;
  params?: HTTPOptions['params'];
  data?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

export const reixoInstance = async <T>(
  { url, method, params, data, headers, signal }: OrvalRequest,
  options?: HTTPOptions
): Promise<T> => {
  const body =
    data === undefined || data instanceof FormData || typeof data === 'string'
      ? data
      : JSON.stringify(data);

  const response = await client.request<T>(url, {
    ...options,
    method,
    ...(params && { params }),
    ...(headers && { headers: { ...headers, ...options?.headers } }),
    ...(signal && { signal }),
    ...(body !== undefined && { body }),
  });
  return response.data;
};

export default reixoInstance;
