/**
 * @file proxy.ts
 *
 * HTTP(S) proxy / custom dispatcher support — the lightweight, always-loaded
 * half: public types, the raw `'env'` snapshot and credential redaction.
 * Validation, dispatcher building and proxy error mapping live in
 * `proxy-dispatch.ts`, which is only `import()`ed when a request actually needs
 * it. This keeps browser / edge bundles at their previous size.
 *
 * In Node.js the global `fetch` is undici. It ignores `HTTPS_PROXY` and the
 * legacy `agent` option — the only supported hook is an undici `Dispatcher`.
 */

import type { ConnectionPoolOptions } from './connection';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Explicit proxy configuration. */
export interface ProxyConfig {
  /** Proxy for https:// targets (tunnelled via CONNECT). */
  readonly httpsProxy?: string;
  /** Proxy for http:// targets. Defaults to `httpsProxy` when omitted. */
  readonly httpProxy?: string;
  /**
   * Comma-separated bypass list with NO_PROXY semantics:
   * `'*'`, `'example.com'` (host + subdomains), `'.example.com'`, `'host:port'`.
   */
  readonly noProxy?: string;
}

/**
 * Proxy option accepted by `HTTPClientConfig.proxy` and `HTTPOptions.proxy`.
 * - `'env'`  — read HTTPS_PROXY / HTTP_PROXY / NO_PROXY (and lowercase variants)
 * - string   — proxy URL for all requests
 * - object   — explicit {@link ProxyConfig}
 * - `false`  — force a direct connection
 */
export type ProxyOption = 'env' | string | ProxyConfig | false;

/** TLS options shared by `HTTPClientConfig.ssl` and `ConnectionPoolOptions`. */
export interface TLSOptions {
  rejectUnauthorized?: boolean;
  ca?: ConnectionPoolOptions['ca'];
  cert?: ConnectionPoolOptions['cert'];
  key?: ConnectionPoolOptions['key'];
  passphrase?: string;
  secureProtocol?: string;
}

/** Minimal logger surface — avoids importing the client's Logger type. */
export interface WarnLogger {
  warn(message: string): void;
}

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

/**
 * Strip `username:password@` from a proxy URL, keeping only its origin.
 *
 * @example
 * redactProxyUrl('http://user:secret@proxy.internal:3128/') // 'http://proxy.internal:3128'
 */
export function redactProxyUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return scrubCredentials(url);
  }
}

/** Remove any `scheme://user:pass@` credentials embedded in free text. @internal */
export function scrubCredentials(text: string): string {
  return text.replace(/([a-z][\d+.a-z-]{0,31}:\/\/)[^\s/@]{1,512}@/gi, '$1');
}

// ---------------------------------------------------------------------------
// Environment snapshot
// ---------------------------------------------------------------------------

/** Raw values of the proxy environment variables at a point in time. @internal */
export type ProxyEnv = Readonly<Record<string, string | undefined>>;

const PROXY_ENV_KEYS = [
  'HTTP_PROXY',
  'http_proxy',
  'HTTPS_PROXY',
  'https_proxy',
  'NO_PROXY',
  'no_proxy',
];

/**
 * Copy the proxy environment variables (so `'env'` is read once, at client
 * creation). `undefined` outside runtimes with `process.env`.
 * @internal
 */
export function snapshotProxyEnv(): ProxyEnv | undefined {
  if (typeof process === 'undefined' || !process.env) return undefined;
  const snapshot: Record<string, string | undefined> = {};
  for (const key of PROXY_ENV_KEYS) snapshot[key] = process.env[key];
  return snapshot;
}
