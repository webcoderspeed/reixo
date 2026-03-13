import { EventEmitter } from '../utils/emitter';
import { RetryOptions } from '../types/index';
import { delay } from '../utils/timing';

/**
 * Configuration for {@link WebSocketClient}.
 *
 * @example
 * const ws = new WebSocketClient({
 *   url: 'wss://api.example.com/ws',
 *   reconnect: { maxRetries: 5, initialDelayMs: 1000, backoffFactor: 2 },
 *   heartbeat: { interval: 30_000, message: 'ping', timeout: 5_000 },
 * });
 * ws.on('message', (e) => console.log(JSON.parse(e.data)));
 */
export interface WebSocketConfig {
  /** The WebSocket server URL (must start with `ws://` or `wss://`). */
  url: string;

  /**
   * One or more sub-protocol names passed to the `WebSocket` constructor.
   * The server selects which protocol to use.
   * @example 'json' or ['v1.protocol', 'v2.protocol']
   */
  protocols?: string | string[];

  /**
   * Automatic reconnect behaviour when the connection is lost.
   * Pass `true` for defaults (5 retries, exponential back-off starting at 1s)
   * or a `RetryOptions` object to customise the delay and attempt count.
   * @default false
   */
  reconnect?: boolean | RetryOptions;

  /**
   * Heartbeat / keep-alive configuration.
   * A ping message is sent at `interval` ms. If no server response arrives
   * within `timeout` ms, the socket is closed (triggering reconnect if enabled).
   */
  heartbeat?: {
    /** How often to send the ping message, in milliseconds. */
    interval: number;
    /**
     * Message payload sent as the heartbeat ping.
     * Objects are automatically JSON-serialised.
     * @default 'ping'
     */
    message?: string | object;
    /**
     * Milliseconds to wait for a response before closing the socket.
     * When omitted, no timeout is applied.
     */
    timeout?: number;
  };

  /**
   * Whether to open the WebSocket connection immediately when the client
   * is constructed. Set to `false` to defer until `connect()` is called.
   * @default true
   */
  autoConnect?: boolean;
}

/**
 * Events emitted by {@link WebSocketClient}.
 *
 * @example
 * ws.on('open',          (e)   => console.log('Connected'));
 * ws.on('close',         (e)   => console.log('Disconnected:', e.code));
 * ws.on('error',         (e)   => console.error('Error', e));
 * ws.on('message',       (e)   => console.log('Data:', e.data));
 * ws.on('reconnect',     (n)   => console.log(`Attempt #${n}`));
 * ws.on('reconnect:fail',(err) => console.error('Gave up:', err));
 */
export type WebSocketEvents = {
  open: [Event];
  close: [CloseEvent];
  error: [Event];
  message: [MessageEvent];
  /** Emitted before each reconnect attempt with the current attempt number. */
  reconnect: [number];
  /** Emitted when all reconnect attempts are exhausted. */
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
    // Respect an explicit close() call — a delayed reconnect must not override it
    if (this.isExplicitlyClosed) return;

    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

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
    const heartbeat = this.config.heartbeat;
    if (!heartbeat) return;

    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        const message = heartbeat.message || 'ping';
        this.send(typeof message === 'object' ? JSON.stringify(message) : message);

        // Capture timeout value once to avoid repeated optional chaining inside callbacks
        const timeoutMs = heartbeat.timeout;
        if (timeoutMs) {
          // Clear any previous timeout before creating a new one to avoid
          // orphaned timers if the interval fires before the previous pong arrived.
          if (this.heartbeatTimeoutTimer) {
            clearTimeout(this.heartbeatTimeoutTimer);
          }
          this.heartbeatTimeoutTimer = setTimeout(() => {
            // No response received in time — close the socket to trigger reconnect
            this.ws?.close();
          }, timeoutMs);
        }
      }
    }, heartbeat.interval);
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
