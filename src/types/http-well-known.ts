/**
 * @file http-well-known.ts
 *
 * Well-known HTTP header names and MIME types that power IntelliSense autocomplete
 * throughout the library — without hardcoding anything unrelated to the Fetch API.
 *
 * The `string & {}` intersection is the key technique: it keeps the type open
 * (any string still compiles) while causing IDEs to display the specific literals
 * as autocomplete suggestions.
 *
 * The {@link HeadersWithSuggestions} type mirrors the three object shapes that the
 * native `fetch()` function accepts (`RequestInit['headers']`), augmenting only the
 * plain-object form with known header-name suggestions.
 */

// ---------------------------------------------------------------------------
// HTTP Header Names
// ---------------------------------------------------------------------------

/**
 * Well-known HTTP/1.1 and HTTP/2 request header names (RFC 7231, RFC 7235,
 * and common de-facto standards).
 *
 * Uses `string & {}` so the union stays open — any custom header still compiles
 * and receives no squiggles, while IDEs surface these names as suggestions.
 */
export type KnownRequestHeader =
  // Representation / Negotiation
  | 'Accept'
  | 'Accept-Charset'
  | 'Accept-Encoding'
  | 'Accept-Language'
  | 'Accept-Ranges'
  // Authentication & Security
  | 'Authorization'
  | 'Cookie'
  | 'Origin'
  | 'Proxy-Authorization'
  | 'X-Api-Key'
  | 'X-Auth-Token'
  | 'X-CSRF-Token'
  // Caching
  | 'Cache-Control'
  | 'If-Match'
  | 'If-Modified-Since'
  | 'If-None-Match'
  | 'If-Range'
  | 'If-Unmodified-Since'
  | 'Pragma'
  // Connection management
  | 'Connection'
  | 'Host'
  | 'Upgrade'
  | 'Via'
  // Content
  | 'Content-Encoding'
  | 'Content-Language'
  | 'Content-Length'
  | 'Content-MD5'
  | 'Content-Range'
  | 'Content-Type'
  // Tracing / Correlation
  | 'Baggage'
  | 'Traceparent'
  | 'Tracestate'
  | 'X-Correlation-ID'
  | 'X-Forwarded-For'
  | 'X-Forwarded-Host'
  | 'X-Forwarded-Proto'
  | 'X-Request-ID'
  | 'X-Requested-With'
  // Misc
  | 'Date'
  | 'Expect'
  | 'Max-Forwards'
  | 'Range'
  | 'Referer'
  | 'TE'
  | 'Trailer'
  | 'Transfer-Encoding'
  | 'User-Agent'
  // Allow any additional header — IntelliSense still suggests the entries above
  | (string & {});

// ---------------------------------------------------------------------------
// Headers shape — derived from the Fetch API's own HeadersInit
// ---------------------------------------------------------------------------

/**
 * A plain-object header map that mirrors `Record<string, string>` (one of the three
 * shapes accepted by `fetch()`) but adds autocomplete for well-known header names.
 *
 * The `& Record<string, string>` intersection is what makes this type structurally
 * compatible with the Fetch API's `HeadersInit` while still surfacing known names
 * as IntelliSense suggestions.
 *
 * @example
 * const headers: HeadersRecord = {
 *   'Content-Type': 'application/json',   // suggested by IntelliSense
 *   'X-My-Header': 'custom-value',        // still compiles — any key is valid
 * };
 */
export type HeadersRecord = { [K in KnownRequestHeader]?: string } & Record<string, string>;

/**
 * Drop-in replacement for `RequestInit['headers']` / `HeadersInit` that adds
 * IntelliSense suggestions for common header names on the plain-object form.
 *
 * All three shapes the native `fetch()` function accepts are preserved:
 * - A `Headers` instance
 * - An array of `[name, value]` tuples
 * - A plain object (augmented with known-header-name suggestions)
 *
 * @example
 * // Object form — IntelliSense suggests header names as you type
 * const headers: HeadersWithSuggestions = {
 *   Authorization: 'Bearer eyJhbGc…',
 *   'Content-Type': 'application/json',
 *   Accept: 'application/json',
 * };
 *
 * // Still compatible with the Headers constructor and tuple arrays
 * const h2: HeadersWithSuggestions = new Headers({ Authorization: 'Bearer …' });
 * const h3: HeadersWithSuggestions = [['Authorization', 'Bearer …']];
 */
export type HeadersWithSuggestions =
  // Preserve the exact non-object forms from the Fetch API
  | Headers
  | [string, string][]
  // Augment the object form: known names are suggested, any string is still valid
  | HeadersRecord;

// ---------------------------------------------------------------------------
// MIME / Content Types
// ---------------------------------------------------------------------------

/**
 * Common MIME types for `Content-Type` and `Accept` headers.
 *
 * Uses `string & {}` so any MIME type string compiles while IDEs show suggestions.
 *
 * @example
 * const contentType: MimeType = 'application/json';        // suggested
 * const custom: MimeType = 'application/vnd.my-api+json';  // still compiles
 */
export type MimeType =
  | 'application/json'
  | 'application/ld+json'
  | 'application/octet-stream'
  | 'application/pdf'
  | 'application/x-www-form-urlencoded'
  | 'application/xml'
  | 'application/zip'
  | 'image/avif'
  | 'image/gif'
  | 'image/jpeg'
  | 'image/png'
  | 'image/svg+xml'
  | 'image/webp'
  | 'multipart/form-data'
  | 'text/css'
  | 'text/csv'
  | 'text/html'
  | 'text/javascript'
  | 'text/plain'
  | 'text/xml'
  | (string & {});
