import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { MetricsService } from '#telemetry/metrics.js';
import { RouteCache } from '#api/git/routing/route-cache.js';
import { defaultRoute, frozenRouteRecheckMilliseconds, routeCacheTtlMilliseconds } from '#api/git/routing/route.js';
import type { RepositoryRoute } from '#api/git/routing/route.js';

/** A route table in a `Map`, counting its reads, with a clock the test moves. */
const harness = (
  options: { ttlMilliseconds?: number } = {},
): {
  cache: RouteCache;
  routes: Map<string, RepositoryRoute>;
  reads: () => number;
  advance: (milliseconds: number) => void;
  now: () => number;
  metrics: MetricsService;
} => {
  const routes = new Map<string, RepositoryRoute>();
  let reads = 0;
  let clock = 1_000_000;
  const metrics = mock<MetricsService>({
    gitRouteLookupDuration: { record: vi.fn() },
  } as unknown as MetricsService);
  const cache = new RouteCache({
    load: async (projectId) => {
      reads += 1;
      return routes.get(projectId) ?? defaultRoute;
    },
    metrics,
    now: () => clock,
    ...options,
  });
  return {
    cache,
    routes,
    reads: () => reads,
    advance: (milliseconds) => {
      clock += milliseconds;
    },
    now: () => clock,
    metrics,
  };
};

/**
 * North star risk row and W10 open question 5 (FR13): the route may be a
 * per-Machine TTL cache with no invalidation bus, because the fence keeps a
 * stale entry from ever committing; the TTL bounds only how long a frozen or
 * switched repository is still admitted from that entry, and it is at most 5 s.
 */
describe('the per-Machine route cache (DW1, Q12)', () => {
  it('trusts a route for at most 5 s', () => {
    expect(routeCacheTtlMilliseconds).toBeLessThanOrEqual(5000);
    expect(
      () =>
        new RouteCache({
          load: async () => defaultRoute,
          ttlMilliseconds: 5001,
        }),
    ).toThrow(/5 s/u);
  });

  it('sees a freeze written behind its back within the TTL, and not before it reads again', async () => {
    const { cache, routes, reads, advance, now } = harness();
    expect(await cache.lookup('proj_a')).toStrictEqual(defaultRoute);
    expect(reads()).toBe(1);

    routes.set('proj_a', {
      store: 'r2',
      frozenAt: new Date(now()),
      frozenUntil: new Date(now() + 20_000),
      migrationId: 'mig_a',
    });
    advance(routeCacheTtlMilliseconds - 1);
    expect(await cache.lookup('proj_a')).toStrictEqual(defaultRoute);
    expect(reads()).toBe(1);

    advance(1);
    expect(await cache.lookup('proj_a')).toMatchObject({
      migrationId: 'mig_a',
    });
    expect(reads()).toBe(2);
  });

  it('re-reads a frozen route every 100 ms, so a thaw releases held requests promptly', async () => {
    const { cache, routes, reads, advance, now } = harness();
    routes.set('proj_a', {
      store: 'r2',
      frozenAt: new Date(now()),
      frozenUntil: new Date(now() + 20_000),
      migrationId: 'mig_a',
    });
    await cache.lookup('proj_a');
    routes.delete('proj_a');

    advance(frozenRouteRecheckMilliseconds - 1);
    expect(await cache.lookup('proj_a')).toMatchObject({
      migrationId: 'mig_a',
    });
    advance(1);
    expect(await cache.lookup('proj_a')).toStrictEqual(defaultRoute);
    expect(reads()).toBe(2);
  });

  it('shares one read between concurrent lookups of the same repository', async () => {
    const { cache, reads } = harness();
    await Promise.all(Array.from({ length: 10 }, async () => cache.lookup('proj_a')));
    expect(reads()).toBe(1);
  });

  it('reads past the cache when asked for the authoritative route, and keeps what it read', async () => {
    const { cache, routes, reads, now } = harness();
    await cache.lookup('proj_a');
    routes.set('proj_a', {
      store: 'r2',
      frozenAt: new Date(now()),
      frozenUntil: new Date(now() + 20_000),
      migrationId: 'm',
    });

    expect(await cache.lookupAuthoritative('proj_a')).toMatchObject({
      migrationId: 'm',
    });
    expect(await cache.lookup('proj_a')).toMatchObject({ migrationId: 'm' });
    expect(reads()).toBe(2);
  });

  it('records the lookup cost by source, never by repository (OB5 tau.git.route.lookup.duration)', async () => {
    const { cache, metrics } = harness();
    await cache.lookup('proj_a');
    await cache.lookup('proj_a');

    const recorded = vi.mocked(metrics.gitRouteLookupDuration.record).mock.calls.map(([, attributes]) => attributes);
    expect(recorded).toStrictEqual([{ 'tau.git.route.source': 'database' }, { 'tau.git.route.source': 'cache' }]);
  });

  it('does not cache a failed read', async () => {
    let fail = true;
    const cache = new RouteCache({
      load: async () => {
        if (fail) {
          throw new Error('database down');
        }
        return defaultRoute;
      },
    });
    await expect(cache.lookup('proj_a')).rejects.toThrow('database down');
    fail = false;
    expect(await cache.lookup('proj_a')).toStrictEqual(defaultRoute);
  });
});
