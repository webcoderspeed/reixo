import { BatchProcessor, BatchOptions } from './batch';
import { HTTPOptions, HTTPResponse } from './http';

export interface BatchRequestItem {
  url: string;
  config: HTTPOptions;
}

export interface BatchTransportConfig extends BatchOptions {
  /**
   * Predicate to determine if a request should be batched.
   */
  shouldBatch: (url: string, config: HTTPOptions) => boolean;

  /**
   * Function to execute a batch of requests.
   * Must return an array of responses corresponding to the input items.
   */
  executeBatch: (items: BatchRequestItem[]) => Promise<HTTPResponse<unknown>[]>;
}

export type TransportFunction = <T = unknown>(
  url: string,
  options: HTTPOptions
) => Promise<HTTPResponse<T>>;

/**
 * Creates a transport adapter that automatically groups eligible requests into batches.
 *
 * @param innerTransport The original transport function (e.g., fetch-based transport)
 * @param config Configuration for batching behavior
 * @returns A new transport function that handles batching
 */
export function createBatchTransport(
  innerTransport: TransportFunction,
  config: BatchTransportConfig
) {
  const processor = new BatchProcessor<BatchRequestItem, HTTPResponse<unknown>>(async (items) => {
    return config.executeBatch(items);
  }, config);

  return async <T = unknown>(url: string, options: HTTPOptions): Promise<HTTPResponse<T>> => {
    if (config.shouldBatch(url, options)) {
      // Type assertion is necessary here as the batch processor treats all responses as unknown
      return processor.add({ url, config: options }) as Promise<HTTPResponse<T>>;
    }
    return innerTransport<T>(url, options);
  };
}
