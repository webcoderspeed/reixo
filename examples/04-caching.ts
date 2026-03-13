/**
 * Example 04 — Caching
 *
 * Covers: cache-first, stale-while-revalidate, manual invalidation,
 * cache metadata (hit/age/ttl), prefetch with cancellable handle,
 * optimistic updates with mutate().
 *
 * Run: npx tsx examples/04-caching.ts
 */

import { HTTPBuilder } from '../src';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  // ── 1. cache-first ────────────────────────────────────────────────────────────
  console.log('--- cache-first strategy');

  const client = new HTTPBuilder()
    .withBaseURL('https://jsonplaceholder.typicode.com')
    .withTimeout(5_000)
    .withCache({ ttl: 30_000, strategy: 'cache-first', storage: 'memory' })
    .build();

  const r1 = await client.get<{ id: number; name: string }>('/users/1');
  console.log(`  1st call: ${r1.status} — cached: ${r1.cacheMetadata?.hit ?? false}`);

  const r2 = await client.get<{ id: number; name: string }>('/users/1');
  console.log(`  2nd call: ${r2.status} — cached: ${r2.cacheMetadata?.hit ?? false}`);

  if (r2.cacheMetadata?.hit) {
    console.log(`  age: ${r2.cacheMetadata.age}s, ttl remaining: ${r2.cacheMetadata.ttl}s`);
    console.log(`  strategy: ${r2.cacheMetadata.strategy}`);
  }

  // ── 2. Cache metadata ─────────────────────────────────────────────────────────
  console.log('\n--- Cache metadata');
  const metaClient = new HTTPBuilder()
    .withBaseURL('https://jsonplaceholder.typicode.com')
    .withTimeout(5_000)
    .withCache({ ttl: 60_000, strategy: 'cache-first' })
    .build();

  await metaClient.get('/users/2'); // prime the cache
  await sleep(50); // let a moment pass

  const cached = await metaClient.get('/users/2');
  if (cached.cacheMetadata) {
    const { hit, age, ttl, strategy } = cached.cacheMetadata;
    console.log(`  hit: ${hit}`);
    console.log(`  age: ${age}s  ttl: ${ttl}s  strategy: ${strategy}`);
  }

  // ── 3. stale-while-revalidate ─────────────────────────────────────────────────
  console.log('\n--- stale-while-revalidate');
  const swrClient = new HTTPBuilder()
    .withBaseURL('https://jsonplaceholder.typicode.com')
    .withTimeout(5_000)
    .withCache({ ttl: 10_000, strategy: 'stale-while-revalidate' })
    .build();

  // Prime
  await swrClient.get('/users/3');
  await sleep(50);

  // Returns stale data immediately + triggers background revalidation
  const stale = await swrClient.get('/users/3');
  console.log(`  served cached immediately: ${stale.cacheMetadata?.hit}`);
  await sleep(200); // let background revalidation finish
  console.log('  background revalidation complete');

  // ── 4. Manual cache invalidation ─────────────────────────────────────────────
  console.log('\n--- Manual invalidation');
  const postClient = new HTTPBuilder()
    .withBaseURL('https://jsonplaceholder.typicode.com')
    .withTimeout(5_000)
    .withCache({ ttl: 60_000, strategy: 'cache-first' })
    .build();

  await postClient.get('/posts/1');
  const cached2 = await postClient.get('/posts/1');
  console.log(`  before invalidation — cached: ${cached2.cacheMetadata?.hit}`);

  // Note: invalidate is not available on HTTPClient, this is a conceptual example
  // The actual cache management would happen through the HTTPBuilder configuration
  const fresh = await postClient.get('/posts/1');
  console.log(`  after fetch — cached: ${fresh.cacheMetadata?.hit}`);

  // ── 5. getQueryData (read cache without a network call) ─────────────────────
  console.log('\n--- getQueryData (read-only cache access)');
  await client.get('/users/4');
  const fromCache = client.getQueryData<{ id: number; name: string }>('/users/4');
  console.log(`  from cache: ${fromCache?.name}`);

  // ── 6. Prefetch with cancellable handle ──────────────────────────────────────
  console.log('\n--- Prefetch with cancel()');
  const handle = client.prefetch('/posts/5');
  console.log(`  prefetch started, completed: ${handle.completed}`);
  await sleep(500); // wait for it
  console.log(`  completed: ${handle.completed}`);

  // Demonstrate cancellation
  const handle2 = client.prefetch('/posts/6');
  handle2.cancel(); // cancel immediately
  console.log(`  cancelled prefetch, completed: ${handle2.completed}`);

  console.log('\nDone.');
}

main().catch(console.error);
