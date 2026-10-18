import { EventEmitter } from './emitter';

export interface NetworkMonitorOptions {
  checkInterval?: number; // Polling interval in ms (for non-browser environments)
  /**
   * URL to HEAD-ping for active connectivity checks.
   *
   * ⚠️  The old default `'https://www.google.com'` caused CORS failures in browsers
   * and was unreliable in restricted networks (China, corporate firewalls).
   * The new default `/favicon.ico` is same-origin and requires no CORS headers.
   *
   * Override with a CORS-permissive health endpoint owned by you if you need
   * cross-origin connectivity checks.
   *
   * @default '/favicon.ico'
   */
  pingUrl?: string;
}

export type NetworkEvents = {
  online: [];
  offline: [];
};

export class NetworkMonitor extends EventEmitter<NetworkEvents> {
  private static _instance: NetworkMonitor | undefined;
  private isOnline: boolean = true;
  private checkIntervalId: ReturnType<typeof setInterval> | null = null;

  /**
   * URL used for active connectivity checks.
   * Defaults to `/favicon.ico` (same-origin, no CORS needed).
   * Override via `configure({ pingUrl: '...' })` or the constructor.
   */
  private pingUrl: string;

  // Bound handlers stored so they can be removed in destroy()
  private readonly _onlineBound = () => this.handleOnline();
  private readonly _offlineBound = () => this.handleOffline();

  constructor(options: NetworkMonitorOptions = {}) {
    super();
    // Default to same-origin /favicon.ico to avoid CORS issues with google.com
    this.pingUrl = options.pingUrl ?? '/favicon.ico';

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      this.isOnline = navigator.onLine;
      window.addEventListener('online', this._onlineBound);
      window.addEventListener('offline', this._offlineBound);
    }

    if (options.checkInterval) {
      this.startPolling(options.checkInterval);
    }
  }

  /**
   * Returns the shared singleton instance.
   *
   * For testing or environments that need isolated instances, instantiate
   * `new NetworkMonitor()` directly and call `.destroy()` when done.
   */
  public static getInstance(): NetworkMonitor {
    if (!NetworkMonitor._instance) {
      NetworkMonitor._instance = new NetworkMonitor();
    }
    return NetworkMonitor._instance;
  }

  /**
   * Destroy the singleton and reset the cached reference.
   * Useful between test cases to prevent state bleed.
   */
  public static resetInstance(): void {
    if (NetworkMonitor._instance) {
      NetworkMonitor._instance.destroy();
      NetworkMonitor._instance = undefined;
    }
  }

  public configure(options: NetworkMonitorOptions): void {
    if (options.pingUrl) {
      this.pingUrl = options.pingUrl;
    }
    if (options.checkInterval) {
      this.startPolling(options.checkInterval);
    }
  }

  public startPolling(interval: number): void {
    this.stopPolling();
    this.checkIntervalId = setInterval(() => {
      this.checkConnection().catch(() => {
        /* network check failures are non-fatal */
      });
    }, interval);
  }

  public stopPolling(): void {
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
    }
  }

  /**
   * Release all resources held by this monitor:
   * - Stops the polling interval
   * - Removes `window.online` / `window.offline` event listeners
   *
   * Call this when the monitor is no longer needed to prevent memory leaks,
   * particularly in SSR environments, tests, or hot-reload scenarios.
   */
  public destroy(): void {
    this.stopPolling();
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('online', this._onlineBound);
      window.removeEventListener('offline', this._offlineBound);
    }
  }

  private async checkConnection(): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      // Use global fetch (assumed to be available or polyfilled)
      await fetch(this.pingUrl, {
        method: 'HEAD',
        cache: 'no-store',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Any HTTP response (including 5xx) means the network is reachable.
      // Only an actual fetch failure (network error / timeout) indicates offline state.
      // Status code is irrelevant for connectivity detection — any response means online
      if (!this.isOnline) {
        this.handleOnline();
      }
    } catch {
      clearTimeout(timeoutId);
      if (this.isOnline) {
        this.handleOffline();
      }
    }
  }

  private handleOnline() {
    this.isOnline = true;
    this.emit('online');
  }

  private handleOffline() {
    this.isOnline = false;
    this.emit('offline');
  }

  public get online(): boolean {
    return this.isOnline;
  }
}
