export interface BatchOptions {
  maxBatchSize?: number;
  batchDelayMs?: number;
}

/**
 * Groups multiple individual calls into a single batch execution.
 * Useful for reducing N+1 API calls or database queries.
 *
 * @template T The type of individual items to be processed
 * @template R The type of the result for each item
 */
export class BatchProcessor<T, R> {
  private queue: { item: T; resolve: (value: R) => void; reject: (reason?: unknown) => void }[] =
    [];
  private timeout: NodeJS.Timeout | null = null;
  private readonly maxBatchSize: number;
  private readonly batchDelayMs: number;
  private readonly processor: (items: T[]) => Promise<R[]>;

  /**
   * Creates a new BatchProcessor instance.
   *
   * @param processor Function that handles a batch of items and returns an array of results
   * @param options Configuration for batch size and delay
   */
  constructor(processor: (items: T[]) => Promise<R[]>, options: BatchOptions = {}) {
    this.processor = processor;
    this.maxBatchSize = options.maxBatchSize || 50;
    this.batchDelayMs = options.batchDelayMs || 50;
  }

  /**
   * Adds an item to the batch queue.
   *
   * @param item The item to process
   * @returns Promise resolving to the result for this specific item
   */
  public add(item: T): Promise<R> {
    return new Promise((resolve, reject) => {
      this.queue.push({ item, resolve, reject });

      if (this.queue.length >= this.maxBatchSize) {
        this.flush();
      } else if (!this.timeout) {
        this.timeout = setTimeout(() => this.flush(), this.batchDelayMs);
      }
    });
  }

  private async flush(): Promise<void> {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }

    if (this.queue.length === 0) return;

    const currentBatch = this.queue.splice(0, this.maxBatchSize);
    const items = currentBatch.map((b) => b.item);

    try {
      const results = await this.processor(items);

      if (results.length !== items.length) {
        throw new Error('Batch processor result length mismatch');
      }

      currentBatch.forEach((batchItem, index) => {
        batchItem.resolve(results[index]);
      });
    } catch (error) {
      currentBatch.forEach((batchItem) => {
        batchItem.reject(error);
      });
    }
  }
}
