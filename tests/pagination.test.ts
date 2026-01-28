import { describe, it, expect, vi, beforeEach } from 'vitest';
import { paginate } from '../src/utils/pagination';
import { HTTPClient } from '../src/core/http-client';

// Mock HTTPClient
vi.mock('../src/core/http-client', () => {
  return {
    HTTPClient: class {
      get = vi.fn();
      constructor() {}
    },
  };
});

describe('Pagination Helper', () => {
  let client: HTTPClient;

  beforeEach(() => {
    client = new HTTPClient({ baseURL: 'https://api.example.com' });
    vi.clearAllMocks();
  });

  it('should paginate through pages until empty', async () => {
    const mockData = [
      [1, 2], // Page 1
      [3, 4], // Page 2
      [], // Page 3 (empty, should stop)
    ];

    let callCount = 0;
    (client.get as any).mockImplementation(async (url: string, config: any) => {
      const page = config.params.page;
      callCount++;
      // Return data based on page number (1-based index)
      const data = mockData[page - 1] || [];
      return { data, status: 200 };
    });

    const results: number[] = [];
    for await (const pageItems of paginate<number>(client, '/items', { limit: 2 })) {
      results.push(...pageItems);
    }

    expect(results).toEqual([1, 2, 3, 4]);
    expect(callCount).toBe(3); // 2 pages with data + 1 empty page
    expect(client.get).toHaveBeenCalledWith(
      '/items',
      expect.objectContaining({
        params: { page: 1, limit: 2 },
      })
    );
    expect(client.get).toHaveBeenCalledWith(
      '/items',
      expect.objectContaining({
        params: { page: 2, limit: 2 },
      })
    );
  });

  it('should respect custom parameter names', async () => {
    (client.get as any).mockResolvedValue({ data: [], status: 200 });

    const generator = paginate(client, '/items', {
      pageParam: 'p',
      limitParam: 's',
      initialPage: 0,
    });

    await generator.next();

    expect(client.get).toHaveBeenCalledWith(
      '/items',
      expect.objectContaining({
        params: { p: 0, s: 10 },
      })
    );
  });

  it('should handle nested results path', async () => {
    const mockResponse = {
      data: {
        meta: { total: 10 },
        items: [1, 2, 3],
      },
    };

    (client.get as any).mockResolvedValueOnce({ data: mockResponse, status: 200 });
    (client.get as any).mockResolvedValueOnce({ data: { data: { items: [] } }, status: 200 }); // Stop on second call

    const generator = paginate<number>(client, '/items', {
      resultsPath: 'data.items',
      limit: 3,
    });

    const result = await generator.next();
    expect(result.value).toEqual([1, 2, 3]);
  });
});
