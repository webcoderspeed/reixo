export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  jitter?: boolean;
  retryCondition?: (error: unknown, attempt: number) => boolean | Promise<boolean>;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

export interface RetryResult<T> {
  result: T;
  attempts: number;
  durationMs: number;
}

export interface QueueOptions {
  concurrency?: number;
  autoStart?: boolean;
  timeoutMs?: number;
}

export interface QueueTask<T> {
  id: string;
  task: () => Promise<T>;
  priority?: number;
  timeoutMs?: number;
}