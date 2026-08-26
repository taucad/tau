import { createMiddleware } from 'langchain';
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseMessage, ContentBlock } from '@langchain/core/messages';
import { cloneAiMessage } from '#api/chat/utils/ai-message-clone.js';

/**
 * Placeholder text added to AIMessages that have no text content.
 * Must be non-empty — the Anthropic API rejects messages with empty content.
 */
const interruptedPlaceholder = '[interrupted]';

/**
 * Checks if an AIMessage has at least one non-empty text content block.
 *
 * Non-empty string content counts as text. For array content,
 * checks for a block with `type: 'text'` and a non-empty `text` value.
 */
function hasNonEmptyTextContent(message: AIMessage): boolean {
  const { content } = message;

  // Non-empty string content counts as text
  if (typeof content === 'string' && content.length > 0) {
    return true;
  }

  // Array content - check for at least one text block with non-empty text
  if (Array.isArray(content)) {
    return content.some((block) => {
      const typedBlock = block as ContentBlock & { text?: string };
      return typedBlock.type === 'text' && typeof typedBlock.text === 'string' && typedBlock.text.length > 0;
    });
  }

  return false;
}

function removeProviderVisibleLegacyToolMetadata(
  additionalKwargs: AIMessage['additional_kwargs'] | undefined,
): AIMessage['additional_kwargs'] {
  if (!additionalKwargs) {
    return {};
  }

  const next: Record<string, unknown> = { ...additionalKwargs };
  delete next['tool_calls'];
  delete next['function_call'];
  return next as AIMessage['additional_kwargs'];
}

function isReplaySafeToolCall(toolCall: NonNullable<AIMessage['tool_calls']>[number]): boolean {
  return (
    typeof toolCall.id === 'string' &&
    toolCall.id.trim().length > 0 &&
    typeof toolCall.name === 'string' &&
    toolCall.name.trim().length > 0
  );
}

function replaySafeToolCalls(message: AIMessage): AIMessage['tool_calls'] {
  return message.tool_calls?.filter(isReplaySafeToolCall);
}

/**
 * Ensures an AIMessage has at least one non-empty text content block.
 *
 * When extended thinking is interrupted by the user, the AIMessage may
 * contain only `reasoning` (thinking) blocks with no `text` block.
 * The Anthropic API requires all non-final assistant messages to have
 * non-empty content, and reasoning blocks alone don't satisfy this:
 *
 *   "messages.N: all messages must have non-empty content except
 *    for the optional final assistant message"
 *
 * This function adds a placeholder text block to ensure the message
 * meets API requirements.
 *
 * Messages with `tool_calls` are skipped — the Anthropic API considers
 * `tool_use` blocks as valid content, and reconstructing these messages
 * can break the tool_use/tool_result pairing.
 *
 * @param message - The AIMessage to check and potentially fix
 * @returns The original message if valid, or a new AIMessage with an added text block
 */
function ensureTextContent(message: AIMessage): AIMessage {
  if (hasNonEmptyTextContent(message)) {
    return message;
  }

  // Skip messages with tool_calls — tool_use blocks count as valid content
  // and reconstructing these messages can break tool_use/tool_result pairing
  const safeToolCalls = replaySafeToolCalls(message);
  if (safeToolCalls && safeToolCalls.length > 0) {
    return message;
  }

  const { content } = message;

  const additionalKwargs = removeProviderVisibleLegacyToolMetadata(message.additional_kwargs);

  // Array content with no text blocks (e.g., only reasoning/thinking blocks)
  // → append a placeholder text block to satisfy the API
  if (Array.isArray(content) && content.length > 0) {
    return cloneAiMessage(message, {
      content: [...content, { type: 'text', text: interruptedPlaceholder }],
      toolCalls: safeToolCalls,
      additionalKwargs,
    });
  }

  // Empty string content or empty array → create a single placeholder text block
  return cloneAiMessage(message, {
    content: [{ type: 'text', text: interruptedPlaceholder }],
    toolCalls: safeToolCalls,
    additionalKwargs,
  });
}

/**
 * Gets the tool_call_id from a BaseMessage defensively.
 * Works for both ToolMessage class instances and deserialized plain objects
 * from LangGraph checkpoints.
 */
function getToolCallId(message: BaseMessage): string | undefined {
  if ('tool_call_id' in message && typeof message.tool_call_id === 'string') {
    return message.tool_call_id;
  }

  return undefined;
}

/**
 * Detects AIMessages with tool_calls that don't have matching ToolMessages
 * following them and inserts synthetic error ToolMessages for each orphaned
 * tool call.
 *
 * This handles the case where a stream is interrupted mid-tool-execution:
 * the AIMessage has tool_calls but the corresponding ToolMessages were never
 * created because the tool didn't finish. The Anthropic API requires every
 * tool_use block to have a matching tool_result, so we insert synthetic
 * error results.
 *
 * The error format matches ToolGenericExecutionError from @taucad/chat,
 * consistent with tool-error-handler.middleware.ts.
 *
 * Idempotent: if ToolMessages already exist for the tool calls (including
 * synthetic ones from a previous turn), they won't be duplicated.
 */
function insertSyntheticToolResults(messages: BaseMessage[]): BaseMessage[] {
  const result: BaseMessage[] = [];
  let modified = false;

  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];

    if (!message) {
      continue;
    }

    result.push(message);

    // Only process AIMessages that have tool_calls
    if (!AIMessage.isInstance(message) || !message.tool_calls || message.tool_calls.length === 0) {
      continue;
    }

    // Collect tool_call_ids from ToolMessages that immediately follow this AIMessage
    const matchedToolCallIds = new Set<string>();
    for (let nextIndex = index + 1; nextIndex < messages.length; nextIndex++) {
      const nextMessage = messages[nextIndex];

      if (nextMessage && ToolMessage.isInstance(nextMessage)) {
        const toolCallId = getToolCallId(nextMessage);
        if (toolCallId) {
          matchedToolCallIds.add(toolCallId);
        }
      } else {
        // Stop at the next non-ToolMessage (HumanMessage, AIMessage, etc.)
        break;
      }
    }

    // Insert synthetic error ToolMessages for any orphaned tool calls
    for (const toolCall of message.tool_calls) {
      if (toolCall.id && !matchedToolCallIds.has(toolCall.id)) {
        result.push(
          new ToolMessage({
            content: JSON.stringify({
              errorCode: 'USER_INTERRUPTED',
              message: 'Tool execution was interrupted.',
              toolName: toolCall.name,
              toolCallId: toolCall.id,
            }),
            // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
            tool_call_id: toolCall.id,
            name: toolCall.name,
            status: 'error',
          }),
        );
        modified = true;
      }
    }
  }

  return modified ? result : messages;
}

/**
 * Middleware that sanitizes message content before sending to the LLM.
 *
 * Uses the `wrapModelCall` hook to:
 * 1. Ensure all AIMessages have at least one text content block
 * 2. Insert synthetic error ToolMessages for orphaned tool calls
 *
 * This prevents API errors when:
 * - Extended thinking is interrupted, leaving only reasoning blocks
 * - An AIMessage is saved with empty content (no text, no tool_calls)
 * - A tool call is interrupted before producing a result (orphaned tool_use)
 *
 * The Anthropic API requires all non-final assistant messages to have
 * non-empty content, and every tool_use block must have a matching
 * tool_result block.
 *
 * This middleware should run BEFORE prompt-caching middleware so that
 * cache breakpoints are applied to the sanitized messages.
 */
export const messageContentSanitizerMiddleware = createMiddleware({
  name: 'MessageContentSanitizer',

  async wrapModelCall(request, handler) {
    const { messages } = request;

    // Pass 1: Ensure all AIMessages have at least one text content block
    const sanitizedMessages = messages.map((message: BaseMessage) => {
      if (AIMessage.isInstance(message)) {
        return ensureTextContent(message);
      }

      return message;
    });

    // Pass 2: Insert synthetic ToolMessages for any orphaned tool calls
    const repairedMessages = insertSyntheticToolResults(sanitizedMessages);

    return handler({
      ...request,
      messages: repairedMessages,
    });
  },
});
