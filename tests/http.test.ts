import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HTTPBuilder, HTTPClient } from '../src/core/http-client';
import { HTTPError, http, HTTPResponse, HTTPOptions } from '../src/utils/http';

// Mock fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

// Helper to mock fetch response
const mockFetchResponse = (ok: boolean, status: number, data: unknown) => ({
  ok,
  status,
  statusText: ok ? 'OK' : 'Error',
  headers: new Map([['content-type', 'application/json']]),
  json: async () => data,
  text: async () => JSON.stringify(data),
});

interface MockXHR {
  open: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  setRequestHeader: ReturnType<typeof vi.fn>;
  upload: {
    onprogress:
      | ((event: { lengthComputable?: boolean; loaded: number; total: number }) => void)
      | null;
  };
  onload: (() => void) | null;
  status: number;
  statusText: string;
  response: string;
  getResponseHeader: (header: string) => string | null;
  getAllResponseHeaders: () => string;
}

describe('HTTPClient', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    // Reset XMLHttpRequest
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (global as any).XMLHttpRequest;

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

  // ... (rest of the file with search/replace for any)

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

  describe('Progress Events', () => {
    it('should emit upload:progress events', async () => {
      // Mock XMLHttpRequest for progress support
      const xhrMock: any = {
        open: vi.fn(),
        send: vi.fn(),
        setRequestHeader: vi.fn(),
        upload: { onprogress: null },
        onload: null,
        status: 200,
        statusText: 'OK',
        response: '{"success":true}',
        getResponseHeader: () => 'application/json',
        getAllResponseHeaders: () => 'content-type: application/json',
      };

      xhrMock.send.mockImplementation(() => {
        setTimeout(() => {
          if (xhrMock.upload.onprogress) {
            xhrMock.upload.onprogress({ lengthComputable: true, loaded: 50, total: 100 });
          }
          if (xhrMock.onload) xhrMock.onload();
        }, 0);
      });

      global.XMLHttpRequest = class {
        constructor() {
          return xhrMock;
        }
      } as any;

      const client = HTTPBuilder.create('https://api.test').build();
      const progressSpy = vi.fn();
      client.on('upload:progress', progressSpy);

      await client.post(
        '/upload',
        { data: 'test' },
        {
          onUploadProgress: () => {}, // Trigger XHR fallback
        }
      );

      expect(progressSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          loaded: 50,
          total: 100,
          progress: 50,
        })
      );
    });
  });

  describe('Interceptor Error Handling', () => {
    it('should recover from error in response interceptor', async () => {
      fetchMock.mockRejectedValue(new Error('Network Error'));

      const client = HTTPBuilder.create('https://api.test')
        .addResponseInterceptor(undefined, (error) => {
          return {
            data: { recovered: true },
            status: 200,
            statusText: 'OK',
            headers: new Map(),
            config: {},
          };
        })
        .build();

      const response = await client.get('/test');
      expect(response.data).toEqual({ recovered: true });
    });

    it('should propagate error if interceptor throws', async () => {
      fetchMock.mockRejectedValue(new Error('Network Error'));

      const client = HTTPBuilder.create('https://api.test')
        .addResponseInterceptor(undefined, (error) => {
          throw new Error('Interceptor Error');
        })
        .build();

      await expect(client.get('/test')).rejects.toThrow('Interceptor Error');
    });
  });

  describe('Builder Configuration', () => {
    it('should configure headers and base URL', async () => {
      const client = HTTPBuilder.create('https://api.test')
        .withHeader('X-Custom', 'value')
        .withHeaders({ 'X-Extra': 'extra' })
        .build();

      await client.get('/test');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.test/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom': 'value',
            'X-Extra': 'extra',
          }),
        })
      );
    });

    it('should configure retry options', async () => {
      const client = HTTPBuilder.create('https://api.test').withRetry({ maxRetries: 2 }).build();

      // We can't easily check internal config, but we can verify behavior if we mock failure
      fetchMock.mockRejectedValueOnce(new Error('Fail 1')).mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map(),
        json: async () => ({ id: 1 }),
        text: async () => JSON.stringify({ id: 1 }),
      });

      await client.get('/retry');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('should configure progress handlers', () => {
      const onUpload = vi.fn();
      const onDownload = vi.fn();

      const builder = HTTPBuilder.create()
        .withUploadProgress(onUpload)
        .withDownloadProgress(onDownload);

      const client = builder.build();
      // Access private config to verify (casting to any)
      const config = (client as any).config;

      expect(config.onUploadProgress).toBe(onUpload);
      expect(config.onDownloadProgress).toBe(onDownload);
    });

    it('should configure base URL explicitly', () => {
      const builder = new HTTPBuilder();
      builder.withBaseURL('https://api.explicit.com');
      const client = builder.build();
      expect((client as any).config.baseURL).toBe('https://api.explicit.com');
    });
  });

  describe('Download Progress', () => {
    it('should emit download:progress events', async () => {
      const client = HTTPBuilder.create('https://api.test').build();
      const progressSpy = vi.fn();
      const onDownloadProgressSpy = vi.fn();

      client.on('download:progress', progressSpy);

      // We need to trigger the progress handler manually since fetch doesn't support it natively
      // and we are mocking it.
      // However, we can test the wrapper logic by calling the method on the client
      // or by mocking the internal request execution if possible.
      // A better way is to verify that the passed option wraps the original and emits event.

      await client.get('/download', {
        onDownloadProgress: onDownloadProgressSpy,
      });

      // Get the call arguments to fetch
      const callArgs = fetchMock.mock.calls[0];
      const options = callArgs[1];

      // Simulate progress event
      options.onDownloadProgress({ loaded: 50, total: 100, progress: 50 });

      expect(onDownloadProgressSpy).toHaveBeenCalledWith({ loaded: 50, total: 100, progress: 50 });
      expect(progressSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          loaded: 50,
          total: 100,
          progress: 50,
        })
      );
    });
  });

  describe('HTTPClient Advanced Coverage', () => {
    it('should chain onUploadProgress callbacks', async () => {
      const globalProgress = vi.fn();
      const requestProgress = vi.fn();

      const xhrMock: any = {
        open: vi.fn(),
        send: vi.fn(),
        setRequestHeader: vi.fn(),
        upload: {},
        onload: null,
        status: 200,
        response: '{}',
        getAllResponseHeaders: () => '',
      };

      global.XMLHttpRequest = class {
        constructor() {
          return xhrMock;
        }
      } as any;

      const client = HTTPBuilder.create().withUploadProgress(globalProgress).build();

      // Trigger upload progress
      const promise = client.post(
        'https://api.test/upload',
        { data: 'test' },
        {
          onUploadProgress: requestProgress,
        }
      );

      // Wait for async request processing to reach XHR creation
      await new Promise((r) => setTimeout(r, 0));

      // Simulate XHR progress
      if (xhrMock.upload.onprogress) {
        xhrMock.upload.onprogress({ loaded: 50, total: 100 });
      }

      // Finish request
      if (xhrMock.onload) xhrMock.onload();
      await promise;

      expect(globalProgress).toHaveBeenCalled();
      expect(requestProgress).toHaveBeenCalled();
    });

    it('should handle interceptors with missing handlers', async () => {
      const client = HTTPBuilder.create('https://api.test')
        .addRequestInterceptor(undefined, undefined) // Should be ignored or safe
        .addResponseInterceptor(undefined, undefined) // Should be ignored or safe
        .build();

      (global.fetch as any).mockResolvedValue(mockFetchResponse(true, 200, {}));

      await client.get('/test');
      expect(global.fetch).toHaveBeenCalled();
    });

    it('should handle response interceptor with only onRejected', async () => {
      const client = HTTPBuilder.create('https://api.test')
        .addResponseInterceptor(undefined, async (err) => {
          return { data: 'recovered', status: 200, headers: new Headers() } as any;
        })
        .build();

      (global.fetch as any).mockRejectedValue(new Error('Network Error'));

      const response = await client.get('/test');
      expect(response.data).toBe('recovered');
    });

    it('should properly merge headers in builder', () => {
      const builder = HTTPBuilder.create();
      builder.withHeader('X-One', '1');
      builder.withHeader('X-Two', '2'); // Triggers !this.config.headers check (false case)

      const client = builder.build();
      // Access private config for verification or make a request
      expect((client as any).config.headers).toEqual({
        'X-One': '1',
        'X-Two': '2',
      });
    });

    it('should execute helper methods correctly', async () => {
      const client = HTTPBuilder.create('https://api.test').build();
      (global.fetch as any).mockResolvedValue(mockFetchResponse(true, 200, {}));

      await client.put('/put', { id: 1 });
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/put'),
        expect.objectContaining({ method: 'PUT', body: JSON.stringify({ id: 1 }) })
      );

      await client.delete('/delete');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/delete'),
        expect.objectContaining({ method: 'DELETE' })
      );

      await client.patch('/patch', { id: 2 });
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/patch'),
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ id: 2 }) })
      );
    });

    it('should not retry on AbortError (timeout)', async () => {
      fetchMock.mockRejectedValue(new Error('AbortError')); // Simulate AbortError behavior?
      // Actually fetch throws DOMException with name 'AbortError' usually.
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      fetchMock.mockRejectedValue(error);

      await expect(
        http('https://api.test/timeout-retry', {
          retry: true,
          timeoutMs: 100, // Short timeout
        })
      ).rejects.toThrow('The operation was aborted');

      expect(fetchMock).toHaveBeenCalledTimes(1); // Should not retry
    });
  });
});
