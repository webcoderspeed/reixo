import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketClient } from '../src/core/websocket-client';

// Mock WebSocket and related events
class MockEvent {
  constructor(public type: string) {}
}

class MockCloseEvent extends MockEvent {
  code: number;
  reason: string;
  constructor(type: string, init?: { code?: number; reason?: string }) {
    super(type);
    this.code = init?.code || 1000;
    this.reason = init?.reason || '';
  }
}

class MockMessageEvent extends MockEvent {
  data: any;
  constructor(type: string, init?: { data: any }) {
    super(type);
    this.data = init?.data;
  }
}

global.Event = MockEvent as any;
global.CloseEvent = MockCloseEvent as any;
global.MessageEvent = MockMessageEvent as any;

class MockWebSocket {
  url: string;
  protocols?: string | string[];
  readyState: number = 0; // CONNECTING
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = protocols;
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.(new Event('open'));
    }, 10);
  }

  send(data: any) {}
  close(code?: number, reason?: string) {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close', { code, reason }));
  }
}

global.WebSocket = MockWebSocket as any;

describe('WebSocketClient', () => {
  let client: WebSocketClient;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    client?.close();
    vi.clearAllTimers();
    vi.restoreAllMocks();
  });

  it('should connect automatically by default', async () => {
    client = new WebSocketClient({ url: 'ws://localhost:8080' });

    const openSpy = vi.fn();
    client.on('open', openSpy);

    await vi.advanceTimersByTimeAsync(20);

    expect(openSpy).toHaveBeenCalled();
  });

  it('should support manual connection', async () => {
    client = new WebSocketClient({ url: 'ws://localhost:8080', autoConnect: false });

    const openSpy = vi.fn();
    client.on('open', openSpy);

    // Should not be connected yet
    expect(openSpy).not.toHaveBeenCalled();

    client.connect();
    await vi.advanceTimersByTimeAsync(20);

    expect(openSpy).toHaveBeenCalled();
  });

  it('should handle messages', async () => {
    client = new WebSocketClient({ url: 'ws://localhost:8080' });
    await vi.advanceTimersByTimeAsync(20);

    const messageSpy = vi.fn();
    client.on('message', messageSpy);

    // Simulate receiving a message
    const ws = (client as any).ws as MockWebSocket;
    ws.onmessage?.(new MessageEvent('message', { data: 'hello' }));

    expect(messageSpy).toHaveBeenCalled();
    expect(messageSpy.mock.calls[0][0].data).toBe('hello');
  });

  it('should reconnect on close', async () => {
    client = new WebSocketClient({
      url: 'ws://localhost:8080',
      reconnect: {
        maxRetries: 3,
        initialDelayMs: 100,
        backoffFactor: 1, // Linear for easier testing
      },
    });

    await vi.advanceTimersByTimeAsync(20);

    const reconnectSpy = vi.fn();
    client.on('reconnect', reconnectSpy);

    // Simulate connection close
    const ws = (client as any).ws as MockWebSocket;
    ws.close();

    // Advance time to trigger reconnect
    await vi.advanceTimersByTimeAsync(150);

    expect(reconnectSpy).toHaveBeenCalledWith(1);
  });

  it('should send heartbeats', async () => {
    client = new WebSocketClient({
      url: 'ws://localhost:8080',
      heartbeat: {
        interval: 1000,
        message: 'ping',
      },
    });

    await vi.advanceTimersByTimeAsync(20);

    const ws = (client as any).ws as MockWebSocket;
    const sendSpy = vi.spyOn(ws, 'send');

    // Advance time to trigger heartbeat
    await vi.advanceTimersByTimeAsync(1000);

    expect(sendSpy).toHaveBeenCalledWith('ping');
  });
});
