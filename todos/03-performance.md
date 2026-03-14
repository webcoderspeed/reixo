# Sprint 03 — Performance

> Priority: 🟡 P2
> These issues don't cause crashes, but they degrade throughput, increase memory pressure, or produce invisible GC pauses under load.

---

## PERF-01 · `MemoryAdapter` O(n) LRU on every `get()`

**File:** `src/utils/cache.ts`
**Severity:** 🟡 MEDIUM

### Problem

The current LRU implementation maintains insertion order by deleting and re-inserting entries in the Map on every `get()` call:

```typescript
get(key: string): string | null {
  const value = this.cache.get(key);
  if (value !== undefined) {
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }
  return null;
}
```

`Map.delete` + `Map.set` is O(1) per operation in V8, so this looks fast — and for small caches it is. But the real cost is the **GC pressure**: every cache `get()` on a hot key creates a new Map entry object and de-references the old one. Under high throughput (thousands of req/s), this creates a constant stream of short-lived Map Entry allocations.

### Better Approach

Use a doubly-linked list + Map for true O(1) LRU with no allocation on `get()` of existing keys:

```typescript
class LRUCache<V> {
  private map = new Map<string, LRUNode<V>>();
  private head: LRUNode<V>; // sentinel (most recent)
  private tail: LRUNode<V>; // sentinel (least recent)

  get(key: string): V | undefined {
    const node = this.map.get(key);
    if (!node) return undefined;
    this.moveToFront(node); // pointer re-wiring, zero allocation
    return node.value;
  }
}
```

This is the standard LRU-Cache algorithm used by `lru-cache` npm and browser engine caches.

If zero-dependency is a strict requirement, at minimum add a comment explaining the trade-off and document that the current implementation is intentionally simple for small caches (< 1000 entries).

---

## PERF-02 · `buildDedupKey` re-stringifies large bodies on every request

**File:** `src/utils/dedup.ts`
**Severity:** 🟡 MEDIUM

### Problem

```typescript
function buildDedupKey(config: RequestConfig): string {
  return `${config.method}:${config.url}:${JSON.stringify(config.body)}`;
}
```

For POST requests with large bodies (e.g., batch GraphQL, file metadata), `JSON.stringify` on every duplicate request wastes CPU. Since the body object reference is the same for true dedup candidates, we can short-circuit with identity comparison.

### Fix

```typescript
// Cache stringified bodies by object identity
const bodyCache = new WeakMap<object, string>();

function safeStringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return String(value);

  const cached = bodyCache.get(value as object);
  if (cached !== undefined) return cached;

  try {
    const str = JSON.stringify(value);
    bodyCache.set(value as object, str);
    return str;
  } catch {
    return `[non-serializable:${Object.prototype.toString.call(value)}]`;
  }
}
```

`WeakMap` ensures the cache doesn't prevent GC of the body objects.

---

## PERF-03 · `subscribe()` in `http-client.ts` leaks event listeners

**File:** `src/core/http-client.ts` · **Line:** ~(subscribe method)
**Severity:** 🟠 HIGH (memory leak under long sessions)

### Problem

The `subscribe()` method for reactive data fetching appears to register a `window.focus` listener without a guaranteed cleanup path:

```typescript
subscribe(config, callback) {
  window.addEventListener('focus', handler);
  // ...
  return () => {
    window.removeEventListener('focus', handler);  // cleanup
  };
}
```

If the returned unsubscribe function is never called (which is common in component unmount race conditions, or if consumers forget), the handler accumulates. Each handler holds a closure reference to the `config` and `callback`, preventing GC of the associated data.

### Fix

1. Ensure `subscribe()` returns an `Unsubscribe` function (it likely does, but verify it's documented and easy to call).
2. Add a `maxSubscriptions` limit with a warning when exceeded:

```typescript
private subscriptionCount = 0;
private readonly MAX_SUBSCRIPTIONS = 100;

subscribe(...): Unsubscribe {
  if (this.subscriptionCount >= this.MAX_SUBSCRIPTIONS) {
    internalWarn(`reixo: ${this.MAX_SUBSCRIPTIONS} active subscriptions — possible leak`);
  }
  this.subscriptionCount++;

  const cleanup = () => {
    this.subscriptionCount--;
    window.removeEventListener('focus', handler);
  };

  return cleanup;
}
```

3. In React-based usage, document clearly: "always call the returned unsubscribe in `useEffect` cleanup".

---

## PERF-04 · `processInBatches` in `upload.ts` uses `Promise.race` incorrectly

**File:** `src/utils/upload.ts`
**Severity:** 🟠 HIGH — partial uploads silently fail, no cleanup

### Problem

```typescript
async processInBatches(chunks: Blob[], concurrency: number): Promise<void> {
  // Approximate current pattern
  const active = new Set<Promise<void>>();
  for (const chunk of chunks) {
    const p = this.uploadChunk(chunk);
    active.add(p);
    if (active.size >= concurrency) {
      await Promise.race(active);  // ← waits for ONE to finish
      // But which one finished? active.size is still >= concurrency
      // until we manually delete the resolved promise — which we don't
    }
  }
}
```

`Promise.race` returns the result of the first settled promise but does NOT remove it from the Set. The Set keeps growing. More critically, if a chunk fails, `Promise.race` rejects immediately with that failure — but the other in-flight chunks continue running silently in the background, consuming network bandwidth and potentially corrupting the upload state.

### Fix

Track promises properly so finished ones are removed from the active set:

```typescript
async processInBatches(chunks: Blob[], concurrency: number): Promise<void> {
  const active = new Map<Promise<void>, number>();

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    const p = this.uploadChunk(chunk).finally(() => active.delete(p));
    active.set(p, i);

    if (active.size >= concurrency) {
      // Wait for any one to complete before launching next
      await Promise.race(active.keys());
    }
  }

  // Wait for all remaining in-flight uploads
  await Promise.all(active.keys());
}
```

The `finally(() => active.delete(p))` self-registration pattern keeps the active set accurate, and `Promise.all` at the end ensures nothing is abandoned.

---

## PERF-05 · `RetryError` captures full stack on every attempt

**File:** `src/utils/retry.ts`
**Severity:** 🟢 LOW

### Problem

If `maxAttempts` is set to a high value (e.g., 10) and all attempts fail, 10 `Error` objects are created and their stacks captured. In V8, stack capture is expensive (`Error.captureStackTrace`). Under high-concurrency retry scenarios this adds non-trivial overhead.

### Fix

Only capture the stack for the final `RetryError`, not for intermediate attempts:

```typescript
// Instead of creating a new Error per attempt:
const errors: unknown[] = [];

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  try {
    return await fn();
  } catch (e) {
    errors.push(e); // store raw error, no stack capture
    if (attempt < maxAttempts) await delay(backoff(attempt));
  }
}

// Only one stack capture here
throw new RetryError(`Failed after ${maxAttempts} attempts`, errors, maxAttempts);
```

---

## Summary Table

| ID      | File             | Issue                                          | Impact                 |
| ------- | ---------------- | ---------------------------------------------- | ---------------------- |
| PERF-01 | `cache.ts`       | Map delete+re-insert LRU GC pressure           | Medium                 |
| PERF-02 | `dedup.ts`       | Re-stringify large bodies on every request     | Medium                 |
| PERF-03 | `http-client.ts` | `subscribe()` focus listener accumulation      | High (memory leak)     |
| PERF-04 | `upload.ts`      | `Promise.race` does not remove resolved chunks | High (silent failures) |
| PERF-05 | `retry.ts`       | Stack capture per retry attempt                | Low                    |
