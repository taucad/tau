/* oxlint-disable new-cap -- NestJS's Logger is a class the module instantiates once */
import { randomBytes } from 'node:crypto';
import { hostname } from 'node:os';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';

/**
 * In-flight registration and the drain (DW1, W10 cut-over step 2).
 *
 * Every git request the route guard admits registers itself until its lease
 * is released; a migrator or a restore writes a freeze, then waits until no
 * request registered before the freeze is still running. The registry has to
 * be shared by every API Machine and the process that drains, so the
 * deployment's is Redis; the in-memory one serves the unit suites.
 *
 * The drain is how a cut-over avoids racing live writers, not what keeps them
 * safe. A request admitted from a stale route cache, or one whose
 * registration failed, is answered by the fence: its compare-and-swap loses,
 * or it hydrates the fence and the guard reads the route past the cache.
 */

/** The shared registry the guard writes and the drain reads. */
export type InFlightRegistry = {
  /**
   * Registers one request on a repository until the returned release is called.
   *
   * @param projectId - The repository's project.
   * @returns The release; calling it twice is harmless.
   */
  register(projectId: string): Promise<() => void>;
  /**
   * How many live requests, on one repository or on any, registered at or before `before`.
   *
   * @param scope - One repository, or every repository when `projectId` is absent.
   * @param before - The freeze's start.
   * @returns The count.
   */
  countRegisteredBefore(scope: { projectId?: string }, before: Date): Promise<number>;
};

/**
 * Waits until no request registered before `before` is in flight (W10 step 2).
 *
 * @param registry - The shared registry.
 * @param args - One repository (or every one), the freeze's start, the timeout (W10: 8 s) and the poll interval.
 * @returns True once drained; false at the timeout, after which a migrator unfreezes and retries later.
 */
export const drainInFlight = async (
  registry: InFlightRegistry,
  args: {
    projectId?: string;
    before: Date;
    timeoutMilliseconds?: number;
    pollMilliseconds?: number;
  },
): Promise<boolean> => {
  const deadline = Date.now() + (args.timeoutMilliseconds ?? 8000);
  const scope = args.projectId === undefined ? {} : { projectId: args.projectId };
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- a poll is sequential by definition
    if ((await registry.countRegisteredBefore(scope, args.before)) === 0) {
      return true;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      return false;
    }
    // oxlint-disable-next-line no-await-in-loop -- same reason
    await delay(Math.min(args.pollMilliseconds ?? 50, remaining));
  }
};

/** One process's registry. Used by the unit suites, and by a guard with no Redis. */
export class MemoryInFlightRegistry implements InFlightRegistry {
  readonly #entries = new Map<number, { projectId: string; registeredAt: number }>();
  #sequence = 0;

  /** Requests registered now. */
  public get size(): number {
    return this.#entries.size;
  }

  public async register(projectId: string): Promise<() => void> {
    this.#sequence += 1;
    const id = this.#sequence;
    this.#entries.set(id, { projectId, registeredAt: Date.now() });
    return () => {
      this.#entries.delete(id);
    };
  }

  public async countRegisteredBefore(scope: { projectId?: string }, before: Date): Promise<number> {
    let found = 0;
    for (const entry of this.#entries.values()) {
      if (
        (scope.projectId === undefined || entry.projectId === scope.projectId) &&
        entry.registeredAt <= before.getTime()
      ) {
        found += 1;
      }
    }
    return found;
  }
}

/**
 * The registry every API Machine and the draining process share.
 *
 * One sorted set per repository and one for every repository, so a global
 * drain (the restore runbook) and a per-repository drain (a cut-over) are each
 * one read. A member is `<instance>:<sequence>:<registeredAt>`, scored by when
 * its registration lapses. A Machine re-scores its live members every
 * heartbeat, so a request that runs for minutes stays registered, while one
 * whose Machine crashed lapses within the expiry and cannot wedge a drain.
 * Nothing here is a metric label, so the repository id in the key is fine.
 */
export class RedisInFlightRegistry implements InFlightRegistry {
  readonly #logger = new Logger(RedisInFlightRegistry.name);
  readonly #client: Redis;
  readonly #instanceId: string;
  readonly #keyPrefix: string;
  readonly #heartbeatMilliseconds: number;
  readonly #expiryMilliseconds: number;
  readonly #live = new Map<string, string>();
  #sequence = 0;
  #heartbeat: NodeJS.Timeout | undefined;
  #closed = false;

  /**
   * @param client - A connected ioredis client.
   * @param options - This process's id, the key prefix, and the heartbeat and expiry (default 5 s and 15 s).
   */
  public constructor(
    client: Redis,
    options: {
      instanceId?: string;
      keyPrefix?: string;
      heartbeatMilliseconds?: number;
      expiryMilliseconds?: number;
    } = {},
  ) {
    this.#client = client;
    this.#instanceId =
      options.instanceId ??
      `${process.env['FLY_MACHINE_ID'] ?? hostname()}-${String(process.pid)}-${randomBytes(3).toString('hex')}`;
    this.#keyPrefix = options.keyPrefix ?? 'git:inflight';
    this.#heartbeatMilliseconds = options.heartbeatMilliseconds ?? 5000;
    this.#expiryMilliseconds = options.expiryMilliseconds ?? 15_000;
  }

  public async register(projectId: string): Promise<() => void> {
    this.#sequence += 1;
    const member = `${this.#instanceId}:${String(this.#sequence)}:${String(Date.now())}`;
    const projectKey = this.#projectKey(projectId);
    const expiresAt = Date.now() + this.#expiryMilliseconds;
    await this.#client
      .multi()
      .zadd(projectKey, expiresAt, member)
      .pexpire(projectKey, this.#expiryMilliseconds * 2)
      .zadd(this.#allKey(), expiresAt, member)
      .pexpire(this.#allKey(), this.#expiryMilliseconds * 2)
      .exec();
    this.#live.set(member, projectKey);
    this.#startHeartbeat();
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      this.#live.delete(member);
      if (this.#live.size === 0) {
        this.#stopHeartbeat();
      }
      void this.#remove(projectKey, member);
    };
  }

  public async countRegisteredBefore(scope: { projectId?: string }, before: Date): Promise<number> {
    const key = scope.projectId === undefined ? this.#allKey() : this.#projectKey(scope.projectId);
    const now = Date.now();
    const results = await this.#client
      .multi()
      .zremrangebyscore(key, '-inf', now)
      .zrangebyscore(key, now, '+inf')
      .exec();
    const [error, members] = results?.[1] ?? [];
    if (error) {
      throw error;
    }
    return ((members as string[] | undefined) ?? []).filter(
      (member) => Number(member.slice(member.lastIndexOf(':') + 1)) <= before.getTime(),
    ).length;
  }

  /** Stops heartbeating. A process that stops this way leaves its members to lapse, like a crash. */
  public close(): void {
    this.#closed = true;
    this.#stopHeartbeat();
  }

  #projectKey(projectId: string): string {
    return `${this.#keyPrefix}:project:${projectId}`;
  }

  #allKey(): string {
    return `${this.#keyPrefix}:all`;
  }

  #startHeartbeat(): void {
    if (this.#heartbeat !== undefined || this.#closed) {
      return;
    }
    this.#heartbeat = setInterval(() => {
      void this.#renew();
    }, this.#heartbeatMilliseconds);
    this.#heartbeat.unref();
  }

  /** Re-scores every live member, so a long request stays registered while this process lives. */
  async #renew(): Promise<void> {
    const expiresAt = Date.now() + this.#expiryMilliseconds;
    const batch = this.#client.multi();
    for (const [member, projectKey] of this.#live) {
      batch.zadd(projectKey, 'XX', expiresAt, member).pexpire(projectKey, this.#expiryMilliseconds * 2);
      batch.zadd(this.#allKey(), 'XX', expiresAt, member);
    }
    batch.pexpire(this.#allKey(), this.#expiryMilliseconds * 2);
    try {
      await batch.exec();
    } catch (error) {
      this.#logger.warn({ err: error }, 'In-flight git registrations could not be renewed');
    }
  }

  async #remove(projectKey: string, member: string): Promise<void> {
    try {
      await this.#client.multi().zrem(projectKey, member).zrem(this.#allKey(), member).exec();
    } catch (error) {
      /* It lapses on its own within the expiry; a drain waits at most that long for it. */
      this.#logger.warn({ err: error }, 'An in-flight git registration could not be removed; it will lapse');
    }
  }

  #stopHeartbeat(): void {
    if (this.#heartbeat !== undefined) {
      clearInterval(this.#heartbeat);
      this.#heartbeat = undefined;
    }
  }
}
