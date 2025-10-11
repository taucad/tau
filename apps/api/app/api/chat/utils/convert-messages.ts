import type { BaseMessageLike } from '@langchain/core/messages';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import type { CoreMessage, Message, UIMessage } from 'ai';

/**
 * Preprocesses UI messages to handle partial tool calls by converting them to completed state
 * with mock results. This prevents MessageConversionError when partial tool calls are present.
 *
 * Deprecated properties have been removed: ['data', 'annotations']
 *
 * @param messages - The UI messages that may contain partial tool calls
 * @returns Processed messages with all tool calls in completed state
 */
export function sanitizeMessagesForConversion(messages: Array<Omit<UIMessage, 'data' | 'annotations'>>): UIMessage[] {
  return messages.map((message) => {
    if (message.role !== 'assistant') {
      return message;
    }

    // Handle parts array - convert partial tool calls to completed state
    const sanitizedParts = message.parts.map((part) => {
      if (part.type === 'tool-invocation' && part.toolInvocation.state === 'partial-call') {
        // Convert partial tool calls to completed state with mock result
        return {
          ...part,
          toolInvocation: {
            ...part.toolInvocation,
            state: 'result' as const,
            result: `[Tool execution in progress: ${part.toolInvocation.toolName}]`,
          },
        };
      }

      return part;
    });

    return {
      ...message,
      parts: sanitizedParts,
    };
  });
}

/**
 * Convert a list of UI messages to a list of Langchain messages.
 * This is necessary to handle user supplied attachments in the UI messages, as the
 * AI SDK converts attachments to a buffer representation which is incompatible
 * with Langchain images.
 *
 * @param uiMessages - The list of UI messages
 * @param coreMessages - The list of Core messages
 * @returns The list of Langchain messages
 */
export const convertAiSdkMessagesToLangchainMessages: (
  uiMessages: Message[],
  coreMessages: CoreMessage[],
) => BaseMessageLike[] = (uiMessages, coreMessages) => {
  // Track user message count to match correctly
  let userMessageCount = 0;

  // Collect all valid tool call IDs from assistant messages
  const validToolCallIds = new Set<string>();
  for (const coreMessage of coreMessages) {
    if (coreMessage.role === 'assistant' && Array.isArray(coreMessage.content)) {
      for (const part of coreMessage.content) {
        if (part.type === 'tool-call') {
          validToolCallIds.add(part.toolCallId);
        }
      }
    }
  }

  const langchainMessages = coreMessages.flatMap((coreMessage) => {
    // Handle user messages which contain invalid attachments for Langchain.
    // AI SDK converts attachments to a buffer representation which is incompatible
    // with Langchain images, which needs a URL instead of a buffer.
    switch (coreMessage.role) {
      case 'user': {
        // Find the corresponding UI message by matching user message count
        const correspondingUiMessage = uiMessages.filter((message) => message.role === 'user').at(userMessageCount);

        // Increment user message counter for next match
        userMessageCount++;

        if (!correspondingUiMessage) {
          throw new Error('Corresponding UI message not found');
        }

        const coreMessageContent = coreMessage.content;
        if (!Array.isArray(coreMessageContent)) {
          throw new TypeError('Core message content is not an array');
        }

        return [
          new HumanMessage({
            content: [
              // Map attachments to images.
              // Images always come first as the LLM is more performant when receiving images first.
              ...(correspondingUiMessage.experimental_attachments?.map((attachment) => ({
                type: 'image_url',
                // eslint-disable-next-line @typescript-eslint/naming-convention -- Langchain uses snake_case.
                image_url: { url: attachment.url },
              })) ?? []),
              // Remove all the images from the core message content.
              ...coreMessageContent.filter((part) => part.type !== 'image'),
            ],
          }),
        ];
      }

      // Handle tool messages which contain array `content`, the `content` must instead be a string.
      // Filter out tool results that have no matching tool call.
      case 'tool': {
        return coreMessage.content
          .filter((part) => validToolCallIds.has(part.toolCallId))
          .map(
            (part) =>
              new ToolMessage({
                content: JSON.stringify(part.result),
                // eslint-disable-next-line @typescript-eslint/naming-convention -- Langchain uses snake_case.
                tool_call_id: part.toolCallId,
                name: part.toolName,
              }),
          );
      }

      // Lastly, handle assistant messages.
      case 'assistant': {
        if (!Array.isArray(coreMessage.content)) {
          throw new TypeError('Core message content is not an array');
        }

        // Langchain handles tool calls on a separate property.
        const toolCalls = coreMessage.content.filter((part) => part.type === 'tool-call');

        return [
          new AIMessage({
            // Tool calls need to be handled on a separate property alongside the content.
            // This is a necessary duplication of data as required by Langchain.
            // eslint-disable-next-line @typescript-eslint/naming-convention -- Langchain uses snake_case.
            tool_calls: toolCalls.flatMap((part) => ({
              name: part.toolName,

              args: part.args as Record<string, unknown>,
              id: part.toolCallId,
              type: 'tool_call',
            })),
            content: coreMessage.content.map((part) => {
              switch (part.type) {
                case 'text': {
                  return {
                    type: 'text',
                    text: part.text,
                    ...part.providerOptions,
                  };
                }

                case 'reasoning': {
                  // Many LLMs do not support a `thinking` type, but we still want to preserve the previous thinking for better context.
                  // For simplicity, we wrap it in a <thinking> tag instead and use the `text` type.
                  return {
                    type: 'text',
                    text: `<thinking>${part.text}</thinking>`,
                    ...part.providerOptions,
                  };
                }

                case 'redacted-reasoning': {
                  // Similar to the `reasoning type`, redacted reasoning is not supported by many LLMs.
                  // To preserve the previous thinking for better context, we wrap it in a <redacted-thinking> tag instead and use the `text` type.
                  return {
                    type: 'text',
                    text: `<redacted-thinking>${part.data}</redacted-thinking>`,
                    ...part.providerOptions,
                  };
                }

                case 'file': {
                  return {
                    type: 'document',
                    source: part.data,
                    ...part.providerOptions,
                  };
                }

                case 'tool-call': {
                  return {
                    type: 'tool_use',
                    name: part.toolName,
                    id: part.toolCallId,
                    input: JSON.stringify(part.args),
                  };
                }

                default: {
                  const exhaustiveCheck: never = part;
                  throw new Error(`Unknown part type: ${String(exhaustiveCheck)}`);
                }
              }
            }),
          }),
        ];
      }

      case 'system': {
        return [
          new SystemMessage({
            content: coreMessage.content,
          }),
        ];
      }

      default: {
        const exhaustiveCheck: never = coreMessage;
        throw new Error(`Unknown message role: ${String(exhaustiveCheck)}`);
      }
    }
  });

  return langchainMessages;
};
