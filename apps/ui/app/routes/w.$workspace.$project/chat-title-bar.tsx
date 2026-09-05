import { useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useSelector } from '@xstate/react';
import { SquarePen } from 'lucide-react';
import { Separator } from '@taucad/ui/components/separator';
import { ChatHistorySettings } from '#routes/w.$workspace.$project/chat-history-settings.js';
import { useActiveChatNaming } from '#routes/w.$workspace.$project/use-active-chat-naming.js';
import { useProject } from '#hooks/use-project.js';
import { useChats } from '#hooks/use-chats.js';
import { useKeybinding } from '#hooks/use-keyboard.js';
import { useProjectSlugs } from '#hooks/use-project-slug-route.js';
import type { KeyCombination } from '#utils/keys.utils.js';
import { projectChatUrl } from '#utils/project-url.utils.js';
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
  const { chats, createChat, applyGeneratedChatName, isLoading: isChatsLoading } = useChats(projectId);
  const navigate = useNavigate();
  const slugs = useProjectSlugs(projectId);
  const activeChatId = useSelector(editorRef, (state) => state.context.focusedChatId);
  const isProjectLoading = useSelector(projectRef, (state) => state.context.isLoading);
  const activeChat = useMemo(() => chats.find((chat) => chat.id === activeChatId), [activeChatId, chats]);
  const isGeneratingName = useActiveChatNaming({
    activeChat,
    isProjectLoading,
    isChatsLoading,
    applyGeneratedChatName,
  });

  const createAndOpenChat = useCallback(async (): Promise<void> => {
    if (slugs.status !== 'resolved') {
      return;
    }
    const chat = await createChat({ name: 'New chat', messages: [] });
    await navigate(projectChatUrl(slugs.value, chat.id), { state: { focusChatComposer: true } });
  }, [createChat, navigate, slugs]);

  useKeybinding(newChatKeyCombination, createAndOpenChat);

  return (
    <>
      {!isMobile && !isSidebarOpen ? (
        <>
          <PaneButton
            aria-label='New chat'
            disabled={slugs.status !== 'resolved'}
            tooltip='New chat'
            onClick={createAndOpenChat}
          >
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
