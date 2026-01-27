// Core exports
export { withRetry } from './utils/retry';
export { http, httpGet, httpPost, httpPut, httpDelete, HTTPError } from './utils/http';
export { HTTPBuilder, HTTPClient } from './core/http-client';

// Types
export type { RetryOptions, RetryResult, QueueOptions, QueueTask } from './types';
export type { HTTPOptions, HTTPResponse } from './utils/http';
export type { HTTPClientConfig } from './core/http-client';

// Import for main class
import { withRetry as _withRetry } from './utils/retry';
import { http as _http, httpGet as _httpGet, httpPost as _httpPost, httpPut as _httpPut, httpDelete as _httpDelete } from './utils/http';
import { HTTPBuilder as _HTTPBuilder } from './core/http-client';

// Main library class
export class Reixo {
  static withRetry = _withRetry;
  static http = _http;
  static httpGet = _httpGet;
  static httpPost = _httpPost;
  static httpPut = _httpPut;
  static httpDelete = _httpDelete;
  static HTTPBuilder = _HTTPBuilder;
}

export default Reixo;