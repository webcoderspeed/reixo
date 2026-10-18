import { describe, expect, it, vi } from 'vitest';

import { HTTPBuilder } from '../src/index';
import { createOTelInterceptor, formatTraceparent, parseTraceparent } from '../src/utils/otel';

describe('OTel / W3C Trace Context', () => {
  describe('parseTraceparent()', () => {
    it('parses a valid traceparent', () => {
      const ctx = parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
      expect(ctx).not.toBeNull();
      expect(ctx!.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
      expect(ctx!.spanId).toBe('00f067aa0ba902b7');
      expect(ctx!.traceFlags).toBe(1);
    });

    it('returns null for null/undefined input', () => {
      expect(parseTraceparent(null)).toBeNull();
      expect(parseTraceparent()).toBeNull();
    });

    it('returns null for malformed traceparent', () => {
      expect(parseTraceparent('bad')).toBeNull();
      expect(parseTraceparent('01-abc-def-00')).toBeNull(); // wrong version
      expect(parseTraceparent('00-shortid-00f067aa0ba902b7-01')).toBeNull(); // short traceId
    });

    it('rejects all-zero IDs (invalid per spec)', () => {
      const allZeroTrace = '0'.repeat(32);
      const allZeroSpan = '0'.repeat(16);
      expect(parseTraceparent(`00-${allZeroTrace}-00f067aa0ba902b7-01`)).toBeNull();
      expect(parseTraceparent(`00-4bf92f3577b34da6a3ce929d0e0e4736-${allZeroSpan}-01`)).toBeNull();
    });
  });

  describe('formatTraceparent()', () => {
    it('serialises a SpanContext to traceparent format', () => {
      const result = formatTraceparent({
        traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
        spanId: '00f067aa0ba902b7',
        traceFlags: 1,
      });
      expect(result).toBe('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
    });

    it('defaults traceFlags to 1 (sampled) when omitted', () => {
      const result = formatTraceparent({
        traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
        spanId: '00f067aa0ba902b7',
      });
      expect(result).toMatch(/-01$/);
    });

    it('encodes traceFlags=0 as 00', () => {
      const result = formatTraceparent({
        traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
        spanId: '00f067aa0ba902b7',
        traceFlags: 0,
      });
      expect(result).toMatch(/-00$/);
    });
  });

  describe('createOTelInterceptor()', () => {
    it('injects traceparent header into request', () => {
      const interceptor = createOTelInterceptor();
      const result = interceptor.onFulfilled({ url: '/test', method: 'GET', headers: {} });
      expect(result.headers).toBeDefined();
      const headers = result.headers as Record<string, string>;
      expect(headers['traceparent']).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/);
    });

    it('generates unique trace IDs per request', () => {
      const interceptor = createOTelInterceptor();
      const r1 = interceptor.onFulfilled({ url: '/a', method: 'GET', headers: {} });
      const r2 = interceptor.onFulfilled({ url: '/b', method: 'GET', headers: {} });
      const h1 = r1.headers as Record<string, string>;
      const h2 = r2.headers as Record<string, string>;
      // Different requests → different span IDs (trace IDs are also different for root spans)
      expect(h1['traceparent']).not.toBe(h2['traceparent']);
    });

    it('continues an existing trace via parentContext', () => {
      const parentCtx = {
        traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1',
        spanId: 'bbbbbbbbbbbbbbbb',
        traceFlags: 1,
      };
      const interceptor = createOTelInterceptor({ parentContext: parentCtx });
      const result = interceptor.onFulfilled({ url: '/child', method: 'GET', headers: {} });
      const headers = result.headers as Record<string, string>;
      // Same traceId as parent, new spanId
      expect(headers['traceparent']).toMatch(
        new RegExp(`^00-${parentCtx.traceId}-[0-9a-f]{16}-01$`)
      );
    });

    it('respects upstream traceparent in request headers', () => {
      const upstream = '00-cccccccccccccccccccccccccccccccc-dddddddddddddddd-01';
      const interceptor = createOTelInterceptor();
      const result = interceptor.onFulfilled({
        url: '/downstream',
        method: 'GET',
        headers: { traceparent: upstream },
      });
      const headers = result.headers as Record<string, string>;
      // Upstream traceId is preserved
      expect(headers['traceparent']).toMatch(
        /^00-cccccccccccccccccccccccccccccccc-[0-9a-f]{16}-0[01]$/
      );
    });

    it('injects baggage header with service name', () => {
      const interceptor = createOTelInterceptor({ serviceName: 'my-service' });
      const result = interceptor.onFulfilled({ url: '/api', method: 'GET', headers: {} });
      const headers = result.headers as Record<string, string>;
      expect(headers['baggage']).toContain('service.name=my-service');
    });

    it('injects custom baggage entries', () => {
      const interceptor = createOTelInterceptor({
        baggage: { 'user.id': '42', env: 'prod' },
      });
      const result = interceptor.onFulfilled({ url: '/api', method: 'GET', headers: {} });
      const headers = result.headers as Record<string, string>;
      expect(headers['baggage']).toContain('user.id=42');
      expect(headers['baggage']).toContain('env=prod');
    });

    it('does not sample when sampled=false', () => {
      const interceptor = createOTelInterceptor({ sampled: false });
      const result = interceptor.onFulfilled({ url: '/api', method: 'GET', headers: {} });
      const headers = result.headers as Record<string, string>;
      expect(headers['traceparent']).toMatch(/-00$/);
    });

    it('calls onSpanStart hook', () => {
      const onSpanStart = vi.fn();
      const interceptor = createOTelInterceptor({ hooks: { onSpanStart } });
      interceptor.onFulfilled({ url: '/traced', method: 'POST', headers: {} });
      expect(onSpanStart).toHaveBeenCalledOnce();
      expect(onSpanStart).toHaveBeenCalledWith(
        expect.objectContaining({ url: '/traced', method: 'POST' })
      );
    });
  });

  describe('HTTPBuilder.withOpenTelemetry()', () => {
    it('adds traceparent to outgoing requests', async () => {
      let capturedHeaders: Record<string, string> = {};

      globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        capturedHeaders = Object.fromEntries(new Headers(init?.headers).entries());
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const client = new HTTPBuilder()
        .withBaseURL('https://api.example.com')
        .withOpenTelemetry({ serviceName: 'test-service' })
        .build();

      await client.get('/test');

      expect(capturedHeaders['traceparent']).toBeDefined();
      expect(capturedHeaders['traceparent']).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
      expect(capturedHeaders['baggage']).toContain('service.name=test-service');
    });
  });
});
