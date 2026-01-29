import { describe, it, expect, vi } from 'vitest';
import { createTraceInterceptor } from '../src/utils/tracing';
import { HTTPOptions } from '../src/utils/http';

describe('Distributed Tracing', () => {
  it('should inject trace ID if missing', () => {
    const interceptor = createTraceInterceptor();
    const config: HTTPOptions = {};

    const result = interceptor.onFulfilled(config);

    expect(result.headers).toHaveProperty('x-request-id');
    expect((result.headers as any)['x-request-id'].length).toBeGreaterThan(10); // Default length varies
  });

  it('should use custom header name and generator', () => {
    const interceptor = createTraceInterceptor({
      headerName: 'x-correlation-id',
      generateId: () => 'custom-id',
    });
    const config: HTTPOptions = {};

    const result = interceptor.onFulfilled(config);

    expect(result.headers).toHaveProperty('x-correlation-id', 'custom-id');
    expect(result.headers).not.toHaveProperty('x-request-id');
  });

  it('should not overwrite existing trace ID', () => {
    const interceptor = createTraceInterceptor();
    const config: HTTPOptions = {
      headers: { 'x-request-id': 'existing-id' },
    };

    const result = interceptor.onFulfilled(config);

    expect(result.headers).toHaveProperty('x-request-id', 'existing-id');
  });
});
