/**
 * Proxy / dispatcher / pool / ssl tests.
 *
 * Uses a real local forward proxy (node:http 'connect' handler) and a plain
 * HTTP upstream. undici's ProxyAgent tunnels http:// targets via CONNECT too,
 * so the CONNECT path is exercised without needing any TLS certificates.
 */
/* eslint-disable sonarjs/no-clear-text-protocols -- local test proxies/servers speak plain HTTP */
import * as http from 'node:http';
import * as https from 'node:https';
import type { AddressInfo } from 'node:net';
import * as net from 'node:net';

import { MockAgent } from 'undici';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HTTPClient } from '../src/core/http-client';
import { http as httpFn, HTTPError, NetworkError, TimeoutError } from '../src/utils/http';
import { redactProxyUrl, scrubCredentials } from '../src/utils/proxy';
import {
  _setUndiciLoader,
  createDispatchSetup,
  DispatcherManager as Manager,
  type DispatchSetupOptions,
  proxyForUrl,
  readProxyEnv,
  resolveProxyOption,
  shouldBypassProxy,
  toUndiciOptions,
} from '../src/utils/proxy-dispatch';
import * as runtime from '../src/utils/runtime';

vi.mock('../src/utils/runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/utils/runtime')>();
  return { ...actual, detectRuntime: vi.fn(actual.detectRuntime) };
});

// ---------------------------------------------------------------------------
// Local servers
// ---------------------------------------------------------------------------

interface TestProxy {
  url: string;
  port: number;
  connects: Array<{ target: string; auth: string | undefined }>;
  close: () => Promise<void>;
}

/** Forward proxy: tunnels CONNECT, or answers it with `reject` (e.g. 407 / 502). */
async function startProxy(reject?: string): Promise<TestProxy> {
  const connects: TestProxy['connects'] = [];
  const sockets = new Set<net.Socket>();
  const server = http.createServer((_req, res) => res.writeHead(405).end());
  server.on('connect', (req, socket: net.Socket, head) => {
    connects.push({ target: req.url ?? '', auth: req.headers['proxy-authorization'] });
    sockets.add(socket);
    if (reject) {
      socket.end(`HTTP/1.1 ${reject}\r\nContent-Length: 0\r\n\r\n`);
      return;
    }
    const [host, port] = (req.url ?? '').split(':');
    const upstream = net.connect(Number(port), host, () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    sockets.add(upstream);
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    connects,
    close: () =>
      new Promise((resolve) => {
        for (const s of sockets) s.destroy();
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

interface TestUpstream {
  url: string;
  host: string;
  connections: number;
  close: () => Promise<void>;
}

async function startUpstream(handler: http.RequestListener): Promise<TestUpstream> {
  const server = http.createServer(handler);
  const state: TestUpstream = { url: '', host: '', connections: 0, close: async () => {} };
  server.on('connection', () => state.connections++);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  state.host = `127.0.0.1:${port}`;
  state.url = `http://${state.host}`;
  state.close = () =>
    new Promise((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  return state;
}

/** A port with nothing listening on it. */
async function deadPort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

const ENV_KEYS = ['HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy', 'NO_PROXY', 'no_proxy'];

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('proxy helpers', () => {
  it('redactProxyUrl strips credentials and keeps the origin', () => {
    expect(redactProxyUrl('http://user:s3cret@proxy.internal:3128/')).toBe(
      'http://proxy.internal:3128'
    );
    expect(redactProxyUrl('https://proxy.internal')).toBe('https://proxy.internal');
    expect(redactProxyUrl('not a url user:pw@host')).not.toContain('://user');
  });

  it('scrubCredentials removes userinfo from free text', () => {
    expect(scrubCredentials('failed http://u:p@h:1 and https://a:b@c')).toBe(
      'failed http://h:1 and https://c'
    );
  });

  it('shouldBypassProxy follows NO_PROXY semantics', () => {
    const u = (s: string) => new URL(s);
    expect(shouldBypassProxy(u('https://api.example.com'), '*')).toBe(true);
    expect(shouldBypassProxy(u('https://example.com'), 'example.com')).toBe(true);
    expect(shouldBypassProxy(u('https://api.example.com'), 'example.com')).toBe(true);
    expect(shouldBypassProxy(u('https://api.example.com'), '.example.com')).toBe(true);
    expect(shouldBypassProxy(u('https://api.example.com'), '*.example.com')).toBe(true);
    expect(shouldBypassProxy(u('https://notexample.com'), 'example.com')).toBe(false);
    expect(shouldBypassProxy(u('https://svc:8443'), 'svc:8443')).toBe(true);
    expect(shouldBypassProxy(u('https://svc'), 'svc:8443')).toBe(false);
    expect(shouldBypassProxy(u('https://svc'), 'svc:443')).toBe(true);
    expect(shouldBypassProxy(u('http://localhost:3000'), 'foo, localhost')).toBe(true);
    expect(shouldBypassProxy(u('http://[::1]:3000'), '[::1]')).toBe(true);
    expect(shouldBypassProxy(u('https://x.com'), '')).toBe(false);
  });

  it('readProxyEnv: uppercase wins, lowercase is a fallback, empty counts as unset', () => {
    expect(readProxyEnv({})).toBeNull();
    expect(readProxyEnv({ https_proxy: 'http://lower:1' })?.httpsProxy).toBe('http://lower:1');
    expect(
      readProxyEnv({ HTTPS_PROXY: 'http://upper:1', https_proxy: 'http://lower:1' })?.httpsProxy
    ).toBe('http://upper:1');
    expect(readProxyEnv({ HTTPS_PROXY: '', https_proxy: 'http://lower:1' })?.httpsProxy).toBe(
      'http://lower:1'
    );
    const route = readProxyEnv({ HTTPS_PROXY: 'http://p:1', no_proxy: '.internal' });
    expect(route).toMatchObject({ httpsProxy: 'http://p:1', noProxy: '.internal' });
    expect(route?.httpProxy).toBeUndefined();
  });

  it('resolveProxyOption normalises every form', () => {
    expect(resolveProxyOption(void 0)).toBeUndefined();
    expect(resolveProxyOption(false)).toBeNull();
    expect(resolveProxyOption({})).toBeNull();
    expect(resolveProxyOption('http://p:1')).toMatchObject({
      httpProxy: 'http://p:1',
      httpsProxy: 'http://p:1',
      noProxy: '',
    });
    // httpProxy defaults to httpsProxy
    expect(resolveProxyOption({ httpsProxy: 'http://s:1' })).toMatchObject({
      httpProxy: 'http://s:1',
      httpsProxy: 'http://s:1',
    });
    expect(resolveProxyOption('env', null)).toBeNull();
  });

  it('rejects invalid / unsupported proxy URLs without leaking credentials', () => {
    expect(() => resolveProxyOption('socks5://u:secret@h:1')).toThrow(/only http/);
    expect(() => resolveProxyOption('socks5://u:secret@h:1')).not.toThrow(/secret/);
    expect(() => resolveProxyOption('::nope::')).toThrow(/invalid proxy URL/);
  });

  it('proxyForUrl picks the scheme-specific proxy and honours noProxy', () => {
    const route = resolveProxyOption({
      httpsProxy: 'http://s:1',
      httpProxy: 'http://h:1',
      noProxy: 'skip.me',
    })!;
    expect(proxyForUrl('https://a.com/x', route)).toBe('http://s:1');
    expect(proxyForUrl('http://a.com/x', route)).toBe('http://h:1');
    expect(proxyForUrl('https://api.skip.me/x', route)).toBeUndefined();
    // env-style route with only HTTPS_PROXY: http targets go direct
    const envRoute = readProxyEnv({ HTTPS_PROXY: 'http://s:1' })!;
    expect(proxyForUrl('http://a.com', envRoute)).toBeUndefined();
  });

  it('toUndiciOptions maps pool and ssl options', () => {
    expect(
      toUndiciOptions(
        { maxSockets: 4, keepAliveMsecs: 500, ca: 'pool-ca' },
        { ca: 'ssl-ca', rejectUnauthorized: false }
      )
    ).toEqual({
      agent: {
        connections: 4,
        connect: {
          keepAlive: true,
          keepAliveInitialDelay: 500,
          ca: 'ssl-ca',
          rejectUnauthorized: false,
        },
      },
      tls: { ca: 'ssl-ca', rejectUnauthorized: false },
    });
    expect(toUndiciOptions({ keepAlive: false, maxSockets: Infinity })).toEqual({
      agent: { pipelining: 0 },
      tls: undefined,
    });
  });
});

// ---------------------------------------------------------------------------
// End-to-end through a real proxy
// ---------------------------------------------------------------------------

describe('HTTPClient proxy (Node)', () => {
  let proxy: TestProxy;
  let upstream: TestUpstream;
  const clients: HTTPClient[] = [];
  const savedEnv: Record<string, string | undefined> = {};

  const makeClient = (config: ConstructorParameters<typeof HTTPClient>[0]) => {
    const client = new HTTPClient(config);
    clients.push(client);
    return client;
  };

  beforeEach(async () => {
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    proxy = await startProxy();
    upstream = await startUpstream((req, res) => {
      res.setHeader('content-type', 'text/plain');
      res.end(`hello ${req.url}`);
    });
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) client.dispose();
    await proxy.close();
    await upstream.close();
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
    _setUndiciLoader();
    vi.mocked(runtime.detectRuntime).mockRestore?.();
    vi.restoreAllMocks();
  });

  it('tunnels through a string proxy (CONNECT recorded, body returned)', async () => {
    const client = makeClient({ baseURL: upstream.url, proxy: proxy.url, retry: false });
    const res = await client.get<string>('/a');
    expect(res.data).toBe('hello /a');
    expect(proxy.connects.map((c) => c.target)).toEqual([upstream.host]);
  });

  it("proxy: 'env' uses HTTP_PROXY / HTTPS_PROXY", async () => {
    process.env.HTTP_PROXY = proxy.url;
    const client = makeClient({ baseURL: upstream.url, proxy: 'env', retry: false });
    expect((await client.get<string>('/env')).data).toBe('hello /env');
    expect(proxy.connects).toHaveLength(1);
  });

  it("proxy: 'env' falls back to the lowercase variable", async () => {
    process.env.http_proxy = proxy.url;
    const client = makeClient({ baseURL: upstream.url, proxy: 'env', retry: false });
    await client.get('/lower');
    expect(proxy.connects).toHaveLength(1);
  });

  it("proxy: 'env' — uppercase wins over lowercase", async () => {
    process.env.HTTP_PROXY = proxy.url;
    process.env.http_proxy = `http://127.0.0.1:${await deadPort()}`;
    const client = makeClient({ baseURL: upstream.url, proxy: 'env', retry: false });
    expect((await client.get<string>('/upper')).data).toBe('hello /upper');
    expect(proxy.connects).toHaveLength(1);
  });

  it("proxy: 'env' reads the environment once, at client creation", async () => {
    const client = makeClient({ baseURL: upstream.url, proxy: 'env', retry: false });
    process.env.HTTP_PROXY = proxy.url; // set after creation → ignored
    await client.get('/snapshot');
    expect(proxy.connects).toHaveLength(0);
  });

  it('without proxy option, HTTP_PROXY is ignored (opt-in)', async () => {
    process.env.HTTP_PROXY = proxy.url;
    const client = makeClient({ baseURL: upstream.url, retry: false });
    await client.get('/direct');
    expect(proxy.connects).toHaveLength(0);
  });

  it('bypasses the proxy for NO_PROXY hosts (object and env modes)', async () => {
    const objClient = makeClient({
      baseURL: upstream.url,
      proxy: { httpProxy: proxy.url, noProxy: 'localhost, 127.0.0.1' },
      retry: false,
    });
    expect((await objClient.get<string>('/np')).data).toBe('hello /np');

    process.env.HTTP_PROXY = proxy.url;
    process.env.NO_PROXY = '127.0.0.1';
    const envClient = makeClient({ baseURL: upstream.url, proxy: 'env', retry: false });
    await envClient.get('/np-env');

    expect(proxy.connects).toHaveLength(0);
  });

  it('per-request proxy: false bypasses a client-level proxy', async () => {
    const client = makeClient({ baseURL: upstream.url, proxy: proxy.url, retry: false });
    expect((await client.get<string>('/direct', { proxy: false })).data).toBe('hello /direct');
    expect(proxy.connects).toHaveLength(0);
    await client.get('/proxied');
    expect(proxy.connects).toHaveLength(1);
  });

  it('per-request proxy overrides a client without one', async () => {
    const client = makeClient({ baseURL: upstream.url, retry: false });
    await client.get('/one', { proxy: proxy.url });
    expect(proxy.connects).toHaveLength(1);
  });

  it('sends Proxy-Authorization from URL credentials and never leaks the password', async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const secretProxy = `http://user:s3cr3t-pw@127.0.0.1:${proxy.port}`;
    const client = makeClient({ baseURL: upstream.url, proxy: secretProxy, retry: false, logger });

    await client.get('/auth');
    expect(proxy.connects[0]?.auth).toBe(
      `Basic ${Buffer.from('user:s3cr3t-pw').toString('base64')}`
    );

    // Force an error through a rejecting proxy with credentials.
    const rejecting = await startProxy('407 Proxy Authentication Required');
    const failing = makeClient({
      baseURL: upstream.url,
      proxy: `http://user:s3cr3t-pw@127.0.0.1:${rejecting.port}`,
      retry: false,
      logger,
    });
    const error = await failing.get('/auth').catch((e: unknown) => e);
    await rejecting.close();

    expect(error).toBeInstanceOf(HTTPError);
    expect((error as Error).message).toContain(`http://127.0.0.1:${rejecting.port}`);
    expect((error as Error).message).not.toContain('s3cr3t');
    expect(JSON.stringify((error as HTTPError).config ?? {})).not.toContain('s3cr3t');
    const logged = JSON.stringify(
      [...logger.info.mock.calls, ...logger.warn.mock.calls, ...logger.error.mock.calls].map(
        (args) => args.map((a) => (a instanceof Error ? a.message : a))
      )
    );
    expect(logged).not.toContain('s3cr3t');
  });

  it('407 from the proxy → HTTPError(407), not retried', async () => {
    const rejecting = await startProxy('407 Proxy Authentication Required');
    const client = makeClient({
      baseURL: upstream.url,
      proxy: rejecting.url,
      retry: { maxRetries: 3, initialDelayMs: 1 },
    });
    const error = await client.get('/x').catch((e: unknown) => e);
    await rejecting.close();

    expect(error).toBeInstanceOf(HTTPError);
    expect((error as HTTPError).status).toBe(407);
    expect((error as Error).message).toMatch(/Proxy http:\/\/127\.0\.0\.1:\d+ rejected CONNECT/);
    expect(rejecting.connects).toHaveLength(1);
  });

  it('CONNECT rejected with 502 → HTTPError(502), retried like any 5xx', async () => {
    const rejecting = await startProxy('502 Bad Gateway');
    const client = makeClient({
      baseURL: 'http://upstream.invalid',
      proxy: rejecting.url,
      retry: { maxRetries: 2, initialDelayMs: 1 },
    });
    const error = await client.get('/x').catch((e: unknown) => e);
    await rejecting.close();

    expect(error).toBeInstanceOf(HTTPError);
    expect((error as HTTPError).status).toBe(502);
    expect((error as Error).message).toContain('upstream.invalid');
    expect(rejecting.connects).toHaveLength(3);
  });

  it('proxy down (ECONNREFUSED) → NetworkError naming the redacted proxy', async () => {
    const port = await deadPort();
    const client = makeClient({
      baseURL: upstream.url,
      proxy: `http://user:pw-secret@127.0.0.1:${port}`,
      retry: false,
    });
    const error = await client.get('/x').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NetworkError);
    expect((error as Error).message).toBe(
      `Proxy http://127.0.0.1:${port} is unreachable (ECONNREFUSED)`
    );
    expect((error as Error).message).not.toContain('pw-secret');
  });

  it('retry through the proxy: 503 then 200', async () => {
    let hits = 0;
    const flaky = await startUpstream((_req, res) => {
      hits++;
      if (hits === 1) res.writeHead(503).end('busy');
      else res.end('ok');
    });
    const client = makeClient({
      baseURL: flaky.url,
      proxy: proxy.url,
      retry: { maxRetries: 2, initialDelayMs: 1 },
    });
    const res = await client.get<string>('/retry');
    await flaky.close();

    expect(res.status).toBe(200);
    expect(res.data).toBe('ok');
    expect(hits).toBe(2);
    // The keep-alive tunnel is reused for the retry: undici has already
    // buffered the small 503 body, so the socket is free again and no second
    // CONNECT is issued. (A large, unread error body could force a new tunnel.)
    expect(proxy.connects).toHaveLength(1);
  });

  it('timeout through the proxy still raises TimeoutError', async () => {
    const slow = await startUpstream((_req, res) => {
      setTimeout(() => res.end('late'), 500);
    });
    const client = makeClient({ baseURL: slow.url, proxy: proxy.url, retry: false });
    const error = await client.get('/slow', { timeoutMs: 50 }).catch((e: unknown) => e);
    await slow.close();
    expect(error).toBeInstanceOf(TimeoutError);
  });

  it('passes a user-supplied dispatcher (MockAgent) through unchanged', async () => {
    const mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    mockAgent
      .get('https://mock.test')
      .intercept({ path: '/x' })
      .reply(200, { mocked: true }, { headers: { 'content-type': 'application/json' } })
      .times(2);

    const client = makeClient({
      baseURL: 'https://mock.test',
      dispatcher: mockAgent,
      proxy: proxy.url, // ignored: client dispatcher wins over client proxy
      retry: false,
    });
    expect((await client.get('/x')).data).toEqual({ mocked: true });

    // Per-request dispatcher wins over a client-level proxy too.
    const proxied = makeClient({ baseURL: 'https://mock.test', proxy: proxy.url, retry: false });
    expect((await proxied.get('/x', { dispatcher: mockAgent })).data).toEqual({ mocked: true });

    expect(proxy.connects).toHaveLength(0);
    await mockAgent.close();
  });

  it('rejects a dispatcher without dispatch() / an invalid proxy URL (redacted)', async () => {
    const bad = makeClient({ dispatcher: {}, retry: false });
    await expect(bad.get(upstream.url)).rejects.toThrow(/undici Dispatcher/);
    const badProxy = makeClient({ proxy: 'socks5://u:topsecret@h:1', retry: false });
    const error = await badProxy.get(upstream.url).catch((e: unknown) => e);
    expect((error as Error).message).toMatch(/only http/);
    expect((error as Error).message).not.toContain('topsecret');
  });

  it('custom transports receive a typed dispatcher instead of proxy', async () => {
    const seen: Array<Record<string, unknown>> = [];
    const client = makeClient({
      baseURL: upstream.url,
      proxy: proxy.url,
      retry: false,
      transport: (url, options) => {
        seen.push({ ...options });
        return httpFn(url, options);
      },
    });
    await client.get('/t');
    expect(seen[0]?.['dispatcher']).toBeDefined();
    expect(seen[0]).not.toHaveProperty('proxy');
    expect(proxy.connects).toHaveLength(1);
  });

  it('standalone http() supports proxy', async () => {
    const res = await httpFn<string>(`${upstream.url}/solo`, { proxy: proxy.url, retry: false });
    expect(res.data).toBe('hello /solo');
    expect(proxy.connects).toHaveLength(1);
  });

  it('pool.maxSockets now takes effect: 2 concurrent requests share 1 socket', async () => {
    const slow = await startUpstream((_req, res) => setTimeout(() => res.end('ok'), 30));

    // Control: without pool, fetch opens one socket per concurrent request.
    const plain = makeClient({ baseURL: slow.url, retry: false });
    await Promise.all([plain.get('/a'), plain.get('/b')]);
    expect(slow.connections).toBe(2);

    slow.connections = 0;
    const pooled = makeClient({
      baseURL: slow.url,
      retry: false,
      pool: { keepAlive: true, maxSockets: 1 },
    });
    await Promise.all([pooled.get('/a'), pooled.get('/b')]);
    expect(slow.connections).toBe(1);
    await slow.close();
  });

  it('a raw node:https Agent is ignored with a single warning', async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const client = makeClient({ baseURL: upstream.url, retry: false, logger });
    const agent = new https.Agent();
    await client.get('/a', { agent });
    await client.get('/b', { agent });
    agent.destroy();
    const agentWarnings = logger.warn.mock.calls.filter(([m]) => String(m).includes('`agent`'));
    expect(agentWarnings).toHaveLength(1);
  });

  it('closes cached dispatchers on dispose()', async () => {
    const client = new HTTPClient({ baseURL: upstream.url, proxy: proxy.url, retry: false });
    await client.get('/a');
    const manager = await (client as unknown as { dispatchers: Promise<unknown> }).dispatchers;
    const cache = (manager as { cache: Map<string, unknown> }).cache;
    const dispatcher = (await cache.values().next().value) as { destroyed: boolean };
    client.dispose();
    await vi.waitFor(() => expect(dispatcher.destroyed).toBe(true));
    expect(cache.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TLS mapping, runtimes, missing undici, no-proxy fast path
// ---------------------------------------------------------------------------

const DispatcherManager = class extends Manager {
  constructor(options: DispatchSetupOptions) {
    super(createDispatchSetup(options));
  }
};

describe('DispatcherManager', () => {
  afterEach(() => {
    _setUndiciLoader();
    vi.mocked(runtime.detectRuntime).mockReset();
    vi.mocked(runtime.detectRuntime).mockImplementation(() => 'node');
    vi.restoreAllMocks();
  });

  /** Fake undici capturing constructor options (no network, no certificates). */
  function fakeUndici() {
    const created: Array<{ kind: string; opts: Record<string, unknown> }> = [];
    class Agent {
      constructor(public opts: Record<string, unknown>) {
        created.push({ kind: 'Agent', opts });
      }
      dispatch() {
        return true;
      }
      async destroy() {}
    }
    class EnvHttpProxyAgent extends Agent {
      constructor(opts: Record<string, unknown>) {
        super(opts);
        created[created.length - 1]!.kind = 'EnvHttpProxyAgent';
      }
    }
    _setUndiciLoader(async () => ({ Agent, EnvHttpProxyAgent }));
    return created;
  }

  it('ssl options reach the undici Agent connect options', async () => {
    const created = fakeUndici();
    const manager = new DispatcherManager({
      ssl: { ca: 'CA-PEM', rejectUnauthorized: false },
      pool: { maxSockets: 8 },
    });
    const out = await manager.prepare({});
    expect(out.dispatcher).toBeDefined();
    expect(created).toEqual([
      {
        kind: 'Agent',
        opts: { connections: 8, connect: { ca: 'CA-PEM', rejectUnauthorized: false } },
      },
    ]);
  });

  it('ssl options are applied to both proxy hops (requestTls + proxyTls)', async () => {
    const created = fakeUndici();
    const manager = new DispatcherManager({
      proxy: { httpsProxy: 'http://p:3128', noProxy: '.local' },
      ssl: { ca: 'CA-PEM' },
    });
    await manager.prepare({});
    expect(created[0]).toEqual({
      kind: 'EnvHttpProxyAgent',
      opts: {
        connect: { ca: 'CA-PEM' },
        requestTls: { ca: 'CA-PEM' },
        proxyTls: { ca: 'CA-PEM' },
        httpProxy: 'http://p:3128',
        httpsProxy: 'http://p:3128',
        noProxy: '.local',
      },
    });
  });

  it('builds each dispatcher once and reuses it', async () => {
    const created = fakeUndici();
    const manager = new DispatcherManager({ proxy: 'http://p:3128' });
    const [a, b] = await Promise.all([manager.prepare({}), manager.prepare({})]);
    expect(a.dispatcher).toBe(b.dispatcher);
    await manager.prepare({ proxy: 'http://other:3128' });
    expect(created).toHaveLength(2);
  });

  it('throws a clear error when undici is not installed', async () => {
    _setUndiciLoader(() => Promise.reject(new Error("Cannot find package 'undici'")));
    const client = new HTTPClient({ proxy: 'http://p:3128', retry: false });
    await expect(client.get('http://example.test/')).rejects.toThrow(
      'reixo: proxy/pool/ssl support in Node requires the "undici" package — npm i undici'
    );
    client.dispose();
  });

  it('does not touch undici or change the fetch call when nothing is configured', async () => {
    const loader = vi.fn(() => Promise.reject(new Error('must not load')));
    _setUndiciLoader(loader);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response('ok', { status: 200 }));
    const client = new HTTPClient({ baseURL: 'http://example.test', retry: false });
    await client.get('/x');
    expect(loader).not.toHaveBeenCalled();
    const init = fetchSpy.mock.calls[0]![1] as Record<string, unknown>;
    expect(init).not.toHaveProperty('dispatcher');
    expect(init).not.toHaveProperty('proxy');
    client.dispose();
  });

  it('browser runtime: proxy ignored with one warning, request goes direct', async () => {
    vi.mocked(runtime.detectRuntime).mockReturnValue('browser');
    const loader = vi.fn(() => Promise.reject(new Error('must not load')));
    _setUndiciLoader(loader);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response('ok', { status: 200 }));
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    const client = new HTTPClient({
      baseURL: 'http://example.test',
      proxy: 'http://p:3128',
      retry: false,
      logger,
    });
    await client.get('/a');
    await client.get('/b', { proxy: 'http://q:3128' });

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(String(logger.warn.mock.calls[0]![0])).toContain('"browser" runtime');
    expect(loader).not.toHaveBeenCalled();
    for (const [, init] of fetchSpy.mock.calls) {
      expect(init).not.toHaveProperty('dispatcher');
      expect(init).not.toHaveProperty('proxy');
    }
    client.dispose();
  });

  it('bun runtime: passes the native `proxy` fetch option, honouring noProxy', async () => {
    vi.mocked(runtime.detectRuntime).mockReturnValue('bun');
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response('ok', { status: 200 }));
    const client = new HTTPClient({
      proxy: { httpsProxy: 'http://u:p@proxy:3128', noProxy: 'internal.test' },
      retry: false,
    });
    await client.get('https://api.example.test/x');
    await client.get('https://svc.internal.test/x');

    expect((fetchSpy.mock.calls[0]![1] as Record<string, unknown>)['proxy']).toBe(
      'http://u:p@proxy:3128'
    );
    expect(fetchSpy.mock.calls[1]![1]).not.toHaveProperty('proxy');
    expect(fetchSpy.mock.calls[0]![1]).not.toHaveProperty('dispatcher');
    client.dispose();
  });

  it('deno runtime: uses Deno.createHttpClient', async () => {
    vi.mocked(runtime.detectRuntime).mockReturnValue('deno');
    const fakeClient = { deno: 'client' };
    const createHttpClient = vi.fn(() => fakeClient);
    (globalThis as Record<string, unknown>)['Deno'] = { createHttpClient };
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response('ok', { status: 200 }));
    try {
      const client = new HTTPClient({ proxy: 'http://proxy:3128', retry: false });
      await client.get('https://api.example.test/x');
      await client.get('https://api.example.test/y');
      expect(createHttpClient).toHaveBeenCalledTimes(1);
      expect(createHttpClient).toHaveBeenCalledWith({ proxy: { url: 'http://proxy:3128' } });
      expect((fetchSpy.mock.calls[0]![1] as Record<string, unknown>)['client']).toBe(fakeClient);
      client.dispose();
    } finally {
      delete (globalThis as Record<string, unknown>)['Deno'];
    }
  });
});
