# reixo

A TypeScript-first HTTP client for Node.js and browsers. Handles the things you'd otherwise write by hand — retries, circuit breaking, request queuing, caching, auth token refresh, and typed errors — so your application code stays focused on business logic.

[![npm version](https://img.shields.io/npm/v/reixo)](https://www.npmjs.com/package/reixo)
[![npm downloads](https://img.shields.io/npm/dm/reixo)](https://www.npmjs.com/package/reixo)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue)](https://www.typescriptlang.org/)
[![CI](https://github.com/webcoderspeed/reixo/actions/workflows/ci.yml/badge.svg)](https://github.com/webcoderspeed/reixo)

---

## Why reixo?

The native `fetch` API is flexible but low-level. Common tasks — request timeouts, retries on transient failures, error normalization, token refresh, deduplication — require boilerplate that ends up duplicated across every project. `axios` fills some of those gaps, but leaves the hard parts (circuit breaking, typed errors, offline queuing, request cancellation, structured logging) to third-party plugins or custom code.

reixo bundles those patterns into a single, cohesive library with:

- **Zero `any` types.** The entire codebase is written with strict TypeScript. No silent type widening.
- **Typed error classes.** Catch `NetworkError`, `TimeoutError`, `AbortError`, `CircuitOpenError`, or `RetryError` with `instanceof` — no string matching.
- **First-class resilience.** Retry with exponential backoff, circuit breaker, and rate limiting are configuration options, not add-ons.
- **Request lifecycle control.** Cancel individual requests by ID, cancel all in-flight requests, or prefetch with a cancellable handle.
- **Dual ESM + CJS output.** Works in Node.js 18+, modern browsers, edge runtimes, and server-side rendering.
- **No runtime dependencies.** The core relies only on the platform's native `fetch` and `AbortController`.

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Making Requests](#making-requests)
- [Error Handling](#error-handling)
- [Retries](#retries)
- [Circuit Breaker](#circuit-breaker)
- [Request Cancellation](#request-cancellation)
- [Caching](#caching)
- [Interceptors](#interceptors)
- [Auth Token Refresh](#auth-token-refresh)
- [Request Queue & Offline Support](#request-queue--offline-support)
- [Polling](#polling)
- [WebSocket Client](#websocket-client)
- [Server-Sent Events](#server-sent-events)
- [GraphQL](#graphql)
- [Logging](#logging)
- [Mock Adapter](#mock-adapter)
- [Testing](#testing)
- [Migration from axios](#migration-from-axios)
- [Migration from fetch](#migration-from-fetch)
- [Browser & Node.js Support](#browser--nodejs-support)
- [Contributing](#contributing)
- [License](#license)

---

## Installation

```sh
npm install reixo
# or
yarn add reixo
# or
pnpm add reixo
```

---

## Quick Start

```ts
import { HTTPBuilder } from 'reixo';

const client = new HTTPBuilder()
  .withBaseURL('https://api.example.com')
  .withTimeout(10_000)
  .withHeader('Authorization', 'Bearer <token>')
  .build();

const response = await client.get<User[]>('/users');
console.log(response.data); // User[]
```

`response.data` is already parsed. HTTP errors (4xx, 5xx) throw `HTTPError` automatically — no manual `if (!response.ok)` required.

---

## Configuration

The `HTTPBuilder` provides a fluent API that covers every option in `HTTPClientConfig`.

```ts
import { HTTPBuilder, LogLevel, ConsoleLogger } from 'reixo';

const client = new HTTPBuilder()
  .withBaseURL('https://api.example.com')
  .withTimeout(15_000)
  .withHeaders({
    Accept: 'application/json',
    'X-App-Version': '2.0',
  })
  .withRetry({
    maxRetries: 3,
    initialDelayMs: 200,
    backoffFactor: 2,
    jitter: true,
  })
  .withCircuitBreaker({
    failureThreshold: 5,
    resetTimeoutMs: 30_000,
  })
  .withRateLimit({
    requestsPerSecond: 20,
    burstCapacity: 40,
  })
  .withCache({
    ttl: 60_000,
    strategy: 'cache-first',
  })
  .withLogger(new ConsoleLogger({ level: LogLevel.WARN, format: 'json' }))
  .build();
```

You can also construct `HTTPClient` directly if you prefer plain objects over the builder:

```ts
import { HTTPClient } from 'reixo';

const client = new HTTPClient({
  baseURL: 'https://api.example.com',
  timeoutMs: 10_000,
  retry: { maxRetries: 3 },
});
```

---

## Making Requests

### HTTP Methods

```ts
// GET
const users = await client.get<User[]>('/users', {
  params: { page: 1, limit: 20 },
});

// POST
const created = await client.post<User>('/users', {
  name: 'Alice',
  email: 'alice@example.com',
});

// PUT / PATCH / DELETE
await client.put('/users/1', { name: 'Alice Updated' });
await client.patch('/users/1', { name: 'Alice' });
await client.delete('/users/1');

// HEAD / OPTIONS
const headers = await client.head('/users/1');
const allowed = await client.options('/users');
```

### Query Parameters

reixo serializes `params` automatically. Nested objects use bracket notation; arrays repeat the key.

```ts
// Flat
client.get('/items', { params: { page: 2, limit: 50 } });
// → /items?page=2&limit=50

// Arrays (repeated keys)
client.get('/items', { params: { tags: ['js', 'ts'] } });
// → /items?tags=js&tags=ts

// Nested objects (bracket notation)
client.get('/items', { params: { filter: { status: 'active', year: 2026 } } });
// → /items?filter%5Bstatus%5D=active&filter%5Byear%5D=2026

// Custom serializer
client.get('/items', {
  params: { ids: [1, 2, 3] },
  paramsSerializer: (p) =>
    Object.entries(p)
      .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(',') : v}`)
      .join('&'),
});
// → /items?ids=1,2,3
```

### Uploading Files

```ts
const form = new FormData();
form.append('file', fileBlob, 'report.pdf');

await client.post('/upload', form, {
  onUploadProgress: ({ loaded, total, progress }) => {
    console.log(`${progress}% — ${loaded}/${total} bytes`);
  },
});
```

### Response Streaming

```ts
const response = await client.get('/export/large.csv', {
  responseType: 'stream',
});
response.data.pipe(fs.createWriteStream('output.csv'));
```

---

## Error Handling

reixo throws specific error classes so you can handle failures precisely:

```ts
import {
  HTTPError,
  NetworkError,
  TimeoutError,
  AbortError,
  CircuitOpenError,
  RetryError,
} from 'reixo';

try {
  await client.get('/api/data');
} catch (err) {
  if (err instanceof HTTPError) {
    // 4xx / 5xx response
    console.error(`HTTP ${err.status}: ${err.statusText}`);
    console.error('Request config:', err.config);
  } else if (err instanceof TimeoutError) {
    // Request exceeded timeoutMs
    console.error(`Timed out after ${err.timeoutMs}ms`);
  } else if (err instanceof AbortError) {
    // Request was cancelled via AbortController or client.cancel()
    console.warn('Request was cancelled');
  } else if (err instanceof CircuitOpenError) {
    // Circuit breaker is OPEN — service is unavailable
    console.warn('Circuit open, using fallback');
  } else if (err instanceof NetworkError) {
    // fetch() rejected — no connectivity, DNS failure, etc.
    console.error('Network failure:', err.message);
  } else if (err instanceof RetryError) {
    // withRetry() exhausted all attempts (direct use of the utility)
    console.error(`Failed after ${err.attempts} attempts over ${err.durationMs}ms`);
    console.error('Original error:', err.cause);
  }
}
```

`HTTPClient` methods automatically unwrap `RetryError` — if you use `client.get()` with retry enabled, you receive the original typed error (e.g. `HTTPError` or `NetworkError`), not `RetryError`. `RetryError` is only surfaced when calling `withRetry()` directly.

---

## Retries

### Per-client default

```ts
const client = new HTTPBuilder()
  .withRetry({
    maxRetries: 3,
    initialDelayMs: 100,
    backoffFactor: 2,
    jitter: true, // ±50% jitter to spread retries
    maxDelayMs: 10_000,
    retryCondition: (err) => err instanceof NetworkError || err.status >= 500,
    onRetry: (err, attempt, delayMs) => {
      console.log(`Retry #${attempt} in ${delayMs}ms`);
    },
  })
  .build();
```

### Per-request override

```ts
// Disable retry for this request
await client.get('/idempotent', { retry: false });

// Override retry options for this request
await client.post('/payment', body, {
  retry: { maxRetries: 1, retryCondition: () => false },
});
```

### Standalone utility

```ts
import { withRetry, RetryError } from 'reixo';

try {
  const { result, attempts, durationMs } = await withRetry(() => fetchExternalData(), {
    maxRetries: 5,
    initialDelayMs: 500,
    backoffFactor: 1.5,
  });
  console.log(`Succeeded in ${attempts} attempt(s) — ${durationMs}ms`);
} catch (err) {
  if (err instanceof RetryError) {
    console.error(`Gave up after ${err.attempts} attempts: ${err.cause.message}`);
  }
}
```

---

## Circuit Breaker

The circuit breaker prevents cascading failures by short-circuiting calls to a failing service.

State machine: `CLOSED` → (failures ≥ threshold) → `OPEN` → (after reset timeout) → `HALF_OPEN` → (probe succeeds) → `CLOSED`.

### Configured on the client

```ts
const client = new HTTPBuilder()
  .withCircuitBreaker({
    failureThreshold: 5, // open after 5 consecutive failures
    resetTimeoutMs: 30_000, // attempt recovery after 30s
    onStateChange: (prev, next) => {
      metrics.gauge('circuit_breaker_state', next === 'OPEN' ? 1 : 0);
    },
  })
  .build();
```

When the breaker is open, requests throw `CircuitOpenError` immediately without hitting the network.

### Shared across clients

```ts
import { CircuitBreaker } from 'reixo';

const sharedBreaker = new CircuitBreaker({ failureThreshold: 3 });

const clientA = new HTTPBuilder().withCircuitBreaker(sharedBreaker).build();
const clientB = new HTTPBuilder().withCircuitBreaker(sharedBreaker).build();
// Both clients share breaker state — useful for microservice fan-out
```

---

## Request Cancellation

### Cancel by request ID

```ts
// requestWithId() resolves to { requestId, promise }
const { requestId, promise } = client.requestWithId('/slow-endpoint');

// Cancel before it completes
client.cancel(requestId);

try {
  await promise;
} catch (err) {
  if (err instanceof AbortError) {
    console.log('Cancelled');
  }
}
```

### Cancel all in-flight requests

```ts
client.cancelAll();
```

### Cancel via AbortController

```ts
const controller = new AbortController();

const req = client.get('/data', { signal: controller.signal });

// From outside (e.g. React useEffect cleanup)
controller.abort();
```

### Cancellable prefetch

```ts
// Prefetch on hover, cancel if the user leaves
const handle = client.prefetch('/api/product/42');

element.addEventListener('mouseleave', () => {
  if (!handle.completed) handle.cancel();
});
```

---

## Caching

### Strategies

```ts
const client = new HTTPBuilder()
  .withCache({
    ttl: 120_000, // 2 minutes
    strategy: 'stale-while-revalidate', // or 'cache-first', 'network-first', 'network-only'
    storage: 'memory', // or 'localStorage' (browser only)
    maxEntries: 200,
    invalidateOn: ['POST', 'PUT', 'PATCH', 'DELETE'],
  })
  .build();
```

| Strategy                 | Behaviour                                             |
| ------------------------ | ----------------------------------------------------- |
| `cache-first`            | Return cached data if available; fetch otherwise      |
| `stale-while-revalidate` | Return cached data immediately, refresh in background |
| `network-first`          | Fetch from network; fall back to cache on failure     |
| `network-only`           | Always fetch; never read from cache                   |

### Cache metadata

Responses served from cache include a `cacheMetadata` field:

```ts
const res = await client.get('/config');

if (res.cacheMetadata?.hit) {
  console.log(`Cache hit — ${res.cacheMetadata.age}s old, ${res.cacheMetadata.ttl}s remaining`);
  console.log(`Strategy: ${res.cacheMetadata.strategy}`);
}
```

### Manual cache control

```ts
// Optimistic update
await client.mutate('/users/1', { name: 'Bob' }, { name: 'Bob' });

// Invalidate a URL
await client.invalidate('/users');

// Read from cache without a network call
const cached = client.getQueryData<User>('/users/1');
```

---

## Interceptors

```ts
// Request interceptor
client.addRequestInterceptor(async (config) => {
  config.headers = {
    ...config.headers,
    'X-Request-ID': crypto.randomUUID(),
  };
  return config;
});

// Response interceptor
client.addResponseInterceptor(async (response) => {
  // Transform or validate the response
  return response;
});

// Remove interceptors
const id = client.addRequestInterceptor(myInterceptor);
client.removeRequestInterceptor(id);
```

---

## Auth Token Refresh

reixo's auth interceptor handles concurrent 401 responses correctly. When multiple requests fail with 401 simultaneously, only one token refresh is triggered — the rest queue and retry with the new token.

```ts
import { createAuthInterceptor } from 'reixo';

const authInterceptor = createAuthInterceptor(client, {
  getAccessToken: () => localStorage.getItem('access_token'),
  refreshTokens: async () => {
    const res = await client.post('/auth/refresh', {
      refreshToken: localStorage.getItem('refresh_token'),
    });
    localStorage.setItem('access_token', res.data.accessToken);
    return res.data.accessToken;
  },
  shouldRefresh: (err) => err instanceof HTTPError && err.status === 401,
  onAuthFailure: () => {
    window.location.href = '/login';
  },
});

client.addRequestInterceptor(authInterceptor);
```

---

## Request Queue & Offline Support

reixo includes a priority task queue for controlling concurrency and persisting requests across connectivity gaps.

```ts
const client = new HTTPBuilder()
  .withQueue({
    concurrency: 3,
    storage: 'localStorage', // persist across page reloads
  })
  .withOfflineSupport({ syncWithNetwork: true })
  .build();

// Requests made while offline are queued and replayed when the network returns
await client.post('/events', { type: 'click', timestamp: Date.now() });

client.on('queue:drain', () => console.log('All queued requests complete'));
client.on('queue:restored', (tasks) => {
  console.log(`Replaying ${tasks.length} offline requests`);
});
```

---

## Polling

```ts
import { poll } from 'reixo';

// Poll until a job is complete
const { promise, cancel } = poll(() => client.get<Job>('/jobs/42'), {
  interval: 2_000,
  timeout: 60_000,
  until: (res) => res.data.status === 'completed',
  // Adaptive interval: poll slowly at first, speed up near completion
  adaptiveInterval: (res) => (res.data.progress > 80 ? 500 : 3_000),
  onError: (err, attempts) => {
    console.warn(`Poll error (attempt ${attempts}):`, err);
    return attempts < 10; // stop after 10 errors
  },
});

const result = await promise;

// Cancel from outside if needed
setTimeout(cancel, 30_000);
```

---

## WebSocket Client

```ts
import { WebSocketClient } from 'reixo';

const ws = new WebSocketClient({
  url: 'wss://api.example.com/ws',
  reconnect: { maxRetries: 10, initialDelayMs: 1_000, backoffFactor: 1.5 },
  heartbeat: { interval: 30_000, message: 'ping', timeout: 5_000 },
});

ws.on('open', () => console.log('Connected'));
ws.on('message', (data) => console.log('Message:', data));
ws.on('reconnect', ({ attempt }) => console.log(`Reconnect attempt ${attempt}`));
ws.on('close', () => console.log('Disconnected'));
ws.on('error', (err) => console.error(err));

await ws.connect();
ws.send(JSON.stringify({ type: 'subscribe', channel: 'prices' }));

// Clean up
ws.disconnect();
```

---

## Server-Sent Events

```ts
import { SSEClient } from 'reixo';

const sse = new SSEClient({
  url: 'https://api.example.com/stream',
  headers: { Authorization: 'Bearer <token>' },
  reconnect: { maxRetries: 5, initialDelayMs: 1_000 },
});

sse.on('message', (event) => console.log(event.data));
sse.on('error', (err) => console.error(err));

sse.connect();
```

---

## GraphQL

```ts
import { GraphQLClient } from 'reixo';

const gql = new GraphQLClient('https://api.example.com/graphql', {
  headers: { Authorization: 'Bearer <token>' },
});

// Query
const { data } = await gql.query<{ user: User }>({
  query: `query GetUser($id: ID!) { user(id: $id) { id name email } }`,
  variables: { id: '1' },
});

// Mutation
const { data: created } = await gql.mutate<{ createUser: User }>({
  mutation: `mutation CreateUser($input: CreateUserInput!) {
    createUser(input: $input) { id name }
  }`,
  variables: { input: { name: 'Alice', email: 'alice@example.com' } },
});
```

---

## Logging

`ConsoleLogger` is a drop-in implementation of the `Logger` interface. Pass any object with `{ info, warn, error }` to use your own logger (winston, pino, etc.).

```ts
import { ConsoleLogger, LogLevel } from 'reixo';

// Text format — for development
const devLogger = new ConsoleLogger({
  level: LogLevel.DEBUG,
  prefix: '[MyApp:HTTP]',
  redactHeaders: ['Authorization', 'Cookie'],
});

// JSON format — for log aggregators (Datadog, Splunk, Loki)
const prodLogger = new ConsoleLogger({
  level: LogLevel.WARN,
  format: 'json',
  redactHeaders: ['Authorization', 'Cookie', 'X-Api-Key'],
});

const client = new HTTPBuilder().withLogger(prodLogger).build();
```

JSON output example:

```json
{
  "timestamp": "2026-03-13T18:00:00.000Z",
  "level": "WARN",
  "message": "[Reixo] Prefetch failed for /api/recommendations",
  "meta": { "status": 503 }
}
```

### Custom logger

```ts
import pino from 'pino';

const logger = pino();

const client = new HTTPBuilder()
  .withLogger({
    info: (msg, meta) => logger.info(meta, msg),
    warn: (msg, meta) => logger.warn(meta, msg),
    error: (msg, meta) => logger.error(meta, msg),
  })
  .build();
```

---

## Mock Adapter

`MockAdapter` intercepts requests at the transport layer. It is designed for unit tests — no real HTTP traffic is produced.

```ts
import { MockAdapter, HTTPClient, NetworkError, TimeoutError } from 'reixo';

const mock = new MockAdapter();
const client = new HTTPClient({ transport: mock.transport });

// Static reply
mock.onGet('/users').reply(200, [{ id: 1, name: 'Alice' }]);

// Callback handler — inspect the request and choose a response
mock.onPost('/users').reply((url, options) => {
  const body = JSON.parse(options.body as string);
  if (!body.email) return [422, { error: 'email is required' }];
  return [201, { id: 2, ...body }];
});

// One-off response (auto-removed after first match)
mock.onGet('/promo').replyOnce(200, { code: 'SUMMER10' });

// Simulate failures
mock.onGet('/flaky').networkError();
mock.onGet('/slow').timeout();

// HEAD and OPTIONS
mock.onHead('/resource').reply(200);
mock.onOptions('/resource').reply(200, null, { Allow: 'GET,POST' });

// Inspect request history
const history = mock.getHistory();
console.log(`${history.length} requests intercepted`);

// Reset all handlers
mock.reset();
```

---

## Testing

reixo ships with everything needed for unit testing HTTP-dependent code. No network, no nock, no MSW required (though all of those integrate cleanly too).

```ts
import { describe, it, expect, beforeEach } from 'vitest'; // or jest
import { MockAdapter, HTTPClient, HTTPError } from 'reixo';

let mock: MockAdapter;
let client: HTTPClient;

beforeEach(() => {
  mock = new MockAdapter();
  client = new HTTPClient({ transport: mock.transport });
});

it('fetches users', async () => {
  mock.onGet('/users').reply(200, [{ id: 1, name: 'Alice' }]);

  const res = await client.get<User[]>('/users');

  expect(res.status).toBe(200);
  expect(res.data).toHaveLength(1);
});

it('throws HTTPError on 404', async () => {
  mock.onGet('/users/999').reply(404, { error: 'Not found' });

  await expect(client.get('/users/999')).rejects.toThrow(HTTPError);
});

it('throws NetworkError on connectivity failure', async () => {
  mock.onGet('/data').networkError();

  await expect(client.get('/data')).rejects.toBeInstanceOf(NetworkError);
});
```

---

## Migration from axios

reixo's API is deliberately similar to axios. Most migrations are mechanical.

```ts
// Before (axios)
import axios from 'axios';

const api = axios.create({
  baseURL: 'https://api.example.com',
  timeout: 10000,
  headers: { Authorization: 'Bearer token' },
});

const res = await api.get('/users', { params: { page: 1 } });
console.log(res.data);

// After (reixo)
import { HTTPBuilder } from 'reixo';

const api = new HTTPBuilder()
  .withBaseURL('https://api.example.com')
  .withTimeout(10_000)
  .withHeader('Authorization', 'Bearer token')
  .build();

const res = await api.get('/users', { params: { page: 1 } });
console.log(res.data); // same shape
```

Key differences to be aware of:

- reixo throws on 4xx/5xx by default (same as axios) — no change needed.
- Error properties use `err.status` (not `err.response.status`) for HTTP errors.
- Interceptors use `addRequestInterceptor` / `addResponseInterceptor` instead of `interceptors.request.use`.
- Cancel tokens are replaced by `client.cancel(requestId)` or a standard `AbortController`.

---

## Migration from fetch

```ts
// Before (fetch)
const res = await fetch('https://api.example.com/users', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
  body: JSON.stringify({ name: 'Alice' }),
  signal: AbortSignal.timeout(10_000),
});

if (!res.ok) throw new Error(`HTTP ${res.status}`);
const data = await res.json();

// After (reixo)
const res = await client.post<User>('/users', { name: 'Alice' });
// data is parsed, errors throw automatically, timeout is configured at client level
const data = res.data;
```

---

## API Reference

### `HTTPBuilder`

Fluent builder that produces an `HTTPClient` instance.

| Method                                   | Description                                          |
| ---------------------------------------- | ---------------------------------------------------- |
| `.withBaseURL(url)`                      | Base URL prepended to every request path             |
| `.withTimeout(ms)`                       | Request timeout in milliseconds (default: 30000)     |
| `.withHeader(name, value)`               | Set a single default header                          |
| `.withHeaders(record)`                   | Set multiple default headers                         |
| `.withRetry(options)`                    | Retry policy applied to all requests                 |
| `.withCircuitBreaker(options\|instance)` | Circuit breaker configuration                        |
| `.withRateLimit(options)`                | Token-bucket rate limiter                            |
| `.withCache(options)`                    | Response caching configuration                       |
| `.withLogger(logger)`                    | Attach a logger implementing `{ info, warn, error }` |
| `.withConnectionPool(options)`           | HTTP connection pool settings                        |
| `.withQueue(options)`                    | Request queue settings                               |
| `.withRetryPolicies(policies)`           | Per-URL-pattern retry overrides                      |
| `.withVersioning(version, strategy)`     | API versioning (header or URL path)                  |
| `.addRequestInterceptor(fn)`             | Add a request interceptor                            |
| `.addResponseInterceptor(fn)`            | Add a response interceptor                           |
| `.build()`                               | Returns the configured `HTTPClient`                  |

### `HTTPClient`

| Method                               | Description                                            |
| ------------------------------------ | ------------------------------------------------------ |
| `.get<T>(url, options?)`             | GET request                                            |
| `.post<T>(url, data?, options?)`     | POST request                                           |
| `.put<T>(url, data?, options?)`      | PUT request                                            |
| `.patch<T>(url, data?, options?)`    | PATCH request                                          |
| `.delete<T>(url, options?)`          | DELETE request                                         |
| `.head(url, options?)`               | HEAD request                                           |
| `.options(url, options?)`            | OPTIONS request                                        |
| `.request<T>(url, options)`          | Generic request method                                 |
| `.cancel(requestId)`                 | Abort a specific in-flight request                     |
| `.cancelAll()`                       | Abort all in-flight requests                           |
| `.requestWithId<T>(url, options?)`   | Returns `{ requestId, promise }`                       |
| `.prefetch(url, options?)`           | Background prefetch; returns `{ cancel(), completed }` |
| `.mutate<T>(url, data, optimistic?)` | Optimistic update with cache write                     |
| `.invalidate(url)`                   | Invalidate cached responses for a URL                  |
| `.getQueryData<T>(url, params?)`     | Read from cache without a network call                 |
| `.dispose()`                         | Abort all requests and release resources               |

### Error Classes

| Class              | When thrown                                                                     |
| ------------------ | ------------------------------------------------------------------------------- |
| `HTTPError`        | Response status ≥ 400. Has `.status`, `.statusText`, `.config`, `.response`.    |
| `NetworkError`     | `fetch()` rejected (no connectivity, DNS failure, CORS). Has `.cause`.          |
| `TimeoutError`     | Request exceeded `timeoutMs`. Has `.timeoutMs`.                                 |
| `AbortError`       | Request was cancelled (via `AbortController` or `client.cancel()`).             |
| `CircuitOpenError` | Circuit breaker is OPEN.                                                        |
| `RetryError`       | `withRetry()` exhausted all attempts. Has `.attempts`, `.durationMs`, `.cause`. |
| `ValidationError`  | Response failed schema validation.                                              |

All classes are exported from the package root.

---

## Browser & Node.js Support

| Environment | Minimum version |
| ----------- | --------------- |
| Node.js     | 18              |
| Chrome      | 80              |
| Firefox     | 75              |
| Safari      | 14              |
| Edge        | 80              |

reixo uses native `fetch`, `AbortController`, `ReadableStream`, and `crypto.randomUUID()`. These are available natively in all supported environments without polyfills.

For older browsers, you can swap in a custom transport:

```ts
const client = new HTTPClient({ transport: myPolyfillTransport });
```

---

## Interactive Playground

An interactive playground is hosted on GitHub Pages at:

**[https://webcoderspeed.github.io/reixo/](https://webcoderspeed.github.io/reixo/)**

It runs fully in the browser against [JSONPlaceholder](https://jsonplaceholder.typicode.com) — no installation required. You can explore every major feature live: HTTP requests, error handling, retries, circuit breakers, caching, cancellation, polling, MockAdapter, logging, and metrics.

To run the playground locally:

```sh
# Build the browser bundle
npm run build:playground

# Serve the playground directory
npx serve playground
# → open http://localhost:3000
```

---

## Code Examples

Runnable TypeScript examples are in the [`examples/`](examples/) directory:

| File                          | Topic                                             |
| ----------------------------- | ------------------------------------------------- |
| `01-basic-requests.ts`        | GET, POST, PUT, PATCH, DELETE, HEAD               |
| `02-error-handling.ts`        | HTTPError, NetworkError, TimeoutError, AbortError |
| `03-retry-circuit-breaker.ts` | withRetry, RetryError, shared circuit breakers    |
| `04-caching.ts`               | cache-first, SWR, cacheMetadata, invalidation     |
| `05-interceptors.ts`          | Request/response interceptors, auth interceptor   |
| `06-cancellation.ts`          | cancel(id), cancelAll(), prefetch handles         |
| `07-polling.ts`               | until, adaptiveInterval, backoff, onError         |
| `08-mock-testing.ts`          | MockAdapter — unit testing without a server       |
| `09-logging.ts`               | ConsoleLogger levels, JSON format, redactHeaders  |
| `10-websocket.ts`             | WebSocketClient, heartbeat, reconnect             |
| `11-sse.ts`                   | SSEClient, named events, reconnect                |
| `12-graphql.ts`               | GraphQLClient queries, mutations, APQ             |
| `13-offline-queue.ts`         | Offline queue, network recovery                   |
| `14-metrics.ts`               | MetricsCollector, p95 latency, NetworkRecorder    |

Run any example directly:

```sh
npx tsx examples/01-basic-requests.ts
npx tsx examples/07-polling.ts
```

---

## Development

```sh
# Install dependencies
npm install

# Build (ESM + CJS + type declarations)
npm run build

# Build browser bundle for playground
npm run build:playground

# Run the test suite
npm test

# Type-check without emitting
npm run typecheck

# Lint
npm run lint
```

---

## Contributing

Bug reports, feature requests, and pull requests are welcome. Please open an issue first if you are planning a larger change so we can discuss approach.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow and commit conventions.

---

## License

[MIT](LICENSE) © [WebCoderSpeed](https://github.com/webcoderspeed)
