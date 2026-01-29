import { EventEmitter } from '../utils/emitter';
import { RetryOptions } from '../types/index';
import { delay } from '../utils/timing';

export interface WebSocketConfig {
  url: string;
  protocols?: string | string[];
  reconnect?: boolean | RetryOptions;
  heartbeat?: {
    interval: number;
    message?: string | object;
    timeout?: number;
  };
  autoConnect?: boolean;
}

export type WebSocketEvents = {
  open: [Event];
  close: [CloseEvent];
  error: [Event];
  message: [MessageEvent];
  reconnect: [number]; // attempt number
  'reconnect:fail': [Error];
};

export class WebSocketClient extends EventEmitter<WebSocketEvents> {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private isExplicitlyClosed = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private config: WebSocketConfig) {
    super();
    if (config.autoConnect !== false) {
      this.connect();
    }
  }

  public connect(): void {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.isExplicitlyClosed = false;

    try {
      this.ws = new WebSocket(this.config.url, this.config.protocols);
      this.setupListeners();
    } catch (error) {
      this.handleConnectionError(error);
    }
  }

  public send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    this.ws.send(data);
  }

  public sendJson<T = unknown>(data: T): void {
    this.send(JSON.stringify(data));
  }

  public close(code?: number, reason?: string): void {
    this.isExplicitlyClosed = true;
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close(code, reason);
    }
  }

  private setupListeners(): void {
    if (!this.ws) return;

    this.ws.onopen = (event: Event) => {
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      this.emit('open', event);
    };

    this.ws.onclose = (event: CloseEvent) => {
      this.stopHeartbeat();
      this.emit('close', event);
      if (!this.isExplicitlyClosed) {
        this.handleReconnect();
      }
    };

    this.ws.onerror = (event: Event) => {
      this.emit('error', event);
    };

    this.ws.onmessage = (event: MessageEvent) => {
      // If we receive a message, the connection is alive
      if (this.config.heartbeat?.timeout) {
        this.resetHeartbeatTimeout();
      }
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

  private startHeartbeat(): void {
    if (!this.config.heartbeat) return;

    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        const message = this.config.heartbeat?.message || 'ping';
        this.send(typeof message === 'object' ? JSON.stringify(message) : message);

        if (this.config.heartbeat?.timeout) {
          this.heartbeatTimeoutTimer = setTimeout(() => {
            // No response received in time
            this.ws?.close();
          }, this.config.heartbeat.timeout);
        }
      }
    }, this.config.heartbeat.interval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }

  private resetHeartbeatTimeout(): void {
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }
}
