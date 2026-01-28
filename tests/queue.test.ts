import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskQueue } from '../src/utils/queue';
import { delay } from '../src/utils/timing';

describe('TaskQueue', () => {
  const createQueue = (options = { concurrency: 2 }) => new TaskQueue(options);

  beforeEach(() => {
    // vi.clearAllMocks(); // If needed
  });

  it('should process tasks with concurrency limit', async () => {
    const queue = createQueue();
    const activeTasks = new Set();
    const maxActive: number[] = [];

    const createTask = (id: number) => async () => {
      activeTasks.add(id);
      maxActive.push(activeTasks.size);
      await delay(50);
      activeTasks.delete(id);
      return id;
    };

    const tasks = [1, 2, 3, 4, 5].map((id) => queue.add(createTask(id)));
    await Promise.all(tasks);

    // Verify concurrency never exceeded 2
    const maxConcurrency = Math.max(...maxActive);
    expect(maxConcurrency).toBeLessThanOrEqual(2);
  });

  it('should respect task priority', async () => {
    const queue = createQueue();
    // Pause queue to accumulate tasks
    queue.pause();
    const executionOrder: number[] = [];

    queue.add(
      async () => {
        executionOrder.push(1);
        return 1;
      },
      { priority: 1 }
    );
    queue.add(
      async () => {
        executionOrder.push(3);
        return 3;
      },
      { priority: 10 }
    ); // Higher priority
    queue.add(
      async () => {
        executionOrder.push(2);
        return 2;
      },
      { priority: 5 }
    );

    queue.resume();
    await delay(100); // Wait for tasks

    expect(executionOrder).toEqual([3, 2, 1]);
  });

  it('should deduplicate tasks', async () => {
    const queue = createQueue();
    const state = { executionCount: 0 };
    const task = async () => {
      state.executionCount++;
      await delay(10);
      return 'done';
    };

    const p1 = queue.add(task, { id: 'unique-task' });
    const p2 = queue.add(task, { id: 'unique-task' });

    await expect(p2).rejects.toThrow();
    await p1;
    expect(state.executionCount).toBe(1);
  });

  it('should pause and resume processing', async () => {
    const queue = createQueue();
    const processed: number[] = [];
    queue.pause();
    expect(queue.isQueuePaused).toBe(true);

    queue.add(async () => {
      processed.push(1);
      return 1;
    });
    queue.add(async () => {
      processed.push(2);
      return 2;
    });

    await delay(20);
    expect(processed).toHaveLength(0);

    queue.resume();
    expect(queue.isQueuePaused).toBe(false);
    await delay(50);
    expect(processed).toHaveLength(2);
  });

  it('should cancel pending tasks', async () => {
    const queue = createQueue();
    queue.pause();
    const taskFn = vi.fn();

    queue.add(taskFn, { id: 'task-1' });
    const cancelled = queue.cancel('task-1');

    expect(cancelled).toBe(true);
    expect(queue.size).toBe(0);

    queue.resume();
    await delay(20);
    expect(taskFn).not.toHaveBeenCalled();
  });

  it('should not cancel running tasks', async () => {
    const queue = createQueue();
    const trigger = { resolve: () => {} };
    const taskPromise = new Promise<void>((r) => (trigger.resolve = r));

    queue.add(
      async () => {
        await taskPromise;
      },
      { id: 'running-task' }
    );

    // Wait for task to start
    await delay(10);

    const cancelled = queue.cancel('running-task');
    expect(cancelled).toBe(false); // Cannot cancel running task

    trigger.resolve();
  });

  it('should clear all pending tasks', async () => {
    const queue = createQueue();
    queue.pause();
    queue.add(async () => 1);
    queue.add(async () => 2);

    expect(queue.size).toBe(2);
    queue.clear();
    expect(queue.size).toBe(0);

    queue.resume();
    // No tasks should run
    await delay(20);
  });

  it('should handle dependencies', async () => {
    const queue = createQueue();
    const executionOrder: string[] = [];

    // Task B depends on Task A
    queue.add(
      async () => {
        executionOrder.push('B');
      },
      { id: 'B', dependencies: ['A'] }
    );
    // Task A has no dependencies
    queue.add(
      async () => {
        executionOrder.push('A');
      },
      { id: 'A' }
    );

    await delay(100);

    expect(executionOrder).toEqual(['A', 'B']);
  });

  it('should emit events', async () => {
    const queue = createQueue();
    const startSpy = vi.fn();
    const completedSpy = vi.fn();
    const drainSpy = vi.fn();

    queue.on('task:start', startSpy);
    queue.on('task:completed', completedSpy);
    queue.on('queue:drain', drainSpy);

    await queue.add(async () => 'result', { id: 'test-task' });

    // Wait for drain event (emitted asynchronously after task completion)
    await delay(10);

    expect(startSpy).toHaveBeenCalledWith({ id: 'test-task' });
    expect(completedSpy).toHaveBeenCalledWith({ id: 'test-task', result: 'result' });
    expect(drainSpy).toHaveBeenCalled();
  });

  it('should handle task errors', async () => {
    const queue = createQueue();
    const errorSpy = vi.fn();
    queue.on('task:error', errorSpy);

    const error = new Error('Task Failed');
    const task = queue.add(async () => {
      throw error;
    });

    await expect(task).rejects.toThrow('Task Failed');
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        error,
      })
    );
  });

  it('should expose active count', async () => {
    const queue = createQueue();
    queue.pause();
    expect(queue.active).toBe(0);

    queue.add(async () => {
      await delay(10);
    });

    queue.resume();
    await delay(1); // Give time for task to start
    expect(queue.active).toBe(1);

    await delay(20);
    expect(queue.active).toBe(0);
  });

  it('should support async iteration', async () => {
    const queue = createQueue();
    const results: number[] = [];

    // Start the iterator consumer first
    const consumer = (async () => {
      for await (const result of queue) {
        results.push(result as number);
        if (results.length === 2) break;
      }
    })();

    // Wait for consumer to be ready (listening for task:added)
    await delay(10);

    // Add tasks one by one to avoid race conditions in the naive iterator implementation
    queue.add(async () => 1);
    await delay(10);
    queue.add(async () => 2);

    await consumer;
    expect(results).toEqual([1, 2]);
  });
});
