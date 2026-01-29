import { EventEmitter } from '../utils/emitter';
import { RetryOptions } from '../types/index';
import { delay } from '../utils/timing';

export interface SSEConfig {
  url: string;
  withCredentials?: boolean;
  reconnect?: boolean | RetryOptions;
  headers?: Record<string, string>; // Note: EventSource doesn't support headers natively in browser, but polyfills might
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
    if (this.eventSource && this.eventSource.readyState !== 2) {
      // 2 = CLOSED
      return;
    }

    this.isExplicitlyClosed = false;

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
