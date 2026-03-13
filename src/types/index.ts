/**
 * Controls how and when a failed request is retried.
 *
 * @example
 * const retry: RetryOptions = {
 *   maxRetries: 3,
 *   initialDelayMs: 200,
 *   backoffFactor: 2,   // delays: 200 → 400 → 800 ms
 *   jitter: true,
 * };
 */
export interface RetryOptions {
  /**
   * Maximum number of retry attempts after the initial failure.
   * @default 3
   */
  maxRetries?: number;

  /**
   * Delay before the first retry, in milliseconds. Subsequent delays are
   * multiplied by `backoffFactor`.
   * @default 100
   */
  initialDelayMs?: number;

  /**
   * Upper bound for the computed retry delay, in milliseconds. Prevents
   * exponential back-off from growing unbounded.
   * @default 30000
   */
  maxDelayMs?: number;

  /**
   * Multiplier applied to the delay after each attempt (exponential back-off).
   * With `initialDelayMs: 100` and `backoffFactor: 2` the delays are
   * 100 ms → 200 ms → 400 ms …
   * @default 2
   */
  backoffFactor?: number;

  /**
   * Add random jitter (±50 % of the computed delay) to avoid thundering-herd
   * problems when many clients retry simultaneously.
   * @default false
   */
  jitter?: boolean;

  /**
   * Return `true` to retry the attempt, `false` to abort immediately.
   * When omitted the default logic retries on 5xx, 429, and 408 responses
   * and on network errors, but never on `AbortError`.
   */
  retryCondition?: (error: unknown, attempt: number) => boolean | Promise<boolean>;

  /**
   * Called immediately before each retry attempt. Useful for logging or
   * updating UI state.
   * @param error   The error that triggered the retry.
   * @param attempt The current attempt number (1 = first retry).
   * @param delayMs How long the client will wait before this attempt.
   */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

/** Internal result envelope returned by {@link withRetry}. */
export interface RetryResult<T> {
  result: T;
  /** Total number of attempts made (1 = succeeded on first try). */
  attempts: number;
  /** Wall-clock duration of all attempts combined, in milliseconds. */
  durationMs: number;
}

/** Options for the generic in-memory task queue. */
export interface QueueOptions {
  /**
   * Maximum number of tasks that may run concurrently.
   * @default 1
   */
  concurrency?: number;

  /**
   * Start processing tasks automatically as they are enqueued.
   * Set to `false` to batch tasks and start manually.
   * @default true
   */
  autoStart?: boolean;

  /**
   * Per-task timeout in milliseconds. Tasks that exceed this limit are
   * rejected with a timeout error.
   */
  timeoutMs?: number;
}

/** A unit of work managed by the offline task queue. */
export interface QueueTask<T> {
  /** Unique identifier for this task (used for deduplication and ordering). */
  id: string;
  /** Async function that performs the work. */
  task: () => Promise<T>;
  /** Higher values are processed first. @default 0 */
  priority?: number;
  /** Per-task timeout override. */
  timeoutMs?: number;
  /** IDs of tasks that must complete before this task runs. */
  dependencies?: string[];
  /** Serialisable payload persisted alongside the task for queue recovery. */
  data?: unknown;
}
