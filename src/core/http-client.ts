import { RetryOptions } from '../types';
import {
  http,
  HTTPOptions,
  HTTPResponse,
  HTTPError,
  ValidationError,
  IHTTPClient,
} from '../utils/http';
import type { HeadersWithSuggestions } from '../types/http-well-known';
import { debounce, throttle, delay } from '../utils/timing';
import { EventEmitter } from '../utils/emitter';
import { ConnectionPool, ConnectionPoolOptions } from '../utils/connection';
import { RateLimiter } from '../utils/rate-limiter';
import { MetricsCollector } from '../utils/metrics';
import { CacheManager, CacheOptions } from '../utils/cache';
import { TaskQueue, PersistentQueueOptions } from '../utils/queue';
import { generateKey } from '../utils/keys';
import { objectToFormData } from '../utils/form-data';
import { InfiniteQuery, InfiniteQueryOptions } from '../utils/infinite-query';

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

/**
 * Configuration object passed to `new HTTPClient(config)` or `HTTPBuilder.create()`.
 *
 * Every option can be overridden per-request via `HTTPOptions`.
 *
 * @example
 * const client = new HTTPClient({
 *   baseURL: 'https://api.example.com/v1',
 *   timeoutMs: 10_000,
 *   headers: {
 *     Authorization: 'Bearer <token>',
 *     Accept: 'application/json',
 *   },
 *   retry: { maxRetries: 3, backoffFactor: 2 },
 * });
 */
export interface HTTPClientConfig {
  /**
   * Base URL prepended to every request path. Trailing / leading slashes are
   * normalised automatically.
   * @example 'https://api.example.com/v1'
   */
  baseURL?: string;

  /**
   * Default request timeout in milliseconds. Individual requests may override
   * this via `HTTPOptions.timeoutMs`.
   * @default 30000
   */
  timeoutMs?: number;

  /**
   * Default headers sent with every request. Common header names are suggested
   * by IntelliSense — any custom header is still accepted.
   *
   * @example
   * headers: {
   *   Authorization: 'Bearer <token>',
   *   'X-Api-Key': 'secret',
   *   Accept: 'application/json',
   * }
   */
  headers?: HeadersWithSuggestions;

  /**
   * Swap out the default `fetch`-based transport. Useful for testing with a
   * `MockAdapter` or for Node.js environments that require a custom agent.
   *
   * @example
   * const mock = new MockAdapter();
   * const client = new HTTPClient({ transport: mock.transport });
   */
  transport?: HTTPRequestFunction;

  /**
   * Custom logger. Implement `info`, `warn`, and `error` to route log output
   * to your preferred sink (e.g. Winston, Pino, Datadog).
   *
   * @example
   * import { ConsoleLogger, LogLevel } from 'reixo';
   * logger: new ConsoleLogger(LogLevel.DEBUG)
   */
  logger?: Logger;

  /**
   * Default retry strategy applied to all requests. Pass `true` for sensible
   * defaults (3 retries, exponential back-off, 5xx / 429 / 408 only), `false`
   * to disable retries globally, or a `RetryOptions` object to customise.
   * @default true
   */
  retry?: RetryOptions | boolean;

  /**
   * HTTP connection-pool settings (Node.js only).
   * Controls the maximum number of sockets and idle keep-alive timeouts.
   */
  pool?: ConnectionPoolOptions;

  /**
   * TLS/SSL options forwarded to the Node.js `https` module.
   * Has no effect in browser environments.
   */
  ssl?: {
    /** Reject servers with self-signed or untrusted certificates. @default true */
    rejectUnauthorized?: boolean;
    /** Custom CA certificate(s) in PEM format. */
    ca?: string | Buffer | Array<string | Buffer>;
    /** Client certificate in PEM format (mutual TLS). */
    cert?: string | Buffer | Array<string | Buffer>;
    /** Client private key in PEM format (mutual TLS). */
    key?: string | Buffer | Array<string | Buffer>;
    /** Passphrase for an encrypted private key. */
    passphrase?: string;
  };

  /**
   * Token-bucket rate limiter applied globally before every outgoing request.
   *
   * @example
   * rateLimit: { requests: 60, interval: 60_000 } // 60 req / min
   */
  rateLimit?: {
    /** Maximum number of requests allowed within `interval` milliseconds. */
    requests: number;
    /** Window duration in milliseconds. */
    interval: number;
  };

  /**
   * Per-URL-pattern retry overrides. The first matching pattern wins.
   * Useful when some endpoints need stricter (or more lenient) retry behaviour.
   *
   * @example
   * retryPolicies: [
   *   { pattern: /\/auth\//, retry: false },          // never retry auth
   *   { pattern: '/api/upload', retry: { maxRetries: 1 } },
   * ]
   */
  retryPolicies?: Array<{
    /** String prefix or RegExp matched against the full request URL. */
    pattern: string | RegExp;
    retry: RetryOptions | boolean;
  }>;

  /**
   * Response cache. Pass `true` to enable in-memory caching with defaults,
   * or a `CacheOptions` object for full control (TTL, strategy, storage
   * adapter, etc.).
   */
  cacheConfig?: CacheOptions | boolean;

  /**
   * Collect per-request timing, error-rate, and throughput metrics.
   * Access them via `client.getMetrics()` or the `onMetricsUpdate` callback.
   * @default false
   */
  enableMetrics?: boolean;

  /**
   * Buffer requests made while the device is offline and replay them once
   * connectivity is restored. Pass `true` for defaults or a
   * `PersistentQueueOptions` object to persist the queue across page reloads.
   * @default false
   */
  offlineQueue?: boolean | PersistentQueueOptions;

  /**
   * Deduplicate identical in-flight GET requests — concurrent calls to the same
   * URL + params share a single network request.
   * @default false
   */
  enableDeduplication?: boolean;

  /**
   * Called every time the internal metrics snapshot is updated. Useful for
   * forwarding metrics to an observability platform.
   *
   * @example
   * onMetricsUpdate: (m) => console.log(`Error rate: ${m.errorRate}%`)
   */
  onMetricsUpdate?: (metrics: import('../utils/metrics').Metrics) => void;

  /**
   * Global upload-progress callback (applies to all requests).
   * For per-request progress, use `HTTPOptions.onUploadProgress` instead.
   */
  onUploadProgress?: (progress: {
    loaded: number;
    total: number | null;
    progress: number | null;
  }) => void;

  /**
   * Global download-progress callback (applies to all requests).
   * For per-request progress, use `HTTPOptions.onDownloadProgress` instead.
   */
  onDownloadProgress?: (progress: {
    loaded: number;
    total: number | null;
    progress: number | null;
  }) => void;

  /**
   * API version string appended to every request, either as a URL segment
   * (`/v2/users`) or as a header, depending on `versioningStrategy`.
   * @example 'v2'
   */
  apiVersion?: string;

  /**
   * How `apiVersion` is included in requests.
   * - `'url'` — prepends the version as a path segment: `/v2/users`
   * - `'header'` — sends the version in a request header (see `versionHeader`)
   * @default 'url'
   */
  versioningStrategy?: 'header' | 'url';

  /**
   * Header name used when `versioningStrategy` is `'header'`.
   * @default 'Accept-Version'
   */
  versionHeader?: string;

  /**
   * Re-fetch stale cache entries when the browser tab regains focus
   * (similar to SWR / React Query behaviour).
   * @default false
   */
  revalidateOnFocus?: boolean;

  /**
   * Re-fetch stale cache entries when the device reconnects to the network.
   * @default false
   */
  revalidateOnReconnect?: boolean;
}

export type HTTPEvents = {
  'upload:progress': [
    { url: string; loaded: number; total: number | null; progress: number | null },
  ];
  'download:progress': [
    { url: string; loaded: number; total: number | null; progress: number | null },
  ];
  'request:start': [{ url: string; method: string; requestId: string }];
  'response:success': [
    { url: string; method: string; status: number; requestId: string; duration: number },
  ];
  'response:error': [
    { url: string; method: string; error: unknown; requestId: string; duration: number },
  ];
  'cache:revalidate': [{ url: string; key: string; data: unknown }];
  focus: [];
  online: [];
};

interface ActiveQuery {
  url: string;
  options: HTTPOptions;
  observers: Set<(data: unknown) => void>;
}

/**
 * Main HTTP Client class providing a fluent API for making HTTP requests.
 * Supports interceptors, retries, timeout, and progress tracking.
 */
export class HTTPClient extends EventEmitter<HTTPEvents> implements IHTTPClient {
  public interceptors = {
    request: [] as RequestInterceptor[],
    response: [] as ResponseInterceptor[],
  };

  private connectionPool?: ConnectionPool;
  private rateLimiter?: RateLimiter;
  private cacheManager?: CacheManager;
  private inFlightRequests = new Map<string, Promise<HTTPResponse<unknown>>>();
  /** Dedicated promise store for the Suspense read() method — prevents infinite re-fetch loops */
  private suspenseRequests = new Map<string, Promise<HTTPResponse<unknown>>>();
  private cleanupCallbacks: Array<() => void> = [];
  private abortControllers = new Map<string, AbortController>();
  private offlineQueue?: TaskQueue;
  private activeQueries = new Map<string, ActiveQuery>();
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
    // Cleanup all in-flight and suspense requests
    this.inFlightRequests.clear();
    this.suspenseRequests.clear();

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
      } catch {
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

        tasks.forEach((task) => {
          if (task.data && typeof task.data === 'object' && 'url' in task.data) {
            const { url, options } = task.data as { url: string; options: HTTPOptions };
            // Re-queue the task
            this.queueOfflineRequest(url, options, task.id).catch((err) => {
              this.config.logger?.error(`Failed to process restored task ${task.id}`, err);
            });
          }
        });
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

    const requestId = dedupeKey || crypto.randomUUID();

    return this.offlineQueue.add<HTTPResponse<T>>(() => this.request<T>(url, options), {
      id: requestId,
      priority: typeof options.taskPriority === 'number' ? options.taskPriority : 0,
      data: { url, options },
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

      if (this.config.revalidateOnFocus !== false) {
        const onFocus = () => {
          this.emit('focus');
          this.revalidateActiveQueries();
        };
        window.addEventListener('focus', onFocus);
        window.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') onFocus();
        });
        this.onCleanup(() => {
          window.removeEventListener('focus', onFocus);
        });
      }

      if (this.config.revalidateOnReconnect !== false) {
        const onOnline = () => {
          this.emit('online');
          this.revalidateActiveQueries();
        };
        window.addEventListener('online', onOnline);
        this.onCleanup(() => window.removeEventListener('online', onOnline));
      }

      // Register cleanup to remove these listeners
      this.onCleanup(() => {
        window.removeEventListener('beforeunload', cleanupOnUnload);
        window.removeEventListener('pagehide', cleanupOnUnload);
      });
    }
  }

  /**
   * Destroys the client and cleans up all resources.
   * Alias for dispose() — prefer dispose() for explicit resource management.
   * @deprecated Use dispose() instead for full cleanup.
   */
  public destroy(): void {
    this.dispose();
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
   * Subscribe to changes for a specific URL.
   * Returns an unsubscribe function.
   */
  public subscribe<T>(
    url: string,
    onChange: (data: T) => void,
    options: HTTPOptions = {}
  ): () => void {
    const cacheKey = this.cacheManager?.generateKey(url, options.params) || url;

    if (!this.activeQueries.has(cacheKey)) {
      this.activeQueries.set(cacheKey, {
        url,
        options,
        observers: new Set(),
      });
    }

    const query = this.activeQueries.get(cacheKey)!;
    query.observers.add(onChange as unknown as (data: unknown) => void);

    return () => {
      query.observers.delete(onChange as unknown as (data: unknown) => void);
      if (query.observers.size === 0) {
        this.activeQueries.delete(cacheKey);
      }
    };
  }

  /**
   * Revalidates all active queries (those with observers).
   */
  public async revalidateActiveQueries(): Promise<void> {
    const promises: Promise<unknown>[] = [];

    for (const query of this.activeQueries.values()) {
      // Force network request by setting strategy to network-only or just calling request
      // calling request will respect cache config, so we might need to override it if we want "fresh" data.
      // Usually "revalidate" means fetch fresh.
      const options = { ...query.options };
      if (options.cacheConfig && typeof options.cacheConfig === 'object') {
        options.cacheConfig.strategy = 'network-only';
      } else {
        // If no cache config, request() does network anyway.
        // But if it was cache-first, we need to bypass cache.
        options.cacheConfig = { strategy: 'network-only' };
      }

      promises.push(
        this.request(query.url, options).catch((err) => {
          this.config.logger?.warn(`Auto-revalidation failed for ${query.url}`, err);
        })
      );
    }

    await Promise.allSettled(promises);
  }

  /**
   * Manually set data in the cache.
   * Useful for optimistic updates.
   */
  public setQueryData<T>(
    url: string,
    data: T,
    params?: Record<string, string | number | boolean | Array<string | number | boolean>>
  ): void {
    if (!this.cacheManager) return;
    const key = this.cacheManager.generateKey(url, params);
    this.cacheManager.set(key, data);
    this.notifyObservers(key, data);
  }

  /**
   * Optimistically update the cache and optionally revalidate.
   */
  public async mutate<T>(
    url: string,
    data: T | ((oldData: T | undefined) => T),
    options: {
      revalidate?: boolean;
      params?: Record<string, string | number | boolean | Array<string | number | boolean>>;
    } = {}
  ): Promise<void> {
    if (!this.cacheManager) return;

    const key = this.cacheManager.generateKey(url, options.params);

    let newData: T;
    if (typeof data === 'function') {
      const oldData = this.getQueryData<T>(url, options.params) ?? undefined;
      newData = (data as (old: T | undefined) => T)(oldData);
    } else {
      newData = data;
    }

    this.setQueryData(url, newData, options.params);

    if (options.revalidate) {
      const reqOptions: HTTPOptions = { params: options.params };
      if (reqOptions.cacheConfig && typeof reqOptions.cacheConfig === 'object') {
        reqOptions.cacheConfig.strategy = 'network-only';
      } else {
        reqOptions.cacheConfig = { strategy: 'network-only' };
      }
      await this.request(url, reqOptions);
    }
  }

  /**
   * Get data from cache synchronously.
   */
  public getQueryData<T>(
    url: string,
    params?: Record<string, string | number | boolean | Array<string | number | boolean>>
  ): T | null {
    if (!this.cacheManager) return null;
    const key = this.cacheManager.generateKey(url, params);
    return this.cacheManager.get<T>(key);
  }

  /**
   * Suspense-ready read method.
   * Throws a promise if data is loading/missing.
   * Returns data if available.
   */
  public read<T>(url: string, options: HTTPOptions = {}): T {
    const key = this.cacheManager?.generateKey(url, options.params) || url;
    const cached = this.getQueryData<T>(url, options.params);

    if (cached) return cached;

    // Check the deduplication map first (populated when enableDeduplication is on)
    if (this.inFlightRequests.has(key)) {
      throw this.inFlightRequests.get(key);
    }

    // Check our dedicated Suspense promise store — this prevents infinite re-fetch
    // loops when deduplication is disabled, because each React render would otherwise
    // create a new Promise to throw, causing React to re-render and call read() again.
    if (this.suspenseRequests.has(key)) {
      throw this.suspenseRequests.get(key);
    }

    // Start request and store the promise so subsequent calls within the same render
    // cycle throw the same promise reference (React de-duplicates by reference).
    const promise = this.request<T>(url, options).finally(() => {
      this.suspenseRequests.delete(key);
    });

    this.suspenseRequests.set(key, promise as Promise<HTTPResponse<unknown>>);
    throw promise;
  }

  /**
   * Creates an InfiniteQuery instance for handling pagination/infinite scrolling.
   */
  public infiniteQuery<T>(
    url: string,
    options: Omit<InfiniteQueryOptions<T>, 'client' | 'url'>
  ): InfiniteQuery<T> {
    return new InfiniteQuery<T>({
      client: this,
      url,
      ...options,
    });
  }

  private notifyObservers(key: string, data: unknown) {
    const query = this.activeQueries.get(key);
    if (query) {
      query.observers.forEach((cb) => cb(data));
    }
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

    if (this.cacheManager) {
      const method = options.method || 'GET';
      const isCacheable = method.toUpperCase() === 'GET' && options.cacheConfig !== false;

      if (isCacheable) {
        const cacheKey = this.cacheManager.generateKey(url, options.params);

        let strategy = 'cache-first';
        const reqCacheConfig = options.cacheConfig as CacheOptions | undefined;
        const globalCacheConfig = this.config.cacheConfig as CacheOptions | undefined;

        if (reqCacheConfig?.strategy) {
          strategy = reqCacheConfig.strategy;
        } else if (globalCacheConfig?.strategy) {
          strategy = globalCacheConfig.strategy;
        }

        if (strategy === 'stale-while-revalidate') {
          const cachedEntry = this.cacheManager.getEntry<T>(cacheKey);
          if (cachedEntry) {
            // Background Revalidation
            this._executeRequest<T>(url, options)
              .then((response) => {
                this.emit('cache:revalidate', { url, key: cacheKey, data: response.data });
              })
              .catch((err) => {
                this.config.logger?.warn(`Background revalidation failed for ${url}`, err);
              });

            return {
              data: cachedEntry.data,
              status: 200,
              statusText: 'OK (Cached)',
              headers: new Headers(),
              config: { ...this.config, ...options, url },
            };
          }
        } else if (strategy === 'cache-first') {
          const cachedData = this.cacheManager.get<T>(cacheKey);
          if (cachedData) {
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
    }

    return this._executeRequest<T>(url, options);
  }

  /**
   * Prefetch a URL and cache the result.
   */
  public prefetch(url: string, options: HTTPOptions = {}): void {
    this.request(url, {
      ...options,
      cacheConfig: {
        ...(typeof options.cacheConfig === 'object' ? options.cacheConfig : {}),
        strategy: 'network-only',
      },
    }).catch(() => {});
  }

  private async _executeRequest<T>(url: string, options: HTTPOptions): Promise<HTTPResponse<T>> {
    const startTime = Date.now();

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
    const shouldDeduplicate =
      this.config.enableDeduplication && (options.method || 'GET').toUpperCase() === 'GET';

    const dedupeKey = shouldDeduplicate ? generateKey(url, options.params) : null;

    if (dedupeKey && this.inFlightRequests.has(dedupeKey)) {
      return this.inFlightRequests.get(dedupeKey) as Promise<HTTPResponse<T>>;
    }

    // Check if we're offline and should queue the request
    const shouldQueue = this.offlineQueue && this.offlineQueue.isQueuePaused;

    if (shouldQueue && this.offlineQueue) {
      return this.queueOfflineRequest<T>(url, options, dedupeKey || undefined);
    }

    const requestPromise = (async () => {
      // Create abort controller for this request
      const abortController = new AbortController();
      const requestId = crypto.randomUUID();
      this.abortControllers.set(requestId, abortController);

      this.emit('request:start', {
        url,
        method: options.method || 'GET',
        requestId,
      });

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
          ...(this.config.headers as Record<string, string> | undefined),
          ...(options.headers as Record<string, string> | undefined),
        } as HeadersWithSuggestions,
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

        this.emit('response:success', {
          url,
          method: mergedOptions.method || 'GET',
          status: response.status,
          requestId,
          duration: Date.now() - startTime,
        });

        if (this.cacheManager && response.status >= 200 && response.status < 300) {
          const method = mergedOptions.method || 'GET';
          if (method.toUpperCase() === 'GET' && mergedOptions.cacheConfig !== false) {
            const cacheKey = this.cacheManager.generateKey(url, mergedOptions.params);
            this.cacheManager.set(cacheKey, response.data);
            this.notifyObservers(cacheKey, response.data);
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

        this.emit('response:error', {
          url,
          method: mergedOptions.method || 'GET',
          error,
          requestId,
          duration: Date.now() - startTime,
        });

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
   * Shared body serialization for POST / PUT / PATCH requests.
   * Handles FormData (smart Content-Type removal) and JSON stringify.
   * Extracted to avoid triplicating the same logic across all mutation methods.
   */
  private _serializeBody(
    data: unknown,
    options?: HTTPOptions
  ): { body: BodyInit | undefined; headers: Record<string, string> } {
    let body: unknown = data;
    const headers: Record<string, string> = {
      ...((options?.headers as Record<string, string>) || {}),
    };

    // Auto-convert plain objects to FormData when useFormData: true
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
      // Let the browser set the correct multipart boundary automatically
      delete headers['Content-Type'];
    } else {
      if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
      body = data ? JSON.stringify(data) : undefined;
    }

    return { body: body as BodyInit | undefined, headers };
  }

  /**
   * GET request
   */
  public get<T>(url: string, options?: HTTPOptions): Promise<HTTPResponse<T>> {
    return this.request<T>(url, { ...options, method: 'GET' });
  }

  /**
   * HEAD request — useful for checking resource existence or reading headers without a body.
   */
  public head<T>(url: string, options?: HTTPOptions): Promise<HTTPResponse<T>> {
    return this.request<T>(url, { ...options, method: 'HEAD' });
  }

  /**
   * OPTIONS request — useful for CORS preflight checks and API capability discovery.
   */
  public options<T>(url: string, options?: HTTPOptions): Promise<HTTPResponse<T>> {
    return this.request<T>(url, { ...options, method: 'OPTIONS' });
  }

  /**
   * POST request
   */
  public post<T>(url: string, data?: unknown, options?: HTTPOptions): Promise<HTTPResponse<T>> {
    const { body, headers } = this._serializeBody(data, options);
    return this.request<T>(url, { ...options, method: 'POST', body, headers });
  }

  /**
   * PUT request
   */
  public put<T>(url: string, data?: unknown, options?: HTTPOptions): Promise<HTTPResponse<T>> {
    const { body, headers } = this._serializeBody(data, options);
    return this.request<T>(url, { ...options, method: 'PUT', body, headers });
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
    const { body, headers } = this._serializeBody(data, options);
    return this.request<T>(url, { ...options, method: 'PATCH', body, headers });
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
    (this.config.headers as Record<string, string>)[key] = value;
    return this;
  }

  public withHeaders(headers: Record<string, string>): this {
    this.config.headers = { ...(this.config.headers as Record<string, string>), ...headers };
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

  public withRevalidation(options: { focus?: boolean; reconnect?: boolean }): this {
    if (options.focus !== undefined) this.config.revalidateOnFocus = options.focus;
    if (options.reconnect !== undefined) this.config.revalidateOnReconnect = options.reconnect;
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
