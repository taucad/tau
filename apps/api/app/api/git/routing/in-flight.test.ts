import { randomBytes } from 'node:crypto';
import process from 'node:process';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drainInFlight, MemoryInFlightRegistry, RedisInFlightRegistry } from '#api/git/routing/in-flight.js';
import type { InFlightRegistry } from '#api/git/routing/in-flight.js';

const redisReachable = async (url: string): Promise<boolean> => {
  const probe = new Redis(url, {
    lazyConnect: true,
    connectTimeout: 1000,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });
  try {
    await probe.connect();
    await probe.ping();
    return true;
  } catch {
    return false;
  } finally {
    probe.disconnect();
  }
};

const sleep = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

/**
 * W10 step 2: "wait until no request registered before the freeze is still in
 * flight". Every admitted git request registers itself; the migrator writes
 * the freeze, then drains. One registry contract, two backends: a `Map` for
 * the guard's unit suites and Redis, which every API Machine and the migrator
 * share, for the deployment.
 */
const drainContract = (name: string, create: () => Promise<InFlightRegistry>): void => {
  describe(name, () => {
    const projectId = (): string => `proj_dw1_${randomBytes(4).toString('hex')}`;

    it('drains at once when nothing is in flight', async () => {
      const registry = await create();
      expect(
        await drainInFlight(registry, {
          projectId: projectId(),
          before: new Date(),
          timeoutMilliseconds: 500,
        }),
      ).toBe(true);
    });

    it('waits for a request registered before the freeze, and returns once it ends', async () => {
      const registry = await create();
      const project = projectId();
      const release = await registry.register(project);
      await sleep(5);
      const frozenAt = new Date();

      const startedAt = performance.now();
      const drained = drainInFlight(registry, {
        projectId: project,
        before: frozenAt,
        timeoutMilliseconds: 5000,
      });
      await sleep(300);
      release();
      expect(await drained).toBe(true);
      expect(performance.now() - startedAt).toBeGreaterThanOrEqual(290);
    });

    it('times out while a request registered before the freeze is still in flight', async () => {
      const registry = await create();
      const project = projectId();
      const release = await registry.register(project);
      await sleep(5);
      try {
        expect(
          await drainInFlight(registry, {
            projectId: project,
            before: new Date(),
            timeoutMilliseconds: 200,
          }),
        ).toBe(false);
      } finally {
        release();
      }
    });

    it('does not wait for a request registered after the freeze, which the hold or the fence answers', async () => {
      const registry = await create();
      const project = projectId();
      const frozenAt = new Date();
      await sleep(5);
      const release = await registry.register(project);
      try {
        expect(
          await drainInFlight(registry, {
            projectId: project,
            before: frozenAt,
            timeoutMilliseconds: 200,
          }),
        ).toBe(true);
      } finally {
        release();
      }
    });

    it('does not wait for another repository’s requests, but a global drain does', async () => {
      const registry = await create();
      const busy = projectId();
      const release = await registry.register(busy);
      await sleep(5);
      try {
        const frozenAt = new Date();
        expect(
          await drainInFlight(registry, {
            projectId: projectId(),
            before: frozenAt,
            timeoutMilliseconds: 200,
          }),
        ).toBe(true);
        expect(
          await drainInFlight(registry, {
            before: frozenAt,
            timeoutMilliseconds: 200,
          }),
        ).toBe(false);
      } finally {
        release();
      }
    });
  });
};

drainContract('the in-memory registry', async () => new MemoryInFlightRegistry());

describe.skipIf(!(await redisReachable(process.env.REDIS_URL)))('the Redis registry', () => {
  let client: Redis;
  const registries: RedisInFlightRegistry[] = [];

  beforeAll(async () => {
    client = new Redis(process.env.REDIS_URL, { lazyConnect: true });
    await client.connect();
  });

  afterAll(async () => {
    for (const registry of registries) {
      registry.close();
    }
    await client.quit();
  });

  const create = async (
    options: {
      heartbeatMilliseconds?: number;
      expiryMilliseconds?: number;
    } = {},
  ) => {
    const registry = new RedisInFlightRegistry(client, {
      instanceId: `test-${randomBytes(4).toString('hex')}`,
      keyPrefix: `test:dw1:${randomBytes(4).toString('hex')}`,
      ...options,
    });
    registries.push(registry);
    return registry;
  };

  drainContract('shared by every Machine', create);

  it('forgets a registration whose Machine stopped heartbeating, so a crash cannot wedge a drain', async () => {
    const crashed = await create({
      heartbeatMilliseconds: 50,
      expiryMilliseconds: 200,
    });
    const projectId = `proj_dw1_${randomBytes(4).toString('hex')}`;
    await crashed.register(projectId);
    await sleep(5);
    const frozenAt = new Date();
    /* The process dies: no release, no more heartbeats. */
    crashed.close();

    expect(
      await drainInFlight(crashed, {
        projectId,
        before: frozenAt,
        timeoutMilliseconds: 2000,
      }),
    ).toBe(true);
  });

  it('keeps a long request registered for as long as its Machine heartbeats', async () => {
    const living = await create({
      heartbeatMilliseconds: 50,
      expiryMilliseconds: 200,
    });
    const projectId = `proj_dw1_${randomBytes(4).toString('hex')}`;
    const release = await living.register(projectId);
    await sleep(5);
    const frozenAt = new Date();
    try {
      expect(
        await drainInFlight(living, {
          projectId,
          before: frozenAt,
          timeoutMilliseconds: 600,
        }),
      ).toBe(false);
    } finally {
      release();
    }
  });
});
