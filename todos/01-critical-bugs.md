# Sprint 01 — Critical Bugs

> Priority: 🔴 P0 — Fix before any release.
> These bugs cause incorrect runtime behavior, silent data corruption, or test infrastructure failures.

---

## BUG-01 · `revalidateOnFocus` default mismatch

**File:** `src/core/http-client.ts` · **Line:** ~606
**Severity:** 🔴 HIGH — silent bandwidth waste, unexpected re-fetches on tab focus

### Problem

The JSDoc for `revalidateOnFocus` says `@default false`, but the runtime guard is:

```typescript
// CURRENT (wrong)
if (requestConfig.revalidateOnFocus !== false) {
  window.addEventListener('focus', focusHandler);
}
```

`!== false` is truthy for `undefined`, so if the caller never sets `revalidateOnFocus`, the focus listener is registered — the opposite of what the documentation promises.

### Impact

Every `get()` call without an explicit `revalidateOnFocus: false` silently attaches a `window focus` listener. On a busy SPA with many concurrent queries, users re-entering the tab trigger a flood of duplicate requests.

### Fix

```typescript
// CORRECT
if (requestConfig.revalidateOnFocus === true) {
  window.addEventListener('focus', focusHandler);
}
```

Also update JSDoc to be unambiguous:

```typescript
/**
 * Re-fetch when the browser window regains focus.
 * @default false
 */
revalidateOnFocus?: boolean;
```

### Verification

- Unit test: create a `get()` request without `revalidateOnFocus` set, fire a `focus` event, assert the handler was NOT called.
- Unit test: set `revalidateOnFocus: true`, fire `focus`, assert handler WAS called.

---

## BUG-02 · `RateLimiter.waitForToken()` race condition

**File:** `src/utils/rate-limiter.ts`
**Severity:** 🔴 HIGH — over-consumption of rate-limited slots under concurrency

### Problem

The token bucket implementation has a classic TOCTOU (time-of-check / time-of-use) race:

```typescript
// Simplified current logic
async waitForToken(): Promise<void> {
  const wait = this.getTimeToWait();  // ← reads current token count
  if (wait > 0) {
    await sleep(wait);                // ← both callers sleep same duration
  }
  this.tryConsume();                  // ← both callers try to consume
}
```

When two requests arrive at the same time with one token left:

1. Caller A calls `getTimeToWait()` → 0 ms (token available)
2. Caller B calls `getTimeToWait()` → 0 ms (same token, still there)
3. Both proceed to `tryConsume()`, consuming 1 token twice
4. Token count goes negative → rate limit is silently violated

### Fix

Serialize token acquisition with a mutex or a promise chain queue:

```typescript
private queue: Promise<void> = Promise.resolve();

waitForToken(): Promise<void> {
  // Chain onto the existing queue — only one caller advances at a time
  this.queue = this.queue.then(() => this._acquireToken());
  return this.queue;
}

private async _acquireToken(): Promise<void> {
  const wait = this.getTimeToWait();
  if (wait > 0) {
    await sleep(wait);
  }
  this.tryConsume();
}
```

This ensures `tryConsume()` is never called by two concurrent callers for the same token slot.

### Verification

- Test: fire 10 concurrent requests against a limiter set to `5 req/s`. Assert that exactly 5 requests complete in the first window and 5 in the second — no more, no less.

---

## BUG-03 · `buildDedupKey` throws on circular references

**File:** `src/utils/dedup.ts`
**Severity:** 🔴 HIGH — crashes entire request pipeline

### Problem

```typescript
function buildDedupKey(config: RequestConfig): string {
  return `${config.method}:${config.url}:${JSON.stringify(config.body)}`;
}
```

`JSON.stringify` throws `TypeError: Converting circular structure to JSON` when `config.body` contains circular references (common with framework model objects, Mongoose documents, or accidentally self-referencing state).

This crash propagates up through `dedup.ts` → `http-client.ts`, aborting the request entirely with an unhandled error — not even wrapped in a `Result.err`.

### Fix

Option A — safe stringify with fallback:

```typescript
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    // Circular or non-serializable — fall back to a unique marker
    return `[non-serializable:${typeof value}]`;
  }
}

function buildDedupKey(config: RequestConfig): string {
  return `${config.method}:${config.url}:${safeStringify(config.body)}`;
}
```

Option B — use a WeakMap-based serializer that handles cycles (e.g., `flatted` or a custom replacer).

Option A is preferred for zero-dependency compliance.

### Verification

- Test: send a POST with a circular body object. Assert the request completes (not throws), and is treated as non-deduplicated.

---

## BUG-04 · `NetworkMonitor` hardcoded `google.com` ping

**File:** `src/utils/network.ts`
**Severity:** 🔴 HIGH — CORS failure in browsers, breaks all offline detection tests

### Problem

```typescript
private pingUrl = 'https://www.google.com';

private async checkConnectivity(): Promise<boolean> {
  const response = await fetch(this.pingUrl, { method: 'HEAD', ... });
  return response.ok;
}
```

Problems:

1. **Browser CORS** — `google.com` does not send `Access-Control-Allow-Origin: *`. A `HEAD` request from a browser origin to `google.com` will be blocked by CORS policy, making `checkConnectivity` always return `false` in browsers.
2. **Restricted networks** — Corporate environments, China, etc., block `google.com`. Every user in these environments will appear permanently offline.
3. **Tests** — No way to mock connectivity checks without monkey-patching `fetch` globally.

### Fix

Make `pingUrl` configurable with a sensible default that actually works:

```typescript
export interface NetworkMonitorConfig {
  /**
   * URL to HEAD-ping for connectivity checks.
   * Should return 2xx quickly with permissive CORS headers.
   * @default '/favicon.ico'  (same-origin, no CORS needed)
   */
  pingUrl?: string;
  pingInterval?: number;
  pingTimeout?: number;
}

export class NetworkMonitor {
  constructor(config: NetworkMonitorConfig = {}) {
    this.pingUrl = config.pingUrl ?? '/favicon.ico';
    // ...
  }
}
```

Using `/favicon.ico` (same-origin) eliminates CORS entirely and works in all networks.

---

## BUG-05 · `NetworkMonitor` Singleton — untestable, never GC'd

**File:** `src/utils/network.ts`
**Severity:** 🟠 HIGH — test pollution, memory leak in SSR/module reload environments

### Problem

```typescript
// Current pattern (inferred from analysis)
let instance: NetworkMonitor | null = null;

export function getNetworkMonitor(): NetworkMonitor {
  if (!instance) instance = new NetworkMonitor();
  return instance;
}
```

Problems:

1. **Tests** — The singleton persists across test files. One test's connectivity state bleeds into the next.
2. **SSR / module reloads** — In Next.js, Remix, or Vite HMR, module-level singletons survive hot reloads while holding event listeners and timers.
3. **No `destroy()` method** — The polling interval timer is never cleared.

### Fix

Export the class and let the consumer manage lifetime. Provide a convenience default instance separately:

```typescript
export class NetworkMonitor {
  constructor(config?: NetworkMonitorConfig) { ... }
  destroy(): void {
    clearInterval(this.pollInterval);
    window.removeEventListener('online', this.onlineHandler);
    window.removeEventListener('offline', this.offlineHandler);
  }
}

// Convenience singleton — only created when imported, destroyed by consumer
export const networkMonitor = new NetworkMonitor();
```

---

## BUG-06 · `console.error` / `console.warn` leaks

**Files:** `src/utils/polling.ts:183`, `src/utils/cache.ts:104`, `src/utils/queue.ts:56`
**Severity:** 🟠 MEDIUM — pollutes consumer application logs

### Problem

The library emits raw `console.error` / `console.warn` calls that appear in consumers' application logs without any prefix or silencing mechanism.

```typescript
// polling.ts:183
console.error('Polling task error:', error);

// cache.ts:104
console.warn('Failed to save to storage', e);

// queue.ts:56
console.warn(...);
```

### Fix

Create a lightweight internal logger (same pattern as `logixia`'s `internal-log.ts`):

```typescript
// src/utils/internal-log.ts
const silent = typeof process !== 'undefined' ? process.env.REIXO_SILENT_INTERNAL === '1' : false;

export function internalWarn(msg: string, ...args: unknown[]): void {
  if (!silent) console.warn(`[reixo] ${msg}`, ...args);
}

export function internalError(msg: string, ...args: unknown[]): void {
  if (!silent) console.error(`[reixo] ${msg}`, ...args);
}
```

Then replace all raw `console.*` calls in library internals with these helpers. The `[reixo]` prefix makes it immediately clear the message is from the library, not the consumer app. Setting `REIXO_SILENT_INTERNAL=1` silences them entirely (useful in test environments).

---

## BUG-07 · `InfiniteQuery.hasNextPage` returns `true` on empty state

**File:** `src/utils/infinite-query.ts` · **Line:** ~84
**Severity:** 🟠 HIGH — infinite fetch loop on initial load with empty dataset

### Problem

```typescript
get hasNextPage(): boolean {
  if (this.pages.length === 0) return true;  // ← bug
  // ...
}
```

When `pages` is empty (initial state, before the first fetch), `hasNextPage` returns `true`. If the consumer drives fetching based on `hasNextPage` (the standard pattern), this causes an immediate `fetchNextPage()` call even before the first page has loaded, and can create a loop if the first fetch returns an empty array.

### Fix

```typescript
get hasNextPage(): boolean {
  // Before any fetch, we don't know — return false to avoid eager fetches
  if (this.pages.length === 0) return false;

  const lastPage = this.pages[this.pages.length - 1];
  if (!lastPage) return false;

  // Let consumer-provided getNextPageParam determine pagination
  if (this.options.getNextPageParam) {
    return this.options.getNextPageParam(lastPage, this.pages) !== undefined;
  }

  // Default: assume more pages if last page had data
  return Array.isArray(lastPage) ? lastPage.length > 0 : Boolean(lastPage);
}
```

### Verification

- Test: create `InfiniteQuery` with no pages loaded. Assert `hasNextPage === false`.
- Test: load one page that returns an empty array. Assert `hasNextPage === false`.
- Test: load one page with data. Assert `hasNextPage === true` (with default cursor logic).
