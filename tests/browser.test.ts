import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkBrowserCapabilities,
  ensureBrowserCompatibility,
  getMissingPolyfills,
} from '../src/utils/browser';

describe('Browser Utils', () => {
  const originalFetch = global.fetch;
  const originalHeaders = global.Headers;
  const originalAbortController = global.AbortController;

  afterEach(() => {
    global.fetch = originalFetch;
    global.Headers = originalHeaders;
    global.AbortController = originalAbortController;
  });

  it('should detect available capabilities', () => {
    // Mock environment
    global.fetch = vi.fn();
    global.Headers = class {} as any;
    global.AbortController = class {} as any;

    const capabilities = checkBrowserCapabilities();

    expect(capabilities.hasFetch).toBe(true);
    expect(capabilities.hasHeaders).toBe(true);
    expect(capabilities.hasAbortController).toBe(true);
  });

  it('should detect missing capabilities', () => {
    // Mock environment with missing features
    (global as any).fetch = undefined;
    (global as any).Headers = undefined;
    (global as any).AbortController = undefined;

    const capabilities = checkBrowserCapabilities();

    expect(capabilities.hasFetch).toBe(false);
    expect(capabilities.hasHeaders).toBe(false);
    expect(capabilities.hasAbortController).toBe(false);
  });

  it('should return list of missing polyfills', () => {
    (global as any).fetch = undefined;
    (global as any).Headers = undefined;
    (global as any).AbortController = class {} as any; // Present

    const missing = getMissingPolyfills();

    expect(missing).toContain('fetch');
    expect(missing).toContain('Headers');
    expect(missing).not.toContain('AbortController');
  });

  it('should log warnings if capabilities are missing', () => {
    (global as any).fetch = undefined;
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    ensureBrowserCompatibility();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Missing browser capabilities')
    );
    consoleSpy.mockRestore();
  });
});
