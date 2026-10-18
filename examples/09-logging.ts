/**
 * Example 9: Logging
 *
 * Demonstrates ConsoleLogger with different configurations:
 * - Text format for development (with prefix and level filtering)
 * - JSON format for production log aggregators (Datadog, Splunk, etc.)
 * - Header redaction for security-sensitive environments
 * - Custom log level to suppress verbose output
 *
 * Run:  npx tsx examples/09-logging.ts
 */

import { ConsoleLogger, HTTPBuilder, LogLevel, MockAdapter } from '../src';

// ---------------------------------------------------------------------------
// Scenario 1 — Default text logger (INFO level)
// ---------------------------------------------------------------------------

async function demo_defaultLogger(): Promise<void> {
  console.log('\n--- 1. Default text logger (INFO level) ---');

  const logger = new ConsoleLogger(LogLevel.INFO);

  logger.debug('This debug message is suppressed at INFO level');
  logger.info('Server started', { port: 3000 });
  logger.warn('Slow response detected', { url: '/api/data', ms: 2400 });
  logger.error('Request failed', { status: 500 });
}

// ---------------------------------------------------------------------------
// Scenario 2 — Debug logger with prefix
// ---------------------------------------------------------------------------

async function demo_debugLogger(): Promise<void> {
  console.log('\n--- 2. Debug logger with custom prefix ---');

  const logger = new ConsoleLogger({
    level: LogLevel.DEBUG,
    prefix: '[MyApp:HTTP]',
  });

  logger.debug('Cache miss — fetching from origin', { url: '/api/users' });
  logger.info('Request sent', { method: 'GET', url: '/api/users' });
  logger.info('Response received', { status: 200, ms: 142 });
}

// ---------------------------------------------------------------------------
// Scenario 3 — JSON format for log aggregators
// ---------------------------------------------------------------------------

async function demo_jsonLogger(): Promise<void> {
  console.log('\n--- 3. JSON format (production log aggregators) ---');

  const logger = new ConsoleLogger({
    level: LogLevel.WARN,
    format: 'json',
    prefix: 'my-service',
  });

  // These are suppressed — level is WARN
  logger.debug('debug suppressed');
  logger.info('info suppressed');

  // These emit structured JSON
  logger.warn('High error rate detected', { endpoint: '/api/payments', rate: 0.12 });
  logger.error('Circuit breaker opened', { endpoint: '/api/payments', threshold: 5 });
}

// ---------------------------------------------------------------------------
// Scenario 4 — Header redaction
// ---------------------------------------------------------------------------

async function demo_headerRedaction(): Promise<void> {
  console.log('\n--- 4. Sensitive header redaction ---');

  const logger = new ConsoleLogger({
    level: LogLevel.DEBUG,
    prefix: '[secure]',
    redactHeaders: ['Authorization', 'Cookie', 'X-Api-Key'],
  });

  const requestMeta = {
    method: 'GET',
    url: '/api/profile',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.very-secret-token',
      cookie: 'session=abc123; _ga=GA1.1.xyz',
      'x-request-id': 'req-42',
    },
  };

  logger.info('Outgoing request', requestMeta);
  // Output: authorization → [REDACTED], cookie → [REDACTED], x-request-id unchanged
}

// ---------------------------------------------------------------------------
// Scenario 5 — Logger attached to HTTPClient
// ---------------------------------------------------------------------------

async function demo_attachedToClient(): Promise<void> {
  console.log('\n--- 5. Logger attached to HTTPClient ---');

  const mock = new MockAdapter();
  mock.onGet('/api/users').reply(200, [{ id: 1, name: 'Alice' }]);

  const logger = new ConsoleLogger({
    level: LogLevel.DEBUG,
    prefix: '[reixo-demo]',
    redactHeaders: ['Authorization'],
  });

  const client = new HTTPBuilder('https://api.example.com')
    .withTransport(mock.transport)
    .withLogger(logger)
    .withDefaultHeaders({ Authorization: 'Bearer secret-token' })
    .build();

  const res = await client.get<Array<{ id: number; name: string }>>('/api/users');
  console.log('  Users:', res.data.map((u) => u.name).join(', '));
}

// ---------------------------------------------------------------------------
// Scenario 6 — NONE level (silent mode)
// ---------------------------------------------------------------------------

async function demo_silentLogger(): Promise<void> {
  console.log('\n--- 6. NONE level — completely silent ---');

  const logger = new ConsoleLogger(LogLevel.NONE);

  logger.debug('suppressed');
  logger.info('suppressed');
  logger.warn('suppressed');
  logger.error('suppressed');

  console.log('  (No log lines above — all suppressed at NONE level)');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== reixo ConsoleLogger examples ===');

  await demo_defaultLogger();
  await demo_debugLogger();
  await demo_jsonLogger();
  await demo_headerRedaction();
  await demo_attachedToClient();
  await demo_silentLogger();

  console.log('\nAll logging demos complete.');
}

main().catch(console.error);
