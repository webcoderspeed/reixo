import type { Agent as HttpAgent } from 'http';
import type { Agent as HttpsAgent } from 'https';

export interface ConnectionPoolOptions {
  maxSockets?: number;
  keepAlive?: boolean;
  keepAliveMsecs?: number;
  timeout?: number;
  // TLS/SSL Options
  rejectUnauthorized?: boolean;
  ca?: string | Buffer | Array<string | Buffer>;
  cert?: string | Buffer | Array<string | Buffer>;
  key?: string | Buffer | Array<string | Buffer>;
  passphrase?: string;
  secureProtocol?: string;
}

/**
 * Manages HTTP/HTTPS agents for Node.js environments to enable connection pooling.
 * In browser environments, this class effectively does nothing as browsers manage their own pooling.
 */
export class ConnectionPool {
  private httpAgent?: HttpAgent;
  private httpsAgent?: HttpsAgent;
  private options: ConnectionPoolOptions;

  constructor(options: ConnectionPoolOptions = {}) {
    this.options = {
      keepAlive: true,
      keepAliveMsecs: 1000,
      maxSockets: Infinity,
      ...options,
    };
  }

  /**
   * Gets or creates an HTTP agent (Node.js only).
   */
  public async getHttpAgent(): Promise<HttpAgent | undefined> {
    if (typeof process === 'undefined' || typeof window !== 'undefined') {
      return undefined;
    }

    if (!this.httpAgent) {
      try {
        const http = await import('http');
        this.httpAgent = new http.Agent(this.options);
      } catch {
        // Ignore if http module is not available
      }
    }
    return this.httpAgent;
  }

  /**
   * Gets or creates an HTTPS agent (Node.js only).
   */
  public async getHttpsAgent(): Promise<HttpsAgent | undefined> {
    if (typeof process === 'undefined' || typeof window !== 'undefined') {
      return undefined;
    }

    if (!this.httpsAgent) {
      try {
        const https = await import('https');
        this.httpsAgent = new https.Agent(this.options);
      } catch {
        // Ignore if https module is not available
      }
    }
    return this.httpsAgent;
  }

  /**
   * Destroys the agents and closes all connections.
   */
  public destroy(): void {
    this.httpAgent?.destroy();
    this.httpsAgent?.destroy();
    this.httpAgent = undefined;
    this.httpsAgent = undefined;
  }
}
