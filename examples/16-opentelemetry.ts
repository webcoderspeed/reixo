/**
 * Example 16 — OpenTelemetry / W3C Trace Context propagation
 *
 * reixo implements the W3C Trace Context spec (traceparent, tracestate, baggage)
 * without any @opentelemetry/* packages — zero extra dependencies.
 *
 * Covered here:
 *  - Zero-config: auto-generates a fresh trace per request
 *  - Service name in baggage
 *  - Continuing an existing trace (parentContext)
 *  - Lifecycle hooks (onSpanStart / onSpanEnd for custom telemetry)
 *  - Low-level helpers: parseTraceparent / formatTraceparent
 */

import { HTTPBuilder, parseTraceparent, formatTraceparent, type SpanContext } from '../src/index';

// ---------------------------------------------------------------------------
// 1. Zero-config — every request gets a fresh W3C traceparent
// ---------------------------------------------------------------------------

const minimal = new HTTPBuilder()
  .withBaseURL('https://jsonplaceholder.typicode.com')
  .withOpenTelemetry() // traceparent auto-generated per request
  .build();

// ---------------------------------------------------------------------------
// 2. Service name + custom baggage propagated to downstream services
// ---------------------------------------------------------------------------

const withService = new HTTPBuilder()
  .withBaseURL('https://jsonplaceholder.typicode.com')
  .withOpenTelemetry({
    serviceName: 'user-api',
    baggage: {
      'user.tier': 'premium',
      env: 'production',
    },
  })
  .build();

// ---------------------------------------------------------------------------
// 3. Continue a parent trace (e.g. from an incoming request header)
// ---------------------------------------------------------------------------

// In an Express/Hono/Next.js handler you'd extract the header like this:
const incomingTraceparent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
const parentCtx = parseTraceparent(incomingTraceparent);

const downstream = new HTTPBuilder()
  .withBaseURL('https://jsonplaceholder.typicode.com')
  .withOpenTelemetry({
    // Reuses the upstream traceId — all spans share one distributed trace
    parentContext: parentCtx ?? undefined,
    serviceName: 'checkout-service',
  })
  .build();

// ---------------------------------------------------------------------------
// 4. Lifecycle hooks for custom telemetry (e.g. write to your own store)
// ---------------------------------------------------------------------------

interface SpanRecord {
  traceId: string;
  spanId: string;
  url: string;
  method: string;
  startMs: number;
  endMs?: number;
  status?: number;
}

const spans: SpanRecord[] = [];

const traced = new HTTPBuilder()
  .withBaseURL('https://jsonplaceholder.typicode.com')
  .withOpenTelemetry({
    serviceName: 'demo-service',
    hooks: {
      onSpanStart(ctx) {
        spans.push({
          traceId: ctx.traceId,
          spanId: ctx.spanId,
          url: ctx.url,
          method: ctx.method,
          startMs: Date.now(),
        });
      },
      onSpanEnd(ctx) {
        const span = spans.find((s) => s.spanId === ctx.spanId);
        if (span) {
          span.endMs = Date.now();
          span.status = ctx.status;
        }
      },
    },
  })
  .build();

// ---------------------------------------------------------------------------
// 5. Low-level helpers — parseTraceparent / formatTraceparent
// ---------------------------------------------------------------------------

function demonstrateHelpers() {
  // Parse an incoming traceparent header
  const raw = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
  const ctx = parseTraceparent(raw);

  if (ctx) {
    console.log('Parsed traceparent:');
    console.log('  traceId    :', ctx.traceId);
    console.log('  spanId     :', ctx.spanId);
    console.log('  traceFlags :', ctx.traceFlags, '(1 = sampled)');

    // Build a child context — same traceId, new spanId
    const childCtx: SpanContext = {
      traceId: ctx.traceId,
      spanId: crypto
        .getRandomValues(new Uint8Array(8))
        .reduce((s, b) => s + b.toString(16).padStart(2, '0'), ''),
      traceFlags: ctx.traceFlags,
    };

    console.log('Child traceparent:', formatTraceparent(childCtx));
  } else {
    console.log('Invalid traceparent — returns null');
  }

  // Invalid traceparent returns null (not throws)
  const invalid = parseTraceparent('garbage');
  console.log('Invalid parse returns null:', invalid);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n=== OpenTelemetry / W3C Trace Context Examples ===\n');

  // 1. Zero-config
  const r1 = await minimal.get<{ id: number }>('/todos/1');
  console.log('1. Minimal OTel — status:', r1.status);

  // 2. Service name in baggage
  const r2 = await withService.get('/posts/1');
  console.log('2. With service name — status:', r2.status);

  // 3. Continue upstream trace
  if (parentCtx) {
    const r3 = await downstream.get('/users/1');
    console.log('3. Continuing trace', parentCtx.traceId.slice(0, 8) + '… — status:', r3.status);
  }

  // 4. Hooks — requests generate span records
  await traced.get('/posts/1');
  await traced.get('/posts/2');
  console.log('\n4. Captured spans:');
  spans.forEach((span) => {
    const ms = span.endMs ? span.endMs - span.startMs : '?';
    console.log(`   [${span.method}] ${span.url} → HTTP ${span.status ?? '?'} in ${ms}ms`);
    console.log(`   traceId: ${span.traceId.slice(0, 16)}…  spanId: ${span.spanId}`);
  });

  // 5. Low-level helpers
  console.log('\n5. Low-level helpers:');
  demonstrateHelpers();

  console.log('\n✓ All OTel examples completed');
}

main().catch(console.error);
