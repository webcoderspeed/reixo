import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HTTPBuilder, HTTPClient } from '../src/core/http-client';
import { HTTPError } from '../src/utils/http';

// Mock fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('HTTPClient', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    // Default success response
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ id: 1 }),
      text: async () => JSON.stringify({ id: 1 }),
    });
  });

  describe('Methods', () => {
    const client = HTTPBuilder.create('https://api.test').build();

    it('should make a GET request', async () => {
      await client.get('/users');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.test/users',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should make a POST request', async () => {
      await client.post('/users', { name: 'Test' });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.test/users',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'Test' }),
        })
      );
    });

    it('should make a PUT request', async () => {
      await client.put('/users/1', { name: 'Updated' });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.test/users/1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ name: 'Updated' }),
        })
      );
    });

    it('should make a DELETE request', async () => {
      await client.delete('/users/1');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.test/users/1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('should make a PATCH request', async () => {
      await client.patch('/users/1', { name: 'Patched' });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.test/users/1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ name: 'Patched' }),
        })
      );
    });
  });

  describe('Interceptors', () => {
    it('should use request interceptors', async () => {
      const client = HTTPBuilder.create('https://api.test')
        .addRequestInterceptor((config) => {
          config.headers = { ...config.headers, 'X-Req': '1' };
          return config;
        })
        .build();

      await client.get('/test');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.test/test',
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-Req': '1' }),
        })
      );
    });

    it('should use response interceptors', async () => {
      const client = HTTPBuilder.create('https://api.test')
        .addResponseInterceptor((response) => {
          const data = response.data as Record<string, any>;
          response.data = { ...data, modified: true };
          return response;
        })
        .build();

      const response = await client.get('/test');
      expect(response.data).toEqual({ id: 1, modified: true });
    });

    it('should handle async interceptors', async () => {
      const client = HTTPBuilder.create('https://api.test')
        .addRequestInterceptor(async (config) => {
          await new Promise((r) => setTimeout(r, 10));
          config.headers = { ...config.headers, 'X-Async': '1' };
          return config;
        })
        .build();

      await client.get('/test');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.test/test',
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-Async': '1' }),
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should throw HTTPError on 4xx/5xx', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Map(),
        json: async () => ({ error: 'Not Found' }),
        text: async () => '{"error": "Not Found"}',
      });

      const client = HTTPBuilder.create('https://api.test').build();

      try {
        await client.get('/unknown');
        throw new Error('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(HTTPError);
        const error = err as HTTPError;
        expect(error.status).toBe(404);
        expect(error.statusText).toBe('Not Found');
        expect(error.config).toBeDefined();
        expect(error.response).toBeDefined();
      }
    });

    it('should handle network errors', async () => {
      fetchMock.mockRejectedValue(new Error('Network Error'));
      const client = HTTPBuilder.create('https://api.test').withRetry(false).build();

      await expect(client.get('/test')).rejects.toThrow('Network Error');
    });
  });

  describe('Cancellation', () => {
    it('should cancel request on timeout', async () => {
      fetchMock.mockImplementation(() => new Promise((r) => setTimeout(r, 100)));
      const client = HTTPBuilder.create('https://api.test').withTimeout(50).build();

      await expect(client.get('/test')).rejects.toThrow(); // AbortError or Timeout
    });
  });

  describe('XHR Fallback (Upload Progress)', () => {
    it('should use XHR when onUploadProgress is provided', async () => {
      // Mock XMLHttpRequest
      const xhrMock: any = {
        open: vi.fn(),
        send: vi.fn(),
        setRequestHeader: vi.fn(),
        upload: {
          onprogress: null,
        },
        onload: null,
        status: 200,
        statusText: 'OK',
        response: '{"success":true}',
        getResponseHeader: () => 'application/json',
        getAllResponseHeaders: () => 'content-type: application/json',
      };

      // Manually trigger onload when send is called
      xhrMock.send.mockImplementation(() => {
        setTimeout(() => {
          if (xhrMock.onload) {
            xhrMock.onload();
          }
        }, 0);
      });

      global.XMLHttpRequest = class {
        constructor() {
          return xhrMock;
        }
      } as any;

      const client = HTTPBuilder.create('https://api.test').build();
      const onProgress = vi.fn();

      await client.post('/upload', { data: 'test' }, { onUploadProgress: onProgress });

      expect(xhrMock.open).toHaveBeenCalledWith('POST', 'https://api.test/upload');
      expect(xhrMock.upload.onprogress).toBeDefined();
    });
  });
});
