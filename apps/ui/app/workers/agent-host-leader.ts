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
 * Bumped whenever a `LeaderBroadcast` member or a worker command changes shape:
 * the Web Lock and the BroadcastChannel are both keyed on it, so two builds
 * that disagree about the frames never share either. Version 1 spanned two
 * incompatible leader schemas (`replay` deleted from the broadcast union, and
 * `trigger` narrowed to edit/regenerate), which left a deploy's old tab posting
 * frames the new tab's strict parse dropped without a word.
 */
export const agentHostProtocolVersion = 2;

export type FollowerStaleReason = 'heartbeat' | 'tail';

export type FollowerRecoveryMonitor = {
  observeLeader(generation: string): boolean;
  beginTail(generation: string): void;
  settleTail(generation: string): boolean;
  lastSeenAt(): number | undefined;
  stop(): void;
};

/** Follower-owned failure detector for leader heartbeats and replay responses. */
export const createFollowerRecoveryMonitor = (options: {
  readonly heartbeatTimeout: number;
  readonly tailTimeout: number;
  readonly onStale: (event: { readonly generation: string; readonly reason: FollowerStaleReason }) => void;
  readonly now?: (() => number) | undefined;
}): FollowerRecoveryMonitor => {
  const now = options.now ?? Date.now;
  let generation: string | undefined;
  let lastSeenAt: number | undefined;
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
      lastSeenAt = now();
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
    lastSeenAt: (): number | undefined => lastSeenAt,
    stop(): void {
      clearHeartbeat();
      clearTail();
      generation = undefined;
    },
  };
};

export const agentHostAuthorityName = (options: {
  readonly projectId: string;
  readonly workspaceId: string;
  readonly chatId: string;
}): string =>
  ['agent-host', `v${agentHostProtocolVersion}`, options.projectId, options.workspaceId, options.chatId]
    .map((part) => encodeURIComponent(part))
    .join(':');

/**
 * Name the exclusive write lease for one chat's durable log.
 *
 * Deliberately **not** keyed on {@link agentHostProtocolVersion}: the lease is
 * what makes one chat log have one writer, and that has to hold across a
 * deploy. Versioning it would let an old tab and a new tab each take their own
 * lock over the same `events.jsonl` and both append, which the log can only
 * answer by killing one run on `EVENT_MUTATED`. The *frames* are versioned
 * instead, so the two builds never try to read each other's protocol: a
 * follower of the wrong generation is simply never answered and fails with
 * `LEADER_RESPONSE_TIMEOUT`, which the page shows.
 *
 * @param options - The project and chat the lease covers.
 * @returns The Web Lock name.
 */
const agentHostLeaseName = (options: { readonly projectId: string; readonly chatId: string }): string =>
  ['agent-host-log', options.projectId, options.chatId].map((part) => encodeURIComponent(part)).join(':');

/** Acquire and hold the native Web Lock for one chat without blocking followers. */
export const acquireChatLeaderLease = async (options: {
  readonly projectId: string;
  readonly workspaceId: string;
  readonly chatId: string;
  readonly requestLock: AgentHostLockRequest;
  readonly createGeneration: () => string;
}): Promise<ChatLeaderLease> => {
  const acquired = Promise.withResolvers<boolean>();
  const release = Promise.withResolvers<void>();
  const runRequest = async (): Promise<void> => {
    try {
      await options.requestLock(agentHostLeaseName(options), { mode: 'exclusive', ifAvailable: true }, async (lock) => {
        acquired.resolve(lock !== undefined);
        if (lock) {
          await release.promise;
        }
      });
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
 * Await a forwarded response for as long as the leader keeps proving it is alive.
 *
 * A fixed deadline was a *work* bound on someone else's command: a `start` is
 * answered at admission time, which includes turn preparation and can outlast
 * any constant. Past it the follower deleted the leader's generation, failed to
 * win the lock the live leader still held, and re-broadcast the same command —
 * so the leader ran it twice. Liveness is the only thing a follower can
 * legitimately bound, and the leader already publishes it once a second.
 *
 * @param options - The response to await and the follower's view of the leader.
 * @returns The response, or `undefined` once the leader stops answering.
 */
export const awaitWhileLeaderLives = async <Value>(options: {
  readonly response: Promise<Value>;
  /** When this follower last heard from the leader, as the monitor records it. */
  readonly lastSeenAt: () => number | undefined;
  readonly heartbeatTimeout: number;
  readonly now?: (() => number) | undefined;
}): Promise<Value | undefined> => {
  const now = options.now ?? Date.now;
  const expired = Promise.withResolvers<undefined>();
  let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
  const check = (): void => {
    const seen = options.lastSeenAt();
    if (seen !== undefined && now() - seen < options.heartbeatTimeout) {
      timer = globalThis.setTimeout(check, options.heartbeatTimeout);
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
