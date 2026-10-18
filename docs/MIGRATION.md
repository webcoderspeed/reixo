# Migration Guide

## Migrating from `fetch`

### Basic Request

**Before (fetch):**

```javascript
try {
  const response = await fetch('/api/data');
  if (!response.ok) {
    throw new Error('Network response was not ok');
  }
  const data = await response.json();
} catch (error) {
  console.error('Fetch error:', error);
}
```

**After (Reixo):**

```typescript
import { Reixo } from 'reixo';

const client = Reixo.HTTPBuilder.create().build();

try {
  const response = await client.get('/api/data');
  const data = response.data; // Already parsed
} catch (error) {
  console.error('Reixo error:', error);
}
```

### With Options

**Before (fetch):**

```javascript
fetch('/api/data', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ key: 'value' }),
});
```

**After (Reixo):**

```typescript
client.post('/api/data', { key: 'value' });
// Content-Type is set automatically for JSON
```

## Migrating from `axios`

### Interceptors

**Before (axios):**

```javascript
axios.interceptors.request.use((config) => {
  config.headers.Authorization = 'Bearer token';
  return config;
});
```

**After (Reixo):**

```typescript
client.interceptors.request.push({
  onFulfilled: (config) => {
    config.headers = { ...config.headers, Authorization: 'Bearer token' };
    return config;
  },
});
// OR using Builder
Reixo.HTTPBuilder.create()
  .addRequestInterceptor((config) => {
    config.headers = { ...config.headers, Authorization: 'Bearer token' };
    return config;
  })
  .build();
```

### Cancellation

**Before (axios):**

```javascript
const source = axios.CancelToken.source();
axios.get('/url', { cancelToken: source.token });
source.cancel('Operation canceled by the user.');
```

**After (Reixo):**

```typescript
const controller = new AbortController();
client.get('/url', { signal: controller.signal });
controller.abort();
```
