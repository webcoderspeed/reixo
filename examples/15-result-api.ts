/**
 * Example 15 — Result<T, E> API: no-throw error handling
 *
 * The `tryGet`, `tryPost`, `tryPut`, `tryPatch`, `tryDelete` methods return a
 * discriminated union instead of throwing. Every caller gets a typed `Result`
 * that is either `Ok<HTTPResponse<T>>` or `Err<HTTPError>` — no try/catch needed.
 *
 * Bonus utilities: `ok()`, `err()`, `toResult()`, `mapResult()`, `unwrap()`,
 * `unwrapOr()` — for composing Results in a railway-oriented style.
 */

import {
  err,
  HTTPBuilder,
  type HTTPError,
  type HTTPResponse,
  mapResult,
  ok,
  type Result,
  toResult,
  unwrap,
  unwrapOr,
} from '../src/index';

// ---------------------------------------------------------------------------
// Client setup
// ---------------------------------------------------------------------------

const client = new HTTPBuilder().withBaseURL('https://jsonplaceholder.typicode.com').build();

interface Post {
  id: number;
  userId: number;
  title: string;
  body: string;
}

// ---------------------------------------------------------------------------
// 1. Basic tryGet — no try/catch needed
// ---------------------------------------------------------------------------

async function fetchPost(id: number): Promise<Post | null> {
  const result = await client.tryGet<Post>(`/posts/${id}`);

  if (!result.ok) {
    console.error(`Failed to fetch post ${id}:`, result.error.message);
    return null;
  }

  return result.data.data;
}

// ---------------------------------------------------------------------------
// 2. Exhaustive result matching — explicit pattern
// ---------------------------------------------------------------------------

async function fetchPostVerbose(id: number) {
  const result = await client.tryGet<Post>(`/posts/${id}`);

  if (result.ok) {
    const post = result.data.data;
    console.log(`✓ Post "${post.title}" fetched (status ${result.data.status})`);
  } else {
    const e = result.error;
    console.log(`✗ HTTP ${e.status}: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// 3. tryPost — create a new resource
// ---------------------------------------------------------------------------

async function createPost(payload: Omit<Post, 'id'>) {
  const result = await client.tryPost<Post>('/posts', payload);

  if (!result.ok) {
    console.error('Create failed:', result.error.message);
    return null;
  }

  console.log('Created post with id:', result.data.data.id);
  return result.data.data;
}

// ---------------------------------------------------------------------------
// 4. Chaining with mapResult — transform the payload without unwrapping
// ---------------------------------------------------------------------------

async function fetchPostTitle(id: number): Promise<Result<string, HTTPError>> {
  const result = await client.tryGet<Post>(`/posts/${id}`);
  // Transform the full HTTPResponse into just the title string
  return mapResult(result, (res) => res.data.title);
}

// ---------------------------------------------------------------------------
// 5. unwrap / unwrapOr for when you're certain or want a fallback
// ---------------------------------------------------------------------------

async function getPostOrDefault(id: number): Promise<Post> {
  const result = await client.tryGet<Post>(`/posts/${id}`);
  return unwrapOr(
    mapResult(result, (res) => res.data),
    { id: 0, userId: 0, title: 'Unknown', body: '' }
  );
}

// ---------------------------------------------------------------------------
// 6. toResult — wrap any existing Promise-based code
// ---------------------------------------------------------------------------

async function fetchWithToResult(id: number) {
  // Works with any Promise — not just reixo methods
  const result = await toResult<HTTPResponse<Post>>(client.get<Post>(`/posts/${id}`));

  if (result.ok) {
    console.log('Got post via toResult:', result.data.data.title);
  } else {
    console.log('Error via toResult:', result.error.message);
  }
}

// ---------------------------------------------------------------------------
// 7. Constructing Results manually — useful in your own functions
// ---------------------------------------------------------------------------

function parseJson(raw: string): Result<unknown, Error> {
  try {
    return ok(JSON.parse(raw));
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n=== Result<T, E> API Examples ===\n');

  // 1. Fetch with null-fallback
  const post = await fetchPost(1);
  if (post) console.log('1. Post title:', post.title);

  // 2. Verbose matching
  await fetchPostVerbose(1);

  // 3. Create
  await createPost({ userId: 1, title: 'Hello Result', body: 'No throws, no worries.' });

  // 4. Map a result
  const titleResult = await fetchPostTitle(1);
  if (titleResult.ok) console.log('4. Mapped title:', titleResult.data);

  // 5. unwrapOr with fallback
  const postOrDefault = await getPostOrDefault(9999);
  console.log('5. Post or default id:', postOrDefault.id);

  // 6. toResult wrapper
  await fetchWithToResult(2);

  // 7. Manual ok/err
  const parsed = parseJson('{"hello":"world"}');
  if (parsed.ok) console.log('7. Parsed JSON:', parsed.data);

  const bad = parseJson('not json');
  if (!bad.ok) console.log('7. Parse error:', bad.error.message);

  // unwrap throws if Err — use only when you're certain
  try {
    const certain = await client.tryGet<Post>('/posts/1');
    const response = unwrap(certain);
    console.log('unwrap succeeded:', response.status);
  } catch (e) {
    console.error('unwrap threw (unexpected):', e);
  }

  console.log('\n✓ All Result examples completed');
}

main().catch(console.error);
