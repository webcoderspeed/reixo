import { delay } from './timing';

export interface PollingOptions {
  interval: number;
  timeout?: number;
  maxAttempts?: number;
  stopCondition?: (data: unknown) => boolean;
  backoff?:
    | boolean
    | {
        factor: number;
        maxInterval: number;
      };
}

export class PollingController {
  private isRunning = false;
  private attempts = 0;
  private currentInterval: number;
  private abortController: AbortController;

  constructor(
    private task: () => Promise<unknown>,
    private options: PollingOptions
  ) {
    this.currentInterval = options.interval;
    this.abortController = new AbortController();
  }

  public async start<T>(): Promise<T | void> {
    this.isRunning = true;
    this.attempts = 0;
    const startTime = Date.now();

    while (this.isRunning) {
      if (this.options.maxAttempts && this.attempts >= this.options.maxAttempts) {
        throw new Error('Max polling attempts reached');
      }

      if (this.options.timeout && Date.now() - startTime > this.options.timeout) {
        throw new Error('Polling timeout reached');
      }

      try {
        const result = await this.task();
        this.attempts++;

        if (this.options.stopCondition && this.options.stopCondition(result)) {
          this.stop();
          return result as T;
        }

        if (!this.isRunning) return;

        await delay(this.currentInterval);

        // Calculate next interval
        if (this.options.backoff) {
          const backoffConfig =
            typeof this.options.backoff === 'object'
              ? this.options.backoff
              : { factor: 1.5, maxInterval: 30000 };

          this.currentInterval = Math.min(
            this.currentInterval * backoffConfig.factor,
            backoffConfig.maxInterval
          );
        }
      } catch (error) {
        // If task fails, decide whether to continue or throw
        // For now, we continue polling unless it's a critical error
        // But in a real scenario, we might want an error handler in options
        console.error('Polling task error:', error);
        await delay(this.currentInterval);
      }
    }
  }

  public stop(): void {
    this.isRunning = false;
    this.abortController.abort();
  }

  public get signal(): AbortSignal {
    return this.abortController.signal;
  }
}

/**
 * Helper function for simple polling
 */
export function poll<T>(
  task: () => Promise<T>,
  options: PollingOptions
): { promise: Promise<T | void>; cancel: () => void } {
  const controller = new PollingController(task as () => Promise<unknown>, options);
  return {
    promise: controller.start<T>(),
    cancel: () => controller.stop(),
  };
}
