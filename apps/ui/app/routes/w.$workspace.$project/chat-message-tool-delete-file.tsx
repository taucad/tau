import { X } from 'lucide-react';
import type { ToolInvocation } from '@taucad/chat';
import { toolName } from '@taucad/chat/constants';
import { ChatToolError } from '#components/chat/chat-tool-error.js';
import { CollapsibleFileOperation } from '#components/chat/chat-tool-file-operation.js';

export function ChatMessageToolDeleteFile({
  part,
}: {
  readonly part: ToolInvocation<typeof toolName.deleteFile>;
}): React.JSX.Element {
  switch (part.state) {
    case 'input-streaming':
    case 'input-available': {
      const targetFile = part.input?.targetFile ?? '';
      return <CollapsibleFileOperation operation='delete' targetFile={targetFile} toolStatus={part.state} />;
    }

    case 'output-available': {
      return (
        <CollapsibleFileOperation
          operation='delete'
          targetFile={part.input.targetFile}
          toolStatus={part.state}
          diffStats={part.output.diffStats}
        />
      );
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
