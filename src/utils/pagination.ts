import { HTTPClient } from '../core/http-client';
import { HTTPResponse } from './http';

export interface PaginationOptions<T> {
  pageParam?: string; // Default: 'page'
  limitParam?: string; // Default: 'limit'
  limit?: number; // Default: 10
  initialPage?: number; // Default: 1
  totalPath?: string; // Path to total count in response (e.g. 'meta.total')
  resultsPath?: string; // Path to results array in response (e.g. 'data')
  stopCondition?: (
    response: HTTPResponse<unknown>,
    pageItems: T[],
    totalFetched: number
  ) => boolean;
}

function extractItems<T>(data: unknown, path?: string): T[] {
  if (path) {
    const result = path.split('.').reduce((obj: unknown, key: string) => {
      if (obj && typeof obj === 'object' && key in (obj as Record<string, unknown>)) {
        return (obj as Record<string, unknown>)[key];
      }
      return undefined;
    }, data);
    return Array.isArray(result) ? (result as T[]) : [];
  }

  if (Array.isArray(data)) {
    return data as T[];
  }

  if (data && typeof data === 'object') {
    // Try to find the first array in the response object
    const values = Object.values(data as Record<string, unknown>);
    const foundArray = values.find((val) => Array.isArray(val));
    if (foundArray) {
      return foundArray as T[];
    }
  }

  return [];
}

export async function* paginate<T>(
  client: HTTPClient,
  url: string,
  options: PaginationOptions<T> = {}
): AsyncGenerator<T[]> {
  const {
    pageParam = 'page',
    limitParam = 'limit',
    limit = 10,
    initialPage = 1,
    resultsPath,
    stopCondition,
  } = options;

  const fetchPage = async function* (page: number, currentTotal: number): AsyncGenerator<T[]> {
    const params: Record<string, string | number> = {
      [pageParam]: page,
      [limitParam]: limit,
    };

    const response = await client.get<unknown>(url, { params });
    const items = extractItems<T>(response.data, resultsPath);

    if (items.length === 0) {
      return;
    }

    yield items;

    const newTotal = currentTotal + items.length;
    const shouldStop = stopCondition
      ? stopCondition(response, items, newTotal)
      : items.length < limit;

    if (!shouldStop) {
      yield* fetchPage(page + 1, newTotal);
    }
  };

  yield* fetchPage(initialPage, 0);
}
