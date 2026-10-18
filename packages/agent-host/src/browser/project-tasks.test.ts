import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';

import { browserProjectTasks } from '#browser/project-tasks.js';
import { createProjectOwnedBrowserChatStore } from '#browser/project-chat-store.js';
import { memoryFileSystem } from '#browser/leadership.fixture.js';
import type { AgentChannelSource } from '#launchers/agent-channel.js';
import { chatStoreBinding } from '#launchers/chat-store.js';
import type { LeadershipHost } from '#launchers/chat-store.js';
import { chatLeadershipNames } from '#launchers/leadership/names.js';
import type { ProjectTaskOwner, ProjectTaskOwnerInput } from '#launchers/project-task-platform.js';
import type { EventLogAppender } from '#log/event-log-appender.js';

const encoder = new TextEncoder();
const journalPath = '.tau/chats/.project-tasks/records.jsonl';
const owners: ProjectTaskOwner[] = [];
const channels: BroadcastChannel[] = [];

const until = async (condition: () => boolean | Promise<boolean>, timeout = 6000): Promise<void> => {
  const deadline = performance.now() + timeout;
  // oxlint-disable-next-line no-await-in-loop -- bounded polling observes an asynchronous channel or retry.
  while (!(await condition())) {
    if (performance.now() >= deadline) {
      throw new Error('Project task condition did not become true.');
    }
    // oxlint-disable-next-line no-await-in-loop -- bounded polling observes an asynchronous channel or retry.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 25);
    });
  }
};

afterEach(async () => {
  vi.useRealTimers();
  for (const channel of channels.splice(0)) {
    channel.close();
  }
  for (const owner of owners.splice(0)) {
    // oxlint-disable-next-line no-await-in-loop -- close followers before the leader can release its lock.
    await owner.close();
  }
});

const createOwner = (
  request: ProjectTaskOwner['projectTasks']['request'] = async () => ({
    kind: 'refused',
    code: 'TASK_UNAVAILABLE',
    message: 'fixture',
  }),
) => {
  const requestMock = vi.fn(request);
  const source = mockDeep<AgentChannelSource>();
  source.execute.mockResolvedValue({
    commandId: 'attach-1',
    generation: 1,
    status: 'applied',
    effect: 'not-applied',
    details: {},
  });
  const create = vi.fn(async ({ storage }: ProjectTaskOwnerInput): Promise<ProjectTaskOwner> => {
    const bytes = new TextDecoder().decode(await storage.read()).trim();
    const previous = bytes === '' ? 0 : (JSON.parse(bytes.split('\n').at(-1)!) as { sequence: number }).sequence;
    await storage.append(
      encoder.encode(`${JSON.stringify({ version: 1, projectId: 'project-1', sequence: previous + 1, tasks: [] })}\n`),
    );
    const owner: ProjectTaskOwner = {
      source,
      projectTasks: { request: requestMock },
      stoppability: () => 'stoppable',
      drain: async () => undefined,
      close: async () => storage.close(),
    };
    return owner;
  });
  return { create, source, request: requestMock };
};

describe('browserProjectTasks', () => {
  it('should reconcile behind a released legacy chat lock in the same project owner', async () => {
    const fileSystem = memoryFileSystem();
    const chatId = 'legacy-release';
    const lockName = chatLeadershipNames('project-1', chatId).lock;
    const legacyHeld = Promise.withResolvers<void>();
    const releaseLegacy = Promise.withResolvers<void>();
    const legacy = navigator.locks.request(lockName, async () => {
      legacyHeld.resolve();
      await releaseLegacy.promise;
    });
    await legacyHeld.promise;
    const ownership = new AbortController();
    const chats = createProjectOwnedBrowserChatStore(
      'project-1',
      { projectId: 'project-1', tabId: 'project-owner', build: 'build-1', log: { kind: 'provider', fileSystem } },
      () => !ownership.signal.aborted,
      ownership.signal,
    );
    const binding = chatStoreBinding(chats);
    let writer: EventLogAppender | undefined;
    const host = mockDeep<LeadershipHost>();
    host.claim.mockImplementation(async () => {
      try {
        writer ??= await binding.openWriter(chatId);
        return undefined;
      } catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error) {
          return String(error.code);
        }
        throw error;
      }
    });
    const leadership = binding.leadership(host);
    try {
      leadership.reconcile(chatId, { wait: true });
      await until(() => host.claim.mock.calls.length === 1);
      expect(writer).toBeUndefined();
      await until(async () => {
        const locks = await navigator.locks.query();
        return locks.pending?.some((lock) => lock.name === lockName) === true;
      });
      releaseLegacy.resolve();
      await legacy;
      await until(() => writer !== undefined);
      expect(host.claim).toHaveBeenCalledTimes(2);
      expect(ownership.signal.aborted).toBe(false);
    } finally {
      releaseLegacy.resolve();
      ownership.abort();
      await leadership.close();
      await writer?.close();
      await legacy;
    }
  });

  it('should defer legacy chat reconciliation while hidden and resume when shown', async () => {
    const fileSystem = memoryFileSystem();
    const chatId = 'legacy-hidden';
    const lockName = chatLeadershipNames('project-1', chatId).lock;
    const legacyHeld = Promise.withResolvers<void>();
    const releaseLegacy = Promise.withResolvers<void>();
    const legacy = navigator.locks.request(lockName, async () => {
      legacyHeld.resolve();
      await releaseLegacy.promise;
    });
    await legacyHeld.promise;
    let shown = false;
    const listeners = new Set<(shown: boolean) => void>();
    const visibility = {
      visible: () => shown,
      subscribe: (listener: (visible: boolean) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const ownership = new AbortController();
    const chats = createProjectOwnedBrowserChatStore(
      'project-1',
      {
        projectId: 'project-1',
        tabId: 'project-owner-hidden',
        build: 'build-1',
        log: { kind: 'provider', fileSystem },
        visibility,
      },
      () => !ownership.signal.aborted,
      ownership.signal,
    );
    const binding = chatStoreBinding(chats);
    let writer: EventLogAppender | undefined;
    const host = mockDeep<LeadershipHost>();
    host.claim.mockImplementation(async () => {
      try {
        writer ??= await binding.openWriter(chatId);
        return undefined;
      } catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error) {
          return String(error.code);
        }
        throw error;
      }
    });
    const leadership = binding.leadership(host);
    const show = (value: boolean): void => {
      shown = value;
      for (const listener of listeners) {
        listener(value);
      }
    };
    try {
      leadership.reconcile(chatId, { wait: true });
      expect(host.claim).not.toHaveBeenCalled();
      show(true);
      await until(() => host.claim.mock.calls.length === 1);
      show(false);
      await until(async () => {
        const locks = await navigator.locks.query();
        return !locks.pending?.some((lock) => lock.name === lockName);
      });
      releaseLegacy.resolve();
      await legacy;
      expect(writer).toBeUndefined();
      show(true);
      await until(() => writer !== undefined);
      expect(host.claim).toHaveBeenCalledTimes(2);
    } finally {
      releaseLegacy.resolve();
      ownership.abort();
      await leadership.close();
      await writer?.close();
      await legacy;
    }
  });

  it('should preserve a native writer marker while taking a project chat lock', async () => {
    const fileSystem = memoryFileSystem();
    const marker = '.tau/chats/chat-1/events.jsonl.lock';
    await fileSystem.writeFile(marker, '1234\n/native/project/.tau/chats/chat-1/events.jsonl\n');
    const chats = createProjectOwnedBrowserChatStore(
      'project-1',
      {
        projectId: 'project-1',
        tabId: 'browser',
        build: 'build-1',
        log: { kind: 'provider', fileSystem },
      },
      () => true,
    );
    await expect(chatStoreBinding(chats).openWriter('chat-1')).rejects.toMatchObject({ code: 'WRITER_LOCKED' });
    expect(new TextDecoder().decode(fileSystem.files.get(marker))).toContain('/native/project/');
    await fileSystem.writeFile(marker, `${Date.now()}\n`);
    const writer = await chatStoreBinding(chats).openWriter('chat-1');
    await writer.close();
  });

  it('should publish one owner only after its durable term claim and forward the task channel to it', async () => {
    const fileSystem = memoryFileSystem();
    const gate = Promise.withResolvers<void>();
    const first = createOwner();
    const leader = browserProjectTasks({ tabId: 'leader', build: 'build-1', log: { kind: 'provider', fileSystem } });
    const opening = leader.open({
      projectId: 'project-1',
      createOwner: async (input) => {
        await gate.promise;
        return first.create(input);
      },
    });
    const follower = browserProjectTasks({
      tabId: 'follower',
      build: 'build-1',
      log: { kind: 'provider', fileSystem },
    });
    const attached = await follower.open({
      projectId: 'project-1',
      createOwner: async () => expect.fail('follower claimed'),
    });
    owners.push(attached);
    const requested = attached.projectTasks.request({ operation: 'read', input: { after: 0, limit: 1 } });
    expect(fileSystem.files.has(journalPath)).toBe(false);
    expect(first.request).not.toHaveBeenCalled();

    gate.resolve();
    const opened = await opening;
    owners.push(opened);
    await expect(requested).resolves.toEqual({ kind: 'refused', code: 'TASK_UNAVAILABLE', message: 'fixture' });
    expect(first.create).toHaveBeenCalledOnce();
    expect(first.request).toHaveBeenCalledOnce();
    const rows = new TextDecoder().decode(fileSystem.files.get(journalPath)).trim().split('\n');
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!)).toEqual({ version: 1, projectId: 'project-1', sequence: 1, tasks: [] });
  });

  it('should end follower waits promptly on cancellation and close before an owner is ready', async () => {
    const fileSystem = memoryFileSystem();
    const gate = Promise.withResolvers<void>();
    const first = createOwner();
    const opening = browserProjectTasks({
      tabId: 'leader-not-ready',
      build: 'build-1',
      log: { kind: 'provider', fileSystem },
    }).open({
      projectId: 'project-1',
      createOwner: async (input) => {
        await gate.promise;
        return first.create(input);
      },
    });
    const follower = await browserProjectTasks({
      tabId: 'follower-not-ready',
      build: 'build-1',
      log: { kind: 'provider', fileSystem },
    }).open({ projectId: 'project-1', createOwner: async () => expect.fail('follower claimed') });
    const abort = new AbortController();
    const cancelled = follower.projectTasks.request({ operation: 'read', input: { limit: 1 } }, abort.signal);
    abort.abort();
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });

    const pending = follower.source.host.ledger('chat-1');
    await follower.close();
    await expect(pending).rejects.toMatchObject({ code: 'HOST_CLOSED' });
    gate.resolve();
    owners.push(await opening);
  });

  it('should keep a healthy forwarded projection pending beyond ten seconds', async () => {
    const fileSystem = memoryFileSystem();
    const first = createOwner();
    const leader = await browserProjectTasks({
      tabId: 'leader-long',
      build: 'build-1',
      log: { kind: 'provider', fileSystem },
    }).open({ projectId: 'project-1', createOwner: first.create });
    owners.push(leader);
    const follower = await browserProjectTasks({
      tabId: 'follower-long',
      build: 'build-1',
      log: { kind: 'provider', fileSystem },
    }).open({ projectId: 'project-1', createOwner: async () => expect.fail('follower claimed') });
    owners.unshift(follower);
    first.source.host.waitForAdmission.mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 11_500);
      });
      return undefined;
    });
    const result = follower.source.host.waitForAdmission('chat-1');
    const observed = vi.fn();
    const observation = (async (): Promise<void> => {
      await result;
      observed();
    })();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 10_500);
    });
    expect(observed).not.toHaveBeenCalled();
    await observation;
    await expect(result).resolves.toBeUndefined();
    expect(first.source.host.waitForAdmission).toHaveBeenCalledWith('chat-1', undefined);
  }, 20_000);

  it('should re-send an unanswered keyed execute to the next project term', async () => {
    const fileSystem = memoryFileSystem();
    const first = createOwner();
    const addressed = Promise.withResolvers<void>();
    const unanswered = Promise.withResolvers<Awaited<ReturnType<AgentChannelSource['execute']>>>();
    first.source.execute.mockImplementation(async () => {
      addressed.resolve();
      return unanswered.promise;
    });
    const leader = await browserProjectTasks({
      tabId: 'leader-replay',
      build: 'build-1',
      log: { kind: 'provider', fileSystem },
    }).open({ projectId: 'project-1', createOwner: first.create });
    owners.push(leader);
    const second = createOwner();
    second.source.execute.mockResolvedValue({
      commandId: 'cancel-replay',
      generation: 2,
      status: 'replayed',
      effect: 'durable',
      cursor: 0,
    });
    const follower = await browserProjectTasks({
      tabId: 'follower-replay',
      build: 'build-1',
      log: { kind: 'provider', fileSystem },
    }).open({ projectId: 'project-1', createOwner: second.create });
    owners.unshift(follower);
    const command = {
      type: 'cancel',
      commandId: 'cancel-replay',
      payload: { chatId: 'chat-1', runId: 'run-1' },
    } as const;
    const answer = follower.source.execute(command);
    await addressed.promise;
    await leader.close();

    await expect(answer).resolves.toMatchObject({ commandId: command.commandId, status: 'replayed' });
    expect(first.source.execute).toHaveBeenCalledWith(command);
    expect(second.source.execute).toHaveBeenCalledWith(command);
    expect(second.source.execute).toHaveBeenCalledOnce();
    const terms = new TextDecoder()
      .decode(fileSystem.files.get(journalPath))
      .trim()
      .split('\n')
      .map((row) => (JSON.parse(row) as { sequence: number }).sequence);
    expect(terms).toEqual([1, 2]);
  }, 10_000);

  it('should not re-send an owner error that already answered a keyed execute', async () => {
    const fileSystem = memoryFileSystem();
    const first = createOwner();
    first.source.execute.mockRejectedValue(Object.assign(new Error('owner refused'), { code: 'PEER_UNRESPONSIVE' }));
    const leader = await browserProjectTasks({
      tabId: 'leader-replied',
      build: 'build-1',
      log: { kind: 'provider', fileSystem },
    }).open({ projectId: 'project-1', createOwner: first.create });
    owners.push(leader);
    const follower = await browserProjectTasks({
      tabId: 'follower-replied',
      build: 'build-1',
      log: { kind: 'provider', fileSystem },
    }).open({ projectId: 'project-1', createOwner: async () => expect.fail('follower claimed') });
    owners.unshift(follower);

    await expect(
      follower.source.execute({ type: 'attach', commandId: 'attach-replied', payload: { chatId: 'chat-1' } }),
    ).rejects.toMatchObject({ code: 'PEER_UNRESPONSIVE', message: 'owner refused' });
    expect(first.source.execute).toHaveBeenCalledOnce();
  });

  it('should not re-send a task request when its addressed term disappears', async () => {
    const fileSystem = memoryFileSystem();
    const addressed = Promise.withResolvers<void>();
    const unanswered = Promise.withResolvers<Awaited<ReturnType<ProjectTaskOwner['projectTasks']['request']>>>();
    const first = createOwner(async () => {
      addressed.resolve();
      return unanswered.promise;
    });
    const leader = await browserProjectTasks({
      tabId: 'leader-task-loss',
      build: 'build-1',
      log: { kind: 'provider', fileSystem },
    }).open({ projectId: 'project-1', createOwner: first.create });
    owners.push(leader);
    const second = createOwner();
    const follower = await browserProjectTasks({
      tabId: 'follower-task-loss',
      build: 'build-1',
      log: { kind: 'provider', fileSystem },
    }).open({ projectId: 'project-1', createOwner: second.create });
    owners.unshift(follower);
    const answer = follower.projectTasks.request({
      operation: 'cancel',
      input: { taskId: 'task-1', requestId: 'cancel-once' },
    });
    await addressed.promise;
    await leader.close();

    await expect(answer).rejects.toMatchObject({ code: 'PEER_UNRESPONSIVE' });
    await until(() => second.create.mock.calls.length === 1);
    expect(second.request).not.toHaveBeenCalled();
  }, 10_000);

  it('should cancel an aborted follower request at the owner without appending a task row', async () => {
    const fileSystem = memoryFileSystem();
    const started = Promise.withResolvers<void>();
    const cancelled = Promise.withResolvers<void>();
    const request = vi.fn(
      async (_input: Parameters<ProjectTaskOwner['projectTasks']['request']>[0], signal?: AbortSignal) => {
        await new Promise<never>((_resolve, reject) => {
          started.resolve();
          signal?.addEventListener(
            'abort',
            () => {
              cancelled.resolve();
              reject(new DOMException('cancelled', 'AbortError'));
            },
            { once: true },
          );
        });
        return { kind: 'refused', code: 'TASK_UNAVAILABLE', message: 'fixture' } as const;
      },
    );
    const first = createOwner(request);
    const leader = await browserProjectTasks({
      tabId: 'leader-cancel',
      build: 'build-1',
      log: { kind: 'provider', fileSystem },
    }).open({ projectId: 'project-1', createOwner: first.create });
    owners.push(leader);
    const follower = await browserProjectTasks({
      tabId: 'follower-cancel',
      build: 'build-1',
      log: { kind: 'provider', fileSystem },
    }).open({ projectId: 'project-1', createOwner: async () => expect.fail('follower claimed') });
    owners.unshift(follower);
    const abort = new AbortController();
    const answer = follower.projectTasks.request({ operation: 'read', input: { after: 0, limit: 1 } }, abort.signal);
    await started.promise;
    abort.abort();
    await expect(answer).rejects.toMatchObject({ name: 'AbortError' });
    await cancelled.promise;
    expect(request).toHaveBeenCalledOnce();
    expect(new TextDecoder().decode(fileSystem.files.get(journalPath)).trim().split('\n')).toHaveLength(1);
  });

  it('should retain the project lock after a failed close and allow a new owner only after retry', async () => {
    const fileSystem = memoryFileSystem();
    const first = createOwner();
    let closeAttempts = 0;
    const leader = await browserProjectTasks({
      tabId: 'leader-close',
      build: 'build-1',
      log: { kind: 'provider', fileSystem },
    }).open({
      projectId: 'project-1',
      createOwner: async (input) => {
        const actual = await first.create(input);
        return {
          ...actual,
          close: async () => {
            closeAttempts += 1;
            if (closeAttempts === 1) {
              throw new Error('close failed before storage release');
            }
            await actual.close();
          },
        };
      },
    });
    owners.push(leader);
    const second = createOwner();
    const follower = await browserProjectTasks({
      tabId: 'follower-close',
      build: 'build-1',
      log: { kind: 'provider', fileSystem },
    }).open({ projectId: 'project-1', createOwner: second.create });
    owners.unshift(follower);
    await expect(leader.close()).rejects.toThrow('close failed before storage release');
    expect(second.create).not.toHaveBeenCalled();
    await leader.close();
    await until(() => second.create.mock.calls.length === 1);
    const rows = new TextDecoder()
      .decode(fileSystem.files.get(journalPath))
      .trim()
      .split('\n')
      .map((row) => JSON.parse(row) as { sequence: number });
    expect(rows.map((row) => row.sequence)).toEqual([1, 2]);
  }, 10_000);

  it('should leave a hidden follower idle and claim when shown after owner release', async () => {
    const fileSystem = memoryFileSystem();
    const first = createOwner();
    const leader = await browserProjectTasks({
      tabId: 'leader-visibility',
      build: 'build-1',
      log: { kind: 'provider', fileSystem },
    }).open({ projectId: 'project-1', createOwner: first.create });
    owners.push(leader);
    let visible = false;
    const listeners = new Set<(shown: boolean) => void>();
    const second = createOwner();
    const follower = await browserProjectTasks({
      tabId: 'follower-visibility',
      build: 'build-1',
      log: { kind: 'provider', fileSystem },
      visibility: {
        visible: () => visible,
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
    }).open({ projectId: 'project-1', createOwner: second.create });
    owners.unshift(follower);
    await leader.close();
    expect(second.create).not.toHaveBeenCalled();
    const before = new TextDecoder().decode(fileSystem.files.get(journalPath)).trim().split('\n');
    expect(before).toHaveLength(1);

    visible = true;
    for (const listener of listeners) {
      listener(true);
    }
    await until(() => second.create.mock.calls.length === 1);
    const terms = new TextDecoder()
      .decode(fileSystem.files.get(journalPath))
      .trim()
      .split('\n')
      .map((row) => (JSON.parse(row) as { sequence: number }).sequence);
    expect(terms).toEqual([1, 2]);
    await follower.close();
    expect(listeners.size).toBe(0);
  }, 10_000);

  it('should refuse an incompatible build and ignore stale-term requests and replies', async () => {
    const fileSystem = memoryFileSystem();
    const started = Promise.withResolvers<void>();
    const finish = Promise.withResolvers<{ kind: 'refused'; code: 'TASK_UNAVAILABLE'; message: string }>();
    const request = vi.fn(async () => {
      started.resolve();
      return finish.promise;
    });
    const first = createOwner(request);
    const leader = await browserProjectTasks({
      tabId: 'leader-stale',
      build: 'build-1',
      log: { kind: 'provider', fileSystem },
    }).open({ projectId: 'project-1', createOwner: first.create });
    owners.push(leader);
    const wrongBuild = await browserProjectTasks({
      tabId: 'wrong-build',
      build: 'build-2',
      log: { kind: 'provider', fileSystem },
    }).open({ projectId: 'project-1', createOwner: async () => expect.fail('wrong build claimed') });
    owners.unshift(wrongBuild);
    await expect(
      wrongBuild.projectTasks.request({ operation: 'read', input: { after: 0, limit: 1 } }),
    ).rejects.toMatchObject({ code: 'LEADER_VERSION_MISMATCH' });

    const follower = await browserProjectTasks({
      tabId: 'follower-stale',
      build: 'build-1',
      log: { kind: 'provider', fileSystem },
    }).open({ projectId: 'project-1', createOwner: async () => expect.fail('follower claimed') });
    owners.unshift(follower);
    const attacker = new BroadcastChannel('agent-host-project:project-1');
    channels.push(attacker);
    attacker.postMessage({
      projectId: 'project-1',
      sender: 'old-owner',
      build: 'build-1',
      term: 0,
      kind: 'call',
      id: 'old:1',
      to: 'leader-stale',
      operation: 'projectTasks',
      input: { operation: 'read', input: { after: 0, limit: 1 } },
    });
    const answer = follower.projectTasks.request({ operation: 'read', input: { after: 0, limit: 1 } });
    await started.promise;
    let settled = false;
    const observation = (async (): Promise<void> => {
      await answer;
      settled = true;
    })();
    attacker.postMessage({
      projectId: 'project-1',
      sender: 'leader-stale',
      build: 'build-1',
      term: 0,
      kind: 'reply',
      id: 'follower-stale:1',
      to: 'follower-stale',
      value: { kind: 'refused', code: 'TASK_UNAVAILABLE', message: 'stale' },
    });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 100);
    });
    expect(settled).toBe(false);
    expect(request).toHaveBeenCalledOnce();
    finish.resolve({ kind: 'refused', code: 'TASK_UNAVAILABLE', message: 'real' });
    await observation;
    await expect(answer).resolves.toMatchObject({ message: 'real' });
  });
});
