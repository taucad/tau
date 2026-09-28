import { Agent } from '@earendil-works/pi-agent-core';
import type { ActorOptions, AnyActorLogic } from 'xstate';
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
  InvocationFunding,
  ModelInvocationBinding,
  ModelStreamEvent,
  MaterializedDocument,
  ModelTransport,
  ToolRegistry,
} from '#waist/ports.js';
import type {
  AgentLogEvent,
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
import { installCompaction, isCompactionSummary } from '#harness/compaction.js';
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
  transportFailureOfRun,
} from '#harness/session-record.js';
import type { AttachmentReader, MessageIdentities, SessionLogEvent, SessionRecord } from '#harness/session-record.js';
import { applyHostToolResult, createAgentTools, normalizeToolInput } from '#harness/tools.js';
import type { HostToolExecutionDetails, ToolResultSubstituter } from '#harness/tools.js';
import { createInterruptRecoveryMessage } from '#harness/interrupt-recovery.js';
import { codedFailureDetail as codedFailure } from '#harness/coded-failure.js';
import { emptyChatLedger, foldChatLedger, isForeignInvocation, unresolvedInvocations } from '#log/chat-ledger.js';
import type { InvocationResolution } from '#wire/gateway.js';
import type { RefusalCode } from '#wire/refusals.js';

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

/**
 * The completion ceiling one turn asks the provider for.
 *
 * A ceiling is a limit, not a spend: the provider bills what it generates, and
 * on a reasoning model this budget has to cover thinking as well as the answer.
 * Exported so a harness can send what a real turn sends instead of restating
 * the number.
 *
 * @param ceiling - The route's own maximum output tokens.
 * @param requested - A per-call raise, bounded by that ceiling.
 * @returns The `maxTokens` the provider request carries.
 * @public
 */
export const requestedMaxTokens = (ceiling: number, requested: number | undefined): number =>
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

/**
 * Tool results in the order the assistant called them: the log keeps completion order (EQ6), which a resumed history
 * reads back, and some wire families pair results to calls by position.
 *
 * @param messages - The history, as pi holds it.
 * @returns The history with each batch's results reordered to their calls' order.
 */
const inCallOrder = (messages: readonly AgentMessage[]): readonly AgentMessage[] => {
  const ordered = [...messages];
  for (let index = 0; index < ordered.length; index++) {
    const message = ordered[index];
    if (message?.role !== 'assistant') {
      continue;
    }
    const calls = message.content.flatMap((block) => (block.type === 'toolCall' ? [block.id] : []));
    let end = index + 1;
    while (ordered[end]?.role === 'toolResult') {
      end++;
    }
    const batch = ordered.slice(index + 1, end);
    const position = (result: AgentMessage): number =>
      result.role === 'toolResult' && calls.includes(result.toolCallId)
        ? calls.indexOf(result.toolCallId)
        : calls.length;
    ordered.splice(index + 1, batch.length, ...batch.toSorted((left, right) => position(left) - position(right)));
  }
  return ordered;
};

const providerHistory = (
  messages: readonly AgentMessage[],
  options: {
    readonly identities: MessageIdentities;
    readonly toolInputIds: Map<string, string>;
    readonly createId: () => string;
  },
): ProviderMessage[] =>
  inCallOrder(messages).flatMap((message) => {
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
  /** The chat every request from this stream belongs to, for spend attribution. */
  readonly chatId?: string | undefined;
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
  /** E9: the longest silence between transport events before the call fails `MODEL_STREAM_STALLED`. */
  readonly stallBound?: StreamStallBound | undefined;
};

/** The timers a stall bound runs on: an actor's clock, so the incarnation's (or a `StepClock`) fits. @public */
export type HostClock = NonNullable<ActorOptions<AnyActorLogic>['clock']>;

/** The model-stream stall bound (E9) and the clock it runs on: the incarnation's, so a test steps it. @public */
export type StreamStallBound = Readonly<{ clock: HostClock; milliseconds: number }>;

/** Settles when `value` does, never rejecting. */
const settleQuietly = async (value: unknown): Promise<void> => {
  try {
    await value;
  } catch {
    /* Dropped by design: the caller already moved on. */
  }
};

type StallWatch<T> = Readonly<{
  iterator: AsyncIterator<T>;
  bound: StreamStallBound;
  onStall: () => void;
  /** A frozen process is forgiven once per stream (RV7-F1). */
  rearm: { used: boolean };
}>;

/** One event of a stall-bounded stream, or `MODEL_STREAM_STALLED` after a silence of the bound. */
const nextWithin = async <T>(watch: StallWatch<T>): Promise<IteratorResult<T>> => {
  const { iterator, bound, onStall, rearm } = watch;
  const { clock, milliseconds } = bound;
  const now = (): number => clock.now?.() ?? Date.now();
  const pending = iterator.next();
  /* A stalled call's late answer is dropped, not reported unhandled. */
  void settleQuietly(pending);
  let stallTimer: unknown;
  const stalled = new Promise<never>((_resolve, reject) => {
    const arm = (): void => {
      const due = now() + milliseconds;
      stallTimer = clock.setTimeout(() => {
        if (!rearm.used && now() - due >= milliseconds) {
          rearm.used = true;
          arm();
          return;
        }
        onStall();
        void settleQuietly(iterator.return?.());
        reject(
          Object.assign(new Error(`The model sent nothing for ${String(milliseconds / 1000)} s; resume the turn.`), {
            code: 'MODEL_STREAM_STALLED',
          }),
        );
      }, milliseconds);
    };
    arm();
  });
  try {
    return await Promise.race([pending, stalled]);
  } finally {
    clock.clearTimeout(stallTimer);
  }
};

/**
 * Bound the silence between a stream's events (E9, L4 D-105). A firing late by a whole bound means the process was
 * frozen, not the stream silent: it re-arms once (W4 T9, RV7-F1).
 *
 * @param events - The transport's events.
 * @param bound - The bound and its clock.
 * @param onStall - Aborts the transport's request before the stream fails.
 * @returns The events, failing `MODEL_STREAM_STALLED` after a silence of the bound.
 */
const stallBounded = <T>(events: AsyncIterable<T>, bound: StreamStallBound, onStall: () => void): AsyncIterable<T> => ({
  async *[Symbol.asyncIterator]() {
    const watch: StallWatch<T> = { iterator: events[Symbol.asyncIterator](), bound, onStall, rearm: { used: false } };
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop -- each event is bounded on its own.
      const next = await nextWithin(watch);
      if (next.done === true) {
        return;
      }
      yield next.value;
    }
  },
});

/** Whether Tau's gateway ledger funds this provider's calls on this transport. */
const isFunded = (transport: ModelTransport, providerKind: ModelProviderKind | undefined): boolean =>
  transport.funding.type === 'funded' && transport.funding.usesBillingAttempt(providerKind);

/**
 * The row that records one resolved attempt (W11 GI-R4): the charge of a terminal answer, or a void.
 *
 * @param attemptId - The resolved attempt.
 * @param resolution - The gateway's terminal or voided answer.
 * @returns The `model.invocation-settled` body.
 */
export const settledRowOf = (
  attemptId: string,
  resolution: Extract<InvocationResolution, Readonly<{ status: 'terminal' | 'voided' }>>,
): SessionLogEvent =>
  resolution.status === 'voided'
    ? { type: 'model.invocation-settled', attemptId, outcome: 'voided' }
    : {
        type: 'model.invocation-settled',
        attemptId,
        outcome: resolution.outcome,
        operationId: resolution.operationId,
        chargedCreditAtoms: resolution.chargedCreditAtoms,
      };

/**
 * The account that funds a transport's calls (RV5-F2). A lookup that fails is coded `UNAUTHENTICATED`: the page asks
 * the person to sign in again, then resume.
 *
 * @param funding - The funded transport's facet.
 * @returns The funding principal, or `undefined` when it is unknown (a stamped attempt is then refused).
 */
export const fundingPrincipal = async (
  funding: Extract<InvocationFunding, Readonly<{ type: 'funded' }>>,
): Promise<string | undefined> => {
  try {
    return await funding.principal();
  } catch (error) {
    throw Object.assign(
      new Error('Tau could not tell which account funds model requests; sign in again, then resume.', {
        cause: error,
      }),
      { code: 'UNAUTHENTICATED' satisfies RefusalCode },
    );
  }
};

/** The run's current attempt, from its last stamped lifecycle row (W3); 1 before any. */
const attemptOf = (events: readonly AgentLogEvent[], runId: string): number => {
  const last = events.findLast((event) => event.runId === runId && event.type === 'run.lifecycle');
  return last?.type === 'run.lifecycle' && typeof last.attempt === 'number' ? last.attempt : 1;
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
        /* An aborted run sends nothing more: pi's loop can ask again after a revoked tool answers (D13). */
        signal.throwIfAborted();
        const invocationPurpose = options.invocationPurpose ?? 'generation';
        const funded = isFunded(options.transport, options.providerKind);
        const attemptId =
          funded && options.prepareInvocation
            ? await options.prepareInvocation(invocationPurpose, model.id, signal)
            : options.createId();
        signal.throwIfAborted();
        const committedContext = options.committedContext?.();
        const documents = options.documents?.();
        /* The transport's own signal: pi's abort reaches it, and so does the stall bound's. */
        const request = new AbortController();
        const forward = (): void => {
          request.abort(signal.reason);
        };
        signal.addEventListener('abort', forward, { once: true });
        const streamed = options.transport.stream({
          attemptId,
          ...(options.chatId === undefined ? {} : { chatId: options.chatId }),
          invocationPurpose,
          ...(funded
            ? {
                onInvocationBound: async (binding: ModelInvocationBinding) => {
                  invocationMetadata = {
                    tauInternal: { kind: 'billing-invocation', attemptId, operationId: binding.operationId },
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
          signal: request.signal,
        });
        const events =
          options.stallBound === undefined
            ? streamed
            : stallBounded(streamed, options.stallBound, () => {
                request.abort();
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
          options.identities.set(partial, messageId, durableMetadata);
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
          options.identities.set(failure, messageId, durableMetadata);
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
  /** The chat whose history this compaction summarises. */
  readonly chatId?: string | undefined;
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
        const funded = isFunded(options.transport, options.providerKind);
        const attemptId =
          funded && options.prepareInvocation
            ? await options.prepareInvocation('compaction', model.id, signal)
            : options.createId();
        const documents = options.documents();
        const stream = options.transport.stream({
          attemptId,
          ...(options.chatId === undefined ? {} : { chatId: options.chatId }),
          invocationPurpose: 'compaction',
          ...(documents.size === 0 ? {} : { documents: new Map(documents) }),
          ...(funded
            ? {
                onInvocationBound: async (binding: ModelInvocationBinding) =>
                  options.bindInvocation?.(attemptId, {
                    tauInternal: { kind: 'billing-invocation', attemptId, operationId: binding.operationId },
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
  /**
   * The turn context the admission journaled (M1's intent row). Present, `prompt` commits it as is; absent, the session
   * composes it from the fields above.
   */
  readonly context?: TurnContextSnapshot | undefined;
  /** The model row selected at Resume (D21): used before the committed turn's model, so a switch takes effect. */
  readonly selection?: TurnModelConfig | undefined;
  readonly eventLog: DurableEventLog;
  /**
   * The owner's durable writer, when this session shares its log (I2).
   *
   * Absent, the session stamps its own positions off `eventLog`'s tail, which
   * is correct only while it is the log's one writer.
   */
  readonly appendEvent?: ((event: SessionLogEvent) => Promise<void>) | undefined;
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
  /** The incarnation's clock, for the stream stall bound; the process's timers when absent. */
  readonly clock?: HostClock | undefined;
  /** E9: the longest silence between a model stream's events, 300 s by default (RA-Q3). */
  readonly streamStall?: number | undefined;
  readonly onCompaction?: ((outcome: CompactionOutcome) => void) | undefined;
  readonly onLiveEvent?: ((event: AgentLiveEvent) => void | Promise<void>) | undefined;
};

/**
 * How one run of the loop ended, as the session reports it to its owner (M1). The session never writes
 * `run.lifecycle`: its owner maps this outcome to the ending row (RA-R1).
 *
 * @public
 */
export type AgentRunOutcome = Readonly<{
  /** `aborted`: the owner stopped the loop, or the stream ended aborted. */
  outcome: 'completed' | 'failed' | 'aborted';
  failure?: RunFailureDetail | undefined;
}>;

/** Active pi session bound to Tau's portable waist; a driver its owner starts and stops (M1). @public */
export type AgentSession = {
  readonly agent: Agent;
  /**
   * Start mode: compact, commit the turn with its context, then run the loop. Resolves once the loop and every tool it
   * started have settled; it never rejects.
   *
   * @param message - The turn's user message.
   * @param onCommitted - Called once the commit row is durable, or the run ended before it.
   */
  prompt(message: UserProviderMessage, onCommitted?: () => void): Promise<AgentRunOutcome>;
  /** Continue mode: run the loop from the durable history. Resolves like {@link AgentSession.prompt}. */
  continue(): Promise<AgentRunOutcome>;
  /**
   * Queue steering on the live loop.
   *
   * @param message - The steering text.
   * @param id - The durable message id, `steer:<commandId>` for a keyed steer, so its owner can answer on its row.
   */
  steer(message: string, id?: string): void;
  abort(): void;
  snapshot(): Promise<HostRunSnapshot>;
  close(): Promise<void>;
};

/**
 * The durable subset of a session model row: transport-only fields (`api`, `provider`) stay out of the log.
 *
 * @param model - The session's model row.
 * @returns The row a turn context records.
 */
const turnModelOf = (model: AgentSessionModel): TurnModelConfig => ({
  id: model.id,
  contextWindow: model.contextWindow,
  ...(model.maxTokens === undefined ? {} : { maxTokens: model.maxTokens }),
  ...(model.providerKind === undefined ? {} : { providerKind: model.providerKind }),
  ...(model.cost === undefined ? {} : { cost: model.cost }),
  ...(model.reasoning === undefined ? {} : { reasoning: model.reasoning }),
});

/** A tool output as the log compares it: its content and outcome, not the moment pi stamped on its copy. */
const sameToolOutput = (left: ProviderMessage, right: ProviderMessage): boolean => {
  const { metadata: _left, ...leftFacts } = left;
  const { metadata: _right, ...rightFacts } = right;
  return JSON.stringify(leftFacts) === JSON.stringify(rightFacts);
};

const appendAgentEvent = async (options: {
  readonly event: AgentEvent;
  readonly record: SessionRecord;
  readonly toolInputIds: Map<string, string>;
  /** The output each call recorded as it completed, keyed by its call id (EQ6). */
  readonly toolOutputs: Map<string, ProviderMessage>;
  readonly committedMessageIds: Set<string>;
  readonly createId: () => string;
}): Promise<void> => {
  const { event, record } = options;
  if (event.type === 'tool_execution_end') {
    /* One durable result per call as it completes (L4 D-103): pi builds the batch's result messages only after the
     * whole batch settles, so a crash would lose the completed ones. The message is pi's own shape. */
    const result = event.result as AgentToolResult<unknown> | undefined;
    const completed: AgentMessage = {
      role: 'toolResult',
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      content: result?.content ?? [],
      details: result?.details,
      isError: event.isError,
      timestamp: Date.now(),
    };
    const message = piMessageToProvider(completed, record.messages);
    await record.append({ type: 'message.appended', message });
    options.toolOutputs.set(event.toolCallId, message);
    options.committedMessageIds.add(message.id);
    return;
  }
  if (event.type === 'message_end') {
    const early = event.message.role === 'toolResult' ? options.toolOutputs.get(event.message.toolCallId) : undefined;
    if (early !== undefined) {
      record.messages.set(event.message, early.id);
    }
    const message = piMessageToProvider(event.message, record.messages);
    if (early !== undefined && sameToolOutput(early, message)) {
      return;
    }
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
  runId: string,
): Promise<RunFailureDetail | undefined> => {
  const typed = transportFailureOfRun({ events: await record.events(), messages: await record.history(), runId });
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
    ...(options.appendEvent ? { append: options.appendEvent } : {}),
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
  /* A journaled admission's context is the one `prompt` commits: tool selection and model follow it from the start. */
  const projected =
    initialProjection?.type === 'turn.history-projection-committed' ? initialProjection.context : options.context;
  /* A Resume's selection replaces the committed model on every request of this attempt (L4 D-087). */
  let committedContext =
    projected === undefined || options.selection === undefined ? projected : { ...projected, model: options.selection };
  const effectiveModel: AgentSessionModel = options.selection ?? committedContext?.model ?? options.model;
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
  const projectHistory = async (): Promise<AgentMessage[]> =>
    hydrateHistory(await materializeHistory(await record.history()));
  const initialMessages = hydrateHistory(await materializeHistory(initialHistory));
  const committedMessageIds = new Set(initialHistory.map((message) => message.id));
  const toolOutputs = new Map<string, ProviderMessage>();
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
  const prestartedToolResults = new Map<
    string,
    { readonly toolName: string; readonly result: Promise<PrestartedToolResult> }
  >();
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
        const settled = await prestarted.result;
        if (!settled.ok) {
          throw settled.error;
        }
        return settled.value;
      }
      return tool.execute(toolCallId, input, signal, onUpdate);
    },
  }));

  /**
   * Record every tool this turn started but pi never got to settle.
   *
   * A tool call is dispatched the moment the stream completes it, so a stream
   * that then fails leaves a tool that *ran* — pi ends the message without
   * executing any call, and the promise holding the result dies with the
   * session. Without this the resume fabricated `CLIENT_DISCONNECTED` for work
   * that was already done, and the model re-applied it. The turn is not over
   * until that work is: this awaits each one, exactly as the ordinary path
   * awaits a tool before recording its result.
   */
  const settlePrestartedTools = async (): Promise<void> => {
    for (const [toolCallId, prestarted] of prestartedToolResults) {
      prestartedToolResults.delete(toolCallId);
      // oxlint-disable-next-line no-await-in-loop -- the record's append discipline is serial by construction.
      const settled = await prestarted.result;
      const details = settled.ok ? settled.value.details : undefined;
      // oxlint-disable-next-line no-await-in-loop -- as above.
      await record.append({
        type: 'message.appended',
        message: piMessageToProvider(
          {
            role: 'toolResult',
            toolCallId,
            toolName: prestarted.toolName,
            content: settled.ok
              ? settled.value.content
              : [
                  {
                    type: 'text',
                    text: settled.error instanceof Error ? settled.error.message : String(settled.error),
                  },
                ],
            ...(details ? { details } : {}),
            isError: details?.isError ?? true,
            timestamp: now().getTime(),
          },
          record.messages,
        ),
      });
    }
  };
  const bindInvocation = async (attemptId: string, metadata: ProviderMessageMetadata): Promise<void> => {
    const binding = metadata.tauInternal;
    if (binding?.['kind'] !== 'billing-invocation' || binding['attemptId'] !== attemptId) {
      return;
    }
    const { operationId } = binding;
    if (typeof operationId !== 'string') {
      throw new TypeError('Tau gateway returned malformed invocation metadata.');
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
      /* Bind is the only producer, and it always says `pending`; older readers still read the field (GI-R6). */
      await record.append({ type: 'model.invocation-bound', attemptId, operationId, status: 'pending' });
    }
  };
  /**
   * Prepare one funded call (RA-R11). A generation call first resolves every unresolved attempt in the chat and records
   * each answer (`model.invocation-settled`), so a lost reply's charge is durable before the next attempt
   * (ChargeAfterRecordedLoss, EQ1); a pending one ends the run `MODEL_ATTEMPT_PENDING`. The key is deterministic,
   * `${runId}:${attempt}:${position}`, so a repeat is replayed by the gateway, never dispatched again (I16).
   */
  const prepareInvocation = async (
    purpose: 'generation' | 'compaction',
    modelId: string,
    signal: AbortSignal,
  ): Promise<string> => {
    const { funding } = options.modelTransport;
    if (funding.type !== 'funded') {
      throw new Error('An unfunded transport prepares no gateway attempt.');
    }
    const principal = await fundingPrincipal(funding);
    /* One compaction's summarizer calls are closed together by its `history.compacted` row: only a generation call
     * waits on the attempts before it (the gate's PrepareOnlyWhenResolved). */
    if (purpose === 'generation') {
      const ledger = foldChatLedger(emptyChatLedger, await record.events());
      const unresolved = unresolvedInvocations(ledger);
      /* Every attempt is checked before any is recorded: another account's attempt leaves the log untouched (RV5-F2). */
      const foreign = unresolved.find((attemptId) => isForeignInvocation(ledger.invocations[attemptId]!, principal));
      if (foreign !== undefined) {
        throw Object.assign(
          new Error(`Another Tau account funded model request ${foreign}; sign in to that account to continue.`),
          { code: 'MODEL_ATTEMPT_OTHER_ACCOUNT' satisfies RefusalCode, details: { attemptId: foreign } },
        );
      }
      for (const attemptId of unresolved) {
        // oxlint-disable-next-line no-await-in-loop -- each answer is recorded before the next attempt is asked about.
        const resolution = await funding.resolveInvocation({ attemptId, signal });
        if (resolution.status === 'pending' || resolution.status === 'unavailable') {
          throw Object.assign(
            new Error(`The gateway has not finished model request ${attemptId}; resume the turn once it has.`),
            { code: 'MODEL_ATTEMPT_PENDING', details: { attemptId } },
          );
        }
        // oxlint-disable-next-line no-await-in-loop -- as above.
        await record.append(settledRowOf(attemptId, resolution));
      }
    }
    const events = await record.events();
    const attempt = attemptOf(events, options.runId);
    const prefix = `${options.runId}:${String(attempt)}:`;
    const position = events.filter(
      (event) => event.type === 'model.invocation-prepared' && event.attemptId.startsWith(prefix),
    ).length;
    const attemptId = `${prefix}${String(position)}`;
    await record.append({
      type: 'model.invocation-prepared',
      attemptId,
      purpose,
      modelId,
      ...(principal === undefined ? {} : { principal }),
    });
    return attemptId;
  };
  let restoreRecentSkillContent = initialMessages.some((message) => isCompactionSummary(message));
  const base = createTransportStreamFunction({
    transport: options.modelTransport,
    stallBound: {
      clock: options.clock ?? globalThis,
      milliseconds: options.streamStall ?? 300_000,
    },
    chatId: options.chatId,
    providerKind: effectiveModel.providerKind,
    reasoning: effectiveModel.reasoning,
    identities: record.messages,
    toolInputIds,
    createId,
    documents: () => documents,
    ...(options.modelTransport.funding.type === 'funded' ? { prepareInvocation, bindInvocation } : {}),
    committedContext: () => committedContext,
    usePostCompactionContext: () => restoreRecentSkillContent,
    systemPromptBlocks: () => options.systemPromptBlocks,
    // eslint-disable-next-line max-params -- The hook mirrors Pi's streamed tool-call lifecycle.
    prestartTool: async (toolCall, contentIndex, messageId, partial, signal) => {
      if (prestartedToolResults.has(toolCall.id)) {
        return;
      }
      const tool = baseTools.find((candidate) => candidate.name === toolCall.name);
      /* A sequential tool waits for its batch's turn (EQ6): nothing starts it early. */
      if (!tool || tool.executionMode === 'sequential') {
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
      prestartedToolResults.set(toolCall.id, { toolName: toolCall.name, result });
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
    projectHistory,
    contextWindow: effectiveModel.contextWindow,
    summarize: options.summarize,
    models: options.summarize
      ? undefined
      : compactionModelsWithTransport({
          transport: options.modelTransport,
          chatId: options.chatId,
          providerKind: effectiveModel.providerKind,
          reasoning: effectiveModel.reasoning,
          identities: record.messages,
          toolInputIds,
          createId,
          documents: () => documents,
          ...(options.modelTransport.funding.type === 'funded' ? { prepareInvocation, bindInvocation } : {}),
        }),
    onSummary: () => {
      restoreRecentSkillContent = true;
    },
    settleDiscardedToolCalls: settlePrestartedTools,
    onCompaction: options.onCompaction,
    now: () => now().getTime(),
  });
  const continueWithoutPreparation = agent.continue.bind(agent);
  agent.transformContext = async (messages) => safeguards.transformContext(messages);
  agent.streamFunction = composeModelCallMiddleware(base, [
    asMiddleware(compaction.wrapStreamFn),
    createToolResultTrimmerMiddleware({
      allowImageBlocks: options.allowImageBlocks,
    }),
    asMiddleware(safeguards.wrapStreamFn),
    latexDelimiterMiddleware,
  ]);

  let state: RunLifecycleState = 'admitted';
  let turnId = initialHistory.findLast((message) => message.role === 'user')?.id ?? options.runId;
  let abortRequested = false;
  /* Read through a call: an abort lands while the turn awaits, which narrowing cannot see. */
  const wasAbortRequested = (): boolean => abortRequested;
  let ran = false;
  let lastFinal: AgentMessage | undefined;
  const runAbortController = new AbortController();
  const aborted = (): AgentRunOutcome => ({ outcome: 'aborted' });
  const prepareStartOfTurn = async (): Promise<boolean> => {
    try {
      await compaction.prepareTurn(runAbortController.signal);
    } catch (error) {
      if (!runAbortController.signal.aborted) {
        throw error;
      }
      return false;
    }
    return !runAbortController.signal.aborted;
  };
  agent.continue = async () => {
    if (await prepareStartOfTurn()) {
      await continueWithoutPreparation();
    }
  };
  agent.subscribe(async (event) => {
    await appendAgentEvent({ event, record, toolInputIds, toolOutputs, committedMessageIds, createId });
    if (event.type === 'agent_end') {
      lastFinal = [...event.messages].reverse().find((message) => message.role === 'assistant');
    }
  });

  /**
   * Run one loop to its end and report it. Every tool the stream started early is settled first, on every outcome
   * (RA-R13), so the owner's ending row always follows the attempt's last tool result.
   */
  const settle = async (loop: () => Promise<boolean>): Promise<AgentRunOutcome> => {
    if (ran) {
      throw new Error(`Run ${options.runId}'s session already ran; its owner starts a new driver per attempt.`);
    }
    ran = true;
    let outcome: AgentRunOutcome;
    try {
      const started = await loop();
      if (started) {
        const final = lastFinal;
        const stop = final?.role === 'assistant' ? final.stopReason : undefined;
        if (abortRequested || stop === 'aborted') {
          outcome = aborted();
        } else if (stop === 'error') {
          outcome = { outcome: 'failed', failure: await runFailureDetail(final, record, options.runId) };
        } else {
          outcome = { outcome: 'completed' };
        }
      } else {
        outcome = aborted();
      }
    } catch (error) {
      outcome = abortRequested ? aborted() : { outcome: 'failed', failure: codedFailure(error) };
    }
    await settlePrestartedTools().catch(() => undefined);
    state = outcome.outcome === 'completed' ? 'completed' : outcome.outcome === 'failed' ? 'failed' : 'cancelled';
    return outcome;
  };

  return {
    agent,
    prompt: async (message, onCommitted) => {
      turnId = message.id;
      let told = false;
      const tell = (): void => {
        if (!told) {
          told = true;
          onCommitted?.();
        }
      };
      try {
        return await settle(async () => {
          if (abortRequested) {
            return false;
          }
          const context =
            options.context ??
            (await createTurnContextSnapshot({
              chatId: options.chatId,
              systemPrompt: options.systemPrompt,
              systemPromptBlocks: options.systemPromptBlocks,
              model: turnModelOf(options.model),
              toolChoice: options.toolChoice,
              allowedTools: options.allowedTools,
              snapshot: options.snapshot,
              contextMessages: options.contextMessages,
              clientContext: options.clientContext,
              recentSkills: options.recentSkills,
            }));
          if (!(await prepareStartOfTurn())) {
            return false;
          }
          const retainedHistory = await record.history();
          await record.append({
            type: 'turn.history-projection-committed',
            retainedMessageIds: retainedHistory.map((retained) => retained.id),
            message,
            context,
          });
          committedContext = context;
          state = 'running';
          tell();
          if (wasAbortRequested()) {
            return false;
          }
          agent.state.systemPrompt = committedContext.systemPrompt;
          agent.state.messages = hydrateHistory(await materializeHistory(await record.history()));
          await continueWithoutPreparation();
          return true;
        });
      } finally {
        tell();
      }
    },
    continue: async () =>
      settle(async () => {
        if (abortRequested) {
          return false;
        }
        state = 'running';
        if (!(await prepareStartOfTurn())) {
          return false;
        }
        await continueWithoutPreparation();
        return true;
      }),
    steer: (message, id) => {
      const steering: AgentMessage = { role: 'user', content: message, timestamp: now().getTime() };
      if (id !== undefined) {
        record.messages.set(steering, id);
      }
      agent.steer(steering);
    },
    abort: () => {
      abortRequested = true;
      runAbortController.abort();
      agent.abort();
    },
    snapshot: async () => {
      const messages = await record.history();
      const failure = transportFailureOfRun({ events: await record.events(), messages, runId: options.runId });
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
