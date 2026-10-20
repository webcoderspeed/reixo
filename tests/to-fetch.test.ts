import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { HTTPClient } from '../src/core/http-client';
import { AbortError, NetworkError } from '../src/utils/http';
import { MockAdapter } from '../src/utils/mock-adapter';

type Hit = { method: string; url: string; body: string; headers: http.IncomingHttpHeaders };

let server: http.Server;
let origin: string;
let hits: Hit[] = [];
let failures = 0;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      hits.push({ method: req.method ?? '', url: req.url ?? '', body, headers: req.headers });
      const path = req.url ?? '';

      if (path.startsWith('/flaky') && failures > 0) {
        failures--;
        res.writeHead(503).end('down');
        return;
      }
      if (path === '/missing') {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ message: 'not found' }));
        return;
      }
      if (path === '/empty') {
        res.writeHead(204).end();
        return;
      }
      if (path === '/slow') {
        setTimeout(() => res.end('late'), 2000);
        return;
      }
      if (path === '/stream') {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write('data: one\n\n');
        setTimeout(() => res.end('data: two\n\n'), 300);
        return;
      }
      res.writeHead(req.method === 'POST' ? 201 : 200, {
        'content-type': 'application/json',
        'x-request-path': path,
      });
      res.end(JSON.stringify({ method: req.method, path, body: body || null }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.closeAllConnections();
  server.close();
});

beforeEach(() => {
  hits = [];
  failures = 0;
});

describe('client.toFetch()', () => {
  it('returns a fetch Response for an absolute URL even when the client has a baseURL', async () => {
    const client = new HTTPClient({ baseURL: 'https://unused.invalid/api' });
    const res = await client.toFetch()(`${origin}/pets?limit=2`);

    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(200);
    expect(res.ok).toBe(true);
    expect(res.url).toBe(`${origin}/pets?limit=2`);
    expect(res.headers.get('x-request-path')).toBe('/pets?limit=2');
    expect(await res.json()).toEqual({ method: 'GET', path: '/pets?limit=2', body: null });
  });

  it('resolves a relative URL against the client baseURL', async () => {
    const client = new HTTPClient({ baseURL: `${origin}/v1` });
    const res = await client.toFetch()('/pets');

    expect(await res.json()).toMatchObject({ path: '/v1/pets' });
  });

  it('accepts a Request object the way openapi-fetch and hey-api pass one', async () => {
    const client = new HTTPClient({});
    const request = new Request(`${origin}/pets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-trace': 'abc' },
      body: JSON.stringify({ name: 'Mango' }),
    });

    const res = await client.toFetch()(request);

    expect(res.status).toBe(201);
    expect(hits[0]?.method).toBe('POST');
    expect(hits[0]?.body).toBe('{"name":"Mango"}');
    expect(hits[0]?.headers['content-type']).toBe('application/json');
    expect(hits[0]?.headers['x-trace']).toBe('abc');
  });

  it('lets init override the fields of a Request input', async () => {
    const client = new HTTPClient({});
    const request = new Request(`${origin}/pets`, { headers: { 'x-trace': 'old' } });

    await client.toFetch()(request, { method: 'PUT', body: 'raw', headers: { 'x-trace': 'new' } });

    expect(hits[0]?.method).toBe('PUT');
    expect(hits[0]?.body).toBe('raw');
    expect(hits[0]?.headers['x-trace']).toBe('new');
  });

  it('resolves non-2xx responses instead of throwing, like fetch', async () => {
    const client = new HTTPClient({ retry: false });
    const res = await client.toFetch()(`${origin}/missing`);

    expect(res.status).toBe(404);
    expect(res.ok).toBe(false);
    expect(await res.json()).toEqual({ message: 'not found' });
  });

  it('retries 5xx with the client retry policy before handing back the response', async () => {
    const client = new HTTPClient({ retry: { maxRetries: 2, initialDelayMs: 1 } });
    failures = 2;

    const res = await client.toFetch()(`${origin}/flaky`);

    expect(res.status).toBe(200);
    expect(hits).toHaveLength(3);
  });

  it('returns the last 5xx response once retries run out', async () => {
    const client = new HTTPClient({ retry: { maxRetries: 1, initialDelayMs: 1 } });
    failures = 5;

    const res = await client.toFetch()(`${origin}/flaky`);

    expect(res.status).toBe(503);
    expect(await res.text()).toBe('down');
    expect(hits).toHaveLength(2);
  });

  it('per-call options override the client retry policy', async () => {
    const client = new HTTPClient({ retry: { maxRetries: 3, initialDelayMs: 1 } });
    failures = 5;

    const res = await client.toFetch({ retry: false })(`${origin}/flaky`);

    expect(res.status).toBe(503);
    expect(hits).toHaveLength(1);
  });

  it('gives a null body for 204 responses', async () => {
    const client = new HTTPClient({});
    const res = await client.toFetch()(`${origin}/empty`);

    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
  });

  it('streams the body instead of buffering it', async () => {
    const client = new HTTPClient({});
    const res = await client.toFetch()(`${origin}/stream`);
    const reader = res.body!.getReader();

    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toBe('data: one\n\n');
    await reader.cancel();
  });

  it('stops a streaming body when the caller aborts after the headers arrive', async () => {
    const client = new HTTPClient({});
    const controller = new AbortController();
    const res = await client.toFetch()(`${origin}/stream`, { signal: controller.signal });
    const reader = res.body!.getReader();
    await reader.read();

    controller.abort();

    await expect(reader.read()).rejects.toThrow();
  });

  it('runs request interceptors', async () => {
    const client = new HTTPClient({});
    client.interceptors.request.push({
      onFulfilled: (config) => ({
        ...config,
        headers: { ...(config.headers as Record<string, string>), 'x-from-interceptor': 'yes' },
      }),
    });

    await client.toFetch()(`${origin}/pets`);

    expect(hits[0]?.headers['x-from-interceptor']).toBe('yes');
  });

  it('lets request headers replace client headers regardless of case', async () => {
    const client = new HTTPClient({ headers: { Authorization: 'Bearer client' } });

    await client.toFetch()(`${origin}/pets`, { headers: { authorization: 'Bearer request' } });

    expect(hits[0]?.headers.authorization).toBe('Bearer request');
  });

  it('aborts when the caller signal fires', async () => {
    const client = new HTTPClient({ retry: false });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 50);

    const started = Date.now();
    await expect(
      client.toFetch()(`${origin}/slow`, { signal: controller.signal })
    ).rejects.toBeInstanceOf(AbortError);
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it('rejects with NetworkError when the server is unreachable', async () => {
    const closed = http.createServer();
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
    const { port } = closed.address() as AddressInfo;
    await new Promise<void>((resolve) => closed.close(() => resolve()));

    const client = new HTTPClient({ retry: false });
    await expect(client.toFetch()(`http://127.0.0.1:${port}/`)).rejects.toBeInstanceOf(
      NetworkError
    );
  });

  it('turns parsed data from a custom transport into a JSON body', async () => {
    const mock = new MockAdapter();
    mock.onGet('/users').reply(200, { users: ['a'] });
    mock.onGet('/gone').reply(410, 'gone');
    const client = new HTTPClient({ transport: mock.transport });
    const fetchFn = client.toFetch();

    const res = await fetchFn('/users');
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(await res.json()).toEqual({ users: ['a'] });

    const gone = await fetchFn('/gone');
    expect(gone.status).toBe(410);
    expect(await gone.text()).toBe('gone');
  });

  it('never serves a cached or deduplicated result', async () => {
    const client = new HTTPClient({ cacheConfig: true, enableDeduplication: true });
    const fetchFn = client.toFetch();

    await client.get(`${origin}/pets`);
    const [a, b] = await Promise.all([fetchFn(`${origin}/pets`), fetchFn(`${origin}/pets`)]);

    expect(hits).toHaveLength(3);
    expect(await a.json()).toMatchObject({ path: '/pets' });
    expect(await b.json()).toMatchObject({ path: '/pets' });
  });
});
