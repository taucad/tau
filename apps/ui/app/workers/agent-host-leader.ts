export type AgentHostLock = { readonly name: string };

export type AgentHostLockRequest = (
  name: string,
  options: { readonly mode: 'exclusive'; readonly ifAvailable: true },
  callback: (lock: AgentHostLock | undefined) => Promise<void>,
) => Promise<void>;

export type ChatLeaderLease =
  | { readonly isLeader: false }
  | {
      readonly isLeader: true;
      readonly generation: string;
      readonly completion: Promise<void>;
      release(): void;
    };

/**
 * The leader protocol's schema generation.
 *
 * Bumped whenever a `LeaderBroadcast` member or a worker command changes shape.
 * It travels inside every frame, never in the channel's name: two builds on one
 * chat share its lock and its channel, and the leader answers a frame of
 * another version with a coded refusal instead of silence (W0.17, I32).
 */
export const agentHostProtocolVersion = 3;

export type FollowerStaleReason = 'heartbeat' | 'tail';

/** The leader generation a follower last heard, and when, on the monitor's monotonic clock. */
export type LeaderSighting = { readonly generation: string; readonly at: number };

export type FollowerRecoveryMonitor = {
  observeLeader(generation: string): boolean;
  beginTail(generation: string): void;
  settleTail(generation: string): boolean;
  lastSeen(): LeaderSighting | undefined;
  stop(): void;
};

/* Liveness never reads the wall clock: a clock step would end a live leader's
 * wait, or stretch a dead one's (W0.14, L4 D-111). */
const monotonicNow = (): number => performance.now();

/** Follower-owned failure detector for leader heartbeats and replay responses. */
export const createFollowerRecoveryMonitor = (options: {
  readonly heartbeatTimeout: number;
  readonly tailTimeout: number;
  readonly onStale: (event: { readonly generation: string; readonly reason: FollowerStaleReason }) => void;
  readonly now?: (() => number) | undefined;
}): FollowerRecoveryMonitor => {
  const now = options.now ?? monotonicNow;
  let generation: string | undefined;
  let lastSeen: LeaderSighting | undefined;
  let heartbeatId: ReturnType<typeof globalThis.setTimeout> | undefined;
  let tailId: ReturnType<typeof globalThis.setTimeout> | undefined;

  const clearHeartbeat = (): void => {
    globalThis.clearTimeout(heartbeatId);
    heartbeatId = undefined;
  };
  const clearTail = (): void => {
    globalThis.clearTimeout(tailId);
    tailId = undefined;
  };
  const expire = (reason: FollowerStaleReason, expectedGeneration: string): void => {
    if (generation !== expectedGeneration) {
      return;
    }
    clearHeartbeat();
    clearTail();
    generation = undefined;
    options.onStale({ generation: expectedGeneration, reason });
  };
  const armHeartbeat = (currentGeneration: string): void => {
    clearHeartbeat();
    heartbeatId = globalThis.setTimeout(() => {
      expire('heartbeat', currentGeneration);
    }, options.heartbeatTimeout);
  };

  return {
    observeLeader(currentGeneration: string): boolean {
      const changed = generation !== undefined && generation !== currentGeneration;
      if (changed) {
        clearTail();
      }
      generation = currentGeneration;
      lastSeen = { generation: currentGeneration, at: now() };
      armHeartbeat(currentGeneration);
      return changed;
    },
    beginTail(currentGeneration: string): void {
      if (generation !== currentGeneration) {
        return;
      }
      clearTail();
      tailId = globalThis.setTimeout(() => {
        expire('tail', currentGeneration);
      }, options.tailTimeout);
    },
    settleTail(currentGeneration: string): boolean {
      if (generation !== currentGeneration) {
        return false;
      }
      clearTail();
      return true;
    },
    lastSeen: (): LeaderSighting | undefined => lastSeen,
    stop(): void {
      clearHeartbeat();
      clearTail();
      generation = undefined;
    },
  };
};

/**
 * Name one chat's authority: its exclusive write lease and its leader channel.
 *
 * One name for both, keyed on the project and the chat alone. Deliberately
 * **not** on {@link agentHostProtocolVersion}: the lease is what makes one chat
 * log have one writer, and that has to hold across a deploy — versioned, an old
 * tab and a new tab would each take a lock over the same `events.jsonl`. Nor on
 * the checkout: the log is the chat's, whichever checkout its turns land on.
 * The channel used to add both, so a follower that lost the lock race to a
 * leader of another build or checkout could never hear it and failed with
 * `LEADER_RESPONSE_TIMEOUT` some seven seconds later (W0.17, L2b HD-2, O3).
 *
 * @param options - The project and chat the authority covers.
 * @returns The Web Lock and BroadcastChannel name.
 */
export const agentHostAuthorityName = (options: { readonly projectId: string; readonly chatId: string }): string =>
  ['agent-host-log', options.projectId, options.chatId].map((part) => encodeURIComponent(part)).join(':');

/** Acquire and hold the native Web Lock for one chat without blocking followers. */
export const acquireChatLeaderLease = async (options: {
  readonly projectId: string;
  readonly chatId: string;
  readonly requestLock: AgentHostLockRequest;
  readonly createGeneration: () => string;
}): Promise<ChatLeaderLease> => {
  const acquired = Promise.withResolvers<boolean>();
  const release = Promise.withResolvers<void>();
  const runRequest = async (): Promise<void> => {
    try {
      await options.requestLock(
        agentHostAuthorityName(options),
        { mode: 'exclusive', ifAvailable: true },
        async (lock) => {
          acquired.resolve(lock !== undefined);
          if (lock) {
            await release.promise;
          }
        },
      );
    } catch (error) {
      acquired.reject(error);
      throw error;
    }
  };
  const completion = runRequest();
  if (!(await acquired.promise)) {
    await completion;
    return { isLeader: false };
  }
  return { isLeader: true, generation: options.createGeneration(), completion, release: release.resolve };
};

/**
 * Await a forwarded response for as long as the leader it addressed keeps proving it is alive.
 *
 * A fixed deadline was a *work* bound on someone else's command: a `start` is
 * answered at admission time, which includes turn preparation and can outlast
 * any constant. Past it the follower deleted the leader's generation, failed to
 * win the lock the live leader still held, and re-broadcast the same command —
 * so the leader ran it twice. Liveness is the only thing a follower can
 * legitimately bound, and the leader already publishes it once a second.
 *
 * Only the addressed generation's heartbeat counts. Any generation's used to,
 * so a command sent to a leader that died before answering waited forever once
 * its successor started heartbeating (W0.14, S4 `LogLeadership`). A heartbeat
 * from another generation never extends the wait; the caller re-addresses.
 *
 * @param options - The response to await, the generation it addressed and the follower's view of the leader.
 * @returns The response, or `undefined` once the addressed leader stops answering.
 */
export const awaitWhileLeaderLives = async <Value>(options: {
  readonly response: Promise<Value>;
  /** The generation the command was sent to; `undefined` binds the wait to the one this follower hears. */
  readonly generation: string | undefined;
  /** The leader this follower last heard, as the monitor records it. */
  readonly lastSeen: () => LeaderSighting | undefined;
  readonly heartbeatTimeout: number;
  readonly now?: (() => number) | undefined;
}): Promise<Value | undefined> => {
  const now = options.now ?? monotonicNow;
  const expired = Promise.withResolvers<undefined>();
  let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
  let addressed = options.generation;
  let heardAt: number | undefined;
  const check = (): void => {
    const seen = options.lastSeen();
    addressed ??= seen?.generation;
    if (seen !== undefined && seen.generation === addressed) {
      heardAt = seen.at;
    }
    const silentFor = heardAt === undefined ? options.heartbeatTimeout : now() - heardAt;
    if (silentFor < options.heartbeatTimeout) {
      timer = globalThis.setTimeout(check, options.heartbeatTimeout - silentFor);
      return;
    }
    expired.resolve(undefined);
  };
  timer = globalThis.setTimeout(check, options.heartbeatTimeout);
  try {
    return await Promise.race([options.response, expired.promise]);
  } finally {
    globalThis.clearTimeout(timer);
  }
};
