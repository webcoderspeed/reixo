/**
 * reixo/ws — WebSocket client with auto-reconnect
 *
 * @example
 * import { createWebSocketClient } from 'reixo/ws';
 *
 * const ws = createWebSocketClient('wss://ws.example.com', {
 *   reconnect: { maxAttempts: 10, delay: 1_000 },
 *   onMessage: (msg) => console.log(msg),
 * });
 *
 * ws.send({ type: 'subscribe', channel: 'prices' });
 */

export type { WebSocketConfig, WebSocketEvents } from './core/websocket-client';
export { WebSocketClient } from './core/websocket-client';

import type { WebSocketConfig } from './core/websocket-client';
import { WebSocketClient } from './core/websocket-client';

/**
 * Convenience factory — same as `new WebSocketClient(config)`
 */
export function createWebSocketClient(config: WebSocketConfig): WebSocketClient {
  return new WebSocketClient(config);
}
