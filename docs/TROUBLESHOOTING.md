# Troubleshooting Guide

## Common Issues

### 1. Requests failing with "Circuit is OPEN"

**Cause:** The failure threshold has been reached due to consecutive errors.
**Solution:**

- Check your backend availability.
- Adjust `failureThreshold` or `resetTimeoutMs` in `CircuitBreakerOptions`.
- Ensure you are handling errors correctly in your application code.

### 2. "Task with ID ... is already in the queue"

**Cause:** You are trying to add a task with an ID that already exists in the pending or active queue.
**Solution:**

- Ensure task IDs are unique.
- Use the default random ID generation if you don't need custom IDs.
- Check if you are accidentally adding the same task twice.

### 3. Requests timing out immediately

**Cause:** `timeoutMs` might be set too low.
**Solution:**

- Increase `timeoutMs` in your `HTTPClient` configuration.
- Check if your network connection is slow.

### 4. Polyfill warnings in console

**Cause:** Your browser environment is missing `fetch`, `Headers`, or `AbortController`.
**Solution:**

- Ensure you are loading necessary polyfills (e.g., `whatwg-fetch`).
- Use `Reixo.ensureBrowserCompatibility()` to check for missing features.

## Debugging

Enable verbose logging by adding a custom interceptor:

```typescript
client.interceptors.request.push({
  onFulfilled: (config) => {
    console.log('Request:', config);
    return config;
  },
});
```
