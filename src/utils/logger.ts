import { Logger } from '../core/http-client';

export enum LogLevel {
  NONE = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
}

export class ConsoleLogger implements Logger {
  constructor(private readonly level: LogLevel = LogLevel.INFO) {}

  info(message: string, meta?: unknown): void {
    if (this.level >= LogLevel.INFO) {
      console.info(`[INFO] ${message}`, meta || '');
    }
  }

  warn(message: string, meta?: unknown): void {
    if (this.level >= LogLevel.WARN) {
      console.warn(`[WARN] ${message}`, meta || '');
    }
  }

  error(message: string, meta?: unknown): void {
    if (this.level >= LogLevel.ERROR) {
      console.error(`[ERROR] ${message}`, meta || '');
    }
  }
}
