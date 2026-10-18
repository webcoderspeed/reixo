/**
 * Example 7: Smart Polling
 *
 * Demonstrates poll() with until conditions, adaptive intervals,
 * exponential backoff, and error handling.
 *
 * Run:  npx tsx examples/07-polling.ts
 */

import { poll, PollingController } from '../src';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Scenario 1 — Poll until a job completes
//
// Uses `until` to stop as soon as status === 'completed'.
// ---------------------------------------------------------------------------

interface Job {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
}

async function demo_pollUntilDone(): Promise<void> {
  console.log('\n--- 1. Poll until job completes ---');

  let tick = 0;

  const { promise, cancel } = poll(
    async (): Promise<Job> => {
      tick++;
      // Simulate a job that takes 5 ticks to finish
      const progress = Math.min(tick * 20, 100);
      const status: Job['status'] = progress >= 100 ? 'completed' : 'processing';
      console.log(`  tick ${tick}: status=${status}, progress=${progress}%`);
      return { id: 'job-1', status, progress };
    },
    {
      interval: 100,
      until: (job) => job.status === 'completed',
      timeout: 5000,
    }
  );

  const result = await promise;
  console.log('  Job finished:', result);

  void cancel; // cancel() is available for early cancellation
}

// ---------------------------------------------------------------------------
// Scenario 2 — Adaptive interval (polls faster as progress increases)
// ---------------------------------------------------------------------------

async function demo_adaptiveInterval(): Promise<void> {
  console.log('\n--- 2. Adaptive interval ---');

  let step = 0;

  const { promise } = poll(
    async (): Promise<{ progress: number }> => {
      step++;
      const progress = step * 15;
      console.log(`  step ${step}: progress=${progress}%`);
      return { progress };
    },
    {
      interval: 500,
      until: (r) => r.progress >= 100,
      // Poll every 300 ms when progress < 50%; every 100 ms when > 50%
      adaptiveInterval: (r) => (r.progress < 50 ? 300 : 100),
    }
  );

  await promise;
  console.log('  Done.');
}

// ---------------------------------------------------------------------------
// Scenario 3 — Exponential backoff
// ---------------------------------------------------------------------------

async function demo_backoff(): Promise<void> {
  console.log('\n--- 3. Exponential backoff ---');

  let attempt = 0;
  const timestamps: number[] = [];

  const { promise } = poll(
    async (): Promise<number> => {
      attempt++;
      timestamps.push(Date.now());
      console.log(`  attempt ${attempt}`);
      return attempt;
    },
    {
      interval: 50,
      maxAttempts: 5,
      backoff: { factor: 2, maxInterval: 800 },
    }
  );

  await promise.catch(() => {
    // maxAttempts reached — expected
    console.log('  Max attempts reached (expected).');
  });
}

// ---------------------------------------------------------------------------
// Scenario 4 — Error handling with onError
// ---------------------------------------------------------------------------

async function demo_onError(): Promise<void> {
  console.log('\n--- 4. onError — continue after transient failures ---');

  let attempt = 0;

  const { promise } = poll(
    async (): Promise<string> => {
      attempt++;
      if (attempt <= 3) {
        throw new Error(`Transient error on attempt ${attempt}`);
      }
      return 'success';
    },
    {
      interval: 100,
      until: (r) => r === 'success',
      onError: (err, attempts) => {
        console.log(`  Error on attempt ${attempts}: ${(err as Error).message} — retrying`);
        return attempts < 5; // continue up to attempt 5
      },
    }
  );

  const result = await promise;
  console.log(`  Result after ${attempt} attempts:`, result);
}

// ---------------------------------------------------------------------------
// Scenario 5 — PollingController class for direct control
// ---------------------------------------------------------------------------

async function demo_pollingController(): Promise<void> {
  console.log('\n--- 5. PollingController — manual start/stop ---');

  let count = 0;

  const controller = new PollingController(
    async () => {
      count++;
      console.log(`  controller tick ${count}`);
      return count;
    },
    {
      interval: 100,
      until: (n) => n >= 4,
    }
  );

  const result = await controller.start();
  console.log('  Stopped at:', result);
}

// ---------------------------------------------------------------------------
// Scenario 6 — Cancel mid-flight
// ---------------------------------------------------------------------------

async function demo_cancel(): Promise<void> {
  console.log('\n--- 6. Cancel polling early ---');

  let count = 0;
  let cancelled = false;

  const { promise, cancel } = poll(
    async () => {
      count++;
      console.log(`  tick ${count}`);
      await sleep(50);
      return count;
    },
    { interval: 80, timeout: 10_000 }
  );

  // Cancel after 200 ms
  setTimeout(() => {
    console.log('  Cancelling...');
    cancelled = true;
    cancel();
  }, 200);

  await promise;
  console.log(`  Cancelled after ${count} ticks, cancelled=${cancelled}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== reixo polling examples ===');

  await demo_pollUntilDone();
  await demo_adaptiveInterval();
  await demo_backoff();
  await demo_onError();
  await demo_pollingController();
  await demo_cancel();

  console.log('\nAll polling demos complete.');
}

main().catch(console.error);
