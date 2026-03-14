/**
 * Example 06 — Request Cancellation
 *
 * Covers: cancel by request ID, cancelAll(), AbortController signal,
 * cancellable prefetch, and React-style cleanup pattern.
 *
 * Run: npx tsx examples/06-cancellation.ts
 */

import { AbortError, HTTPBuilder } from '../src';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const client = new HTTPBuilder()
    .withBaseURL('https://jsonplaceholder.typicode.com')
    .withTimeout(10_000)
    .build();

  // ── 1. Cancel a specific request by ID ───────────────────────────────────────
  console.log('--- cancel(requestId)');
  const { requestId, response: p1 } = client.requestWithId<unknown>('/posts');
  // Schedule cancellation for 5ms from now
  setTimeout(() => client.cancel(requestId), 5);
  try {
    await p1;
    console.log('  completed (network was too fast to cancel)');
  } catch (err) {
    console.log(`  cancelled: ${err instanceof AbortError}`);
  }

  // ── 2. cancelAll() — abort every in-flight request ───────────────────────────
  console.log('\n--- cancelAll()');
  const reqs = [client.get('/posts/1'), client.get('/posts/2'), client.get('/posts/3')];
  setTimeout(() => client.cancelAll(), 5);
  const results = await Promise.allSettled(reqs);
  const cancelled = results.filter(
    (r) => r.status === 'rejected' && r.reason instanceof AbortError
  ).length;
  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  console.log(`  ${cancelled} cancelled, ${succeeded} completed (timing-dependent)`);

  // ── 3. AbortController signal ────────────────────────────────────────────────
  console.log('\n--- AbortController signal');
  const controller = new AbortController();
  const req = client.get('/posts', { signal: controller.signal });
  setTimeout(() => controller.abort(), 5);
  try {
    await req;
    console.log('  completed');
  } catch (err) {
    console.log(`  AbortError: ${err instanceof AbortError}`);
  }

  // ── 4. Cancellable prefetch ───────────────────────────────────────────────────
  console.log('\n--- prefetch() handle');
  const handle = client.prefetch('/posts/10');
  console.log(`  started — completed: ${handle.completed}`);
  await sleep(500);
  console.log(`  after 500ms — completed: ${handle.completed}`);

  // Prefetch that we immediately cancel
  const handle2 = client.prefetch('/posts/11');
  handle2.cancel();
  console.log(`  cancelled prefetch — completed: ${handle2.completed}`);

  // ── 5. React-style cleanup pattern ──────────────────────────────────────────
  console.log('\n--- React useEffect cleanup pattern');
  function fetchUser(id: number) {
    const abortController = new AbortController();

    const promise = client
      .get<{ id: number; name: string }>(`/users/${id}`, {
        signal: abortController.signal,
      })
      .then((r) => r.data)
      .catch((err) => {
        if (err instanceof AbortError) return null; // unmounted — ignore
        throw err;
      });

    return { promise, cleanup: () => abortController.abort() };
  }

  const { promise: userPromise, cleanup } = fetchUser(1);
  // Simulate component unmount before fetch completes
  setTimeout(cleanup, 3);
  const user = await userPromise;
  console.log(
    `  result after potential cleanup: ${user === null ? 'null (cancelled)' : user.name}`
  );

  console.log('\nDone.');
}

main().catch(console.error);
