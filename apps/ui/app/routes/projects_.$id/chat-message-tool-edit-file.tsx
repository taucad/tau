import { Pencil } from 'lucide-react';
import type { ToolInvocation } from '@taucad/chat';
import { toolName } from '@taucad/chat/constants';
import { CollapsibleFileOperation } from '#components/chat/chat-tool-file-operation.js';
import { CopyButton } from '#components/copy-button.js';
import { ChatToolError } from '#components/chat/chat-tool-error.js';
import {
  ChatToolCard,
  ChatToolCardHeader,
  ChatToolCardIcon,
  ChatToolCardTitle,
} from '#components/chat/chat-tool-card.js';
import { ChatToolDescription } from '#components/chat/chat-tool-text.js';
import { ChatToolLabel } from '#components/chat/chat-tool-label.js';
import { FileLink } from '#components/files/file-link.js';

export function ChatMessageToolFileEdit({
  part,
}: {
  readonly part: ToolInvocation<typeof toolName.editFile>;
}): React.JSX.Element {
  switch (part.state) {
    case 'input-streaming':
    case 'input-available': {
      const { input } = part;
      const { targetFile = '', codeEdit = '' } = input ?? {};

      return (
        <CollapsibleFileOperation
          targetFile={targetFile}
          toolStatus={part.state}
          content={codeEdit}
          pendingLabel='Editing file...'
        />
      );
    }

    case 'output-available': {
      const { input, output } = part;
      const { targetFile = '' } = input;
      const { diffStats } = output;

      const isNoOp = diffStats.linesAdded === 0 && diffStats.linesRemoved === 0;
      if (isNoOp) {
        return (
          <ChatToolCard variant='minimal' status='ready' isCollapsible={false}>
            <ChatToolCardHeader>
              <ChatToolCardIcon icon={Pencil} />
              <ChatToolCardTitle>
                <ChatToolLabel verb='Edit attempted, no changes'>
                  <ChatToolDescription>
                    <FileLink path={targetFile}>{targetFile}</FileLink>
                  </ChatToolDescription>
                </ChatToolLabel>
              </ChatToolCardTitle>
            </ChatToolCardHeader>
          </ChatToolCard>
        );
      }

      // Use the actual edited content for display
      const displayContent = diffStats.modifiedContent;

      return (
        <CollapsibleFileOperation
          enableFileLink
          targetFile={targetFile}
          toolStatus={part.state}
          content={displayContent}
          diffStats={diffStats}
          actions={
            <CopyButton
              size='xs'
              className='**:data-[slot=label]:hidden @xs/code:**:data-[slot=label]:flex'
              getText={() => displayContent}
            />
          }
        />
      );
    }

    case 'output-error': {
      return <ChatToolError errorText={part.errorText} icon={Pencil} noun='file edit' />;
    }

    case 'approval-requested':
    case 'approval-responded':
    case 'output-denied': {
      throw new Error(`Unexpected ${toolName.editFile} state: ${part.state}`);
    }
  }
}
