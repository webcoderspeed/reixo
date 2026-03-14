/**
 * Reixo benchmark suite — measures overhead over native fetch
 * Run: node benchmarks/run.mjs
 */
import { Bench } from 'tinybench';
import { Reixo } from '../dist/index.js';

global.fetch = async () =>
  new Response(JSON.stringify({ id: 1, name: 'Jane', role: 'admin' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const BASE = 'https://api.example.com';
const client = Reixo.HTTPBuilder.create(BASE).build();
const clientRetry = Reixo.HTTPBuilder.create(BASE).withRetry({ maxAttempts: 3, delay: 0 }).build();
const clientCB = Reixo.HTTPBuilder.create(BASE)
  .withCircuitBreaker({ failureThreshold: 5, recoveryTimeout: 1000 }).build();
const queue = new Reixo.TaskQueue({ concurrency: 10 });

function fmt(bench) {
  return bench.tasks
    .filter(t => t.result?.state === 'completed')
    .map(t => ({
      Client: t.name,
      'ops/sec': Math.round(t.result.throughput.mean).toLocaleString(),
      'p99 (µs)': (t.result.latency.p99 * 1000).toFixed(1),
    }))
    .sort((a, b) =>
      parseInt(b['ops/sec'].replace(/,/g,''),10) - parseInt(a['ops/sec'].replace(/,/g,''),10)
    );
}

const get = new Bench({ name: 'Simple GET request', time: 3000 });
get
  .add('native fetch',          async () => { const r = await fetch(`${BASE}/users/1`); await r.json(); })
  .add('reixo (basic)',          async () => { await client.get('/users/1'); })
  .add('reixo + retry',          async () => { await clientRetry.get('/users/1'); })
  .add('reixo + circuit-breaker',async () => { await clientCB.get('/users/1'); });

const post = new Bench({ name: 'POST with JSON body', time: 3000 });
post
  .add('native fetch', async () => {
    const r = await fetch(`${BASE}/users`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name:'Jane' }) });
    await r.json();
  })
  .add('reixo', async () => { await client.post('/users', { name: 'Jane' }); });

async function run() {
  console.log('\nReixo Benchmark Suite');
  console.log('Node.js ' + process.version + ' | ' + process.platform + '-' + process.arch);
  console.log('='.repeat(60));
  const all = {};
  for (const bench of [get, post]) {
    process.stdout.write('\nRunning: "' + bench.name + '" ...');
    await bench.run();
    console.log(' done');
    all[bench.name] = fmt(bench);
  }
  console.log('\n' + '='.repeat(60));
  console.log('Results — higher ops/sec is better\n');
  for (const [name, rows] of Object.entries(all)) {
    console.log(name + ':');
    for (const r of rows) {
      console.log('  ' + r.Client.padEnd(28) + r['ops/sec'].padStart(12) + ' ops/sec   p99: ' + r['p99 (µs)'] + 'µs');
    }
    console.log('');
  }
}
run().catch(e => { console.error(e); process.exit(1); });
