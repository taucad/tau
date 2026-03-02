import { FilePlus } from 'lucide-react';
import type { ToolInvocation } from '@taucad/chat';
import { toolName } from '@taucad/chat/constants';
import { CollapsibleFileOperation } from '#components/chat/chat-tool-file-operation.js';
import { ChatToolError } from '#components/chat/chat-tool-error.js';
import { ChatMessagePlanCard } from '#routes/builds_.$id/chat-message-plan-card.js';
import { useFeature } from '#flags/use-feature.js';

export function ChatMessageToolCreateFile({
  part,
}: {
  readonly part: ToolInvocation<typeof toolName.createFile>;
}): React.JSX.Element {
  const planModeEnabled = useFeature('planMode');

  switch (part.state) {
    case 'input-streaming':
    case 'input-available': {
      const { input } = part;
      const targetFile = input?.targetFile ?? '';
      const content = input?.content ?? '';

      if (planModeEnabled && targetFile.endsWith('.plan.md')) {
        return <ChatMessagePlanCard targetFile={targetFile} content={content} status="loading" />;
      }

      return <CollapsibleFileOperation targetFile={targetFile} toolStatus={part.state} content={content} />;
    }

    case 'output-available': {
      const { input, output } = part;
      const { targetFile, content } = input;
      const { diffStats } = output;

      if (planModeEnabled && targetFile.endsWith('.plan.md')) {
        return <ChatMessagePlanCard targetFile={targetFile} content={content} status="ready" />;
      }

      return (
        <CollapsibleFileOperation
          enableFileLink
          targetFile={targetFile}
          toolStatus={part.state}
          content={content}
          diffStats={diffStats}
        />
      );
    }

    case 'output-error': {
      return <ChatToolError errorText={part.errorText} fallbackIcon={FilePlus} fallbackTitle="Failed to create file" />;
    }

    case 'approval-requested':
    case 'approval-responded':
    case 'output-denied': {
      throw new Error(`Unexpected ${toolName.createFile} state: ${part.state}`);
    }
  }
}
