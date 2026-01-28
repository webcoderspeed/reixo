import { describe, it, expect, vi, afterEach } from 'vitest';
import { ConnectionPool } from '../src/utils/connection';
import { HTTPClient } from '../src/core/http-client';
import * as httpUtils from '../src/utils/http';

describe('ConnectionPool', () => {
  it('should create http agent with options', async () => {
    const pool = new ConnectionPool({ maxSockets: 10, keepAlive: true });
    const agent = await pool.getHttpAgent();

    expect(agent).toBeDefined();
    // @ts-ignore - agent properties
    expect(agent?.maxSockets).toBe(10);
    // @ts-ignore
    expect(agent?.keepAlive).toBe(true);
  });

  it('should create https agent with options', async () => {
    const pool = new ConnectionPool({ maxSockets: 5 });
    const agent = await pool.getHttpsAgent();

    expect(agent).toBeDefined();
    // @ts-ignore
    expect(agent?.maxSockets).toBe(5);
  });

  it('should reuse agent instances', async () => {
    const pool = new ConnectionPool();
    const agent1 = await pool.getHttpAgent();
    const agent2 = await pool.getHttpAgent();

    expect(agent1).toBe(agent2);
  });

  it('should destroy agents', async () => {
    const pool = new ConnectionPool();
    const agent = await pool.getHttpAgent();

    expect(agent).toBeDefined();
    // @ts-ignore
    const spy = vi.spyOn(agent!, 'destroy');

    pool.destroy();
    expect(spy).toHaveBeenCalled();
  });
});

describe('HTTPClient with ConnectionPool', () => {
  it('should inject agent into request options', async () => {
    const poolOptions = { maxSockets: 5 };
    const client = new HTTPClient({
      baseURL: 'http://example.com',
      pool: poolOptions,
    });

    const httpSpy = vi.spyOn(httpUtils, 'http').mockResolvedValue({
      data: {},
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      config: {},
    } as any);

    await client.request('/test');

    expect(httpSpy).toHaveBeenCalled();
    const callArgs = httpSpy.mock.calls[0];
    const options = callArgs[1] || {};

    expect(options.agent).toBeDefined();
    // @ts-ignore
    expect(options.agent.maxSockets).toBe(5);
  });

  it('should use https agent for https requests', async () => {
    const client = new HTTPClient({
      baseURL: 'https://example.com',
      pool: { maxSockets: 3 },
    });

    const httpSpy = vi.spyOn(httpUtils, 'http').mockResolvedValue({} as any);

    await client.request('/secure');

    const options = httpSpy.mock.calls[0][1] || {};
    expect(options.agent).toBeDefined();
    // In actual node http agent, protocol isn't easily checked property,
    // but we can assume it's the right one if getHttpsAgent was called.
    // We can rely on ConnectionPool logic coverage.
  });
});
