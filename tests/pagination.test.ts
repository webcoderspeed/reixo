import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { paginate } from '../src/utils/pagination';
import { HTTPClient } from '../src/core/http-client';
import { HTTPOptions } from '../src/utils/http';

// Mock HTTPClient
vi.mock('../src/core/http-client', () => {
  return {
    HTTPClient: class {
      get = vi.fn();
    },
  };
});

describe('Pagination Helper', () => {
  const createClient = () => new HTTPClient({ baseURL: 'https://api.example.com' });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should paginate through pages until empty', async () => {
    const client = createClient();
    const mockData = [
      [1, 2], // Page 1
      [3, 4], // Page 2
      [], // Page 3 (empty, should stop)
    ];

    const getMock = client.get as unknown as Mock;

    getMock.mockImplementation(async (url: string, config: HTTPOptions) => {
      const params = config.params as { page: number };
      const page = params.page;
      // Return data based on page number (1-based index)
      const data = mockData[page - 1] || [];
      return { data, status: 200 };
    });

    const results: number[] = [];
    for await (const pageItems of paginate<number>(client, '/items', { limit: 2 })) {
      results.push(...pageItems);
    }

    expect(results).toEqual([1, 2, 3, 4]);
    expect(getMock).toHaveBeenCalledTimes(3); // 2 pages with data + 1 empty page
    expect(getMock).toHaveBeenCalledWith(
      '/items',
      expect.objectContaining({
        params: { page: 1, limit: 2 },
      })
    );
    expect(getMock).toHaveBeenCalledWith(
      '/items',
      expect.objectContaining({
        params: { page: 2, limit: 2 },
      })
    );
  });

  it('should respect custom parameter names', async () => {
    const client = createClient();
    const getMock = client.get as unknown as Mock;
    getMock.mockResolvedValue({ data: [], status: 200 });

    const generator = paginate(client, '/items', {
      pageParam: 'p',
      limitParam: 's',
      initialPage: 0,
    });

    await generator.next();

    expect(getMock).toHaveBeenCalledWith(
      '/items',
      expect.objectContaining({
        params: { p: 0, s: 10 },
      })
    );
  });

  it('should handle nested results path', async () => {
    const client = createClient();
    const mockResponse = {
      data: {
        meta: { total: 10 },
        items: [1, 2, 3],
      },
    };

    const getMock = client.get as unknown as Mock;
    getMock.mockResolvedValueOnce({ data: mockResponse, status: 200 });
    getMock.mockResolvedValueOnce({ data: { data: { items: [] } }, status: 200 }); // Stop on second call

    const generator = paginate<number>(client, '/items', {
      resultsPath: 'data.items',
      limit: 3,
    });

    const result = await generator.next();
    expect(result.value).toEqual([1, 2, 3]);
  });
});
