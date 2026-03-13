import { simpleHash } from './hash';
import type { ParamsValue } from './http';

/**
 * Generates a unique key based on URL and query parameters.
 * Sorts parameters to ensure consistency (e.g., ?a=1&b=2 is same as ?b=2&a=1).
 * Supports flat scalars, arrays (sorted for stability), and nested objects (bracket notation).
 * If the resulting key is longer than 256 characters, it returns a hash.
 */
export function generateKey(url: string, params?: ParamsValue): string {
  let key = url;
  if (params) {
    const sortedParams = Object.entries(params)
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
      .flatMap(([k, value]) => {
        if (Array.isArray(value)) {
          // Sort array values for consistency so [b,a] and [a,b] produce the same key
          return [...value].sort().map((v) => `${k}=${String(v)}`);
        }
        if (value !== null && typeof value === 'object') {
          // Nested object — flatten with bracket notation, sort sub-keys for stability
          return Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .flatMap(([subKey, subValue]) => {
              const flatKey = `${k}[${subKey}]`;
              if (Array.isArray(subValue)) {
                return [...subValue].sort().map((v) => `${flatKey}=${String(v)}`);
              }
              return [`${flatKey}=${String(subValue)}`];
            });
        }
        return [`${k}=${String(value)}`];
      })
      .join('&');
    const separator = url.includes('?') ? '&' : '?';
    key = `${url}${separator}${sortedParams}`;
  }

  if (key.length > 256) {
    return `hash:${simpleHash(key)}`;
  }

  return key;
}
