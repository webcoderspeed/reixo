import type { HTTPOptions, HTTPResponse } from '../src';
import { Reixo } from '../src';
import { ConsoleLogger, LogLevel } from '../src/utils/logger';

/**
 * Example 6: Interceptors & Logging
 * Demonstrates how to modify requests/responses and use custom loggers.
 */

async function runInterceptorsDemo() {
  console.log('🚀 Running Interceptors & Logging Demo\n');

  // 1. Setup Custom Logger
  const logger = new ConsoleLogger(LogLevel.INFO); // Show INFO and above

  // 2. Setup Client with Interceptors
  const client = new Reixo.HTTPBuilder('https://jsonplaceholder.typicode.com')
    // Add Request Interceptor (e.g., Auth Token)
    .addRequestInterceptor(
      (config: HTTPOptions) => {
        logger.info(`[Interceptor] Adding Authorization header to ${config.method} ${config.url}`);
        const headers = {
          ...(config.headers as Record<string, string>),
          Authorization: 'Bearer secret-token',
        };
        return { ...config, headers };
      },
      (error: unknown) => {
        logger.error('[Interceptor] Request Error', error instanceof Error ? error : undefined);
        return Promise.reject(error);
      }
    )
    // Add Response Interceptor (e.g., Transform Data)
    .addResponseInterceptor(
      (response: HTTPResponse<unknown>) => {
        logger.info(`[Interceptor] Received Status: ${response.status}`);
        // Example: Add a timestamp to the response data
        if (response.data && typeof response.data === 'object') {
          (response.data as Record<string, unknown>)['_receivedAt'] = new Date().toISOString();
        }
        return response;
      },
      (error: unknown) => {
        logger.warn('[Interceptor] Response Error', error instanceof Error ? error : undefined);
        return Promise.reject(error);
      }
    )
    .build();

  // 3. Make a Request
  console.log('--- Making Request ---');
  try {
    const response = await client.get<{ id: number; title: string; _receivedAt?: string }>(
      '/posts/1'
    );
    console.log('✅ Response Data:', response.data);
    console.log('🕒 Received At:', response.data._receivedAt);
  } catch (error) {
    console.error('❌ Request Failed:', error);
  }

  console.log('\n✅ Interceptors Demo Finished');
}

runInterceptorsDemo();
