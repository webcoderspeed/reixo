import { describe, it, expect, vi } from 'vitest';
import { HTTPClient } from '../src/core/http-client';
import { NetworkRecorder } from '../src/utils/recorder';

describe('NetworkRecorder', () => {
  it('should record requests when active', async () => {
    const transport = vi.fn().mockImplementation((url, options) =>
      Promise.resolve({
        status: 200,
        data: { success: true },
        headers: new Headers({ 'content-type': 'application/json' }),
        config: { ...options, url },
      })
    );

    const client = new HTTPClient({ transport: transport as any });
    const recorder = new NetworkRecorder(client);

    recorder.start();
    await client.request('/test', { method: 'POST', body: JSON.stringify({ foo: 'bar' }) });
    recorder.stop();

    const records = recorder.getRecords();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      url: '/test',
      method: 'POST',
      status: 200,
      responseBody: { success: true },
    });
  });

  it('should not record when stopped', async () => {
    const transport = vi.fn().mockResolvedValue({ status: 200, data: {}, headers: new Headers() });
    const client = new HTTPClient({ transport: transport as any });
    const recorder = new NetworkRecorder(client);

    // recorder is not started
    await client.request('/test');

    expect(recorder.getRecords()).toHaveLength(0);
  });

  it('should generate fixtures JSON', async () => {
    const transport = vi.fn().mockImplementation((url, options) =>
      Promise.resolve({
        status: 200,
        data: { id: 1 },
        headers: new Headers(),
        config: { ...options, url },
      })
    );

    const client = new HTTPClient({ transport: transport as any });
    const recorder = new NetworkRecorder(client);

    recorder.start();
    await client.request('/api/users');
    recorder.stop();

    const fixtures = JSON.parse(recorder.generateFixtures());
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0]).toEqual({
      url: '/api/users',
      method: 'GET',
      status: 200,
      response: { id: 1 },
    });
  });

  it('should clear records', async () => {
    const transport = vi.fn().mockImplementation((url, options) =>
      Promise.resolve({
        status: 200,
        data: {},
        headers: new Headers(),
        config: { ...options, url },
      })
    );
    const client = new HTTPClient({ transport: transport as any });
    const recorder = new NetworkRecorder(client);

    recorder.start();
    await client.request('/test');
    expect(recorder.getRecords()).toHaveLength(1);

    recorder.clear();
    expect(recorder.getRecords()).toHaveLength(0);
  });
});
