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
export { createAuthInterceptor } from './utils/auth';
export {
  StaticResolver,
  RoundRobinResolver,
  createServiceDiscoveryInterceptor,
} from './utils/service-discovery';
export { createBatchTransport } from './utils/batch-transport';
export { clientCredentialsFlow, refreshTokenFlow } from './utils/oauth';
export {
  checkBrowserCapabilities,
  getMissingPolyfills,
  ensureBrowserCompatibility,
} from './utils/browser';
export { paginate } from './utils/pagination';

// Types
export type { RetryOptions, RetryResult, QueueOptions, QueueTask } from './types';
export type { HTTPOptions, HTTPResponse } from './utils/http';
export type { HTTPClientConfig, RequestInterceptor, ResponseInterceptor } from './core/http-client';
export type { BatchOptions } from './utils/batch';
export type { CircuitBreakerOptions } from './utils/circuit-breaker';
export type { AuthConfig } from './utils/auth';
export type { ServiceResolver } from './utils/service-discovery';
export type { BatchTransportConfig, BatchRequestItem } from './utils/batch-transport';
export type { TokenResponse, OAuth2Config } from './utils/oauth';
export type { BrowserCapabilities } from './utils/browser';

// Import for main class
import { withRetry as _withRetry } from './utils/retry';
import { http as _http, HTTPError as _HTTPError } from './utils/http';
import { HTTPBuilder as _HTTPBuilder } from './core/http-client';
import { GraphQLClient as _GraphQLClient } from './core/graphql-client';
import { MockAdapter as _MockAdapter } from './utils/mock-adapter';
import { ConsoleLogger as _ConsoleLogger, LogLevel as _LogLevel } from './utils/logger';
import { TaskQueue as _TaskQueue } from './utils/queue';
import { NetworkMonitor as _NetworkMonitor } from './utils/network';
import { BatchProcessor as _BatchProcessor } from './utils/batch';
import { CircuitBreaker as _CircuitBreaker } from './utils/circuit-breaker';
import { createAuthInterceptor as _createAuthInterceptor } from './utils/auth';
import {
  StaticResolver as _StaticResolver,
  RoundRobinResolver as _RoundRobinResolver,
  createServiceDiscoveryInterceptor as _createServiceDiscoveryInterceptor,
} from './utils/service-discovery';
import { createBatchTransport as _createBatchTransport } from './utils/batch-transport';
import {
  clientCredentialsFlow as _clientCredentialsFlow,
  refreshTokenFlow as _refreshTokenFlow,
} from './utils/oauth';
import { debounce as _debounce, throttle as _throttle, delay as _delay } from './utils/timing';
import {
  checkBrowserCapabilities as _checkBrowserCapabilities,
  ensureBrowserCompatibility as _ensureBrowserCompatibility,
} from './utils/browser';
import { paginate as _paginate } from './utils/pagination';

// Main library class
export class Reixo {
  static withRetry = _withRetry;
  static http = _http;
  static HTTPError = _HTTPError;
  static HTTPBuilder = _HTTPBuilder;
  static GraphQLClient = _GraphQLClient;
  static MockAdapter = _MockAdapter;
  static ConsoleLogger = _ConsoleLogger;
  static LogLevel = _LogLevel;
  static TaskQueue = _TaskQueue;
  static NetworkMonitor = _NetworkMonitor;
  static BatchProcessor = _BatchProcessor;
  static CircuitBreaker = _CircuitBreaker;
  static createAuthInterceptor = _createAuthInterceptor;
  static StaticResolver = _StaticResolver;
  static RoundRobinResolver = _RoundRobinResolver;
  static createServiceDiscoveryInterceptor = _createServiceDiscoveryInterceptor;
  static createBatchTransport = _createBatchTransport;
  static clientCredentialsFlow = _clientCredentialsFlow;
  static refreshTokenFlow = _refreshTokenFlow;
  static debounce = _debounce;
  static throttle = _throttle;
  static delay = _delay;
  static checkBrowserCapabilities = _checkBrowserCapabilities;
  static ensureBrowserCompatibility = _ensureBrowserCompatibility;
  static paginate = _paginate;
}

export default Reixo;
