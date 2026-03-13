/**
 * Example 8: Testing with MockAdapter
 *
 * Shows how to use MockAdapter to unit-test code that depends on HTTPClient
 * without hitting a real network. Covers fixed replies, callback handlers,
 * replyOnce, network/timeout error simulation, and request history.
 *
 * Run:  npx tsx examples/08-mock-testing.ts
 */

import { HTTPBuilder, MockAdapter, HTTPError, NetworkError, TimeoutError } from '../src';
import type { HTTPOptions, MockResponseData } from '../src';

// ---------------------------------------------------------------------------
// Service under test
// ---------------------------------------------------------------------------

interface User {
  id: number;
  name: string;
  email: string;
}

interface Post {
  id: number;
  userId: number;
  title: string;
  body: string;
}

async function fetchUser(client: ReturnType<HTTPBuilder['build']>, id: number): Promise<User> {
  const res = await client.get<User>(`/users/${id}`);
  return res.data;
}

async function createPost(
  client: ReturnType<HTTPBuilder['build']>,
  post: Omit<Post, 'id'>
): Promise<Post> {
  const res = await client.post<Post>('/posts', post);
  return res.data;
}

// ---------------------------------------------------------------------------
// Scenario 1 — Basic fixed replies
// ---------------------------------------------------------------------------

async function demo_fixedReplies(): Promise<void> {
  console.log('\n--- 1. Fixed replies ---');

  const mock = new MockAdapter();
  const client = new HTTPBuilder('https://api.example.com').withTransport(mock.transport).build();

  // Register mock handlers
  mock.onGet('/users/1').reply(200, { id: 1, name: 'Alice', email: 'alice@example.com' });
  mock.onPost('/posts').reply(201, { id: 101, userId: 1, title: 'Hello', body: 'World' });

  const user = await fetchUser(client, 1);
  console.log('  User:', user.name, user.email);

  const post = await createPost(client, { userId: 1, title: 'Hello', body: 'World' });
  console.log('  Post created with id:', post.id);
}

// ---------------------------------------------------------------------------
// Scenario 2 — Callback handler with conditional logic
// ---------------------------------------------------------------------------

async function demo_callbackHandler(): Promise<void> {
  console.log('\n--- 2. Callback-based conditional replies ---');

  const mock = new MockAdapter();
  const client = new HTTPBuilder('https://api.example.com').withTransport(mock.transport).build();

  // Return 403 if the request body contains "admin"
  mock.onPost('/users').reply((_url: string, options: HTTPOptions): [number, MockResponseData] => {
    const body =
      typeof options.body === 'string'
        ? (JSON.parse(options.body) as Record<string, unknown>)
        : (options.body as unknown as Record<string, unknown>);
    if (body?.role === 'admin') {
      return [403, { error: 'Forbidden: admin role not allowed' }];
    }
    return [201, { id: 42, ...body }];
  });

  try {
    await client.post('/users', { name: 'Eve', role: 'admin' });
  } catch (err) {
    if (err instanceof HTTPError) {
      const errorData = (await err.response?.json()) as { error: string } | undefined;
      console.log('  Blocked admin:', err.status, errorData?.error);
    }
  }

  const res = await client.post<User>('/users', { name: 'Bob', role: 'user' });
  console.log('  Created user:', res.data);
}

// ---------------------------------------------------------------------------
// Scenario 3 — replyOnce (respond once, then fall through)
// ---------------------------------------------------------------------------

async function demo_replyOnce(): Promise<void> {
  console.log('\n--- 3. replyOnce ---');

  const mock = new MockAdapter();
  const client = new HTTPBuilder('https://api.example.com').withTransport(mock.transport).build();

  // First call → 503 (flaky), second call → 200
  mock.onGet('/health').replyOnce(503, { status: 'down' });
  mock.onGet('/health').reply(200, { status: 'ok' });

  const r1 = await client
    .get<{ status: string }>('/health')
    .catch((e: HTTPError) => ({ data: { status: `error-${e.status}` } }));
  console.log('  First call:', r1.data.status); // error-503

  const r2 = await client.get<{ status: string }>('/health');
  console.log('  Second call:', r2.data.status); // ok
}

// ---------------------------------------------------------------------------
// Scenario 4 — Network and timeout error simulation
// ---------------------------------------------------------------------------

async function demo_errorSimulation(): Promise<void> {
  console.log('\n--- 4. Simulating network & timeout errors ---');

  const mock = new MockAdapter();
  const client = new HTTPBuilder('https://api.example.com')
    .withTransport(mock.transport)
    .withRetry(false)
    .build();

  mock.onGet('/offline').networkError();
  mock.onGet('/slow').timeout();

  // Network error
  try {
    await client.get('/offline');
  } catch (err) {
    console.log('  Network error caught:', err instanceof NetworkError, (err as Error).message);
  }

  // Timeout
  try {
    await client.get('/slow');
  } catch (err) {
    console.log('  Timeout caught:', err instanceof TimeoutError, (err as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Scenario 5 — Delayed responses (simulate latency)
// ---------------------------------------------------------------------------

async function demo_delay(): Promise<void> {
  console.log('\n--- 5. Delayed responses ---');

  const mock = new MockAdapter();
  const client = new HTTPBuilder('https://api.example.com').withTransport(mock.transport).build();

  mock.onGet('/slow-data').reply(200, { loaded: true }, {}, { delayMs: 150 });

  const start = Date.now();
  const res = await client.get<{ loaded: boolean }>('/slow-data');
  const elapsed = Date.now() - start;

  console.log(`  Got response in ~${elapsed}ms, loaded=${res.data.loaded}`);
}

// ---------------------------------------------------------------------------
// Scenario 6 — Request history inspection
// ---------------------------------------------------------------------------

async function demo_history(): Promise<void> {
  console.log('\n--- 6. Request history ---');

  const mock = new MockAdapter();
  const client = new HTTPBuilder('https://api.example.com').withTransport(mock.transport).build();

  mock.onGet('/items').reply(200, [{ id: 1 }]);
  mock.onPost('/items').reply(201, { id: 2 });
  mock.onDelete('/items/1').reply(204, null);

  await client.get('/items');
  await client.post('/items', { name: 'New item' });
  await client.delete('/items/1');

  const history = mock.getHistory();
  console.log('  Requests made:');
  for (const req of history) {
    console.log(`    ${req.method} ${req.url}`);
  }

  mock.reset();
  console.log('  History cleared, length:', mock.getHistory().length);
}

// ---------------------------------------------------------------------------
// Scenario 7 — HEAD and OPTIONS methods
// ---------------------------------------------------------------------------

async function demo_headOptions(): Promise<void> {
  console.log('\n--- 7. HEAD and OPTIONS mocking ---');

  const mock = new MockAdapter();
  const client = new HTTPBuilder('https://api.example.com').withTransport(mock.transport).build();

  mock.onHead('/resource').reply(200, null, { 'x-resource-exists': 'true' });
  mock.onOptions('/resource').reply(204, null, {
    allow: 'GET, POST, HEAD, OPTIONS',
  });

  const headRes = await client.head('/resource');
  console.log('  HEAD status:', headRes.status);

  const optRes = await client.options('/resource');
  console.log('  OPTIONS status:', optRes.status);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== reixo MockAdapter examples ===');

  await demo_fixedReplies();
  await demo_callbackHandler();
  await demo_replyOnce();
  await demo_errorSimulation();
  await demo_delay();
  await demo_history();
  await demo_headOptions();

  console.log('\nAll mock testing demos complete.');
}

main().catch(console.error);
