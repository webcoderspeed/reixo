import { HTTPOptions, HTTPResponse, HTTPError } from './http';
import { HTTPRequestFunction } from '../core/http-client';

interface MockHandler {
  matcher: (url: string, options: HTTPOptions) => boolean;
  response?: (url: string, options: HTTPOptions) => Promise<HTTPResponse<unknown>>;
  error?: (url: string, options: HTTPOptions) => Promise<never>;
}

export class MockAdapter {
  private handlers: MockHandler[] = [];
  private history: { url: string; options: HTTPOptions }[] = [];
  public delayResponse = 0;

  /**
   * The transport function to pass to HTTPClient config.
   */
  public transport: HTTPRequestFunction = async <T>(
    url: string,
    options: HTTPOptions
  ): Promise<HTTPResponse<T>> => {
    this.history.push({ url, options });

    if (this.delayResponse > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayResponse));
    }

    const handler = this.handlers.find((h) => h.matcher(url, options));

    if (handler) {
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

  public on(
    method: string,
    url: string | RegExp
  ): {
    reply: (status: number, data?: unknown, headers?: Record<string, string>) => MockAdapter;
    replyOnce: (status: number, data?: unknown, headers?: Record<string, string>) => MockAdapter;
    networkError: () => MockAdapter;
    timeout: () => MockAdapter;
  } {
    const matcher = (reqUrl: string, reqOptions: HTTPOptions) => {
      const methodMatch = (reqOptions.method || 'GET').toUpperCase() === method.toUpperCase();
      const urlMatch =
        url instanceof RegExp ? url.test(reqUrl) : reqUrl === url || reqUrl.endsWith(url);
      return methodMatch && urlMatch;
    };

    const createHandler = (once: boolean) => {
      return {
        reply: (status: number, data?: unknown, headers: Record<string, string> = {}) => {
          const handler: MockHandler = {
            matcher,
            response: async (_u, opts) => {
              if (once) {
                const index = this.handlers.indexOf(handler);
                if (index !== -1) this.handlers.splice(index, 1);
              }
              return {
                data,
                status,
                statusText: status === 200 ? 'OK' : 'Mock Response',
                headers: new Headers(headers),
                config: opts,
              } as HTTPResponse<unknown>;
            },
          };
          this.handlers.push(handler);
          return this;
        },
        networkError: () => {
          const handler: MockHandler = {
            matcher,
            error: async (_u, _opts) => {
              if (once) {
                const index = this.handlers.indexOf(handler);
                if (index !== -1) this.handlers.splice(index, 1);
              }
              throw new Error('Network Error');
            },
          };
          this.handlers.push(handler);
          return this;
        },
        timeout: () => {
          const handler: MockHandler = {
            matcher,
            error: async (_u, opts) => {
              if (once) {
                const index = this.handlers.indexOf(handler);
                if (index !== -1) this.handlers.splice(index, 1);
              }
              throw new HTTPError('Timeout', { config: opts }); // Simulate timeout
            },
          };
          this.handlers.push(handler);
          return this;
        },
      };
    };

    return {
      reply: (status, data, headers) => createHandler(false).reply(status, data, headers),
      replyOnce: (status, data, headers) => createHandler(true).reply(status, data, headers),
      networkError: () => createHandler(false).networkError(),
      timeout: () => createHandler(false).timeout(),
    };
  }

  public onGet(url: string | RegExp) {
    return this.on('GET', url);
  }

  public onPost(url: string | RegExp) {
    return this.on('POST', url);
  }

  public onPut(url: string | RegExp) {
    return this.on('PUT', url);
  }

  public onDelete(url: string | RegExp) {
    return this.on('DELETE', url);
  }

  public onPatch(url: string | RegExp) {
    return this.on('PATCH', url);
  }

  public reset(): void {
    this.handlers = [];
    this.history = [];
  }

  public get historyLength(): number {
    return this.history.length;
  }

  public get latestRequest() {
    return this.history[this.history.length - 1];
  }
}
