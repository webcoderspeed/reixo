import { RetryOptions } from '../types';
import { withRetry } from './retry';

export interface HTTPOptions extends RequestInit {
  retry?: RetryOptions | boolean;
  timeoutMs?: number;
  baseURL?: string;
  url?: string; // Add url here
  _retry?: boolean; // For tracking retries
  onDownloadProgress?: (progress: { loaded: number; total: number | null; progress: number | null }) => void;
  onUploadProgress?: (progress: { loaded: number; total: number | null; progress: number | null }) => void;
}

export interface HTTPResponse<T> {
  data: T;
  status: number;
  statusText: string;
  headers: Headers;
  config: HTTPOptions;
}

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

export async function http<T = unknown>(
  url: string,
  options: HTTPOptions = {}
): Promise<HTTPResponse<T>> {
  options.url = url; // Capture URL in options for interceptors/errors

  const {
    retry = true,
    timeoutMs = 30000,
    baseURL,
    ...requestInit
  } = options;

  const fullUrl = baseURL ? `${baseURL}${url}` : url;

  const fetchWithTimeout = async (): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(fullUrl, {
        ...requestInit,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new HTTPError(
          `HTTP Error: ${response.status} ${response.statusText}`,
          {
            status: response.status,
            statusText: response.statusText,
            config: options,
            response: response
          }
        );
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  };

  const executeRequest = async (): Promise<HTTPResponse<T>> => {
    // Use XHR if upload progress is requested and XHR is available (Browser)
    if (options.onUploadProgress && typeof XMLHttpRequest !== 'undefined') {
      return xhrRequest<T>(fullUrl, options);
    }

    const response = await fetchWithTimeout();
    
    // Auto-detect and parse JSON if Content-Type is application/json
    const contentType = response.headers.get('content-type');
    let data: unknown;
    
    if (options.onDownloadProgress && response.body && 'getReader' in response.body) {
      // Handle download progress for environments supporting Web Streams (Browser / Node 18+)
      const reader = (response.body as ReadableStream<Uint8Array>).getReader();
      const contentLength = response.headers.get('Content-Length');
      const total = contentLength ? parseInt(contentLength, 10) : null;
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
      
      const text = new TextDecoder('utf-8').decode(allChunks);
      
      if (contentType?.includes('application/json')) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      } else {
        data = text;
      }
    } else {
      // Standard handling
      if (contentType?.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }
    }

    return {
      data: data as T,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      config: options
    };
  };

  if (retry === false) {
    return executeRequest();
  }

  const retryOptions = typeof retry === 'boolean' ? {} : retry;
  
  const result = await withRetry(executeRequest, {
    ...retryOptions,
    retryCondition: (error: unknown, _attempt) => {
      // Default retry condition: retry on network errors or 5xx status codes
      if (error instanceof Error && error.name === 'AbortError') {
        return false; // Don't retry timeouts
      }
      
      if (error instanceof HTTPError && error.status !== undefined) {
        // Retry on server errors (5xx) and some client errors (429, 408)
        return error.status >= 500 || 
               error.status === 429 || // Too Many Requests
               error.status === 408;   // Request Timeout
      }
      
      // Retry on network errors
      return true;
    }
  });

  return result.result;
}

// Helper for XHR requests (supports upload progress)
async function xhrRequest<T>(url: string, options: HTTPOptions): Promise<HTTPResponse<T>> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(options.method || 'GET', url);

    if (options.headers) {
      if (typeof Headers !== 'undefined' && options.headers instanceof Headers) {
        options.headers.forEach((value, key) => xhr.setRequestHeader(key, value));
      } else if (Array.isArray(options.headers)) {
        options.headers.forEach(([key, value]) => xhr.setRequestHeader(key, value));
      } else {
        Object.entries(options.headers).forEach(([key, value]) => xhr.setRequestHeader(key, value as string));
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
      let responseHeaders: Headers;
      if (typeof Headers !== 'undefined') {
         responseHeaders = new Headers();
         const headerLines = xhr.getAllResponseHeaders().trim().split(/[\r\n]+/);
         headerLines.forEach(line => {
           const parts = line.split(': ');
           const key = parts.shift();
           const value = parts.join(': ');
           if (key) responseHeaders.append(key, value);
         });
      } else {
          // Fallback if Headers is not available
          responseHeaders = new Map() as unknown as Headers; 
      }

      let data: unknown = xhr.response;
      try {
        if (data && typeof data === 'string' && xhr.getResponseHeader('content-type')?.includes('application/json')) {
          data = JSON.parse(data);
        }
      } catch {
        // Ignore
      }

      const response: HTTPResponse<T> = {
        data: data as T,
        status: xhr.status,
        statusText: xhr.statusText,
        headers: responseHeaders,
        config: options
      };

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(response);
      } else {
        reject(new HTTPError(`HTTP Error: ${xhr.status} ${xhr.statusText}`, {
          status: xhr.status,
          statusText: xhr.statusText,
          config: options
        }));
      }
    };

    xhr.onerror = () => reject(new TypeError('Network request failed'));
    xhr.ontimeout = () => reject(new Error('Request timed out'));

    xhr.send(options.body as Document | XMLHttpRequestBodyInit | null | undefined);
  });
}
