import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskQueue } from '../src/utils/queue';

describe('TaskQueue Priority & Inheritance', () => {
  let queue: TaskQueue;

  beforeEach(() => {
    queue = new TaskQueue({ concurrency: 1, autoStart: false });
  });

  afterEach(() => {
    queue.clear();
  });

  it('should execute high priority tasks before low priority tasks', async () => {
    const executionOrder: string[] = [];
    const createTask = (id: string) => async () => {
      executionOrder.push(id);
      return id;
    };

    // Add tasks in reverse priority order
    queue.add(createTask('low'), { id: 'low', priority: 1 });
    queue.add(createTask('medium'), { id: 'medium', priority: 5 });
    queue.add(createTask('high'), { id: 'high', priority: 10 });

    queue.resume();

    // Wait for all to finish
    await new Promise((resolve) => {
      let count = 0;
      queue.on('task:completed', () => {
        count++;
        if (count === 3) resolve(null);
      });
    });

    expect(executionOrder).toEqual(['high', 'medium', 'low']);
  });

  it('should support priority inheritance for dependencies', async () => {
    // Scenario:
    // Task A (Low Priority)
    // Task B (High Priority) depends on Task A
    // Expected: Task A should be boosted to High Priority and run before other Medium tasks.

    const executionOrder: string[] = [];
    const createTask = (id: string) => async () => {
      executionOrder.push(id);
      return id;
    };

    queue.add(createTask('dependent-low'), { id: 'dependent-low', priority: 1 });
    queue.add(createTask('medium'), { id: 'medium', priority: 5 });

    // Add high priority task that depends on low priority one
    queue.add(createTask('high-parent'), {
      id: 'high-parent',
      priority: 10,
      dependencies: ['dependent-low'],
    });

    queue.resume();

    await new Promise((resolve) => {
      let count = 0;
      queue.on('task:completed', () => {
        count++;
        if (count === 3) resolve(null);
      });
    });

    // Without inheritance: medium (5) -> dependent-low (1) -> high-parent (10) [blocked]
    // With inheritance: dependent-low (boosted to 10) -> high-parent (10) -> medium (5)
    // OR: dependent-low (10) -> medium (5) -> high-parent (10) [if blocked by dep]
    // Wait, high-parent depends on dependent-low. So high-parent CANNOT run until dependent-low finishes.
    // So correct order with inheritance:
    // 1. dependent-low (boosted to 10) - runs first because it's effectively 10.
    // 2. high-parent (10) - runs second because it's 10 (or maybe medium runs if sorts are unstable, but medium is 5).
    // 3. medium (5).

    expect(executionOrder).toEqual(['dependent-low', 'high-parent', 'medium']);
  });

  it('should handle multi-level priority inheritance', async () => {
    // C (High) -> B (Low) -> A (Low)
    // A should be boosted to High
    const executionOrder: string[] = [];
    const createTask = (id: string) => async () => {
      executionOrder.push(id);
      return id;
    };

    queue.add(createTask('A'), { id: 'A', priority: 1 });
    queue.add(createTask('B'), { id: 'B', priority: 1, dependencies: ['A'] });
    queue.add(createTask('Medium'), { id: 'Medium', priority: 5 });
    queue.add(createTask('C'), { id: 'C', priority: 10, dependencies: ['B'] });

    queue.resume();

    await new Promise((resolve) => {
      let count = 0;
      queue.on('task:completed', () => {
        count++;
        if (count === 4) resolve(null);
      });
    });

    // A boosted to 10, B boosted to 10.
    // Order: A -> B -> C -> Medium
    expect(executionOrder).toEqual(['A', 'B', 'C', 'Medium']);
  });
});
