import { z } from 'zod';
import { followChat, unsettledAttempts, jsonValueSchema } from '@taucad/agent-host';
import type {
  AgentSessionModel,
  HostToolDefinition,
  ToolRegistry,
  ChatLedger,
  TurnPlacementPort,
} from '@taucad/agent-host';
import type { AgentLauncher } from '@taucad/agent-host/launcher';
import {
  projectTaskActionSchema,
  projectTaskReadSchema,
  projectTaskSendSchema,
  projectTaskSpawnSchema,
  projectTaskWaitSchema,
  projectTaskToolGrantSchema,
  agentChannelModelSchema,
} from '@taucad/agent-host/wire';
import type { AgentChannelAdmissionConfig, ProjectTaskToolGrant } from '@taucad/agent-host/wire';
import { toolName } from '@taucad/chat/constants';
import type { ProjectTaskBackend, ProjectTaskLaunch } from '#project-tasks/backend.js';
import type { ProjectTaskCoordinator } from '#project-tasks/types.js';
import { formatProjectTaskMailboxMessage } from '#project-tasks/mailbox.js';

/** Canonical task tools shared by the internal registry and session-bound MCP. @internal */
export const projectTaskTools = [
  {
    name: toolName.taskSpawn,
    schema: projectTaskSpawnSchema,
    description:
      'Start a child agent in an isolated candidate from your admitted source revision. Reuse requestId when retrying the same request.',
  },
  {
    name: toolName.taskRead,
    schema: projectTaskReadSchema,
    description:
      'Read related tasks and durable messages after a project cursor. Omit taskId to discover permitted tasks; there is no self alias.',
  },
  {
    name: toolName.taskSend,
    schema: projectTaskSendSchema,
    description: 'Append a durable message to your parent or descendant. Busy agents receive it on their next turn.',
  },
  {
    name: toolName.taskWait,
    schema: projectTaskWaitSchema,
    description: 'Wait a bounded time for related task or mailbox changes after a cursor.',
  },
  {
    name: toolName.taskCancel,
    schema: projectTaskActionSchema,
    description: 'Cancel a descendant task and its subtree, preserving partial candidate work.',
  },
  {
    name: toolName.taskResume,
    schema: projectTaskActionSchema,
    description: 'Resume a terminal descendant with a new attempt and the same chat.',
  },
] as const;

const definitions: readonly HostToolDefinition[] = projectTaskTools.map(({ name, schema, description }) => ({
  name,
  description,
  inputSchema: z.record(z.string(), jsonValueSchema).parse(z.toJSONSchema(schema)),
}));

/**
 * Recover a legacy chat's recorded tool policy without granting task authority.
 * @param launcher - The sole canonical transcript owner.
 * @param chatId - The authenticated project chat.
 * @param runId - The canonical run being continued.
 * @returns The durable envelope, or undefined when no recorded policy can be recovered.
 * @internal
 */
export const readRecordedToolGrant = async (
  launcher: AgentLauncher,
  chatId: string,
  runId: string,
): Promise<ProjectTaskToolGrant | undefined> => {
  let cursor = 0;
  let grant: ProjectTaskToolGrant | undefined;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- canonical transcript pages preserve ordering.
    const page = await launcher.host.readEvents({ chatId, cursor, limit: 16, maxBytes: 1_048_576 });
    for (const event of page.events) {
      if (event.runId !== runId) {
        continue;
      }
      if (event.type === 'turn.history-projection-committed') {
        grant = projectTaskToolGrantSchema.parse({
          toolChoice: event.context.toolChoice ?? 'auto',
          ...(event.context.allowedTools === undefined ? {} : { allowedTools: event.context.allowedTools }),
        });
      } else if (event.type === 'run.lifecycle' && event.state === 'admitted') {
        const admission = z
          .object({ admission: z.object({ config: z.unknown().optional(), context: z.unknown().optional() }) })
          .safeParse(event);
        if (admission.success) {
          const envelope = z
            .object({ toolChoice: z.unknown().optional(), allowedTools: z.unknown().optional() })
            .safeParse(admission.data.admission.config ?? admission.data.admission.context);
          if (envelope.success) {
            grant = projectTaskToolGrantSchema.parse({
              ...envelope.data,
              toolChoice: envelope.data.toolChoice ?? 'auto',
            });
          }
        }
      }
    }
    if (page.nextCursor >= page.endCursor) {
      return grant;
    }
    cursor = page.nextCursor;
  }
};

/**
 * Add task dispatch with identity resolved exclusively from the host's active run binding.
 * @param registry - Existing rooted tools.
 * @param coordinator - The project's durable task authority.
 * @param chatForRun - Host-owned mapping from authenticated active run to chat.
 * @returns The same tool surface with authenticated task operations.
 * @internal
 */
export const withProjectTaskTools = (
  registry: ToolRegistry,
  coordinator: () => Promise<ProjectTaskCoordinator>,
  chatForRun: (runId: string) => string | undefined,
): ToolRegistry => ({
  ...registry,
  list: () => [...registry.list(), ...definitions],
  invoke: async (invocation) => {
    const tool = projectTaskTools.find(({ name }) => name === invocation.toolName);
    if (tool === undefined) {
      return registry.invoke(invocation);
    }
    try {
      invocation.signal.throwIfAborted();
      const tasks = await coordinator();
      const chatId = invocation.runId === undefined ? undefined : chatForRun(invocation.runId);
      const caller =
        chatId === undefined || invocation.runId === undefined
          ? undefined
          : tasks.callerFor({ chatId, runId: invocation.runId });
      if (caller === undefined) {
        return {
          isError: true,
          content: { errorCode: 'TASK_FORBIDDEN', message: 'This call has no active project task binding.' },
        };
      }
      let content: unknown;
      switch (tool.name) {
        case toolName.taskSpawn: {
          content = await tasks.spawn(caller, projectTaskSpawnSchema.parse(invocation.input));
          break;
        }
        case toolName.taskRead: {
          content = await tasks.read(caller, projectTaskReadSchema.parse(invocation.input));
          break;
        }
        case toolName.taskSend: {
          content = await tasks.send(caller, projectTaskSendSchema.parse(invocation.input));
          break;
        }
        case toolName.taskWait: {
          content = await tasks.wait(caller, projectTaskWaitSchema.parse(invocation.input), invocation.signal);
          break;
        }
        case toolName.taskCancel: {
          content = await tasks.cancel(caller, projectTaskActionSchema.parse(invocation.input));
          break;
        }
        case toolName.taskResume: {
          content = await tasks.resume(caller, projectTaskActionSchema.parse(invocation.input));
          break;
        }
      }
      return { isError: false, content: jsonValueSchema.parse(content) };
    } catch (error) {
      return {
        isError: true,
        content: {
          errorCode: error instanceof Error && 'code' in error ? String(error.code) : 'TASK_INVALID',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  },
});

/**
 * Compose task allocation and execution over the existing revisions and sole launcher.
 * @param options - Host-owned execution, placement, context and binding services.
 * @returns The coordinator's execution adapter.
 * @internal
 */
export const createProjectTaskBackend = (
  options: Readonly<{
    createCandidate: (
      input: Readonly<{ requestId: string; name: string; from: string; signal: AbortSignal }>,
    ) => Promise<Readonly<{ checkoutId: string; checkoutRoot: string }>>;
    launcher: () => AgentLauncher;
    agents: readonly string[];
    systemPrompt: string;
    tauModel: AgentSessionModel | undefined;
    resolveModel?:
      | ((input: Readonly<{ modelId: string; signal: AbortSignal }>) => Promise<AgentSessionModel | undefined>)
      | undefined;
    bind: (runId: string, chatId: string) => void;
    allocated: (checkoutId: string, root: string) => void;
    context: (
      checkoutId: string,
      signal: AbortSignal,
    ) => Promise<NonNullable<AgentChannelAdmissionConfig['contextPayload']>>;
    rememberGrant: (runId: string, grant: Pick<AgentChannelAdmissionConfig, 'toolChoice' | 'allowedTools'>) => void;
    released: (runId: string, checkoutId: string) => void | Promise<void>;
    waitForOwnerClose: () => Promise<void>;
    placement: TurnPlacementPort;
  }>,
): ProjectTaskBackend => ({
  validate: async (provider) => {
    if (
      provider.id === 'tau' &&
      provider.model !== undefined &&
      provider.model !== options.tauModel?.id &&
      options.resolveModel === undefined
    ) {
      throw Object.assign(
        new Error(
          'This Tau host cannot select the requested model. Use its configured model or configure that model on the host.',
        ),
        { code: 'TASK_UNAVAILABLE' },
      );
    }
    if (provider.id !== 'tau' && !options.agents.includes(provider.id)) {
      throw Object.assign(new Error(`Agent ${provider.id} is unavailable on this host.`), { code: 'TASK_UNAVAILABLE' });
    }
  },
  allocate: async ({ task, attempt, signal }) => {
    signal.throwIfAborted();
    let model: AgentSessionModel | undefined;
    if (task.provider.id === 'tau') {
      const modelId = task.provider.model;
      if (modelId === undefined) {
        if (options.tauModel === undefined) {
          throw Object.assign(new Error('Choose a Tau model in provider.model; this host has no default model.'), {
            code: 'TASK_UNAVAILABLE',
          });
        }
        model = options.tauModel;
      } else if (modelId === options.tauModel?.id) {
        model = options.tauModel;
      } else {
        const resolved = await options.resolveModel?.({ modelId, signal });
        if (resolved === undefined || resolved.id !== modelId) {
          throw Object.assign(new Error('The requested Tau model is unavailable on this host.'), {
            code: 'TASK_UNAVAILABLE',
          });
        }
        model = resolved;
      }
      const parsed = agentChannelModelSchema.safeParse(model);
      if (!parsed.success && model !== options.tauModel) {
        throw Object.assign(new Error('The selected Tau model has invalid admission metadata.'), {
          code: 'TASK_UNAVAILABLE',
        });
      }
      const selected = parsed.success ? parsed.data : model;
      model = Object.freeze({
        ...selected,
        ...(selected.cost === undefined ? {} : { cost: Object.freeze({ ...selected.cost }) }),
        ...(selected.reasoning === undefined ? {} : { reasoning: Object.freeze({ ...selected.reasoning }) }),
      });
    }
    signal.throwIfAborted();
    const result = await options.createCandidate({
      requestId: `task-${attempt.id}`,
      name: `task-${task.id}-${attempt.number}`,
      from: attempt.source.revisionId,
      signal,
    });
    const parsed = z.object({ checkoutId: z.string().min(1), checkoutRoot: z.string().min(1) }).safeParse(result);
    if (!parsed.success) {
      throw Object.assign(new Error('The revision owner did not allocate a private checkout.'), {
        code: 'TASK_SOURCE_UNAVAILABLE',
      });
    }
    const candidate = parsed.data;
    options.allocated(candidate.checkoutId, candidate.checkoutRoot);
    return { placementId: attempt.id, checkoutId: candidate.checkoutId, ...(model === undefined ? {} : { model }) };
  },
  start: async (launch, allocation) => {
    const { task, attempt, signal } = launch;
    const runId = attempt.id;
    options.bind(runId, task.chatId);
    const prompt = taskPrompt(launch, allocation.checkoutId);
    const contextPayload = await options.context(allocation.checkoutId, signal);
    signal.throwIfAborted();
    const grant = attempt.toolGrant;
    options.rememberGrant(runId, grant);
    const admissionModel =
      allocation.model === undefined ? undefined : agentChannelModelSchema.safeParse(allocation.model);
    const answer = await options.launcher().execute({
      type: 'start',
      commandId: `task-start-${attempt.id}`,
      payload: {
        chatId: task.chatId,
        runId,
        checkoutId: allocation.checkoutId,
        message: { id: `task-message-${attempt.id}`, role: 'user', content: prompt },
        trigger: 'submit',
        config: {
          systemPrompt: options.systemPrompt,
          ...grant,
          contextPayload,
          ...(task.provider.id === 'tau' && admissionModel?.success ? { model: admissionModel.data } : {}),
          ...(task.provider.id === 'tau'
            ? {}
            : {
                agent: {
                  kind: 'acp',
                  id: task.provider.id,
                  ...(task.provider.model === undefined ? {} : { model: task.provider.model }),
                },
              }),
        },
      },
    });
    if (answer.status === 'refused') {
      throw Object.assign(new Error(answer.message), { code: answer.code });
    }
    const cancel = async (): Promise<void> => {
      await options
        .launcher()
        .execute({ type: 'cancel', commandId: `task-cancel-${attempt.id}`, payload: { chatId: task.chatId, runId } });
    };
    const completion = (async (): Promise<{ status: 'completed' | 'failed' | 'cancelled'; detail?: string }> => {
      for await (const { ledger } of followChat(options.launcher().read, task.chatId, {
        signal: AbortSignal.timeout(24 * 60 * 60_000),
        until: (ledger) => {
          const run = ledger.runs[runId];
          return (
            run !== undefined &&
            ['completed', 'failed', 'cancelled'].includes(run.lifecycle ?? '') &&
            !unsettledAttempts(ledger).some((entry) => entry.runId === runId)
          );
        },
      })) {
        const run = ledger.runs[runId];
        if (
          run !== undefined &&
          ['completed', 'failed', 'cancelled'].includes(run.lifecycle ?? '') &&
          !unsettledAttempts(ledger).some((entry) => entry.runId === runId)
        ) {
          return {
            status:
              run.lifecycle === 'completed' ? 'completed' : run.lifecycle === 'cancelled' ? 'cancelled' : 'failed',
          };
        }
      }
      /* The launcher's public reads stop as close begins. Its canonical host still owns the terminal write and
       * placement acknowledgement; only that owner's completed close makes the retained final ledger authoritative. */
      await options.waitForOwnerClose();
      const ledger = await options.launcher().host.ledger(task.chatId);
      const run = ledger.runs[runId];
      if (
        run === undefined ||
        unsettledAttempts(ledger).some((entry) => entry.runId === runId) ||
        !['completed', 'failed', 'cancelled'].includes(run.lifecycle ?? '')
      ) {
        throw Object.assign(new Error('The task owner closed without a durable placement settlement.'), {
          code: 'TASK_BUSY',
        });
      }
      return {
        status: run.lifecycle === 'completed' ? 'completed' : run.lifecycle === 'cancelled' ? 'cancelled' : 'failed',
      };
    })();
    if (signal.aborted) {
      await cancel();
    }
    return { runId, completion, cancel };
  },
  release: async ({ task, attempt, allocation }) => {
    let ledger: ChatLedger;
    try {
      ledger = await options.launcher().host.ledger(task.chatId);
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'HOST_CLOSED')) {
        throw error;
      }
      await options.waitForOwnerClose();
      ledger = await options.launcher().host.ledger(task.chatId);
    }
    const runId = attempt.runId ?? attempt.id;
    const run = ledger.runs[runId];
    if (
      run !== undefined &&
      (!['completed', 'failed', 'cancelled'].includes(run.lifecycle ?? '') ||
        unsettledAttempts(ledger).some((entry) => entry.runId === runId))
    ) {
      throw Object.assign(new Error('The task placement is not durably settled; its reservation remains held.'), {
        code: 'TASK_BUSY',
      });
    }
    await waitForTaskLeaseRetirement(options.placement, task.chatId, { runId });
    await options.released(attempt.runId ?? attempt.id, allocation.checkoutId);
  },
  reconcile: async ({ task, attempt }) => {
    await options
      .launcher()
      .execute({ type: 'attach', commandId: `task-reconcile-${task.id}`, payload: { chatId: task.chatId } });
    if (attempt.runId !== undefined) {
      await options.launcher().execute({
        type: 'cancel',
        commandId: `task-recovery-cancel-${attempt.id}`,
        payload: { chatId: task.chatId, runId: attempt.runId },
      });
      const { runId } = attempt;
      const ended = (ledger: ChatLedger): boolean => {
        const run = ledger.runs[runId];
        return (
          run === undefined ||
          (['completed', 'failed', 'cancelled'].includes(run.lifecycle ?? '') &&
            !unsettledAttempts(ledger).some((entry) => entry.runId === runId))
        );
      };
      if (ended(await options.launcher().host.ledger(task.chatId))) {
        await waitForTaskLeaseRetirement(options.placement, task.chatId, { runId });
        return undefined;
      }
      for await (const { ledger } of followChat(options.launcher().read, task.chatId, {
        signal: AbortSignal.timeout(30_000),
        until: ended,
      })) {
        if (ended(ledger)) {
          await waitForTaskLeaseRetirement(options.placement, task.chatId, { runId });
          return undefined;
        }
      }
      throw Object.assign(new Error('The existing launcher has not settled this task yet.'), { code: 'TASK_BUSY' });
    }
    return undefined;
  },
});

/**
 * Observe retirement through the existing placement owner: the settlement row precedes its acknowledgement.
 * @param placement - The same port that admitted and settles the run.
 * @param chatId - The authenticated task chat.
 * @param run - The admitted run and optional follower signal; the reservation is retained until acknowledgement.
 * @returns Once the existing owner confirms that it holds no lease for the run.
 * @internal
 */
export const waitForTaskLeaseRetirement = async (
  placement: TurnPlacementPort,
  chatId: string,
  run: { runId: string; signal?: AbortSignal },
): Promise<void> => {
  const { runId, signal } = run;
  const deadline = signal === undefined ? Date.now() + 1000 : undefined;
  for (;;) {
    signal?.throwIfAborted();
    // oxlint-disable-next-line no-await-in-loop -- each owner observation must follow the prior acknowledgement opportunity.
    const answer = await placement.reconcile({ requestId: `task-release-${runId}`, chatId });
    signal?.throwIfAborted();
    if (answer.status === 'applied' && !answer.held.some((entry) => entry.key.runId === runId)) {
      return;
    }
    if (answer.status !== 'applied' || (deadline !== undefined && Date.now() >= deadline)) {
      throw Object.assign(
        new Error('The task placement has not acknowledged retirement; its reservation remains held.'),
        {
          code: 'TASK_BUSY',
          ...(answer.status === 'applied' ? {} : { cause: answer }),
        },
      );
    }
    // oxlint-disable-next-line no-await-in-loop -- bounded spacing prevents concurrent queries against the same owner.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 25);
    });
  }
};

/**
 * Keep host-owned execution identity and mailbox content distinguishable from the task's instruction.
 * @internal
 * @param launch - The admitted task and bounded mailbox batch.
 * @param candidateCheckoutId - The checkout allocated for this execution.
 * @returns Host context, task instruction and durable message envelopes.
 */
const taskPrompt = (launch: ProjectTaskLaunch, candidateCheckoutId: string): string => {
  const { task, attempt, messages } = launch;
  const context = {
    projectId: task.projectId,
    taskId: task.id,
    ...(task.parentTaskId === undefined ? {} : { parentTaskId: task.parentTaskId }),
    attemptId: attempt.id,
    attemptNumber: attempt.number,
    candidateCheckoutId,
    sourceRevisionId: attempt.source.revisionId,
    sourceCheckoutId: attempt.source.checkoutId,
  };
  return [
    `Task execution context: ${JSON.stringify(context)}`,
    'File tools and CAD execution are rooted in the assigned candidate checkout. Revision history and describe report the project live history, not this executing checkout.',
    task.prompt,
    ...messages.map((message) => `\n${formatProjectTaskMailboxMessage(message)}`),
  ].join('\n');
};
