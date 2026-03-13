import { HTTPOptions, HTTPResponse, HTTPError, NetworkError, TimeoutError } from './http';
import { HTTPRequestFunction } from '../core/http-client';

/** Callback handler shape used by `reply((url, options) => [status, data, headers])`. */
export type MockReplyCallback = (
  url: string,
  options: HTTPOptions
) =>
  | [status: number, data?: unknown, headers?: Record<string, string>]
  | Promise<[status: number, data?: unknown, headers?: Record<string, string>]>;

interface MockHandler {
  matcher: (url: string, options: HTTPOptions) => boolean;
  once: boolean;
  response?: (url: string, options: HTTPOptions) => Promise<HTTPResponse<unknown>>;
  error?: (url: string, options: HTTPOptions) => Promise<never>;
}

/**
 * Intercepts HTTP requests for testing without making real network calls.
 *
 * Pass `mock.transport` as the `transport` option to `HTTPClient` or `HTTPBuilder`.
 *
 * @example
 * ```ts
 * const mock = new MockAdapter();
 * const client = new HTTPClient({ transport: mock.transport });
 *
 * mock.onGet('/api/users').reply(200, [{ id: 1, name: 'Alice' }]);
 * mock.onPost('/api/users').reply((url, opts) => {
 *   const body = JSON.parse(opts.body as string);
 *   return [201, { id: 2, ...body }];
 * });
 *
 * const { data } = await client.get<User[]>('/api/users');
 * ```
 */
export class MockAdapter {
  private handlers: MockHandler[] = [];
  private history: { url: string; options: HTTPOptions }[] = [];

  /**
   * Default delay applied to every response (milliseconds).
   * Useful for simulating realistic network latency in tests.
   * @default 0
   */
  public delayResponse = 0;

  /**
   * The transport function to pass to `HTTPClient` config.
   *
   * @example
   * const client = new HTTPClient({ transport: mock.transport });
   */
  public transport: HTTPRequestFunction = async <T>(
    url: string,
    options: HTTPOptions
  ): Promise<HTTPResponse<T>> => {
    this.history.push({ url, options });

    if (this.delayResponse > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayResponse));
    }

    const handlerIndex = this.handlers.findIndex((h) => h.matcher(url, options));
    const handler = this.handlers[handlerIndex];

    if (handler) {
      // Remove one-time handlers before executing so they don't fire again
      // even if the handler itself throws
      if (handler.once) {
        this.handlers.splice(handlerIndex, 1);
      }

      if (handler.error) {
        return handler.error(url, options) as Promise<never>;
      }
      if (handler.response) {
        return handler.response(url, options) as Promise<HTTPResponse<T>>;
      }
    }

    // Default 404 if no handler matches
    throw new HTTPError('Mock: No handler found for request', {
      status: 404,
      statusText: 'Not Found',
      config: options,
    });
  };

  /**
   * Register a mock for the given HTTP `method` and URL pattern.
   *
   * The returned builder exposes fluent methods to set the response:
   * - `.reply(status, data?, headers?)` — static response
   * - `.reply(callback)` — dynamic response via a callback
   * - `.replyOnce(status, data?, headers?)` — fires only once, then is removed
   * - `.replyOnce(callback)` — dynamic single-use response
   * - `.networkError()` — simulate a network failure
   * - `.timeout()` — simulate a request timeout
   */
  public on(
    method: string,
    url: string | RegExp
  ): {
    reply: {
      (status: number, data?: unknown, headers?: Record<string, string>): MockAdapter;
      (callback: MockReplyCallback): MockAdapter;
    };
    replyOnce: {
      (status: number, data?: unknown, headers?: Record<string, string>): MockAdapter;
      (callback: MockReplyCallback): MockAdapter;
    };
    networkError: () => MockAdapter;
    timeout: () => MockAdapter;
  } {
    const matcher = (reqUrl: string, reqOptions: HTTPOptions): boolean => {
      const methodMatch = (reqOptions.method || 'GET').toUpperCase() === method.toUpperCase();
      // Exact match, path-suffix match (e.g. '/users' matches 'https://api.example.com/users'),
      // or RegExp match
      const urlMatch =
        url instanceof RegExp
          ? url.test(reqUrl)
          : reqUrl === url || reqUrl.endsWith(`/${url.replace(/^\//, '')}`);
      return methodMatch && urlMatch;
    };

    const buildReply = (
      once: boolean,
      statusOrCallback: number | MockReplyCallback,
      staticData?: unknown,
      staticHeaders: Record<string, string> = {}
    ): MockAdapter => {
      const handler: MockHandler = {
        matcher,
        once,
        response: async (reqUrl, reqOpts) => {
          let status: number;
          let data: unknown;
          let headers: Record<string, string>;

          if (typeof statusOrCallback === 'function') {
            const result = await statusOrCallback(reqUrl, reqOpts);
            [status, data, headers = {}] = result;
          } else {
            status = statusOrCallback;
            data = staticData;
            headers = staticHeaders;
          }

          return {
            data,
            status,
            statusText: status === 200 ? 'OK' : 'Mock Response',
            headers: new Headers(headers),
            config: reqOpts,
          } as HTTPResponse<unknown>;
        },
      };
      this.handlers.push(handler);
      return this;
    };

    const buildNetworkError = (once: boolean): MockAdapter => {
      const handler: MockHandler = {
        matcher,
        once,
        error: async () => {
          throw new NetworkError('Mock: Network Error');
        },
      };
      this.handlers.push(handler);
      return this;
    };

    const buildTimeout = (once: boolean): MockAdapter => {
      const handler: MockHandler = {
        matcher,
        once,
        error: async (_u, opts) => {
          throw new TimeoutError(opts.timeoutMs ?? 30000);
        },
      };
      this.handlers.push(handler);
      return this;
    };

    return {
      reply: (
        statusOrCallback: number | MockReplyCallback,
        data?: unknown,
        headers?: Record<string, string>
      ) => buildReply(false, statusOrCallback, data, headers),

      replyOnce: (
        statusOrCallback: number | MockReplyCallback,
        data?: unknown,
        headers?: Record<string, string>
      ) => buildReply(true, statusOrCallback, data, headers),

      networkError: () => buildNetworkError(false),
      timeout: () => buildTimeout(false),
    } as ReturnType<MockAdapter['on']>;
  }

  /** Mock all GET requests to the given URL pattern. */
  public onGet(url: string | RegExp) {
    return this.on('GET', url);
  }
  /** Mock all POST requests to the given URL pattern. */
  public onPost(url: string | RegExp) {
    return this.on('POST', url);
  }
  /** Mock all PUT requests to the given URL pattern. */
  public onPut(url: string | RegExp) {
    return this.on('PUT', url);
  }
  /** Mock all DELETE requests to the given URL pattern. */
  public onDelete(url: string | RegExp) {
    return this.on('DELETE', url);
  }
  /** Mock all PATCH requests to the given URL pattern. */
  public onPatch(url: string | RegExp) {
    return this.on('PATCH', url);
  }
  /** Mock all HEAD requests to the given URL pattern. */
  public onHead(url: string | RegExp) {
    return this.on('HEAD', url);
  }
  /** Mock all OPTIONS requests to the given URL pattern. */
  public onOptions(url: string | RegExp) {
    return this.on('OPTIONS', url);
  }

  /**
   * Remove all registered handlers and clear request history.
   * Call between tests to ensure handler isolation.
   */
  public reset(): void {
    this.handlers = [];
    this.history = [];
  }

  /** Total number of requests recorded since the last {@link reset}. */
  public get historyLength(): number {
    return this.history.length;
  }

  /** The most recently recorded request, or `undefined` if none. */
  public get latestRequest(): { url: string; options: HTTPOptions } | undefined {
    return this.history[this.history.length - 1];
  }

  /** Returns a copy of the full request history since the last {@link reset}. */
  public getHistory(): Array<{ url: string; options: HTTPOptions }> {
    return [...this.history];
  }
}
