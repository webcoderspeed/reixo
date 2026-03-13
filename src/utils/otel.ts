/**
 * @file otel.ts
 *
 * OpenTelemetry-compatible W3C Trace Context propagation for reixo.
 *
 * Implements the W3C Trace Context specification (https://www.w3.org/TR/trace-context/):
 *  - `traceparent` — carries the trace/span IDs and sampling flag
 *  - `tracestate`  — vendor-specific trace metadata
 *  - `baggage`     — application-level key/value pairs propagated across services
 *
 * Works without any @opentelemetry/* packages — zero extra dependencies.
 * If you already use the OTel SDK, pass your active span's context via
 * `parentContext` to continue the same trace.
 *
 * @example
 * // Zero-config — auto-generates trace IDs per request:
 * const client = new HTTPBuilder()
 *   .withBaseURL('https://api.example.com')
 *   .withOpenTelemetry()
 *   .build();
 *
 * // With service name in baggage and a shared root trace:
 * const client = new HTTPBuilder()
 *   .withBaseURL('https://api.example.com')
 *   .withOpenTelemetry({
 *     serviceName: 'checkout-service',
 *     baggage: { 'user.tier': 'premium', env: 'prod' },
 *   })
 *   .build();
 *
 * // Continue an existing trace (e.g. from Express middleware):
 * const client = new HTTPBuilder()
 *   .withOpenTelemetry({ parentContext: req.traceContext })
 *   .build();
 */

import type { HeadersRecord } from '../types/http-well-known';
import type { HTTPOptions } from './http';

// ---------------------------------------------------------------------------
// W3C trace context helpers
// ---------------------------------------------------------------------------

/** Generate a 16-byte (128-bit) trace ID as 32 lowercase hex characters. */
function randomTraceId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Generate an 8-byte (64-bit) span ID as 16 lowercase hex characters. */
function randomSpanId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * An externally-supplied span context (e.g. from an incoming HTTP request or
 * an active OTel SDK span). Used to continue an existing distributed trace.
 */
export interface SpanContext {
  /** 32 hex-char trace ID. */
  traceId: string;
  /** 16 hex-char span ID of the *parent* span. */
  spanId: string;
  /** Trace flags (0x01 = sampled). */
  traceFlags?: number;
  /** Raw `tracestate` header value from the incoming request, if any. */
  traceState?: string;
}

/** Lifecycle hooks called for each outgoing request span. */
export interface OTelSpanHooks {
  /** Called when the span starts (just before the request headers are set). */
  onSpanStart?: (ctx: SpanContext & { url: string; method: string }) => void;
  /** Called when the response arrives (or the request errors out). */
  onSpanEnd?: (
    ctx: SpanContext & { url: string; method: string; durationMs: number; status?: number }
  ) => void;
}

export interface OTelConfig {
  /**
   * Service name propagated in the `baggage` header.
   * @example 'checkout-service'
   */
  serviceName?: string;

  /**
   * Whether requests should be marked as sampled (trace flag `01`).
   * When `false` the flag is `00`, which tells downstream collectors to skip
   * recording. Defaults to `true`.
   */
  sampled?: boolean;

  /**
   * Continue an existing trace instead of starting a new root trace.
   * The provided `traceId` will be reused and the supplied `spanId` becomes
   * the `parentId` of the new outgoing span.
   */
  parentContext?: SpanContext;

  /**
   * Application-level key/value pairs propagated via the W3C `baggage` header.
   * Keys and values are percent-encoded per RFC 8941.
   *
   * @example { 'user.id': '42', 'tenant': 'acme' }
   */
  baggage?: Record<string, string>;

  /** Optional lifecycle hooks for custom telemetry integration. */
  hooks?: OTelSpanHooks;
}

// ---------------------------------------------------------------------------
// traceparent parser / builder
// ---------------------------------------------------------------------------

/**
 * Parse an existing `traceparent` header value into its components.
 * Returns `null` if the value is invalid (missing, wrong format, invalid hex).
 */
export function parseTraceparent(value: string | undefined | null): SpanContext | null {
  if (!value) return null;
  const parts = value.trim().split('-');
  if (parts.length < 4) return null;
  const [version, traceId, spanId, flags] = parts;
  if (version !== '00') return null;
  if (!/^[0-9a-f]{32}$/.test(traceId)) return null;
  if (!/^[0-9a-f]{16}$/.test(spanId)) return null;
  if (!/^[0-9a-f]{2}$/.test(flags)) return null;
  // Reject all-zeros IDs (invalid per spec)
  if (traceId === '0'.repeat(32) || spanId === '0'.repeat(16)) return null;
  return {
    traceId,
    spanId,
    traceFlags: parseInt(flags, 16),
  };
}

/**
 * Serialise a `SpanContext` into a `traceparent` header string.
 *
 * Format: `00-{traceId}-{spanId}-{flags}`
 */
export function formatTraceparent(ctx: SpanContext): string {
  const flags = (ctx.traceFlags ?? 1).toString(16).padStart(2, '0');
  return `00-${ctx.traceId}-${ctx.spanId}-${flags}`;
}

// ---------------------------------------------------------------------------
// Baggage helpers
// ---------------------------------------------------------------------------

function encodeBaggage(entries: Record<string, string>): string {
  return Object.entries(entries)
    .filter(([k, v]) => k.trim() && v.trim())
    .map(([k, v]) => `${encodeURIComponent(k.trim())}=${encodeURIComponent(v.trim())}`)
    .join(',');
}

// ---------------------------------------------------------------------------
// Interceptor factory
// ---------------------------------------------------------------------------

/**
 * Create a request interceptor that injects W3C Trace Context headers
 * (`traceparent`, `tracestate`, `baggage`) into every outgoing request.
 *
 * Existing `traceparent` headers from upstream are respected — the interceptor
 * will start a *child span* that carries the upstream `traceId` forward.
 */
export function createOTelInterceptor(config: OTelConfig = {}) {
  const { sampled = true, serviceName, baggage = {}, parentContext, hooks } = config;
  const traceFlags = sampled ? 1 : 0;

  // If a service name is provided, bake it into baggage
  const baggageEntries: Record<string, string> = { ...baggage };
  if (serviceName) {
    baggageEntries['service.name'] = serviceName;
  }

  // Pre-compute static baggage string (doesn't change per request)
  const staticBaggage =
    Object.keys(baggageEntries).length > 0 ? encodeBaggage(baggageEntries) : null;

  return {
    onFulfilled: (options: HTTPOptions): HTTPOptions => {
      const headers: HeadersRecord =
        options.headers instanceof Headers
          ? (Object.fromEntries(options.headers.entries()) as HeadersRecord)
          : Array.isArray(options.headers)
            ? (Object.fromEntries(options.headers) as HeadersRecord)
            : ({ ...(options.headers ?? {}) } as HeadersRecord);

      // Respect an upstream traceparent if already present
      const upstreamCtx = parseTraceparent(headers['traceparent']);

      // Determine trace ID — prefer upstream > parent context > new root
      const traceId = upstreamCtx?.traceId ?? parentContext?.traceId ?? randomTraceId();
      // The incoming span becomes the parent; we generate a new child span ID
      const newSpanId = randomSpanId();

      const spanCtx: SpanContext = {
        traceId,
        spanId: newSpanId,
        traceFlags,
        traceState: upstreamCtx?.traceState ?? parentContext?.traceState,
      };

      const newHeaders: HeadersRecord = {
        ...headers,
        traceparent: formatTraceparent(spanCtx),
      };

      // Forward tracestate if present
      const ts = spanCtx.traceState ?? headers['tracestate'];
      if (ts) newHeaders['tracestate'] = ts;

      // Merge baggage — existing baggage takes precedence over static
      const existingBaggage = headers['baggage'];
      if (staticBaggage || existingBaggage) {
        newHeaders['baggage'] = [existingBaggage, staticBaggage].filter(Boolean).join(',');
      }

      hooks?.onSpanStart?.({
        ...spanCtx,
        url: (options.baseURL ?? '') + (options.url ?? ''),
        method: options.method ?? 'GET',
      });

      return { ...options, headers: newHeaders };
    },
  };
}
