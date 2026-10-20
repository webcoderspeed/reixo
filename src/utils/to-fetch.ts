import type { HTTPMethod, HTTPOptions, HTTPResponse } from './http';
import { HTTPError } from './http';

/** The `fetch` signature that `client.toFetch()` returns. */
export type FetchFunction = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

/** reixo options that apply to every call made through `client.toFetch()`. */
export type ToFetchOptions = Pick<
  HTTPOptions,
  'retry' | 'timeoutMs' | 'proxy' | 'dispatcher' | 'taskPriority'
>;

interface RequestSender {
  request<T>(url: string, options?: HTTPOptions): Promise<HTTPResponse<T>>;
}

const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);
const ABSOLUTE_URL = /^[a-z][a-z\d+\-.]*:/i;

function resolveUrl(input: string | URL | Request): string {
  if (input instanceof Request) return input.url;
  if (input instanceof URL) return input.href;
  return input;
}

function readRequestFields(request: Request): RequestInit {
  return {
    credentials: request.credentials,
    cache: request.cache,
    redirect: request.redirect,
    mode: request.mode,
    referrerPolicy: request.referrerPolicy,
    integrity: request.integrity,
    keepalive: request.keepalive,
  };
}

function toBody(data: unknown, headers: Headers): BodyInit | null {
  if (data === null || data === undefined) return null;
  if (
    typeof data === 'string' ||
    data instanceof ArrayBuffer ||
    ArrayBuffer.isView(data) ||
    data instanceof Blob ||
    data instanceof ReadableStream ||
    data instanceof URLSearchParams ||
    (typeof FormData !== 'undefined' && data instanceof FormData)
  ) {
    return data as BodyInit;
  }
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  return JSON.stringify(data);
}

function toResponse(res: HTTPResponse<unknown>, url: string): Response {
  const headers = new Headers(res.headers);
  // fetch already decoded the body, so the wire encoding and length no longer apply.
  headers.delete('content-encoding');
  headers.delete('content-length');

  const body = NULL_BODY_STATUSES.has(res.status) ? null : toBody(res.data, headers);
  const response = new Response(body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

/**
 * Wraps a reixo client in a standard `fetch` function. See `HTTPClient.toFetch()`.
 * @internal
 */
export function createFetch(client: RequestSender, defaults: ToFetchOptions = {}): FetchFunction {
  return async (input, init = {}) => {
    const request = input instanceof Request ? input : undefined;
    const url = resolveUrl(input);

    const headers = new Headers(request?.headers);
    for (const [name, value] of new Headers(init.headers).entries()) headers.set(name, value);

    let body = init.body;
    if (body === undefined && request?.body) body = await request.arrayBuffer();
    const signal = init.signal ?? request?.signal;

    const options: HTTPOptions = {
      ...(request && readRequestFields(request)),
      ...(init as Omit<RequestInit, 'method' | 'headers'>),
      ...defaults,
      method: (init.method ?? request?.method ?? 'GET').toUpperCase() as HTTPMethod,
      headers,
      body: body ?? null,
      signal: signal ?? null,
      ...(ABSOLUTE_URL.test(url) && { baseURL: '' }),
      responseType: 'stream',
      cacheConfig: false,
      deduplicate: false,
    };

    try {
      return toResponse(await client.request<unknown>(url, options), url);
    } catch (error) {
      if (!(error instanceof HTTPError) || error.status === undefined) throw error;
      if (error.response) return error.response;
      return new Response(null, { status: error.status, statusText: error.statusText ?? '' });
    }
  };
}
