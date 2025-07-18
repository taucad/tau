import { memo, useCallback, useRef, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import type { VirtuosoHandle } from 'react-virtuoso';
import { useSelector } from '@xstate/react';
import { ChatMessage } from '~/routes/builds_.$id/chat-message.js';
import { ScrollDownButton } from '~/routes/builds_.$id/scroll-down-button.js';
import { ChatError } from '~/routes/builds_.$id/chat-error.js';
import { ChatStatus } from '~/routes/builds_.$id/chat-status.js';
import type { ChatTextareaProperties } from '~/components/chat/chat-textarea.js';
import { ChatTextarea } from '~/components/chat/chat-textarea.js';
import { createMessage } from '~/utils/chat.js';
import { messageRole, messageStatus } from '~/types/chat.types.js';
import { useChatActions, useChatSelector } from '~/components/chat/ai-chat-provider.js';
import { cn } from '~/utils/ui.js';
import { ChatSelector } from '~/routes/builds_.$id/chat-selector.js';
import { cadActor } from '~/routes/builds_.$id/cad-actor.js';

// Memoized individual message item component to prevent re-renders
const MessageItem = memo(function ({ messageId }: { readonly messageId: string }) {
  return (
    <div className="px-4 py-2">
      <ChatMessage messageId={messageId} />
    </div>
  );
});

export const ChatHistory = memo(function () {
  const kernel = useSelector(cadActor, (state) => state.context.kernelTypeSelected);
  const messageIds = useChatSelector((state) => state.context.messageOrder);
  const { append } = useChatActions();
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  // Memoize the onSubmit callback to prevent unnecessary re-renders
  const onSubmit: ChatTextareaProperties['onSubmit'] = useCallback(
    async ({ content, model, metadata, imageUrls }) => {
      const userMessage = createMessage({
        content,
        role: messageRole.user,
        status: messageStatus.pending,
        metadata: { kernel, ...metadata },
        model,
        imageUrls,
      });
      append(userMessage);
    },
    [append, kernel],
  );

  // Memoize the item renderer for Virtuoso with stable references
  const renderItem = useCallback(
    (index: number) => {
      const messageId = messageIds[index]!;

      return <MessageItem key={`message-${messageId}`} messageId={messageId} />;
    },
    [messageIds],
  );
  // Track scroll state for the scroll button
  const [atBottom, setAtBottom] = useState(true);

  const handleAtBottomStateChange = useCallback((atBottom: boolean) => {
    setAtBottom(atBottom);
  }, []);

  // Scroll to bottom when new messages arrive
  const scrollToBottom = useCallback(() => {
    if (virtuosoRef.current && messageIds.length > 0) {
      virtuosoRef.current.scrollToIndex({
        index: messageIds.length - 1,
        align: 'end',
        behavior: 'smooth',
      });
    }
  }, [messageIds.length]);

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex items-center justify-between border-b p-2">
        <ChatSelector />
      </div>
      <div className="-mb-3 flex-1 overflow-hidden">
        <Virtuoso
          ref={virtuosoRef}
          alignToBottom
          totalCount={messageIds.length}
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
        <ScrollDownButton hasContent={messageIds.length > 0} isVisible={!atBottom} onScrollToBottom={scrollToBottom} />
      </div>
      <div className={cn('relative mx-2 mb-2 rounded-2xl')}>
        <ChatStatus className="absolute inset-x-0 -top-9" />
        <ChatTextarea onSubmit={onSubmit} />
      </div>
    </div>
  );
});
