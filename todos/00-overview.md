# reixo — Improvement Overview

> Deep analysis of the reixo TypeScript HTTP client codebase.
> Generated: 2026-03-14

---

## What reixo Is

reixo is a TypeScript HTTP client library built around a **Result<T, E>** API (no thrown exceptions), with production-grade features:

- Zero-dependency OpenTelemetry tracing
- Request deduplication
- Retry with exponential back-off + jitter
- Circuit breaker (CLOSED / OPEN / HALF_OPEN)
- Offline queue with IndexedDB persistence
- Rate limiting (token bucket)
- GraphQL + APQ (Automatic Persisted Queries)
- WebSocket + SSE (Server-Sent Events)
- Resumable file uploads
- Infinite query / pagination
- Network monitoring
- Mock adapter for testing
- Security utilities (header sanitization, sensitive data masking)

The foundation is solid. The API surface is thoughtful. But across the codebase there are **critical runtime bugs**, **type unsafety hot-spots**, **console leaks**, **design inconsistencies**, and **missing lifecycle methods** that must be addressed before a stable 1.0 release.

---

## Sprint Map

| Sprint                    | File                     | Priority | Est. effort |
| ------------------------- | ------------------------ | -------- | ----------- |
| **01 — Critical Bugs**    | `01-critical-bugs.md`    | 🔴 P0    | 3–4 h       |
| **02 — Type Safety**      | `02-type-safety.md`      | 🟠 P1    | 2–3 h       |
| **03 — Performance**      | `03-performance.md`      | 🟡 P2    | 2 h         |
| **04 — Security**         | `04-security.md`         | 🟠 P1    | 1–2 h       |
| **05 — Missing Features** | `05-missing-features.md` | 🟡 P2    | 4–6 h       |
| **06 — API Design**       | `06-api-design.md`       | 🟡 P2    | 2–3 h       |
| **07 — Testing**          | `07-testing.md`          | 🟠 P1    | 6–8 h       |
| **08 — DX & Docs**        | `08-dx-and-docs.md`      | 🟢 P3    | 2–3 h       |
| **09 — SEO & Growth**     | `09-seo-and-growth.md`   | 🟢 P3    | 1–2 h       |

---

## Top 10 Issues (Quick Reference)

1. **`revalidateOnFocus` default mismatch** — documented as `false`, behaves as `true` (`http-client.ts:606`). Silent data-fetching bug that wastes bandwidth and surprises users.
2. **`RateLimiter.waitForToken()` race condition** — two concurrent callers both observe "1 token available", both sleep the same duration, both consume the token. One succeeds, the other over-consumes.
3. **`buildDedupKey` throws on circular refs** — `JSON.stringify` with no error handling. A circular `body` object crashes the entire request pipeline.
4. **`NetworkMonitor` hardcoded `google.com` ping** — CORS failure in browsers, unreliable in restricted networks, breaks all offline-detection tests.
5. **`NetworkMonitor` Singleton** — never GC'd, impossible to reset between tests, untestable in isolation.
6. **`console.error/warn` leaks** — `polling.ts:183`, `cache.ts:104`, `queue.ts:56` pollute consumer logs with library internals.
7. **`InfiniteQuery.hasNextPage` returns `true` on empty state** — triggers an infinite fetch loop on first load if the first page returns no data.
8. **`ResumableUploader` is not resumable** — no state persistence, `Promise.race` aborts all chunks on first failure leaving partial uploads silently incomplete.
9. **Unsafe `error as HTTPError` cast** — `auth.ts:93`, `graphql-client.ts:127` bypass TypeScript's type system, causing runtime crashes when the cast is wrong.
10. **`MockAdapter` inaccurate `statusText`** — only `200 → 'OK'`, everything else gets `'Mock Response'`, breaking tests that check `response.statusText`.

---

## File Index

```
src/
  core/
    http-client.ts          — main client, revalidateOnFocus bug, subscribe leak
    graphql-client.ts       — APQ, unsafe cast
  utils/
    auth.ts                 — JWT refresh, unsafe cast
    cache.ts                — LRU, WebStorage, console.warn leak
    circuit-breaker.ts      — CLOSED/OPEN/HALF_OPEN, success reset bug
    dedup.ts                — JSON.stringify risk
    infinite-query.ts       — hasNextPage empty bug, no abort
    logger.ts               — ConsoleLogger, header redaction
    mock-adapter.ts         — statusText inaccuracy
    network.ts              — Singleton, hardcoded google.com
    polling.ts              — console.error leak
    queue.ts                — console.warn leak
    rate-limiter.ts         — token bucket race condition
    retry.ts                — exponential backoff, RetryError
    security.ts             — sensitive field list incomplete
    upload.ts               — ResumableUploader, Promise.race issue
```
