import { RetryOptions } from '../types';
import { http, HTTPOptions, HTTPResponse } from '../utils/http';
import { debounce, throttle, delay } from '../utils/timing';
import { EventEmitter } from '../utils/emitter';
import { ConnectionPool, ConnectionPoolOptions } from '../utils/connection';
import { RateLimiter } from '../utils/rate-limiter';

export interface RequestInterceptor {
  onFulfilled?: (config: HTTPOptions) => HTTPOptions | Promise<HTTPOptions>;
  onRejected?: (error: unknown) => unknown;
}

export interface ResponseInterceptor {
  onFulfilled?: (
    response: HTTPResponse<unknown>
  ) => HTTPResponse<unknown> | Promise<HTTPResponse<unknown>>;
  onRejected?: (error: unknown) => unknown;
}

export interface HTTPClientConfig {
  baseURL?: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
  retry?: RetryOptions | boolean;
  pool?: ConnectionPoolOptions;
  rateLimit?: {
    requests: number;
    interval: number; // in milliseconds
  };
  onUploadProgress?: (progress: {
    loaded: number;
    total: number | null;
    progress: number | null;
  }) => void;
  onDownloadProgress?: (progress: {
    loaded: number;
    total: number | null;
    progress: number | null;
  }) => void;
}

/**
 * Main HTTP Client class providing a fluent API for making HTTP requests.
 * Supports interceptors, retries, timeout, and progress tracking.
 */
export class HTTPClient extends EventEmitter {
  public interceptors = {
    request: [] as RequestInterceptor[],
    response: [] as ResponseInterceptor[],
  };

  private connectionPool?: ConnectionPool;
  private rateLimiter?: RateLimiter;

  // Timing utilities
  public static debounce = debounce;
  public static throttle = throttle;
  public static delay = delay;

  constructor(private readonly config: HTTPClientConfig) {
    super();
    if (config.pool) {
      this.connectionPool = new ConnectionPool(config.pool);
    }
    if (config.rateLimit) {
      this.rateLimiter = new RateLimiter(config.rateLimit.requests, config.rateLimit.interval);
    }
  }

  /**
   * Destroys the client and cleans up resources (e.g., connection pools).
   */
  public destroy(): void {
    this.connectionPool?.destroy();
  }

  /**
   * Generic request method that handles interceptors, progress, and error propagation.
   *
   * @template T The expected response data type
   * @param url The URL to request
   * @param options Request configuration options
   * @returns Promise resolving to the HTTP response
   */
  public async request<T>(url: string, options: HTTPOptions = {}): Promise<HTTPResponse<T>> {
    // Handle Rate Limiting
    if (this.rateLimiter) {
      const waitTime = this.rateLimiter.getTimeToWait();
      if (waitTime > 0) {
        await delay(waitTime);
      }
      this.rateLimiter.tryConsume();
    }

    let mergedOptions: HTTPOptions = {
      url,
      ...this.config,
      ...options,
      headers: {
        ...this.config.headers,
        ...options.headers,
      },
    };

    // Inject agent from connection pool if available and not already provided
    if (this.connectionPool && !mergedOptions.agent) {
      const isHttps = (mergedOptions.baseURL || url).startsWith('https');
      const agent = isHttps
        ? await this.connectionPool.getHttpsAgent()
        : await this.connectionPool.getHttpAgent();

      if (agent) {
        mergedOptions.agent = agent;
      }
    }

    // Chain progress handlers to emit events
    const configUpload = this.config.onUploadProgress;
    const requestUpload = options.onUploadProgress;

    mergedOptions.onUploadProgress = (progress) => {
      if (configUpload) configUpload(progress);
      if (requestUpload && requestUpload !== configUpload) requestUpload(progress);
      this.emit('upload:progress', { url, ...progress });
    };

    const configDownload = this.config.onDownloadProgress;
    const requestDownload = options.onDownloadProgress;

    mergedOptions.onDownloadProgress = (progress) => {
      if (configDownload) configDownload(progress);
      if (requestDownload && requestDownload !== configDownload) requestDownload(progress);
      this.emit('download:progress', { url, ...progress });
    };

    // Run request interceptors
    for (const interceptor of this.interceptors.request) {
      if (interceptor.onFulfilled) {
        mergedOptions = await interceptor.onFulfilled(mergedOptions);
      }
    }

    try {
      let response = await http<T>(url, mergedOptions);

      // Run response interceptors
      for (const interceptor of this.interceptors.response) {
        if (interceptor.onFulfilled) {
          response = (await interceptor.onFulfilled(
            response as HTTPResponse<unknown>
          )) as HTTPResponse<T>;
        }
      }

      return response;
    } catch (error) {
      let currentError: unknown = error;
      // Run response interceptors (error case)
      for (const interceptor of this.interceptors.response) {
        if (interceptor.onRejected) {
          try {
            const result = await interceptor.onRejected(currentError);
            return result as HTTPResponse<T>;
          } catch (e) {
            currentError = e;
          }
        }
      }
      throw currentError;
    }
  }

  /**
   * GET request
   */
  public get<T>(url: string, options?: HTTPOptions): Promise<HTTPResponse<T>> {
    return this.request<T>(url, { ...options, method: 'GET' });
  }

  /**
   * POST request
   */
  public post<T>(url: string, data?: unknown, options?: HTTPOptions): Promise<HTTPResponse<T>> {
    return this.request<T>(url, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
  }

  /**
   * PUT request
   */
  public put<T>(url: string, data?: unknown, options?: HTTPOptions): Promise<HTTPResponse<T>> {
    return this.request<T>(url, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
  }

  /**
   * DELETE request
   */
  public delete<T>(url: string, options?: HTTPOptions): Promise<HTTPResponse<T>> {
    return this.request<T>(url, { ...options, method: 'DELETE' });
  }

  /**
   * PATCH request
   */
  public patch<T>(url: string, data?: unknown, options?: HTTPOptions): Promise<HTTPResponse<T>> {
    return this.request<T>(url, {
      ...options,
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
  }
}

/**
 * Builder pattern for creating configured HTTPClient instances.
 */
export class HTTPBuilder {
  private config: HTTPClientConfig = {};
  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];

  constructor(baseURL?: string) {
    if (baseURL) {
      this.config.baseURL = baseURL;
    }
  }

  /**
   * Sets the base URL for all requests.
   */
  public withBaseURL(baseURL: string): this {
    this.config.baseURL = baseURL;
    return this;
  }

  /**
   * Sets the default timeout for requests.
   * @param timeoutMs Timeout in milliseconds
   */
  public withTimeout(timeoutMs: number): this {
    this.config.timeoutMs = timeoutMs;
    return this;
  }

  public withHeader(key: string, value: string): this {
    if (!this.config.headers) {
      this.config.headers = {};
    }
    this.config.headers[key] = value;
    return this;
  }

  public withHeaders(headers: Record<string, string>): this {
    this.config.headers = { ...this.config.headers, ...headers };
    return this;
  }

  public withRetry(options: RetryOptions | boolean): this {
    this.config.retry = options;
    return this;
  }

  public withUploadProgress(
    callback: (progress: { loaded: number; total: number | null; progress: number | null }) => void
  ): this {
    this.config.onUploadProgress = callback;
    return this;
  }

  public withDownloadProgress(
    callback: (progress: { loaded: number; total: number | null; progress: number | null }) => void
  ): this {
    this.config.onDownloadProgress = callback;
    return this;
  }

  public addRequestInterceptor(
    onFulfilled?: (config: HTTPOptions) => HTTPOptions | Promise<HTTPOptions>,
    onRejected?: (error: unknown) => unknown
  ): this {
    this.requestInterceptors.push({ onFulfilled, onRejected });
    return this;
  }

  public addResponseInterceptor(
    onFulfilled?: (
      response: HTTPResponse<unknown>
    ) => HTTPResponse<unknown> | Promise<HTTPResponse<unknown>>,
    onRejected?: (error: unknown) => unknown
  ): this {
    this.responseInterceptors.push({ onFulfilled, onRejected });
    return this;
  }

  public build(): HTTPClient {
    const client = new HTTPClient({ ...this.config });
    client.interceptors.request.push(...this.requestInterceptors);
    client.interceptors.response.push(...this.responseInterceptors);
    return client;
  }

  // Convenience method to create a configured instance
  public static create(baseURL?: string): HTTPBuilder {
    return new HTTPBuilder(baseURL);
  }

  // Timing utilities available on builder
  public static debounce = debounce;
  public static throttle = throttle;
  public static delay = delay;
}
