import { randomBytes } from 'node:crypto';
import process from 'node:process';
import { HttpException } from '@nestjs/common';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { MetricsService } from '#telemetry/metrics.js';
import {
  MemoryOwnerInFlightCap,
  OwnerInFlightGate,
  ownerCapRetryAfterSeconds,
  ownerInFlightPushCap,
  ownerInFlightRequestCap,
  ownerInFlightRetryAfter,
  RedisOwnerInFlightCap,
} from '#api/git/admission/owner-in-flight.js';
import type { OwnerInFlightCap, OwnerSlot } from '#api/git/admission/owner-in-flight.js';

const redisReachable = async (url: string | undefined): Promise<boolean> => {
  if (url === undefined) {
    return false;
  }
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

const releaseOf = (slot: OwnerSlot): (() => void) => {
  if (!slot.admitted) {
    throw new Error(`expected a slot, got the ${slot.limit} limit`);
  }
  return slot.release;
};

/**
 * D8 (Q16): an owner may have at most 10 git requests in flight at the API, of
 * which at most 5 are pushes. One contract, two backends: a `Map` for a single
 * process and the unit suites, and Redis, which every API Machine shares so the
 * cap is the owner's and not each Machine's.
 */
const capContract = (name: string, create: () => Promise<OwnerInFlightCap>): void => {
  describe(name, () => {
    const owner = (): string => `user_da6_${randomBytes(4).toString('hex')}`;

    it('admits ten requests for one owner and refuses the eleventh', async () => {
      const cap = await create();
      const ownerId = owner();
      const releases: Array<() => void> = [];
      for (let index = 0; index < ownerInFlightRequestCap; index += 1) {
        // oxlint-disable-next-line no-await-in-loop -- admissions are counted in order
        releases.push(releaseOf(await cap.acquire(ownerId, 'request')));
      }
      expect(await cap.acquire(ownerId, 'request')).toEqual({
        admitted: false,
        limit: 'requests',
      });
      for (const release of releases) {
        release();
      }
    });

    it('admits five pushes and refuses the sixth, while a fetch still fits under the request cap', async () => {
      const cap = await create();
      const ownerId = owner();
      const releases: Array<() => void> = [];
      for (let index = 0; index < ownerInFlightPushCap; index += 1) {
        // oxlint-disable-next-line no-await-in-loop -- admissions are counted in order
        releases.push(releaseOf(await cap.acquire(ownerId, 'push')));
      }
      expect(await cap.acquire(ownerId, 'push')).toEqual({
        admitted: false,
        limit: 'pushes',
      });
      releases.push(releaseOf(await cap.acquire(ownerId, 'request')));
      for (const release of releases) {
        release();
      }
    });

    it('counts a push against the request cap too, so ten in flight refuses a push as requests', async () => {
      const cap = await create();
      const ownerId = owner();
      const releases: Array<() => void> = [];
      for (let index = 0; index < ownerInFlightRequestCap; index += 1) {
        // oxlint-disable-next-line no-await-in-loop -- admissions are counted in order
        releases.push(releaseOf(await cap.acquire(ownerId, index < 3 ? 'push' : 'request')));
      }
      expect(await cap.acquire(ownerId, 'push')).toEqual({
        admitted: false,
        limit: 'requests',
      });
      for (const release of releases) {
        release();
      }
    });

    it('leaves every other owner unaffected while one owner is at its cap', async () => {
      const cap = await create();
      const busy = owner();
      const releases: Array<() => void> = [];
      for (let index = 0; index < ownerInFlightRequestCap; index += 1) {
        // oxlint-disable-next-line no-await-in-loop -- admissions are counted in order
        releases.push(releaseOf(await cap.acquire(busy, index < ownerInFlightPushCap ? 'push' : 'request')));
      }
      const overCap = await cap.acquire(busy, 'request');
      expect(overCap.admitted).toBe(false);
      const other = owner();
      releases.push(releaseOf(await cap.acquire(other, 'push')), releaseOf(await cap.acquire(other, 'request')));
      for (const release of releases) {
        release();
      }
    });

    it('gives a slot back on release, and a second release gives back nothing more', async () => {
      const cap = await create();
      const ownerId = owner();
      const releases: Array<() => void> = [];
      for (let index = 0; index < ownerInFlightPushCap; index += 1) {
        // oxlint-disable-next-line no-await-in-loop -- admissions are counted in order
        releases.push(releaseOf(await cap.acquire(ownerId, 'push')));
      }
      const [first] = releases;
      first!();
      first!();
      await sleep(20);
      releases[0] = releaseOf(await cap.acquire(ownerId, 'push'));
      expect(await cap.acquire(ownerId, 'push')).toEqual({
        admitted: false,
        limit: 'pushes',
      });
      for (const release of releases) {
        release();
      }
      await sleep(20);
      for (let index = 0; index < ownerInFlightPushCap; index += 1) {
        // oxlint-disable-next-line no-await-in-loop -- admissions are counted in order
        releaseOf(await cap.acquire(ownerId, 'push'))();
      }
    });
  });
};

capContract('the in-memory cap', async () => new MemoryOwnerInFlightCap());

describe.skipIf(!(await redisReachable(process.env.REDIS_URL)))('the Redis cap', () => {
  let client: Redis;
  const caps: RedisOwnerInFlightCap[] = [];

  beforeAll(async () => {
    client = new Redis(process.env.REDIS_URL, { lazyConnect: true });
    await client.connect();
  });

  afterAll(async () => {
    for (const cap of caps) {
      cap.close();
    }
    await client.quit();
  });

  const create = async (
    options: {
      heartbeatMilliseconds?: number;
      expiryMilliseconds?: number;
    } = {},
  ) => {
    const cap = new RedisOwnerInFlightCap(client, {
      instanceId: `test-${randomBytes(4).toString('hex')}`,
      keyPrefix: `test:da6:${randomBytes(4).toString('hex')}`,
      ...options,
    });
    caps.push(cap);
    return cap;
  };

  capContract('shared by every Machine', create);

  it('is one cap across Machines: two processes together hold at most ten of one owner’s requests', async () => {
    const keyPrefix = `test:da6:${randomBytes(4).toString('hex')}`;
    const one = new RedisOwnerInFlightCap(client, {
      instanceId: 'machine-one',
      keyPrefix,
    });
    const two = new RedisOwnerInFlightCap(client, {
      instanceId: 'machine-two',
      keyPrefix,
    });
    caps.push(one, two);
    const ownerId = `user_da6_${randomBytes(4).toString('hex')}`;
    const slots = await Promise.all(
      Array.from({ length: 2 * ownerInFlightRequestCap }, async (_, index) =>
        (index % 2 === 0 ? one : two).acquire(ownerId, 'request'),
      ),
    );
    expect(slots.filter((slot) => slot.admitted)).toHaveLength(ownerInFlightRequestCap);
    for (const slot of slots) {
      if (slot.admitted) {
        slot.release();
      }
    }
  });

  it('forgets the slots of a Machine that stopped heartbeating, so a crash cannot lock an owner out', async () => {
    const crashed = await create({
      heartbeatMilliseconds: 50,
      expiryMilliseconds: 200,
    });
    const ownerId = `user_da6_${randomBytes(4).toString('hex')}`;
    for (let index = 0; index < ownerInFlightPushCap; index += 1) {
      // oxlint-disable-next-line no-await-in-loop -- admissions are counted in order
      await crashed.acquire(ownerId, 'push');
    }
    const whileHeld = await crashed.acquire(ownerId, 'push');
    expect(whileHeld.admitted).toBe(false);
    /* The process dies: no release, no more heartbeats. */
    crashed.close();
    await sleep(400);
    const afterLapse = await crashed.acquire(ownerId, 'push');
    expect(afterLapse.admitted).toBe(true);
  });

  it('keeps a long request’s slot for as long as its Machine heartbeats', async () => {
    const living = await create({
      heartbeatMilliseconds: 50,
      expiryMilliseconds: 200,
    });
    const ownerId = `user_da6_${randomBytes(4).toString('hex')}`;
    const releases: Array<() => void> = [];
    for (let index = 0; index < ownerInFlightPushCap; index += 1) {
      // oxlint-disable-next-line no-await-in-loop -- admissions are counted in order
      releases.push(releaseOf(await living.acquire(ownerId, 'push')));
    }
    await sleep(600);
    const stillHeld = await living.acquire(ownerId, 'push');
    expect(stillHeld.admitted).toBe(false);
    for (const release of releases) {
      release();
    }
  });

  it('admits when Redis cannot answer: the cap is fairness, not safety', async () => {
    const broken = new RedisOwnerInFlightCap(
      {
        eval: async () => {
          throw new Error('connection lost');
        },
      } as unknown as Redis,
      { instanceId: 'broken' },
    );
    caps.push(broken);
    const slot = await broken.acquire('user_da6_broken', 'push');
    expect(slot.admitted).toBe(true);
  });
});

describe('the over-cap answer', () => {
  it('draws Retry-After uniformly from whole seconds between the documented bounds', () => {
    expect(ownerInFlightRetryAfter).toEqual({
      minimumSeconds: 1,
      maximumSeconds: 3,
    });
    expect(ownerCapRetryAfterSeconds(() => 0)).toBe(1);
    expect(ownerCapRetryAfterSeconds(() => 0.34)).toBe(2);
    expect(ownerCapRetryAfterSeconds(() => 0.9999)).toBe(3);
    const seen = new Set<number>();
    for (let index = 0; index < 500; index += 1) {
      const seconds = ownerCapRetryAfterSeconds();
      expect(Number.isSafeInteger(seconds)).toBe(true);
      expect(seconds).toBeGreaterThanOrEqual(1);
      expect(seconds).toBeLessThanOrEqual(3);
      seen.add(seconds);
    }
    expect([...seen].toSorted((left, right) => left - right)).toEqual([1, 2, 3]);
  });

  const recording = (): {
    metrics: MetricsService;
    admissions: ReturnType<typeof vi.fn>;
  } => {
    const admissions = vi.fn();
    return {
      metrics: {
        gitAdmissions: { add: admissions },
      } as unknown as MetricsService,
      admissions,
    };
  };

  it('refuses over the cap with 429 GIT_OWNER_IN_FLIGHT_LIMIT and a jittered retryAfterSeconds, counted as owner_capped', async () => {
    const { metrics, admissions } = recording();
    const gate = new OwnerInFlightGate({
      cap: new MemoryOwnerInFlightCap(),
      metrics,
      random: () => 0.5,
    });
    const releases: Array<() => void> = [];
    for (let index = 0; index < ownerInFlightPushCap; index += 1) {
      // oxlint-disable-next-line no-await-in-loop -- admissions are counted in order
      releases.push(await gate.admit({ ownerId: 'user_da6', operation: 'receive_pack' }));
    }
    const refused = await gate
      .admit({ ownerId: 'user_da6', operation: 'receive_pack' })
      .catch((error: unknown) => error);

    expect(refused).toBeInstanceOf(HttpException);
    expect((refused as HttpException).getStatus()).toBe(429);
    expect((refused as HttpException).getResponse()).toMatchObject({
      code: 'GIT_OWNER_IN_FLIGHT_LIMIT',
      retryAfterSeconds: 2,
    });
    expect(admissions).toHaveBeenCalledTimes(1);
    expect(admissions).toHaveBeenCalledWith(1, {
      'tau.git.operation': 'receive_pack',
      outcome: 'owner_capped',
    });
    /* A fetch still fits: five pushes are five of the owner's ten requests. */
    releases.push(await gate.admit({ ownerId: 'user_da6', operation: 'upload_pack' }));
    for (const release of releases) {
      release();
    }
  });

  it('counts only receive-pack as a push: an advertisement for a push is a request', async () => {
    const cap = new MemoryOwnerInFlightCap();
    const gate = new OwnerInFlightGate({ cap });
    const releases: Array<() => void> = [];
    for (let index = 0; index < ownerInFlightRequestCap; index += 1) {
      // oxlint-disable-next-line no-await-in-loop -- admissions are counted in order
      releases.push(await gate.admit({ ownerId: 'user_da6', operation: 'advertise' }));
    }
    expect(cap.inFlight('user_da6')).toEqual({ requests: 10, pushes: 0 });
    for (const release of releases) {
      release();
    }
    expect(cap.inFlight('user_da6')).toEqual({ requests: 0, pushes: 0 });
  });

  it('is open outside the module, so a service built by hand is never capped', async () => {
    const gate = OwnerInFlightGate.open();
    const releases = await Promise.all(
      Array.from({ length: 3 * ownerInFlightRequestCap }, async () =>
        gate.admit({ ownerId: 'user_da6', operation: 'receive_pack' }),
      ),
    );
    expect(releases).toHaveLength(30);
  });
});
