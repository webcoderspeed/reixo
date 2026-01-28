import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConsoleLogger, LogLevel } from '../src/utils/logger';
import { HTTPClient } from '../src/core/http-client';
import { MockAdapter } from '../src/utils/mock-adapter';

describe('ConsoleLogger', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    vi.restoreAllMocks(); // Restore first
    mock = new MockAdapter();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('should log info messages', () => {
    const logger = new ConsoleLogger(LogLevel.INFO);
    logger.info('test message');
    expect(console.info).toHaveBeenCalledWith('[INFO] test message', '');
  });

  it('should log warn messages', () => {
    const logger = new ConsoleLogger(LogLevel.WARN);
    logger.warn('test warning');
    expect(console.warn).toHaveBeenCalledWith('[WARN] test warning', '');
  });

  it('should log error messages', () => {
    const logger = new ConsoleLogger(LogLevel.ERROR);
    logger.error('test error');
    expect(console.error).toHaveBeenCalledWith('[ERROR] test error', '');
  });

  it('should respect log levels', () => {
    const logger = new ConsoleLogger(LogLevel.ERROR);
    logger.info('info');
    logger.warn('warn');
    logger.error('error');

    expect(console.info).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it('should integrate with HTTPClient', async () => {
    const logger = new ConsoleLogger(LogLevel.INFO);
    const client = new HTTPClient({
      transport: mock.transport,
      logger,
    });

    mock.onGet('/test').reply(200, { ok: true });

    await client.get('/test');

    expect(console.info).toHaveBeenCalledTimes(2); // Request + Response
    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining('[INFO] Request: GET /test'),
      expect.anything()
    );
    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining('[INFO] Response: 200 OK'),
      expect.anything()
    );
  });

  it('should log errors in HTTPClient', async () => {
    const logger = new ConsoleLogger(LogLevel.ERROR);
    const client = new HTTPClient({
      transport: mock.transport,
      logger,
    });

    mock.onGet('/error').networkError();

    await expect(client.get('/error')).rejects.toThrow();

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('[ERROR] Response Error'),
      expect.anything()
    );
  });
});
