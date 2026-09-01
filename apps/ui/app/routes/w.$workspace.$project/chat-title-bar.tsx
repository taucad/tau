import { useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useSelector } from '@xstate/react';
import { AlertCircle } from 'lucide-react';
import { ChatHistorySettings } from '#routes/w.$workspace.$project/chat-history-settings.js';
import { useActiveChatNaming } from '#routes/w.$workspace.$project/use-active-chat-naming.js';
import { useProject } from '#hooks/use-project.js';
import { useChats } from '#hooks/use-chats.js';
import { useChatRpcStatus } from '#hooks/use-chat-rpc-socket.js';
import { useKeybinding } from '#hooks/use-keyboard.js';
import { useProjectSlugs } from '#hooks/use-project-slug-route.js';
import type { KeyCombination } from '#utils/keys.utils.js';
import { projectChatUrl } from '#utils/project-url.utils.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { FloatingPanelButtonGroup, FloatingPanelContentHeaderActions } from '#components/ui/floating-panel.js';
import { cn } from '@taucad/ui/utils/cn';

const newChatKeyCombination = {
  key: 'c',
  ctrlKey: true,
  shiftKey: true,
} satisfies KeyCombination;

/** Current-session title and status; chat collection navigation lives in the sidebar. */
export function ChatTitleBar({
  closeButton,
  onNewChat,
}: {
  readonly closeButton?: ReactNode;
  readonly onNewChat?: () => void;
}): React.JSX.Element {
  const { projectRef, editorRef, projectId } = useProject();
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
  const { status, error } = useChatRpcStatus();
  const isDisconnected = status === 'disconnected' || status === 'error';

  const createAndOpenChat = useCallback(async (): Promise<void> => {
    if (slugs.status !== 'resolved') {
      return;
    }
    const chat = await createChat({ name: 'New chat', messages: [] });
    await navigate(projectChatUrl(slugs.value, chat.id));
    onNewChat?.();
  }, [createChat, navigate, onNewChat, slugs]);

  useKeybinding(newChatKeyCombination, createAndOpenChat);

  return (
    <>
      <div className={cn('ml-0.5 flex min-w-0 flex-1 items-center gap-2', isGeneratingName && 'animate-pulse')}>
        <span className='truncate'>{activeChat?.name ?? 'Chat'}</span>
        {isDisconnected ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type='button'
                className='grid size-5 shrink-0 place-items-center rounded-sm text-warning focus-visible:ring-2 focus-visible:ring-ring'
                aria-label={`Chat connection ${status}`}
              >
                <AlertCircle aria-hidden className='size-3.5' />
              </button>
            </TooltipTrigger>
            <TooltipContent side='bottom'>
              <div className='text-xs'>
                <div className='font-medium'>Connection {status}</div>
                {error ? <div className='text-muted-foreground'>{error}</div> : null}
              </div>
            </TooltipContent>
          </Tooltip>
        ) : null}
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
