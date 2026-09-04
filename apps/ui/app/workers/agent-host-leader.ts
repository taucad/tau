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

export const agentHostProtocolVersion = 1;

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

const agentHostLeaseName = (options: { readonly projectId: string; readonly chatId: string }): string =>
  ['agent-host-log', `v${agentHostProtocolVersion}`, options.projectId, options.chatId]
    .map((part) => encodeURIComponent(part))
    .join(':');

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

/** Resume the non-terminal snapshot observed immediately after a follower acquires leadership. */
export const recoverAttachedRun = async <Snapshot extends { readonly state: string }>(options: {
  readonly snapshot: () => Promise<Snapshot>;
  readonly resume: () => Promise<unknown>;
}): Promise<Snapshot> => {
  const snapshot = await options.snapshot();
  if (snapshot.state !== 'completed' && snapshot.state !== 'failed' && snapshot.state !== 'cancelled') {
    await options.resume();
    return options.snapshot();
  }
  return snapshot;
};
