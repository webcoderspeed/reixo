# Sprint 07 — Testing

> Priority: 🟠 P1
> An HTTP client library must have high-confidence tests before users trust it in production. Currently there appear to be no tests covering critical paths.

---

## TEST Strategy Overview

reixo has complex stateful utilities (circuit breaker, rate limiter, retry) and subtle async behaviors (dedup, queue, offline queue). The testing strategy should be:

1. **Unit tests** — pure logic, mocked I/O (80% of test mass)
2. **Integration tests** — real HTTP against a local mock server (15%)
3. **Property-based tests** — for retry backoff, rate limiting math (5%)

Recommended test framework: **Vitest** (fast, ESM-native, compatible with TypeScript out of the box, works in both Node and browser environments).

---

## TEST-01 · Core HTTP Client

**File:** `tests/core/http-client.test.ts`

### Critical test cases

```typescript
describe('ReixoClient', () => {
  // Result API
  it('returns Result.ok on 2xx', ...)
  it('returns Result.err on 4xx', ...)
  it('returns Result.err on 5xx', ...)
  it('returns Result.err on network failure', ...)

  // revalidateOnFocus (BUG-01 regression test)
  it('does NOT attach focus listener when revalidateOnFocus is undefined', ...)
  it('does NOT attach focus listener when revalidateOnFocus is false', ...)
  it('DOES attach focus listener when revalidateOnFocus is true', ...)

  // Headers
  it('sends Authorization header', ...)
  it('does not log Authorization header value', ...)

  // Deduplication
  it('returns same Promise for identical concurrent GETs', ...)
  it('sends separate requests for different URLs', ...)
  it('handles circular body without throwing (BUG-03 regression)', ...)
})
```

---

## TEST-02 · Circuit Breaker

**File:** `tests/utils/circuit-breaker.test.ts`

The circuit breaker has exact numeric thresholds and time-dependent state transitions. Use fake timers (`vi.useFakeTimers()`) to avoid `setTimeout` flakiness.

```typescript
describe('CircuitBreaker', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('starts in CLOSED state', ...)
  it('stays CLOSED after fewer failures than threshold', ...)
  it('transitions CLOSED → OPEN after threshold failures', ...)
  it('rejects all requests when OPEN', ...)
  it('transitions OPEN → HALF_OPEN after cooldown', ...)
  it('transitions HALF_OPEN → CLOSED on success', ...)
  it('transitions HALF_OPEN → OPEN on failure', ...)

  // Regression for BUG (nextAttempt reset)
  it('resets nextAttempt when transitioning to CLOSED', ...)
  it('resets failures on success in CLOSED state', ...)
})
```

---

## TEST-03 · Rate Limiter (with race condition coverage)

**File:** `tests/utils/rate-limiter.test.ts`

```typescript
describe('RateLimiter', () => {
  it('allows requests up to the configured rate', ...)
  it('delays requests beyond the rate', ...)

  // Regression for BUG-02 (race condition)
  it('does not over-consume tokens when called concurrently', async () => {
    const limiter = new RateLimiter({ tokensPerSecond: 5, burstSize: 5 });
    const start = Date.now();

    // Launch 10 concurrent requests against a 5/s limiter
    const results = await Promise.all(
      Array.from({ length: 10 }, () => limiter.waitForToken().then(() => Date.now() - start))
    );

    // First 5 should complete immediately (< 50ms)
    const immediate = results.filter(t => t < 50);
    expect(immediate.length).toBeLessThanOrEqual(5);

    // Total tokens consumed should equal exactly 10
    expect(results.length).toBe(10);
  })
})
```

---

## TEST-04 · Retry Logic

**File:** `tests/utils/retry.test.ts`

```typescript
describe('withRetry', () => {
  it('returns result immediately on first success', ...)
  it('retries on failure and returns on eventual success', ...)
  it('throws RetryError after maxAttempts exhausted', ...)
  it('includes attempt count in RetryError', ...)
  it('applies exponential backoff between attempts', async () => {
    vi.useFakeTimers();
    const delays: number[] = [];
    const fakeFn = vi.fn().mockRejectedValue(new Error('fail'));

    // Intercept setTimeout to record delays
    const retryPromise = withRetry(fakeFn, { maxAttempts: 4, baseDelay: 100 });
    // advance timers and verify delay sequence: ~100, ~200, ~400
    ...
  })
  it('does not retry on non-retryable errors (e.g., 400)', ...)
})
```

---

## TEST-05 · Request Deduplication

**File:** `tests/utils/dedup.test.ts`

```typescript
describe('RequestDeduplicator', () => {
  it('returns same Promise for concurrent identical requests', async () => {
    const fetcher = vi.fn().mockResolvedValue('result');
    const dedup = new RequestDeduplicator();

    const [r1, r2] = await Promise.all([
      dedup.deduplicate('GET:/users/1:', fetcher),
      dedup.deduplicate('GET:/users/1:', fetcher),
    ]);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(r1).toBe(r2);
  });

  // Regression for BUG-03
  it('does not throw when body contains circular reference', () => {
    const circular: any = {};
    circular.self = circular;
    expect(() => buildDedupKey({ method: 'POST', url: '/test', body: circular })).not.toThrow();
  });
});
```

---

## TEST-06 · InfiniteQuery

**File:** `tests/utils/infinite-query.test.ts`

```typescript
describe('InfiniteQuery', () => {
  // Regression for BUG-07
  it('hasNextPage is false before any fetch', () => {
    const query = new InfiniteQuery({ fetcher: vi.fn() });
    expect(query.hasNextPage).toBe(false);
  });

  it('hasNextPage is false after empty first page', async () => {
    const query = new InfiniteQuery({ fetcher: async () => [] });
    await query.fetchNextPage();
    expect(query.hasNextPage).toBe(false);
  });

  it('hasNextPage is true after page with data', async () => {
    const query = new InfiniteQuery({ fetcher: async () => [1, 2, 3] });
    await query.fetchNextPage();
    expect(query.hasNextPage).toBe(true);
  });

  it('abort() cancels in-flight fetch', async () => {
    let aborted = false;
    const query = new InfiniteQuery({
      fetcher: async (_, { signal }) => {
        signal?.addEventListener('abort', () => {
          aborted = true;
        });
        await new Promise((r) => setTimeout(r, 1000));
        return [];
      },
    });
    const p = query.fetchNextPage();
    query.abort();
    await p;
    expect(aborted).toBe(true);
  });
});
```

---

## TEST-07 · MockAdapter

**File:** `tests/utils/mock-adapter.test.ts`

```typescript
describe('MockAdapter', () => {
  it('returns correct statusText for common HTTP codes', () => {
    const codes = [200, 201, 400, 401, 403, 404, 500, 503];
    for (const code of codes) {
      const response = adapter.buildResponse(code);
      expect(response.statusText).not.toBe('Mock Response');
    }
  })

  it('matches route patterns with wildcards', ...)
  it('respects configured delay', ...)
  it('throws on unmatched routes when strictMode is enabled', ...)
})
```

---

## TEST-08 · Security Utils

**File:** `tests/utils/security.test.ts`

```typescript
describe('SecurityUtils', () => {
  it('redacts Authorization header (case-insensitive)', () => {
    expect(sanitizeHeaders({ 'Authorization': 'Bearer token' }))
      .toEqual({ 'Authorization': '[REDACTED]' });
    expect(sanitizeHeaders({ 'authorization': 'Bearer token' }))
      .toEqual({ 'authorization': '[REDACTED]' });
    expect(sanitizeHeaders({ 'AUTHORIZATION': 'Bearer token' }))
      .toEqual({ 'AUTHORIZATION': '[REDACTED]' });
  })

  it('redacts access_token in body', ...)
  it('redacts refresh_token in body', ...)
  it('does not redact non-sensitive fields', ...)
  it('handles nested sensitive fields', ...)
  it('sanitizes sensitive query params from URL', ...)
})
```

---

## Testing Infrastructure

### Setup

```json
// package.json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  },
  "devDependencies": {
    "vitest": "^1.x",
    "@vitest/coverage-v8": "^1.x",
    "msw": "^2.x" // Mock Service Worker for integration tests
  }
}
```

### Coverage Targets

| Module               | Target |
| -------------------- | ------ |
| `circuit-breaker.ts` | 95%    |
| `rate-limiter.ts`    | 95%    |
| `retry.ts`           | 90%    |
| `dedup.ts`           | 90%    |
| `security.ts`        | 90%    |
| `http-client.ts`     | 80%    |
| `infinite-query.ts`  | 85%    |
| `mock-adapter.ts`    | 85%    |
