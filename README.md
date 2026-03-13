# reixo

A TypeScript-first HTTP client for Node.js, browsers, and edge runtimes. Handles retries, circuit breaking, request deduplication, OpenTelemetry tracing, typed error returns, offline queuing, caching, auth token refresh, and more — so your application code stays focused on business logic.

[![npm version](https://img.shields.io/npm/v/reixo)](https://www.npmjs.com/package/reixo)
[![npm downloads](https://img.shields.io/npm/dm/reixo)](https://www.npmjs.com/package/reixo)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/reixo)](https://bundlephobia.com/package/reixo)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue)](https://www.typescriptlang.org/)
[![CI](https://github.com/webcoderspeed/reixo/actions/workflows/ci.yml/badge.svg)](https://github.com/webcoderspeed/reixo)

---

## Why reixo?

The native `fetch` API is low-level. Common tasks — timeouts, retries, error normalisation, token refresh, distributed tracing, request deduplication — require boilerplate that gets duplicated across every project. `axios` fills some gaps but leaves the hard parts (circuit breaking, typed errors, offline queuing, OpenTelemetry, Result-style error handling) to third-party plugins or custom code.

reixo bundles all of those patterns into one cohesive, zero-dependency library:

- **No-throw `Result<T, E>` API.** `tryGet`, `tryPost`, etc. return `Ok | Err` instead of throwing. No `try/catch` tax.
- **W3C OpenTelemetry tracing.** Inject `traceparent`, `tracestate`, and `baggage` headers out of the box — no `@opentelemetry/*` packages needed.
- **In-flight request deduplication.** Concurrent identical GET requests collapse into one network round-trip — zero duplicated calls.
- **Smart transient-error detection.** `isTransientNetworkError()` understands `ETIMEDOUT`, `ECONNRESET`, browser `Failed to fetch`, and more across every runtime.
- **Runtime detection.** Know at runtime whether you're in Node.js, Bun, Deno, Cloudflare Workers, Vercel Edge, or a browser.
- **Zero `any` types.** Strict TypeScript throughout. `HeadersRecord`, `JsonValue`, `BodyData` — every boundary is typed.
- **Typed error classes.** `instanceof HTTPError | NetworkError | TimeoutError | AbortError | CircuitOpenError` — no string matching.
- **First-class resilience.** Retry with exponential backoff, circuit breaker, and token-bucket rate limiting are config options, not add-ons.
- **No runtime dependencies.** Core relies only on the platform's native `fetch` and `AbortController`.
- **Dual ESM + CJS output.** Works in Node.js 18+, modern browsers, edge runtimes, and server-side rendering.

---

## Table of Contents

- [reixo](#reixo)
  - [Why reixo?](#why-reixo)
  - [Table of Contents](#table-of-contents)
  - [Installation](#installation)
  - [Quick Start](#quick-start)
  - [Configuration](#configuration)
  - [Making Requests](#making-requests)
    - [HTTP Methods](#http-methods)
    - [Query Parameters](#query-parameters)
    - [Uploading Files](#uploading-files)
    - [Response Streaming](#response-streaming)
    - [Generating a cURL Command](#generating-a-curl-command)
  - [Result API — No-Throw Error Handling](#result-api--no-throw-error-handling)
    - [Chaining with `mapResult`](#chaining-with-mapresult)
    - [`unwrap` / `unwrapOr`](#unwrap--unwrapor)
    - [`toResult` — wrap any existing Promise](#toresult--wrap-any-existing-promise)
    - [Building Results manually](#building-results-manually)
  - [Error Handling — Try/Catch Style](#error-handling--trycatch-style)
  - [Retries](#retries)
    - [Per-client default](#per-client-default)
    - [Per-request override](#per-request-override)
    - [Standalone `withRetry` utility](#standalone-withretry-utility)
  - [Circuit Breaker](#circuit-breaker)
    - [Shared breaker across clients](#shared-breaker-across-clients)
  - [Request Deduplication](#request-deduplication)
    - [Standalone `RequestDeduplicator`](#standalone-requestdeduplicator)
  - [OpenTelemetry Tracing](#opentelemetry-tracing)
    - [Zero-config](#zero-config)
    - [Service name and custom baggage](#service-name-and-custom-baggage)
    - [Continuing a parent trace](#continuing-a-parent-trace)
    - [Span lifecycle hooks](#span-lifecycle-hooks)
    - [Low-level helpers](#low-level-helpers)
  - [Network Error Classification](#network-error-classification)
  - [Runtime Detection](#runtime-detection)
  - [Request Cancellation](#request-cancellation)
    - [Cancel by request ID](#cancel-by-request-id)
    - [Cancel all in-flight requests](#cancel-all-in-flight-requests)
    - [Cancel via `AbortController`](#cancel-via-abortcontroller)
    - [Cancellable prefetch](#cancellable-prefetch)
  - [Caching](#caching)
    - [Cache metadata](#cache-metadata)
    - [Manual cache control](#manual-cache-control)
  - [Interceptors](#interceptors)
  - [Auth Token Refresh](#auth-token-refresh)
  - [Offline Queue](#offline-queue)
  - [Polling](#polling)
  - [WebSocket Client](#websocket-client)
  - [Server-Sent Events](#server-sent-events)
  - [GraphQL](#graphql)
  - [Logging](#logging)
    - [Custom logger (pino, winston, etc.)](#custom-logger-pino-winston-etc)
  - [Mock Adapter](#mock-adapter)
  - [Testing](#testing)
  - [API Reference](#api-reference)
    - [`HTTPBuilder` — Fluent Builder](#httpbuilder--fluent-builder)
    - [`HTTPClient` — Request Methods](#httpclient--request-methods)
    - [Error Classes](#error-classes)
    - [Result Utilities](#result-utilities)
    - [OTel Utilities](#otel-utilities)
    - [Network Error Utilities](#network-error-utilities)
    - [Deduplication Utilities](#deduplication-utilities)
    - [Runtime Utilities](#runtime-utilities)
  - [Migration from axios](#migration-from-axios)
  - [Migration from fetch](#migration-from-fetch)
  - [Runtime Support](#runtime-support)
  - [Code Examples](#code-examples)
  - [Development](#development)
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

// Throwing style — HTTPError thrown on 4xx/5xx
const response = await client.get<User[]>('/users');
console.log(response.data); // User[]

// No-throw style — Result<T, E> returned instead of throwing
const result = await client.tryGet<User[]>('/users');
if (result.ok) {
  console.log(result.data.data); // User[]
} else {
  console.error(result.error.status); // HTTPError.status
}
```

---

## Configuration

`HTTPBuilder` provides a fluent API that covers every option in `HTTPClientConfig`.

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
  .withRateLimit({ requests: 20, interval: 1_000 })
  .withCache({
    ttl: 60_000,
    strategy: 'cache-first',
  })
  .withDeduplication() // collapse concurrent identical GETs
  .withOpenTelemetry({ serviceName: 'my-service' }) // W3C trace headers
  .withLogger(new ConsoleLogger({ level: LogLevel.WARN, format: 'json' }))
  .build();
```

You can also construct `HTTPClient` directly with a plain config object:

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

```ts
// Flat params
client.get('/items', { params: { page: 2, limit: 50 } });
// → /items?page=2&limit=50

// Arrays (repeated keys)
client.get('/items', { params: { tags: ['js', 'ts'] } });
// → /items?tags=js&tags=ts

// Nested objects (bracket notation)
client.get('/items', { params: { filter: { status: 'active' } } });
// → /items?filter%5Bstatus%5D=active

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

### Generating a cURL Command

```ts
const curl = client.generateCurl('/users/1', {
  headers: { Authorization: 'Bearer token' },
});
// → curl -X GET 'https://api.example.com/users/1' -H 'Authorization: Bearer token'
```

---

## Result API — No-Throw Error Handling

The `try*` methods return a `Result<T, E>` discriminated union instead of throwing. This is the recommended style for code paths where errors are expected and handled inline.

```ts
import { ok, err, toResult, mapResult, unwrap, unwrapOr } from 'reixo';

// tryGet / tryPost / tryPut / tryPatch / tryDelete — never throw
const result = await client.tryGet<Post>('/posts/1');

if (result.ok) {
  console.log(result.data.data.title); // Post
} else {
  console.error(result.error.status); // HTTPError.status
}
```

### Chaining with `mapResult`

```ts
// Transform the payload without leaving the Result context
const titleResult = mapResult(
  await client.tryGet<Post>('/posts/1'),
  (res) => res.data.title // HTTPResponse<Post> → string
);

if (titleResult.ok) console.log(titleResult.data); // string
```

### `unwrap` / `unwrapOr`

```ts
// unwrap — throws if Err (use when you're certain it succeeds)
const res = unwrap(await client.tryGet<Post>('/posts/1'));

// unwrapOr — returns a fallback on Err (never throws)
const post = unwrapOr(await client.tryGet<Post>('/posts/1'), { id: 0, title: 'Unknown' });
```

### `toResult` — wrap any existing Promise

```ts
// Wrap any Promise-based API into Result
const result = await toResult(client.get<Post>('/posts/1'));
```

### Building Results manually

```ts
function parseJson(raw: string): Result<unknown, Error> {
  try {
    return ok(JSON.parse(raw));
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
```

---

## Error Handling — Try/Catch Style

When you prefer the throwing style, reixo throws specific, typed error classes:

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
  } else if (err instanceof TimeoutError) {
    console.error(`Timed out after ${err.timeoutMs}ms`);
  } else if (err instanceof AbortError) {
    console.warn('Request was cancelled');
  } else if (err instanceof CircuitOpenError) {
    console.warn('Circuit breaker is open — using fallback');
  } else if (err instanceof NetworkError) {
    console.error('Network failure:', err.message);
  } else if (err instanceof RetryError) {
    // Only surfaced when calling withRetry() directly
    console.error(`Gave up after ${err.attempts} attempts`);
  }
}
```

`HTTPClient` methods automatically unwrap `RetryError`. When retry is configured on the client, `client.get()` throws the original error (`HTTPError`, `NetworkError`, etc.) — not `RetryError`. `RetryError` is only surfaced when calling `withRetry()` directly.

---

## Retries

### Per-client default

```ts
const client = new HTTPBuilder()
  .withRetry({
    maxRetries: 3,
    initialDelayMs: 100,
    backoffFactor: 2,
    jitter: true, // ±50% jitter to spread concurrent retries
    maxDelayMs: 10_000,
    retryCondition: (err) => {
      if (err instanceof NetworkError) return true; // always retry transport failures
      if (err instanceof HTTPError) return err.status >= 500 || err.status === 429;
      return false;
    },
    onRetry: (err, attempt, delayMs) => {
      console.log(`Retry #${attempt} in ${delayMs}ms`);
    },
  })
  .build();
```

The default `retryCondition` (when not overridden) retries: reixo's own `NetworkError`, any error matching `isTransientNetworkError()` (ETIMEDOUT, ECONNRESET, etc.), HTTP 5xx responses, HTTP 429, and HTTP 408.

### Per-request override

```ts
// Disable retry for this specific request
await client.get('/idempotent', { retry: false });

// Override per request
await client.post('/payment', body, {
  retry: { maxRetries: 1, retryCondition: () => false },
});
```

### Standalone `withRetry` utility

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

Prevents cascading failures by short-circuiting calls to a failing service.

State machine: `CLOSED` → (failures ≥ threshold) → `OPEN` → (after reset timeout) → `HALF_OPEN` → (probe succeeds) → `CLOSED`.

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

### Shared breaker across clients

```ts
import { CircuitBreaker } from 'reixo';

const sharedBreaker = new CircuitBreaker({ failureThreshold: 3 });

const clientA = new HTTPBuilder().withCircuitBreaker(sharedBreaker).build();
const clientB = new HTTPBuilder().withCircuitBreaker(sharedBreaker).build();
// Both clients share breaker state — useful for microservice fan-out
```

---

## Request Deduplication

When multiple callers request the same URL simultaneously, reixo fires only **one** network request and shares the same Promise with all waiters. All callers get the identical result when it resolves or rejects.

```ts
const client = new HTTPBuilder()
  .withBaseURL('https://api.example.com')
  .withDeduplication() // GET, HEAD, OPTIONS are deduplicated by default
  .build();

// Five simultaneous calls → one network request
const [r1, r2, r3, r4, r5] = await Promise.all([
  client.get('/config'),
  client.get('/config'),
  client.get('/config'),
  client.get('/config'),
  client.get('/config'),
]);
// All five receive the same response — one round-trip

// Opt out per request
await client.get('/live-price', { deduplicate: false });
```

### Standalone `RequestDeduplicator`

Use it outside of HTTP requests — deduplicate any async operation:

```ts
import { RequestDeduplicator, buildDedupKey, DEDUP_SAFE_METHODS } from 'reixo';

const dedup = new RequestDeduplicator();

// Collapse 5 concurrent calls into 1 execution
const results = await Promise.all(
  Array.from({ length: 5 }, () =>
    dedup.deduplicate(buildDedupKey('GET', '/api/users'), () => fetchFromDatabase())
  )
);

console.log(dedup.stats()); // { inflight: 0, savedRequests: 4 }
console.log([...DEDUP_SAFE_METHODS]); // ['GET', 'HEAD', 'OPTIONS']
```

---

## OpenTelemetry Tracing

reixo implements the [W3C Trace Context](https://www.w3.org/TR/trace-context/) spec (`traceparent`, `tracestate`, `baggage`) natively — **no `@opentelemetry/*` packages required**.

### Zero-config

```ts
const client = new HTTPBuilder()
  .withBaseURL('https://api.example.com')
  .withOpenTelemetry() // auto-generates a fresh trace per request
  .build();

// Every outgoing request carries:
//   traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
```

### Service name and custom baggage

```ts
const client = new HTTPBuilder()
  .withOpenTelemetry({
    serviceName: 'checkout-service',
    baggage: {
      'user.tier': 'premium',
      env: 'production',
    },
  })
  .build();
// baggage: service.name=checkout-service,user.tier=premium,env=production
```

### Continuing a parent trace

```ts
import { parseTraceparent } from 'reixo';

// Extract from an incoming request header (e.g. in Express / Hono / Next.js)
const parentCtx = parseTraceparent(req.headers['traceparent']);

const client = new HTTPBuilder()
  .withOpenTelemetry({
    parentContext: parentCtx ?? undefined, // continues the upstream trace
    serviceName: 'checkout-service',
  })
  .build();
// All outgoing requests share the same traceId — one distributed trace
```

### Span lifecycle hooks

```ts
const client = new HTTPBuilder()
  .withOpenTelemetry({
    hooks: {
      onSpanStart(ctx) {
        myTelemetry.startSpan(ctx.traceId, ctx.spanId, ctx.url);
      },
      onSpanEnd(ctx) {
        myTelemetry.finishSpan(ctx.spanId, ctx.status);
      },
    },
  })
  .build();
```

### Low-level helpers

```ts
import { parseTraceparent, formatTraceparent } from 'reixo';

const ctx = parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
// { traceId: '4bf92f...', spanId: '00f067...', traceFlags: 1 }
// Returns null for invalid or malformed values

const header = formatTraceparent({ traceId: '...', spanId: '...', traceFlags: 1 });
// '00-...-...-01'
```

---

## Network Error Classification

`isTransientNetworkError` and `classifyNetworkError` work across Node.js, Bun, Deno, Cloudflare Workers, and browsers — no runtime-specific branching needed.

```ts
import {
  isTransientNetworkError,
  isTimeoutError,
  isDnsError,
  classifyNetworkError,
  TRANSIENT_NETWORK_CODES,
} from 'reixo';

// True for ETIMEDOUT, ECONNRESET, ENOTFOUND, 'Failed to fetch', etc.
isTransientNetworkError(error);

// Specific checks
isTimeoutError(error); // ETIMEDOUT, TimeoutError
isDnsError(error); // ENOTFOUND, EAI_AGAIN

// Structured classification for logging / telemetry
const kind = classifyNetworkError(error);
// 'timeout' | 'dns' | 'connection_refused' | 'connection_reset'
// | 'network_unavailable' | 'other_transient' | 'non_transient'

// The full set of recognised error codes
console.log([...TRANSIENT_NETWORK_CODES]);
// ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', ...]
```

---

## Runtime Detection

```ts
import { detectRuntime, getRuntimeCapabilities, isNode, isBrowser, isEdgeRuntime } from 'reixo';

const runtime = detectRuntime();
// 'node' | 'bun' | 'deno' | 'workerd' | 'edge-light' | 'fastly' | 'browser' | 'unknown'

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

// Convenience booleans
if (isNode()) {
  /* Node.js or Bun */
}
if (isBrowser()) {
  /* browser context */
}
if (isEdgeRuntime()) {
  /* Vercel Edge, Cloudflare Workers */
}
```

---

## Request Cancellation

### Cancel by request ID

```ts
const { requestId, promise } = client.requestWithId('/slow-endpoint');

// Cancel before it completes
client.cancel(requestId);

try {
  await promise;
} catch (err) {
  if (err instanceof AbortError) console.log('Cancelled');
}
```

### Cancel all in-flight requests

```ts
client.cancelAll();
```

### Cancel via `AbortController`

```ts
const controller = new AbortController();

const req = client.get('/data', { signal: controller.signal });

// From outside (e.g. React useEffect cleanup)
controller.abort();
```

### Cancellable prefetch

```ts
const handle = client.prefetch('/api/product/42');

element.addEventListener('mouseleave', () => {
  if (!handle.completed) handle.cancel();
});
```

---

## Caching

```ts
const client = new HTTPBuilder()
  .withCache({
    ttl: 120_000, // 2 minutes
    strategy: 'stale-while-revalidate', // or 'cache-first' | 'network-first' | 'network-only'
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

```ts
const res = await client.get('/config');

if (res.cacheMetadata?.hit) {
  console.log(`Cache hit — ${res.cacheMetadata.age}s old, ${res.cacheMetadata.ttl}s remaining`);
}
```

### Manual cache control

```ts
// Optimistic update
await client.mutate('/users/1', { name: 'Bob' }, { name: 'Bob' });

// Invalidate
await client.invalidate('/users');

// Read from cache without a network call
const cached = client.getQueryData<User>('/users/1');
```

---

## Interceptors

```ts
// Request interceptor — run before the request is sent
client.addRequestInterceptor(async (config) => {
  config.headers = {
    ...config.headers,
    'X-Request-ID': crypto.randomUUID(),
  };
  return config;
});

// Response interceptor — run after the response is received
client.addResponseInterceptor(async (response) => {
  return response;
});

// Remove by ID
const id = client.addRequestInterceptor(myInterceptor);
client.removeRequestInterceptor(id);
```

---

## Auth Token Refresh

reixo handles concurrent 401 responses correctly. When multiple requests fail with 401 simultaneously, only one token refresh is triggered — the rest queue and retry with the new token.

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

## Offline Queue

Requests made while offline are persisted and replayed automatically when connectivity returns.

```ts
const client = new HTTPBuilder()
  .withOfflineQueue({
    storage: 'localStorage', // persist across page reloads
    maxSize: 100,
  })
  .build();

// Works transparently — queue fills while offline, drains on reconnect
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

const { promise, cancel } = poll(() => client.get<Job>('/jobs/42'), {
  interval: 2_000,
  timeout: 60_000,
  until: (res) => res.data.status === 'completed',
  adaptiveInterval: (res) => (res.data.progress > 80 ? 500 : 3_000),
  onError: (err, attempts) => {
    console.warn(`Poll error (attempt ${attempts}):`, err);
    return attempts < 10; // continue polling
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

await ws.connect();
ws.send(JSON.stringify({ type: 'subscribe', channel: 'prices' }));

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

```ts
import { ConsoleLogger, LogLevel } from 'reixo';

// Plain text — for development
const devLogger = new ConsoleLogger({
  level: LogLevel.DEBUG,
  prefix: '[MyApp:HTTP]',
  redactHeaders: ['Authorization', 'Cookie'],
});

// JSON — for log aggregators (Datadog, Splunk, Loki)
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

### Custom logger (pino, winston, etc.)

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

`MockAdapter` intercepts requests at the transport layer — no real HTTP traffic produced.

```ts
import { MockAdapter, HTTPClient, NetworkError } from 'reixo';

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

// One-off (auto-removed after first match)
mock.onGet('/promo').replyOnce(200, { code: 'SUMMER10' });

// Simulate failures
mock.onGet('/flaky').networkError();
mock.onGet('/slow').timeout();

// Inspect request history
console.log(`${mock.getHistory().length} requests intercepted`);

// Reset all handlers
mock.reset();
```

---

## Testing

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { MockAdapter, HTTPClient, HTTPError, NetworkError } from 'reixo';

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

it('returns Err on 404 (Result style)', async () => {
  mock.onGet('/users/999').reply(404, { error: 'Not found' });
  const result = await client.tryGet('/users/999');
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.status).toBe(404);
});

it('throws NetworkError on connectivity failure', async () => {
  mock.onGet('/data').networkError();
  await expect(client.get('/data')).rejects.toBeInstanceOf(NetworkError);
});
```

---

## API Reference

### `HTTPBuilder` — Fluent Builder

| Method                                     | Description                                          |
| ------------------------------------------ | ---------------------------------------------------- |
| `.withBaseURL(url)`                        | Base URL prepended to every request path             |
| `.withTimeout(ms)`                         | Request timeout in milliseconds (default: 30 000)    |
| `.withHeader(name, value)`                 | Set a single default header                          |
| `.withHeaders(record)`                     | Set multiple default headers                         |
| `.withRetry(options \| boolean)`           | Retry policy for all requests                        |
| `.withCircuitBreaker(options \| instance)` | Circuit breaker configuration                        |
| `.withRateLimit({ requests, interval })`   | Token-bucket rate limiter                            |
| `.withCache(options \| boolean)`           | Response caching                                     |
| `.withDeduplication(enabled?)`             | Collapse concurrent identical GET/HEAD/OPTIONS       |
| `.withOpenTelemetry(config?)`              | W3C traceparent/tracestate/baggage injection         |
| `.withOfflineQueue(options \| boolean)`    | Persist requests while offline                       |
| `.withRevalidation(options)`               | Revalidate on focus/reconnect                        |
| `.withLogger(logger)`                      | Attach a logger implementing `{ info, warn, error }` |
| `.withCircuitBreaker(options \| instance)` | Circuit breaker                                      |
| `.withConnectionPool(options)`             | HTTP connection pool settings                        |
| `.withRetryPolicies(policies)`             | Per-URL-pattern retry overrides                      |
| `.withVersioning(version, strategy)`       | API versioning (header or URL path)                  |
| `.addRequestInterceptor(fn)`               | Add a request interceptor                            |
| `.addResponseInterceptor(fn)`              | Add a response interceptor                           |
| `.build()`                                 | Returns the configured `HTTPClient`                  |

### `HTTPClient` — Request Methods

| Method                               | Returns                                       | Description                              |
| ------------------------------------ | --------------------------------------------- | ---------------------------------------- |
| `.get<T>(url, options?)`             | `Promise<HTTPResponse<T>>`                    | GET request                              |
| `.post<T>(url, data?, options?)`     | `Promise<HTTPResponse<T>>`                    | POST request                             |
| `.put<T>(url, data?, options?)`      | `Promise<HTTPResponse<T>>`                    | PUT request                              |
| `.patch<T>(url, data?, options?)`    | `Promise<HTTPResponse<T>>`                    | PATCH request                            |
| `.delete<T>(url, options?)`          | `Promise<HTTPResponse<T>>`                    | DELETE request                           |
| `.head(url, options?)`               | `Promise<HTTPResponse<T>>`                    | HEAD request                             |
| `.options(url, options?)`            | `Promise<HTTPResponse<T>>`                    | OPTIONS request                          |
| `.request<T>(url, options)`          | `Promise<HTTPResponse<T>>`                    | Generic request                          |
| `.tryGet<T>(url, options?)`          | `Promise<Result<HTTPResponse<T>, HTTPError>>` | GET — never throws                       |
| `.tryPost<T>(url, data?, options?)`  | `Promise<Result<HTTPResponse<T>, HTTPError>>` | POST — never throws                      |
| `.tryPut<T>(url, data?, options?)`   | `Promise<Result<HTTPResponse<T>, HTTPError>>` | PUT — never throws                       |
| `.tryPatch<T>(url, data?, options?)` | `Promise<Result<HTTPResponse<T>, HTTPError>>` | PATCH — never throws                     |
| `.tryDelete<T>(url, options?)`       | `Promise<Result<HTTPResponse<T>, HTTPError>>` | DELETE — never throws                    |
| `.tryRequest<T>(url, options?)`      | `Promise<Result<HTTPResponse<T>, HTTPError>>` | Generic — never throws                   |
| `.cancel(requestId)`                 | `boolean`                                     | Abort a specific in-flight request       |
| `.cancelAll()`                       | `void`                                        | Abort all in-flight requests             |
| `.requestWithId<T>(url, options?)`   | `{ requestId, promise }`                      | Named cancellable request                |
| `.prefetch(url, options?)`           | `{ cancel(), completed }`                     | Background prefetch                      |
| `.mutate<T>(url, data, optimistic?)` | `Promise<HTTPResponse<T>>`                    | Optimistic update with cache write       |
| `.invalidate(url)`                   | `Promise<void>`                               | Invalidate cached responses              |
| `.getQueryData<T>(url, params?)`     | `T \| null`                                   | Read from cache without a network call   |
| `.generateCurl(url, options?)`       | `string`                                      | Generate cURL command string             |
| `.dispose()`                         | `void`                                        | Abort all requests and release resources |

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

### Result Utilities

| Export                       | Description                                        |
| ---------------------------- | -------------------------------------------------- |
| `ok(data)`                   | Construct an `Ok<T>` result                        |
| `err(error)`                 | Construct an `Err<E>` result                       |
| `toResult(promise)`          | Wrap any Promise into `Result<T, E>`               |
| `mapResult(result, fn)`      | Transform `data` inside an `Ok` without unwrapping |
| `unwrap(result)`             | Return `data` or throw the error                   |
| `unwrapOr(result, fallback)` | Return `data` or a fallback value (never throws)   |

### OTel Utilities

| Export                           | Description                                                 |
| -------------------------------- | ----------------------------------------------------------- |
| `createOTelInterceptor(config?)` | Request interceptor that injects W3C trace headers          |
| `parseTraceparent(value)`        | Parse a `traceparent` header string → `SpanContext \| null` |
| `formatTraceparent(ctx)`         | Serialise a `SpanContext` → `traceparent` header string     |

### Network Error Utilities

| Export                           | Description                                               |
| -------------------------------- | --------------------------------------------------------- |
| `isTransientNetworkError(error)` | `true` for ETIMEDOUT, ECONNRESET, 'Failed to fetch', etc. |
| `isTimeoutError(error)`          | `true` for timeout-specific errors                        |
| `isDnsError(error)`              | `true` for ENOTFOUND, EAI_AGAIN                           |
| `classifyNetworkError(error)`    | Returns `NetworkErrorClass` string for logging            |
| `TRANSIENT_NETWORK_CODES`        | `ReadonlySet<string>` of recognised transient error codes |

### Deduplication Utilities

| Export                              | Description                                     |
| ----------------------------------- | ----------------------------------------------- |
| `RequestDeduplicator`               | Class — deduplicates any async operation by key |
| `buildDedupKey(method, url, body?)` | Build a stable deduplication key                |
| `DEDUP_SAFE_METHODS`                | `Set<'GET' \| 'HEAD' \| 'OPTIONS'>`             |

### Runtime Utilities

| Export                     | Description                                |
| -------------------------- | ------------------------------------------ |
| `detectRuntime()`          | Returns `RuntimeName` string               |
| `getRuntimeCapabilities()` | Returns `RuntimeCapabilities` object       |
| `isNode()`                 | `true` in Node.js or Bun                   |
| `isBrowser()`              | `true` in browser context                  |
| `isEdgeRuntime()`          | `true` in Vercel Edge / Cloudflare Workers |

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

Key differences:

- Error properties use `err.status` (not `err.response.status`) for HTTP errors.
- Interceptors use `addRequestInterceptor` / `addResponseInterceptor` instead of `interceptors.request.use`.
- Cancel tokens are replaced by `client.cancel(requestId)` or a standard `AbortController`.
- `tryGet` / `tryPost` etc. offer a no-throw alternative if you prefer `Result<T, E>`.

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
// data is parsed, errors throw automatically, timeout is at client level
const data = res.data;
```

---

## Runtime Support

| Environment         | Minimum version |
| ------------------- | --------------- |
| Node.js             | 18              |
| Bun                 | 1.0             |
| Deno                | 1.28            |
| Cloudflare Workers  | All             |
| Vercel Edge Runtime | All             |
| Chrome              | 80              |
| Firefox             | 75              |
| Safari              | 14              |
| Edge                | 80              |

reixo uses native `fetch`, `AbortController`, `ReadableStream`, and `crypto.getRandomValues()`. These are available natively in all supported environments without polyfills.

For older browsers, swap in a custom transport:

```ts
const client = new HTTPClient({ transport: myPolyfillTransport });
```

---

## Code Examples

Runnable TypeScript examples are in the [`examples/`](examples/) directory:

| File                          | Topic                                             |
| ----------------------------- | ------------------------------------------------- |
| `01-basic-requests.ts`        | GET, POST, PUT, PATCH, DELETE, HEAD, query params |
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
| `12-graphql.ts`               | GraphQLClient queries, mutations                  |
| `13-offline-queue.ts`         | Offline queue, network recovery                   |
| `14-metrics.ts`               | MetricsCollector, p95 latency, NetworkRecorder    |
| `15-result-api.ts`            | tryGet/tryPost, ok/err, mapResult, unwrap         |
| `16-opentelemetry.ts`         | withOpenTelemetry, traceparent, baggage, hooks    |
| `17-deduplication.ts`         | withDeduplication, RequestDeduplicator, stats     |

Run any example:

```sh
npx tsx examples/15-result-api.ts
npx tsx examples/16-opentelemetry.ts
npx tsx examples/17-deduplication.ts
```

---

## Development

```sh
# Install dependencies
npm install

# Build (ESM + CJS + type declarations)
npm run build

# Run the full test suite (323 tests)
npm test

# Type-check without emitting
npm run typecheck

# Lint
npm run lint
```

---

## Contributing

Bug reports, feature requests, and pull requests are welcome. Please open an issue first if you are planning a larger change so we can discuss the approach.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow and commit conventions.

---

## License

[MIT](LICENSE) © [WebCoderSpeed](https://github.com/webcoderspeed)
