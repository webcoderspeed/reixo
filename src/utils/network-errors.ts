/**
 * @file network-errors.ts
 *
 * Runtime-agnostic network error detection and classification.
 *
 * Node.js surfaces OS-level network failures as Error objects with a `.code`
 * property (e.g. `ETIMEDOUT`, `ECONNRESET`). Browsers surface them as generic
 * TypeError with a descriptive message. Deno and Bun have their own error
 * class hierarchies. This module normalises them all into a single, typed API.
 *
 * Used internally by the retry engine to distinguish *transient* failures
 * (should retry) from *permanent* ones (should not retry).
 */

// ---------------------------------------------------------------------------
// Well-known error codes / messages
// ---------------------------------------------------------------------------

/**
 * POSIX / Node.js error codes that indicate a transient, retriable network failure.
 *
 * These codes appear on the `.code` property of Node.js system errors and on
 * `DOMException` in some runtime environments.
 */
export const TRANSIENT_NETWORK_CODES = new Set([
  'ETIMEDOUT', // Connection attempt timed out
  'ECONNRESET', // Connection reset by peer (TCP RST)
  'ECONNREFUSED', // Remote refused the connection
  'ECONNABORTED', // Connection aborted by the local side
  'ENOTFOUND', // DNS resolution failed
  'EAI_AGAIN', // Temporary DNS failure (retry DNS lookup)
  'EPIPE', // Broken pipe — remote closed the connection
  'EHOSTUNREACH', // No route to host
  'ENETUNREACH', // Network unreachable
  'ENETDOWN', // Network interface is down
  'EPROTO', // Protocol error
  'ERR_NETWORK_CHANGED', // Chrome DevTools network-change code
  'ERR_INTERNET_DISCONNECTED',
  'ENONET', // No network available
]) as ReadonlySet<string>;

/**
 * Substrings (case-insensitive) found in network error messages across
 * different runtimes. Checked when `.code` is absent.
 */
const TRANSIENT_MESSAGE_PATTERNS: readonly RegExp[] = [
  /network error/i,
  /failed to fetch/i,
  /fetch failed/i,
  /load failed/i,
  /networkerror/i,
  /connection reset/i,
  /connection refused/i,
  /connection timed out/i,
  /etimedout/i,
  /econnreset/i,
  /econnrefused/i,
  /enotfound/i,
  /dns lookup/i,
  /socket hang up/i,
  /socket disconnected/i,
  /the internet connection appears to be offline/i,
  /network request failed/i,
];

// ---------------------------------------------------------------------------
// Classification functions
// ---------------------------------------------------------------------------

/** Extract the error code from a thrown value, if present. */
function codeOf(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const e = error as Record<string, unknown>;
  // Node.js / Deno: `.code`
  if (typeof e['code'] === 'string') return e['code'];
  // Some runtimes expose it as `.errno`
  if (typeof e['errno'] === 'string') return e['errno'];
  return undefined;
}

/**
 * Returns `true` when `error` represents a transient network-level failure
 * that is safe to retry (e.g. DNS failure, TCP reset, connection refused).
 *
 * Works across Node.js, Bun, Deno, Cloudflare Workers, and browsers.
 */
export function isTransientNetworkError(error: unknown): boolean {
  const code = codeOf(error);
  if (code && TRANSIENT_NETWORK_CODES.has(code)) return true;

  const message = error instanceof Error ? error.message : String(error ?? '');
  return TRANSIENT_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Returns `true` when `error` is a timeout specifically (distinguished from
 * other network failures to allow separate retry budgets).
 */
export function isTimeoutError(error: unknown): boolean {
  const code = codeOf(error);
  if (code === 'ETIMEDOUT' || code === 'TIMEOUT') return true;
  const name = error instanceof Error ? error.name : '';
  if (name === 'TimeoutError' || name === 'AbortError') {
    const message = error instanceof Error ? error.message : '';
    return /timeout/i.test(message) || name === 'TimeoutError';
  }
  return false;
}

/**
 * Returns `true` when `error` is a DNS resolution failure.
 * Useful for filtering out config errors (wrong host) from retry logic.
 */
export function isDnsError(error: unknown): boolean {
  const code = codeOf(error);
  return code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'ENONET';
}

/**
 * Classify a network error for structured logging / telemetry.
 */
export type NetworkErrorClass =
  | 'timeout'
  | 'dns'
  | 'connection_refused'
  | 'connection_reset'
  | 'network_unavailable'
  | 'other_transient'
  | 'non_transient';

export function classifyNetworkError(error: unknown): NetworkErrorClass {
  const code = codeOf(error);

  if (isTimeoutError(error)) return 'timeout';
  if (isDnsError(error)) return 'dns';
  if (code === 'ECONNREFUSED') return 'connection_refused';
  if (code === 'ECONNRESET' || code === 'EPIPE' || code === 'ECONNABORTED')
    return 'connection_reset';
  if (code === 'ENETUNREACH' || code === 'EHOSTUNREACH' || code === 'ENETDOWN')
    return 'network_unavailable';
  if (isTransientNetworkError(error)) return 'other_transient';
  return 'non_transient';
}
