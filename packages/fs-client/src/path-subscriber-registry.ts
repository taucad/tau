/**
 * Path-scoped and global listener registry with snapshot iteration so callbacks
 * registered during `notify` do not run in the same delivery pass.
 *
 * @public
 */
import { Topic } from '@taucad/events';

export class PathSubscriberRegistry<E = undefined> {
  readonly #pathTopics = new Map<string, Topic<E>>();
  readonly #pathCallbackUnsubs = new Map<string, Map<(event: E) => void, () => void>>();
  readonly #globalTopic = new Topic<E>({ name: 'PathSubscriberRegistry.global' });

  /**
   * Subscribe to notifications for a single path key.
   * @param path - Path key whose notifications should invoke `callback`.
   * @param callback - Handler invoked when {@link notifyPath} fires for `path`.
   * @returns Unsubscribe function that removes `callback` from `path`.
   */
  public subscribePath(path: string, callback: (event: E) => void): () => void {
    let callbackMap = this.#pathCallbackUnsubs.get(path);
    if (!callbackMap) {
      callbackMap = new Map();
      this.#pathCallbackUnsubs.set(path, callbackMap);
    }
    const existing = callbackMap.get(callback);
    if (existing) {
      return existing;
    }

    let topic = this.#pathTopics.get(path);
    if (!topic) {
      topic = new Topic<E>({ name: `PathSubscriberRegistry[${path}]` });
      this.#pathTopics.set(path, topic);
    }
    const unsubscribe = topic.subscribe(callback);
    const wrappedUnsubscribe = (): void => {
      unsubscribe();
      callbackMap.delete(callback);
      if (callbackMap.size === 0) {
        this.#pathCallbackUnsubs.delete(path);
      }
      if (topic.size === 0) {
        this.#pathTopics.delete(path);
      }
    };
    callbackMap.set(callback, wrappedUnsubscribe);
    return wrappedUnsubscribe;
  }

  /**
   * Subscribe to every `notifyGlobal` delivery.
   * @param callback - Handler invoked for global notifications.
   * @returns Unsubscribe function that removes `callback`.
   */
  public subscribeGlobal(callback: (event: E) => void): () => void {
    return this.#globalTopic.subscribe(callback);
  }

  /**
   * Notify all subscribers for one path (snapshot subscribers before delivery).
   * @param path - Path key to notify.
   * @param event - Payload passed to each subscriber callback.
   */
  public notifyPath(path: string, event: E): void {
    this.#pathTopics.get(path)?.emit(event);
  }

  /**
   * Notify all global subscribers (snapshot subscribers before delivery).
   * @param event - Payload passed to each global callback.
   */
  public notifyGlobal(event: E): void {
    this.#globalTopic.emit(event);
  }

  /**
   * Drop all registered subscribers.
   */
  public clear(): void {
    for (const topic of this.#pathTopics.values()) {
      topic.dispose();
    }
    this.#pathTopics.clear();
    this.#pathCallbackUnsubs.clear();
    this.#globalTopic.dispose();
  }

  /**
   * Total callbacks registered for any specific path (not counting global).
   * @returns Count of all path-scoped subscriptions across keys.
   */
  public get pathSubscriberCount(): number {
    let count = 0;
    for (const topic of this.#pathTopics.values()) {
      count += topic.size;
    }
    return count;
  }

  /**
   * Whether any callbacks are still subscribed for `path`.
   * @param path - Path key to query.
   * @returns `true` when the path has at least one subscriber.
   */
  public hasPathSubscribers(path: string): boolean {
    return (this.#pathTopics.get(path)?.size ?? 0) > 0;
  }

  /**
   * Paths that currently have at least one subscriber (for cache invalidation sweeps).
   * @returns Copy of active path keys with subscribers.
   */
  public subscribedPaths(): string[] {
    return [...this.#pathTopics.keys()];
  }
}
