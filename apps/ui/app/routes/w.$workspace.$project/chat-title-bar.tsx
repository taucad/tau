import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { useSelector } from '@xstate/react';
import { SquarePen } from 'lucide-react';
import { Separator } from '@taucad/ui/components/separator';
import { ChatHistorySettings } from '#routes/w.$workspace.$project/chat-history-settings.js';
import { useActiveChatNaming } from '#routes/w.$workspace.$project/use-active-chat-naming.js';
import { useOpenNewChat } from '#routes/w.$workspace.$project/use-open-new-chat.js';
import { useProject } from '#hooks/use-project.js';
import { useChats } from '#hooks/use-chats.js';
import { useKeybinding } from '#hooks/use-keyboard.js';
import type { KeyCombination } from '#utils/keys.utils.js';
import { FloatingPanelButtonGroup, FloatingPanelContentHeaderActions } from '#components/ui/floating-panel.js';
import { PaneButton } from '#components/ui/pane-button.js';
import { useSidebar } from '#components/ui/sidebar.js';
import { cn } from '@taucad/ui/utils/cn';

const newChatKeyCombination = {
  key: 'c',
  ctrlKey: true,
  shiftKey: true,
} satisfies KeyCombination;

/** Current-session title and status; chat collection navigation lives in the sidebar. */
export function ChatTitleBar({ closeButton }: { readonly closeButton?: ReactNode }): React.JSX.Element {
  const { projectRef, editorRef, projectId } = useProject();
  const { isMobile, open: isSidebarOpen } = useSidebar();
  const { chats, applyGeneratedChatName, isLoading: isChatsLoading } = useChats(projectId);
  const { openNewChat, isReady: canOpenNewChat } = useOpenNewChat();
  const activeChatId = useSelector(editorRef, (state) => state.context.focusedChatId);
  const isProjectLoading = useSelector(projectRef, (state) => state.context.isLoading);
  const activeChat = useMemo(() => chats.find((chat) => chat.id === activeChatId), [activeChatId, chats]);
  const isGeneratingName = useActiveChatNaming({
    activeChat,
    isProjectLoading,
    isChatsLoading,
    applyGeneratedChatName,
  });

  const createAndOpenChat = async (): Promise<void> => openNewChat();

  useKeybinding(newChatKeyCombination, createAndOpenChat);

  return (
    <>
      {!isMobile && !isSidebarOpen ? (
        <>
          <PaneButton aria-label='New chat' disabled={!canOpenNewChat} tooltip='New chat' onClick={createAndOpenChat}>
            <SquarePen aria-hidden className='size-3.5 translate-y-[0.5px]' />
          </PaneButton>
          <span className='mx-2 h-4'>
            <Separator orientation='vertical' />
          </span>
        </>
      ) : null}
      <div
        className={cn('flex min-w-0 flex-1 items-center gap-2 [app-region:drag]', isGeneratingName && 'animate-pulse')}
      >
        <span className='truncate text-foreground'>{activeChat?.name ?? 'Chat'}</span>
      </div>
      <FloatingPanelContentHeaderActions>
        <FloatingPanelButtonGroup>
          <ChatHistorySettings />
        </FloatingPanelButtonGroup>
        {closeButton}
      </FloatingPanelContentHeaderActions>
    </>
  );
}
