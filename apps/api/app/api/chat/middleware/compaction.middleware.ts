import { createMiddleware } from 'langchain';
import type { AgentMiddleware } from 'langchain';
import { AIMessage, ToolMessage, HumanMessage, RemoveMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { ContextOverflowError } from '@langchain/core/errors';
import { Command, REMOVE_ALL_MESSAGES } from '@langchain/langgraph';
import type { BaseStore } from '@langchain/langgraph';
import { z } from 'zod';
import {
  AttributeKey,
  GenAiContextCompactionStatus,
  GenAiContextBudgetTriggerReason,
  GenAiContextBudgetKind,
} from '@taucad/telemetry';
import { clearReadDedupForChat } from '#api/chat/clear-recent-reads.js';
import { idPrefix } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import { CompactionService } from '#api/chat/compaction.service.js';
import { TauRpcBackendFactory } from '#api/chat/tau-rpc-backend.js';
import { ModelService } from '#api/models/model.service.js';
import { appendCompactionTranscriptCommit } from '#api/chat/middleware/compaction-transcript.js';
import { loadRecentSkillsMessage, replaceRecentSkillsMessage } from '#api/chat/middleware/recent-skills.middleware.js';
import {
  extractTextFromContent,
  countImageBlocks,
  isImageBlock,
  stripImageBlocks,
} from '#api/chat/utils/image-block.utils.js';
import type { MetricsService } from '#telemetry/metrics.js';
import type { TokenBudgetDecision } from '#api/chat/token-budget.service.js';
import {
  DEFAULT_CONTEXT_COMPACTION_TRIGGER_FRACTION,
  FALLBACK_CONTEXT_WINDOW,
  TokenBudgetService,
} from '#api/chat/token-budget.service.js';
import { withTauInternalMetadata } from '#api/chat/utils/tau-internal-message.js';

/** Max character length for tool arguments before truncation in old messages. */
// eslint-disable-next-line @typescript-eslint/naming-convention -- Domain constant
const MAX_ARG_LENGTH = 2000;

const compactionContextSchema = z.object({
  chatId: z.string(),
  modelId: z.string(),
  modelService: z.custom<ModelService>(),
});

const compactionStateSchema = z.object({
  _lastProviderInputTokens: z.number().optional(),
  _lastProviderUsageModelId: z.string().optional(),
  _lastProviderContextWindow: z.number().optional(),
  _lastProviderTriggerThreshold: z.number().optional(),
  _lastProviderUsageTimestamp: z.string().optional(),
});

type MutableCompactionContext = z.infer<typeof compactionContextSchema> & {
  skillContentRestoreNeeded?: boolean;
  lastContextBudget?: TokenBudgetDecision;
  lastCompactionId?: string;
  lastCompactionStatus?: ContextCompactionStatus;
};

type MutableCompactionState = z.infer<typeof compactionStateSchema>;

type ContextCompactionStatus =
  | typeof GenAiContextCompactionStatus.SKIPPED
  | typeof GenAiContextCompactionStatus.COMPACTED
  | typeof GenAiContextCompactionStatus.FAILED
  | typeof GenAiContextCompactionStatus.OVERFLOW_RETRY_SUCCEEDED;

export type CreateCompactionMiddlewareOptions = {
  compactionService: CompactionService;
  rpcBackendFactory: TauRpcBackendFactory;
  tokenBudgetService: TokenBudgetService;
  metricsService: MetricsService;
  providerId?: string;
};

/**
 * Checks whether a message is a tool result, using both instanceof and
 * duck-typing for messages deserialized from the checkpointer (which may
 * lose prototype chains).
 */
function isToolMessage(message: BaseMessage): boolean {
  return message instanceof ToolMessage;
}

// eslint-disable-next-line @typescript-eslint/naming-convention -- AI is an acronym
function isAIMessage(message: BaseMessage): boolean {
  return message instanceof AIMessage;
}

/**
 * Finds a safe cutoff point in messages that never splits AI/Tool message pairs.
 * Returns the number of messages to keep from the end.
 *
 * After compaction, a HumanMessage is prepended to the recent portion.
 * In Anthropic's API, HumanMessage and ToolMessage both map to the "user" role,
 * so adjacent HumanMessage + ToolMessage blocks are merged into a single message.
 * If a ToolMessage is the first kept message, its tool_result block ends up in
 * the same message as the compacted summary, but the matching tool_use (from an
 * evicted AIMessage) is gone — Anthropic rejects this as an invalid tool_use_id.
 *
 * This function ensures the first kept message is never a ToolMessage:
 * it walks backwards to include the originating AIMessage (with tool_calls).
 */
export function findSafeCutoffPoint(messages: BaseMessage[], targetKeep: number): number {
  let keep = Math.min(targetKeep, messages.length);

  let cutoffIndex = messages.length - keep;
  if (cutoffIndex > 0 && cutoffIndex < messages.length) {
    // Walk backwards past any ToolMessages to reach their originating AIMessage
    while (cutoffIndex > 0 && isToolMessage(messages[cutoffIndex]!)) {
      cutoffIndex--;
    }
    keep = messages.length - cutoffIndex;
  }

  return keep;
}

/**
 * Truncates large tool call arguments in older messages to reduce token usage.
 * Only applied to messages that will be evicted.
 */
function truncateToolArgs(messages: BaseMessage[]): BaseMessage[] {
  return messages.map((message) => {
    if (!isAIMessage(message) || !(message as AIMessage).tool_calls?.length) {
      return message;
    }

    const truncatedCalls = (message as AIMessage).tool_calls!.map((call) => {
      const argsString = JSON.stringify(call.args);
      if (argsString.length <= MAX_ARG_LENGTH) {
        return call;
      }

      return {
        ...call,
        args: { _truncated: true, preview: argsString.slice(0, MAX_ARG_LENGTH) + '...' },
      };
    });

    return new AIMessage({
      content: message.content,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
      tool_calls: truncatedCalls,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
      response_metadata: message.response_metadata,
    });
  });
}

// eslint-disable-next-line @typescript-eslint/naming-convention -- Domain constant
const POST_COMPACTION_CONTINUITY = `\n\nContinue from where you left off. Anchor your next action in the user's exact words from the summary — do not paraphrase or reinterpret the request. Do not acknowledge the summary, do not recap, do not preface with "I'll continue." Pick up the task as if no break occurred.`;

function addContinuityInstructions(messages: BaseMessage[]): BaseMessage[] {
  return messages.map((message) => {
    if (!(message instanceof HumanMessage)) {
      return message;
    }

    if (typeof message.content === 'string') {
      return new HumanMessage(message.content + POST_COMPACTION_CONTINUITY);
    }

    if (Array.isArray(message.content)) {
      return new HumanMessage({
        content: [...(message.content as Array<{ type: string }>), { type: 'text', text: POST_COMPACTION_CONTINUITY }],
      });
    }

    return message;
  });
}

/** Default media limit per request (Anthropic API limit). */
// eslint-disable-next-line @typescript-eslint/naming-convention -- Domain constant
const DEFAULT_MEDIA_LIMIT = 100;

/**
 * Strips oldest image blocks from messages when total media count exceeds the limit.
 * Replaces stripped blocks with text markers. Returns new message instances.
 *
 * @public
 */
export function stripExcessMedia(messages: BaseMessage[], limit = DEFAULT_MEDIA_LIMIT): BaseMessage[] {
  const totalMedia = countImageBlocks(messages);
  if (totalMedia <= limit) {
    return messages;
  }

  const excess = totalMedia - limit;
  let stripped = 0;

  return messages.map((message) => {
    if (stripped >= excess) {
      return message;
    }
    if (typeof message.content === 'string') {
      return message;
    }
    if (!Array.isArray(message.content)) {
      return message;
    }

    const newContent = (message.content as Array<Record<string, unknown>>).map((block) => {
      if (stripped >= excess) {
        return block;
      }
      if (isImageBlock(block)) {
        stripped++;
        return { type: 'text', text: '[image removed — media limit]' };
      }
      return block;
    });

    // eslint-disable-next-line @typescript-eslint/naming-convention -- Constructor name is PascalCase by convention
    const MessageType = message.constructor as new (fields: { content: unknown }) => BaseMessage;
    return new MessageType({ ...message, content: newContent });
  });
}

type CompactionStats = {
  tokensBeforeCompaction: number;
  tokensAfterCompaction: number;
  compressionRatio: number;
  messagesEvicted: number;
};

function providerNameForMetrics(options: {
  modelService: ModelService;
  modelId: string;
  providerId?: string | undefined;
}): string | undefined {
  return options.modelService.getOtelProviderName(options.modelId) ?? options.providerId;
}

function budgetAttributes(options: {
  decision: TokenBudgetDecision;
  modelId: string;
  providerName?: string | undefined;
  component?: string | undefined;
}): Record<string, string> {
  return {
    [AttributeKey.GEN_AI_CONTEXT_BUDGET_KIND]: options.decision.budgetKind,
    [AttributeKey.GEN_AI_CONTEXT_BUDGET_TRIGGER_REASON]: options.decision.triggerReason,
    [AttributeKey.GEN_AI_REQUEST_MODEL]: options.modelId,
    ...(options.providerName ? { [AttributeKey.GEN_AI_PROVIDER_NAME]: options.providerName } : {}),
    ...(options.component ? { [AttributeKey.GEN_AI_CONTEXT_BUDGET_COMPONENT]: options.component } : {}),
  };
}

function recordBudgetMetrics(options: {
  metricsService: MetricsService;
  decision: TokenBudgetDecision;
  modelId: string;
  providerName?: string | undefined;
}): void {
  for (const component of options.decision.components) {
    options.metricsService.genAiContextBudgetTokens.record(
      component.tokens,
      budgetAttributes({ ...options, component: component.name }),
    );
  }
}

function recordCompactionDecision(options: {
  metricsService: MetricsService;
  decision: TokenBudgetDecision;
  modelId: string;
  providerName?: string | undefined;
  status: ContextCompactionStatus;
  triggerReason?: TokenBudgetDecision['triggerReason'] | typeof GenAiContextBudgetTriggerReason.OVERFLOW;
}): void {
  options.metricsService.genAiContextCompactionDecisions.add(1, {
    [AttributeKey.GEN_AI_CONTEXT_BUDGET_KIND]: options.decision.budgetKind,
    [AttributeKey.GEN_AI_CONTEXT_BUDGET_TRIGGER_REASON]: options.triggerReason ?? options.decision.triggerReason,
    [AttributeKey.GEN_AI_CONTEXT_COMPACTION_STATUS]: options.status,
    [AttributeKey.GEN_AI_REQUEST_MODEL]: options.modelId,
    ...(options.providerName ? { [AttributeKey.GEN_AI_PROVIDER_NAME]: options.providerName } : {}),
  });
}

function emitCompactionData(options: {
  writer: ((chunk: Record<string, unknown>) => void) | undefined;
  compactionId: string;
  status: ContextCompactionStatus;
  triggerReason: TokenBudgetDecision['triggerReason'] | typeof GenAiContextBudgetTriggerReason.OVERFLOW;
  decision: TokenBudgetDecision;
  stats: CompactionStats;
  transcriptFilePath?: string | undefined;
}): void {
  if (!options.writer) {
    return;
  }

  options.writer({
    type: 'context-compaction',
    id: options.compactionId,
    compactionId: options.compactionId,
    status: options.status,
    triggerReason: options.triggerReason,
    budgetKind: GenAiContextBudgetKind.ESTIMATED,
    estimatedInputTokens: options.decision.estimatedInputTokens,
    contextWindow: options.decision.contextWindow,
    triggerThreshold: options.decision.triggerThreshold,
    ...options.stats,
    transcriptFilePath: options.transcriptFilePath ?? null,
  });
}

function stampCompactedMessages(messages: BaseMessage[], compactionId: string): BaseMessage[] {
  return messages.map((message, index) => {
    const existingAdditionalKwargs =
      (message as { additional_kwargs?: Record<string, unknown> }).additional_kwargs ?? {};
    const existingId = (message as { id?: string }).id;
    return cloneMessageWithMetadata(message, {
      id: existingId ?? `${compactionId}-summary-${index}`,
      additionalKwargs: withTauInternalMetadata(
        {
          ...existingAdditionalKwargs,
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain metadata is snake_case.
          lc_source: 'compaction',
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain metadata is snake_case.
          compaction_id: compactionId,
        },
        {
          kind: 'compaction-summary',
          anchorId: compactionId,
          revision: String(index),
          pruning: 'preserve-until-compaction',
        },
      ),
    });
  });
}

function cloneMessageWithMetadata(
  message: BaseMessage,
  metadata: { id: string; additionalKwargs: Record<string, unknown> },
): BaseMessage {
  if (message instanceof HumanMessage) {
    return new HumanMessage({
      id: metadata.id,
      content: message.content,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain metadata is snake_case.
      additional_kwargs: metadata.additionalKwargs,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain metadata is snake_case.
      response_metadata: message.response_metadata,
    });
  }

  if (message instanceof AIMessage) {
    return new AIMessage({
      id: metadata.id,
      content: message.content,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API is snake_case.
      tool_calls: message.tool_calls,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain metadata is snake_case.
      additional_kwargs: metadata.additionalKwargs,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain metadata is snake_case.
      response_metadata: message.response_metadata,
    });
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention -- Constructor name is PascalCase by convention.
  const MessageType = message.constructor as new (fields: {
    id?: string;
    content: BaseMessage['content'];
    additional_kwargs?: Record<string, unknown>;
    response_metadata?: Record<string, unknown>;
  }) => BaseMessage;
  return new MessageType({
    id: metadata.id,
    content: message.content,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain metadata is snake_case.
    additional_kwargs: metadata.additionalKwargs,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain metadata is snake_case.
    response_metadata: message.response_metadata,
  });
}

function currentUserQuery(messages: BaseMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message instanceof HumanMessage) {
      return extractTextFromContent(message.content);
    }
  }
  return '';
}

function recordObservedUsageFromResponse(options: {
  tokenBudgetService: TokenBudgetService;
  modelId: string;
  providerId?: string | undefined;
  response: unknown;
  decision: TokenBudgetDecision;
}): void {
  const usage =
    typeof options.response === 'object' && options.response !== null
      ? (options.response as { usage_metadata?: { input_tokens?: number } }).usage_metadata
      : undefined;
  options.tokenBudgetService.recordObservedUsage({
    modelId: options.modelId,
    providerId: options.providerId,
    actualInputTokens: usage?.input_tokens,
    estimatedInputTokens: options.decision.estimatedInputTokens,
  });
}

function previousUsageForModel(state: MutableCompactionState, modelId: string): number | undefined {
  if (state._lastProviderUsageModelId !== modelId) {
    return undefined;
  }
  return state._lastProviderInputTokens;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function compactionStatsFromBudget(options: {
  beforeTokens: number;
  afterTokens: number;
  messagesEvicted: number;
}): CompactionStats {
  const tokensBeforeCompaction = options.beforeTokens;
  const tokensAfterCompaction = options.afterTokens;
  return {
    tokensBeforeCompaction,
    tokensAfterCompaction,
    compressionRatio: tokensBeforeCompaction > 0 ? tokensAfterCompaction / tokensBeforeCompaction : 1,
    messagesEvicted: options.messagesEvicted,
  };
}

function lastAiMessageUsage(state: { messages?: unknown[] }): number | undefined {
  const lastMessage = state.messages?.at(-1);
  if (!(lastMessage instanceof AIMessage)) {
    return undefined;
  }
  const usageMetadata = lastMessage.usage_metadata as { input_tokens?: unknown } | undefined;
  const inputTokens = usageMetadata?.input_tokens;
  return typeof inputTokens === 'number' ? inputTokens : undefined;
}

async function restoreRecentSkillContent(options: {
  store?: BaseStore | undefined;
  chatId: string;
  messages: readonly BaseMessage[];
}): Promise<BaseMessage[]> {
  const recentSkillsMessage = await loadRecentSkillsMessage({
    store: options.store,
    chatId: options.chatId,
    includeContent: true,
  });
  return replaceRecentSkillsMessage(options.messages, recentSkillsMessage);
}

/**
 * Creates middleware that compacts conversation context.
 *
 * Three-tier cascade:
 * 1. Truncate tool arguments in old messages
 * 2. Proactive compaction when estimated tokens exceed trigger threshold
 * 3. Emergency re-compaction on ContextOverflowError
 *
 * Emits a `data-context-compaction` SSE part via `writer()` when compaction fires.
 * Offloads pre-compaction messages to browser FS for conversation history preservation.
 */
export const createCompactionMiddleware = (options: CreateCompactionMiddlewareOptions): AgentMiddleware => {
  return createMiddleware({
    name: 'Compaction',
    stateSchema: compactionStateSchema,
    contextSchema: compactionContextSchema,

    afterModel(state, runtime) {
      const inputTokens = lastAiMessageUsage(state as { messages?: unknown[] });
      if (inputTokens === undefined) {
        return;
      }

      const { modelId, modelService } = runtime.context as MutableCompactionContext;
      const contextWindow = modelService.getContextWindow(modelId) ?? FALLBACK_CONTEXT_WINDOW;
      return {
        _lastProviderInputTokens: inputTokens,
        _lastProviderUsageModelId: modelId,
        _lastProviderContextWindow: contextWindow,
        _lastProviderTriggerThreshold: Math.floor(contextWindow * DEFAULT_CONTEXT_COMPACTION_TRIGGER_FRACTION),
        _lastProviderUsageTimestamp: new Date().toISOString(),
      };
    },

    async wrapModelCall(request, handler) {
      const { messages } = request;
      const { context, writer } = request.runtime;
      const { store } = request.runtime as { store?: BaseStore };
      const mutableContext = context as MutableCompactionContext;
      const requestState = request.state as unknown;
      const mutableState = isRecord(requestState) ? (requestState as MutableCompactionState) : {};
      const { chatId, modelId, modelService } = mutableContext;
      const providerName = providerNameForMetrics({ modelService, modelId, providerId: options.providerId });
      const contextWindow = modelService.getContextWindow(modelId) ?? FALLBACK_CONTEXT_WINDOW;
      const previousUsageInputTokens = previousUsageForModel(mutableState, modelId);
      const budgetDecision = options.tokenBudgetService.evaluateModelRequest({
        request,
        modelId,
        providerId: options.providerId,
        contextWindow,
        previousUsageInputTokens,
      });

      mutableContext.lastContextBudget = budgetDecision;
      recordBudgetMetrics({ metricsService: options.metricsService, decision: budgetDecision, modelId, providerName });

      let processedMessages = messages;
      let rewriteOnSuccess = false;
      let activeCompactionId: string | undefined;
      let activeCompactionStatus: ContextCompactionStatus | undefined;

      if (budgetDecision.shouldCompact && messages.length > 2) {
        processedMessages = truncateToolArgs(messages);
        const postTruncateRequest = { ...request, messages: processedMessages };
        const postTruncateDecision = options.tokenBudgetService.evaluateModelRequest({
          request: postTruncateRequest,
          modelId,
          providerId: options.providerId,
          contextWindow,
          previousUsageInputTokens,
        });
        mutableContext.lastContextBudget = postTruncateDecision;
        recordBudgetMetrics({
          metricsService: options.metricsService,
          decision: postTruncateDecision,
          modelId,
          providerName,
        });

        if (postTruncateDecision.shouldCompact) {
          const targetKeep = Math.max(4, Math.floor(messages.length * 0.1));
          const keep = findSafeCutoffPoint(processedMessages, targetKeep);
          const evictedMessages = processedMessages.slice(0, processedMessages.length - keep);
          const recentMessages = processedMessages.slice(processedMessages.length - keep);

          if (evictedMessages.length === 0) {
            recordCompactionDecision({
              metricsService: options.metricsService,
              decision: postTruncateDecision,
              modelId,
              providerName,
              status: GenAiContextCompactionStatus.SKIPPED,
            });
          } else {
            const compactionId = generatePrefixedId(idPrefix.data);

            try {
              const { compactedMessages, stats } = await options.compactionService.compact({
                messages: evictedMessages,
                query: currentUserQuery(recentMessages),
              });

              const compactedPayload = [
                ...stampCompactedMessages(addContinuityInstructions(compactedMessages), compactionId),
                ...recentMessages,
              ];
              processedMessages = await restoreRecentSkillContent({
                store,
                chatId,
                messages: compactedPayload,
              });
              const transcriptFilePath = await appendCompactionTranscriptCommit({
                chatId,
                rpcBackendFactory: options.rpcBackendFactory,
                compactionId,
                status: GenAiContextCompactionStatus.COMPACTED,
                triggerReason: postTruncateDecision.triggerReason,
                evictedMessages,
                messagesEvicted: stats.messagesEvicted,
                tokensBeforeCompaction: stats.tokensBeforeCompaction,
                tokensAfterCompaction: stats.tokensAfterCompaction,
              });
              rewriteOnSuccess = true;
              activeCompactionId = compactionId;
              activeCompactionStatus = GenAiContextCompactionStatus.COMPACTED;
              mutableContext.skillContentRestoreNeeded = true;
              mutableContext.lastCompactionId = compactionId;
              mutableContext.lastCompactionStatus = activeCompactionStatus;

              emitCompactionData({
                writer,
                compactionId,
                status: activeCompactionStatus,
                triggerReason: postTruncateDecision.triggerReason,
                decision: postTruncateDecision,
                stats,
                transcriptFilePath,
              });
              recordCompactionDecision({
                metricsService: options.metricsService,
                decision: postTruncateDecision,
                modelId,
                providerName,
                status: activeCompactionStatus,
              });
            } catch (compactionError) {
              processedMessages = [...truncateToolArgs(evictedMessages), ...recentMessages];
              activeCompactionId = compactionId;
              activeCompactionStatus = GenAiContextCompactionStatus.FAILED;
              mutableContext.lastCompactionId = compactionId;
              mutableContext.lastCompactionStatus = activeCompactionStatus;

              const errorMessage =
                compactionError instanceof Error ? compactionError.message : 'Unknown compaction error';
              const fallbackStats = compactionStatsFromBudget({
                beforeTokens: postTruncateDecision.estimatedInputTokens,
                afterTokens: postTruncateDecision.estimatedInputTokens,
                messagesEvicted: 0,
              });
              emitCompactionData({
                writer,
                compactionId,
                status: activeCompactionStatus,
                triggerReason: postTruncateDecision.triggerReason,
                decision: postTruncateDecision,
                stats: fallbackStats,
                transcriptFilePath: undefined,
              });
              recordCompactionDecision({
                metricsService: options.metricsService,
                decision: postTruncateDecision,
                modelId,
                providerName,
                status: activeCompactionStatus,
              });
              console.warn(`Morph compaction failed, using truncated fallback: ${errorMessage}`);
            }
          }
        } else {
          recordCompactionDecision({
            metricsService: options.metricsService,
            decision: postTruncateDecision,
            modelId,
            providerName,
            status: GenAiContextCompactionStatus.SKIPPED,
          });
        }
      } else {
        recordCompactionDecision({
          metricsService: options.metricsService,
          decision: budgetDecision,
          modelId,
          providerName,
          status: GenAiContextCompactionStatus.SKIPPED,
        });
      }

      processedMessages = stripExcessMedia(processedMessages);

      try {
        const response = await handler({
          ...request,
          messages: processedMessages,
        });
        recordObservedUsageFromResponse({
          tokenBudgetService: options.tokenBudgetService,
          modelId,
          providerId: options.providerId,
          response,
          decision: mutableContext.lastContextBudget,
        });
        if (rewriteOnSuccess && activeCompactionId && activeCompactionStatus) {
          await clearReadDedupForChat(store, chatId);
          return new Command({
            update: {
              messages: [new RemoveMessage({ id: REMOVE_ALL_MESSAGES }), ...processedMessages, response],
            },
          });
        }
        return response;
      } catch (error) {
        if (error instanceof ContextOverflowError) {
          options.tokenBudgetService.recordOverflow({ modelId, providerId: options.providerId });

          const emergencyKeep = Math.max(2, Math.floor(processedMessages.length * 0.05));
          const keep = findSafeCutoffPoint(processedMessages, emergencyKeep);
          const emergencyEvictedMessages = processedMessages.slice(0, processedMessages.length - keep);
          const emergencyMessages = await restoreRecentSkillContent({
            store,
            chatId,
            messages: stripImageBlocks(processedMessages.slice(processedMessages.length - keep)),
          });
          const compactionId = generatePrefixedId(idPrefix.data);
          const emergencyDecision = options.tokenBudgetService.evaluateModelRequest({
            request: { ...request, messages: emergencyMessages },
            modelId,
            providerId: options.providerId,
            contextWindow,
            previousUsageInputTokens,
          });
          const emergencyStats = compactionStatsFromBudget({
            beforeTokens: budgetDecision.estimatedInputTokens,
            afterTokens: emergencyDecision.estimatedInputTokens,
            messagesEvicted: emergencyEvictedMessages.length,
          });

          mutableContext.skillContentRestoreNeeded = true;
          mutableContext.lastCompactionId = compactionId;
          let overflowCommitSucceeded = false;
          let transcriptFilePath: string | undefined;
          let overflowStatus: ContextCompactionStatus;
          try {
            transcriptFilePath = await appendCompactionTranscriptCommit({
              chatId,
              rpcBackendFactory: options.rpcBackendFactory,
              compactionId,
              status: GenAiContextCompactionStatus.OVERFLOW_RETRY_SUCCEEDED,
              triggerReason: GenAiContextBudgetTriggerReason.OVERFLOW,
              evictedMessages: emergencyEvictedMessages,
              messagesEvicted: emergencyStats.messagesEvicted,
              tokensBeforeCompaction: emergencyStats.tokensBeforeCompaction,
              tokensAfterCompaction: emergencyStats.tokensAfterCompaction,
            });
            overflowCommitSucceeded = true;
            overflowStatus = GenAiContextCompactionStatus.OVERFLOW_RETRY_SUCCEEDED;
          } catch {
            overflowStatus = GenAiContextCompactionStatus.FAILED;
          }
          mutableContext.lastCompactionStatus = overflowStatus;
          emitCompactionData({
            writer,
            compactionId,
            status: overflowStatus,
            triggerReason: GenAiContextBudgetTriggerReason.OVERFLOW,
            decision: budgetDecision,
            stats: emergencyStats,
            transcriptFilePath,
          });
          recordCompactionDecision({
            metricsService: options.metricsService,
            decision: budgetDecision,
            modelId,
            providerName,
            status: overflowStatus,
            triggerReason: GenAiContextBudgetTriggerReason.OVERFLOW,
          });

          const emergencyResponse = await handler({
            ...request,
            messages: emergencyMessages,
          });
          recordObservedUsageFromResponse({
            tokenBudgetService: options.tokenBudgetService,
            modelId,
            providerId: options.providerId,
            response: emergencyResponse,
            decision: budgetDecision,
          });
          if (!overflowCommitSucceeded) {
            return emergencyResponse;
          }
          await clearReadDedupForChat(store, chatId);
          return new Command({
            update: {
              messages: [new RemoveMessage({ id: REMOVE_ALL_MESSAGES }), ...emergencyMessages, emergencyResponse],
            },
          });
        }

        throw error;
      }
    },
  });
};
