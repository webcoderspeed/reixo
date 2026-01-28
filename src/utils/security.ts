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

  /**
   * Recursively masks sensitive fields in an object.
   * Useful for logging request/response bodies.
   */
  public static maskSensitiveData<T>(data: T): T {
    if (!data || typeof data !== 'object') {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.maskSensitiveData(item)) as unknown as T;
    }

    const masked = {} as Record<string, unknown>;
    const obj = data as Record<string, unknown>;

    for (const key of Object.keys(obj)) {
      const lowerKey = key.toLowerCase();
      if (this.SENSITIVE_FIELDS.some((field) => lowerKey.includes(field.toLowerCase()))) {
        masked[key] = '***';
      } else {
        masked[key] = this.maskSensitiveData(obj[key]);
      }
    }
    return masked as unknown as T;
  }
}
