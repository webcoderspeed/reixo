/**
 * Browser compatibility utilities.
 */

export interface BrowserCapabilities {
  hasFetch: boolean;
  hasHeaders: boolean;
  hasAbortController: boolean;
  hasReadableStream: boolean;
  hasPromise: boolean;
}

export const checkBrowserCapabilities = (): BrowserCapabilities => {
  return {
    hasFetch: typeof fetch !== 'undefined',
    hasHeaders: typeof Headers !== 'undefined',
    hasAbortController: typeof AbortController !== 'undefined',
    hasReadableStream: typeof ReadableStream !== 'undefined',
    hasPromise: typeof Promise !== 'undefined',
  };
};

export const getMissingPolyfills = (): string[] => {
  const caps = checkBrowserCapabilities();
  const missing: string[] = [];

  if (!caps.hasFetch) missing.push('fetch');
  if (!caps.hasHeaders) missing.push('Headers');
  if (!caps.hasAbortController) missing.push('AbortController');
  if (!caps.hasPromise) missing.push('Promise');
  // ReadableStream is optional (used for progress)

  return missing;
};

export const ensureBrowserCompatibility = (): void => {
  const missing = getMissingPolyfills();
  if (missing.length > 0) {
    console.warn(
      `[Reixo] Missing browser capabilities: ${missing.join(', ')}. ` +
        `Some features may not work correctly. Please provide polyfills.`
    );
  }
};
