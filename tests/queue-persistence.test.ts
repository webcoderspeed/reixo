import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskQueue } from '../src/utils/queue';
import { MemoryAdapter } from '../src/utils/cache';

describe('Persistent TaskQueue', () => {
  let storage: MemoryAdapter;

  beforeEach(() => {
    storage = new MemoryAdapter();
  });

  it('should save queue to storage when adding tasks', () => {
    const queue = new TaskQueue({ storage, autoStart: false });

    // Do not await because autoStart is false, so tasks won't complete
    queue.add(async () => 'task1', { id: 't1', priority: 1 });
    queue.add(async () => 'task2', { id: 't2', priority: 2 });

    const entry = storage.get('reixo-queue');
    expect(entry).not.toBeNull();
    expect(entry?.data).toHaveLength(2);
    expect((entry?.data as any[])[0].id).toBe('t2'); // Higher priority first
    expect((entry?.data as any[])[1].id).toBe('t1');
  });

  it('should save queue to storage when removing tasks', () => {
    const queue = new TaskQueue({ storage, autoStart: false });

    queue.add(async () => 'task1', { id: 't1' });
    queue.cancel('t1');

    const entry = storage.get('reixo-queue');
    expect(entry).not.toBeNull();
    expect(entry?.data).toHaveLength(0);
  });

  it('should restore queue metadata from storage', async () => {
    // Pre-populate storage
    storage.set('reixo-queue', {
      data: [
        { id: 'restored1', priority: 10 },
        { id: 'restored2', priority: 5 },
      ],
      expiry: Date.now() + 1000,
      createdAt: Date.now(),
    });

    // Create new queue which should load from storage
    const getSpy = vi.spyOn(storage, 'get');
    const queue = new TaskQueue({ storage });

    // Create a promise that resolves when the restoration happens
    const restorationPromise = new Promise<void>((resolve) => {
      queue.on('queue:restored', () => resolve());
    });

    // Wait for async load
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getSpy).toHaveBeenCalledWith('reixo-queue');
  });

  it('should update storage when tasks are processed', async () => {
    const queue = new TaskQueue({ storage, concurrency: 1 });

    await queue.add(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'done';
      },
      { id: 't1' }
    );

    // While t1 is running, it should be removed from pending queue (and thus storage)
    // Wait a bit for it to be picked up
    await new Promise((resolve) => setTimeout(resolve, 5));

    const entry = storage.get('reixo-queue');
    expect(entry?.data).toHaveLength(0);
  });

  it('should save and restore data payload', async () => {
    const queue = new TaskQueue({ storage, autoStart: false });
    const payload = { url: '/api', method: 'POST' };

    queue.add(async () => 'task1', { id: 't1', data: payload });

    const entry = storage.get('reixo-queue');
    expect((entry?.data as any[])[0].data).toEqual(payload);

    // Simulate restore
    const restoredTasks = await new Promise<any[]>((resolve) => {
      const q2 = new TaskQueue({ storage });
      q2.on('queue:restored', (tasks) => resolve(tasks));
    });

    expect(restoredTasks[0].data).toEqual(payload);
  });
});
