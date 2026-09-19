/*
 * T4 — Redis failure matrix (charter B8, gate T4).
 *
 * Every case here runs against a disposable `redis:7-alpine` container started
 * by this file, never the shared `tau-redis` development instance: the stale-key
 * case needs `FLUSHALL` and the exhaustion case needs a small `maxclients`, and
 * neither may touch state another process depends on.
 *
 * Each behavioural case is paired with the naive client it must beat, so the
 * assertion fails if the policy in `redis.service.ts` is reverted.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { HealthIndicatorService } from '@nestjs/terminus';
import type { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Environment } from '#config/environment.config.js';
import type { MetricsService } from '#telemetry/metrics.js';
import { RedisService } from '#redis/redis.service.js';
import { RedisHealthIndicator } from '#api/health/redis-health.indicator.js';
import { PublicationRateLimiterService } from '#api/publications/publication-rate-limiter.service.js';

/** The disposable instance is capped low enough that exhaustion is reachable in a test. */
const containerMaxClients = 20;

/** Milliseconds. Long enough that a hung command would still be pending when asserted. */
const hangWitnessMilliseconds = 3000;

const appDirectory = path.resolve(import.meta.dirname, '..');

const dockerAvailable = ((): boolean => {
  try {
    execFileSync('docker', ['version', '--format', '{{.Server.Os}}'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
})();

const createService = (url: string): RedisService =>
  new RedisService(
    { get: () => url } as unknown as ConfigService<Environment, true>,
    {
      redisConnectionState: { record: () => undefined },
    } as unknown as MetricsService,
  );

const listenOnEphemeralPort = async (server: net.Server): Promise<number> => {
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Probe server did not bind a TCP port');
  }

  return address.port;
};

/** A server that accepts the socket and never answers: a reachable but dead Redis. */
const startStallingServer = async (): Promise<{ url: string; close: () => void }> => {
  const server = net.createServer(() => {
    /* Deliberately silent. */
  });
  const port = await listenOnEphemeralPort(server);

  return {
    url: `redis://127.0.0.1:${port}`,
    close: () => {
      server.close();
    },
  };
};

/** A port nothing listens on: Redis entirely absent. */
const reserveClosedPort = async (): Promise<number> => {
  const server = net.createServer();
  const port = await listenOnEphemeralPort(server);
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });

  return port;
};

/** Whether `work` settles at all inside `milliseconds`, and how. */
const outcomeWithin = async (
  work: Promise<unknown>,
  milliseconds: number,
): Promise<'resolved' | 'rejected' | 'pending'> => {
  const settled = (async (): Promise<'resolved' | 'rejected'> => {
    try {
      await work;
      return 'resolved';
    } catch {
      return 'rejected';
    }
  })();

  return Promise.race([settled, delay<'pending'>(milliseconds, 'pending')]);
};

/** Every non-test TypeScript source under `directory`, read once. */
const readSources = (directory: string): ReadonlyArray<{ path: string; text: string }> =>
  readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith('.ts') &&
        !entry.name.endsWith('.test.ts') &&
        !entry.name.endsWith('.spec.ts'),
    )
    .map((entry) => {
      const file = path.join(entry.parentPath, entry.name);
      return { path: file, text: readFileSync(file, 'utf8') };
    });

const indicatorFor = (target: RedisService): RedisHealthIndicator =>
  new RedisHealthIndicator(new HealthIndicatorService(), target);

describe.skipIf(!dockerAvailable)('Redis failure matrix (T4)', () => {
  let containerId = '';
  let redisUrl = '';
  let service: RedisService;

  beforeAll(async () => {
    containerId = execFileSync(
      'docker',
      [
        'run',
        '--rm',
        '-d',
        '-p',
        '127.0.0.1:0:6379',
        'redis:7-alpine',
        'redis-server',
        '--maxclients',
        String(containerMaxClients),
        '--save',
        '',
      ],
      { encoding: 'utf8' },
    ).trim();
    const mapped = execFileSync('docker', ['port', containerId, '6379'], { encoding: 'utf8' }).split('\n')[0] ?? '';
    redisUrl = `redis://127.0.0.1:${mapped.slice(mapped.lastIndexOf(':') + 1)}`;

    service = createService(redisUrl);
    await service.onModuleInit();
    await service.client.flushall();
  });

  afterAll(async () => {
    await service.onModuleDestroy().catch(() => undefined);
    if (containerId) {
      execFileSync('docker', ['rm', '-f', containerId], { stdio: 'pipe' });
    }
  });

  it('should fail closed at cold start when Redis is absent', async () => {
    const absent = createService(`redis://127.0.0.1:${await reserveClosedPort()}`);
    absent.client.on('error', () => undefined);

    const started = Date.now();
    await expect(absent.onModuleInit()).rejects.toThrow(/Redis connection failed/);
    expect(Date.now() - started).toBeLessThan(hangWitnessMilliseconds);

    /* Readiness reports the same absence rather than hanging, so the machine
     * leaves the load balancer instead of serving with no coordination state. */
    const result = await indicatorFor(absent).isHealthy();
    expect(result['redis']?.status).toBe('down');

    absent.client.disconnect();
  });

  it('should bound boot and readiness against a reachable but unresponsive Redis', async () => {
    const stall = await startStallingServer();
    const stalled = createService(stall.url);
    stalled.client.on('error', () => undefined);

    try {
      /* Naive control: ioredis `connectTimeout` covers only the TCP handshake,
       * so the ready check against this peer never settles by itself. */
      const naive = new Redis(stall.url, { lazyConnect: true, connectTimeout: 5000 });
      naive.on('error', () => undefined);
      expect(await outcomeWithin(naive.connect(), hangWitnessMilliseconds)).toBe('pending');
      expect(await outcomeWithin(naive.ping(), hangWitnessMilliseconds)).toBe('pending');
      naive.disconnect();

      await expect(stalled.onModuleInit()).rejects.toThrow(/Redis connection failed/);

      /* And a command issued against the half-open client fails now, so
       * `/health/ready` answers instead of blocking the probe for ever. */
      const readiness = await outcomeWithin(indicatorFor(stalled).isHealthy(), hangWitnessMilliseconds);
      expect(readiness).toBe('resolved');
    } finally {
      stalled.client.disconnect();
      stall.close();
    }
  });

  it('should reject commands during a mid-run drop and never replay them on reconnect', async () => {
    await service.client.set('t4:live', 'before');
    service.client.stream.destroy();

    await expect(service.client.set('t4:strict-replay', '1')).rejects.toThrow(/enableOfflineQueue/);
    await delay(1000);
    expect(service.client.status).toBe('ready');
    expect(await service.client.get('t4:strict-replay')).toBeNull();
    expect(await service.client.get('t4:live')).toBe('before');

    /* Naive control: the same drop with an offline queue buffers the write and
     * replays it after the reconnect, long after the caller gave up. */
    const naive = new Redis(redisUrl, { lazyConnect: true, enableOfflineQueue: true, maxRetriesPerRequest: 3 });
    naive.on('error', () => undefined);
    await naive.connect();
    naive.stream.destroy();
    await expect(naive.set('t4:naive-replay', '1')).resolves.toBe('OK');
    await delay(1000);
    expect(await naive.get('t4:naive-replay')).toBe('1');
    naive.disconnect();
  });

  it('should degrade boundedly when the instance runs out of client slots', async () => {
    const surplus: Redis[] = [];
    let exhaustedAt = 0;

    try {
      for (let attempt = 0; attempt < containerMaxClients * 2; attempt += 1) {
        const duplicate = service.createDuplicateClient();
        duplicate.on('error', () => undefined);
        surplus.push(duplicate);
        // oxlint-disable-next-line no-await-in-loop -- slots are opened one at a time to find the exhaustion point.
        const outcome = await outcomeWithin(duplicate.connect(), hangWitnessMilliseconds);
        if (outcome !== 'resolved') {
          /* Exhaustion is reported as a rejection, not as a hang. */
          expect(outcome).toBe('rejected');
          exhaustedAt = attempt;
          break;
        }
      }

      /* Exhaustion is reached and does not take the connected client with it. */
      expect(exhaustedAt).toBeGreaterThan(0);
      expect(exhaustedAt).toBeLessThan(containerMaxClients * 2);
      expect(await service.client.ping()).toBe('PONG');
    } finally {
      for (const duplicate of surplus) {
        duplicate.disconnect();
      }
    }

    await delay(200);
    expect(await service.client.ping()).toBe('PONG');
  });

  it('should mint no credit and authorize no spend when the keyspace is evicted', async () => {
    const limiter = new PublicationRateLimiterService(service);
    const slot = { publicationId: 't4-publication', viewerHash: 't4-viewer' };
    const first = await limiter.consumePublicationViewSlot(slot);
    const second = await limiter.consumePublicationViewSlot(slot);
    await service.client.flushall();
    const afterEviction = await limiter.consumePublicationViewSlot(slot);

    /* A wiped keyspace resets a coordination counter — bounded, non-financial,
     * and capped again immediately — and leaves no balance behind, because no
     * balance was ever there to erase or resurrect. */
    expect([first.count, second.count]).toEqual([1, 2]);
    expect(afterEviction).toEqual({ allowed: true, count: 1 });
    expect(await service.client.keys('tau:credits*')).toEqual([]);
    expect(await service.client.keys('*')).not.toEqual([]);
  });
});

describe('money paths hold no Redis state', () => {
  it('should keep every billing source free of the Redis client', () => {
    const offenders = readSources(path.join(appDirectory, 'api/billing'))
      .filter((source) => /#redis\/redis\.service|from 'ioredis'/.test(source.text))
      .map((source) => source.path);

    expect(offenders).toEqual([]);
  });

  it('should leave the credit Redis key helpers with no call site', () => {
    const helpers = ['creditsRedisKey', 'creditsReservationRedisKey', 'creditsTurnBucketRedisKey'];
    const callers = readSources(appDirectory)
      .filter((source) => !source.path.endsWith('billing.constants.ts'))
      .filter((source) => helpers.some((helper) => source.text.includes(helper)))
      .map((source) => source.path);

    /* The B2 Lua balance path is gone; nothing may name a credit key in Redis
     * again without this failing. */
    expect(callers).toEqual([]);
  });

  it('should read usage from the database with no Redis cache to fall back from', () => {
    const usage = readFileSync(path.join(appDirectory, 'api/billing/billing-usage.service.ts'), 'utf8');

    expect(usage).not.toMatch(/redis/i);
    expect(usage).toMatch(/databaseService/);
  });
});
