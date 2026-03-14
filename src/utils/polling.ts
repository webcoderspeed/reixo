import { internalError } from './internal-log';
import { delay } from './timing';

/**
 * Options for {@link PollingController} and the {@link poll} helper.
 *
 * @template T The resolved type of each poll result.
 *
 * @example
 * ```ts
 * // Poll until a job completes, with adaptive intervals
 * const { promise, cancel } = poll(
 *   () => client.get<Job>('/jobs/123'),
 *   {
 *     interval: 2000,
 *     until: (res) => res.data.status === 'completed',
 *     adaptiveInterval: (res) =>
 *       res.data.progress < 50 ? 5000 : 1000, // faster near completion
 *     timeout: 60_000,
 *   }
 * );
 *
 * const job = await promise;
 * ```
 */
export interface PollingOptions<T = unknown> {
  /**
   * Base interval between poll attempts, in milliseconds.
   * When `backoff` is enabled this is the *initial* interval.
   * When `adaptiveInterval` is provided this value is used as the fallback
   * for the first attempt only.
   */
  interval: number;

  /**
   * Wall-clock deadline for the entire polling session, in milliseconds.
   * An error is thrown if the deadline is exceeded before the stop condition fires.
   */
  timeout?: number;

  /**
   * Maximum number of total attempts (successes + errors) before giving up.
   * An error is thrown when the limit is reached.
   */
  maxAttempts?: number;

  /**
   * Return `true` to stop polling and resolve the session with the latest result.
   * Alias for the more verbose `stopCondition` option — use whichever reads more naturally.
   *
   * When both `until` and `stopCondition` are provided, **`until` takes precedence**.
   *
   * @example
   * until: (response) => response.data.status === 'completed'
   */
  until?: (data: T) => boolean;

  /**
   * Return `true` to stop polling and resolve the session with the latest
   * result. When omitted polling continues until `timeout` or `maxAttempts`.
   *
   * @deprecated Prefer {@link PollingOptions.until} for clearer intent. Both are supported.
   */
  stopCondition?: (data: T) => boolean;

  /**
   * Dynamic interval calculator. Called after every successful poll with the
   * latest result; the returned value becomes the wait time before the next
   * attempt. Overrides `interval` and `backoff` when present.
   *
   * Useful for polls that should speed up or slow down based on response state
   * (e.g. poll faster as a job approaches 100% completion).
   *
   * @example
   * adaptiveInterval: (response) =>
   *   response.data.progress < 50 ? 5000 : 1000 // slow then fast
   */
  adaptiveInterval?: (data: T) => number;

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
   * Ignored when `adaptiveInterval` is provided.
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

    // Resolve which stop condition to use — `until` takes precedence over `stopCondition`
    const shouldStop = this.options.until ?? this.options.stopCondition;

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

        if (shouldStop && shouldStop(result)) {
          this.stop();
          return result;
        }

        if (!this.isRunning) return;

        // Wait for the current interval, then update it for the NEXT iteration.
        // Order matters: delay uses the interval established on the previous iteration,
        // then we recalculate for the following one (preserves backoff timing).
        await delay(this.currentInterval);

        // Determine next interval:
        // 1. adaptiveInterval takes highest priority (dynamic, response-based)
        // 2. backoff applies exponential growth to the current interval
        // 3. constant interval — no change needed
        if (this.options.adaptiveInterval) {
          this.currentInterval = this.options.adaptiveInterval(result);
        } else if (this.options.backoff) {
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
          internalError('Polling task error:', error);
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
 * Helper function for simple polling.
 *
 * @example
 * ```ts
 * const { promise, cancel } = poll(
 *   () => client.get<JobStatus>('/jobs/42'),
 *   {
 *     interval: 2000,
 *     until: (res) => res.data.status === 'done',
 *     timeout: 120_000,
 *   }
 * );
 *
 * const result = await promise;
 * ```
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
