import { Fragment, useMemo, useState } from 'react';
import type { Chat } from '@taucad/chat';
import { Pencil, Square, Trash2 } from 'lucide-react';
import { useLocation, useNavigate, useNavigation } from 'react-router';
import type { ProjectListItem } from '#types/project.types.js';
import { useChats } from '#hooks/use-chats.js';
import { SidebarMenuButton, SidebarMenuSub, SidebarMenuSubItem } from '#components/ui/sidebar.js';
import { InlineTextEditor } from '#components/inline-text-editor.js';
import { pickNextFocusedChatId } from '#routes/w.$workspace.$project/chat-navigation.utils.js';
import { projectChatIdFromSearch, projectChatUrl, projectUrl } from '#utils/project-url.utils.js';
import { compareChatsByRecency, getChatRecencyAt } from '#utils/chat-recency.utils.js';
import { StatusMark } from '#components/nav/status-mark.js';
import {
  SidebarFailureRow,
  SidebarRowActions,
  SidebarRowContextMenu,
  SidebarRowLink,
  SidebarRowMenuButton,
  SidebarRowSkeleton,
  sidebarRowClass,
  sidebarRowEditorClass,
} from '#components/nav/sidebar-row.js';
import type { SidebarRowMenuItems } from '#components/nav/sidebar-row.js';
import { selectChatFacts, useChatSidebarStatus, useSidebarCommands } from '#hooks/use-sidebar-status.js';
import type { SidebarFacts } from '#hooks/use-sidebar-status.js';
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
  const { chats, isLoading, error, updateChatName, deleteChat } = useChats(project.id);
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
    /* D8: chats step in one slot and hang off the sidebar primitive's own rail,
     * which starts under the project's chevron, so a chat row and a collapsed
     * project row never share a column. */
    <SidebarMenuSub
      id={listId}
      className='mt-0.5 mr-0 ml-3.5 translate-x-0 gap-0.5 border-l border-sidebar-border py-0 pr-0 pl-1.5'
    >
      {isLoading && chats.length === 0
        ? Array.from({ length: 3 }, (_, index) => (
            <SidebarMenuSubItem key={index} aria-hidden>
              <SidebarRowSkeleton />
            </SidebarMenuSubItem>
          ))
        : null}
      {error && chats.length === 0 ? (
        <SidebarMenuSubItem>
          <SidebarFailureRow what='chats' />
        </SidebarMenuSubItem>
      ) : null}
      {!isLoading && !error && chats.length === 0 ? (
        <SidebarMenuSubItem>
          <div className='flex h-7 items-center pl-7.5 text-xs text-muted-foreground'>No chats yet</div>
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
  const facts: SidebarFacts = status === undefined ? { mark: 'none', sentence: undefined } : selectChatFacts(status);
  /* D7: *Stop* only while there is something to stop. */
  const canStop = facts.mark === 'running' || facts.mark === 'attention';
  /* D7: no Retry and no Open log. The chat's own banner owns Try again, and the
   * name already opens the chat. */
  const menuItems: SidebarRowMenuItems = ({ Item, Separator }) => (
    <>
      <Item onSelect={onRename}>
        <Pencil aria-hidden />
        Rename
      </Item>
      {canStop ? (
        <Item
          aria-label={`Stop ${chat.name}`}
          onSelect={() => {
            closeChat(project.id, chat.id);
          }}
        >
          <Square aria-hidden />
          Stop
        </Item>
      ) : null}
      <Separator />
      <Item
        variant='destructive'
        onSelect={() => {
          void onDelete();
        }}
      >
        <Trash2 aria-hidden />
        Delete
      </Item>
    </>
  );
  return (
    <SidebarMenuSubItem>
      <SidebarRowContextMenu items={menuItems} isDisabled={isEditing} className='w-40'>
        <div data-slot='chat-trigger' data-active={isActive} className={sidebarRowClass(isEditing)}>
          {/* D8: the status column leads every chat row and is never hidden —
              hover reveals the actions at the far end, and renaming keeps it. */}
          <StatusMark data-slot='chat-status' facts={facts} />
          {isEditing ? (
            <InlineTextEditor
              value={chat.name}
              variant='ghost'
              shouldStartEditing
              className={sidebarRowEditorClass}
              onSave={onRenameSave}
              onEditingChange={onEditingChange}
            />
          ) : (
            <>
              {project.slugs ? (
                <SidebarRowLink
                  to={projectChatUrl(project.slugs, chat.id)}
                  name={chat.name}
                  sentence={facts.sentence}
                  descriptionId={`chat-status-${chat.id}`}
                  isActive={isActive}
                  isPending={isPending}
                />
              ) : (
                <span className='fade-label flex-1 text-muted-foreground'>{chat.name}</span>
              )}
              <SidebarRowActions>
                <SidebarRowMenuButton name={chat.name} items={menuItems} className='w-40' />
              </SidebarRowActions>
            </>
          )}
        </div>
      </SidebarRowContextMenu>
    </SidebarMenuSubItem>
  );
}
