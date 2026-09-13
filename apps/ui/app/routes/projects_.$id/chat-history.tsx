import { forwardRef, memo, useCallback, useEffect, useRef, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import type { ScrollerProps, VirtuosoHandle } from 'react-virtuoso';
import { XIcon, MessageCircle } from 'lucide-react';
import { messageRole } from '@taucad/chat/constants';
import { ChatMessage } from '#routes/projects_.$id/chat-message.js';
import { buildTurnGroups } from '#routes/projects_.$id/chat-turn-groups.js';
import { ScrollDownButton } from '#routes/projects_.$id/scroll-down-button.js';
import { ChatError } from '#routes/projects_.$id/chat-error.js';
import type { ChatTextareaProperties, ChatTextareaHandle } from '#components/chat/chat-textarea-types.js';
import { ChatTextarea } from '#components/chat/chat-textarea.js';
import { useChatContext, useChatSelector } from '#hooks/use-chat.js';
import { useCadChatClient } from '#chat-clients/use-cad-chat-client.js';
import { ChatHistorySelector } from '#routes/projects_.$id/chat-history-selector.js';
import { ChatHistoryStatus } from '#routes/projects_.$id/chat-history-status.js';
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
import { ChatHistoryEmpty } from '#routes/projects_.$id/chat-history-empty.js';
import { AtReferenceProvider } from '#components/chat/at-reference-context.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useChats } from '#hooks/use-chats.js';
import { useProject } from '#hooks/use-project.js';

const toggleChatHistoryKeyCombination = {
  key: 'c',
  ctrlKey: true,
} satisfies KeyCombination;

// Component-local CSS variable. Declared here (rather than in global.css)
// to keep the chat-history pinning system self-contained — the only
// consumer is `TurnGroup` (`min-h-(--chat-live-turn-min-h)`). Applied as
// inline style on `ChatScroller` so it cascades to every Virtuoso item.
//
// `--chat-live-turn-min-h` is the min-height for the last turn group so the
// user message stays pinned at the scroller top while the assistant reply
// streams in. The min-height is intentionally approximate — `min-height` is
// elastic, so a slight over/under just affects how much breathing room sits
// below the assistant reply before content grows past it. Composition: page
// header (--header-height) + chat panel chrome (~10.25rem: panel header +
// status bar + chat input + margins).
// oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- React.CSSProperties does not type custom-property keys
const chatScrollerCssVariables = {
  '--chat-live-turn-min-h': 'calc(100dvh - var(--header-height, 64px) - 10.25rem)',
} as React.CSSProperties;

// Virtuoso's `scrollToIndex` types restrict `behavior` to `'auto' | 'smooth'`,
// but at runtime the value is forwarded straight to the native `scrollTo()`
// API which also accepts `'instant'` (no animation, no layout-shift jitter
// while assistant tokens stream in). Bridge the type vs runtime mismatch
// once here so the call sites read cleanly.
// oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- runtime accepts 'instant'; Virtuoso's type is narrower than the native ScrollBehavior
const instantScrollBehavior = 'instant' as 'auto';

// One conversational turn = one Virtuoso row. Every group has the same DOM
// shape so streaming a new turn never re-mounts the previous one. The last
// turn additionally reserves viewport-height (`min-h-(--chat-live-turn-min-h)`)
// so the user message at the top of the live turn stays pinned to the
// scroller top while the assistant reply fills downward — combined with
// `scrollToIndex(LAST, align: 'start')` on submit (below), this is the only
// pinning mechanism for the live user message. We previously experimented
// with `position: sticky` to also pin past user messages while the user
// scrolls through their assistant content, but every scoping attempt
// triggered a multi-hundred-px viewport jump on wheel-up from the
// scroll-bottom — pin new user message so assistant reply streams under it.
const TurnGroup = memo(function ({
  messageIds,
  isLast,
}: {
  readonly messageIds: readonly string[];
  readonly isLast: boolean;
}) {
  return (
    <div className={cn('py-1 gap-1 flex flex-col', isLast && 'min-h-(--chat-live-turn-min-h)')}>
      {messageIds.map((id) => (
        <ChatMessage key={id} messageId={id} />
      ))}
      {isLast ? <ChatError className='mx-4' /> : null}
    </div>
  );
});

// Custom Virtuoso scroller. Single responsibility:
// `[scrollbar-gutter:stable]` permanently reserves a `--scrollbar-thickness`
// column on the inline-end edge so the inner content width does not change
// when content first overflows. Without this, the second message triggering
// overflow inserts a 9px-wide scrollbar that re-flows every bubble narrower
// (visible single-frame horizontal layout shift).
//
// `ScrollerProps` is `Pick<ComponentProps<'div'>, 'children' | 'style' | 'tabIndex'>`
// — Virtuoso also forwards `className` at runtime (so consumers can style via
// `<Virtuoso className=...>`), but the public type omits it. We widen here.
const ChatScroller = forwardRef<HTMLDivElement, ScrollerProps & { className?: string }>(function (props, ref) {
  return (
    <div {...props} ref={ref} style={{ ...props.style, ...chatScrollerCssVariables }} className={cn(props.className)} />
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
        <div className='flex items-center gap-2'>
          {isOpen ? 'Close' : 'Open'} Chat
          <KeyShortcut variant='tooltip'>{formatKeyCombination(toggleChatHistoryKeyCombination)}</KeyShortcut>
        </div>
      }
      tooltipSide='right'
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
  const cadChat = useCadChatClient();
  const { treeService } = useFileManager();
  const { projectId } = useProject();
  const { chats } = useChats(projectId);
  const { persistenceActorRef } = useChatContext();
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const chatTextareaRef = useRef<ChatTextareaHandle>(null);
  const toggleChatHistory = useCallback(() => {
    setIsExpanded?.((current) => !current);
  }, [setIsExpanded]);

  const { formattedKeyCombination } = useKeybinding(toggleChatHistoryKeyCombination, toggleChatHistory);

  // Callback for when a new chat is created — focuses the textarea after render
  const handleNewChat = useCallback(() => {
    requestAnimationFrame(() => {
      chatTextareaRef.current?.focus();
    });
  }, []);

  // Empty-cancel: the persistence machine has lifted the cancelled user
  // message back into the composer draft (via the store's
  // `restoreCancelledDraft` listener), so refocus the composer in the next
  // animation frame. The frame deferral mirrors `handleNewChat` above and
  // lets Tiptap/HTMLTextArea finish reflowing for the restored draft text
  // before the cursor lands.
  useEffect(() => {
    if (!persistenceActorRef) {
      return;
    }
    const subscription = persistenceActorRef.on('restoreCancelledDraft', () => {
      requestAnimationFrame(() => {
        chatTextareaRef.current?.focus();
      });
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [persistenceActorRef]);

  // The CAD chat-client composes the per-request `agent` payload (kernel,
  // model, mode, toolChoice, testingEnabled, snapshot, contextPayload) from
  // `useCadAgentConfig`. The verb identity stays stable across renders as
  // long as the underlying agent config identity is stable — memoising the
  // call site lets the tooltip-heavy memo'd children downstream avoid
  // re-renders on every editor-state tick.
  const submitChat = cadChat.submit;
  const onSubmit: ChatTextareaProperties['onSubmit'] = useCallback(
    async ({ content, imageUrls }) => {
      submitChat({ text: content, imageUrls });
    },
    [submitChat],
  );

  // Build the rendered turn groups. A new group starts at index 0 and at
  // every user message; all other messages join the preceding group. The
  // result is memoised on the `state.messages` reference inside
  // `buildTurnGroups`, so streaming tokens (which mutate message *parts*
  // without adding new ids) reuse the same group array reference.
  const groups = useChatSelector((state) => buildTurnGroups(state.messages));

  const renderItem = useCallback(
    (index: number) => {
      const group = groups[index]!;
      const isLast = index === groups.length - 1;
      return <TurnGroup key={`turn-${group.messageIds[0]}`} messageIds={group.messageIds} isLast={isLast} />;
    },
    [groups],
  );

  const [atBottom, setAtBottom] = useState(true);

  const handleAtBottomStateChange = useCallback((atBottom: boolean) => {
    setAtBottom(atBottom);
  }, []);

  // Only auto-follow output when the user is already pinned to the bottom —
  // otherwise leave the scroll position alone so the user can read earlier
  // messages without Virtuoso fighting them as assistant tokens stream in.
  const followOutput = useCallback((atBottom: boolean): 'smooth' | false => (atBottom ? 'smooth' : false), []);

  // When the user submits a new message, pin it to the top of the viewport
  // so the assistant reply streams into the spacer canvas below it. rAF
  // defers the scroll until after Virtuoso lays out the new last item, so
  // `scrollToIndex` measures the spacer height correctly.
  const lastMessageRole = useChatSelector((state) => state.messages.at(-1)?.role);
  const previousLengthRef = useRef(messageIds.length);

  useEffect(() => {
    const grew = messageIds.length > previousLengthRef.current;
    previousLengthRef.current = messageIds.length;
    if (!grew) {
      return;
    }
    if (lastMessageRole !== messageRole.user) {
      return;
    }
    requestAnimationFrame(() => {
      const scroller = virtuosoRef.current;
      if (!scroller) {
        return;
      }
      scroller.scrollToIndex({
        index: 'LAST',
        align: 'start',
        behavior: instantScrollBehavior,
      });
    });
  }, [messageIds.length, lastMessageRole]);

  // Handler to scroll to the bottom of the chat
  const scrollToBottom = useCallback(() => {
    if (virtuosoRef.current) {
      virtuosoRef.current.scrollToIndex({
        index: 'LAST',
        align: 'end',
        behavior: instantScrollBehavior,
      });
    }
  }, []);

  return (
    <FloatingPanel isOpen={isExpanded} side='right' className={className} onOpenChange={setIsExpanded}>
      <FloatingPanelContent
        className={cn(!isExpanded && 'hidden')}
        errorFallback={(errorProps) => (
          <FloatingPanelErrorContent
            {...errorProps}
            title='Chat Unavailable'
            description='Something went wrong while loading the chat.'
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
                  <div className='flex items-center gap-2'>
                    {isOpen ? 'Close' : 'Open'} Chat
                    <KeyShortcut variant='tooltip'>{formattedKeyCombination}</KeyShortcut>
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
        <AtReferenceProvider treeService={treeService} chats={chats}>
          <Virtuoso
            ref={virtuosoRef}
            totalCount={groups.length}
            itemContent={renderItem}
            followOutput={followOutput}
            className='mt-1 min-h-0 min-w-0 flex-1'
            atBottomStateChange={handleAtBottomStateChange}
            components={{
              Scroller: ChatScroller,
              Header: () => null,
              EmptyPlaceholder: () => (
                <div className='-mb-12 h-full px-2 pt-1 pb-2'>
                  <ChatHistoryEmpty className='m-0 flex-1 justify-end' />
                </div>
              ),
            }}
          />
        </AtReferenceProvider>
        <ScrollDownButton hasContent={messageIds.length > 0} isVisible={!atBottom} onScrollToBottom={scrollToBottom} />

        {/* Chat input area */}
        <div className='relative mx-2 mb-2 shrink-0'>
          <ChatTextarea
            ref={chatTextareaRef}
            mode='main'
            className='rounded-sm'
            enableAutoFocus={false}
            onSubmit={onSubmit}
          />
        </div>
      </FloatingPanelContent>
    </FloatingPanel>
  );
});
