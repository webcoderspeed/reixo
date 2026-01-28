import { Reixo } from '../src';

/**
 * Example 4: Caching & Pagination
 * Demonstrates in-memory caching with TTL, invalidation, and pagination helpers.
 */

async function runCachingDemo() {
  console.log('🚀 Running Caching & Pagination Demo\n');

  // --- Part 1: Caching ---
  console.log('--- 1. Caching Demo ---');

  // Create client with caching enabled
  const client = new Reixo.HTTPBuilder('https://jsonplaceholder.typicode.com')
    .withTimeout(10000)
    // Enable simple in-memory cache (TTL 5 seconds)
    .withCache({
      ttl: 5000,
      maxEntries: 100,
    })
    .build();

  console.log('Fetching Post 1 (Network Request)...');
  const start1 = Date.now();
  await client.get('/posts/1');
  console.log(`Time: ${Date.now() - start1}ms`);

  console.log('Fetching Post 1 Again (Cached)...');
  const start2 = Date.now();
  await client.get('/posts/1');
  console.log(`Time: ${Date.now() - start2}ms (Should be near 0)`);

  // Wait for TTL expiry
  console.log('Waiting 6s for cache expiry...');
  await Reixo.delay(6000);

  console.log('Fetching Post 1 Again (Network Request)...');
  const start3 = Date.now();
  await client.get('/posts/1');
  console.log(`Time: ${Date.now() - start3}ms`);

  // --- Part 2: Pagination ---
  console.log('\n--- 2. Pagination Helper Demo ---');

  // We want to fetch comments with pagination
  // JSONPlaceholder uses ?_page=X&_limit=Y but Reixo defaults to page/limit
  // We can customize the params.

  // Note: JSONPlaceholder might not support standard pagination meta.
  // We will iterate until empty array.

  const iterator = Reixo.paginate<{ id: number; name: string }>(client, '/comments', {
    pageParam: '_page',
    limitParam: '_limit',
    limit: 5,
    initialPage: 1,
    // Stop if we have fetched 3 pages (15 items) for demo purposes
    stopCondition: (_resp, _pageItems, totalFetched) => totalFetched >= 15,
  });

  console.log('Iterating over pages of comments...');

  let pageCount = 0;
  for await (const pageItems of iterator) {
    pageCount++;
    console.log(`Page ${pageCount}: Fetched ${pageItems.length} items`);
    // Process items...
    pageItems.forEach((item) => {
      console.log(` - ${item.id}: ${item.name}`);
    });
  }

  console.log(`\n✅ Pagination Finished. Total pages: ${pageCount}`);
}

runCachingDemo();
