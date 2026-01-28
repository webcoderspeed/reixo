import { EventEmitter } from './emitter';

export interface NetworkMonitorOptions {
  checkInterval?: number; // Polling interval in ms (for non-browser environments)
  pingUrl?: string; // URL to ping for connectivity check
}

export type NetworkEvents = {
  online: [];
  offline: [];
};

export class NetworkMonitor extends EventEmitter<NetworkEvents> {
  private static instance: NetworkMonitor;
  private isOnline: boolean = true;
  private checkIntervalId: ReturnType<typeof setInterval> | null = null;
  private pingUrl: string = 'https://www.google.com';

  private constructor() {
    super();
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      this.isOnline = navigator.onLine;
      window.addEventListener('online', () => this.handleOnline());
      window.addEventListener('offline', () => this.handleOffline());
    }
  }

  public static getInstance(): NetworkMonitor {
    if (!NetworkMonitor.instance) {
      NetworkMonitor.instance = new NetworkMonitor();
    }
    return NetworkMonitor.instance;
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
    this.checkIntervalId = setInterval(() => void this.checkConnection(), interval);
  }

  public stopPolling(): void {
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
    }
  }

  private async checkConnection(): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      // Use global fetch (assumed to be available or polyfilled)
      const response = await fetch(this.pingUrl, {
        method: 'HEAD',
        cache: 'no-store',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok || response.status < 500) {
        if (!this.isOnline) {
          this.handleOnline();
        }
      } else {
        // Server error doesn't necessarily mean offline, but let's assume online if we got a response
        if (!this.isOnline) {
          this.handleOnline();
        }
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
