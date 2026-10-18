/**
 * @file internal-log.ts
 *
 * Lightweight stderr helpers for reixo's own diagnostic messages.
 *
 * These are for *library-internal* warnings only — not for consumer application
 * logs. All output is prefixed with `[reixo]` so it is immediately identifiable.
 *
 * Silence all internal logs by setting the environment variable:
 *   REIXO_SILENT_INTERNAL=1
 *
 * @example
 * import { internalWarn } from './internal-log';
 * internalWarn('localStorage not available — falling back to MemoryAdapter');
 */

const silent = typeof process !== 'undefined' && process.env['REIXO_SILENT_INTERNAL'] === '1';

/**
 * Emit an informational message to stderr (silenceable).
 */
export function internalLog(message: string, ...args: unknown[]): void {
  if (!silent) {
    console.log(`[reixo] ${message}`, ...args);
  }
}

/**
 * Emit a warning message to stderr (silenceable).
 */
export function internalWarn(message: string, ...args: unknown[]): void {
  if (!silent) {
    console.warn(`[reixo] ${message}`, ...args);
  }
}

/**
 * Emit an error message to stderr (silenceable).
 */
export function internalError(message: string, ...args: unknown[]): void {
  if (!silent) {
    console.error(`[reixo] ${message}`, ...args);
  }
}
