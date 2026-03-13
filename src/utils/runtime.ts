/**
 * @file runtime.ts
 *
 * Runtime environment detection and capability feature-flags.
 *
 * reixo targets every modern JavaScript runtime without requiring adapters or
 * manual configuration. This module detects the current environment and exposes
 * per-capability flags so the rest of the library can branch once, consistently,
 * rather than scattering `typeof window !== 'undefined'` checks everywhere.
 *
 * Supported runtimes:
 *  - **Browser**             — Chrome, Firefox, Safari, Edge (modern)
 *  - **Node.js 18+**         — native `fetch` via undici
 *  - **Bun**                 — native `fetch`
 *  - **Deno**                — native `fetch`
 *  - **Cloudflare Workers**  — `workerd` runtime (no Node.js APIs)
 *  - **Vercel Edge Runtime** — `edge-light` (subset of Web APIs)
 *  - **Fastly Compute**      — Wasm-based, Web APIs only
 */

// ---------------------------------------------------------------------------
// Runtime identifiers
// ---------------------------------------------------------------------------

export type RuntimeName =
  | 'browser'
  | 'node'
  | 'bun'
  | 'deno'
  | 'workerd' // Cloudflare Workers
  | 'edge-light' // Vercel / Next.js Edge Runtime
  | 'fastly' // Fastly Compute@Edge
  | 'unknown';

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Detect the current JavaScript runtime environment.
 *
 * Detection is performed once and memoised — safe to call frequently.
 */
export function detectRuntime(): RuntimeName {
  // Cloudflare Workers — exposes `caches` + `WebSocketPair` (no Node process)
  if (
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as Record<string, unknown>)['WebSocketPair'] !== 'undefined'
  ) {
    return 'workerd';
  }

  // Vercel / Next.js Edge Runtime
  if (
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as Record<string, unknown>)['EdgeRuntime'] !== 'undefined'
  ) {
    return 'edge-light';
  }

  // Fastly Compute@Edge
  if (
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as Record<string, unknown>)['fastly'] !== 'undefined'
  ) {
    return 'fastly';
  }

  // Deno — exposes the `Deno` global
  if (typeof (globalThis as Record<string, unknown>)['Deno'] !== 'undefined') {
    return 'deno';
  }

  // Bun — exposes the `Bun` global
  if (typeof (globalThis as Record<string, unknown>)['Bun'] !== 'undefined') {
    return 'bun';
  }

  // Browser — has `window` + `document`
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    return 'browser';
  }

  // Node.js — has `process` with `.versions.node`
  if (typeof process !== 'undefined' && typeof process.versions?.node === 'string') {
    return 'node';
  }

  return 'unknown';
}

// ---------------------------------------------------------------------------
// Capability flags
// ---------------------------------------------------------------------------

export interface RuntimeCapabilities {
  /** Runtime name — for logging / debugging. */
  name: RuntimeName;

  /** `fetch` is available natively (no polyfill needed). */
  hasFetch: boolean;

  /** `ReadableStream` + `TransformStream` are available (streaming bodies). */
  hasStreams: boolean;

  /** `crypto.randomUUID()` and `crypto.getRandomValues()` are available. */
  hasCrypto: boolean;

  /**
   * `XMLHttpRequest` is available.
   * Needed for accurate upload-progress events in browsers.
   */
  hasXHR: boolean;

  /**
   * Node.js-style system error codes (`.code` property on errors) may appear.
   * Used by the network-error classifier to detect ETIMEDOUT, ECONNRESET, etc.
   */
  hasNodeErrorCodes: boolean;

  /**
   * HTTP/2 multiplexing is available through the fetch adapter.
   * True for Bun, Deno, Node 18+ (undici), and Cloudflare Workers.
   */
  hasHTTP2: boolean;
}

let _capabilities: RuntimeCapabilities | null = null;

/** Return the runtime capabilities, computing them once and caching the result. */
export function getRuntimeCapabilities(): RuntimeCapabilities {
  if (_capabilities) return _capabilities;

  const name = detectRuntime();

  _capabilities = {
    name,
    hasFetch: typeof fetch === 'function',
    hasStreams: typeof ReadableStream !== 'undefined' && typeof TransformStream !== 'undefined',
    hasCrypto: typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function',
    hasXHR: typeof XMLHttpRequest !== 'undefined',
    hasNodeErrorCodes: name === 'node' || name === 'bun' || name === 'deno',
    hasHTTP2:
      name === 'node' ||
      name === 'bun' ||
      name === 'deno' ||
      name === 'workerd' ||
      name === 'edge-light',
  };

  return _capabilities;
}

// ---------------------------------------------------------------------------
// Guards for convenience use in the library
// ---------------------------------------------------------------------------

/** `true` when running inside a browser tab/worker. */
export const isBrowser = (): boolean => getRuntimeCapabilities().name === 'browser';

/** `true` when running inside Node.js. */
export const isNode = (): boolean => getRuntimeCapabilities().name === 'node';

/** `true` when running on Cloudflare Workers or Vercel Edge. */
export const isEdgeRuntime = (): boolean => {
  const { name } = getRuntimeCapabilities();
  return name === 'workerd' || name === 'edge-light' || name === 'fastly';
};
