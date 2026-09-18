import type { ReactNode } from 'react';
import { SquarePen } from 'lucide-react';
import { Separator } from '@taucad/ui/components/separator';
import { ChatHistorySettings } from '#routes/w.$workspace.$project/chat-history-settings.js';
import { useOpenNewChat } from '#routes/w.$workspace.$project/use-open-new-chat.js';
import { useKeybinding } from '#hooks/use-keyboard.js';
import type { KeyCombination } from '#utils/keys.utils.js';
import { FloatingPanelButtonGroup, FloatingPanelContentHeaderActions } from '#components/ui/floating-panel.js';
import { PaneButton } from '#components/ui/pane-button.js';
import { useSidebar } from '#components/ui/sidebar.js';

const newChatKeyCombination = {
  key: 'c',
  ctrlKey: true,
  shiftKey: true,
} satisfies KeyCombination;

/** Current-session title and status; chat collection navigation lives in the sidebar. */
export function ChatTitleBar({ closeButton }: { readonly closeButton?: ReactNode }): React.JSX.Element {
  const { isMobile, open: isSidebarOpen } = useSidebar();
  const { openNewChat, isReady: canOpenNewChat } = useOpenNewChat();

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
      <div className='min-w-0 flex-1 self-stretch [app-region:drag]' />
      <FloatingPanelContentHeaderActions>
        <FloatingPanelButtonGroup>
          <ChatHistorySettings />
        </FloatingPanelButtonGroup>
        {closeButton}
      </FloatingPanelContentHeaderActions>
    </>
  );
}
