import { Wrench } from 'lucide-react';
import type { ToolInvocation } from '@taucad/chat';
import { toolName } from '@taucad/chat/constants';
import { systemSkillBundles } from '@taucad/skills/resources';
import type { FileProvenance } from '@taucad/types';
import { Badge } from '@taucad/ui/components/badge';
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

/**
 * The bytes the tool read are the system skill bundle's, so the row links with that
 * provenance: the click opens the read-only tab and reveals the composed row,
 * and the catalog — not this component — owns the word on the badge.
 *
 * `identity` is the overlay unit key `skill:<slug>@<version>#<fingerprint>` the
 * composed view mints for the same bundle, so an override can be keyed on it
 * (a1 review R2); it names the bundle the pane serves today, which the notice
 * below is what flags when the chat read an older one.
 */
const systemSkillProvenance = (skillName: string): FileProvenance => {
  const bundle = systemSkillBundles.find((candidate) => candidate.slug === skillName);
  return {
    source: 'system-skills',
    versioned: false,
    agentAccess: 'read-only',
    ...(bundle === undefined ? {} : { identity: `skill:${bundle.slug}@${bundle.version}#${bundle.fingerprint}` }),
  };
};

/** Whether the bundle shipped today differs from the one this chat read. */
const hasBundleChanged = (skillName: string, fingerprint: string | undefined): boolean => {
  if (fingerprint === undefined) {
    return false;
  }
  const current = systemSkillBundles.find((bundle) => bundle.slug === skillName)?.fingerprint;
  return current !== undefined && current !== fingerprint;
};

function ReadSkillRow({
  skillName,
  skillPath,
  source,
  fingerprint,
}: {
  readonly skillName: string;
  readonly skillPath?: string;
  readonly source: string;
  readonly fingerprint?: string;
}): React.JSX.Element {
  const isSystem = source === 'system';
  const label = skillPath ? (
    <FileLink path={skillPath} provenance={isSystem ? systemSkillProvenance(skillName) : undefined}>
      {skillName}
    </FileLink>
  ) : (
    <span>{skillName}</span>
  );

  return (
    <ChatToolCard variant='minimal' status='ready' isCollapsible={false}>
      <ChatToolCardHeader>
        <ChatToolCardIcon icon={Wrench} />
        <ChatToolCardTitle>
          <ChatToolLabel verb='Read'>
            <ChatToolDescription>
              {label}
              {' skill'}
              {isSystem && (
                <Badge variant='secondary' className='ml-1.5 px-1.5 py-0 font-normal'>
                  system
                </Badge>
              )}
              {isSystem && hasBundleChanged(skillName, fingerprint) && (
                <span className='ml-1.5 text-muted-foreground'>This bundle changed since the chat read it</span>
              )}
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
        <ReadSkillRow
          skillName={part.output.skillName}
          skillPath={part.output.skillPath}
          source={part.output.source}
          fingerprint={part.output.fingerprint}
        />
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
