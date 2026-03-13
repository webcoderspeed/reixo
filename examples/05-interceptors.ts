/**
 * Example 05 — Interceptors & Auth Token Refresh
 *
 * Covers: request interceptors, response interceptors,
 * auth interceptor with concurrent 401 handling, and interceptor removal.
 *
 * Run: npx tsx examples/05-interceptors.ts
 */

import { HTTPBuilder, HTTPError, createAuthInterceptor } from '../src';

// Simulated token store
let accessToken = 'initial-valid-token';
let refreshCallCount = 0;

async function main() {
  // ── 1. Request interceptor — inject header ────────────────────────────────────
  console.log('--- Request interceptor: inject X-Request-ID');
  const client = new HTTPBuilder()
    .withBaseURL('https://jsonplaceholder.typicode.com')
    .withTimeout(5_000)
    .build();

  client.addRequestInterceptor(async (config) => {
    return {
      ...config,
      headers: {
        ...(config.headers as Record<string, string>),
        'X-Request-ID': crypto.randomUUID(),
        'X-Client-Version': '2.1.3',
      },
    };
  });

  const res = await client.get('/posts/1');
  console.log(`  ${res.status} — request headers injected`);

  // ── 2. Response interceptor — transform data ──────────────────────────────────
  console.log('\n--- Response interceptor: normalise shape');
  const normalClient = new HTTPBuilder()
    .withBaseURL('https://jsonplaceholder.typicode.com')
    .withTimeout(5_000)
    .build();

  normalClient.addResponseInterceptor(async (response) => {
    // Add a computed field to every response
    (response as unknown as Record<string, unknown>)['receivedAt'] = new Date().toISOString();
    return response;
  });

  const post = await normalClient.get<{ id: number; title: string }>('/posts/1');
  console.log(`  ${post.status}  title: "${post.data.title.slice(0, 40)}"`);

  // ── 3. Remove an interceptor ──────────────────────────────────────────────────
  console.log('\n--- Remove interceptor');
  const loggingClient = new HTTPBuilder()
    .withBaseURL('https://jsonplaceholder.typicode.com')
    .withTimeout(5_000)
    .build();

  let logCount = 0;
  const interceptorId = loggingClient.addRequestInterceptor(async (config) => {
    logCount++;
    console.log(`  interceptor fired (count: ${logCount})`);
    return config;
  });

  await loggingClient.get('/posts/1'); // fires
  loggingClient.removeRequestInterceptor(interceptorId);
  await loggingClient.get('/posts/2'); // does not fire
  console.log(`  interceptor fired ${logCount} time(s) total (expected 1)`);

  // ── 4. Auth interceptor — automatic token refresh ────────────────────────────
  console.log('\n--- Auth interceptor (simulated token refresh)');

  // Build a client that will get a "401" from our simulated endpoint
  const authClient = new HTTPBuilder()
    .withBaseURL('https://jsonplaceholder.typicode.com')
    .withTimeout(5_000)
    .build();

  // Add a request interceptor that injects a Bearer token
  authClient.addRequestInterceptor(async (config) => ({
    ...config,
    headers: {
      ...(config.headers as Record<string, string>),
      Authorization: `Bearer ${accessToken}`,
    },
  }));

  // createAuthInterceptor handles the refresh flow, including concurrent 401s
  const authInterceptor = createAuthInterceptor(authClient, {
    getAccessToken: async () => accessToken,
    refreshTokens: async () => {
      refreshCallCount++;
      console.log(`  token refresh called (count: ${refreshCallCount})`);
      accessToken = `refreshed-token-${Date.now()}`;
      return accessToken;
    },
    // For demo purposes, trigger refresh on any request to /posts/99999 (which returns 404)
    // In real use this would be: shouldRefresh: (err) => err instanceof HTTPError && err.status === 401
    shouldRefresh: (err) => err instanceof HTTPError && err.status === 404,
    onAuthFailure: () => console.log('  auth failed — redirect to login'),
  });

  authClient.addRequestInterceptor(authInterceptor);

  // This will 404, triggering the auth refresh flow (for demo)
  try {
    await authClient.get('/posts/99999');
  } catch (err) {
    if (err instanceof HTTPError) {
      console.log(`  final error: ${err.status} (refresh was attempted: ${refreshCallCount > 0})`);
    }
  }

  console.log('\nDone.');
}

main().catch(console.error);
