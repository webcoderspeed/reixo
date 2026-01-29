import { delay } from './timing';

export interface ChaosOptions {
  enabled?: boolean;
  latency?: number | { min: number; max: number }; // ms
  errorRate?: number; // 0.0 to 1.0 (probability of error)
  failWith?: Error | ((url: string) => Error); // Custom error or factory
}

export class ChaosSimulator {
  constructor(private readonly options: ChaosOptions) {}

  public async simulate(url: string): Promise<void> {
    if (!this.options.enabled) return;

    // Simulate Latency
    if (this.options.latency) {
      const delayMs =
        typeof this.options.latency === 'number'
          ? this.options.latency
          : Math.floor(Math.random() * (this.options.latency.max - this.options.latency.min + 1)) +
            this.options.latency.min;

      if (delayMs > 0) {
        await delay(delayMs);
      }
    }

    // Simulate Errors
    if (this.options.errorRate) {
      const shouldError = Math.random() < this.options.errorRate;
      if (shouldError) {
        if (this.options.failWith) {
          throw typeof this.options.failWith === 'function'
            ? this.options.failWith(url)
            : this.options.failWith;
        } else {
          throw new Error(`Chaos: Simulated network failure for ${url}`);
        }
      }
    }
  }
}
