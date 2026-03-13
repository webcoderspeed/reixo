/**
 * Example 03 — Retry & Circuit Breaker
 *
 * Covers: withRetry(), RetryError, exponential backoff with jitter,
 * circuit breaker states, shared circuit breakers, and per-request retry override.
 *
 * Run: npx tsx examples/03-retry-circuit-breaker.ts
 */

import {
  HTTPBuilder,
  HTTPError,
  NetworkError,
  RetryError,
  CircuitOpenError,
  CircuitBreaker,
  withRetry,
} from '../src';

async function main() {
  // ── 1. Auto-retry on transient failures ─────────────────────────────────────
  console.log('--- Auto-retry with exponential backoff');

  let attempt = 0;
  const retryClient = new HTTPBuilder()
    .withBaseURL('https://jsonplaceholder.typicode.com')
    .withTimeout(5_000)
    .withRetry({
      maxRetries: 3,
      initialDelayMs: 100,
      backoffFactor: 2,
      jitter: true,
      onRetry: (_err, n, delayMs) => {
        console.log(`  retry #${n} in ${Math.round(delayMs)}ms`);
      },
    })
    .build();

  const post = await retryClient.get<{ id: number; title: string }>('/posts/1');
  console.log(`  success on first attempt — ${post.status}`);

  // ── 2. Retry only specific status codes ─────────────────────────────────────
  console.log('\n--- Retry only on 5xx/429 (skip 4xx)');
  const selective = new HTTPBuilder()
    .withBaseURL('https://jsonplaceholder.typicode.com')
    .withTimeout(5_000)
    .withRetry({
      maxRetries: 2,
      retryCondition: (err) => {
        if (err instanceof HTTPError) return (err.status ?? 0) >= 500 || (err.status ?? 0) === 429;
        if (err instanceof NetworkError) return true;
        return false;
      },
    })
    .build();

  try {
    await selective.get('/posts/99999'); // 404 — should NOT retry
  } catch (err) {
    if (err instanceof HTTPError) {
      console.log(`  caught ${err.status} without retrying (correct)`);
    }
  }

  // ── 3. Disable retry per-request ─────────────────────────────────────────────
  console.log('\n--- Per-request retry disable');
  const noRetry = await retryClient.get('/posts/2', { retry: false });
  console.log(`  ${noRetry.status} with retry: false`);

  // ── 4. Standalone withRetry utility ─────────────────────────────────────────
  console.log('\n--- Standalone withRetry()');
  attempt = 0;
  try {
    const { attempts, durationMs } = await withRetry(
      async () => {
        attempt++;
        if (attempt < 3) throw new Error('transient');
        return { ok: true };
      },
      { maxRetries: 5, initialDelayMs: 20 }
    );
    console.log(`  succeeded after ${attempts} attempts (${durationMs}ms)`);
  } catch (err) {
    if (err instanceof RetryError) {
      console.log(`  exhausted after ${err.attempts} attempts: ${err.cause.message}`);
    }
  }

  // ── 5. RetryError when all attempts fail ─────────────────────────────────────
  console.log('\n--- RetryError when exhausted');
  try {
    await withRetry(() => Promise.reject(new Error('always fails')), {
      maxRetries: 2,
      initialDelayMs: 10,
    });
  } catch (err) {
    if (err instanceof RetryError) {
      console.log(`  RetryError after ${err.attempts} attempts, ${err.durationMs}ms`);
      console.log(`  cause: ${err.cause.message}`);
    }
  }

  // ── 6. Circuit Breaker — inline config ────────────────────────────────────────
  console.log('\n--- Circuit breaker (opens after 2 failures)');
  const cbClient = new HTTPBuilder()
    .withBaseURL('https://this-host-does-not-exist.invalid')
    .withTimeout(500)
    .withCircuitBreaker({
      failureThreshold: 2,
      resetTimeoutMs: 5_000,
      onStateChange: (state) => console.log(`  circuit: state change to ${state}`),
    })
    .build();

  for (let i = 1; i <= 4; i++) {
    try {
      await cbClient.get('/');
    } catch (err) {
      if (err instanceof CircuitOpenError) {
        console.log(`  call ${i}: CircuitOpenError (short-circuited)`);
      } else {
        console.log(`  call ${i}: network failure (counts toward threshold)`);
      }
    }
  }

  // ── 7. Shared circuit breaker across clients ──────────────────────────────────
  console.log('\n--- Shared circuit breaker');
  const sharedBreaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 10_000 });

  const clientA = new HTTPBuilder()
    .withBaseURL('https://this-host-does-not-exist.invalid')
    .withTimeout(300)
    .withCircuitBreaker(sharedBreaker)
    .build();

  const clientB = new HTTPBuilder()
    .withBaseURL('https://this-host-does-not-exist.invalid')
    .withTimeout(300)
    .withCircuitBreaker(sharedBreaker)
    .build();

  try {
    await clientA.get('/');
  } catch {
    /* ignore */
  } // opens the circuit

  try {
    await clientB.get('/');
  } catch (err) {
    // clientB also sees the open circuit because they share the same breaker
    console.log(
      `  clientB: ${err instanceof CircuitOpenError ? 'CircuitOpenError (shared state works)' : String(err)}`
    );
  }

  console.log('\nDone.');
}

main().catch(console.error);
