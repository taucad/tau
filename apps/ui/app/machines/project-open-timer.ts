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
  /** A tree read during the open fetched at least one large object from the remote. */
  fetchedFromNetwork: () => void;
  /** The project's repository is checked out and its editor and file tree are usable; the first call counts. */
  firstView: () => void;
  /** Every large object of the checkout is in the local store; the first call counts. */
  fullyFetched: () => void;
}>;

/**
 * Time one hosted project's open, from its revision root opening (STO-25).
 *
 * `first_view` is the repository checked out, so the editor and file tree are
 * usable; `fully_fetched` is every large object local, so the viewer can
 * render. `cache` is cold when the open fetched at least one large object from
 * the network, and is only known once everything is local, so both marks are
 * sent together then. `fully_fetched` never reads earlier than `first_view`.
 * A root released before it is fully fetched sends nothing.
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
  let firstViewAt: number | undefined;
  let fullyFetchedAt: number | undefined;
  let settled = false;
  const settle = (): void => {
    if (settled || firstViewAt === undefined || fullyFetchedAt === undefined) {
      return;
    }
    settled = true;
    const cache = cold ? 'cold' : 'warm';
    options.report({ phase: 'first_view', cache, durationMilliseconds: Math.max(0, firstViewAt - startedAt) });
    options.report({
      phase: 'fully_fetched',
      cache,
      durationMilliseconds: Math.max(0, Math.max(firstViewAt, fullyFetchedAt) - startedAt),
    });
  };
  return Object.freeze({
    fetchedFromNetwork: () => {
      if (fullyFetchedAt === undefined) {
        cold = true;
      }
    },
    firstView: () => {
      firstViewAt ??= now();
      settle();
    },
    fullyFetched: () => {
      fullyFetchedAt ??= now();
      settle();
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
 * applied — so an applied checkout without it is `fully_fetched`.
 *
 * @param timer - The project's open timer.
 * @param status - A status the project's root published.
 * @public
 */
export const markProjectOpen = (
  timer: ProjectOpenTimer,
  status: Pick<RevisionStatusProjection, 'remote' | 'sync' | 'largeObjects'>,
): void => {
  if (!isHostedCheckoutApplied(status)) {
    return;
  }
  timer.firstView();
  if (status.largeObjects === undefined) {
    timer.fullyFetched();
  }
};
