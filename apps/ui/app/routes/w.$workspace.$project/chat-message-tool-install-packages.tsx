import { CircleAlert, Package, XCircle } from 'lucide-react';
import type { ToolInvocation } from '@taucad/chat';
import { toolName } from '@taucad/chat/constants';
import {
  ChatToolCard,
  ChatToolCardContent,
  ChatToolCardHeader,
  ChatToolCardIcon,
  ChatToolCardList,
  ChatToolCardListItem,
  ChatToolCardTitle,
} from '#components/chat/chat-tool-card.js';
import { ChatToolDescription } from '#components/chat/chat-tool-text.js';
import { ChatToolLabel } from '#components/chat/chat-tool-label.js';
import { ChatToolError } from '#components/chat/chat-tool-error.js';

type InstallPackagesInvocation = ToolInvocation<typeof toolName.installPackages>;
type InstallPackagesOutput = Extract<InstallPackagesInvocation, { state: 'output-available' }>['output'];

const plural = (count: number, noun: string): string => `${String(count)} ${noun}${count === 1 ? '' : 's'}`;

/** "· 2 packages · 1 issue": what is locked now and what needs attention. */
const summaryOf = ({ packages, issues }: InstallPackagesOutput): string =>
  [`· ${plural(packages.length, 'package')}`, ...(issues.length > 0 ? [plural(issues.length, 'issue')] : [])].join(
    ' · ',
  );

/**
 * The transcript's record of one `install_packages` call.
 *
 * Folded on its summary line when everything installed; open when an issue
 * needs the reader, since a refusal means nothing was written.
 *
 * @param props - The tool part this message carries.
 * @param props.part - The `install_packages` invocation, in whatever state it is in.
 * @returns The card.
 */
export function ChatMessageToolInstallPackages({
  part,
}: {
  readonly part: InstallPackagesInvocation;
}): React.JSX.Element {
  switch (part.state) {
    case 'input-streaming':
    case 'input-available': {
      return (
        <ChatToolCard variant='minimal' status='loading' isCollapsible={false}>
          <ChatToolCardHeader>
            <ChatToolCardIcon icon={Package} />
            <ChatToolCardTitle>
              <ChatToolLabel verb='Installing'>
                <ChatToolDescription>packages…</ChatToolDescription>
              </ChatToolLabel>
            </ChatToolCardTitle>
          </ChatToolCardHeader>
        </ChatToolCard>
      );
    }

    case 'output-available': {
      const { packages, issues } = part.output;
      return (
        <ChatToolCard
          variant='minimal'
          status={issues.length > 0 ? 'warning' : 'ready'}
          isDefaultOpen={issues.length > 0}
        >
          <ChatToolCardHeader>
            <ChatToolCardIcon icon={Package} />
            <ChatToolCardTitle>
              <ChatToolLabel verb='Packages'>
                <ChatToolDescription>{summaryOf(part.output)}</ChatToolDescription>
              </ChatToolLabel>
            </ChatToolCardTitle>
          </ChatToolCardHeader>
          <ChatToolCardContent>
            <ChatToolCardList maxHeight='max-h-48'>
              {issues.map((issue) => (
                <ChatToolCardListItem
                  key={`${issue.code}:${issue.name ?? issue.message}`}
                  icon={CircleAlert}
                  iconClassName='text-warning'
                >
                  <span className='sr-only'>{issue.code}: </span>
                  {issue.message}
                </ChatToolCardListItem>
              ))}
              {packages.map((item) => (
                <ChatToolCardListItem key={item.path} icon={Package}>
                  <span className='font-mono'>{item.name}</span> {item.version}
                </ChatToolCardListItem>
              ))}
            </ChatToolCardList>
          </ChatToolCardContent>
        </ChatToolCard>
      );
    }

    case 'output-error': {
      return <ChatToolError errorText={part.errorText} icon={XCircle} noun='package install' />;
    }

    case 'approval-requested':
    case 'approval-responded':
    case 'output-denied': {
      throw new Error(`Unexpected ${toolName.installPackages} state: ${part.state}`);
    }
  }
}
