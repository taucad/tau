// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  acquireChatLeaderLease,
  createFollowerRecoveryMonitor,
  recoverAttachedRun,
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
  it('keys the event-log lease by protocol, project, and chat across workspaces', async () => {
    const locks = new StubLockManager();
    const options = {
      projectId: 'project-a',
      workspaceId: 'workspace-a',
      chatId: 'chat-1',
      requestLock: locks.request,
      createGeneration: (() => {
        let next = 0;
        return () => `generation-${next++}`;
      })(),
    };
    const first = await acquireChatLeaderLease(options);
    const follower = await acquireChatLeaderLease(options);
    const otherWorkspace = await acquireChatLeaderLease({ ...options, workspaceId: 'workspace-b' });
    const otherProject = await acquireChatLeaderLease({ ...options, projectId: 'project-b' });

    expect(first.isLeader).toBe(true);
    expect(follower).toEqual({ isLeader: false });
    expect(otherWorkspace).toEqual({ isLeader: false });
    expect(otherProject.isLeader).toBe(true);
    expect(locks.names).toEqual([
      'agent-host-log:v1:project-a:chat-1',
      'agent-host-log:v1:project-a:chat-1',
      'agent-host-log:v1:project-a:chat-1',
      'agent-host-log:v1:project-b:chat-1',
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

  it('takes over a non-terminal run after leader death and resumes it once', async () => {
    const locks = new StubLockManager();
    const options = {
      projectId: 'project-a',
      workspaceId: 'workspace-a',
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
    if (!replacement.isLeader) {
      throw new Error('Expected the follower to take over.');
    }
    const append = vi.fn();
    let state = 'running';
    const resume = vi.fn(async () => {
      append('terminal');
      state = 'completed';
      return { state: 'completed' };
    });
    await expect(
      recoverAttachedRun({
        snapshot: async () => ({ state }),
        resume,
      }),
    ).resolves.toEqual({ state: 'completed' });
    expect(resume).toHaveBeenCalledOnce();
    expect(append).toHaveBeenCalledOnce();

    replacement.release();
    await replacement.completion;
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
