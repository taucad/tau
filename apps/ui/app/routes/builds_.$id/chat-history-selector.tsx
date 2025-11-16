import { Plus, Search, Pencil, Trash } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { Message } from '@ai-sdk/react';
import { useChat } from '@ai-sdk/react';
import type { Chat } from '@taucad/types';
import { useSelector } from '@xstate/react';
import { Button } from '#components/ui/button.js';
import { useBuild } from '#hooks/use-build.js';
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

const newChatKeyCombination = {
  key: 'c',
  ctrlKey: true,
  shiftKey: true,
} satisfies KeyCombination;

export function ChatHistorySelector(): ReactNode {
  const { buildRef, isLoading, addChat, setActiveChat, updateChatName, deleteChat } = useBuild();
  const build = useSelector(buildRef, (state) => state.context.build);
  const activeChatId = useSelector(buildRef, (state) => state.context.build?.lastChatId) ?? '';
  const activeChat = useSelector(buildRef, (state) =>
    state.context.build?.chats.find((chat) => chat.id === activeChatId),
  );
  const [isGeneratingName, setIsGeneratingName] = useState(false);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [chatToRename, setChatToRename] = useState<string | undefined>(undefined);
  const [newChatName, setNewChatName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAddChat = async () => {
    addChat();
  };

  const { formattedKeyCombination } = useKeydown(newChatKeyCombination, handleAddChat);

  const { append } = useChat({
    ...useChatConstants,
    credentials: 'include',
    onFinish(message) {
      if (!activeChatId) {
        return;
      }

      const textPart = message.parts?.find((part) => part.type === 'text');
      if (textPart) {
        updateChatName(activeChatId, textPart.text);
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
      const message = {
        ...activeChat.messages[0],
        model: 'name-generator',
        metadata: {
          toolChoice: 'none',
        },
      } as const satisfies Message;
      void append(message);
    }
  }, [activeChatId, activeChat, isLoading]);

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
      deleteChat(chatId);
    },
    [deleteChat],
  );

  // Group chats for the ComboBoxResponsive component
  const groupedChats = !isLoading && build?.chats ? groupItemsByTimeHorizon(build.chats) : [];

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

  return (
    <>
      <div className="flex h-7 w-full items-center justify-between">
        <div className="group min-w-0 flex-1">
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
                align: 'start',
                className: 'w-[300px]',
              }}
              onSelect={(chatId) => {
                setActiveChat(chatId);
              }}
            >
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  className={cn(
                    'h-7 w-full justify-between gap-2 truncate overflow-hidden rounded-sm text-left',
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
                  <Search className="size-4 shrink-0 md:opacity-0 md:group-hover:opacity-100" />
                </Button>
              </TooltipTrigger>
            </ComboBoxResponsive>
            <TooltipContent side="top">Search chats</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex-shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7 rounded-sm" onClick={handleAddChat}>
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
