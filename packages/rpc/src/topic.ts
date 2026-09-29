/**
 * A minimal synchronous fan-out, so the published `@taucad/rpc` leaf depends on no private library (SC T11).
 *
 * @internal
 */
export class Topic<Event> {
  readonly #handlers = new Set<(event: Event) => void>();
  readonly #name: string;
  readonly #onError: (error: unknown) => void;

  public constructor(options: Readonly<{ name: string; onError?: (error: unknown) => void }>) {
    this.#name = options.name;
    this.#onError =
      options.onError ??
      ((error: unknown) => {
        console.error(`[Topic:${this.#name}] handler threw`, error);
      });
  }

  /** How many handlers are subscribed. */
  public get size(): number {
    return this.#handlers.size;
  }

  /**
   * Add a handler.
   *
   * @param handler - Called with every event emitted after this call.
   * @returns An unsubscribe that is safe to call more than once.
   */
  public subscribe(handler: (event: Event) => void): () => void {
    // A handler subscribed twice is two subscriptions, as in the shared Topic it replaces.
    const subscription = (event: Event): void => {
      handler(event);
    };
    this.#handlers.add(subscription);
    return () => {
      this.#handlers.delete(subscription);
    };
  }

  /**
   * Deliver one event to a snapshot of the handlers; a throwing handler never stops the rest.
   *
   * @param event - The event.
   */
  public emit(event: Event): void {
    const snapshot = [...this.#handlers];
    for (const handler of snapshot) {
      if (!this.#handlers.has(handler)) {
        continue;
      }
      try {
        handler(event);
      } catch (error) {
        this.#onError(error);
      }
    }
  }

  /** Drop every handler. */
  public dispose(): void {
    this.#handlers.clear();
  }
}

/**
 * Run one cleanup step; a throw is reported and swallowed so the rest of a teardown chain still runs.
 *
 * @internal
 * @param cleanup - The step.
 */
export const safeDispose = (cleanup: () => void): void => {
  try {
    cleanup();
  } catch (error) {
    console.error('Failed to dispose:', error);
  }
};
