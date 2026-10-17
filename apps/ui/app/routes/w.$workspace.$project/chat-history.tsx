import { ChatMessageQueue } from '#components/chat/chat-message-queue.js';
import { forwardRef, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import type { ScrollerProps, VirtuosoHandle } from 'react-virtuoso';
import { useLocation } from 'react-router';
import { ArrowLeft, GitBranch, Square, XIcon } from 'lucide-react';
import { ChatMessagePlanning } from '#routes/w.$workspace.$project/chat-message-planning.js';
import { ChatMessage } from '#routes/w.$workspace.$project/chat-message.js';
import { ChatRevisionMarker } from '#routes/w.$workspace.$project/chat-revision-marker.js';
import type { TurnGroup as TurnGroupData } from '#routes/w.$workspace.$project/chat-turn-groups.js';
import { ScrollDownButton } from '#routes/w.$workspace.$project/scroll-down-button.js';
import {
  instantScrollBehavior,
  useFollowLatestOutput,
} from '#routes/w.$workspace.$project/use-follow-latest-output.js';
import { ChatError } from '#routes/w.$workspace.$project/chat-error.js';
import type { ChatTextareaProperties, ChatTextareaHandle } from '#components/chat/chat-textarea-types.js';
import { ChatTextarea } from '#components/chat/chat-textarea.js';
import { ChatTodoList } from '#components/chat/chat-todo-list.js';
import { ChatQuestionQueue } from '#components/chat/chat-question-queue.js';
import { ChatQuestionsProvider } from '#components/chat/chat-questions-context.js';
import { useChatContext, useChatSelector, useDraftSelector } from '#hooks/use-chat.js';
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
import { useProjectTasks } from '#hooks/use-project-tasks.js';
import { useProjectWorkspace } from '#routes/w.$workspace.$project/project-workspace-context.js';
import { useThreadNavigation } from '#routes/w.$workspace.$project/thread-navigation-context.js';
import { Button } from '@taucad/ui/components/button';
import type { ProjectTask, ProjectTaskMessage, ProjectTaskSnapshot, ProjectTaskStatus } from '@taucad/agent-host/wire';
import type { ChatRecord } from '@taucad/chat/schemas';
import { ActiveChatProvider, useChatComposer } from '#hooks/active-chat-provider.js';
import type { ProjectTaskActions } from '#components/project-tasks/project-task-actions.js';

// One conversational turn per virtual row, sized only by its content.
const TurnGroup = memo(function ({
  messageIds,
  isLast,
  isClosedDelegatedTask,
  onOpenAgents,
}: {
  readonly messageIds: readonly string[];
  readonly isLast: boolean;
  readonly isClosedDelegatedTask: boolean;
  readonly onOpenAgents: () => void;
}) {
  return (
    <div className='mx-auto flex w-[calc(100%_-_1rem)] max-w-xl flex-col gap-1 py-1'>
      {messageIds.map((id, index) => (
        <ChatMessage
          key={id}
          messageId={id}
          // The request's revision summary is a card attached under the user
          // message, so appending assistant messages never moves it.
          footer={index === 0 ? <ChatRevisionMarker userMessageId={id} isLatestTurn={isLast} /> : undefined}
        />
      ))}
      {isLast ? (
        <ChatError className='mx-4' isClosedDelegatedTask={isClosedDelegatedTask} onOpenAgents={onOpenAgents} />
      ) : null}
    </div>
  );
});

type SelectedTaskHistoryProps = Readonly<{
  task: ProjectTask;
  parent?: ProjectTask;
  snapshot: ProjectTaskSnapshot;
  actions: ProjectTaskActions;
  isReadOnly: boolean;
  hasClosedAncestor: boolean;
  onBack: () => void;
  onOpenParent: (taskId: string) => void;
  onSelectTask: (taskId: string) => void;
  onReviewCandidate: (taskId: string) => void;
}>;

const threadStatusLabels: Readonly<Record<ProjectTaskStatus, string>> = {
  allocating: 'Starting',
  running: 'Working',
  cancelling: 'Stopping',
  completed: 'Completed',
  failed: 'Interrupted',
  cancelled: 'Stopped',
  interrupted: 'Interrupted',
};

/** Acquires a view of the selected task's existing session. It never mounts a turn host or sends a chat turn. */
export function SelectedTaskHistory(props: SelectedTaskHistoryProps): React.JSX.Element {
  const { projectId } = useProject();
  return (
    <ActiveChatProvider chatId={props.task.chatId} projectId={projectId}>
      <SelectedTaskHistoryContent {...props} />
    </ActiveChatProvider>
  );
}

/** Durable lineage can identify a selected child even before the task observer reconnects. */
export function MetadataTaskHistory({
  chat,
  onBack,
  onOpenParent,
}: {
  readonly chat: ChatRecord;
  readonly onBack: () => void;
  readonly onOpenParent: (taskId: string) => void;
}): React.JSX.Element {
  const { projectId } = useProject();
  return (
    <ActiveChatProvider chatId={chat.id} projectId={projectId}>
      <MetadataTaskHistoryContent chat={chat} onBack={onBack} onOpenParent={onOpenParent} />
    </ActiveChatProvider>
  );
}

function MetadataTaskHistoryContent({
  chat,
  onBack,
  onOpenParent,
}: {
  readonly chat: ChatRecord;
  readonly onBack: () => void;
  readonly onOpenParent: (taskId: string) => void;
}): React.JSX.Element {
  const { projectId } = useProject();
  const { treeService } = useFileManager();
  const { chats } = useChatRecords(projectId);
  const attachmentDirectories = useMemo(() => chatAttachmentDirectories(projectId, chat.id), [projectId, chat.id]);
  const messages = useChatSelector((state) => state.messages);
  const lineage = chat.taskLineage;
  return (
    <ChatAttachmentDirectoriesContext.Provider value={attachmentDirectories}>
      <ChatQuestionsProvider>
        <AtReferenceProvider treeService={treeService} chats={chats}>
          <section aria-label={`Thread ${chat.name}`} className='flex size-full min-h-0 flex-col bg-sidebar'>
            <div className='flex items-center gap-2 border-b px-3 py-2'>
              <Button size='icon' variant='ghost' aria-label='Back to threads' onClick={onBack}>
                <ArrowLeft aria-hidden className='size-4' />
              </Button>
              <h2 className='min-w-0 flex-1 truncate text-sm font-medium'>{chat.name}</h2>
            </div>
            <div className='min-h-0 flex-1 overflow-y-auto px-3 py-4'>
              <div className='mx-auto max-w-xl space-y-4'>
                {messages
                  .filter((message) => !message.id.startsWith('task-message-'))
                  .map((message) => (
                    <ChatMessage key={message.id} messageId={message.id} readOnly />
                  ))}
              </div>
            </div>
            <div className='mx-auto w-[calc(100%_-_1rem)] max-w-xl shrink-0 space-y-2 pb-3'>
              <p role='status' className='rounded-md border p-2 text-xs'>
                Thread actions will be available when the project task host reconnects.
              </p>
              <ChatTextarea
                mode='main'
                taskMailbox
                enableApprovals={false}
                enableAutoFocus={false}
                enableContextActions={false}
                enableKernelSelector={false}
                onSubmit={async () => undefined}
                isSubmitDisabled
              />
              {lineage ? (
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => {
                    onOpenParent(lineage.taskId);
                  }}
                >
                  <ArrowLeft aria-hidden className='size-4' /> Open parent
                </Button>
              ) : null}
            </div>
          </section>
        </AtReferenceProvider>
      </ChatQuestionsProvider>
    </ChatAttachmentDirectoriesContext.Provider>
  );
}

const SelectedTaskHistoryContent = ({
  task,
  parent,
  snapshot,
  actions,
  isReadOnly,
  hasClosedAncestor,
  onBack,
  onOpenParent,
  onSelectTask,
  onReviewCandidate,
}: SelectedTaskHistoryProps): React.JSX.Element => {
  const { projectId } = useProject();
  const { treeService } = useFileManager();
  const { chats } = useChatRecords(projectId);
  const { consumeDraft } = useChatComposer();
  const draftText = useDraftSelector((state) => state.draftText);
  const draftAttachments = useDraftSelector((state) => state.draftAttachments);
  const threadNavigation = useThreadNavigation({ enableNoContext: true });
  const messages = useChatSelector((state) => state.messages);
  const latest = task.attempts.at(-1);
  const status = latest?.status;
  const isActive = status === 'allocating' || status === 'running' || status === 'cancelling';
  const canCancel = !task.closed && !hasClosedAncestor && (status === 'allocating' || status === 'running');
  const canResume = !hasClosedAncestor && !isActive && draftText.trim() === '' && draftAttachments.length === 0;
  const canSend = !hasClosedAncestor && status !== 'cancelling';
  const [isCancelling, setIsCancelling] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [localDetailsOpen, setLocalDetailsOpen] = useState(false);
  const detailsOpen = threadNavigation?.getThreadView(task.id).detailsOpen ?? localDetailsOpen;
  const navigationRef = useRef(threadNavigation);
  useEffect(() => {
    navigationRef.current = threadNavigation;
  }, [threadNavigation]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (container) {
      container.scrollTop = navigationRef.current?.getThreadView(task.id).scrollTop ?? 0;
    }
    return () => {
      if (scrollTimer.current) {
        clearTimeout(scrollTimer.current);
      }
      if (container) {
        navigationRef.current?.setThreadView(task.id, { scrollTop: container.scrollTop });
      }
    };
  }, [task.id]);
  const onTranscriptScroll = useCallback(() => {
    if (scrollTimer.current) {
      clearTimeout(scrollTimer.current);
    }
    scrollTimer.current = setTimeout(() => {
      if (scrollRef.current) {
        navigationRef.current?.setThreadView(task.id, { scrollTop: scrollRef.current.scrollTop });
      }
      scrollTimer.current = undefined;
    }, 180);
  }, [task.id]);
  const attachmentDirectories = useMemo(
    () => chatAttachmentDirectories(projectId, task.chatId),
    [projectId, task.chatId],
  );
  const mailbox = useMemo(
    () =>
      snapshot.messages.filter((message) => message.recipientTaskId === task.id || message.senderTaskId === task.id),
    [snapshot.messages, task.id],
  );
  const children = useMemo(
    () => snapshot.tasks.filter((child) => child.parentTaskId === task.id),
    [snapshot.tasks, task.id],
  );
  const activeDescendants = useMemo(() => {
    const tasksById = new Map(snapshot.tasks.map((entry) => [entry.id, entry]));
    return snapshot.tasks.filter((candidate) => {
      if (candidate.id === task.id) {
        return false;
      }
      const seen = new Set([candidate.id]);
      let parentId = candidate.parentTaskId;
      while (parentId) {
        if (seen.has(parentId)) {
          return false;
        }
        if (parentId === task.id) {
          const status = candidate.attempts.at(-1)?.status;
          return status === 'allocating' || status === 'running' || status === 'cancelling';
        }
        seen.add(parentId);
        parentId = tasksById.get(parentId)?.parentTaskId;
      }
      return false;
    });
  }, [snapshot.tasks, task.id]);
  const stopTriggerRef = useRef<HTMLButtonElement>(null);
  const visibleMessages = useMemo(() => {
    const syntheticIds = new Set(task.attempts.map((attempt) => `task-message-${attempt.id}`));
    return messages.filter((message) => !syntheticIds.has(message.id));
  }, [messages, task.attempts]);
  const hasCompleteTimelineTimes = visibleMessages.every((message) => message.metadata?.createdAt !== undefined);
  const timeline = useMemo(() => {
    const transcript = visibleMessages.map(
      (message, index) =>
        ({
          kind: 'chat',
          id: message.id,
          time: message.metadata?.createdAt,
          order: index,
          message,
        }) as const,
    );
    const inbox = mailbox.map(
      (message, index) =>
        ({
          kind: 'mailbox',
          id: message.id,
          time: message.createdAt,
          order: visibleMessages.length + index,
          message,
        }) as const,
    );
    // The chat log and mailbox each have an authoritative internal order. Interleave
    // them only when every chat event has a recorded time; a missing time is not zero.
    return hasCompleteTimelineTimes
      ? [...transcript, ...inbox].sort((a, b) => (a.time ?? 0) - (b.time ?? 0) || a.order - b.order)
      : [...transcript, ...inbox];
  }, [visibleMessages, mailbox, hasCompleteTimelineTimes]);
  const send: ChatTextareaProperties['onSubmit'] = useCallback(
    async ({ content, attachments, references }) => {
      if (isReadOnly || !canSend) {
        return;
      }
      if (attachments.length > 0 || (references?.length ?? 0) > 0) {
        setError('Thread messages support text only. Remove attachments and references to send.');
        return;
      }
      setIsBusy(true);
      setError(undefined);
      try {
        await actions.send(task.id, content);
        await consumeDraft();
        if (!isActive) {
          await actions.resume(task.id);
        }
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Could not send this message. Try again.');
      } finally {
        setIsBusy(false);
      }
    },
    [actions, canSend, consumeDraft, isActive, isReadOnly, task.id],
  );
  const cancel = useCallback(async () => {
    setIsBusy(true);
    setError(undefined);
    try {
      await actions.cancel(task.id);
      setIsCancelling(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not stop this thread. Try again.');
    } finally {
      setIsBusy(false);
    }
  }, [actions, task.id]);
  const resume = useCallback(async () => {
    setIsBusy(true);
    setError(undefined);
    try {
      await actions.resume(task.id);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not resume this thread. Try again.');
    } finally {
      setIsBusy(false);
    }
  }, [actions, task.id]);

  return (
    <ChatAttachmentDirectoriesContext.Provider value={attachmentDirectories}>
      <ChatQuestionsProvider>
        <AtReferenceProvider treeService={treeService} chats={chats}>
          <section aria-label={`Thread ${task.title}`} className='flex size-full min-h-0 flex-col bg-sidebar'>
            <div className='flex min-w-0 items-center gap-2 border-b px-3 py-2'>
              <Button size='icon' variant='ghost' aria-label='Back to threads' onClick={onBack}>
                <ArrowLeft aria-hidden className='size-4' />
              </Button>
              <div className='min-w-0 flex-1'>
                <h2 className='truncate text-sm font-medium'>{task.title}</h2>
              </div>
            </div>
            <nav aria-label='Thread ancestry' className='flex min-w-0 items-center gap-1 border-b px-4 py-1 text-xs'>
              <Button size='xs' variant='ghost' className='shrink-0' onClick={onBack}>
                Threads
              </Button>
              {parent ? (
                <Button
                  size='xs'
                  variant='ghost'
                  className='min-w-0 truncate'
                  onClick={() => {
                    onOpenParent(task.id);
                  }}
                >
                  {parent.title}
                </Button>
              ) : null}
              <span aria-current='page' className='min-w-0 truncate'>
                {task.title}
              </span>
            </nav>
            <div ref={scrollRef} onScroll={onTranscriptScroll} className='min-h-0 flex-1 overflow-y-auto px-3 py-4'>
              <div className='mx-auto max-w-xl min-w-0 space-y-4'>
                <article aria-label='Parent instruction' className='rounded-lg border bg-card p-3 text-sm'>
                  <p className='mb-1 text-xs font-medium text-muted-foreground'>Instruction from parent thread</p>
                  <p className='break-words whitespace-pre-wrap'>{task.prompt}</p>
                </article>
                {!hasCompleteTimelineTimes && visibleMessages.length > 0 ? (
                  <p className='border-b pb-1 text-xs font-medium text-muted-foreground'>Session transcript</p>
                ) : null}
                {timeline.map((entry, index) =>
                  entry.kind === 'chat' ? (
                    <ChatMessage key={entry.id} messageId={entry.id} readOnly />
                  ) : (
                    <div key={entry.id}>
                      {!hasCompleteTimelineTimes && index === visibleMessages.length ? (
                        <p className='mb-3 border-b pb-1 text-xs font-medium text-muted-foreground'>Task mailbox</p>
                      ) : null}
                      <ThreadMailboxMessage message={entry.message} task={task} snapshot={snapshot} />
                    </div>
                  ),
                )}
                {children.length > 0 ? (
                  <section aria-label='Child threads' className='space-y-1 border-t pt-3'>
                    <h3 className='text-xs font-medium text-muted-foreground'>Delegated threads</h3>
                    {children.map((child) => (
                      <Button
                        key={child.id}
                        size='sm'
                        variant='ghost'
                        className='w-full min-w-0 justify-start'
                        onClick={() => {
                          onSelectTask(child.id);
                        }}
                      >
                        <span className='min-w-0 truncate'>{child.title}</span>{' '}
                        <span className='ml-auto shrink-0 text-xs text-muted-foreground'>
                          {threadStatusLabels[child.attempts.at(-1)?.status ?? 'allocating']}
                        </span>
                      </Button>
                    ))}
                  </section>
                ) : null}
                {latest?.candidateCheckoutId && !isActive ? (
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() => {
                      onReviewCandidate(task.id);
                    }}
                  >
                    <GitBranch aria-hidden className='size-4' /> Review changes
                  </Button>
                ) : null}
                <details
                  className='border-t pt-2 text-xs'
                  open={detailsOpen}
                  onToggle={(event) => {
                    const { open } = event.currentTarget;
                    if (open === detailsOpen) {
                      return;
                    }
                    if (threadNavigation) {
                      threadNavigation.setThreadView(task.id, { detailsOpen: open });
                    } else {
                      setLocalDetailsOpen(open);
                    }
                  }}
                >
                  <summary className='cursor-action'>Thread details</summary>
                  <dl className='mt-3 grid min-w-0 grid-cols-2 gap-x-4 gap-y-2 border-t pt-3'>
                    <dt className='text-muted-foreground'>Agent</dt>
                    <dd className='min-w-0 break-all'>
                      {task.provider.id}
                      {task.provider.model ? ` · ${task.provider.model}` : ''}
                    </dd>
                    <dt className='text-muted-foreground'>Attempt</dt>
                    <dd>{latest?.number}</dd>
                    <dt className='text-muted-foreground'>Source</dt>
                    <dd className='min-w-0 break-all'>{latest?.source.revisionId}</dd>
                    <dt className='text-muted-foreground'>Working copy</dt>
                    <dd className='min-w-0 break-all'>{latest?.candidateCheckoutId ?? 'Not allocated'}</dd>
                    <dt className='text-muted-foreground'>Access</dt>
                    <dd>
                      {latest?.toolGrant.allowedTools?.length
                        ? `${latest.toolGrant.allowedTools.length} allowed tools`
                        : latest?.toolGrant.toolChoice === 'none'
                          ? 'No tools'
                          : 'Inherited from parent'}
                    </dd>
                  </dl>
                  {task.attempts.length > 1 ? (
                    <div className='mt-3 space-y-1 border-t pt-3'>
                      <h3 className='font-medium'>Earlier attempts</h3>
                      {task.attempts.slice(0, -1).map((attempt) => (
                        <p key={attempt.id}>
                          Attempt {attempt.number} · {threadStatusLabels[attempt.status]}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </details>
              </div>
            </div>
            <div className='mx-auto w-[calc(100%_-_1rem)] max-w-xl shrink-0 space-y-2 pb-2'>
              <ChatMessagePlanning className='px-3' />
              {hasClosedAncestor ? (
                <div
                  role='status'
                  className='flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-xs'
                >
                  <span>This thread’s parent was stopped.</span>
                  <Button
                    size='xs'
                    variant='outline'
                    onClick={() => {
                      onOpenParent(task.id);
                    }}
                  >
                    Open parent
                  </Button>
                </div>
              ) : null}
              {isReadOnly ? (
                <p role='status' className='rounded-md border p-2 text-xs'>
                  Last known thread. Reconnect to act.
                </p>
              ) : null}
              {latest?.detail && (status === 'failed' || status === 'interrupted') ? (
                <p role='alert' className='rounded-md border p-2 text-xs'>
                  {latest.detail}
                </p>
              ) : null}
              {error ? (
                <p role='alert' className='rounded-md border p-2 text-xs'>
                  {error}
                </p>
              ) : null}
              <ChatTextarea
                mode='main'
                taskMailbox
                enableApprovals={!isReadOnly && !task.closed && !hasClosedAncestor && status === 'running'}
                enableAutoFocus={false}
                enableContextActions={false}
                enableKernelSelector={false}
                onSubmit={send}
                isSubmitDisabled={isBusy || isReadOnly || !canSend}
              />
              <div className='flex flex-wrap items-center gap-2 px-2'>
                {canCancel ? (
                  <Button
                    ref={stopTriggerRef}
                    size='sm'
                    variant='outline'
                    disabled={isBusy || isReadOnly}
                    onClick={() => {
                      setIsCancelling(true);
                    }}
                  >
                    <Square aria-hidden className='size-3.5' /> Stop thread
                  </Button>
                ) : null}
                {canResume ? (
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={isBusy || isReadOnly}
                    onClick={async () => {
                      await resume();
                    }}
                  >
                    {status === 'completed' ? 'Resume thread' : 'Retry thread'}
                  </Button>
                ) : null}
              </div>
              {isCancelling ? (
                <div role='group' aria-label={`Stop ${task.title}`} className='rounded-md border p-2 text-sm'>
                  <p>
                    Stop {task.title}
                    {activeDescendants.length > 0
                      ? ` and ${activeDescendants.length} active ${activeDescendants.length === 1 ? 'child thread' : 'child threads'}`
                      : ''}
                    ? Partial work remains available for review.
                  </p>
                  <div className='mt-2 flex gap-2'>
                    <Button
                      size='sm'
                      disabled={isBusy}
                      onClick={async () => {
                        await cancel();
                      }}
                    >
                      Stop thread
                    </Button>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => {
                        setIsCancelling(false);
                        stopTriggerRef.current?.focus();
                      }}
                    >
                      Keep running
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </AtReferenceProvider>
      </ChatQuestionsProvider>
    </ChatAttachmentDirectoriesContext.Provider>
  );
};

const ThreadMailboxMessage = ({
  message,
  task,
  snapshot,
}: {
  readonly message: ProjectTaskMessage;
  readonly task: ProjectTask;
  readonly snapshot: ProjectTaskSnapshot;
}): React.JSX.Element => {
  const recipient = snapshot.tasks.find((item) => item.id === message.recipientTaskId);
  const sender = message.senderTaskId ? snapshot.tasks.find((item) => item.id === message.senderTaskId) : undefined;
  const deliveredAttempt = recipient?.attempts.find((attempt) =>
    snapshot.deliveries?.some(
      (receipt) =>
        receipt.taskId === message.recipientTaskId &&
        receipt.attemptId === attempt.id &&
        receipt.through >= message.sequence,
    ),
  );
  const label = message.senderTaskId === undefined ? 'You' : (sender?.title ?? 'Related thread');
  return (
    <article className='rounded-lg border bg-card px-3 py-2 text-sm' aria-label={`Message from ${label}`}>
      <p className='mb-1 text-xs font-medium text-muted-foreground'>
        {label}
        {message.senderTaskId === task.id ? ` → ${recipient?.title ?? 'Related thread'}` : ''}
      </p>
      <p className='break-words whitespace-pre-wrap'>{message.text}</p>
      <p className='mt-1 text-right text-xs text-muted-foreground'>
        {message.recipientTaskId === task.id
          ? deliveredAttempt
            ? `Delivered to attempt ${deliveredAttempt.number}`
            : 'Queued for this thread'
          : deliveredAttempt
            ? `Delivered to ${recipient?.title ?? 'related thread'} · attempt ${deliveredAttempt.number}`
            : `Queued for ${recipient?.title ?? 'related thread'}`}
      </p>
    </article>
  );
};

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
      className={cn('[scrollbar-gutter:stable]', props.className)}
    />
  );
});

const ChatHistoryHeader = (): undefined => undefined;
const ChatHistoryEmptyPlaceholder = (): React.JSX.Element => (
  <div className='mx-auto flex h-full w-[calc(100%_-_1rem)] max-w-xl px-3 py-6'>
    <ChatHistoryEmpty />
  </div>
);
// Initial positioning waits for Virtuoso's measured content, including an initially empty pane.
const initialChatTurn = { index: 'LAST', align: 'end' } as const;

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
  const projectTasks = useProjectTasks(projectId);
  const delegatedTask = projectTasks.snapshot?.tasks.find(
    (task) => task.chatId === activeChatId && task.parentTaskId !== undefined,
  );
  const workspace = useProjectWorkspace({ enableNoContext: true });
  const threadNavigation = useThreadNavigation({ enableNoContext: true });
  const openAgents = useCallback(() => {
    if (delegatedTask && threadNavigation) {
      threadNavigation.openThreads(delegatedTask.id);
    } else {
      workspace?.openPanel('agents');
    }
  }, [delegatedTask?.id, threadNavigation, workspace]);
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
  const focusComposer = useCallback(() => {
    chatTextareaRef.current?.focus();
  }, []);
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
    async ({ content, attachments, references }) => {
      if (delegatedTask !== undefined) {
        return;
      }
      // Pending until the message lands, so the composer stays busy through admission (R8).
      await submitChat({ text: content, attachments, ...(references === undefined ? {} : { references }) });
    },
    [delegatedTask, submitChat],
  );

  const groups = useChatSelector((state) => state.turnGroups);

  const renderItem = useCallback(
    (index: number, group: TurnGroupData) => {
      const isLast = index === groups.length - 1;
      return (
        <TurnGroup
          messageIds={group.messageIds}
          isLast={isLast}
          isClosedDelegatedTask={delegatedTask?.closed === true}
          onOpenAgents={openAgents}
        />
      );
    },
    [delegatedTask?.closed, groups.length, openAgents],
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
                scrollerRef={followLatestOutput.scrollerRef}
                followOutput={followLatestOutput.followOutput}
                totalListHeightChanged={followLatestOutput.totalListHeightChanged}
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
            {groups.length === 0 ? (
              <ChatError
                className='mx-4 mb-1 shrink-0'
                isClosedDelegatedTask={delegatedTask?.closed === true}
                onOpenAgents={openAgents}
              />
            ) : null}
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
              <ChatMessagePlanning key={activeChatId} className='mb-3 px-3' />
              {delegatedTask ? null : (
                <div className='mb-2 px-2'>
                  <Button type='button' size='sm' variant='ghost' onClick={openAgents}>
                    Threads
                  </Button>
                </div>
              )}
              <div className='mx-2 -mb-3 flex flex-col rounded-t-2xl border border-b-0 border-border/60 bg-muted/20 pb-3 empty:hidden'>
                <ChatTodoList key={activeChatId} />
                <ChatMessageQueue key={`${activeChatId}:messages`} />
                <ChatQuestionQueue key={`${activeChatId}:questions`} onDismissFocus={focusComposer} />
              </div>
              {delegatedTask ? (
                <div
                  role='status'
                  className='mx-2 flex items-center justify-between gap-2 rounded-lg border bg-muted p-2 text-sm'
                >
                  <span>
                    This chat belongs to {delegatedTask.title}.{' '}
                    {delegatedTask.closed
                      ? 'Open Threads to review the task and available actions.'
                      : 'Send a message and resume the task from Threads to continue it.'}
                  </span>
                  <Button type='button' size='sm' variant='outline' onClick={openAgents}>
                    Open Threads
                  </Button>
                </div>
              ) : null}
              <ChatTextarea
                ref={chatTextareaRef}
                mode='main'
                enableAutoFocus={false}
                onSubmit={onSubmit}
                isSubmitDisabled={delegatedTask !== undefined}
              />
            </div>
          </FloatingPanelContent>
        </FloatingPanel>
      </ChatQuestionsProvider>
    </ChatAttachmentDirectoriesContext.Provider>
  );
});
