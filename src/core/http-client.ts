import { RetryOptions } from '../types';
import { http, HTTPOptions, HTTPResponse } from '../utils/http';
import { debounce, throttle, delay } from '../utils/timing';
import { EventEmitter } from '../utils/emitter';

export interface RequestInterceptor {
  onFulfilled?: (config: HTTPOptions) => HTTPOptions | Promise<HTTPOptions>;
  onRejected?: (error: unknown) => unknown;
}

export interface ResponseInterceptor {
  onFulfilled?: (response: HTTPResponse<unknown>) => HTTPResponse<unknown> | Promise<HTTPResponse<unknown>>;
  onRejected?: (error: unknown) => unknown;
}

export interface HTTPClientConfig {
  baseURL?: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
  retry?: RetryOptions | boolean;
  onUploadProgress?: (progress: { loaded: number; total: number | null; progress: number | null }) => void;
  onDownloadProgress?: (progress: { loaded: number; total: number | null; progress: number | null }) => void;
}

export class HTTPClient extends EventEmitter {
  public interceptors = {
    request: [] as RequestInterceptor[],
    response: [] as ResponseInterceptor[],
  };

  // Timing utilities
  public static debounce = debounce;
  public static throttle = throttle;
  public static delay = delay;

  constructor(private readonly config: HTTPClientConfig) {
    super();
  }

  /**
   * Generic request method
   */
  public async request<T>(url: string, options: HTTPOptions = {}): Promise<HTTPResponse<T>> {
    let mergedOptions: HTTPOptions = {
      url,
      ...this.config,
      ...options,
      headers: {
        ...this.config.headers,
        ...options.headers,
      },
    };

    // Chain progress handlers to emit events
    const originalUpload = mergedOptions.onUploadProgress;
    mergedOptions.onUploadProgress = (progress) => {
      if (originalUpload) originalUpload(progress);
      this.emit('upload:progress', { url, ...progress });
    };

    const originalDownload = mergedOptions.onDownloadProgress;
    mergedOptions.onDownloadProgress = (progress) => {
      if (originalDownload) originalDownload(progress);
      this.emit('download:progress', { url, ...progress });
    };

    // Run request interceptors
    try {
      for (const interceptor of this.interceptors.request) {
        if (interceptor.onFulfilled) {
          mergedOptions = await interceptor.onFulfilled(mergedOptions);
        }
      }
    } catch (error) {
      // If a request interceptor fails, we might want to handle it or just throw
      // For now, let's allow onRejected to handle it if provided (though complexity increases)
      // Simplifying: just throw for now or loop through onRejected
      throw error;
    }

    try {
      let response = await http<T>(url, mergedOptions);

      // Run response interceptors
      for (const interceptor of this.interceptors.response) {
        if (interceptor.onFulfilled) {
          response = (await interceptor.onFulfilled(response as HTTPResponse<unknown>)) as HTTPResponse<T>;
        }
      }

      return response;
    } catch (error) {
      let currentError: unknown = error;
      // Run response interceptors (error case)
      for (const interceptor of this.interceptors.response) {
        if (interceptor.onRejected) {
          try {
            currentError = await interceptor.onRejected(currentError);
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

export class HTTPBuilder {
  private config: HTTPClientConfig = {};
  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];

  constructor(baseURL?: string) {
    if (baseURL) {
      this.config.baseURL = baseURL;
    }
  }

  public withBaseURL(baseURL: string): this {
    this.config.baseURL = baseURL;
    return this;
  }

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

  public withUploadProgress(callback: (progress: { loaded: number; total: number | null; progress: number | null }) => void): this {
    this.config.onUploadProgress = callback;
    return this;
  }

  public withDownloadProgress(callback: (progress: { loaded: number; total: number | null; progress: number | null }) => void): this {
    this.config.onDownloadProgress = callback;
    return this;
  }

  public addRequestInterceptor(onFulfilled?: (config: HTTPOptions) => HTTPOptions | Promise<HTTPOptions>, onRejected?: (error: unknown) => unknown): this {
    this.requestInterceptors.push({ onFulfilled, onRejected });
    return this;
  }

  public addResponseInterceptor(onFulfilled?: (response: HTTPResponse<unknown>) => HTTPResponse<unknown> | Promise<HTTPResponse<unknown>>, onRejected?: (error: unknown) => unknown): this {
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
