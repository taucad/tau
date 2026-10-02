import { createMiddleware } from 'langchain';
import type { AgentMiddleware } from 'langchain';
import { AIMessage, ToolMessage, HumanMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { ContextOverflowError } from '@langchain/core/errors';
import type { BaseStore } from '@langchain/langgraph';
import { z } from 'zod';
import { clearReadDedupForChat } from '#api/chat/clear-recent-reads.js';
import { idPrefix } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import { CompactionService } from '#api/chat/compaction.service.js';
import { TauRpcBackendFactory } from '#api/chat/tau-rpc-backend.js';
import { ModelService } from '#api/models/model.service.js';
import { ChatRpcService } from '#api/chat/chat-rpc.service.js';
import { appendTranscriptLine } from '#api/chat/middleware/transcript.middleware.js';
import {
  isImageBlock,
  IMAGE_TOKEN_ESTIMATE,
  extractTextFromContent,
  countImageBlocks,
  stripImageBlocks,
} from '#api/chat/utils/image-block.utils.js';

/** Default fraction of maxInputTokens that triggers compaction. */
// eslint-disable-next-line @typescript-eslint/naming-convention -- Domain constant
const DEFAULT_TRIGGER_FRACTION = 0.85;

/** Characters per token for approximate token counting. */
// eslint-disable-next-line @typescript-eslint/naming-convention -- Domain constant
const CHARS_PER_TOKEN = 4;

/** Max character length for tool arguments before truncation in old messages. */
// eslint-disable-next-line @typescript-eslint/naming-convention -- Domain constant
const MAX_ARG_LENGTH = 2000;

/** Multiplier self-calibration increment on ContextOverflowError. */
// eslint-disable-next-line @typescript-eslint/naming-convention -- Domain constant
const CALIBRATION_INCREMENT = 0.15;

// eslint-disable-next-line @typescript-eslint/naming-convention -- Domain constant
const FALLBACK_CONTEXT_WINDOW = 200_000;

const compactionContextSchema = z.object({
  chatId: z.string(),
  modelId: z.string(),
  modelService: z.custom<ModelService>(),
});

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

export function estimateMessageTokens(messages: BaseMessage[]): number {
  let totalTokens = 0;
  for (const message of messages) {
    if (typeof message.content === 'string') {
      totalTokens += Math.ceil(message.content.length / CHARS_PER_TOKEN);
    } else if (Array.isArray(message.content)) {
      for (const block of message.content as Array<Record<string, unknown>>) {
        if (isImageBlock(block)) {
          totalTokens += IMAGE_TOKEN_ESTIMATE;
        } else {
          const text = (block['text'] ?? block['reasoning'] ?? '') as string;
          totalTokens += Math.ceil(text.length / CHARS_PER_TOKEN);
        }
      }
    }
  }
  return totalTokens;
}

/**
 * Serializes evicted messages into JSONL transcript lines.
 * Image blocks are replaced with `[user attached image]` markers.
 */
function serializeEvictedMessages(evictedMessages: BaseMessage[], timestamp: string): string[] {
  const lines: string[] = [];

  for (const m of evictedMessages) {
    const role = m.type === 'human' ? 'user' : m.type === 'ai' ? 'assistant' : m.type;

    if (typeof m.content === 'string') {
      lines.push(JSON.stringify({ role, content: m.content, timestamp }));
    } else if (Array.isArray(m.content)) {
      for (const block of m.content as Array<Record<string, unknown>>) {
        if (isImageBlock(block)) {
          lines.push(JSON.stringify({ role, type: 'image', content: '[user attached image]', timestamp }));
        } else if (block['type'] === 'reasoning' && block['reasoning']) {
          lines.push(JSON.stringify({ role, type: 'thinking', content: block['reasoning'], timestamp }));
        } else if (block['type'] === 'text' && block['text']) {
          lines.push(JSON.stringify({ role, content: block['text'], timestamp }));
        }
      }
    }
  }

  return lines;
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
export const createCompactionMiddleware = (
  compactionService: CompactionService,
  rpcBackendFactory: TauRpcBackendFactory,
  chatRpcService: ChatRpcService,
): AgentMiddleware => {
  let tokenEstimationMultiplier = 1;

  return createMiddleware({
    name: 'Compaction',
    contextSchema: compactionContextSchema,

    async wrapModelCall(request, handler) {
      const { messages } = request;
      const { context, writer } = request.runtime;
      const { store } = request.runtime as { store?: BaseStore };
      const { chatId, modelId, modelService } = context;

      const maxInputTokens = modelService.getContextWindow(modelId) ?? FALLBACK_CONTEXT_WINDOW;
      const triggerThreshold = Math.floor(maxInputTokens * DEFAULT_TRIGGER_FRACTION);
      const estimatedTokens = Math.ceil(estimateMessageTokens(messages) * tokenEstimationMultiplier);

      let processedMessages = messages;
      // Tracks whether the current model call summarised the message tail.
      // When true, dedup pointers in the auxiliary store referencing
      // now-evicted ToolMessages are cleared as a side effect so the next
      // read_file call cannot route to a stale fileUnchangedMarker.
      let compactionHappened = false;

      if (estimatedTokens > triggerThreshold && messages.length > 2) {
        // Tier 1: Truncate tool args in old messages
        processedMessages = truncateToolArgs(messages);

        // Tier 2: Proactive Morph compaction
        const reEstimated = Math.ceil(estimateMessageTokens(processedMessages) * tokenEstimationMultiplier);

        if (reEstimated > triggerThreshold) {
          const targetKeep = Math.max(4, Math.floor(messages.length * 0.1));
          const keep = findSafeCutoffPoint(processedMessages, targetKeep);
          const evictedMessages = processedMessages.slice(0, processedMessages.length - keep);
          const recentMessages = processedMessages.slice(processedMessages.length - keep);

          if (evictedMessages.length === 0) {
            // Nothing to evict — targetKeep >= messages.length.
            // Pass through to the model without compaction.
            return handler({ ...request, messages: processedMessages });
          }

          // Extract text-only parts from the last user query for query-conditioned compression
          let lastQuery = '';
          for (let i = recentMessages.length - 1; i >= 0; i--) {
            const message = recentMessages[i];
            if (message instanceof HumanMessage) {
              lastQuery = extractTextFromContent(message.content);
              break;
            }
          }

          // Offload evicted messages to unified transcript
          const transcriptFilePath = `.tau/transcripts/${chatId}.jsonl`;
          try {
            const backend = rpcBackendFactory.create(chatId, 'compaction-offload');
            const timestamp = new Date().toISOString();
            const lines = serializeEvictedMessages(evictedMessages, timestamp);

            if (lines.length > 0) {
              await backend.append(transcriptFilePath, lines.join('\n') + '\n');
            }
          } catch {
            // Non-blocking: continue even if offloading fails
          }

          try {
            const { compactedMessages, stats } = await compactionService.compact({
              messages: evictedMessages,
              query: lastQuery,
            });

            processedMessages = [...addContinuityInstructions(compactedMessages), ...recentMessages];
            compactionHappened = true;

            if (writer) {
              writer({
                type: 'context-compaction',
                id: generatePrefixedId(idPrefix.data),
                ...stats,
                transcriptFilePath,
              });
            }

            void appendTranscriptLine(chatRpcService, chatId, {
              role: 'compaction',
              messagesEvicted: stats.messagesEvicted,
              tokensBeforeCompaction: stats.tokensBeforeCompaction,
              tokensAfterCompaction: stats.tokensAfterCompaction,
              timestamp: new Date().toISOString(),
            });
          } catch (compactionError) {
            // If Morph API fails, fall back to keeping truncated args
            processedMessages = [...truncateToolArgs(evictedMessages), ...recentMessages];
            // Truncated args still leave the original ToolMessage tail intact,
            // so dedup pointers remain valid; do NOT set compactionHappened.
            const errorMessage =
              compactionError instanceof Error ? compactionError.message : 'Unknown compaction error';
            if (writer) {
              writer({
                type: 'context-compaction',
                id: generatePrefixedId(idPrefix.data),
                tokensBeforeCompaction: estimatedTokens,
                tokensAfterCompaction: estimatedTokens,
                compressionRatio: 1,
                messagesEvicted: 0,
                transcriptFilePath: null,
              });
            }
            // Log but don't throw — let the model call proceed with truncated messages
            console.warn(`Morph compaction failed, using truncated fallback: ${errorMessage}`);
          }
        }
      }

      processedMessages = stripExcessMedia(processedMessages);

      try {
        const response = await handler({
          ...request,
          messages: processedMessages,
        });
        if (compactionHappened) {
          await clearReadDedupForChat(store, chatId);
        }
        return response;
      } catch (error) {
        // Tier 3: Emergency re-compaction on ContextOverflowError
        if (error instanceof ContextOverflowError) {
          tokenEstimationMultiplier += CALIBRATION_INCREMENT;

          const emergencyKeep = Math.max(2, Math.floor(processedMessages.length * 0.05));
          const keep = findSafeCutoffPoint(processedMessages, emergencyKeep);
          const emergencyMessages = stripImageBlocks(processedMessages.slice(processedMessages.length - keep));

          // Emergency re-compaction also evicts ToolMessages, so the same
          // dedup-pointer reset rule applies.
          const emergencyResponse = await handler({
            ...request,
            messages: emergencyMessages,
          });
          await clearReadDedupForChat(store, chatId);
          return emergencyResponse;
        }

        throw error;
      }
    },
  });
};
