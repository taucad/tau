/**
 * Ref-counted watch subscription registry: the authority's watch plane.
 *
 * Deduplicates identical watch requests so multiple consumers share one
 * subscription. The registry holds one {@link ChangeEventBus} listener for all
 * of them and finds the subscriptions an event can reach with a prefix trie of
 * their watch paths, so matching costs O(facts × depth) instead of
 * O(facts × subscriptions) (charter D6). The returned unsubscribe owns
 * lifecycle cleanup.
 *
 * Two delivery forms share the plane:
 *
 * - {@link WatchRegistry.watchChangeSets} delivers one {@link ChangeSet} per
 *   committed changeset (`immediate`), or one per animation frame (`frame`),
 *   with exact entries and touched directories or an explicit scoped reset.
 * - {@link WatchRegistry.watch} delivers per-path {@link WatchEvent}s after a
 *   coalescing window, for consumers that have not moved to change sets.
 */

import { Topic } from '@taucad/events';
import { toChangeSet } from '#change-event-bus.js';
import type { ChangeEventBus, ChangeSet, ChangeSetReset, ChangeSetResetReason } from '#change-event-bus.js';
import type { ChangeEvent, PathChangeEvent, WatchRequest, WatchEvent } from '#types.js';
import { changeEventEntries } from '#changeset.js';
import { ChangeSetCoalescer, EventCoalescer } from '#event-coalescer.js';
import type { FrameScheduler } from '#event-coalescer.js';
import { getEventAuthorities, getEventOrigin, isEventGloballyVisible, tagEventOrigin } from '#event-origin-registry.js';
import { canonicalizePath, parentDirectory } from '@taucad/utils/path';

/**
 * A watch on the change-set form of the plane.
 *
 * `coalesce: 'immediate'` (the default; kernels and revisions) delivers each
 * changeset as it commits; `'frame'` (UI connections) merges every changeset
 * one animation frame commits into one delivery.
 *
 * @public
 */
export type ChangeSetWatchRequest = WatchRequest & { coalesce?: 'immediate' | 'frame' };

type SubscriptionBase = {
  readonly hash: string;
  readonly request: WatchRequest;
  readonly authority?: WeakKey;
};

type EventSubscription = SubscriptionBase & {
  readonly form: 'events';
  readonly handlers: Topic<WatchEvent>;
  readonly coalescer: EventCoalescer;
};

type ChangeSetSubscription = SubscriptionBase & {
  readonly form: 'changeSets';
  readonly handlers: Topic<ChangeSet>;
  readonly frame?: ChangeSetCoalescer;
  readonly skipOrigin?: string;
  /** Facts this subscription admitted from the event being dispatched. */
  facts: PathChangeEvent[];
  /** A reset this subscription earned from the event being dispatched. */
  reset?: ChangeSetReset;
};

type WatchSubscription = EventSubscription | ChangeSetSubscription;

/** One trie node per watch-path segment; subscriptions sit at the node of each path they watch. */
type TrieNode = {
  readonly children: Map<string, TrieNode>;
  readonly recursive: Set<WatchSubscription>;
  readonly direct: Set<WatchSubscription>;
};

const createNode = (): TrieNode => ({ children: new Map(), recursive: new Set(), direct: new Set() });

const segmentsOf = (path: string): string[] => {
  const canonical = canonicalizePath(path);
  return canonical === '/' ? [] : canonical.slice(1).split('/');
};

/**
 * Add every subscription at or below a node.
 *
 * @param node - The subtree's root.
 * @param into - Collects the subscriptions.
 */
const collectBelow = (node: TrieNode, into: Set<WatchSubscription>): void => {
  for (const subscription of node.recursive) {
    into.add(subscription);
  }
  for (const subscription of node.direct) {
    into.add(subscription);
  }
  for (const child of node.children.values()) {
    collectBelow(child, into);
  }
};

/**
 * The subscriptions an event path can reach: recursive watches on any ancestor
 * or the path itself, direct watches on its parent or itself, and with
 * `subtree` every watch at or below it (a summary or directory fact can
 * replace a watched descendant). A superset: each candidate's filter decides.
 */
class WatchTrie {
  readonly #root = createNode();

  public add(path: string, subscription: WatchSubscription, recursive: boolean): void {
    let node = this.#root;
    for (const segment of segmentsOf(path)) {
      let child = node.children.get(segment);
      if (child === undefined) {
        child = createNode();
        node.children.set(segment, child);
      }
      node = child;
    }
    (recursive ? node.recursive : node.direct).add(subscription);
  }

  public remove(path: string, subscription: WatchSubscription): void {
    const trail: Array<{ node: TrieNode; segment: string }> = [];
    let node: TrieNode | undefined = this.#root;
    for (const segment of segmentsOf(path)) {
      const child: TrieNode | undefined = node.children.get(segment);
      if (child === undefined) {
        return;
      }
      trail.push({ node, segment });
      node = child;
    }
    node.recursive.delete(subscription);
    node.direct.delete(subscription);
    /* Prune the branch back to the first node still in use. */
    for (let index = trail.length - 1; index >= 0; index--) {
      const { node: parent, segment } = trail[index]!;
      const child = parent.children.get(segment)!;
      if (child.children.size > 0 || child.recursive.size > 0 || child.direct.size > 0) {
        break;
      }
      parent.children.delete(segment);
    }
  }

  public collect(path: string, subtree: boolean, into: Set<WatchSubscription>): void {
    const segments = segmentsOf(path);
    let node: TrieNode | undefined = this.#root;
    for (let depth = 0; node !== undefined; depth++) {
      for (const subscription of node.recursive) {
        into.add(subscription);
      }
      if (depth >= segments.length - 1) {
        for (const subscription of node.direct) {
          into.add(subscription);
        }
      }
      if (depth === segments.length) {
        if (subtree) {
          collectBelow(node, into);
        }
        return;
      }
      node = node.children.get(segments[depth]!);
    }
  }

  public collectAll(into: Set<WatchSubscription>): void {
    collectBelow(this.#root, into);
  }
}

const snapshotWatchRequest = (request: WatchRequest): WatchRequest => ({
  paths: request.paths.map(canonicalizePath).sort(),
  recursive: request.recursive ?? false,
  includes: request.includes === undefined ? undefined : [...request.includes].sort(),
  excludes: request.excludes === undefined ? undefined : [...request.excludes].sort(),
});

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

function getEventPaths(event: PathChangeEvent): string[] {
  switch (event.type) {
    case 'fileWritten':
    case 'fileDeleted':
    case 'directoryCreated':
    case 'directoryDeleted':
    case 'directoryChanged': {
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
    case 'backendChanged': {
      return [];
    }
  }
}

/**
 * Whether a fact's path may sit above a watched path, so the trie also offers the watches below it.
 *
 * @param event - One path fact.
 * @returns `true` for summaries and directory facts.
 */
const reachesBelow = (event: PathChangeEvent): boolean =>
  event.type === 'directoryChanged' ||
  event.type === 'directoryCreated' ||
  event.type === 'directoryDeleted' ||
  event.type === 'directoryRenamed';

/** What one fact means to one subscription. */
type Admission =
  | { readonly verdict: 'skip' }
  | { readonly verdict: 'match' }
  /** The subscription must resync; `summary` is the fact itself when it is a summary. */
  | {
      readonly verdict: 'reset';
      readonly prefix: string;
      readonly reason: ChangeSetResetReason;
      readonly summary: boolean;
    };

/**
 * Optional configuration for WatchRegistry.
 * @public
 */
export type WatchRegistryOptions = {
  maxQueueDepth?: number;
  /** Coalescing window. Default: 50. Milliseconds. */
  coalescingWindow?: number;
  /** Deliver the first events of a quiet subscription on the next tick; see `CoalescerOptions.leadingEdge`. */
  leadingEdge?: boolean;
  /** When a `frame` change-set watch's window closes. Default: the next animation frame. */
  frameScheduler?: FrameScheduler;
};

/** Internal authority selector used by captured rooted filesystems. */
type WatchRegistrationOptions = {
  authority?: WeakKey;
  /** Change-set watches only: leave out every fact this bridge port originated (skip-originator). */
  skipOrigin?: string;
};

/**
 * Ref-counted watch subscription registry with event coalescing and overflow handling.
 * @public
 */
export class WatchRegistry {
  private readonly _subscriptions = new Map<string, WatchSubscription>();
  private readonly _authoritySubscriptions = new Map<WeakKey, Map<string, WatchSubscription>>();
  private readonly _trie = new WatchTrie();
  private readonly _eventBus: ChangeEventBus;
  private readonly _maxQueueDepth?: number;
  /** Milliseconds. */
  private readonly _coalescingWindow?: number;
  private readonly _leadingEdge?: boolean;
  private readonly _frameScheduler?: FrameScheduler;
  private _unsubscribeFromBus: (() => void) | undefined;

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
    this._leadingEdge = options?.leadingEdge;
    this._frameScheduler = options?.frameScheduler;
  }

  /**
   * Register a per-path watch. Identical requests (by hash) share one
   * subscription with ref-counted disposal; events arrive after the
   * coalescing window, one per path.
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
    const hash = `events\0${JSON.stringify(snapshot)}`;
    const subscriptions = this._subscriptionsFor(options?.authority);
    let subscription = subscriptions.get(hash) as EventSubscription | undefined;

    if (!subscription) {
      const handlers = new Topic<WatchEvent>({
        name: 'WatchRegistry.handlers',
        onError: (error) => {
          console.error('[WatchRegistry] Handler error:', error);
        },
      });
      const coalescer = new EventCoalescer(
        (events) => {
          for (const event of events) {
            const watchEvent = changeEventToWatchEvent(event);
            if (watchEvent !== undefined) {
              handlers.emit(watchEvent);
            }
          }
        },
        {
          coalescingWindow: this._coalescingWindow,
          leadingEdge: this._leadingEdge,
          maxQueueDepth: this._maxQueueDepth,
          onOverflow: () => {
            handlers.emit({ type: 'reset' });
          },
        },
      );
      subscription = { form: 'events', hash, request: snapshot, authority: options?.authority, handlers, coalescer };
      this._register(subscriptions, subscription);
    }

    return this._lease(subscriptions, subscription, subscription.handlers.subscribe(handler));
  }

  /**
   * Register a change-set watch (charter D6): one {@link ChangeSet} per
   * committed changeset that reaches the watched paths, carrying only the
   * facts the request admits, or one per frame with `coalesce: 'frame'`.
   * Identical requests share one subscription.
   *
   * @param request - Watch paths, recursion, include/exclude globs and the delivery cadence.
   * @param handler - Receives each change set.
   * @param options - Optional captured authority filter and the port whose own facts are left out.
   * @returns unsubscribe function
   */
  public watchChangeSets(
    request: ChangeSetWatchRequest,
    handler: (set: ChangeSet) => void,
    options?: WatchRegistrationOptions,
  ): () => void {
    const snapshot = snapshotWatchRequest(request);
    const coalesce = request.coalesce ?? 'immediate';
    const skipOrigin = options?.skipOrigin;
    const hash = `changeSets\0${coalesce}\0${skipOrigin ?? ''}\0${JSON.stringify(snapshot)}`;
    const subscriptions = this._subscriptionsFor(options?.authority);
    let subscription = subscriptions.get(hash) as ChangeSetSubscription | undefined;

    if (!subscription) {
      const handlers = new Topic<ChangeSet>({
        name: 'WatchRegistry.changeSetHandlers',
        onError: (error) => {
          console.error('[WatchRegistry] Change-set handler error:', error);
        },
      });
      const frame =
        coalesce === 'frame'
          ? new ChangeSetCoalescer(
              (set) => {
                handlers.emit(set);
              },
              {
                ...(this._frameScheduler === undefined ? {} : { schedule: this._frameScheduler }),
                ...(this._maxQueueDepth === undefined ? {} : { maxEntries: this._maxQueueDepth }),
              },
            )
          : undefined;
      subscription = {
        form: 'changeSets',
        hash,
        request: snapshot,
        authority: options?.authority,
        ...(skipOrigin === undefined ? {} : { skipOrigin }),
        handlers,
        ...(frame === undefined ? {} : { frame }),
        facts: [],
      };
      this._register(subscriptions, subscription);
    }

    return this._lease(subscriptions, subscription, subscription.handlers.subscribe(handler));
  }

  /**
   * Tell every subscriber its stream is no longer reliable: per-path watches
   * receive `reset`, change-set watches a reset of `/`.
   *
   * @param reason - Why exactness was lost. Default: `topology`.
   */
  public emitResetAll(reason: ChangeSetResetReason = 'topology'): void {
    for (const subscription of this._allSubscriptions()) {
      if (subscription.form === 'events') {
        subscription.coalescer.flush();
        subscription.handlers.emit({ type: 'reset' });
        continue;
      }
      subscription.frame?.flush();
      subscription.handlers.emit({
        generation: this._eventBus.generation,
        entries: [],
        touchedDirectories: [],
        reset: { prefix: '/', reason },
      });
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
      this._disposeSubscription(subscription);
    }
    this._subscriptions.clear();
    this._authoritySubscriptions.clear();
    this._unsubscribeFromBus?.();
    this._unsubscribeFromBus = undefined;
  }

  private _register(subscriptions: Map<string, WatchSubscription>, subscription: WatchSubscription): void {
    subscriptions.set(subscription.hash, subscription);
    for (const path of subscription.request.paths) {
      this._trie.add(path, subscription, subscription.request.recursive ?? false);
    }
    this._unsubscribeFromBus ??= this._eventBus.subscribe((event) => {
      this._dispatch(event);
    });
  }

  private _lease(
    subscriptions: Map<string, WatchSubscription>,
    subscription: WatchSubscription,
    unsubscribeHandler: () => void,
  ): () => void {
    let unsubscribed = false;
    return () => {
      if (unsubscribed) {
        return;
      }
      unsubscribed = true;
      unsubscribeHandler();
      this._removeSubscriptionWhenEmpty(subscriptions, subscription);
    };
  }

  /**
   * Route one bus event: each fact reaches the subscriptions the trie offers
   * for its paths, and each change-set subscription it reached receives one
   * change set built from the facts it admitted.
   *
   * @param event - One committed changeset's event.
   */
  private _dispatch(event: ChangeEvent): void {
    const { generation } = this._eventBus;
    const reached = new Set<ChangeSetSubscription>();
    const candidates = new Set<WatchSubscription>();
    for (const fact of changeEventEntries(event)) {
      candidates.clear();
      if (fact.type === 'backendChanged') {
        this._trie.collectAll(candidates);
      } else {
        for (const path of getEventPaths(fact)) {
          this._trie.collect(path, reachesBelow(fact), candidates);
        }
      }
      for (const subscription of candidates) {
        const admission = this._admit(subscription, fact);
        if (admission.verdict === 'skip') {
          continue;
        }
        if (subscription.form === 'events') {
          this._deliverEvent(subscription, fact, admission);
          continue;
        }
        if (subscription.skipOrigin !== undefined && getEventOrigin(fact) === subscription.skipOrigin) {
          continue;
        }
        if (admission.verdict === 'match' || admission.summary) {
          subscription.facts.push(fact);
        } else {
          subscription.reset = { prefix: admission.prefix, reason: admission.reason };
        }
        reached.add(subscription);
      }
    }
    for (const subscription of reached) {
      const set = toChangeSet(subscription.facts, generation, subscription.reset);
      subscription.facts = [];
      subscription.reset = undefined;
      if (set === undefined) {
        continue;
      }
      if (subscription.frame === undefined) {
        subscription.handlers.emit(set);
      } else {
        subscription.frame.push(set);
      }
    }
  }

  /**
   * Whether one fact reaches one subscription: by captured authority, then by
   * path and glob. A summary or a replaced ancestor of a watched path is a reset.
   *
   * @param subscription - A candidate the trie offered.
   * @param event - One path fact.
   * @returns The subscription's verdict.
   */
  private _admit(subscription: WatchSubscription, event: PathChangeEvent): Admission {
    if (subscription.authority === undefined) {
      if (!isEventGloballyVisible(event)) {
        return { verdict: 'skip' };
      }
    } else {
      const authorities = getEventAuthorities(event);
      if (authorities !== undefined && !authorities.includes(subscription.authority)) {
        return { verdict: 'skip' };
      }
      if (authorities === undefined && event.type !== 'backendChanged') {
        return { verdict: 'skip' };
      }
    }

    if (subscription.handlers.size === 0) {
      return { verdict: 'skip' };
    }

    const { request } = subscription;

    if (event.type === 'backendChanged') {
      return { verdict: 'reset', prefix: '/', reason: 'topology', summary: true };
    }

    if (event.type === 'directoryChanged') {
      if (!isSummaryMatched(event.path, request.paths, request.recursive ?? false)) {
        return { verdict: 'skip' };
      }
      return { verdict: 'reset', prefix: canonicalizePath(event.path), reason: 'observer-uncertain', summary: true };
    }

    if (
      (event.type === 'directoryCreated' || event.type === 'directoryDeleted') &&
      summaryContainsDescendantWatch(event.path, request.paths)
    ) {
      return { verdict: 'reset', prefix: canonicalizePath(event.path), reason: 'topology', summary: false };
    }
    if (event.type === 'directoryRenamed') {
      for (const path of [event.oldPath, event.newPath]) {
        if (summaryContainsDescendantWatch(path, request.paths)) {
          return { verdict: 'reset', prefix: canonicalizePath(path), reason: 'topology', summary: false };
        }
      }
    }

    const matches = getEventPaths(event).some(
      (path) =>
        isPathMatched(path, request.paths, request.recursive ?? false) &&
        !matchesExcludes(path, request.excludes) &&
        matchesIncludes(path, request.includes),
    );
    return matches ? { verdict: 'match' } : { verdict: 'skip' };
  }

  /**
   * Hand one admitted fact to a per-path subscription: a match joins its
   * coalescing window; a reset flushes the window first so order holds.
   *
   * @param subscription - A per-path subscription.
   * @param event - The admitted fact.
   * @param admission - Its verdict.
   */
  private _deliverEvent(subscription: EventSubscription, event: PathChangeEvent, admission: Admission): void {
    if (admission.verdict === 'match') {
      subscription.coalescer.push(event);
      return;
    }
    subscription.coalescer.flush();
    const resetEvent: WatchEvent = { type: 'reset' };
    const origin = event.type === 'directoryChanged' ? getEventOrigin(event) : undefined;
    if (origin !== undefined) {
      tagEventOrigin(resetEvent, origin);
    }
    subscription.handlers.emit(resetEvent);
  }

  private _disposeSubscription(subscription: WatchSubscription): void {
    if (subscription.form === 'events') {
      subscription.coalescer.dispose();
    } else {
      subscription.frame?.dispose();
    }
    subscription.handlers.dispose();
    for (const path of subscription.request.paths) {
      this._trie.remove(path, subscription);
    }
  }

  private _removeSubscriptionWhenEmpty(
    subscriptions: Map<string, WatchSubscription>,
    subscription: WatchSubscription,
  ): void {
    if (subscription.handlers.size === 0 && subscriptions.get(subscription.hash) === subscription) {
      this._disposeSubscription(subscription);
      subscriptions.delete(subscription.hash);
      if (subscription.authority !== undefined && subscriptions.size === 0) {
        this._authoritySubscriptions.delete(subscription.authority);
      }
      if (this.subscriptionCount === 0) {
        this._unsubscribeFromBus?.();
        this._unsubscribeFromBus = undefined;
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
