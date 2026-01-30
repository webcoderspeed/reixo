import { Bench } from 'tinybench';
import { Reixo } from '../src/index';

// Define minimal interfaces for Mocks
interface MockEvent {
  type?: string;
  [key: string]: unknown;
}

interface MockCloseEvent extends MockEvent {
  code: number;
  reason: string;
}

// Mock WebSocket
class MockWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;

  onopen: ((event: MockEvent) => void) | null = null;
  onmessage: ((event: MockEvent) => void) | null = null;
  onclose: ((event: MockCloseEvent) => void) | null = null;
  onerror: ((event: MockEvent) => void) | null = null;
  readyState = 1; // OPEN

  constructor(public url: string) {
    setTimeout(() => this.onopen?.({}), 0);
  }

  send(data: unknown) {
    // Mock send
  }
  close() {
    this.onclose?.({ code: 1000, reason: 'Test' });
  }
}

// Mock EventSource
class MockEventSource {
  onopen: ((event: MockEvent) => void) | null = null;
  onmessage: ((event: MockEvent) => void) | null = null;
  onerror: ((event: MockEvent) => void) | null = null;
  readyState = 1;

  constructor(public url: string) {
    setTimeout(() => this.onopen?.({}), 0);
  }

  close() {}
}

// Global Mocks
const globalScope = global as unknown as {
  WebSocket: typeof MockWebSocket;
  EventSource: typeof MockEventSource;
};

globalScope.WebSocket = MockWebSocket;
globalScope.EventSource = MockEventSource;

const bench = new Bench({ time: 1000 });

// Setup clients
const wsClient = new Reixo.WebSocketClient({
  url: 'ws://mock.com',
  autoConnect: false,
});

const sseClient = new Reixo.SSEClient({
  url: 'http://mock.com',
});

// Setup for message processing
const connectedWs = new Reixo.WebSocketClient({ url: 'ws://mock.com' });
// Force connection state for testing message processing
// Accessing private property 'ws' for testing setup
(connectedWs as unknown as { ws: MockWebSocket }).ws = new MockWebSocket('ws://mock.com');
((connectedWs as unknown as { ws: MockWebSocket }).ws as MockWebSocket).readyState = 1;

bench
  .add('WebSocket: Instantiate', () => {
    new Reixo.WebSocketClient({ url: 'ws://test.com', autoConnect: false });
  })
  .add('WebSocket: Send Message', () => {
    connectedWs.send('test message');
  })
  .add('SSE: Instantiate', () => {
    new Reixo.SSEClient({ url: 'http://test.com' });
  })
  .add('Polling: Simple Async Check', async () => {
    await Reixo.poll(async () => Promise.resolve(true), {
      interval: 0,
      maxAttempts: 1,
      stopCondition: () => true,
    });
  });

console.log('Running Real-Time benchmarks...');
(async () => {
  try {
    await bench.run();
    console.table(bench.table());
  } catch (e) {
    console.error('Benchmark failed:', e);
  }
})();
