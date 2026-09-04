import { Wrench } from 'lucide-react';
import type { ToolInvocation } from '@taucad/chat';
import { toolName } from '@taucad/chat/constants';
import {
  ChatToolCard,
  ChatToolCardHeader,
  ChatToolCardIcon,
  ChatToolCardTitle,
} from '#components/chat/chat-tool-card.js';
import { ChatToolDescription } from '#components/chat/chat-tool-text.js';
import { ChatToolLabel } from '#components/chat/chat-tool-label.js';
import { ChatToolError } from '#components/chat/chat-tool-error.js';
import { FileLink } from '#components/files/file-link.js';

type UseSkillInvocation = ToolInvocation<typeof toolName.useSkill>;

function LoadingSkillRow({ skillName }: { readonly skillName: string }): React.JSX.Element {
  return (
    <ChatToolCard variant='minimal' status='loading' isCollapsible={false}>
      <ChatToolCardHeader>
        <ChatToolCardIcon icon={Wrench} />
        <ChatToolCardTitle>
          <ChatToolLabel verb='Reading'>
            <ChatToolDescription>{skillName ? `${skillName} skill…` : 'skill…'}</ChatToolDescription>
          </ChatToolLabel>
        </ChatToolCardTitle>
      </ChatToolCardHeader>
    </ChatToolCard>
  );
}

function ReadSkillRow({
  skillName,
  skillPath,
  source,
}: {
  readonly skillName: string;
  readonly skillPath?: string;
  readonly source: string;
}): React.JSX.Element {
  const label = skillPath ? <FileLink path={skillPath}>{skillName}</FileLink> : <span>{skillName}</span>;

  return (
    <ChatToolCard variant='minimal' status='ready' isCollapsible={false}>
      <ChatToolCardHeader>
        <ChatToolCardIcon icon={Wrench} />
        <ChatToolCardTitle>
          <ChatToolLabel verb='Read'>
            <ChatToolDescription>
              {label}
              {' skill'}
              {source === 'system' && <span> system</span>}
            </ChatToolDescription>
          </ChatToolLabel>
        </ChatToolCardTitle>
      </ChatToolCardHeader>
    </ChatToolCard>
  );
}

export function ChatMessageToolUseSkill({ part }: { readonly part: UseSkillInvocation }): React.JSX.Element {
  switch (part.state) {
    case 'input-streaming':
    case 'input-available': {
      return <LoadingSkillRow skillName={part.input?.skillName ?? ''} />;
    }

    case 'output-available': {
      return (
        <ReadSkillRow skillName={part.output.skillName} skillPath={part.output.skillPath} source={part.output.source} />
      );
    }

    case 'output-error': {
      return <ChatToolError errorText={part.errorText} icon={Wrench} noun='skill read' />;
    }

    case 'approval-requested':
    case 'approval-responded':
    case 'output-denied': {
      throw new Error(`Unexpected ${toolName.useSkill} state: ${part.state}`);
    }
  }
}
