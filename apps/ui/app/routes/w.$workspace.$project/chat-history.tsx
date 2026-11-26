import { frameHintKey } from '#lib/frame-hint.js';
import { chatComposerTrayClassName } from '@taucad/chat-ui/components/chat-input-styles';
import { ChatMessageQueue } from '#components/chat/chat-message-queue.js';
import { forwardRef, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import type { ScrollerProps, VirtuosoHandle } from 'react-virtuoso';
import { useLocation } from 'react-router';
import { projectChatIdFromSearch } from '@taucad/files-ui/utils/project-url.utils';
import { XIcon } from 'lucide-react';
import { ChatMessagePlanning } from '#routes/w.$workspace.$project/chat-message-planning.js';
import { ChatMessage } from '#routes/w.$workspace.$project/chat-message.js';
import { ChatRevisionMarker } from '#routes/w.$workspace.$project/chat-revision-marker.js';
import type { TurnGroup as TurnGroupData } from '#routes/w.$workspace.$project/chat-turn-groups.js';
import { ScrollDownButton } from '@taucad/project-workspace/components/scroll-down-button';
import {
  instantScrollBehavior,
  useFollowLatestOutput,
} from '#routes/w.$workspace.$project/use-follow-latest-output.js';
import { ChatError } from '#routes/w.$workspace.$project/chat-error.js';
import type { ChatTextareaProperties, ChatTextareaHandle } from '#components/chat/chat-textarea-types.js';
import { ChatTextarea } from '#components/chat/chat-textarea.js';
import { useProjectComposerHandOff } from '#components/chat/project-composer-hand-off.js';
import { useTourAnchors } from '#components/tour/tour-anchors.js';
import { ChatTodoList } from '#components/chat/chat-todo-list.js';
import type { ChatTranscriptState } from '#services/chat-session-store.js';
import { ChatQuestionQueue } from '#components/chat/chat-question-queue.js';
import { ChatQuestionsProvider } from '#components/chat/chat-questions-context.js';
import { useChatContext, useChatSelector } from '#hooks/use-chat.js';
import { useOptionalChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { useCadChatClient } from '#chat-clients/use-cad-chat-client.js';
import { ChatTitleBar } from '#routes/w.$workspace.$project/chat-title-bar.js';
import { toggleChatKeyCombination } from '#routes/w.$workspace.$project/chat-lane-toggle.js';
import { KeyShortcut } from '@taucad/ui/components/key-shortcut';
import {
  FloatingPanel,
  FloatingPanelClose,
  FloatingPanelContent,
  FloatingPanelContentHeader,
  FloatingPanelErrorContent,
} from '#components/ui/floating-panel.js';
import { useKeybinding } from '@taucad/ui/components/keyboard';
import { useIsMobile } from '@taucad/ui/hooks/use-mobile';
import { cn } from '@taucad/ui/utils/cn';
import { ChatHistoryEmpty } from '@taucad/project-workspace/components/chat-history-empty';
import { AtReferenceProvider } from '@taucad/chat-ui/components/at-reference-context';
import { ChatAttachmentDirectoriesContext, chatAttachmentDirectories } from '#components/chat/attachment-preview.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useChatRecords } from '#hooks/use-chat-records.js';
import { useProject } from '#hooks/use-project.js';
import { useSkillsCatalog } from '#hooks/use-skills-catalog.js';
import { useSearchParameter } from '#hooks/use-search-parameter.js';
import { searchParameterName } from '@taucad/ui-core/constants/search-parameter.constants';
import { flagParameter } from '@taucad/ui-core/utils/search-parameter.codecs';
import { ArchivedChats } from '#routes/w.$workspace.$project/archived-chats.js';
import { useWaitClockSource } from '@taucad/ui/hooks/use-wait-clock';
import { isInOpen, openWaitContext } from '#hooks/use-wait-start.js';
import type { OpenWait } from '#hooks/use-wait-start.js';
import { WaitSkeleton } from '#routes/w.$workspace.$project/project-wait-skeleton.js';
import type { WaitClock } from '@taucad/ui/hooks/use-wait-clock';

// One conversational turn per virtual row, sized only by its content.
const TurnGroup = memo(function ({
  messageIds,
  isLast,
}: {
  readonly messageIds: readonly string[];
  readonly isLast: boolean;
}) {
  return (
    <div className='mx-auto flex w-[calc(100%_-_1rem)] max-w-xl flex-col gap-1 py-1'>
      {messageIds.map((id, index) => (
        <ChatMessage
          key={id}
          messageId={id}
          isPastTurn={!isLast}
          // The request's revision summary is a card attached under the user
          // message, so appending assistant messages never moves it.
          footer={index === 0 ? <ChatRevisionMarker userMessageId={id} isLatestTurn={isLast} /> : undefined}
        />
      ))}
      {isLast ? <ChatError className='mx-4' /> : null}
    </div>
  );
});

/** How far past the transcript's foot Virtuoso renders, so an appended turn is measured and followed. Pixels. */
const appendedTurnOverscan = { top: 0, bottom: 120 } as const;

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
// The list's `context` is the transcript's load state (I21), marked on the Scroller: busy, and drawing nothing,
// while it loads (U7, U19).
const ChatScroller = forwardRef<HTMLDivElement, ScrollerProps & { className?: string; context?: ChatTranscriptState }>(
  function ({ context, ...props }, ref) {
    return (
      <div
        {...props}
        ref={ref}
        role='region'
        aria-label='Chat history'
        /* Session replay blocks this transcript while the account's chats may not be recorded (`replay-content.lib`). */
        data-replay-content='chat'
        aria-busy={context === 'loading' ? true : undefined}
        data-transcript-state={context}
        className={cn('[scrollbar-gutter:stable]', props.className)}
      />
    );
  },
);

const ChatHistoryHeader = (): undefined => undefined;
/* The phone sheet at half on a short phone leaves the transcript too little height for the whole empty state:
 * there it keeps its icon and title, so nothing runs under the composer (a size container, queried by height). */
/* Only a chat whose load settled with no turns is empty: while it loads the feed draws nothing (U7, I21). */
const ChatHistoryEmptyPlaceholder = ({
  context,
}: {
  readonly context?: ChatTranscriptState;
}): React.JSX.Element | undefined =>
  context === 'empty' ? (
    <div className='[container-type:size] mx-auto flex h-full w-[calc(100%_-_1rem)] max-w-xl px-3 py-6'>
      <ChatHistoryEmpty className='[@container_(max-height:15rem)]:py-0 [@container_(max-height:15rem)]:[&_[data-slot=panel-empty-state-description]]:hidden' />
    </div>
  ) : undefined;
/* A tray frame that holds only a reserved height draws nothing: the reservation keeps the composer's height (U10). */
// Literal, so the stylesheet scanner sees it; the slot is `composerTrayReserveSlot`.
const reservedTrayClassName =
  'has-[>[data-slot=composer-tray-reserve]:only-child]:border-transparent has-[>[data-slot=composer-tray-reserve]:only-child]:bg-transparent';
// Initial positioning waits for Virtuoso's measured content, including an initially empty pane.
const initialChatTurn = { index: 'LAST', align: 'end' } as const;

const virtuosoComponents = {
  Scroller: ChatScroller,
  Header: ChatHistoryHeader,
  EmptyPlaceholder: ChatHistoryEmptyPlaceholder,
};

/** One transcript wait as the header indicator times it. */
type TranscriptWait = Readonly<{ active: boolean; startedAt: number; isGesture: boolean }>;

/** The parts of the Navigation API read here; absent where the browser has none. */
type HistoryEntryNavigation = Readonly<{
  activation?: Readonly<{ entry?: Readonly<{ key: string }> }>;
  currentEntry?: Readonly<{ key: string }>;
}>;

/**
 * Whether the page is on the history entry its document loaded, as the Navigation API says: a `replaceState` keeps the
 * entry's key, so the route's rewrites (the chat query, canonical slugs) leave it the same entry.
 *
 * @returns `true` on the document's own entry, `false` on another, `undefined` where the API is missing.
 */
const isOnDocumentEntry = (): boolean | undefined => {
  const { navigation } = globalThis as { navigation?: HistoryEntryNavigation };
  const loaded = navigation?.activation?.entry?.key;
  return loaded === undefined ? undefined : loaded === navigation?.currentEntry?.key;
};

/**
 * Whether the page is still on the project its document loaded: the route open the document began with, whose waits
 * are timed from navigation start (0). A client navigation to another project has its own start.
 *
 * @returns `true` while the document's own project is the current one.
 */
const isOnDocumentProject = (): boolean => {
  /* The history entry first: the route corrects the URL's slugs to the canonical ones with `replaceState`, which keeps
   * the entry but changes the project's path. */
  const isDocumentEntry = isOnDocumentEntry();
  if (isDocumentEntry !== undefined) {
    return isDocumentEntry;
  }
  const [entry] = globalThis.performance.getEntriesByType('navigation');
  if (entry === undefined) {
    return false;
  }
  /* Without the Navigation API, the project's path: the chat query rewrite keeps it, a slug correction does not. */
  const opened = frameHintKey(new URL(entry.name).pathname);
  return opened !== undefined && opened === frameHintKey(globalThis.location.pathname);
};

/**
 * The wait clocks whose document open is over: a lane held a settled transcript, or a lane on the document's project
 * unmounted after the page left that project, so a lane mounted loading again (a return from Home or another project,
 * the lane reopened over another chat) is a later wait, timed from its own start. Keyed by clock, which is the document's performance clock in the application.
 */
const endedDocumentOpens = new WeakSet<WaitClock>();

/**
 * Whether a lane mounting now is part of the document's own open: the page is on the project the document loaded, and
 * has not left it since.
 *
 * @param clock - The wait clock the lane reads.
 * @returns `true` during the open.
 */
const isDocumentOpen = (clock: WaitClock): boolean => !endedDocumentOpens.has(clock) && isOnDocumentProject();

const startTranscriptWait = (
  clock: WaitClock,
  isFirst: boolean,
  open: OpenWait | undefined,
): Omit<TranscriptWait, 'active'> => {
  if (isFirst && isDocumentOpen(clock)) {
    return { startedAt: 0, isGesture: false };
  }
  const { navigator } = globalThis;
  const activation = 'userActivation' in navigator ? navigator.userActivation : undefined;
  const isGesture = activation?.isActive ?? false;
  const startedAt = clock.now();
  /* A lane that mounts loading during a later project open is part of that open (`isInOpen`): its wait counts from
   * the open's start, as the frame's bars it takes over did. */
  if (isFirst && open !== undefined && isInOpen(open, { startedAt })) {
    return { startedAt: open.startedAt, isGesture: false };
  }
  return { startedAt, isGesture };
};

/**
 * When the chat's current transcript wait started (loading states UX blueprint, § Chat lane; one clock per wait, never
 * per mount): a lane that mounts loading during the document's own open counts from navigation start, so its
 * indicator shows 1,000 ms after it whenever the lane mounted; every later wait (a chat switch, a reload of the log)
 * counts from now. Read in render with React's "information from previous renders" pattern: no effect, no timer.
 *
 * @param active - Whether the transcript is loading now.
 * @returns The wait's start on the wait clock, and whether a person's gesture started it.
 */
function useTranscriptWaitStart(active: boolean): Omit<TranscriptWait, 'active'> {
  const clock = useWaitClockSource();
  const open = useContext(openWaitContext);
  const [tracked, setTracked] = useState<TranscriptWait>(() => ({
    active,
    ...startTranscriptWait(clock, true, open),
  }));
  /* A lane unmounted once the page has left the document's project (to Home, to another project) ends the open. */
  useEffect(
    () => () => {
      if (!isOnDocumentProject()) {
        endedDocumentOpens.add(clock);
      }
    },
    [clock],
  );
  /* So does a transcript a lane holds settled: a lane mounted loading later on the same entry (the lane reopened over
   * another chat, a replace to it) is a later wait, timed from its own start. */
  useEffect(() => {
    if (!active) {
      endedDocumentOpens.add(clock);
    }
  }, [active, clock]);
  let current = tracked;
  if (tracked.active !== active) {
    current = active ? { active, ...startTranscriptWait(clock, false, open) } : { ...tracked, active };
    setTracked(current);
  }
  return { startedAt: current.startedAt, isGesture: current.isGesture };
}

type ChatHistoryProps = {
  readonly className?: string;
  /** Classes for the pane's header row, such as the inset a host's fixed titlebar controls need. */
  readonly headerClassName?: string;
  /** Classes for the archived-chats view, which has no header row to take that inset. */
  readonly archiveClassName?: string;
  readonly isExpanded?: boolean;
  readonly setIsExpanded?: (value: boolean | ((current: boolean) => boolean)) => void;
};

export const ChatHistory = memo(function ({
  isExpanded = true,
  setIsExpanded,
  archiveClassName,
  ...props
}: ChatHistoryProps) {
  const toggleChatHistory = useCallback(() => {
    setIsExpanded?.((current) => !current);
  }, [setIsExpanded]);
  const { formattedKeyCombination } = useKeybinding(toggleChatKeyCombination, toggleChatHistory);
  const [isArchiveOpen] = useSearchParameter(searchParameterName.archivedChats, flagParameter);
  const { projectId } = useProject();

  return isExpanded && isArchiveOpen ? (
    <FloatingPanel isOpen side='right' className={props.className} onOpenChange={setIsExpanded}>
      <FloatingPanelContent className={cn('min-h-0 overflow-hidden', archiveClassName)}>
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
  headerClassName,
  isExpanded,
  setIsExpanded,
  formattedKeyCombination,
}: ChatHistoryProps & { readonly formattedKeyCombination: string }) {
  const messageIds = useChatSelector((state) => state.messageOrder);
  const cadChat = useCadChatClient();
  const { treeService } = useFileManager();
  const { projectId } = useProject();
  const { chats } = useChatRecords(projectId);
  const { activeChatId } = useChatContext();
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
  // D14: only a phone's composer rests as one row; desktop and tablets keep the full bar (D12).
  const isMobile = useIsMobile();
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const chatTextareaRef = useRef<ChatTextareaHandle>(null);
  const composerHandOff = useProjectComposerHandOff();
  /* The product tour points at the composer; the region is also the foot of the chat lane, where a tip about a
   * transcript row that has scrolled away is placed. */
  const composerAnchor = useTourAnchors('composer', 'chat-lane');
  const focusComposer = useCallback(() => {
    chatTextareaRef.current?.focus();
  }, []);
  const location = useLocation();
  /* A same-project switch keeps the previous chat on screen, inert, until the new chat is prepared, so a focus given
   * when the navigation commits lands on an inert composer and is dropped. It is given once per navigation, once the
   * requested chat is the one presented (a URL naming no chat presents whatever it opens). */
  const requestedChatId = projectChatIdFromSearch(location.search);
  const isRequestedChatPresented = requestedChatId === undefined || requestedChatId === activeChatId;
  const composerFocusRequest =
    location.state?.focusChatComposer === true && isRequestedChatPresented ? location.key : undefined;
  useEffect(() => {
    if (composerFocusRequest !== undefined) {
      chatTextareaRef.current?.focus();
    }
  }, [composerFocusRequest]);

  // A stopped send's message is back in the composer (the store's `subscribeDraftReturned`): refocus the composer
  // in the next animation frame, so the editor finishes reflowing the restored draft before the cursor lands.
  const sessionStore = useOptionalChatSessionStore();
  useEffect(() => {
    if (!sessionStore) {
      return;
    }
    let frame: number | undefined;
    const unsubscribe = sessionStore.subscribeDraftReturned(activeChatId, () => {
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
      unsubscribe();
    };
  }, [activeChatId, sessionStore]);

  // The turn host owns request configuration; the client exposes action verbs.
  // Memoising the call site avoids re-rendering tooltip-heavy children.
  const submitChat = cadChat.submit;
  const onSubmit: ChatTextareaProperties['onSubmit'] = useCallback(
    async ({ content, attachments, references, annotations }) => {
      // Pending until the message lands, so the composer stays busy through admission (R8).
      await submitChat({
        text: content,
        attachments,
        ...(references === undefined ? {} : { references }),
        ...(annotations === undefined ? {} : { annotations }),
      });
    },
    [submitChat],
  );

  const groups = useChatSelector((state) => state.turnGroups);
  const transcript = useChatSelector((state) => state.transcript);
  const transcriptWait = useTranscriptWaitStart(transcript === 'loading');
  const reservesTaskList = useChatSelector((state) => state.rememberedComposerTrays.includes('todo'));

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

  // Follow streaming output only while the user stays pinned to the bottom —
  // otherwise leave the scroll position alone so they can read earlier messages.
  const followLatestOutput = useFollowLatestOutput(virtuosoRef);

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
            className={cn('min-h-0 overflow-hidden [container-type:size]', !isExpanded && 'hidden')}
            errorFallback={(errorProps) => (
              <FloatingPanelErrorContent
                {...errorProps}
                title='Chat Unavailable'
                description='Something went wrong while loading the chat.'
              />
            )}
          >
            {/* The whole pane takes files and Tau drags for its composer (`useChatDropZone`): dropping on the
                transcript attaches exactly what dropping on the composer does. */}
            <div data-chat-drop-zone='' className='relative flex min-h-0 flex-1 flex-col'>
              {/* Chat-restore time-travel: wire the store seams + surface a fork marker. */}
              {/* The one header row: name, rename in place, chat menu, close. */}
              <FloatingPanelContentHeader className={cn('gap-1', headerClassName)}>
                <ChatTitleBar
                  closeButton={
                    <FloatingPanelClose
                      label='Close Chat'
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
                {/* The feed's own box, between the header and the composer region. */}
                <div className='relative mt-1 flex min-h-0 min-w-0 flex-1 flex-col'>
                  {/* While the transcript loads the feed draws its shape (Progressive Loading Policy rules 15 and 17):
                   * the bars lie over the empty feed, take no layout, end where the feed does (never behind the
                   * composer, as a short phone sheet showed), and appear from 300 ms into the wait on its own clock,
                   * which a lane mounted during the open shares with the open. No words: the viewer is the open's one
                   * status, and the feed carries `aria-busy`. */}
                  {transcript === 'loading' ? (
                    <div className='pointer-events-none absolute inset-0 z-10'>
                      <WaitSkeleton isActive startedAt={transcriptWait.startedAt} shape='transcript' label='Chat' />
                    </div>
                  ) : null}
                  <Virtuoso
                    ref={virtuosoRef}
                    data={groups}
                    context={transcript}
                    initialTopMostItemIndex={initialChatTurn}
                    itemContent={renderItem}
                    computeItemKey={computeItemKey}
                    scrollerRef={followLatestOutput.scrollerRef}
                    followOutput={followLatestOutput.followOutput}
                    /* A turn appended at the end starts at the viewport's foot, outside the rendered range: Virtuoso
                     * follows it only once it is measured, so render a little past the foot. Without this a turn sent
                     * from a short viewport (the phone sheet at half) is never followed, and its reply or failure stays
                     * folded away below (I5). */
                    increaseViewportBy={appendedTurnOverscan}
                    totalListHeightChanged={followLatestOutput.totalListHeightChanged}
                    className='min-h-0 min-w-0 flex-1'
                    atBottomStateChange={handleAtBottomStateChange}
                    components={virtuosoComponents}
                  />
                </div>
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
                ref={composerAnchor}
                role='region'
                aria-label='Chat composer'
                className='relative mx-auto mb-2 w-[calc(100%_-_1rem)] max-w-xl shrink-0'
              >
                <ScrollDownButton
                  hasContent={messageIds.length > 0}
                  isVisible={!atBottom}
                  onScrollToBottom={scrollToBottom}
                />
                <ChatMessagePlanning key={activeChatId} className='mb-3 px-3' />
                <div className={cn(chatComposerTrayClassName, reservedTrayClassName)}>
                  <ChatTodoList
                    key={activeChatId}
                    reserveHeight={reservesTaskList}
                    isTranscriptLoading={transcript === 'loading'}
                  />
                  <ChatMessageQueue key={`${activeChatId}:messages`} />
                  <ChatQuestionQueue key={`${activeChatId}:questions`} onDismissFocus={focusComposer} />
                </div>
                <ChatTextarea
                  ref={chatTextareaRef}
                  enableMobileCollapse={isMobile}
                  mode='main'
                  enableAutoFocus={false}
                  /* The workspace frame served this composer's native input; adopt it at the reveal (PL6). */
                  handOff={composerHandOff}
                  onSubmit={onSubmit}
                />
              </div>
            </div>
          </FloatingPanelContent>
        </FloatingPanel>
      </ChatQuestionsProvider>
    </ChatAttachmentDirectoriesContext.Provider>
  );
});
