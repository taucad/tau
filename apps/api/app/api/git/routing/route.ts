import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * The per-repository route (Hosted Remote Storage DW1, W10 R1): which store
 * serves a repository, and whether its requests are held while a migration or
 * a restore moves it. Every store change after this is a migration job rather
 * than a release.
 *
 * Nothing here talks to Postgres or Redis; `route-table.ts` reads and writes
 * the rows, `route-cache.ts` keeps them per Machine, and `route-guard.ts` is
 * the admission step that holds a frozen repository's requests.
 */

/**
 * The stores this build can serve. `project_git_route.store` is checked
 * against the same list in Postgres, so a value no build knows cannot be
 * written; adding one is an additive constraint change that ships with the
 * code that serves it (DM2).
 */
export const repositoryStores = ['r2'] as const;

/** One of {@link repositoryStores}. */
export type RepositoryStoreName = (typeof repositoryStores)[number];

/** Today's R2 store: what a repository with no route row, or default columns, is served by. */
export const defaultRepositoryStore: RepositoryStoreName = 'r2';

/**
 * A repository's route as the request path reads it. `store` is a string
 * rather than {@link RepositoryStoreName} because a newer build may have
 * written a value this one does not serve (N/N-1 deploys); `isServedStore`
 * is how the guard tells.
 */
export type RepositoryRoute = {
  readonly store: string;
  /** When the freeze that holds now began; absent when not frozen. */
  readonly frozenAt?: Date;
  /** Until when requests are held; a freeze is a lease, so a dead writer's lapses on its own. */
  readonly frozenUntil?: Date;
  /** The migration or restore that holds the freeze. */
  readonly migrationId?: string;
  /** Whether the freeze that holds is the global one rather than this repository's own. */
  readonly global?: boolean;
};

/** The route of a repository nothing has ever routed: today's R2 store, not frozen (DW1 acceptance). */
export const defaultRoute: RepositoryRoute = Object.freeze({
  store: defaultRepositoryStore,
});

/**
 * How long one API Machine trusts a route it read (north star risk row, FR13):
 * at most 5 s. Safety never depends on it, because the fence commit makes a
 * lease taken before a freeze lose its compare-and-swap whatever a cache says;
 * the bound is how long a frozen or switched repository can still be admitted
 * from a stale entry.
 */
export const routeCacheTtlMilliseconds = 5000;

/**
 * How long a *frozen* entry is trusted. A held request re-reads its route at
 * this cadence, so a thaw releases it within about a tenth of a second, and
 * the requests one Machine holds for one repository share that one read.
 */
export const frozenRouteRecheckMilliseconds = 100;

/** DW2: how long a request to a frozen repository is held before it is refused (W10 R2: "up to 5 s"). */
export const freezeHoldMilliseconds = 5000;

/** DW2: the `Retry-After` a refused hold carries, which `packages/revisions` already honours on a 429. */
export const freezeRetryAfterSeconds = 1;

/**
 * Whether this build serves `store`.
 *
 * @param store - A route's store, as read.
 * @returns True for a store in {@link repositoryStores}.
 */
export const isServedStore = (store: string): store is RepositoryStoreName =>
  (repositoryStores as readonly string[]).includes(store);

/**
 * Whether a route holds requests at `now`.
 *
 * @param route - The route as read.
 * @param now - Epoch milliseconds.
 * @returns True while the freeze lease has not lapsed.
 */
export const isFrozen = (route: RepositoryRoute, now: number): boolean =>
  route.frozenUntil !== undefined && route.frozenUntil.getTime() > now;

/**
 * The refusal a freeze ends in once the hold is spent (DW2): `429` with
 * `retryAfterSeconds`, which the git controller copies into `Retry-After` and
 * the client honours as its wait. A 429, not the 503 a lost race is, because
 * the client keeps `Retry-After` only on a 429 and turns a 503 into its own
 * 5 s doubling backoff (W10 Finding 5).
 *
 * @returns The exception to throw.
 */
export const frozenRefusal = (): HttpException =>
  new HttpException(
    {
      code: 'GIT_REPOSITORY_FROZEN',
      message: 'This repository is being moved; retry in a moment.',
      retryAfterSeconds: freezeRetryAfterSeconds,
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
