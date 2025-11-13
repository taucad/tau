import { memo, useCallback, useRef, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import type { VirtuosoHandle } from 'react-virtuoso';
import { XIcon, MessageCircle } from 'lucide-react';
import { messageRole, messageStatus } from '@taucad/types/constants';
import { ChatMessage } from '#routes/builds_.$id/chat-message.js';
import { ScrollDownButton } from '#routes/builds_.$id/scroll-down-button.js';
import { ChatError } from '#routes/builds_.$id/chat-error.js';
import { ChatStatus } from '#routes/builds_.$id/chat-status.js';
import type { ChatTextareaProperties } from '#components/chat/chat-textarea.js';
import { ChatTextarea } from '#components/chat/chat-textarea.js';
import { createMessage } from '#utils/chat.utils.js';
import { useChatActions, useChatSelector } from '#components/chat/chat-provider.js';
import { ChatSelector } from '#routes/builds_.$id/chat-selector.js';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import {
  FloatingPanel,
  FloatingPanelClose,
  FloatingPanelContent,
  FloatingPanelContentHeader,
  FloatingPanelTrigger,
} from '#components/ui/floating-panel.js';
import { useKeydown } from '#hooks/use-keydown.js';
import type { KeyCombination } from '#utils/keys.utils.js';
import { formatKeyCombination } from '#utils/keys.utils.js';
import { cn } from '#utils/ui.utils.js';
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
}: {
  readonly isOpen: boolean;
  readonly onToggle: () => void;
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
      tooltipSide="right"
      className={isOpen ? 'text-primary' : undefined}
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
        metadata: metadata ?? {},
        model,
        imageUrls,
      });
      append(userMessage);
    },
    [append],
  );

  // Memoize the item renderer for Virtuoso with stable references
  const renderItem = useCallback(
    (index: number) => {
      const messageId = messageIds[index]!;

      return <MessageItem key={`message-${messageId}`} messageId={messageId} />;
    },
    [messageIds],
  );

  const [atBottom, setAtBottom] = useState(true);
  const [isErrorCollapsibleOpen, setIsErrorCollapsibleOpen] = useState(false);

  const handleAtBottomStateChange = useCallback((atBottom: boolean) => {
    setAtBottom(atBottom);
  }, []);

  // Handler to scroll to the bottom of the chat
  const scrollToBottom = useCallback(() => {
    if (virtuosoRef.current) {
      virtuosoRef.current.scrollToIndex({
        index: 'LAST',
        align: 'start',
        behavior: 'smooth',
      });
    }
  }, []);

  return (
    <FloatingPanel isOpen={isExpanded} side="left" className={className} onOpenChange={setIsExpanded}>
      <FloatingPanelClose
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
        <Virtuoso
          ref={virtuosoRef}
          totalCount={messageIds.length}
          itemContent={renderItem}
          followOutput="smooth"
          className="h-full"
          atBottomStateChange={handleAtBottomStateChange}
          components={{
            Header: () => null,
            EmptyPlaceholder: () => (
              <div className="-mb-12 h-full p-2">
                <ChatHistoryEmpty className="m-0 flex-1 justify-end" />
              </div>
            ),
            Footer: () => (
              <div className="px-4 pb-12">
                <ChatError isOpen={isErrorCollapsibleOpen} onOpenChange={setIsErrorCollapsibleOpen} />
              </div>
            ),
          }}
        />
        <ScrollDownButton hasContent={messageIds.length > 0} isVisible={!atBottom} onScrollToBottom={scrollToBottom} />

        {/* Chat input area */}
        <div className="relative mx-2 mb-2">
          <ChatStatus className="absolute inset-x-0 -top-7" />
          <ChatTextarea mode="main" className="rounded-sm" enableAutoFocus={false} onSubmit={onSubmit} />
        </div>
      </FloatingPanelContent>
    </FloatingPanel>
  );
});
