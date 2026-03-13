/**
 * Utilities for security and data sanitization.
 */
export class SecurityUtils {
  private static readonly SENSITIVE_HEADERS = [
    'authorization',
    'cookie',
    'set-cookie',
    'x-api-key',
    'x-auth-token',
    'proxy-authorization',
  ];

  private static readonly SENSITIVE_FIELDS = [
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
   * Useful for logging or debugging.
   */
  public static sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
    const sanitized: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (this.SENSITIVE_HEADERS.includes(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
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
  public static maskSensitiveData<T>(data: T, _depth = 0): T {
    if (!data || typeof data !== 'object') {
      return data;
    }

    // Guard against circular references and pathologically deep structures
    if (_depth >= SecurityUtils.MAX_MASK_DEPTH) {
      return '[MaxDepthReached]' as unknown as T;
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.maskSensitiveData(item, _depth + 1)) as unknown as T;
    }

    const masked = {} as Record<string, unknown>;
    const obj = data as Record<string, unknown>;

    for (const key of Object.keys(obj)) {
      const lowerKey = key.toLowerCase();
      if (this.SENSITIVE_FIELDS.some((field) => lowerKey.includes(field.toLowerCase()))) {
        masked[key] = '***';
      } else {
        masked[key] = this.maskSensitiveData(obj[key], _depth + 1);
      }
    }
    return masked as unknown as T;
  }
}
