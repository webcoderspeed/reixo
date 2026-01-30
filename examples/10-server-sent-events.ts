import { Reixo } from '../src';

// Example: Real-time News Feed using Server-Sent Events (SSE)
async function main() {
  console.log('🚀 Starting SSE Client Example...');

  // Initialize SSE Client
  const sse = new Reixo.SSEClient({
    url: 'https://stream.wikimedia.org/v2/stream/recentchange', // Public Wikipedia stream
    withCredentials: false,
    reconnect: {
      maxRetries: 10,
      initialDelayMs: 1000,
      backoffFactor: 2,
    },
  });

  // Event Listeners
  sse.on('open', () => {
    console.log('✅ Connected to SSE Stream');
  });

  sse.on('message', (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log(`📰 [${data.type}] ${data.title} (${data.user})`);
    } catch (e) {
      console.log('📩 Received raw:', event.data);
    }
  });

  sse.on('error', (event) => {
    console.error('❌ SSE Error:', event);
  });

  sse.on('reconnect', (attempt) => {
    console.log(`🔄 Reconnecting... (Attempt ${attempt})`);
  });

  sse.on('reconnect:fail', (error) => {
    console.error('💥 Max reconnection attempts reached:', error);
  });

  // Connect
  sse.connect();

  // Close after 15 seconds
  setTimeout(() => {
    console.log('🛑 Closing connection...');
    sse.close();
  }, 15000);
}

if (require.main === module) {
  main().catch(console.error);
}
