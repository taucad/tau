import { describe, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import type { MetricsService } from '#telemetry/metrics.js';
import { MemoryInFlightRegistry } from '#api/git/routing/in-flight.js';
import { RouteCache } from '#api/git/routing/route-cache.js';
import { RepositoryRouteGuard } from '#api/git/routing/route-guard.js';
import { defaultRoute, freezeHoldMilliseconds, freezeRetryAfterSeconds } from '#api/git/routing/route.js';
import type { RepositoryRoute } from '#api/git/routing/route.js';
import { migrationFenceCommitter } from '#api/git/store/fence.js';
import { succeedManifest } from '#api/git/store/manifest.js';
import type { Manifest } from '#api/git/store/manifest.js';

const frozenFor = (milliseconds: number, migrationId = 'mig_a'): RepositoryRoute => ({
  store: 'r2',
  frozenAt: new Date(),
  frozenUntil: new Date(Date.now() + milliseconds),
  migrationId,
});

const recordingMetrics = (): {
  metrics: MetricsService;
  holds: ReturnType<typeof vi.fn>;
  holdDuration: ReturnType<typeof vi.fn>;
} => {
  const holds = vi.fn();
  const holdDuration = vi.fn();
  const metrics = {
    gitRouteHolds: { add: holds },
    gitRouteHoldDuration: { record: holdDuration },
    gitRouteLookupDuration: { record: vi.fn() },
  } as unknown as MetricsService;
  return { metrics, holds, holdDuration };
};

/** A guard over a route table in a `Map`, with a short hold so the suite stays fast. */
const harness = (
  options: { holdMilliseconds?: number } = {},
): {
  guard: RepositoryRouteGuard;
  routes: Map<string, RepositoryRoute>;
  registry: MemoryInFlightRegistry;
  reads: { authoritative: number };
  holds: ReturnType<typeof vi.fn>;
  holdDuration: ReturnType<typeof vi.fn>;
} => {
  const routes = new Map<string, RepositoryRoute>();
  const reads = { authoritative: 0 };
  const { metrics, holds, holdDuration } = recordingMetrics();
  const cache = new RouteCache({
    load: async (projectId) => routes.get(projectId) ?? defaultRoute,
    metrics,
  });
  const lookups = {
    lookup: async (projectId: string) => cache.lookup(projectId),
    lookupAuthoritative: async (projectId: string) => {
      reads.authoritative += 1;
      return cache.lookupAuthoritative(projectId);
    },
  };
  const registry = new MemoryInFlightRegistry();
  const guard = new RepositoryRouteGuard({
    routes: lookups,
    registry,
    metrics,
    options: {
      holdMilliseconds: options.holdMilliseconds ?? 400,
      pollMilliseconds: 20,
    },
  });
  return { guard, routes, registry, reads, holds, holdDuration };
};

const fenceManifest: Manifest = succeedManifest(undefined, {
  refs: {},
  packs: [],
  committedBy: migrationFenceCommitter,
});
const pushManifest: Manifest = succeedManifest(undefined, {
  refs: {},
  packs: [],
  committedBy: 'user_a',
});

describe('the freeze answer (DW2, W10 R2)', () => {
  it('holds for about 5 s by default and answers 1 s of Retry-After', () => {
    expect(freezeHoldMilliseconds).toBeGreaterThanOrEqual(4000);
    expect(freezeHoldMilliseconds).toBeLessThanOrEqual(5000);
    expect(freezeRetryAfterSeconds).toBe(1);
  });

  it('admits an unfrozen repository at once, with no hold counted', async () => {
    const { guard, holds } = harness();
    const release = await guard.admit('proj_a');
    release();
    expect(holds).not.toHaveBeenCalled();
  });

  it('holds a frozen repository’s request, then refuses it with 429 and Retry-After 1', async () => {
    const { guard, routes, holds, holdDuration, registry } = harness({
      holdMilliseconds: 300,
    });
    routes.set('proj_a', frozenFor(20_000));

    const startedAt = performance.now();
    const refusal = await guard.admit('proj_a').then(
      () => undefined,
      (error: unknown) => error,
    );
    const held = performance.now() - startedAt;

    expect(refusal).toBeInstanceOf(HttpException);
    expect((refusal as HttpException).getStatus()).toBe(429);
    expect((refusal as HttpException).getResponse()).toMatchObject({
      code: 'GIT_REPOSITORY_FROZEN',
      retryAfterSeconds: 1,
    });
    expect(held).toBeGreaterThanOrEqual(290);
    expect(held).toBeLessThan(1500);
    expect(holds).toHaveBeenCalledExactlyOnceWith(1, { outcome: 'timed_out' });
    expect(holdDuration).toHaveBeenCalledExactlyOnceWith(expect.any(Number), {
      outcome: 'timed_out',
    });
    /* A refused request never registered, so it can never hold up a drain. */
    expect(registry.size).toBe(0);
  });

  it('releases a held request as soon as the freeze is lifted, and only then registers it', async () => {
    const { guard, routes, holds, registry } = harness({
      holdMilliseconds: 3000,
    });
    routes.set('proj_a', frozenFor(20_000));

    const admitted = guard.admit('proj_a');
    await new Promise((resolve) => {
      setTimeout(resolve, 150);
    });
    expect(registry.size).toBe(0);
    routes.delete('proj_a');
    const release = await admitted;

    expect(holds).toHaveBeenCalledExactlyOnceWith(1, { outcome: 'released' });
    expect(registry.size).toBe(1);
    release();
    expect(registry.size).toBe(0);
  });

  it('releases a held request when the freeze lease lapses on its own (a killed migrator)', async () => {
    const { guard, routes, holds } = harness({ holdMilliseconds: 3000 });
    routes.set('proj_a', frozenFor(150));

    (await guard.admit('proj_a'))();
    expect(holds).toHaveBeenCalledExactlyOnceWith(1, { outcome: 'released' });
  });

  it('refuses a route to a store this build does not serve, without holding (N/N-1 deploy)', async () => {
    const { guard, routes, holds } = harness();
    routes.set('proj_a', { store: 'r2-repos' });

    await expect(guard.admit('proj_a')).rejects.toMatchObject({ status: 429 });
    expect(holds).not.toHaveBeenCalled();
  });

  it('admits through a registry that is down: the fence, not the drain, is what keeps a write safe', async () => {
    const { guard } = harness();
    const broken = new RepositoryRouteGuard({
      routes: {
        lookup: async () => defaultRoute,
        lookupAuthoritative: async () => defaultRoute,
      },
      registry: {
        register: async () => {
          throw new Error('redis down');
        },
        countRegisteredBefore: async () => 0,
      },
    });
    (await broken.admit('proj_a'))();
    (await guard.admit('proj_a'))();
  });
});

describe('a commit on a fenced manifest (DW1, FR13)', () => {
  it('reads the route past the cache, and refuses while the repository is frozen', async () => {
    const { guard, routes, reads } = harness();
    /* This Machine's cache still says unfrozen: the stale entry the risk row is about. */
    await guard.admit('proj_a').then((release) => {
      release();
    });
    routes.set('proj_a', frozenFor(20_000));

    await expect(guard.assertCommittable('proj_a', fenceManifest)).rejects.toMatchObject({
      status: 429,
      response: { code: 'GIT_REPOSITORY_FROZEN' },
    });
    expect(reads.authoritative).toBe(1);
  });

  it('lets a commit on a fence proceed once the freeze is gone (an aborted migration)', async () => {
    const { guard } = harness();
    await expect(guard.assertCommittable('proj_a', fenceManifest)).resolves.toBeUndefined();
  });

  it('costs nothing for a manifest a fence did not write', async () => {
    const { guard, routes, reads } = harness();
    routes.set('proj_a', frozenFor(20_000));
    await expect(guard.assertCommittable('proj_a', pushManifest)).resolves.toBeUndefined();
    await expect(guard.assertCommittable('proj_a', undefined)).resolves.toBeUndefined();
    expect(reads.authoritative).toBe(0);
  });

  it('answers a race lost to a freeze with the freeze answer rather than a 503', async () => {
    const { guard, routes } = harness();
    expect(await guard.refusalForLostRace('proj_a')).toBeUndefined();
    routes.set('proj_a', frozenFor(20_000));
    expect(await guard.refusalForLostRace('proj_a')).toMatchObject({
      status: 429,
    });
  });
});
