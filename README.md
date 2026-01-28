# Reixo

A powerful, type-safe HTTP client library with built-in resilience patterns, queue management, and advanced features.

## Features

- 🚀 **Builder Pattern** for easy configuration
- 🔄 **Automatic Retries** with exponential backoff
- 🚦 **Task Queue** with concurrency control, priority, and dependencies
- 🛡️ **Circuit Breaker** for fault tolerance
- 📊 **Progress Tracking** (Upload & Download) with event emitters
- 🔌 **Interceptors** for request/response modification
- ⚡ **Strict Typing** with TypeScript support

## Installation

```bash
npm install reixo
```

## Usage

### Basic Request

```typescript
import { Reixo } from 'reixo';

const client = Reixo.HTTPBuilder.create('https://api.example.com')
  .withTimeout(5000)
  .build();

const response = await client.get('/users');
console.log(response.data);
```

### Advanced Configuration (Builder)

```typescript
const client = Reixo.HTTPBuilder.create('https://api.example.com')
  .withRetry({
    maxRetries: 3,
    backoffFactor: 2,
    initialDelayMs: 500
  })
  .withHeader('Authorization', 'Bearer token')
  .addRequestInterceptor(config => {
    console.log('Requesting:', config.url);
    return config;
  })
  .withDownloadProgress(progress => {
    console.log(`Download: ${progress.progress}%`);
  })
  .build();
```

### Task Queue

Manage concurrent requests with ease.

```typescript
const queue = new Reixo.TaskQueue({ concurrency: 2 });

// Add tasks
queue.add(async () => {
  await client.get('/resource/1');
}, { priority: 10, id: 'task-1' });

queue.add(async () => {
  await client.get('/resource/2');
}, { priority: 5, id: 'task-2' }); // Lower priority runs later

// Listen to events
queue.on('task:completed', ({ id, result }) => {
  console.log(`Task ${id} finished`);
});
```

### Resilience (Circuit Breaker)

Automatically stop requests to failing services.

```typescript
const breaker = new Reixo.CircuitBreaker({
  failureThreshold: 3,
  resetTimeoutMs: 5000
});

try {
  const result = await breaker.execute(() => client.get('/unstable-api'));
} catch (error) {
  console.log('Circuit open or request failed');
}
```

## Progress Tracking

You can track progress globally or per request.

```typescript
// Global listener
client.on('download:progress', (p) => {
  console.log(`Downloading ${p.url}: ${p.loaded}/${p.total}`);
});

// Per-request callback
await client.post('/upload', fileData, {
  onUploadProgress: (p) => console.log(`Upload: ${p.progress}%`)
});
```

## License

ISC
