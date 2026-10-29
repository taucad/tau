import type { RevisionStatusProjection } from '@taucad/revisions';

/** Which moment of an open a mark times (STO-25). @public */
export type ProjectOpenPhase = 'first_view' | 'fully_fetched';

/** Whether the open fetched any large object from the network. @public */
export type ProjectOpenCache = 'cold' | 'warm';

/** One timed phase, for the host's telemetry sender. @public */
export type ProjectOpenMark = Readonly<{
  phase: ProjectOpenPhase;
  cache: ProjectOpenCache;
  /** From the timer's creation. Milliseconds. */
  durationMilliseconds: number;
}>;

/** One project's open, timed once. @public */
export type ProjectOpenTimer = Readonly<{
  /**
   * At least one large object of the open was not in the local store: a tree
   * read fetched it, or the checkout opened with it still to download (a
   * transfer shared with another reader counts, though no read reports it).
   */
  fetchedFromNetwork: () => void;
  /** The project's repository is checked out and its editor and file tree are usable; the first call counts. */
  firstView: () => void;
  /** Every large object of the checkout is in the local store; the first call after `firstView` counts. */
  fullyFetched: () => void;
}>;

/**
 * Time one hosted project's open, from its revision root opening (STO-25).
 *
 * `first_view` is the repository checked out, so the editor and file tree are
 * usable, and is sent then; `fully_fetched` is every large object local, so
 * the viewer can render, and is sent when the background fill completes.
 * `cache` is cold when any large object of the open came from the network,
 * as far as was known at that mark. A fill that fails, or a root released
 * before its fill completes, sends no `fully_fetched`.
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
  let viewed = false;
  let fetched = false;
  const mark = (phase: ProjectOpenPhase): void => {
    options.report({ phase, cache: cold ? 'cold' : 'warm', durationMilliseconds: Math.max(0, now() - startedAt) });
  };
  return Object.freeze({
    fetchedFromNetwork: () => {
      if (!fetched) {
        cold = true;
      }
    },
    firstView: () => {
      if (!viewed) {
        viewed = true;
        mark('first_view');
      }
    },
    fullyFetched: () => {
      if (viewed && !fetched) {
        fetched = true;
        mark('fully_fetched');
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
 * Mark an open's boundaries from one status its root published.
 *
 * `first_view` is the applied checkout. The large objects are filled after it
 * ("open the UI, model waits"), and the status carries `largeObjects` until
 * the last placeholder is written — published before the checkout reads as
 * applied — so an applied checkout without it is `fully_fetched`. A checkout
 * that opened with objects still to download is a cold open.
 *
 * @param timer - The project's open timer.
 * @param status - A status the project's root published.
 * @public
 */
export const markProjectOpen = (
  timer: ProjectOpenTimer,
  status: Pick<RevisionStatusProjection, 'remote' | 'sync' | 'largeObjects'>,
): void => {
  if (status.largeObjects !== undefined) {
    timer.fetchedFromNetwork();
  }
  if (!isHostedCheckoutApplied(status)) {
    return;
  }
  timer.firstView();
  if (status.largeObjects === undefined) {
    timer.fullyFetched();
  }
};
