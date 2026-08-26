import { Blocks } from 'lucide-react';
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
        <ChatToolCardIcon icon={Blocks} />
        <ChatToolCardTitle>
          <ChatToolLabel verb='Using skill'>
            <ChatToolDescription>{skillName}</ChatToolDescription>
          </ChatToolLabel>
        </ChatToolCardTitle>
      </ChatToolCardHeader>
    </ChatToolCard>
  );
}

function UsedSkillRow({
  skillName,
  skillPath,
  resourceUri,
  source,
}: {
  readonly skillName: string;
  readonly skillPath?: string;
  readonly resourceUri: string;
  readonly source: string;
}): React.JSX.Element {
  const label = skillPath ? <FileLink path={skillPath}>{skillName}</FileLink> : <span>{skillName}</span>;

  return (
    <ChatToolCard variant='minimal' status='ready' isCollapsible={false}>
      <ChatToolCardHeader>
        <ChatToolCardIcon icon={Blocks} />
        <ChatToolCardTitle>
          <ChatToolLabel verb='Used skill'>
            <ChatToolDescription>
              {label}
              <span className='text-muted-foreground'> {source}</span>
              {!skillPath && <span className='text-muted-foreground'> {resourceUri}</span>}
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
      return <LoadingSkillRow skillName={part.input?.skillName ?? 'skill'} />;
    }

    case 'output-available': {
      return (
        <UsedSkillRow
          skillName={part.output.skillName}
          skillPath={part.output.skillPath}
          resourceUri={part.output.resourceUri}
          source={part.output.source}
        />
      );
    }

    case 'output-error': {
      return <ChatToolError errorText={part.errorText} icon={Blocks} noun='skill use' />;
    }

    case 'approval-requested':
    case 'approval-responded':
    case 'output-denied': {
      throw new Error(`Unexpected ${toolName.useSkill} state: ${part.state}`);
    }
  }
}
