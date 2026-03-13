/**
 * Example 13: Offline Queue
 *
 * Demonstrates HTTPClient's offline queue — requests made while the device
 * is offline are buffered and automatically replayed once connectivity is
 * restored.
 *
 * This example simulates offline mode via a custom transport that initially
 * rejects all requests (simulating no network), then allows them through.
 *
 * Run:  npx tsx examples/13-offline-queue.ts
 */

import { HTTPBuilder, MockAdapter } from '../src';

// ---------------------------------------------------------------------------
// Scenario 1 — Basic offline queue setup
// ---------------------------------------------------------------------------

async function demo_offlineQueueConfig(): Promise<void> {
  console.log('\n--- 1. Offline queue configuration ---');

  // withOfflineQueue(true) enables the queue with default settings.
  // When navigator.onLine is false (or the window "offline" event fires),
  // requests are buffered until the "online" event fires.
  const client = new HTTPBuilder('https://jsonplaceholder.typicode.com')
    .withOfflineQueue(true)
    .build();

  // In a browser environment the queue activates automatically.
  // Dispatch a request that will execute immediately (we're "online" in this demo).
  const res = await client.get<{ id: number; title: string }>('/todos/1');
  console.log('  Todo:', res.data.id, res.data.title);
}

// ---------------------------------------------------------------------------
// Scenario 2 — Manual request prioritization
// ---------------------------------------------------------------------------

async function demo_queuedWithMock(): Promise<void> {
  console.log('\n--- 2. Queue with network recovery simulation ---');

  // Simulate intermittent failures then success
  const mock = new MockAdapter();
  let requestCount = 0;

  // First 2 requests fail (simulate offline), then succeed
  mock.onGet('/posts/1').reply(() => {
    requestCount++;
    if (requestCount <= 2) {
      return [0, null]; // Simulate network error
    }
    return [200, { id: 1, userId: 1, title: 'Queued post recovered', body: 'content' }];
  });

  const client = new HTTPBuilder('https://api.example.com')
    .withTransport(mock.transport)
    .withRetry({
      maxAttempts: 5,
      initialDelayMs: 100,
      backoffFactor: 1.5,
    })
    .build();

  console.log('  Sending request (will retry on initial failures)...');
  try {
    const res = await client.get<{ id: number; title: string }>('/posts/1');
    console.log(`  Recovered after ${requestCount} attempts: "${res.data.title}"`);
  } catch (err) {
    console.log('  Request failed after retries:', (err as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Scenario 3 — Persistent queue with storage adapter
// ---------------------------------------------------------------------------

async function demo_persistentQueue(): Promise<void> {
  console.log('\n--- 3. Persistent queue options ---');

  // PersistentQueueOptions allows customizing storage, sync behaviour, etc.
  const client = new HTTPBuilder('https://jsonplaceholder.typicode.com')
    .withOfflineQueue({
      syncWithNetwork: true, // Replay queue when "online" event fires
      maxSize: 50, // Maximum buffered requests
    })
    .build();

  // Make a simple request to verify the client works
  const res = await client.get<Array<{ id: number; completed: boolean }>>('/todos?_limit=3');
  console.log(`  Fetched ${res.data.length} todos with persistent queue enabled`);
  console.log(`  Completed: ${res.data.filter((t) => t.completed).length}/${res.data.length}`);
}

// ---------------------------------------------------------------------------
// Scenario 4 — Event listeners for queue state changes
// ---------------------------------------------------------------------------

async function demo_queueEvents(): Promise<void> {
  console.log('\n--- 4. Queue configuration (events demonstrated conceptually) ---');

  // The offline queue fires lifecycle events you can subscribe to:
  //
  //   client.on('queue:added', (task) => {
  //     console.log('Request queued:', task.id);
  //   });
  //
  //   client.on('queue:drain', () => {
  //     console.log('All queued requests replayed');
  //   });
  //
  //   client.on('queue:restored', (tasks) => {
  //     console.log(`Restored ${tasks.length} requests from storage`);
  //   });
  //
  // In a real app you can use these events to show offline indicators,
  // retry progress, and "back online" notifications to your users.

  const client = new HTTPBuilder('https://jsonplaceholder.typicode.com')
    .withOfflineQueue({ syncWithNetwork: true })
    .build();

  const res = await client.get<{ id: number; name: string }>('/users/1');
  console.log('  User fetched:', res.data.name);
  console.log('  Queue lifecycle events would fire in a browser environment');
}

// ---------------------------------------------------------------------------
// Scenario 5 — Combining offline queue with circuit breaker
// ---------------------------------------------------------------------------

async function demo_combinedResilience(): Promise<void> {
  console.log('\n--- 5. Offline queue + circuit breaker + retry ---');

  // The full resilience stack: requests that fail get retried, circuit
  // breaker prevents hammering a downed service, offline queue buffers
  // when there's no connectivity at all.
  const client = new HTTPBuilder('https://jsonplaceholder.typicode.com')
    .withOfflineQueue(true)
    .withCircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 30_000 })
    .withRetry({ maxAttempts: 3, initialDelayMs: 200 })
    .build();

  const [users, todos] = await Promise.all([
    client.get<Array<{ id: number; name: string }>>('/users?_limit=2'),
    client.get<Array<{ id: number; completed: boolean }>>('/todos?_limit=2'),
  ]);

  console.log('  Users:', users.data.map((u) => u.name).join(', '));
  console.log(
    '  Todos:',
    todos.data.map((t) => `#${t.id}(${t.completed ? 'done' : 'pending'})`).join(', ')
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== reixo offline queue examples ===');

  await demo_offlineQueueConfig();
  await demo_queuedWithMock();
  await demo_persistentQueue();
  await demo_queueEvents();
  await demo_combinedResilience();

  console.log('\nAll offline queue demos complete.');
}

main().catch(console.error);
