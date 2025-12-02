import { Plus, Pencil, Trash, History } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useChat } from '@ai-sdk/react';
import type { Chat, MyUIMessage } from '@taucad/chat';
import { useSelector } from '@xstate/react';
import { Button } from '#components/ui/button.js';
import { useBuild } from '#hooks/use-build.js';
import { useChatManager } from '#hooks/use-chat-manager.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { cn } from '#utils/ui.utils.js';
import { useChatConstants } from '#utils/chat.utils.js';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { formatRelativeTime } from '#utils/date.utils.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '#components/ui/dialog.js';
import { Input } from '#components/ui/input.js';
import { groupItemsByTimeHorizon } from '#utils/temporal.utils.js';
import type { TemporalGroup } from '#utils/temporal.utils.js';
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
  const { createChat, updateChat, deleteChat: deleteChatFromManager, getChatsForResource, getChat } = useChatManager();

  const isLoading = useSelector(buildRef, (state) => state.context.isLoading);
  const activeChatId = useSelector(buildRef, (state) => state.context.build?.lastChatId) ?? '';

  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | undefined>(undefined);
  const [groupedChats, setGroupedChats] = useState<Array<TemporalGroup<Chat>>>([]);
  const [isGeneratingName, setIsGeneratingName] = useState(false);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [chatToRename, setChatToRename] = useState<string | undefined>(undefined);
  const [newChatName, setNewChatName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Load chats for the current build
  const loadChats = useCallback(async () => {
    if (!buildId) {
      return;
    }

    const loadedChats = await getChatsForResource(buildId);
    setChats(loadedChats);
    setGroupedChats(groupItemsByTimeHorizon(loadedChats));

    // Update active chat
    if (activeChatId) {
      const active = loadedChats.find((chat) => chat.id === activeChatId);
      setActiveChat(active);
    }
  }, [buildId, getChatsForResource, activeChatId]);

  // Load chats on mount and when buildId changes
  useEffect(() => {
    void loadChats();
  }, [loadChats]);

  // Update active chat when activeChatId changes
  useEffect(() => {
    if (activeChatId && chats.length > 0) {
      const active = chats.find((chat) => chat.id === activeChatId);
      setActiveChat(active);
    }
  }, [activeChatId, chats]);

  const handleAddChat = useCallback(async () => {
    if (!buildId) {
      return;
    }

    const newChat = await createChat(buildId, {
      name: 'New chat',
      messages: [],
    });

    // Update local state
    setChats((previous) => [...previous, newChat]);
    setGroupedChats(groupItemsByTimeHorizon([...chats, newChat]));

    // Set as active chat
    setLastChatId(newChat.id);
    setActiveChat(newChat);
  }, [buildId, createChat, chats, setLastChatId]);

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

  // Generate name for new chats
  useEffect(() => {
    if (isLoading || !activeChat) {
      return;
    }

    // Check if this chat needs a name
    if (activeChat.name === 'New chat' && activeChat.messages[0]) {
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
  }, [activeChatId, activeChat, isLoading, sendMessage]);

  const handleUpdateChatName = useCallback(
    async (chatId: string, name: string) => {
      await updateChat(chatId, { name });

      // Update local state
      setChats((previous) => previous.map((chat) => (chat.id === chatId ? { ...chat, name } : chat)));

      // Refresh grouped chats
      const updatedChats = chats.map((chat) => (chat.id === chatId ? { ...chat, name } : chat));
      setGroupedChats(groupItemsByTimeHorizon(updatedChats));

      // Update active chat if it's the one being renamed
      if (activeChat?.id === chatId) {
        setActiveChat({ ...activeChat, name });
      }
    },
    [updateChat, chats, activeChat],
  );

  const handleRenameChat = (chatId: string, currentName: string) => {
    setChatToRename(chatId);
    setNewChatName(currentName);
    setIsRenameDialogOpen(true);
    // Focus the input field when the dialog opens
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 100);
  };

  const handleSaveRename = () => {
    if (chatToRename && newChatName.trim()) {
      void handleUpdateChatName(chatToRename, newChatName.trim());
      setIsRenameDialogOpen(false);
      setChatToRename(undefined);
    }
  };

  const handleDeleteChat = useCallback(
    async (chatId: string) => {
      await deleteChatFromManager(chatId);

      // Update local state
      const updatedChats = chats.filter((chat) => chat.id !== chatId);
      setChats(updatedChats);
      setGroupedChats(groupItemsByTimeHorizon(updatedChats));

      // If we deleted the active chat, switch to the most recent one
      if (activeChatId === chatId && updatedChats.length > 0) {
        const mostRecent = [...updatedChats].sort((a, b) => b.updatedAt - a.updatedAt)[0];
        if (mostRecent) {
          setLastChatId(mostRecent.id);
          setActiveChat(mostRecent);
        }
      } else if (updatedChats.length === 0) {
        setActiveChat(undefined);
      }
    },
    [deleteChatFromManager, chats, activeChatId, setLastChatId],
  );

  const handleSelectChat = useCallback(
    (chatId: string) => {
      setLastChatId(chatId);
      const selected = chats.find((chat) => chat.id === chatId);
      setActiveChat(selected);
    },
    [setLastChatId, chats],
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
  const getChatValue = (chat: Chat) => chat.id;

  // Suppress unused variable - getChat is available for future use
  void getChat;

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
