/**
 * Ref-counted watch subscription registry.
 *
 * Deduplicates identical watch requests so multiple consumers share a single
 * ChangeEventBus subscription. Tracks per-owner (port/session) watch sets for
 * lifecycle cleanup on disconnect.
 */

import { Topic } from '@taucad/events';
import type { ChangeEventBus } from '#change-event-bus.js';
import type { ChangeEvent, WatchRequest, WatchEvent, WatchEventFilter } from '#types.js';
import { EventCoalescer } from '#event-coalescer.js';
import { canonicalizePath, parentDirectory } from '@taucad/utils/path';

type WatchSubscription = {
  request: WatchRequest;
  handlers: Topic<WatchEvent>;
  handlerUnsubs: Map<(event: WatchEvent) => void, () => void>;
  unsubscribeFromBus: () => void;
  coalescer: EventCoalescer;
};

function hashWatchRequest(request: WatchRequest): string {
  const parts = [
    [...request.paths].sort().join(','),
    String(request.recursive ?? false),
    [...(request.includes ?? [])].sort().join(','),
    [...(request.excludes ?? [])].sort().join(','),
    request.filter
      ? `${request.filter.added ?? ''},${request.filter.updated ?? ''},${request.filter.deleted ?? ''},${request.filter.renamed ?? ''}`
      : '',
  ];
  return parts.join('|');
}

function comparePaths(a: string, b: string, caseSensitive: boolean): boolean {
  return caseSensitive ? a === b : a.toLowerCase() === b.toLowerCase();
}

function pathStartsWith(path: string, prefix: string, caseSensitive: boolean): boolean {
  return caseSensitive ? path.startsWith(prefix) : path.toLowerCase().startsWith(prefix.toLowerCase());
}

function isPathMatched(
  eventPath: string,
  watchPaths: string[],
  options: { recursive: boolean; caseSensitive: boolean },
): boolean {
  const { recursive, caseSensitive } = options;
  const normalized = canonicalizePath(eventPath);
  for (const watchPath of watchPaths) {
    const normalizedWatch = canonicalizePath(watchPath);
    if (recursive) {
      if (
        comparePaths(normalized, normalizedWatch, caseSensitive) ||
        pathStartsWith(normalized, `${normalizedWatch}/`, caseSensitive)
      ) {
        return true;
      }
    } else {
      const parentOfEvent = parentDirectory(normalized);
      if (
        comparePaths(parentOfEvent, normalizedWatch, caseSensitive) ||
        comparePaths(normalized, normalizedWatch, caseSensitive)
      ) {
        return true;
      }
    }
  }
  return false;
}

function matchesGlob(path: string, pattern: string, caseSensitive: boolean): boolean {
  const regexString = pattern
    .replaceAll('.', String.raw`\.`)
    .replaceAll('**/', '(.+/)?')
    .replaceAll('*', '[^/]*')
    .replaceAll('?', '[^/]');
  const flags = caseSensitive ? '' : 'i';
  return new RegExp(`^${regexString}$`, flags).test(path);
}

function matchesIncludes(path: string, includes: string[] | undefined, caseSensitive: boolean): boolean {
  if (!includes || includes.length === 0) {
    return true;
  }
  return includes.some((pattern) => matchesGlob(path, pattern, caseSensitive));
}

function matchesExcludes(path: string, excludes: string[] | undefined, caseSensitive: boolean): boolean {
  if (!excludes || excludes.length === 0) {
    return false;
  }
  return excludes.some((pattern) => matchesGlob(path, pattern, caseSensitive));
}

function passesFilter(changeType: ChangeEvent['type'], filter?: WatchEventFilter): boolean {
  if (!filter) {
    return true;
  }
  switch (changeType) {
    case 'fileWritten':
    case 'fileCopied':
    case 'directoryCreated':
    case 'directoryCopied':
    case 'directoryChanged': {
      return filter.updated !== false;
    }
    case 'fileDeleted':
    case 'directoryDeleted': {
      return filter.deleted !== false;
    }
    case 'fileRenamed':
    case 'directoryRenamed': {
      return filter.renamed !== false;
    }
    case 'backendChanged': {
      return true;
    }
    default: {
      return true;
    }
  }
}

function changeEventToWatchEvent(event: ChangeEvent, correlationId?: string): WatchEvent | undefined {
  switch (event.type) {
    case 'fileWritten':
    case 'directoryChanged':
    case 'directoryCreated': {
      return { type: 'change', path: event.path, correlationId };
    }
    case 'fileCopied':
    case 'directoryCopied': {
      return { type: 'change', path: event.targetPath, correlationId };
    }
    case 'fileDeleted':
    case 'directoryDeleted': {
      return { type: 'delete', path: event.path, correlationId };
    }
    case 'fileRenamed':
    case 'directoryRenamed': {
      return { type: 'rename', oldPath: event.oldPath, newPath: event.newPath, correlationId };
    }
    case 'backendChanged': {
      return { type: 'reset', correlationId };
    }
    default: {
      return undefined;
    }
  }
}

function getEventPath(event: ChangeEvent): string | undefined {
  switch (event.type) {
    case 'fileWritten':
    case 'fileDeleted':
    case 'directoryCreated':
    case 'directoryDeleted':
    case 'directoryChanged': {
      return event.path;
    }
    case 'fileRenamed':
    case 'directoryRenamed': {
      return event.oldPath;
    }
    case 'fileCopied':
    case 'directoryCopied': {
      return event.targetPath;
    }
    default: {
      return undefined;
    }
  }
}

/**
 * Optional configuration for WatchRegistry.
 * @public
 */
export type WatchRegistryOptions = {
  caseSensitive?: boolean;
  maxQueueDepth?: number;
  /** Coalescing window. Default: 50. Milliseconds. */
  coalescingWindow?: number;
};

/**
 * Ref-counted watch subscription registry with event coalescing and overflow handling.
 * @public
 */
export class WatchRegistry {
  private readonly _subscriptions = new Map<string, WatchSubscription>();
  private readonly _ownerWatches = new Map<string, Set<string>>();
  private readonly _ownerHandlers = new Map<string, Map<string, Set<(event: WatchEvent) => void>>>();
  private readonly _eventBus: ChangeEventBus;
  private readonly _maxQueueDepth?: number;
  /** Milliseconds. */
  private readonly _coalescingWindow?: number;
  private _caseSensitive: boolean;

  /**
   * Create a WatchRegistry.
   *
   * @param eventBus - Event bus for filesystem change events.
   * @param options - Configuration options or legacy boolean for case-sensitivity.
   */
  public constructor(eventBus: ChangeEventBus, options?: WatchRegistryOptions | boolean) {
    this._eventBus = eventBus;
    if (typeof options === 'boolean') {
      this._caseSensitive = options;
    } else {
      this._caseSensitive = options?.caseSensitive ?? true;
      this._maxQueueDepth = options?.maxQueueDepth;
      this._coalescingWindow = options?.coalescingWindow;
    }
  }

  /**
   * Update case-sensitivity (e.g. after root mount).
   *
   * @param caseSensitive - Whether path matching is case-sensitive.
   */
  public setCaseSensitive(caseSensitive: boolean): void {
    this._caseSensitive = caseSensitive;
  }

  /**
   * Register a watch subscription. Identical requests (by hash) share
   * one underlying ChangeEventBus listener with ref-counted disposal.
   *
   * @param request - watch request specifying paths, filters, etc.
   * @param handler - callback for matching events
   * @param ownerId - port/session identifier for lifecycle tracking
   * @returns unsubscribe function
   */
  public watch(request: WatchRequest, handler: (event: WatchEvent) => void, ownerId?: string): () => void {
    const hash = hashWatchRequest(request);
    let subscription = this._subscriptions.get(hash);

    if (!subscription) {
      const coalescer = new EventCoalescer(
        (events) => {
          for (const event of events) {
            this._dispatchCoalescedEvent(hash, event);
          }
        },
        {
          coalescingWindow: this._coalescingWindow,
          maxQueueDepth: this._maxQueueDepth,
          onOverflow: () => {
            this._dispatchOverflow(hash);
          },
        },
      );
      const unsubscribeFromBus = this._eventBus.subscribe((event) => {
        this._filterAndEnqueue(hash, event, coalescer);
      });
      subscription = {
        request,
        handlers: new Topic<WatchEvent>({
          name: 'WatchRegistry.handlers',
          onError: (error) => {
            console.error('[WatchRegistry] Handler error:', error);
          },
        }),
        handlerUnsubs: new Map(),
        unsubscribeFromBus,
        coalescer,
      };
      this._subscriptions.set(hash, subscription);
    }

    const unsubscribe = subscription.handlers.subscribe(handler);
    subscription.handlerUnsubs.set(handler, unsubscribe);

    if (ownerId) {
      let owned = this._ownerWatches.get(ownerId);
      if (!owned) {
        owned = new Set();
        this._ownerWatches.set(ownerId, owned);
      }
      owned.add(hash);

      let ownerHandlerMap = this._ownerHandlers.get(ownerId);
      if (!ownerHandlerMap) {
        ownerHandlerMap = new Map();
        this._ownerHandlers.set(ownerId, ownerHandlerMap);
      }
      let handlersForHash = ownerHandlerMap.get(hash);
      if (!handlersForHash) {
        handlersForHash = new Set();
        ownerHandlerMap.set(hash, handlersForHash);
      }
      handlersForHash.add(handler);
    }

    let unsubscribed = false;
    return () => {
      if (unsubscribed) {
        return;
      }
      unsubscribed = true;
      this._removeHandler(hash, handler, ownerId);
    };
  }

  /**
   * Remove all watches owned by a given owner (port disconnect cleanup).
   *
   * @param ownerId - Port/session identifier whose watches to remove.
   */
  public cleanupOwner(ownerId: string): void {
    const ownerHandlerMap = this._ownerHandlers.get(ownerId);
    if (ownerHandlerMap) {
      for (const [hash, handlers] of ownerHandlerMap) {
        for (const handler of handlers) {
          this._removeHandler(hash, handler);
        }
      }
      this._ownerHandlers.delete(ownerId);
    }
    this._ownerWatches.delete(ownerId);
  }

  /** Emit a reset event to all subscribers. */
  public emitResetAll(): void {
    for (const subscription of this._subscriptions.values()) {
      const resetEvent: WatchEvent = { type: 'reset', correlationId: subscription.request.correlationId };
      subscription.handlers.emit(resetEvent);
    }
  }

  /**
   * Number of unique deduplicated subscriptions.
   *
   * @returns Count of unique subscriptions.
   */
  public get subscriptionCount(): number {
    return this._subscriptions.size;
  }

  /**
   * Total number of individual handler registrations across all subscriptions.
   *
   * @returns Total handler count across all subscriptions.
   */
  public get handlerCount(): number {
    let count = 0;
    for (const sub of this._subscriptions.values()) {
      count += sub.handlers.size;
    }
    return count;
  }

  /** Dispose all subscriptions, coalescers, and owner tracking. */
  public dispose(): void {
    for (const subscription of this._subscriptions.values()) {
      subscription.coalescer.dispose();
      subscription.unsubscribeFromBus();
      subscription.handlers.dispose();
      subscription.handlerUnsubs.clear();
    }
    this._subscriptions.clear();
    this._ownerWatches.clear();
    this._ownerHandlers.clear();
  }

  /**
   * Pre-filter events by path/glob/type, then enqueue into the coalescer.
   * Coalescer will batch and deliver via _dispatchCoalescedEvent.
   *
   * @param hash - Subscription hash key.
   * @param event - Change event from the bus.
   * @param coalescer - Event coalescer to enqueue into.
   */
  private _filterAndEnqueue(hash: string, event: ChangeEvent, coalescer: EventCoalescer): void {
    const subscription = this._subscriptions.get(hash);
    if (!subscription) {
      return;
    }

    const { request } = subscription;

    if (event.type === 'backendChanged') {
      coalescer.flush();
      const resetEvent: WatchEvent = { type: 'reset', correlationId: request.correlationId };
      subscription.handlers.emit(resetEvent);
      return;
    }

    const eventPath = getEventPath(event);
    if (!eventPath) {
      return;
    }

    const cs = this._caseSensitive;
    if (!isPathMatched(eventPath, request.paths, { recursive: request.recursive ?? false, caseSensitive: cs })) {
      return;
    }
    if (!passesFilter(event.type, request.filter)) {
      return;
    }
    if (matchesExcludes(eventPath, request.excludes, cs)) {
      return;
    }
    if (!matchesIncludes(eventPath, request.includes, cs)) {
      return;
    }

    if (
      (event.type === 'fileRenamed' || event.type === 'directoryRenamed') &&
      matchesExcludes(event.newPath, request.excludes, cs)
    ) {
      return;
    }

    coalescer.push(event);
  }

  /**
   * Emit overflow event when the coalescer queue is exceeded.
   *
   * @param hash - Subscription hash key.
   */
  private _dispatchOverflow(hash: string): void {
    const subscription = this._subscriptions.get(hash);
    if (!subscription) {
      return;
    }

    const overflowEvent: WatchEvent = { type: 'overflow', correlationId: subscription.request.correlationId };
    subscription.handlers.emit(overflowEvent);
  }

  /**
   * Deliver a coalesced ChangeEvent as a WatchEvent to all handlers.
   *
   * @param hash - Subscription hash key.
   * @param event - Coalesced change event.
   */
  private _dispatchCoalescedEvent(hash: string, event: ChangeEvent): void {
    const subscription = this._subscriptions.get(hash);
    if (!subscription) {
      return;
    }

    const watchEvent = changeEventToWatchEvent(event, subscription.request.correlationId);
    if (!watchEvent) {
      return;
    }

    subscription.handlers.emit(watchEvent);
  }

  private _removeHandler(hash: string, handler: (event: WatchEvent) => void, ownerId?: string): void {
    const subscription = this._subscriptions.get(hash);
    if (!subscription) {
      return;
    }

    const unsubscribe = subscription.handlerUnsubs.get(handler);
    if (unsubscribe !== undefined) {
      unsubscribe();
      subscription.handlerUnsubs.delete(handler);
    }

    if (subscription.handlers.size === 0) {
      subscription.coalescer.dispose();
      subscription.unsubscribeFromBus();
      this._subscriptions.delete(hash);
    }

    if (ownerId) {
      const owned = this._ownerWatches.get(ownerId);
      if (owned) {
        owned.delete(hash);
        if (owned.size === 0) {
          this._ownerWatches.delete(ownerId);
        }
      }

      const ownerHandlerMap = this._ownerHandlers.get(ownerId);
      if (ownerHandlerMap) {
        const handlersForHash = ownerHandlerMap.get(hash);
        if (handlersForHash) {
          handlersForHash.delete(handler);
          if (handlersForHash.size === 0) {
            ownerHandlerMap.delete(hash);
          }
        }
        if (ownerHandlerMap.size === 0) {
          this._ownerHandlers.delete(ownerId);
        }
      }
    }
  }
}
