import { Reixo } from '../src';

/**
 * Reixo Quick Start Demo
 *
 * For detailed examples, see:
 * - examples/01-basic-requests.ts
 * - examples/02-resilience-retry-circuit.ts
 * - examples/03-queue-offline-sync.ts
 * - examples/04-caching-pagination.ts
 * - examples/05-graphql.ts
 * - examples/06-interceptors-logging.ts
 * - examples/07-testing-mocking.ts
 */

async function runQuickStart() {
  console.log('🚀 Reixo Quick Start\n');

  // Simple GET request
  const client = new Reixo.HTTPBuilder('https://jsonplaceholder.typicode.com')
    .withTimeout(5000)
    .build();

  try {
    const response = await client.get<{ title: string }>('/todos/1');
    console.log('✅ Fetched Todo:', response.data.title);
  } catch (error) {
    console.error('❌ Error:', error);
  }

  console.log('\n👉 Check the "examples/" folder for more detailed usage!');
}

runQuickStart();
