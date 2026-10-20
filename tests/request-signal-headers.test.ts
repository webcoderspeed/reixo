import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { HTTPClient } from '../src/core/http-client';
import { AbortError } from '../src/utils/http';

let server: http.Server;
let origin: string;
let hits: http.IncomingHttpHeaders[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    hits.push(req.headers);
    if (req.url === '/slow') {
      setTimeout(() => res.end('late'), 2000);
      return;
    }
    if (req.url === '/stream') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.write('one');
      setTimeout(() => res.end('two'), 300);
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
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
});

describe('caller AbortSignal', () => {
  it('aborts client.get when the caller signal fires', async () => {
    const client = new HTTPClient({ retry: false });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 50);

    const started = Date.now();
    await expect(
      client.get(`${origin}/slow`, { signal: controller.signal })
    ).rejects.toBeInstanceOf(AbortError);
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it('does not send the request when the signal is already aborted', async () => {
    const client = new HTTPClient({ retry: false });

    await expect(
      client.get(`${origin}/fast`, { signal: AbortSignal.abort() })
    ).rejects.toBeInstanceOf(AbortError);
    expect(hits).toHaveLength(0);
  });

  it('stops a stream response body when the caller aborts after the headers', async () => {
    const client = new HTTPClient({});
    const controller = new AbortController();
    const res = await client.get<ReadableStream<Uint8Array>>(`${origin}/stream`, {
      responseType: 'stream',
      signal: controller.signal,
    });
    const reader = res.data.getReader();
    await reader.read();

    controller.abort();

    await expect(reader.read()).rejects.toThrow();
  });
});

describe('header merging', () => {
  it('lets a request header replace a client header regardless of case', async () => {
    const client = new HTTPClient({ headers: { Authorization: 'Bearer client', 'X-Keep': '1' } });

    await client.get(`${origin}/fast`, { headers: { authorization: 'Bearer request' } });

    expect(hits[0]?.authorization).toBe('Bearer request');
    expect(hits[0]?.['x-keep']).toBe('1');
  });
});
