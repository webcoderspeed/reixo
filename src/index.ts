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
export { createBatchTransport } from './utils/batch-transport';
export { paginate } from './utils/pagination';

// Reixo namespace for public API
import { HTTPBuilder as _HTTPBuilder, HTTPClient as _HTTPClient } from './core/http-client';
import { TaskQueue as _TaskQueue } from './utils/queue';
import {
  CircuitBreaker as _CircuitBreaker,
  CircuitState as _CircuitState,
} from './utils/circuit-breaker';
import { BatchProcessor as _BatchProcessor } from './utils/batch';
import { createAuthInterceptor as _createAuthInterceptor } from './utils/auth';
import { createBatchTransport as _createBatchTransport } from './utils/batch-transport';
import { paginate as _paginate } from './utils/pagination';
import { withRetry as _withRetry } from './utils/retry';
import { http as _http, HTTPError as _HTTPError } from './utils/http';
import { GraphQLClient as _GraphQLClient } from './core/graphql-client';
import { MockAdapter as _MockAdapter } from './utils/mock-adapter';
import { ConsoleLogger as _ConsoleLogger, LogLevel as _LogLevel } from './utils/logger';
import { NetworkMonitor as _NetworkMonitor } from './utils/network';

export const Reixo = {
  HTTPBuilder: _HTTPBuilder,
  HTTPClient: _HTTPClient,
  TaskQueue: _TaskQueue,
  CircuitBreaker: _CircuitBreaker,
  CircuitState: _CircuitState,
  BatchProcessor: _BatchProcessor,
  createAuthInterceptor: _createAuthInterceptor,
  createBatchTransport: _createBatchTransport,
  paginate: _paginate,
  withRetry: _withRetry,
  http: _http,
  HTTPError: _HTTPError,
  GraphQLClient: _GraphQLClient,

  MockAdapter: _MockAdapter,
  ConsoleLogger: _ConsoleLogger,
  LogLevel: _LogLevel,
  NetworkMonitor: _NetworkMonitor,
};

// Types
export type { RetryOptions, RetryResult, QueueOptions, QueueTask } from './types';
export type { HTTPOptions, HTTPResponse } from './utils/http';
export type { HTTPClientConfig, RequestInterceptor, ResponseInterceptor } from './core/http-client';
export type { BatchOptions } from './utils/batch';
export type { CircuitBreakerOptions } from './utils/circuit-breaker';
export type { AuthConfig } from './utils/auth';
export type { BatchTransportConfig, BatchRequestItem } from './utils/batch-transport';
