import { followChat, jsonValueSchema, unsettledAttempts } from '@taucad/agent-host';
import type { AgentSessionModel, ChatLedger, ToolRegistry, TurnPlacementPort } from '@taucad/agent-host';
import { chatIdSchema, projectTaskRefusalCodes } from '@taucad/agent-host/wire';
import type {
  AgentChannelAdmissionConfig,
  CommandAnswer,
  HostCommand,
  ProjectTask,
  ProjectTaskChannelPort,
} from '@taucad/agent-host/wire';
import type { AgentLauncher, ProjectTaskStorage } from '@taucad/agent-host/launcher';
import type { FileSystemProvider } from '@taucad/filesystem';

import { readProjectTaskContext } from '#project-task-context.js';
import {
  createProjectTaskBackend,
  readRecordedToolGrant,
  waitForTaskLeaseRetirement,
  withProjectTaskTools,
} from '#project-task-integration.js';
import { materializeProjectTaskLineage } from '#project-tasks/chat-lineage.js';
import { createProjectTaskCoordinator } from '#project-tasks/coordinator.js';
import { formatProjectTaskMailboxMessage } from '#project-tasks/mailbox.js';
import { createProjectTaskStore } from '#project-tasks/store.js';
import type { ProjectTaskCoordinator } from '#project-tasks/types.js';

/** The common filesystem authority used by task context and lineage. @internal */
export type ProjectTaskFiles = Required<
  Pick<FileSystemProvider, 'exists' | 'readFile' | 'readFileStream' | 'writeFileChecked'>
>;

/** The revision owner's candidate allocation. @internal */
export type ProjectTaskCandidateInput = Readonly<{
  requestId: string;
  name: string;
  from: string;
  signal: AbortSignal;
}>;
/** Trusted checkout identity returned by the revision owner. @internal */
export type ProjectTaskCandidate = Readonly<{ checkoutId: string; checkoutRoot: string }>;

/** Environment capabilities for one project task owner. @internal */
export type ProjectTaskCompositionOptions = Readonly<{
  projectId: string;
  filesystem: ProjectTaskFiles;
  createCandidate: (input: ProjectTaskCandidateInput) => Promise<ProjectTaskCandidate>;
  systemPrompt: string;
  model?: AgentSessionModel | undefined;
  resolveModel?:
    | ((input: Readonly<{ modelId: string; signal: AbortSignal }>) => Promise<AgentSessionModel | undefined>)
    | undefined;
  agentIds?: readonly string[] | undefined;
  /** Browser project ownership fence; accepted settlements continue until close. */
  signal?: AbortSignal | undefined;
  admitting?: (() => boolean) | undefined;
  onCandidateReleased?: ((runId: string, checkoutId: string) => void | Promise<void>) | undefined;
  /** Node's placement already opens registries through decorateTools. */
  placementToolsAlreadyDecorated?: boolean | undefined;
}>;

const liveStates: ReadonlySet<string | undefined> = new Set(['admitted', 'running']);
const activeTaskStatuses = new Set(['allocating', 'running', 'cancelling']);
const settled =
  (runIds: ReadonlySet<string>) =>
  (ledger: ChatLedger): boolean => {
    const unsettled = new Set(unsettledAttempts(ledger).map(({ runId }) => runId));
    return [...runIds].every((runId) => {
      const entry = ledger.runs[runId];
      return entry !== undefined && !liveStates.has(entry.lifecycle) && !unsettled.has(runId);
    });
  };

/** Shared Node/browser admission, grant, mailbox and settlement composition. @internal */
// oxlint-disable-next-line typescript/explicit-module-boundary-types -- the internal composition derives its exact method types from local closures.
export const createProjectTaskComposition = (options: ProjectTaskCompositionOptions) => {
  const { projectId, filesystem } = options;
  const entered = new Map<string, Set<string>>();
  const taskChats = new Map<string, string>();
  const taskRoots = new Map<string, string>();
  const rootCommands = new Map<string, Extract<HostCommand, { type: 'start' }>>();
  const rootDelivery = new Map<string, number>();
  const taskGrants = new Map<string, Pick<AgentChannelAdmissionConfig, 'toolChoice' | 'allowedTools'>>();
  const taskFollowers = new Map<string, Promise<void>>();
  const stopTaskFollowers = new AbortController();
  const ownerClosed = Promise.withResolvers<void>();
  const answering = new Set<Promise<unknown>>();
  let tasks: Promise<ProjectTaskCoordinator> | undefined;
  let taskOwner: ProjectTaskCoordinator | undefined;
  let launcher: AgentLauncher | undefined;
  let turnPlacement: TurnPlacementPort | undefined;
  let closing = false;
  const ownerFenced = (): boolean => closing || options.signal?.aborted === true;

  const requireLauncher = (): AgentLauncher => {
    if (launcher === undefined) {
      throw new Error('Project task launcher has not been bound.');
    }
    return launcher;
  };
  const requirePlacement = (): TurnPlacementPort => {
    if (turnPlacement === undefined) {
      throw new Error('Project task placement has not been bound.');
    }
    return turnPlacement;
  };
  const taskCoordinator = async (): Promise<ProjectTaskCoordinator> => {
    if (tasks === undefined) {
      throw Object.assign(new Error('This host has no durable project identity.'), { code: 'TASK_UNAVAILABLE' });
    }
    return tasks;
  };

  const trackTask = (coordinator: ProjectTaskCoordinator, task: ProjectTask, runId: string): void => {
    const attemptId = task.attempts.at(-1)!.id;
    if (taskFollowers.has(attemptId)) {
      return;
    }
    const follow = async (): Promise<void> => {
      const signal = AbortSignal.any([stopTaskFollowers.signal, AbortSignal.timeout(24 * 60 * 60_000)]);
      try {
        const rootSettled = (ledger: ChatLedger): boolean => {
          const run = ledger.runs[runId];
          return (
            run !== undefined &&
            ['completed', 'failed', 'cancelled'].includes(run.lifecycle ?? '') &&
            settled(new Set([runId]))(ledger)
          );
        };
        for await (const { ledger } of followChat(requireLauncher().read, task.chatId, {
          signal,
          until: rootSettled,
        })) {
          const run = ledger.runs[runId];
          if (run !== undefined && rootSettled(ledger)) {
            await waitForTaskLeaseRetirement(requirePlacement(), task.chatId, { runId, signal });
            signal.throwIfAborted();
            await coordinator.finishRoot({
              taskId: task.id,
              attemptId,
              status:
                run.lifecycle === 'completed' ? 'completed' : run.lifecycle === 'cancelled' ? 'cancelled' : 'failed',
            });
            return;
          }
        }
        signal.throwIfAborted();
      } catch (error) {
        if (
          !stopTaskFollowers.signal.aborted &&
          !(closing && error instanceof Error && 'code' in error && error.code === 'TASK_CLOSED')
        ) {
          console.error('[project tasks] root settlement tracking failed', error);
        }
      } finally {
        taskFollowers.delete(attemptId);
        taskChats.delete(runId);
        taskGrants.delete(runId);
      }
    };
    taskFollowers.set(attemptId, follow());
  };

  const decorateTools = (registry: ToolRegistry): ToolRegistry => {
    const tools = withProjectTaskTools(registry, taskCoordinator, (runId) => taskChats.get(runId));
    return {
      ...tools,
      invoke: async (invocation) => {
        if (ownerFenced()) {
          return { isError: true, content: { errorCode: 'TASK_CLOSED', message: 'The project task owner changed.' } };
        }
        const grant = invocation.runId === undefined ? undefined : taskGrants.get(invocation.runId);
        const explicitChoice = Array.isArray(grant?.toolChoice) ? grant.toolChoice : undefined;
        if (
          (invocation.runId !== undefined && grant === undefined) ||
          grant?.toolChoice === 'none' ||
          (grant?.allowedTools !== undefined && !grant.allowedTools.includes(invocation.toolName)) ||
          (explicitChoice !== undefined && !explicitChoice.includes(invocation.toolName))
        ) {
          return {
            isError: true,
            content: { errorCode: 'TOOL_NOT_ALLOWED', message: 'This tool is outside the admitted parent grant.' },
          };
        }
        return tools.invoke(invocation);
      },
    };
  };

  const wrapPlacement = (placement: TurnPlacementPort): TurnPlacementPort => {
    const wrapped: TurnPlacementPort = {
      ...placement,
      admit: async (input) => {
        const answer = await placement.admit(input);
        const command = rootCommands.get(input.key.runId);
        if (answer.status !== 'refused' && command !== undefined) {
          try {
            const source = answer.placement;
            if (source.baseRevisionId === undefined) {
              throw Object.assign(new Error('The admitted checkout has no immutable source revision.'), {
                code: 'TASK_SOURCE_UNAVAILABLE',
              });
            }
            const coordinator = await taskCoordinator();
            const text =
              typeof command.payload.message.content === 'string'
                ? command.payload.message.content
                : 'Project agent turn';
            const task = await coordinator.admitRoot({
              requestId: command.commandId,
              chatId: input.key.chatId,
              runId: input.key.runId,
              title: text.slice(0, 256) || 'Project agent turn',
              prompt: text || 'Project agent turn',
              provider: {
                id: command.payload.config?.agent?.id ?? 'tau',
                ...(command.payload.config?.agent?.model === undefined
                  ? {}
                  : { model: command.payload.config.agent.model }),
              },
              source: { revisionId: source.baseRevisionId, checkoutId: source.checkoutId },
              toolGrant: taskGrants.get(input.key.runId) ?? { toolChoice: 'none' },
            });
            const through = rootDelivery.get(input.key.runId);
            if (through !== undefined) {
              await coordinator.acknowledgeDelivery({ taskId: task.id, attemptId: task.attempts.at(-1)!.id, through });
            }
            taskChats.set(input.key.runId, input.key.chatId);
            rootCommands.delete(input.key.runId);
            trackTask(coordinator, task, input.key.runId);
          } catch (error) {
            await placement.abandon({ requestId: `${input.requestId}-task-refusal`, key: input.key });
            throw error;
          }
        }
        return answer.status === 'refused' || options.placementToolsAlreadyDecorated
          ? answer
          : { ...answer, placement: { ...answer.placement, tools: decorateTools(answer.placement.tools) } };
      },
    };
    turnPlacement = wrapped;
    return wrapped;
  };

  const initialize = async (
    storage: ProjectTaskStorage | Promise<ProjectTaskStorage>,
  ): Promise<ProjectTaskCoordinator> => {
    const opened = async (): Promise<ProjectTaskCoordinator> => {
      const store = await createProjectTaskStore({ projectId, storage: await storage });
      try {
        // The first append durably claims this project term before recovery can launch tools.
        await store.transaction(async (view) => {
          await view.append({ tasks: [] });
        });
        const coordinator = await createProjectTaskCoordinator({
          projectId,
          store,
          materializeLineage: async (entry, task) => materializeProjectTaskLineage(filesystem, entry, task),
          backend: createProjectTaskBackend({
            createCandidate: options.createCandidate,
            launcher: requireLauncher,
            agents: options.agentIds ?? [],
            systemPrompt: options.systemPrompt,
            tauModel: options.model,
            resolveModel: options.resolveModel,
            bind: (runId, chatId) => {
              taskChats.set(runId, chatId);
            },
            allocated: (checkoutId, root) => {
              taskRoots.set(checkoutId, root);
            },
            context: async (checkoutId, signal) => {
              if (!taskRoots.has(checkoutId)) {
                throw Object.assign(new Error('The task candidate root is unavailable.'), {
                  code: 'TASK_SOURCE_UNAVAILABLE',
                });
              }
              return readProjectTaskContext(filesystem, signal);
            },
            rememberGrant: (runId, grant) => {
              taskGrants.set(runId, grant);
            },
            released: async (runId, checkoutId) => {
              await options.onCandidateReleased?.(runId, checkoutId);
              taskChats.delete(runId);
              taskGrants.delete(runId);
              taskRoots.delete(checkoutId);
            },
            waitForOwnerClose: async () => ownerClosed.promise,
            placement: requirePlacement(),
          }),
        });
        taskOwner = coordinator;
        await coordinator.recover();
        return coordinator;
      } catch (error) {
        await store.close();
        throw error;
      }
    };
    tasks = opened();
    return tasks;
  };

  const execute: AgentLauncher['execute'] = async (initial) => {
    let command = initial;
    if (ownerFenced() && (command.type === 'start' || command.type === 'resume')) {
      return {
        commandId: command.commandId,
        generation: 0,
        status: 'refused',
        effect: 'not-applied',
        code: 'HOST_CLOSED',
        message: 'The project task owner changed.',
      };
    }
    if (command.type !== 'start' && command.type !== 'resume') {
      return requireLauncher().execute(command);
    }
    const { chatId, runId } = command.payload;
    if (!chatIdSchema.safeParse(chatId).success) {
      return {
        commandId: command.commandId,
        generation: 0,
        status: 'refused',
        effect: 'not-applied',
        code: 'STORAGE_PATH_INVALID',
        message: 'chatId must be one storage path segment.',
      };
    }
    if (options.admitting?.() === false) {
      return requireLauncher().execute(command);
    }
    const runs = entered.get(chatId) ?? new Set<string>();
    const counted = !runs.has(runId);
    entered.set(chatId, runs.add(runId));
    const answered = (async (): Promise<CommandAnswer> => {
      let admitted = false;
      let continuation:
        | Readonly<{ coordinator: ProjectTaskCoordinator; task: ProjectTask; newlyReserved: boolean }>
        | undefined;
      try {
        if (command.type === 'resume') {
          const coordinator = await taskCoordinator();
          try {
            const before = await coordinator.read({ kind: 'host', projectId });
            const previous = before.tasks.find((task) => task.chatId === chatId)?.attempts.at(-1)?.id;
            const task = await coordinator.admitContinuation({ requestId: command.commandId, chatId, runId });
            const attempt = task.attempts.at(-1)!;
            taskChats.set(runId, chatId);
            taskGrants.set(runId, attempt.toolGrant);
            continuation = { coordinator, task, newlyReserved: attempt.id !== previous };
          } catch (error) {
            if (error instanceof Error && 'code' in error && error.code === 'TASK_NOT_FOUND') {
              const grant = await readRecordedToolGrant(requireLauncher(), chatId, runId);
              taskGrants.set(runId, grant ?? { toolChoice: 'none' });
            } else {
              return {
                commandId: command.commandId,
                generation: 0,
                status: 'refused',
                effect: 'not-applied',
                code: error instanceof Error && 'code' in error ? String(error.code) : 'TASK_UNAVAILABLE',
                message: error instanceof Error ? error.message : String(error),
              };
            }
          }
        }
        if (command.type === 'start') {
          const coordinator = await taskCoordinator();
          const snapshot = await coordinator.read({ kind: 'host', projectId });
          if (snapshot.tasks.some((task) => task.chatId === chatId && task.parentTaskId !== undefined)) {
            return {
              commandId: command.commandId,
              generation: 0,
              status: 'refused',
              effect: 'not-applied',
              code: 'TASK_FORBIDDEN',
              message: 'This chat belongs to a delegated task. Send a task message and use Resume to continue it.',
            };
          }
          const rootTask = snapshot.tasks.find((task) => task.chatId === chatId && task.parentTaskId === undefined);
          if (rootTask !== undefined) {
            const messages = await coordinator.inbox({ taskId: rootTask.id });
            if (messages.length > 0) {
              const mailbox = messages.map((message) => formatProjectTaskMailboxMessage(message)).join('\n');
              const original = command.payload.message.content;
              command = {
                ...command,
                payload: {
                  ...command.payload,
                  message: {
                    ...command.payload.message,
                    content:
                      typeof original === 'string'
                        ? `${original}\n${mailbox}`
                        : [
                            ...(Array.isArray(original) ? jsonValueSchema.array().parse(original) : [original]),
                            { type: 'text', text: mailbox },
                          ],
                  },
                },
              };
              rootDelivery.set(runId, messages.at(-1)!.sequence);
            }
          }
          const contextPayload = await readProjectTaskContext(filesystem, AbortSignal.timeout(30_000));
          command = {
            ...command,
            payload: {
              ...command.payload,
              config: {
                systemPrompt: options.systemPrompt,
                toolChoice: 'auto',
                ...command.payload.config,
                contextPayload: {
                  ...command.payload.config?.contextPayload,
                  ...contextPayload,
                  memory: {
                    ...command.payload.config?.contextPayload?.memory,
                    ...contextPayload.memory,
                  },
                },
              },
            },
          };
          rootCommands.set(runId, command);
          taskGrants.set(runId, {
            toolChoice: command.payload.config?.toolChoice ?? 'auto',
            ...(command.payload.config?.allowedTools === undefined
              ? {}
              : { allowedTools: command.payload.config.allowedTools }),
          });
        }
        const answer = await requireLauncher().execute(command);
        if (continuation !== undefined) {
          if (answer.status === 'refused' && continuation.newlyReserved) {
            await continuation.coordinator.finishRoot({
              taskId: continuation.task.id,
              attemptId: continuation.task.attempts.at(-1)!.id,
              status: 'failed',
              detail: answer.message,
            });
          } else if (answer.status !== 'refused') {
            trackTask(continuation.coordinator, continuation.task, runId);
          }
        }
        admitted = answer.status !== 'refused';
        return answer;
      } finally {
        if (counted && !admitted) {
          rootCommands.delete(runId);
          rootDelivery.delete(runId);
          taskGrants.delete(runId);
          taskChats.delete(runId);
          runs.delete(runId);
          if (runs.size === 0 && entered.get(chatId) === runs) {
            entered.delete(chatId);
          }
        }
      }
    })();
    answering.add(answered);
    try {
      return await answered;
    } finally {
      answering.delete(answered);
    }
  };

  const projectTasks: ProjectTaskChannelPort = {
    request: async (request, signal) => {
      try {
        if (ownerFenced() && request.operation !== 'read') {
          return { kind: 'refused', code: 'TASK_CLOSED', message: 'The project task owner changed.' };
        }
        const coordinator = await taskCoordinator();
        const caller = { kind: 'host', projectId } as const;
        switch (request.operation) {
          case 'read': {
            return { kind: 'snapshot', snapshot: await coordinator.read(caller, request.input) };
          }
          case 'wait': {
            return { kind: 'snapshot', snapshot: await coordinator.wait(caller, request.input, signal) };
          }
          case 'send': {
            return { kind: 'message', message: await coordinator.send(caller, request.input) };
          }
          case 'cancel': {
            return { kind: 'task', task: await coordinator.cancel(caller, request.input) };
          }
          case 'resume': {
            return { kind: 'task', task: await coordinator.resume(caller, request.input) };
          }
        }
      } catch (error) {
        const code = error instanceof Error && 'code' in error ? String(error.code) : 'TASK_UNAVAILABLE';
        return {
          kind: 'refused',
          code: projectTaskRefusalCodes.find((value) => value === code) ?? 'TASK_UNAVAILABLE',
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };

  const drain = async (signal: AbortSignal): Promise<void> => {
    const ended = new Promise<void>((resolve) => {
      signal.addEventListener(
        'abort',
        () => {
          resolve();
        },
        { once: true },
      );
    });
    let followed = '';
    while (!signal.aborted) {
      // eslint-disable-next-line no-await-in-loop -- each pass waits for its outstanding admission answers.
      await Promise.race([Promise.allSettled(answering), ended]);
      const runs = [...entered]
        .filter(([, runIds]) => runIds.size > 0)
        .map(([chatId, runIds]) => [chatId, new Set(runIds)] as const);
      const pass = JSON.stringify(runs.map(([chatId, runIds]) => [chatId, [...runIds]]));
      // eslint-disable-next-line no-await-in-loop -- each pass observes the current owner and durable tasks.
      const coordinator = await taskCoordinator();
      // eslint-disable-next-line no-await-in-loop -- reads after each settlement pass.
      const snapshot = await coordinator.read({ kind: 'host', projectId });
      const active = snapshot.tasks.some((task) => activeTaskStatuses.has(task.attempts.at(-1)?.status ?? ''));
      if (pass === followed && !active) {
        return;
      }
      followed = pass;
      // oxlint-disable-next-line no-await-in-loop -- later passes follow runs admitted during earlier passes.
      await Promise.all(
        runs.map(async ([chatId, runIds]) => {
          // The terminal observation ends this follow.
          for await (const _event of followChat(requireLauncher().read, chatId, { signal, until: settled(runIds) })) {
            // The stream itself is the wait condition.
          }
        }),
      );
      if (active) {
        // eslint-disable-next-line no-await-in-loop -- each wake checks the current durable task reservation.
        await Promise.race([
          coordinator.wait({ kind: 'host', projectId }, { after: snapshot.cursor, timeout: 30_000 }, signal),
          ended,
        ]);
      }
    }
  };

  const closeBeforeLauncher = async (): Promise<boolean> => {
    closing = true;
    if (tasks !== undefined) {
      try {
        await tasks;
      } catch {
        /* A refused open has no recovered owner. */
      }
    }
    stopTaskFollowers.abort();
    await Promise.allSettled(taskFollowers.values());
    if (taskOwner === undefined) {
      return false;
    }
    try {
      await taskOwner.close();
      return false;
    } catch {
      return true;
    }
  };
  const closeAfterLauncher = async (retryTaskClose: boolean): Promise<void> => {
    ownerClosed.resolve();
    if (retryTaskClose) {
      await taskOwner?.close();
    }
  };

  return {
    decorateTools,
    wrapPlacement,
    bindLauncher: (value: AgentLauncher): void => {
      launcher = value;
    },
    hasEntered: (chatId: string, runId: string): boolean => entered.get(chatId)?.has(runId) === true,
    initialize,
    ready: taskCoordinator,
    execute,
    projectTasks,
    drain,
    closeBeforeLauncher,
    closeAfterLauncher,
  };
};
