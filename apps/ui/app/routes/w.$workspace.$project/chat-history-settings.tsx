import { useCallback } from 'react';
import { Settings, Download } from 'lucide-react';
import { FloatingPanelMenuButton } from '#components/ui/floating-panel.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu.js';
import { useChatContext } from '#hooks/use-chat.js';
import { useChats } from '#hooks/use-chats.js';
import { useProject } from '#hooks/use-project.js';
import { downloadBlob } from '@taucad/utils/file';
import { serializeTranscript } from '#utils/chat.utils.js';
import { toSnakeCase } from '#utils/string.utils.js';

export function ChatHistorySettings(): React.ReactNode {
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
      <FloatingPanelMenuButton asChild tooltip='Chat settings' aria-label='Chat settings'>
        <DropdownMenuTrigger>
          <Settings className='size-4' />
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
        <DropdownMenuLabel>Export</DropdownMenuLabel>
        <DropdownMenuItem disabled={!chat || chat.messages.length === 0} onSelect={handleExport}>
          <Download />
          Export Transcript
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
