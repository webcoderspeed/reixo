import type { HeadersRecord } from '../types/http-well-known';
import { Logger, LogMeta } from '../core/http-client';

/**
 * Numeric log-level constants.
 *
 * Implemented as an `as const` object (not an `enum`) to keep the emitted JS
 * tree-shakeable and to avoid the dual-lookup overhead of TypeScript enums.
 *
 * @example
 * new ConsoleLogger(LogLevel.DEBUG)
 * new ConsoleLogger({ level: LogLevel.WARN, format: 'json' })
 */
export const LogLevel = {
  /** No output at all. */
  NONE: 0,
  /** Fatal / unrecoverable errors only. */
  ERROR: 1,
  /** Degraded-service warnings and above. */
  WARN: 2,
  /** General operational messages and above (default). */
  INFO: 3,
  /** Verbose diagnostic messages and above. */
  DEBUG: 4,
} as const;

/** The type of a valid {@link LogLevel} value. */
export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

/**
 * Configuration options for {@link ConsoleLogger}.
 */
export interface ConsoleLoggerOptions {
  /**
   * Minimum severity level to emit. Messages below this level are silently discarded.
   * @default LogLevel.INFO
   */
  level?: LogLevel;

  /**
   * Output format.
   * - `'text'` — human-readable `[LEVEL prefix] message` lines (default)
   * - `'json'` — structured JSON objects suitable for log aggregators (Datadog, Splunk, etc.)
   * @default 'text'
   */
  format?: 'text' | 'json';

  /**
   * Optional prefix prepended to every log message (text format only).
   * @example '[MyApp:HTTP]'
   */
  prefix?: string;

  /**
   * Header names whose values should be replaced with `'[REDACTED]'` before logging.
   * Case-insensitive. Useful for hiding auth tokens and cookies.
   * @example ['Authorization', 'Cookie', 'X-Api-Key']
   */
  redactHeaders?: string[];
}

/** Shape of a structured log-entry JSON object (json format). */
interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  service?: string;
  meta?: LogMeta;
}

/**
 * Simple `console`-based logger that implements the {@link Logger} interface.
 *
 * Supports configurable log levels, structured JSON output, custom prefixes,
 * and header redaction for security-conscious production environments.
 *
 * @example
 * ```ts
 * // Development: human-readable, debug-level, redact auth headers
 * const logger = new ConsoleLogger({
 *   level: LogLevel.DEBUG,
 *   prefix: '[MyApp:HTTP]',
 *   redactHeaders: ['Authorization', 'Cookie'],
 * });
 *
 * // Production: JSON format for log aggregators, warnings and above only
 * const logger = new ConsoleLogger({
 *   level: LogLevel.WARN,
 *   format: 'json',
 *   redactHeaders: ['Authorization', 'Cookie', 'X-Api-Key'],
 * });
 *
 * const client = new HTTPBuilder().withLogger(logger).build();
 * ```
 */
export class ConsoleLogger implements Logger {
  private readonly level: LogLevel;
  private readonly format: 'text' | 'json';
  private readonly prefix: string;
  private readonly redactSet: Set<string>;

  constructor(levelOrOptions: LogLevel | ConsoleLoggerOptions = LogLevel.INFO) {
    if (typeof levelOrOptions === 'number') {
      // Backward-compatible: new ConsoleLogger(LogLevel.DEBUG)
      this.level = levelOrOptions;
      this.format = 'text';
      this.prefix = '';
      this.redactSet = new Set();
    } else {
      const opts = levelOrOptions;
      this.level = opts.level ?? LogLevel.INFO;
      this.format = opts.format ?? 'text';
      this.prefix = opts.prefix ?? '';
      this.redactSet = new Set((opts.redactHeaders ?? []).map((h) => h.toLowerCase()));
    }
  }

  /** @internal Redact sensitive header values before logging. */
  private redactMeta(meta: LogMeta): LogMeta {
    if (!this.redactSet.size || meta === undefined || meta === null) return meta;

    if (typeof meta === 'object' && !Array.isArray(meta)) {
      const m = meta as Record<string, LogMeta>;
      const raw = m['headers'];
      if (raw !== null && raw !== undefined && typeof raw === 'object' && !Array.isArray(raw)) {
        // Safe: we confirmed headers is a plain object
        const headers: HeadersRecord = { ...(raw as HeadersRecord) } as HeadersRecord;
        for (const key of Object.keys(headers)) {
          if (this.redactSet.has(key.toLowerCase())) {
            headers[key] = '[REDACTED]';
          }
        }
        return { ...m, headers };
      }
    }
    return meta;
  }

  /** @internal Emit a log message at the given level. */
  private emit(level: 'info' | 'warn' | 'error' | 'debug', message: string, meta?: LogMeta): void {
    const safeMeta = this.redactMeta(meta);

    if (this.format === 'json') {
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: level.toUpperCase(),
        message,
      };
      if (this.prefix) entry.service = this.prefix;
      if (safeMeta !== undefined && safeMeta !== '') entry.meta = safeMeta;
      console[level](JSON.stringify(entry));
    } else {
      const tag = this.prefix ? `${this.prefix} ` : '';
      const label = `[${level.toUpperCase()}] ${tag}${message}`;
      // Always pass the second argument (empty string when no meta) — consistent with original API
      console[level](label, safeMeta !== undefined ? safeMeta : '');
    }
  }

  debug(message: string, meta?: LogMeta): void {
    if (this.level >= LogLevel.DEBUG) {
      this.emit('debug', message, meta);
    }
  }

  info(message: string, meta?: LogMeta): void {
    if (this.level >= LogLevel.INFO) {
      this.emit('info', message, meta);
    }
  }

  warn(message: string, meta?: LogMeta): void {
    if (this.level >= LogLevel.WARN) {
      this.emit('warn', message, meta);
    }
  }

  error(message: string, meta?: LogMeta): void {
    if (this.level >= LogLevel.ERROR) {
      this.emit('error', message, meta);
    }
  }
}
