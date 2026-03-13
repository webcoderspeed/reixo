# 🐛 Bugs & Issues — Reixo

> Detailed list of all bugs, code defects, and issues found during analysis.
> Last reviewed: 2026-03-13 | Status updated: 2026-03-13

---

## CRITICAL

---

### BUG-001 — `destroy()` and `dispose()` are two separate methods doing different things

**Status: ✅ FIXED** — `destroy()` now calls `dispose()` and is marked `@deprecated`.

**File:** `src/core/http-client.ts` (lines 174–201 and 313–315)

**Problem:**
There were two public cleanup methods with different behavior:

- `dispose()` — Did full cleanup: aborts all controllers, clears in-flight requests, destroys pool, runs cleanup callbacks, removes event listeners.
- `destroy()` — Only called `this.connectionPool?.destroy()` — everything else leaked.

**Fix applied:**

```ts
// destroy() now delegates to dispose()
public destroy(): void {
  this.dispose();
}
```

**Severity:** 🔴 Critical — memory leak in production apps

---

### BUG-002 — `mutate()` generates cache key but immediately discards it (dead code)

**Status: ✅ FIXED** — Key now assigned to `const key`.

**File:** `src/core/http-client.ts` (line 437)

**Problem:**

```ts
// BEFORE — result discarded!
this.cacheManager.generateKey(url, options.params);
```

**Fix applied:**

```ts
// AFTER — key is properly assigned
const key = this.cacheManager.generateKey(url, options.params);
```

**Severity:** 🔴 Critical — optimistic updates silently malfunction

---

### BUG-003 — `isQueuePaused` access concern

**Status: ℹ️ NOT A BUG** — `isQueuePaused` is a public getter on `TaskQueue` (line 222–224 in queue.ts). Analysis was incorrect.

---

## HIGH

---

### BUG-004 — BaseURL + URL concatenation has no slash normalization

**Status: ✅ FIXED** — Slash normalization added in `http.ts`.

**File:** `src/utils/http.ts` (line 102)

**Problem:** `"https://api.example.com"` + `"users"` → `"https://api.example.comusers"` ❌

**Fix applied:**

```ts
const baseUrlWithUrl = baseURL ? `${baseURL.replace(/\/$/, '')}/${url.replace(/^\//, '')}` : url;
```

**Severity:** 🟠 High — requests silently sent to wrong URLs

---

### BUG-005 — Inner `AbortController` in `http.ts` NOT connected to outer one from `HTTPClient`

**Status: ✅ FIXED** — Outer signal now linked to inner controller via event listener.

**File:** `src/utils/http.ts`

**Problem:** `fetchWithTimeout()` created a new `AbortController` and overrode the outer signal passed from `HTTPClient`, making `dispose()` / cancellation ineffective.

**Fix applied:** The outer `requestInit.signal` is now detected; if it's already aborted the inner controller aborts immediately, otherwise an `abort` event listener propagates the abort.

**Severity:** 🟠 High — request cancellation and dispose() didn't actually cancel fetches

---

### BUG-006 — `params` array values not serialized correctly

**Status: ✅ FIXED** — Array support added in `http.ts` and `keys.ts`.

**File:** `src/utils/http.ts`, `src/utils/keys.ts`

**Problem:** `{ tags: ['a', 'b'] }` → `"tags=a%2Cb"` ❌ (wrong)

**Fix applied:** `flatMap` now handles array values, producing `"tags=a&tags=b"` ✅
Both `params` type in `HTTPOptions` and `generateKey()` updated to accept `Array<string | number | boolean>`.

**Severity:** 🟠 High — APIs needing array params received wrong values

---

### BUG-007 — `WebStorageAdapter` throws in Node.js/SSR instead of gracefully degrading

**Status: ✅ FIXED** — `CacheManager` and `TaskQueue` now catch and fall back to `MemoryAdapter`.

**File:** `src/utils/cache.ts`, `src/utils/queue.ts`

**Problem:** Constructor threw immediately in Node/SSR if `window` is undefined.

**Fix applied:**

```ts
try {
  this.adapter = new WebStorageAdapter(options.storage, options.keyPrefix);
} catch {
  console.warn('[Reixo] localStorage not available — falling back to MemoryAdapter.');
  this.adapter = new MemoryAdapter(options.maxEntries || 100);
}
```

**Severity:** 🟠 High — breaks SSR apps

---

### BUG-008 — `read()` (Suspense method) causes infinite re-fetch loop

**Status: ✅ FIXED** — Dedicated `suspenseRequests` Map added to store thrown promises.

**File:** `src/core/http-client.ts`

**Problem:** Each React render cycle called `read()`, which threw a new `Promise` every time when deduplication was disabled — causing React to re-render again, creating an infinite loop.

**Fix applied:** A `private suspenseRequests = new Map()` now stores thrown promises. Subsequent calls within the same render cycle throw the same promise reference. The entry is cleaned up via `.finally()` after the request completes.

**Severity:** 🟠 High — suspense integration caused infinite loops

---

## MEDIUM

---

### BUG-009 — `requestId` collision risk with `Math.random()`

**Status: ✅ FIXED** — Replaced with `crypto.randomUUID()`.

**File:** `src/core/http-client.ts` (line 659)

**Fix applied:**

```ts
// BEFORE
const requestId = Math.random().toString(36).substring(2, 15);
// AFTER
const requestId = crypto.randomUUID();
```

**Severity:** 🟡 Medium

---

### BUG-010 — `MemoryAdapter` uses FIFO eviction, not LRU

**Status: ✅ FIXED** — LRU implemented using Map insertion order.

**File:** `src/utils/cache.ts`

**Fix applied:** `get()` now deletes and re-inserts the entry to move it to the "most recently used" end of the Map. `set()` also does the same. The first entry (least recently used) is evicted when at capacity.

**Severity:** 🟡 Medium

---

### BUG-011 — `ValidationError` not exported from `index.ts`

**Status: ✅ FIXED** — Now exported from `src/index.ts`.

**Fix applied:**

```ts
export { HTTPError, ValidationError } from './utils/http';
export type { HTTPOptions, HTTPResponse, ValidationSchema } from './utils/http';
```

**Severity:** 🟡 Medium

---

### BUG-012 — Retry retries non-retryable 4xx errors

**Status: ℹ️ NOT A BUG** — `http.ts` already has a correct `retryCondition` that only retries 5xx, 429, 408 and network errors. Analysis was incorrect.

---

### BUG-013 — `post()`/`put()`/`patch()` share identical FormData serialization logic

**Status: ✅ FIXED** — Extracted to private `_serializeBody()` helper method.

**File:** `src/core/http-client.ts`

**Fix applied:** A single `private _serializeBody(data, options)` method handles FormData detection, Content-Type management, and JSON stringify. All three mutation methods now call this helper.

**Severity:** 🟡 Medium

---

### BUG-014 — `queueOfflineRequest` uses `Math.random()` for IDs

**Status: ✅ FIXED** — Replaced with `crypto.randomUUID()` in `http-client.ts` and `queue.ts`.

**Severity:** 🟡 Medium

---

## LOW

---

### BUG-015 — `standard-version` is officially deprecated

**Status: ⚠️ PENDING** — Requires migration to `@changesets/cli` or `release-it`. (Sprint 3)

**Severity:** 🔵 Low

---

### BUG-016 — `@types/node` version `^25.0.10` does not exist

**Status: ✅ FIXED** — Changed to `^22.0.0` in `package.json`.

**Severity:** 🔵 Low

---

### BUG-017 — Response `config` field in cached responses is incomplete

**Status: ⚠️ PENDING** — Minor type mismatch. Acceptable for now. (Sprint 3)

**Severity:** 🔵 Low

---

## Summary

| Status                | Count  |
| --------------------- | ------ |
| ✅ Fixed              | 13     |
| ℹ️ Not a Bug          | 2      |
| ⚠️ Pending (Sprint 3) | 2      |
| **Total**             | **17** |

---

## Improvements Added (from IMP list)

| ID      | Feature                                                                                                                                                                                                                                 | Status  |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| IMP-002 | HEAD & OPTIONS HTTP methods added to `HTTPClient`                                                                                                                                                                                       | ✅ Done |
| IMP-012 | Missing types exported: `CacheManager`, `MemoryAdapter`, `WebStorageAdapter`, `RateLimiter`, `MetricsCollector`, `CacheOptions`, `CacheEntry`, `StorageAdapter`, `PersistentQueueOptions`, `QueueEvents`, `Metrics`, `ValidationSchema` | ✅ Done |

---

_See `04-PRIORITY-MATRIX.md` for upcoming Sprint 3 work._
