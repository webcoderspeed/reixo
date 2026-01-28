import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  checkBrowserCapabilities,
  ensureBrowserCompatibility,
  getMissingPolyfills,
} from '../src/utils/browser';

describe('Browser Utils', () => {
  const originalFetch = global.fetch;
  const originalHeaders = global.Headers;
  const originalAbortController = global.AbortController;
  const originalPromise = global.Promise;

  afterEach(() => {
    vi.stubGlobal('fetch', originalFetch);
    vi.stubGlobal('Headers', originalHeaders);
    vi.stubGlobal('AbortController', originalAbortController);
    vi.stubGlobal('Promise', originalPromise);
  });

  it('should detect available capabilities', () => {
    // Mock environment
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('Headers', class {});
    vi.stubGlobal('AbortController', class {});

    const capabilities = checkBrowserCapabilities();

    expect(capabilities.hasFetch).toBe(true);
    expect(capabilities.hasHeaders).toBe(true);
    expect(capabilities.hasAbortController).toBe(true);
  });

  it('should detect missing capabilities', () => {
    // Mock environment with missing features
    vi.stubGlobal('fetch', undefined);
    vi.stubGlobal('Headers', undefined);
    vi.stubGlobal('AbortController', undefined);

    const capabilities = checkBrowserCapabilities();

    expect(capabilities.hasFetch).toBe(false);
    expect(capabilities.hasHeaders).toBe(false);
    expect(capabilities.hasAbortController).toBe(false);
  });

  it('should return list of missing polyfills', () => {
    vi.stubGlobal('fetch', undefined);
    vi.stubGlobal('Headers', undefined);
    vi.stubGlobal('AbortController', class {}); // Present

    const missing = getMissingPolyfills();

    expect(missing).toContain('fetch');
    expect(missing).toContain('Headers');
    expect(missing).not.toContain('AbortController');
  });

  it('should return empty list if all capabilities are present', () => {
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('Headers', class {});
    vi.stubGlobal('AbortController', class {});

    const missing = getMissingPolyfills();
    expect(missing).toHaveLength(0);
  });

  it('should identify missing AbortController', () => {
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('Headers', class {});
    vi.stubGlobal('AbortController', undefined);
    // Note: Cannot test missing Promise as it causes Vitest to crash

    const missing = getMissingPolyfills();
    expect(missing).toContain('AbortController');
  });

  it('should log warnings if capabilities are missing', () => {
    vi.stubGlobal('fetch', undefined);
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    ensureBrowserCompatibility();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Missing browser capabilities')
    );
    consoleSpy.mockRestore();
  });
});
