import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let server: http.Server;
let hits: Array<{ method: string; url: string; body: string; contentType?: string }> = [];
let failNext = false;
let mutator: typeof import('../examples/18-openapi-orval');

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      hits.push({
        method: req.method ?? '',
        url: req.url ?? '',
        body,
        ...(req.headers['content-type'] && { contentType: req.headers['content-type'] }),
      });
      if (failNext) {
        failNext = false;
        res.writeHead(503).end();
        return;
      }
      res.writeHead(req.method === 'POST' ? 201 : 200, { 'content-type': 'application/json' });
      res.end(req.method === 'POST' ? body : JSON.stringify([{ id: 1, name: 'Mango' }]));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  process.env.API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  mutator = await import('../examples/18-openapi-orval');
});

afterAll(() => {
  server.close();
  delete process.env.API_URL;
});

describe('orval mutator example', () => {
  it('sends the query params orval passes for a GET', async () => {
    hits = [];
    const pets = await mutator.reixoInstance<Array<{ id: number }>>({
      url: '/pets',
      method: 'GET',
      params: { limit: 5 },
    });
    expect(pets).toEqual([{ id: 1, name: 'Mango' }]);
    expect(hits[0]?.url).toBe('/pets?limit=5');
  });

  it('serialises the JSON body and keeps orval headers on a POST', async () => {
    hits = [];
    const created = await mutator.reixoInstance<{ name: string }>({
      url: '/pets',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: { name: 'Biscuit' },
    });
    expect(created).toEqual({ name: 'Biscuit' });
    expect(hits[0]).toMatchObject({
      method: 'POST',
      body: '{"name":"Biscuit"}',
      contentType: 'application/json',
    });
  });

  it('retries through the shared client', async () => {
    hits = [];
    failNext = true;
    const pets = await mutator.reixoInstance(
      { url: '/pets', method: 'GET' },
      { retry: { maxRetries: 1, initialDelayMs: 1 } }
    );
    expect(pets).toEqual([{ id: 1, name: 'Mango' }]);
    expect(hits).toHaveLength(2);
  });
});
