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
   * Resets the limiter to its initial state.
   */
  public reset(): void {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }
}
