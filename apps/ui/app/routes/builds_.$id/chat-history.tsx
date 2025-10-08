import { memo, useCallback, useRef, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import type { VirtuosoHandle } from 'react-virtuoso';
import { useSelector } from '@xstate/react';
import { XIcon, MessageCircle } from 'lucide-react';
import { ChatMessage } from '#routes/builds_.$id/chat-message.js';
import { ScrollDownButton } from '#routes/builds_.$id/scroll-down-button.js';
import { ChatError } from '#routes/builds_.$id/chat-error.js';
import { ChatStatus } from '#routes/builds_.$id/chat-status.js';
import type { ChatTextareaProperties } from '#components/chat/chat-textarea.js';
import { ChatTextarea } from '#components/chat/chat-textarea.js';
import { createMessage } from '#utils/chat.js';
import { messageRole, messageStatus } from '#types/chat.types.js';
import { useChatActions, useChatSelector } from '#components/chat/ai-chat-provider.js';
import { ChatSelector } from '#routes/builds_.$id/chat-selector.js';
import { cadActor } from '#routes/builds_.$id/cad-actor.js';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import {
  FloatingPanel,
  FloatingPanelClose,
  FloatingPanelContent,
  FloatingPanelContentHeader,
  FloatingPanelTrigger,
} from '#components/ui/floating-panel.js';
import { useKeydown } from '#hooks/use-keydown.js';
import type { KeyCombination } from '#utils/keys.js';
import { formatKeyCombination } from '#utils/keys.js';
import { cn } from '#utils/ui.js';
import { ChatHistoryEmpty } from '#routes/builds_.$id/chat-history-empty.js';

const toggleChatHistoryKeyCombination = {
  key: 'c',
  ctrlKey: true,
} satisfies KeyCombination;

// Memoized individual message item component to prevent re-renders
const MessageItem = memo(function ({ messageId }: { readonly messageId: string }) {
  return (
    <div className="py-2">
      <ChatMessage messageId={messageId} />
    </div>
  );
});

// Chat History Trigger Component
export const ChatHistoryTrigger = memo(function ({
  isOpen,
  onToggle,
  className,
}: {
  readonly isOpen: boolean;
  readonly onToggle: () => void;
  readonly className?: string;
}) {
  return (
    <FloatingPanelTrigger
      icon={MessageCircle}
      tooltipContent={
        <div className="flex items-center gap-2">
          {isOpen ? 'Close' : 'Open'} Chat
          <KeyShortcut variant="tooltip">{formatKeyCombination(toggleChatHistoryKeyCombination)}</KeyShortcut>
        </div>
      }
      isOpen={isOpen}
      tooltipSide="right"
      className={className}
      onClick={onToggle}
    />
  );
});

export const ChatHistory = memo(function (props: {
  readonly className?: string;
  readonly isExpanded?: boolean;
  readonly setIsExpanded?: (value: boolean | ((current: boolean) => boolean)) => void;
}) {
  const { className, isExpanded = true, setIsExpanded } = props;
  const kernel = useSelector(cadActor, (state) => state.context.kernelTypeSelected);
  const messageIds = useChatSelector((state) => state.context.messageOrder);
  const { append } = useChatActions();
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const toggleChatHistory = useCallback(() => {
    setIsExpanded?.((current) => !current);
  }, [setIsExpanded]);

  const { formattedKeyCombination } = useKeydown(toggleChatHistoryKeyCombination, toggleChatHistory);

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
    <FloatingPanel isOpen={isExpanded} className={className} onOpenChange={setIsExpanded}>
      <FloatingPanelClose
        side="left"
        align="start"
        icon={XIcon}
        tooltipContent={(isOpen) => (
          <div className="flex items-center gap-2">
            {isOpen ? 'Close' : 'Open'} Chat
            <KeyShortcut variant="tooltip">{formattedKeyCombination}</KeyShortcut>
          </div>
        )}
      />
      <FloatingPanelContent className={cn(!isExpanded && 'hidden')}>
        {/* Header with search */}
        <FloatingPanelContentHeader>
          <ChatSelector />
        </FloatingPanelContentHeader>

        {/* Main chat content area */}
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
              Header: () => null,
              EmptyPlaceholder: () => <ChatHistoryEmpty className="-mb-7 h-full justify-end" />,
              Footer: () => (
                <div className="px-4 pb-12">
                  <ChatError />
                </div>
              ),
            }}
          />
          <ScrollDownButton
            hasContent={messageIds.length > 0}
            isVisible={!atBottom}
            onScrollToBottom={scrollToBottom}
          />
        </div>

        {/* Chat input area */}
        <div className="relative mx-2 mb-2 rounded-2xl">
          <ChatStatus className="absolute inset-x-0 -top-7" />
          <ChatTextarea className="rounded-sm" onSubmit={onSubmit} />
        </div>
      </FloatingPanelContent>
    </FloatingPanel>
  );
});
