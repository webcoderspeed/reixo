import { RetryOptions } from '../types';
import { withRetry } from './retry';

export interface HTTPOptions extends RequestInit {
  retry?: RetryOptions | boolean;
  timeoutMs?: number;
  baseURL?: string;
  url?: string; // Add url here
  _retry?: boolean; // For tracking retries
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

export async function http<T = any>(
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
    const response = await fetchWithTimeout();
    
    // Auto-detect and parse JSON if Content-Type is application/json
    const contentType = response.headers.get('content-type');
    let data: any;
    
    if (contentType?.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    return {
      data,
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
    retryCondition: (error: unknown, attempt) => {
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

// Convenience methods
export const httpGet = <T = any>(url: string, options?: HTTPOptions) => 
  http<T>(url, { ...options, method: 'GET' });

export const httpPost = <T = any>(url: string, data?: any, options?: HTTPOptions) => 
  http<T>(url, { 
    ...options, 
    method: 'POST', 
    body: JSON.stringify(data),
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    }
  });

export const httpPut = <T = any>(url: string, data?: any, options?: HTTPOptions) => 
  http<T>(url, { 
    ...options, 
    method: 'PUT', 
    body: JSON.stringify(data),
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    }
  });

export const httpDelete = <T = any>(url: string, options?: HTTPOptions) => 
  http<T>(url, { ...options, method: 'DELETE' });