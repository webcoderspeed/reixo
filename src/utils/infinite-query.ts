import { IHTTPClient } from './http';

export interface InfiniteQueryOptions<TData> {
  client: IHTTPClient;
  url: string;
  /**
   * Function to generate query parameters for a given page parameter.
   * If not provided, the pageParam will be used as the 'page' or 'cursor' query param directly
   * if it's a primitive, or merged if it's an object.
   */
  params?: (pageParam: unknown) => Record<string, string | number | boolean>;
  /**
   * Calculate the next page parameter based on the last fetched page.
   * Return undefined or null to indicate there are no more pages.
   */
  getNextPageParam: (lastPage: TData, allPages: TData[]) => unknown | undefined | null;
  /**
   * Calculate the previous page parameter based on the first fetched page.
   * Return undefined or null to indicate there are no previous pages.
   */
  getPreviousPageParam?: (firstPage: TData, allPages: TData[]) => unknown | undefined | null;
  /**
   * The initial page parameter to use for the first fetch.
   * Defaults to 1 or undefined depending on implementation.
   */
  initialPageParam?: unknown;
  /**
   * Optional direction to fetch initially.
   */
  direction?: 'forward' | 'backward';
}

export interface InfiniteData<TData> {
  pages: TData[];
  pageParams: unknown[];
}

export class InfiniteQuery<TData> {
  private client: IHTTPClient;
  private url: string;
  private options: InfiniteQueryOptions<TData>;
  private _data: InfiniteData<TData>;
  private _isFetching: boolean = false;
  private _isFetchingNextPage: boolean = false;
  private _isFetchingPreviousPage: boolean = false;
  private _error: unknown | null = null;

  constructor(options: InfiniteQueryOptions<TData>) {
    this.client = options.client;
    this.url = options.url;
    this.options = options;
    this._data = {
      pages: [],
      pageParams: [],
    };

    // Initialize with initialPageParam if provided
    if (this.options.initialPageParam !== undefined) {
      // We don't fetch automatically in constructor, usually triggered manually
    }
  }

  public get data(): InfiniteData<TData> {
    return this._data;
  }

  public get isFetching(): boolean {
    return this._isFetching;
  }

  public get isFetchingNextPage(): boolean {
    return this._isFetchingNextPage;
  }

  public get isFetchingPreviousPage(): boolean {
    return this._isFetchingPreviousPage;
  }

  public get error(): unknown | null {
    return this._error;
  }

  public get hasNextPage(): boolean {
    if (this._data.pages.length === 0) return true;
    const lastPage = this._data.pages[this._data.pages.length - 1];
    const nextParam = this.options.getNextPageParam(lastPage, this._data.pages);
    return nextParam !== undefined && nextParam !== null;
  }

  public get hasPreviousPage(): boolean {
    if (this._data.pages.length === 0) return false;
    if (!this.options.getPreviousPageParam) return false;
    const firstPage = this._data.pages[0];
    const prevParam = this.options.getPreviousPageParam(firstPage, this._data.pages);
    return prevParam !== undefined && prevParam !== null;
  }

  private async fetch(pageParam: unknown): Promise<TData> {
    const params = this.options.params
      ? this.options.params(pageParam)
      : typeof pageParam === 'object'
        ? (pageParam as Record<string, string | number | boolean>)
        : { page: pageParam as string | number };

    const response = await this.client.get<TData>(this.url, { params });
    return response.data;
  }

  /**
   * Fetches the next page.
   * If it's the first fetch, uses initialPageParam.
   */
  public async fetchNextPage(): Promise<InfiniteData<TData>> {
    if (this._isFetchingNextPage) return this._data;

    let pageParam: unknown;

    if (this._data.pages.length === 0) {
      pageParam = this.options.initialPageParam ?? 1;
    } else {
      const lastPage = this._data.pages[this._data.pages.length - 1];
      pageParam = this.options.getNextPageParam(lastPage, this._data.pages);

      if (pageParam === undefined || pageParam === null) {
        return this._data; // No more pages
      }
    }

    this._isFetching = true;
    this._isFetchingNextPage = true;
    this._error = null;

    try {
      const page = await this.fetch(pageParam);

      this._data.pages.push(page);
      this._data.pageParams.push(pageParam);

      return this._data;
    } catch (error) {
      this._error = error;
      throw error;
    } finally {
      this._isFetching = false;
      this._isFetchingNextPage = false;
    }
  }

  /**
   * Fetches the previous page.
   */
  public async fetchPreviousPage(): Promise<InfiniteData<TData>> {
    if (this._isFetchingPreviousPage) return this._data;
    if (this._data.pages.length === 0) return this._data;
    if (!this.options.getPreviousPageParam) return this._data;

    const firstPage = this._data.pages[0];
    const pageParam = this.options.getPreviousPageParam(firstPage, this._data.pages);

    if (pageParam === undefined || pageParam === null) {
      return this._data;
    }

    this._isFetching = true;
    this._isFetchingPreviousPage = true;
    this._error = null;

    try {
      const page = await this.fetch(pageParam);

      this._data.pages.unshift(page);
      this._data.pageParams.unshift(pageParam);

      return this._data;
    } catch (error) {
      this._error = error;
      throw error;
    } finally {
      this._isFetching = false;
      this._isFetchingPreviousPage = false;
    }
  }

  /**
   * Resets the infinite query state.
   */
  public reset(): void {
    this._data = { pages: [], pageParams: [] };
    this._error = null;
    this._isFetching = false;
    this._isFetchingNextPage = false;
    this._isFetchingPreviousPage = false;
  }
}
