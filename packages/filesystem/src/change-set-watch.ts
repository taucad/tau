/**
 * A per-path watch consumer served by the connection's event channel or the
 * change-set form (charter D6, D14), over any source that offers them: a
 * bridge proxy, a change channel.
 *
 * @module
 */
import { watchEventsOfChangeSet } from '#change-event-bus.js';
import type { ChangeSet } from '#change-event-bus.js';
import type { WatchEvent, WatchRequest } from '#types.js';
import { watchEventsOfChangeSetFor } from '#watch-registry.js';
import type { ChangeSetWatchRequest } from '#watch-registry.js';

/** A registered bridge watch: its acknowledgement, its closure and its disposer. @public */
export type BridgeWatchHandle = { ready: Promise<void>; closed: Promise<void>; unsubscribe(): void };

/**
 * One frame of a connection's event channel as a watch reads it: a rooted
 * bridge proxy's `FileSystemBridgeEvent`, written out structurally.
 *
 * @public
 */
export type ChangeSetChannelEvent =
  | Readonly<{ kind: 'changeSet'; set: ChangeSet }>
  | Readonly<{ kind: 'compute-restarted' }>
  | Readonly<{ kind: 'authority-lost' }>;

/** The watch forms a bridge proxy offers. @public */
export type ChangeSetWatchSource = {
  /** The connection's one event channel (D14): every change set of the root as its view sees it. */
  events?(handler: (event: ChangeSetChannelEvent) => void): BridgeWatchHandle;
  watchReady?(request: WatchRequest, handler: (event: WatchEvent) => void): BridgeWatchHandle;
  watchChangeSets?(request: ChangeSetWatchRequest, handler: (set: ChangeSet) => void): BridgeWatchHandle;
};

const isUnsupported = (error: unknown): boolean =>
  error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOTSUP';

/** Sources whose connection answered `ENOTSUP` for its event channel: later watches skip it. */
const withoutEventChannel = new WeakSet<ChangeSetWatchSource>();

/**
 * A registration that steps down once: when `initial` answers `ENOTSUP`, the
 * registration `fallback` makes replaces it, and `ready`, `closed` and
 * `unsubscribe` follow the one that holds.
 *
 * @param initial - The preferred registration.
 * @param fallback - The next form down, or `undefined` when there is none.
 * @returns The registration.
 */
const steppingDown = (
  initial: BridgeWatchHandle,
  fallback: (() => BridgeWatchHandle) | undefined,
): BridgeWatchHandle => {
  let current = initial;
  let unsubscribed = false;
  const register = async (): Promise<void> => {
    try {
      await initial.ready;
    } catch (error) {
      if (!isUnsupported(error) || unsubscribed || fallback === undefined) {
        throw error;
      }
      current = fallback();
      await current.ready;
    }
  };
  const ready = register();
  const follow = async (): Promise<void> => {
    await ready;
    await current.closed;
  };
  const closed = follow();
  const observeClosed = async (): Promise<void> => {
    try {
      await closed;
    } catch {
      /* A caller observes a failure through `ready`; `closed` must not also surface it unobserved. */
    }
  };
  // async-iife: bootstrap
  void observeClosed();
  return {
    ready,
    closed,
    unsubscribe: () => {
      unsubscribed = true;
      current.unsubscribe();
    },
  };
};

/**
 * The change-set form, scoped by the authority, then the per-path form.
 *
 * @param source - The bridge proxy.
 * @param request - Paths and matching scope.
 * @param handler - The watch's events.
 * @returns The registration, or `undefined` when the source offers neither form.
 */
const watchByScopedForms = (
  source: ChangeSetWatchSource,
  request: WatchRequest,
  handler: (event: WatchEvent) => void,
): BridgeWatchHandle | undefined => {
  const { watchChangeSets, watchReady } = source;
  const perPath = watchReady === undefined ? undefined : () => watchReady.call(source, request, handler);
  if (watchChangeSets === undefined) {
    return perPath?.();
  }
  const initial = watchChangeSets.call(source, request, (set) => {
    for (const event of watchEventsOfChangeSet(set)) {
      handler(event);
    }
  });
  return steppingDown(initial, perPath);
};

/**
 * Register `handler` for the per-path events of `request` with as little wire
 * as the source allows (charter D6, D14):
 *
 * 1. On the connection's one event channel, when the source offers `events`:
 *    the watch reads its own events off each change set of the root, so the
 *    authority delivers a changeset to the connection once however many
 *    watches it holds.
 * 2. In the change-set form, scoped by the authority: one frame per committed
 *    changeset per watch, expanded into its events on this side.
 * 3. In the per-path form.
 *
 * A form the connection answers `ENOTSUP` for steps down to the next; a source
 * whose event channel was refused skips it for later watches.
 *
 * @param source - The bridge proxy.
 * @param request - Paths and matching scope.
 * @param handler - Exact changes, both rename edges, or an explicit reset.
 * @returns The registration, shaped like `watchReady`'s.
 * @public
 */
export const watchByChangeSets = (
  source: ChangeSetWatchSource,
  request: WatchRequest,
  handler: (event: WatchEvent) => void,
): BridgeWatchHandle => {
  const { events } = source;
  const scoped = (): BridgeWatchHandle => {
    const watch = watchByScopedForms(source, request, handler);
    if (watch === undefined) {
      throw new TypeError('The watch source offers no watch form.');
    }
    return watch;
  };
  if (typeof events !== 'function' || withoutEventChannel.has(source)) {
    return scoped();
  }
  const initial = events.call(source, (event) => {
    if (event.kind !== 'changeSet') {
      return;
    }
    for (const watchEvent of watchEventsOfChangeSetFor(event.set, request)) {
      handler(watchEvent);
    }
  });
  const hasScopedForm = source.watchChangeSets !== undefined || source.watchReady !== undefined;
  return steppingDown(
    initial,
    hasScopedForm
      ? () => {
          withoutEventChannel.add(source);
          return scoped();
        }
      : undefined,
  );
};
