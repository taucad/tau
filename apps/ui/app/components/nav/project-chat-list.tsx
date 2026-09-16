import { Fragment, useMemo, useState } from 'react';
import type { Chat } from '@taucad/chat';
import { MoreHorizontal, Pencil, Trash2, X } from 'lucide-react';
import { Link, useLocation, useNavigate, useNavigation } from 'react-router';
import type { ProjectListItem } from '#types/project.types.js';
import { useChats } from '#hooks/use-chats.js';
import { SidebarMenuButton, SidebarMenuSub, SidebarMenuSubItem } from '#components/ui/sidebar.js';
import { Skeleton } from '@taucad/ui/components/skeleton';
import { Button } from '@taucad/ui/components/button';
import { nestedActionVariants } from '@taucad/ui/components/nested-action.variants';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import { InlineTextEditor } from '#components/inline-text-editor.js';
import { Loader } from '#components/ui/loader.js';
import { pickNextFocusedChatId } from '#routes/w.$workspace.$project/chat-navigation.utils.js';
import { projectChatIdFromSearch, projectChatUrl, projectUrl } from '#utils/project-url.utils.js';
import { compareChatsByRecency, getChatRecencyAt } from '#utils/chat-recency.utils.js';
import { BranchChip, ChatStatusGlyph } from '#components/nav/chat-status-glyph.js';
import {
  chatStatusDescription,
  chatStatusLabel,
  useChatSidebarStatus,
  useSidebarCommands,
} from '#hooks/use-sidebar-status.js';
import { useChatSession } from '#hooks/use-chat-session.js';

const chatsPerPage = 5;

/** Chats group by day (A29): the older ones are still there, just further down. */
const startOfToday = (): number => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
};

export const sortProjectChats = (chats: readonly Chat[]): Chat[] => [...chats].sort(compareChatsByRecency);

export function ProjectChatList({
  project,
  isProjectActive,
}: {
  readonly project: ProjectListItem;
  readonly isProjectActive: boolean;
}): React.JSX.Element {
  const { chats, isLoading, error, retry, updateChatName, deleteChat } = useChats(project.id);
  const location = useLocation();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const [visibleCount, setVisibleCount] = useState(chatsPerPage);
  const [editingChatId, setEditingChatId] = useState<string | undefined>();
  const sortedChats = useMemo(() => sortProjectChats(chats), [chats]);
  const visibleChats = sortedChats.slice(0, visibleCount);
  /* A29: the label appears only when both groups do — a list that is all from
   * today has nothing to disclose. */
  const groupLabels = useMemo(() => {
    const today = startOfToday();
    const groups = visibleChats.map((entry) => (getChatRecencyAt(entry) >= today ? 'Today' : 'Earlier'));
    return groups.map((group, index) =>
      groups.includes('Today') && groups.includes('Earlier') && group !== groups[index - 1] ? group : undefined,
    );
  }, [visibleChats]);
  const activeChatId = isProjectActive ? projectChatIdFromSearch(location.search) : undefined;
  const listId = `project-chats-${project.id}`;
  const pendingUrl = navigation.location ? `${navigation.location.pathname}${navigation.location.search}` : undefined;

  const handleDelete = async (chatId: string): Promise<void> => {
    await deleteChat(chatId);
    if (!isProjectActive || activeChatId !== chatId || !project.slugs) {
      return;
    }

    const nextChatId = pickNextFocusedChatId(chats, chatId, activeChatId);
    await navigate(nextChatId ? projectChatUrl(project.slugs, nextChatId) : projectUrl(project.slugs), {
      replace: true,
    });
  };

  return (
    <SidebarMenuSub id={listId} className='mx-0 mt-0.5 translate-x-0 gap-0.5 border-0 px-0 py-0'>
      {isLoading && chats.length === 0
        ? Array.from({ length: 3 }, (_, index) => (
            <SidebarMenuSubItem key={index} aria-hidden>
              <div className='flex h-7 items-center gap-2 px-2'>
                <Skeleton className='size-3 rounded-sm' />
                <Skeleton className='h-3 flex-1' />
              </div>
            </SidebarMenuSubItem>
          ))
        : null}
      {error && chats.length === 0 ? (
        <SidebarMenuSubItem>
          <button
            type='button'
            className='h-7 w-full rounded-md px-2 text-left text-xs text-muted-foreground hover:bg-sidebar-accent'
            onClick={() => {
              void retry();
            }}
          >
            Could not load chats. Retry
          </button>
        </SidebarMenuSubItem>
      ) : null}
      {!isLoading && !error && chats.length === 0 ? (
        <SidebarMenuSubItem>
          <div className='flex h-7 items-center px-2 text-xs text-muted-foreground'>No chats yet</div>
        </SidebarMenuSubItem>
      ) : null}
      {visibleChats.map((chat, index) => (
        <Fragment key={chat.id}>
          {groupLabels[index] === undefined ? null : (
            <SidebarMenuSubItem>
              <div className='flex h-6 items-center pr-1.5 pl-[30px] text-xs text-muted-foreground/70'>
                {groupLabels[index]}
              </div>
            </SidebarMenuSubItem>
          )}
          <ProjectChatItem
            chat={chat}
            project={project}
            isActive={chat.id === activeChatId}
            isPending={project.slugs !== undefined && pendingUrl === projectChatUrl(project.slugs, chat.id)}
            isEditing={editingChatId === chat.id}
            onRename={() => {
              setEditingChatId(chat.id);
            }}
            onRenameSave={async (name) => {
              await updateChatName(chat.id, name);
            }}
            onEditingChange={(editing) => {
              if (!editing) {
                setEditingChatId(undefined);
              }
            }}
            onDelete={async () => handleDelete(chat.id)}
          />
        </Fragment>
      ))}
      {visibleCount < sortedChats.length ? (
        <SidebarMenuSubItem>
          <SidebarMenuButton
            type='button'
            className='pr-1.5 pl-[30px] text-muted-foreground/55 hover:bg-transparent hover:text-muted-foreground/90 active:bg-transparent active:text-muted-foreground/90 dark:hover:bg-transparent'
            onClick={() => {
              setVisibleCount((count) => count + chatsPerPage);
            }}
          >
            Show more chats
          </SidebarMenuButton>
        </SidebarMenuSubItem>
      ) : null}
    </SidebarMenuSub>
  );
}

function ProjectChatItem({
  chat,
  project,
  isActive,
  isPending,
  isEditing,
  onRename,
  onRenameSave,
  onEditingChange,
  onDelete,
}: {
  readonly chat: Chat;
  readonly project: ProjectListItem;
  readonly isActive: boolean;
  readonly isPending: boolean;
  readonly isEditing: boolean;
  readonly onRename: () => void;
  readonly onRenameSave: (name: string) => Promise<void>;
  readonly onEditingChange: (isEditing: boolean) => void;
  readonly onDelete: () => Promise<void>;
}): React.JSX.Element {
  const { closeChat } = useSidebarCommands();
  useChatSession(chat.id, project.id);
  const status = useChatSidebarStatus(project.id, chat.id);
  const isFailed = status?.state === 'failed';
  return (
    <SidebarMenuSubItem>
      <div
        data-slot='chat-trigger'
        data-active={isActive}
        className='group/chat-trigger flex min-h-7 w-full min-w-0 items-center rounded-md text-sm text-sidebar-foreground transition-colors focus-within:bg-sidebar-accent hover:bg-sidebar-accent data-[active=true]:bg-sidebar-accent'
      >
        {isEditing ? (
          <InlineTextEditor
            value={chat.name}
            variant='ghost'
            shouldStartEditing
            className='h-7 min-w-0 flex-1 pr-1.5 pl-[30px] [&_[data-slot=button]]:hidden [&_[data-slot=input]]:h-7'
            onSave={onRenameSave}
            onEditingChange={onEditingChange}
          />
        ) : project.slugs ? (
          <ChatRowContent
            chat={chat}
            status={status}
            to={projectChatUrl(project.slugs, chat.id)}
            isActive={isActive}
            isPending={isPending}
          />
        ) : (
          <div className='flex h-7 min-w-0 flex-1 items-center pr-1.5 pl-[30px] text-sm text-muted-foreground'>
            <span className='truncate'>{chat.name}</span>
          </div>
        )}
        {isEditing ? null : (
          <span className='relative flex shrink-0 items-center'>
            {status === undefined ? null : (
              <span className='pointer-events-none absolute right-3 hidden transition-opacity md:flex md:group-focus-within/chat-trigger:opacity-0 md:group-hover/chat-trigger:opacity-0'>
                <ChatStatusGlyph status={status} />
              </span>
            )}
            <span className='flex items-center transition-opacity md:opacity-0 md:group-focus-within/chat-trigger:opacity-100 md:group-hover/chat-trigger:opacity-100'>
              {isFailed ? <FailedChatActions chat={chat} project={project} /> : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon'
                    className={nestedActionVariants({
                      className: 'mr-0.5 size-6 shrink-0 text-muted-foreground',
                    })}
                    aria-label={`More actions for ${chat.name}`}
                  >
                    <MoreHorizontal aria-hidden className='size-3.5' />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side='right' align='start' className='w-40'>
                  <DropdownMenuItem onSelect={onRename}>
                    <Pencil aria-hidden />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    aria-label={`Close ${chat.name}`}
                    onSelect={() => {
                      closeChat(project.id, chat.id);
                    }}
                  >
                    <X aria-hidden />
                    Close
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant='destructive'
                    onSelect={() => {
                      void onDelete();
                    }}
                  >
                    <Trash2 aria-hidden />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </span>
          </span>
        )}
      </div>
    </SidebarMenuSubItem>
  );
}

/**
 * A chat row's whole status surface — one subscriber, one repaint.
 *
 * Everything the row draws about the chat is read here and nowhere else, so a
 * chat whose tool name moved repaints its own row and not its siblings' (V24).
 * The glyph, the second line and the chip sit *outside* the link on purpose:
 * the link's accessible name is the chat's name, and nothing else.
 *
 * @param props - The chat, its project, and the link's own state.
 * @returns The row's content.
 */
function ChatRowContent({
  chat,
  status,
  to,
  isActive,
  isPending,
}: {
  readonly chat: Chat;
  readonly status: ReturnType<typeof useChatSidebarStatus>;
  readonly to: string;
  readonly isActive: boolean;
  readonly isPending: boolean;
}): React.JSX.Element {
  const label = status === undefined ? undefined : chatStatusLabel(status);
  const descriptionId = `chat-status-${chat.id}`;
  return (
    <>
      <span className='flex min-w-0 flex-1 flex-col justify-center py-0.5 pl-[30px]'>
        <Link
          to={to}
          aria-current={isActive ? 'page' : undefined}
          aria-busy={isPending}
          aria-describedby={status === undefined ? undefined : descriptionId}
          className='flex min-w-0 items-center gap-1.5 overflow-hidden rounded-md outline-hidden focus-visible:focus-outline'
        >
          {isPending ? <Loader className='size-3.5 shrink-0' /> : null}
          <span className={`truncate ${status?.unread === true ? 'font-medium text-foreground' : ''}`}>
            {chat.name}
          </span>
        </Link>
        {label === undefined ? null : (
          <span className='truncate text-xs leading-tight text-muted-foreground'>{label}</span>
        )}
      </span>
      {status === undefined ? null : <BranchChip branch={status.branch} isDirty={status.dirty} />}
      {status === undefined ? null : (
        <span id={descriptionId} className='sr-only'>
          {chatStatusDescription(chat.name, status)}
        </span>
      )}
    </>
  );
}

/**
 * *Retry* and *Open log*, the two verbs a failed row offers (R12, canvas).
 *
 * Neither is new behaviour: *Retry* is the same `startRequest{kind:'continue'}`
 * the in-chat error banner's *Try again* sends, through the store that owns the
 * run, and *Open log* is the chat's own route — the place the transcript is.
 *
 * @param props - The failed chat and its project.
 * @returns The two controls.
 */
function FailedChatActions({
  chat,
  project,
}: {
  readonly chat: Chat;
  readonly project: ProjectListItem;
}): React.JSX.Element {
  const { retryChat } = useSidebarCommands();
  return (
    <span className='flex shrink-0 items-center'>
      <Button
        type='button'
        variant='ghost'
        size='sm'
        className={nestedActionVariants({ className: 'h-6 px-1.5 text-xs text-muted-foreground' })}
        aria-label={`Retry ${chat.name}`}
        onClick={() => {
          retryChat(chat.id);
        }}
      >
        Retry
      </Button>
      {project.slugs === undefined ? null : (
        <Link
          to={projectChatUrl(project.slugs, chat.id)}
          aria-label={`Open log for ${chat.name}`}
          className={nestedActionVariants({
            className: 'rounded-sm px-1.5 text-xs text-muted-foreground outline-hidden focus-visible:focus-outline',
          })}
        >
          Open log
        </Link>
      )}
    </span>
  );
}
