import type { HeadersRecord } from '../types/http-well-known';
import type { JsonValue, BodyData } from '../core/http-client';
import { HTTPClient } from '../core/http-client';
import { HTTPOptions, HTTPResponse } from './http';

export interface RecordedRequest {
  id: string;
  timestamp: number;
  url: string;
  method: string;
  requestHeaders: HeadersRecord;
  requestBody: JsonValue | null;
  status: number;
  responseHeaders: HeadersRecord;
  responseBody: JsonValue | null;
  duration: number;
}

interface RecordedHTTPOptions extends HTTPOptions {
  _recordingId?: string;
  _recordingStartTime?: number;
}

/** Attempt to parse a value as JSON. Returns `null` for non-JSON bodies (FormData, Blob, etc.). */
function tryParseJsonBody(body: BodyData | BodyInit | null | undefined): JsonValue | null {
  if (body === null || body === undefined) return null;
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as JsonValue;
    } catch {
      return body;
    }
  }
  // Non-string body (FormData, Blob, ArrayBuffer, etc.) — not JSON-serialisable
  return null;
}

/** Normalise a `Headers` instance or plain object into a flat `HeadersRecord`. */
function flattenHeaders(headers: HTTPOptions['headers']): HeadersRecord {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries()) as HeadersRecord;
  if (Array.isArray(headers)) return Object.fromEntries(headers) as HeadersRecord;
  return headers as HeadersRecord;
}

export class NetworkRecorder {
  private records: RecordedRequest[] = [];
  private isRecording = false;
  private client?: HTTPClient;

  constructor(client?: HTTPClient) {
    if (client) {
      this.attach(client);
    }
  }

  public attach(client: HTTPClient): void {
    this.client = client;

    this.client.interceptors.request.push({
      onFulfilled: (config) => {
        if (!this.isRecording) return config;

        const recordedConfig = config as RecordedHTTPOptions;
        recordedConfig._recordingId = crypto.randomUUID();
        recordedConfig._recordingStartTime = Date.now();

        return config;
      },
    });

    this.client.interceptors.response.push({
      onFulfilled: (response) => {
        if (!this.isRecording) return response;
        this.captureResponse(response);
        return response;
      },
      onRejected: (error: Error | unknown) => {
        // HTTPError carries the raw fetch Response without a parsed body.
        // Failed requests are intentionally skipped to keep fixtures simple.
        return Promise.reject(error);
      },
    });
  }

  private captureResponse(response: HTTPResponse<JsonValue | null | unknown>): void {
    const config = response.config as RecordedHTTPOptions | undefined;
    if (!config?._recordingId) return;

    const endTime = Date.now();
    const startTime = config._recordingStartTime ?? endTime;

    const record: RecordedRequest = {
      id: config._recordingId,
      timestamp: startTime,
      url: config.url ?? '',
      method: (config.method ?? 'GET').toUpperCase(),
      requestHeaders: flattenHeaders(config.headers),
      requestBody: tryParseJsonBody(config.body as BodyData | BodyInit | null | undefined),
      status: response.status,
      responseHeaders: flattenHeaders(
        response.headers instanceof Headers
          ? response.headers
          : (response.headers as HeadersRecord | undefined)
      ),
      responseBody: (response.data as JsonValue | null | undefined) ?? null,
      duration: endTime - startTime,
    };

    this.records.push(record);
  }

  /**
   * Manually record a request/response pair.
   * Useful for tests and examples where you want to inject fixtures directly.
   */
  public record(
    entry: Omit<RecordedRequest, 'id' | 'timestamp'> &
      Partial<Pick<RecordedRequest, 'id' | 'timestamp'>>
  ): void {
    this.records.push({
      id: entry.id ?? crypto.randomUUID(),
      timestamp: entry.timestamp ?? Date.now(),
      ...entry,
    });
  }

  public start(): void {
    this.isRecording = true;
    this.records = [];
  }

  public stop(): void {
    this.isRecording = false;
  }

  public getRecords(): RecordedRequest[] {
    return [...this.records];
  }

  /** Alias for {@link getRecords}. */
  public getAll(): RecordedRequest[] {
    return this.getRecords();
  }

  public clear(): void {
    this.records = [];
  }

  public generateFixtures(): string {
    return JSON.stringify(
      this.records.map((r) => ({
        url: r.url,
        method: r.method,
        status: r.status,
        response: r.responseBody,
      })),
      null,
      2
    );
  }
}
