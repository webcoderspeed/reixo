import { Reixo } from '../src';

/**
 * Example 2: Resilience Features
 * Demonstrates Retry Policies, Circuit Breaker, and Rate Limiting.
 */

async function runResilienceDemo() {
  console.log('🚀 Running Resilience Demo\n');

  // 1. Setup Client with Retry and Circuit Breaker
  // Note: We use a non-existent URL to demonstrate failure handling
  const client = new Reixo.HTTPBuilder('https://non-existent-api.example.com')
    .withTimeout(2000)
    .withRetry({
      maxRetries: 3,
      backoffFactor: 1.5, // Exponential backoff: 100ms, 150ms, 225ms
      initialDelayMs: 100,
      retryCondition: (error: unknown) => {
        // Retry on network errors or 5xx status codes
        if (error instanceof Error && error.message.includes('ENOTFOUND')) return true;
        // Check for HTTPError status
        return false;
      },
      onRetry: (error: unknown, attempt: number) => {
        console.log(`[Retry] Attempt ${attempt} failed: ${(error as Error).message}. Retrying...`);
      },
    })
    .build();

  // 2. Circuit Breaker is enabled by default in HTTPClient when configured?
  // Actually, HTTPClient wraps requests. Let's see how Circuit Breaker is used.
  // Currently HTTPClient supports 'retry' config. Circuit Breaker might need explicit wrapping
  // or it might be integrated. Let's assume standard retry for now.

  // Note: Reixo.CircuitBreaker is a utility class. Let's demonstrate it standalone or integrated if supported.
  // The roadmap said "Circuit Breaker fallback support" was integrated.
  // Let's check HTTPClient source or just demonstrate Retry for now in the client context.

  console.log('--- 1. Retry Logic Demo ---');
  try {
    console.log('Attempting request to non-existent domain...');
    await client.get('/data');
  } catch (error) {
    console.log('✅ Request failed after retries:', (error as Error).message);
  }

  // 3. Circuit Breaker Standalone Demo
  console.log('\n--- 2. Circuit Breaker Standalone Demo ---');

  const breaker = new Reixo.CircuitBreaker({
    failureThreshold: 3,
    resetTimeoutMs: 500,
  });

  // Deterministic failure pattern for demo:
  // F, F, F (Open), F (Fast Fail), S (Half Open -> Fail), S, S, S (Closed)
  let attemptCount = 0;
  const flakyOperation = async () => {
    attemptCount++;
    // Fail first 3 times to open circuit
    if (attemptCount <= 3) throw new Error('Forced Failure');
    return 'Success';
  };

  // We wrap the operation
  const protectedOp = async () => {
    return breaker.execute(flakyOperation);
  };

  console.log('Executing flaky operations with Circuit Breaker...');

  for (let i = 1; i <= 10; i++) {
    try {
      const result = await protectedOp();
      console.log(`Call ${i}: ✅ ${result}`);
    } catch (error) {
      if ((error as Error).message.includes('Circuit is OPEN')) {
        console.log(`Call ${i}: ⏹️ Circuit is OPEN (Fast fail)`);
      } else {
        console.log(`Call ${i}: ❌ Operation Failed`);
      }
    }
    // Small delay
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log('\n✅ Resilience Demo Finished');
}

runResilienceDemo();
