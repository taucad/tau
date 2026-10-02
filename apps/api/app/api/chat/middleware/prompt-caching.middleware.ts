import { createMiddleware } from 'langchain';
import type { AgentMiddleware } from 'langchain';
import { HumanMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseMessage, ContentBlock } from '@langchain/core/messages';
import type { ProviderId } from '#api/providers/provider.schema.js';

/**
 * Type for a content block with Anthropic cache control.
 * Extends the base ContentBlock with the cache_control property.
 */
type ContentBlockWithCacheControl = ContentBlock & {
  cache_control?: { type: 'ephemeral' };
};

/**
 * Adds cache_control to the last content block of a HumanMessage.
 */
function addCacheControlToHumanMessage(message: HumanMessage): HumanMessage {
  const { content } = message;

  // Handle string content - convert to content block array
  if (typeof content === 'string') {
    return new HumanMessage({
      content: [
        {
          type: 'text',
          text: content,
          // eslint-disable-next-line @typescript-eslint/naming-convention -- Anthropic API uses snake_case
          cache_control: { type: 'ephemeral' },
        },
      ],
      id: message.id,
      name: message.name,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
      additional_kwargs: message.additional_kwargs,
    });
  }

  // Handle array content - add cache_control to the last block
  if (Array.isArray(content) && content.length > 0) {
    const lastIndex = content.length - 1;
    const newContent: ContentBlockWithCacheControl[] = content.map((block, index) => {
      if (index === lastIndex) {
        return {
          ...block,
          // eslint-disable-next-line @typescript-eslint/naming-convention -- Anthropic API uses snake_case
          cache_control: { type: 'ephemeral' },
        };
      }

      return block as ContentBlockWithCacheControl;
    });

    return new HumanMessage({
      content: newContent,
      id: message.id,
      name: message.name,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
      additional_kwargs: message.additional_kwargs,
    });
  }

  // Return original if content structure is unexpected
  return message;
}

/**
 * Adds cache_control to the last content block of an AIMessage.
 * AIMessage may have string content, array content, or just tool_calls with empty content.
 */
function addCacheControlToAiMessage(message: AIMessage): AIMessage {
  const { content } = message;
  const { additional_kwargs: additionalKwargs } = message;

  // Handle string content - convert to content block array
  if (typeof content === 'string' && content.length > 0) {
    return new AIMessage({
      content: [
        {
          type: 'text',
          text: content,
          // eslint-disable-next-line @typescript-eslint/naming-convention -- Anthropic API uses snake_case
          cache_control: { type: 'ephemeral' },
        },
      ],
      id: message.id,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
      tool_calls: message.tool_calls,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
      additional_kwargs: additionalKwargs,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
      response_metadata: message.response_metadata,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
      usage_metadata: message.usage_metadata,
    });
  }

  // Handle array content - add cache_control to the last block
  if (Array.isArray(content) && content.length > 0) {
    const lastIndex = content.length - 1;
    const newContent: ContentBlockWithCacheControl[] = content.map((block, index) => {
      if (index === lastIndex) {
        return {
          ...block,
          // eslint-disable-next-line @typescript-eslint/naming-convention -- Anthropic API uses snake_case
          cache_control: { type: 'ephemeral' },
        };
      }

      return block as ContentBlockWithCacheControl;
    });

    return new AIMessage({
      content: newContent,
      id: message.id,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
      tool_calls: message.tool_calls,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
      additional_kwargs: additionalKwargs,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
      response_metadata: message.response_metadata,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
      usage_metadata: message.usage_metadata,
    });
  }

  // AIMessage with empty content but has tool_calls - create a text block with empty string
  // This can happen when the AI only returns tool_calls without text
  if (message.tool_calls && message.tool_calls.length > 0) {
    return new AIMessage({
      content: [
        {
          type: 'text',
          text: '',
          // eslint-disable-next-line @typescript-eslint/naming-convention -- Anthropic API uses snake_case
          cache_control: { type: 'ephemeral' },
        },
      ],
      id: message.id,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
      tool_calls: message.tool_calls,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
      additional_kwargs: additionalKwargs,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
      response_metadata: message.response_metadata,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
      usage_metadata: message.usage_metadata,
    });
  }

  // Return original if content structure is unexpected
  return message;
}

/**
 * Adds cache_control to the content of a ToolMessage.
 * ToolMessage typically has string content (JSON), which we convert to a content block.
 */
function addCacheControlToToolMessage(message: ToolMessage): ToolMessage {
  const { content, tool_call_id: toolCallId, name } = message;

  // Handle string content - convert to content block array with cache_control
  if (typeof content === 'string') {
    return new ToolMessage({
      content: [
        {
          type: 'text',
          text: content,
          // eslint-disable-next-line @typescript-eslint/naming-convention -- Anthropic API uses snake_case
          cache_control: { type: 'ephemeral' },
        },
      ],
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
      tool_call_id: toolCallId,
      name,
      id: message.id,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
      additional_kwargs: message.additional_kwargs,
    });
  }

  // Handle array content - add cache_control to the last block
  if (Array.isArray(content) && content.length > 0) {
    const lastIndex = content.length - 1;
    const newContent: ContentBlockWithCacheControl[] = content.map((block, index) => {
      if (index === lastIndex) {
        return {
          ...block,
          // eslint-disable-next-line @typescript-eslint/naming-convention -- Anthropic API uses snake_case
          cache_control: { type: 'ephemeral' },
        };
      }

      return block as ContentBlockWithCacheControl;
    });

    return new ToolMessage({
      content: newContent,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
      tool_call_id: toolCallId,
      name,
      id: message.id,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
      additional_kwargs: message.additional_kwargs,
    });
  }

  // Return original if content structure is unexpected
  return message;
}

/**
 * Adds cache_control to any message type.
 * Dispatches to the appropriate handler based on message type.
 */
function addCacheControlToMessage(message: BaseMessage): BaseMessage {
  if (HumanMessage.isInstance(message)) {
    return addCacheControlToHumanMessage(message);
  }

  if (AIMessage.isInstance(message)) {
    return addCacheControlToAiMessage(message);
  }

  if (ToolMessage.isInstance(message)) {
    return addCacheControlToToolMessage(message);
  }

  // For other message types (SystemMessage, etc.), return as-is
  // SystemMessage is already handled by createCachedSystemMessage
  return message;
}

/**
 * Adds a cache breakpoint to the last message in the messages array.
 * This enables Anthropic prompt caching for the entire conversation prefix.
 *
 * @param messages - Array of messages to process
 * @returns A new array with cache_control added to the last message
 */
function addCacheBreakpoint(messages: BaseMessage[]): BaseMessage[] {
  if (messages.length === 0) {
    return messages;
  }

  const lastIndex = messages.length - 1;
  const lastMessage = messages[lastIndex];

  if (!lastMessage) {
    return messages;
  }

  // Create new array with cache control on the last message
  const result = [...messages];
  result[lastIndex] = addCacheControlToMessage(lastMessage);

  return result;
}

/**
 * Middleware that adds Anthropic cache-control breakpoints to messages.
 *
 * Uses the `wrapModelCall` hook to add `cache_control: { type: 'ephemeral' }`
 * to the last content block of the LAST message before each model call.
 *
 * This enables incremental prompt caching within agent turns:
 * - The system prompt is already cached (via createCachedSystemMessage)
 * - Each model call adds a new cache breakpoint at the last message
 * - This includes AIMessages with tool_calls and ToolMessages with results
 * - Previous content hits the cache, only new content incurs cache write costs
 *
 * Cache breakpoint strategy follows Anthropic's multi-turn conversation example:
 * "During each turn, we mark the final block of the final message with cache_control
 * so the conversation can be incrementally cached."
 *
 * Key insight: "final message" means the LAST message in the array, not just
 * user messages. This enables caching within agent turns that have multiple
 * model calls with tool execution in between.
 *
 * Provider gating: `cache_control` is an Anthropic-specific marker. Other
 * providers either ignore it silently (historical OpenAI Chat Completions
 * stringifying tool outputs) or actively reject it. In particular, OpenAI's
 * Responses API rejects `cache_control` on typed `function_call_output.output`
 * items (e.g. `input_image`) with `400 Unknown parameter`. Returning a no-op
 * middleware for non-Anthropic targets keeps caching enabled for Claude while
 * leaving every other provider untouched (OpenAI Responses already provides
 * implicit prompt caching automatically).
 *
 * @see https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
 */
export const createPromptCachingMiddleware = (targetProvider: ProviderId): AgentMiddleware => {
  if (targetProvider !== 'anthropic') {
    return createMiddleware({
      name: 'PromptCaching',
      async wrapModelCall(request, handler) {
        return handler(request);
      },
    });
  }

  return createMiddleware({
    name: 'PromptCaching',

    async wrapModelCall(request, handler) {
      const { messages } = request;

      // Add cache breakpoint to the last message (regardless of type)
      const cachedMessages = addCacheBreakpoint(messages);

      return handler({
        ...request,
        messages: cachedMessages,
      });
    },
  });
};
