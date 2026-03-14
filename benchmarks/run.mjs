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

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(bench) {
  const tasks = bench.tasks
    .filter(t => t.result?.state === 'completed')
    .map(t => ({
      name: t.name,
      opsPerSec: Math.round(t.result.throughput.mean),
      p99: (t.result.latency.p99 * 1000).toFixed(1),
    }))
    .sort((a, b) => b.opsPerSec - a.opsPerSec);

  // Use "native fetch" as the baseline for % comparison
  const baseline = tasks.find(t => t.name === 'native fetch') ?? tasks[0];

  return tasks.map(t => {
    const ratio = t.opsPerSec / baseline.opsPerSec;
    const diffPct = Math.round((ratio - 1) * 100);
    let vsNative;
    if (t.name === baseline.name) {
      vsNative = '(baseline)';
    } else if (diffPct >= 0) {
      vsNative = `+${diffPct}% vs native`;
    } else {
      vsNative = `${diffPct}% vs native`;
    }
    return {
      Client: t.name,
      'ops/sec': t.opsPerSec.toLocaleString(),
      'p99 (µs)': t.p99,
      'vs native fetch': vsNative,
      _opsRaw: t.opsPerSec,
    };
  });
}

// ── Benchmark suites ──────────────────────────────────────────────────────────
const get = new Bench({ name: 'Simple GET request', time: 3000 });
get
  .add('native fetch',           async () => { const r = await fetch(`${BASE}/users/1`); await r.json(); })
  .add('reixo (basic)',           async () => { await client.get('/users/1'); })
  .add('reixo + retry',           async () => { await clientRetry.get('/users/1'); })
  .add('reixo + circuit-breaker', async () => { await clientCB.get('/users/1'); });

const post = new Bench({ name: 'POST with JSON body', time: 3000 });
post
  .add('native fetch', async () => {
    const r = await fetch(`${BASE}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Jane' }),
    });
    await r.json();
  })
  .add('reixo', async () => { await client.post('/users', { name: 'Jane' }); });

// ── Runner ────────────────────────────────────────────────────────────────────
async function run() {
  console.log('\nReixo Benchmark Suite');
  console.log('Node.js ' + process.version + ' | ' + process.platform + '-' + process.arch);
  console.log('='.repeat(70));

  const all = {};
  for (const bench of [get, post]) {
    process.stdout.write('\nRunning: "' + bench.name + '" ...');
    await bench.run();
    console.log(' done');
    all[bench.name] = fmt(bench);
  }

  console.log('\n' + '='.repeat(70));
  console.log('Results — higher ops/sec is better\n');
  for (const [name, rows] of Object.entries(all)) {
    console.log(name + ':');
    for (const r of rows) {
      console.log(
        '  ' +
        r.Client.padEnd(26) +
        r['ops/sec'].padStart(14) +
        ' ops/sec   p99: ' +
        r['p99 (µs)'].padStart(6) +
        'µs   ' +
        r['vs native fetch']
      );
    }
    console.log('');
  }

  // ── reixo overhead summary ─────────────────────────────────────────────────
  console.log('='.repeat(70));
  console.log('reixo overhead over native fetch:\n');
  for (const [suiteName, rows] of Object.entries(all)) {
    const native = rows.find(r => r.Client === 'native fetch');
    const reixoBasic = rows.find(r => r.Client === 'reixo (basic)' || r.Client === 'reixo');
    if (!native || !reixoBasic) continue;
    const nativeOps = native._opsRaw;
    const reixoOps = reixoBasic._opsRaw;
    const pct = Math.round(((nativeOps - reixoOps) / nativeOps) * 100);
    const overheadUs = ((1 / reixoOps - 1 / nativeOps) * 1e6).toFixed(1);
    console.log(`  ${suiteName}: reixo adds ~${overheadUs}µs overhead (${pct}% throughput reduction vs raw fetch)`);
  }
  console.log('');
}

run().catch(e => { console.error(e); process.exit(1); });
