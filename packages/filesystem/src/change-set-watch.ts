/**
 * A per-path watch consumer served by the change-set form (charter D6), over
 * any source that offers both forms: a bridge proxy, a change channel.
 *
 * @module
 */
import { watchEventsOfChangeSet } from '#change-event-bus.js';
import type { ChangeSet } from '#change-event-bus.js';
import type { WatchEvent, WatchRequest } from '#types.js';
import type { ChangeSetWatchRequest } from '#watch-registry.js';

/** A registered bridge watch: its acknowledgement, its closure and its disposer. @public */
export type BridgeWatchHandle = { ready: Promise<void>; closed: Promise<void>; unsubscribe(): void };

/** The two watch forms a bridge proxy offers. @public */
export type ChangeSetWatchSource = {
  watchReady?(request: WatchRequest, handler: (event: WatchEvent) => void): BridgeWatchHandle;
  watchChangeSets?(request: ChangeSetWatchRequest, handler: (set: ChangeSet) => void): BridgeWatchHandle;
};

const isUnsupported = (error: unknown): boolean =>
  error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOTSUP';

/**
 * Register `handler` for the per-path events of `request`, carried over the
 * wire in the change-set form: one frame per committed changeset, expanded
 * into its events on this side, so a fifty-file turn costs the authority one
 * delivery instead of fifty. A connection that answers `ENOTSUP` (a bare
 * provider with no change-set watch) gets the per-path form instead.
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
  const { watchChangeSets, watchReady } = source;
  if (watchChangeSets === undefined) {
    if (watchReady === undefined) {
      throw new TypeError('The watch source offers neither watch form.');
    }
    return watchReady.call(source, request, handler);
  }
  const initial = watchChangeSets.call(source, request, (set) => {
    for (const event of watchEventsOfChangeSet(set)) {
      handler(event);
    }
  });
  let current: BridgeWatchHandle = initial;
  let unsubscribed = false;
  const register = async (): Promise<void> => {
    try {
      await initial.ready;
    } catch (error) {
      if (!isUnsupported(error) || unsubscribed || watchReady === undefined) {
        throw error;
      }
      current = watchReady.call(source, request, handler);
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
