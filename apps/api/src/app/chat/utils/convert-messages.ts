import type { BaseMessageLike, MessageContentComplex } from '@langchain/core/messages';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import type { CoreMessage, Message, ToolCallPart } from 'ai';

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

  const langchainMessages = coreMessages.flatMap((coreMessage) => {
    // Handle user messages which contain invalid attachments for Langchain.
    // AI SDK converts attachments to a buffer representation which is incompatible
    // with Langchain images, which needs a URL instead of a buffer.
    if (coreMessage.role === 'user') {
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
    if (coreMessage.role === 'tool') {
      return coreMessage.content.map((part) => {
        const matchingAssistantToolMessage = coreMessages.find(
          (message) =>
            message.role === 'assistant' &&
            Array.isArray(message.content) &&
            message.content.find((content) => content.type === 'tool-call' && content.toolCallId === part.toolCallId),
        );
        const matchingToolCall = Array.isArray(matchingAssistantToolMessage?.content)
          ? matchingAssistantToolMessage?.content.find(
              (content) => content.type === 'tool-call' && content.toolCallId === part.toolCallId,
            )
          : null;
        if (!matchingToolCall) {
          throw new Error('Matching tool call not found');
        }

        // TODO: Langchain is buggy when dealing with tool calls and corresponding tool results.
        // For now we are just converting to an AI Message to workaround that.
        // new ToolMessage({
        //   content: JSON.stringify(part.result),
        //   // eslint-disable-next-line @typescript-eslint/naming-convention -- Langchain uses snake_case.
        //   tool_call_id: part.toolCallId,
        //   name: part.toolName,
        // }),
        return new AIMessage({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                type: 'tool',
                toolCallName: part.toolName,
                toolCallId: part.toolCallId,
                toolCallResult: part.result,
                args: (matchingToolCall as ToolCallPart).args,
              }),
            },
          ],
        });
      });
    }

    // Lastly, handle assistant messages.
    if (coreMessage.role === 'assistant') {
      if (!Array.isArray(coreMessage.content)) {
        throw new TypeError('Core message content is not an array');
      }

      const content = coreMessage.content.flatMap<MessageContentComplex>((part) => {
        if (part.type === 'text') {
          return [
            {
              type: 'text',
              text: part.text,
              ...part.providerOptions,
            },
          ];
        }

        if (part.type === 'reasoning') {
          // Many LLMs do not support a `thinking` type, but we still want to preserve the previous thinking for better context.
          // For simplicity, we wrap it in a <thinking> tag instead and use the `text` type.
          return [
            {
              type: 'text',
              text: `<thinking>${part.text}</thinking>`,
              ...part.providerOptions,
            },
          ];
        }

        if (part.type === 'redacted-reasoning') {
          // Similar to the `reasoning type`, redacted reasoning is not supported by many LLMs.
          // To preserve the previous thinking for better context, we wrap it in a <redacted-thinking> tag instead and use the `text` type.
          return [
            {
              type: 'text',
              text: `<redacted-thinking>${part.data}</redacted-thinking>`,
              ...part.providerOptions,
            },
          ];
        }

        if (part.type === 'file') {
          return [
            {
              type: 'document',
              source: part.data,
              ...part.providerOptions,
            },
          ];
        }

        // TODO: Langchain is buggy when dealing with tool calls and corresponding tool results.
        // For now we are just converting to an AI Message to workaround that.
        // if (part.type === 'tool-call') {
        //   return {
        //     type: 'tool_use',
        //     name: part.toolName,
        //     id: part.toolCallId,
        //     input: JSON.stringify(part.args),
        //   };
        // }
        if (part.type === 'tool-call') {
          return [];
        }

        const exhaustiveCheck: never = part;
        throw new Error(`Unknown part type: ${String(exhaustiveCheck)}`);
      });

      if (content.length === 0) {
        return [];
      }

      return [
        new AIMessage({
          // Tool calls need to be handled on a separate property alongside the content.
          // This is a necessary duplication of data as required by Langchain.
          // TODO: Langchain is buggy when dealing with tool calls and corresponding tool results.
          // For now we are just converting to an AI Message to workaround that.
          // tool_calls: toolCalls.flatMap((part) => ({
          //   name: part.toolName,

          //   args: part.args as Record<string, unknown>,
          //   id: part.toolCallId,
          //   type: 'tool_call',
          // })),
          content,
        }),
      ];
    }

    if (coreMessage.role === 'system') {
      return [
        new SystemMessage({
          content: coreMessage.content,
        }),
      ];
    }

    const exhaustiveCheck: never = coreMessage;
    throw new Error(`Unknown message role: ${String(exhaustiveCheck)}`);
  });

  return langchainMessages;
};
