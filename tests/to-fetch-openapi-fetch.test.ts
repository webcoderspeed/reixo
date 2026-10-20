import http from 'node:http';
import type { AddressInfo } from 'node:net';

import createClient from 'openapi-fetch';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { HTTPClient } from '../src/core/http-client';

interface Pet {
  id: number;
  name: string;
}

// Hand-written equivalent of what openapi-typescript generates for a tiny pets API.
interface Paths {
  '/pets': {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    get: {
      parameters: { query?: { limit?: number }; header?: never; path?: never; cookie?: never };
      requestBody?: never;
      responses: {
        200: { headers: Record<string, unknown>; content: { 'application/json': Pet[] } };
      };
    };
    post: {
      parameters: { query?: never; header?: never; path?: never; cookie?: never };
      requestBody: { content: { 'application/json': { name: string } } };
      responses: {
        201: { headers: Record<string, unknown>; content: { 'application/json': Pet } };
        422: {
          headers: Record<string, unknown>;
          content: { 'application/json': { message: string } };
        };
      };
    };
  };
}

let server: http.Server;
let origin: string;
let requests: Array<{ method: string; url: string; auth?: string }> = [];
let failures = 0;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      requests.push({
        method: req.method ?? '',
        url: req.url ?? '',
        ...(req.headers.authorization && { auth: req.headers.authorization }),
      });
      if (failures > 0) {
        failures--;
        res.writeHead(503).end();
        return;
      }
      res.setHeader('content-type', 'application/json');
      if (req.method === 'POST') {
        const { name } = JSON.parse(body) as { name: string };
        if (!name) {
          res.writeHead(422).end(JSON.stringify({ message: 'name is required' }));
          return;
        }
        res.writeHead(201).end(JSON.stringify({ id: 2, name }));
        return;
      }
      res.end(JSON.stringify([{ id: 1, name: 'Mango' }]));
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
  requests = [];
  failures = 0;
});

describe('toFetch() with openapi-fetch', () => {
  it('serves typed GET calls and retries a 503', async () => {
    const reixo = new HTTPClient({
      headers: { Authorization: 'Bearer t0ken' },
      retry: { maxRetries: 2, initialDelayMs: 1 },
    });
    const api = createClient<Paths>({ baseUrl: origin, fetch: reixo.toFetch() });
    failures = 1;

    const { data, error, response } = await api.GET('/pets', { params: { query: { limit: 1 } } });

    expect(error).toBeUndefined();
    expect(response.status).toBe(200);
    expect(data).toEqual([{ id: 1, name: 'Mango' }]);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual({ method: 'GET', url: '/pets?limit=1', auth: 'Bearer t0ken' });
  });

  it('sends JSON bodies and surfaces typed error bodies', async () => {
    const reixo = new HTTPClient({ retry: false });
    const api = createClient<Paths>({ baseUrl: origin, fetch: reixo.toFetch() });

    const created = await api.POST('/pets', { body: { name: 'Biscuit' } });
    expect(created.data).toEqual({ id: 2, name: 'Biscuit' });

    const rejected = await api.POST('/pets', { body: { name: '' } });
    expect(rejected.response.status).toBe(422);
    expect(rejected.error).toEqual({ message: 'name is required' });
  });
});
