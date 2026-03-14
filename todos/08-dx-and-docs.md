# Sprint 08 — Developer Experience & Documentation

> Priority: 🟢 P3
> Good DX keeps contributors productive and helps users adopt the library quickly. These are not urgent bugs, but they compound: every missing doc is a future GitHub issue.

---

## DX-01 · Add JSDoc to all public APIs

**Status:** Partially done — some utilities have JSDoc, others have none.
**Files affected:** All files in `src/core/` and `src/utils/`

### What to add

Every exported class, method, and config interface needs:

1. **Description** — what it does, not how it does it
2. **`@param`** — for each non-obvious parameter
3. **`@returns`** — describe the return value and success/error variants
4. **`@example`** — at least one working code snippet
5. **`@throws`** — if the method can throw (rare in Result<T,E> API but document it)
6. **`@default`** — for optional config fields with defaults

### Priority order

Start with the most-used APIs:

```
1. ReixoClient (get, post, put, patch, delete, stream)
2. CircuitBreaker
3. withRetry
4. RateLimiter
5. MockAdapter
6. InfiniteQuery
7. NetworkMonitor
8. SecurityUtils
```

### Example standard

```typescript
/**
 * Executes `fn` up to `maxAttempts` times, with exponential back-off between
 * attempts. Uses jitter to avoid thundering-herd problems.
 *
 * @param fn - Async function to retry on failure.
 * @param options - Retry configuration.
 * @returns The result of `fn` on the first successful attempt.
 *
 * @throws {RetryError} When all attempts are exhausted. The `cause` field
 *   contains the last error thrown by `fn`.
 *
 * @example
 * const data = await withRetry(() => fetchUser(id), {
 *   maxAttempts: 3,
 *   baseDelay: 500,
 *   shouldRetry: (e) => e instanceof NetworkError,
 * });
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T>;
```

---

## DX-02 · README.md needs a Quick Start section

**File:** `README.md`

### What's missing

The README appears to have API reference but lacks:

- A 10-line "Hello World" — how to create a client and make a request
- A "Common patterns" section (auth interceptor, retry + circuit breaker, offline queue)
- A "Migrating from axios/ky" section

### Suggested Quick Start

```markdown
## Quick Start

\`\`\`typescript
import { ReixoClient } from 'reixo';

const client = new ReixoClient({ baseURL: 'https://api.example.com' });

// Result<T, E> — never throws
const result = await client.get<User>('/users/1');

if (result.isErr()) {
console.error('Request failed:', result.error.message);
return;
}

console.log('User:', result.value.name);
\`\`\`

## With Auth + Retry

\`\`\`typescript
const client = new ReixoClient({
baseURL: 'https://api.example.com',
auth: {
type: 'bearer',
token: () => localStorage.getItem('token'),
refreshToken: () => refreshAccessToken(),
},
retry: { maxAttempts: 3, baseDelay: 500 },
circuitBreaker: { threshold: 5, timeout: 30_000 },
});
\`\`\`
```

---

## DX-03 · Export a single barrel index that re-exports everything

**File:** `src/index.ts`

### Problem

Consumers currently need to know the internal path of each utility:

```typescript
// Current (if barrel is missing or incomplete)
import { ReixoClient } from 'reixo/core/http-client';
import { withRetry } from 'reixo/utils/retry';
import { MockAdapter } from 'reixo/utils/mock-adapter';
```

### Fix

Ensure `src/index.ts` exports everything consumers need:

```typescript
// Public API surface
export { ReixoClient } from './core/http-client';
export { GraphQLClient } from './core/graphql-client';
export { withRetry, RetryError } from './utils/retry';
export { CircuitBreaker, CircuitOpenError } from './utils/circuit-breaker';
export { RateLimiter } from './utils/rate-limiter';
export { MockAdapter } from './utils/mock-adapter';
export { InfiniteQuery } from './utils/infinite-query';
export { NetworkMonitor, networkMonitor } from './utils/network';
export { PollingController } from './utils/polling';
export { SecurityUtils } from './utils/security';
export { TaskQueue } from './utils/queue';
export { ResumableUploader } from './utils/upload';

// Types
export type {
  RequestConfig,
  Result,
  ReixoError,
  HTTPError,
  RetryOptions,
  CircuitBreakerOptions,
  RateLimiterOptions,
} from './types';
```

Keep internal utilities (internal-log, etc.) unexported.

---

## DX-04 · Add a `CHANGELOG.md`

**File:** `CHANGELOG.md` (new)

Follow the [Keep a Changelog](https://keepachangelog.com) format. Start with the current version and document all breaking changes, bug fixes, and additions going forward. This is essential for semver adoption.

```markdown
# Changelog

## [Unreleased]

### Fixed

- `revalidateOnFocus` now correctly defaults to `false` (was `true` due to `!== false` guard)
- `buildDedupKey` no longer throws on circular body objects
- `InfiniteQuery.hasNextPage` returns `false` before any page is loaded

### Changed

- `SENSITIVE_FIELDS` expanded to include `access_token`, `refresh_token`, `api_key`, etc.

## [0.x.x] — previous release

...
```

---

## DX-05 · Add `CONTRIBUTING.md`

**File:** `CONTRIBUTING.md` (new)

Short guide covering:

- How to run tests locally (`npm test`)
- How to run the example apps (`cd examples && npm start`)
- Commit message convention (Conventional Commits recommended)
- PR checklist: tests, types, JSDoc, CHANGELOG entry

---

## DX-06 · Improve error messages

**Files:** `retry.ts`, `circuit-breaker.ts`, `rate-limiter.ts`

### Problem

Current error messages are generic:

```
Error: Request failed
Error: Circuit breaker open
Error: Rate limited
```

### Better messages include actionable context:

```typescript
// RetryError
throw new RetryError(
  `[reixo] withRetry: all ${maxAttempts} attempts failed for ${requestDescription}. ` +
    `Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  maxAttempts,
  lastError
);

// CircuitOpenError
throw new CircuitOpenError(
  `[reixo] Circuit breaker OPEN for "${name}". ` +
    `Opened after ${failures} consecutive failures. ` +
    `Retry after ${retryAfter.toISOString()}.`,
  retryAfter
);
```

---

## DX-07 · Ship TypeScript source maps

**File:** `tsconfig.json` / `package.json`

Ensure the npm package includes source maps so developers debugging with reixo get TypeScript line numbers in stack traces, not compiled JS line numbers.

```json
// tsconfig.json
{
  "compilerOptions": {
    "declarationMap": true,
    "sourceMap": true
  }
}

// package.json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs"
    }
  },
  "files": ["dist", "src"]  // include src for source maps
}
```

---

## Summary Table

| ID    | File              | Issue                               | Effort |
| ----- | ----------------- | ----------------------------------- | ------ |
| DX-01 | All public files  | Missing JSDoc on public APIs        | 3–4 h  |
| DX-02 | `README.md`       | No Quick Start or migration guide   | 1 h    |
| DX-03 | `src/index.ts`    | Incomplete barrel export            | 30 min |
| DX-04 | `CHANGELOG.md`    | No changelog                        | 30 min |
| DX-05 | `CONTRIBUTING.md` | No contributor guide                | 30 min |
| DX-06 | Multiple          | Generic error messages              | 1 h    |
| DX-07 | `tsconfig.json`   | No source maps in published package | 20 min |
