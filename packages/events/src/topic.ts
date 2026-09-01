/**
 * Zero-dependency pub/sub primitive with snapshot-on-emit, handler-error
 * containment, optional per-subscription predicates, and AbortSignal lifecycle.
 *
 * @public
 */

/**
 * A single subscription registered on a {@link Topic}.
 *
 * @public
 */
export type TopicSubscription<E> = {
  readonly handler: (event: E) => void;
  /** When set, the handler runs only if this returns true for the event. */
  readonly interestedIn?: (event: E) => boolean;
};

/**
 * Options passed to {@link Topic.subscribe}.
 *
 * @public
 */
export type TopicSubscribeOptions = {
  /** When set, unsubscribes the moment the signal aborts (or is already aborted). */
  readonly signal?: AbortSignal;
};

/**
 * Constructor options for {@link Topic}.
 *
 * @public
 */
export type TopicOptions<E> = {
  /** Handler-throw sink. Default: `console.error('[Topic:<name>] handler threw', error)`. */
  readonly onError?: (error: unknown, event: E) => void;
  /** Diagnostic name surfaced in the default error log prefix. */
  readonly name?: string;
};

/**
 * Snapshot-on-emit pub/sub fan-out with handler-error containment.
 *
 * @public
 * @example <caption>Basic subscribe and emit</caption>
 * ```typescript
 * import { Topic } from '@taucad/events';
 * const topic = new Topic<number>();
 * topic.subscribe((value) => console.log(value));
 * topic.emit(42);
 * ```
 */
export class Topic<E> {
  readonly #subscribers = new Set<TopicSubscription<E>>();
  readonly #onError: (error: unknown, event: E) => void;
  readonly #name: string | undefined;
  readonly #signalCleanups = new WeakMap<TopicSubscription<E>, () => void>();

  public constructor(options?: TopicOptions<E>) {
    this.#name = options?.name;
    this.#onError =
      options?.onError ??
      ((error: unknown) => {
        const prefix = this.#name === undefined ? '[Topic]' : `[Topic:${this.#name}]`;
        console.error(`${prefix} handler threw`, error);
      });
  }

  /**
   * Register a handler to receive emitted events.
   *
   * @param subscriptionOrHandler - Full subscription object or bare handler.
   * @param options - Optional AbortSignal lifecycle binding.
   * @returns Unsubscribe function (idempotent).
   */
  public subscribe(
    subscriptionOrHandler: TopicSubscription<E> | ((event: E) => void),
    options?: TopicSubscribeOptions,
  ): () => void {
    const signal = options?.signal;
    if (signal?.aborted) {
      return () => undefined;
    }

    const subscription: TopicSubscription<E> =
      typeof subscriptionOrHandler === 'function' ? { handler: subscriptionOrHandler } : subscriptionOrHandler;

    this.#subscribers.add(subscription);

    const unsubscribe = (): void => {
      this.#subscribers.delete(subscription);
      const detachSignal = this.#signalCleanups.get(subscription);
      if (detachSignal !== undefined) {
        detachSignal();
        this.#signalCleanups.delete(subscription);
      }
    };

    if (signal !== undefined) {
      const onAbort = (): void => {
        unsubscribe();
      };
      signal.addEventListener('abort', onAbort, { once: true });
      this.#signalCleanups.set(subscription, () => {
        signal.removeEventListener('abort', onAbort);
      });
    }

    return unsubscribe;
  }

  /**
   * Emit to a snapshot of current subscribers. Re-entrant and self-unsubscribe safe.
   *
   * @param event - Payload delivered to each subscriber.
   */
  public emit(event: E): void {
    const snapshot = [...this.#subscribers];
    for (const subscription of snapshot) {
      if (!this.#subscribers.has(subscription)) {
        continue;
      }

      try {
        if (subscription.interestedIn !== undefined && !subscription.interestedIn(event)) {
          continue;
        }
        subscription.handler(event);
      } catch (error) {
        this.#onError(error, event);
      }
    }
  }

  /**
   * Current subscriber count.
   *
   * @returns Number of active subscriptions.
   */
  public get size(): number {
    return this.#subscribers.size;
  }

  /**
   * Remove all subscribers. Subsequent `emit` is a no-op until new subscriptions arrive.
   */
  public dispose(): void {
    for (const subscription of this.#subscribers) {
      const detachSignal = this.#signalCleanups.get(subscription);
      if (detachSignal !== undefined) {
        detachSignal();
      }
    }
    this.#subscribers.clear();
  }
}
