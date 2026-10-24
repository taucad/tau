/* oxlint-disable new-cap -- NestJS's Logger is a class the module instantiates once */
import { randomBytes } from 'node:crypto';
import { hostname } from 'node:os';
import process from 'node:process';
import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { GitOperation, MetricsService } from '#telemetry/metrics.js';

/**
 * The per-owner in-flight cap at the API's git admission (Hosted Remote
 * Storage DA6; north star Q16 and charter D8, superseding W9 FR7's 4 and 2).
 *
 * An owner may have at most {@link ownerInFlightRequestCap} git requests in
 * flight at the API, of which at most {@link ownerInFlightPushCap} are pushes.
 * A request over either cap is answered `429 GIT_OWNER_IN_FLIGHT_LIMIT` with a
 * `Retry-After` drawn uniformly from whole seconds in
 * {@link ownerInFlightRetryAfter}, which the client honours and retries
 * (`packages/revisions` `http-client.ts`). It is not held: a held request
 * would still occupy the API and a client connection, and the cap exists to
 * stop one owner filling the git workers.
 *
 * Why it exists: lease admission (`lease-admission.ts`) bounds one Machine's
 * disk, not request counts, and D22's Redis budgets are per-minute counts,
 * not concurrency. Without this cap one owner's devices and hosts can hold
 * every worker slot, and concurrent pushes can overshoot the owner's quota by
 * the number of pushes in flight times `remainingBytes` (W9 FR7, FR9): the
 * push cap bounds that overshoot at 5 × `remainingBytes` plus
 * `quotaOverrunSlackBytes`.
 *
 * What counts: a request is a smart-HTTP request (`info/refs`,
 * `git-upload-pack`, `git-receive-pack`) or a ref removal; a push is only
 * `git-receive-pack`, which also counts as a request. Leases the API takes for
 * itself (`derive`, `compact`, `restore`) are not the owner's requests and are
 * not capped. The slot is taken after the route step (a request held for a
 * freeze holds no slot) and before anything costs a manifest read, a lease or
 * a git child, and it is held until the request's lease is released, which is
 * after a fetch's pack has streamed out.
 *
 * The count is the owner's across every API Machine, in the API's Redis
 * ({@link RedisOwnerInFlightCap}), so the cap does not grow with the fleet.
 * DC1's forwarder takes the same slot through {@link OwnerInFlightGate.admit}
 * before it forwards, and releases it when the proxied response ends.
 */

/** Git requests one owner may have in flight at the API (D8). */
export const ownerInFlightRequestCap = 10;

/** Of those, pushes (`git-receive-pack`) one owner may have in flight (D8). */
export const ownerInFlightPushCap = 5;

/**
 * The over-cap answer's `Retry-After`, in whole seconds, both bounds included.
 * HTTP's `Retry-After` is whole seconds, so the jitter is too: three values
 * spread a burst over three seconds, and the client adds up to a second of its
 * own. One second is about one fetch; three keep a capped device's retry
 * inside the sync scheduler's patience.
 */
export const ownerInFlightRetryAfter = {
  minimumSeconds: 1,
  maximumSeconds: 3,
} as const;

/**
 * Draws one over-cap `Retry-After`.
 *
 * @param random - A uniform draw in [0, 1); injected in tests.
 * @returns Whole seconds in {@link ownerInFlightRetryAfter}.
 */
export const ownerCapRetryAfterSeconds = (random: () => number = Math.random): number => {
  const { minimumSeconds, maximumSeconds } = ownerInFlightRetryAfter;
  const span = maximumSeconds - minimumSeconds + 1;
  return minimumSeconds + Math.min(span - 1, Math.floor(random() * span));
};

/** What one request takes: a request slot, and for a push a push slot too. */
export type OwnerInFlightKind = 'request' | 'push';

/** A slot, or which of the two caps refused it. */
export type OwnerSlot =
  | { readonly admitted: true; readonly release: () => void }
  | { readonly admitted: false; readonly limit: 'requests' | 'pushes' };

/** Where an owner's in-flight requests are counted. */
export type OwnerInFlightCap = {
  /**
   * Takes one slot for an owner when it is under its caps.
   *
   * @param ownerId - The repository owner.
   * @param kind - A request, or a push (which takes a request slot too).
   * @returns The slot with its idempotent release, or the cap that refused it.
   */
  acquire(ownerId: string, kind: OwnerInFlightKind): Promise<OwnerSlot>;
};

/** One process's count: the unit suites', and a single-process deployment's. */
export class MemoryOwnerInFlightCap implements OwnerInFlightCap {
  readonly #owners = new Map<string, { requests: number; pushes: number }>();
  readonly #requestCap: number;
  readonly #pushCap: number;

  /** @param caps - The caps; D8's by default. */
  public constructor(caps: { requests?: number; pushes?: number } = {}) {
    this.#requestCap = caps.requests ?? ownerInFlightRequestCap;
    this.#pushCap = caps.pushes ?? ownerInFlightPushCap;
  }

  /**
   * @param ownerId - The repository owner.
   * @returns What that owner holds now.
   */
  public inFlight(ownerId: string): { requests: number; pushes: number } {
    const held = this.#owners.get(ownerId);
    return { requests: held?.requests ?? 0, pushes: held?.pushes ?? 0 };
  }

  public async acquire(ownerId: string, kind: OwnerInFlightKind): Promise<OwnerSlot> {
    const held = this.#owners.get(ownerId) ?? { requests: 0, pushes: 0 };
    if (held.requests >= this.#requestCap) {
      return { admitted: false, limit: 'requests' };
    }
    const push = kind === 'push';
    if (push && held.pushes >= this.#pushCap) {
      return { admitted: false, limit: 'pushes' };
    }
    held.requests += 1;
    held.pushes += push ? 1 : 0;
    this.#owners.set(ownerId, held);
    let released = false;
    return {
      admitted: true,
      release: () => {
        if (released) {
          return;
        }
        released = true;
        held.requests -= 1;
        held.pushes -= push ? 1 : 0;
        if (held.requests === 0) {
          this.#owners.delete(ownerId);
        }
      },
    };
  }
}

/*
 * Count-and-take in one step, so two Machines can never both take the tenth
 * slot. KEYS: the owner's request set, then its push set. ARGV: now, the
 * member's lapse time, the member, the request cap, the push cap, '1' for a
 * push, and the keys' TTL. Members lapse by score, as the in-flight registry's
 * do, so a crashed Machine's slots come back within the expiry.
 * Returns 0 (taken), 1 (request cap) or 2 (push cap).
 */
const acquireScript = `
local now = tonumber(ARGV[1])
local expires = tonumber(ARGV[2])
local member = ARGV[3]
local ttl = tonumber(ARGV[7])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[4]) then
  return 1
end
if ARGV[6] == '1' then
  redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now)
  if redis.call('ZCARD', KEYS[2]) >= tonumber(ARGV[5]) then
    return 2
  end
  redis.call('ZADD', KEYS[2], expires, member)
  redis.call('PEXPIRE', KEYS[2], ttl)
end
redis.call('ZADD', KEYS[1], expires, member)
redis.call('PEXPIRE', KEYS[1], ttl)
return 0
`;

/**
 * The count every API Machine shares.
 *
 * Two sorted sets per owner, `…:{owner}:requests` and `…:{owner}:pushes`
 * (one hash slot, so the script stays valid on a cluster), whose members are
 * scored by when they lapse. A Machine re-scores its live members every
 * heartbeat, so a ten-minute clone keeps its slot while its Machine lives,
 * and a crashed Machine's slots lapse within the expiry instead of locking
 * the owner out. The owner id is in the key, never in a metric label.
 *
 * Redis failing is admitted, not refused: the cap is fairness between owners,
 * and the route guard and lease admission still bound what one request costs.
 */
export class RedisOwnerInFlightCap implements OwnerInFlightCap {
  readonly #logger = new Logger(RedisOwnerInFlightCap.name);
  readonly #client: Redis;
  readonly #instanceId: string;
  readonly #keyPrefix: string;
  readonly #heartbeatMilliseconds: number;
  readonly #expiryMilliseconds: number;
  readonly #requestCap: number;
  readonly #pushCap: number;
  readonly #live = new Map<string, readonly string[]>();
  #sequence = 0;
  #heartbeat: NodeJS.Timeout | undefined;
  #closed = false;

  /**
   * @param client - A connected ioredis client.
   * @param options - This process's id, the key prefix, the heartbeat and expiry (default 5 s and 15 s), and the caps (D8's by default).
   */
  public constructor(
    client: Redis,
    options: {
      instanceId?: string;
      keyPrefix?: string;
      heartbeatMilliseconds?: number;
      expiryMilliseconds?: number;
      requests?: number;
      pushes?: number;
    } = {},
  ) {
    this.#client = client;
    this.#instanceId =
      options.instanceId ??
      `${process.env['FLY_MACHINE_ID'] ?? hostname()}-${String(process.pid)}-${randomBytes(3).toString('hex')}`;
    this.#keyPrefix = options.keyPrefix ?? 'git:owner-inflight';
    this.#heartbeatMilliseconds = options.heartbeatMilliseconds ?? 5000;
    this.#expiryMilliseconds = options.expiryMilliseconds ?? 15_000;
    this.#requestCap = options.requests ?? ownerInFlightRequestCap;
    this.#pushCap = options.pushes ?? ownerInFlightPushCap;
  }

  public async acquire(ownerId: string, kind: OwnerInFlightKind): Promise<OwnerSlot> {
    this.#sequence += 1;
    const member = `${this.#instanceId}:${String(this.#sequence)}`;
    const push = kind === 'push';
    const keys = [this.#key(ownerId, 'requests'), this.#key(ownerId, 'pushes')] as const;
    const now = Date.now();
    let answer: unknown;
    try {
      answer = await this.#client.eval(
        acquireScript,
        2,
        keys[0],
        keys[1],
        String(now),
        String(now + this.#expiryMilliseconds),
        member,
        String(this.#requestCap),
        String(this.#pushCap),
        push ? '1' : '0',
        String(this.#expiryMilliseconds * 2),
      );
    } catch (error) {
      this.#logger.warn({ err: error }, 'The owner in-flight cap could not be read; admitting the git request');
      return { admitted: true, release: () => undefined };
    }
    if (Number(answer) === 1) {
      return { admitted: false, limit: 'requests' };
    }
    if (Number(answer) === 2) {
      return { admitted: false, limit: 'pushes' };
    }
    const held = push ? keys : [keys[0]];
    this.#live.set(member, held);
    this.#startHeartbeat();
    let released = false;
    return {
      admitted: true,
      release: () => {
        if (released) {
          return;
        }
        released = true;
        this.#live.delete(member);
        if (this.#live.size === 0) {
          this.#stopHeartbeat();
        }
        void this.#remove(held, member);
      },
    };
  }

  /** Stops heartbeating. A process that stops this way leaves its slots to lapse, like a crash. */
  public close(): void {
    this.#closed = true;
    this.#stopHeartbeat();
  }

  #key(ownerId: string, set: 'requests' | 'pushes'): string {
    return `${this.#keyPrefix}:{${ownerId}}:${set}`;
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

  /** Re-scores every live slot, so a long request keeps it while this process lives. */
  async #renew(): Promise<void> {
    const expiresAt = Date.now() + this.#expiryMilliseconds;
    const batch = this.#client.multi();
    for (const [member, keys] of this.#live) {
      for (const key of keys) {
        batch.zadd(key, 'XX', expiresAt, member).pexpire(key, this.#expiryMilliseconds * 2);
      }
    }
    try {
      await batch.exec();
    } catch (error) {
      this.#logger.warn({ err: error }, 'Owner in-flight slots could not be renewed');
    }
  }

  async #remove(keys: readonly string[], member: string): Promise<void> {
    try {
      const batch = this.#client.multi();
      for (const key of keys) {
        batch.zrem(key, member);
      }
      await batch.exec();
    } catch (error) {
      /* It lapses on its own within the expiry. */
      this.#logger.warn({ err: error }, 'An owner in-flight slot could not be removed; it will lapse');
    }
  }

  #stopHeartbeat(): void {
    if (this.#heartbeat !== undefined) {
      clearInterval(this.#heartbeat);
      this.#heartbeat = undefined;
    }
  }
}

/** The git operations an owner's own requests are: everything else is the API's own work and is not capped. */
const cappedOperations: ReadonlySet<GitOperation> = new Set(['advertise', 'upload_pack', 'receive_pack', 'remove_ref']);

/**
 * The owner step of git request admission: takes the owner's slot, or
 * refuses with the 429 and counts the refusal as `tau.git.admissions`
 * `outcome="owner_capped"` (DA2's series, one more outcome).
 */
export class OwnerInFlightGate {
  /**
   * A gate that admits everything: what a `GitRepositoryService` built
   * outside the Nest module (a unit suite, a maintenance command) gets.
   *
   * @returns The gate.
   */
  public static open(): OwnerInFlightGate {
    return new OwnerInFlightGate({
      cap: {
        acquire: async () => ({ admitted: true, release: () => undefined }),
      },
    });
  }

  readonly #cap: OwnerInFlightCap;
  readonly #metrics: MetricsService | undefined;
  readonly #random: () => number;

  /**
   * @param args - Where slots are counted, the metrics, and the jitter's draw (injected in tests).
   */
  public constructor(args: { cap: OwnerInFlightCap; metrics?: MetricsService; random?: () => number }) {
    this.#cap = args.cap;
    this.#metrics = args.metrics;
    this.#random = args.random ?? Math.random;
  }

  /**
   * Takes the owner's slot for one request.
   *
   * @param request - Whose repository, and which git operation.
   * @returns The release, which every path must call; idempotent.
   * @throws HttpException `429 GIT_OWNER_IN_FLIGHT_LIMIT` with a jittered `retryAfterSeconds` over the cap.
   */
  public async admit(request: { ownerId: string; operation: GitOperation }): Promise<() => void> {
    if (!cappedOperations.has(request.operation)) {
      return () => undefined;
    }
    const slot = await this.#cap.acquire(request.ownerId, request.operation === 'receive_pack' ? 'push' : 'request');
    if (slot.admitted) {
      return slot.release;
    }
    this.#metrics?.gitAdmissions.add(1, {
      'tau.git.operation': request.operation,
      outcome: 'owner_capped',
    });
    throw this.refusal(ownerCapRetryAfterSeconds(this.#random));
  }

  /**
   * The over-cap answer. The controller copies `retryAfterSeconds` to `Retry-After`.
   *
   * @param retryAfterSeconds - The jittered wait.
   * @returns The 429.
   */
  public refusal(retryAfterSeconds: number): HttpException {
    return new HttpException(
      {
        code: 'GIT_OWNER_IN_FLIGHT_LIMIT',
        message: 'Too many git requests are running for this account; retry in a moment.',
        retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
