import { http } from './http';

export interface UploadOptions {
  chunkSize?: number; // Size of each chunk in bytes (default: 1MB)
  retries?: number; // Number of retries per chunk
  headers?: Record<string, string>;
  onProgress?: (progress: { uploaded: number; total: number; percentage: number }) => void;
  parallel?: number; // Number of parallel chunk uploads (default: 1)
}

export class ResumableUploader {
  private readonly chunkSize: number;
  private readonly retries: number;
  private readonly parallel: number;

  constructor(options: UploadOptions = {}) {
    this.chunkSize = options.chunkSize || 1024 * 1024; // 1MB
    this.retries = options.retries || 3;
    this.parallel = options.parallel || 1;
  }

  public async upload(url: string, file: File | Blob, options: UploadOptions = {}): Promise<void> {
    const totalSize = file.size;
    let uploadedSize = 0;
    const totalChunks = Math.ceil(totalSize / this.chunkSize);
    const chunks: { start: number; end: number; index: number }[] = [];

    for (let i = 0; i < totalChunks; i++) {
      const start = i * this.chunkSize;
      const end = Math.min(start + this.chunkSize, totalSize);
      chunks.push({ start, end, index: i });
    }

    // Process chunks
    // For simplicity, let's do sequential or parallel limited
    // We'll use a pool if parallel > 1

    // Merge instance options with call options
    const onProgress = options.onProgress;
    const requestHeaders = options.headers || {};

    const uploadChunk = async (chunkInfo: { start: number; end: number; index: number }) => {
      const chunk = file.slice(chunkInfo.start, chunkInfo.end);

      const headers = {
        ...requestHeaders,
        'Content-Type': 'application/octet-stream',
        'Content-Range': `bytes ${chunkInfo.start}-${chunkInfo.end - 1}/${totalSize}`,
      };

      await http(url, {
        method: 'PUT', // or POST, usually PUT for chunks
        body: chunk,
        headers,
        retry: { maxRetries: this.retries },
      });

      uploadedSize += chunk.size;
      if (onProgress) {
        onProgress({
          uploaded: uploadedSize,
          total: totalSize,
          percentage: Math.round((uploadedSize / totalSize) * 100),
        });
      }
    };

    if (this.parallel > 1) {
      // Simple parallel implementation
      // Note: Real parallel uploads might need a more robust queue
      // But for now, let's just batch them or use a semaphore-like approach?
      // Or just Promise.all if parallel is high (but browsers limit connections)
      // Let's implement a sliding window
      await this.processInBatches(chunks, uploadChunk, this.parallel);
    } else {
      for (const chunk of chunks) {
        await uploadChunk(chunk);
      }
    }
  }

  private async processInBatches<T>(
    items: T[],
    processor: (item: T) => Promise<void>,
    batchSize: number
  ) {
    const queue = [...items];
    const activeWorkers: Promise<void>[] = [];

    while (queue.length > 0 || activeWorkers.length > 0) {
      while (queue.length > 0 && activeWorkers.length < batchSize) {
        const item = queue.shift()!;
        const worker = processor(item).then(() => {
          const index = activeWorkers.indexOf(worker);
          if (index > -1) {
            activeWorkers.splice(index, 1);
          }
        });
        activeWorkers.push(worker);
      }

      if (activeWorkers.length > 0) {
        // Wait for at least one to finish
        await Promise.race(activeWorkers);
      }
    }
  }
}
