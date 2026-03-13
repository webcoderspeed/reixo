import { describe, it, expect } from 'vitest';
import {
  isTransientNetworkError,
  isTimeoutError,
  isDnsError,
  classifyNetworkError,
  TRANSIENT_NETWORK_CODES,
} from '../src/utils/network-errors';

function nodeError(code: string, message = 'network error'): Error {
  const e = new Error(message);
  (e as NodeJS.ErrnoException).code = code;
  return e;
}

describe('network-errors', () => {
  describe('TRANSIENT_NETWORK_CODES', () => {
    it('contains the major transient codes', () => {
      expect(TRANSIENT_NETWORK_CODES.has('ETIMEDOUT')).toBe(true);
      expect(TRANSIENT_NETWORK_CODES.has('ECONNRESET')).toBe(true);
      expect(TRANSIENT_NETWORK_CODES.has('ECONNREFUSED')).toBe(true);
      expect(TRANSIENT_NETWORK_CODES.has('ENOTFOUND')).toBe(true);
      expect(TRANSIENT_NETWORK_CODES.has('EAI_AGAIN')).toBe(true);
    });
  });

  describe('isTransientNetworkError()', () => {
    it('returns true for errors with known transient codes', () => {
      expect(isTransientNetworkError(nodeError('ETIMEDOUT'))).toBe(true);
      expect(isTransientNetworkError(nodeError('ECONNRESET'))).toBe(true);
      expect(isTransientNetworkError(nodeError('ECONNREFUSED'))).toBe(true);
      expect(isTransientNetworkError(nodeError('ENOTFOUND'))).toBe(true);
      expect(isTransientNetworkError(nodeError('EAI_AGAIN'))).toBe(true);
      expect(isTransientNetworkError(nodeError('EPIPE'))).toBe(true);
    });

    it('returns true for browser-style "Failed to fetch" errors', () => {
      expect(isTransientNetworkError(new TypeError('Failed to fetch'))).toBe(true);
      expect(
        isTransientNetworkError(new TypeError('NetworkError when attempting to fetch resource.'))
      ).toBe(true);
      expect(isTransientNetworkError(new TypeError('Load failed'))).toBe(true);
    });

    it('returns false for non-transient errors', () => {
      expect(isTransientNetworkError(new Error('Something went wrong'))).toBe(false);
      expect(isTransientNetworkError(new TypeError('Type mismatch'))).toBe(false);
      expect(isTransientNetworkError(new RangeError('Out of bounds'))).toBe(false);
      expect(isTransientNetworkError(null)).toBe(false);
      expect(isTransientNetworkError(undefined)).toBe(false);
      expect(isTransientNetworkError('string error')).toBe(false);
      expect(isTransientNetworkError(42)).toBe(false);
    });

    it('returns false for AbortError', () => {
      const abort = new Error('Aborted');
      abort.name = 'AbortError';
      expect(isTransientNetworkError(abort)).toBe(false);
    });
  });

  describe('isTimeoutError()', () => {
    it('returns true for ETIMEDOUT code', () => {
      expect(isTimeoutError(nodeError('ETIMEDOUT'))).toBe(true);
    });

    it('returns true for TimeoutError name', () => {
      const e = new Error('Request timed out');
      e.name = 'TimeoutError';
      expect(isTimeoutError(e)).toBe(true);
    });

    it('returns false for non-timeout errors', () => {
      expect(isTimeoutError(nodeError('ECONNRESET'))).toBe(false);
      expect(isTimeoutError(new Error('Generic error'))).toBe(false);
    });
  });

  describe('isDnsError()', () => {
    it('returns true for ENOTFOUND and EAI_AGAIN', () => {
      expect(isDnsError(nodeError('ENOTFOUND'))).toBe(true);
      expect(isDnsError(nodeError('EAI_AGAIN'))).toBe(true);
    });

    it('returns false for non-DNS errors', () => {
      expect(isDnsError(nodeError('ETIMEDOUT'))).toBe(false);
      expect(isDnsError(new Error('some error'))).toBe(false);
    });
  });

  describe('classifyNetworkError()', () => {
    it('classifies timeout errors', () => {
      expect(classifyNetworkError(nodeError('ETIMEDOUT'))).toBe('timeout');
    });

    it('classifies DNS errors', () => {
      expect(classifyNetworkError(nodeError('ENOTFOUND'))).toBe('dns');
      expect(classifyNetworkError(nodeError('EAI_AGAIN'))).toBe('dns');
    });

    it('classifies connection refused', () => {
      expect(classifyNetworkError(nodeError('ECONNREFUSED'))).toBe('connection_refused');
    });

    it('classifies connection reset', () => {
      expect(classifyNetworkError(nodeError('ECONNRESET'))).toBe('connection_reset');
    });

    it('classifies network unavailable', () => {
      expect(classifyNetworkError(nodeError('ENETUNREACH'))).toBe('network_unavailable');
      expect(classifyNetworkError(nodeError('ENETDOWN'))).toBe('network_unavailable');
    });

    it('classifies other transient errors', () => {
      // EPROTO is in TRANSIENT_NETWORK_CODES but not matched by earlier specific cases
      expect(classifyNetworkError(nodeError('EPROTO'))).toBe('other_transient');
    });

    it('classifies non-transient errors', () => {
      expect(classifyNetworkError(new Error('generic'))).toBe('non_transient');
      expect(classifyNetworkError(null)).toBe('non_transient');
    });
  });
});
