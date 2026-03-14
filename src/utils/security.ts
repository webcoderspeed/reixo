import type { JsonValue } from '../core/http-client';
import type { HeadersRecord } from '../types/http-well-known';

/**
 * Utilities for security and data sanitization.
 */
export class SecurityUtils {
  /**
   * HTTP request/response headers whose values must never appear in logs.
   * Matching is case-insensitive (headers are normalised to lowercase before comparison).
   */
  private static readonly SENSITIVE_HEADERS: readonly string[] = [
    'authorization',
    'proxy-authorization',
    'cookie',
    'set-cookie',
    'x-api-key',
    'x-auth-token',
    'x-access-token',
  ];

  /**
   * Body / query-parameter field names whose values must never appear in logs.
   * Matching uses `.toLowerCase().includes(field)` so partial matches are caught
   * (e.g. `user_password` matches `password`).
   *
   * Extended from the original list to cover OAuth 2.0 tokens, common API key
   * variants, and PII fields missed in the previous version.
   */
  private static readonly SENSITIVE_FIELDS: readonly string[] = [
    // Credentials
    'password',
    'passwd',
    'secret',
    'private_key',
    'privatekey',

    // Auth tokens (OAuth 2.0, OpenID Connect, JWT)
    'token',
    'access_token',
    'refresh_token',
    'id_token',
    'client_secret',

    // API keys — all common variants
    'api_key',
    'apikey',
    'api-key',
    'apitoken',
    'api_token',

    // Generic auth
    'authorization',

    // Session
    'session',
    'sessionid',
    'session_id',

    // PII (financial)
    'creditcard',
    'credit_card',
    'card_number',
    'cvv',
    'ssn',
    'social_security',
  ];

  /**
   * Sanitizes headers by redacting sensitive values.
   * Returns a new `HeadersRecord` — never mutates the input.
   * Header name comparison is case-insensitive (HTTP spec requirement).
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

  /**
   * Sanitize a URL by redacting sensitive query parameter values.
   *
   * Sensitive query params (e.g. `?api_key=secret&access_token=xyz`) are
   * replaced with `[REDACTED]` while the parameter name is preserved for
   * debugging (`?api_key=[REDACTED]`).
   *
   * If the URL is a relative path (no scheme), it is returned unchanged since
   * `URL` can only parse fully-qualified URLs.
   *
   * @example
   * SecurityUtils.sanitizeUrl('https://api.example.com/users?token=abc&page=2')
   * // → 'https://api.example.com/users?token=[REDACTED]&page=2'
   */
  public static sanitizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      let changed = false;
      for (const [key] of parsed.searchParams) {
        if (
          SecurityUtils.SENSITIVE_FIELDS.some((field) => key.toLowerCase().includes(field)) ||
          SecurityUtils.SENSITIVE_HEADERS.includes(key.toLowerCase())
        ) {
          parsed.searchParams.set(key, '[REDACTED]');
          changed = true;
        }
      }
      return changed ? parsed.toString() : url;
    } catch {
      // Relative path or malformed URL — return as-is
      return url;
    }
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
        : SecurityUtils.maskSensitiveData(obj[key] as JsonValue, _depth + 1);
    }
    return masked as unknown as T;
  }
}
