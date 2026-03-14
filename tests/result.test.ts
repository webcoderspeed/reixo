import { describe, expect, it, vi } from 'vitest';

import { HTTPBuilder, HTTPError } from '../src/index';
import { err, mapResult, ok, toResult, unwrap, unwrapOr } from '../src/types/result';

describe('Result<T, E>', () => {
  describe('ok / err constructors', () => {
    it('ok() creates a successful result', () => {
      const r = ok(42);
      expect(r.ok).toBe(true);
      expect(r.data).toBe(42);
      expect(r.error).toBeNull();
    });

    it('err() creates a failed result', () => {
      const e = new Error('boom');
      const r = err(e);
      expect(r.ok).toBe(false);
      expect(r.data).toBeNull();
      expect(r.error).toBe(e);
    });
  });

  describe('toResult()', () => {
    it('wraps a resolved promise in Ok', async () => {
      const r = await toResult(Promise.resolve('hello'));
      expect(r.ok).toBe(true);
      expect(r.data).toBe('hello');
    });

    it('wraps a rejected promise in Err', async () => {
      const error = new Error('fail');
      const r = await toResult(Promise.reject(error));
      expect(r.ok).toBe(false);
      expect(r.error).toBe(error);
    });
  });

  describe('mapResult()', () => {
    it('transforms the data on Ok', () => {
      const r = mapResult(ok(5), (n) => n * 2);
      expect(r.ok).toBe(true);
      expect(r.data).toBe(10);
    });

    it('passes through Err unchanged', () => {
      const e = new Error('err');
      const r = mapResult(err(e), (n: number) => n * 2);
      expect(r.ok).toBe(false);
      expect(r.error).toBe(e);
    });
  });

  describe('unwrap / unwrapOr', () => {
    it('unwrap returns data on Ok', () => {
      expect(unwrap(ok('value'))).toBe('value');
    });

    it('unwrap throws on Err', () => {
      const e = new Error('unwrap error');
      expect(() => unwrap(err(e))).toThrow(e);
    });

    it('unwrapOr returns data on Ok', () => {
      expect(unwrapOr(ok('real'), 'fallback')).toBe('real');
    });

    it('unwrapOr returns fallback on Err', () => {
      expect(unwrapOr(err(new Error('x')), 'fallback')).toBe('fallback');
    });
  });

  describe('tryGet / tryPost / tryPut / tryDelete / tryPatch', () => {
    it('tryGet returns Ok on success', async () => {
      const client = new HTTPBuilder().withBaseURL('https://jsonplaceholder.typicode.com').build();

      const r = await client.tryGet<{ id: number }>('/todos/1');
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.data.data.id).toBe(1);
      }
    });

    it('tryGet returns Err on 404', async () => {
      const client = new HTTPBuilder().withBaseURL('https://jsonplaceholder.typicode.com').build();

      // JSONPlaceholder returns 200 for most things, use a known non-existent URL structure
      // We'll mock the fetch instead
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ error: 'not found' }), { status: 404 }));

      const r = await client.tryGet('/nonexistent-endpoint-xyz');
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error).toBeInstanceOf(HTTPError);
        expect((r.error as HTTPError).status).toBe(404);
      }

      globalThis.fetch = originalFetch;
    });

    it('tryPost returns Ok on success', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: 101 }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
      );

      const client = new HTTPBuilder().withBaseURL('https://api.example.com').build();
      const r = await client.tryPost<{ id: number }>('/posts', { title: 'test' });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.data.data.id).toBe(101);
      }

      globalThis.fetch = originalFetch;
    });

    it('tryPut returns Ok on success', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ id: 1, title: 'updated' }), { status: 200 })
        );

      const client = new HTTPBuilder().withBaseURL('https://api.example.com').build();
      const r = await client.tryPut<{ id: number }>('/posts/1', { title: 'updated' });
      expect(r.ok).toBe(true);

      globalThis.fetch = originalFetch;
    });

    it('tryDelete returns Ok on 204', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

      const client = new HTTPBuilder().withBaseURL('https://api.example.com').build();
      const r = await client.tryDelete('/posts/1');
      expect(r.ok).toBe(true);

      globalThis.fetch = originalFetch;
    });

    it('tryPatch returns Ok on success', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ id: 1 }), { status: 200 }));

      const client = new HTTPBuilder().withBaseURL('https://api.example.com').build();
      const r = await client.tryPatch<{ id: number }>('/posts/1', { title: 'patched' });
      expect(r.ok).toBe(true);

      globalThis.fetch = originalFetch;
    });

    it('never throws — Err wraps all failures', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      const client = new HTTPBuilder().withBaseURL('https://api.example.com').build();

      // This must NOT throw — error should be in result.error
      let threw = false;
      try {
        const r = await client.tryGet('/any');
        expect(r.ok).toBe(false);
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);

      globalThis.fetch = originalFetch;
    });
  });
});
