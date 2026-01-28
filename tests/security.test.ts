import { describe, it, expect } from 'vitest';
import { SecurityUtils } from '../src/utils/security';

describe('SecurityUtils', () => {
  describe('sanitizeHeaders', () => {
    it('should redact sensitive headers', () => {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: 'Bearer secret-token',
        Cookie: 'session=123',
        'X-API-Key': '12345',
      };

      const sanitized = SecurityUtils.sanitizeHeaders(headers);

      expect(sanitized).toEqual({
        'Content-Type': 'application/json',
        Authorization: '[REDACTED]',
        Cookie: '[REDACTED]',
        'X-API-Key': '[REDACTED]',
      });
    });

    it('should be case-insensitive for header names', () => {
      const headers = {
        authorization: 'secret',
        AUTHORIZATION: 'secret',
      };

      const sanitized = SecurityUtils.sanitizeHeaders(headers);

      expect(sanitized['authorization']).toBe('[REDACTED]');
      expect(sanitized['AUTHORIZATION']).toBe('[REDACTED]');
    });
  });

  describe('maskSensitiveData', () => {
    it('should mask sensitive fields in objects', () => {
      const data = {
        username: 'user',
        password: 'password123',
        details: {
          apiKey: 'secret-key',
          publicInfo: 'visible',
        },
      };

      const masked = SecurityUtils.maskSensitiveData(data);

      expect(masked).toEqual({
        username: 'user',
        password: '***',
        details: {
          apiKey: '***',
          publicInfo: 'visible',
        },
      });
    });

    it('should handle arrays', () => {
      const data = [
        { id: 1, token: 'abc' },
        { id: 2, secret: 'xyz' },
      ];

      const masked = SecurityUtils.maskSensitiveData(data);

      expect(masked).toEqual([
        { id: 1, token: '***' },
        { id: 2, secret: '***' },
      ]);
    });
  });
});
