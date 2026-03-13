/**
 * @file dedup.ts
 *
 * In-flight request deduplication — the thundering-herd solution.
 *
 * When two or more callers issue the same GET (or any idempotent method) while
 * a previous identical request is still in-flight, {@link RequestDeduplicator}
 * returns the *same* Promise to every caller instead of firing N network
 * requests. The moment the first response resolves (or rejects), every waiting
 * caller receives the same value — one network round-trip, N satisfied
 * consumers.
 *
 * @example
 * // Wire it up once on the client:
 * const client = new HTTPBuilder()
 *   .withBaseURL('https://api.example.com')
 *   .withDeduplication()   // enabled for GET/HEAD by default
 *   .build();
 *
 * // All three fire at the same time — only ONE network request is made:
 * const [a, b, c] = await Promise.all([
 *   client.get('/users/1'),
 *   client.get('/users/1'),
 *   client.get('/users/1'),
 * ]);
 */

import type { JsonValue } from '../core/http-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Methods that are safe to deduplicate (idempotent, no side effects). */
export const DEDUP_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'] as const);

export interface DedupStats {
  /** Number of requests currently sharing an in-flight promise. */
  inflight: number;
  /** Cumulative number of duplicate calls that were collapsed. */
  savedRequests: number;
}

// ---------------------------------------------------------------------------
// Key generation
// ---------------------------------------------------------------------------

/**
 * Produce a stable deduplication key from the request method, resolved URL,
 * and (optionally) a serialised body.
 *
 * The key must be cheap to compute and collision-resistant for practical use.
 * We intentionally do NOT hash (CPU cost), relying on the URL + body string
 * to be unique in practice for in-flight windows.
 */
export function buildDedupKey(
  method: string,
  url: string,
  body?: JsonValue | string | null
): string {
  const m = method.toUpperCase();
  const b =
    body === null || body === undefined
      ? ''
      : typeof body === 'string'
        ? body
        : JSON.stringify(body);
  return `${m}::${url}::${b}`;
}

// ---------------------------------------------------------------------------
// Deduplicator
// ---------------------------------------------------------------------------

/**
 * Lightweight in-flight request deduplicator.
 *
 * Maintains a `Map<key, Promise>` of in-flight requests. Any call that arrives
 * with the same key before the first Promise settles receives that exact
 * Promise reference — zero extra network calls.
 *
 * Thread/async-safe: the Map entry is deleted synchronously inside `.finally()`
 * so the slot is cleared before any microtask continuation can race.
 */
export class RequestDeduplicator {
  private readonly inflight = new Map<string, Promise<unknown>>();
  private _savedRequests = 0;

  /**
   * Return an existing in-flight Promise for `key` if one exists, otherwise
   * call `fn()`, store its Promise, and return it.
   *
   * @param key   Dedup key — see {@link buildDedupKey}.
   * @param fn    Factory that starts the actual network request.
   */
  deduplicate<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) {
      this._savedRequests++;
      return existing as Promise<T>;
    }

    const promise: Promise<T> = fn().finally(() => {
      this.inflight.delete(key);
    });

    this.inflight.set(key, promise);
    return promise;
  }

  /** Force-remove a key (e.g. after a cache invalidation). */
  evict(key: string): void {
    this.inflight.delete(key);
  }

  /** Drop all in-flight entries. Pending callers will still resolve normally. */
  clear(): void {
    this.inflight.clear();
  }

  /** Live stats for monitoring / debugging. */
  stats(): DedupStats {
    return { inflight: this.inflight.size, savedRequests: this._savedRequests };
  }
}
