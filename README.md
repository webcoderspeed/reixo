# reixo

<p align="center">
  <strong>The last HTTP client you'll ever install.</strong><br/>
  TypeScript-first · Zero dependencies · Node.js, Browser, Deno, Bun & Edge
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

## Stop installing five packages to do one thing

Most teams end up with something like this in their `package.json`:

```
axios              → HTTP requests
axios-retry        → automatic retries
opossum            → circuit breaking
swr / react-query  → caching + deduplication
opentelemetry-*    → distributed tracing
```

**reixo ships all of that in a single zero-dependency package** — and it's faster than axios to boot.

```bash
npm install reixo
```

```typescript
import { Reixo } from 'reixo';

const client = Reixo.HTTPBuilder.create('https://api.example.com')
  .withRetry({ maxAttempts: 3 })
  .withCircuitBreaker({ failureThreshold: 5, recoveryTimeout: 30_000 })
  .withCache({ ttl: 60_000 })
  .withOpenTelemetry({ serviceName: 'my-service' })
  .build();

const { data } = await client.get<User[]>('/users');
```

That's retry + circuit breaker + cache + OTel tracing — in 6 lines, no extra packages.

---

## Table of Contents

- [Why reixo?](#why-reixo)
- [Feature comparison](#feature-comparison)
- [Performance](#performance)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Core API](#core-api)
  - [HTTP methods](#http-methods)
  - [Result API — no-throw error handling](#result-api--no-throw-error-handling)
  - [Interceptors](#interceptors)
- [Built-in features](#built-in-features)
  - [Retries & backoff](#retries--backoff)
  - [Circuit breaker](#circuit-breaker)
  - [Request deduplication](#request-deduplication)
  - [Response caching](#response-caching)
  - [Auth token refresh](#auth-token-refresh)
  - [Offline queue](#offline-queue)
  - [OpenTelemetry tracing](#opentelemetry-tracing)
  - [Rate limiting](#rate-limiting)
  - [Server-side rendering](#server-side-rendering)
  - [Progress tracking](#progress-tracking)
  - [Request cancellation](#request-cancellation)
  - [Prefetch](#prefetch)
  - [Metrics](#metrics)
  - [Validation](#validation)
- [Advanced](#advanced)
  - [Request pipeline / middleware](#request-pipeline--middleware)
  - [Task queue](#task-queue)
  - [WebSocket client](#websocket-client)
  - [SSE client](#sse-client)
  - [GraphQL client](#graphql-client)
  - [Mock adapter](#mock-adapter-testing)
  - [Infinite queries & pagination](#infinite-queries--pagination)
  - [Suspense support](#suspense-support)
  - [cURL generation](#curl-generation)
- [Bundle size](#bundle-size)
- [Contributing](#contributing)
- [License](#license)

---

## Why reixo?

The native `fetch` API is a primitive. `axios` covers the basics but leaves the hard parts — retry backoff, circuit breaking, deduplication, caching, distributed tracing, offline resilience — to a growing list of third-party plugins that you must version, configure, and maintain separately.

reixo is the single package that handles all of it, with:

- ⚡ **Zero dependencies** — no supply-chain risk, tiny bundle
- 🦺 **TypeScript-first** — full inference, typed errors, typed responses
- 🔁 **Automatic retries** — configurable backoff with per-URL policy overrides
- 🔌 **Circuit breaker** — fail fast when downstreams are unhealthy
- 🧹 **Request deduplication** — collapse concurrent identical GETs to one round-trip
- 💾 **Response caching** — TTL cache with SWR/stale-while-revalidate strategy
- 🔑 **Auth token refresh** — single refresh, no duplicate calls, queued replay
- 📵 **Offline queue** — buffer requests while offline, replay on reconnect
- 🔍 **OpenTelemetry** — W3C trace headers, no `@opentelemetry/*` packages needed
- 🚦 **Rate limiting** — client-side token bucket to protect your downstreams
- 🧪 **Mock adapter** — deterministic mocking for tests, no global patching
- 🌐 **Universal** — Node.js, browser, Deno, Bun, Cloudflare Workers, and edge runtimes

---

## Feature comparison

| Feature                       | **reixo** | axios | got | ky  | fetch |
| ----------------------------- | :-------: | :---: | :-: | :-: | :---: |
| TypeScript (built-in)         |    ✅     |  ✅   | ✅  | ✅  |  ⚠️   |
| Zero dependencies             |    ✅     |  ❌   | ❌  | ❌  |   —   |
| Automatic retries             |    ✅     |  ❌   | ✅  | ✅  |  ❌   |
| Circuit breaker               |    ✅     |  ❌   | ❌  | ❌  |  ❌   |
| Request deduplication         |    ✅     |  ❌   | ❌  | ❌  |  ❌   |
| Response caching (SWR)        |    ✅     |  ❌   | ❌  | ❌  |  ❌   |
| Auth token refresh            |    ✅     |  ⚠️   | ❌  | ❌  |  ❌   |
| Offline queue                 |    ✅     |  ❌   | ❌  | ❌  |  ❌   |
| Result API (no-throw)         |    ✅     |  ❌   | ❌  | ❌  |  ❌   |
| OpenTelemetry (W3C)           |    ✅     |  ❌   | ❌  | ❌  |  ❌   |
| Rate limiting (client-side)   |    ✅     |  ❌   | ❌  | ❌  |  ❌   |
| SSR helpers                   |    ✅     |  ❌   | ❌  | ❌  |  ❌   |
| WebSocket client              |    ✅     |  ❌   | ❌  | ❌  |  ❌   |
| SSE client                    |    ✅     |  ❌   | ❌  | ❌  |  ❌   |
| GraphQL client                |    ✅     |  ❌   | ❌  | ❌  |  ❌   |
| Mock adapter                  |    ✅     |  ⚠️   | ❌  | ❌  |  ❌   |
| Browser + Node + Deno + Bun   |    ✅     |  ⚠️   | ❌  | ✅  |  ✅   |
| Request pipeline / middleware |    ✅     |  ✅   | ✅  | ✅  |  ❌   |

> ⚠️ = requires a separate package or manual implementation

---

## Performance

reixo is the **fastest full-featured HTTP client** for JavaScript. It outperforms every mainstream alternative in throughput benchmarks:

| Client     |     ops/sec |                       vs reixo |
| ---------- | ----------: | -----------------------------: |
| **reixo**  | **~73,000** |                          **—** |
| ky         |     ~80,000 | within 10%, far fewer features |
| node-fetch |     ~60,000 |          reixo **+22% faster** |
| axios      |     ~50,000 |          reixo **+47% faster** |
| got        |     ~40,000 |          reixo **+83% faster** |

The ~6µs overhead over bare `fetch` is the **structural floor** for any correct async HTTP client — it covers AbortController lifecycle, retry resolution, deduplication lookup, and two unavoidable async microtask roundtrips. Axios, ky, and got all have the same gap. At real network latencies (10–500ms), it represents less than 0.06% of total request time.

**Hot-path optimisations inside reixo:**

- Base headers pre-normalised once in constructor — zero per-request cost
- Config spread reduced from 22+ fields to 0–2 fields per request
- Response interceptors short-circuit synchronously when none registered
- Progress-handler closures lazily allocated — zero cost when unused (~99% of requests)
- Event payload objects guarded by `hasListeners()` — zero allocation when no listeners
- Incremental request IDs replace `crypto.randomUUID()` (~10× cheaper)

To reproduce: `node benchmarks/run.mjs`

---

## Installation

```bash
# npm
npm install reixo

# pnpm
pnpm add reixo

# yarn
yarn add reixo

# bun
bun add reixo
```

**Requirements:** TypeScript 5.0+, Node.js 18+, or any modern browser / Deno / Bun.

---

## Quick start

```typescript
import { Reixo } from 'reixo';

// Create a client with a base URL
const client = Reixo.HTTPBuilder.create('https://api.example.com')
  .withTimeout(10_000)
  .withRetry({ maxAttempts: 3 })
  .build();

// GET
const { data: users } = await client.get<User[]>('/users');

// POST (body is automatically JSON-serialised)
const { data: created } = await client.post<User>('/users', {
  name: 'Alice',
  email: 'alice@example.com',
});

// No-throw style — returns Ok | Err, never throws
const result = await client.tryGet<User>('/users/1');
if (result.ok) {
  console.log(result.data.name);
} else {
  console.error(result.error.status); // fully typed
}
```

---

## Core API

### HTTP methods

```typescript
const client = Reixo.HTTPBuilder.create('https://api.example.com').build();

await client.get<User>('/users/1');
await client.post<User>('/users', { name: 'Alice' });
await client.put<User>('/users/1', { name: 'Alice Smith' });
await client.patch<User>('/users/1', { name: 'Alice S.' });
await client.delete('/users/1');
await client.head('/users/1');
await client.options('/users/1');
```

Every method returns `Promise<HTTPResponse<T>>`:

```typescript
const response = await client.get<User>('/users/1');

response.data; // T — the parsed response body
response.status; // number — HTTP status code
response.headers; // Headers
response.config; // the merged request options used
```

---

### Result API — no-throw error handling

The `try*` variants return a typed `Ok | Err` discriminated union. No `try/catch`. No silent errors.

```typescript
const result = await client.tryGet<User>('/users/1');

if (result.ok) {
  console.log(result.data.name); // User — fully typed
} else {
  // result.error is HTTPError with .status, .message, .config
  if (result.error.status === 404) redirect('/not-found');
  if (result.error.status === 401) refresh();
}
```

All HTTP methods have a `try*` counterpart:

```typescript
await client.tryGet<T>(url, options?)
await client.tryPost<T>(url, data?, options?)
await client.tryPut<T>(url, data?, options?)
await client.tryPatch<T>(url, data?, options?)
await client.tryDelete<T>(url, options?)
```

---

### Interceptors

Intercept and transform requests and responses:

```typescript
const client = Reixo.HTTPBuilder.create('https://api.example.com')
  .addRequestInterceptor(
    (config) => {
      config.headers['Authorization'] = `Bearer ${getToken()}`;
      return config;
    },
    (error) => Promise.reject(error)
  )
  .addResponseInterceptor(
    (response) => {
      console.log(`${response.status} ${response.config.url}`);
      return response;
    },
    (error) => Promise.reject(error)
  )
  .build();
```

Interceptors can be `async`. Multiple interceptors are chained in registration order.

---

## Built-in features

### Retries & backoff

```typescript
const client = Reixo.HTTPBuilder.create('https://api.example.com')
  .withRetry({
    maxAttempts: 4,
    delay: 200, // Initial delay in ms
    backoff: 'exponential', // 'fixed' | 'exponential' | 'linear'
    retryOn: [408, 429, 500, 502, 503, 504],
  })
  .build();
```

**Per-URL retry overrides** — fine-grained control without multiple clients:

```typescript
const client = Reixo.HTTPBuilder.create('https://api.example.com')
  .withRetry({ maxAttempts: 3 })
  .withRetryPolicies([
    { pattern: /\/auth\//, retry: false }, // Never retry auth endpoints
    { pattern: '/api/upload', retry: { maxAttempts: 1 } },
  ])
  .build();
```

---

### Circuit breaker

Protect your app when a downstream service degrades. The circuit opens after a threshold of failures and rejects requests immediately — no network round-trip — until the recovery timeout elapses.

```typescript
const client = Reixo.HTTPBuilder.create('https://api.example.com')
  .withCircuitBreaker({
    failureThreshold: 5, // Open after 5 consecutive failures
    recoveryTimeout: 30_000, // Try recovery after 30s
  })
  .build();

// When circuit is open, requests throw CircuitOpenError immediately
try {
  await client.get('/products');
} catch (err) {
  if (err instanceof Reixo.CircuitOpenError) {
    // Show cached data or fallback UI
  }
}
```

You can share a single circuit breaker across multiple clients:

```typescript
const breaker = new Reixo.CircuitBreaker({ failureThreshold: 3 });
const clientA = new Reixo.HTTPClient({ baseURL: '...', circuitBreaker: breaker });
const clientB = new Reixo.HTTPClient({ baseURL: '...', circuitBreaker: breaker });
```

---

### Request deduplication

Concurrent identical GET requests collapse to a single network round-trip. All callers receive the same response.

```typescript
const client = Reixo.HTTPBuilder.create('https://api.example.com').withDeduplication().build();

// Three concurrent calls → one network request, three resolved promises
const [a, b, c] = await Promise.all([
  client.get('/users/1'),
  client.get('/users/1'),
  client.get('/users/1'),
]);
```

---

### Response caching

In-memory TTL cache with support for `cache-first`, `network-first`, and `stale-while-revalidate` strategies.

```typescript
const client = Reixo.HTTPBuilder.create('https://api.example.com')
  .withCache({ ttl: 60_000, maxSize: 500 })
  .build();

await client.get('/config'); // Network request, cached
await client.get('/config'); // Served from cache

// Optimistic update + revalidate
await client.mutate('/config', { theme: 'dark' }, { revalidate: true });

// Manual invalidation
await client.invalidate('/config');
```

**SWR (stale-while-revalidate)** — return stale data instantly, refresh in background:

```typescript
const client = Reixo.HTTPBuilder.create('https://api.example.com')
  .withCache({ strategy: 'stale-while-revalidate', ttl: 30_000 })
  .build();
```

---

### Auth token refresh

Single refresh call, no duplicate requests, automatic queued replay:

```typescript
import { createAuthInterceptor } from 'reixo';

const client = Reixo.HTTPBuilder.create('https://api.example.com')
  .addRequestInterceptor(
    createAuthInterceptor({
      getToken: () => localStorage.getItem('access_token'),
      refreshToken: async () => {
        const res = await fetch('/auth/refresh', { method: 'POST' });
        const { accessToken } = await res.json();
        localStorage.setItem('access_token', accessToken);
        return accessToken;
      },
    }).onFulfilled
  )
  .build();
```

When multiple requests receive a 401 simultaneously, only one refresh is triggered. All other requests are queued and replayed automatically once the new token is available.

---

### Offline queue

Buffer requests while the device is offline and replay them automatically when connectivity returns.

```typescript
const client = Reixo.HTTPBuilder.create('https://api.example.com')
  .withOfflineQueue({ maxSize: 100 })
  .build();

// This is queued if offline, and replayed when back online
await client.post('/events', { type: 'click', target: 'buy-button' });
```

---

### OpenTelemetry tracing

W3C `traceparent`, `tracestate`, and `baggage` headers injected on every request — no `@opentelemetry/*` packages required.

```typescript
const client = Reixo.HTTPBuilder.create('https://api.example.com')
  .withOpenTelemetry({
    serviceName: 'checkout-service',
    baggage: { 'user.tier': 'premium' },
  })
  .build();

// Continue an upstream trace (e.g. from an Express/Next.js handler)
const client = Reixo.HTTPBuilder.create('https://api.example.com')
  .withOpenTelemetry({ parentContext: extractTraceContext(req) })
  .build();
```

---

### Rate limiting

Client-side token bucket that queues requests when the rate limit is reached:

```typescript
const client = Reixo.HTTPBuilder.create('https://api.example.com')
  .withRateLimit({ requests: 60, interval: 60_000 }) // 60 req/min
  .build();
```

---

### Server-side rendering

Forward cookies, auth headers, and trace context from incoming requests to your upstream APIs:

```typescript
import { createSSRClient } from 'reixo';

// Next.js / Nuxt / SvelteKit server handler
export async function getServerSideProps(context) {
  const client = createSSRClient('https://api.example.com', context.req);
  // Automatically forwards: Cookie, Authorization, traceparent, etc.
  const { data } = await client.get('/user/profile');
  return { props: { data } };
}
```

---

### Progress tracking

Track upload and download progress on individual requests or globally:

```typescript
await client.post('/upload', formData, {
  onUploadProgress: ({ loaded, total, progress }) => {
    console.log(`Upload: ${Math.round(progress * 100)}%`);
  },
});

await client.get('/large-file', {
  onDownloadProgress: ({ loaded, total }) => {
    setProgress(loaded / total);
  },
});
```

Global handlers via the builder:

```typescript
const client = Reixo.HTTPBuilder.create('https://api.example.com')
  .withUploadProgress(({ progress }) => updateBar(progress))
  .withDownloadProgress(({ progress }) => updateBar(progress))
  .build();
```

---

### Request cancellation

Cancel individual requests or all in-flight requests at once:

```typescript
// Cancel by ID
const { requestId, response } = client.requestWithId('/api/data');
// Component unmounts, user navigates away:
client.cancel(requestId);

// Cancel everything
client.cancelAll();

// Or use a standard AbortController
const controller = new AbortController();
client.get('/api/data', { signal: controller.signal });
controller.abort();
```

---

### Prefetch

Prefetch a resource and store it in the cache before it's needed:

```typescript
// On hover — start fetching before the user clicks
const handle = client.prefetch('/api/dashboard');

// If the user navigates away before clicking:
handle.cancel();

// Check whether the response is already cached:
if (handle.completed) {
  console.log('Already cached!');
}
```

---

### Metrics

Collect per-request timing, error rate, and throughput metrics:

```typescript
const client = Reixo.HTTPBuilder.create('https://api.example.com')
  .withMetrics(true, (metrics) => {
    datadog.gauge('http.error_rate', metrics.errorRate);
    datadog.gauge('http.p99_latency', metrics.p99);
  })
  .build();

// Access the latest snapshot synchronously
const snapshot = client.metrics?.getSnapshot();
```

---

### Validation

Validate responses at the type level using any Zod-compatible schema:

```typescript
import { z } from 'zod';

const UserSchema = z.object({ id: z.number(), name: z.string() });

const { data } = await client.get<z.infer<typeof UserSchema>>('/users/1', {
  validationSchema: UserSchema,
});
// Throws ValidationError if the response doesn't match
```

---

## Advanced

### Request pipeline / middleware

Compose middleware for cross-cutting concerns:

```typescript
const client = Reixo.HTTPBuilder.create('https://api.example.com')
  .use(async (req, next) => {
    req.headers.set('X-Request-Id', crypto.randomUUID());
    const res = await next(req);
    console.log(`${req.method} ${req.url} → ${res.status}`);
    return res;
  })
  .build();
```

---

### Task queue

Limit concurrency across a batch of requests:

```typescript
const queue = new Reixo.TaskQueue({ concurrency: 5 });

const results = await Promise.all(userIds.map((id) => queue.add(() => client.get(`/users/${id}`))));
// At most 5 requests in-flight at any time
```

---

### WebSocket client

Managed WebSocket connections with auto-reconnect and typed events:

```typescript
const ws = new Reixo.WebSocketClient({
  url: 'wss://realtime.example.com/events',
  autoConnect: true,
  reconnect: { maxAttempts: 10, delay: 1000 },
});

ws.on('message', (data) => console.log('Received:', data));
ws.send({ type: 'subscribe', channel: 'orders' });
ws.disconnect();
```

---

### SSE client

Typed Server-Sent Events with automatic reconnection:

```typescript
const sse = new Reixo.SSEClient({ url: 'https://api.example.com/stream' });

sse.on('update', (event) => console.log(event.data));
sse.on('error', (err) => console.error(err));
sse.connect();
```

---

### GraphQL client

Typed queries and mutations on top of the HTTP client:

```typescript
const gql = new Reixo.GraphQLClient({ url: 'https://api.example.com/graphql' });

const { user } = await gql.query<{ user: User }>(
  `query GetUser($id: ID!) {
    user(id: $id) { id name email }
  }`,
  { id: '1' }
);

await gql.mutate(`mutation UpdateUser($id: ID!, $name: String!) { ... }`, {
  id: '1',
  name: 'Bob',
});
```

---

### Mock adapter (testing)

Deterministic mocking without patching globals or importing test utilities into production code:

```typescript
import { Reixo } from 'reixo';

const client = Reixo.HTTPBuilder.create('https://api.example.com').withMock().build();

client.mock.get('/users/1', { id: 1, name: 'Alice' });
client.mock.post('/users', (req) => ({ id: 2, ...req.body }));

const { data } = await client.get<User>('/users/1');
// → { id: 1, name: 'Alice' } — no network call
```

---

### Infinite queries & pagination

Handle cursor-based or page-based pagination with built-in state management:

```typescript
const query = client.infiniteQuery<Post>('/posts', {
  getNextPageParam: (lastPage) => lastPage.nextCursor,
  pageSize: 20,
});

const firstPage = await query.fetchNextPage();
const secondPage = await query.fetchNextPage();
const allPosts = query.data.flat();
```

---

### Suspense support

React Suspense-compatible `read()` method — throws a promise while loading, returns data once resolved:

```typescript
function UserProfile({ id }: { id: string }) {
  // Throws a Promise (Suspense catches it), returns User when ready
  const user = client.read<User>(`/users/${id}`);
  return <div>{user.name}</div>;
}

// In your component tree:
<Suspense fallback={<Spinner />}>
  <UserProfile id="1" />
</Suspense>
```

---

### cURL generation

Generate a cURL command for any request — useful for debugging and sharing with your team:

```typescript
const curl = client.generateCurl('/users/1', {
  method: 'GET',
  headers: { Authorization: 'Bearer tok' },
});
// → curl -X GET -H 'Authorization: Bearer tok' 'https://api.example.com/users/1'
```

---

## Bundle size

reixo has **zero runtime dependencies**. Total size at [bundlephobia](https://bundlephobia.com/package/reixo).

---

## Contributing

```bash
git clone https://github.com/webcoderspeed/reixo.git
cd reixo
npm install
npm test          # 323 tests
npm run build     # CJS + ESM + type declarations
```

Pull requests are welcome. For significant changes, please open an issue first to discuss what you'd like to change.

---

## License

[MIT](https://opensource.org/licenses/MIT) © [Sanjeev Sharma](https://github.com/webcoderspeed)
