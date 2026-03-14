# Sprint 02 — Type Safety

> Priority: 🟠 P1 — Fix before 1.0 stable.
> Unsafe casts let runtime errors bypass TypeScript's type system, converting compile-time safety into runtime surprises.

---

## TYPE-01 · Unsafe `error as HTTPError` cast in `auth.ts`

**File:** `src/utils/auth.ts` · **Line:** ~93
**Severity:** 🟠 HIGH

### Problem

```typescript
// Current
} catch (error) {
  const httpError = error as HTTPError;   // ← no type guard
  if (httpError.status === 401) {
    // ... trigger refresh
  }
}
```

TypeScript `catch` binds `error` as `unknown`. Casting directly to `HTTPError` without checking tells TS "trust me, I know what this is" — but at runtime `error` could be:

- A plain `Error` (network timeout, DNS failure)
- A string thrown by third-party code
- `undefined` (some Promise rejection patterns)
- An `HTTPError` from a different version of reixo

If `error` is not an `HTTPError`, accessing `.status` returns `undefined`, the `=== 401` check silently fails, and the token refresh never runs. Auth appears broken with no error message.

### Fix

Add a proper type guard:

```typescript
// src/utils/auth.ts

function isHTTPError(error: unknown): error is HTTPError {
  return (
    error instanceof Error &&
    'status' in error &&
    typeof (error as any).status === 'number'
  );
}

// Usage
} catch (error) {
  if (isHTTPError(error) && error.status === 401) {
    // ... trigger refresh
  } else {
    // Re-throw non-HTTP errors
    throw error;
  }
}
```

---

## TYPE-02 · Unsafe nested cast in `graphql-client.ts`

**File:** `src/core/graphql-client.ts` · **Line:** ~127
**Severity:** 🟠 HIGH

### Problem

```typescript
// Current (approximate)
const gqlErrors = (
  error as {
    response?: {
      data?: {
        errors?: GraphQLError[];
      };
    };
  }
).response?.data?.errors;
```

This inline cast has no type guard. If `error` is a plain `Error` or a network error, `.response` is `undefined` (fine due to optional chaining), but the entire type assertion is still unsound. Future refactoring can silently break this by introducing a different error shape.

### Fix

Define the error shape as a proper interface and use a type guard:

```typescript
interface GraphQLHTTPError {
  response: {
    data?: {
      errors?: GraphQLError[];
    };
    status: number;
  };
}

function isGraphQLHTTPError(e: unknown): e is GraphQLHTTPError {
  return (
    typeof e === 'object' &&
    e !== null &&
    'response' in e &&
    typeof (e as any).response === 'object'
  );
}

// Usage
if (isGraphQLHTTPError(error)) {
  const gqlErrors = error.response.data?.errors;
  // ...
}
```

---

## TYPE-03 · `MockAdapter` response body typed as `any`

**File:** `src/utils/mock-adapter.ts`
**Severity:** 🟡 MEDIUM

### Problem

```typescript
interface MockResponse {
  status: number;
  body?: any; // ← too wide
  headers?: Record<string, string>;
  delay?: number;
}
```

Typing `body` as `any` removes all type checking on mock response bodies. A typo like `{ usre: 'Alice' }` instead of `{ user: 'Alice' }` will not be caught by the compiler.

### Fix

```typescript
interface MockResponse<T = unknown> {
  status: number;
  body?: T;
  headers?: Record<string, string>;
  delay?: number;
}

// Mock registration becomes generically typed
mock.onGet<User>('/users/1', { status: 200, body: { id: 1, name: 'Alice' } });
```

---

## TYPE-04 · `RequestConfig.body` typed as `any`

**File:** `src/core/http-client.ts` (or `src/types/`)
**Severity:** 🟡 MEDIUM

### Problem

If `body` in `RequestConfig` is typed `any`, TypeScript silently allows anything — including the circular-reference objects that trigger BUG-03. Narrowing the type gives earlier, more helpful errors.

### Fix

```typescript
interface RequestConfig {
  // Use unknown instead of any — forces callers to handle serialization
  body?: unknown;
  // ...
}
```

`unknown` forces the serialization layer (`buildDedupKey`, `JSON.stringify`) to handle the value explicitly rather than silently passing it through.

---

## TYPE-05 · `RetryError` causes field as `any`

**File:** `src/utils/retry.ts`
**Severity:** 🟡 MEDIUM

### Problem

```typescript
class RetryError extends Error {
  constructor(
    message: string,
    public readonly cause: any,   // ← should be Error | unknown
    public readonly attempts: number,
  ) { ... }
}
```

`cause: any` bypasses type safety on the underlying error. Callers that access `retryError.cause.message` can crash if `cause` is not an `Error`.

### Fix

```typescript
class RetryError extends Error {
  constructor(
    message: string,
    public readonly cause: unknown,
    public readonly attempts: number
  ) {
    super(message, { cause }); // native Error.cause support (Node 16.9+)
  }
}
```

---

## TYPE-06 · `CircuitBreaker` state as plain string

**File:** `src/utils/circuit-breaker.ts`
**Severity:** 🟢 LOW

### Problem

```typescript
private state: string = 'CLOSED';
```

Using a plain `string` means any typo (`'CLOSD'`, `'open'`) compiles silently.

### Fix

```typescript
type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

private state: CircuitBreakerState = 'CLOSED';
```

If this type is already defined elsewhere in the file, ensure it is exported so consumers can use it in type guards.

---

## TYPE-07 · `PollingController` callback typed loosely

**File:** `src/utils/polling.ts`
**Severity:** 🟢 LOW

### Problem

If the polling task callback is typed as `() => any` or `() => unknown`, callers get no help with return types. For async pollers that return data, the consumer must manually type-assert the result.

### Fix

Make `PollingController` generic:

```typescript
class PollingController<T> {
  constructor(
    private task: () => Promise<T>,
    private onResult: (result: T) => void,
    private onError: (error: unknown) => void,
    config?: PollingConfig,
  ) { ... }
}
```

---

## TYPE-08 · Missing strict null checks in `CacheManager`

**File:** `src/utils/cache.ts`
**Severity:** 🟡 MEDIUM

### Problem

```typescript
async get<T>(key: string): Promise<T | null> {
  const raw = await this.adapter.get(key);
  return JSON.parse(raw);   // ← raw could be null
}
```

If `adapter.get` returns `null` (cache miss), `JSON.parse(null)` returns `null` in JavaScript — accidentally "working" but semantically wrong. With `strictNullChecks`, the `raw` variable should be typed as `string | null` and the null case handled explicitly:

```typescript
async get<T>(key: string): Promise<T | null> {
  const raw = await this.adapter.get(key);
  if (raw === null || raw === undefined) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;  // corrupted cache entry
  }
}
```

---

## Summary Table

| ID      | File                    | Issue                                 | Fix effort |
| ------- | ----------------------- | ------------------------------------- | ---------- |
| TYPE-01 | `auth.ts:93`            | `error as HTTPError` unsafe cast      | 30 min     |
| TYPE-02 | `graphql-client.ts:127` | nested inline cast for GraphQL errors | 30 min     |
| TYPE-03 | `mock-adapter.ts`       | `body?: any` in `MockResponse`        | 20 min     |
| TYPE-04 | `http-client.ts`        | `body?: any` in `RequestConfig`       | 20 min     |
| TYPE-05 | `retry.ts`              | `cause: any` in `RetryError`          | 15 min     |
| TYPE-06 | `circuit-breaker.ts`    | state as plain `string`               | 10 min     |
| TYPE-07 | `polling.ts`            | untyped callback                      | 20 min     |
| TYPE-08 | `cache.ts`              | null not handled after `adapter.get`  | 20 min     |
