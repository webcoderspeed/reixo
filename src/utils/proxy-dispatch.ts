/**
 * @file proxy-dispatch.ts
 *
 * The heavy, lazily-loaded half of proxy support (see `proxy.ts`). Only
 * `import()`ed when a request uses `proxy`, `dispatcher`, `agent`, or the
 * client has `proxy` / `dispatcher` / `pool` / `ssl` configured.
 *
 * Builds and caches undici dispatchers, maps reixo's `pool` / `ssl` options
 * onto undici, applies runtime-specific proxy options (Bun, Deno), and turns
 * proxy failures into reixo's error types.
 *
 * `undici` is an **optional peer dependency**, loaded with a non-literal
 * dynamic import so browser bundlers never resolve or inline it.
 */

import type { ConnectionPoolOptions } from './connection';
import type { HTTPOptions } from './http';
import { HTTPError, NetworkError } from './http';
import { internalWarn } from './internal-log';
import type { ProxyEnv, ProxyOption, TLSOptions, WarnLogger } from './proxy';
import { redactProxyUrl, scrubCredentials, snapshotProxyEnv } from './proxy';
import { detectRuntime } from './runtime';

/** Minimal undici `Dispatcher` surface reixo relies on. */
interface DispatcherLike {
  dispatch: (...args: never[]) => unknown;
  close?: () => Promise<void> | void;
  destroy?: () => Promise<void> | void;
}

interface UndiciModule {
  Agent: new (opts: Record<string, unknown>) => DispatcherLike;
  EnvHttpProxyAgent?: new (opts: Record<string, unknown>) => DispatcherLike;
}

// ---------------------------------------------------------------------------
// Resolved proxy routes
// ---------------------------------------------------------------------------

/**
 * A fully-resolved proxy route. Produced only by {@link resolveProxyOption};
 * branded via `resolvedRoutes` so re-resolving it is a no-op (this keeps the
 * `'env'` snapshot semantics intact when the route travels from the client
 * to the transport).
 * @internal
 */
export interface ResolvedProxy {
  readonly httpProxy?: string;
  readonly httpsProxy?: string;
  readonly noProxy: string;
}

const resolvedRoutes = new WeakSet<object>();

function makeRoute(httpProxy?: string, httpsProxy?: string, noProxy = ''): ResolvedProxy | null {
  if (!httpProxy && !httpsProxy) return null;
  const route: { httpProxy?: string; httpsProxy?: string; noProxy: string } = { noProxy };
  if (httpProxy) route.httpProxy = validateProxyUrl(httpProxy);
  if (httpsProxy) route.httpsProxy = validateProxyUrl(httpsProxy);
  resolvedRoutes.add(route);
  return route;
}

const nonEmpty = (value: string | undefined): string | undefined =>
  value === undefined || value.trim() === '' ? undefined : value.trim();

function validateProxyUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new TypeError(`reixo: invalid proxy URL "${redactProxyUrl(url)}"`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new TypeError(
      `reixo: unsupported proxy protocol "${parsed.protocol}" in ${redactProxyUrl(url)} — only http:// and https:// proxies are supported`
    );
  }
  return url;
}

/**
 * Snapshot of the proxy environment variables. Uppercase wins over lowercase
 * when both are set; empty strings count as unset.
 * @internal
 */
export function readProxyEnv(env: ProxyEnv | undefined = snapshotProxyEnv()): ResolvedProxy | null {
  if (!env) return null;
  const pick = (name: string) => nonEmpty(env[name]) ?? nonEmpty(env[name.toLowerCase()]);
  return makeRoute(pick('HTTP_PROXY'), pick('HTTPS_PROXY'), pick('NO_PROXY') ?? '');
}

/**
 * Normalise a {@link ProxyOption} into a route.
 * Returns `null` for "no proxy" (`false`, `'env'` with nothing set, empty config)
 * and `undefined` when the option itself is `undefined` (not specified).
 *
 * @param envSnapshot Pre-read environment used for `'env'` (read now when omitted).
 * @internal
 */
export function resolveProxyOption(
  option: ProxyOption | ResolvedProxy | undefined,
  envSnapshot?: ResolvedProxy | null
): ResolvedProxy | null | undefined {
  if (option === undefined) return undefined;
  if (option === false) return null;
  if (option === 'env') return envSnapshot === undefined ? readProxyEnv() : envSnapshot;
  if (typeof option === 'string') return makeRoute(option, option);
  if (resolvedRoutes.has(option)) return option as ResolvedProxy;
  const httpsProxy = nonEmpty(option.httpsProxy);
  return makeRoute(nonEmpty(option.httpProxy) ?? httpsProxy, httpsProxy, option.noProxy ?? '');
}

// ---------------------------------------------------------------------------
// Dispatcher validation
// ---------------------------------------------------------------------------

/** `true` when `value` looks like an undici Dispatcher (has `dispatch()`). @internal */
export function isDispatcher(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { dispatch?: unknown }).dispatch === 'function'
  );
}

/** @internal */
export function assertDispatcher(value: unknown): void {
  if (!isDispatcher(value)) {
    throw new TypeError(
      'reixo: `dispatcher` must be an undici Dispatcher (an object with a dispatch() method)'
    );
  }
}

// ---------------------------------------------------------------------------
// Client-level setup (validated eagerly, consumed lazily)
// ---------------------------------------------------------------------------

export interface DispatchSetupOptions {
  proxy?: ProxyOption | undefined;
  dispatcher?: unknown;
  pool?: ConnectionPoolOptions | undefined;
  ssl?: TLSOptions | undefined;
  logger?: WarnLogger | undefined;
  /** Proxy env captured at client creation (see `snapshotProxyEnv`). Read now when omitted. */
  env?: ProxyEnv | undefined;
}

/**
 * Validated client-level proxy / dispatcher / pool / ssl settings.
 * @internal
 */
export interface DispatchSetup {
  readonly clientDispatcher: unknown;
  readonly clientRoute: ResolvedProxy | null | undefined;
  readonly envSnapshot: ResolvedProxy | null;
  readonly pool: ConnectionPoolOptions | undefined;
  readonly ssl: TLSOptions | undefined;
  readonly logger: WarnLogger | undefined;
  /** Warning keys already emitted (each warning is logged once per client). */
  readonly warned: Set<string>;
  /** `true` when client-level config requires dispatcher resolution on every request. */
  readonly active: boolean;
}

/** Runtimes whose fetch can be pointed at a proxy. @internal */
export const PROXY_RUNTIMES: ReadonlySet<string> = new Set(['node', 'bun', 'deno']);

/**
 * Validate client-level options and resolve the proxy environment snapshot.
 * Throws on an invalid proxy URL or dispatcher.
 * @internal
 */
export function createDispatchSetup(options: DispatchSetupOptions = {}): DispatchSetup {
  if (options.dispatcher !== undefined) assertDispatcher(options.dispatcher);

  const envSnapshot = readProxyEnv('env' in options ? options.env : snapshotProxyEnv());
  const setup = {
    clientDispatcher: options.dispatcher,
    clientRoute: resolveProxyOption(options.proxy, envSnapshot),
    envSnapshot,
    pool: options.pool,
    ssl: options.ssl,
    logger: options.logger,
    warned: new Set<string>(),
    active: false,
  };

  if (setup.clientRoute && !PROXY_RUNTIMES.has(detectRuntime())) {
    warnUnsupportedRuntime(setup);
    setup.clientRoute = undefined;
  }
  setup.active =
    options.dispatcher !== undefined || !!setup.clientRoute || !!(options.pool || options.ssl);
  return setup;
}

/** Log `message` once per setup, through the client logger when there is one. @internal */
export function warnOnce(
  setup: Pick<DispatchSetup, 'warned' | 'logger'>,
  key: string,
  message: string
): void {
  if (setup.warned.has(key)) return;
  setup.warned.add(key);
  if (setup.logger) setup.logger.warn(`reixo: ${message}`);
  else internalWarn(message);
}

/** @internal */
export function warnUnsupportedRuntime(setup: Pick<DispatchSetup, 'warned' | 'logger'>): void {
  warnOnce(
    setup,
    'runtime',
    `The \`proxy\` option is not supported in the "${detectRuntime()}" runtime and was ignored — requests go direct.`
  );
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

const DEFAULT_PORTS: Record<string, number> = { 'http:': 80, 'https:': 443 };

/**
 * `true` when `target` matches the NO_PROXY list (same rules as undici's
 * `EnvHttpProxyAgent`: exact host or any subdomain, optional `:port`, `'*'`).
 * @internal
 */
export function shouldBypassProxy(target: URL, noProxy: string): boolean {
  const value = noProxy.trim();
  if (!value) return false;
  if (value === '*') return true;

  // Keep brackets around IPv6 literals, like undici does.
  const hostname = target.host.replace(/:\d*$/, '').toLowerCase();
  const port = Number.parseInt(target.port, 10) || DEFAULT_PORTS[target.protocol] || 0;

  for (const raw of value.split(/[\s,]/)) {
    if (!raw) continue;
    const colon = raw.lastIndexOf(':');
    const hasPort = colon > 0 && /^\d+$/.test(raw.slice(colon + 1));
    const entryHost = (hasPort ? raw.slice(0, colon) : raw).replace(/^\*?\./, '').toLowerCase();
    const entryPort = hasPort ? Number.parseInt(raw.slice(colon + 1), 10) : 0;
    if (entryPort && entryPort !== port) continue;
    if (hostname === entryHost || hostname.endsWith(`.${entryHost}`)) return true;
  }
  return false;
}

/**
 * The proxy URL a request to `target` goes through, or `undefined` when it
 * goes direct. https targets fall back to `httpProxy` (undici semantics).
 * @internal
 */
export function proxyForUrl(target: string, route: ResolvedProxy): string | undefined {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return undefined;
  }
  const proxy = url.protocol === 'https:' ? (route.httpsProxy ?? route.httpProxy) : route.httpProxy;
  if (!proxy || shouldBypassProxy(url, route.noProxy)) return undefined;
  return proxy;
}

/** Dispatchers reixo built for a proxy → the route they serve (used for error messages). */
const dispatcherRoutes = new WeakMap<object, ResolvedProxy>();

function proxyViaDispatcher(dispatcher: unknown, target: string): string | undefined {
  if (typeof dispatcher !== 'object' || dispatcher === null) return undefined;
  const route = dispatcherRoutes.get(dispatcher);
  const proxy = route ? proxyForUrl(target, route) : undefined;
  return proxy ? redactProxyUrl(proxy) : undefined;
}

// ---------------------------------------------------------------------------
// undici loading + option mapping
// ---------------------------------------------------------------------------

// Specifier kept in a variable (plus bundler-ignore hints) so browser bundlers
// never try to resolve or inline undici.
const UNDICI_SPECIFIER = 'undici';
const defaultUndiciLoader = (): Promise<UndiciModule> =>
  import(/* webpackIgnore: true */ /* @vite-ignore */ UNDICI_SPECIFIER) as Promise<UndiciModule>;
let undiciLoader: () => Promise<UndiciModule> = defaultUndiciLoader;

/** @internal Test hook — swap the undici loader (pass `undefined` to restore). */
export function _setUndiciLoader(loader?: () => Promise<unknown>): void {
  undiciLoader = (loader as (() => Promise<UndiciModule>) | undefined) ?? defaultUndiciLoader;
}

async function loadUndici(): Promise<UndiciModule> {
  let mod: UndiciModule & { default?: UndiciModule };
  try {
    mod = await undiciLoader();
  } catch (error) {
    const missing = new Error(
      'reixo: proxy/pool/ssl support in Node requires the "undici" package — npm i undici'
    );
    (missing as { cause?: unknown }).cause = error;
    throw missing;
  }
  return mod.Agent ? mod : (mod.default ?? mod);
}

/**
 * Translate reixo's `pool` + `ssl` options into undici constructor options.
 * @internal
 */
export function toUndiciOptions(
  pool?: ConnectionPoolOptions,
  ssl?: TLSOptions
): { agent: Record<string, unknown>; tls: Record<string, unknown> | undefined } {
  const agent: Record<string, unknown> = {};
  const connect: Record<string, unknown> = {};

  if (pool) {
    if (pool.maxSockets !== undefined && Number.isFinite(pool.maxSockets) && pool.maxSockets > 0) {
      agent['connections'] = pool.maxSockets;
    }
    // undici always keeps connections alive; pipelining 0 disables reuse.
    if (pool.keepAlive === false) agent['pipelining'] = 0;
    // node:http `keepAliveMsecs` is the TCP keep-alive probe delay.
    if (pool.keepAliveMsecs !== undefined && pool.keepAlive !== false) {
      connect['keepAlive'] = true;
      connect['keepAliveInitialDelay'] = pool.keepAliveMsecs;
    }
  }

  // `ssl` wins over TLS fields set on `pool` (matches the old `{ ...pool, ...ssl }` merge).
  const tlsKeys = ['rejectUnauthorized', 'ca', 'cert', 'key', 'passphrase', 'secureProtocol'];
  const tls: Record<string, unknown> = {};
  for (const source of [pool, ssl]) {
    if (!source) continue;
    for (const key of tlsKeys) {
      const value = (source as Record<string, unknown>)[key];
      if (value !== undefined) tls[key] = value;
    }
  }
  const hasTls = Object.keys(tls).length > 0;

  if (hasTls || Object.keys(connect).length > 0) agent['connect'] = { ...connect, ...tls };
  return { agent, tls: hasTls ? tls : undefined };
}

// ---------------------------------------------------------------------------
// DispatcherManager
// ---------------------------------------------------------------------------

/** Fields of `HTTPOptions` this module reads and rewrites. */
export interface DispatchFields {
  proxy?: ProxyOption | ResolvedProxy | undefined;
  dispatcher?: unknown;
  agent?: unknown;
}

/**
 * Resolves `proxy` / `dispatcher` / `pool` / `ssl` into what the transport
 * passes to `fetch`, and owns (caches + closes) the undici dispatchers it builds.
 *
 * Resolution order per request:
 * `options.dispatcher` > `options.proxy` > `config.dispatcher` > `config.proxy`
 * > pool/ssl dispatcher > none.
 * @internal
 */
export class DispatcherManager {
  private readonly undiciOptions: ReturnType<typeof toUndiciOptions>;
  private readonly cache = new Map<string, Promise<DispatcherLike>>();

  constructor(private readonly setup: DispatchSetup) {
    this.undiciOptions = toUndiciOptions(setup.pool, setup.ssl);
  }

  /**
   * Return a copy of `options` with `proxy` / `agent` resolved away and
   * `dispatcher` set (Node). On Bun/Deno `proxy` is left as a resolved route
   * for the transport to turn into the runtime's native proxy option.
   */
  async prepare<T extends DispatchFields>(options: T): Promise<T> {
    const out = { ...options };
    if (out.agent !== undefined) {
      if (out.dispatcher === undefined) {
        warnOnce(
          this.setup,
          'agent',
          'The `agent` option is ignored: fetch does not accept Node.js http(s).Agent instances. Use `pool` / `ssl` or `dispatcher` instead.'
        );
      }
      delete out.agent;
    }

    if (out.dispatcher !== undefined) {
      assertDispatcher(out.dispatcher);
      delete out.proxy;
      return out;
    }

    let route: ResolvedProxy | null | undefined;
    if (out.proxy === undefined) {
      if (this.setup.clientDispatcher !== undefined) {
        out.dispatcher = this.setup.clientDispatcher;
        return out;
      }
      route = this.setup.clientRoute;
    } else {
      route = resolveProxyOption(out.proxy, this.setup.envSnapshot);
      delete out.proxy;
    }

    const runtime = detectRuntime();
    if (route) {
      if (runtime === 'node') {
        out.dispatcher = await this.getDispatcher(route);
        return out;
      }
      if (runtime === 'bun' || runtime === 'deno') {
        out.proxy = route;
        return out;
      }
      warnUnsupportedRuntime(this.setup);
    }

    if (runtime === 'node' && (this.setup.pool || this.setup.ssl)) {
      out.dispatcher = await this.getDispatcher(null);
    }
    return out;
  }

  /** Close every dispatcher this manager created. */
  async destroy(): Promise<void> {
    const pending = [...this.cache.values()];
    this.cache.clear();
    await Promise.all(
      pending.map(async (entry) => {
        try {
          const dispatcher = await entry;
          await (dispatcher.destroy ?? dispatcher.close)?.call(dispatcher);
        } catch {
          // Ignore — creation failures were already reported to the caller.
        }
      })
    );
  }

  private getDispatcher(route: ResolvedProxy | null): Promise<DispatcherLike> {
    const key = route ? JSON.stringify([route.httpProxy, route.httpsProxy, route.noProxy]) : '';
    let entry = this.cache.get(key);
    if (!entry) {
      entry = this.createDispatcher(route);
      // Don't cache failures (e.g. undici missing) — let the next call retry.
      entry.catch(() => this.cache.delete(key));
      this.cache.set(key, entry);
    }
    return entry;
  }

  private async createDispatcher(route: ResolvedProxy | null): Promise<DispatcherLike> {
    const undici = await loadUndici();
    const { agent, tls } = this.undiciOptions;
    if (!route) return new undici.Agent(agent);

    if (!undici.EnvHttpProxyAgent) {
      throw new Error('reixo: proxy support requires undici >= 6.14.0 — npm i undici@latest');
    }
    const dispatcher = new undici.EnvHttpProxyAgent({
      ...agent,
      ...(tls ? { requestTls: tls, proxyTls: tls } : {}),
      // Always pass explicit values ('' = none) so undici never re-reads the env.
      httpProxy: route.httpProxy ?? '',
      httpsProxy: route.httpsProxy ?? '',
      noProxy: route.noProxy,
    });
    dispatcherRoutes.set(dispatcher, route);
    return dispatcher;
  }
}

// ---------------------------------------------------------------------------
// Transport-level resolution (used by `http()`)
// ---------------------------------------------------------------------------

/** Shared manager for standalone `http()` calls (no client-level config). */
let standaloneManager: DispatcherManager | undefined;
const denoClients = new Map<string, unknown>();

/**
 * Resolve the runtime-specific extras `http()` adds to the `fetch` init.
 * @returns `init` — keys to merge into the fetch init; `via` — redacted proxy
 *          origin when the request is proxied (for error messages).
 * @internal
 */
export async function resolveFetchExtras(
  target: string,
  fields: DispatchFields
): Promise<{ init: Record<string, unknown>; via: string | undefined }> {
  standaloneManager ??= new DispatcherManager(createDispatchSetup());
  const prepared = await standaloneManager.prepare(fields);
  const init: Record<string, unknown> = {};

  if (prepared.dispatcher !== undefined) {
    init['dispatcher'] = prepared.dispatcher;
    return { init, via: proxyViaDispatcher(prepared.dispatcher, target) };
  }

  const route = resolveProxyOption(prepared.proxy);
  const proxy = route ? proxyForUrl(target, route) : undefined;
  if (!proxy) return { init, via: undefined };

  const runtime = detectRuntime();
  if (runtime === 'bun') {
    init['proxy'] = proxy;
  } else if (runtime === 'deno') {
    const client = getDenoClient(proxy);
    if (!client) return { init, via: undefined };
    init['client'] = client;
  }
  return { init, via: redactProxyUrl(proxy) };
}

function getDenoClient(proxy: string): unknown {
  const deno = (globalThis as { Deno?: { createHttpClient?: (o: unknown) => unknown } }).Deno;
  if (typeof deno?.createHttpClient !== 'function') {
    internalWarn(
      'The `proxy` option needs Deno.createHttpClient, which this Deno runtime does not expose — requests go direct.'
    );
    return undefined;
  }
  let client = denoClients.get(proxy);
  if (!client) {
    client = deno.createHttpClient({ proxy: { url: proxy } });
    denoClients.set(proxy, client);
  }
  return client;
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

const PROXY_STATUS_TEXT: Record<number, string> = {
  403: 'Forbidden',
  407: 'Proxy Authentication Required',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

function* causeChain(error: unknown): Generator<Record<string, unknown>> {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth++) {
    yield current as Record<string, unknown>;
    current = (current as { cause?: unknown }).cause;
  }
}

/**
 * Map a fetch rejection for a proxied request onto reixo's error types, so
 * "proxy down / proxy refused" is distinguishable from "upstream down".
 * `via` is the already-redacted proxy origin.
 * @internal
 */
export function toProxyError(
  error: unknown,
  via: string,
  target: string,
  config: HTTPOptions
): Error {
  const cause = error instanceof Error ? error : undefined;
  let host = target;
  let proxyHost = '';
  let proxyPort = '';
  try {
    host = new URL(target).host;
    const parsed = new URL(via);
    proxyHost = parsed.hostname.replace(/^\[|\]$/g, '');
    proxyPort = parsed.port || String(DEFAULT_PORTS[parsed.protocol] ?? '');
  } catch {
    // keep defaults
  }

  let code: string | undefined;
  let atProxy = false;
  for (const link of causeChain(error)) {
    const message = typeof link['message'] === 'string' ? link['message'] : '';
    // undici: "Proxy response (407) !== 200 when HTTP Tunneling"
    const tunnel = /Proxy response \((\d{3})\)/.exec(message);
    if (tunnel?.[1]) {
      // Surface as HTTPError so the usual retry rules apply (407 is not retried).
      const status = Number.parseInt(tunnel[1], 10);
      const statusText = PROXY_STATUS_TEXT[status] ?? '';
      return new HTTPError(
        `Proxy ${via} rejected CONNECT to ${host}: ${status} ${statusText}`.trim(),
        { status, statusText, config }
      );
    }
    if (typeof link['code'] === 'string' && !code) code = link['code'];
    const address = link['address'] ?? link['hostname'];
    if (address !== undefined && String(address) === proxyHost) {
      atProxy = link['port'] === undefined || String(link['port']) === proxyPort;
    }
  }

  const detail = code ?? (cause ? scrubCredentials(cause.message) : 'request failed');
  return new NetworkError(
    atProxy
      ? `Proxy ${via} is unreachable (${detail})`
      : `Network request to ${host} via proxy ${via} failed (${detail})`,
    cause
  );
}
