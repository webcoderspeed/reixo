# reixo

**A TypeScript-first HTTP client for Node.js, browsers, and edge runtimes — with retries, circuit breaking, request deduplication, OpenTelemetry tracing, typed error returns, caching, offline queuing, auth token refresh, and more.**

[![npm version](https://img.shields.io/npm/v/reixo)](https://www.npmjs.com/package/reixo)
[![npm downloads](https://img.shields.io/npm/dm/reixo)](https://www.npmjs.com/package/reixo)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/reixo)](https://bundlephobia.com/package/reixo)
[![CI](https://github.com/webcoderspeed/reixo/actions/workflows/ci.yml/badge.svg)](https://github.com/webcoderspeed/reixo/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue)](https://www.typescriptlang.org/)

---

## Why reixo?

The native `fetch` API is low-level. Timeouts, retries, error normalisation, token refresh, distributed tracing, and request deduplication require boilerplate that gets duplicated across every project. `axios` and `got` fill some gaps but leave the hard parts — circuit breaking, typed errors, offline queuing, OpenTelemetry, Result-style error handling — to third-party plugins or custom code.

reixo bundles all of that into one zero-dependency library:

- **No-throw Result API.** `tryGet`, `tryPost`, etc. return `Ok | Err` — no `try/catch` required.
- **Automatic retries.** Configurable backoff strategies with per-request and per-client defaults.
- **Circuit breaker.** Fail fast when a downstream is unhealthy; recover automatically.
- **Request deduplication.** Concurrent identical GET requests collapse to a single network round-trip.
- **Offline queue.** Requests made while offline are queued and replayed when connectivity returns.
- **Response caching.** In-memory TTL cache with fine-grained invalidation control.
- **Auth token refresh.** Automatic token rotation with queue-based refresh — no duplicate refresh calls.
- **OpenTelemetry.** W3C `traceparent`, `tracestate`, and `baggage` propagation with zero extra packages.
- **Server-Side Rendering.** Forward cookies, auth headers, and trace context from incoming requests.
- **Rate limiting.** Client-side rate limiting to protect downstream services.
- **WebSocket client.** Managed WebSocket connections with auto-reconnect and event subscription.
- **SSE client.** Typed Server-Sent Events with automatic reconnection.
- **GraphQL client.** Typed query and mutation support built on top of the HTTP client.
- **Request pipeline.** Composable middleware chain for interceptors and transformations.
- **Mock adapter.** Deterministic mocking for tests without patching globals.
- **Zero dependencies.** Runs on Node.js, browsers, Deno, Bun, and edge runtimes.

---

## Installation

```bash
npm install reixo
```

---

## Quick start

```typescript
import { Reixo } from 'reixo';

const client = Reixo.HTTPBuilder.create('https://api.example.com')
  .withRetry({ maxAttempts: 3 })
  .withTimeout(5000)
  .build();

const users = await client.get<User[]>('/users');
const user = await client.post<User>('/users', { name: 'Alice' });
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
```

### Result API — no-throw error handling

```typescript
const result = await client.tryGet<User>('/users/1');

if (result.ok) {
  console.log(result.data.name);
} else {
  console.error(result.error.status, result.error.message);
}
```

No `try/catch`. The `Ok | Err` type forces you to handle errors explicitly at the call site.

---

## Retries

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

---

## Circuit breaker

```typescript
const client = Reixo.HTTPBuilder.create('https://api.example.com')
  .withCircuitBreaker({
    failureThreshold: 5, // Open after 5 consecutive failures
    recoveryTimeout: 30_000, // Attempt recovery after 30s
  })
  .build();
```

When the circuit is open, requests fail immediately without hitting the network, giving downstream services time to recover.

---

## Request deduplication

```typescript
const client = Reixo.HTTPBuilder.create('https://api.example.com').withDeduplication().build();

// These three calls fire simultaneously but produce only one network request
const [a, b, c] = await Promise.all([
  client.get('/users/1'),
  client.get('/users/1'),
  client.get('/users/1'),
]);
```

---

## Offline queue

```typescript
const client = Reixo.HTTPBuilder.create('https://api.example.com')
  .withOfflineQueue({ maxSize: 100 })
  .build();

// Requests made while offline are queued and replayed when connectivity returns
await client.post('/events', { type: 'click', target: 'buy-button' });
```

---

## Auth token refresh

```typescript
import { createAuthInterceptor } from 'reixo';

const client = Reixo.HTTPBuilder.create('https://api.example.com')
  .withInterceptor(
    createAuthInterceptor({
      getToken: () => localStorage.getItem('access_token'),
      refreshToken: async () => {
        const res = await fetch('/auth/refresh', { method: 'POST' });
        const { accessToken } = await res.json();
        localStorage.setItem('access_token', accessToken);
        return accessToken;
      },
    })
  )
  .build();
```

Concurrent 401 responses trigger a single refresh, then replay all queued requests with the new token.

---

## OpenTelemetry tracing

```typescript
const client = Reixo.HTTPBuilder.create('https://api.example.com')
  .withTracing({
    serviceName: 'checkout-service',
    propagate: ['traceparent', 'tracestate', 'baggage'],
  })
  .build();
```

W3C trace headers are injected automatically — no `@opentelemetry/*` packages required.

---

## Response caching

```typescript
const client = Reixo.HTTPBuilder.create('https://api.example.com')
  .withCache({ ttl: 60_000, maxSize: 500 })
  .build();

await client.get('/config'); // Network request
await client.get('/config'); // Served from cache (< 60s old)
await client.invalidate('/config'); // Manual invalidation
```

---

## Server-side rendering

```typescript
import { createSSRClient } from 'reixo';

// In your SSR handler
export async function getServerSideProps(context) {
  const client = createSSRClient('https://api.example.com', context.req);
  // Forwards cookies, authorization, and trace headers from the incoming request
  const data = await client.get('/user/profile');
  return { props: { data } };
}
```

---

## Task queue

```typescript
const queue = new Reixo.TaskQueue({ concurrency: 5 });

const results = await Promise.all(userIds.map((id) => queue.add(() => client.get(`/users/${id}`))));
// At most 5 requests in-flight at any time
```

---

## WebSocket client

```typescript
const ws = new Reixo.WebSocketClient({
  url: 'wss://realtime.example.com/events',
  autoConnect: true,
  reconnect: { maxAttempts: 10, delay: 1000 },
});

ws.on('message', (data) => console.log('Received:', data));
ws.send({ type: 'subscribe', channel: 'orders' });
```

---

## SSE client

```typescript
const sse = new Reixo.SSEClient({ url: 'https://api.example.com/stream' });

sse.on('update', (event) => console.log(event.data));
sse.connect();
```

---

## GraphQL client

```typescript
const gql = new Reixo.GraphQLClient({ url: 'https://api.example.com/graphql' });

const { user } = await gql.query<{ user: User }>(
  `
  query GetUser($id: ID!) {
    user(id: $id) { id name email }
  }
`,
  { id: '1' }
);
```

---

## Request pipeline

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

## Mock adapter (testing)

```typescript
import { Reixo } from 'reixo';

const client = Reixo.HTTPBuilder.create('https://api.example.com').withMock().build();

client.mock.get('/users/1', { id: 1, name: 'Alice' });

const user = await client.get<User>('/users/1');
// Returns { id: 1, name: 'Alice' } — no network call
```

---

## Feature comparison

| Feature                           | reixo |         axios          | got | ky  |  fetch  |
| --------------------------------- | :---: | :--------------------: | :-: | :-: | :-----: |
| TypeScript types (built-in)       |  Yes  |          Yes           | Yes | Yes | Partial |
| Zero dependencies                 |  Yes  |           No           | No  | No  |    —    |
| Automatic retries                 |  Yes  |           No           | Yes | Yes |   No    |
| Circuit breaker                   |  Yes  |           No           | No  | No  |   No    |
| Request deduplication             |  Yes  |           No           | No  | No  |   No    |
| Offline queue                     |  Yes  |           No           | No  | No  |   No    |
| Result API (no-throw)             |  Yes  |           No           | No  | No  |   No    |
| Auth token refresh                |  Yes  |    via interceptor     | No  | No  |   No    |
| Response caching                  |  Yes  |           No           | No  | No  |   No    |
| OpenTelemetry (W3C)               |  Yes  |           No           | No  | No  |   No    |
| Server-side rendering helpers     |  Yes  |           No           | No  | No  |   No    |
| Rate limiting (client-side)       |  Yes  |           No           | No  | No  |   No    |
| WebSocket client                  |  Yes  |           No           | No  | No  |   No    |
| SSE client                        |  Yes  |           No           | No  | No  |   No    |
| GraphQL client                    |  Yes  |           No           | No  | No  |   No    |
| Request pipeline / middleware     |  Yes  |          Yes           | Yes | Yes |   No    |
| Mock adapter                      |  Yes  | via axios-mock-adapter | No  | No  |   No    |
| Works in browser, Node, Deno, Bun |  Yes  |        Partial         | No  | Yes |   Yes   |

---

## Performance

reixo adds approximately **5–6µs** of overhead over a raw `fetch` call for a typical GET request. That covers retry policy resolution, circuit-breaker state checks, deduplication lookup, AbortController lifecycle, and header normalisation — work that every serious HTTP client must do.

Benchmark on Node.js v22, mocked fetch (measures pure client overhead):

| Client                  | ops/sec | p99 latency | vs native fetch |
| ----------------------- | ------: | ----------: | --------------: |
| native fetch            | 123,701 |        37µs |      (baseline) |
| reixo (basic)           |  73,716 |        42µs |  −40% vs native |
| reixo + retry           |  73,850 |        37µs |  −40% vs native |
| reixo + circuit-breaker |  71,825 |        53µs |  −42% vs native |

**How reixo stays fast on the hot path:**

- Pre-computed base headers normalised once in constructor, not per request
- Slim transport-config template (2 fields) replaces full `config` spread (22+ fields) per call
- Response interceptors short-circuit synchronously when none registered (saves one microtask roundtrip — the dominant cost in any async client)
- Incremental request IDs replace `crypto.randomUUID()` (~10× cheaper)
- `retryPolicies` scanned once at startup; per-URL `.find()` skipped on every request when no policies are set

In real applications the overhead is negligible compared to actual network latency (10–200ms). The throughput difference above reflects that reixo does real work on every call — it is not simply slow.

To reproduce: `node benchmarks/run.mjs`

---

## Bundle size

reixo has zero runtime dependencies. The total minified + gzipped size is available at [bundlephobia](https://bundlephobia.com/package/reixo).

---

## Contributing

```bash
git clone https://github.com/webcoderspeed/reixo.git
cd reixo
npm install
npm test
```

Pull requests are welcome. For significant changes, open an issue first.

---

## License

MIT
