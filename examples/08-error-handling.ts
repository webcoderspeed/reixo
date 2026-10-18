import { Reixo } from '../src';

/**
 * Example 8: Error Handling & Debugging
 * Demonstrates how to inspect errors, including status codes, headers, and error bodies.
 */

async function runErrorHandlingDemo() {
  console.log('🚀 Running Error Handling & Debugging Demo\n');

  const client = new Reixo.HTTPBuilder('https://jsonplaceholder.typicode.com')
    .withTimeout(5000)
    .build();

  // Helper to print error details
  const printError = async (error: unknown) => {
    if (error instanceof Reixo.HTTPError) {
      console.log(`❌ HTTP Error Caught: ${error.message}`);
      console.log(`   Status: ${error.status} ${error.statusText}`);
      console.log(`   URL: ${error.config?.url || 'Unknown'}`);

      // Attempt to read error body if available
      if (error.response) {
        try {
          // Clone response because body might be used/locked if we weren't careful
          // (Though in Reixo implementation, we throw before reading body in success path)
          const errorBody = await error.response.json();
          console.log('   Body:', errorBody);
        } catch {
          console.log('   Body: (Could not parse JSON)');
        }
      }
    } else if (error instanceof Error) {
      console.log(`❌ General Error: ${error.message}`);
      console.log(`   Stack: ${error.stack?.split('\n')[1]}`); // Print first line of stack
    } else {
      console.log('❌ Unknown Error:', error);
    }
  };

  // 1. 404 Not Found
  console.log('--- 1. Triggering 404 Not Found ---');
  try {
    await client.get('/posts/999999');
  } catch (error) {
    await printError(error);
  }

  // 2. Network Error (Invalid Domain)
  console.log('\n--- 2. Triggering Network Error ---');
  const badClient = new Reixo.HTTPBuilder('https://this-domain-does-not-exist-12345.com')
    .withTimeout(2000)
    .withRetry(false) // Disable retry to fail fast
    .build();

  try {
    await badClient.get('/');
  } catch (error) {
    await printError(error);
  }

  // 3. Timeout Error
  console.log('\n--- 3. Triggering Timeout Error ---');
  const timeoutClient = new Reixo.HTTPBuilder('https://jsonplaceholder.typicode.com')
    .withTimeout(1) // 1ms timeout (impossible to succeed)
    .withRetry(false)
    .build();

  try {
    await timeoutClient.get('/posts');
  } catch (error) {
    await printError(error);
  }

  console.log('\n✅ Error Handling Demo Finished');
}

runErrorHandlingDemo();
