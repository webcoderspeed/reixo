import { RetryOptions, RetryResult } from '../types';

/**
 * Executes a function with automatic retry logic based on configuration.
 *
 * @template T The return type of the function
 * @param fn The async function to execute
 * @param options Configuration options for the retry behavior
 * @returns Promise resolving to the result with metadata about attempts and duration
 *
 * @example
 * ```ts
 * const data = await withRetry(() => fetch('/api/data'), {
 *   maxRetries: 3,
 *   backoffFactor: 2
 * });
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const {
    maxRetries = 3,
    initialDelayMs = 100,
    maxDelayMs = 30000,
    backoffFactor = 2,
    jitter = true,
    retryCondition = () => true,
    onRetry,
  } = options;

  const startTime = Date.now();

  const attempt = async (count: number): Promise<RetryResult<T>> => {
    try {
      const result = await fn();
      const durationMs = Date.now() - startTime;
      return { result, attempts: count + 1, durationMs };
    } catch (error) {
      const attempts = count + 1;

      if (attempts > maxRetries) {
        const durationMs = Date.now() - startTime;
        const finalError = error instanceof Error ? error : new Error(String(error));
        Object.assign(finalError, { attempts, durationMs });
        throw finalError;
      }

      const shouldRetry = await retryCondition(error, attempts);
      if (!shouldRetry) {
        const durationMs = Date.now() - startTime;
        const finalError = error instanceof Error ? error : new Error(String(error));
        Object.assign(finalError, { attempts, durationMs });
        throw finalError;
      }

      const delay = calculateDelay(attempts, initialDelayMs, maxDelayMs, backoffFactor, jitter);

      if (onRetry) {
        onRetry(error, attempts, delay);
      }

      await sleep(delay);
      return attempt(attempts);
    }
  };

  return attempt(0);
}

function calculateDelay(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
  backoffFactor: number,
  jitter: boolean
): number {
  const baseDelay = Math.min(initialDelayMs * Math.pow(backoffFactor, attempt - 1), maxDelayMs);

  if (jitter) {
    const jitterAmount = baseDelay * 0.1;
    return baseDelay - jitterAmount + Math.random() * jitterAmount * 2;
  }

  return baseDelay;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
