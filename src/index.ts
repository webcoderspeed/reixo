// Core public API - these are the main exports users should use
export type { GraphQLError, GraphQLResponse } from './core/graphql-client';
export { GraphQLClient } from './core/graphql-client';
export { HTTPBuilder, HTTPClient } from './core/http-client';
export { SSEClient } from './core/sse-client';
export { WebSocketClient } from './core/websocket-client';
export {
  AbortError,
  CircuitOpenError,
  HTTPError,
  NetworkError,
  TimeoutError,
  ValidationError,
} from './utils/http';

// Advanced utilities (exported but users might not need them directly)
export { createAuthInterceptor } from './utils/auth';
export { BatchProcessor } from './utils/batch';
export { CircuitBreaker, CircuitState } from './utils/circuit-breaker';
export { InfiniteQuery } from './utils/infinite-query';
export { poll, PollingController } from './utils/polling';
export { TaskQueue } from './utils/queue';

// Internal utilities (exported for advanced usage but not typically needed)
export { createBatchTransport } from './utils/batch-transport';
export { CacheManager, MemoryAdapter, WebStorageAdapter } from './utils/cache';
export { http } from './utils/http';
export type { ConsoleLoggerOptions } from './utils/logger';
export { ConsoleLogger, LogLevel } from './utils/logger';
export { MetricsCollector } from './utils/metrics';
export { MockAdapter } from './utils/mock-adapter';
export { NetworkMonitor } from './utils/network';
export type { PaginationOptions } from './utils/pagination';
export { paginate } from './utils/pagination';
export { AsyncPipeline, Pipeline } from './utils/pipeline';
export { RateLimiter } from './utils/rate-limiter';
export { NetworkRecorder } from './utils/recorder';
export { RetryError, withRetry } from './utils/retry';
export { createTraceInterceptor } from './utils/tracing';
// New next-gen utilities
export { err, mapResult, ok, toResult, unwrap, unwrapOr } from './types/result';
export { buildDedupKey, DEDUP_SAFE_METHODS, RequestDeduplicator } from './utils/dedup';
export {
  classifyNetworkError,
  isDnsError,
  isTimeoutError,
  isTransientNetworkError,
  TRANSIENT_NETWORK_CODES,
} from './utils/network-errors';
export { createOTelInterceptor, formatTraceparent, parseTraceparent } from './utils/otel';
export {
  detectRuntime,
  getRuntimeCapabilities,
  isBrowser,
  isEdgeRuntime,
  isNode,
} from './utils/runtime';
export { ResumableUploader } from './utils/upload';

// Reixo namespace for public API
import { GraphQLClient as _GraphQLClient } from './core/graphql-client';
import { HTTPBuilder as _HTTPBuilder, HTTPClient as _HTTPClient } from './core/http-client';
import { SSEClient as _SSEClient } from './core/sse-client';
import { WebSocketClient as _WebSocketClient } from './core/websocket-client';
import { createAuthInterceptor as _createAuthInterceptor } from './utils/auth';
import { BatchProcessor as _BatchProcessor } from './utils/batch';
import {
  CircuitBreaker as _CircuitBreaker,
  CircuitState as _CircuitState,
} from './utils/circuit-breaker';
import { HTTPError as _HTTPError } from './utils/http';
import { InfiniteQuery as _InfiniteQuery } from './utils/infinite-query';
import { poll as _poll } from './utils/polling';
import { TaskQueue as _TaskQueue } from './utils/queue';

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
  SSEClient: _SSEClient,
  poll: _poll,
  InfiniteQuery: _InfiniteQuery,
};

// Types
export type {
  BodyData,
  HTTPClientConfig,
  JsonArray,
  JsonObject,
  // Strict body / meta types
  JsonPrimitive,
  JsonValue,
  LogMeta,
  RequestInterceptor,
  ResponseInterceptor,
  // Re-export Result from http-client (used by tryGet/tryPost/etc. return types)
} from './core/http-client';
export type { SSEConfig, SSEEvents } from './core/sse-client';
export type { WebSocketConfig, WebSocketEvents } from './core/websocket-client';
export type { QueueOptions, QueueTask, RetryOptions, RetryResult } from './types';
export type { AuthConfig } from './utils/auth';
export type { BatchOptions } from './utils/batch';
export type { BatchRequestItem, BatchTransportConfig } from './utils/batch-transport';
export type { CacheEntry, CacheOptions, StorageAdapter } from './utils/cache';
export type { CircuitBreakerOptions } from './utils/circuit-breaker';
export type {
  CacheMetadata,
  HTTPMethod,
  HTTPOptions,
  HTTPResponse,
  ParamScalar,
  ParamsValue,
  ValidationSchema,
} from './utils/http';
export type { InfiniteData, InfiniteQueryOptions } from './utils/infinite-query';
export type { Metrics, RequestMetrics } from './utils/metrics';
export type { MockResponseData } from './utils/mock-adapter';
export type { TransformFn } from './utils/pipeline';
export type { PollingOptions } from './utils/polling';
export type { PersistentQueueOptions, QueueEvents } from './utils/queue';
export type { RecordedRequest } from './utils/recorder';
export type { TracingConfig } from './utils/tracing';
// New next-gen types
export type { Err, Ok, Result } from './types/result';
export type { DedupStats } from './utils/dedup';
export type { NetworkErrorClass } from './utils/network-errors';
export type { OTelConfig, OTelSpanHooks, SpanContext } from './utils/otel';
export type { RuntimeCapabilities, RuntimeName } from './utils/runtime';
// IntelliSense helper types — re-exported so users can annotate their own code
export type {
  HeadersRecord,
  HeadersWithSuggestions,
  KnownRequestHeader,
  MimeType,
} from './types/http-well-known';
