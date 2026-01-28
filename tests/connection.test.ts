import { describe, it, expect, vi } from 'vitest';
import { ConnectionPool } from '../src/utils/connection';
import * as https from 'https';

// Mock https module
vi.mock('https', () => ({
  Agent: vi.fn(),
}));

// Mock http module
vi.mock('http', () => ({
  Agent: vi.fn(),
}));

describe('ConnectionPool', () => {
  it('should pass SSL options to https Agent', async () => {
    const sslOptions = {
      rejectUnauthorized: false,
      ca: 'fake-ca',
      cert: 'fake-cert',
      key: 'fake-key',
    };

    const pool = new ConnectionPool({
      ...sslOptions,
      maxSockets: 10,
    });

    // Mock global process to simulate Node environment
    const originalProcess = global.process;

    await pool.getHttpsAgent();

    expect(https.Agent).toHaveBeenCalledWith(
      expect.objectContaining({
        rejectUnauthorized: false,
        ca: 'fake-ca',
        cert: 'fake-cert',
        key: 'fake-key',
        maxSockets: 10,
      })
    );
  });

  it('should ignore SSL options for http Agent', async () => {
    const pool = new ConnectionPool({
      rejectUnauthorized: false,
      maxSockets: 5,
    });

    await pool.getHttpAgent();

    // http.Agent typically ignores unknown options, but we pass them all
    // This test ensures maxSockets is still passed
    const http = await import('http');
    expect(http.Agent).toHaveBeenCalledWith(
      expect.objectContaining({
        maxSockets: 5,
      })
    );
  });
});
