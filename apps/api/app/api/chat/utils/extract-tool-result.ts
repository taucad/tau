import type { BaseMessageLike } from '@langchain/core/messages';
import { AIMessage, ToolMessage } from '@langchain/core/messages';

/**
 * Extracts the result from the last tool call in the Langchain messages array
 * @param messages - Array of Langchain messages after conversion
 * @returns The result from the last tool invocation, or undefined if no tool calls found
 * @throws Error if messages array is empty or malformed
 */
export function extractLastToolResult(messages: BaseMessageLike[]): unknown {
  if (messages.length === 0) {
    throw new Error('Messages array cannot be empty');
  }

  // Find the last AIMessage with tool calls
  const lastAiMessageWithTools = messages.findLast((message): message is AIMessage => {
    return message instanceof AIMessage && Array.isArray(message.tool_calls) && message.tool_calls.length > 0;
  });

  if (!lastAiMessageWithTools?.tool_calls) {
    throw new Error('No tool calls found in messages');
  }

  // Get the last tool call (by array position, as they're ordered)
  const lastToolCall = lastAiMessageWithTools.tool_calls.at(-1);

  if (!lastToolCall?.id) {
    throw new Error('Last tool call has no ID');
  }

  // Find the corresponding ToolMessage with the result
  const toolMessage = messages.find((message): message is ToolMessage => {
    return message instanceof ToolMessage && message.tool_call_id === lastToolCall.id;
  });

  if (!toolMessage) {
    throw new Error('No tool result found for the last tool call');
  }

  // Parse the JSON content to get the actual result
  // ToolMessage.content is always a string in our conversion logic
  const content = typeof toolMessage.content === 'string' ? toolMessage.content : JSON.stringify(toolMessage.content);

  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to parse tool result: ${String(error)}`);
  }
}

/**
 * Extracts the result from the last tool call, returning undefined if not found (non-throwing version)
 * @param messages - Array of Langchain messages after conversion
 * @returns The result from the last tool invocation, or undefined if no tool calls found
 */
export function tryExtractLastToolResult(messages: BaseMessageLike[]): unknown {
  try {
    return extractLastToolResult(messages);
  } catch {
    return undefined;
  }
}
