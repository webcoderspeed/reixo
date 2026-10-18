/**
 * Example 01 — Basic Requests
 *
 * Covers: GET, POST, PUT, PATCH, DELETE, HEAD, query params (flat/array/nested),
 * custom headers, and paramsSerializer.
 *
 * Run: npx tsx examples/01-basic-requests.ts
 * API:  https://jsonplaceholder.typicode.com
 */

import { HTTPBuilder } from '../src';

async function main() {
  const client = new HTTPBuilder()
    .withBaseURL('https://jsonplaceholder.typicode.com')
    .withTimeout(10_000)
    .withHeaders({ Accept: 'application/json' })
    .build();

  // ── GET ─────────────────────────────────────────────────────────────────────
  console.log('GET /posts/1');
  const post = await client.get<{ id: number; title: string; body: string }>('/posts/1');
  console.log(`  ${post.status}  title: "${post.data.title.slice(0, 50)}"`);

  // ── GET with flat query params ───────────────────────────────────────────────
  console.log('\nGET /posts?userId=1&_limit=3');
  const posts = await client.get<{ id: number; title: string }[]>('/posts', {
    params: { userId: 1, _limit: 3 },
  });
  console.log(`  ${posts.status}  ${posts.data.length} posts`);

  // ── GET with array params (repeated keys: ?id=1&id=2) ──────────────────────
  console.log('\nGET /posts with array param');
  const byIds = await client.get<{ id: number }[]>('/posts', {
    params: { id: [1, 2, 3] },
  });
  console.log(`  ${byIds.status}  returned ${byIds.data.length} posts`);

  // ── GET with nested object params (bracket notation) ───────────────────────
  console.log('\nGET with nested params → ?filter[userId]=1');
  const nested = await client.get('/posts', {
    params: { filter: { userId: 1 } },
  });
  console.log(`  ${nested.status}`);

  // ── GET with custom paramsSerializer ────────────────────────────────────────
  console.log('\nGET with paramsSerializer (comma-separated)');
  const custom = await client.get('/posts', {
    params: { userId: 1, _limit: 5 },
    paramsSerializer: (p) =>
      Object.entries(p)
        .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(',') : v}`)
        .join('&'),
  });
  console.log(`  ${custom.status}`);

  // ── POST ────────────────────────────────────────────────────────────────────
  console.log('\nPOST /posts');
  const created = await client.post<{ id: number; title: string }>('/posts', {
    title: 'Testing reixo',
    body: 'HTTP clients should handle the boring parts.',
    userId: 1,
  });
  console.log(`  ${created.status}  created id: ${created.data.id}`);

  // ── PUT ─────────────────────────────────────────────────────────────────────
  console.log('\nPUT /posts/1');
  const replaced = await client.put<{ title: string }>('/posts/1', {
    id: 1,
    title: 'Replaced via PUT',
    body: 'Complete replacement.',
    userId: 1,
  });
  console.log(`  ${replaced.status}  title: "${replaced.data.title}"`);

  // ── PATCH ───────────────────────────────────────────────────────────────────
  console.log('\nPATCH /posts/1');
  const patched = await client.patch<{ title: string }>('/posts/1', {
    title: 'Patched title only',
  });
  console.log(`  ${patched.status}  title: "${patched.data.title}"`);

  // ── DELETE ──────────────────────────────────────────────────────────────────
  console.log('\nDELETE /posts/1');
  const deleted = await client.delete('/posts/1');
  console.log(`  ${deleted.status}`);

  // ── HEAD (check resource without downloading body) ───────────────────────────
  console.log('\nHEAD /posts/1');
  const head = await client.head('/posts/1');
  console.log(`  ${head.status}  content-type: ${head.headers.get('content-type')}`);
}

main().catch(console.error);
