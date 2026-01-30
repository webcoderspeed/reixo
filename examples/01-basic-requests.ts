import { Reixo } from '../src';

/**
 * Example 1: Basic HTTP Requests
 * Demonstrates GET, POST, PUT, DELETE methods, headers, timeouts, and error handling.
 */

async function runBasicRequests() {
  console.log('🚀 Running Basic HTTP Requests Example\n');

  // 1. Create a client instance using the Builder pattern
  const client = new Reixo.HTTPBuilder('https://jsonplaceholder.typicode.com')
    .withTimeout(10000)
    .withHeaders({
      'Content-Type': 'application/json',
      'User-Agent': 'Reixo-Example-Client/1.0',
    })
    .build();

  try {
    // --- GET Request ---
    console.log('1. GET /posts/1');
    const post = await client.get<{ id: number; title: string }>('/posts/1');
    console.log('✅ Status:', post.status);
    console.log('📄 Title:', post.data.title);

    // --- POST Request ---
    console.log('\n2. POST /posts');
    const newPost = {
      title: 'Reixo is awesome',
      body: 'It handles retries and queues effortlessly.',
      userId: 1,
    };
    const created = await client.post<{ id: number; title: string }>('/posts', newPost);
    console.log('✅ Status:', created.status);
    console.log('🆕 Created ID:', created.data.id);

    // --- PUT Request (Update) ---
    console.log('\n3. PUT /posts/1');
    const updateData = {
      id: 1,
      title: 'Reixo Updated Title',
      body: 'Updated content',
      userId: 1,
    };
    const updated = await client.put<{ title: string }>('/posts/1', updateData);
    console.log('✅ Status:', updated.status);
    console.log('📝 Updated Title:', updated.data.title);

    // --- DELETE Request ---
    console.log('\n4. DELETE /posts/1');
    const deleted = await client.delete('/posts/1');
    console.log('✅ Status:', deleted.status); // Should be 200 or 204

    // --- Query Parameters ---
    console.log('\n5. GET /posts with params');
    const userPosts = await client.get<{ id: number }[]>('/posts', {
      params: { userId: '1' },
    });
    console.log('✅ Found posts:', userPosts.data.length);

    // --- Error Handling (404) ---
    console.log('\n6. Handling Errors (404)');
    try {
      await client.get('/posts/999999');
    } catch (error) {
      // Reixo throws HTTPError
      if (error instanceof Error) {
        console.log('✅ Caught Expected Error:', error.message);
      }
    }
  } catch (error) {
    console.error('❌ Unexpected Error:', error);
  }
}

runBasicRequests();
