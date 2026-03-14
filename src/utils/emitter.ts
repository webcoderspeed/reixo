export type EventMap = Record<string, unknown[]>;
import { internalError } from './internal-log';

export class EventEmitter<Events extends EventMap = Record<string, unknown[]>> {
  private events: { [K in keyof Events]?: Array<(...args: Events[K]) => void> } = {};

  public on<K extends keyof Events>(event: K, listener: (...args: Events[K]) => void): () => void {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event]!.push(listener);

    // Return unsubscribe function
    return () => this.off(event, listener);
  }

  public off<K extends keyof Events>(event: K, listener: (...args: Events[K]) => void): void {
    if (!this.events[event]) return;
    this.events[event] = this.events[event]!.filter((l) => l !== listener);
  }

  public emit<K extends keyof Events>(event: K, ...args: Events[K]): void {
    if (!this.events[event]) return;
    // Snapshot listeners so mutations inside a callback don't skip or duplicate entries
    const listeners = [...this.events[event]!];
    for (const listener of listeners) {
      try {
        listener(...args);
      } catch (err) {
        // Isolate listener errors: log immediately so the stack trace is visible
        // in the console, then re-throw via queueMicrotask so other listeners
        // still fire in the current turn.
        internalError('Unhandled error in event listener:', err);
        queueMicrotask(() => {
          throw err;
        });
      }
    }
  }

  public once<K extends keyof Events>(event: K, listener: (...args: Events[K]) => void): void {
    const remove = this.on(event, (...args) => {
      remove();
      listener(...args);
    });
  }

  public removeAllListeners<K extends keyof Events>(event?: K): void {
    if (event) {
      delete this.events[event];
    } else {
      this.events = {};
    }
  }
}
