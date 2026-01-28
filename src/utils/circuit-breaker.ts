export const CircuitState = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
} as const;

export type CircuitState = (typeof CircuitState)[keyof typeof CircuitState];

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeoutMs?: number;
  halfOpenRetries?: number; // Number of successful requests needed to close the circuit
  fallback?: () => unknown;
  onStateChange?: (state: CircuitState) => void;
}

/**
 * Implements the Circuit Breaker pattern to prevent cascading failures.
 * Tracks failures and opens the circuit when a threshold is reached.
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private successes = 0;
  private nextAttempt = 0;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly halfOpenRetries: number;
  private readonly onStateChange?: (state: CircuitState) => void;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeoutMs = options.resetTimeoutMs || 10000;
    this.halfOpenRetries = options.halfOpenRetries || 3;
    this.onStateChange = options.onStateChange;
  }

  /**
   * Executes a function through the circuit breaker.
   * If the circuit is OPEN, it throws immediately without executing the function.
   *
   * @param fn The async function to execute
   * @returns The result of the function
   * @throws Error if circuit is OPEN or if execution fails
   */
  public async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() > this.nextAttempt) {
        this.transitionTo(CircuitState.HALF_OPEN);
      } else {
        throw new Error('CircuitBreaker: Circuit is OPEN');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  public get currentState(): CircuitState {
    return this.state;
  }

  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;
      if (this.successes >= this.halfOpenRetries) {
        this.transitionTo(CircuitState.CLOSED);
      }
    } else {
      // In CLOSED state, a success resets the failure count (optional, but good practice)
      this.failures = 0;
    }
  }

  private onFailure(): void {
    if (this.state === CircuitState.CLOSED) {
      this.failures++;
      if (this.failures >= this.failureThreshold) {
        this.transitionTo(CircuitState.OPEN);
      }
    } else if (this.state === CircuitState.HALF_OPEN) {
      // If any request fails in HALF_OPEN, go back to OPEN immediately
      this.transitionTo(CircuitState.OPEN);
    }
  }

  private transitionTo(newState: CircuitState): void {
    this.state = newState;

    if (newState === CircuitState.OPEN) {
      this.nextAttempt = Date.now() + this.resetTimeoutMs;
    } else if (newState === CircuitState.CLOSED) {
      this.failures = 0;
      this.successes = 0;
    } else if (newState === CircuitState.HALF_OPEN) {
      this.successes = 0;
    }

    if (this.onStateChange) {
      this.onStateChange(newState);
    }
  }
}
