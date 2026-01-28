type Listener = (...args: unknown[]) => void;

export class EventEmitter {
  private events: Record<string, Listener[]> = {};

  public on(event: string, listener: Listener): () => void {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);

    // Return unsubscribe function
    return () => this.off(event, listener);
  }

  public off(event: string, listener: Listener): void {
    if (!this.events[event]) return;
    this.events[event] = this.events[event].filter(l => l !== listener);
  }

  public emit(event: string, ...args: unknown[]): void {
    if (!this.events[event]) return;
    this.events[event].forEach(listener => listener(...args));
  }

  public once(event: string, listener: Listener): void {
    const remove = this.on(event, (...args) => {
      remove();
      listener(...args);
    });
  }

  public removeAllListeners(event?: string): void {
    if (event) {
      delete this.events[event];
    } else {
      this.events = {};
    }
  }
}
