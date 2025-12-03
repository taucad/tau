import { Plus, Pencil, Trash, History } from 'lucide-react';
import { useState, useRef, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useChat } from '@ai-sdk/react';
import type { Chat, MyUIMessage } from '@taucad/chat';
import { useSelector } from '@xstate/react';
import { Button } from '#components/ui/button.js';
import { useBuild } from '#hooks/use-build.js';
import { useChats } from '#hooks/use-chats.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { cn } from '#utils/ui.utils.js';
import { useChatConstants } from '#utils/chat.utils.js';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { formatRelativeTime } from '#utils/date.utils.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '#components/ui/dialog.js';
import { Input } from '#components/ui/input.js';
import { groupItemsByTimeHorizon } from '#utils/temporal.utils.js';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import { useKeydown } from '#hooks/use-keydown.js';
import type { KeyCombination } from '#utils/keys.utils.js';
import { FloatingPanelContentHeaderActions } from '#components/ui/floating-panel.js';

const newChatKeyCombination = {
  key: 'c',
  ctrlKey: true,
  shiftKey: true,
} satisfies KeyCombination;

export function ChatHistorySelector(): ReactNode {
  const { buildRef, buildId, setLastChatId } = useBuild();
  const { chats, createChat, updateChatName, deleteChat, isLoading: isChatsLoading } = useChats(buildId);

  const isBuildLoading = useSelector(buildRef, (state) => state.context.isLoading);
  const activeChatId = useSelector(buildRef, (state) => state.context.build?.lastChatId) ?? '';

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
    setLastChatId(newChat.id);
  }, [createChat, setLastChatId]);

  const { formattedKeyCombination } = useKeydown(newChatKeyCombination, handleAddChat);

  const { sendMessage } = useChat({
    ...useChatConstants,
    onFinish({ message }) {
      if (!activeChatId) {
        return;
      }

      const textPart = message.parts.find((part) => part.type === 'text');
      if (textPart) {
        void handleUpdateChatName(activeChatId, textPart.text);
        setIsGeneratingName(false);
      }
    },
  });

  // Generate name for new chats when activeChat changes and has messages but default name
  const previousActiveChatIdRef = useRef<string | undefined>(undefined);
  if (
    activeChat &&
    !isBuildLoading &&
    !isChatsLoading &&
    activeChat.name === 'New chat' &&
    activeChat.messages[0] &&
    !isGeneratingName &&
    previousActiveChatIdRef.current !== activeChatId
  ) {
    previousActiveChatIdRef.current = activeChatId;
    setIsGeneratingName(true);

    // Create and send message for name generation
    const nameGenMessage = {
      ...activeChat.messages[0],
      metadata: {
        model: 'name-generator',
      },
    } as const satisfies MyUIMessage;
    void sendMessage(nameGenMessage);
  }

  const handleUpdateChatName = useCallback(
    async (chatId: string, name: string) => {
      await updateChatName(chatId, name);
    },
    [updateChatName],
  );

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

      // If we deleted the active chat, switch to the most recent one
      if (activeChatId === chatId && chats.length > 1) {
        const remainingChats = chats.filter((chat) => chat.id !== chatId);
        const mostRecent = [...remainingChats].sort((a, b) => b.updatedAt - a.updatedAt)[0];
        if (mostRecent) {
          setLastChatId(mostRecent.id);
        }
      }
    },
    [deleteChat, chats, activeChatId, setLastChatId],
  );

  const handleSelectChat = useCallback(
    (chatId: string) => {
      setLastChatId(chatId);
    },
    [setLastChatId],
  );

  // Render function for each chat item
  const renderChatLabel = useCallback(
    (chat: Chat, selectedChat: Chat | undefined) => {
      const chatName = chat.name;
      const isActive = chat.id === selectedChat?.id;

      return (
        <div className="group flex w-full items-start justify-between">
          <div className="flex flex-col">
            <div
              className={cn(
                'font-medium',
                chat.messages.length === 0 && 'text-muted-foreground',
                isActive && 'text-primary',
              )}
            >
              {chatName}
            </div>
            <div className="text-xs text-muted-foreground">
              {chat.messages.length} {chat.messages.length === 1 ? 'message' : 'messages'} ·{' '}
              {formatRelativeTime(chat.updatedAt)}
            </div>
          </div>
          <div className="flex gap-1 md:opacity-0 md:group-hover:opacity-100">
            <Button
              variant="ghost"
              size="icon"
              className="hover:bg-neutral/10 max-md:bg-neutral/10 md:size-6"
              onClick={(event) => {
                event.stopPropagation();
                handleRenameChat(chat.id, chatName);
              }}
            >
              <Pencil className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="hover:bg-destructive/10 max-md:bg-destructive/10 md:size-6"
              onClick={(event) => {
                event.stopPropagation();
                void handleDeleteChat(chat.id);
              }}
            >
              <Trash className="size-3" />
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
      <div className={cn('wrap w-full flex-1 truncate', isGeneratingName && 'animate-pulse')}>{activeChat?.name}</div>
      <FloatingPanelContentHeaderActions className="h-7.75">
        <Tooltip>
          <ComboBoxResponsive
            groupedItems={groupedChats}
            renderLabel={renderChatLabel}
            getValue={getChatValue}
            defaultValue={activeChat}
            placeholder="Select a chat"
            searchPlaceHolder="Search chats..."
            title="Chats"
            description="Select a chat to continue the conversation."
            popoverProperties={{
              align: 'end',
              className: 'w-[300px]',
            }}
            onSelect={handleSelectChat}
          >
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-6 rounded-sm">
                <History className="size-4" />
              </Button>
            </TooltipTrigger>
          </ComboBoxResponsive>
          <TooltipContent side="top">Search chats</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-6 rounded-sm" onClick={handleAddChat}>
              <Plus className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            New chat{' '}
            <KeyShortcut variant="tooltip" className="ml-1">
              {formattedKeyCombination}
            </KeyShortcut>
          </TooltipContent>
        </Tooltip>
      </FloatingPanelContentHeaderActions>

      {/* Rename Dialog */}
      <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename Chat</DialogTitle>
          </DialogHeader>
          <div className="flex items-center space-y-2">
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
              <Button variant="neutral">Cancel</Button>
            </DialogClose>
            <Button onClick={handleSaveRename}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
