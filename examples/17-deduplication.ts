/**
 * Example 17 — In-flight request deduplication (thundering-herd prevention)
 *
 * When N callers simultaneously request the same URL, reixo fires only ONE
 * network request and returns the same Promise to every caller. The moment
 * the first response resolves (or rejects), every waiting caller receives
 * the identical result — zero duplicate round-trips.
 *
 * Covered here:
 *  - Default dedup on concurrent GET requests
 *  - Per-request opt-out (deduplicate: false)
 *  - RequestDeduplicator as a standalone utility
 *  - buildDedupKey helper
 *  - Runtime diagnostics via dedup.stats()
 */

import { HTTPBuilder, RequestDeduplicator, buildDedupKey, DEDUP_SAFE_METHODS } from '../src/index';

// ---------------------------------------------------------------------------
// 1. Built-in deduplication via HTTPBuilder
// ---------------------------------------------------------------------------

const client = new HTTPBuilder()
  .withBaseURL('https://jsonplaceholder.typicode.com')
  .withDeduplication() // enabled — GET/HEAD/OPTIONS are deduplicated by default
  .build();

async function demonstrateBuiltinDedup() {
  console.log('\n--- 1. Built-in deduplication ---');

  let networkCalls = 0;
  const originalFetch = globalThis.fetch;

  // Wrap fetch to count real network calls
  globalThis.fetch = (input, init) => {
    networkCalls++;
    return originalFetch(input as RequestInfo, init);
  };

  // Fire 5 identical requests simultaneously
  const start = Date.now();
  const results = await Promise.all([
    client.get('/posts/1'),
    client.get('/posts/1'),
    client.get('/posts/1'),
    client.get('/posts/1'),
    client.get('/posts/1'),
  ]);

  globalThis.fetch = originalFetch;

  console.log(`5 callers → ${networkCalls} actual network call(s) in ${Date.now() - start}ms`);
  console.log('All 5 got status:', results.map((r) => r.status).join(', '));
  // networkCalls should be 1 — all callers share the first Promise
}

// ---------------------------------------------------------------------------
// 2. Per-request opt-out
// ---------------------------------------------------------------------------

async function demonstrateOptOut() {
  console.log('\n--- 2. Per-request opt-out (deduplicate: false) ---');

  let calls = 0;
  const orig = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    calls++;
    return orig(input as RequestInfo, init);
  };

  // These two will NOT be deduplicated because deduplicate:false is set
  await Promise.all([
    client.get('/posts/2', { deduplicate: false }),
    client.get('/posts/2', { deduplicate: false }),
  ]);

  globalThis.fetch = orig;
  console.log(`2 opt-out requests → ${calls} network calls (expected 2)`);
}

// ---------------------------------------------------------------------------
// 3. Standalone RequestDeduplicator
// ---------------------------------------------------------------------------

async function demonstrateStandaloneDedup() {
  console.log('\n--- 3. Standalone RequestDeduplicator ---');

  const dedup = new RequestDeduplicator();

  // Simulate a shared data-fetching layer
  let fetchCount = 0;
  async function fetchUser(id: number) {
    fetchCount++;
    // Simulated async work
    await new Promise((r) => setTimeout(r, 20));
    return { id, name: `User ${id}` };
  }

  // Five simultaneous calls for user 42 — only one executes
  const key = buildDedupKey('GET', `/users/42`);
  const users = await Promise.all(
    Array.from({ length: 5 }, () => dedup.deduplicate(key, () => fetchUser(42)))
  );

  console.log('5 callers → fetchUser called:', fetchCount, 'time(s)');
  console.log(
    'All got same user:',
    users.every((u) => u.id === 42)
  );
  console.log('Stats:', dedup.stats());
  // { inflight: 0, savedRequests: 4 }
}

// ---------------------------------------------------------------------------
// 4. buildDedupKey and DEDUP_SAFE_METHODS
// ---------------------------------------------------------------------------

function demonstrateKeyBuilding() {
  console.log('\n--- 4. buildDedupKey / DEDUP_SAFE_METHODS ---');

  const k1 = buildDedupKey('GET', 'https://api.example.com/users?page=1');
  const k2 = buildDedupKey('GET', 'https://api.example.com/users?page=2');
  const k3 = buildDedupKey('POST', 'https://api.example.com/users', { name: 'Alice' });

  console.log('Key 1 (page=1):', k1);
  console.log('Key 2 (page=2):', k2);
  console.log('Keys equal:', k1 === k2); // false — different URLs
  console.log('Key 3 (POST with body):', k3);

  console.log('Safe methods:', [...DEDUP_SAFE_METHODS].join(', '));
}

// ---------------------------------------------------------------------------
// 5. Error propagation — all waiters get the same rejection
// ---------------------------------------------------------------------------

async function demonstrateErrorPropagation() {
  console.log('\n--- 5. Error propagation to all waiters ---');

  const dedup = new RequestDeduplicator();
  let calls = 0;

  async function failingFetch() {
    calls++;
    await new Promise((r) => setTimeout(r, 10));
    throw new Error('Upstream down');
  }

  const key = buildDedupKey('GET', '/api/broken');
  const results = await Promise.allSettled(
    Array.from({ length: 3 }, () =>
      dedup.deduplicate(key, failingFetch).catch((e: Error) => `ERR: ${e.message}`)
    )
  );

  console.log(`3 callers → failingFetch called: ${calls} time (all share the same rejection)`);
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') console.log(`  Caller ${i + 1}:`, r.value);
  });
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== In-flight Request Deduplication ===');

  await demonstrateBuiltinDedup();
  await demonstrateOptOut();
  await demonstrateStandaloneDedup();
  demonstrateKeyBuilding();
  await demonstrateErrorPropagation();

  console.log('\n✓ All deduplication examples completed');
}

main().catch(console.error);
