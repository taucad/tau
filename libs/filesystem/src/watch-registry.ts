/**
 * Ref-counted watch subscription registry.
 *
 * Deduplicates identical watch requests so multiple consumers share a single
 * ChangeEventBus subscription. The returned unsubscribe owns lifecycle cleanup.
 */

import { Topic } from '@taucad/events';
import type { ChangeEventBus } from '#change-event-bus.js';
import type { ChangeEvent, WatchRequest, WatchEvent } from '#types.js';
import { EventCoalescer } from '#event-coalescer.js';
import { getEventAuthorities, getEventOrigin, isEventGloballyVisible, tagEventOrigin } from '#event-origin-registry.js';
import { canonicalizePath, parentDirectory } from '@taucad/utils/path';

type WatchSubscription = {
  request: WatchRequest;
  authority?: WeakKey;
  handlers: Topic<WatchEvent>;
  unsubscribeFromBus: () => void;
  coalescer: EventCoalescer;
};

const snapshotWatchRequest = (request: WatchRequest): WatchRequest => ({
  paths: request.paths.map(canonicalizePath).sort(),
  recursive: request.recursive ?? false,
  includes: request.includes === undefined ? undefined : [...request.includes].sort(),
  excludes: request.excludes === undefined ? undefined : [...request.excludes].sort(),
});

function hashWatchRequest(request: WatchRequest): string {
  return JSON.stringify(request);
}

function isPathMatched(eventPath: string, watchPaths: string[], recursive: boolean): boolean {
  const normalized = canonicalizePath(eventPath);
  for (const watchPath of watchPaths) {
    const normalizedWatch = canonicalizePath(watchPath);
    if (recursive) {
      if (
        normalized === normalizedWatch ||
        (normalizedWatch === '/' ? normalized.startsWith('/') : normalized.startsWith(`${normalizedWatch}/`))
      ) {
        return true;
      }
    } else {
      const parentOfEvent = parentDirectory(normalized);
      if (parentOfEvent === normalizedWatch || normalized === normalizedWatch) {
        return true;
      }
    }
  }
  return false;
}

function isSummaryMatched(summaryPath: string, watchPaths: string[], recursive: boolean): boolean {
  const normalizedSummary = canonicalizePath(summaryPath);
  return watchPaths.some((watchPath) => {
    const normalizedWatch = canonicalizePath(watchPath);
    const summaryContainsWatch =
      normalizedSummary === '/' ||
      normalizedWatch === normalizedSummary ||
      normalizedWatch.startsWith(`${normalizedSummary}/`);
    return summaryContainsWatch || isPathMatched(normalizedSummary, [normalizedWatch], recursive);
  });
}

function summaryContainsDescendantWatch(summaryPath: string, watchPaths: string[]): boolean {
  const normalizedSummary = canonicalizePath(summaryPath);
  return watchPaths.some((watchPath) => canonicalizePath(watchPath).startsWith(`${normalizedSummary}/`));
}

function matchesGlob(path: string, pattern: string): boolean {
  let regexString = '';
  for (let index = 0; index < pattern.length; index++) {
    const character = pattern[index]!;
    if (character === '*' && pattern[index + 1] === '*') {
      if (pattern[index + 2] === '/') {
        regexString += '(?:.*/)?';
        index += 2;
      } else {
        regexString += '.*';
        index++;
      }
      continue;
    }
    if (character === '*') {
      regexString += '[^/]*';
      continue;
    }
    if (character === '?') {
      regexString += '[^/]';
      continue;
    }
    regexString += String.raw`\^$.*+?()[]{}|`.includes(character) ? `\\${character}` : character;
  }
  return new RegExp(`^${regexString}$`, 'u').test(path);
}

function matchesIncludes(path: string, includes: string[] | undefined): boolean {
  if (!includes || includes.length === 0) {
    return true;
  }
  return includes.some((pattern) => matchesGlob(path, pattern));
}

function matchesExcludes(path: string, excludes: string[] | undefined): boolean {
  if (!excludes || excludes.length === 0) {
    return false;
  }
  return excludes.some((pattern) => matchesGlob(path, pattern));
}

function changeEventToWatchEvent(event: ChangeEvent): WatchEvent | undefined {
  let watchEvent: WatchEvent | undefined;
  switch (event.type) {
    case 'fileWritten':
    case 'directoryCreated': {
      watchEvent = { type: 'change', path: event.path };
      break;
    }
    case 'fileCopied':
    case 'directoryCopied': {
      watchEvent = { type: 'change', path: event.targetPath };
      break;
    }
    case 'fileDeleted':
    case 'directoryDeleted': {
      watchEvent = { type: 'delete', path: event.path };
      break;
    }
    case 'fileRenamed':
    case 'directoryRenamed': {
      watchEvent = { type: 'rename', oldPath: event.oldPath, newPath: event.newPath };
      break;
    }
    case 'backendChanged': {
      watchEvent = { type: 'reset' };
      break;
    }
    default: {
      break;
    }
  }
  const origin = getEventOrigin(event);
  if (watchEvent !== undefined && origin !== undefined) {
    tagEventOrigin(watchEvent, origin);
  }
  return watchEvent;
}

function getEventPaths(event: ChangeEvent): string[] {
  switch (event.type) {
    case 'fileWritten':
    case 'fileDeleted':
    case 'directoryCreated':
    case 'directoryDeleted': {
      return [event.path];
    }
    case 'fileRenamed':
    case 'directoryRenamed': {
      return [event.oldPath, event.newPath];
    }
    case 'fileCopied':
    case 'directoryCopied': {
      return [event.targetPath];
    }
    default: {
      return [];
    }
  }
}

/**
 * Optional configuration for WatchRegistry.
 * @public
 */
export type WatchRegistryOptions = {
  maxQueueDepth?: number;
  /** Coalescing window. Default: 50. Milliseconds. */
  coalescingWindow?: number;
};

/** Internal authority selector used by captured rooted filesystems. */
type WatchRegistrationOptions = {
  authority?: WeakKey;
};

/**
 * Ref-counted watch subscription registry with event coalescing and overflow handling.
 * @public
 */
export class WatchRegistry {
  private readonly _subscriptions = new Map<string, WatchSubscription>();
  private readonly _authoritySubscriptions = new Map<WeakKey, Map<string, WatchSubscription>>();
  private readonly _eventBus: ChangeEventBus;
  private readonly _maxQueueDepth?: number;
  /** Milliseconds. */
  private readonly _coalescingWindow?: number;

  /**
   * Create a WatchRegistry.
   *
   * @param eventBus - Event bus for filesystem change events.
   * @param options - Queue/coalescing configuration.
   */
  public constructor(eventBus: ChangeEventBus, options?: WatchRegistryOptions) {
    this._eventBus = eventBus;
    this._maxQueueDepth = options?.maxQueueDepth;
    this._coalescingWindow = options?.coalescingWindow;
  }

  /**
   * Register a watch subscription. Identical requests (by hash) share
   * one underlying ChangeEventBus listener with ref-counted disposal.
   *
   * @param request - Watch paths, recursion, and include/exclude globs.
   * @param handler - callback for matching events
   * @param options - Optional captured authority filter.
   * @returns unsubscribe function
   */
  public watch(
    request: WatchRequest,
    handler: (event: WatchEvent) => void,
    options?: WatchRegistrationOptions,
  ): () => void {
    const snapshot = snapshotWatchRequest(request);
    const hash = hashWatchRequest(snapshot);
    const subscriptions = this._subscriptionsFor(options?.authority);
    let subscription = subscriptions.get(hash);

    if (!subscription) {
      const coalescer = new EventCoalescer(
        (events) => {
          for (const event of events) {
            this._dispatchCoalescedEvent(subscription!, event);
          }
        },
        {
          coalescingWindow: this._coalescingWindow,
          maxQueueDepth: this._maxQueueDepth,
          onOverflow: () => {
            this._dispatchReset(subscription!);
          },
        },
      );
      const unsubscribeFromBus = this._eventBus.subscribe((event) => {
        this._filterAndEnqueue(subscription!, event, coalescer);
      });
      subscription = {
        request: snapshot,
        authority: options?.authority,
        handlers: new Topic<WatchEvent>({
          name: 'WatchRegistry.handlers',
          onError: (error) => {
            console.error('[WatchRegistry] Handler error:', error);
          },
        }),
        unsubscribeFromBus,
        coalescer,
      };
      subscriptions.set(hash, subscription);
    }

    const unsubscribeHandler = subscription.handlers.subscribe(handler);

    let unsubscribed = false;
    return () => {
      if (unsubscribed) {
        return;
      }
      unsubscribed = true;
      unsubscribeHandler();
      this._removeSubscriptionWhenEmpty(subscriptions, hash, subscription);
    };
  }

  /** Emit a reset event to all subscribers. */
  public emitResetAll(): void {
    for (const subscription of this._allSubscriptions()) {
      subscription.coalescer.flush();
      subscription.handlers.emit({ type: 'reset' });
    }
  }

  /**
   * Number of unique deduplicated subscriptions.
   *
   * @returns Count of unique subscriptions.
   */
  public get subscriptionCount(): number {
    let count = this._subscriptions.size;
    for (const subscriptions of this._authoritySubscriptions.values()) {
      count += subscriptions.size;
    }
    return count;
  }

  /**
   * Total number of individual handler registrations across all subscriptions.
   *
   * @returns Total handler count across all subscriptions.
   */
  public get handlerCount(): number {
    let count = 0;
    for (const sub of this._allSubscriptions()) {
      count += sub.handlers.size;
    }
    return count;
  }

  /** Dispose all subscriptions and coalescers. */
  public dispose(): void {
    for (const subscription of this._allSubscriptions()) {
      subscription.coalescer.dispose();
      subscription.unsubscribeFromBus();
      subscription.handlers.dispose();
    }
    this._subscriptions.clear();
    this._authoritySubscriptions.clear();
  }

  /**
   * Route events by captured authority and path/glob, then enqueue them.
   * Coalescer will batch and deliver via _dispatchCoalescedEvent.
   *
   * @param subscription - Captured subscription.
   * @param event - Change event from the bus.
   * @param coalescer - Event coalescer to enqueue into.
   */
  private _filterAndEnqueue(subscription: WatchSubscription, event: ChangeEvent, coalescer: EventCoalescer): void {
    if (subscription.authority === undefined) {
      if (!isEventGloballyVisible(event)) {
        return;
      }
    } else {
      const authorities = getEventAuthorities(event);
      if (authorities !== undefined && !authorities.includes(subscription.authority)) {
        return;
      }
      if (authorities === undefined && event.type !== 'backendChanged') {
        return;
      }
    }

    if (subscription.handlers.size === 0) {
      return;
    }

    const { request } = subscription;

    if (event.type === 'backendChanged') {
      coalescer.flush();
      subscription.handlers.emit({ type: 'reset' });
      return;
    }

    if (event.type === 'directoryChanged') {
      if (!isSummaryMatched(event.path, request.paths, request.recursive ?? false)) {
        return;
      }
      coalescer.flush();
      const resetEvent: WatchEvent = { type: 'reset' };
      const origin = getEventOrigin(event);
      if (origin !== undefined) {
        tagEventOrigin(resetEvent, origin);
      }
      subscription.handlers.emit(resetEvent);
      return;
    }

    if (
      ((event.type === 'directoryCreated' || event.type === 'directoryDeleted') &&
        summaryContainsDescendantWatch(event.path, request.paths)) ||
      (event.type === 'directoryRenamed' &&
        (summaryContainsDescendantWatch(event.oldPath, request.paths) ||
          summaryContainsDescendantWatch(event.newPath, request.paths)))
    ) {
      coalescer.flush();
      subscription.handlers.emit({ type: 'reset' });
      return;
    }

    const matches = getEventPaths(event).some(
      (path) =>
        isPathMatched(path, request.paths, request.recursive ?? false) &&
        !matchesExcludes(path, request.excludes) &&
        matchesIncludes(path, request.includes),
    );
    if (!matches) {
      return;
    }

    coalescer.push(event);
  }

  /**
   * Emit reset when the coalescer queue is exceeded.
   *
   * @param subscription - Captured subscription.
   */
  private _dispatchReset(subscription: WatchSubscription): void {
    subscription.handlers.emit({ type: 'reset' });
  }

  /**
   * Deliver a coalesced ChangeEvent as a WatchEvent to all handlers.
   *
   * @param subscription - Captured subscription.
   * @param event - Coalesced change event.
   */
  private _dispatchCoalescedEvent(subscription: WatchSubscription, event: ChangeEvent): void {
    const watchEvent = changeEventToWatchEvent(event);
    if (!watchEvent) {
      return;
    }

    subscription.handlers.emit(watchEvent);
  }

  private _removeSubscriptionWhenEmpty(
    subscriptions: Map<string, WatchSubscription>,
    hash: string,
    subscription: WatchSubscription,
  ): void {
    if (subscription.handlers.size === 0 && subscriptions.get(hash) === subscription) {
      subscription.coalescer.dispose();
      subscription.unsubscribeFromBus();
      subscriptions.delete(hash);
      if (subscription.authority !== undefined && subscriptions.size === 0) {
        this._authoritySubscriptions.delete(subscription.authority);
      }
    }
  }

  private _subscriptionsFor(authority: WeakKey | undefined): Map<string, WatchSubscription> {
    if (authority === undefined) {
      return this._subscriptions;
    }
    let subscriptions = this._authoritySubscriptions.get(authority);
    if (subscriptions === undefined) {
      subscriptions = new Map();
      this._authoritySubscriptions.set(authority, subscriptions);
    }
    return subscriptions;
  }

  private *_allSubscriptions(): IterableIterator<WatchSubscription> {
    yield* this._subscriptions.values();
    for (const subscriptions of this._authoritySubscriptions.values()) {
      yield* subscriptions.values();
    }
  }
}
