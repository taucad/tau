import { Plus, Pencil, Trash, History, AlertCircle } from 'lucide-react';
import { useState, useRef, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { Chat } from '@taucad/chat';
import { useSelector } from '@xstate/react';
import { ChatHistorySettings } from '#routes/projects_.$id/chat-history-settings.js';
import { Button } from '#components/ui/button.js';
import { useProject } from '#hooks/use-project.js';
import { useChats } from '#hooks/use-chats.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { cn } from '#utils/ui.utils.js';
import { useProjectNameClient } from '#chat-clients/use-project-name-client.js';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { formatRelativeTime } from '#utils/date.utils.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '#components/ui/dialog.js';
import { Input } from '#components/ui/input.js';
import { groupItemsByTimeHorizon } from '#utils/temporal.utils.js';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import { useKeybinding } from '#hooks/use-keyboard.js';
import type { KeyCombination } from '#utils/keys.utils.js';
import {
  FloatingPanelContentHeaderActions,
  FloatingPanelMenuButton,
  FloatingPanelButtonGroup,
} from '#components/ui/floating-panel.js';
import { useChatRpcStatus } from '#hooks/use-chat-rpc-socket.js';
import { pickNextFocusedChatId } from '#routes/projects_.$id/chat-history-selector.utils.js';

const newChatKeyCombination = {
  key: 'c',
  ctrlKey: true,
  shiftKey: true,
} satisfies KeyCombination;

export function ChatHistorySelector({
  onNewChat,
  closeButton,
}: {
  readonly onNewChat?: () => void;
  readonly closeButton?: ReactNode;
}): ReactNode {
  const { projectRef, editorRef, projectId, setFocusedChatId } = useProject();
  const { chats, createChat, updateChatName, deleteChat, isLoading: isChatsLoading } = useChats(projectId);

  // Connection status for visual indicator
  const { status: connectionStatus, error: connectionError } = useChatRpcStatus();
  const isDisconnected = connectionStatus === 'disconnected' || connectionStatus === 'error';

  const isProjectLoading = useSelector(projectRef, (state) => state.context.isLoading);
  const activeChatId = useSelector(editorRef, (state) => state.context.focusedChatId) ?? '';

  // Derive activeChat and groupedChats from chats
  const activeChat = useMemo(() => chats.find((chat) => chat.id === activeChatId), [chats, activeChatId]);
  const groupedChats = useMemo(() => groupItemsByTimeHorizon(chats), [chats]);

  const [isGeneratingName, setIsGeneratingName] = useState(false);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [chatToRename, setChatToRename] = useState<string | undefined>(undefined);
  const [newChatName, setNewChatName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAddChat = useCallback(async () => {
    const newChat = await createChat({
      name: 'New chat',
      messages: [],
    });

    // Set as active chat
    setFocusedChatId(newChat.id);

    // Notify parent that a new chat was created
    onNewChat?.();
  }, [createChat, setFocusedChatId, onNewChat]);

  const { formattedKeyCombination } = useKeybinding(newChatKeyCombination, handleAddChat);

  const projectNameClient = useProjectNameClient();

  const handleUpdateChatName = useCallback(
    async (chatId: string, name: string) => {
      await updateChatName(chatId, name);
    },
    [updateChatName],
  );

  const generateAndApplyChatName = useCallback(
    async (chatId: string, promptText: string): Promise<void> => {
      try {
        const generatedName = await projectNameClient.generate(promptText);
        if (generatedName.trim().length > 0) {
          await handleUpdateChatName(chatId, generatedName.trim());
        }
      } catch (error) {
        console.error('Failed to generate chat name:', error);
      } finally {
        setIsGeneratingName(false);
      }
    },
    [projectNameClient, handleUpdateChatName],
  );

  // Generate a name for new chats when the active chat has its first user
  // message but still carries the default "New chat" label. Routes through
  // the `project_name` profile-scoped chat-client so the wire body's
  // `agent` block is `{ profile: 'project_name' }` — the controller's
  // `switch (body.agent.profile)` dispatches it to the name-generator
  // handler. No `metadata.model = 'name-generator'` stamping survives.
  const previousActiveChatIdRef = useRef<string | undefined>(undefined);
  if (
    activeChat &&
    !isProjectLoading &&
    !isChatsLoading &&
    activeChat.name === 'New chat' &&
    activeChat.messages[0] &&
    !isGeneratingName &&
    previousActiveChatIdRef.current !== activeChatId
  ) {
    previousActiveChatIdRef.current = activeChatId;
    setIsGeneratingName(true);

    const firstMessage = activeChat.messages[0];
    const firstText = firstMessage.parts.find((part) => part.type === 'text');
    const promptText = firstText?.type === 'text' ? firstText.text : '';
    void generateAndApplyChatName(activeChatId, promptText);
  }

  const handleRenameChat = (chatId: string, currentName: string): void => {
    setChatToRename(chatId);
    setNewChatName(currentName);
    setIsRenameDialogOpen(true);
    // Focus the input field when the dialog opens
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 100);
  };

  const handleSaveRename = (): void => {
    if (chatToRename && newChatName.trim()) {
      void handleUpdateChatName(chatToRename, newChatName.trim());
      setIsRenameDialogOpen(false);
      setChatToRename(undefined);
    }
  };

  const handleDeleteChat = useCallback(
    async (chatId: string) => {
      await deleteChat(chatId);

      // Re-focus only when the deleted chat was the focused one. The pure
      // helper handles the "no chats remaining" + tie-break cases — see
      // `chat-history-selector.utils.test.ts` for the policy.
      if (activeChatId === chatId) {
        const nextFocused = pickNextFocusedChatId(chats, chatId, activeChatId);
        setFocusedChatId(nextFocused);
      }
    },
    [deleteChat, chats, activeChatId, setFocusedChatId],
  );

  const handleSelectChat = useCallback(
    (chatId: string) => {
      setFocusedChatId(chatId);
    },
    [setFocusedChatId],
  );

  // Render function for each chat item
  const renderChatLabel = useCallback(
    (chat: Chat, selectedChat: Chat | undefined) => {
      const chatName = chat.name;
      const isActive = chat.id === selectedChat?.id;

      // Extract draft text if present
      const draftTextPart = chat.draft?.parts.find((part) => part.type === 'text');
      const draftText = draftTextPart?.type === 'text' ? draftTextPart.text : undefined;

      return (
        <div className='group flex w-full items-start justify-between'>
          <div className='flex min-w-0 flex-col'>
            <div
              className={cn(
                'font-medium',
                chat.messages.length === 0 && 'text-muted-foreground',
                isActive && 'text-primary',
              )}
            >
              {chatName}
            </div>
            {draftText ? (
              <div className='truncate text-xs text-muted-foreground italic'>
                <span className='font-medium'>Draft</span>: {draftText}
              </div>
            ) : null}
            {chat.error ? (
              <div className='flex items-center gap-1 text-xs text-warning'>
                <AlertCircle className='size-3 shrink-0 text-warning' />
                <span className='truncate'>{chat.error.title}</span>
              </div>
            ) : null}
            <div className='text-xs text-muted-foreground'>
              {chat.messages.length} {chat.messages.length === 1 ? 'message' : 'messages'} ·{' '}
              {formatRelativeTime(chat.updatedAt)}
            </div>
          </div>
          <div className='flex gap-1 md:opacity-0 md:group-hover:opacity-100'>
            <Button
              variant='ghost'
              size='icon'
              className='hover:bg-neutral/20! max-md:bg-neutral/20! md:size-6'
              onClick={(event) => {
                event.stopPropagation();
                handleRenameChat(chat.id, chatName);
              }}
            >
              <Pencil className='size-3' />
            </Button>
            <Button
              variant='ghost'
              size='icon'
              className='hover:bg-destructive/20! max-md:bg-destructive/20! md:size-6'
              onClick={(event) => {
                event.stopPropagation();
                void handleDeleteChat(chat.id);
              }}
            >
              <Trash className='size-3' />
            </Button>
          </div>
        </div>
      );
    },
    [handleDeleteChat],
  );

  // Get value function for the ComboBoxResponsive component
  const getChatValue = (chat: Chat): string => chat.id;

  return (
    <>
      <div className={cn('ml-0.5 flex flex-1 items-center gap-2 truncate', isGeneratingName && 'animate-pulse')}>
        <span className='truncate'>{activeChat?.name}</span>
        {isDisconnected ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className='relative flex size-2 shrink-0'>
                <span className='absolute inline-flex size-full animate-ping rounded-full bg-warning opacity-75' />
                <span className='relative inline-flex size-2 rounded-full bg-warning' />
              </span>
            </TooltipTrigger>
            <TooltipContent side='bottom'>
              <div className='text-xs'>
                <div className='font-medium'>Connection {connectionStatus}</div>
                {connectionError ? <div className='text-muted-foreground'>{connectionError}</div> : null}
              </div>
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <FloatingPanelContentHeaderActions>
        <FloatingPanelButtonGroup>
          <Tooltip>
            <ComboBoxResponsive
              groupedItems={groupedChats}
              renderLabel={renderChatLabel}
              getValue={getChatValue}
              value={activeChat}
              placeholder='Select a chat'
              searchPlaceHolder='Search chats...'
              title='Chats'
              description='Select a chat to continue the conversation.'
              popoverProperties={{
                align: 'end',
                className: 'w-[300px]',
              }}
              onSelect={handleSelectChat}
            >
              <TooltipTrigger asChild>
                <FloatingPanelMenuButton aria-label='Search chats'>
                  <History className='size-4' />
                </FloatingPanelMenuButton>
              </TooltipTrigger>
            </ComboBoxResponsive>
            <TooltipContent side='top'>Search chats</TooltipContent>
          </Tooltip>

          <FloatingPanelMenuButton
            aria-label='New chat'
            tooltip={
              <>
                New chat{' '}
                <KeyShortcut variant='tooltip' className='ml-1'>
                  {formattedKeyCombination}
                </KeyShortcut>
              </>
            }
            onClick={handleAddChat}
          >
            <Plus className='size-4' />
          </FloatingPanelMenuButton>
          <ChatHistorySettings />
        </FloatingPanelButtonGroup>
        {closeButton}
      </FloatingPanelContentHeaderActions>

      {/* Rename Dialog */}
      <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>Rename Chat</DialogTitle>
          </DialogHeader>
          <div className='flex items-center space-y-2'>
            <Input
              ref={inputRef}
              value={newChatName}
              onChange={(event) => {
                setNewChatName(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleSaveRename();
                }
              }}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant='neutral'>Cancel</Button>
            </DialogClose>
            <Button onClick={handleSaveRename}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
