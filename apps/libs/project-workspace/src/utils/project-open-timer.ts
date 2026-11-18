import { reachesReadiness } from '@taucad/revisions';
import type { LfsTransport, RevisionStatusProjection } from '@taucad/revisions';

/** Which moment of an open a mark times (STO-25). @public */
export type ProjectOpenPhase = 'first_view' | 'fully_fetched';

/** Whether the open fetched any large object from the network. @public */
export type ProjectOpenCache = 'cold' | 'warm';

/** One timed phase, for the host's telemetry sender. @public */
export type ProjectOpenMark = Readonly<{
  phase: ProjectOpenPhase;
  cache: ProjectOpenCache;
  /** On a cold mark, the transport of the open's latest network fetch, when one reported it (`tau.lfs.transport`). */
  transport?: LfsTransport;
  /** From the timer's creation. Milliseconds. */
  durationMilliseconds: number;
}>;

/** One project's open, timed once. @public */
export type ProjectOpenTimer = Readonly<{
  /**
   * At least one large object of the open was not in the local store: a tree
   * read fetched it, or the checkout opened with it still to download (a
   * transfer shared with another reader counts, though no read reports it).
   * A tree read that fetched names the transport that served it; the latest is kept.
   */
  fetchedFromNetwork: (transport?: LfsTransport) => void;
  /**
   * The project's first view is on screen (its file tree, editor and chats open); the first call counts. The mark is
   * timed now and sent once the open's cache is known: at once when a network fetch is already known, otherwise at
   * the next `fetchedFromNetwork`, `cacheKnown` or `fullyFetched`.
   */
  firstView: () => void;
  /** Whether the open fetched from the network is known (its checkout is applied): a first view held for it is sent. */
  cacheKnown: () => void;
  /** Every large object of the checkout is in the local store; the first call after `firstView` counts. */
  fullyFetched: () => void;
}>;

/**
 * Time one hosted project's open, from its revision root opening (STO-25).
 *
 * `first_view` is the project's first view on screen (its file tree, editor
 * and chats open), timed then; `fully_fetched` is every large object local, so
 * the viewer can render, and is sent when the background fill completes.
 * `cache` is cold when any large object of the open came from the network.
 * During a Tau Cloud open the first view shows while the apply still writes,
 * before the open can know whether it fetched, so its mark waits for that word
 * (a fetch, or the applied checkout) and keeps the time it was shown. A fill
 * that fails, or a root released before its fill completes, sends no
 * `fully_fetched`; a root released before its cache is known sends no
 * `first_view` either.
 *
 * @param options - The clock, and where each mark goes.
 * @returns The timer.
 * @public
 */
export const createProjectOpenTimer = (
  options: Readonly<{ report: (mark: ProjectOpenMark) => void; now?: () => number }>,
): ProjectOpenTimer => {
  const now = options.now ?? Date.now;
  const startedAt = now();
  let cold = false;
  /* When the first view showed, from the timer's creation; `undefined` until it has. */
  let viewedAfter: number | undefined;
  let viewSent = false;
  let fetched = false;
  let transport: LfsTransport | undefined;
  const mark = (phase: ProjectOpenPhase, durationMilliseconds: number): void => {
    options.report({
      phase,
      cache: cold ? 'cold' : 'warm',
      ...(cold && transport !== undefined ? { transport } : {}),
      durationMilliseconds,
    });
  };
  /* The held first view goes out once the cache is known, with the time it was shown. */
  const sendView = (): void => {
    if (viewedAfter !== undefined && !viewSent) {
      viewSent = true;
      mark('first_view', viewedAfter);
    }
  };
  return Object.freeze({
    fetchedFromNetwork: (served?: LfsTransport) => {
      if (!fetched) {
        cold = true;
        transport = served ?? transport;
        sendView();
      }
    },
    firstView: () => {
      if (viewedAfter === undefined) {
        viewedAfter = Math.max(0, now() - startedAt);
        if (cold) {
          sendView();
        }
      }
    },
    cacheKnown: sendView,
    fullyFetched: () => {
      if (viewedAfter !== undefined && !fetched) {
        /* Every object is local: whatever the open fetched is known. */
        sendView();
        fetched = true;
        mark('fully_fetched', Math.max(0, now() - startedAt));
      }
    },
  });
};

/**
 * Whether a status shows a Tau Cloud project's open pull has applied the
 * remote's authored checkout (`sync.hasAppliedRemote`): the repository is
 * checked out, the first-view boundary.
 *
 * @param status - A status the project's root published.
 * @returns Whether the checkout is applied.
 * @public
 */
export const isHostedCheckoutApplied = (status: Pick<RevisionStatusProjection, 'remote' | 'sync'>): boolean =>
  status.remote.kind === 'tau' && status.sync.hasAppliedRemote === true;

/**
 * Whether a status shows a Tau Cloud project's first view on screen: the page opens its file tree, editor and chats
 * (the composer) once the open's write has landed the entry closure and the chats' records have landed (D10, SP2h),
 * as the page's first-view surfaces read the same projection. An applied checkout is a first view too. A failed or
 * refused open, and a readiness not yet published, are none (I7).
 *
 * @param status - A status the project's root published.
 * @returns Whether the first view is on screen.
 * @public
 */
export const isHostedFirstView = (status: Pick<RevisionStatusProjection, 'remote' | 'sync' | 'readiness'>): boolean => {
  if (isHostedCheckoutApplied(status)) {
    return true;
  }
  const { remote, sync } = status;
  const failed =
    sync.state === 'failed' ||
    sync.state === 'queued' ||
    sync.state === 'conflicted' ||
    remote.phase === 'reconnectRequired' ||
    remote.phase === 'failed';
  return (
    remote.kind === 'tau' &&
    !failed &&
    sync.pullPhase === 'applying' &&
    reachesReadiness(status.readiness, 'entryReady') &&
    (sync.chats === 'ready' || sync.chats === 'disabled')
  );
};

/**
 * Mark an open's boundaries from one status its root published.
 *
 * `first_view` is the first view on screen ({@link isHostedFirstView}), sent once the open's cache is known. The
 * large objects are filled after the apply ("open the UI, model waits"), and the status carries `largeObjects` until
 * the last placeholder is written — published before the checkout reads as applied — so the applied checkout is
 * where the cache is known, and an applied checkout without it is `fully_fetched`. A checkout that opened with
 * objects still to download is a cold open.
 *
 * @param timer - The project's open timer.
 * @param status - A status the project's root published.
 * @public
 */
export const markProjectOpen = (
  timer: ProjectOpenTimer,
  status: Pick<RevisionStatusProjection, 'remote' | 'sync' | 'largeObjects' | 'readiness'>,
): void => {
  if (status.largeObjects !== undefined) {
    timer.fetchedFromNetwork();
  }
  if (isHostedFirstView(status)) {
    timer.firstView();
  }
  if (!isHostedCheckoutApplied(status)) {
    return;
  }
  timer.cacheKnown();
  if (status.largeObjects === undefined) {
    timer.fullyFetched();
  }
};
