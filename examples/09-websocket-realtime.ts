import { Reixo } from '../src';

// Example: Real-time Crypto Price Tracker using WebSocket
async function main() {
  console.log('🚀 Starting WebSocket Client Example...');

  // Initialize WebSocket Client
  const ws = new Reixo.WebSocketClient({
    url: 'wss://echo.websocket.org', // Using echo server for demo
    reconnect: {
      maxRetries: 5,
      initialDelayMs: 1000,
      backoffFactor: 1.5,
      maxDelayMs: 10000,
    },
    heartbeat: {
      interval: 15000,
      message: JSON.stringify({ type: 'ping' }),
      timeout: 5000,
    },
  });

  // Event Listeners
  ws.on('open', () => {
    console.log('✅ Connected to WebSocket Server');

    // Subscribe to channels after connection
    ws.send(
      JSON.stringify({
        type: 'subscribe',
        channels: ['btc-usd', 'eth-usd'],
      })
    );
  });

  ws.on('message', (data) => {
    try {
      // Parse if string, otherwise use as is
      const message = typeof data === 'string' ? JSON.parse(data) : data;
      console.log('📩 Received:', message);
    } catch {
      console.log('📩 Received raw:', data);
    }
  });

  ws.on('close', (event) => {
    console.log(`🔌 Disconnected (Code: ${event.code}, Reason: ${event.reason})`);
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket Error:', error);
  });

  ws.on('reconnect', (attempt) => {
    console.log(`🔄 Reconnecting... (Attempt ${attempt})`);
  });

  ws.on('reconnect:fail', (error) => {
    console.error('💥 Max reconnection attempts reached:', error);
  });

  // Connect
  ws.connect();

  // Simulate some interactions
  setTimeout(() => {
    console.log('📤 Sending update...');
    ws.send(JSON.stringify({ type: 'update', data: { timestamp: Date.now() } }));
  }, 2000);

  // Close after 10 seconds
  setTimeout(() => {
    console.log('🛑 Closing connection...');
    ws.close();
  }, 10000);
}

if (require.main === module) {
  main().catch(console.error);
}
