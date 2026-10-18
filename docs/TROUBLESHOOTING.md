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

### 5. Requests bypass the proxy even though `HTTPS_PROXY` is set (Node.js)

**Cause:** Node's global `fetch` (undici) ignores `HTTP_PROXY` / `HTTPS_PROXY`, unlike axios. reixo's proxy support is opt-in.
**Solution:**

- Set `proxy: 'env'` on the client, and install the optional peer: `npm i undici`.
- The environment is read once, when the client is created. Create the client after the variables are set.
- Check `NO_PROXY`: hosts listed there (and their subdomains) are connected to directly.
- Errors starting with `Proxy http://… is unreachable` or `Proxy http://… rejected CONNECT` come from the proxy, not the upstream API. A `407` means the proxy credentials are missing or wrong.

### 6. `pool` / `ssl` / `agent` have no effect

**Cause:** Before 2.3.0, `pool` and `ssl` built `node:http(s)` agents, which `fetch` never used. The `agent` option was always ignored by `fetch`.
**Solution:**

- Upgrade to reixo ≥ 2.3.0 and `npm i undici`. `pool` and `ssl` are then applied through an undici `Agent`.
- Replace a per-request `agent` with the client's `pool` / `ssl` options, or pass an undici `dispatcher`.

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
