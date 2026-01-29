import { RetryOptions } from '../types';
import { http, HTTPOptions, HTTPResponse, HTTPError, ValidationError } from '../utils/http';
import { debounce, throttle, delay } from '../utils/timing';
import { EventEmitter } from '../utils/emitter';
import { ConnectionPool, ConnectionPoolOptions } from '../utils/connection';
import { RateLimiter } from '../utils/rate-limiter';
import { MetricsCollector } from '../utils/metrics';
import { CacheManager, CacheOptions } from '../utils/cache';
import { TaskQueue, PersistentQueueOptions } from '../utils/queue';
import { generateKey } from '../utils/keys';
import { objectToFormData } from '../utils/form-data';

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
  offlineQueue?: boolean | PersistentQueueOptions;
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
  apiVersion?: string;
  versioningStrategy?: 'header' | 'url';
  versionHeader?: string;
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
  private cleanupCallbacks: Array<() => void> = [];
  private abortControllers = new Map<string, AbortController>();
  private offlineQueue?: TaskQueue;
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

    // Setup automatic cleanup on instance destruction
    this.setupAutomaticCleanup();

    // Initialize offline queue if enabled
    this.setupOfflineQueue(config);
  }

  /**
   * Clean up all resources and prevent memory leaks
   */
  public dispose(): void {
    // Cleanup all in-flight requests
    this.inFlightRequests.clear();

    // Abort all active requests
    for (const controller of this.abortControllers.values()) {
      controller.abort();
    }
    this.abortControllers.clear();

    // Dispose connection pool
    this.connectionPool?.destroy();

    // Clear metrics data (no stop method needed for in-memory metrics)

    // Execute all cleanup callbacks
    for (const cleanup of this.cleanupCallbacks) {
      try {
        cleanup();
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
    this.cleanupCallbacks = [];

    // Remove all event listeners
    this.removeAllListeners();
  }

  /**
   * Register a cleanup callback for resource disposal
   */
  public onCleanup(callback: () => void): void {
    this.cleanupCallbacks.push(callback);
  }

  /**
   * Setup offline request queue for handling requests when offline
   */
  private setupOfflineQueue(config: HTTPClientConfig): void {
    if (config.offlineQueue) {
      const queueOptions =
        typeof config.offlineQueue === 'boolean'
          ? { syncWithNetwork: true }
          : { syncWithNetwork: true, ...config.offlineQueue };

      this.offlineQueue = new TaskQueue(queueOptions);

      // When coming back online, process queued requests
      this.offlineQueue.on('queue:restored', (tasks) => {
        this.config.logger?.info(`Offline queue restored with ${tasks.length} pending requests`);
      });

      this.offlineQueue.on('queue:drain', () => {
        this.config.logger?.info('Offline queue drained - all requests completed');
      });

      // Register cleanup
      this.onCleanup(() => {
        this.offlineQueue?.clear();
      });
    }
  }

  /**
   * Queue a request for execution when the client comes back online
   */
  private queueOfflineRequest<T>(
    url: string,
    options: HTTPOptions,
    dedupeKey?: string
  ): Promise<HTTPResponse<T>> {
    if (!this.offlineQueue) {
      throw new Error('Offline queue not configured');
    }

    const requestId = dedupeKey || Math.random().toString(36).substring(2, 15);

    return this.offlineQueue.add<HTTPResponse<T>>(() => this.request<T>(url, options), {
      id: requestId,
      priority: typeof options.priority === 'number' ? options.priority : 0,
    });
  }

  /**
   * Setup automatic cleanup for browser environments
   */
  private setupAutomaticCleanup(): void {
    // Cleanup on unload/page hide for browser environments
    if (typeof window !== 'undefined' && window.addEventListener) {
      const cleanupOnUnload = () => this.dispose();
      window.addEventListener('beforeunload', cleanupOnUnload);
      window.addEventListener('pagehide', cleanupOnUnload);

      // Register cleanup to remove these listeners
      this.onCleanup(() => {
        window.removeEventListener('beforeunload', cleanupOnUnload);
        window.removeEventListener('pagehide', cleanupOnUnload);
      });
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
    // API Versioning Logic
    if (this.config.apiVersion) {
      const strategy = this.config.versioningStrategy || 'header';
      if (strategy === 'url') {
        if (!url.startsWith('http') && !url.startsWith('https')) {
          const version = this.config.apiVersion.replace(/^\/|\/$/g, '');
          const cleanUrl = url.replace(/^\//, '');
          url = `/${version}/${cleanUrl}`;
        }
      } else {
        const headerName = this.config.versionHeader || 'X-API-Version';
        options.headers = {
          ...((options.headers as Record<string, string>) || {}),
          [headerName]: this.config.apiVersion,
        };
      }
    }

    const startTime = Date.now();
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

    // Rate limiting
    if (this.rateLimiter) {
      await this.rateLimiter.waitForToken();
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

    // Check if we're offline and should queue the request
    // We queue requests if the offline queue is enabled and currently paused (indicating offline state)
    const shouldQueue = this.offlineQueue && this.offlineQueue.isQueuePaused;

    if (shouldQueue && this.offlineQueue) {
      return this.queueOfflineRequest<T>(url, options, dedupeKey || undefined);
    }

    const requestPromise = (async () => {
      // Create abort controller for this request
      const abortController = new AbortController();
      const requestId = Math.random().toString(36).substring(2, 15);
      this.abortControllers.set(requestId, abortController);

      // Setup timeout for request abandonment detection (30 minutes)
      const abandonmentTimeout = setTimeout(
        () => {
          if (this.abortControllers.has(requestId)) {
            // Request has been active for too long - likely abandoned
            abortController.abort();
            this.abortControllers.delete(requestId);

            if (dedupeKey) {
              this.inFlightRequests.delete(dedupeKey);
            }

            this.config.logger?.warn(`Request abandoned and cleaned up: ${url}`);
          }
        },
        30 * 60 * 1000
      ); // 30 minutes

      const initialOptions: HTTPOptions = {
        url,
        ...this.config,
        retry: retryOptions, // Default to resolved policy
        ...options, // Request-specific options override everything
        headers: {
          ...this.config.headers,
          ...options.headers,
        },
        signal: abortController.signal,
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

      initialOptions.onUploadProgress = (progress: {
        loaded: number;
        total: number | null;
        progress: number | null;
      }) => {
        if (configUpload) configUpload(progress);
        if (requestUpload && requestUpload !== configUpload) requestUpload(progress);
        this.emit('upload:progress', { url, ...progress });
      };

      const configDownload = this.config.onDownloadProgress;
      const requestDownload = options.onDownloadProgress;

      initialOptions.onDownloadProgress = (progress: {
        loaded: number;
        total: number | null;
        progress: number | null;
      }) => {
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

        // Runtime Validation
        if (mergedOptions.validationSchema) {
          try {
            const schema = mergedOptions.validationSchema;
            const validatedData =
              typeof schema === 'function' ? schema(response.data) : schema.parse(response.data);
            response.data = validatedData as T;
          } catch (error) {
            throw new ValidationError('Response validation failed', response.data, error);
          }
        }

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

        // Cleanup abort controller
        this.abortControllers.delete(requestId);

        // Cleanup abandonment timeout
        clearTimeout(abandonmentTimeout);
      }
    })();

    if (dedupeKey) {
      this.inFlightRequests.set(dedupeKey, requestPromise as Promise<HTTPResponse<unknown>>);
    }

    return requestPromise;
  }

  // ... rest of methods (get, post, put, delete, patch) remain unchanged as they delegate to request

  /**
   * Generates a cURL command for the given request configuration.
   * Note: This does not execute the request or run interceptors.
   */
  public generateCurl(url: string, options: HTTPOptions = {}): string {
    const baseUrl = this.config.baseURL || '';
    const fullUrl =
      baseUrl && !url.startsWith('http')
        ? `${baseUrl.replace(/\/$/, '')}/${url.replace(/^\//, '')}`
        : url;

    // Basic implementation for debugging purposes if needed
    const method = options.method || 'GET';
    const headers = options.headers
      ? Object.entries({ ...this.config.headers, ...options.headers })
          .map(([k, v]) => `-H '${k}: ${v}'`)
          .join(' ')
      : '';
    const body = options.body
      ? `-d '${typeof options.body === 'string' ? options.body : JSON.stringify(options.body)}'`
      : '';
    return `curl -X ${method} ${headers} ${body} '${fullUrl}'`.trim();
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
    let body = data;
    const headers: Record<string, string> = {
      ...((options?.headers as Record<string, string>) || {}),
    };

    if (
      options?.useFormData &&
      data &&
      typeof data === 'object' &&
      !(typeof FormData !== 'undefined' && data instanceof FormData)
    ) {
      body = objectToFormData(data as Record<string, unknown>);
    }

    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;

    if (isFormData) {
      if (headers['Content-Type']) {
        delete headers['Content-Type'];
      }
    } else {
      if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
      body = data ? JSON.stringify(data) : undefined;
    }

    return this.request<T>(url, {
      ...options,
      method: 'POST',
      body: body as BodyInit,
      headers,
    });
  }

  /**
   * PUT request
   */
  public put<T>(url: string, data?: unknown, options?: HTTPOptions): Promise<HTTPResponse<T>> {
    let body = data;
    const headers: Record<string, string> = {
      ...((options?.headers as Record<string, string>) || {}),
    };

    if (
      options?.useFormData &&
      data &&
      typeof data === 'object' &&
      !(typeof FormData !== 'undefined' && data instanceof FormData)
    ) {
      body = objectToFormData(data as Record<string, unknown>);
    }

    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;

    if (isFormData) {
      if (headers['Content-Type']) {
        delete headers['Content-Type'];
      }
    } else {
      if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
      body = data ? JSON.stringify(data) : undefined;
    }

    return this.request<T>(url, {
      ...options,
      method: 'PUT',
      body: body as BodyInit,
      headers,
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
    let body = data;
    const headers: Record<string, string> = {
      ...((options?.headers as Record<string, string>) || {}),
    };

    if (
      options?.useFormData &&
      data &&
      typeof data === 'object' &&
      !(typeof FormData !== 'undefined' && data instanceof FormData)
    ) {
      body = objectToFormData(data as Record<string, unknown>);
    }

    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;

    if (isFormData) {
      if (headers['Content-Type']) {
        delete headers['Content-Type'];
      }
    } else {
      if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
      body = data ? JSON.stringify(data) : undefined;
    }

    return this.request<T>(url, {
      ...options,
      method: 'PATCH',
      body: body as BodyInit,
      headers,
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

  public withCache(options: CacheOptions | boolean): this {
    this.config.cacheConfig = options;
    return this;
  }

  public withTransport(transport: HTTPRequestFunction): this {
    this.config.transport = transport;
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

  public withRateLimit(options: { requests: number; interval: number }): this {
    this.config.rateLimit = options;
    return this;
  }

  public withOfflineQueue(options: boolean | PersistentQueueOptions): this {
    this.config.offlineQueue = options;
    return this;
  }

  public withDeduplication(enabled: boolean = true): this {
    this.config.enableDeduplication = enabled;
    return this;
  }

  public withMetrics(
    enabled: boolean = true,
    onUpdate?: (metrics: import('../utils/metrics').Metrics) => void
  ): this {
    this.config.enableMetrics = enabled;
    if (onUpdate) {
      this.config.onMetricsUpdate = onUpdate;
    }
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
