/**
 * Example 14: Metrics & Observability
 *
 * Demonstrates MetricsCollector for tracking request performance, error rates,
 * and latency distributions. Useful for dashboards, alerting, and SLO monitoring.
 *
 * Also shows the NetworkRecorder for capturing a full request/response log,
 * and the Pipeline utility for request transformation chains.
 *
 * Run:  npx tsx examples/14-metrics.ts
 */

import { HTTPBuilder, MockAdapter, MetricsCollector, NetworkRecorder } from '../src';

// ---------------------------------------------------------------------------
// Scenario 1 — Enable built-in metrics via withMetrics()
// ---------------------------------------------------------------------------

async function demo_builtInMetrics(): Promise<void> {
  console.log('\n--- 1. Built-in metrics collector ---');

  const mock = new MockAdapter();
  mock.onGet('/api/users').reply(200, [{ id: 1, name: 'Alice' }], { delayMs: 20 });
  mock.onGet('/api/posts').reply(200, [{ id: 1, title: 'Hello' }], { delayMs: 40 });
  mock.onGet('/api/missing').reply(404, { error: 'Not Found' });

  const client = new HTTPBuilder('https://api.example.com')
    .withTransport(mock.transport)
    .withMetrics(true)
    .withRetry(false)
    .build();

  // Make a batch of requests
  await Promise.allSettled([
    client.get('/api/users'),
    client.get('/api/posts'),
    client.get('/api/users'),
    client.get('/api/missing').catch(() => {}),
  ]);

  const snapshot = client.metrics?.getSnapshot();
  if (!snapshot) {
    console.log('  Metrics not available');
    return;
  }

  console.log('  Request count    :', snapshot.requestCount);
  console.log('  Error count      :', snapshot.errorCount);
  console.log('  Avg latency (ms) :', snapshot.averageLatency.toFixed(1));
  console.log('  Min latency (ms) :', snapshot.minLatency);
  console.log('  Max latency (ms) :', snapshot.maxLatency);
}

// ---------------------------------------------------------------------------
// Scenario 2 — Real-time metrics callback
// ---------------------------------------------------------------------------

async function demo_realtimeCallback(): Promise<void> {
  console.log('\n--- 2. Real-time metrics update callback ---');

  const mock = new MockAdapter();
  mock.onGet('/data').reply(200, { ok: true }, { delayMs: 15 });

  const client = new HTTPBuilder('https://api.example.com')
    .withTransport(mock.transport)
    .withMetrics(true, (metrics) => {
      // Called after every request completes
      const avg =
        metrics.requestCount > 0 ? (metrics.totalLatency / metrics.requestCount).toFixed(1) : '0';
      process.stdout.write(`\r  [live] requests=${metrics.requestCount}, avg=${avg}ms`);
    })
    .build();

  // Make several sequential requests
  for (let i = 0; i < 5; i++) {
    await client.get('/data');
  }
  console.log('\n  Done.');
}

// ---------------------------------------------------------------------------
// Scenario 3 — Standalone MetricsCollector
// ---------------------------------------------------------------------------

async function demo_standaloneCollector(): Promise<void> {
  console.log('\n--- 3. Standalone MetricsCollector ---');

  const collector = new MetricsCollector(50); // Keep last 50 requests

  // Simulate recording some metrics manually
  const endpoints = ['/api/users', '/api/posts', '/api/comments', '/api/missing'];

  for (let i = 0; i < 10; i++) {
    const url = endpoints[i % endpoints.length];
    const startTime = Date.now() - Math.floor(Math.random() * 200 + 50);
    const endTime = Date.now();
    const isError = i % 5 === 4; // 20% error rate

    collector.record({
      url,
      method: 'GET',
      startTime,
      endTime,
      status: isError ? 500 : 200,
      success: !isError,
    });
  }

  const snapshot = collector.getSnapshot();
  const recent = collector.getRecentRequests();

  console.log('  Total requests  :', snapshot.requestCount);
  console.log('  Errors          :', snapshot.errorCount);
  console.log(
    `  Error rate      : ${((snapshot.errorCount / snapshot.requestCount) * 100).toFixed(0)}%`
  );
  console.log('  Avg latency     :', snapshot.averageLatency.toFixed(1), 'ms');
  console.log('  Slowest request :', snapshot.maxLatency, 'ms');

  const slowest = recent.sort((a, b) => b.duration - a.duration)[0];
  console.log(`  Slowest URL     : ${slowest.method} ${slowest.url} (${slowest.duration}ms)`);
}

// ---------------------------------------------------------------------------
// Scenario 4 — NetworkRecorder for request/response capture
// ---------------------------------------------------------------------------

async function demo_networkRecorder(): Promise<void> {
  console.log('\n--- 4. NetworkRecorder — full request log ---');

  const mock = new MockAdapter();
  mock.onGet('/users/1').reply(200, { id: 1, name: 'Alice' });
  mock.onPost('/posts').reply(201, { id: 101, title: 'New post' });
  mock.onDelete('/posts/1').reply(204, null);

  const recorder = new NetworkRecorder();

  const client = new HTTPBuilder('https://api.example.com')
    .withTransport(mock.transport)
    .addResponseInterceptor((response) => {
      // Record each response as it arrives
      recorder.record({
        url: response.config.url ?? '',
        method: (response.config.method ?? 'GET').toUpperCase(),
        status: response.status,
        timestamp: Date.now(),
        duration: 0, // Would come from timing in a real interceptor
      });
      return response;
    })
    .build();

  await client.get('/users/1');
  await client.post('/posts', { title: 'New post' });
  await client.delete('/posts/1');

  const log = recorder.getAll();
  console.log('  Recorded requests:');
  for (const entry of log) {
    console.log(`    ${entry.method} ${entry.url} → ${entry.status}`);
  }
}

// ---------------------------------------------------------------------------
// Scenario 5 — p95 latency computation from request log
// ---------------------------------------------------------------------------

async function demo_percentileLatency(): Promise<void> {
  console.log('\n--- 5. p50/p95/p99 latency from request log ---');

  const mock = new MockAdapter();
  // Simulate varied response times
  let callCount = 0;
  mock.onGet('/api/data').reply(() => {
    callCount++;
    return [200, { n: callCount }, { delayMs: Math.floor(Math.random() * 100 + 10) }];
  });

  const client = new HTTPBuilder('https://api.example.com')
    .withTransport(mock.transport)
    .withMetrics(true)
    .build();

  // Fire 20 requests
  await Promise.all(Array.from({ length: 20 }, () => client.get('/api/data')));

  const requests = client.metrics!.getRecentRequests();
  const durations = requests.map((r) => r.duration).sort((a, b) => a - b);

  const p = (pct: number) => durations[Math.floor((pct / 100) * durations.length)] ?? 0;

  console.log(`  Samples : ${durations.length}`);
  console.log(`  p50     : ${p(50)}ms`);
  console.log(`  p90     : ${p(90)}ms`);
  console.log(`  p95     : ${p(95)}ms`);
  console.log(`  p99     : ${p(99)}ms`);
  console.log(`  max     : ${durations[durations.length - 1]}ms`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== reixo metrics & observability examples ===');

  await demo_builtInMetrics();
  await demo_realtimeCallback();
  await demo_standaloneCollector();
  await demo_networkRecorder();
  await demo_percentileLatency();

  console.log('\nAll metrics demos complete.');
}

main().catch(console.error);
