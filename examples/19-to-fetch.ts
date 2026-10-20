/**
 * Example 19 — reixo as the `fetch` for openapi-fetch (or any library with a `fetch` option)
 *
 * `client.toFetch()` returns a standard fetch function, so typed OpenAPI clients
 * get reixo's retry, circuit breaker, timeout and tracing without a wrapper.
 *
 * Run: npx tsx examples/19-to-fetch.ts
 */

import createClient from 'openapi-fetch';

import { HTTPClient } from '../src/index';

interface Post {
  id: number;
  title: string;
}

// In a real project this comes from `npx openapi-typescript openapi.yaml -o api.d.ts`.
interface Paths {
  '/posts/{id}': {
    parameters: { query?: never; header?: never; path: { id: number }; cookie?: never };
    get: {
      parameters: { query?: never; header?: never; path: { id: number }; cookie?: never };
      requestBody?: never;
      responses: {
        200: { headers: Record<string, unknown>; content: { 'application/json': Post } };
      };
    };
  };
}

const reixo = new HTTPClient({
  retry: { maxRetries: 3, initialDelayMs: 200 },
  timeoutMs: 5000,
  circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30_000 },
});

const api = createClient<Paths>({
  baseUrl: 'https://jsonplaceholder.typicode.com',
  fetch: reixo.toFetch(),
});

async function main() {
  const { data, response } = await api.GET('/posts/{id}', {
    params: { path: { id: 1 } },
  });

  if (!data) {
    console.error('Request failed with', response.status);
    return;
  }
  console.log(`#${data.id}: ${data.title}`);
}

main().catch(console.error);
