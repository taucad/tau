import type { Message } from 'ai';

/**
 * Tool invocation structure based on the API response format
 */
type ToolInvocation = {
  state: 'result' | 'partial-call' | 'call';
  step: number;
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
};

/**
 * Tool invocation part from message parts array
 */
type ToolInvocationPart = {
  type: 'tool-invocation';
  toolInvocation: ToolInvocation;
};

/**
 * Other part types in the message parts array
 */
type OtherPart = {
  type: string;
};

/**
 * Extended message type that includes parts array with tool invocations
 */
type MessageWithToolInvocations = Message & {
  parts?: Array<ToolInvocationPart | OtherPart>;
};

/**
 * Extracts the result from the last tool call in the messages array
 * @param messages - Array of messages from the chat
 * @returns The result from the last tool invocation, or undefined if no tool calls found
 * @throws Error if messages array is empty or malformed
 */
export function extractLastToolResult(messages: MessageWithToolInvocations[]): unknown {
  if (messages.length === 0) {
    throw new Error('Messages array cannot be empty');
  }

  // Find the last assistant message with tool invocations in parts
  const lastAssistantMessage = [...messages].reverse().find((message): message is MessageWithToolInvocations => {
    if (message.role !== 'assistant' || !Array.isArray(message.parts)) {
      return false;
    }

    return message.parts.some((part): part is ToolInvocationPart => part.type === 'tool-invocation');
  });

  if (!lastAssistantMessage) {
    throw new Error('No tool invocations found in messages');
  }

  // Extract tool invocations from parts
  const toolInvocations = lastAssistantMessage
    .parts!.filter((part): part is ToolInvocationPart => part.type === 'tool-invocation')
    .map((part) => part.toolInvocation);

  // Get the last tool invocation by step number (highest step)
  const lastToolInvocation = toolInvocations
    .filter((invocation) => invocation.state === 'result')
    .sort((a, b) => b.step - a.step)[0];

  if (!lastToolInvocation) {
    throw new Error('No completed tool invocations found');
  }

  return lastToolInvocation.result;
}

/**
 * Extracts the result from the last tool call, returning undefined if not found (non-throwing version)
 * @param messages - Array of messages from the chat
 * @returns The result from the last tool invocation, or undefined if no tool calls found
 */
export function tryExtractLastToolResult(messages: MessageWithToolInvocations[]): unknown {
  try {
    return extractLastToolResult(messages);
  } catch {
    return undefined;
  }
}
