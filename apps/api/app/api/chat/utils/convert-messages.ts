import type { BaseMessageLike } from '@langchain/core/messages';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import type { Logger } from '@nestjs/common';
import type { ModelMessage, ToolUIPart, UIDataTypes, UIMessage, UIMessagePart, UITools } from 'ai';

const isToolPart = (part: UIMessagePart<UIDataTypes, UITools>): part is ToolUIPart => part.type.startsWith('tool-');

/**
 * Preprocesses UI messages to handle partial tool calls by converting them to completed state
 * with mock results. This prevents MessageConversionError when partial tool calls are present.
 *
 * @param messages - The UI messages that may contain partial tool calls
 * @returns Processed messages with all tool calls in completed state
 */
export function sanitizeMessagesForConversion(messages: UIMessage[], logger: Logger): UIMessage[] {
  return messages.map((message) => {
    if (message.role !== 'assistant') {
      return message;
    }

    // Handle parts array - convert partial tool calls to completed state
    const sanitizedParts = message.parts.map((part) => {
      if (isToolPart(part) && part.state === 'input-available') {
        logger.warn(
          part,
          'Converting partial tool call to completed state with mock result. This is likely due to the UI calling with incomplete tool calls.',
        );
        // Convert partial tool calls to completed state with mock result
        return {
          ...part,
          state: 'output-available' as const,
          output: `[Tool execution in progress: ${part.type}]`,
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
  uiMessages: UIMessage[],
  coreMessages: ModelMessage[],
) => BaseMessageLike[] = (uiMessages, coreMessages) => {
  // Track user message count to match correctly
  let userMessageCount = 0;

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

        const fileParts = correspondingUiMessage.parts.filter((part) => part.type === 'file');
        return [
          new HumanMessage({
            content: [
              // Map attachments to images.
              // Images always come first as the LLM is more performant when receiving images first.
              ...fileParts.map((part) => ({
                type: 'image_url',
                // eslint-disable-next-line @typescript-eslint/naming-convention -- Langchain uses snake_case.
                image_url: { url: part.url },
              })),
              // Remove all the files from the core message content.
              ...coreMessageContent.filter((part) => part.type !== 'file'),
            ],
          }),
        ];
      }

      // Handle tool messages which contain array `content`, the `content` must instead be a string.
      case 'tool': {
        return coreMessage.content.map(
          (part) =>
            new ToolMessage({
              content: JSON.stringify(part.output),
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

              args: part.input as Record<string, unknown>,
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
                    input: JSON.stringify(part.input),
                  };
                }

                case 'tool-result': {
                  return {
                    type: 'tool_result',
                    name: part.toolName,
                    id: part.toolCallId,
                    result: JSON.stringify(part.output),
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
