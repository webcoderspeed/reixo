import { describe, it, expect, vi, afterEach } from 'vitest';
import { CircuitBreaker, CircuitState } from '../src/utils/circuit-breaker';
import { HTTPClient } from '../src/core/http-client';
import * as httpUtils from '../src/utils/http';
import { HTTPResponse } from '../src/utils/http';

describe('CircuitBreaker Resilience', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return fallback value when circuit is open', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 1000,
      fallback: () => 'fallback-data',
    });

    // Force open circuit
    try {
      await breaker.execute(async () => {
        throw new Error('fail');
      });
    } catch {
      // Ignore error to test state
    }

    expect(breaker.currentState).toBe(CircuitState.OPEN);

    // Should return fallback
    const result = await breaker.execute(async () => 'success');
    expect(result).toBe('fallback-data');
  });

  it('should return fallback value when execution fails', async () => {
    const breaker = new CircuitBreaker({
      fallback: () => 'fallback-error',
    });

    const result = await breaker.execute(async () => {
      throw new Error('fail');
    });
    expect(result).toBe('fallback-error');
  });
});

describe('HTTPClient Retry Policies', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockResponse: HTTPResponse<unknown> = {
    data: {},
    status: 200,
    statusText: 'OK',
    headers: new Headers(),
    config: {},
  };

  it('should apply retry policy based on URL pattern', async () => {
    const client = new HTTPClient({
      retry: false, // Default no retry
      retryPolicies: [
        {
          pattern: '/flaky',
          retry: { maxRetries: 3 },
        },
      ],
    });

    const httpSpy = vi.spyOn(httpUtils, 'http').mockResolvedValue(mockResponse);

    await client.request('/flaky/endpoint');

    const options = httpSpy.mock.calls[0][1] || {};
    expect(options.retry).toEqual({ maxRetries: 3 });
  });

  it('should fall back to default retry if no policy matches', async () => {
    const client = new HTTPClient({
      retry: { maxRetries: 1 },
      retryPolicies: [
        {
          pattern: '/flaky',
          retry: { maxRetries: 5 },
        },
      ],
    });

    const httpSpy = vi.spyOn(httpUtils, 'http').mockResolvedValue(mockResponse);

    await client.request('/stable/endpoint');

    const options = httpSpy.mock.calls[0][1] || {};
    expect(options.retry).toEqual({ maxRetries: 1 });
  });

  it('should prioritize regex patterns', async () => {
    const client = new HTTPClient({
      retryPolicies: [
        {
          pattern: /^https:\/\/api\.critical\.com/,
          retry: { maxRetries: 10 },
        },
      ],
    });

    const httpSpy = vi.spyOn(httpUtils, 'http').mockResolvedValue(mockResponse);

    await client.request('https://api.critical.com/v1/users');

    const options = httpSpy.mock.calls[0][1] || {};
    expect(options.retry).toEqual({ maxRetries: 10 });
  });
});
