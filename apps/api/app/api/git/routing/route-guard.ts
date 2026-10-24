/* oxlint-disable new-cap -- NestJS's Logger is a class the module instantiates once */
import { setTimeout as delay } from 'node:timers/promises';
import type { HttpException } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import type { MetricsService } from '#telemetry/metrics.js';
import { MemoryInFlightRegistry } from '#api/git/routing/in-flight.js';
import type { InFlightRegistry } from '#api/git/routing/in-flight.js';
import {
  defaultRoute,
  freezeHoldMilliseconds,
  frozenRefusal,
  frozenRouteRecheckMilliseconds,
  isFrozen,
  isServedStore,
} from '#api/git/routing/route.js';
import type { RepositoryRoute } from '#api/git/routing/route.js';
import { isFenceManifest } from '#api/git/store/fence.js';
import type { Manifest } from '#api/git/store/manifest.js';

/** How the guard reads routes: through the per-Machine cache, or past it. `RouteCache` is the deployment's. */
export type RouteLookup = {
  lookup(projectId: string): Promise<RepositoryRoute>;
  lookupAuthoritative(projectId: string): Promise<RepositoryRoute>;
};

/** The hold's bounds; the defaults are DW2's (about 5 s, re-checked every 100 ms). */
export type RouteGuardOptions = {
  readonly holdMilliseconds?: number;
  readonly pollMilliseconds?: number;
};

type HoldOutcome = 'released' | 'timed_out';

/**
 * The route step of git request admission (DW1, DW2): one composable step
 * that runs before a lease is admitted, so a held request costs no disk slot,
 * no hydrate budget and no object-store read.
 *
 * It answers three questions, each in one place:
 *
 * - **Admission** (`admit`): a repository that is frozen — by its own route
 *   or by the global freeze — is held for up to about 5 s, re-reading its
 *   route every 100 ms; past that the request is refused `429` with
 *   `Retry-After: 1` (W10 R2). An admitted request registers in flight until
 *   its release, which is what a drain waits for (W10 step 2).
 * - **Commit on a fence** (`assertCommittable`): a lease hydrated from a
 *   fence manifest reads the route past the cache before it commits, so an
 *   API Machine whose cache is up to 5 s stale cannot commit to the source
 *   after a cut-over's final delta (FR13).
 * - **A race lost to a freeze** (`refusalForLostRace`): a lease taken before
 *   the freeze loses its compare-and-swap to the fence; it is answered with
 *   the freeze answer rather than the 503 a lost race is, so the client waits
 *   1 s instead of its 5 s doubling backoff (W10 Finding 5).
 *
 * DA3 (admission by real bytes) and DA6 (a per-owner cap) are further steps
 * of the same admission, composed after this one.
 */
export class RepositoryRouteGuard {
  /**
   * A guard that admits everything: every repository on today's R2 store,
   * nothing frozen. What a `GitRepositoryService` built outside the Nest module
   * (a unit suite, a maintenance command) gets.
   *
   * @returns The guard.
   */
  public static open(): RepositoryRouteGuard {
    const route = async (): Promise<RepositoryRoute> => defaultRoute;
    return new RepositoryRouteGuard({
      routes: { lookup: route, lookupAuthoritative: route },
      registry: new MemoryInFlightRegistry(),
    });
  }

  readonly #logger = new Logger(RepositoryRouteGuard.name);
  readonly #routes: RouteLookup;
  readonly #registry: InFlightRegistry;
  readonly #metrics: MetricsService | undefined;
  readonly #holdMilliseconds: number;
  readonly #pollMilliseconds: number;

  /**
   * @param args - The route lookup, the shared in-flight registry, the metrics and the hold's bounds.
   */
  public constructor(args: {
    routes: RouteLookup;
    registry: InFlightRegistry;
    metrics?: MetricsService;
    options?: RouteGuardOptions;
  }) {
    this.#routes = args.routes;
    this.#registry = args.registry;
    this.#metrics = args.metrics;
    this.#holdMilliseconds = args.options?.holdMilliseconds ?? freezeHoldMilliseconds;
    this.#pollMilliseconds = args.options?.pollMilliseconds ?? frozenRouteRecheckMilliseconds;
  }

  /**
   * Admits one request on a repository: holds it while the repository is
   * frozen, then registers it in flight.
   *
   * The route is read before the registration, so a held request never
   * registers and can never hold up the drain that is waiting to thaw it. A
   * request that read "unfrozen" just before a freeze and registers just after
   * it is not drained; the fence answers it instead.
   *
   * @param projectId - The repository's project.
   * @returns The release, which every path must call.
   * @throws HttpException `429 GIT_REPOSITORY_FROZEN` with `retryAfterSeconds: 1` when the hold is spent.
   */
  public async admit(projectId: string): Promise<() => void> {
    await this.#holdWhileFrozen(projectId);
    try {
      return await this.#registry.register(projectId);
    } catch (error) {
      /* The registry is best effort: the fence, not the drain, keeps a write safe. */
      this.#logger.warn({ err: error, projectId }, 'A git request could not register in flight; admitting it anyway');
      return () => undefined;
    }
  }

  /**
   * Refuses a commit on a fence manifest while the repository is frozen,
   * reading the route past this Machine's cache. Free for every other commit.
   *
   * @param projectId - The repository's project.
   * @param hydrated - The manifest the committing lease was hydrated from.
   * @throws HttpException `429 GIT_REPOSITORY_FROZEN` while a freeze holds, or when the route names a store this build does not serve.
   */
  public async assertCommittable(projectId: string, hydrated: Manifest | undefined): Promise<void> {
    if (!isFenceManifest(hydrated)) {
      return;
    }
    const route = await this.#routes.lookupAuthoritative(projectId);
    if (isFrozen(route, Date.now()) || !isServedStore(route.store)) {
      throw frozenRefusal();
    }
  }

  /**
   * The answer for a lost compare-and-swap when the repository is frozen now.
   *
   * @param projectId - The repository's project.
   * @returns The freeze answer, or `undefined` to answer the lost race as usual.
   */
  public async refusalForLostRace(projectId: string): Promise<HttpException | undefined> {
    try {
      return isFrozen(await this.#routes.lookupAuthoritative(projectId), Date.now()) ? frozenRefusal() : undefined;
    } catch {
      return undefined;
    }
  }

  async #holdWhileFrozen(projectId: string): Promise<void> {
    let route = await this.#routes.lookup(projectId);
    if (!isServedStore(route.store)) {
      /* A newer build routed this repository to a store this one cannot reach (N/N-1). */
      throw frozenRefusal();
    }
    if (!isFrozen(route, Date.now())) {
      return;
    }
    const startedAt = performance.now();
    const deadline = Date.now() + this.#holdMilliseconds;
    while (isFrozen(route, Date.now())) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        this.#recordHold('timed_out', startedAt);
        throw frozenRefusal();
      }
      // oxlint-disable-next-line no-await-in-loop -- a hold re-reads its route in sequence
      await delay(Math.min(this.#pollMilliseconds, remaining));
      // oxlint-disable-next-line no-await-in-loop -- same reason
      route = await this.#routes.lookup(projectId);
    }
    this.#recordHold('released', startedAt);
    if (!isServedStore(route.store)) {
      /* Thawed by a switch to a store this build cannot reach: the client retries against one that can. */
      throw frozenRefusal();
    }
  }

  #recordHold(outcome: HoldOutcome, startedAt: number): void {
    this.#metrics?.gitRouteHolds.add(1, { outcome });
    this.#metrics?.gitRouteHoldDuration.record((performance.now() - startedAt) / 1000, { outcome });
  }
}
