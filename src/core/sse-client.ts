import type { HeadersRecord } from '../types/http-well-known';
import type { RetryOptions } from '../types/index';
import { EventEmitter } from '../utils/emitter';
import { delay } from '../utils/timing';

/**
 * Configuration for {@link SSEClient}.
 *
 * @example
 * const sse = new SSEClient({
 *   url: 'https://api.example.com/events',
 *   withCredentials: true,
 *   reconnect: { maxRetries: 5, initialDelayMs: 1000 },
 * });
 * sse.on('message', (e) => console.log(e.data));
 */
export interface SSEConfig {
  /** The SSE endpoint URL. */
  url: string;

  /**
   * Whether to send cookies and auth headers with the EventSource request
   * (equivalent to `withCredentials` on `XMLHttpRequest`).
   * @default false
   */
  withCredentials?: boolean;

  /**
   * Automatic reconnect behaviour when the stream closes unexpectedly.
   * Pass `true` for defaults (5 retries, exponential back-off) or a
   * `RetryOptions` object to customise.
   * @default false
   */
  reconnect?: boolean | RetryOptions;

  /**
   * Additional request headers.
   *
   * **Note:** The native browser `EventSource` API does not support custom
   * headers. This field is forwarded only when a fetch-based SSE polyfill
   * is in use. Common header names are suggested by IntelliSense.
   *
   * @example
   * headers: { Authorization: 'Bearer <token>' }
   */
  headers?: HeadersRecord;
}

export type SSEEvents = {
  open: [Event];
  error: [Event];
  message: [MessageEvent];
  reconnect: [number];
  'reconnect:fail': [Error];
  [key: string]: unknown[]; // Allow custom event names
};

export class SSEClient extends EventEmitter<SSEEvents> {
  private eventSource: EventSource | null = null;
  private reconnectAttempts = 0;
  private isExplicitlyClosed = false;

  constructor(private config: SSEConfig) {
    super();
    this.connect();
  }

  public connect(): void {
    // Respect an explicit close() call — a delayed reconnect must not override it
    if (this.isExplicitlyClosed) return;

    if (this.eventSource && this.eventSource.readyState !== 2) {
      // 2 = CLOSED
      return;
    }

    try {
      // Note: Native EventSource only supports second argument as object with withCredentials
      // Custom headers usually require a polyfill or fetch-based implementation
      // Here we assume standard EventSource API
      const options = { withCredentials: this.config.withCredentials };
      this.eventSource = new EventSource(this.config.url, options);
      this.setupListeners();
    } catch (error) {
      this.handleConnectionError(error);
    }
  }

  public close(): void {
    this.isExplicitlyClosed = true;
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  /**
   * Add a listener for a specific event type
   */
  public addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    if (this.eventSource) {
      this.eventSource.addEventListener(type, listener as EventListener);
    }
    // Also proxy to our EventEmitter for consistency
    this.on(type as keyof SSEEvents, listener as unknown as (...args: unknown[]) => void);
  }

  /**
   * Remove a listener for a specific event type
   */
  public removeEventListener(type: string, listener: (event: MessageEvent) => void): void {
    if (this.eventSource) {
      this.eventSource.removeEventListener(type, listener as EventListener);
    }
    this.off(type as keyof SSEEvents, listener as unknown as (...args: unknown[]) => void);
  }

  private setupListeners(): void {
    if (!this.eventSource) return;

    this.eventSource.onopen = (event: Event) => {
      this.reconnectAttempts = 0;
      this.emit('open', event);
    };

    this.eventSource.onerror = (event: Event) => {
      this.emit('error', event);
      // EventSource automatically reconnects, but if it closes (readyState 2), we might need manual handling
      if (this.eventSource?.readyState === 2 && !this.isExplicitlyClosed) {
        this.handleReconnect();
      }
    };

    this.eventSource.onmessage = (event: MessageEvent) => {
      this.emit('message', event);
    };
  }

  private async handleReconnect(): Promise<void> {
    const reconnectConfig = this.config.reconnect;
    if (!reconnectConfig) return;

    const maxRetries = typeof reconnectConfig === 'object' ? (reconnectConfig.maxRetries ?? 5) : 5;
    const baseDelay =
      typeof reconnectConfig === 'object' ? (reconnectConfig.initialDelayMs ?? 1000) : 1000;
    const maxDelay =
      typeof reconnectConfig === 'object' ? (reconnectConfig.maxDelayMs ?? 30000) : 30000;
    const factor = typeof reconnectConfig === 'object' ? (reconnectConfig.backoffFactor ?? 2) : 2;

    if (this.reconnectAttempts >= maxRetries) {
      this.emit('reconnect:fail', new Error('Max reconnect attempts reached'));
      return;
    }

    this.reconnectAttempts++;
    const waitTime = Math.min(baseDelay * Math.pow(factor, this.reconnectAttempts - 1), maxDelay);

    this.emit('reconnect', this.reconnectAttempts);
    await delay(waitTime);
    this.connect();
  }

  private handleConnectionError(error: unknown): void {
    this.emit('error', error as Event);
    if (!this.isExplicitlyClosed) {
      this.handleReconnect();
    }
  }
}
