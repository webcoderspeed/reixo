# ✨ Improvements & Feature Enhancements — Reixo

> Suggestions for making Reixo more developer-friendly, powerful, and production-ready.
> Priority: P1 (High) → P2 (Medium) → P3 (Nice-to-have)
> Last updated: 2026-03-13 (Sprint 3 completed — IMP-001/002/003/006/007/009/012 done)

---

## P1 — High Priority

---

### IMP-001 — `CircuitBreaker` should be first-class in `HTTPClientConfig` ✅ DONE

**Current state:**
`CircuitBreaker` exists as a standalone utility but cannot be plugged into `HTTPClient` via config. Users must manually wrap every call:

```ts
const cb = new CircuitBreaker({ failureThreshold: 5 });
const data = await cb.execute(() => client.get('/api/data'));
```

**Proposed improvement:**
Add a `circuitBreaker` option in `HTTPClientConfig` and `HTTPBuilder`:

```ts
const client = new HTTPBuilder()
  .withCircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 30000 })
  .build();

// Now all requests automatically go through the circuit breaker
```

**Impact:** Huge DX improvement — automatic resilience without manual wrapping.

---

### IMP-002 — Add dedicated `HEAD` and `OPTIONS` methods to `HTTPClient` ✅ DONE

**Current state:**
`HTTPMethod` type includes `HEAD` and `OPTIONS` but `HTTPClient` only has `get`, `post`, `put`, `delete`, `patch`. Users must use the generic `request()` method.

**Proposed improvement:**

```ts
client.head('/api/resource'); // Check resource existence
client.options('/api/resource'); // CORS preflight / API discovery
```

These are used in production scenarios: `HEAD` for ETags/existence checks, `OPTIONS` for CORS debugging.

---

### IMP-003 — Request cancellation public API ✅ DONE

**Current state:**
There's no way for users to cancel a specific in-flight request. They'd have to manage their own `AbortController` and pass it via `signal` in options.

**Proposed improvement:**

```ts
const requestId = await client.get('/api/data', { returnRequestId: true });
// Later:
client.cancel(requestId);
// Or cancel all:
client.cancelAll();
```

This is especially important for React/SPA scenarios where a component unmounts while a request is in-flight.

---

### IMP-004 — Framework integration: React hooks

**Current state:**
Mentioned as pending in `todo.md`. No React hooks exist.

**Proposed improvement:**
Create a separate optional package `reixo-react` with:

```ts
// useReixoQuery — for data fetching
const { data, loading, error, refetch } = useReixoQuery('/api/users', { client });

// useReixoMutation — for POST/PUT/DELETE
const [createUser, { loading }] = useReixoMutation('/api/users', 'POST', { client });

// useReixoInfiniteQuery — for infinite scrolling
const { data, fetchNextPage, hasNextPage } = useReixoInfiniteQuery('/api/posts', { client });
```

This would dramatically increase adoption in React projects which are the dominant SPA framework.

---

### IMP-005 — Advanced query parameter serialization ✅ DONE

**Current state:**
Mentioned as pending in `todo.md`. Only supports flat key=value pairs.

**Proposed improvement:**
Support complex param shapes:

```ts
// Arrays
client.get('/api/items', { params: { tags: ['js', 'ts'] } });
// → /api/items?tags=js&tags=ts

// Nested objects
client.get('/api/items', { params: { filter: { date: '2026-01-01', status: 'active' } } });
// → /api/items?filter[date]=2026-01-01&filter[status]=active

// Custom serializer
client.get('/api/items', {
  params: { ids: [1, 2, 3] },
  paramsSerializer: (params) => qs.stringify(params, { arrayFormat: 'brackets' }),
});
```

---

### IMP-006 — `HTTPBuilder` is missing several config methods ✅ DONE

**Current state:**
`HTTPBuilder` doesn't expose all `HTTPClientConfig` options as fluent methods. These are missing:

- `withLogger(logger: Logger)` — attach a custom logger
- `withCircuitBreaker(options)` — (see IMP-001)
- `withSSL(options)` — configure TLS/SSL
- `withConnectionPool(options)` — configure connection pooling
- `withRetryPolicies(policies)` — per-endpoint retry policies
- `withVersioning(version, strategy)` — API versioning config

**Proposed improvement:**
Add all missing builder methods so that `HTTPBuilder` fully covers `HTTPClientConfig` with a fluent API.

---

### IMP-007 — Error type hierarchy (NetworkError, TimeoutError, AbortError) ✅ DONE

**Current state:**
Only `HTTPError` (HTTP status errors) and `ValidationError` are available. All other errors (network failures, timeouts, aborts) are raw `Error` objects.

**Proposed improvement:**

```ts
export class NetworkError extends Error { ... }    // fetch() failed (no internet)
export class TimeoutError extends HTTPError { ... } // Request timed out
export class AbortError extends Error { ... }       // Request was cancelled
export class CircuitOpenError extends Error { ... } // Circuit breaker is OPEN
```

This allows users to write clean `instanceof` checks:

```ts
try {
  await client.get('/api/data');
} catch (err) {
  if (err instanceof TimeoutError) {
    /* retry later */
  }
  if (err instanceof CircuitOpenError) {
    /* show cached data */
  }
  if (err instanceof NetworkError) {
    /* show offline banner */
  }
}
```

---

## P2 — Medium Priority

---

### IMP-008 — Bundle size: tree-shakeable subpath exports

**Current state:**
All features (WebSocket, SSE, GraphQL, BatchTransport, etc.) are bundled together. Users who only need basic HTTP client download everything.

**Proposed improvement:**
Add subpath exports in `package.json`:

```json
{
  "exports": {
    ".": { ... },
    "./graphql": { "import": "./dist/graphql.mjs", ... },
    "./websocket": { "import": "./dist/websocket.mjs", ... },
    "./sse": { "import": "./dist/sse.mjs", ... }
  }
}
```

```ts
// Users only import what they need
import { HTTPBuilder } from 'reixo';
import { GraphQLClient } from 'reixo/graphql';
import { WebSocketClient } from 'reixo/websocket';
```

**Impact:** Could reduce baseline bundle from ~40KB to ~8KB for simple HTTP use cases.

---

### IMP-009 — `MockAdapter` should support response delays and conditional matching ✅ DONE

**Current state:**
`MockAdapter` provides basic request mocking but doesn't support response delays or complex URL pattern matching.

**Proposed improvement:**

```ts
const mock = new MockAdapter(client);

mock.onGet('/api/users').reply(200, users, { delayMs: 500 });
mock.onPost('/api/users').reply((config) => {
  if (config.body.includes('admin')) return [403, { error: 'Forbidden' }];
  return [201, { id: 1 }];
});

// Network error simulation
mock.onGet('/api/flaky').networkError();

// Timeout simulation
mock.onGet('/api/slow').timeout();
```

This would make reixo a great choice for unit testing UI components with realistic network simulation.

---

### IMP-010 — Stale data TTL indicator in responses ✅ DONE

**Current state:**
When a cached response is returned (`statusText: 'OK (Cached)'`), there's no indication of how stale the data is.

**Proposed improvement:**
Add cache metadata to responses:

```ts
interface HTTPResponse<T> {
  data: T;
  status: number;
  statusText: string;
  headers: Headers;
  config: HTTPOptions;
  cacheMetadata?: {
    hit: boolean;
    age: number; // seconds since cached
    ttl: number; // remaining TTL in seconds
    strategy: string; // 'cache-first' | 'stale-while-revalidate' | etc.
  };
}
```

---

### IMP-011 — TypeDoc integration for auto-generated API docs

**Current state:**
JSDoc comments are present but there's no script to generate HTML/JSON API documentation.

**Proposed improvement:**
Add TypeDoc as a devDependency:

```json
{
  "scripts": {
    "docs": "typedoc --entryPointStrategy expand src/index.ts --out docs/api"
  }
}
```

This auto-generates browsable API docs from the existing JSDoc comments.

---

### IMP-012 — Export missing utility types from `index.ts` ✅ DONE

**Current state:**
Several useful types/classes are not exported from the main package entry:

- `ValidationError` (needed to catch in try/catch)
- `CacheManager` (users may want to use directly)
- `MetricsCollector` (for custom metrics dashboards)
- `RateLimiter` (useful standalone)
- `StorageAdapter` interface (for custom storage implementations)
- `CacheEntry` interface
- `Metrics` type

**Proposed improvement:**
Export all user-facing APIs properly from `src/index.ts`.

---

### IMP-013 — `ConsoleLogger` should support log levels and structured output ✅ DONE

**Current state:**
`ConsoleLogger` likely logs everything to console. No level filtering, no structured JSON output for production log aggregators.

**Proposed improvement:**

```ts
const logger = new ConsoleLogger({
  level: 'warn', // Only log warnings and errors in production
  format: 'json', // Structured JSON for log aggregators (Datadog, Splunk)
  prefix: '[MyApp:HTTP]', // Custom prefix
  redactHeaders: ['Authorization', 'Cookie'], // Redact sensitive headers
});
```

---

### IMP-014 — `CacheManager` should support `maxSize` in bytes, not just entry count

**Current state:**
`MemoryAdapter` only limits cache by number of entries (`maxEntries: 100`). One entry could hold megabytes of data.

**Proposed improvement:**

```ts
const client = new HTTPBuilder()
  .withCache({
    maxEntries: 100,
    maxSizeBytes: 5 * 1024 * 1024, // 5MB total cache limit
    ttl: 60000,
  })
  .build();
```

---

### IMP-015 — Request/response body logging should be opt-in with size limits

**Current state:**
When logger is attached, request config (including headers) is logged. But request/response bodies are not logged, making debugging harder.

**Proposed improvement:**

```ts
const client = new HTTPBuilder()
  .withLogger(logger, {
    logRequestBody: true,
    logResponseBody: true,
    maxBodyLogSize: 1024, // Only log first 1KB of bodies
    redactFields: ['password', 'token', 'secret'],
  })
  .build();
```

---

## P3 — Nice-to-Have

---

### IMP-016 — Interactive DevTools browser extension / overlay

**Current state:**
Mentioned in `todo.md` as pending (Phase 9).

**Proposed improvement:**
A browser devtools panel (or injected overlay) that shows:

- All in-flight requests with timing
- Cache hit/miss visualization
- Queue status (pending, running, completed tasks)
- Circuit breaker state per endpoint
- Rate limiter token bucket visualization

This would make Reixo stand out vs axios/fetch for debugging complex apps.

---

### IMP-017 — Framework integrations: Vue Composables and Svelte Stores

**Current state:**
Mentioned as future in `todo.md`.

**Proposed improvement:**

```ts
// reixo-vue
const { data, loading, error } = useReixo('/api/users', { client });

// reixo-svelte
const users = reixoStore('/api/users', { client });
// $users.data, $users.loading, $users.error
```

---

### IMP-018 — `poll()` helper should support smarter stopping conditions ✅ DONE

**Current state:**
`poll()` supports a basic stop condition and timeout. No support for polling until a specific value appears or for adaptive intervals based on response content.

**Proposed improvement:**

```ts
const result = await poll(() => client.get('/api/job/123'), {
  until: (response) => response.data.status === 'completed',
  interval: 2000,
  maxDuration: 60000,
  adaptiveInterval: (response) => (response.data.progress < 50 ? 5000 : 1000), // Poll faster as it nears completion
});
```

---

### IMP-019 — Changelog automation with Conventional Commits

**Current state:**
`CHANGELOG.md` exists but requires manual management. `standard-version` is deprecated.

**Proposed improvement:**
Migrate to `@changesets/cli` or `release-it` with `@release-it/conventional-changelog` plugin. This:

- Auto-generates changelogs from commit messages
- Supports monorepo workflows
- Is actively maintained

---

### IMP-020 — `prefetch()` should return a cancellable handle ✅ DONE

**Current state:**
`prefetch()` returns `void` with no way to cancel the background fetch.

**Proposed improvement:**

```ts
const handle = client.prefetch('/api/data');
// If user navigates away before hover completes
handle.cancel();
```

---

_End of improvements file. See `03-ARCHITECTURE.md` for architectural analysis._
