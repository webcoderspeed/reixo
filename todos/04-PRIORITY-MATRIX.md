# 📊 Priority Matrix & Action Plan — Reixo

> Consolidated priority view of all bugs, improvements, and architectural work.
> Sorted by: Impact vs Effort
> Last updated: 2026-03-13 (Sprint 3 completed)

---

## 🔴 Fix Immediately (Critical Bugs — Block Release)

| ID      | Issue                                                                       | File                         | Effort |
| ------- | --------------------------------------------------------------------------- | ---------------------------- | ------ |
| BUG-003 | `isQueuePaused` accesses non-public property — offline queue feature broken | `http-client.ts`, `queue.ts` | 30 min |
| BUG-001 | `destroy()` doesn't call `dispose()` — causes memory leaks                  | `http-client.ts`             | 15 min |
| BUG-002 | `mutate()` discards generated cache key — optimistic updates don't work     | `http-client.ts`             | 15 min |
| BUG-005 | Inner `AbortController` not linked to outer — request cancellation broken   | `http.ts`                    | 2 hrs  |
| BUG-004 | BaseURL + URL has no slash normalization — wrong URLs silently              | `http.ts`                    | 30 min |
| BUG-008 | `read()` Suspense method causes infinite re-fetch loop                      | `http-client.ts`             | 1 hr   |

**Total estimated effort:** ~5 hours

---

## 🟠 Fix Before Stable Release (High Priority)

| ID      | Issue                                                                    | File                  | Effort |
| ------- | ------------------------------------------------------------------------ | --------------------- | ------ |
| BUG-006 | `params` doesn't support array values                                    | `http.ts`             | 2 hrs  |
| BUG-007 | `WebStorageAdapter` throws in SSR/Node                                   | `cache.ts`            | 1 hr   |
| BUG-012 | Retry retries non-retryable 4xx errors by default                        | `retry.ts`, `http.ts` | 1 hr   |
| BUG-011 | `ValidationError` not exported from `index.ts`                           | `index.ts`            | 10 min |
| IMP-006 | `HTTPBuilder` missing `withLogger`, `withRetryPolicies` etc.             | `http-client.ts`      | 2 hrs  |
| IMP-012 | Export missing utility types (`ValidationError`, `StorageAdapter`, etc.) | `index.ts`            | 30 min |
| BUG-016 | `@types/node` version `^25.0.10` is invalid                              | `package.json`        | 5 min  |

**Total estimated effort:** ~7 hours

---

## 🟡 Important Improvements (Medium Priority — Next Minor Version)

| ID      | Issue                                                         | File              | Effort |
| ------- | ------------------------------------------------------------- | ----------------- | ------ |
| BUG-013 | `post()`/`put()`/`patch()` duplicate body serialization       | `http-client.ts`  | 1 hr   |
| BUG-009 | `requestId` uses `Math.random()` — collision risk             | `http-client.ts`  | 30 min |
| BUG-014 | `queueOfflineRequest` uses `Math.random()` for IDs            | `http-client.ts`  | 30 min |
| BUG-010 | `MemoryAdapter` FIFO eviction → should be LRU                 | `cache.ts`        | 2 hrs  |
| IMP-001 | `CircuitBreaker` should be first-class in `HTTPClientConfig`  | `http-client.ts`  | 3 hrs  |
| IMP-002 | Add `HEAD` and `OPTIONS` methods                              | `http-client.ts`  | 30 min |
| IMP-003 | Public request cancellation API (`cancel(requestId)`)         | `http-client.ts`  | 2 hrs  |
| IMP-007 | Error type hierarchy (NetworkError, TimeoutError, AbortError) | `http.ts`         | 2 hrs  |
| IMP-009 | `MockAdapter` needs delay and conditional matching support    | `mock-adapter.ts` | 3 hrs  |
| BUG-015 | Migrate from deprecated `standard-version`                    | `package.json`    | 2 hrs  |

**Total estimated effort:** ~17 hours

---

## 🔵 Nice-to-Have (Future Versions)

| ID      | Feature                                                                           | Effort      |
| ------- | --------------------------------------------------------------------------------- | ----------- |
| IMP-004 | React hooks: `useReixoQuery`, `useReixoMutation` (separate `reixo-react` package) | 1 week      |
| IMP-005 | Advanced query param serialization (arrays, nested, custom serializers)           | 3 hrs       |
| IMP-008 | Subpath exports for tree-shaking (`reixo/graphql`, `reixo/websocket`)             | 4 hrs       |
| IMP-010 | Cache metadata in responses (`age`, `ttl`, `hit`)                                 | 2 hrs       |
| IMP-011 | TypeDoc integration for API documentation                                         | 2 hrs       |
| IMP-013 | `ConsoleLogger` log levels and structured JSON format                             | 2 hrs       |
| IMP-014 | `CacheManager` size limit in bytes                                                | 3 hrs       |
| IMP-015 | Request/response body logging with redaction                                      | 2 hrs       |
| IMP-016 | Interactive DevTools browser overlay                                              | 1-2 weeks   |
| IMP-017 | Vue Composables and Svelte Stores (`reixo-vue`, `reixo-svelte`)                   | 1 week each |
| IMP-018 | Smart `poll()` with adaptive intervals and `until()` condition                    | 2 hrs       |
| IMP-019 | Changelog automation with `@changesets/cli`                                       | 3 hrs       |
| IMP-020 | `prefetch()` returns cancellable handle                                           | 1 hr        |

---

## Action Plan by Sprint

### Sprint 1 — "Stability" (1 week) ✅ COMPLETED

Fix all 🔴 Critical bugs. These are correctness issues that silently break core features (offline queue, optimistic updates, request cancellation).

- [x] BUG-001: Fix `destroy()` to call `dispose()`
- [x] BUG-002: Fix `mutate()` discarded cache key
- [x] BUG-003: `isQueuePaused` — confirmed not a bug (public getter already existed)
- [x] BUG-004: Fix slash normalization in baseURL + URL
- [x] BUG-005: Link AbortController signals in `http.ts`
- [x] BUG-008: Fix `read()` suspense infinite loop
- [x] BUG-011: Export `ValidationError` from `index.ts`
- [x] BUG-016: Fix `@types/node` version

### Sprint 2 — "Robustness" (1 week) ✅ COMPLETED

Fix 🟠 High priority issues. These affect correctness in common scenarios.

- [x] BUG-006: Array param serialization
- [x] BUG-007: `WebStorageAdapter` SSR safety
- [x] BUG-012: Smart retry condition (skip 4xx by default) — confirmed already correct
- [x] BUG-013: Extract `_serializeBody()` private helper
- [x] BUG-009, BUG-014: Migrate to `crypto.randomUUID()`
- [x] IMP-006: Complete `HTTPBuilder` with missing fluent methods
- [x] IMP-012: Export all missing types

### Sprint 3 — "Developer Experience" (2 weeks) ✅ COMPLETED

Focus on improvements that increase adoption and usability.

- [x] IMP-001: `CircuitBreaker` as first-class `HTTPClientConfig` option
- [x] IMP-002: `HEAD` and `OPTIONS` methods
- [x] IMP-003: Request cancellation API (`cancel(id)`, `cancelAll()`, `requestWithId()`)
- [x] IMP-007: Error type hierarchy (`NetworkError`, `TimeoutError`, `AbortError`, `CircuitOpenError`, `RetryError`)
- [x] IMP-009: Enhanced `MockAdapter` (callback handlers, `replyOnce`, `onHead`, `onOptions`, typed errors, `getHistory()`)
- [x] BUG-010: LRU eviction in `MemoryAdapter`
- [x] Additional: Fixed `visibilitychange` listener leak in `setupAutomaticCleanup`
- [x] Additional: Fixed `prefetch()` silent error swallow → now logs via `logger.warn`
- [x] Additional: Fixed `emitter.ts` unhandled error reporting
- [x] Additional: Fixed `queue.ts` async iterator race condition (buffer+waiters pattern)
- [x] Additional: Fixed `RetryError` typed wrapper with `attempts`, `durationMs`, `cause`
- [x] Additional: Fixed jitter ±50% aligned with JSDoc
- [x] Additional: Fixed WebSocket heartbeat timeout overwrite
- [x] Additional: Exported `NetworkRecorder`, `Pipeline`, `AsyncPipeline`, `createTraceInterceptor`, `RetryError` from index
- [ ] IMP-015: Migrate from `standard-version` to `@changesets/cli` (deferred — tooling/process change)

### Sprint 4 — "Growth" (1 month+) — In Progress

Framework integrations and advanced features for wider adoption.

- [x] IMP-005: Advanced param serialization (nested objects, arrays, `paramsSerializer`)
- [x] IMP-010: Cache metadata in responses (`CacheMetadata` — `hit`, `age`, `ttl`, `strategy`)
- [x] IMP-013: `ConsoleLogger` enhanced — options object, `format: 'json'`, `prefix`, `redactHeaders`
- [x] IMP-018: Smart `poll()` — added `until` alias, `adaptiveInterval` callback
- [x] IMP-020: `prefetch()` now returns `{ cancel(), completed }` handle
- [ ] IMP-004: `reixo-react` package
- [ ] IMP-008: Bundle subpath exports
- [ ] IMP-011: TypeDoc API docs

---

## What's Already Great (Don't Change)

These parts of Reixo are well-implemented and should be preserved:

1. **Builder pattern API** — Clean, discoverable, chainable
2. **Zero `any` TypeScript policy** — Rare in HTTP client libraries
3. **Event emitter with typed events** — Excellent for observability
4. **Token refresh interceptor in `auth.ts`** — Handles concurrent 401s correctly with the queue pattern
5. **`withRetry()` standalone utility** — Cleanly separated, reusable outside `HTTPClient`
6. **Dual package output (ESM + CJS)** — Good for compatibility
7. **`CircuitBreaker` state machine** — Correctly implements CLOSED → OPEN → HALF_OPEN → CLOSED
8. **`RateLimiter` token bucket** — Mathematically correct implementation
9. **Comprehensive test suite** — 40+ test files is above industry standard for a library this size
10. **`StorageAdapter` abstraction** — Allows custom persistence backends
11. **`BatchProcessor`** — Clean API for coalescing requests
12. **OpenTelemetry tracing in `tracing.ts`** — Enterprise-grade observability hook

---

_End of priority matrix. See `01-BUGS-AND-ISSUES.md` for full bug details and `02-IMPROVEMENTS.md` for enhancement specs._
