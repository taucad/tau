import { forwardRef, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import type { ScrollerProps, VirtuosoHandle } from 'react-virtuoso';
import { useLocation } from 'react-router';
import { XIcon } from 'lucide-react';
import { ChatMessage } from '#routes/w.$workspace.$project/chat-message.js';
import { ChatRevisionMarker } from '#routes/w.$workspace.$project/chat-revision-marker.js';
import type { TurnGroup as TurnGroupData } from '#routes/w.$workspace.$project/chat-turn-groups.js';
import { ScrollDownButton } from '#routes/w.$workspace.$project/scroll-down-button.js';
import { ChatError } from '#routes/w.$workspace.$project/chat-error.js';
import type { ChatTextareaProperties, ChatTextareaHandle } from '#components/chat/chat-textarea-types.js';
import { ChatTextarea } from '#components/chat/chat-textarea.js';
import { ChatTodoList } from '#components/chat/chat-todo-list.js';
import { ChatQuestionQueue } from '#components/chat/chat-question-queue.js';
import { ChatQuestionsProvider } from '#components/chat/chat-questions-context.js';
import { useChatContext, useChatSelector } from '#hooks/use-chat.js';
import { useCadChatClient } from '#chat-clients/use-cad-chat-client.js';
import { ChatTitleBar } from '#routes/w.$workspace.$project/chat-title-bar.js';
import { toggleChatKeyCombination } from '#routes/w.$workspace.$project/chat-lane-toggle.js';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import {
  FloatingPanel,
  FloatingPanelClose,
  FloatingPanelContent,
  FloatingPanelContentHeader,
  FloatingPanelErrorContent,
} from '#components/ui/floating-panel.js';
import { useKeybinding } from '#hooks/use-keyboard.js';
import { cn } from '@taucad/ui/utils/cn';
import { ChatHistoryEmpty } from '#routes/w.$workspace.$project/chat-history-empty.js';
import { AtReferenceProvider } from '#components/chat/at-reference-context.js';
import { ChatAttachmentDirectoriesContext, chatAttachmentDirectories } from '#components/chat/attachment-preview.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useChatRecords } from '#hooks/use-chat-records.js';
import { useProject } from '#hooks/use-project.js';
import { useSkillsCatalog } from '#hooks/use-skills-catalog.js';
import { useSearchParameter } from '#hooks/use-search-parameter.js';
import { searchParameterName } from '#constants/search-parameter.constants.js';
import { flagParameter } from '#utils/search-parameter.codecs.js';
import { ArchivedChats } from '#routes/w.$workspace.$project/archived-chats.js';

// Component-local CSS variable. Declared here (rather than in global.css)
// to keep the chat-history pinning system self-contained — the only
// consumer is `TurnGroup` (`min-h-(--chat-live-turn-min-h)`). Applied as
// inline style on `ChatScroller` so it cascades to every Virtuoso item.
//
// Reserve exactly the transcript viewport for the last turn, including when
// the pane is resized or the composer/adornments grow. ChatScroller establishes
// the size container; a window-height estimate creates phantom overflow.
// oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- React.CSSProperties does not type custom-property keys
const chatScrollerCssVariables = {
  '--chat-live-turn-min-h': '100cqh',
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
      {messageIds.map((id, index) => (
        <ChatMessage
          key={id}
          messageId={id}
          // The request's revision summary is a card attached under the user
          // message, so appending assistant messages never moves it.
          footer={index === 0 ? <ChatRevisionMarker userMessageId={id} isLatestTurn={isLast} /> : undefined}
        />
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
    <div
      {...props}
      ref={ref}
      role='region'
      aria-label='Chat history'
      style={{ ...props.style, ...chatScrollerCssVariables }}
      className={cn('[container-type:size] [scrollbar-gutter:stable]', props.className)}
    />
  );
});

const ChatHistoryHeader = (): undefined => undefined;
const ChatHistoryEmptyPlaceholder = (): React.JSX.Element => (
  <div className='flex h-full px-3 py-6'>
    <ChatHistoryEmpty />
  </div>
);
// Initial positioning waits for Virtuoso's measured content, including an initially empty pane.
const initialChatTurn = { index: 'LAST', align: 'start' } as const;

const virtuosoComponents = {
  Scroller: ChatScroller,
  Header: ChatHistoryHeader,
  EmptyPlaceholder: ChatHistoryEmptyPlaceholder,
};

type ChatHistoryProps = {
  readonly className?: string;
  readonly isExpanded?: boolean;
  readonly setIsExpanded?: (value: boolean | ((current: boolean) => boolean)) => void;
};

export const ChatHistory = memo(function ({ isExpanded = true, setIsExpanded, ...props }: ChatHistoryProps) {
  const toggleChatHistory = useCallback(() => {
    setIsExpanded?.((current) => !current);
  }, [setIsExpanded]);
  const { formattedKeyCombination } = useKeybinding(toggleChatKeyCombination, toggleChatHistory);
  const [isArchiveOpen] = useSearchParameter(searchParameterName.archivedChats, flagParameter);
  const { projectId } = useProject();

  return isExpanded && isArchiveOpen ? (
    <FloatingPanel isOpen side='right' className={props.className} onOpenChange={setIsExpanded}>
      <FloatingPanelContent className='ph-no-capture min-h-0 overflow-hidden'>
        <ArchivedChats key={projectId} />
      </FloatingPanelContent>
    </FloatingPanel>
  ) : isExpanded ? (
    <ExpandedChatHistory
      {...props}
      isExpanded={isExpanded}
      setIsExpanded={setIsExpanded}
      formattedKeyCombination={formattedKeyCombination}
    />
  ) : null;
});

const ExpandedChatHistory = memo(function ({
  className,
  isExpanded,
  setIsExpanded,
  formattedKeyCombination,
}: ChatHistoryProps & { readonly formattedKeyCombination: string }) {
  const messageIds = useChatSelector((state) => state.messageOrder);
  const cadChat = useCadChatClient();
  const { treeService } = useFileManager();
  const { projectId } = useProject();
  const { chats } = useChatRecords(projectId);
  const { activeChatId, persistenceActorRef } = useChatContext();
  const skillsCatalog = useSkillsCatalog();
  const agentInvocations = useChatSelector((state) => state.agentInvocations);
  const skillInvocations = skillsCatalog.map((skill) => `/${skill.name}`).join('\n');
  const knownTokens = useMemo(
    () => new Set(`${skillInvocations}\n${agentInvocations}`.split('\n').filter(Boolean)),
    [skillInvocations, agentInvocations],
  );
  const attachmentDirectories = useMemo(
    () => chatAttachmentDirectories(projectId, activeChatId),
    [activeChatId, projectId],
  );
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const chatTextareaRef = useRef<ChatTextareaHandle>(null);
  const location = useLocation();
  useEffect(() => {
    if (location.state?.focusChatComposer === true) {
      chatTextareaRef.current?.focus();
    }
  }, [location.state]);

  // Empty-cancel: the persistence machine has lifted the cancelled user
  // message back into the composer draft (via the store's
  // `restoreCancelledDraft` listener), so refocus the composer in the next
  // animation frame so Tiptap/HTMLTextArea can finish reflowing the restored
  // draft text before the cursor lands.
  useEffect(() => {
    if (!persistenceActorRef) {
      return;
    }
    let frame: number | undefined;
    const subscription = persistenceActorRef.on('restoreCancelledDraft', () => {
      if (frame !== undefined) {
        cancelAnimationFrame(frame);
      }
      frame = requestAnimationFrame(() => {
        frame = undefined;
        chatTextareaRef.current?.focus();
      });
    });
    return () => {
      if (frame !== undefined) {
        cancelAnimationFrame(frame);
      }
      subscription.unsubscribe();
    };
  }, [persistenceActorRef]);

  // The turn host owns request configuration; the client exposes action verbs.
  // Memoising the call site avoids re-rendering tooltip-heavy children.
  const submitChat = cadChat.submit;
  const onSubmit: ChatTextareaProperties['onSubmit'] = useCallback(
    async ({ content, attachments }) => {
      // Pending until the message lands, so the composer stays busy through admission (R8).
      await submitChat({ text: content, attachments });
    },
    [submitChat],
  );

  const groups = useChatSelector((state) => state.turnGroups);

  const renderItem = useCallback(
    (index: number, group: TurnGroupData) => {
      const isLast = index === groups.length - 1;
      return <TurnGroup messageIds={group.messageIds} isLast={isLast} />;
    },
    [groups.length],
  );
  const computeItemKey = useCallback((_index: number, group: TurnGroupData) => group.messageIds[0]!, []);

  const [atBottom, setAtBottom] = useState(true);

  const handleAtBottomStateChange = useCallback((atBottom: boolean) => {
    setAtBottom(atBottom);
  }, []);

  // Only auto-follow output when the user is already pinned to the bottom —
  // otherwise leave the scroll position alone so the user can read earlier
  // messages without Virtuoso fighting them as assistant tokens stream in.
  const followOutput = useCallback((atBottom: boolean): 'auto' | false => (atBottom ? 'auto' : false), []);

  // When the user submits a new message, pin it to the top of the viewport
  // so the assistant reply streams into the spacer canvas below it. rAF
  // defers the scroll until after Virtuoso lays out the new last item, so
  // `scrollToIndex` measures the spacer height correctly.
  const lastTurnId = groups.at(-1)?.messageIds[0];
  // A populated transcript may arrive before this pane mounts; it still opens at its latest turn.
  const previousLastTurnIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (lastTurnId === previousLastTurnIdRef.current) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      const scroller = virtuosoRef.current;
      if (!scroller) {
        return;
      }
      scroller.scrollToIndex({
        index: 'LAST',
        align: 'start',
        behavior: instantScrollBehavior,
      });
      previousLastTurnIdRef.current = lastTurnId;
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [lastTurnId]);

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
    <ChatAttachmentDirectoriesContext.Provider value={attachmentDirectories}>
      <ChatQuestionsProvider>
        <FloatingPanel isOpen={isExpanded} side='right' className={className} onOpenChange={setIsExpanded}>
          <FloatingPanelContent
            // `ph-no-capture`: session replay never records chat transcripts.
            className={cn('ph-no-capture min-h-0 overflow-hidden [container-type:size]', !isExpanded && 'hidden')}
            errorFallback={(errorProps) => (
              <FloatingPanelErrorContent
                {...errorProps}
                title='Chat Unavailable'
                description='Something went wrong while loading the chat.'
              />
            )}
          >
            {/* Chat-restore time-travel: wire the store seams + surface a fork marker. */}
            {/* The one header row: name, rename in place, chat menu, close. */}
            <FloatingPanelContentHeader className='gap-1'>
              <ChatTitleBar
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
              />
            </FloatingPanelContentHeader>

            {/* Main chat content area */}
            <AtReferenceProvider treeService={treeService} chats={chats} knownTokens={knownTokens}>
              <Virtuoso
                ref={virtuosoRef}
                data={groups}
                initialTopMostItemIndex={initialChatTurn}
                itemContent={renderItem}
                computeItemKey={computeItemKey}
                followOutput={followOutput}
                className='mt-1 min-h-0 min-w-0 flex-1'
                atBottomStateChange={handleAtBottomStateChange}
                components={virtuosoComponents}
              />
            </AtReferenceProvider>
            {/*
          A refusal on an empty chat has to land somewhere (I12, W19-b).

          `ChatError` rides the last `TurnGroup`, and a submit that fails before
          the user message is appended — the durable workspace refusing the
          turn — leaves no group for it to ride. The person then saw nothing at
          all: their text still in the composer, no row, no banner. One banner
          at a time: while there are turns, the group above owns it.
        */}
            {groups.length === 0 ? <ChatError className='mx-4 mb-1 shrink-0' /> : null}
            {/* Chat input area. The agent's task list and its questions share one
              tray directly above the composer; the task list is keyed by chat so
              its fold never carries across chats (D8, agent questions D8). */}
            <div
              role='region'
              aria-label='Chat composer'
              className='relative mx-auto mb-2 w-[calc(100%_-_1rem)] max-w-xl shrink-0'
            >
              <ScrollDownButton
                hasContent={messageIds.length > 0}
                isVisible={!atBottom}
                onScrollToBottom={scrollToBottom}
              />
              <div className='mx-2 -mb-3 flex flex-col rounded-t-lg border border-b-0 bg-muted/40 pb-3 empty:hidden'>
                <ChatTodoList key={activeChatId} />
                <ChatQuestionQueue key={`${activeChatId}:questions`} />
              </div>
              <ChatTextarea ref={chatTextareaRef} mode='main' enableAutoFocus={false} onSubmit={onSubmit} />
            </div>
          </FloatingPanelContent>
        </FloatingPanel>
      </ChatQuestionsProvider>
    </ChatAttachmentDirectoriesContext.Provider>
  );
});
