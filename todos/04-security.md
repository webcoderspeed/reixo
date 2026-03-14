# Sprint 04 — Security

> Priority: 🟠 P1
> Security issues in an HTTP client library can leak credentials, expose PII in logs, or allow credential reuse across tenants.

---

## SEC-01 · `SENSITIVE_FIELDS` list is incomplete

**File:** `src/utils/security.ts`
**Severity:** 🟠 HIGH

### Problem

`SecurityUtils` has a `SENSITIVE_FIELDS` constant used to redact headers and body fields before logging. The current list covers common cases but misses widely-used variants:

```typescript
// Approximate current list
const SENSITIVE_FIELDS = ['authorization', 'password', 'token', 'secret', 'cookie', 'x-api-key'];
```

Missing:

- `api_key` / `apikey` / `api-key` (query param and body variants)
- `access_token` (OAuth 2.0 bearer, extremely common)
- `refresh_token` (OAuth 2.0, equally sensitive)
- `client_secret` (OAuth client credentials)
- `private_key` / `privatekey`
- `credit_card` / `card_number` / `cvv` / `ssn`
- `x-auth-token` (custom auth header used by many REST APIs)
- `proxy-authorization` (HTTP proxy credentials)

### Fix

Expand and document the list:

```typescript
export const SENSITIVE_FIELDS: readonly string[] = [
  // Auth headers
  'authorization',
  'proxy-authorization',
  'x-api-key',
  'x-auth-token',
  'x-access-token',

  // Token fields (body/query)
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'client_secret',
  'api_key',
  'apikey',
  'api-key',

  // Credentials
  'password',
  'passwd',
  'secret',
  'private_key',
  'privatekey',

  // Session
  'cookie',
  'session',
  'sessionid',
  'session_id',

  // PII (financial)
  'credit_card',
  'card_number',
  'cvv',
  'ssn',
  'social_security',
] as const;
```

Also make the list configurable so library consumers can add domain-specific fields:

```typescript
const client = new ReixoClient({
  security: {
    additionalSensitiveFields: ['patient_id', 'mrn'],
  },
});
```

---

## SEC-02 · Sensitive data masking is case-sensitive

**File:** `src/utils/security.ts`
**Severity:** 🟡 MEDIUM

### Problem

HTTP headers are case-insensitive by spec (`Authorization` and `authorization` are the same header). If `maskSensitiveData` or `sanitizeHeaders` does a case-sensitive string match, passing `Authorization: Bearer xyz` would be masked but `AUTHORIZATION: Bearer xyz` would not.

```typescript
// Potential bug
function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      SENSITIVE_FIELDS.includes(key) ? '[REDACTED]' : value, // case-sensitive!
    ])
  );
}
```

### Fix

Normalize to lowercase before matching:

```typescript
function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      SENSITIVE_FIELDS.includes(key.toLowerCase()) ? '[REDACTED]' : value,
    ])
  );
}
```

And for body objects, do a recursive, case-insensitive deep scan:

```typescript
function maskSensitiveData(obj: unknown, depth = 0): unknown {
  if (depth > 10) return obj; // prevent infinite recursion
  if (typeof obj !== 'object' || obj === null) return obj;

  return Object.fromEntries(
    Object.entries(obj as Record<string, unknown>).map(([k, v]) => [
      k,
      SENSITIVE_FIELDS.includes(k.toLowerCase()) ? '[REDACTED]' : maskSensitiveData(v, depth + 1),
    ])
  );
}
```

---

## SEC-03 · JWT refresh queue may leak tokens on concurrent 401s

**File:** `src/utils/auth.ts`
**Severity:** 🟠 HIGH

### Problem

The JWT refresh interceptor uses a queue to prevent multiple simultaneous refresh calls. However, if the refresh succeeds and the new token is stored, but a queued request uses the OLD token reference (captured at queue time), the request may still 401.

Additionally, if the refresh itself fails (network error, expired refresh token), all queued requests must receive a meaningful error — not hang indefinitely.

### Concerns to Address

1. **Queue drain on refresh failure** — Ensure all pending requests in the refresh queue are rejected (not silently dropped or left pending) when `refreshToken()` fails.
2. **Token capture timing** — Re-read the token from storage/config after the refresh completes, not before or during queueing.
3. **Refresh token expiry** — If `refreshToken()` throws a 401 itself (refresh token expired), the interceptor must NOT re-queue (infinite loop). Detect this with a "is this a refresh request?" flag.

```typescript
// Guard against refresh-of-refresh loop
const isRefreshRequest = config.url === AUTH_REFRESH_ENDPOINT;
if (isRefreshRequest) {
  throw error; // don't intercept refresh endpoint failures
}
```

---

## SEC-04 · No request signing / HMAC support

**File:** `src/utils/security.ts` (missing feature)
**Severity:** 🟢 LOW — nice-to-have for AWS-style APIs

### Problem

Many APIs (AWS, Stripe webhooks, Shopify) require HMAC-signed request payloads. reixo has no built-in interceptor for this pattern.

### Suggested Addition

```typescript
interface HMACSigningConfig {
  algorithm: 'SHA-256' | 'SHA-512';
  secret: string;
  headerName?: string; // default: 'X-Signature-256'
  includeTimestamp?: boolean;
}

// Usage
const client = new ReixoClient({
  security: {
    hmac: {
      algorithm: 'SHA-256',
      secret: process.env.WEBHOOK_SECRET!,
    },
  },
});
```

This is a P3 addition but worth noting for the roadmap.

---

## SEC-05 · Log redaction doesn't cover query parameters

**File:** `src/utils/security.ts` / `src/utils/logger.ts`
**Severity:** 🟡 MEDIUM

### Problem

`sanitizeHeaders` protects request headers. But sensitive data is frequently passed in query parameters too (`?api_key=secret&token=xyz`). The logger may log the full URL including query string, exposing credentials in log output.

### Fix

Add a `sanitizeUrl` function that parses query params and redacts sensitive keys:

```typescript
function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    for (const [key] of parsed.searchParams) {
      if (SENSITIVE_FIELDS.includes(key.toLowerCase())) {
        parsed.searchParams.set(key, '[REDACTED]');
      }
    }
    return parsed.toString();
  } catch {
    return url; // not a full URL (relative path), return as-is
  }
}
```

Use this in all log statements that include the request URL.

---

## Summary Table

| ID     | File                        | Issue                                                                 | Priority |
| ------ | --------------------------- | --------------------------------------------------------------------- | -------- |
| SEC-01 | `security.ts`               | `SENSITIVE_FIELDS` list missing `access_token`, `refresh_token`, etc. | 🟠 P1    |
| SEC-02 | `security.ts`               | Case-sensitive header matching                                        | 🟡 P2    |
| SEC-03 | `auth.ts`                   | JWT queue drain on refresh failure + loop guard                       | 🟠 P1    |
| SEC-04 | `security.ts`               | No HMAC request signing support                                       | 🟢 P3    |
| SEC-05 | `security.ts` / `logger.ts` | URL query params not redacted in logs                                 | 🟡 P2    |
