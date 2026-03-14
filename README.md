# reixo

<p align="center">
  <strong>The HTTP client that ships complete.</strong><br/>
  TypeScript-first &middot; Result&lt;T,E&gt; returns &middot; Retry &middot; Circuit breaker &middot; GraphQL &middot; WebSocket &middot; OTel
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/reixo"><img src="https://img.shields.io/npm/v/reixo" alt="npm version"/></a>
  <a href="https://www.npmjs.com/package/reixo"><img src="https://img.shields.io/npm/dm/reixo" alt="npm downloads"/></a>
  <a href="https://bundlephobia.com/package/reixo"><img src="https://img.shields.io/bundlephobia/minzip/reixo" alt="bundle size"/></a>
  <a href="https://github.com/webcoderspeed/reixo/actions/workflows/ci.yml"><img src="https://github.com/webcoderspeed/reixo/actions/workflows/ci.yml/badge.svg" alt="CI"/></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT"/></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.0%2B-blue" alt="TypeScript"/></a>
</p>

---

## The HTTP client setup you assemble on every project

```bash
# The axios route:
npm install axios
# ...then axios-retry for retry logic
# ...then axios-cache-interceptor for caching
# ...then discover circuit breaker doesn't exist
# ...then wrap everything in try/catch on every call
# ...then discover WebSocket, SSE, and GraphQL are not included

# The ky route:
npm install ky
# Browser-only by design. No circuit breaker, no offline queue,
# no GraphQL, no WebSocket, no Result<T,E>.

# Or:
npm install reixo
```

reixo ships **Result\<T,E\> returns · retry · circuit breaker · caching · request deduplication · offline queue · rate limiting · GraphQL · WebSocket · SSE · zero-dep OTel · infinite query · task queue · resumable upload** in one package — for Node.js 20+, Bun, Deno, Cloudflare Workers, Vercel Edge Runtime, and browsers. Zero extra installs.

```typescript
import { HTTPClient } from 'reixo';

const client = new HTTPClient({
  baseURL: 'https://api.example.com/v1',
  retry: true, // 3 retries, exponential backoff, 5xx / 429 / 408
  circuitBreaker: true, // open after 5 failures, reset after 30 s
  cacheConfig: true, // in-memory LRU, 5 min TTL
  enableDeduplication: true,
});

const result = await client.tryGet<User>('/users/1');
if (!result.ok) return handleError(result.error); // fully typed HTTPError
console.log(result.data.name); // TypeScript knows the type here
```

---

## Table of Contents

- [Why reixo?](#why-reixo)
- [Feature comparison](#feature-comparison)
- [Installation](#installation)
- [Quick start](#quick-start)
- [HTTPClient configuration](#httpclient-configuration)
- [Making requests](#making-requests)
- [Result API — no-throw error handling](#result-api--no-throw-error-handling)
- [Result utilities](#result-utilities)
- [Interceptors](#interceptors)
- [Retry](#retry)
  - [Per-URL retry policies](#per-url-retry-policies)
  - [withRetry standalone utility](#withretry-standalone-utility)
- [Circuit breaker](#circuit-breaker)
- [Caching](#caching)
  - [subscribe — observe URL data changes](#subscribe--observe-url-data-changes)
- [Request deduplication](#request-deduplication)
- [Rate limiting](#rate-limiting)
- [Offline queue](#offline-queue)
- [Progress tracking](#progress-tracking)
- [Metrics](#metrics)
- [Request cancellation](#request-cancellation)
- [Events](#events)
- [Fluent builder — HTTPBuilder](#fluent-builder--httpbuilder)
- [Authentication interceptor](#authentication-interceptor)
- [Trace interceptor](#trace-interceptor)
- [OpenTelemetry](#opentelemetry)
- [SSR / edge header forwarding](#ssr--edge-header-forwarding)
- [GraphQL client](#graphql-client)
- [WebSocket client](#websocket-client)
- [Server-Sent Events client](#server-sent-events-client)
- [Polling](#polling)
- [Pagination](#pagination)
- [Infinite query](#infinite-query)
- [Task queue](#task-queue)
- [Pipeline](#pipeline)
- [Resumable file upload](#resumable-file-upload)
- [Batch processor](#batch-processor)
- [Batch transport](#batch-transport)
- [Network recorder](#network-recorder)
- [Mock adapter](#mock-adapter)
- [Network monitor](#network-monitor)
- [Security utilities](#security-utilities)
- [ConsoleLogger](#consolelogger)
- [Timing utilities](#timing-utilities)
- [Runtime detection](#runtime-detection)
- [Error types](#error-types)
- [Complete configuration reference](#complete-configuration-reference)
- [Contributing](#contributing)
- [License](#license)

---

## Why reixo?

`fetch` doesn't retry. `axios` is synchronous-first and leaves resilience entirely to plugins. `ky` is browser-only. None of them give you a type-safe way to handle errors without try/catch.

reixo takes a different approach: **everything ships built-in, and errors are values — not exceptions.**

- **Result\<T,E\> by default** — `tryGet`, `tryPost`, etc. return `Ok | Err` discriminated unions; TypeScript enforces you handle both branches before accessing the data, removing entire classes of runtime errors
- **Resilience stack** — retry with exponential backoff, circuit breaker with half-open probing, rate limiter, and an offline queue — all configured in one place, none requiring separate packages
- **Request deduplication** — multiple simultaneous `GET` calls to the same URL share one network round-trip automatically
- **Built-in caching** — LRU memory cache, `localStorage`/`sessionStorage` adapters, three strategies (`cache-first`, `network-first`, `stale-while-revalidate`), and `revalidateOnFocus` / `revalidateOnReconnect` hooks
- **Real-time transports** — typed WebSocket client with reconnect + heartbeat, SSE client with named event types, all sharing the same retry/backoff interface
- **GraphQL client** — built on `HTTPClient`; supports queries, mutations, and Automatic Persisted Queries
- **Zero-dependency OTel** — W3C Traceparent support, custom span hooks, no OTEL SDK needed
- **Data utilities** — infinite query, cursor pagination, async generator page-iteration, priority task queue with persistence, sync and async pipelines
- **Developer ergonomics** — fluent `HTTPBuilder`, `MockAdapter` for tests, `NetworkRecorder` for fixture generation, `SecurityUtils` for log sanitisation
- **Universal** — runs unchanged on Node.js 20+, Bun, Deno, Cloudflare Workers, Vercel Edge Runtime, and browsers

---

## Feature comparison

| Feature                        | **reixo** |   axios   |   ky    | ofetch | got  |
| ------------------------------ | :-------: | :-------: | :-----: | :----: | :--: |
| TypeScript-first               |    yes    |  partial  |   yes   |  yes   | yes  |
| Result\<T,E\> / no-throw API   |    yes    |    no     |   no    |   no   |  no  |
| Retry (built-in)               |    yes    | plugin \* |   yes   |  yes   | yes  |
| Circuit breaker (built-in)     |    yes    |    no     |   no    |   no   |  no  |
| Request deduplication          |    yes    |    no     |   no    |   no   |  no  |
| Caching (built-in)             |    yes    | plugin \* |   no    |  yes   |  no  |
| Rate limiting (built-in)       |    yes    |    no     |   no    |   no   |  no  |
| Offline queue                  |    yes    |    no     |   no    |   no   |  no  |
| GraphQL client                 |    yes    |    no     |   no    |   no   |  no  |
| WebSocket client               |    yes    |    no     |   no    |   no   |  no  |
| SSE client                     |    yes    |    no     |   no    |   no   |  no  |
| OTel tracing (zero-dep)        |    yes    |    no     |   no    |   no   |  no  |
| Infinite query / pagination    |    yes    |    no     |   no    |   no   |  no  |
| Task queue with persistence    |    yes    |    no     |   no    |   no   |  no  |
| Resumable chunked upload       |    yes    |    no     |   no    |   no   |  no  |
| MockAdapter for tests          |    yes    | plugin \* |   no    |   no   |  no  |
| Node + Browser + Edge runtimes |    yes    |    yes    | browser |  yes   | node |

\* requires a separate third-party package

---

## Installation

```bash
npm install reixo
pnpm add reixo
yarn add reixo
bun add reixo
```

**Requirements:** TypeScript 5.0+, Node.js 20+

**Platforms:** Node.js 20+ · Bun · Deno · Cloudflare Workers · Vercel Edge Runtime · Browsers

No peer dependencies required.

---

## Quick start

```typescript
import { HTTPClient } from 'reixo';

const client = new HTTPClient({
  baseURL: 'https://api.example.com/v1',
  timeoutMs: 10_000,
  retry: true, // 3 retries, exponential backoff, retries on 5xx / 429 / 408
});

const response = await client.get<User>('/users/1');
console.log(response.data); // User
```

---

## HTTPClient configuration

```typescript
import { HTTPClient, ConsoleLogger, LogLevel } from 'reixo';

const client = new HTTPClient({
  baseURL: 'https://api.example.com/v1',
  timeoutMs: 15_000,
  headers: {
    Authorization: 'Bearer <token>',
    Accept: 'application/json',
  },
  retry: { maxRetries: 3, backoffFactor: 2, initialDelayMs: 500 },
  cacheConfig: { ttl: 30_000 },
  enableDeduplication: true,
  enableMetrics: true,
  rateLimit: { requests: 60, interval: 60_000 },
  circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30_000 },
  offlineQueue: true,
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
  logger: new ConsoleLogger(LogLevel.DEBUG),
});
```

---

## Making requests

All request methods are generic — the type parameter sets the type of `response.data`.

```typescript
// GET
const { data } = await client.get<User[]>('/users');

// GET with query parameters
const { data } = await client.get<User[]>('/users', {
  params: { role: 'admin', page: 1, limit: 20 },
});
// → GET /users?role=admin&page=1&limit=20

// POST
const { data: created } = await client.post<User>('/users', { name: 'Alice' });

// PUT
await client.put<User>('/users/1', { name: 'Alice Updated' });

// PATCH
await client.patch<User>('/users/1', { name: 'Alice Patched' });

// DELETE
await client.delete('/users/1');

// HEAD / OPTIONS
await client.head('/users');
await client.options('/users');
```

### Per-request options

```typescript
await client.post('/upload', formData, {
  timeoutMs: 60_000,
  headers: { 'X-Custom': 'value' },
  retry: false,
  signal: abortController.signal,
  onUploadProgress: ({ loaded, total, progress }) => {
    console.log(`${Math.round((progress ?? 0) * 100)}%`);
  },
});
```

### FormData helper

```typescript
import { objectToFormData } from 'reixo';

const form = objectToFormData({ name: 'Alice', avatar: fileBlob });
await client.post('/profile', form);
```

---

## Result API — no-throw error handling

Use the `try*` methods to receive a `Result<T, E>` instead of throwing on HTTP errors. TypeScript enforces you to handle both branches before accessing the data.

```typescript
const result = await client.tryGet<User>('/users/1');

if (!result.ok) {
  console.error(result.error.status); // fully typed HTTPError
  return;
}

console.log(result.data.name); // TypeScript knows data is User here
```

Available try-methods: `tryGet`, `tryPost`, `tryPut`, `tryPatch`, `tryDelete`, `tryRequest`.

---

## Result utilities

```typescript
import { ok, err, toResult, mapResult, unwrap, unwrapOr } from 'reixo';

// Construct
const success = ok({ id: 1, name: 'Alice' });
const failure = err(new Error('Something went wrong'));

// Wrap any promise — never throws
const result = await toResult(client.get<User>('/me'));
if (!result.ok) handleError(result.error);

// Transform the success value without unwrapping
const nameResult = mapResult(result, (r) => r.data.name);

// Unwrap — throws if result.ok === false
const data = unwrap(result);

// Unwrap with fallback — never throws
const data = unwrapOr(result, defaultUser);
```

---

## Interceptors

Interceptors run in push order (request) or reverse push order (response).

```typescript
// Request interceptor — inject auth header dynamically
client.interceptors.request.push({
  onFulfilled: (config) => ({
    ...config,
    headers: { ...config.headers, Authorization: `Bearer ${getToken()}` },
  }),
  onRejected: (error) => Promise.reject(error),
});

// Response interceptor — unwrap a data envelope or log errors
client.interceptors.response.push({
  onFulfilled: (response) => {
    response.data = (response.data as { payload: unknown }).payload;
    return response;
  },
  onRejected: (error) => {
    console.error('Request failed:', error);
    return Promise.reject(error);
  },
});
```

---

## Retry

Pass `true` for sensible defaults (3 retries, exponential backoff, retries on 5xx / 429 / 408 and network errors), `false` to disable, or a `RetryOptions` object for full control.

```typescript
const client = new HTTPClient({
  retry: {
    maxRetries: 5,
    initialDelayMs: 500,
    maxDelayMs: 30_000,
    backoffFactor: 2,
    jitter: true, // randomise delays to avoid thundering herd
    retryCondition: (error) => error.status >= 500,
    onRetry: (error, attempt) => {
      console.log(`Retry ${attempt}:`, error.message);
    },
  },
});
```

### Per-URL retry policies

The first matching pattern wins, overriding the global `retry` setting.

```typescript
const client = new HTTPClient({
  retry: true,
  retryPolicies: [
    { pattern: /\/auth\//, retry: false }, // never retry auth endpoints
    { pattern: '/api/upload', retry: { maxRetries: 1 } },
  ],
});
```

### withRetry standalone utility

```typescript
import { withRetry, RetryError } from 'reixo';

const data = await withRetry(() => fetch('/api/data'), {
  maxRetries: 3,
  initialDelayMs: 1000,
});
```

---

## Circuit breaker

Protects downstream services by stopping requests after a failure threshold is reached, then probing again after a reset timeout. States cycle: `CLOSED` (normal) → `OPEN` (rejecting) → `HALF_OPEN` (probing).

```typescript
import { CircuitBreaker } from 'reixo';

// Inline configuration — creates a CircuitBreaker automatically
const client = new HTTPClient({
  circuitBreaker: {
    failureThreshold: 5, // open after 5 consecutive failures
    resetTimeoutMs: 30_000, // try again after 30 s
    halfOpenRetries: 2, // require 2 consecutive successes to close
    fallback: async () => ({ data: cachedData }), // return when circuit is open
    onStateChange: (from, to) => {
      console.log(`Circuit breaker: ${from} → ${to}`);
    },
  },
});

// Shared instance — share state across multiple clients
const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 15_000 });
const clientA = new HTTPClient({ circuitBreaker: breaker });
const clientB = new HTTPClient({ circuitBreaker: breaker });
```

---

## Caching

```typescript
import { MemoryAdapter, WebStorageAdapter } from 'reixo';

// In-memory LRU cache with defaults
const client = new HTTPClient({ cacheConfig: true });

// Full options
const client = new HTTPClient({
  cacheConfig: {
    ttl: 60_000, // ms
    strategy: 'stale-while-revalidate', // 'cache-first' | 'network-first' | 'stale-while-revalidate'
    maxSize: 500,
    storage: new MemoryAdapter(200), // LRU with 200-entry cap
  },
});

// localStorage-backed (browser only)
const client = new HTTPClient({
  cacheConfig: {
    ttl: 300_000,
    storage: new WebStorageAdapter('local'), // 'local' | 'session'
  },
});

// Revalidate stale data on window focus or network reconnect
const client = new HTTPClient({
  cacheConfig: { ttl: 30_000 },
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
});
```

### subscribe — observe URL data changes

```typescript
// Callback fires whenever the cached value for this URL is revalidated
const unsubscribe = client.subscribe('/api/users', (data) => {
  console.log('Users updated:', data);
});

unsubscribe(); // stop observing
```

---

## Request deduplication

Multiple simultaneous GET requests to the same URL share one network call. Useful in data-loading patterns where multiple components request the same resource.

```typescript
const client = new HTTPClient({ enableDeduplication: true });

// Only one network request is made, all three callers receive the same result
const [a, b, c] = await Promise.all([
  client.get('/users/1'),
  client.get('/users/1'),
  client.get('/users/1'),
]);
```

`buildDedupKey` and `RequestDeduplicator` are also exported for use in custom transports.

---

## Rate limiting

Token-bucket limiter applied globally before every outgoing request. Callers that exceed the limit wait in a FIFO queue.

```typescript
const client = new HTTPClient({
  rateLimit: { requests: 60, interval: 60_000 }, // 60 req / min
});
```

---

## Offline queue

Buffers requests made while the device is offline and replays them automatically when connectivity is restored.

```typescript
// In-memory queue with automatic replay
const client = new HTTPClient({ offlineQueue: true });

// Persistent queue — survives page reloads, auto-pauses when offline
const client = new HTTPClient({
  offlineQueue: {
    concurrency: 3,
    storage: 'local', // 'memory' | 'local' | 'session' | StorageAdapter
    storageKey: 'my-queue',
    syncWithNetwork: true, // auto-pause / resume on network changes
  },
});
```

---

## Progress tracking

```typescript
// Per-request upload progress
await client.post('/upload', fileData, {
  onUploadProgress: ({ loaded, total, progress }) => {
    const pct = Math.round((progress ?? 0) * 100);
    console.log(`Upload: ${pct}%`);
  },
});

// Per-request download progress
await client.get('/large-file', {
  onDownloadProgress: ({ loaded, total }) => {
    console.log(`Downloaded ${loaded} of ${total ?? '?'} bytes`);
  },
});

// Global progress handlers applied to all requests
const client = new HTTPClient({
  onUploadProgress: ({ loaded }) => console.log(`+${loaded} bytes uploaded`),
  onDownloadProgress: ({ progress }) => console.log(progress),
});
```

---

## Metrics

```typescript
const client = new HTTPClient({
  enableMetrics: true,
  onMetricsUpdate: (m) => {
    console.log(`Requests: ${m.requestCount}, Errors: ${m.errorCount}`);
  },
});

// Get a snapshot at any time
const snap = client.getMetrics();
// snap.requestCount, snap.errorCount, snap.totalLatency,
// snap.minLatency, snap.maxLatency, snap.averageLatency
```

---

## Request cancellation

```typescript
// Cancel all in-flight requests (e.g. component unmount)
client.cancelAll();

// Cancel a specific request by its ID
const { requestId, response } = client.requestWithId('/api/data');
client.cancel(requestId); // returns true if found and cancelled

// Standard AbortSignal
const controller = new AbortController();
client.get('/api/data', { signal: controller.signal });
controller.abort();

// Register cleanup callbacks
client.onCleanup(() => console.log('cleanup'));
client.dispose(); // cancels all requests, triggers cleanup callbacks
```

---

## Events

`HTTPClient` extends `EventEmitter` and emits the following typed events.

```typescript
client.on('request:start', ({ url, method, requestId }) => {});
client.on('response:success', ({ url, method, status, requestId, duration }) => {});
client.on('response:error', ({ url, method, error, requestId, duration }) => {});
client.on('upload:progress', ({ url, loaded, total, progress }) => {});
client.on('download:progress', ({ url, loaded, total, progress }) => {});
client.on('cache:revalidate', ({ url, key, data }) => {});
client.on('focus', () => {}); // window focused
client.on('online', () => {}); // network reconnected
```

---

## Fluent builder — HTTPBuilder

`HTTPBuilder` is a chainable builder that produces an `HTTPClient`. Every `with*` method mirrors a field in `HTTPClientConfig`.

```typescript
import { HTTPBuilder } from 'reixo';

const client = new HTTPBuilder()
  .withBaseURL('https://api.example.com/v1')
  .withTimeout(10_000)
  .withHeaders({ Accept: 'application/json' })
  .withRetry({ maxRetries: 3, backoffFactor: 2 })
  .withCache({ ttl: 30_000 })
  .withRateLimit(60, 60_000)
  .withCircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 30_000 })
  .withDeduplication()
  .withMetrics()
  .withLogger(new ConsoleLogger(LogLevel.DEBUG))
  .withOTel({ endpoint: 'https://otel.example.com/v1/traces', serviceName: 'my-api' })
  .withApiVersion('v2', 'url')
  .withSSL({ rejectUnauthorized: true, ca: caCert })
  .withOfflineQueue({ storage: 'local', syncWithNetwork: true })
  .build();
```

---

## Authentication interceptor

Injects a Bearer token on every request and automatically refreshes it when the server returns 401, then retries the original request.

```typescript
import { createAuthInterceptor } from 'reixo';

createAuthInterceptor(client, {
  getAccessToken: async () => localStorage.getItem('token') ?? '',
  refreshTokens: async () => {
    const res = await fetch('/auth/refresh', { method: 'POST' });
    const { accessToken } = await res.json();
    localStorage.setItem('token', accessToken);
  },
  onRefreshFailed: (error) => {
    console.error('Token refresh failed, redirecting to login', error);
    window.location.href = '/login';
  },
});
```

---

## Trace interceptor

Injects a unique trace ID header into every outgoing request for distributed tracing and log correlation.

```typescript
import { createTraceInterceptor } from 'reixo';

client.interceptors.request.push(
  createTraceInterceptor({
    headerName: 'X-Correlation-ID', // default: 'x-request-id'
    generateId: () => crypto.randomUUID(),
  })
);

// Defaults are fine for most cases
client.interceptors.request.push(createTraceInterceptor());
```

---

## OpenTelemetry

Zero-dependency W3C Traceparent / OpenTelemetry tracing — no OTEL SDK required.

```typescript
import { HTTPBuilder, formatTraceparent, parseTraceparent } from 'reixo';

const client = new HTTPBuilder()
  .withOTel({
    endpoint: 'https://otel-collector.example.com/v1/traces',
    serviceName: 'my-api',
    onSpanStart: (span) => {
      console.log('Span started:', span.traceId);
    },
    onSpanEnd: (span, response) => {
      console.log(`Span ${span.traceId} ended in ${span.duration}ms`);
    },
  })
  .build();

// W3C Traceparent header helpers
const header = formatTraceparent({
  traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
  spanId: '00f067aa0ba902b7',
  flags: '01',
});

const ctx = parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
// { version: '00', traceId: '...', spanId: '...', flags: '01' }
```

---

## SSR / edge header forwarding

Forward select headers (cookies, auth tokens, correlation IDs) from the incoming server request to outgoing upstream calls — works with any framework.

```typescript
import { createSSRInterceptor } from 'reixo';

// Next.js App Router
client.interceptors.request.push(
  createSSRInterceptor(
    () => Object.fromEntries(headers()), // next/headers
    ['Cookie', 'Authorization', 'X-Request-ID'] // optional whitelist; omit to forward all
  )
);

// Express
client.interceptors.request.push(createSSRInterceptor(() => req.headers));
```

---

## GraphQL client

Built on top of `HTTPClient`. Supports queries, mutations, and Automatic Persisted Queries (APQ).

```typescript
import { GraphQLClient } from 'reixo';

const gql = new GraphQLClient('https://api.example.com/graphql', {
  headers: { Authorization: 'Bearer <token>' },
  enablePersistedQueries: false, // set true to enable APQ
});

// Query
const { data, errors } = await gql.query<{ user: User }>(
  `query GetUser($id: ID!) {
    user(id: $id) { id name email }
  }`,
  { id: '1' }
);

// Mutation
const { data: created } = await gql.mutate<{ createUser: User }>(
  `mutation CreateUser($input: CreateUserInput!) {
    createUser(input: $input) { id name }
  }`,
  { input: { name: 'Alice', email: 'alice@example.com' } }
);

// Access the underlying HTTPClient (interceptors, events, etc.)
gql.client.interceptors.request.push(/* ... */);
```

---

## WebSocket client

Full-featured WebSocket wrapper with automatic reconnection, heartbeat keep-alive, and typed events.

```typescript
import { WebSocketClient } from 'reixo';

const ws = new WebSocketClient({
  url: 'wss://api.example.com/ws',
  protocols: 'json', // or string[] for multiple
  autoConnect: true, // default: true
  reconnect: {
    maxRetries: 10,
    initialDelayMs: 1_000,
    maxDelayMs: 30_000,
    backoffFactor: 2,
  },
  heartbeat: {
    interval: 30_000, // send ping every 30 s
    message: 'ping', // string or object (auto-JSON-serialised)
    timeout: 5_000, // close socket if no reply within 5 s
  },
});

ws.on('open', (e) => console.log('Connected'));
ws.on('message', (e) => console.log(JSON.parse(e.data)));
ws.on('error', (e) => console.error('WS error:', e));
ws.on('close', (e) => console.log('Closed:', e.code));
ws.on('reconnect', (n) => console.log(`Reconnect attempt #${n}`));
ws.on('reconnect:fail', (err) => console.error('Gave up reconnecting:', err));

ws.send('hello');
ws.sendJson({ type: 'subscribe', channel: 'prices' });
ws.close(1000, 'done');
```

---

## Server-Sent Events client

```typescript
import { SSEClient } from 'reixo';

const sse = new SSEClient({
  url: 'https://api.example.com/events',
  withCredentials: true,
  reconnect: { maxRetries: 5, initialDelayMs: 1_000 },
  // headers only work with fetch-based SSE polyfills
  headers: { Authorization: 'Bearer <token>' },
});

sse.on('open', (e) => console.log('Connected'));
sse.on('message', (e) => console.log(e.data));
sse.on('error', (e) => console.error(e));
sse.on('reconnect', (n) => console.log(`Reconnect attempt #${n}`));
sse.on('reconnect:fail', (e) => console.error('Gave up:', e));

// Named event types (server sends `event: user.created`)
sse.addEventListener('user.created', (e) => console.log(JSON.parse(e.data)));
sse.removeEventListener('user.created', handler);

sse.close();
```

---

## Polling

```typescript
import { poll, PollingController } from 'reixo';

// Simple helper — returns { promise, cancel }
const { promise, cancel } = poll(() => client.get<JobStatus>('/jobs/42'), {
  interval: 2_000,
  until: (res) => res.data.status === 'done',
  timeout: 120_000,
});

const result = await promise;

// Adaptive interval — slow then fast as job nears completion
const { promise } = poll(() => client.get<Job>('/jobs/123'), {
  interval: 5_000,
  until: (res) => res.data.status === 'completed',
  adaptiveInterval: (res) => (res.data.progress < 80 ? 5_000 : 1_000),
  timeout: 60_000,
});

// Exponential backoff
const { promise, cancel } = poll(fetchStatus, {
  interval: 1_000,
  backoff: { factor: 1.5, maxInterval: 30_000 },
  until: (res) => res.data.done,
});

// Bounded attempts with error handling
const { promise } = poll(fetchStatus, {
  interval: 2_000,
  maxAttempts: 20,
  onError: (error, attempts) => {
    if (attempts > 5) return false; // stop polling and re-throw
    // anything else continues
  },
});

// Low-level controller
const controller = new PollingController(task, options);
await controller.start();
controller.stop();
const signal = controller.signal; // AbortSignal
```

---

## Pagination

Async generator that automatically fetches subsequent pages.

```typescript
import { paginate } from 'reixo';

for await (const page of paginate<User>(client, '/users', {
  pageParam: 'page',
  limitParam: 'limit',
  limit: 20,
  initialPage: 1,
  resultsPath: 'data', // dot-path to the array in the response, e.g. 'meta.items'
})) {
  console.log('Page:', page); // User[]
}

// Custom stop condition
for await (const page of paginate<Post>(client, '/posts', {
  limit: 50,
  stopCondition: (response, items, totalFetched) => totalFetched >= 200,
})) {
  processPosts(page);
}
```

---

## Infinite query

Cursor-based or page-number-based infinite scrolling.

```typescript
import { InfiniteQuery } from 'reixo';

const query = new InfiniteQuery<PostsPage>({
  client,
  url: '/posts',
  initialPageParam: 1,
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? null,
  getPreviousPageParam: (firstPage) => firstPage.prevCursor ?? null,
});

// Load first page
await query.fetchNextPage();
console.log(query.data.pages); // PostsPage[]
console.log(query.hasNextPage); // boolean

// Keep loading forward
while (query.hasNextPage) {
  await query.fetchNextPage();
}

// Load a previous page (requires getPreviousPageParam)
if (query.hasPreviousPage) {
  await query.fetchPreviousPage();
}

// Status flags
query.isFetching;
query.isFetchingNextPage;
query.isFetchingPreviousPage;
query.error; // null or the thrown error

// Cancel the in-flight fetch
query.abort();

// Reset all state
query.reset();
```

---

## Task queue

Priority queue with concurrency control, dependency graph, optional persistence, and network-aware auto-pause.

```typescript
import { TaskQueue } from 'reixo';

const queue = new TaskQueue({
  concurrency: 3,
  autoStart: true,
  storage: 'local', // 'memory' | 'local' | 'session' | StorageAdapter
  storageKey: 'upload-queue',
  syncWithNetwork: true, // auto-pause when offline, resume when online
});

// Add tasks
const result = await queue.add(() => client.post('/upload', file), {
  priority: 10, // higher number runs first
  id: 'upload-photo',
  dependencies: ['auth'], // wait for the 'auth' task to complete first
  data: { filename: 'photo.jpg' }, // serialisable metadata (persisted)
});

// Cancel a pending task
const cancelled = queue.cancel('upload-photo'); // returns boolean

// Pause / resume
queue.pause();
queue.resume();

// Wait for all tasks to finish
await queue.drain();

// Inspect
console.log(queue.size); // pending tasks
console.log(queue.active); // running tasks
console.log(queue.isQueuePaused);

// Async iterator
for await (const result of queue) {
  console.log('Task completed:', result);
  if (doneCondition) break;
}

// Events
queue.on('task:start', ({ id }) => {});
queue.on('task:completed', ({ id, result }) => {});
queue.on('task:error', ({ id, error }) => {});
queue.on('task:added', ({ id, priority }) => {});
queue.on('task:cancelled', ({ id }) => {});
queue.on('queue:drain', () => {});
queue.on('queue:paused', () => {});
queue.on('queue:resumed', () => {});
queue.on('queue:cleared', () => {});
queue.on('queue:restored', (metadata) => {
  // Rebuild task functions from persisted metadata
});
```

---

## Pipeline

Chainable, fully type-safe data transformation — synchronous and async.

```typescript
import { Pipeline, AsyncPipeline } from 'reixo';

// Synchronous
const process = Pipeline.from<string>()
  .map((s) => s.trim())
  .map((s) => s.toUpperCase())
  .tap((s) => console.log('Processing:', s))
  .map((s) => ({ value: s, length: s.length }));

const result = process.execute('  hello world  ');
// { value: 'HELLO WORLD', length: 11 }

// Asynchronous
const fetchAndTransform = AsyncPipeline.from<string>()
  .map(async (userId) => client.get<User>(`/users/${userId}`))
  .map((response) => response.data)
  .tap(async (user) => console.log('Fetched:', user.name));

const user = await fetchAndTransform.execute('42');
```

---

## Resumable file upload

Chunked upload with parallel chunk support, progress tracking, and abort capability.

```typescript
import { ResumableUploader } from 'reixo';

const uploader = new ResumableUploader(client);

const result = await uploader.upload('/upload', file, {
  chunkSize: 5 * 1024 * 1024, // 5 MB chunks
  parallel: 3, // upload 3 chunks concurrently
  onProgress: ({ loaded, total, progress, chunk, totalChunks }) => {
    console.log(`${Math.round(progress * 100)}% — chunk ${chunk}/${totalChunks}`);
  },
});

// Abort mid-upload
uploader.abort();
```

---

## Batch processor

Groups many individual async calls into batched executions to reduce round-trips.

```typescript
import { BatchProcessor } from 'reixo';

const batcher = new BatchProcessor<string, User>(
  async (userIds) => {
    const res = await client.post<User[]>('/users/batch', { ids: userIds });
    return res.data;
  },
  {
    maxSize: 50, // flush when 50 items are queued
    maxDelayMs: 20, // or after 20 ms — whichever comes first
  }
);

// Individual callers — automatically batched behind the scenes
const [alice, bob] = await Promise.all([batcher.add('user-1'), batcher.add('user-2')]);
```

---

## Batch transport

Wraps any transport function to automatically batch eligible requests.

```typescript
import { createBatchTransport } from 'reixo';

const batchedTransport = createBatchTransport(defaultTransport, {
  maxSize: 20,
  maxDelayMs: 50,
  shouldBatch: (url) => url.startsWith('/api/items'),
  executeBatch: async (items) => {
    const res = await fetch('/api/batch', {
      method: 'POST',
      body: JSON.stringify(items.map((i) => ({ url: i.url }))),
    });
    return res.json(); // must return HTTPResponse[] in same order
  },
});

const client = new HTTPClient({ transport: batchedTransport });
```

---

## Network recorder

Records HTTP traffic during a session — useful for generating test fixtures and debugging.

```typescript
import { NetworkRecorder } from 'reixo';

const recorder = new NetworkRecorder(client); // attaches interceptors automatically

recorder.start();

await client.get('/users');
await client.post('/users', { name: 'Alice' });

recorder.stop();

const records = recorder.getRecords();
// [{ id, timestamp, url, method, requestHeaders, requestBody, status, responseBody, duration }, ...]

// Generate test fixture JSON
const fixtures = recorder.generateFixtures();
// [{ url, method, status, response }, ...]

recorder.clear();

// Manually inject a fixture
recorder.record({
  url: '/users/1',
  method: 'GET',
  status: 200,
  duration: 42,
  requestHeaders: {},
  requestBody: null,
  responseHeaders: {},
  responseBody: { id: 1, name: 'Alice' },
});
```

---

## Mock adapter

Stub HTTP responses in tests without making real network calls.

```typescript
import { MockAdapter } from 'reixo';

const mock = new MockAdapter();

// Static responses
mock.onGet('/users').reply(200, [{ id: 1, name: 'Alice' }]);
mock.onPost('/users').reply(201, { id: 2, name: 'Bob' });
mock.onDelete('/users/1').reply(204);

// Dynamic response
mock.onGet('/users/:id').reply((config) => {
  const id = config.url?.split('/').pop();
  return [200, { id, name: 'User ' + id }];
});

// Simulate an error
mock.onGet('/flaky').reply(500, { message: 'Server error' });

// Simulate a network error
mock.onGet('/offline').networkError();

// Simulate latency
mock.onGet('/slow').reply(200, data, {}, { latency: 500 });

const client = new HTTPClient({ transport: mock.transport });

// Clear all stubs
mock.reset();
```

---

## Network monitor

Reactive online/offline detection. Uses `window` browser events by default; optional active HEAD-ping polling for Node.js or restricted environments.

```typescript
import { NetworkMonitor } from 'reixo';

// Shared singleton
const monitor = NetworkMonitor.getInstance();

monitor.on('online', () => console.log('Back online'));
monitor.on('offline', () => console.log('Gone offline'));

console.log(monitor.online); // current status (boolean)

// Active polling — useful in Node.js or behind strict corporate firewalls
monitor.configure({
  pingUrl: 'https://health.example.com/ping', // default: '/favicon.ico'
  checkInterval: 30_000,
});

// Isolated instance (useful for tests)
const m = new NetworkMonitor({ checkInterval: 10_000 });
m.destroy(); // clean up timers and listeners
NetworkMonitor.resetInstance(); // reset the singleton
```

---

## Security utilities

Sanitise sensitive headers and body fields before they appear in logs.

```typescript
import { SecurityUtils } from 'reixo';

const safeHeaders = SecurityUtils.sanitizeHeaders({
  Authorization: 'Bearer eyJhbGciOiJ...',
  'Content-Type': 'application/json',
  Cookie: 'session=abc123',
});
// { Authorization: '[REDACTED]', 'Content-Type': 'application/json', Cookie: '[REDACTED]' }

const safeBody = SecurityUtils.sanitizeBody({
  username: 'alice',
  password: 'secret123',
  creditCard: '4111111111111111',
});
// { username: 'alice', password: '[REDACTED]', creditCard: '[REDACTED]' }
```

---

## ConsoleLogger

Pluggable logger that implements the `Logger` interface expected by `HTTPClient`.

```typescript
import { ConsoleLogger, LogLevel } from 'reixo';

// Development — human-readable, debug level, redact auth headers
const logger = new ConsoleLogger({
  level: LogLevel.DEBUG,
  format: 'text',
  prefix: '[MyApp:HTTP]',
  redactHeaders: ['Authorization', 'Cookie', 'X-Api-Key'],
});

// Production — structured JSON, warnings and above only
const logger = new ConsoleLogger({
  level: LogLevel.WARN,
  format: 'json',
  redactHeaders: ['Authorization', 'Cookie'],
});

// Short form (level only, defaults to text format)
const logger = new ConsoleLogger(LogLevel.DEBUG);

const client = new HTTPClient({ logger });
```

Log levels: `NONE = 0`, `ERROR = 1`, `WARN = 2`, `INFO = 3`, `DEBUG = 4`.

---

## Timing utilities

Available as static methods on `HTTPClient` and as standalone named exports.

```typescript
import { debounce, throttle, delay } from 'reixo';
// or: HTTPClient.debounce, HTTPClient.throttle, HTTPClient.delay

// Debounce — execute at most once per delay window
const handleSearch = debounce(
  (query: string) => client.get('/search', { params: { q: query } }),
  300
);

// Throttle — execute at most once per interval
const trackEvent = throttle((event: AnalyticsEvent) => client.post('/analytics', event), 1_000);

// Delay — promisified setTimeout
await delay(500);
```

---

## Runtime detection

```typescript
import { detectRuntime, getRuntimeCapabilities, isBrowser, isNode, isEdgeRuntime } from 'reixo';

const runtime = detectRuntime();
// 'browser' | 'node' | 'bun' | 'deno' | 'workerd' | 'edge-light' | 'fastly' | 'unknown'

const caps = getRuntimeCapabilities();
// {
//   name: 'node',
//   hasFetch: true,
//   hasStreams: true,
//   hasCrypto: true,
//   hasXHR: false,
//   hasNodeErrorCodes: true,
//   hasHTTP2: true,
// }

if (isBrowser()) console.log('Running in a browser');
if (isNode()) console.log('Running in Node.js');
if (isEdgeRuntime()) console.log('Running on Cloudflare Workers / Vercel Edge / Fastly');
```

---

## Error types

```typescript
import { HTTPError, AbortError, ValidationError } from 'reixo';

try {
  await client.get('/api');
} catch (error) {
  if (error instanceof HTTPError) {
    console.log(error.status); // HTTP status code (number)
    console.log(error.response); // raw Response object
    console.log(error.message); // human-readable description
  }
  if (error instanceof AbortError) {
    console.log('Request was cancelled');
  }
  if (error instanceof ValidationError) {
    console.log('Request configuration is invalid:', error.message);
  }
}
```

---

## Complete configuration reference

### HTTPClientConfig

```typescript
interface HTTPClientConfig {
  // Core
  baseURL?: string;
  timeoutMs?: number; // default: 30000
  headers?: HeadersWithSuggestions;
  transport?: HTTPRequestFunction;
  logger?: Logger;

  // Resilience
  retry?: RetryOptions | boolean; // default: true
  retryPolicies?: Array<{ pattern: string | RegExp; retry: RetryOptions | boolean }>;
  circuitBreaker?: CircuitBreakerOptions | CircuitBreaker;

  // Performance
  rateLimit?: { requests: number; interval: number };
  cacheConfig?: CacheOptions | boolean;
  revalidateOnFocus?: boolean; // default: false
  revalidateOnReconnect?: boolean; // default: false
  enableDeduplication?: boolean; // default: false

  // Observability
  enableMetrics?: boolean;
  onMetricsUpdate?: (metrics: Metrics) => void;

  // Offline
  offlineQueue?: boolean | PersistentQueueOptions;

  // Progress
  onUploadProgress?: (p: { loaded: number; total: number | null; progress: number | null }) => void;
  onDownloadProgress?: (p: {
    loaded: number;
    total: number | null;
    progress: number | null;
  }) => void;

  // API versioning
  apiVersion?: string;
  versioningStrategy?: 'url' | 'header'; // default: 'url'
  versionHeader?: string; // default: 'Accept-Version'

  // Node.js-specific
  pool?: ConnectionPoolOptions;
  ssl?: {
    rejectUnauthorized?: boolean;
    ca?: string | Buffer | Array<string | Buffer>;
    cert?: string | Buffer | Array<string | Buffer>;
    key?: string | Buffer | Array<string | Buffer>;
    passphrase?: string;
  };
}
```

### RetryOptions

```typescript
interface RetryOptions {
  maxRetries?: number; // default: 3
  initialDelayMs?: number; // default: 1000
  maxDelayMs?: number; // default: 30000
  backoffFactor?: number; // default: 2
  jitter?: boolean; // default: false
  retryCondition?: (error: HTTPError) => boolean;
  onRetry?: (error: HTTPError, attempt: number) => void;
}
```

### CircuitBreakerOptions

```typescript
interface CircuitBreakerOptions {
  failureThreshold?: number; // default: 5
  resetTimeoutMs?: number; // default: 60000
  halfOpenRetries?: number; // default: 1
  fallback?: () => Promise<unknown>;
  onStateChange?: (from: string, to: string) => void;
}
```

### CacheOptions

```typescript
interface CacheOptions {
  ttl?: number; // ms; default: 300000
  strategy?: 'cache-first' | 'network-first' | 'stale-while-revalidate';
  maxSize?: number; // max entries; default: 1000
  storage?: StorageAdapter; // MemoryAdapter | WebStorageAdapter | custom
}
```

### PollingOptions

```typescript
interface PollingOptions<T> {
  interval: number;
  timeout?: number;
  maxAttempts?: number;
  until?: (data: T) => boolean;
  stopCondition?: (data: T) => boolean; // deprecated, prefer until
  adaptiveInterval?: (data: T) => number;
  onError?: (error: unknown, attempts: number) => boolean | void;
  backoff?: boolean | { factor: number; maxInterval: number };
}
```

### WebSocketConfig

```typescript
interface WebSocketConfig {
  url: string;
  protocols?: string | string[];
  reconnect?: boolean | RetryOptions; // true = 5 retries, exponential backoff
  heartbeat?: {
    interval: number;
    message?: string | object; // default: 'ping'
    timeout?: number;
  };
  autoConnect?: boolean; // default: true
}
```

### SSEConfig

```typescript
interface SSEConfig {
  url: string;
  withCredentials?: boolean; // default: false
  reconnect?: boolean | RetryOptions; // true = 5 retries, exponential backoff
  headers?: HeadersRecord; // only supported with fetch-based polyfills
}
```

---

## Contributing

Pull requests are welcome. For major changes, open an issue first to discuss what you'd like to change.

```bash
git clone https://github.com/webcoderspeed/reixo.git
cd reixo
npm install
npm run test       # run the test suite
npm run typecheck  # TypeScript checks
npm run lint:check # linting
npm run build      # compile to dist/
```

All commits must follow [Conventional Commits](https://www.conventionalcommits.org/) — use `npm run commit` for the interactive prompt.

---

## License

MIT
