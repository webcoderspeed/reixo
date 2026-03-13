import { delay } from './timing';

/**
 * Options for {@link PollingController} and the {@link poll} helper.
 *
 * @template T The resolved type of each poll result.
 *
 * @example
 * const { promise, cancel } = poll(
 *   () => client.get<Order>('/orders/123'),
 *   {
 *     interval: 2000,
 *     timeout: 60_000,
 *     stopCondition: (order) => order.data.status === 'fulfilled',
 *     backoff: { factor: 1.5, maxInterval: 10_000 },
 *   }
 * );
 */
export interface PollingOptions<T = unknown> {
  /**
   * Base interval between poll attempts, in milliseconds.
   * When `backoff` is enabled this is the *initial* interval.
   */
  interval: number;

  /**
   * Wall-clock deadline for the entire polling session, in milliseconds.
   * An error is thrown if the deadline is exceeded before `stopCondition` fires.
   */
  timeout?: number;

  /**
   * Maximum number of total attempts (successes + errors) before giving up.
   * An error is thrown when the limit is reached.
   */
  maxAttempts?: number;

  /**
   * Return `true` to stop polling and resolve the session with the latest
   * result. When omitted polling continues until `timeout` or `maxAttempts`.
   */
  stopCondition?: (data: T) => boolean;

  /**
   * Called when the polling task throws. Receives the error and the current
   * attempt count (including this failed attempt).
   * Return `false` to stop polling and re-throw the error.
   * Any other return value (including `void`) continues polling.
   */
  onError?: (error: unknown, attempts: number) => boolean | void;

  /**
   * Exponential back-off applied to the interval after each attempt.
   * - `true` — use defaults: `factor: 1.5`, `maxInterval: 30_000`
   * - `false` / omitted — constant interval
   * - Object — custom multiplier and ceiling
   *
   * @example
   * backoff: { factor: 2, maxInterval: 30_000 }
   */
  backoff?:
    | boolean
    | {
        /** Multiplier applied after each attempt. @example 1.5 */
        factor: number;
        /** Maximum interval ceiling in milliseconds. @example 30000 */
        maxInterval: number;
      };
}

export class PollingController<T = unknown> {
  private isRunning = false;
  private attempts = 0;
  private currentInterval: number;
  private abortController: AbortController;

  constructor(
    private task: () => Promise<T>,
    private options: PollingOptions<T>
  ) {
    this.currentInterval = options.interval;
    this.abortController = new AbortController();
  }

  public async start(): Promise<T | void> {
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
          return result;
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
        // Always count the failed attempt so maxAttempts is respected
        this.attempts++;

        if (this.options.onError) {
          const shouldContinue = this.options.onError(error, this.attempts);
          if (shouldContinue === false) {
            this.stop();
            throw error;
          }
        } else {
          console.error('Polling task error:', error);
        }

        if (!this.isRunning) return;
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
  options: PollingOptions<T>
): { promise: Promise<T | void>; cancel: () => void } {
  const controller = new PollingController<T>(task, options);
  return {
    promise: controller.start(),
    cancel: () => controller.stop(),
  };
}
