/**
 * @file result.ts
 *
 * Railway-oriented error handling for reixo.
 *
 * Every HTTP client call can fail in at least two ways: a network error
 * (ECONNRESET, timeout, …) or an HTTP error (4xx, 5xx). Traditional
 * try/catch forces callers to remember to wrap *every* await. The `Result`
 * type makes the failure path explicit in the return type so TypeScript
 * enforces handling.
 *
 * @example
 * // Without Result — easy to forget the try/catch:
 * const res = await client.get<User>('/me');   // throws on 401
 *
 * // With Result — failure is encoded in the type:
 * const result = await client.tryGet<User>('/me');
 * if (!result.ok) {
 *   console.error(result.error.status);  // fully typed HTTPError
 *   return;
 * }
 * console.log(result.data.name);           // TypeScript knows data is User
 */

// ---------------------------------------------------------------------------
// Core discriminated union
// ---------------------------------------------------------------------------

/** A successful result carrying the resolved value. */
export interface Ok<T> {
  readonly ok: true;
  readonly data: T;
  readonly error: null;
}

/** A failed result carrying the thrown error. */
export interface Err<E extends Error = Error> {
  readonly ok: false;
  readonly data: null;
  readonly error: E;
}

/**
 * Discriminated union of {@link Ok} and {@link Err}.
 *
 * Narrow with `if (result.ok)` to access `.data` / `.error` without a cast.
 *
 * @typeParam T  The success value type.
 * @typeParam E  The error type (defaults to `Error`; use `HTTPError` for HTTP calls).
 */
export type Result<T, E extends Error = Error> = Ok<T> | Err<E>;

// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------

/** Wrap a value in an {@link Ok} result. */
export function ok<T>(data: T): Ok<T> {
  return { ok: true, data, error: null };
}

/** Wrap an error in an {@link Err} result. */
export function err<E extends Error>(error: E): Err<E> {
  return { ok: false, data: null, error };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Await a Promise and capture its outcome as a {@link Result} — never throws.
 *
 * @example
 * const result = await toResult(fetch('/api'));
 * if (!result.ok) handleError(result.error);
 */
export async function toResult<T, E extends Error = Error>(
  promise: Promise<T>
): Promise<Result<T, E>> {
  try {
    return ok(await promise);
  } catch (e) {
    return err(e instanceof Error ? (e as E) : (new Error(String(e)) as E));
  }
}

/**
 * Map the success value of a Result without unwrapping it.
 *
 * @example
 * const userResult = mapResult(responseResult, r => r.data);
 */
export function mapResult<T, U, E extends Error = Error>(
  result: Result<T, E>,
  fn: (value: T) => U
): Result<U, E> {
  if (result.ok) return ok(fn(result.data));
  return result;
}

/**
 * Unwrap a Result, throwing its error if not `ok`.
 *
 * @example
 * const data = unwrap(result);  // throws if result.ok === false
 */
export function unwrap<T, E extends Error>(result: Result<T, E>): T {
  if (result.ok) return result.data;
  throw result.error;
}

/**
 * Unwrap a Result, returning a fallback value if not `ok`.
 *
 * @example
 * const data = unwrapOr(result, defaultUser);
 */
export function unwrapOr<T, E extends Error>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.data : fallback;
}
