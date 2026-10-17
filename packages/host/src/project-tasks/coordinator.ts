import { toPromise } from 'xstate';
import { randomUuid } from '@taucad/utils/id';
import {
  projectTaskMailboxLimits,
  projectTaskActionSchema,
  projectTaskReadSchema,
  projectTaskSendSchema,
  projectTaskSpawnSchema,
  projectTaskWaitSchema,
  projectTaskSchema,
} from '@taucad/agent-host/wire';
import type {
  ProjectTask,
  ProjectTaskAttempt,
  ProjectTaskMessage,
  ProjectTaskAction,
  ProjectTaskStatus,
  ProjectTaskChatLineage,
} from '@taucad/agent-host/wire';
import type {
  ProjectTaskAllocation,
  ProjectTaskBackend,
  ProjectTaskCaller,
  ProjectTaskExecution,
  ProjectTaskRootAdmission,
} from '#project-tasks/backend.js';
import { formatProjectTaskMailboxMessage } from '#project-tasks/mailbox.js';
import { ProjectTaskError } from '#project-tasks/store.js';
import { createProjectTaskDispatch } from '#project-tasks/dispatch.js';
import type { ProjectTaskDispatchActor } from '#project-tasks/dispatch.js';
import type { ProjectTaskChange, ProjectTaskStore, ProjectTaskStoreView } from '#project-tasks/store.js';
import type { ProjectTaskCoordinator, ProjectTaskSnapshot } from '#project-tasks/types.js';

/** Milliseconds before cancellation reports pending resource settlement; the durable reservation remains held. @internal */
export const projectTaskCancellationTimeout = 10_000;

const activeStatuses: ReadonlySet<ProjectTaskStatus> = new Set(['allocating', 'running', 'cancelling']);
const latest = (task: ProjectTask): ProjectTaskAttempt => {
  const attempt = task.attempts.at(-1);
  if (!attempt) {
    throw new ProjectTaskError('TASK_STORAGE_INVALID', 'Task has no attempt.');
  }
  return attempt;
};
const withAttempt = (task: ProjectTask, attempt: ProjectTaskAttempt): ProjectTask => ({
  ...task,
  attempts: [...task.attempts.slice(0, -1), attempt],
});
const requestKey = (caller: ProjectTaskCaller, verb: string, requestId: string): string =>
  JSON.stringify([caller.kind === 'task' ? caller.taskId : 'host', verb, requestId]);
const fingerprint = (input: unknown): string => JSON.stringify(input);
const related = (tasks: ReadonlyMap<string, ProjectTask>, ancestor: string, descendant: string): boolean => {
  let task = tasks.get(descendant);
  const seen = new Set<string>();
  while (task && !seen.has(task.id)) {
    if (task.id === ancestor) {
      return true;
    }
    seen.add(task.id);
    task = task.parentTaskId ? tasks.get(task.parentTaskId) : undefined;
  }
  return false;
};

/** Task coordinator construction binds one project journal and the existing execution/revision owners. @internal */
export type ProjectTaskCoordinatorOptions = Readonly<{
  projectId: string;
  store: ProjectTaskStore;
  backend: ProjectTaskBackend;
  maxActive?: number;
  maxDepth?: number;
  id?: () => string;
  now?: () => number;
  /** Milliseconds before a cancellation reports still-settling instead of blocking its caller. */
  cancellationTimeout?: number;
  /** Deterministic timer port; return the cancellation of the scheduled callback. */
  schedule?: (callback: () => void, waitDelay: number) => () => void;
  /** Checked child-chat metadata projection, completed before any child launch. */
  materializeLineage?: (entry: ProjectTaskChatLineage, task: ProjectTask) => Promise<void>;
}>;

/**
 * Build host-owned durable admission and mailbox operations, without another provider/model scheduler.
 *
 * @param options - Project authority, protected writer and existing backend owners.
 * @returns The task command surface. Call recover before admitting turns after reopening.
 * @internal
 */
export const createProjectTaskCoordinator = async (
  options: ProjectTaskCoordinatorOptions,
): Promise<ProjectTaskCoordinator> => {
  const { projectId, store, backend } = options;
  const maxActive = options.maxActive ?? 8;
  const maxDepth = options.maxDepth ?? 4;
  const id = options.id ?? randomUuid;
  const now = options.now ?? Date.now;
  const cancellationTimeout = options.cancellationTimeout ?? projectTaskCancellationTimeout;
  const schedule =
    options.schedule ??
    ((callback: () => void, waitDelay: number): (() => void) => {
      const timer = setTimeout(callback, waitDelay);
      return () => {
        clearTimeout(timer);
      };
    });
  if (
    store.projectId !== projectId ||
    !Number.isSafeInteger(maxActive) ||
    maxActive < 1 ||
    !Number.isSafeInteger(maxDepth) ||
    maxDepth < 0 ||
    !Number.isSafeInteger(cancellationTimeout) ||
    cancellationTimeout < 1
  ) {
    throw new ProjectTaskError('TASK_UNAVAILABLE', 'Invalid project authority or task admission limits.');
  }
  // These are effect-control handles, not task state: the durable journal owns every phase/reservation.
  const controllers = new Map<string, AbortController>();
  const executions = new Map<string, ProjectTaskExecution>();
  const jobs = new Map<string, Promise<void>>();
  const dispatches = new Map<string, ProjectTaskDispatchActor>();
  const bindings = new Map<string, ProjectTaskCaller>();
  const observers = new Set<() => void>();
  let accepting = true;
  let closePromise: Promise<void> | undefined;

  const awaitSettlement = async (operation: Promise<unknown>): Promise<void> => {
    const timedOut = Promise.withResolvers<void>();
    const cancelTimer = schedule(() => {
      timedOut.reject(new ProjectTaskError('TASK_BUSY', 'Cancellation is recorded; resources are still settling.'));
    }, cancellationTimeout);
    try {
      await Promise.race([operation, timedOut.promise]);
    } finally {
      cancelTimer();
    }
  };
  const reconcileAttempt = async (task: ProjectTask): Promise<void> => {
    const attempt = latest(task);
    const discovered = await backend.reconcile({ task, attempt });
    const allocation =
      attempt.placementId && attempt.candidateCheckoutId
        ? { placementId: attempt.placementId, checkoutId: attempt.candidateCheckoutId }
        : discovered;
    if (allocation) {
      await backend.release({ task, attempt, allocation });
    }
  };

  const notify = (): void => {
    // oxlint-disable-next-line unicorn/no-useless-spread -- Observers remove themselves while notification runs.
    for (const observer of [...observers]) {
      observer();
    }
  };
  const commit = async (view: ProjectTaskStoreView, change: ProjectTaskChange): Promise<void> => {
    await view.append(change);
    bindings.clear();
    for (const task of view.tasks.values()) {
      const attempt = latest(task);
      if (!task.closed && activeStatuses.has(attempt.status) && attempt.runId) {
        bindings.set(JSON.stringify([task.chatId, attempt.runId]), {
          kind: 'task',
          projectId,
          taskId: task.id,
          attemptId: attempt.id,
        });
      }
    }
    notify();
  };
  const assertCaller = (view: ProjectTaskStoreView, caller: ProjectTaskCaller): ProjectTask | undefined => {
    if (caller.projectId !== projectId) {
      throw new ProjectTaskError('TASK_FORBIDDEN', 'Task calls cannot cross project authority.');
    }
    if (caller.kind === 'host') {
      return undefined;
    }
    const task = view.tasks.get(caller.taskId);
    if (!task || task.closed || latest(task).id !== caller.attemptId || !activeStatuses.has(latest(task).status)) {
      throw new ProjectTaskError('TASK_FORBIDDEN', 'The authenticated task attempt is no longer active.');
    }
    return task;
  };
  const targetFor = (view: ProjectTaskStoreView, caller: ProjectTaskCaller, taskId: string): ProjectTask => {
    assertCaller(view, caller);
    const task = view.tasks.get(taskId);
    if (!task) {
      throw new ProjectTaskError('TASK_NOT_FOUND', 'Task does not exist in this project.');
    }
    if (
      caller.kind === 'task' &&
      !related(view.tasks, caller.taskId, taskId) &&
      view.tasks.get(caller.taskId)?.parentTaskId !== taskId
    ) {
      throw new ProjectTaskError('TASK_FORBIDDEN', 'A task can address only its immediate parent and its own subtree.');
    }
    return task;
  };
  const capacity = (view: ProjectTaskStoreView): void => {
    if (!accepting) {
      throw new ProjectTaskError('TASK_CLOSED', 'The project task coordinator is closing.');
    }
    if ([...view.tasks.values()].filter((task) => activeStatuses.has(latest(task).status)).length >= maxActive) {
      throw new ProjectTaskError(
        'TASK_CAPACITY',
        'Project active-attempt capacity is full, including waiting ancestors.',
      );
    }
  };
  const priorTask = (view: ProjectTaskStoreView, key: string, value: string): ProjectTask | undefined => {
    const prior = view.requests.get(key);
    if (!prior) {
      return undefined;
    }
    if (prior.fingerprint !== value || prior.result.kind !== 'task') {
      throw new ProjectTaskError('TASK_REQUEST_CONFLICT', 'Request ID was already used with different arguments.');
    }
    return structuredClone(prior.result.task);
  };
  const updateAttempt = async (
    taskId: string,
    attemptId: string,
    patch: Partial<ProjectTaskAttempt>,
  ): Promise<ProjectTask> =>
    store.transaction(async (view) => {
      const task = view.tasks.get(taskId);
      if (!task || latest(task).id !== attemptId) {
        throw new ProjectTaskError('TASK_FORBIDDEN', 'An obsolete attempt cannot update the current task.');
      }
      const previous = latest(task);
      if (!activeStatuses.has(previous.status)) {
        return structuredClone(task);
      }
      const next = withAttempt(task, { ...previous, ...patch });
      await commit(view, { tasks: [next] });
      return structuredClone(next);
    });

  const dispatch = (task: ProjectTask): void => {
    const attempt = latest(task);
    if (jobs.has(attempt.id)) {
      return;
    }
    const controller = new AbortController();
    controllers.set(attempt.id, controller);
    const execute = async (): Promise<void> => {
      let allocation: ProjectTaskAllocation | undefined;
      let execution: ProjectTaskExecution | undefined;
      let outcome: Readonly<{ status: 'completed' | 'failed' | 'cancelled'; detail?: string }> = { status: 'failed' };
      try {
        const messages = await coordinator.inbox({ taskId: task.id });
        const launch = { task, attempt, signal: controller.signal, messages };
        controller.signal.throwIfAborted();
        allocation = await backend.allocate(launch);
        // Persist allocation even when cancellation won, so recovery can compensate it.
        const allocated = await updateAttempt(task.id, attempt.id, {
          placementId: allocation.placementId,
          candidateCheckoutId: allocation.checkoutId,
        });
        if (allocated.closed || latest(allocated).status === 'cancelling') {
          controller.abort();
        }
        controller.signal.throwIfAborted();
        execution = await backend.start(launch, allocation);
        executions.set(attempt.id, execution);
        const delivered = messages.at(-1);
        if (delivered) {
          await coordinator.acknowledgeDelivery({
            taskId: task.id,
            attemptId: attempt.id,
            through: delivered.sequence,
          });
        }
        if (execution.runId !== attempt.id) {
          throw new ProjectTaskError('TASK_FORBIDDEN', 'Child launcher run ID must equal the admitted attempt ID.');
        }
        const started = await store.transaction(async (view) => {
          const current = view.tasks.get(task.id);
          if (!current || current.closed || latest(current).status === 'cancelling') {
            return false;
          }
          await commit(view, { tasks: [withAttempt(current, { ...latest(current), status: 'running' })] });
          return true;
        });
        if (!started || controller.signal.aborted) {
          await execution.cancel();
        }
        outcome = await execution.completion;
      } catch (error) {
        outcome = {
          status: controller.signal.aborted ? 'cancelled' : 'failed',
          detail: error instanceof Error ? error.message : String(error),
        };
        if (execution) {
          await execution.cancel();
          await execution.completion;
        }
      } finally {
        if (allocation) {
          // Failure keeps a reservation active and inspectable; never claim release while a resource still exists.
          try {
            await backend.release({ task, attempt: { ...attempt, placementId: allocation.placementId }, allocation });
          } catch (error) {
            await updateAttempt(task.id, attempt.id, {
              status: 'cancelling',
              detail: `Resource release failed: ${String(error)}`,
            });
            controllers.delete(attempt.id);
            executions.delete(attempt.id);
            // oxlint-disable-next-line eslint/no-unsafe-finally -- Failed release must prevent a false terminal reservation release.
            throw error;
          }
        }
        await store.transaction(async (view) => {
          const current = view.tasks.get(task.id);
          if (current && latest(current).id === attempt.id && activeStatuses.has(latest(current).status)) {
            await commit(view, {
              tasks: [
                withAttempt(current, {
                  ...latest(current),
                  status: current.closed ? 'cancelled' : outcome.status,
                  endedAt: now(),
                  ...(outcome.detail ? { detail: outcome.detail.slice(0, 4096) } : {}),
                }),
              ],
            });
          }
        });
        controllers.delete(attempt.id);
        executions.delete(attempt.id);
      }
    };
    const actor = createProjectTaskDispatch({
      input: { projectId, taskId: task.id, attemptId: attempt.id },
      effects: {
        execute: async () => execute(),
        cancel: () => {
          controller.abort();
        },
      },
    });
    dispatches.set(attempt.id, actor);
    actor.start();
    const job = (async (): Promise<void> => {
      const result = await toPromise(actor);
      dispatches.delete(attempt.id);
      if (result.error) {
        throw new Error(result.error);
      }
    })();
    jobs.set(attempt.id, job);
    const observeCompletion = async (): Promise<void> => {
      try {
        await job;
      } catch {
        // Failed cleanup remains durably cancelling; recovery retries the resource owner, never tools.
      } finally {
        jobs.delete(attempt.id);
      }
    };
    // async-iife: bootstrap -- The jobs map explicitly tracks this attempt until settlement.
    void observeCompletion();
  };

  const ensureChildLineage = async (task: ProjectTask): Promise<void> => {
    if (!task.parentTaskId || !options.materializeLineage) {
      return;
    }
    const entry = await store.transaction(async (view): Promise<ProjectTaskChatLineage> => {
      const parent = view.tasks.get(task.parentTaskId!);
      if (!parent) {
        throw new ProjectTaskError('TASK_STORAGE_INVALID', 'Child task has no durable parent.');
      }
      const seen = new Set([task.id]);
      let root = parent;
      while (root.parentTaskId) {
        if (seen.has(root.id)) {
          throw new ProjectTaskError('TASK_STORAGE_INVALID', 'Task ancestry contains a cycle.');
        }
        seen.add(root.id);
        const ancestor = view.tasks.get(root.parentTaskId);
        if (!ancestor) {
          throw new ProjectTaskError('TASK_STORAGE_INVALID', 'Task ancestry has a missing ancestor.');
        }
        root = ancestor;
      }
      if (seen.has(root.id)) {
        throw new ProjectTaskError('TASK_STORAGE_INVALID', 'Task ancestry contains a cycle.');
      }
      return {
        chatId: task.chatId,
        taskLineage: {
          taskId: task.id,
          parentTaskId: parent.id,
          parentChatId: parent.chatId,
          rootChatId: root.chatId,
        },
      };
    });
    await options.materializeLineage(entry, task);
  };
  const launchAfterLineage = async (task: ProjectTask): Promise<void> => {
    await ensureChildLineage(task);
    const current = await store.transaction(async (view) => view.tasks.get(task.id));
    if (
      current &&
      !current.closed &&
      latest(current).id === latest(task).id &&
      latest(current).status === 'allocating'
    ) {
      dispatch(structuredClone(current));
    }
  };

  const admit = async (
    caller: ProjectTaskCaller,
    raw: unknown,
    root?: ProjectTaskRootAdmission,
  ): Promise<ProjectTask> => {
    const input = projectTaskSpawnSchema.parse(raw);
    // No allocation occurs during validation; durable duplicate lookup still wins after closure/saturation.
    const key = requestKey(caller, root ? 'root' : 'spawn', input.requestId);
    const value = fingerprint(root ?? input);
    const old = await store.transaction(async (view) => {
      assertCaller(view, caller);
      return priorTask(view, key, value);
    });
    if (old) {
      await launchAfterLineage(old);
      return old;
    }
    await backend.validate(input.provider);
    const { task } = await store.transaction(async (view) => {
      const parent = assertCaller(view, caller);
      const previous = priorTask(view, key, value);
      if (previous) {
        return { task: previous, created: false };
      }
      capacity(view);
      if (!root && !parent) {
        throw new ProjectTaskError('TASK_FORBIDDEN', 'Spawn must be bound to an active parent turn.');
      }
      const depth = parent ? parent.depth + 1 : 0;
      if (depth > maxDepth) {
        throw new ProjectTaskError('TASK_DEPTH', 'Project task nesting limit reached.');
      }
      const source = root?.source ?? (parent ? latest(parent).source : undefined);
      if (!source) {
        throw new ProjectTaskError('TASK_SOURCE_UNAVAILABLE', 'An immutable admitted source revision is required.');
      }
      const existingRoot = root
        ? [...view.tasks.values()].find((candidate) => candidate.chatId === root.chatId && !candidate.parentTaskId)
        : undefined;
      if (existingRoot && activeStatuses.has(latest(existingRoot).status)) {
        throw new ProjectTaskError('TASK_BUSY', 'The root chat already has an active task attempt.');
      }
      const taskId = existingRoot?.id ?? id();
      const attemptId = id();
      const timestamp = now();
      const next = projectTaskSchema.parse({
        id: taskId,
        projectId,
        chatId: root?.chatId ?? id(),
        title: input.title,
        prompt: input.prompt,
        provider: input.provider,
        ...(parent ? { parentTaskId: parent.id } : {}),
        depth,
        createdAt: existingRoot?.createdAt ?? timestamp,
        closed: false,
        attempts: [
          ...(existingRoot?.attempts ?? []),
          {
            id: attemptId,
            number: (existingRoot?.attempts.length ?? 0) + 1,
            status: root ? 'running' : 'allocating',
            source,
            toolGrant: root?.toolGrant ?? (parent ? latest(parent).toolGrant : { toolChoice: 'none' }),
            createdAt: timestamp,
            runId: root?.runId ?? attemptId,
          },
        ],
      });
      await commit(view, { tasks: [next], request: { key, fingerprint: value, result: { kind: 'task', task: next } } });
      return { task: structuredClone(next), created: true };
    });
    await launchAfterLineage(task);
    return task;
  };

  const cancelTasks = async (
    caller: ProjectTaskCaller,
    input: ProjectTaskAction,
    closeSubtree = true,
  ): Promise<ProjectTask> => {
    const key = requestKey(caller, closeSubtree ? 'cancel' : 'close', input.requestId);
    const value = fingerprint(input);
    const affected: ProjectTask[] = [];
    const answer = await store.transaction(async (view) => {
      const selected = targetFor(view, caller, input.taskId);
      if (
        caller.kind === 'task' &&
        (caller.taskId === selected.id || !related(view.tasks, caller.taskId, selected.id))
      ) {
        throw new ProjectTaskError(
          'TASK_FORBIDDEN',
          'Task tools can cancel descendants; cancel the current task through its host owner.',
        );
      }
      const old = priorTask(view, key, value);
      if (old) {
        affected.push(...[...view.tasks.values()].filter((task) => related(view.tasks, selected.id, task.id)));
        return old;
      }
      for (const task of view.tasks.values()) {
        if (!related(view.tasks, selected.id, task.id)) {
          continue;
        }
        const attempt = latest(task);
        const next = { ...task, closed: closeSubtree || task.closed };
        affected.push(
          activeStatuses.has(attempt.status) ? withAttempt(next, { ...attempt, status: 'cancelling' }) : next,
        );
      }
      const result = affected.find((task) => task.id === selected.id) ?? selected;
      await commit(view, {
        tasks: affected,
        request: { key, fingerprint: value, result: { kind: 'task', task: result } },
      });
      return structuredClone(result);
    });
    for (const task of affected) {
      const attempt = latest(task);
      dispatches.get(attempt.id)?.send({ type: 'cancel', attemptId: attempt.id });
    }
    await awaitSettlement(
      Promise.all(
        affected.map(async (task) => {
          const attempt = latest(task);
          const execution = executions.get(attempt.id);
          if (execution) {
            await execution.cancel();
          }
          const job = jobs.get(attempt.id);
          if (job) {
            await job;
          } else if (activeStatuses.has(attempt.status)) {
            await reconcileAttempt(task);
            await updateAttempt(task.id, attempt.id, { status: 'cancelled', endedAt: now() });
          }
        }),
      ),
    );
    return answer;
  };

  const coordinator: ProjectTaskCoordinator = {
    admitRoot: async (input) =>
      admit(
        { kind: 'host', projectId },
        {
          requestId: input.requestId,
          title: input.title,
          prompt: input.prompt,
          provider: input.provider,
        },
        input,
      ),
    admitContinuation: async (input) =>
      store.transaction(async (view) => {
        const caller: ProjectTaskCaller = { kind: 'host', projectId };
        const key = requestKey(caller, 'continuation', input.requestId);
        const value = fingerprint(input);
        const old = priorTask(view, key, value);
        if (old) {
          return old;
        }
        const current = [...view.tasks.values()].find((task) => task.chatId === input.chatId);
        if (!current) {
          throw new ProjectTaskError('TASK_NOT_FOUND', 'This saved chat has no project task record.');
        }
        if (latest(current).runId !== input.runId) {
          throw new ProjectTaskError(
            'TASK_FORBIDDEN',
            'A native continuation requires the exact latest recorded task run.',
          );
        }
        let ancestor: ProjectTask | undefined = current;
        while (ancestor) {
          if (ancestor.closed) {
            throw new ProjectTaskError('TASK_CLOSED', 'Cancellation closes this native continuation.');
          }
          ancestor = ancestor.parentTaskId ? view.tasks.get(ancestor.parentTaskId) : undefined;
        }
        const previous = latest(current);
        let next = current;
        if (!activeStatuses.has(previous.status)) {
          capacity(view);
          next = {
            ...current,
            attempts: [
              ...current.attempts,
              {
                ...previous,
                id: id(),
                number: current.attempts.length + 1,
                status: 'running',
                createdAt: now(),
                endedAt: undefined,
                detail: undefined,
              },
            ],
          };
        }
        await commit(view, {
          tasks: [next],
          request: { key, fingerprint: value, result: { kind: 'task', task: next } },
        });
        return structuredClone(next);
      }),
    finishRoot: async (input) => {
      await updateAttempt(input.taskId, input.attemptId, {
        status: input.status,
        endedAt: now(),
        ...(input.detail ? { detail: input.detail } : {}),
      });
    },
    callerFor: (input) => bindings.get(JSON.stringify([input.chatId, input.runId])),
    spawn: async (caller, input) => admit(caller, input),
    send: async (caller, raw) => {
      const input = projectTaskSendSchema.parse(raw);
      return store.transaction(async (view) => {
        targetFor(view, caller, input.taskId);
        const key = requestKey(caller, 'send', input.requestId);
        const value = fingerprint(input);
        const previous = view.requests.get(key);
        if (previous) {
          if (previous.fingerprint !== value || previous.result.kind !== 'message') {
            throw new ProjectTaskError(
              'TASK_REQUEST_CONFLICT',
              'Message request ID was already used with different arguments.',
            );
          }
          return structuredClone(previous.result.message);
        }
        const message: ProjectTaskMessage = {
          id: id(),
          sequence: view.sequence + 1,
          projectId,
          ...(caller.kind === 'task' ? { senderTaskId: caller.taskId } : {}),
          recipientTaskId: input.taskId,
          requestId: input.requestId,
          text: input.text,
          createdAt: now(),
        };
        await commit(view, {
          tasks: [],
          message,
          request: { key, fingerprint: value, result: { kind: 'message', message } },
        });
        return structuredClone(message);
      });
    },
    read: async (caller, raw = {}) => {
      const input = projectTaskReadSchema.parse(raw);
      return store.transaction(async (view): Promise<ProjectTaskSnapshot> => {
        assertCaller(view, caller);
        if (input.taskId) {
          targetFor(view, caller, input.taskId);
        }
        const after = input.after ?? 0;
        if (after > view.sequence) {
          throw new ProjectTaskError('TASK_CURSOR_AHEAD', 'Mailbox cursor is ahead of the project journal.');
        }
        const permitted = (taskId: string): boolean => {
          if (input.taskId && taskId !== input.taskId) {
            return false;
          }
          return (
            caller.kind === 'host' ||
            related(view.tasks, caller.taskId, taskId) ||
            view.tasks.get(caller.taskId)?.parentTaskId === taskId
          );
        };
        const messages = view.messages.filter(
          (message) =>
            message.sequence > after &&
            permitted(message.recipientTaskId) &&
            (caller.kind === 'host' ||
              related(view.tasks, caller.taskId, message.recipientTaskId) ||
              message.senderTaskId === caller.taskId),
        );
        const page = messages.slice(0, input.limit ?? 100);
        const hasMore = messages.length > page.length;
        const nextCursor = hasMore ? (page.at(-1)?.sequence ?? after) : view.sequence;
        return structuredClone({
          tasks: [...view.tasks.values()].filter((task) => permitted(task.id)),
          messages: page,
          deliveries: [...view.attemptDeliveries.values()].filter((receipt) => permitted(receipt.taskId)),
          cursor: view.sequence,
          nextCursor,
          hasMore,
        });
      });
    },
    wait: async (caller, raw, signal) => {
      const input = projectTaskWaitSchema.parse(raw ?? {});
      const { timeout: _timeout, ...readInput } = input;
      signal?.throwIfAborted();
      const first = await coordinator.read(caller, readInput);
      signal?.throwIfAborted();
      if (first.cursor > (input.after ?? 0) || (input.timeout ?? 30_000) === 0) {
        return first;
      }
      const wake = Promise.withResolvers<void>();
      const cleanup = (): void => {
        cancelTimer();
        observers.delete(changed);
        signal?.removeEventListener('abort', aborted);
      };
      const changed = (): void => {
        cleanup();
        wake.resolve();
      };
      const aborted = (): void => {
        cleanup();
        wake.reject(new Error('Task wait cancelled.', { cause: signal?.reason }));
      };
      const cancelTimer = schedule(changed, input.timeout ?? 30_000);
      observers.add(changed);
      signal?.addEventListener('abort', aborted, { once: true });
      const recheck = async (): Promise<void> => {
        const snapshot = await coordinator.read(caller, readInput);
        if (snapshot.cursor !== first.cursor) {
          changed();
        }
      };
      try {
        // Both promises are observed immediately; subscribing before recheck closes the append race.
        await Promise.all([wake.promise, recheck()]);
        signal?.throwIfAborted();
      } finally {
        cleanup();
      }
      return coordinator.read(caller, readInput);
    },
    cancel: async (caller, raw) => cancelTasks(caller, projectTaskActionSchema.parse(raw)),
    resume: async (caller, raw) => {
      const input = projectTaskActionSchema.parse(raw);
      const key = requestKey(caller, 'resume', input.requestId);
      const value = fingerprint(input);
      const { task } = await store.transaction(async (view) => {
        const current = targetFor(view, caller, input.taskId);
        if (
          caller.kind === 'task' &&
          (current.id === caller.taskId || !related(view.tasks, caller.taskId, current.id))
        ) {
          throw new ProjectTaskError('TASK_FORBIDDEN', 'Task tools can resume only their own descendants.');
        }
        const old = priorTask(view, key, value);
        if (old) {
          return { task: old, created: false };
        }
        if (activeStatuses.has(latest(current).status)) {
          throw new ProjectTaskError('TASK_BUSY', 'The task already has an active attempt.');
        }
        if (current.parentTaskId) {
          let parent = view.tasks.get(current.parentTaskId);
          while (parent) {
            if (parent.closed) {
              throw new ProjectTaskError('TASK_CLOSED', 'A cancelled ancestor closes this subtree.');
            }
            parent = parent.parentTaskId ? view.tasks.get(parent.parentTaskId) : undefined;
          }
        }
        capacity(view);
        const attemptId = id();
        const next: ProjectTask = {
          ...current,
          closed: false,
          attempts: [
            ...current.attempts,
            {
              id: attemptId,
              runId: attemptId,
              number: current.attempts.length + 1,
              status: 'allocating',
              source: latest(current).source,
              toolGrant: latest(current).toolGrant,
              createdAt: now(),
            },
          ],
        };
        await commit(view, {
          tasks: [next],
          request: { key, fingerprint: value, result: { kind: 'task', task: next } },
        });
        return { task: structuredClone(next), created: true };
      });
      await launchAfterLineage(task);
      return task;
    },
    inbox: async (input) =>
      store.transaction(async (view) => {
        if (!view.tasks.has(input.taskId)) {
          throw new ProjectTaskError('TASK_NOT_FOUND', 'Task does not exist.');
        }
        const after = Math.max(input.after ?? 0, view.deliveries.get(input.taskId)?.through ?? 0);
        const pending = view.messages.filter(
          (message) => message.recipientTaskId === input.taskId && message.sequence > after,
        );
        const batch: ProjectTaskMessage[] = [];
        let byteLength = 0;
        const count = Math.min(
          input.limit ?? projectTaskMailboxLimits.maxMessages,
          projectTaskMailboxLimits.maxMessages,
        );
        for (const message of pending) {
          // Root and child prompts use this exact formatter. Two bytes cover per-entry joining/leading newlines.
          const nextLength = new TextEncoder().encode(formatProjectTaskMailboxMessage(message)).byteLength + 2;
          if (batch.length >= count || byteLength + nextLength > projectTaskMailboxLimits.maxBytes) {
            break;
          }
          batch.push(message);
          byteLength += nextLength;
        }
        return structuredClone(batch);
      }),
    acknowledgeDelivery: async (input) =>
      store.transaction(async (view) => {
        const task = view.tasks.get(input.taskId);
        if (!task || latest(task).id !== input.attemptId || !activeStatuses.has(latest(task).status)) {
          throw new ProjectTaskError('TASK_FORBIDDEN', 'Only the active attempt can acknowledge model delivery.');
        }
        const previous = view.deliveries.get(input.taskId)?.through ?? 0;
        if (!Number.isSafeInteger(input.through) || input.through > view.sequence || input.through < previous) {
          throw new ProjectTaskError('TASK_CURSOR_AHEAD', 'Invalid model-delivery cursor.');
        }
        if (input.through > previous) {
          await commit(view, { tasks: [], delivery: input });
        }
      }),
    repairLineage: async () => {
      const children = await store.transaction(async (view) =>
        [...view.tasks.values()].filter((task) => task.parentTaskId).sort((a, b) => a.depth - b.depth),
      );
      for (const child of children) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- Parent-first durable metadata repair precedes task recovery.
        await ensureChildLineage(child);
      }
    },
    recover: async () => {
      await coordinator.repairLineage();
      const pending = await store.transaction(async (view) =>
        [...view.tasks.values()].filter((task) => activeStatuses.has(latest(task).status)),
      );
      for (const task of pending) {
        const attempt = latest(task);
        if (jobs.has(attempt.id)) {
          continue;
        }
        // Existing leadership/lease recovery is the authority; interruption follows its acknowledgement.
        // oxlint-disable-next-line eslint/no-await-in-loop -- Recovery preserves parent-first owner reconciliation before child interruption.
        await reconcileAttempt(structuredClone(task));
        // oxlint-disable-next-line eslint/no-await-in-loop -- The interruption acknowledgement follows this owner's recovery.
        await updateAttempt(task.id, attempt.id, { status: task.closed ? 'cancelled' : 'interrupted', endedAt: now() });
      }
    },
    close: async () => {
      if (closePromise) {
        return closePromise;
      }
      accepting = false;
      closePromise = (async () => {
        const roots = await store.transaction(async (view) =>
          [...view.tasks.values()].filter(
            (task) =>
              !task.parentTaskId &&
              [...view.tasks.values()].some(
                (candidate) =>
                  related(view.tasks, task.id, candidate.id) && activeStatuses.has(latest(candidate).status),
              ),
          ),
        );
        await Promise.all(
          roots.map(async (task) =>
            cancelTasks({ kind: 'host', projectId }, { taskId: task.id, requestId: `close-${latest(task).id}` }, false),
          ),
        );
        await Promise.all(jobs.values());
        notify();
        await store.close();
      })();
      try {
        await closePromise;
      } catch (error) {
        closePromise = undefined;
        throw error;
      }
    },
  };
  return coordinator;
};
