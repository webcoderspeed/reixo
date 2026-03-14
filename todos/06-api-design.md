# Sprint 06 — API Design

> Priority: 🟡 P2
> API design issues don't cause crashes but create confusion, misuse, or breakage during future refactors. Fix before 1.0 public stable to avoid semver-breaking changes later.

---

## DESIGN-01 · `MockAdapter` inaccurate `statusText` mapping

**File:** `src/utils/mock-adapter.ts` · **Line:** ~192
**Severity:** 🟡 MEDIUM

### Problem

```typescript
// Current
statusText: status === 200 ? 'OK' : 'Mock Response',
```

Only `200` gets a real `statusText`. Every other status — `201 Created`, `400 Bad Request`, `404 Not Found`, `500 Internal Server Error` — gets the generic string `'Mock Response'`. Tests that assert `response.statusText` will silently pass with wrong values.

### Fix

Add a complete HTTP status text map:

```typescript
const HTTP_STATUS_TEXT: Record<number, string> = {
  100: 'Continue',
  101: 'Switching Protocols',
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  204: 'No Content',
  206: 'Partial Content',
  301: 'Moved Permanently',
  302: 'Found',
  304: 'Not Modified',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  408: 'Request Timeout',
  409: 'Conflict',
  410: 'Gone',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

// Usage
statusText: HTTP_STATUS_TEXT[status] ?? `Unknown Status ${status}`,
```

---

## DESIGN-02 · `revalidateOnFocus` behavior vs. documentation mismatch (API design aspect)

**File:** `src/core/http-client.ts`
**Severity:** 🟡 MEDIUM — already covered in BUG-01, but also an API design concern

This affects the public contract of `RequestConfig`. The fix (`=== true` instead of `!== false`) is in `01-critical-bugs.md`. The API design concern here is: **document the default explicitly** in the type definition and add it to the public API changelog.

```typescript
interface RequestConfig {
  /**
   * Whether to re-fetch when the browser tab regains focus.
   *
   * ⚠️ Defaults to `false`. You must explicitly set `revalidateOnFocus: true`
   * to enable this behavior.
   *
   * @default false
   */
  revalidateOnFocus?: boolean;
}
```

---

## DESIGN-03 · Inconsistent error types across the library

**File:** Multiple — `retry.ts`, `circuit-breaker.ts`, `auth.ts`, `graphql-client.ts`
**Severity:** 🟡 MEDIUM

### Problem

The library has several internal error classes:

- `RetryError` (in `retry.ts`)
- (Implied) `HTTPError` (referenced in `auth.ts`)
- GraphQL errors (array of `{message, path, extensions}`)
- Circuit breaker errors (unknown shape)

These don't share a common base class or discriminant field. Consumers handling errors must check each type separately, and there's no exhaustive union to catch "all reixo errors."

### Fix

Create a unified error hierarchy:

```typescript
// src/errors/index.ts

export abstract class ReixoError extends Error {
  abstract readonly code: string;
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = this.constructor.name;
  }
}

export class HTTPError extends ReixoError {
  readonly code = 'HTTP_ERROR';
  constructor(
    message: string,
    public readonly status: number,
    public readonly response: Response
  ) {
    super(message);
  }
}

export class RetryError extends ReixoError {
  readonly code = 'RETRY_EXHAUSTED';
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly cause: unknown
  ) {
    super(message, { cause });
  }
}

export class CircuitOpenError extends ReixoError {
  readonly code = 'CIRCUIT_OPEN';
  constructor(public readonly retryAfter: Date) {
    super(`Circuit breaker is open. Retry after ${retryAfter.toISOString()}`);
  }
}

export class RateLimitError extends ReixoError {
  readonly code = 'RATE_LIMITED';
  constructor(public readonly retryAfterMs: number) {
    super(`Rate limit exceeded. Retry after ${retryAfterMs}ms`);
  }
}

export type AnyReixoError = HTTPError | RetryError | CircuitOpenError | RateLimitError;
```

---

## DESIGN-04 · `NetworkMonitor` event callback API is inconsistent

**File:** `src/utils/network.ts`
**Severity:** 🟢 LOW

### Problem

`NetworkMonitor` likely uses `addEventListener` style callbacks. But other reixo utilities (circuit breaker, queue) emit events differently. There's no standard event emission pattern across the library.

### Fix

Standardize on either:

**Option A — EventEmitter style (Node.js):**

```typescript
monitor.on('online', () => console.log('back online'));
monitor.on('offline', () => console.log('went offline'));
```

**Option B — Subscription style (browser-friendly, no EventEmitter dep):**

```typescript
const unsub = monitor.onStatusChange((status) => {
  if (status === 'online') refetchAll();
});
// cleanup
unsub();
```

Option B is recommended for browser targets as it avoids Node.js `EventEmitter` and returns a proper cleanup function.

Whichever pattern is chosen, apply it consistently across `NetworkMonitor`, `PollingController`, `CircuitBreaker`, and `TaskQueue`.

---

## DESIGN-05 · `InfiniteQuery` `getNextPageParam` is optional but behavior without it is undocumented

**File:** `src/utils/infinite-query.ts`
**Severity:** 🟢 LOW

### Problem

The `getNextPageParam` option appears optional in the config type. When it's not provided, `hasNextPage` falls through to an undocumented default heuristic (checking if last page had items). This default is:

- Not documented in JSDoc
- Potentially wrong for APIs that return `{ items: [], total: 0 }` (where `lastPage` is truthy even when empty)

### Fix

Make `getNextPageParam` required OR document the default behavior clearly:

```typescript
interface InfiniteQueryOptions<T, C = unknown> {
  /**
   * Given the last page and all pages, return the cursor for the next page,
   * or `undefined` / `null` if there are no more pages.
   *
   * If not provided, reixo assumes there are more pages when the last page
   * is a non-empty array. This may not be correct for all APIs.
   */
  getNextPageParam?: (lastPage: T, allPages: T[]) => C | undefined | null;
}
```

---

## DESIGN-06 · `client.get()` and `client.post()` return `Result<T, E>` but error type `E` is not inferred

**File:** `src/core/http-client.ts`
**Severity:** 🟡 MEDIUM

### Problem

The `Result<T, E>` pattern is a core value proposition of reixo (no thrown exceptions). But if `E` defaults to `unknown` or `Error`, callers must cast or narrow the error before using it — defeating much of the benefit.

### Fix

Thread the error type through the API surface so callers get the correct union:

```typescript
// Instead of:
get<T>(url: string): Promise<Result<T, Error>>

// Use:
get<T, E extends ReixoError = AnyReixoError>(
  url: string,
  config?: RequestConfig,
): Promise<Result<T, E>>
```

With proper error hierarchy (from DESIGN-03), TypeScript can narrow `E` on the error branch:

```typescript
const result = await client.get<User>('/users/1');
if (result.isErr()) {
  // result.error is typed as AnyReixoError
  if (result.error instanceof HTTPError) {
    console.log(result.error.status); // typed: number
  }
}
```

---

## Summary Table

| ID        | File                | Issue                                                | Priority |
| --------- | ------------------- | ---------------------------------------------------- | -------- |
| DESIGN-01 | `mock-adapter.ts`   | Inaccurate `statusText` mapping                      | 🟡 P2    |
| DESIGN-02 | `http-client.ts`    | `revalidateOnFocus` default undocumented in types    | 🟡 P2    |
| DESIGN-03 | Multiple            | Inconsistent error types, no common base             | 🟡 P2    |
| DESIGN-04 | `network.ts`        | Inconsistent event callback pattern                  | 🟢 P3    |
| DESIGN-05 | `infinite-query.ts` | `getNextPageParam` optional but undocumented default | 🟢 P3    |
| DESIGN-06 | `http-client.ts`    | Error type `E` not inferred through Result API       | 🟡 P2    |
