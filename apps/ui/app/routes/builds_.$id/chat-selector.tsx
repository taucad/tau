import { Plus, Search, Pencil, Trash } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { Message } from '@ai-sdk/react';
import { useChat } from '@ai-sdk/react';
import { Button } from '~/components/ui/button.js';
import { useBuild } from '~/hooks/use-build.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip.js';
import { cn } from '~/utils/ui.js';
import { useChatConstants } from '~/utils/chat.js';
import type { Chat } from '~/types/build.types.js';
import { ComboBoxResponsive } from '~/components/ui/combobox-responsive.js';
import { formatRelativeTime } from '~/utils/date.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '~/components/ui/dialog.js';
import { Input } from '~/components/ui/input.js';

// Group chats by date (Today, Yesterday, Older)
function groupChatsByDate(chats: Chat[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const todayChats: Chat[] = [];
  const yesterdayChats: Chat[] = [];
  const olderChats: Chat[] = [];

  for (const chat of chats) {
    const chatDate = new Date(chat.updatedAt);
    chatDate.setHours(0, 0, 0, 0);

    if (chatDate.getTime() === today.getTime()) {
      todayChats.push(chat);
    } else if (chatDate.getTime() === yesterday.getTime()) {
      yesterdayChats.push(chat);
    } else {
      olderChats.push(chat);
    }
  }

  // Sort each group by updatedAt timestamp (most recent first)
  const sortByMostRecent = (a: Chat, b: Chat) => b.updatedAt - a.updatedAt;

  todayChats.sort(sortByMostRecent);
  yesterdayChats.sort(sortByMostRecent);
  olderChats.sort(sortByMostRecent);

  const groups = [];

  if (todayChats.length > 0) {
    groups.push({ name: 'Today', items: todayChats });
  }

  if (yesterdayChats.length > 0) {
    groups.push({ name: 'Yesterday', items: yesterdayChats });
  }

  if (olderChats.length > 0) {
    groups.push({ name: 'Older', items: olderChats });
  }

  return groups;
}

export function ChatSelector(): ReactNode {
  const { build, isLoading, activeChat, activeChatId, addChat, setActiveChat, updateChatName, deleteChat } = useBuild();
  const [isGeneratingName, setIsGeneratingName] = useState(false);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [chatToRename, setChatToRename] = useState<string | undefined>(undefined);
  const [newChatName, setNewChatName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const { append } = useChat({
    ...useChatConstants,
    credentials: 'include',
    onFinish(message) {
      if (!activeChatId) return;

      const textPart = message.parts?.find((part) => part.type === 'text');
      if (textPart) {
        updateChatName(activeChatId, textPart.text);
        setIsGeneratingName(false);
      }
    },
  });

  // Generate name for new chats
  useEffect(() => {
    if (isLoading || !activeChat) return;

    // Check if this chat needs a name
    if (activeChat.name === 'New chat' && activeChat.messages[0]) {
      setIsGeneratingName(true);

      // Create and send message for name generation
      const message = {
        ...activeChat.messages[0],
        model: 'name-generator',
        metadata: {
          toolChoice: 'none',
        },
      } as const satisfies Message;
      void append(message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run on init
  }, [activeChatId, isLoading, updateChatName]);

  const handleAddChat = async () => {
    await addChat();
  };

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
      updateChatName(chatToRename, newChatName.trim());
      setIsRenameDialogOpen(false);
      setChatToRename(undefined);
    }
  };

  const handleDeleteChat = useCallback(
    async (chatId: string) => {
      await deleteChat(chatId);
    },
    [deleteChat],
  );

  // Group chats for the ComboBoxResponsive component
  const groupedChats = !isLoading && build?.chats ? groupChatsByDate(build.chats) : [];

  // Render function for each chat item
  const renderChatLabel = useCallback(
    (chat: Chat, selectedChat: Chat | undefined) => {
      const chatName = chat.name;
      const isActive = chat.id === selectedChat?.id;

      return (
        <div className="group flex w-full items-start justify-between">
          <div className="flex flex-col">
            <div className={cn('font-medium', isActive && 'text-primary')}>{chatName}</div>
            <div className="text-xs text-muted-foreground">
              {chat.messages.length} {chat.messages.length === 1 ? 'message' : 'messages'} ·{' '}
              {formatRelativeTime(chat.updatedAt)}
            </div>
          </div>
          <div className="flex opacity-0 group-hover:opacity-100">
            <Button
              variant="ghost"
              size="icon"
              className="size-6 hover:bg-neutral/10"
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
              className="size-6 hover:bg-destructive/10"
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

  return (
    <>
      <div className="flex h-7 w-full items-center justify-between">
        <div className="group min-w-0 flex-1 opacity-70 hover:opacity-100">
          <Tooltip>
            <ComboBoxResponsive
              groupedItems={groupedChats}
              renderLabel={renderChatLabel}
              getValue={getChatValue}
              defaultValue={activeChat}
              popoverContentClassName="w-[300px]"
              placeholder="Search chats"
              searchPlaceHolder="Search chats..."
              popoverProperties={{
                align: 'start',
              }}
              onSelect={(chatId) => {
                setActiveChat(chatId);
              }}
            >
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  className={cn(
                    'w-full justify-between gap-2 truncate overflow-hidden text-left',
                    isGeneratingName && 'animate-pulse',
                  )}
                >
                  <span className="truncate">
                    {isLoading
                      ? null
                      : !build?.chats || build.chats.length === 0
                        ? 'Initial design'
                        : (activeChat?.name ?? 'Select a chat')}
                  </span>
                  <Search className="size-4 shrink-0 opacity-0 group-hover:opacity-100" />
                </Button>
              </TooltipTrigger>
            </ComboBoxResponsive>
            <TooltipContent>Search chats</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex-shrink-0 opacity-70 hover:opacity-100">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={handleAddChat}>
                <Plus className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>New chat</TooltipContent>
          </Tooltip>
        </div>
      </div>

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
