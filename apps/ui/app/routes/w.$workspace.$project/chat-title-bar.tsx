import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { SquarePen } from 'lucide-react';
import { useSelector } from '@xstate/react';
import { cn } from '@taucad/ui/utils/cn';
import { ChatHistorySettings } from '#routes/w.$workspace.$project/chat-history-settings.js';
import { useActiveChatNaming } from '#routes/w.$workspace.$project/use-active-chat-naming.js';
import { useOpenNewChat } from '#routes/w.$workspace.$project/use-open-new-chat.js';
import { useChats } from '#hooks/use-chats.js';
import { useKeybinding } from '#hooks/use-keyboard.js';
import { useProject } from '#hooks/use-project.js';
import type { KeyCombination } from '#utils/keys.utils.js';
import { InlineTextEditor } from '#components/inline-text-editor.js';
import { sidebarRowEditorClass } from '#components/nav/sidebar-row.js';
import { FloatingPanelButtonGroup, FloatingPanelContentHeaderActions } from '#components/ui/floating-panel.js';
import { PaneButton } from '#components/ui/pane-button.js';
import { useSidebar } from '#components/ui/sidebar.js';
import { ChatLaneToggle } from '#routes/w.$workspace.$project/chat-lane-toggle.js';
import { useWorkspaceLanes } from '#routes/w.$workspace.$project/project-workspace-context.js';

const newChatKeyCombination = {
  key: 'c',
  ctrlKey: true,
  shiftKey: true,
} satisfies KeyCombination;

/**
 * The chat pane's one header row: the active chat's name, renamed in place the
 * way a sidebar row is, with the chat menu at the end. On desktop the row opens
 * with the chat lane toggle, on the pixel it holds in the viewer's tab bar
 * while the lane is closed, so it replaces a generic close control; mobile has
 * no lanes and keeps `closeButton`. Chat collection navigation lives in the
 * sidebar; with the sidebar collapsed "New chat" follows the toggle.
 */
export function ChatTitleBar({ closeButton }: { readonly closeButton?: ReactNode }): React.JSX.Element {
  const { isMobile, open: isSidebarOpen } = useSidebar();
  // One toggle in the document at a time: the viewer's tab bar holds it while the lane is hidden.
  const { chat: isChatVisible } = useWorkspaceLanes();
  const { openNewChat, isReady: canOpenNewChat } = useOpenNewChat();
  const { editorRef, projectRef, projectId } = useProject();
  const activeChatId = useSelector(editorRef, (state) => state.context.focusedChatId);
  const isProjectLoading = useSelector(projectRef, (state) => state.context.isLoading);
  const { chats, applyGeneratedChatName, updateChatName, isLoading: isChatsLoading } = useChats(projectId);
  const activeChat = useMemo(() => chats.find((chat) => chat.id === activeChatId), [chats, activeChatId]);
  const isGeneratingName = useActiveChatNaming({
    activeChat,
    isProjectLoading,
    isChatsLoading,
    applyGeneratedChatName,
  });
  const [isRenaming, setIsRenaming] = useState(false);
  const name = activeChat?.name ?? 'Chat';

  const createAndOpenChat = async (): Promise<void> => openNewChat();

  useKeybinding(newChatKeyCombination, createAndOpenChat);

  const startRename = (): void => {
    if (activeChat) {
      setIsRenaming(true);
    }
  };

  return (
    <>
      {!isMobile && isChatVisible ? <ChatLaneToggle place='lane' /> : null}
      {!isMobile && !isSidebarOpen ? (
        <PaneButton aria-label='New chat' disabled={!canOpenNewChat} tooltip='New chat' onClick={createAndOpenChat}>
          <SquarePen aria-hidden className='size-3.5 translate-y-[0.5px]' />
        </PaneButton>
      ) : null}
      {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- the double-click is a
          pointer shortcut for the menu's Rename item, which stays the keyboard route. */}
      <div
        className={cn(
          'flex min-w-0 flex-1 items-center self-stretch',
          // The editor draws no outline of its own (the sidebar's row does the same).
          isRenaming && 'rounded-sm focus-outline',
        )}
        onDoubleClick={isRenaming ? undefined : startRename}
      >
        {isRenaming && activeChat ? (
          <InlineTextEditor
            value={activeChat.name}
            variant='ghost'
            shouldStartEditing
            ariaLabel='Chat name'
            // A field inside the desktop drag region cannot be typed into or selected.
            className={cn(sidebarRowEditorClass, '[app-region:no-drag]')}
            onSave={async (next) => {
              await updateChatName(activeChat.id, next);
            }}
            onEditingChange={(isEditing) => {
              if (!isEditing) {
                setIsRenaming(false);
              }
            }}
          />
        ) : (
          <span className='fade-label flex-1 text-sm font-medium'>
            {/* The text, not its box, leaves the drag region: a double-click on a macOS drag
                region zooms the window, and the rest of the row still drags it. */}
            <span
              className={cn('text-foreground [app-region:no-drag]', isGeneratingName && 'animate-pulse')}
              aria-busy={isGeneratingName}
            >
              {name}
            </span>
          </span>
        )}
      </div>
      <FloatingPanelContentHeaderActions>
        <FloatingPanelButtonGroup>
          <ChatHistorySettings onRename={startRename} />
        </FloatingPanelButtonGroup>
        {isMobile ? closeButton : null}
      </FloatingPanelContentHeaderActions>
    </>
  );
}
