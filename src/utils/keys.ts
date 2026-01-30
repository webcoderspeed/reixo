import { simpleHash } from './hash';

/**
 * Generates a unique key based on URL and query parameters.
 * Sorts parameters to ensure consistency (e.g., ?a=1&b=2 is same as ?b=2&a=1).
 * If the resulting key is longer than 256 characters, it returns a hash.
 */
export function generateKey(
  url: string,
  params?: Record<string, string | number | boolean>
): string {
  let key = url;
  if (params) {
    const sortedParams = Object.entries(params)
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
      .map(([key, value]) => `${key}=${String(value)}`)
      .join('&');
    const separator = url.includes('?') ? '&' : '?';
    key = `${url}${separator}${sortedParams}`;
  }

  if (key.length > 256) {
    return `hash:${simpleHash(key)}`;
  }

  return key;
}
