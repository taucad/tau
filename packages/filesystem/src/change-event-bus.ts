import { Topic } from '@taucad/events';
import type { ChangeEvent } from '#types.js';

/**
 * Simple pub/sub bus for broadcasting {@link ChangeEvent}s to subscribers.
 * @public
 */
export class ChangeEventBus {
  readonly #topic = new Topic<ChangeEvent>({
    name: 'ChangeEventBus',
    onError: (error) => {
      console.error('[ChangeEventBus] Subscriber error:', error);
    },
  });

  /**
   * Register a handler to receive all change events.
   *
   * Originating bridge port ids are attached to events via `tagEventOrigin`
   * in {@link WorkspaceFileService} before emit.
   *
   * @param handler - Callback invoked for every emitted event.
   * @param options - Optional AbortSignal lifecycle binding.
   * @returns Unsubscribe function.
   */
  public subscribe(handler: (event: ChangeEvent) => void, options?: { signal?: AbortSignal }): () => void {
    return this.#topic.subscribe(handler, options);
  }

  /**
   * Broadcast an event to all current subscribers.
   *
   * @param event - Change event to emit.
   */
  public emit(event: ChangeEvent): void {
    this.#topic.emit(event);
  }

  /** Remove all subscribers. */
  public dispose(): void {
    this.#topic.dispose();
  }
}
