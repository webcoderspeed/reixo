import { describe, it, expect } from 'vitest';
import { HTTPBuilder } from '../../src/core/http-client';

// Note: These tests hit a real external API (JSONPlaceholder).
// They require an internet connection and are subject to the external API's availability and rate limits.
describe('JSONPlaceholder Integration Tests', () => {
  const client = HTTPBuilder.create('https://jsonplaceholder.typicode.com')
    .withTimeout(10000) // Higher timeout for real network requests
    .withRetry({ maxRetries: 2 })
    .build();

  it('should fetch a single todo item', async () => {
    interface Todo {
      userId: number;
      id: number;
      title: string;
      completed: boolean;
    }

    const response = await client.get<Todo>('/todos/1');

    expect(response.status).toBe(200);
    expect(response.data.id).toBe(1);
    expect(typeof response.data.title).toBe('string');
    expect(typeof response.data.completed).toBe('boolean');
  });

  it('should fetch a list of posts', async () => {
    interface Post {
      userId: number;
      id: number;
      title: string;
      body: string;
    }

    const response = await client.get<Post[]>('/posts', {
      params: { _limit: 5 },
    });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.data)).toBe(true);
    expect(response.data.length).toBe(5);
    expect(response.data[0]).toHaveProperty('title');
  });

  it('should create a new post (POST)', async () => {
    interface Post {
      id: number;
      title: string;
      body: string;
      userId: number;
    }

    const newPost = {
      title: 'foo',
      body: 'bar',
      userId: 1,
    };

    const response = await client.post<Post>('/posts', newPost);

    expect(response.status).toBe(201);
    expect(response.data.title).toBe('foo');
    expect(response.data.body).toBe('bar');
    expect(response.data.userId).toBe(1);
  });

  it('should handle InfiniteQuery with pagination', async () => {
    interface Post {
      id: number;
      title: string;
    }

    // JSONPlaceholder uses _page and _limit for pagination
    const query = client.infiniteQuery<Post[]>('/posts', {
      initialPageParam: 1,
      params: (pageParam) => ({
        _page: String(pageParam),
        _limit: '5',
      }),
      getNextPageParam: (_lastPage: Post[], allPages: Post[][]) => {
        // Stop after 3 pages
        return allPages.length < 3 ? allPages.length + 1 : undefined;
      },
    });

    const firstPage = await query.fetchNextPage();
    expect(firstPage.pages.length).toBe(1);
    expect(firstPage.pages[0].length).toBe(5);

    const secondPage = await query.fetchNextPage();
    expect(secondPage.pages.length).toBe(2);
    expect(secondPage.pages[1].length).toBe(5);

    // Verify different data (simple check)
    expect(firstPage.pages[0][0].id).not.toBe(secondPage.pages[1][0].id);
  });
});
