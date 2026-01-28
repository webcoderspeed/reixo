import { QueueOptions, QueueTask } from '../types';
import { EventEmitter } from './emitter';

export class TaskQueue extends EventEmitter {
  private queue: QueueTask<unknown>[] = [];
  private activeTaskIds = new Set<string>();
  private completedTasks = new Set<string>();
  private activeCount = 0;
  private isPaused = false;
  private readonly concurrency: number;
  private readonly autoStart: boolean;

  constructor(options: QueueOptions = {}) {
    super();
    this.concurrency = options.concurrency || 3;
    this.autoStart = options.autoStart ?? true;
  }

  public add<T>(fn: () => Promise<T>, options: { priority?: number; id?: string; dependencies?: string[] } = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = options.id || Math.random().toString(36).substring(7);

      // Check for duplicates
      const existingPending = this.queue.find(t => t.id === id);
      const existingActive = this.activeTaskIds.has(id);
      
      if (existingPending || existingActive) {
        reject(new Error(`Task with ID ${id} is already in the queue or running`));
        return;
      }

      const task: QueueTask<unknown> = {
        id,
        task: async () => {
          this.emit('task:start', { id });
          try {
            const result = await fn();
            this.completedTasks.add(id);
            this.emit('task:completed', { id, result });
            resolve(result);
            return result;
          } catch (error) {
            this.emit('task:error', { id, error });
            reject(error);
            throw error;
          }
        },
        priority: options.priority || 0,
        dependencies: options.dependencies,
      };

      this.queue.push(task);
      this.sortQueue();
      this.emit('task:added', { id, priority: task.priority });

      if (this.autoStart && !this.isPaused) {
        this.processNext();
      }
    });
  }

  public cancel(taskId: string): boolean {
    const index = this.queue.findIndex(t => t.id === taskId);
    if (index !== -1) {
      this.queue.splice(index, 1);
      this.emit('task:cancelled', { id: taskId });
      return true;
    }
    return false;
  }

  public pause(): void {
    this.isPaused = true;
    this.emit('queue:paused');
  }

  public resume(): void {
    this.isPaused = false;
    this.emit('queue:resumed');
    this.processNext();
  }

  public clear(): void {
    this.queue = [];
    this.completedTasks.clear();
    this.emit('queue:cleared');
  }

  public get size(): number {
    return this.queue.length;
  }

  public get active(): number {
    return this.activeCount;
  }

  public get isQueuePaused(): boolean {
    return this.isPaused;
  }

  public async *[Symbol.asyncIterator](): AsyncIterator<unknown> {
    while (true) {
      if (this.queue.length === 0 && this.activeCount === 0) {
        await new Promise<void>((resolve) => {
          const onAdd = () => {
            cleanup();
            resolve();
          };
          const cleanup = () => {
            this.off('task:added', onAdd);
          };
          this.on('task:added', onAdd);
        });
      }

      // This implementation is a bit naive for a concurrent queue because 
      // we might miss events if we are not listening.
      // Ideally we should have a buffer of completed results.
      // But for now let's just wait for the next completion.
      
      const result = await new Promise((resolve) => {
        this.once('task:completed', (arg: unknown) => {
          const { result } = arg as { result: unknown };
          resolve(result);
        });
      });
      yield result;
    }
  }

  private sortQueue(): void {
    // Sort by priority (higher number = higher priority)
    this.queue.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  private async processNext(): Promise<void> {
    if (this.isPaused || this.activeCount >= this.concurrency || this.queue.length === 0) {
      if (this.queue.length === 0 && this.activeCount === 0) {
        this.emit('queue:drain');
      }
      return;
    }

    // Find the first task that has all dependencies met
    const taskIndex = this.queue.findIndex(task => {
      if (!task.dependencies || task.dependencies.length === 0) return true;
      return task.dependencies.every(depId => this.completedTasks.has(depId));
    });

    if (taskIndex === -1) {
      // No runnable tasks found (waiting for dependencies)
      return;
    }

    this.activeCount++;
    const [nextTask] = this.queue.splice(taskIndex, 1);
    
    if (nextTask) {
      this.activeTaskIds.add(nextTask.id);
      try {
        await nextTask.task();
      } catch {
        // Error is handled in the task wrapper
      } finally {
        this.activeTaskIds.delete(nextTask.id);
        this.activeCount--;
        this.processNext();
      }
    }
  }
}
