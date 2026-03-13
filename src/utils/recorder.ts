import { HTTPClient } from '../core/http-client';
import { HTTPOptions, HTTPResponse, HTTPError } from './http';

export interface RecordedRequest {
  id: string;
  timestamp: number;
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  requestBody: unknown;
  status: number;
  responseHeaders: Record<string, string>;
  responseBody: unknown;
  duration: number;
}

interface RecordedHTTPOptions extends HTTPOptions {
  _recordingId?: string;
  _recordingStartTime?: number;
}

export class NetworkRecorder {
  private records: RecordedRequest[] = [];
  private isRecording = false;
  private client?: HTTPClient;
  private requestInterceptorId?: number;
  private responseInterceptorId?: number;

  constructor(client?: HTTPClient) {
    if (client) {
      this.attach(client);
    }
  }

  public attach(client: HTTPClient): void {
    this.client = client;

    // We need to hook into the interceptors
    // Note: This assumes we can just push to the array.
    // Ideally HTTPClient should return an ID for removal, but for now we'll just push.
    // To implement stop(), we might need to modify HTTPClient to allow removing interceptors,
    // or we just manage a flag inside our interceptor logic.

    this.client.interceptors.request.push({
      onFulfilled: (config) => {
        if (!this.isRecording) return config;

        const recordedConfig = config as RecordedHTTPOptions;
        const id = crypto.randomUUID();
        recordedConfig._recordingId = id;
        recordedConfig._recordingStartTime = Date.now();

        return config;
      },
    });

    this.client.interceptors.response.push({
      onFulfilled: (response) => {
        if (!this.isRecording) return response;
        this.recordResponse(response);
        return response;
      },
      onRejected: (error: unknown) => {
        // HTTPError only carries the raw fetch `Response` object, not the parsed
        // body — so we can't populate `responseBody` without an extra async read.
        // Failed requests are intentionally not recorded to keep the fixture
        // format simple and type-safe. Re-throw so other interceptors still run.
        return Promise.reject(error);
      },
    });
  }

  private recordResponse(response: HTTPResponse<unknown>) {
    const config = response.config as RecordedHTTPOptions | undefined;
    if (!config || !config._recordingId) return;

    const endTime = Date.now();
    const startTime = config._recordingStartTime || endTime;

    const record: RecordedRequest = {
      id: config._recordingId,
      timestamp: startTime,
      url: config.url || '',
      method: config.method || 'GET',
      requestHeaders: (config.headers as Record<string, string>) || {},
      requestBody: config.body,
      status: response.status,
      responseHeaders: (response.headers instanceof Headers
        ? Object.fromEntries(response.headers.entries())
        : response.headers) as Record<string, string>,
      responseBody: response.data,
      duration: endTime - startTime,
    };

    this.records.push(record);
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
