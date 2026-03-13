import type { HeadersRecord } from '../types/http-well-known';
import type { BodyData } from '../core/http-client';
import { HTTPOptions, HTTPResponse, HTTPError, NetworkError, TimeoutError } from './http';
import { HTTPRequestFunction } from '../core/http-client';

/**
 * Accepted response-body type for mock replies.
 * Covers JSON-serialisable values and `null` (e.g. 204 No Content).
 */
export type MockResponseData = BodyData | null | undefined;

/**
 * Callback handler shape for `.reply((url, options) => [status, data?, headers?])`.
 *
 * @example
 * mock.onPost('/users').reply((url, opts) => {
 *   const body = JSON.parse(opts.body as string);
 *   return body.role === 'admin' ? [403, { error: 'Forbidden' }] : [201, { id: 1, ...body }];
 * });
 */
export type MockReplyCallback = (
  url: string,
  options: HTTPOptions
) =>
  | [status: number, data?: MockResponseData, headers?: HeadersRecord]
  | Promise<[status: number, data?: MockResponseData, headers?: HeadersRecord]>;

/** Optional per-handler reply options (not part of HeadersRecord business data). */
interface ReplyOptions {
  /** Simulate response latency (ms). Applied before the response is returned. */
  delayMs?: number;
}

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
 * const client = new HTTPBuilder('https://api.example.com')
 *   .withTransport(mock.transport)
 *   .build();
 *
 * mock.onGet('/users').reply(200, [{ id: 1, name: 'Alice' }]);
 * mock.onPost('/users').reply((url, opts) => {
 *   const body = JSON.parse(opts.body as string);
 *   return [201, { id: 2, ...body }];
 * });
 *
 * const { data } = await client.get<User[]>('/users');
 * ```
 */
export class MockAdapter {
  private readonly handlers: MockHandler[] = [];
  private history: Array<{ url: string; method: string; options: HTTPOptions }> = [];

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
    this.history.push({ url, method: (options.method ?? 'GET').toUpperCase(), options });

    if (this.delayResponse > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, this.delayResponse));
    }

    const handlerIndex = this.handlers.findIndex((h) => h.matcher(url, options));
    const handler = this.handlers[handlerIndex];

    if (handler) {
      // Remove one-time handlers before executing so they don't re-fire even on throw
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
   * The returned builder exposes fluent methods:
   * - `.reply(status, data?, headers?)` — static response
   * - `.reply(status, data?, headers?, options?)` — static response with latency
   * - `.reply(callback)` — dynamic response via a callback
   * - `.replyOnce(...)` — fires only once, then is removed
   * - `.networkError()` — simulate a network failure
   * - `.timeout()` — simulate a request timeout
   */
  public on(
    method: string,
    url: string | RegExp
  ): {
    reply: {
      (
        status: number,
        data?: MockResponseData,
        headers?: HeadersRecord,
        options?: ReplyOptions
      ): MockAdapter;
      (callback: MockReplyCallback): MockAdapter;
    };
    replyOnce: {
      (
        status: number,
        data?: MockResponseData,
        headers?: HeadersRecord,
        options?: ReplyOptions
      ): MockAdapter;
      (callback: MockReplyCallback): MockAdapter;
    };
    networkError: () => MockAdapter;
    timeout: () => MockAdapter;
  } {
    const matcher = (reqUrl: string, reqOptions: HTTPOptions): boolean => {
      const methodMatch = (reqOptions.method ?? 'GET').toUpperCase() === method.toUpperCase();
      const urlMatch =
        url instanceof RegExp
          ? url.test(reqUrl)
          : reqUrl === url || reqUrl.endsWith(`/${url.toString().replace(/^\//, '')}`);
      return methodMatch && urlMatch;
    };

    const buildReply = (
      once: boolean,
      statusOrCallback: number | MockReplyCallback,
      staticData?: MockResponseData,
      staticHeaders: HeadersRecord = {},
      replyOptions: ReplyOptions = {}
    ): MockAdapter => {
      const handler: MockHandler = {
        matcher,
        once,
        response: async (reqUrl, reqOpts) => {
          let status: number;
          let data: MockResponseData;
          let headers: HeadersRecord;

          if (typeof statusOrCallback === 'function') {
            const result = await statusOrCallback(reqUrl, reqOpts);
            [status, data, headers = {}] = result;
          } else {
            status = statusOrCallback;
            data = staticData;
            headers = staticHeaders;
          }

          // Simulate per-handler latency
          const delayMs = replyOptions.delayMs ?? 0;
          if (delayMs > 0) {
            await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
          }

          return {
            data,
            status,
            statusText: status === 200 ? 'OK' : 'Mock Response',
            headers: new Headers(headers as Record<string, string>),
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
        data?: MockResponseData,
        headers?: HeadersRecord,
        options?: ReplyOptions
      ) => buildReply(false, statusOrCallback, data, headers, options),

      replyOnce: (
        statusOrCallback: number | MockReplyCallback,
        data?: MockResponseData,
        headers?: HeadersRecord,
        options?: ReplyOptions
      ) => buildReply(true, statusOrCallback, data, headers, options),

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
    this.handlers.length = 0;
    this.history = [];
  }

  /** Total number of requests recorded since the last {@link reset}. */
  public get historyLength(): number {
    return this.history.length;
  }

  /** The most recently recorded request, or `undefined` if none. */
  public get latestRequest(): { url: string; method: string; options: HTTPOptions } | undefined {
    return this.history[this.history.length - 1];
  }

  /**
   * Returns a copy of the full request history since the last {@link reset}.
   * Each entry exposes `url`, `method`, and the full `options` object.
   */
  public getHistory(): Array<{ url: string; method: string; options: HTTPOptions }> {
    return [...this.history];
  }
}
