// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  acquireChatLeaderLease,
  agentHostAuthorityName,
  awaitWhileLeaderLives,
  createFollowerRecoveryMonitor,
} from '#workers/agent-host-leader.js';
import type { AgentHostLockRequest } from '#workers/agent-host-leader.js';

class StubLockManager {
  public readonly names: string[] = [];
  readonly #held = new Set<string>();

  public readonly request: AgentHostLockRequest = async (name, _options, callback) => {
    this.names.push(name);
    if (this.#held.has(name)) {
      await callback(undefined);
      return;
    }
    this.#held.add(name);
    try {
      await callback({ name });
    } finally {
      this.#held.delete(name);
    }
  };
}

describe('acquireChatLeaderLease', () => {
  it('keys the event-log lease by project and chat across protocol versions', async () => {
    const locks = new StubLockManager();
    const options = {
      projectId: 'project-a',
      chatId: 'chat-1',
      requestLock: locks.request,
      createGeneration: (() => {
        let next = 0;
        return () => `generation-${next++}`;
      })(),
    };
    const first = await acquireChatLeaderLease(options);
    const follower = await acquireChatLeaderLease(options);
    const otherProject = await acquireChatLeaderLease({ ...options, projectId: 'project-b' });

    expect(first.isLeader).toBe(true);
    expect(follower).toEqual({ isLeader: false });
    expect(otherProject.isLeader).toBe(true);
    /* No protocol version: one chat log has one writer across a deploy, so two
     * builds must contend for the same lease rather than take one each. */
    expect(locks.names).toEqual([
      'agent-host-log:project-a:chat-1',
      'agent-host-log:project-a:chat-1',
      'agent-host-log:project-b:chat-1',
    ]);

    if (!first.isLeader) {
      throw new Error('Expected the first caller to hold the lease.');
    }
    expect(first.generation).toBe('generation-0');
    first.release();
    await first.completion;

    const replacement = await acquireChatLeaderLease(options);
    expect(replacement.isLeader).toBe(true);
    if (replacement.isLeader) {
      expect(replacement.generation).not.toBe(first.generation);
      replacement.release();
      await replacement.completion;
    }
    if (otherProject.isLeader) {
      otherProject.release();
      await otherProject.completion;
    }
  });

  it('hands the lease to a follower once the leading tab dies', async () => {
    const locks = new StubLockManager();
    const options = {
      projectId: 'project-a',
      chatId: 'chat-orphan',
      requestLock: locks.request,
      createGeneration: (() => {
        let next = 0;
        return () => `generation-${next++}`;
      })(),
    };
    const deadLeader = await acquireChatLeaderLease(options);
    expect(await acquireChatLeaderLease(options)).toEqual({ isLeader: false });
    if (!deadLeader.isLeader) {
      throw new Error('Expected the first tab to lead.');
    }
    deadLeader.release();
    await deadLeader.completion;

    const replacement = await acquireChatLeaderLease(options);
    expect(replacement.isLeader).toBe(true);
    if (replacement.isLeader) {
      replacement.release();
      await replacement.completion;
    }
  });
});

/* W0.17 (L2b HD-2, O3). The channel added the protocol version and the
 * checkout to the lock's key, so a follower that lost the lock race to a leader
 * of another build or checkout could never hear it. */
describe('agentHostAuthorityName', () => {
  it('should key the leader channel on exactly the lock identity', async () => {
    const locks = new StubLockManager();
    const lease = await acquireChatLeaderLease({
      projectId: 'project-a',
      chatId: 'chat-1',
      requestLock: locks.request,
      createGeneration: () => 'generation-0',
    });

    expect(agentHostAuthorityName({ projectId: 'project-a', chatId: 'chat-1' })).toBe(locks.names[0]);
    if (lease.isLeader) {
      lease.release();
      await lease.completion;
    }
  });
});

describe('awaitWhileLeaderLives', () => {
  it('waits out a slow command while the leader keeps answering its heartbeat', async () => {
    vi.useFakeTimers();
    const response = Promise.withResolvers<string>();
    let lastSeenAt = 0;
    const waiting = awaitWhileLeaderLives({
      response: response.promise,
      generation: 'generation-1',
      lastSeen: () => ({ generation: 'generation-1', at: lastSeenAt }),
      heartbeatTimeout: 3500,
      now: () => Date.now(),
    });

    // Four heartbeat windows — twice the old fixed deadline — with the leader alive throughout.
    for (let beat = 0; beat < 14; beat += 1) {
      // oxlint-disable-next-line no-await-in-loop -- Each beat must land before the next timer fires.
      await vi.advanceTimersByTimeAsync(1000);
      lastSeenAt = Date.now();
    }
    response.resolve('answered');

    await expect(waiting).resolves.toBe('answered');
    vi.useRealTimers();
  });

  it('gives up once the leader stops proving it is alive', async () => {
    vi.useFakeTimers();
    const lastSeenAt = Date.now();
    const waiting = awaitWhileLeaderLives({
      response: Promise.withResolvers<string>().promise,
      generation: 'generation-1',
      lastSeen: () => ({ generation: 'generation-1', at: lastSeenAt }),
      heartbeatTimeout: 3500,
      now: () => Date.now(),
    });

    await vi.advanceTimersByTimeAsync(3500);

    await expect(waiting).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  /* The other half of the T4-11 trade: liveness is the only bound, so a live
   * leader that never answers is waited on forever. That is why answering every
   * command it receives is the leader's obligation, not the follower's timer. */
  it('never settles while a live leader leaves a command unanswered', async () => {
    vi.useFakeTimers();
    let lastSeenAt = Date.now();
    const waiting = awaitWhileLeaderLives({
      response: Promise.withResolvers<string>().promise,
      generation: 'generation-1',
      lastSeen: () => ({ generation: 'generation-1', at: lastSeenAt }),
      heartbeatTimeout: 3500,
      now: () => Date.now(),
    });

    for (let beat = 0; beat < 30; beat += 1) {
      // oxlint-disable-next-line no-await-in-loop -- Each beat must land before the next timer fires.
      await vi.advanceTimersByTimeAsync(1000);
      lastSeenAt = Date.now();
    }

    await expect(Promise.race([waiting, Promise.resolve('still waiting')])).resolves.toBe('still waiting');
    vi.useRealTimers();
  });

  /* W0.14, S4's `LogLeadership` trace: the follower sends to generation 1,
   * which crashes before answering; generation 2 wins the lock and heartbeats.
   * Any generation's heartbeat kept the wait alive, so it never ended. */
  it('should end a wait whose addressed leader died while a new leader heartbeats', async () => {
    vi.useFakeTimers();
    const monitor = createFollowerRecoveryMonitor({
      heartbeatTimeout: 3500,
      tailTimeout: 2000,
      onStale: () => undefined,
    });
    monitor.observeLeader('generation-1');
    const waiting = awaitWhileLeaderLives({
      response: Promise.withResolvers<string>().promise,
      generation: 'generation-1',
      lastSeen: () => monitor.lastSeen(),
      heartbeatTimeout: 3500,
    });

    // One heartbeat bound after the addressed leader was last heard, not forever.
    for (let beat = 0; beat < 4; beat += 1) {
      // oxlint-disable-next-line no-await-in-loop -- Each beat must land before the next timer fires.
      await vi.advanceTimersByTimeAsync(1000);
      monitor.observeLeader('generation-2');
    }

    await expect(Promise.race([waiting, Promise.resolve('still waiting')])).resolves.toBeUndefined();
    monitor.stop();
    vi.useRealTimers();
  });

  /* W0.14, L4 D-111: liveness read the wall clock, so a clock step ended a
   * wait on a leader that was heartbeating the whole time. */
  it('should neither end nor re-send a forwarded wait when the wall clock steps forward', async () => {
    vi.useFakeTimers();
    const monitor = createFollowerRecoveryMonitor({
      heartbeatTimeout: 3500,
      tailTimeout: 2000,
      onStale: () => undefined,
    });
    monitor.observeLeader('generation-1');
    const waiting = awaitWhileLeaderLives({
      response: Promise.withResolvers<string>().promise,
      generation: 'generation-1',
      lastSeen: () => monitor.lastSeen(),
      heartbeatTimeout: 3500,
    });

    for (let beat = 0; beat < 8; beat += 1) {
      // oxlint-disable-next-line no-await-in-loop -- Each beat must land before the next timer fires.
      await vi.advanceTimersByTimeAsync(1000);
      monitor.observeLeader('generation-1');
      if (beat === 2) {
        // Between a heartbeat and the wait's next liveness check.
        // oxlint-disable-next-line no-await-in-loop -- The step lands at one instant of the sequence.
        await vi.advanceTimersByTimeAsync(200);
        vi.setSystemTime(Date.now() + 10_000);
      }
    }

    await expect(Promise.race([waiting, Promise.resolve('still waiting')])).resolves.toBe('still waiting');
    monitor.stop();
    vi.useRealTimers();
  });

  it('gives up when this follower has never heard from a leader', async () => {
    vi.useFakeTimers();
    const waiting = awaitWhileLeaderLives({
      response: Promise.withResolvers<string>().promise,
      generation: undefined,
      lastSeen: () => undefined,
      heartbeatTimeout: 3500,
    });

    await vi.advanceTimersByTimeAsync(3500);

    await expect(waiting).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});

describe('createFollowerRecoveryMonitor', () => {
  it('expires only after a full heartbeat lease without leader activity', () => {
    vi.useFakeTimers();
    const stale = vi.fn();
    const monitor = createFollowerRecoveryMonitor({ heartbeatTimeout: 30, tailTimeout: 10, onStale: stale });

    monitor.observeLeader('generation-1');
    vi.advanceTimersByTime(29);
    expect(stale).not.toHaveBeenCalled();
    monitor.observeLeader('generation-1');
    vi.advanceTimersByTime(29);
    expect(stale).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(stale).toHaveBeenCalledOnce();
    expect(stale).toHaveBeenCalledWith({ generation: 'generation-1', reason: 'heartbeat' });
    monitor.stop();
    vi.useRealTimers();
  });

  it('expires a tail latch when the response is lost or belongs to another generation', () => {
    vi.useFakeTimers();
    const stale = vi.fn();
    const monitor = createFollowerRecoveryMonitor({ heartbeatTimeout: 30, tailTimeout: 10, onStale: stale });

    monitor.observeLeader('generation-1');
    monitor.beginTail('generation-1');
    monitor.settleTail('generation-2');
    vi.advanceTimersByTime(10);

    expect(stale).toHaveBeenCalledWith({ generation: 'generation-1', reason: 'tail' });
    monitor.stop();
    vi.useRealTimers();
  });
});
