/**
 * Token Bucket implementation for rate limiting.
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per ms
  private readonly interval: number;

  /**
   * Serializes token acquisition so that concurrent callers cannot both observe
   * the same token and over-consume. Each call chains onto the tail of a promise
   * queue, guaranteeing only one caller runs `_acquireToken` at a time.
   *
   * Without this, two concurrent callers both calling `getTimeToWait()` at the
   * same instant would observe the same "1 token available" state, both sleep
   * for 0 ms, and both call `tryConsume()` — consuming 1 token twice (TOCTOU).
   */
  private acquisitionQueue: Promise<void> = Promise.resolve();

  /**
   * @param limit Maximum number of requests allowed in the interval
   * @param interval Interval in milliseconds
   */
  constructor(limit: number, interval: number) {
    this.maxTokens = limit;
    this.tokens = limit;
    this.interval = interval;
    this.refillRate = limit / interval;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    const newTokens = timePassed * this.refillRate;

    if (newTokens > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
      this.lastRefill = now;
    }
  }

  /**
   * Attempts to consume a token.
   * @returns true if a token was consumed, false otherwise
   */
  public tryConsume(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  /**
   * Returns the time in milliseconds to wait before the next token is available.
   */
  public getTimeToWait(): number {
    this.refill();
    if (this.tokens >= 1) {
      return 0;
    }
    const needed = 1 - this.tokens;
    return Math.ceil(needed / this.refillRate);
  }

  /**
   * Internal: waits for a token and consumes it. Called serially via
   * `acquisitionQueue` so concurrent callers never race on token state.
   */
  private async _acquireToken(): Promise<void> {
    const waitTime = this.getTimeToWait();
    if (waitTime > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, waitTime));
    }
    this.tryConsume();
  }

  /**
   * Waits until a token is available, then consumes it.
   *
   * Thread-safe: concurrent callers are serialised through an internal promise
   * chain so that each caller acquires exactly one token in FIFO order.
   */
  public waitForToken(): Promise<void> {
    // Chain onto the queue — each caller waits for all previous callers to
    // finish acquiring their token before attempting its own acquisition.
    this.acquisitionQueue = this.acquisitionQueue.then(() => this._acquireToken());
    return this.acquisitionQueue;
  }

  /**
   * Resets the limiter to its initial state.
   */
  public reset(): void {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
    this.acquisitionQueue = Promise.resolve();
  }
}
