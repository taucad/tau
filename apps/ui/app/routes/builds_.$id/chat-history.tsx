import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import type { VirtuosoHandle } from 'react-virtuoso';
import { XIcon, MessageCircle } from 'lucide-react';
import { messageRole, messageStatus } from '@taucad/chat/constants';
import { ChatMessage } from '#routes/builds_.$id/chat-message.js';
import { ScrollDownButton } from '#routes/builds_.$id/scroll-down-button.js';
import { ChatError } from '#routes/builds_.$id/chat-error.js';
import type { ChatTextareaProperties, ChatTextareaHandle } from '#components/chat/chat-textarea-types.js';
import { ChatTextarea } from '#components/chat/chat-textarea.js';
import { createMessage } from '#utils/chat.utils.js';
import { useChatActions, useChatSelector } from '#hooks/use-chat.js';
import { ChatHistorySelector } from '#routes/builds_.$id/chat-history-selector.js';
import { ChatHistoryStatus } from '#routes/builds_.$id/chat-history-status.js';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import {
  FloatingPanel,
  FloatingPanelClose,
  FloatingPanelContent,
  FloatingPanelContentHeader,
  FloatingPanelErrorContent,
  FloatingPanelTrigger,
} from '#components/ui/floating-panel.js';
import { useKeybinding } from '#hooks/use-keyboard.js';
import type { KeyCombination } from '#utils/keys.utils.js';
import { formatKeyCombination } from '#utils/keys.utils.js';
import { cn } from '#utils/ui.utils.js';
import { ChatHistoryEmpty } from '#routes/builds_.$id/chat-history-empty.js';
import { useKernel } from '#hooks/use-kernel.js';
import { useChatSnapshot } from '#hooks/use-chat-snapshot.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';

const toggleChatHistoryKeyCombination = {
  key: 'c',
  ctrlKey: true,
} satisfies KeyCombination;

// Memoized individual message item component to prevent re-renders
const MessageItem = memo(function ({ messageId }: { readonly messageId: string }) {
  return (
    <div className="py-1">
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
  const messageIds = useChatSelector((state) => state.messageOrder);
  const { sendMessage } = useChatActions();
  const { kernel } = useKernel();
  const snapshot = useChatSnapshot();
  const [testingEnabled] = useCookie(cookieName.chatTestingEnabled, true);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const chatTextareaRef = useRef<ChatTextareaHandle>(null);
  const toggleChatHistory = useCallback(() => {
    setIsExpanded?.((current) => !current);
  }, [setIsExpanded]);

  const { formattedKeyCombination } = useKeybinding(toggleChatHistoryKeyCombination, toggleChatHistory);

  // State to trigger focus on the textarea when a new chat is created
  const [shouldFocusTextarea, setShouldFocusTextarea] = useState(false);

  // Focus the textarea when the flag is set (after React's render cycle completes)
  useEffect(() => {
    if (shouldFocusTextarea) {
      chatTextareaRef.current?.focus();
      setShouldFocusTextarea(false);
    }
  }, [shouldFocusTextarea]);

  // Callback for when a new chat is created
  const handleNewChat = useCallback(() => {
    setShouldFocusTextarea(true);
  }, []);

  // Memoize the onSubmit callback to prevent unnecessary re-renders
  const onSubmit: ChatTextareaProperties['onSubmit'] = useCallback(
    async ({ content, model, metadata, imageUrls }) => {
      const userMessage = createMessage({
        content,
        role: messageRole.user,
        metadata: {
          ...metadata,
          kernel,
          model,
          status: messageStatus.pending,
          snapshot,
          testingEnabled,
        },
        imageUrls,
      });
      sendMessage(userMessage);
    },
    [sendMessage, kernel, snapshot, testingEnabled],
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
        align: 'end',
        behavior: 'smooth',
      });
    }
  }, []);

  return (
    <FloatingPanel isOpen={isExpanded} side="right" className={className} onOpenChange={setIsExpanded}>
      <FloatingPanelContent
        className={cn(!isExpanded && 'hidden')}
        errorFallback={(errorProps) => (
          <FloatingPanelErrorContent
            {...errorProps}
            title="Chat Unavailable"
            description="Something went wrong while loading the chat."
          />
        )}
      >
        {/* Header with chat selector */}
        <FloatingPanelContentHeader>
          <ChatHistorySelector
            closeButton={
              <FloatingPanelClose
                icon={XIcon}
                tooltipContent={(isOpen) => (
                  <div className="flex items-center gap-2">
                    {isOpen ? 'Close' : 'Open'} Chat
                    <KeyShortcut variant="tooltip">{formattedKeyCombination}</KeyShortcut>
                  </div>
                )}
              />
            }
            onNewChat={handleNewChat}
          />
        </FloatingPanelContentHeader>

        {/* Sticky status bar - last activity, model, cost */}
        <ChatHistoryStatus />

        {/* Main chat content area */}
        <Virtuoso
          ref={virtuosoRef}
          totalCount={messageIds.length}
          itemContent={renderItem}
          followOutput="smooth"
          className="mt-1 h-full"
          atBottomStateChange={handleAtBottomStateChange}
          components={{
            Header: () => null,
            EmptyPlaceholder: () => (
              <div className="-mb-12 h-full p-2 pt-1">
                <ChatHistoryEmpty className="m-0 flex-1 justify-end" />
              </div>
            ),
            Footer: () => (
              <ChatError
                className="px-4 pb-4"
                isOpen={isErrorCollapsibleOpen}
                onOpenChange={setIsErrorCollapsibleOpen}
              />
            ),
          }}
        />
        <ScrollDownButton hasContent={messageIds.length > 0} isVisible={!atBottom} onScrollToBottom={scrollToBottom} />

        {/* Chat input area */}
        <div className="relative mx-2 mb-2">
          <ChatTextarea
            ref={chatTextareaRef}
            mode="main"
            className="rounded-sm"
            enableAutoFocus={false}
            onSubmit={onSubmit}
          />
        </div>
      </FloatingPanelContent>
    </FloatingPanel>
  );
});
