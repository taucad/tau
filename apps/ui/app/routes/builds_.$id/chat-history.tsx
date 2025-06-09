import { memo, useCallback, useRef, useMemo, useState } from 'react';
import type { Message } from '@ai-sdk/react';
import { Virtuoso } from 'react-virtuoso';
import type { VirtuosoHandle } from 'react-virtuoso';
import { ChatMessage } from '~/routes/builds_.$id/chat-message.js';
import { ScrollDownButton } from '~/routes/builds_.$id/scroll-down-button.js';
import { ChatError } from '~/routes/builds_.$id/chat-error.js';
import { ChatStatus } from '~/routes/builds_.$id/chat-status.js';
import type { ChatTextareaProperties } from '~/components/chat/chat-textarea.js';
import { ChatTextarea } from '~/components/chat/chat-textarea.js';
import { createMessage } from '~/utils/chat.js';
import { MessageRole, MessageStatus } from '~/types/chat.js';
import { useAiChat } from '~/components/chat/ai-chat-provider.js';
import { AnimatedShinyText } from '~/components/magicui/animated-shiny-text.js';
import { cn } from '~/utils/ui.js';
import { ChatSelector } from '~/routes/builds_.$id/chat-selector.js';

// Memoized individual message item component to prevent re-renders
const MessageItem = memo(function ({
  message,
  onEdit,
  onRetry,
}: {
  readonly message: Message;
  readonly onEdit: (event: Parameters<ChatTextareaProperties['onSubmit']>[0], messageId: string) => Promise<void>;
  readonly onRetry: ({ modelId }: { modelId?: string }) => void;
}) {
  return (
    <div className="px-4 py-2">
      <ChatMessage message={message} onEdit={async (event) => onEdit(event, message.id)} onRetry={onRetry} />
    </div>
  );
});

// Memoized status item component
const StatusItem = memo(function ({ isCreating }: { readonly isCreating: boolean }) {
  return (
    <div className="px-4 py-2">
      <AnimatedShinyText className="text-sm italic">{isCreating ? 'Creating...' : 'Generating...'}</AnimatedShinyText>
    </div>
  );
});

export const ChatHistory = memo(function () {
  const { append, messages, reload, setMessages, status } = useAiChat();
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  // Memoize the onSubmit callback to prevent unnecessary re-renders
  const onSubmit: ChatTextareaProperties['onSubmit'] = useCallback(
    async ({ content, model, metadata, imageUrls }) => {
      const userMessage = createMessage({
        content,
        role: MessageRole.User,
        status: MessageStatus.Pending,
        metadata: metadata ?? {},
        model,
        imageUrls,
      });
      void append(userMessage);
    },
    [append],
  );

  // Memoize the editMessage callback
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

  // Memoize the onEdit callback with stable reference
  const onEdit = useCallback(
    async (
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
    },
    [editMessage],
  );

  // Create stable retry callbacks for each message using a Map to avoid recreation
  const retryCallbacks = useRef(new Map<number, ({ modelId }: { modelId?: string }) => void>());

  // Memoize the createOnRetry callback factory with stable references
  const createOnRetry = useCallback(
    (messageIndex: number) => {
      // Return existing callback if it exists, otherwise create and cache new one
      if (retryCallbacks.current.has(messageIndex)) {
        return retryCallbacks.current.get(messageIndex)!;
      }

      const callback = ({ modelId }: { modelId?: string }) => {
        setMessages((messages) => {
          // Slicing with a negative index returns non-empty array, so we need
          // to ensure that the slice index is positive in the case only 2 messages are present.
          const sliceIndex = Math.max(messageIndex - 1, 0);
          const previousMessage = messages[sliceIndex];
          const updatedMessages = [
            ...messages.slice(0, sliceIndex),
            { ...previousMessage, model: modelId ?? previousMessage.model },
          ];
          return updatedMessages;
        });

        void reload();
      };

      retryCallbacks.current.set(messageIndex, callback);
      return callback;
    },
    [setMessages, reload],
  );

  // Clear old callbacks when messages array changes significantly
  useMemo(() => {
    // Keep only callbacks for current message indices
    const currentCallbacks = new Map<number, ({ modelId }: { modelId?: string }) => void>();
    for (let i = 0; i < messages.length; i++) {
      const existingCallback = retryCallbacks.current.get(i);
      if (existingCallback) {
        currentCallbacks.set(i, existingCallback);
      }
    }

    retryCallbacks.current = currentCallbacks;
  }, [messages.length]);

  // Create optimized data structure for Virtuoso - only recompute when messages or status changes
  const virtuosoData = useMemo(() => {
    const data: Array<{
      type: 'message' | 'status';
      message?: Message;
      // Add a stable key for better reconciliation
      key: string;
    }> = [];

    for (const [index, message] of messages.entries()) {
      // Add status text for specific conditions
      if (
        message.role === 'assistant' &&
        message.parts?.length === 1 &&
        status === 'submitted' &&
        index === messages.length - 1
      ) {
        data.push({
          type: 'status',
          key: `status-${message.id}-submitted`,
        });
      }

      if (
        message.role === 'assistant' &&
        message.parts?.length === 1 &&
        status === 'streaming' &&
        index === messages.length - 1
      ) {
        data.push({
          type: 'status',
          key: `status-${message.id}-streaming`,
        });
      }

      data.push({
        type: 'message',
        message,
        key: `message-${message.id}`,
      });
    }

    return data;
  }, [messages, status]);

  // Memoize the item renderer for Virtuoso with stable references
  const renderItem = useCallback(
    (index: number) => {
      const item = virtuosoData[index];

      if (item?.type === 'status') {
        const isCreating = status === 'submitted';
        return <StatusItem key={item.key} isCreating={isCreating} />;
      }

      if (item?.type === 'message' && item.message) {
        return <MessageItem key={item.key} message={item.message} onEdit={onEdit} onRetry={createOnRetry(index)} />;
      }

      return null;
    },
    [virtuosoData, status, onEdit, createOnRetry],
  );

  // Track scroll state for the scroll button
  const [atBottom, setAtBottom] = useState(true);

  const handleAtBottomStateChange = useCallback((atBottom: boolean) => {
    setAtBottom(atBottom);
  }, []);

  // Scroll to bottom when new messages arrive
  const scrollToBottom = useCallback(() => {
    if (virtuosoRef.current && virtuosoData.length > 0) {
      virtuosoRef.current.scrollToIndex({
        index: virtuosoData.length - 1,
        align: 'end',
        behavior: 'smooth',
      });
    }
  }, [virtuosoData.length]);

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex items-center justify-between border-b p-2 pl-12">
        <ChatSelector />
      </div>
      <div className="-mb-3 flex-1 overflow-hidden">
        <Virtuoso
          ref={virtuosoRef}
          alignToBottom
          totalCount={virtuosoData.length}
          itemContent={renderItem}
          followOutput="smooth"
          className="h-full"
          style={{ height: '100%', paddingBottom: '2.5rem' }}
          atBottomStateChange={handleAtBottomStateChange}
          components={{
            Header: () => <div className="pt-2" />,
            EmptyPlaceholder: () => (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <p>Start a conversation...</p>
              </div>
            ),
            Footer: () => (
              <div className="px-4 pb-12">
                <ChatError />
              </div>
            ),
          }}
        />
        <ScrollDownButton hasContent={messages.length > 0} isVisible={!atBottom} onScrollToBottom={scrollToBottom} />
      </div>
      <div className={cn('relative mx-2 mb-2 rounded-2xl')}>
        <ChatStatus status={status} className="absolute inset-x-0 -top-9" />
        <ChatTextarea onSubmit={onSubmit} />
      </div>
    </div>
  );
});
