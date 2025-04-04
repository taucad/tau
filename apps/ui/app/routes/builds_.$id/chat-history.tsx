import { ChatTextarea, ChatTextareaProperties } from '@/components/chat/chat-textarea';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { ChatMessage } from './chat-message';
import { useRef } from 'react';
import { createMessage, useChat } from '@/contexts/use-chat';
import { MessageRole, MessageStatus } from '@/types/chat';
import { useBuild } from '@/hooks/use-build2';
import { useCookie } from '@/utils/cookies';
import { useModels } from '@/hooks/use-models';
import { ScrollDownButton } from './scroll-down-button';

const CHAT_RESIZE_COOKIE_NAME_HISTORY = 'chat-history-resize';

export const ChatHistory = () => {
  const { addMessage, messages, editMessage } = useChat();
  const { setCode } = useBuild();
  const [chatResizeHistory, setChatResizeHistory] = useCookie(CHAT_RESIZE_COOKIE_NAME_HISTORY, [85, 15]);
  const { data: models } = useModels();
  const chatContainerReference = useRef<HTMLDivElement>(null);

  const onSubmit: ChatTextareaProperties['onSubmit'] = async ({ content, model, metadata, imageUrls }) => {
    const userMessage = createMessage({
      content,
      role: MessageRole.User,
      status: MessageStatus.Pending,
      metadata: metadata ?? { systemHints: [] },
      model,
      imageUrls,
    });
    addMessage(userMessage);
  };

  const onEdit = async (
    { content, model, metadata, imageUrls }: Parameters<ChatTextareaProperties['onSubmit']>[0],
    messageId: string,
  ) => {
    const userMessage = createMessage({
      id: messageId,
      content,
      role: MessageRole.User,
      status: MessageStatus.Pending,
      metadata: metadata ?? { systemHints: [] },
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
            {messages.map((message, index) => (
              <ChatMessage
                message={message}
                key={index}
                onEdit={(event) => onEdit(event, message.id)}
                models={models ?? []}
                onCodeApply={setCode}
              />
            ))}
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
        <ChatTextarea onSubmit={onSubmit} models={models ?? []} />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
};
