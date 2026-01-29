import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HTTPClient } from '../src/core/http-client';
import { ReadableStream } from 'stream/web';

describe('HTTPClient Stream Support', () => {
  let client: HTTPClient;
  const baseURL = 'http://api.example.com';

  beforeEach(() => {
    client = new HTTPClient({ baseURL });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should return a ReadableStream when responseType is stream', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('hello'));
        controller.enqueue(new TextEncoder().encode(' world'));
        controller.close();
      },
    });

    const mockResponse = new Response(stream as unknown as BodyInit, {
      headers: { 'Content-Type': 'text/plain' },
    });

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const response = await client.get<ReadableStream>('/stream', { responseType: 'stream' });

    expect(response.data).toBeInstanceOf(ReadableStream);

    // Verify we can read from it
    const reader = response.data.getReader();
    let result = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += new TextDecoder().decode(value);
    }
    expect(result).toBe('hello world');
  });

  it('should return ArrayBuffer when responseType is arraybuffer', async () => {
    const mockResponse = new Response('hello world', {
      headers: { 'Content-Type': 'text/plain' },
    });

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const response = await client.get<ArrayBuffer>('/buffer', { responseType: 'arraybuffer' });

    expect(response.data).toBeInstanceOf(ArrayBuffer);
    const text = new TextDecoder().decode(response.data);
    expect(text).toBe('hello world');
  });

  it('should return Blob when responseType is blob', async () => {
    const mockResponse = new Response('hello world', {
      headers: { 'Content-Type': 'text/plain' },
    });

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const response = await client.get<Blob>('/blob', { responseType: 'blob' });

    expect(response.data).toBeInstanceOf(Blob);
    const text = await response.data.text();
    expect(text).toBe('hello world');
  });

  it('should handle onDownloadProgress with stream (if supported)', async () => {
    // This test relies on TransformStream being available, which implies Node 18+ or polyfill
    if (typeof TransformStream === 'undefined') {
      console.warn('Skipping stream progress test: TransformStream not available');
      return;
    }

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('hello'));
        controller.close();
      },
    });

    const mockResponse = new Response(stream as unknown as BodyInit, {
      headers: { 'Content-Type': 'text/plain', 'Content-Length': '5' },
    });

    global.fetch = vi.fn().mockResolvedValue(mockResponse);
    const onProgress = vi.fn();

    const response = await client.get<ReadableStream>('/stream-progress', {
      responseType: 'stream',
      onDownloadProgress: onProgress,
    });

    // We must read the stream to trigger progress
    const reader = response.data.getReader();
    await reader.read(); // Read 'hello'
    await reader.read(); // Done

    expect(onProgress).toHaveBeenCalled();
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        loaded: 5,
        total: 5,
        progress: 100,
      })
    );
  });
});
