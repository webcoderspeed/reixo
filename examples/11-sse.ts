/**
 * Example 11: Server-Sent Events (SSE)
 *
 * Demonstrates SSEClient for consuming real-time one-way event streams
 * from a server. SSE is ideal for live feeds, dashboards, and push
 * notifications where you only need server→client updates.
 *
 * The examples connect to Wikipedia's public recent-changes stream,
 * which is available without authentication.
 *
 * Note: SSE requires a browser-compatible EventSource API. In Node.js
 * you may need a polyfill: `npm install eventsource` and then:
 *   global.EventSource = require('eventsource');
 *
 * Run:  npx tsx examples/11-sse.ts
 */

// Uncomment if running in Node.js:
// import EventSource from 'eventsource';
// (global as unknown as Record<string, unknown>).EventSource = EventSource;

import { SSEClient } from '../src';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Scenario 1 — Connect to a public SSE stream and read a few events
// ---------------------------------------------------------------------------

async function demo_publicStream(): Promise<void> {
  console.log('\n--- 1. Wikipedia recent-changes stream ---');

  return new Promise((resolve) => {
    let count = 0;
    const MAX_EVENTS = 3;

    const sse = new SSEClient({
      url: 'https://stream.wikimedia.org/v2/stream/recentchange',
      withCredentials: false,
    });

    sse.on('open', () => {
      console.log('  Connected to Wikipedia stream');
    });

    sse.on('message', (event) => {
      try {
        const data = JSON.parse(event.data) as {
          type: string;
          title: string;
          user: string;
          wiki: string;
        };
        console.log(`  [${data.type}] "${data.title}" by ${data.user} on ${data.wiki}`);
        count++;
        if (count >= MAX_EVENTS) {
          sse.close();
          resolve();
        }
      } catch {
        // Non-JSON messages (e.g. heartbeats) — ignore
      }
    });

    sse.on('error', (err) => {
      console.log('  Stream error (may be normal on close):', err);
      resolve();
    });

    // Safety timeout
    setTimeout(() => {
      sse.close();
      resolve();
    }, 10_000);
  });
}

// ---------------------------------------------------------------------------
// Scenario 2 — Named event types (via addEventListener)
// ---------------------------------------------------------------------------

async function demo_namedEvents(): Promise<void> {
  console.log('\n--- 2. Named event types ---');

  // Many SSE APIs emit named events (e.g. "stockUpdate", "alert", "heartbeat")
  // instead of the default "message" event. Use addEventListener for these.

  // This is a config/API demonstration — pattern only.
  const sse = new SSEClient({
    url: 'https://stream.wikimedia.org/v2/stream/recentchange',
  });

  // Listen for a specific named event type
  sse.addEventListener('message', (event) => {
    console.log('  Named listener received:', (event.data as string).slice(0, 60) + '...');
    sse.close();
  });

  sse.on('error', () => {
    // Silently ignore errors in this short demo
    sse.close();
  });

  await sleep(3000);
  sse.close();
  console.log('  Done.');
}

// ---------------------------------------------------------------------------
// Scenario 3 — Reconnect on stream drop
// ---------------------------------------------------------------------------

async function demo_reconnect(): Promise<void> {
  console.log('\n--- 3. Automatic reconnect configuration ---');

  const sse = new SSEClient({
    url: 'https://stream.wikimedia.org/v2/stream/recentchange',
    reconnect: {
      maxRetries: 5,
      initialDelayMs: 1_000,
      backoffFactor: 2,
      maxDelayMs: 30_000,
    },
  });

  sse.on('reconnect', (attempt) => {
    console.log(`  Reconnect attempt #${attempt}`);
  });

  sse.on('reconnect:fail', (err) => {
    console.error('  All reconnect attempts exhausted:', err.message);
  });

  sse.on('open', () => {
    console.log('  Stream opened (reconnect configured)');
    // Close immediately for demo purposes
    sse.close();
  });

  await sleep(3000);
  console.log('  Done.');
}

// ---------------------------------------------------------------------------
// Scenario 4 — Accumulating live price feed (conceptual)
// ---------------------------------------------------------------------------

async function demo_priceFeed(): Promise<void> {
  console.log('\n--- 4. Live data accumulation pattern ---');

  // This shows the idiomatic pattern for a live price/metric feed.
  // Replace the URL with your own SSE endpoint.
  const prices: Map<string, number> = new Map();

  const sse = new SSEClient({
    url: 'https://stream.wikimedia.org/v2/stream/recentchange',
  });

  let events = 0;

  sse.on('message', (event) => {
    events++;
    try {
      const data = JSON.parse(event.data) as { title: string; namespace: number };
      // Simulate: treat page title as a "ticker", namespace as "price"
      prices.set(data.title.slice(0, 20), data.namespace);
    } catch {
      // ignore parse errors
    }

    if (events >= 5) {
      sse.close();
    }
  });

  sse.on('error', () => sse.close());

  await sleep(8000);
  sse.close();

  console.log(`  Collected ${prices.size} unique entries over ${events} events`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== reixo SSEClient examples ===');
  console.log('(Connects to the Wikipedia recent-changes stream as a demo source)');

  // Check if EventSource is available
  if (typeof EventSource === 'undefined') {
    console.log('\nEventSource is not available in this Node.js environment.');
    console.log('To run SSE examples in Node.js, install a polyfill:');
    console.log('  npm install eventsource');
    console.log('  Then add at the top of this file:');
    console.log("  import EventSource from 'eventsource';");
    console.log('  (global as Record<string, unknown>).EventSource = EventSource;');
    return;
  }

  await demo_publicStream().catch((e) => console.log('  Skipped:', (e as Error).message));
  await demo_namedEvents().catch((e) => console.log('  Skipped:', (e as Error).message));
  await demo_reconnect().catch((e) => console.log('  Skipped:', (e as Error).message));
  await demo_priceFeed().catch((e) => console.log('  Skipped:', (e as Error).message));

  console.log('\nAll SSE demos complete.');
}

main().catch(console.error);
