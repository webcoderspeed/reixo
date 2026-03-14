import type { RetryOptions } from '../types';
import type { HeadersWithSuggestions } from '../types/http-well-known';
import type { CacheOptions } from './cache';
import { isTransientNetworkError } from './network-errors';
import { RetryError, withRetry } from './retry';

/**
 * All valid HTTP methods as a string-literal union.
 * Overrides `RequestInit['method']` (plain `string`) for strict typing.
 */
export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

/**
 * A scalar query-param value (string, number, or boolean).
 * Arrays of scalars are serialized as repeated keys: `tags=a&tags=b`.
 * Plain objects are serialized with bracket notation: `filter[status]=active`.
 */
export type ParamScalar = string | number | boolean;

/**
 * Supported shape for `HTTPOptions.params`.
 * Allows flat scalars, scalar arrays, and one level of nested objects.
 */
export type ParamsValue = Record<
  string,
  ParamScalar | ParamScalar[] | Record<string, ParamScalar | ParamScalar[]>
>;

/**
 * Options accepted by every request helper (`client.get()`, `client.post()`, etc.)
 * and the low-level `http()` function.
 *
 * Extends the browser-native `RequestInit` — the same shape that `fetch()` accepts —
 * while overriding `method` and `headers` with richer types that provide IDE
 * autocomplete without losing backwards compatibility.
 *
 * @example
 * await client.get<User[]>('/users', {
 *   headers: {
 *     Authorization: 'Bearer eyJhbGc…',
 *     Accept: 'application/json',
 *   },
 *   params: { role: 'admin', active: true },
 *   timeoutMs: 5000,
 * });
 */
export interface HTTPOptions extends Omit<RequestInit, 'method' | 'headers'> {
  /**
   * HTTP verb for the request.
   * @default 'GET'
   */
  method?: HTTPMethod;

  /**
   * Request headers. Accepts a `Headers` instance, an array of `[name, value]`
   * tuples, or a plain object. Common header names are suggested by IntelliSense.
   *
   * @example
   * headers: {
   *   'Authorization': 'Bearer <token>',
   *   'Content-Type': 'application/json',
   *   'Accept': 'application/json',
   *   'X-Request-ID': crypto.randomUUID(),
   * }
   */
  headers?: HeadersWithSuggestions;

  /**
   * Retry strategy. Pass `true` for sensible defaults (3 retries, exponential
   * back-off, only 5xx / 429 / 408), `false` to disable, or a `RetryOptions`
   * object to customise.
   * @default true
   */
  retry?: RetryOptions | boolean;

  /**
   * Per-request timeout in milliseconds. The request is aborted and an error
   * is thrown when this limit is exceeded.
   * @default 30000
   */
  timeoutMs?: number;

  /**
   * Base URL prepended to the request path. Trailing / leading slashes are
   * normalised automatically.
   * @example 'https://api.example.com/v1'
   */
  baseURL?: string;

  /** @internal Resolved request URL (set by the HTTP layer before interceptors run). */
  url?: string;

  /**
   * Query-string parameters appended to the URL.
   *
   * Supports flat values, arrays (repeated keys), and nested objects (bracket notation):
   * - `{ page: 2 }` → `?page=2`
   * - `{ tags: ['a','b'] }` → `?tags=a&tags=b`
   * - `{ filter: { status: 'active', date: '2026-01-01' } }` → `?filter[status]=active&filter[date]=2026-01-01`
   *
   * For custom serialization (e.g. comma-separated arrays), provide a {@link HTTPOptions.paramsSerializer}.
   *
   * @example
   * params: { page: 2, limit: 20, tags: ['news', 'tech'], filter: { active: true } }
   */
  params?: ParamsValue;

  /**
   * Custom query-string serializer. When provided, replaces the built-in serialization
   * with your own implementation. The function receives the `params` object and must
   * return a query string **without** the leading `?`.
   *
   * @example
   * // Comma-separated arrays instead of repeated keys
   * paramsSerializer: (p) => Object.entries(p)
   *   .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(',') : v}`)
   *   .join('&')
   */
  paramsSerializer?: (params: ParamsValue) => string;

  /**
   * Per-request cache configuration. Pass `true` to use the client's default
   * cache settings, `false` to bypass the cache for this request only, or a
   * `CacheOptions` object for full control.
   */
  cacheConfig?: CacheOptions | boolean;

  /** Node.js `http.Agent` / `https.Agent` for keep-alive and connection pooling. */
  agent?: unknown;

  /** @internal Marks a request as a retry attempt to prevent duplicate queuing. */
  _retry?: boolean;

  /**
   * How the response body should be parsed.
   * When omitted, the `Content-Type` header drives auto-detection
   * (`application/json` → JSON, everything else → text).
   */
  responseType?: 'json' | 'text' | 'stream' | 'blob' | 'arraybuffer';

  /**
   * Called periodically with download progress. Receives `loaded` bytes,
   * `total` bytes (or `null` if unknown), and a 0–100 `progress` percentage.
   */
  onDownloadProgress?: (progress: {
    loaded: number;
    total: number | null;
    progress: number | null;
  }) => void;

  /**
   * Called periodically with upload progress. Uses XHR under the hood in
   * browsers because the Fetch API does not expose upload progress natively.
   */
  onUploadProgress?: (progress: {
    loaded: number;
    total: number | null;
    progress: number | null;
  }) => void;

  /**
   * Zod schema (`.parse(data)`) or validation function applied to the parsed
   * response body. Throws a `ValidationError` on failure.
   *
   * @example
   * import { z } from 'zod';
   * const UserSchema = z.object({ id: z.number(), name: z.string() });
   * await client.get('/me', { validationSchema: UserSchema });
   */
  validationSchema?: ValidationSchema<unknown>;

  /**
   * When `true`, the request body is serialised as `multipart/form-data`
   * instead of JSON. Useful for file uploads with a plain-object payload.
   */
  useFormData?: boolean;

  /**
   * Priority hint for the offline task queue (higher = processed first).
   * Only relevant when `offlineQueue` is enabled on the client.
   * @default 0
   */
  taskPriority?: number;

  /**
   * When `true` (the default), identical in-flight GET/HEAD/OPTIONS requests
   * are collapsed — the same Promise is shared among all callers until the
   * first response settles, preventing thundering-herd duplicates.
   *
   * Set to `false` to bypass deduplication for this specific request (e.g.
   * when you intentionally need a fresh uncached result).
   *
   * Deduplication is only applied to safe, idempotent methods (GET, HEAD,
   * OPTIONS). POST/PUT/PATCH/DELETE are never deduplicated.
   *
   * @default true
   */
  deduplicate?: boolean;
}

export interface Interceptors {
  request: import('../core/http-client').RequestInterceptor[];
  response: import('../core/http-client').ResponseInterceptor[];
}

export type RetryConfig = RetryOptions | boolean;

export interface RateLimitConfig {
  requests: number;
  interval: number;
}

/**
 * Schema used to validate the parsed response body.
 *
 * Compatible with Zod schemas (`.parse(data)`) and plain validation functions.
 *
 * @example
 * // Zod
 * const schema = z.object({ id: z.number() });
 * // Plain function
 * const schema = (data: unknown) => { if (!data) throw new Error(); return data as MyType; };
 */
export type ValidationSchema<T> = { parse: (data: unknown) => T } | ((data: unknown) => T);

/**
 * Thrown when the server response body does not satisfy the `validationSchema`
 * provided in `HTTPOptions`.
 */
export class ValidationError extends Error {
  /** The raw (unvalidated) response body that failed validation. */
  public readonly data: unknown;
  /** The underlying schema / validation error. */
  public readonly originalError: unknown;

  constructor(message: string, data: unknown, originalError: unknown) {
    super(message);
    this.name = 'ValidationError';
    this.data = data;
    this.originalError = originalError;
  }
}

/**
 * Normalised HTTP response returned by every request method.
 *
 * @template T Type of the parsed response body.
 *
 * @example
 * const { data, status, headers } = await client.get<User>('/me');
 * if (status === 200) console.log(data.name);
 */
/**
 * Cache metadata attached to responses served from the cache layer.
 * Present only when a cached value was returned; `undefined` for live responses.
 *
 * @example
 * const res = await client.get('/api/users');
 * if (res.cacheMetadata?.hit) {
 *   console.log(`Served from cache, ${res.cacheMetadata.age}s old`);
 * }
 */
export interface CacheMetadata {
  /** `true` when the response was served from cache. Always `true` when present. */
  hit: boolean;
  /** Seconds elapsed since the response was cached. */
  age: number;
  /** Remaining TTL in seconds (0 if stale or expiry unknown). */
  ttl: number;
  /** The caching strategy that was active when this response was stored. */
  strategy: 'cache-first' | 'stale-while-revalidate' | 'network-first' | 'cache-only' | 'unknown';
}

export interface HTTPResponse<T> {
  /** Parsed response body. */
  data: T;
  /** HTTP status code (e.g. `200`, `404`). */
  status: number;
  /** HTTP status text (e.g. `'OK'`, `'Not Found'`). */
  statusText: string;
  /** Response headers as a native `Headers` instance. */
  headers: Headers;
  /** The original request options that produced this response. */
  config: HTTPOptions;
  /**
   * Cache metadata. Defined only when the response was served from the in-memory cache.
   * Useful for debugging cache behavior and displaying staleness indicators in the UI.
   */
  cacheMetadata?: CacheMetadata;
}

/** Minimal interface implemented by `HTTPClient` — useful for testing with mock clients. */
export interface IHTTPClient {
  get<T>(url: string, options?: HTTPOptions): Promise<HTTPResponse<T>>;
}

/**
 * Thrown when the network request itself fails before a response is received —
 * e.g. no internet connection, DNS failure, or CORS rejection at the network level.
 *
 * Distinct from {@link HTTPError} (which requires a response with a status code).
 *
 * @example
 * try {
 *   await client.get('/api/data');
 * } catch (err) {
 *   if (err instanceof NetworkError) {
 *     showOfflineBanner();
 *   }
 * }
 */
export class NetworkError extends Error {
  /** The original `fetch()` rejection reason, if available. */
  readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'NetworkError';
    this.cause = cause;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, NetworkError);
    }
  }
}

/**
 * Thrown when a request exceeds the configured `timeoutMs` before the server
 * responds. The in-flight fetch is aborted automatically.
 *
 * @example
 * try {
 *   await client.get('/slow-endpoint', { timeoutMs: 3000 });
 * } catch (err) {
 *   if (err instanceof TimeoutError) {
 *     console.warn(`Request timed out after ${err.timeoutMs}ms`);
 *   }
 * }
 */
export class TimeoutError extends Error {
  /** The timeout limit (in ms) that was exceeded. */
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TimeoutError);
    }
  }
}

/**
 * Thrown when a request is cancelled via an `AbortSignal` or by calling
 * `client.cancel()` / `client.cancelAll()`.
 *
 * @example
 * const controller = new AbortController();
 * setTimeout(() => controller.abort(), 2000);
 * try {
 *   await client.get('/api/data', { signal: controller.signal });
 * } catch (err) {
 *   if (err instanceof AbortError) {
 *     console.log('Request was cancelled');
 *   }
 * }
 */
export class AbortError extends Error {
  constructor(message = 'Request was aborted') {
    super(message);
    this.name = 'AbortError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AbortError);
    }
  }
}

/**
 * Thrown when a request is blocked because the {@link CircuitBreaker} is in the
 * OPEN state. Catching this lets you serve cached / fallback data immediately
 * instead of waiting for a guaranteed-to-fail network round-trip.
 *
 * @example
 * try {
 *   await client.get('/api/data');
 * } catch (err) {
 *   if (err instanceof CircuitOpenError) {
 *     return cachedData; // serve stale data while circuit recovers
 *   }
 * }
 */
export class CircuitOpenError extends Error {
  constructor(message = 'Circuit breaker is OPEN — request blocked') {
    super(message);
    this.name = 'CircuitOpenError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CircuitOpenError);
    }
  }
}

/**
 * Thrown for non-2xx responses and network-level failures.
 *
 * @example
 * try {
 *   await client.get('/protected');
 * } catch (err) {
 *   if (err instanceof HTTPError && err.status === 401) {
 *     console.log('Unauthorised');
 *   }
 * }
 */

export class HTTPError extends Error {
  public readonly status?: number;
  public readonly statusText?: string;
  public readonly config?: HTTPOptions;
  public readonly response?: Response;

  constructor(
    message: string,
    options?: {
      status?: number;
      statusText?: string;
      config?: HTTPOptions;
      response?: Response;
    }
  ) {
    super(message);
    this.name = 'HTTPError';
    this.status = options?.status;
    this.statusText = options?.statusText;
    this.config = options?.config;
    this.response = options?.response;
  }
}

/**
 * Default query-string serializer used when no `paramsSerializer` is provided.
 *
 * Handles three shapes:
 * - Scalar value  → `key=value`
 * - Array         → repeated keys: `key=a&key=b`
 * - Nested object → bracket notation: `key[subKey]=value`
 */
function serializeParams(params: ParamsValue): string {
  return Object.entries(params)
    .flatMap(([key, value]) => {
      const encodedKey = encodeURIComponent(key);
      if (Array.isArray(value)) {
        // Scalar array → repeated keys
        return value.map((v) => `${encodedKey}=${encodeURIComponent(String(v))}`);
      }
      if (value !== null && typeof value === 'object') {
        // Nested object → bracket notation
        return Object.entries(value).flatMap(([subKey, subValue]) => {
          const encodedSubKey = `${encodedKey}%5B${encodeURIComponent(subKey)}%5D`;
          if (Array.isArray(subValue)) {
            return subValue.map((v) => `${encodedSubKey}=${encodeURIComponent(String(v))}`);
          }
          return [`${encodedSubKey}=${encodeURIComponent(String(subValue))}`];
        });
      }
      // Scalar
      return [`${encodedKey}=${encodeURIComponent(String(value))}`];
    })
    .join('&');
}

export async function http<T = unknown>(
  url: string,
  options: HTTPOptions = {}
): Promise<HTTPResponse<T>> {
  options.url = url; // Capture URL in options for interceptors/errors

  const {
    retry = true,
    timeoutMs = 30000,
    baseURL,
    params,
    paramsSerializer,
    ...requestInit
  } = options;

  // Normalize slashes: strip trailing slash from baseURL and leading slash from url
  // to prevent "https://api.example.comusers" type bugs when baseURL has no trailing slash
  const baseUrlWithUrl = baseURL ? `${baseURL.replace(/\/$/, '')}/${url.replace(/^\//, '')}` : url;

  // Serialize query params into a query string.
  // Supports: flat scalars, arrays (repeated keys), nested objects (bracket notation),
  // and custom serializers via `paramsSerializer`.
  //
  // Examples:
  //   { page: 2 }                       → "page=2"
  //   { tags: ['a','b'] }               → "tags=a&tags=b"
  //   { filter: { status: 'active' } }  → "filter[status]=active"
  let query = '';
  if (params) {
    query = paramsSerializer ? paramsSerializer(params) : serializeParams(params);
  }

  const separator = baseUrlWithUrl.includes('?') ? '&' : '?';
  const fullUrl = params ? `${baseUrlWithUrl}${separator}${query}` : baseUrlWithUrl;

  const fetchWithTimeout = async (): Promise<Response> => {
    const controller = new AbortController();
    // Use a typed TimeoutError as the abort reason so callers can distinguish
    // timeouts from explicit cancellations
    const timeoutId = setTimeout(() => controller.abort(new TimeoutError(timeoutMs)), timeoutMs);

    // If an outer AbortSignal was provided (e.g. from HTTPClient.dispose()),
    // link it so aborting the outer signal also aborts this fetch.
    const outerSignal = requestInit.signal;
    if (outerSignal) {
      if (outerSignal.aborted) {
        clearTimeout(timeoutId);
        controller.abort(outerSignal.reason);
      } else {
        const onAbort = () => {
          clearTimeout(timeoutId);
          controller.abort(outerSignal.reason);
        };
        outerSignal.addEventListener('abort', onAbort, { once: true });
        // Clean up the listener after the fetch completes
        controller.signal.addEventListener(
          'abort',
          () => outerSignal.removeEventListener('abort', onAbort),
          { once: true }
        );
      }
    }

    try {
      const response = await fetch(fullUrl, {
        ...requestInit,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new HTTPError(`HTTP Error: ${response.status} ${response.statusText}`, {
          status: response.status,
          statusText: response.statusText,
          config: options,
          response: response,
        });
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      // Re-throw typed errors as-is
      if (
        error instanceof HTTPError ||
        error instanceof TimeoutError ||
        error instanceof AbortError ||
        error instanceof NetworkError
      ) {
        throw error;
      }

      // Classify the raw DOMException / Error thrown by fetch()
      if (error instanceof Error && error.name === 'AbortError') {
        // Determine whether this was a timeout or a user-initiated abort
        const reason = controller.signal.reason;
        if (reason instanceof TimeoutError) {
          throw reason;
        }
        throw new AbortError(error.message || undefined);
      }

      // Everything else that causes fetch() to reject is a network failure
      throw new NetworkError(
        error instanceof Error ? error.message : 'Network request failed',
        error instanceof Error ? error : undefined
      );
    }
  };

  const executeRequest = async (): Promise<HTTPResponse<T>> => {
    // Use XHR if upload progress is requested and XHR is available (Browser)
    if (options.onUploadProgress && typeof XMLHttpRequest !== 'undefined') {
      return xhrRequest<T>(fullUrl, options);
    }

    const response = await fetchWithTimeout();
    const contentType = response.headers.get('content-type');
    const responseType = options.responseType;

    const data = await (async (): Promise<unknown> => {
      if (responseType === 'stream') {
        if (options.onDownloadProgress && response.body && typeof TransformStream !== 'undefined') {
          // Wrap stream for progress without buffering
          const contentLength = response.headers.get('Content-Length');
          const total = contentLength ? Number.parseInt(contentLength, 10) : null;
          let loaded = 0;

          const transformStream = new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
              loaded += chunk.length;
              if (options.onDownloadProgress) {
                const progress = total ? Math.round((loaded / total) * 100) : null;
                options.onDownloadProgress({ loaded, total, progress });
              }
              controller.enqueue(chunk);
            },
          });

          return (response.body as ReadableStream<Uint8Array>).pipeThrough(transformStream);
        } else {
          return response.body;
        }
      } else {
        // Non-stream response types (json, text, blob, arraybuffer)
        if (options.onDownloadProgress && response.body && 'getReader' in response.body) {
          // Handle download progress with buffering
          const reader = (response.body as ReadableStream<Uint8Array>).getReader();
          const contentLength = response.headers.get('Content-Length');
          const total = contentLength ? Number.parseInt(contentLength, 10) : null;
          let loaded = 0;
          const chunks: Uint8Array[] = [];

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              chunks.push(value);
              loaded += value.length;
              if (options.onDownloadProgress) {
                const progress = total ? Math.round((loaded / total) * 100) : null;
                options.onDownloadProgress({ loaded, total, progress });
              }
            }
          }

          // Combine chunks
          const allChunks = new Uint8Array(loaded);
          let position = 0;
          for (const chunk of chunks) {
            allChunks.set(chunk, position);
            position += chunk.length;
          }

          // Convert to requested type
          if (responseType === 'arraybuffer') {
            return allChunks.buffer;
          } else if (responseType === 'blob') {
            return new Blob([allChunks], { type: contentType || undefined });
          } else {
            // Default to text/json
            const text = new TextDecoder('utf-8').decode(allChunks);
            if (
              responseType === 'json' ||
              (!responseType && contentType?.includes('application/json'))
            ) {
              try {
                return JSON.parse(text);
              } catch {
                return text;
              }
            } else {
              return text;
            }
          }
        } else {
          // No progress tracking needed, use native methods
          if (responseType === 'arraybuffer') {
            return response.arrayBuffer();
          } else if (responseType === 'blob') {
            return response.blob();
          } else if (responseType === 'json') {
            return response.json();
          } else if (responseType === 'text') {
            return response.text();
          } else {
            // Default auto-detection
            if (contentType?.includes('application/json')) {
              return response.json();
            } else {
              return response.text();
            }
          }
        }
      }
    })();

    return {
      data: data as T,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      config: options,
    };
  };

  if (retry === false) {
    return executeRequest();
  }

  const retryOptions = typeof retry === 'boolean' ? {} : retry;

  try {
    const result = await withRetry(executeRequest, {
      ...retryOptions,
      retryCondition: (error: unknown, _attempt) => {
        // Never retry intentional cancellations
        if (error instanceof Error && error.name === 'AbortError') return false;

        // Never retry client auth errors — token refresh handles those separately
        if (error instanceof HTTPError && (error.status === 401 || error.status === 403)) {
          return false;
        }

        // Retry HTTP errors: 5xx server errors, 429 (rate-limited), 408 (request timeout)
        if (error instanceof HTTPError && error.status !== undefined) {
          return error.status >= 500 || error.status === 429 || error.status === 408;
        }

        // Reixo's own NetworkError always represents a transport-level failure — retry it
        if (error instanceof NetworkError) return true;

        // Retry transient network-level failures (ETIMEDOUT, ECONNRESET, DNS, etc.)
        // Works across Node.js, Bun, Deno, Cloudflare Workers, and browsers
        return isTransientNetworkError(error);
      },
    });

    return result.result;
  } catch (error) {
    // Unwrap RetryError so HTTPClient callers always see the original error
    // type (e.g. HTTPError). Users who call withRetry() directly still get the
    // full RetryError with its attempts/durationMs metadata.
    if (error instanceof RetryError) {
      throw error.cause;
    }
    throw error;
  }
}

// Helper for XHR requests (supports upload progress)
async function xhrRequest<T>(url: string, options: HTTPOptions): Promise<HTTPResponse<T>> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(options.method || 'GET', url);

    if (options.headers) {
      if (typeof Headers !== 'undefined' && options.headers instanceof Headers) {
        for (const [key, value] of options.headers.entries()) xhr.setRequestHeader(key, value);
      } else if (Array.isArray(options.headers)) {
        for (const [key, value] of options.headers) xhr.setRequestHeader(key, value);
      } else {
        for (const [key, value] of Object.entries(options.headers))
          xhr.setRequestHeader(key, value as string);
      }
    }

    if (options.timeoutMs) {
      xhr.timeout = options.timeoutMs;
    }

    if (options.onUploadProgress && xhr.upload) {
      xhr.upload.onprogress = (event) => {
        const total = event.lengthComputable ? event.total : null;
        const progress = total ? Math.round((event.loaded / total) * 100) : null;
        options.onUploadProgress!({ loaded: event.loaded, total, progress });
      };
    }

    xhr.onload = () => {
      const responseHeaders = (() => {
        if (typeof Headers !== 'undefined') {
          const headers = new Headers();
          const headerLines = xhr
            .getAllResponseHeaders()
            .trim()
            .split(/[\r\n]+/);
          for (const line of headerLines) {
            const parts = line.split(': ');
            const key = parts.shift();
            const value = parts.join(': ');
            if (key) headers.append(key, value);
          }
          return headers;
        } else {
          // Headers API unavailable (very old environments).
          // Build a plain object with lowercased keys — structurally close enough
          // for callers that iterate entries, while avoiding a broken Map cast.
          const raw: Record<string, string> = {};
          for (const line of xhr
            .getAllResponseHeaders()
            .trim()
            .split(/[\r\n]+/)) {
            const colonIdx = line.indexOf(': ');
            if (colonIdx > -1) {
              raw[line.slice(0, colonIdx).toLowerCase()] = line.slice(colonIdx + 2);
            }
          }
          return raw as unknown as Headers;
        }
      })();

      const data = (() => {
        const rawData = xhr.response;
        try {
          if (
            rawData &&
            typeof rawData === 'string' &&
            xhr.getResponseHeader('content-type')?.includes('application/json')
          ) {
            return JSON.parse(rawData);
          }
        } catch {
          // Ignore
        }
        return rawData;
      })();

      const response: HTTPResponse<T> = {
        data: data as T,
        status: xhr.status,
        statusText: xhr.statusText,
        headers: responseHeaders,
        config: options,
      };

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(response);
      } else {
        reject(
          new HTTPError(`HTTP Error: ${xhr.status} ${xhr.statusText}`, {
            status: xhr.status,
            statusText: xhr.statusText,
            config: options,
          })
        );
      }
    };

    xhr.onerror = () => reject(new TypeError('Network request failed'));
    xhr.ontimeout = () => reject(new Error('Request timed out'));

    xhr.send(options.body as Document | XMLHttpRequestBodyInit | null | undefined);
  });
}
