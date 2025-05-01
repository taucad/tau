import { useCallback, useRef } from 'react';
import type { JSX } from 'react';
import type { Message } from '@ai-sdk/react';
import { ChatMessage } from './chat-message.js';
import { ScrollDownButton } from './scroll-down-button.js';
import { ChatError } from './chat-error.js';
import type { ChatTextareaProperties } from '@/components/chat/chat-textarea.js';
import { ChatTextarea } from '@/components/chat/chat-textarea.js';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable.js';
import { createMessage } from '@/contexts/use-chat.js';
import { MessageRole, MessageStatus } from '@/types/chat.js';
import { useBuild } from '@/hooks/use-build2.js';
import { useCookie } from '@/hooks/use-cookie.js';
import { useModels } from '@/hooks/use-models.js';
import { useAiChat } from '@/components/chat/ai-chat-provider.js';

const chatResizeCookieNameHistory = 'chat-history-resize';

export function ChatHistory(): JSX.Element {
  const { append, messages, reload, setMessages } = useAiChat();
  const [chatResizeHistory, setChatResizeHistory] = useCookie(chatResizeCookieNameHistory, [85, 15]);
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
    <ResizablePanelGroup direction="vertical" autoSaveId={chatResizeCookieNameHistory} onLayout={setChatResizeHistory}>
      <ResizablePanel
        order={1}
        id="chat-history-content"
        defaultSize={chatResizeHistory[0]}
        className="relative flex-1"
      >
        <div ref={chatContainerReference} className="h-full overflow-y-auto p-4 pb-0">
          <div className="space-y-4">
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                models={models ?? []}
                onEdit={async (event) => onEdit(event, message.id)}
              />
            ))}
            <ChatError />
          </div>
          <ScrollDownButton containerRef={chatContainerReference} hasContent={messages.length > 0} />
        </div>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel
        order={2}
        id="chat-input"
        minSize={15}
        maxSize={50}
        defaultSize={chatResizeHistory[1]}
        className="p-2"
      >
        <ChatTextarea models={models ?? []} onSubmit={onSubmit} />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
