import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ResumableUploader } from '../src/utils/upload';

describe('ResumableUploader', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should upload a file in chunks', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      json: async () => ({}),
      text: async () => '',
    } as Response);

    const file = new File(['a'.repeat(1024 * 1024 * 3)], 'test.txt', { type: 'text/plain' });
    // 3MB file

    const uploader = new ResumableUploader({ chunkSize: 1024 * 1024 }); // 1MB chunks
    const onProgress = vi.fn();

    await uploader.upload('https://api.example.com/upload', file, { onProgress });

    expect(fetch).toHaveBeenCalledTimes(3);

    // Verify headers of first chunk
    const firstCall = vi.mocked(fetch).mock.calls[0];
    const firstOptions = firstCall[1] as RequestInit;
    const firstHeaders = firstOptions.headers as Record<string, string>;

    expect(firstHeaders['Content-Range']).toBe(`bytes 0-${1024 * 1024 - 1}/${file.size}`);
    expect(firstHeaders['Content-Type']).toBe('application/octet-stream');

    // Verify progress
    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenLastCalledWith({
      uploaded: file.size,
      total: file.size,
      percentage: 100,
    });
  });

  it('should handle small files (single chunk)', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      json: async () => ({}),
      text: async () => '',
    } as Response);

    const file = new File(['hello'], 'test.txt');
    const uploader = new ResumableUploader({ chunkSize: 1024 });

    await uploader.upload('https://api.example.com/upload', file);

    expect(fetch).toHaveBeenCalledTimes(1);
    const call = vi.mocked(fetch).mock.calls[0];
    const headers = (call[1] as RequestInit).headers as Record<string, string>;
    expect(headers['Content-Range']).toBe(`bytes 0-4/${file.size}`);
  });
});
