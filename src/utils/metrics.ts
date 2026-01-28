export interface Metrics {
  requestCount: number;
  errorCount: number;
  /** Total duration of all requests in milliseconds */
  totalLatency: number;
  /** Minimum request duration in milliseconds */
  minLatency: number;
  /** Maximum request duration in milliseconds */
  maxLatency: number;
  /** Timestamp of the last request (Unix timestamp in milliseconds) */
  lastRequestTimestamp: number;
}

export interface RequestMetrics {
  url: string;
  method: string;
  /** Start time (Unix timestamp in milliseconds) */
  startTime: number;
  /** End time (Unix timestamp in milliseconds) */
  endTime: number;
  /** Request duration in milliseconds */
  duration: number;
  status: number;
  success: boolean;
}

/**
 * Collector for HTTP client performance metrics.
 * Tracks latency, error rates, and throughput.
 */
export class MetricsCollector {
  private metrics: Metrics = {
    requestCount: 0,
    errorCount: 0,
    totalLatency: 0,
    minLatency: Infinity,
    maxLatency: 0,
    lastRequestTimestamp: 0,
  };

  private readonly requestLog: RequestMetrics[] = [];
  private readonly maxLogSize: number;
  private onUpdate?: (metrics: Metrics) => void;

  constructor(maxLogSize: number = 100, onUpdate?: (metrics: Metrics) => void) {
    this.maxLogSize = maxLogSize;
    this.onUpdate = onUpdate;
  }

  /**
   * Records a completed request metric.
   */
  public record(metric: Omit<RequestMetrics, 'duration'>): void {
    const duration = metric.endTime - metric.startTime;
    const fullMetric: RequestMetrics = { ...metric, duration };

    // Update aggregate stats
    this.metrics.requestCount++;
    this.metrics.totalLatency += duration;
    this.metrics.minLatency = Math.min(this.metrics.minLatency, duration);
    this.metrics.maxLatency = Math.max(this.metrics.maxLatency, duration);
    this.metrics.lastRequestTimestamp = Date.now();

    if (!metric.success) {
      this.metrics.errorCount++;
    }

    // Add to log
    this.requestLog.push(fullMetric);
    if (this.requestLog.length > this.maxLogSize) {
      this.requestLog.shift(); // Keep log size bounded
    }

    // Notify listeners
    if (this.onUpdate) {
      this.onUpdate({ ...this.metrics });
    }
  }

  /**
   * Returns a snapshot of current aggregate metrics.
   */
  public getSnapshot(): Metrics & { averageLatency: number } {
    const averageLatency =
      this.metrics.requestCount > 0 ? this.metrics.totalLatency / this.metrics.requestCount : 0;

    return {
      ...this.metrics,
      averageLatency,
    };
  }

  /**
   * Returns the list of recent request logs.
   */
  public getRecentRequests(): RequestMetrics[] {
    return [...this.requestLog];
  }

  /**
   * Clears all metrics and logs.
   */
  public clear(): void {
    this.metrics = {
      requestCount: 0,
      errorCount: 0,
      totalLatency: 0,
      minLatency: Infinity,
      maxLatency: 0,
      lastRequestTimestamp: 0,
    };
    this.requestLog.length = 0;
  }
}
