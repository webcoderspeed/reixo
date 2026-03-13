import type { HeadersRecord } from '../types/http-well-known';
import type { JsonValue } from '../core/http-client';

/**
 * Utilities for security and data sanitization.
 */
export class SecurityUtils {
  private static readonly SENSITIVE_HEADERS: readonly string[] = [
    'authorization',
    'cookie',
    'set-cookie',
    'x-api-key',
    'x-auth-token',
    'proxy-authorization',
  ];

  private static readonly SENSITIVE_FIELDS: readonly string[] = [
    'password',
    'token',
    'secret',
    'apiKey',
    'authorization',
    'creditCard',
    'cvv',
    'ssn',
  ];

  /**
   * Sanitizes headers by redacting sensitive values.
   * Returns a new `HeadersRecord` — never mutates the input.
   */
  public static sanitizeHeaders(headers: HeadersRecord): HeadersRecord {
    const sanitized: HeadersRecord = {};
    for (const [key, value] of Object.entries(headers)) {
      sanitized[key] = SecurityUtils.SENSITIVE_HEADERS.includes(key.toLowerCase())
        ? '[REDACTED]'
        : (value as string);
    }
    return sanitized;
  }

  /** Maximum recursion depth for {@link maskSensitiveData}. */
  private static readonly MAX_MASK_DEPTH = 20;

  /**
   * Recursively masks sensitive fields in an object.
   * Useful for logging request/response bodies.
   *
   * @param data   The value to mask.
   * @param _depth Internal recursion counter — do not pass externally.
   */
  public static maskSensitiveData<T extends JsonValue>(data: T, _depth = 0): T {
    if (!data || typeof data !== 'object') {
      return data;
    }

    if (_depth >= SecurityUtils.MAX_MASK_DEPTH) {
      return '[MaxDepthReached]' as unknown as T;
    }

    if (Array.isArray(data)) {
      return data.map((item) =>
        SecurityUtils.maskSensitiveData(item as JsonValue, _depth + 1)
      ) as unknown as T;
    }

    const masked: Record<string, JsonValue> = {};
    const obj = data as Record<string, JsonValue>;

    for (const key of Object.keys(obj)) {
      masked[key] = SecurityUtils.SENSITIVE_FIELDS.some((field) =>
        key.toLowerCase().includes(field.toLowerCase())
      )
        ? '***'
        : SecurityUtils.maskSensitiveData(obj[key], _depth + 1);
    }
    return masked as unknown as T;
  }
}
