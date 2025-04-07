import { ChatTextarea, ChatTextareaProperties } from '@/components/chat/chat-textarea';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { ChatMessage } from './chat-message';
import { useCallback, useRef } from 'react';
import { createMessage, USE_CHAT_CONSTANTS } from '@/contexts/use-chat';
import { Message, useChat } from '@ai-sdk/react';
import { MessageRole, MessageStatus } from '@/types/chat';
import { useBuild } from '@/hooks/use-build2';
import { useCookie } from '@/hooks/use-cookie';
import { useModels } from '@/hooks/use-models';
import { ScrollDownButton } from './scroll-down-button';
import { ChatError } from './chat-error';

const CHAT_RESIZE_COOKIE_NAME_HISTORY = 'chat-history-resize';

export const ChatHistory = () => {
  const { setCode, build } = useBuild();
  const { append, messages, reload, setMessages } = useChat({ ...USE_CHAT_CONSTANTS, id: build?.id });
  const [chatResizeHistory, setChatResizeHistory] = useCookie(CHAT_RESIZE_COOKIE_NAME_HISTORY, [85, 15]);
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
    append(userMessage);
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
      reload();
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
    <ResizablePanelGroup
      direction="vertical"
      onLayout={setChatResizeHistory}
      autoSaveId={CHAT_RESIZE_COOKIE_NAME_HISTORY}
    >
      <ResizablePanel
        order={1}
        id="chat-history-content"
        defaultSize={chatResizeHistory[0]}
        className="relative flex-1"
      >
        <div className="h-full overflow-y-auto p-4 pb-0" ref={chatContainerReference}>
          <div className="space-y-4">
            {messages.map((message) => (
              <ChatMessage
                message={message}
                key={message.id}
                onEdit={(event) => onEdit(event, message.id)}
                models={models ?? []}
                onCodeApply={setCode}
                conversationId={build?.id}
              />
            ))}
            <ChatError id={build?.id} />
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
        <ChatTextarea onSubmit={onSubmit} models={models ?? []} conversationId={build?.id} />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
};
