import { describe, it, expect } from 'vitest';
import { generateCurlCommand } from '../src/utils/curl-generator';
import { HTTPClient } from '../src/core/http-client';

describe('Curl Generator Utility', () => {
  it('should generate a basic GET request', () => {
    const curl = generateCurlCommand('https://api.example.com/users');
    expect(curl).toBe("curl -X GET 'https://api.example.com/users'");
  });

  it('should generate a POST request with JSON body', () => {
    const body = { name: 'John', age: 30 };
    const curl = generateCurlCommand(
      'https://api.example.com/users',
      'POST',
      { 'Content-Type': 'application/json' },
      body
    );

    expect(curl).toContain("-X POST 'https://api.example.com/users'");
    expect(curl).toContain("-H 'Content-Type: application/json'");
    expect(curl).toContain(`-d '{"name":"John","age":30}'`);
  });

  it('should escape single quotes in body', () => {
    const body = { name: "O'Reilly" };
    const curl = generateCurlCommand('https://api.example.com/users', 'POST', {}, body);

    expect(curl).toContain(`-d '{"name":"O'\\''Reilly"}'`);
  });

  it('should handle headers', () => {
    const headers = { Authorization: 'Bearer token', 'X-Custom': 'value' };
    const curl = generateCurlCommand('https://api.example.com/users', 'GET', headers);

    expect(curl).toContain("-H 'Authorization: Bearer token'");
    expect(curl).toContain("-H 'X-Custom: value'");
  });

  it('should handle FormData (mocked)', () => {
    // We can't easily test actual FormData iteration in jsdom/node without proper polyfills sometimes,
    // but assuming our utility handles it or falls back.
    // Let's test the fallback or basic structure if possible.
    // In this environment, FormData might be available.

    if (typeof FormData !== 'undefined') {
      const fd = new FormData();
      fd.append('key', 'value');

      const curl = generateCurlCommand('https://api.example.com/upload', 'POST', {}, fd);
      // Our implementation tries to iterate
      // Expect -F 'key=value'
      expect(curl).toContain("-F 'key=value'");
    }
  });
});

describe('HTTPClient generateCurl', () => {
  it('should generate curl using client config', () => {
    const client = new HTTPClient({
      baseURL: 'https://api.example.com',
      headers: { Authorization: 'Bearer global' },
    });

    const curl = client.generateCurl('/users', { method: 'GET' });

    expect(curl).toContain("'https://api.example.com/users'");
    expect(curl).toContain("-H 'Authorization: Bearer global'");
  });
});
