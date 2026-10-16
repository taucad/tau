import { FilePlus } from 'lucide-react';
import type { ToolInvocation } from '@taucad/chat';
import { toolName } from '@taucad/chat/constants';
import { CollapsibleFileOperation } from '#components/chat/chat-tool-file-operation.js';
import { ChatToolError } from '#components/chat/chat-tool-error.js';

export function ChatMessageToolCreateFile({
  part,
}: {
  readonly part: ToolInvocation<typeof toolName.createFile>;
}): React.JSX.Element {
  switch (part.state) {
    case 'input-streaming':
    case 'input-available': {
      const { input } = part;
      const targetFile = input?.targetFile ?? '';
      const content = input?.content ?? '';

      return (
        <CollapsibleFileOperation
          operation='create'
          targetFile={targetFile}
          toolStatus={part.state}
          content={content}
        />
      );
    }

    case 'output-available': {
      const { input, output } = part;
      const { targetFile, content } = input;
      const { diffStats } = output;

      return (
        <CollapsibleFileOperation
          operation='create'
          enableFileLink
          targetFile={targetFile}
          toolStatus={part.state}
          content={content}
          diffStats={diffStats}
        />
      );
    }

    case 'output-error': {
      return <ChatToolError errorText={part.errorText} icon={FilePlus} noun='file creation' />;
    }

    case 'approval-requested':
    case 'approval-responded':
    case 'output-denied': {
      throw new Error(`Unexpected ${toolName.createFile} state: ${part.state}`);
    }
  }
}
