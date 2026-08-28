import { useMemo, useState } from 'react';
import type { Chat } from '@taucad/chat';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router';
import type { ProjectListItem } from '#types/project.types.js';
import { useChats } from '#hooks/use-chats.js';
import { SidebarMenuButton, SidebarMenuSub, SidebarMenuSubItem } from '#components/ui/sidebar.js';
import { Skeleton } from '#components/ui/skeleton.js';
import { Button } from '#components/ui/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu.js';
import { InlineTextEditor } from '#components/inline-text-editor.js';
import { pickNextFocusedChatId } from '#routes/w.$workspace.$project/chat-navigation.utils.js';
import { projectChatIdFromSearch, projectChatUrl, projectUrl } from '#utils/project-url.utils.js';

const chatsPerPage = 5;

export const sortProjectChats = (chats: readonly Chat[]): Chat[] =>
  [...chats].sort(
    (left, right) =>
      right.updatedAt - left.updatedAt || right.createdAt - left.createdAt || left.id.localeCompare(right.id),
  );

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
  const [visibleCount, setVisibleCount] = useState(chatsPerPage);
  const [editingChatId, setEditingChatId] = useState<string | undefined>();
  const sortedChats = useMemo(() => sortProjectChats(chats), [chats]);
  const visibleChats = sortedChats.slice(0, visibleCount);
  const activeChatId = isProjectActive ? projectChatIdFromSearch(location.search) : undefined;
  const listId = `project-chats-${project.id}`;

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
            onClick={() => void retry()}
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
      {visibleChats.map((chat) => (
        <ProjectChatItem
          key={chat.id}
          chat={chat}
          project={project}
          isActive={chat.id === activeChatId}
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
  isEditing,
  onRename,
  onRenameSave,
  onEditingChange,
  onDelete,
}: {
  readonly chat: Chat;
  readonly project: ProjectListItem;
  readonly isActive: boolean;
  readonly isEditing: boolean;
  readonly onRename: () => void;
  readonly onRenameSave: (name: string) => Promise<void>;
  readonly onEditingChange: (isEditing: boolean) => void;
  readonly onDelete: () => Promise<void>;
}): React.JSX.Element {
  return (
    <SidebarMenuSubItem>
      <div
        data-slot='chat-trigger'
        data-active={isActive}
        className='group/chat-trigger flex h-7 w-full min-w-0 items-center rounded-md text-sm text-sidebar-foreground transition-colors focus-within:bg-sidebar-accent hover:bg-sidebar-accent data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground'
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
          <Link
            to={projectChatUrl(project.slugs, chat.id)}
            aria-current={isActive ? 'page' : undefined}
            className='flex h-full min-w-0 flex-1 items-center overflow-hidden rounded-md pr-1.5 pl-[30px] ring-sidebar-ring outline-hidden focus-visible:ring-2'
          >
            <span className='truncate'>{chat.name}</span>
          </Link>
        ) : (
          <div className='flex h-7 min-w-0 flex-1 items-center pr-1.5 pl-[30px] text-sm text-muted-foreground'>
            <span className='truncate'>{chat.name}</span>
          </div>
        )}
        {isEditing ? null : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='mr-1 size-6 shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=open]:opacity-100 md:opacity-0 md:group-focus-within/chat-trigger:opacity-100 md:group-hover/chat-trigger:opacity-100 dark:hover:bg-transparent'
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
              <DropdownMenuSeparator />
              <DropdownMenuItem variant='destructive' onSelect={() => void onDelete()}>
                <Trash2 aria-hidden />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </SidebarMenuSubItem>
  );
}
