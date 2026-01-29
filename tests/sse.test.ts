import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SSEClient } from '../src/core/sse-client';

// Mock EventSource
class MockEventSource {
  url: string;
  withCredentials?: boolean;
  readyState: number = 0; // CONNECTING
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  listeners: Record<string, EventListener[]> = {};

  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;

  constructor(url: string, options?: { withCredentials?: boolean }) {
    this.url = url;
    this.withCredentials = options?.withCredentials;
    setTimeout(() => {
      this.readyState = MockEventSource.OPEN;
      const event = new Event('open');
      this.onopen?.(event);
    }, 10);
  }

  close() {
    this.readyState = MockEventSource.CLOSED;
  }

  addEventListener(type: string, listener: EventListener) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(listener);
  }

  removeEventListener(type: string, listener: EventListener) {
    if (!this.listeners[type]) return;
    this.listeners[type] = this.listeners[type].filter((l) => l !== listener);
  }

  // Helper to simulate incoming events
  dispatchEvent(type: string, event: Event) {
    if (type === 'message' && this.onmessage) this.onmessage(event as MessageEvent);
    if (type === 'error' && this.onerror) this.onerror(event);
    if (this.listeners[type]) {
      this.listeners[type].forEach((l) => l(event));
    }
  }
}

global.EventSource = MockEventSource as any;

describe('SSEClient', () => {
  let client: SSEClient;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    client?.close();
    vi.clearAllTimers();
    vi.restoreAllMocks();
  });

  it('should connect automatically', async () => {
    client = new SSEClient({ url: '/events' });

    const openSpy = vi.fn();
    client.on('open', openSpy);

    await vi.advanceTimersByTimeAsync(20);
    expect(openSpy).toHaveBeenCalled();
  });

  it('should handle standard messages', async () => {
    client = new SSEClient({ url: '/events' });
    await vi.advanceTimersByTimeAsync(20);

    const messageSpy = vi.fn();
    client.on('message', messageSpy);

    const es = (client as any).eventSource as MockEventSource;
    es.dispatchEvent('message', new MessageEvent('message', { data: 'hello' }));

    expect(messageSpy).toHaveBeenCalled();
    expect(messageSpy.mock.calls[0][0].data).toBe('hello');
  });

  it('should handle custom events', async () => {
    client = new SSEClient({ url: '/events' });
    await vi.advanceTimersByTimeAsync(20);

    const customSpy = vi.fn();
    client.addEventListener('custom-event', customSpy as any);

    const es = (client as any).eventSource as MockEventSource;
    es.dispatchEvent('custom-event', new MessageEvent('custom-event', { data: 'custom' }));

    expect(customSpy).toHaveBeenCalled();
  });

  it('should reconnect on error', async () => {
    client = new SSEClient({
      url: '/events',
      reconnect: {
        maxRetries: 3,
        initialDelayMs: 100,
        backoffFactor: 1,
      },
    });

    await vi.advanceTimersByTimeAsync(20);

    const reconnectSpy = vi.fn();
    client.on('reconnect', reconnectSpy);

    // Simulate error and close
    const es = (client as any).eventSource as MockEventSource;
    es.readyState = MockEventSource.CLOSED;
    es.dispatchEvent('error', new Event('error'));

    // Advance time for reconnect delay
    await vi.advanceTimersByTimeAsync(150);

    expect(reconnectSpy).toHaveBeenCalledWith(1);
  });
});
