# Reixo 🚀

A modern, type-safe HTTP client library with built-in resilience patterns, advanced queue management, and enterprise-grade features for Node.js and browsers.

[![npm version](https://img.shields.io/npm/v/reixo)](https://www.npmjs.com/package/reixo)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-4.9%2B-blue)](https://www.typescriptlang.org/)
[![Test Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen)](https://github.com/your-username/reixo)

## ✨ Features

- **Builder Pattern** - Fluent, chainable configuration API
- **Automatic Retries** - Exponential backoff with custom policies
- **Task Queue** - Concurrency control, priority, and dependency management
- **Circuit Breaker** - Fault tolerance and graceful degradation
- **Progress Tracking** - Real-time upload/download progress with event emitters
- **Interceptor System** - Modify requests/responses at multiple points
- **Strict Typing** - Full TypeScript support with zero `any` types
- **Persistence** - Offline queue support with multiple storage adapters
- **Cross-Platform** - Works in Node.js and modern browsers
- **GraphQL Support** - First-class GraphQL client wrapper
- **Debugging Tools** - Comprehensive error handling and logging
- **Enterprise Ready** - Built-in Auth Refresh, SSR Forwarding, and Distributed Tracing
- **Developer Experience** - Network Recorder, Chaos Testing, and Runtime Validation

## 📦 Installation

```bash
npm install reixo
# or
yarn add reixo
# or
pnpm add reixo
```

## 🚀 Quick Start

### Basic Usage

```typescript
import { Reixo } from 'reixo';

// Create a configured client
const client = Reixo.HTTPBuilder.create('https://jsonplaceholder.typicode.com')
  .withTimeout(5000)
  .withHeader('Accept', 'application/json')
  .build();

// Make requests
const response = await client.get('/posts/1');
console.log(response.data);
```

### Advanced Configuration

```typescript
const client = Reixo.HTTPBuilder.create('https://api.example.com')
  .withRetry({
    maxRetries: 3,
    backoffFactor: 2,
    initialDelayMs: 500,
    retryCondition: (error) => error.status >= 500,
  })
  .withCircuitBreaker({
    failureThreshold: 3,
    resetTimeoutMs: 30000,
  })
  .withRateLimit({
    requestsPerSecond: 10,
    burstCapacity: 20,
  })
  .withCache({
    ttl: 60000, // 1 minute
    enabled: true,
  })
  .addRequestInterceptor((config) => {
    // Add auth token to all requests
    config.headers.set('Authorization', `Bearer ${getAuthToken()}`);
    return config;
  })
  .addResponseInterceptor((response) => {
    // Log successful responses
    console.log(`Request to ${response.config.url} succeeded`);
    return response;
  })
  .withDownloadProgress((progress) => {
    console.log(`Download: ${progress.progress}%`);
  })
  .withUploadProgress((progress) => {
    console.log(`Upload: ${progress.progress}%`);
  })
  .build();
```

## 🔧 Core Features

### HTTP Client

The main HTTP client supports all standard HTTP methods with full type safety:

```typescript
// GET request
const posts = await client.get<Post[]>('/posts', {
  params: { userId: 1 },
  cache: { ttl: 30000 },
});

// POST request with typed body
const newPost = await client.post<Post>('/posts', {
  title: 'My New Post',
  body: 'This is the content',
  userId: 1,
});

// PUT, PATCH, DELETE requests
await client.put('/posts/1', { title: 'Updated Title' });
await client.patch('/posts/1', { title: 'Patched Title' });
await client.delete('/posts/1');

// Custom requests
await client.request({
  method: 'OPTIONS',
  url: '/posts',
  headers: { 'Custom-Header': 'value' },
});
```

### Resilience Patterns

#### Automatic Retries

```typescript
// Standalone retry function
const result = await Reixo.withRetry(() => fetchUnreliableResource(), {
  maxRetries: 5,
  backoffFactor: 2,
  initialDelayMs: 100,
  retryCondition: (error) => error.status === 429 || error.status >= 500,
});

// Integrated with HTTP client
const client = Reixo.HTTPBuilder.create('https://api.example.com')
  .withRetry({
    maxRetries: 3,
    backoffFactor: 1.5,
    initialDelayMs: 200,
  })
  .build();
```

#### Circuit Breaker

```typescript
const breaker = new Reixo.CircuitBreaker({
  failureThreshold: 3, // Open circuit after 3 failures
  resetTimeoutMs: 30000, // Wait 30 seconds before half-open
  onStateChange: (oldState, newState) => {
    console.log(`Circuit changed from ${oldState} to ${newState}`);
  },
});

// Execute with circuit breaker protection
try {
  const result = await breaker.execute(() => client.get('/unstable-api'));
} catch (error) {
  if (error.message.includes('Circuit is OPEN')) {
    console.log('Service unavailable - using fallback');
    // Provide fallback data
  }
}
```

### Task Queue Management

```typescript
const queue = new Reixo.TaskQueue({
  concurrency: 3, // Max 3 concurrent tasks
  autoStart: true, // Start processing immediately
  persistent: true, // Persist queue to storage
  storage: 'localStorage', // Storage adapter
});

// Add tasks with different priorities
queue.add(async () => await client.get('/high-priority'), {
  priority: 100,
  id: 'task-high',
  dependencies: [],
});

queue.add(async () => await client.get('/medium-priority'), {
  priority: 50,
  id: 'task-medium',
  dependencies: ['task-high'],
});

queue.add(async () => await client.get('/low-priority'), {
  priority: 10,
  id: 'task-low',
  dependencies: ['task-medium'],
});

// Event handling
queue
  .on('task:started', ({ id }) => console.log(`Task ${id} started`))
  .on('task:completed', ({ id, result }) => console.log(`Task ${id} completed`))
  .on('task:failed', ({ id, error }) => console.error(`Task ${id} failed:`, error))
  .on('queue:empty', () => console.log('All tasks completed'));

// Queue control
queue.pause(); // Pause processing
queue.resume(); // Resume processing
queue.clear(); // Clear all tasks
await queue.waitUntilEmpty(); // Wait for all tasks to complete
```

### Pagination Helper

```typescript
// Automatic pagination through API endpoints
for await (const page of Reixo.paginate(client, '/comments', {
  pageParam: '_page',
  limitParam: '_limit',
  limit: 10,
  initialPage: 1,
  stopCondition: (response, pageItems, totalFetched) => totalFetched >= 50,
})) {
  console.log(`Fetched ${page.length} items, total: ${totalFetched}`);
  // Process page items
}
```

### GraphQL Client

```typescript
const gqlClient = new Reixo.GraphQLClient('https://api.example.com/graphql', {
  headers: { Authorization: 'Bearer token' },
});

// Query with variables
const result = await gqlClient.query({
  query: `
    query GetUser($id: ID!) {
      user(id: $id) {
        id
        name
        email
      }
    }
  `,
  variables: { id: '1' },
});

// Mutation
const mutationResult = await gqlClient.mutate({
  mutation: `
    mutation CreateUser($input: UserInput!) {
      createUser(input: $input) {
        id
        name
      }
    }
  `,
  variables: { input: { name: 'John Doe', email: 'john@example.com' } },
});
```

### Error Handling & Debugging

Reixo provides comprehensive error information:

```typescript
try {
  await client.get('/nonexistent');
} catch (error) {
  if (error instanceof Reixo.HTTPError) {
    console.log('HTTP Error Details:');
    console.log('Status:', error.status); // 404
    console.log('Status Text:', error.statusText); // 'Not Found'
    console.log('URL:', error.config?.url); // '/nonexistent'
    console.log('Method:', error.config?.method); // 'GET'

    // Access response body
    const errorBody = await error.response?.json();
    console.log('Error Response:', errorBody);

    // Access headers
    console.log('Response Headers:', error.response?.headers);
  } else {
    console.log('Network Error:', error.message);
  }
}
```

### Logging & Monitoring

```typescript
// Custom logger
const logger = new Reixo.ConsoleLogger(Reixo.LogLevel.DEBUG);

const client = Reixo.HTTPBuilder.create('https://api.example.com')
  .withLogger(logger)
  .withMetrics({
    enabled: true,
    onMetricsUpdate: (metrics) => {
      console.log('Request metrics:', metrics);
    },
  })
  .build();
```

## 📚 API Reference

### HTTPBuilder

The main builder class for creating configured HTTP clients.

```typescript
Reixo.HTTPBuilder.create(baseURL: string): HTTPBuilder

// Configuration methods
.withTimeout(timeoutMs: number): HTTPBuilder
.withHeader(name: string, value: string): HTTPBuilder
.withRetry(config: RetryConfig): HTTPBuilder
.withCircuitBreaker(config: CircuitBreakerConfig): HTTPBuilder
.withRateLimit(config: RateLimitConfig): HTTPBuilder
.withCache(config: CacheConfig): HTTPBuilder
.withLogger(logger: Logger): HTTPBuilder
.withMetrics(config: MetricsConfig): HTTPBuilder

// Interceptors
.addRequestInterceptor(interceptor: RequestInterceptor): HTTPBuilder
.addResponseInterceptor(interceptor: ResponseInterceptor): HTTPBuilder
.addErrorInterceptor(interceptor: ErrorInterceptor): HTTPBuilder

// Progress tracking
.withUploadProgress(callback: ProgressCallback): HTTPBuilder
.withDownloadProgress(callback: ProgressCallback): HTTPBuilder

// Final build
.build(): HTTPClient
```

### HTTPClient

The main client interface with all HTTP methods.

```typescript
interface HTTPClient {
  get<T = unknown>(url: string, options?: HTTPOptions): Promise<HTTPResponse<T>>;
  post<T = unknown>(url: string, data?: unknown, options?: HTTPOptions): Promise<HTTPResponse<T>>;
  put<T = unknown>(url: string, data?: unknown, options?: HTTPOptions): Promise<HTTPResponse<T>>;
  patch<T = unknown>(url: string, data?: unknown, options?: HTTPOptions): Promise<HTTPResponse<T>>;
  delete<T = unknown>(url: string, options?: HTTPOptions): Promise<HTTPResponse<T>>;
  request<T = unknown>(config: HTTPRequestConfig): Promise<HTTPResponse<T>>;

  // Advanced features
  withCache(config: CacheConfig): HTTPClient;
  withTransport(transport: Transport): HTTPClient;
}
```

### TaskQueue

Advanced task management with concurrency control.

```typescript
class TaskQueue {
  constructor(config?: TaskQueueConfig);

  add(task: () => Promise<unknown>, options?: TaskOptions): string;
  pause(): void;
  resume(): void;
  clear(): void;
  waitUntilEmpty(): Promise<void>;

  // Events
  on(event: 'task:started', handler: (event: TaskEvent) => void): this;
  on(event: 'task:completed', handler: (event: TaskCompletedEvent) => void): this;
  on(event: 'task:failed', handler: (event: TaskFailedEvent) => void): this;
  on(event: 'queue:empty', handler: () => void): this;
}
```

## 🔍 Advanced Usage

### Custom Storage Adapters

```typescript
// Memory storage (default)
const memoryQueue = new Reixo.TaskQueue({
  persistent: true,
  storage: new Reixo.MemoryStorage(),
});

// LocalStorage (browser)
const localStorageQueue = new Reixo.TaskQueue({
  persistent: true,
  storage: new Reixo.LocalStorage('reixo-queue'),
});

// SessionStorage (browser)
const sessionStorageQueue = new Reixo.TaskQueue({
  persistent: true,
  storage: new Reixo.SessionStorage('reixo-queue'),
});

// Custom storage implementation
class CustomStorage implements StorageAdapter {
  async save(key: string, data: unknown): Promise<void> {
    /* implementation */
  }
  async load<T>(key: string): Promise<T | null> {
    /* implementation */
  }
  async remove(key: string): Promise<void> {
    /* implementation */
  }
}
```

### Network Monitoring & Offline Support

```typescript
// Monitor network status
const monitor = Reixo.NetworkMonitor.getInstance();

monitor.on('online', () => {
  console.log('Network restored - resuming operations');
  queue.resume();
});

monitor.on('offline', () => {
  console.log('Network lost - pausing operations');
  queue.pause();
});

// Start monitoring
monitor.start();

// Configure queue for offline support
const offlineQueue = new Reixo.TaskQueue({
  concurrency: 2,
  persistent: true,
  storage: 'localStorage',
  syncWithNetwork: true, // Auto-sync when network available
});
```

### Mocking for Testing

```typescript
// Create mock adapter for testing
const mockAdapter = new Reixo.MockAdapter();

// Setup mock responses
mockAdapter
  .onGet('/users/1')
  .reply(200, { id: 1, name: 'John Doe' })
  .onPost('/users')
  .reply(201, (config) => ({
    id: Math.random(),
    ...JSON.parse(config.data as string),
  }))
  .onAny()
  .reply(404); // Catch-all for unmatched requests

// Create client with mock adapter
const testClient = Reixo.HTTPBuilder.create('https://api.example.com')
  .withTransport(mockAdapter)
  .build();

// Use in tests
const response = await testClient.get('/users/1');
expect(response.data).toEqual({ id: 1, name: 'John Doe' });
```

## 🛠️ Configuration Options

### Retry Configuration

```typescript
interface RetryConfig {
  maxRetries?: number; // Maximum retry attempts (default: 3)
  backoffFactor?: number; // Multiplier for delay (default: 2)
  initialDelayMs?: number; // Initial delay in ms (default: 100)
  maxDelayMs?: number; // Maximum delay in ms (default: 30000)
  retryCondition?: (error: HTTPError) => boolean; // Custom retry logic
}
```

### Circuit Breaker Configuration

```typescript
interface CircuitBreakerConfig {
  failureThreshold?: number; // Failures before opening (default: 5)
  resetTimeoutMs?: number; // Time before half-open (default: 30000)
  onStateChange?: (oldState: CircuitState, newState: CircuitState) => void;
}
```

### Task Queue Configuration

```typescript
interface TaskQueueConfig {
  concurrency?: number; // Maximum concurrent tasks (default: 1)
  autoStart?: boolean; // Start processing immediately (default: true)
  persistent?: boolean; // Persist queue to storage (default: false)
  storage?: StorageAdapter; // Storage implementation
  syncWithNetwork?: boolean; // Auto-sync with network status (default: false)
}
```

## 🚨 Error Types

Reixo provides detailed error information:

```typescript
// HTTPError - For HTTP status codes >= 400
class HTTPError extends Error {
  status: number;
  statusText: string;
  config?: HTTPRequestConfig;
  response?: HTTPResponse;
}

// NetworkError - For connectivity issues
class NetworkError extends Error {
  originalError: Error;
}

// TimeoutError - For request timeouts
class TimeoutError extends Error {
  timeoutMs: number;
}

// CircuitBreakerError - When circuit is open
class CircuitBreakerError extends Error {
  state: CircuitState;
}
```

## 📊 Performance Monitoring

```typescript
// Enable metrics collection
const client = Reixo.HTTPBuilder.create('https://api.example.com')
  .withMetrics({
    enabled: true,
    collectionWindowMs: 60000, // 1 minute window
    onMetricsUpdate: (metrics) => {
      console.log('Request Success Rate:', metrics.successRate);
      console.log('Average Latency:', metrics.averageLatencyMs);
      console.log('Total Requests:', metrics.totalRequests);
    },
  })
  .build();

// Access metrics directly
const metrics = client.getMetrics();
console.log('95th Percentile Latency:', metrics.percentile95LatencyMs);
```

## 🔒 Security Features

```typescript
const secureClient = Reixo.HTTPBuilder.create('https://api.example.com')
  .withSecurity({
    sanitizeHeaders: true, // Remove sensitive headers from logs
    maskSensitiveData: true, // Mask passwords/tokens in logs
    ssl: {
      rejectUnauthorized: true, // Strict SSL validation
      minVersion: 'TLSv1.2', // Minimum TLS version
    },
  })
  .build();
```

## 🌐 Browser Support

Reixo works in all modern browsers:

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

For older browsers, include these polyfills:

```html
<!-- For IE11 support -->
<script src="https://cdn.jsdelivr.net/npm/promise-polyfill@8/dist/polyfill.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/whatwg-fetch@3.6.2/dist/fetch.umd.min.js"></script>
```

## 📦 Bundle Size

Reixo is optimized for minimal bundle impact:

- **Core**: ~15KB (gzipped)
- **With all features**: ~25KB (gzipped)
- **Tree-shakable**: Only include what you use

## 🚀 Migration Guide

### From axios

```typescript
// axios
import axios from 'axios';
const response = await axios.get('/api/data');

// Reixo
import { Reixo } from 'reixo';
const client = Reixo.HTTPBuilder.create('/api').build();
const response = await client.get('/data');
```

### From fetch

```typescript
// fetch
const response = await fetch('/api/data');
const data = await response.json();

// Reixo
const response = await client.get('/data');
const data = response.data; // Already parsed JSON
```

## 🛠️ Development

### Building

```bash
npm run build
```

### Testing

```bash
npm test              # Run tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

### Linting

```bash
npm run lint          # Check code style
npm run lint:fix      # Auto-fix issues
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🆘 Support

- 📖 [Documentation](https://github.com/your-username/reixo/wiki)
- 🐛 [Issue Tracker](https://github.com/your-username/reixo/issues)
- 💬 [Discussions](https://github.com/your-username/reixo/discussions)
- 📧 [Email Support](mailto:support@example.com)

## 🎯 Examples

Check the [`/examples`](examples/) directory for comprehensive usage examples:

- [`01-basic-requests.ts`](examples/01-basic-requests.ts) - Basic HTTP operations
- [`02-resilience-retry-circuit.ts`](examples/02-resilience-retry-circuit.ts) - Retry and circuit breaker
- [`03-queue-offline-sync.ts`](examples/03-queue-offline-sync.ts) - Task queue with offline support
- [`04-caching-pagination.ts`](examples/04-caching-pagination.ts) - Caching and pagination
- [`05-graphql-client.ts`](examples/05-graphql-client.ts) - GraphQL operations
- [`06-interceptors-mocking.ts`](examples/06-interceptors-mocking.ts) - Interceptors and testing
- [`07-logging-metrics.ts`](examples/07-logging-metrics.ts) - Logging and performance monitoring
- [`08-error-handling.ts`](examples/08-error-handling.ts) - Comprehensive error handling

---

Built with ❤️ by [Your Name](https://github.com/your-username)
