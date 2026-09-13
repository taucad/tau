import { Files, File } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ToolInvocation } from '@taucad/chat';
import { toolName } from '@taucad/chat/constants';
import {
  ChatToolCard,
  ChatToolCardHeader,
  ChatToolCardIcon,
  ChatToolCardTitle,
  ChatToolCardContent,
  ChatToolCardList,
  ChatToolCardListItem,
} from '#components/chat/chat-tool-card.js';
import { ChatToolDescription } from '#components/chat/chat-tool-text.js';
import { ChatToolLabel } from '#components/chat/chat-tool-label.js';
import { ChatToolError } from '#components/chat/chat-tool-error.js';

export function ChatMessageToolGlobSearch({
  part,
}: {
  readonly part: ToolInvocation<typeof toolName.globSearch>;
}): ReactNode {
  switch (part.state) {
    case 'input-streaming':
    case 'input-available': {
      const { input } = part;
      const pattern = input?.pattern ?? 'pattern';

      return (
        <ChatToolCard variant='minimal' status='loading' isDefaultOpen={false}>
          <ChatToolCardHeader>
            <ChatToolCardIcon icon={Files} />
            <ChatToolCardTitle>
              <ChatToolLabel verb='Searching for'>
                <ChatToolDescription>
                  <span className='font-mono'>{pattern}</span>...
                </ChatToolDescription>
              </ChatToolLabel>
            </ChatToolCardTitle>
          </ChatToolCardHeader>
        </ChatToolCard>
      );
    }

    case 'output-available': {
      const { input, output } = part;
      const { pattern } = input;
      const { files, totalFiles } = output;

      return (
        <ChatToolCard variant='minimal' status='ready' isDefaultOpen={false}>
          <ChatToolCardHeader>
            <ChatToolCardIcon icon={Files} />
            <ChatToolCardTitle>
              <ChatToolLabel verb='Searched'>
                <ChatToolDescription>
                  <span className='font-mono'>{pattern}</span> ({totalFiles} file{totalFiles === 1 ? '' : 's'})
                </ChatToolDescription>
              </ChatToolLabel>
            </ChatToolCardTitle>
          </ChatToolCardHeader>
          <ChatToolCardContent>
            <ChatToolCardList maxHeight='max-h-32'>
              {files.length === 0 ? (
                <ChatToolCardListItem className='text-muted-foreground/70 italic'>No files found</ChatToolCardListItem>
              ) : (
                <>
                  {files.slice(0, 10).map((file) => (
                    <ChatToolCardListItem key={file} icon={File}>
                      <span className='font-mono'>{file}</span>
                    </ChatToolCardListItem>
                  ))}
                  {files.length > 10 ? (
                    <ChatToolCardListItem className='text-muted-foreground/70 italic'>
                      ... {files.length - 10} more files
                    </ChatToolCardListItem>
                  ) : undefined}
                </>
              )}
            </ChatToolCardList>
          </ChatToolCardContent>
        </ChatToolCard>
      );
    }

    case 'output-error': {
      return <ChatToolError errorText={part.errorText} icon={Files} noun='file search' />;
    }

    case 'approval-requested':
    case 'approval-responded':
    case 'output-denied': {
      throw new Error(`Unexpected ${toolName.globSearch} state: ${part.state}`);
    }
  }
}
