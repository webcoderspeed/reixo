import { RetryOptions } from '../types';
import { http, HTTPOptions, HTTPResponse, HTTPError } from '../utils/http';
import { debounce, throttle, delay } from '../utils/timing';
import { EventEmitter } from '../utils/emitter';
import { ConnectionPool, ConnectionPoolOptions } from '../utils/connection';
import { RateLimiter } from '../utils/rate-limiter';
import { MetricsCollector } from '../utils/metrics';
import { CacheManager, CacheOptions } from '../utils/cache';
import { generateKey } from '../utils/keys';

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

export type HTTPRequestFunction = <T>(
  url: string,
  options: HTTPOptions
) => Promise<HTTPResponse<T>>;

export interface Logger {
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

export interface HTTPClientConfig {
  baseURL?: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
  transport?: HTTPRequestFunction; // Custom transport layer
  logger?: Logger; // Custom logger
  retry?: RetryOptions | boolean;
  pool?: ConnectionPoolOptions;
  ssl?: {
    rejectUnauthorized?: boolean;
    ca?: string | Buffer | Array<string | Buffer>;
    cert?: string | Buffer | Array<string | Buffer>;
    key?: string | Buffer | Array<string | Buffer>;
    passphrase?: string;
  };
  rateLimit?: {
    requests: number;
    interval: number; // in milliseconds
  };
  retryPolicies?: Array<{
    pattern: string | RegExp;
    retry: RetryOptions | boolean;
  }>;
  cacheConfig?: CacheOptions | boolean;
  enableMetrics?: boolean;
  enableDeduplication?: boolean;
  onMetricsUpdate?: (metrics: import('../utils/metrics').Metrics) => void;
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

export type HTTPEvents = {
  'upload:progress': [
    { url: string; loaded: number; total: number | null; progress: number | null },
  ];
  'download:progress': [
    { url: string; loaded: number; total: number | null; progress: number | null },
  ];
};

/**
 * Main HTTP Client class providing a fluent API for making HTTP requests.
 * Supports interceptors, retries, timeout, and progress tracking.
 */
export class HTTPClient extends EventEmitter<HTTPEvents> {
  public interceptors = {
    request: [] as RequestInterceptor[],
    response: [] as ResponseInterceptor[],
  };

  private connectionPool?: ConnectionPool;
  private rateLimiter?: RateLimiter;
  private cacheManager?: CacheManager;
  private inFlightRequests = new Map<string, Promise<HTTPResponse<unknown>>>();
  public readonly metrics?: MetricsCollector;

  // Timing utilities
  public static debounce = debounce;
  public static throttle = throttle;
  public static delay = delay;

  constructor(private readonly config: HTTPClientConfig) {
    super();

    // Setup logging interceptors if logger is present
    if (this.config.logger) {
      this.setupLogging();
    }

    if (config.pool || config.ssl) {
      this.connectionPool = new ConnectionPool({
        ...config.pool,
        ...config.ssl,
      });
    }
    if (config.rateLimit) {
      this.rateLimiter = new RateLimiter(config.rateLimit.requests, config.rateLimit.interval);
    }
    if (config.cacheConfig) {
      const cacheOptions = typeof config.cacheConfig === 'boolean' ? {} : config.cacheConfig;
      this.cacheManager = new CacheManager(cacheOptions);
    }
    if (config.enableMetrics) {
      this.metrics = new MetricsCollector(100, config.onMetricsUpdate);
    }
  }

  /**
   * Destroys the client and cleans up resources (e.g., connection pools).
   */
  public destroy(): void {
    this.connectionPool?.destroy();
  }

  private setupLogging() {
    const logger = this.config.logger!;

    this.interceptors.request.push({
      onFulfilled: (config) => {
        logger.info(
          `Request: ${config.method || 'GET'} ${config.baseURL || ''}${config.url || ''}`,
          {
            headers: config.headers,
            params: config.params,
          }
        );
        return config;
      },
      onRejected: (error) => {
        logger.error('Request Error', error);
        return Promise.reject(error);
      },
    });

    this.interceptors.response.push({
      onFulfilled: (response) => {
        logger.info(`Response: ${response.status} ${response.statusText}`, {
          url: response.config.url,
          status: response.status,
        });
        return response;
      },
      onRejected: (error) => {
        logger.error('Response Error', error);
        return Promise.reject(error);
      },
    });
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
    const startTime = Date.now();
    // Handle Rate Limiting
    if (this.rateLimiter) {
      const waitTime = this.rateLimiter.getTimeToWait();
      if (waitTime > 0) {
        await delay(waitTime);
      }
      this.rateLimiter.tryConsume();
    }

    if (this.cacheManager) {
      const method = options.method || 'GET';
      const isCacheable = method.toUpperCase() === 'GET' && options.cacheConfig !== false;

      if (isCacheable) {
        const cacheKey = this.cacheManager.generateKey(url, options.params);
        const cachedData = this.cacheManager.get<T>(cacheKey);

        if (cachedData) {
          // Return valid HTTPResponse structure
          return {
            data: cachedData,
            status: 200,
            statusText: 'OK (Cached)',
            headers: new Headers(),
            config: { ...this.config, ...options, url },
          };
        }
      }
    }

    // Determine retry options based on policies
    const retryOptions =
      this.config.retryPolicies?.find((policy) =>
        typeof policy.pattern === 'string' ? url.includes(policy.pattern) : policy.pattern.test(url)
      )?.retry ?? this.config.retry;

    // Deduplication check
    // Only deduplicate GET requests or if explicitly enabled
    const shouldDeduplicate =
      this.config.enableDeduplication && (options.method || 'GET').toUpperCase() === 'GET';

    const dedupeKey = shouldDeduplicate ? generateKey(url, options.params) : null;

    if (dedupeKey && this.inFlightRequests.has(dedupeKey)) {
      return this.inFlightRequests.get(dedupeKey) as Promise<HTTPResponse<T>>;
    }

    const requestPromise = (async () => {
      const initialOptions: HTTPOptions = {
        url,
        ...this.config,
        retry: retryOptions, // Default to resolved policy
        ...options, // Request-specific options override everything
        headers: {
          ...this.config.headers,
          ...options.headers,
        },
      };

      // Inject agent from connection pool if available and not already provided
      if (this.connectionPool && !initialOptions.agent) {
        const isHttps = (initialOptions.baseURL || url).startsWith('https');
        const agent = isHttps
          ? await this.connectionPool.getHttpsAgent()
          : await this.connectionPool.getHttpAgent();

        if (agent) {
          initialOptions.agent = agent;
        }
      }

      // Chain progress handlers to emit events
      const configUpload = this.config.onUploadProgress;
      const requestUpload = options.onUploadProgress;

      initialOptions.onUploadProgress = (progress) => {
        if (configUpload) configUpload(progress);
        if (requestUpload && requestUpload !== configUpload) requestUpload(progress);
        this.emit('upload:progress', { url, ...progress });
      };

      const configDownload = this.config.onDownloadProgress;
      const requestDownload = options.onDownloadProgress;

      initialOptions.onDownloadProgress = (progress) => {
        if (configDownload) configDownload(progress);
        if (requestDownload && requestDownload !== configDownload) requestDownload(progress);
        this.emit('download:progress', { url, ...progress });
      };

      // Run request interceptors using reduce for sequential async execution
      const mergedOptions = await this.interceptors.request.reduce(async (promise, interceptor) => {
        const opts = await promise;
        return interceptor.onFulfilled ? interceptor.onFulfilled(opts) : opts;
      }, Promise.resolve(initialOptions));

      try {
        const transport = this.config.transport || http;
        const initialResponse = await transport<T>(url, mergedOptions);

        // Run response interceptors using reduce
        const response = await this.interceptors.response.reduce(async (promise, interceptor) => {
          const resp = await promise;
          return interceptor.onFulfilled
            ? ((await interceptor.onFulfilled(resp as HTTPResponse<unknown>)) as HTTPResponse<T>)
            : resp;
        }, Promise.resolve(initialResponse));

        if (this.metrics) {
          this.metrics.record({
            url,
            method: mergedOptions.method || 'GET',
            startTime,
            endTime: Date.now(),
            status: response.status,
            success: true,
          });
        }

        if (this.cacheManager && response.status >= 200 && response.status < 300) {
          const method = mergedOptions.method || 'GET';
          if (method.toUpperCase() === 'GET' && mergedOptions.cacheConfig !== false) {
            const cacheKey = this.cacheManager.generateKey(url, mergedOptions.params);
            this.cacheManager.set(cacheKey, response.data);
          }
        }

        return response;
      } catch (error) {
        if (this.metrics) {
          this.metrics.record({
            url,
            method: mergedOptions.method || 'GET',
            startTime,
            endTime: Date.now(),
            status: (error as HTTPError).status || 0,
            success: false,
          });
        }

        // Run response interceptors (error case) using recursion
        const runErrorInterceptors = async (
          index: number,
          err: unknown
        ): Promise<HTTPResponse<T>> => {
          if (index >= this.interceptors.response.length) throw err;
          const interceptor = this.interceptors.response[index];
          if (interceptor.onRejected) {
            try {
              const recovered = await interceptor.onRejected(err);
              if (recovered) return recovered as HTTPResponse<T>;
            } catch (newErr) {
              return runErrorInterceptors(index + 1, newErr);
            }
          }
          return runErrorInterceptors(index + 1, err);
        };

        return runErrorInterceptors(0, error);
      } finally {
        // Cleanup in-flight request
        if (dedupeKey) {
          this.inFlightRequests.delete(dedupeKey);
        }
      }
    })();

    if (dedupeKey) {
      this.inFlightRequests.set(dedupeKey, requestPromise as Promise<HTTPResponse<unknown>>);
    }

    return requestPromise;
  }

  // ... rest of methods (get, post, put, delete, patch) remain unchanged as they delegate to request

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
