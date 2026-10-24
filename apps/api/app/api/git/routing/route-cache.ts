import type { MetricsService } from '#telemetry/metrics.js';
import { frozenRouteRecheckMilliseconds, isFrozen, routeCacheTtlMilliseconds } from '#api/git/routing/route.js';
import type { RepositoryRoute } from '#api/git/routing/route.js';

/** Past this many repositories the cache starts again rather than grow; a miss costs one indexed read. */
const maximumEntries = 10_000;

type Entry = { readonly route: RepositoryRoute; readonly expiresAt: number };

/**
 * One API Machine's routes, each trusted for at most 5 s (W10 open question 5
 * as narrowed by FR13, north star Q12).
 *
 * There is no invalidation bus, on purpose: safety never depends on this
 * cache. A lease taken before a freeze loses its compare-and-swap to the
 * fence, and a lease hydrated from a fence reads the route past this cache
 * (`lookupAuthoritative`). The TTL bounds only how long a newly frozen or
 * switched repository is still admitted here from an older entry.
 *
 * A frozen entry is trusted for only {@link frozenRouteRecheckMilliseconds}, so
 * the requests this Machine holds for one repository share one read per
 * recheck and are released within one recheck of a thaw. Concurrent misses for
 * one repository share one read. A failed read is not cached.
 */
export class RouteCache {
  readonly #load: (projectId: string) => Promise<RepositoryRoute>;
  readonly #metrics: MetricsService | undefined;
  readonly #now: () => number;
  readonly #ttlMilliseconds: number;
  readonly #entries = new Map<string, Entry>();
  readonly #loading = new Map<string, Promise<RepositoryRoute>>();

  /**
   * @param args - The authoritative read, the metrics to record its cost on, a clock and the TTL.
   * @throws Error When the TTL is above 5 s, which the risk row forbids.
   */
  public constructor(args: {
    load: (projectId: string) => Promise<RepositoryRoute>;
    metrics?: MetricsService;
    now?: () => number;
    ttlMilliseconds?: number;
  }) {
    this.#load = args.load;
    this.#metrics = args.metrics;
    this.#now = args.now ?? Date.now;
    this.#ttlMilliseconds = args.ttlMilliseconds ?? routeCacheTtlMilliseconds;
    if (this.#ttlMilliseconds > routeCacheTtlMilliseconds) {
      throw new Error(`A route may be cached for at most 5 s, not ${String(this.#ttlMilliseconds)} ms`);
    }
  }

  /**
   * The route as this Machine last read it, if that read is fresh enough.
   *
   * @param projectId - The repository's project.
   * @returns The route.
   */
  public async lookup(projectId: string): Promise<RepositoryRoute> {
    const startedAt = performance.now();
    const entry = this.#entries.get(projectId);
    if (entry !== undefined && entry.expiresAt > this.#now()) {
      this.#record('cache', startedAt);
      return entry.route;
    }
    const route = await this.#read(projectId);
    this.#record('database', startedAt);
    return route;
  }

  /**
   * The route read from Postgres now, which also refreshes this Machine's entry.
   *
   * @param projectId - The repository's project.
   * @returns The route.
   */
  public async lookupAuthoritative(projectId: string): Promise<RepositoryRoute> {
    const startedAt = performance.now();
    const route = await this.#read(projectId, true);
    this.#record('database', startedAt);
    return route;
  }

  async #read(projectId: string, fresh = false): Promise<RepositoryRoute> {
    const pending = fresh ? undefined : this.#loading.get(projectId);
    if (pending !== undefined) {
      return pending;
    }
    const loading = this.#loadAndKeep(projectId);
    this.#loading.set(projectId, loading);
    try {
      return await loading;
    } finally {
      if (this.#loading.get(projectId) === loading) {
        this.#loading.delete(projectId);
      }
    }
  }

  async #loadAndKeep(projectId: string): Promise<RepositoryRoute> {
    const route = await this.#load(projectId);
    const now = this.#now();
    const expiresAt = isFrozen(route, now)
      ? Math.min(now + frozenRouteRecheckMilliseconds, route.frozenUntil!.getTime())
      : now + this.#ttlMilliseconds;
    if (this.#entries.size >= maximumEntries) {
      this.#entries.clear();
    }
    this.#entries.set(projectId, { route, expiresAt });
    return route;
  }

  #record(source: 'cache' | 'database', startedAt: number): void {
    this.#metrics?.gitRouteLookupDuration.record((performance.now() - startedAt) / 1000, {
      'tau.git.route.source': source,
    });
  }
}
