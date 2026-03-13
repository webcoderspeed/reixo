/**
 * Example 10: WebSocket Client
 *
 * Demonstrates WebSocketClient for real-time bidirectional communication,
 * including reconnection, heartbeat keep-alive, and typed message handling.
 *
 * The examples use a public echo server (wss://echo.websocket.org) so they
 * work out of the box without a local server.
 *
 * Run:  npx tsx examples/10-websocket.ts
 */

import { WebSocketClient } from '../src';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Scenario 1 — Connect, send a message, receive the echo, then close
// ---------------------------------------------------------------------------

async function demo_echoRoundTrip(): Promise<void> {
  console.log('\n--- 1. Echo round-trip ---');

  return new Promise((resolve, reject) => {
    const ws = new WebSocketClient({
      url: 'wss://echo.websocket.org',
      autoConnect: true,
    });

    ws.on('open', () => {
      console.log('  Connected');
      ws.send('Hello, reixo WebSocket!');
    });

    ws.on('message', (event) => {
      console.log('  Received echo:', event.data);
      ws.close();
    });

    ws.on('close', (_event: CloseEvent) => {
      console.log('  Connection closed');
      resolve();
    });

    ws.on('error', (err) => {
      console.error('  Error:', err);
      reject(err);
    });

    // Safety timeout
    setTimeout(() => {
      ws.close();
      resolve();
    }, 5000);
  });
}

// ---------------------------------------------------------------------------
// Scenario 2 — sendJson() for typed structured messages
// ---------------------------------------------------------------------------

async function demo_sendJson(): Promise<void> {
  console.log('\n--- 2. sendJson() — structured messages ---');

  interface ChatMessage {
    type: 'message' | 'ping';
    room: string;
    text: string;
    timestamp: number;
  }

  return new Promise((resolve) => {
    const ws = new WebSocketClient({ url: 'wss://echo.websocket.org' });
    let received = 0;

    ws.on('open', () => {
      // Send typed object — serialised automatically
      ws.sendJson<ChatMessage>({
        type: 'message',
        room: 'general',
        text: 'Hello from reixo',
        timestamp: Date.now(),
      });
    });

    ws.on('message', (event) => {
      const msg = JSON.parse(event.data as string) as ChatMessage;
      console.log(`  Echo: room=${msg.room}, text="${msg.text}"`);
      received++;
      if (received >= 1) {
        ws.close();
        resolve();
      }
    });

    ws.on('close', (_event: CloseEvent) => resolve());
    setTimeout(resolve, 5000);
  });
}

// ---------------------------------------------------------------------------
// Scenario 3 — Heartbeat keep-alive configuration
// ---------------------------------------------------------------------------

async function demo_heartbeat(): Promise<void> {
  console.log('\n--- 3. Heartbeat / keep-alive ---');

  // This example just shows the configuration pattern.
  // In a real app the heartbeat runs in the background automatically.
  const ws = new WebSocketClient({
    url: 'wss://echo.websocket.org',
    heartbeat: {
      interval: 30_000, // Send a ping every 30 seconds
      message: { type: 'ping' }, // Objects are JSON-serialised automatically
      timeout: 5_000, // Close & reconnect if no reply within 5s
    },
  });

  ws.on('open', () => {
    console.log('  Connected — heartbeat active');
    ws.close();
  });

  await new Promise<void>((resolve) => {
    ws.on('close', (_event: CloseEvent) => resolve());
    setTimeout(resolve, 3000);
  });
}

// ---------------------------------------------------------------------------
// Scenario 4 — Automatic reconnect with backoff
// ---------------------------------------------------------------------------

async function demo_reconnect(): Promise<void> {
  console.log('\n--- 4. Automatic reconnect (config only — not triggered in demo) ---');

  // This client will automatically try to reconnect up to 5 times
  // with exponential back-off if the connection drops unexpectedly.
  const ws = new WebSocketClient({
    url: 'wss://echo.websocket.org',
    reconnect: {
      maxRetries: 5,
      initialDelayMs: 1_000,
      backoffFactor: 2,
      maxDelayMs: 30_000,
    },
  });

  ws.on('reconnect', (attempt) => {
    console.log(`  Reconnect attempt #${attempt}`);
  });

  ws.on('reconnect:fail', (err) => {
    console.error('  All reconnect attempts exhausted:', err);
  });

  ws.on('open', () => {
    console.log('  Connected — reconnect configured');
    ws.close();
  });

  await new Promise<void>((resolve) => {
    ws.on('close', (_event: CloseEvent) => resolve());
    setTimeout(resolve, 3000);
  });
}

// ---------------------------------------------------------------------------
// Scenario 5 — Deferred connection (autoConnect: false)
// ---------------------------------------------------------------------------

async function demo_deferredConnect(): Promise<void> {
  console.log('\n--- 5. Deferred connection (connect on demand) ---');

  const ws = new WebSocketClient({
    url: 'wss://echo.websocket.org',
    autoConnect: false, // Do NOT connect immediately
  });

  console.log('  Client created — not yet connected');
  await sleep(100);

  // Connect explicitly when needed
  console.log('  Calling connect()...');
  ws.connect();

  await new Promise<void>((resolve) => {
    ws.on('open', () => {
      console.log('  Connected on demand');
      ws.close();
    });
    ws.on('close', (_event: CloseEvent) => resolve());
    setTimeout(resolve, 5000);
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== reixo WebSocket examples ===');

  // Note: Echo server may be unavailable in some environments.
  // These examples gracefully timeout if the server is unreachable.

  try {
    await demo_echoRoundTrip();
  } catch {
    console.log('  (Echo server unavailable — skipping round-trip demo)');
  }

  try {
    await demo_sendJson();
  } catch {
    console.log('  (Echo server unavailable — skipping sendJson demo)');
  }

  await demo_heartbeat().catch(() => {});
  await demo_reconnect().catch(() => {});
  await demo_deferredConnect().catch(() => {});

  console.log('\nAll WebSocket demos complete.');
}

main().catch(console.error);
