import { useCallback, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock3,
  GitBranch,
  LoaderCircle,
  MessagesSquare,
  Search,
  ShieldAlert,
  Square,
} from 'lucide-react';
import type { ProjectTask, ProjectTaskStatus } from '@taucad/agent-host/wire';
import { Button } from '@taucad/ui/components/button';
import { Input } from '@taucad/ui/components/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import { PanelEmptyState } from '@taucad/ui/components/panel-empty-state';
import { useProject } from '#hooks/use-project.js';
import { useProjectTasks } from '#hooks/use-project-tasks.js';
import { useAgentProjections } from '#hooks/use-agent-projections.js';
import { useProjectSlugs } from '#hooks/use-project-slug-route.js';
import { useChatRecords } from '#hooks/use-chat-records.js';
import { MetadataTaskHistory, SelectedTaskHistory } from '#routes/w.$workspace.$project/chat-history.js';
import { useThreadNavigation } from '#routes/w.$workspace.$project/thread-navigation-context.js';

export type ThreadsPanelBodyProps = Readonly<{
  rootChatId?: string;
  selectedTaskId?: string;
  onSelectTask: (taskId: string) => void;
  onBack: () => void;
  onReturnToChat?: () => void;
  onOpenParent: (taskId: string) => void;
  onReviewCandidate: (taskId: string) => void;
  enableHistory?: boolean;
}>;

type ThreadGroup = 'Waiting on you' | 'Ongoing' | 'Past threads';
const groups: readonly ThreadGroup[] = ['Waiting on you', 'Ongoing', 'Past threads'];
const statusLabels: Readonly<Record<ProjectTaskStatus, string>> = {
  allocating: 'Starting',
  running: 'Working',
  cancelling: 'Stopping',
  completed: 'Completed',
  failed: 'Interrupted',
  cancelled: 'Stopped',
  interrupted: 'Interrupted',
};
const statusIcons: Readonly<Record<ProjectTaskStatus, typeof Clock3>> = {
  allocating: Clock3,
  running: LoaderCircle,
  cancelling: LoaderCircle,
  completed: CircleCheck,
  failed: CircleAlert,
  cancelled: Square,
  interrupted: CircleAlert,
};

/** Walk only validated task ancestry. A missing parent or cycle never promotes a child into this root. */
export function rootThreadTasks(tasks: readonly ProjectTask[], rootChatId: string | undefined): readonly ProjectTask[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const root = tasks.find((task) => task.chatId === rootChatId && task.parentTaskId === undefined);
  if (!root) {
    return [];
  }
  return tasks
    .filter((task) => {
      if (task.id === root.id) {
        return false;
      }
      const visited = new Set([task.id]);
      let parentId = task.parentTaskId;
      while (parentId) {
        if (visited.has(parentId)) {
          return false;
        }
        visited.add(parentId);
        if (parentId === root.id) {
          return true;
        }
        parentId = byId.get(parentId)?.parentTaskId;
      }
      return false;
    })
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

function groupFor(task: ProjectTask, needsAttention: boolean): ThreadGroup {
  const status = task.attempts.at(-1)?.status;
  if (needsAttention || status === 'failed' || status === 'interrupted') {
    return 'Waiting on you';
  }
  if (status === 'completed' || status === 'cancelled') {
    return 'Past threads';
  }
  return 'Ongoing';
}

/** A root-scoped task projection. The project host remains the sole task observer and command owner. */
export function ThreadsPanelBody({
  rootChatId,
  selectedTaskId,
  onSelectTask,
  onBack,
  onReturnToChat,
  onOpenParent,
  onReviewCandidate,
  enableHistory = true,
}: ThreadsPanelBodyProps): React.JSX.Element {
  const { projectId } = useProject();
  const threadNavigation = useThreadNavigation({ enableNoContext: true });
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [localGroupOpen, setLocalGroupOpen] = useState<Partial<Record<ThreadGroup, boolean>>>({});
  const taskView = useProjectTasks(projectId, enableHistory);
  const { chats } = useChatRecords(projectId, { enabled: enableHistory });
  const slugs = useProjectSlugs(projectId);
  const { agents } = useAgentProjections({
    workspaceLabel: slugs.status === 'resolved' ? slugs.value.workspaceSlug : undefined,
    enabled: enableHistory,
  });
  const threads = useMemo(
    () => rootThreadTasks(taskView.snapshot?.tasks ?? [], rootChatId),
    [taskView.snapshot?.tasks, rootChatId],
  );
  const byId = useMemo(
    () => new Map(taskView.snapshot?.tasks.map((task) => [task.id, task]) ?? []),
    [taskView.snapshot?.tasks],
  );
  const selected = threads.find((task) => task.id === selectedTaskId);
  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return query === ''
      ? threads
      : threads.filter((task) => `${task.title}\n${task.prompt}`.toLocaleLowerCase().includes(query));
  }, [search, threads]);
  const readOnly = taskView.isLoading || taskView.error !== undefined || taskView.unavailable !== undefined;
  const reconnect = useCallback(() => {
    taskView.retry();
  }, [taskView.retry]);

  if (!taskView.snapshot) {
    const selectedChat =
      rootChatId && selectedTaskId
        ? chats.find(
            (chat) => chat.taskLineage?.taskId === selectedTaskId && chat.taskLineage.rootChatId === rootChatId,
          )
        : undefined;
    if (selectedChat) {
      return <MetadataTaskHistory chat={selectedChat} onBack={onBack} onOpenParent={onOpenParent} />;
    }
    return (
      <div className='flex size-full flex-col bg-sidebar p-4'>
        {taskView.isLoading ? (
          <p role='status' aria-busy='true'>
            Loading related threads…
          </p>
        ) : null}
        {(taskView.unavailable ?? taskView.error) === undefined ? null : (
          <PanelEmptyState
            icon={CircleAlert}
            title='Threads unavailable'
            description={taskView.error ?? taskView.unavailable}
            role='alert'
          >
            {taskView.error ? (
              <Button size='sm' variant='outline' onClick={reconnect}>
                Reconnect
              </Button>
            ) : null}
          </PanelEmptyState>
        )}
      </div>
    );
  }

  if (selected) {
    const parent = selected.parentTaskId ? byId.get(selected.parentTaskId) : undefined;
    const closedAncestor = (() => {
      const seen = new Set([selected.id]);
      let parentId = selected.parentTaskId;
      while (parentId) {
        if (seen.has(parentId)) {
          return true;
        }
        seen.add(parentId);
        const ancestor = byId.get(parentId);
        if (!ancestor || ancestor.closed) {
          return true;
        }
        parentId = ancestor.parentTaskId;
      }
      return false;
    })();
    return (
      <SelectedTaskHistory
        key={selected.id}
        task={selected}
        parent={parent}
        snapshot={taskView.snapshot}
        actions={taskView.actions}
        isReadOnly={readOnly}
        hasClosedAncestor={closedAncestor}
        onBack={onBack}
        onOpenParent={onOpenParent}
        onSelectTask={onSelectTask}
        onReviewCandidate={onReviewCandidate}
      />
    );
  }

  return (
    <section aria-label='Threads for this chat' className='flex size-full min-h-0 flex-col bg-sidebar'>
      <div className='flex flex-wrap items-start justify-between gap-3 px-5 pt-6 pb-5'>
        <h2 className='text-lg font-medium'>Threads</h2>
        <Button
          size='icon'
          variant='ghost'
          aria-label='Search related threads'
          aria-expanded={isSearchOpen}
          onClick={() => {
            setIsSearchOpen((open) => !open);
          }}
        >
          <Search aria-hidden className='size-4' />
        </Button>
      </div>
      {isSearchOpen ? (
        <div className='px-5 pb-4'>
          <Input
            aria-label='Search related threads'
            placeholder='Search threads…'
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
          />
        </div>
      ) : null}
      {readOnly ? (
        <p role='status' className='px-5 pb-3 text-xs text-muted-foreground'>
          Last known threads. Reconnect to act.
        </p>
      ) : null}
      <div className='min-h-0 flex-1 overflow-y-auto'>
        {threads.length === 0 ? (
          <div className='h-80'>
            <PanelEmptyState
              icon={MessagesSquare}
              title='No threads yet'
              description='Threads started from this conversation will appear here.'
            >
              {onReturnToChat ? (
                <Button size='sm' variant='outline' onClick={onReturnToChat}>
                  Return to chat
                </Button>
              ) : null}
            </PanelEmptyState>
          </div>
        ) : visible.length === 0 ? (
          <div className='px-5 py-8 text-sm'>
            <p>No matching threads in this chat.</p>
            <Button
              size='sm'
              variant='ghost'
              className='mt-2'
              onClick={() => {
                setSearch('');
              }}
            >
              Clear search
            </Button>
          </div>
        ) : (
          <div className='space-y-5 px-3 pb-6'>
            {groups.map((group) => {
              const items = visible.filter((task) => {
                const agent = agents.find((item) => item.chatId === task.chatId);
                const status = task.attempts.at(-1)?.status;
                return groupFor(task, status === 'running' && (agent?.pendingApprovalCount ?? 0) > 0) === group;
              });
              if (items.length === 0) {
                return null;
              }
              const isOpen = threadNavigation?.getThreadGroupOpen(group) ?? localGroupOpen[group] ?? true;
              return (
                <Collapsible
                  key={group}
                  open={isOpen}
                  onOpenChange={(open) => {
                    if (threadNavigation) {
                      threadNavigation.setThreadGroupOpen(group, open);
                    } else {
                      setLocalGroupOpen((current) => ({ ...current, [group]: open }));
                    }
                  }}
                >
                  <CollapsibleTrigger asChild>
                    <Button
                      size='sm'
                      variant='ghost'
                      className='w-full justify-start gap-2 bg-muted/50'
                      aria-label={`${group}, ${items.length} ${items.length === 1 ? 'thread' : 'threads'}`}
                    >
                      <ChevronDown
                        aria-hidden
                        className={
                          isOpen
                            ? 'size-3 transition-transform duration-150'
                            : 'size-3 -rotate-90 transition-transform duration-150'
                        }
                      />
                      <span>{group}</span>
                      <span className='text-muted-foreground tabular-nums'>{items.length}</span>
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <ul aria-label={`${group} threads`} className='mt-1'>
                      {items.map((task) => {
                        const status = task.attempts.at(-1)?.status ?? 'allocating';
                        const agent = agents.find((item) => item.chatId === task.chatId);
                        const needsPermission = status === 'running' && (agent?.pendingApprovalCount ?? 0) > 0;
                        const StatusIcon = needsPermission ? ShieldAlert : statusIcons[status];
                        const label = needsPermission ? 'Needs permission' : statusLabels[status];
                        const summary = task.attempts.at(-1)?.detail ?? task.prompt;
                        const parent = task.parentTaskId ? byId.get(task.parentTaskId) : undefined;
                        return (
                          <li key={task.id}>
                            <button
                              type='button'
                              className='group flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-opacity duration-150 outline-none hover:bg-accent/50 focus-visible:focus-outline'
                              onClick={() => {
                                onSelectTask(task.id);
                              }}
                              aria-label={`Open ${task.title}`}
                            >
                              <span className='pt-1'>
                                <StatusIcon aria-hidden className='size-4 shrink-0 text-muted-foreground' />
                              </span>
                              <span className='min-w-0 flex-1'>
                                <span className='flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1'>
                                  <span className='text-sm font-medium'>{task.title}</span>
                                  <span className='text-xs text-muted-foreground'>{label}</span>
                                </span>
                                {summary.trim() === task.title.trim() ? null : (
                                  <span className='mt-1 line-clamp-2 block text-xs leading-relaxed text-muted-foreground'>
                                    {summary}
                                  </span>
                                )}
                                {parent?.parentTaskId ? (
                                  <span className='mt-1 flex items-center gap-1 text-xs text-muted-foreground'>
                                    <GitBranch aria-hidden className='size-3' />
                                    {parent.title}
                                  </span>
                                ) : null}
                              </span>
                              <ChevronRight aria-hidden className='mt-1 size-4 shrink-0 text-muted-foreground' />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
