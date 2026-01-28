import { Bench } from 'tinybench';
import { Reixo } from '../src/index';

const bench = new Bench({ time: 1000 });

// Mock fetch
global.fetch = async () =>
  new Response(JSON.stringify({ id: 1, title: 'Test' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const client = Reixo.HTTPBuilder.create('https://api.example.com').build();
const queue = new Reixo.TaskQueue({ concurrency: 2 });

bench
  .add('Native Fetch', async () => {
    await fetch('https://api.example.com/todos/1');
  })
  .add('Reixo Client', async () => {
    await client.get('/todos/1');
  })
  .add('Reixo Queue', async () => {
    await queue.add(async () => {
      await client.get('/todos/1');
    });
  });

console.log('Running benchmarks...');
(async () => {
  try {
    console.log('Starting bench.run()');
    await bench.run();
    console.log('Finished bench.run()');
    const table = bench.table();
    console.log('Benchmark Results:');
    console.table(table);
  } catch (e) {
    console.error('Benchmark failed:', e);
  }
})();
