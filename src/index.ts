// Core exports
export { withRetry } from './utils/retry';
export { http, HTTPError } from './utils/http';
export { HTTPBuilder, HTTPClient } from './core/http-client';
export { GraphQLClient, GraphQLError, GraphQLResponse } from './core/graphql-client';
export { MockAdapter } from './utils/mock-adapter';
export { ConsoleLogger, LogLevel } from './utils/logger';
export { TaskQueue } from './utils/queue';
export { NetworkMonitor } from './utils/network';
export { BatchProcessor } from './utils/batch';
export { CircuitBreaker, CircuitState } from './utils/circuit-breaker';
export { createAuthRefreshInterceptor } from './utils/auth';
export {
  checkBrowserCapabilities,
  getMissingPolyfills,
  ensureBrowserCompatibility,
} from './utils/browser';

// Types
export type { RetryOptions, RetryResult, QueueOptions, QueueTask } from './types';
export type { HTTPOptions, HTTPResponse } from './utils/http';
export type { HTTPClientConfig, RequestInterceptor, ResponseInterceptor } from './core/http-client';
export type { BatchOptions } from './utils/batch';
export type { CircuitBreakerOptions } from './utils/circuit-breaker';
export type { AuthRefreshOptions } from './utils/auth';
export type { BrowserCapabilities } from './utils/browser';

// Import for main class
import { withRetry as _withRetry } from './utils/retry';
import { http as _http } from './utils/http';
import { HTTPBuilder as _HTTPBuilder } from './core/http-client';
import { GraphQLClient as _GraphQLClient } from './core/graphql-client';
import { MockAdapter as _MockAdapter } from './utils/mock-adapter';
import { ConsoleLogger as _ConsoleLogger, LogLevel as _LogLevel } from './utils/logger';
import { TaskQueue as _TaskQueue } from './utils/queue';
import { NetworkMonitor as _NetworkMonitor } from './utils/network';
import { BatchProcessor as _BatchProcessor } from './utils/batch';
import { CircuitBreaker as _CircuitBreaker } from './utils/circuit-breaker';
import { createAuthRefreshInterceptor as _createAuthRefreshInterceptor } from './utils/auth';
import { debounce as _debounce, throttle as _throttle, delay as _delay } from './utils/timing';
import {
  checkBrowserCapabilities as _checkBrowserCapabilities,
  ensureBrowserCompatibility as _ensureBrowserCompatibility,
} from './utils/browser';

// Main library class
export class Reixo {
  static withRetry = _withRetry;
  static http = _http;
  static HTTPBuilder = _HTTPBuilder;
  static GraphQLClient = _GraphQLClient;
  static MockAdapter = _MockAdapter;
  static ConsoleLogger = _ConsoleLogger;
  static LogLevel = _LogLevel;
  static TaskQueue = _TaskQueue;
  static NetworkMonitor = _NetworkMonitor;
  static BatchProcessor = _BatchProcessor;
  static CircuitBreaker = _CircuitBreaker;
  static createAuthRefreshInterceptor = _createAuthRefreshInterceptor;
  static debounce = _debounce;
  static throttle = _throttle;
  static delay = _delay;
  static checkBrowserCapabilities = _checkBrowserCapabilities;
  static ensureBrowserCompatibility = _ensureBrowserCompatibility;
}

export default Reixo;
