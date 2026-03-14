/**
 * reixo/sse — Server-Sent Events client
 *
 * @example
 * import { createSSEClient } from 'reixo/sse';
 *
 * const sse = createSSEClient('https://api.example.com/events');
 *
 * for await (const event of sse) {
 *   console.log(event.type, event.data);
 *   if (event.type === 'done') break;
 * }
 */

export type { SSEConfig, SSEEvents } from './core/sse-client';
export { SSEClient } from './core/sse-client';

import type { SSEConfig } from './core/sse-client';
import { SSEClient } from './core/sse-client';

/**
 * Convenience factory — same as `new SSEClient(config)`
 */
export function createSSEClient(config: SSEConfig): SSEClient {
  return new SSEClient(config);
}
