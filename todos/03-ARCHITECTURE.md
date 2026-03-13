# 🏗️ Architecture Analysis — Reixo

> Deep dive into the structural design, patterns used, and architectural observations.
> Last reviewed: 2026-03-13

---

## Overview

Reixo is an enterprise-grade HTTP client library for TypeScript (Node.js + Browser). It wraps the native `fetch` API with a rich feature set. The codebase is approximately:

- **4 core modules** (`http-client`, `graphql-client`, `sse-client`, `websocket-client`)
- **24 utility modules** (retry, queue, cache, circuit-breaker, auth, rate-limiter, metrics, etc.)
- **40+ test files** with comprehensive coverage
- **~3,500 lines of source code** (estimate)
- **Zero `any` types** (enforced via tsconfig/eslint)
- **Dual output** (ESM `.mjs` + CJS `.js`) via `tsup`

---

## What's Done Well ✅

### 1. Builder Pattern for Configuration

`HTTPBuilder` provides a clean, fluent API for constructing configured `HTTPClient` instances. This avoids the "configuration object hell" of libraries like axios where a large options object must be passed upfront.

```ts
const client = new HTTPBuilder('https://api.example.com')
  .withRetry({ maxRetries: 3 })
  .withCache(true)
  .withMetrics(true)
  .withOfflineQueue(true)
  .build();
```

### 2. Event-Driven Architecture

`HTTPClient` extends `EventEmitter<HTTPEvents>` which provides strongly-typed events. This allows clean separation of concerns — users can subscribe to `request:start`, `response:success`, `response:error`, `cache:revalidate` without coupling to the request pipeline.

### 3. Interceptor Pipeline

The request/response interceptor system is well-designed — uses `reduce` for sequential async execution, supports both fulfilled and rejected handlers, and allows response error recovery (e.g., token refresh in auth interceptor).

### 4. Offline Queue with Persistence

`TaskQueue` + `StorageAdapter` pattern for persistence is solid. Supports `memory`, `localStorage`, `sessionStorage`, and custom adapters. The `NetworkMonitor` automatically pauses/resumes the queue on connectivity changes.

### 5. Type Safety

Zero `any` types, generics used throughout, `as const` instead of enums, proper type exports. This is a strong foundation for TypeScript consumers.

### 6. Comprehensive Testing

40+ test files covering unit, integration, memory leaks, SSR, WebSocket, SSE, and more. Very thorough for a library at this stage.

### 7. Modern Tooling

- `tsup` for bundling (tree-shaking, ESM + CJS, `.d.ts` generation)
- `vitest` for testing (fast, native ESM support)
- `husky` + `lint-staged` for pre-commit checks
- GitHub Actions CI/CD
- `standard-version` for releases (though deprecated — see BUG-015)

### 8. SWR (Stale-While-Revalidate) Implementation

Background revalidation on focus/reconnect is implemented correctly. The `subscribe()` + observer pattern for reactive updates is elegant.

---

## Architectural Concerns ⚠️

### Concern 1 — `HTTPClient` has too many responsibilities (God Object)

`HTTPClient` currently handles:

- HTTP transport
- Request/response interceptors
- Caching (all strategies)
- Deduplication
- Rate limiting
- Metrics collection
- Offline queue management
- SWR revalidation and active query tracking
- Event emission
- Browser lifecycle management (focus/online events)
- Abort controller management
- API versioning
- Progress tracking

This is ~1,000 lines in a single class. When a new feature is added, this class grows further. A better architecture would use **composition with middleware**:

```ts
// Conceptual refactor direction
class HTTPClient {
  private pipeline: Middleware[] = [];
  // Middleware: CacheMiddleware, RetryMiddleware, AuthMiddleware, etc.
}
```

This mirrors how Express.js middleware or Axios adapter pattern works — each concern is isolated.

---

### Concern 2 — No clear separation between "transport layer" and "client layer"

The `http()` function in `src/utils/http.ts` is both a:

- Pure transport function (fetch wrapper with timeout)
- Retry orchestrator (calls `withRetry` internally)
- Upload progress handler (XHR fallback logic)
- Download progress tracker (stream reading)
- Response parser (JSON, text, blob, arraybuffer, stream)

The retry logic in `http.ts` is separate from the retry config in `HTTPClient`. This creates confusion:

- `http.ts` has its own retry default (`retry = true` → uses `withRetry` with defaults)
- `HTTPClient` has `config.retry` and `config.retryPolicies`

It's unclear which takes precedence or if they stack.

**Recommendation:** `http()` should be a pure transport with zero retry logic. All retry, caching, and interception should live exclusively in `HTTPClient`.

---

### Concern 3 — `CircuitBreaker` is disconnected from `HTTPClient`

The circuit breaker is implemented as a standalone class with no native integration into `HTTPClient`. This forces users to manually wrap calls, defeating the purpose of a batteries-included HTTP client.

Architecturally, the circuit breaker should be a first-class middleware/plugin in the request pipeline — activated per-endpoint or globally via config.

---

### Concern 4 — Dual cleanup API is an API design smell

Having both `dispose()` and `destroy()` with different behaviors (even if unintentional) creates an inconsistent API. Popular libraries choose one term:

- Node.js uses `destroy()` (streams, servers)
- React uses `cleanup()` / `unmount()`
- Browser APIs use `close()` or `abort()`

**Recommendation:** Keep only `dispose()` (more semantic for manual cleanup) and deprecate/remove `destroy()`.

---

### Concern 5 — `WebSocketClient` and `SSEClient` don't share the reconnect logic

Both `WebSocketClient` and `SSEClient` implement automatic reconnection with backoff. This logic is copy-pasted. A shared `ReconnectStrategy` abstraction would reduce duplication and allow users to configure reconnection behavior consistently.

---

### Concern 6 — `StorageAdapter` interface uses synchronous methods

```ts
export interface StorageAdapter {
  get(key: string): CacheEntry<unknown> | null;   // synchronous
  set(key: string, entry: CacheEntry<unknown>): void;  // synchronous
  ...
}
```

This works for `localStorage` and `MemoryAdapter`, but makes it **impossible** to implement async storage backends (IndexedDB, Redis via HTTP, SQLite) without architectural changes. Modern apps often need async storage for larger datasets.

**Recommendation:** Make storage methods return `Promise<T>` or `T | Promise<T>` to support both sync and async adapters.

---

### Concern 7 — No plugin system for extensibility

Currently, extending Reixo requires:

1. Subclassing `HTTPClient` (fragile)
2. Using interceptors (limited — only request/response)
3. Adding custom transport (nuclear option)

A proper plugin system would allow clean extension:

```ts
client.use(tracingPlugin({ serviceName: 'my-app' }));
client.use(retryPlugin({ maxRetries: 5 }));
client.use(cachePlugin({ ttl: 60000 }));
```

This is the approach taken by `got` (Node.js HTTP library) and is highly extensible without modifying core code.

---

## Module Dependency Map

```
src/index.ts
├── src/core/http-client.ts          ← Main export
│   ├── src/utils/http.ts            ← Fetch wrapper + XHR
│   ├── src/utils/retry.ts           ← Exponential backoff
│   ├── src/utils/cache.ts           ← Memory/Web storage
│   ├── src/utils/queue.ts           ← Task queue + persistence
│   │   ├── src/utils/cache.ts       ← Storage adapters
│   │   └── src/utils/network.ts     ← Online/offline detection
│   ├── src/utils/rate-limiter.ts    ← Token bucket
│   ├── src/utils/metrics.ts         ← Request metrics
│   ├── src/utils/connection.ts      ← Connection pool
│   ├── src/utils/emitter.ts         ← EventEmitter
│   ├── src/utils/keys.ts            ← Cache key generation
│   ├── src/utils/form-data.ts       ← Object→FormData
│   ├── src/utils/timing.ts          ← debounce/throttle/delay
│   └── src/utils/infinite-query.ts  ← Cursor-based pagination
│
├── src/core/graphql-client.ts       ← GraphQL wrapper over HTTPClient
├── src/core/websocket-client.ts     ← Native WebSocket with reconnect
├── src/core/sse-client.ts           ← EventSource with reconnect
│
└── src/utils/
    ├── auth.ts           ← Token refresh interceptor
    ├── batch.ts          ← Request batching
    ├── batch-transport.ts← Batch HTTP transport
    ├── circuit-breaker.ts← Circuit breaker state machine
    ├── hash.ts           ← String hashing
    ├── logger.ts         ← ConsoleLogger
    ├── mock-adapter.ts   ← Testing mock
    ├── pagination.ts     ← Async iterator pagination
    ├── pipeline.ts       ← Data transformation pipeline
    ├── polling.ts        ← Smart polling helper
    ├── recorder.ts       ← Traffic recorder
    ├── security.ts       ← Header sanitization
    ├── ssr.ts            ← SSR header forwarding
    ├── tracing.ts        ← OpenTelemetry trace injection
    ├── upload.ts         ← Resumable uploads
    └── versioning.ts     ← API version management
```

---

## Performance Notes

1. **Interceptor reduce pattern** — Interceptors use `Array.reduce` with `async/await` which creates a promise chain. For 10+ interceptors, this adds measurable overhead. Consider optimizing with a for-loop.

2. **Active queries `Map`** — `revalidateActiveQueries()` iterates all active queries and fires parallel requests. No rate limiting on revalidation burst — a user switching tabs could trigger 50+ simultaneous requests.

3. **`MemoryAdapter` doesn't use LRU** — (see BUG-010). Under high-traffic scenarios, the cache eviction strategy matters.

4. **`TaskQueue` loads from storage via `setTimeout(() => this.loadQueue(), 0)`** — This defers storage load by one tick to allow event listeners to be attached. This is correct but means there's a tiny window where tasks added synchronously after construction won't be persisted until after the load tick.

---

## Security Notes

1. **`security.ts`** provides header sanitization — good foundation
2. **`ssl` config in `HTTPClientConfig`** supports custom CA certs — good for internal services
3. **No SSRF protection** — `baseURL` + `url` concatenation should validate that the resulting URL belongs to the expected origin (especially important for libraries used in server-side code where user input might influence URL construction)
4. **`generateCurl()`** includes raw header values in the output string — if logs contain curl commands with `Authorization` headers, credentials are exposed

---

_End of architecture analysis. See `04-PRIORITY-MATRIX.md` for prioritized action plan._
