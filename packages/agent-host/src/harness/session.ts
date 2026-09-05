import { Agent } from '@earendil-works/pi-agent-core';
import type { AgentEvent, AgentMessage, StreamFn } from '@earendil-works/pi-agent-core';
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai';
import type {
  Api,
  AssistantMessage,
  Context,
  Model,
  ModelCostRates,
  Models,
  StopReason,
  ToolCall,
  Usage,
} from '@earendil-works/pi-ai';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type {
  AgentLiveEvent,
  DurableEventLog,
  HostRunSnapshot,
  HostToolDefinition,
  ModelStreamEvent,
  ModelTransport,
  ToolRegistry,
} from '#waist/ports.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type {
  AgentToolChoice,
  JsonObject,
  JsonValue,
  ModelProviderKind,
  ProviderMessage,
  ProviderMessageMetadata,
  RunFailureDetail,
  RunLifecycleState,
  TurnContextSnapshot,
  UserProviderMessage,
} from '#log/event-types.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import {
  createTurnContextSnapshot,
  createToolResultTrimmerMiddleware,
  latexDelimiterMiddleware,
} from '#harness/cad-middleware.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { ClientContext, RecentSkillsPort } from '#harness/cad-middleware.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { installCompaction } from '#harness/compaction.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { CompactionOutcome, CompactionSummarizer } from '#harness/compaction.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { composeModelCallMiddleware } from '#harness/model-call-middleware.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { ModelCallMiddleware } from '#harness/model-call-middleware.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { createAgentSafeguards } from '#harness/safeguards.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { SafeguardOutcome, SafeguardThresholds } from '#harness/safeguards.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import {
  createSessionRecord,
  createProviderMetadataDiagnostic,
  createLiveMessageIdentityDiagnostic,
  createTransportFailureDiagnostic,
  createPortableId,
  piMessageToProvider,
  providerMessageToPi,
  toJsonValue,
  toolInputToProvider,
  transportFailureFromProviderMessages,
} from '#harness/session-record.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { MessageIdentities, SessionRecord } from '#harness/session-record.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { applyHostToolResult, createAgentTools, normalizeToolInput } from '#harness/tools.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { ToolResultSubstituter } from '#harness/tools.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { createInterruptRecoveryMessage } from '#harness/interrupt-recovery.js';

const zeroUsage: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

const modelFor = (options: AgentSessionModel): Model<Api> => ({
  id: options.id,
  name: options.id,
  // Matches the gateway transport's non-anthropic wire (piModelFor) so durable
  // metadata records the codec the request actually used — direct OpenAI rows
  // leave over the Responses wire, every OpenAI-compatible provider over
  // completions.
  api: options.api ?? (options.providerKind === 'openai' ? 'openai-responses' : 'openai-completions'),
  provider: options.provider ?? 'tau-gateway',
  baseUrl: '',
  reasoning: true,
  input: ['text', 'image'],
  cost: options.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: options.contextWindow,
  maxTokens: options.maxTokens ?? 8192,
});

const providerHistory = (
  messages: readonly AgentMessage[],
  options: {
    readonly identities: MessageIdentities;
    readonly toolInputIds: Map<string, string>;
    readonly createId: () => string;
  },
): ProviderMessage[] =>
  messages.flatMap((message) => {
    const provider = piMessageToProvider(message, options.identities);
    if (message.role !== 'assistant') {
      return [provider];
    }
    const calls = message.content.flatMap((block) => {
      if (block.type !== 'toolCall') {
        return [];
      }
      const id = options.toolInputIds.get(block.id) ?? options.createId();
      options.toolInputIds.set(block.id, id);
      return [
        toolInputToProvider({
          id,
          toolCallId: block.id,
          toolName: block.name,
          input: normalizeToolInput(block.name, block.arguments),
        }),
      ];
    });
    return [provider, ...calls];
  });

const hostTools = (context: Context): HostToolDefinition[] =>
  (context.tools ?? []).map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.parameters as JsonObject,
  }));

const createPartial = (model: Model<Api>): AssistantMessage => ({
  role: 'assistant',
  content: [],
  api: model.api,
  provider: model.provider,
  model: model.id,
  usage: zeroUsage,
  stopReason: 'stop',
  timestamp: Date.now(),
});

type CreateTransportStreamOptions = {
  readonly transport: ModelTransport;
  readonly providerKind?: ModelProviderKind | undefined;
  readonly identities: MessageIdentities;
  readonly toolInputIds: Map<string, string>;
  readonly createId: () => string;
  readonly committedContext?: (() => TurnContextSnapshot | undefined) | undefined;
  readonly usePostCompactionContext?: (() => boolean) | undefined;
  readonly systemPromptBlocks?: (() => TurnContextSnapshot['systemPromptBlocks']) | undefined;
  readonly onLiveDelta?: ((event: Omit<AgentLiveEvent, 'chatId' | 'runId'>) => void | Promise<void>) | undefined;
};

/** Adapt the W3 model transport into pi's provider event protocol. @public */
export const createTransportStreamFunction =
  (options: CreateTransportStreamOptions): StreamFn =>
  (model, context, streamOptions) => {
    const output = createAssistantMessageEventStream();
    const signal = streamOptions?.signal ?? new AbortController().signal;
    const messageId = options.createId();
    const pump = async (): Promise<void> => {
      let partial = createPartial(model);
      let active: { readonly kind: 'text' | 'thinking'; readonly index: number } | undefined;
      let terminalReason: StopReason | undefined;
      let transportMetadata: ProviderMessageMetadata | undefined;
      let usageSettled = false;
      output.push({ type: 'start', partial });

      const updateBlock = (index: number, block: AssistantMessage['content'][number]): void => {
        const content = [...partial.content];
        content[index] = block;
        partial = { ...partial, content };
      };

      const closeActive = (): void => {
        if (!active) {
          return;
        }
        const block = partial.content[active.index];
        if (active.kind === 'text' && block?.type === 'text') {
          output.push({ type: 'text_end', contentIndex: active.index, content: block.text, partial });
        } else if (active.kind === 'thinking' && block?.type === 'thinking') {
          output.push({ type: 'thinking_end', contentIndex: active.index, content: block.thinking, partial });
        }
        active = undefined;
      };

      const assertBeforeTerminal = (eventType: ModelStreamEvent['type']): void => {
        if (terminalReason !== undefined) {
          throw new Error(`Model transport emitted ${eventType} after a completed event.`);
        }
      };

      try {
        const committedContext = options.committedContext?.();
        const events = options.transport.stream({
          modelId: model.id,
          modelCost: model.cost,
          providerKind: options.providerKind,
          maxTokens: model.maxTokens,
          systemPrompt: committedContext?.systemPrompt ?? context.systemPrompt ?? '',
          systemPromptBlocks: committedContext?.systemPromptBlocks ?? options.systemPromptBlocks?.(),
          messages: [
            ...(committedContext
              ? options.usePostCompactionContext?.()
                ? committedContext.postCompactionMessages
                : committedContext.initialMessages
              : []),
            ...providerHistory(context.messages as AgentMessage[], options),
          ],
          tools: hostTools(context),
          signal,
        });
        for await (const event of events) {
          assertBeforeTerminal(event.type);
          if (event.type === 'message-metadata') {
            transportMetadata = { ...transportMetadata, ...event.metadata };
            continue;
          }
          if (event.type === 'text-delta') {
            if (active?.kind !== 'text') {
              closeActive();
              const index = partial.content.length;
              active = { kind: 'text', index };
              updateBlock(index, { type: 'text', text: '' });
              output.push({ type: 'text_start', contentIndex: index, partial });
            }
            const block = partial.content[active.index];
            if (block?.type === 'text') {
              updateBlock(active.index, { ...block, text: block.text + event.text });
              await options.onLiveDelta?.({
                type: 'text-delta',
                messageId,
                contentIndex: active.index,
                delta: event.text,
              });
              output.push({ type: 'text_delta', contentIndex: active.index, delta: event.text, partial });
            }
            continue;
          }
          if (event.type === 'thinking-delta') {
            if (active?.kind !== 'thinking') {
              closeActive();
              const index = partial.content.length;
              active = { kind: 'thinking', index };
              updateBlock(index, {
                type: 'thinking',
                thinking: '',
                ...(event.signature === undefined ? {} : { thinkingSignature: event.signature }),
              });
              output.push({ type: 'thinking_start', contentIndex: index, partial });
            }
            const block = partial.content[active.index];
            if (block?.type === 'thinking') {
              updateBlock(active.index, {
                ...block,
                thinking: block.thinking + event.text,
                ...(event.signature === undefined ? {} : { thinkingSignature: event.signature }),
              });
              await options.onLiveDelta?.({
                type: 'thinking-delta',
                messageId,
                contentIndex: active.index,
                delta: event.text,
              });
              output.push({ type: 'thinking_delta', contentIndex: active.index, delta: event.text, partial });
            }
            continue;
          }
          if (event.type === 'tool-input') {
            closeActive();
            const contentIndex = partial.content.length;
            const toolCall: ToolCall = {
              type: 'toolCall',
              id: event.toolCallId,
              name: event.toolName,
              arguments: event.input as Record<string, unknown>,
            };
            output.push({ type: 'toolcall_start', contentIndex, partial });
            updateBlock(contentIndex, toolCall);
            output.push({ type: 'toolcall_delta', contentIndex, delta: JSON.stringify(event.input), partial });
            output.push({ type: 'toolcall_end', contentIndex, toolCall, partial });
            continue;
          }
          if (event.type === 'usage') {
            partial = { ...partial, usage: event.usage };
            usageSettled = true;
            continue;
          }
          closeActive();
          terminalReason = event.stopReason;
        }
        if (terminalReason === undefined) {
          throw new Error('Model transport ended without a completed event.');
        }
        if (terminalReason === 'pending') {
          throw new Error('Model transport cannot complete with a pending stop reason.');
        }
        const stopReason = terminalReason;
        partial = {
          ...partial,
          stopReason,
          diagnostics: [
            ...(partial.diagnostics ?? []),
            createLiveMessageIdentityDiagnostic(messageId, partial.timestamp),
          ],
          ...(stopReason === 'error' || stopReason === 'aborted'
            ? { errorMessage: `Model transport stopped with ${stopReason}.` }
            : {}),
        };
        const durableMetadata: ProviderMessageMetadata | undefined =
          stopReason === 'aborted' && !usageSettled
            ? { ...transportMetadata, usageUnsettled: { type: 'tau.usage-unsettled', reason: 'aborted' } }
            : transportMetadata;
        if (durableMetadata) {
          partial = {
            ...partial,
            diagnostics: [
              ...(partial.diagnostics ?? []),
              createProviderMetadataDiagnostic(durableMetadata, partial.timestamp),
            ],
          };
          options.identities.set(partial, options.identities.id(partial), durableMetadata);
        }
        if (stopReason === 'error' || stopReason === 'aborted') {
          output.push({ type: 'error', reason: stopReason, error: partial });
        } else {
          output.push({ type: 'done', reason: stopReason, message: partial });
        }
      } catch (error) {
        closeActive();
        const reason = signal.aborted ? 'aborted' : 'error';
        const diagnostic = createTransportFailureDiagnostic(error, Date.now());
        const failure: AssistantMessage = {
          ...partial,
          stopReason: reason,
          errorMessage: error instanceof Error ? error.message : String(error),
          diagnostics: [
            ...(partial.diagnostics ?? []),
            createLiveMessageIdentityDiagnostic(messageId, partial.timestamp),
            ...(diagnostic ? [diagnostic] : []),
          ],
        };
        const durableMetadata: ProviderMessageMetadata | undefined =
          reason === 'aborted' && !usageSettled
            ? { ...transportMetadata, usageUnsettled: { type: 'tau.usage-unsettled', reason: 'aborted' } }
            : transportMetadata;
        if (durableMetadata) {
          failure.diagnostics = [
            ...(failure.diagnostics ?? []),
            createProviderMetadataDiagnostic(durableMetadata, failure.timestamp),
          ];
          options.identities.set(failure, options.identities.id(failure), durableMetadata);
        }
        output.push({ type: 'error', reason, error: failure });
      }
    };
    void pump();
    return output;
  };

const asMiddleware =
  (wrap: (base: StreamFn) => StreamFn): ModelCallMiddleware =>
  async (request, next) =>
    wrap(async (model, context, streamOptions) => next({ model, context, options: streamOptions }))(
      request.model,
      request.context,
      request.options,
    );

const compactionModelsWithTransport = (options: {
  readonly transport: ModelTransport;
  readonly providerKind?: ModelProviderKind | undefined;
  readonly identities: MessageIdentities;
  readonly toolInputIds: Map<string, string>;
  readonly createId: () => string;
}): Models => {
  const models: Pick<Models, 'completeSimple'> = {
    completeSimple: async (model, context, streamOptions): Promise<AssistantMessage> => {
      let summary = '';
      let usage = zeroUsage;
      let stopReason: StopReason | undefined;
      const signal = streamOptions?.signal ?? new AbortController().signal;
      try {
        const stream = options.transport.stream({
          modelId: model.id,
          modelCost: model.cost,
          providerKind: options.providerKind,
          maxTokens: streamOptions?.maxTokens ?? model.maxTokens,
          systemPrompt: context.systemPrompt ?? '',
          messages: providerHistory(context.messages as AgentMessage[], options),
          tools: [],
          signal,
        });
        for await (const event of stream) {
          if (stopReason !== undefined) {
            throw new Error('Compaction summary must complete exactly once with stop; received a post-terminal event.');
          }
          switch (event.type) {
            case 'text-delta': {
              summary += event.text;
              break;
            }
            case 'usage': {
              usage = event.usage;
              break;
            }
            case 'tool-input': {
              throw new Error('Compaction summary emitted a tool call.');
            }
            case 'completed': {
              stopReason = event.stopReason;
              break;
            }
            case 'message-metadata': {
              break;
            }
            case 'thinking-delta': {
              break;
            }
          }
        }
        if (stopReason !== 'stop' || !summary.trim()) {
          const detail =
            stopReason === undefined
              ? 'the stream ended prematurely'
              : stopReason === 'stop'
                ? 'the model returned an empty summary'
                : `received ${stopReason}`;
          return {
            role: 'assistant',
            content: [],
            api: model.api,
            provider: model.provider,
            model: model.id,
            usage,
            stopReason: stopReason === 'aborted' ? 'aborted' : 'error',
            errorMessage: `Compaction summary must complete exactly once with stop; ${detail}.`,
            timestamp: Date.now(),
          };
        }
        return {
          role: 'assistant',
          content: [{ type: 'text', text: summary }],
          api: model.api,
          provider: model.provider,
          model: model.id,
          usage,
          stopReason: 'stop',
          timestamp: Date.now(),
        };
      } catch (error) {
        return {
          role: 'assistant',
          content: [],
          api: model.api,
          provider: model.provider,
          model: model.id,
          usage,
          stopReason: signal.aborted ? 'aborted' : 'error',
          errorMessage: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
        };
      }
    },
  };
  return models as Models;
};

/** Portable pi model identity used by the waist adapter. @public */
export type AgentSessionModel = {
  readonly id: string;
  readonly contextWindow: number;
  readonly maxTokens?: number | undefined;
  readonly cost?: ModelCostRates | undefined;
  readonly api?: Api | undefined;
  readonly provider?: string | undefined;
  readonly providerKind?: ModelProviderKind | undefined;
};

/** Dependencies and host context needed to create one pi-backed session. @public */
export type CreateAgentSessionOptions = {
  readonly chatId: string;
  readonly runId: string;
  readonly leaderEpoch: string;
  readonly systemPrompt: string;
  readonly systemPromptBlocks?: TurnContextSnapshot['systemPromptBlocks'];
  readonly model: AgentSessionModel;
  readonly modelTransport: ModelTransport;
  readonly toolRegistry: ToolRegistry;
  readonly toolChoice?: AgentToolChoice | undefined;
  readonly allowedTools?: readonly string[] | undefined;
  readonly snapshot?: JsonValue | undefined;
  readonly contextMessages?: readonly UserProviderMessage[] | undefined;
  readonly eventLog: DurableEventLog;
  readonly clientContext?: ClientContext | undefined;
  readonly recentSkills?: RecentSkillsPort | undefined;
  readonly substituteToolResult?: ToolResultSubstituter | undefined;
  readonly summarize?: CompactionSummarizer | undefined;
  readonly safeguardThresholds?: Partial<SafeguardThresholds> | undefined;
  readonly onSafeguardOutcome?: ((outcome: SafeguardOutcome) => Promise<void>) | undefined;
  readonly allowImageBlocks?: boolean | undefined;
  readonly createId?: (() => string) | undefined;
  readonly now?: (() => Date) | undefined;
  readonly onCompaction?: ((outcome: CompactionOutcome) => void) | undefined;
  readonly onLiveEvent?: ((event: AgentLiveEvent) => void | Promise<void>) | undefined;
};

/** Active pi session bound to Tau's portable waist. @public */
export type AgentSession = {
  readonly agent: Agent;
  prompt(message: UserProviderMessage, onAdmitted?: () => void): Promise<void>;
  steer(message: string): void;
  abort(): void;
  snapshot(): Promise<HostRunSnapshot>;
  close(): Promise<void>;
};

const lastLifecycleState = (
  events: ReadonlyArray<{
    readonly type: string;
    readonly runId: string;
    readonly state?: RunLifecycleState;
  }>,
  runId: string,
): RunLifecycleState => {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event?.runId === runId && event.type === 'run.lifecycle' && event.state) {
      return event.state;
    }
  }
  return 'admitted';
};

const appendAgentEvent = async (options: {
  readonly event: AgentEvent;
  readonly record: SessionRecord;
  readonly toolInputIds: Map<string, string>;
  readonly createId: () => string;
}): Promise<void> => {
  const { event, record } = options;
  if (event.type === 'message_end') {
    await record.append({ type: 'message.appended', message: piMessageToProvider(event.message, record.messages) });
    return;
  }
  if (event.type === 'tool_execution_start') {
    const id = options.toolInputIds.get(event.toolCallId) ?? options.createId();
    options.toolInputIds.set(event.toolCallId, id);
    await record.append({
      type: 'message.appended',
      message: toolInputToProvider({
        id,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        input: normalizeToolInput(event.toolName, event.args),
      }),
    });
  }
};

/**
 * Recover the typed reason a terminal run failed.
 *
 * Prefers the coded transport refusal carried on the final assistant message's
 * diagnostics — the same shape {@link HostRunSnapshot.failure} exposes — and
 * falls back to pi's plain `errorMessage` for a failure that carried no code.
 */
const runFailureDetail = async (
  final: AgentMessage | undefined,
  record: SessionRecord,
): Promise<RunFailureDetail | undefined> => {
  const typed = transportFailureFromProviderMessages(await record.history());
  if (typed) {
    return typed;
  }
  const message = final?.role === 'assistant' ? final.errorMessage : undefined;
  return message === undefined || message === '' ? undefined : { message };
};

/** Bind pi's loop to the W1/W3/W4 waist without creating a second session log. @public */
export const createAgentSession = async (options: CreateAgentSessionOptions): Promise<AgentSession> => {
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? createPortableId;
  const record = await createSessionRecord({
    log: options.eventLog,
    runId: options.runId,
    leaderEpoch: options.leaderEpoch,
    createId,
    now: () => now().toISOString(),
  });
  const initialHistory = await record.history();
  const initialEvents = await record.events();
  const initialProjection = initialEvents.findLast(
    (event) => event.runId === options.runId && event.type === 'turn.history-projection-committed',
  );
  let committedContext =
    initialProjection?.type === 'turn.history-projection-committed' ? initialProjection.context : undefined;
  const effectiveModel = committedContext?.model ?? options.model;
  const model = modelFor(effectiveModel);
  const hydrateHistory = (history: readonly ProviderMessage[]): AgentMessage[] =>
    history.flatMap((message) => {
      const hydrated = providerMessageToPi(message, model, record.messages);
      return hydrated ? [hydrated] : [];
    });
  const initialMessages = hydrateHistory(initialHistory);
  const toolInputIds = new Map(
    initialHistory.flatMap((message) =>
      message.role === 'tool-input' ? [[message.toolCallId, message.id] as const] : [],
    ),
  );
  const safeguards = createAgentSafeguards({
    thresholds: options.safeguardThresholds,
    recordOutcome: options.onSafeguardOutcome,
    firedSignatures: initialEvents.flatMap((event) => (event.type === 'safeguard.recorded' ? [event.safeguardId] : [])),
    record: async (decision, reminder) => {
      if (decision.kind === 'terminate') {
        await record.append({
          type: 'safeguard.recorded',
          safeguardId: decision.signature,
          action: 'terminate',
          reason: decision.reason,
        });
        return;
      }
      if (reminder?.role !== 'user') {
        throw new TypeError('A safeguard nudge must commit the exact user reminder it delivers.');
      }
      const id = `tau:safeguard:${decision.signature}`;
      const metadata = {
        tauInternal: {
          kind: 'safeguard',
          anchorId: decision.signature,
          pruning: 'preserve-until-compaction',
        },
        timestamp: reminder.timestamp,
      } as const;
      record.messages.set(reminder, id, metadata);
      await record.append({
        type: 'safeguard.recorded',
        safeguardId: decision.signature,
        action: 'nudge',
        reason: decision.reminder,
        message: { id, role: 'user', content: toJsonValue(reminder.content), metadata },
      });
    },
  });
  const toolChoice = committedContext?.toolChoice ?? options.toolChoice ?? 'auto';
  const allowedTools = committedContext?.allowedTools ?? options.allowedTools;
  const allowed = new Set(allowedTools ?? options.toolRegistry.list().map((tool) => tool.name));
  const selectedTools = new Set(
    toolChoice === 'none' || toolChoice === 'custom'
      ? toolChoice === 'custom'
        ? allowed
        : []
      : Array.isArray(toolChoice)
        ? (toolChoice as readonly string[]).filter((name) => allowed.has(name))
        : allowed,
  );
  const toolRegistry: ToolRegistry = {
    list: () => options.toolRegistry.list().filter((tool) => selectedTools.has(tool.name)),
    invoke: async (invocation) =>
      selectedTools.has(invocation.toolName)
        ? options.toolRegistry.invoke(invocation)
        : { content: { errorCode: 'TOOL_NOT_FOUND', message: `Unknown tool: ${invocation.toolName}` }, isError: true },
  };
  const tools = createAgentTools({ registry: toolRegistry, substitute: options.substituteToolResult });
  let restoreRecentSkillContent = false;
  const base = createTransportStreamFunction({
    transport: options.modelTransport,
    providerKind: effectiveModel.providerKind,
    identities: record.messages,
    toolInputIds,
    createId,
    committedContext: () => committedContext,
    usePostCompactionContext: () => restoreRecentSkillContent,
    systemPromptBlocks: () => options.systemPromptBlocks,
    onLiveDelta: options.onLiveEvent
      ? async (event) => options.onLiveEvent?.({ ...event, chatId: options.chatId, runId: options.runId })
      : undefined,
  });
  const agent = new Agent({
    streamFn: base,
    initialState: {
      model,
      systemPrompt: committedContext?.systemPrompt ?? options.systemPrompt,
      messages: initialMessages,
      tools,
    },
    afterToolCall: async (context) => applyHostToolResult(context),
  });
  agent.prepareNextTurn = async () => {
    const reminder = await createInterruptRecoveryMessage({
      messages: await record.history(),
      timestamp: now().getTime(),
    });
    if (!reminder) {
      return undefined;
    }
    await record.append({ type: 'message.appended', message: reminder });
    const hydrated = providerMessageToPi(reminder, model, record.messages);
    return {
      context: {
        systemPrompt: agent.state.systemPrompt,
        messages: [...agent.state.messages, hydrated],
        tools: agent.state.tools,
      },
    };
  };
  const compaction = installCompaction({
    agent,
    record,
    contextWindow: effectiveModel.contextWindow,
    summarize: options.summarize,
    models: options.summarize
      ? undefined
      : compactionModelsWithTransport({
          transport: options.modelTransport,
          providerKind: effectiveModel.providerKind,
          identities: record.messages,
          toolInputIds,
          createId,
        }),
    onSummary: () => {
      restoreRecentSkillContent = true;
    },
    onCompaction: options.onCompaction,
    now: () => now().getTime(),
  });
  agent.transformContext = async (messages, signal) => {
    const safeguarded = await safeguards.transformContext(messages);
    const compacted = await compaction.transformContext(messages, signal);
    return safeguarded.length === messages.length ? compacted : [...compacted, ...safeguarded.slice(messages.length)];
  };
  agent.streamFunction = composeModelCallMiddleware(base, [
    createToolResultTrimmerMiddleware({ allowImageBlocks: options.allowImageBlocks }),
    asMiddleware(safeguards.wrapStreamFn),
    latexDelimiterMiddleware,
    asMiddleware(compaction.wrapStreamFn),
  ]);

  let state = lastLifecycleState(initialEvents, options.runId);
  let turnId = initialHistory.findLast((message) => message.role === 'user')?.id ?? options.runId;
  let terminalRecorded = state === 'completed' || state === 'failed' || state === 'cancelled';
  let abortRequested = false;
  const wasAbortRequested = (): boolean => abortRequested;
  agent.subscribe(async (event) => {
    await appendAgentEvent({ event, record, toolInputIds, createId });
    if (event.type !== 'agent_end') {
      return;
    }
    const final = [...event.messages].reverse().find((message) => message.role === 'assistant');
    state =
      abortRequested || (final?.role === 'assistant' && final.stopReason === 'aborted')
        ? 'cancelled'
        : final?.role === 'assistant' && final.stopReason === 'error'
          ? 'failed'
          : 'completed';
    // Without this the durable log said only "failed": the typed transport code
    // and its message were stranded on the assistant message's diagnostics, and
    // every client could render was a generic host-failure string.
    const detail = state === 'failed' ? await runFailureDetail(final, record) : undefined;
    await record.append({ type: 'run.lifecycle', state, ...(detail === undefined ? {} : { detail }) });
    terminalRecorded = true;
  });

  return {
    agent,
    prompt: async (message, onAdmitted) => {
      if (terminalRecorded) {
        throw new Error(`Run ${options.runId} is already terminal.`);
      }
      turnId = message.id;
      state = 'admitted';
      await record.append({ type: 'run.lifecycle', state });
      if (wasAbortRequested()) {
        state = 'cancelled';
        await record.append({ type: 'run.lifecycle', state });
        terminalRecorded = true;
        onAdmitted?.();
        return;
      }
      const context = await createTurnContextSnapshot({
        chatId: options.chatId,
        systemPrompt: options.systemPrompt,
        systemPromptBlocks: options.systemPromptBlocks,
        // Project the session model onto the durable TurnModelConfig subset —
        // AgentSessionModel carries transport-only fields (api, provider) the
        // strict event schema deliberately excludes.
        model: {
          id: options.model.id,
          contextWindow: options.model.contextWindow,
          ...(options.model.maxTokens === undefined ? {} : { maxTokens: options.model.maxTokens }),
          ...(options.model.providerKind === undefined ? {} : { providerKind: options.model.providerKind }),
          ...(options.model.cost === undefined ? {} : { cost: options.model.cost }),
        },
        toolChoice: options.toolChoice,
        allowedTools: options.allowedTools,
        snapshot: options.snapshot,
        contextMessages: options.contextMessages,
        clientContext: options.clientContext,
        recentSkills: options.recentSkills,
      });
      const beforeCompaction = await record.history();
      await compaction.prepareTurn(hydrateHistory(beforeCompaction));
      const retainedHistory = await record.history();
      const retainedMessageIds = retainedHistory.map((retained) => retained.id);
      await record.append({
        type: 'turn.history-projection-committed',
        retainedMessageIds,
        message,
        context,
      });
      if (wasAbortRequested()) {
        state = 'cancelled';
        await record.append({ type: 'run.lifecycle', state });
        terminalRecorded = true;
        onAdmitted?.();
        return;
      }
      const projectedEvents = await record.events();
      const projection = projectedEvents.findLast(
        (event) => event.runId === options.runId && event.type === 'turn.history-projection-committed',
      );
      committedContext = projection?.type === 'turn.history-projection-committed' ? projection.context : undefined;
      if (!committedContext) {
        throw new Error(`Run ${options.runId} has no committed turn context after admission.`);
      }
      state = 'running';
      await record.append({ type: 'run.lifecycle', state });
      onAdmitted?.();
      if (wasAbortRequested()) {
        state = 'cancelled';
        await record.append({ type: 'run.lifecycle', state });
        terminalRecorded = true;
        return;
      }
      agent.state.systemPrompt = committedContext.systemPrompt;
      agent.state.messages = hydrateHistory(await record.history());
      await agent.continue();
    },
    steer: (message) => {
      agent.steer({ role: 'user', content: message, timestamp: now().getTime() });
    },
    abort: () => {
      abortRequested = true;
      agent.abort();
    },
    snapshot: async () => {
      const messages = await record.history();
      const failure = transportFailureFromProviderMessages(messages);
      return {
        chatId: options.chatId,
        runId: options.runId,
        turnId,
        state,
        messages,
        ...(failure ? { failure } : {}),
      };
    },
    close: async () => options.eventLog.close(),
  };
};
