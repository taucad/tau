import { Trash2, X } from 'lucide-react';
import type { ToolInvocation } from '@taucad/chat';
import { toolName } from '@taucad/chat/constants';
import { Tooltip, TooltipTrigger, TooltipContent } from '#components/ui/tooltip.js';
import { ChatToolError } from '#components/chat/chat-tool-error.js';
import { ChatToolDescription } from '#components/chat/chat-tool-text.js';
import { ChatToolLabel } from '#components/chat/chat-tool-label.js';
import {
  ChatToolCard,
  ChatToolCardHeader,
  ChatToolCardIcon,
  ChatToolCardTitle,
} from '#components/chat/chat-tool-card.js';

function getFilename(path: string): string {
  const parts = path.split('/');
  return parts.at(-1) ?? path;
}

type DeleteFileHeaderProps = {
  readonly targetFile: string;
  readonly isStreaming: boolean;
};

function DeleteFileHeader({ targetFile, isStreaming }: DeleteFileHeaderProps): React.JSX.Element {
  const filename = getFilename(targetFile);
  const hasPath = targetFile !== filename;
  const verb = isStreaming ? 'Deleting' : 'Deleted';

  return (
    <ChatToolCard variant='card' status={isStreaming ? 'loading' : 'ready'} isCollapsible={false}>
      <ChatToolCardHeader>
        <ChatToolCardIcon icon={Trash2} />
        <ChatToolCardTitle>
          <ChatToolLabel verb={verb}>
            <ChatToolDescription>
              {hasPath ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className='min-w-0 truncate'>{filename}</span>
                  </TooltipTrigger>
                  <TooltipContent side='top' align='start'>
                    {targetFile}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <span className='min-w-0 truncate'>{targetFile}</span>
              )}
            </ChatToolDescription>
          </ChatToolLabel>
        </ChatToolCardTitle>
      </ChatToolCardHeader>
    </ChatToolCard>
  );
}

export function ChatMessageToolDeleteFile({
  part,
}: {
  readonly part: ToolInvocation<typeof toolName.deleteFile>;
}): React.JSX.Element {
  switch (part.state) {
    case 'input-streaming':
    case 'input-available': {
      const targetFile = part.input?.targetFile ?? 'file';
      return <DeleteFileHeader targetFile={targetFile} isStreaming />;
    }

    case 'output-available': {
      return <DeleteFileHeader targetFile={part.input.targetFile} isStreaming={false} />;
    }

    case 'output-error': {
      return <ChatToolError errorText={part.errorText} icon={X} noun='file deletion' />;
    }

    case 'approval-requested':
    case 'approval-responded':
    case 'output-denied': {
      throw new Error(`Unexpected ${toolName.deleteFile} state: ${part.state}`);
    }
  }
}
