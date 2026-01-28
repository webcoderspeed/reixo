/**
 * Generates a unique key based on URL and query parameters.
 * Sorts parameters to ensure consistency (e.g., ?a=1&b=2 is same as ?b=2&a=1).
 */
export function generateKey(
  url: string,
  params?: Record<string, string | number | boolean>
): string {
  if (!params) return url;
  const sortedParams = Object.entries(params)
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('&');
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${sortedParams}`;
}
