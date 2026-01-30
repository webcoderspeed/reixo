/**
 * Computes a SHA-256 hash of the given string.
 * Works in both modern Browsers and Node.js (16+).
 */
export async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);

  // Browser / Modern Node.js
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Node.js (Legacy/CommonJS fallback if crypto.subtle is missing)
  // This part relies on the 'crypto' module being available or bundled.
  // For a pure environment agnostic approach, we might need a polyfill or strict requirement.
  // But usually bundlers handle 'crypto' import for Node.
  try {
    // Dynamic import to avoid build errors in browser if not polyfilled
    const { createHash } = await import('crypto');
    return createHash('sha256').update(message).digest('hex');
  } catch {
    console.warn('SHA-256 hashing requires crypto API. Falling back to simple hash (non-secure).');
    return simpleHash(message);
  }
}

/**
 * A simple, non-secure hash function (djb2) for fallback.
 * Do NOT use for cryptographic purposes.
 */
export function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}
