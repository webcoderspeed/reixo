# Sprint 05 — Missing Features

> Priority: 🟡 P2
> These are gaps in existing utilities — not "nice-to-have extras" but cases where a feature is partially built or named in a way that implies functionality that doesn't exist yet.

---

## FEAT-01 · `ResumableUploader` is not actually resumable

**File:** `src/utils/upload.ts`
**Severity:** 🟠 HIGH — the class name is a contract

### Problem

`ResumableUploader` has no resume capability. It stores no state between instantiations. If the upload is interrupted mid-way:

- The in-progress chunks are abandoned (no abort signal sent)
- No chunk progress is persisted
- Re-instantiating `ResumableUploader` starts over from chunk 0

The class name strongly implies TUS-protocol or similar resumable upload semantics. Shipping this without the feature will frustrate developers who rely on the name.

### What's Needed

**Minimum viable resume:**

```typescript
interface UploadState {
  uploadId: string;
  fileSize: number;
  chunkSize: number;
  completedChunks: number[];  // chunk indices
  uploadUrl: string;
  createdAt: number;
}

class ResumableUploader {
  private state: UploadState | null = null;

  // Save state to localStorage / IndexedDB after each chunk
  private async persistState(): Promise<void> { ... }

  // Resume from saved state
  async resume(uploadId: string): Promise<void> {
    const saved = await this.loadState(uploadId);
    if (!saved) throw new Error(`No upload state found for ${uploadId}`);
    this.state = saved;
    await this.upload(/* skip completedChunks */);
  }

  // Abort with proper cleanup
  abort(): void {
    this.abortController.abort();
    // Don't delete state — allow resume
  }
}
```

If true resumability is out of scope for the current sprint, at minimum:

1. Add an `abort()` method that actually cancels in-flight chunk fetches via `AbortController`
2. Rename the class to `ChunkedUploader` until resume is implemented
3. Add a JSDoc note: `// TODO: persist chunk state for true resumability`

---

## FEAT-02 · `InfiniteQuery` has no `abort()` method

**File:** `src/utils/infinite-query.ts`
**Severity:** 🟡 MEDIUM

### Problem

`InfiniteQuery` fetches pages sequentially. If a component is unmounted while a page fetch is in-flight, there is no way to cancel it. The fetch completes, calls `setState` on an unmounted component, and logs a React warning (or in non-React contexts, corrupts state).

### Fix

```typescript
class InfiniteQuery<T, C = unknown> {
  private abortController: AbortController | null = null;

  async fetchNextPage(): Promise<void> {
    // Cancel any previous in-flight fetch
    this.abortController?.abort();
    this.abortController = new AbortController();

    try {
      const result = await this.fetcher(this.cursor, {
        signal: this.abortController.signal,
      });
      // ... handle result
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      throw e;
    }
  }

  abort(): void {
    this.abortController?.abort();
    this.abortController = null;
  }
}
```

---

## FEAT-03 · `CircuitBreaker` does not reset `nextAttempt` on successful CLOSED-state request

**File:** `src/utils/circuit-breaker.ts`
**Severity:** 🟡 MEDIUM

### Problem

The circuit breaker tracks `failures` and `nextAttempt`. When a request succeeds while in `CLOSED` state, `failures` is reset to 0 — correct. But `nextAttempt` is NOT reset. This is a stale reference from a previous OPEN→HALF_OPEN cycle. It has no effect on CLOSED-state behavior, but it's semantically wrong and can confuse debugging:

```typescript
onSuccess(): void {
  if (this.state === 'HALF_OPEN') {
    this.state = 'CLOSED';
    this.failures = 0;
    this.nextAttempt = 0;   // ← reset here (HALF_OPEN → CLOSED)
  } else if (this.state === 'CLOSED') {
    this.failures = 0;
    // nextAttempt is NOT reset — stale but harmless
  }
}
```

Clean it up:

```typescript
onSuccess(): void {
  this.failures = 0;
  this.nextAttempt = 0;
  if (this.state === 'HALF_OPEN') {
    this.state = 'CLOSED';
  }
}
```

---

## FEAT-04 · No `destroy()` / lifecycle management on most utilities

**File:** Multiple — `network.ts`, `polling.ts`, `infinite-query.ts`, `rate-limiter.ts`
**Severity:** 🟡 MEDIUM

### Problem

Utilities that hold timers, event listeners, or open connections have no `destroy()` method. This creates resource leaks in:

- Single-page applications (route changes don't GC utilities)
- Server-side rendering (module-level singletons persist across requests)
- Tests (utilities from one test bleed into the next)

### Fix

Define a standard lifecycle interface and implement it across all stateful utilities:

```typescript
interface Destroyable {
  destroy(): void;
}

// NetworkMonitor
destroy(): void {
  clearInterval(this.pollInterval);
  window.removeEventListener('online', this.onlineHandler);
  window.removeEventListener('offline', this.offlineHandler);
}

// PollingController
destroy(): void {
  this.stop();
  clearTimeout(this.retryTimeout);
}

// RateLimiter
destroy(): void {
  clearInterval(this.refillInterval);
}
```

Also export a `destroyAll()` convenience function for the default singleton instances.

---

## FEAT-05 · No streaming response support

**File:** `src/core/http-client.ts`
**Severity:** 🟢 P3

### Problem

reixo has SSE support but no generic streaming body consumer. Streaming APIs (OpenAI, Anthropic, etc.) return `text/event-stream` or `application/json-stream`. Users currently have to bypass reixo's response handling to access the raw `Response.body` stream.

### Suggested API

```typescript
const stream = await client.stream('/api/generate', {
  method: 'POST',
  body: { prompt: 'Hello' },
});

for await (const chunk of stream) {
  process.stdout.write(chunk);
}
```

This would wrap the Fetch API `ReadableStream` in an async iterator, with proper error handling via the Result<T, E> pattern:

```typescript
const result = await client.stream('/api/generate', { ... });
if (result.isErr()) { ... }

for await (const chunk of result.value) { ... }
```

---

## FEAT-06 · `TaskQueue` has no `drain()` Promise

**File:** `src/utils/queue.ts`
**Severity:** 🟡 MEDIUM

### Problem

`TaskQueue` processes tasks but provides no way to wait for all queued tasks to complete. Common patterns like "drain the queue before shutdown" or "wait for all uploads to finish before navigating away" are not possible without polling.

### Fix

```typescript
class TaskQueue {
  private drainResolvers: Array<() => void> = [];

  drain(): Promise<void> {
    if (this.queue.length === 0 && this.running === 0) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.drainResolvers.push(resolve);
    });
  }

  private onTaskComplete(): void {
    if (this.queue.length === 0 && this.running === 0) {
      this.drainResolvers.forEach((r) => r());
      this.drainResolvers = [];
    }
  }
}
```

---

## Summary Table

| ID      | File                 | Feature                                        | Priority |
| ------- | -------------------- | ---------------------------------------------- | -------- |
| FEAT-01 | `upload.ts`          | `ResumableUploader` has no resume/abort        | 🟠 P1    |
| FEAT-02 | `infinite-query.ts`  | No `abort()` on `InfiniteQuery`                | 🟡 P2    |
| FEAT-03 | `circuit-breaker.ts` | `nextAttempt` not reset on CLOSED success      | 🟡 P2    |
| FEAT-04 | Multiple             | No `destroy()` lifecycle on stateful utilities | 🟡 P2    |
| FEAT-05 | `http-client.ts`     | No generic streaming response support          | 🟢 P3    |
| FEAT-06 | `queue.ts`           | No `drain()` Promise on `TaskQueue`            | 🟡 P2    |
