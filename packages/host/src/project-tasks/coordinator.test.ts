import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectTask, ProjectTaskMessage } from '@taucad/agent-host/wire';
import { createProjectTaskCoordinator } from '#project-tasks/coordinator.js';
import { createNodeProjectTaskStore } from '#project-tasks/node-store.js';
import type { ProjectTaskBackend, ProjectTaskCaller, ProjectTaskLaunch } from '#project-tasks/backend.js';
import { formatProjectTaskMailboxMessage } from '#project-tasks/mailbox.js';
import { projectTaskMessageSchema, projectTaskMailboxLimits } from '@taucad/agent-host/wire';
import { StepClock } from '@taucad/xstate-testing/clock';
import type { ProjectTaskCoordinatorOptions } from '#project-tasks/coordinator.js';
import type { ProjectTaskCoordinator } from '#project-tasks/types.js';

const host: ProjectTaskCaller = { kind: 'host', projectId: 'project' };
const roots: string[] = [];
const coordinators: ProjectTaskCoordinator[] = [];
afterEach(async () => {
  await Promise.all(coordinators.splice(0).map(async (coordinator) => coordinator.close()));
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

const fixture = async (
  options: Readonly<{
    maxActive?: number;
    maxDepth?: number;
    allocate?: ProjectTaskBackend['allocate'];
    start?: ProjectTaskBackend['start'];
    release?: ProjectTaskBackend['release'];
    cancellationTimeout?: number;
    schedule?: ProjectTaskCoordinatorOptions['schedule'];
    materializeLineage?: ProjectTaskCoordinatorOptions['materializeLineage'];
  }> = {},
) => {
  const root = await mkdtemp(join(tmpdir(), 'tau-tasks-'));
  roots.push(root);
  const outcomes = new Map<
    string,
    ReturnType<typeof Promise.withResolvers<{ status: 'completed' | 'failed' | 'cancelled' }>>
  >();
  const backend: ProjectTaskBackend = {
    validate: vi.fn(async () => undefined),
    allocate:
      options.allocate ??
      vi.fn(async (launch: ProjectTaskLaunch) => ({
        placementId: `placement-${launch.attempt.id}`,
        checkoutId: `checkout-${launch.attempt.id}`,
      })),
    start:
      options.start ??
      vi.fn(async (launch: ProjectTaskLaunch) => {
        const outcome = Promise.withResolvers<{ status: 'completed' | 'failed' | 'cancelled' }>();
        outcomes.set(launch.attempt.id, outcome);
        return {
          runId: launch.attempt.id,
          completion: outcome.promise,
          cancel: async () => {
            outcome.resolve({ status: 'cancelled' });
          },
        };
      }),
    release: options.release ?? vi.fn(async () => undefined),
    reconcile: vi.fn(async () => undefined),
  };
  const store = await createNodeProjectTaskStore({ workspaceRoot: root, projectId: 'project' });
  const coordinator = await createProjectTaskCoordinator({ projectId: 'project', store, backend, ...options });
  coordinators.push(coordinator);
  const parent = await coordinator.admitRoot({
    requestId: 'root-request',
    chatId: 'root-chat',
    runId: 'root-run',
    title: 'Parent',
    prompt: 'Parent task',
    provider: { id: 'codex' },
    source: { revisionId: 'immutable', checkoutId: 'root-checkout' },
    toolGrant: { toolChoice: 'auto', allowedTools: ['task_spawn', 'task_send', 'read_file', 'write_file'] },
  });
  const caller = coordinator.callerFor({ chatId: parent.chatId, runId: 'root-run' });
  if (!caller) {
    throw new Error('Missing root caller');
  }
  return { root, store, backend, coordinator, parent, caller, outcomes };
};
const spawnInput = (requestId: string) => ({
  requestId,
  title: 'Child',
  prompt: 'Child task',
  provider: { id: 'codex' },
});
const attemptId = (task: ProjectTask): string => {
  const attempt = task.attempts.at(-1);
  if (!attempt) {
    throw new Error('Missing attempt');
  }
  return attempt.id;
};
const settle = async (coordinator: ProjectTaskCoordinator, taskId: string, status: string) => {
  await vi.waitFor(async () => {
    const snapshot = await coordinator.read(host, { taskId });
    expect(snapshot.tasks[0]?.attempts.at(-1)?.status).toBe(status);
  });
};

describe('durable project task authority', () => {
  it('projects child ancestry before backend allocation, repairs failed writes on duplicate replay and restart', async () => {
    let failProjection = true;
    const projected = new Set<string>();
    const materializeLineage = vi.fn(async (entry: { chatId: string; taskLineage: { rootChatId: string } }) => {
      if (failProjection) {
        throw new Error('Injected metadata write failure');
      }
      expect(entry.taskLineage.rootChatId).toBe('root-chat');
      projected.add(entry.chatId);
    });
    const allocate = vi.fn(async (launch: ProjectTaskLaunch) => {
      expect(projected.has(launch.task.chatId)).toBe(true);
      return { placementId: `placement-${launch.attempt.id}`, checkoutId: 'candidate' };
    });
    const { root, coordinator, caller, backend } = await fixture({ materializeLineage, allocate });
    await expect(coordinator.spawn(caller, spawnInput('lineage'))).rejects.toThrow('Injected metadata write failure');
    expect(allocate).not.toHaveBeenCalled();
    const admittedSnapshot = await coordinator.read(host);
    const admitted = admittedSnapshot.tasks.find((task) => task.parentTaskId);
    expect(admitted?.attempts.at(-1)?.status).toBe('allocating');
    failProjection = false;
    const replay = await coordinator.spawn(caller, spawnInput('lineage'));
    expect(replay.id).toBe(admitted?.id);
    await settle(coordinator, replay.id, 'running');
    expect(allocate).toHaveBeenCalledTimes(1);
    await coordinator.close();
    coordinators.splice(coordinators.indexOf(coordinator), 1);
    projected.clear();
    const reopened = await createNodeProjectTaskStore({ workspaceRoot: root, projectId: 'project' });
    const recovered = await createProjectTaskCoordinator({
      projectId: 'project',
      store: reopened,
      backend,
      materializeLineage,
    });
    coordinators.push(recovered);
    await recovered.recover();
    expect(projected.has(replay.chatId)).toBe(true);
    expect(allocate).toHaveBeenCalledTimes(1);
  });

  it('exposes only durable active-attempt delivery receipts and retains attempt identity on retry', async () => {
    const { coordinator, caller, parent, outcomes } = await fixture();
    const child = await coordinator.spawn(caller, spawnInput('receipt'));
    await settle(coordinator, child.id, 'running');
    const message = await coordinator.send(caller, { taskId: child.id, requestId: 'receipt-message', text: 'hello' });
    const beforeDelivery = await coordinator.read(host, { taskId: child.id });
    expect(beforeDelivery.deliveries).toEqual([]);
    await coordinator.acknowledgeDelivery({ taskId: child.id, attemptId: attemptId(child), through: message.sequence });
    const receipt = { taskId: child.id, attemptId: attemptId(child), through: message.sequence };
    const childSnapshot = await coordinator.read(host, { taskId: child.id });
    const parentSnapshot = await coordinator.read(host, { taskId: parent.id });
    expect(childSnapshot.deliveries).toEqual([receipt]);
    expect(parentSnapshot.deliveries).toEqual([]);
    await expect(coordinator.acknowledgeDelivery({ ...receipt, attemptId: 'stale' })).rejects.toMatchObject({
      code: 'TASK_FORBIDDEN',
    });
    outcomes.get(attemptId(child))?.resolve({ status: 'completed' });
    await settle(coordinator, child.id, 'completed');
    const retried = await coordinator.resume(host, { taskId: child.id, requestId: 'receipt-retry' });
    await settle(coordinator, child.id, 'running');
    const next = await coordinator.send(caller, { taskId: child.id, requestId: 'receipt-next', text: 'next' });
    await coordinator.acknowledgeDelivery({ taskId: child.id, attemptId: attemptId(retried), through: next.sequence });
    const afterRetry = await coordinator.read(host, { taskId: child.id });
    expect(afterRetry.deliveries).toEqual([
      receipt,
      { taskId: child.id, attemptId: attemptId(retried), through: next.sequence },
    ]);
  });
  it('races duplicate spawn and message append without duplicate reservation or launch', async () => {
    const { coordinator, caller, backend } = await fixture();
    const children = await Promise.all(
      Array.from({ length: 20 }, async () => coordinator.spawn(caller, spawnInput('same'))),
    );
    expect(new Set(children.map((task) => task.id)).size).toBe(1);
    const child = children[0];
    if (!child) {
      throw new Error('Missing child');
    }
    await settle(coordinator, child.id, 'running');
    expect(backend.allocate).toHaveBeenCalledTimes(1);
    expect(backend.start).toHaveBeenCalledTimes(1);
    const messages = await Promise.all(
      Array.from({ length: 20 }, async () =>
        coordinator.send(caller, { requestId: 'same-message', taskId: child.id, text: 'nonce' }),
      ),
    );
    expect(new Set(messages.map((message) => message.id)).size).toBe(1);
    await expect(coordinator.spawn(caller, { ...spawnInput('same'), prompt: 'Different' })).rejects.toMatchObject({
      code: 'TASK_REQUEST_CONFLICT',
    });
    await expect(
      coordinator.send(caller, { requestId: 'same-message', taskId: child.id, text: 'different' }),
    ).rejects.toMatchObject({ code: 'TASK_REQUEST_CONFLICT' });
  });

  it('counts waiting ancestors atomically and supports root child grandchild with depth refusal', async () => {
    const { coordinator, caller, parent } = await fixture({ maxActive: 3, maxDepth: 2 });
    const child = await coordinator.spawn(caller, spawnInput('child'));
    await settle(coordinator, child.id, 'running');
    const childCaller = coordinator.callerFor({ chatId: child.chatId, runId: attemptId(child) });
    if (!childCaller) {
      throw new Error('Missing child caller');
    }
    const grandchild = await coordinator.spawn(childCaller, spawnInput('grandchild'));
    await settle(coordinator, grandchild.id, 'running');
    expect(grandchild.depth).toBe(2);
    expect(grandchild.attempts[0]?.source).toEqual(parent.attempts[0]?.source);
    const refused = await Promise.allSettled(
      Array.from({ length: 12 }, async (_, index) => coordinator.spawn(caller, spawnInput(`overflow-${index}`))),
    );
    expect(refused.every((result) => result.status === 'rejected' && result.reason.code === 'TASK_CAPACITY')).toBe(
      true,
    );
    await coordinator.cancel(caller, { taskId: grandchild.id, requestId: 'cancel-grandchild' });
    const next = await coordinator.spawn(caller, spawnInput('next'));
    await settle(coordinator, next.id, 'running');
    await coordinator.cancel(caller, { taskId: next.id, requestId: 'cancel-next' });
    const grandchildRetry = await coordinator.resume(host, { taskId: grandchild.id, requestId: 'retry-grandchild' });
    await settle(coordinator, grandchildRetry.id, 'running');
    const grandchildCaller = coordinator.callerFor({
      chatId: grandchildRetry.chatId,
      runId: attemptId(grandchildRetry),
    });
    if (!grandchildCaller) {
      throw new Error('Missing grandchild caller');
    }
    // Free root reservation to ensure refusal proves independent depth rather than saturation.
    await coordinator.finishRoot({ taskId: parent.id, attemptId: attemptId(parent), status: 'completed' });
    await expect(coordinator.spawn(grandchildCaller, spawnInput('too-deep'))).rejects.toMatchObject({
      code: 'TASK_DEPTH',
    });
  });

  it('orders bidirectional mailbox rows and observes delivery separately from append and terminal status', async () => {
    const { coordinator, caller, parent } = await fixture();
    const child = await coordinator.spawn(caller, spawnInput('child'));
    await settle(coordinator, child.id, 'running');
    const childCaller = coordinator.callerFor({ chatId: child.chatId, runId: attemptId(child) });
    if (!childCaller) {
      throw new Error('Missing child caller');
    }
    const sent: ProjectTaskMessage[] = [];
    for (let index = 0; index < 5; index++) {
      sent.push(
        // oxlint-disable-next-line eslint/no-await-in-loop -- Ordered sends exercise the project cursor contract.
        await coordinator.send(childCaller, {
          taskId: parent.id,
          requestId: `message-${index}`,
          text: `nonce-${index}`,
        }),
      );
    }
    const first = await coordinator.read(caller, { taskId: parent.id, limit: 2 });
    const second = await coordinator.read(caller, { taskId: parent.id, after: first.nextCursor, limit: 2 });
    const third = await coordinator.read(caller, { taskId: parent.id, after: second.nextCursor, limit: 2 });
    expect([...first.messages, ...second.messages, ...third.messages]).toEqual(sent);
    expect(first.hasMore).toBe(true);
    expect(third.hasMore).toBe(false);
    expect(await coordinator.inbox({ taskId: parent.id })).toHaveLength(5);
    await coordinator.acknowledgeDelivery({
      taskId: parent.id,
      attemptId: attemptId(parent),
      through: sent[1]?.sequence ?? 0,
    });
    expect(await coordinator.inbox({ taskId: parent.id })).toHaveLength(3);
    const afterDelivery = await coordinator.read(caller);
    const wait = coordinator.wait(caller, { after: afterDelivery.cursor, timeout: 1000 });
    await coordinator.send(childCaller, { taskId: parent.id, requestId: 'wake', text: 'wake-nonce' });
    const observed = await wait;
    expect(observed.messages.at(-1)?.text).toBe('wake-nonce');
    await expect(coordinator.read(caller, { after: 999_999 })).rejects.toMatchObject({ code: 'TASK_CURSOR_AHEAD' });
  });

  it('rejects forged active identity, cross-project access, sibling access and ancestor cancellation', async () => {
    const { coordinator, caller, parent } = await fixture();
    const child = await coordinator.spawn(caller, spawnInput('child'));
    const sibling = await coordinator.spawn(caller, spawnInput('sibling'));
    await settle(coordinator, child.id, 'running');
    const childCaller = coordinator.callerFor({ chatId: child.chatId, runId: attemptId(child) });
    if (childCaller?.kind !== 'task') {
      throw new Error('Missing child caller');
    }
    await expect(coordinator.read({ ...childCaller, projectId: 'foreign' })).rejects.toMatchObject({
      code: 'TASK_FORBIDDEN',
    });
    await expect(coordinator.read({ ...childCaller, attemptId: 'fake' })).rejects.toMatchObject({
      code: 'TASK_FORBIDDEN',
    });
    await expect(
      coordinator.send(childCaller, { taskId: sibling.id, requestId: 'forged', text: 'no' }),
    ).rejects.toMatchObject({ code: 'TASK_FORBIDDEN' });
    await expect(
      coordinator.cancel(childCaller, { taskId: parent.id, requestId: 'kill-parent' }),
    ).rejects.toMatchObject({ code: 'TASK_FORBIDDEN' });
    await expect(coordinator.cancel(childCaller, { taskId: child.id, requestId: 'kill-self' })).rejects.toMatchObject({
      code: 'TASK_FORBIDDEN',
    });
    expect(coordinator.callerFor({ chatId: child.chatId, runId: attemptId(child) })).toEqual(childCaller);
    await settle(coordinator, sibling.id, 'running');
    const siblingCaller = coordinator.callerFor({ chatId: sibling.chatId, runId: attemptId(sibling) });
    if (!siblingCaller) {
      throw new Error('Missing sibling caller');
    }
    await coordinator.send(siblingCaller, {
      taskId: parent.id,
      requestId: 'sibling-private',
      text: 'Private sibling body',
    });
    await coordinator.send(childCaller, { taskId: parent.id, requestId: 'own-message', text: 'Own body' });
    const visibleParent = await coordinator.read(childCaller, { taskId: parent.id });
    expect(visibleParent.messages.map((message) => message.text)).toEqual(['Own body']);
    const grandchild = await coordinator.spawn(childCaller, spawnInput('grandchild-auth'));
    const grandchildCaller = coordinator.callerFor({ chatId: grandchild.chatId, runId: attemptId(grandchild) });
    if (!grandchildCaller) {
      throw new Error('Missing grandchild caller');
    }
    await expect(
      coordinator.send(grandchildCaller, { taskId: parent.id, requestId: 'skip-parent', text: 'No' }),
    ).rejects.toMatchObject({ code: 'TASK_FORBIDDEN' });
    await expect(
      coordinator.resume(childCaller, { taskId: parent.id, requestId: 'resume-parent' }),
    ).rejects.toMatchObject({ code: 'TASK_FORBIDDEN' });
  });

  it('compensates allocation when cancellation races start and closes the whole subtree', async () => {
    const allocated = Promise.withResolvers<void>();
    const releaseAllocate = Promise.withResolvers<void>();
    const { coordinator, caller, backend, parent } = await fixture({
      allocate: vi.fn(async (launch: ProjectTaskLaunch) => {
        allocated.resolve();
        await releaseAllocate.promise;
        return { placementId: `placement-${launch.attempt.id}`, checkoutId: 'candidate' };
      }),
    });
    const child = await coordinator.spawn(caller, spawnInput('child'));
    await allocated.promise;
    const cancelling = coordinator.cancel(host, { taskId: parent.id, requestId: 'cancel-tree' });
    await vi.waitFor(async () => {
      const cancelled = await coordinator.read(host, { taskId: child.id });
      expect(cancelled.tasks[0]?.closed).toBe(true);
    });
    releaseAllocate.resolve();
    await cancelling;
    expect(backend.start).not.toHaveBeenCalled();
    expect(backend.release).toHaveBeenCalledTimes(1);
    await settle(coordinator, child.id, 'cancelled');
    expect(coordinator.callerFor({ chatId: parent.chatId, runId: 'root-run' })).toBeUndefined();
    await expect(coordinator.resume(host, { taskId: child.id, requestId: 'resume-closed' })).rejects.toMatchObject({
      code: 'TASK_CLOSED',
    });
  });

  it('records start failure and releases its reservation for a later spawn', async () => {
    const { coordinator, caller, backend } = await fixture({
      maxActive: 2,
      start: vi.fn(async () => {
        throw new Error('Injected start failure');
      }),
    });
    const child = await coordinator.spawn(caller, spawnInput('failed'));
    await settle(coordinator, child.id, 'failed');
    expect(backend.release).toHaveBeenCalledTimes(1);
    const next = await coordinator.spawn(caller, spawnInput('after-failure'));
    await settle(coordinator, next.id, 'failed');
    expect(backend.release).toHaveBeenCalledTimes(2);
  });

  it('replays acknowledged creation/messages after restart and reconciles before interrupting', async () => {
    const { root, store, coordinator, caller, parent, backend } = await fixture();
    const message = await coordinator.send(caller, {
      taskId: parent.id,
      requestId: 'persist',
      text: 'persistent nonce',
    });
    // Model a crashed host by closing only the writer; no automatic tool replay or coordinator close.
    coordinators.splice(coordinators.indexOf(coordinator), 1);
    await store.close();
    const reopened = await createNodeProjectTaskStore({ workspaceRoot: root, projectId: 'project' });
    const recovered = await createProjectTaskCoordinator({ projectId: 'project', store: reopened, backend });
    coordinators.push(recovered);
    const beforeRecovery = await recovered.read(host);
    expect(beforeRecovery.tasks[0]?.attempts[0]?.status).toBe('running');
    await recovered.recover();
    expect(backend.reconcile).toHaveBeenCalledTimes(1);
    const afterRecovery = await recovered.read(host);
    expect(afterRecovery.tasks[0]?.attempts[0]?.status).toBe('interrupted');
    expect(await recovered.inbox({ taskId: parent.id })).toEqual([message]);
    const retried = await recovered.resume(host, { taskId: parent.id, requestId: 'retry' });
    expect(retried.chatId).toBe(parent.chatId);
    expect(retried.attempts).toHaveLength(2);
    await settle(recovered, retried.id, 'running');
  });

  it('holds one project writer and fences same-length out-of-band record corruption', async () => {
    const { root, coordinator, caller, parent } = await fixture();
    await expect(createNodeProjectTaskStore({ workspaceRoot: root, projectId: 'project' })).rejects.toMatchObject({
      code: 'WRITER_LOCKED',
    });
    const path = join(root, '.tau', 'chats', '.project-tasks', 'records.jsonl');
    const bytes = await readFile(path, 'utf8');
    await writeFile(path, bytes.replace('Parent task', 'Tamper task'));
    await expect(
      coordinator.send(caller, { taskId: parent.id, requestId: 'fenced', text: 'no' }),
    ).rejects.toMatchObject({ code: 'TASK_STORAGE_FENCED' });
    // Restore bytes so ordinary fixture cleanup can cancel and release the writer.
    await writeFile(path, bytes);
  });
  it('bounds delivered inbox bytes and leaves the remaining acknowledged rows queued', async () => {
    const { coordinator, caller, parent } = await fixture();
    await Promise.all(
      Array.from({ length: 6 }, async (_, index) =>
        coordinator.send(caller, {
          taskId: parent.id,
          requestId: `large-${index}`,
          text: 'n'.repeat(12_000),
        }),
      ),
    );
    const first = await coordinator.inbox({ taskId: parent.id });
    expect(first).toHaveLength(2);
    const renderedBytes = first.reduce(
      (total, message) => total + new TextEncoder().encode(formatProjectTaskMailboxMessage(message)).byteLength + 2,
      0,
    );
    expect(renderedBytes).toBeLessThanOrEqual(32_768);
    await coordinator.acknowledgeDelivery({
      taskId: parent.id,
      attemptId: attemptId(parent),
      through: first.at(-1)?.sequence ?? 0,
    });
    const next = await coordinator.inbox({ taskId: parent.id });
    expect(next).toHaveLength(2);
    expect(next[0]?.id).not.toBe(first[0]?.id);
    const full = await coordinator.read(caller, { taskId: parent.id });
    expect(full.messages).toHaveLength(6);
    await expect(
      coordinator.send(caller, { taskId: parent.id, requestId: 'utf8-overflow', text: '😀'.repeat(5000) }),
    ).rejects.toThrow(/byte budget/u);
  });

  it('keeps child source and tool authority tied to its admitted attempt when parent starts a later turn', async () => {
    const { coordinator, caller, parent } = await fixture();
    const child = await coordinator.spawn(caller, spawnInput('original-child'));
    await settle(coordinator, child.id, 'running');
    const childCaller = coordinator.callerFor({ chatId: child.chatId, runId: attemptId(child) });
    if (!childCaller) {
      throw new Error('Missing child caller');
    }
    await coordinator.finishRoot({ taskId: parent.id, attemptId: attemptId(parent), status: 'completed' });
    const laterRoot = await coordinator.admitRoot({
      requestId: 'later-root',
      chatId: parent.chatId,
      runId: 'later-run',
      title: 'Later parent',
      prompt: 'Later parent task',
      provider: { id: 'codex' },
      source: { revisionId: 'later-revision', checkoutId: 'root-checkout' },
      toolGrant: { toolChoice: 'none', allowedTools: [] },
    });
    expect(laterRoot.id).toBe(parent.id);
    expect(laterRoot.attempts).toHaveLength(2);
    const grandchild = await coordinator.spawn(childCaller, spawnInput('original-grandchild'));
    expect(grandchild.attempts[0]?.source).toEqual(child.attempts[0]?.source);
    expect(grandchild.attempts[0]?.toolGrant).toEqual(child.attempts[0]?.toolGrant);
    expect(laterRoot.attempts.at(-1)?.toolGrant).toEqual({ toolChoice: 'none', allowedTools: [] });
  });
  it('rebinds native continuation to the recorded grant without dispatching a second backend turn', async () => {
    const { coordinator, parent, backend } = await fixture();
    const same = await coordinator.admitContinuation({
      chatId: parent.chatId,
      runId: 'root-run',
      requestId: 'approval-resume',
    });
    expect(attemptId(same)).toBe(attemptId(parent));
    await coordinator.finishRoot({ taskId: parent.id, attemptId: attemptId(parent), status: 'failed' });
    const resumed = await coordinator.admitContinuation({
      chatId: parent.chatId,
      runId: 'root-run',
      requestId: 'restart-resume',
    });
    expect(resumed.id).toBe(parent.id);
    expect(resumed.attempts).toHaveLength(2);
    expect(resumed.attempts.at(-1)?.toolGrant).toEqual(parent.attempts[0]?.toolGrant);
    expect(resumed.attempts.at(-1)?.source).toEqual(parent.attempts[0]?.source);
    expect(coordinator.callerFor({ chatId: parent.chatId, runId: 'root-run' })).toMatchObject({
      taskId: parent.id,
      attemptId: attemptId(resumed),
    });
    expect(backend.start).not.toHaveBeenCalled();
    expect(backend.allocate).not.toHaveBeenCalled();
    await expect(
      coordinator.admitContinuation({ chatId: 'legacy-chat', runId: 'legacy-run', requestId: 'legacy' }),
    ).rejects.toMatchObject({ code: 'TASK_NOT_FOUND' });
    await expect(
      coordinator.admitContinuation({ chatId: parent.chatId, runId: 'foreign-run', requestId: 'forged' }),
    ).rejects.toMatchObject({ code: 'TASK_FORBIDDEN' });
  });
  it('keeps a failed release reserved until actual release recovery succeeds, including duplicate cancellation', async () => {
    let releaseFails = true;
    let resourceOwned = true;
    const release = vi.fn(async () => {
      if (releaseFails) {
        throw new Error('Injected release failure');
      }
      resourceOwned = false;
    });
    const { coordinator, caller, backend, outcomes } = await fixture({ maxActive: 2, release });
    const child = await coordinator.spawn(caller, spawnInput('release-child'));
    await settle(coordinator, child.id, 'running');
    outcomes.get(attemptId(child))?.resolve({ status: 'completed' });
    await settle(coordinator, child.id, 'cancelling');
    await expect(coordinator.spawn(caller, spawnInput('still-full'))).rejects.toMatchObject({ code: 'TASK_CAPACITY' });
    // Failed dispatch does not imply durable reservation release; this is the model's Failed projection.
    const failed = await coordinator.read(host, { taskId: child.id });
    expect({
      resource: resourceOwned,
      reservation: failed.tasks[0]?.attempts.at(-1)?.status === 'cancelling',
      settled: !resourceOwned,
    }).toEqual({ resource: true, reservation: true, settled: false });
    await expect(coordinator.recover()).rejects.toThrow('Injected release failure');
    await settle(coordinator, child.id, 'cancelling');
    await expect(coordinator.cancel(host, { taskId: child.id, requestId: 'release-cancel' })).rejects.toThrow(
      'Injected release failure',
    );
    releaseFails = false;
    await coordinator.cancel(host, { taskId: child.id, requestId: 'release-cancel' });
    await settle(coordinator, child.id, 'cancelled');
    expect(backend.release).toHaveBeenCalledTimes(4);
    expect(resourceOwned).toBe(false);
  });

  it.each(['allocation', 'completion'])(
    'bounds stalled %s cancellation and close while keeping uncertain resources durable',
    async (stage) => {
      const clock = new StepClock();
      const entered = Promise.withResolvers<void>();
      const unblock = Promise.withResolvers<void>();
      const completed = Promise.withResolvers<{ status: 'cancelled' }>();
      const { coordinator, caller } = await fixture({
        maxActive: 2,
        cancellationTimeout: 10,
        schedule: (callback, waitDelay) => {
          const timer = clock.setTimeout(callback, waitDelay);
          return () => {
            clock.clearTimeout(timer);
          };
        },
        allocate: vi.fn(async (launch: ProjectTaskLaunch) => {
          if (stage === 'allocation') {
            entered.resolve();
            await unblock.promise;
          }
          return { placementId: `placement-${launch.attempt.id}`, checkoutId: 'candidate' };
        }),
        start: vi.fn(async (launch: ProjectTaskLaunch) => {
          entered.resolve();
          return { runId: launch.attempt.id, completion: completed.promise, cancel: async () => undefined };
        }),
      });
      const child = await coordinator.spawn(caller, spawnInput(`stuck-${stage}`));
      await entered.promise;
      const cancellation = expect(
        coordinator.cancel(caller, { taskId: child.id, requestId: `cancel-${stage}` }),
      ).rejects.toMatchObject({ code: 'TASK_BUSY' });
      await vi.waitFor(() => {
        expect(clock.nextDue()).toBeDefined();
      });
      clock.increment(10);
      await cancellation;
      await settle(coordinator, child.id, 'cancelling');
      await expect(coordinator.spawn(caller, spawnInput('blocked'))).rejects.toMatchObject({ code: 'TASK_CAPACITY' });
      const closing = expect(coordinator.close()).rejects.toMatchObject({ code: 'TASK_BUSY' });
      await vi.waitFor(() => {
        expect(clock.nextDue()).toBeDefined();
      });
      clock.increment(10);
      await closing;
      const uncertain = await coordinator.read(host, { taskId: child.id });
      expect(uncertain.tasks[0]?.attempts.at(-1)?.status).toBe('cancelling');
      unblock.resolve();
      completed.resolve({ status: 'cancelled' });
      await settle(coordinator, child.id, 'cancelled');
      await coordinator.close();
    },
  );
  it('preserves native continuation after lifecycle close while explicit task cancellation closes the subtree', async () => {
    const { root, coordinator, parent, backend } = await fixture();
    await coordinator.close();
    coordinators.splice(coordinators.indexOf(coordinator), 1);
    const reopened = await createNodeProjectTaskStore({ workspaceRoot: root, projectId: 'project' });
    const continued = await createProjectTaskCoordinator({ projectId: 'project', store: reopened, backend });
    coordinators.push(continued);
    const resumed = await continued.admitContinuation({
      chatId: parent.chatId,
      runId: 'root-run',
      requestId: 'closed-host-resume',
    });
    expect(resumed.closed).toBe(false);
    expect(resumed.attempts).toHaveLength(2);
    await continued.cancel(host, { taskId: parent.id, requestId: 'explicit-cancel' });
    await expect(
      continued.admitContinuation({ chatId: parent.chatId, runId: 'root-run', requestId: 'closed-task-resume' }),
    ).rejects.toMatchObject({ code: 'TASK_CLOSED' });
  });
  it('delivers valid escaped-control heads and the following nonce under actual rendered prompt bounds', async () => {
    const { coordinator, caller, parent } = await fixture();
    const escaped = await coordinator.send(caller, {
      taskId: parent.id,
      requestId: 'escaped-head',
      text: '\u0000'.repeat(6000),
    });
    const nonce = await coordinator.send(caller, {
      taskId: parent.id,
      requestId: 'following-nonce',
      text: 'later-nonce',
    });
    expect(new TextEncoder().encode(JSON.stringify(escaped)).byteLength).toBeGreaterThan(
      projectTaskMailboxLimits.maxBytes,
    );
    const batch = await coordinator.inbox({ taskId: parent.id });
    expect(batch.map((message) => message.id)).toEqual([escaped.id, nonce.id]);
    expect(
      batch.reduce(
        (total, message) => total + new TextEncoder().encode(formatProjectTaskMailboxMessage(message)).byteLength + 2,
        0,
      ),
    ).toBeLessThanOrEqual(projectTaskMailboxLimits.maxBytes);
    await coordinator.acknowledgeDelivery({ taskId: parent.id, attemptId: attemptId(parent), through: nonce.sequence });
    expect(await coordinator.inbox({ taskId: parent.id })).toEqual([]);
    const longestAccepted = projectTaskMessageSchema.parse({
      id: 'i'.repeat(128),
      projectId: 'p'.repeat(128),
      senderTaskId: 's'.repeat(128),
      recipientTaskId: 't'.repeat(128),
      requestId: 'r'.repeat(128),
      sequence: Number.MAX_SAFE_INTEGER,
      createdAt: 0,
      text: '\n'.repeat(projectTaskMailboxLimits.maxTextBytes),
    });
    expect(new TextEncoder().encode(formatProjectTaskMailboxMessage(longestAccepted)).byteLength + 2).toBeLessThan(
      projectTaskMailboxLimits.maxBytes,
    );
  });
});
