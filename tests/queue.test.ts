import { describe, it, expect, beforeEach } from 'vitest';
import { TaskQueue } from '../src/utils/queue';
import { delay } from '../src/utils/timing';

describe('TaskQueue', () => {
  let queue: TaskQueue;

  beforeEach(() => {
    queue = new TaskQueue({ concurrency: 2 });
  });

  it('should process tasks with concurrency limit', async () => {
    const activeTasks = new Set();
    const maxActive: number[] = [];

    const createTask = (id: number) => async () => {
      activeTasks.add(id);
      maxActive.push(activeTasks.size);
      await delay(50);
      activeTasks.delete(id);
      return id;
    };

    const tasks = [1, 2, 3, 4, 5].map(id => queue.add(createTask(id)));
    await Promise.all(tasks);

    // Verify concurrency never exceeded 2
    const maxConcurrency = Math.max(...maxActive);
    expect(maxConcurrency).toBeLessThanOrEqual(2);
  });

  it('should respect task priority', async () => {
    // Pause queue to accumulate tasks
    queue.pause();
    const executionOrder: number[] = [];

    queue.add(async () => { executionOrder.push(1); return 1; }, { priority: 1 });
    queue.add(async () => { executionOrder.push(3); return 3; }, { priority: 10 }); // Higher priority
    queue.add(async () => { executionOrder.push(2); return 2; }, { priority: 5 });

    queue.resume();
    await delay(100); // Wait for tasks

    expect(executionOrder).toEqual([3, 2, 1]);
  });

  it('should deduplicate tasks', async () => {
    let executionCount = 0;
    const task = async () => {
      executionCount++;
      await delay(10);
      return 'done';
    };

    const p1 = queue.add(task, { id: 'unique-task' });
    const p2 = queue.add(task, { id: 'unique-task' });

    await expect(p2).rejects.toThrow();
    await p1;
    expect(executionCount).toBe(1);
  });
});
