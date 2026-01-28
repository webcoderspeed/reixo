import { Reixo } from '../src';

/**
 * Example 7: Testing & Mocking
 * Demonstrates how to use MockAdapter for unit testing without real network calls.
 */

async function runMockingDemo() {
  console.log('🚀 Running Mocking Demo\n');

  // 1. Create Mock Adapter
  const mock = new Reixo.MockAdapter();

  // 2. Create a Client with Mock Transport
  const client = new Reixo.HTTPBuilder('https://api.example.com')
    .withTransport(mock.transport)
    .build();

  // 3. Define Mocks
  console.log('--- Setting up Mocks ---');

  // Mock GET /users
  mock.onGet('/users').reply(200, [
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' },
  ]);

  // Mock POST /users with specific body match (optional in Reixo basic mock,
  // but let's see what MockAdapter supports.
  // Reixo MockAdapter usually supports url matching.

  mock.onPost('/users').reply(201, {
    id: 3,
    name: 'Charlie',
    created: true,
  });

  // Mock Network Error
  mock.onGet('/error').networkError();

  // 4. Run Requests
  console.log('\n--- Executing Requests against Mocks ---');

  // Request 1: GET /users
  const users = await client.get<Array<{ id: number; name: string }>>('/users');
  console.log('GET /users status:', users.status);
  console.log('GET /users data:', users.data);

  // Request 2: POST /users
  const created = await client.post('/users', { name: 'Charlie' });
  console.log('POST /users status:', created.status);
  console.log('POST /users data:', created.data);

  // Request 3: Error
  try {
    console.log('GET /error (expecting failure)...');
    await client.get('/error');
  } catch (error) {
    console.log('✅ Caught expected error:', (error as Error).message);
  }

  // 5. Reset Mock Adapter
  mock.reset();
  console.log('\n✅ Mock Adapter Reset');

  console.log('\n✅ Mocking Demo Finished');
}

runMockingDemo();
