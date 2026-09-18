import { useCallback } from 'react';
import { Download, EllipsisVertical, Pencil } from 'lucide-react';
import { FloatingPanelMenuButton } from '#components/ui/floating-panel.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import { useChatContext } from '#hooks/use-chat.js';
import { useChats } from '#hooks/use-chats.js';
import { useProject } from '#hooks/use-project.js';
import { ChatOptionsMeta } from '#routes/w.$workspace.$project/chat-options-meta.js';
import { downloadBlob } from '@taucad/utils/file';
import { serializeTranscript } from '#utils/chat.utils.js';
import { toSnakeCase } from '#utils/string.utils.js';

/**
 * The chat menu: rename, export, then the chat's activity, model and credits as
 * a read-only block.
 *
 * @param props - `onRename` opens the header's inline editor.
 * @returns The ⋯ trigger and its menu.
 */
export function ChatHistorySettings({ onRename }: { readonly onRename: () => void }): React.ReactNode {
  const { chat, activeChatId } = useChatContext();
  const { projectId } = useProject();
  const { chats } = useChats(projectId);
  const chatName = chats.find((c) => c.id === activeChatId)?.name ?? 'Chat Transcript';

  const handleExport = useCallback(() => {
    if (!chat) {
      return;
    }
    const transcript = serializeTranscript(chat.messages, chatName);
    const blob = new Blob([transcript], {
      type: 'text/markdown;charset=utf-8',
    });
    const timestamp = new Date().toISOString().slice(0, 16).replaceAll(':', '-');
    const snakeName = toSnakeCase(chatName) || 'chat_transcript';
    downloadBlob(blob, `${snakeName}_${timestamp}.md`);
  }, [chat?.messages, chat, chatName]);

  return (
    <DropdownMenu modal={false}>
      <FloatingPanelMenuButton asChild tooltip='Chat options' aria-label='Chat options'>
        <DropdownMenuTrigger>
          <EllipsisVertical className='size-4' />
        </DropdownMenuTrigger>
      </FloatingPanelMenuButton>
      <DropdownMenuContent
        align='end'
        side='bottom'
        className='w-56'
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
      >
        <DropdownMenuItem onSelect={onRename}>
          <Pencil />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!chat || chat.messages.length === 0} onSelect={handleExport}>
          <Download />
          Export transcript
        </DropdownMenuItem>
        <ChatOptionsMeta />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
