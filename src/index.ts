// Core public API - these are the main exports users should use
export { HTTPBuilder, HTTPClient } from './core/http-client';
export { HTTPError } from './utils/http';
export { GraphQLClient, GraphQLError, GraphQLResponse } from './core/graphql-client';
export { WebSocketClient } from './core/websocket-client';

// Advanced utilities (exported but users might not need them directly)
export { TaskQueue } from './utils/queue';
export { CircuitBreaker, CircuitState } from './utils/circuit-breaker';
export { createAuthInterceptor } from './utils/auth';
export { BatchProcessor } from './utils/batch';

// Internal utilities (exported for advanced usage but not typically needed)
export { withRetry } from './utils/retry';
export { http } from './utils/http';
export { MockAdapter } from './utils/mock-adapter';
export { ConsoleLogger, LogLevel } from './utils/logger';
export { NetworkMonitor } from './utils/network';
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
import { HTTPError as _HTTPError } from './utils/http';
import { GraphQLClient as _GraphQLClient } from './core/graphql-client';
import { WebSocketClient as _WebSocketClient } from './core/websocket-client';

export const Reixo = {
  HTTPBuilder: _HTTPBuilder,
  HTTPClient: _HTTPClient,
  TaskQueue: _TaskQueue,
  CircuitBreaker: _CircuitBreaker,
  CircuitState: _CircuitState,
  BatchProcessor: _BatchProcessor,
  createAuthInterceptor: _createAuthInterceptor,
  HTTPError: _HTTPError,
  GraphQLClient: _GraphQLClient,
  WebSocketClient: _WebSocketClient,
};

// Types
export type { RetryOptions, RetryResult, QueueOptions, QueueTask } from './types';
export type { HTTPOptions, HTTPResponse } from './utils/http';
export type { HTTPClientConfig, RequestInterceptor, ResponseInterceptor } from './core/http-client';
export type { BatchOptions } from './utils/batch';
export type { CircuitBreakerOptions } from './utils/circuit-breaker';
export type { AuthConfig } from './utils/auth';
export type { BatchTransportConfig, BatchRequestItem } from './utils/batch-transport';
export type { WebSocketConfig, WebSocketEvents } from './core/websocket-client';
