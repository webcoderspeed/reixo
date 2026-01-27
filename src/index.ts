// Core exports
export { withRetry } from './utils/retry';
export { http, httpGet, httpPost, httpPut, httpDelete, HTTPError } from './utils/http';
export { HTTPBuilder, HTTPClient } from './core/http-client';
export { TaskQueue } from './utils/queue';
export { BatchProcessor } from './utils/batch';
export { CircuitBreaker, CircuitState } from './utils/circuit-breaker';
export { createAuthRefreshInterceptor } from './utils/auth';

// Types
export type { RetryOptions, RetryResult, QueueOptions, QueueTask } from './types';
export type { HTTPOptions, HTTPResponse } from './utils/http';
export type { HTTPClientConfig, RequestInterceptor, ResponseInterceptor } from './core/http-client';
export type { BatchOptions } from './utils/batch';
export type { CircuitBreakerOptions } from './utils/circuit-breaker';
export type { AuthRefreshOptions } from './utils/auth';

// Import for main class
import { withRetry as _withRetry } from './utils/retry';
import { http as _http, httpGet as _httpGet, httpPost as _httpPost, httpPut as _httpPut, httpDelete as _httpDelete } from './utils/http';
import { HTTPBuilder as _HTTPBuilder } from './core/http-client';
import { TaskQueue as _TaskQueue } from './utils/queue';
import { BatchProcessor as _BatchProcessor } from './utils/batch';
import { CircuitBreaker as _CircuitBreaker } from './utils/circuit-breaker';
import { createAuthRefreshInterceptor as _createAuthRefreshInterceptor } from './utils/auth';

// Main library class
export class Reixo {
  static withRetry = _withRetry;
  static http = _http;
  static httpGet = _httpGet;
  static httpPost = _httpPost;
  static httpPut = _httpPut;
  static httpDelete = _httpDelete;
  static HTTPBuilder = _HTTPBuilder;
  static TaskQueue = _TaskQueue;
  static BatchProcessor = _BatchProcessor;
  static CircuitBreaker = _CircuitBreaker;
  static createAuthRefreshInterceptor = _createAuthRefreshInterceptor;
}

export default Reixo;