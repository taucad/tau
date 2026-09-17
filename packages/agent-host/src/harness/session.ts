import { Agent } from '@earendil-works/pi-agent-core';
import type { AgentEvent, AgentMessage, AgentToolResult, StreamFn } from '@earendil-works/pi-agent-core';
import { createAssistantMessageEventStream, validateToolArguments } from '@earendil-works/pi-ai';
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
import type {
  AgentLiveEvent,
  AgentLiveEventPayload,
  DurableEventLog,
  HostRunSnapshot,
  HostToolDefinition,
  ModelInvocationBinding,
  ModelStreamEvent,
  MaterializedDocument,
  ModelTransport,
  ToolRegistry,
} from '#waist/ports.js';
import type {
  AgentToolChoice,
  JsonObject,
  JsonValue,
  ModelProviderKind,
  ModelReasoningConfig,
  ProviderMessage,
  ProviderMessageMetadata,
  RunFailureDetail,
  RunLifecycleState,
  TurnContextSnapshot,
  TurnModelConfig,
  UserProviderMessage,
} from '#log/event-types.js';
import {
  createTurnContextSnapshot,
  createToolResultTrimmerMiddleware,
  latexDelimiterMiddleware,
} from '#harness/cad-middleware.js';
import type { ClientContext, RecentSkillsPort } from '#harness/cad-middleware.js';
import { installCompaction } from '#harness/compaction.js';
import type { CompactionOutcome, CompactionSummarizer } from '#harness/compaction.js';
import { composeModelCallMiddleware } from '#harness/model-call-middleware.js';
import type { ModelCallMiddleware } from '#harness/model-call-middleware.js';
import { createAgentSafeguards } from '#harness/safeguards.js';
import type { SafeguardOutcome, SafeguardThresholds } from '#harness/safeguards.js';
import {
  createSessionRecord,
  createProviderMetadataDiagnostic,
  createLiveMessageIdentityDiagnostic,
  createTransportFailureDiagnostic,
  createPortableId,
  hasFileRef,
  materializeAttachments,
  piMessageToProvider,
  providerMessageToPi,
  toJsonValue,
  toolInputToProvider,
  transportFailureFromProviderMessages,
} from '#harness/session-record.js';
import type { AttachmentReader, MessageIdentities, SessionRecord } from '#harness/session-record.js';
import { applyHostToolResult, createAgentTools, normalizeToolInput } from '#harness/tools.js';
import type { HostToolExecutionDetails, ToolResultSubstituter } from '#harness/tools.js';
import { createInterruptRecoveryMessage } from '#harness/interrupt-recovery.js';

const zeroUsage: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

// The catalog ceiling is the route's limit, not the size a call should ask for.
// Requesting it on every call made the whole output term of the admission hold
// phantom (billing-admission-hold-redesign Finding 2); the ratified default is
// 16,384 with a per-call raise up to the route ceiling (Q2).
const defaultRequestedMaxTokens = 16_384;

const requestedMaxTokens = (ceiling: number, requested: number | undefined): number =>
  Math.min(requested ?? defaultRequestedMaxTokens, ceiling);

const modelFor = (options: AgentSessionModel): Model<Api> => ({
  id: options.id,
  name: options.id,
  // Keep durable replay on the same codec as the request. Claude is native;
  // OpenAI and xAI use Responses; the remaining compatible routes use chat.
  api:
    options.api ??
    (options.providerKind === 'anthropic'
      ? 'anthropic-messages'
      : options.providerKind === 'openai' || options.providerKind === 'xai'
        ? 'openai-responses'
        : 'openai-completions'),
  // Pi drops signed replay metadata when history moves between providers; the
  // gateway is execution placement, while providerKind is the model provider.
  provider: options.provider ?? options.providerKind ?? 'tau-gateway',
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
  readonly reasoning?: ModelReasoningConfig | undefined;
  readonly identities: MessageIdentities;
  readonly toolInputIds: Map<string, string>;
  readonly createId: () => string;
  /** The side table for the messages this request carries (D15). */
  readonly documents?: (() => ReadonlyMap<string, MaterializedDocument>) | undefined;
  readonly committedContext?: (() => TurnContextSnapshot | undefined) | undefined;
  readonly usePostCompactionContext?: (() => boolean) | undefined;
  readonly systemPromptBlocks?: (() => TurnContextSnapshot['systemPromptBlocks']) | undefined;
  readonly onLiveDelta?: ((event: AgentLiveEventPayload) => void | Promise<void>) | undefined;
  readonly prestartTool?:
    // eslint-disable-next-line max-params -- The hook mirrors Pi's streamed tool-call lifecycle.
    | ((
        toolCall: ToolCall,
        contentIndex: number,
        messageId: string,
        partial: AssistantMessage,
        signal: AbortSignal,
      ) => Promise<void>)
    | undefined;
  readonly prepareInvocation?:
    | ((purpose: 'generation' | 'compaction', modelId: string, signal: AbortSignal) => Promise<string>)
    | undefined;
  readonly bindInvocation?: ((attemptId: string, metadata: ProviderMessageMetadata) => Promise<void>) | undefined;
  readonly invocationPurpose?: 'generation' | 'compaction' | undefined;
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
      let legacyActive: { readonly kind: 'text' | 'thinking'; readonly index: number } | undefined;
      let terminalReason: StopReason | undefined;
      let transportMetadata: ProviderMessageMetadata | undefined;
      let invocationMetadata: ProviderMessageMetadata | undefined;
      let usageSettled = false;
      const reasoningTimings = new Map<number, { startedAtMs: number; endedAt?: number }>();
      output.push({ type: 'start', partial });

      const startReasoning = (contentIndex: number): number => {
        const startedAtMs = reasoningTimings.get(contentIndex)?.startedAtMs ?? Date.now();
        reasoningTimings.set(contentIndex, { startedAtMs });
        return startedAtMs;
      };

      const endReasoning = (contentIndex: number): number => {
        const timing = reasoningTimings.get(contentIndex) ?? { startedAtMs: Date.now() };
        const endedAt = Date.now();
        reasoningTimings.set(contentIndex, { ...timing, endedAt });
        return endedAt;
      };

      const metadataFor = (reason: StopReason): ProviderMessageMetadata | undefined => {
        const timings = [...reasoningTimings].map(([contentIndex, timing]) => ({
          contentIndex,
          startedAtMs: timing.startedAtMs,
          ...(timing.endedAt === undefined ? {} : { endedAtMs: timing.endedAt }),
        }));
        const metadata: ProviderMessageMetadata = {
          ...transportMetadata,
          ...(timings.length === 0 ? {} : { reasoningTimings: timings }),
          ...(reason === 'aborted' && !usageSettled
            ? { usageUnsettled: { type: 'tau.usage-unsettled', reason: 'aborted' } }
            : {}),
        };
        return Object.keys(metadata).length === 0 ? undefined : metadata;
      };

      const updateBlock = (index: number, block: AssistantMessage['content'][number]): void => {
        const content = [...partial.content];
        content[index] = block;
        partial = { ...partial, content };
      };

      const closeLegacyActive = async (): Promise<void> => {
        if (!legacyActive) {
          return;
        }
        const block = partial.content[legacyActive.index];
        if (legacyActive.kind === 'text' && block?.type === 'text') {
          await options.onLiveDelta?.({
            type: 'text-end',
            messageId,
            contentIndex: legacyActive.index,
            content: block.text,
          });
          output.push({
            type: 'text_end',
            contentIndex: legacyActive.index,
            content: block.text,
            partial,
          });
        } else if (legacyActive.kind === 'thinking' && block?.type === 'thinking') {
          const timestamp = endReasoning(legacyActive.index);
          await options.onLiveDelta?.({
            type: 'thinking-end',
            messageId,
            contentIndex: legacyActive.index,
            content: block.thinking,
            timestamp,
          });
          output.push({
            type: 'thinking_end',
            contentIndex: legacyActive.index,
            content: block.thinking,
            partial,
          });
        }
        legacyActive = undefined;
      };

      const assertBeforeTerminal = (eventType: ModelStreamEvent['type']): void => {
        if (terminalReason !== undefined) {
          throw new Error(`Model transport emitted ${eventType} after a completed event.`);
        }
      };

      try {
        const invocationPurpose = options.invocationPurpose ?? 'generation';
        const funded = options.transport.usesBillingAttempt?.(options.providerKind) === true;
        const attemptId =
          funded && options.prepareInvocation
            ? await options.prepareInvocation(invocationPurpose, model.id, signal)
            : options.createId();
        const committedContext = options.committedContext?.();
        const documents = options.documents?.();
        const events = options.transport.stream({
          attemptId,
          invocationPurpose,
          ...(funded
            ? {
                onInvocationBound: async (binding: ModelInvocationBinding) => {
                  invocationMetadata = {
                    tauInternal: {
                      kind: 'billing-invocation',
                      attemptId,
                      ...binding,
                    },
                  };
                  await options.bindInvocation?.(attemptId, invocationMetadata);
                },
              }
            : {}),
          modelId: model.id,
          modelCost: model.cost,
          providerKind: options.providerKind,
          reasoning: committedContext?.model?.reasoning ?? options.reasoning,
          maxTokens: requestedMaxTokens(model.maxTokens, streamOptions?.maxTokens),
          contextWindow: model.contextWindow,
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
          // A copy: the session's table grows with later turns while a transport may still hold this one.
          ...(documents === undefined || documents.size === 0 ? {} : { documents: new Map(documents) }),
          tools: hostTools(context),
          signal,
        });
        for await (const event of events) {
          assertBeforeTerminal(event.type);
          if (event.type === 'message-metadata') {
            transportMetadata = { ...transportMetadata, ...event.metadata };
            continue;
          }
          if (event.type === 'text-start') {
            updateBlock(event.contentIndex, { type: 'text', text: '' });
            await options.onLiveDelta?.({
              type: 'text-start',
              messageId,
              contentIndex: event.contentIndex,
            });
            output.push({ type: 'text_start', contentIndex: event.contentIndex, partial });
            continue;
          }
          if (event.type === 'text-delta') {
            let index = event.contentIndex;
            if (index === undefined) {
              if (legacyActive?.kind === 'text') {
                index = legacyActive.index;
              } else {
                await closeLegacyActive();
                index = partial.content.length;
                legacyActive = { kind: 'text', index };
              }
            }
            if (partial.content[index]?.type !== 'text') {
              updateBlock(index, { type: 'text', text: '' });
              await options.onLiveDelta?.({ type: 'text-start', messageId, contentIndex: index });
              output.push({ type: 'text_start', contentIndex: index, partial });
            }
            const block = partial.content[index];
            if (block?.type === 'text') {
              updateBlock(index, {
                ...block,
                text: block.text + event.text,
              });
              await options.onLiveDelta?.({
                type: 'text-delta',
                messageId,
                contentIndex: index,
                delta: event.text,
              });
              output.push({
                type: 'text_delta',
                contentIndex: index,
                delta: event.text,
                partial,
              });
            }
            continue;
          }
          if (event.type === 'text-end') {
            const block = partial.content[event.contentIndex];
            if (block?.type !== 'text') {
              throw new Error(`Model transport ended missing text block ${event.contentIndex}.`);
            }
            updateBlock(event.contentIndex, { ...block, text: event.content });
            await options.onLiveDelta?.({
              type: 'text-end',
              messageId,
              contentIndex: event.contentIndex,
              content: event.content,
            });
            output.push({
              type: 'text_end',
              contentIndex: event.contentIndex,
              content: event.content,
              partial,
            });
            continue;
          }
          if (event.type === 'thinking-start') {
            updateBlock(event.contentIndex, { type: 'thinking', thinking: '' });
            const timestamp = startReasoning(event.contentIndex);
            await options.onLiveDelta?.({
              type: 'thinking-start',
              messageId,
              contentIndex: event.contentIndex,
              timestamp,
            });
            output.push({ type: 'thinking_start', contentIndex: event.contentIndex, partial });
            continue;
          }
          if (event.type === 'thinking-delta') {
            let index = event.contentIndex;
            if (index === undefined) {
              if (legacyActive?.kind === 'thinking') {
                index = legacyActive.index;
              } else {
                await closeLegacyActive();
                index = partial.content.length;
                legacyActive = { kind: 'thinking', index };
              }
            }
            if (partial.content[index]?.type !== 'thinking') {
              updateBlock(index, {
                type: 'thinking',
                thinking: '',
              });
              const timestamp = startReasoning(index);
              await options.onLiveDelta?.({ type: 'thinking-start', messageId, contentIndex: index, timestamp });
              output.push({
                type: 'thinking_start',
                contentIndex: index,
                partial,
              });
            }
            const block = partial.content[index];
            if (block?.type === 'thinking') {
              updateBlock(index, {
                ...block,
                thinking: block.thinking + event.text,
              });
              await options.onLiveDelta?.({
                type: 'thinking-delta',
                messageId,
                contentIndex: index,
                delta: event.text,
              });
              output.push({
                type: 'thinking_delta',
                contentIndex: index,
                delta: event.text,
                partial,
              });
            }
            continue;
          }
          if (event.type === 'thinking-end') {
            const block = partial.content[event.contentIndex];
            if (block?.type !== 'thinking') {
              throw new Error(`Model transport ended missing thinking block ${event.contentIndex}.`);
            }
            updateBlock(event.contentIndex, { ...block, thinking: event.content });
            const timestamp = endReasoning(event.contentIndex);
            await options.onLiveDelta?.({
              type: 'thinking-end',
              messageId,
              contentIndex: event.contentIndex,
              content: event.content,
              timestamp,
            });
            output.push({
              type: 'thinking_end',
              contentIndex: event.contentIndex,
              content: event.content,
              partial,
            });
            continue;
          }
          if (event.type === 'thinking-signature') {
            const block = partial.content[event.contentIndex];
            if (block?.type !== 'thinking') {
              throw new Error(`Model transport signed missing thinking block ${event.contentIndex}.`);
            }
            updateBlock(event.contentIndex, { ...block, thinkingSignature: event.signature });
            output.push({
              type: 'thinking_delta',
              contentIndex: event.contentIndex,
              delta: '',
              partial,
            });
            continue;
          }
          if (event.type === 'tool-input-start' || event.type === 'tool-input-delta') {
            const contentIndex = event.contentIndex ?? partial.content.length;
            let block = partial.content[contentIndex];
            if (block?.type !== 'toolCall') {
              block = {
                type: 'toolCall',
                id: event.toolCallId,
                name: event.toolName,
                arguments: {},
              };
              updateBlock(contentIndex, block);
              await options.onLiveDelta?.({
                type: 'tool-input-start',
                messageId,
                contentIndex,
                toolCallId: event.toolCallId,
                toolName: event.toolName,
              });
              output.push({ type: 'toolcall_start', contentIndex, partial });
            }
            if (event.type === 'tool-input-delta') {
              await options.onLiveDelta?.({
                type: 'tool-input-delta',
                messageId,
                contentIndex,
                toolCallId: event.toolCallId,
                toolName: event.toolName,
                delta: event.delta,
              });
              output.push({
                type: 'toolcall_delta',
                contentIndex,
                delta: event.delta,
                partial,
              });
            }
            continue;
          }
          if (event.type === 'tool-input') {
            await closeLegacyActive();
            const existingIndex = partial.content.findIndex(
              (block) => block.type === 'toolCall' && block.id === event.toolCallId,
            );
            const contentIndex = event.contentIndex ?? (existingIndex === -1 ? partial.content.length : existingIndex);
            const existing = partial.content[contentIndex];
            const toolCall: ToolCall = {
              type: 'toolCall',
              id: event.toolCallId,
              name: event.toolName,
              arguments: event.input as Record<string, unknown>,
              ...(event.thoughtSignature === undefined ? {} : { thoughtSignature: event.thoughtSignature }),
            };
            if (existing?.type !== 'toolCall') {
              updateBlock(contentIndex, { ...toolCall, arguments: {} });
              await options.onLiveDelta?.({
                type: 'tool-input-start',
                messageId,
                contentIndex,
                toolCallId: event.toolCallId,
                toolName: event.toolName,
              });
              output.push({ type: 'toolcall_start', contentIndex, partial });
              const delta = JSON.stringify(event.input);
              await options.onLiveDelta?.({
                type: 'tool-input-delta',
                messageId,
                contentIndex,
                toolCallId: event.toolCallId,
                toolName: event.toolName,
                delta,
              });
              output.push({ type: 'toolcall_delta', contentIndex, delta, partial });
            }
            updateBlock(contentIndex, toolCall);
            await options.onLiveDelta?.({
              type: 'tool-input-end',
              messageId,
              contentIndex,
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              input: event.input,
            });
            await options.prestartTool?.(toolCall, contentIndex, messageId, partial, signal);
            output.push({
              type: 'toolcall_end',
              contentIndex,
              toolCall,
              partial,
            });
            continue;
          }
          if (event.type === 'usage') {
            partial = { ...partial, usage: event.usage };
            usageSettled = true;
            continue;
          }
          await closeLegacyActive();
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
        if (invocationMetadata) {
          transportMetadata = { ...transportMetadata, ...invocationMetadata };
        }
        const durableMetadata = metadataFor(stopReason);
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
        if (invocationMetadata) {
          transportMetadata = { ...transportMetadata, ...invocationMetadata };
        }
        await closeLegacyActive();
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
        const durableMetadata = metadataFor(reason);
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
  readonly reasoning?: ModelReasoningConfig | undefined;
  readonly identities: MessageIdentities;
  readonly toolInputIds: Map<string, string>;
  readonly createId: () => string;
  readonly prepareInvocation?: CreateTransportStreamOptions['prepareInvocation'];
  readonly bindInvocation?: CreateTransportStreamOptions['bindInvocation'];
  /** The session's side table, so a summarised document keeps its name (P32). */
  readonly documents: () => ReadonlyMap<string, MaterializedDocument>;
}): Models => {
  const models: Pick<Models, 'completeSimple'> = {
    completeSimple: async (model, context, streamOptions): Promise<AssistantMessage> => {
      let summary = '';
      let usage = zeroUsage;
      let stopReason: StopReason | undefined;
      const signal = streamOptions?.signal ?? new AbortController().signal;
      try {
        const funded = options.transport.usesBillingAttempt?.(options.providerKind) === true;
        const attemptId =
          funded && options.prepareInvocation
            ? await options.prepareInvocation('compaction', model.id, signal)
            : options.createId();
        const documents = options.documents();
        const stream = options.transport.stream({
          attemptId,
          invocationPurpose: 'compaction',
          ...(documents.size === 0 ? {} : { documents: new Map(documents) }),
          ...(funded
            ? {
                onInvocationBound: async (binding: ModelInvocationBinding) =>
                  options.bindInvocation?.(attemptId, {
                    tauInternal: {
                      kind: 'billing-invocation',
                      attemptId,
                      ...binding,
                    },
                  }),
              }
            : {}),
          modelId: model.id,
          modelCost: model.cost,
          providerKind: options.providerKind,
          reasoning: options.reasoning,
          maxTokens: requestedMaxTokens(model.maxTokens, streamOptions?.maxTokens),
          contextWindow: model.contextWindow,
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
  readonly reasoning?: TurnModelConfig['reasoning'] | undefined;
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
  /**
   * Reads the bytes a durable `file-ref` names (D15). Absent, every reference
   * is treated as not yet arrived: omitted from the request with a warning.
   */
  readonly attachments?: AttachmentReader | undefined;
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
  readonly committedMessageIds: Set<string>;
  readonly createId: () => string;
}): Promise<void> => {
  const { event, record } = options;
  if (event.type === 'message_end') {
    const message = piMessageToProvider(event.message, record.messages);
    const committed = options.committedMessageIds.has(message.id);
    await record.append(
      committed
        ? { type: 'message.envelope-replaced', messageId: message.id, replacement: message }
        : { type: 'message.appended', message },
    );
    options.committedMessageIds.add(message.id);
    return;
  }
  if (event.type === 'tool_execution_start') {
    const id = options.toolInputIds.get(event.toolCallId) ?? options.createId();
    options.toolInputIds.set(event.toolCallId, id);
    const message = toolInputToProvider({
      id,
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      input: normalizeToolInput(event.toolName, event.args),
    });
    const committed = options.committedMessageIds.has(id);
    await record.append(
      committed
        ? { type: 'message.envelope-replaced', messageId: id, replacement: message }
        : { type: 'message.appended', message },
    );
    options.committedMessageIds.add(id);
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
  /*
   * D15: durable rows name attachments; a model reads bytes. Each user message
   * that references one is materialised once, by id, into a transient copy that
   * pi holds in memory — the log is never rewritten — and every document read
   * joins the side table that travels on each request.
   */
  const materializedById = new Map<string, ProviderMessage>();
  const documents = new Map<string, MaterializedDocument>();
  const warnedAbsent = new Set<string>();
  const readAttachment = async (path: string): Promise<Uint8Array<ArrayBuffer> | undefined> =>
    options.attachments?.read(options.chatId, path);
  const materializeHistory = async (history: readonly ProviderMessage[]): Promise<ProviderMessage[]> => {
    const pending = history.filter((message) => !materializedById.has(message.id) && hasFileRef(message));
    const outcome = await materializeAttachments(pending, readAttachment);
    for (const [index, message] of outcome.messages.entries()) {
      materializedById.set(pending[index]!.id, message);
    }
    for (const [hash, document] of outcome.documents) {
      documents.set(hash, document);
    }
    for (const path of outcome.absent) {
      if (!warnedAbsent.has(path)) {
        warnedAbsent.add(path);
        console.warn(
          `Chat ${options.chatId}: attachment ${path} is not available on this device; the model will not see it.`,
        );
      }
    }
    if (outcome.malformed > 0) {
      console.warn(
        `Chat ${options.chatId}: ${String(outcome.malformed)} malformed attachment row(s) omitted; the model will not see them.`,
      );
    }
    return history.map((message) => materializedById.get(message.id) ?? message);
  };
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
      if (hasFileRef(message)) {
        // Pi would stringify the reference into model-visible text; materialise first.
        throw new TypeError(`Message ${message.id} reached hydration with an unmaterialised file-ref.`);
      }
      const hydrated = providerMessageToPi(message, model, record.messages);
      return hydrated ? [hydrated] : [];
    });
  const initialMessages = hydrateHistory(await materializeHistory(initialHistory));
  const committedMessageIds = new Set(initialHistory.map((message) => message.id));
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
        message: {
          id,
          role: 'user',
          content: toJsonValue(reminder.content),
          metadata,
        },
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
        : {
            content: {
              errorCode: 'TOOL_NOT_FOUND',
              message: `Unknown tool: ${invocation.toolName}`,
            },
            isError: true,
          },
  };
  type PrestartedToolResult =
    | { readonly ok: true; readonly value: AgentToolResult<HostToolExecutionDetails> }
    | { readonly ok: false; readonly error: unknown };
  const prestartedToolResults = new Map<string, Promise<PrestartedToolResult>>();
  const baseTools = createAgentTools({
    registry: toolRegistry,
    runId: options.runId,
    substitute: options.substituteToolResult,
  });
  const tools: typeof baseTools = baseTools.map((tool) => ({
    ...tool,
    // eslint-disable-next-line max-params -- Pi's AgentTool contract supplies these four invocation values.
    execute: async (toolCallId, input, signal, onUpdate) => {
      const prestarted = prestartedToolResults.get(toolCallId);
      if (prestarted) {
        prestartedToolResults.delete(toolCallId);
        const settled = await prestarted;
        if (!settled.ok) {
          throw settled.error;
        }
        return settled.value;
      }
      return tool.execute(toolCallId, input, signal, onUpdate);
    },
  }));
  const bindInvocation = async (attemptId: string, metadata: ProviderMessageMetadata): Promise<void> => {
    const binding = metadata.tauInternal;
    if (binding?.['kind'] !== 'billing-invocation' || binding['attemptId'] !== attemptId) {
      return;
    }
    const { operationId, status } = binding;
    if (
      typeof operationId !== 'string' ||
      (status !== 'pending' && status !== 'terminal' && status !== 'unavailable')
    ) {
      throw new Error('Tau gateway returned malformed invocation metadata.');
    }
    const currentEvents = await record.events();
    const prior = currentEvents.find(
      (event) =>
        event.runId === options.runId && event.type === 'model.invocation-bound' && event.attemptId === attemptId,
    );
    if (prior?.type === 'model.invocation-bound' && prior.operationId !== operationId) {
      throw new Error(`Model invocation ${attemptId} has a conflicting operation binding.`);
    }
    if (!prior) {
      await record.append({
        type: 'model.invocation-bound',
        attemptId,
        operationId,
        status,
      });
    }
  };
  const prepareInvocation = async (
    purpose: 'generation' | 'compaction',
    modelId: string,
    signal: AbortSignal,
  ): Promise<string> => {
    const recordedEvents = await record.events();
    const events = recordedEvents.filter((event) => event.runId === options.runId);
    const prepared = events.findLast((event) => event.type === 'model.invocation-prepared');
    if (prepared?.type === 'model.invocation-prepared') {
      const preparedIndex = events.indexOf(prepared);
      const bound = events.find(
        (event) => event.type === 'model.invocation-bound' && event.attemptId === prepared.attemptId,
      );
      const completed = events.slice(preparedIndex + 1).some((event) => {
        if (prepared.purpose === 'compaction') {
          return event.type === 'history.compacted';
        }
        const message =
          event.type === 'message.appended'
            ? event.message
            : event.type === 'message.envelope-replaced'
              ? event.replacement
              : undefined;
        return (
          message?.role === 'assistant' &&
          message.metadata?.tauInternal?.['kind'] === 'billing-invocation' &&
          message.metadata.tauInternal['attemptId'] === prepared.attemptId
        );
      });
      if (!completed) {
        const transport = options.modelTransport;
        const recovered = await transport.lookupAttempt?.(prepared.attemptId, signal);
        if (recovered && !bound) {
          await record.append({
            type: 'model.invocation-bound',
            attemptId: prepared.attemptId,
            operationId: recovered.operationId,
            status: recovered.status,
          });
        }
        // The owner-scoped ledger has no operation for an unbound attempt only when admission refused it
        // (for example a 402 before a top-up), so nothing was charged and a fresh attempt is safe.
        const refused = transport.lookupAttempt !== undefined && recovered === undefined && !bound;
        if (!refused) {
          throw new Error(`Model invocation ${prepared.attemptId} has no durable result; it will not be sent again.`);
        }
      }
    }
    const attemptId = createId();
    await record.append({
      type: 'model.invocation-prepared',
      attemptId,
      purpose,
      modelId,
    });
    return attemptId;
  };
  let restoreRecentSkillContent = false;
  const base = createTransportStreamFunction({
    transport: options.modelTransport,
    providerKind: effectiveModel.providerKind,
    reasoning: effectiveModel.reasoning,
    identities: record.messages,
    toolInputIds,
    createId,
    documents: () => documents,
    ...(options.modelTransport.usesBillingAttempt ? { prepareInvocation, bindInvocation } : {}),
    committedContext: () => committedContext,
    usePostCompactionContext: () => restoreRecentSkillContent,
    systemPromptBlocks: () => options.systemPromptBlocks,
    // eslint-disable-next-line max-params -- The hook mirrors Pi's streamed tool-call lifecycle.
    prestartTool: async (toolCall, contentIndex, messageId, partial, signal) => {
      if (prestartedToolResults.has(toolCall.id)) {
        return;
      }
      const tool = baseTools.find((candidate) => candidate.name === toolCall.name);
      if (!tool) {
        return;
      }
      let input: Parameters<typeof tool.execute>[1];
      try {
        const prepared = {
          ...toolCall,
          arguments: tool.prepareArguments?.(toolCall.arguments) ?? toolCall.arguments,
        };
        input = validateToolArguments(tool, prepared);
      } catch {
        // Pi emits the canonical validation failure when it processes the final message.
        return;
      }
      record.messages.set(partial, messageId);
      const provider = piMessageToProvider(partial, record.messages);
      /* The block has not ended yet: a checkpoint row lets its live end (or the
       * message end's final row) close it, so the end time survives and a
       * reattach keeps later text (chat activity indicator closeout R9). */
      const assistant: ProviderMessage = {
        ...provider,
        metadata: {
          ...provider.metadata,
          tauInternal: { kind: 'stream-checkpoint', ...provider.metadata?.tauInternal, streamState: 'checkpoint' },
        },
      };
      await record.append(
        committedMessageIds.has(messageId)
          ? { type: 'message.envelope-replaced', messageId, replacement: assistant }
          : { type: 'message.appended', message: assistant },
      );
      committedMessageIds.add(messageId);
      const inputId = toolInputIds.get(toolCall.id) ?? createId();
      toolInputIds.set(toolCall.id, inputId);
      const inputMessage = toolInputToProvider({
        id: inputId,
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        input: normalizeToolInput(toolCall.name, input),
      });
      await record.append(
        committedMessageIds.has(inputId)
          ? { type: 'message.envelope-replaced', messageId: inputId, replacement: inputMessage }
          : { type: 'message.appended', message: inputMessage },
      );
      committedMessageIds.add(inputId);
      // async-iife: bootstrap -- eager dispatch must settle without an unhandled rejection before Pi awaits it.
      const result = (async (): Promise<PrestartedToolResult> => {
        try {
          const value = await tool.execute(
            toolCall.id,
            input,
            signal,
            options.onLiveEvent
              ? (progress: AgentToolResult<HostToolExecutionDetails>) => {
                  const { details } = progress;
                  // async-iife: bootstrap -- Pi's progress callback cannot await a live subscriber.
                  void options.onLiveEvent?.({
                    type: 'tool-output-update',
                    chatId: options.chatId,
                    runId: options.runId,
                    messageId,
                    contentIndex,
                    toolCallId: toolCall.id,
                    toolName: toolCall.name,
                    output: details.content,
                    isError: details.isError,
                  });
                }
              : undefined,
          );
          return { ok: true, value };
        } catch (error) {
          return { ok: false, error };
        }
      })();
      prestartedToolResults.set(toolCall.id, result);
    },
    onLiveDelta: options.onLiveEvent
      ? async (event) =>
          options.onLiveEvent?.({
            ...event,
            chatId: options.chatId,
            runId: options.runId,
          })
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
          reasoning: effectiveModel.reasoning,
          identities: record.messages,
          toolInputIds,
          createId,
          documents: () => documents,
          ...(options.modelTransport.usesBillingAttempt ? { prepareInvocation, bindInvocation } : {}),
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
    createToolResultTrimmerMiddleware({
      allowImageBlocks: options.allowImageBlocks,
    }),
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
    await appendAgentEvent({ event, record, toolInputIds, committedMessageIds, createId });
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
    await record.append({
      type: 'run.lifecycle',
      state,
      ...(detail === undefined ? {} : { detail }),
    });
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
          ...(options.model.reasoning === undefined ? {} : { reasoning: options.model.reasoning }),
        },
        toolChoice: options.toolChoice,
        allowedTools: options.allowedTools,
        snapshot: options.snapshot,
        contextMessages: options.contextMessages,
        clientContext: options.clientContext,
        recentSkills: options.recentSkills,
      });
      const beforeCompaction = await record.history();
      await compaction.prepareTurn(hydrateHistory(await materializeHistory(beforeCompaction)));
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
      agent.state.messages = hydrateHistory(await materializeHistory(await record.history()));
      await agent.continue();
    },
    steer: (message) => {
      agent.steer({
        role: 'user',
        content: message,
        timestamp: now().getTime(),
      });
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
