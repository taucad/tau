import { Fragment, memo, useCallback, useRef } from 'react';
import type { Message } from '@ai-sdk/react';
import { ChatMessage } from '@/routes/builds_.$id/chat-message.js';
import { ScrollDownButton } from '@/routes/builds_.$id/scroll-down-button.js';
import { ChatError } from '@/routes/builds_.$id/chat-error.js';
import type { ChatTextareaProperties } from '@/components/chat/chat-textarea.js';
import { ChatTextarea } from '@/components/chat/chat-textarea.js';
import { createMessage } from '@/contexts/use-chat.js';
import { MessageRole, MessageStatus } from '@/types/chat.js';
import { useModels } from '@/hooks/use-models.js';
import { useAiChat } from '@/components/chat/ai-chat-provider.js';
import { AnimatedShinyText } from '@/components/magicui/animated-shiny-text.js';
import { When } from '@/components/ui/utils/when.js';

export const ChatHistory = memo(function () {
  const { append, messages, reload, setMessages, status } = useAiChat();
  const { data: models } = useModels();
  const chatContainerReference = useRef<HTMLDivElement>(null);

  const onSubmit: ChatTextareaProperties['onSubmit'] = async ({ content, model, metadata, imageUrls }) => {
    const userMessage = createMessage({
      content,
      role: MessageRole.User,
      status: MessageStatus.Pending,
      metadata: metadata ?? {},
      model,
      imageUrls,
    });
    void append(userMessage);
  };

  const editMessage = useCallback(
    (newMessage: Message) => {
      setMessages((messages) => {
        const currentMessages = messages;
        const existingMessageIndex = currentMessages.findIndex((message) => message.id === newMessage.id);
        if (existingMessageIndex === -1) {
          throw new Error('Message not found');
        }

        const updatedMessages = [...currentMessages.slice(0, existingMessageIndex), newMessage];

        return updatedMessages;
      });
      void reload();
    },
    [setMessages, reload],
  );

  const onEdit = async (
    { content, model, metadata, imageUrls }: Parameters<ChatTextareaProperties['onSubmit']>[0],
    messageId: string,
  ) => {
    const userMessage = createMessage({
      id: messageId,
      content,
      role: MessageRole.User,
      status: MessageStatus.Pending,
      metadata: metadata ?? {},
      model,
      imageUrls,
    });
    editMessage(userMessage);
  };

  return (
    <div className="relative flex h-full flex-col">
      <div ref={chatContainerReference} className="-mb-10 flex-1 overflow-y-auto pb-10">
        <div className="space-y-4 p-4 pb-0">
          {messages.map((message, index) => (
            <Fragment key={message.id}>
              <When
                shouldRender={
                  message.role === 'assistant' &&
                  message.parts?.length === 1 &&
                  status === 'submitted' &&
                  index === messages.length - 1
                }
              >
                <AnimatedShinyText className="text-sm italic">Creating...</AnimatedShinyText>
              </When>
              <When
                shouldRender={
                  message.role === 'assistant' &&
                  message.parts?.length === 1 &&
                  status === 'streaming' &&
                  index === messages.length - 1
                }
              >
                <AnimatedShinyText className="text-sm italic">Generating...</AnimatedShinyText>
              </When>
              <ChatMessage
                message={message}
                models={models ?? []}
                onEdit={async (event) => onEdit(event, message.id)}
                onRetry={({ modelId }) => {
                  setMessages((messages) => {
                    // Slicing with a negative index returns non-empty array, so we need
                    // to ensure that the slice index is positve in the case only 2 messages are present.
                    const sliceIndex = Math.max(index - 1, 0);
                    const previousMessage = messages[sliceIndex];
                    const updatedMessages = [
                      ...messages.slice(0, sliceIndex),
                      { ...previousMessage, model: modelId ?? previousMessage.model },
                    ];
                    return updatedMessages;
                  });

                  void reload();
                }}
              />
            </Fragment>
          ))}
          <ChatError />
        </div>
        <ScrollDownButton containerRef={chatContainerReference} hasContent={messages.length > 0} />
      </div>
      <div className="bottom-0 isolate z-10 mx-3 mb-3 rounded-2xl bg-background">
        <ChatTextarea models={models ?? []} onSubmit={onSubmit} />
      </div>
    </div>
  );
});
