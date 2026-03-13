/**
 * Example 02 — Error Handling
 *
 * Covers: HTTPError, NetworkError, TimeoutError, AbortError,
 * CircuitOpenError, ValidationError, and global error patterns.
 *
 * Run: npx tsx examples/02-error-handling.ts
 */

import {
  HTTPBuilder,
  HTTPError,
  NetworkError,
  TimeoutError,
  AbortError,
  CircuitOpenError,
} from '../src';

function classify(err: unknown): string {
  if (err instanceof TimeoutError) return `TimeoutError (after ${err.timeoutMs}ms)`;
  if (err instanceof AbortError) return `AbortError: ${err.message}`;
  if (err instanceof CircuitOpenError) return `CircuitOpenError: ${err.message}`;
  if (err instanceof NetworkError) return `NetworkError: ${err.message}`;
  if (err instanceof HTTPError) return `HTTPError ${err.status}: ${err.statusText}`;
  return `Unknown: ${String(err)}`;
}

async function main() {
  const client = new HTTPBuilder()
    .withBaseURL('https://jsonplaceholder.typicode.com')
    .withTimeout(5_000)
    .build();

  // ── 404 Not Found → HTTPError ────────────────────────────────────────────────
  console.log('--- 404 response');
  try {
    await client.get('/posts/99999');
  } catch (err) {
    console.log(' ', classify(err));
    if (err instanceof HTTPError) {
      console.log('  url:', err.config?.url);
      console.log('  method:', err.config?.method);
    }
  }

  // ── Timeout → TimeoutError ─────────────────────────────────────────────────
  console.log('\n--- Timeout (1ms limit)');
  const tight = new HTTPBuilder()
    .withBaseURL('https://jsonplaceholder.typicode.com')
    .withTimeout(1) // absurdly short
    .build();
  try {
    await tight.get('/posts');
  } catch (err) {
    console.log(' ', classify(err));
  }

  // ── Manual cancellation → AbortError ──────────────────────────────────────
  console.log('\n--- Manual cancellation via AbortController');
  const controller = new AbortController();
  const req = client.get('/posts', { signal: controller.signal });
  controller.abort(); // cancel immediately
  try {
    await req;
  } catch (err) {
    console.log(' ', classify(err));
  }

  // ── Cancel by request ID ────────────────────────────────────────────────────
  console.log('\n--- Cancel via requestWithId()');
  const { requestId, response } = client.requestWithId<unknown>('/posts');
  client.cancel(requestId);
  try {
    await response;
  } catch (err) {
    console.log(' ', classify(err));
  }

  // ── Network failure → NetworkError ────────────────────────────────────────
  console.log('\n--- Unreachable host → NetworkError');
  const badClient = new HTTPBuilder()
    .withBaseURL('https://this-host-does-not-exist.invalid')
    .withTimeout(3_000)
    .build();
  try {
    await badClient.get('/');
  } catch (err) {
    console.log(' ', classify(err));
  }

  // ── CircuitOpenError (using standalone CircuitBreaker) ─────────────────────
  console.log('\n--- CircuitOpenError via circuit breaker config');
  const fragile = new HTTPBuilder()
    .withBaseURL('https://this-host-does-not-exist.invalid')
    .withTimeout(1_000)
    .withCircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 60_000 })
    .build();

  // First call opens the circuit
  try {
    await fragile.get('/');
  } catch {
    /* expected */
  }

  // Second call hits the open circuit immediately
  try {
    await fragile.get('/');
  } catch (err) {
    console.log(' ', classify(err));
  }

  // ── Structured error inspection ─────────────────────────────────────────────
  console.log('\n--- Full HTTPError shape');
  try {
    await client.get('/posts/0'); // 404
  } catch (err) {
    if (err instanceof HTTPError) {
      console.log('  err.status:    ', err.status);
      console.log('  err.statusText:', err.statusText);
      console.log('  err.config.url:', err.config?.url);
    }
  }

  console.log('\nDone.');
}

main().catch(console.error);
