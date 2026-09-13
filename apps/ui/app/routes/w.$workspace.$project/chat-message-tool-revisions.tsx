import { FileDiff, FilePlus, FileX, History, XCircle } from 'lucide-react';
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

type RevisionsInvocation = ToolInvocation<typeof toolName.revisions>;
type RevisionsOutput = Extract<RevisionsInvocation, { state: 'output-available' }>['output'];
type RevisionsAction = NonNullable<RevisionsInvocation['input']>['action'];

/** What the agent was doing, in the words the rest of the product uses (A18, I12). */
const verbs = {
  log: { pending: 'Reading', done: 'Read' },
  diff: { pending: 'Comparing', done: 'Compared' },
  describe: { pending: 'Checking', done: 'Checked' },
} as const satisfies Record<NonNullable<RevisionsAction>, { readonly pending: string; readonly done: string }>;

const nounFor = (action: RevisionsAction | undefined): string =>
  action === 'diff' ? 'what changed' : 'this project’s history';

const changeIcons = {
  added: FilePlus,
  modified: FileDiff,
  deleted: FileX,
} as const;

const countOf = (count: number, singular: string): string =>
  `${String(count)} ${count === 1 ? singular : `${singular}s`}`;

/**
 * What one read answers with, under the header.
 *
 * A revision is named the way a person names it — `Rev 12`, a branch, whoever
 * made it — and never by a commit id, which is the same rule the pane and
 * `tau revisions` follow. A changed path is plain text rather than a file link:
 * it is the path *that revision* touched, which today's tree need not still
 * hold.
 *
 * @param output - The tool's own answer.
 * @returns The rows, or `undefined` when this answer has none.
 */
const revisionRows = (output: RevisionsOutput): ReactNode => {
  const { branch, branches, changes, revisions } = output;

  if (revisions !== undefined) {
    return (
      <ChatToolCardList maxHeight='max-h-48'>
        {revisions.length === 0 ? (
          <ChatToolCardListItem className='text-muted-foreground/70 italic'>(no revisions yet)</ChatToolCardListItem>
        ) : (
          revisions.map((revision) => (
            <ChatToolCardListItem key={revision.revisionId} icon={History}>
              <span className='flex min-w-0 flex-1 flex-col items-start gap-0.5 @xs:flex-row @xs:gap-2'>
                <span className='shrink-0 font-mono text-xs text-muted-foreground/70'>
                  {revision.revisionNumber === undefined ? 'merged in' : `Rev ${String(revision.revisionNumber)}`}
                </span>
                <span className='min-w-0 truncate'>
                  {revision.summary}
                  {revision.conflicted ? ' (needs resolution)' : ''}
                </span>
                <span className='shrink-0 text-xs text-muted-foreground/70'>{revision.actor}</span>
              </span>
            </ChatToolCardListItem>
          ))
        )}
      </ChatToolCardList>
    );
  }

  if (changes !== undefined) {
    return (
      <ChatToolCardList maxHeight='max-h-48'>
        {changes.length === 0 ? (
          <ChatToolCardListItem className='text-muted-foreground/70 italic'>(nothing changed)</ChatToolCardListItem>
        ) : (
          changes.map((change) => (
            <ChatToolCardListItem key={`${change.kind}-${change.path}`} icon={changeIcons[change.kind]}>
              <span className='min-w-0 truncate font-mono text-xs'>{change.path}</span>
              <span className='ml-1 text-xs text-muted-foreground/70'>({change.kind})</span>
            </ChatToolCardListItem>
          ))
        )}
      </ChatToolCardList>
    );
  }

  if (branches !== undefined) {
    return (
      <ChatToolCardList maxHeight='max-h-48'>
        {branches.map((candidate) => (
          <ChatToolCardListItem key={candidate.name} icon={History}>
            <span className='min-w-0 truncate'>{candidate.name}</span>
            <span className='ml-1 text-xs text-muted-foreground/70'>
              {candidate.name === branch
                ? `Rev ${String(candidate.revisionNumber)} · this one`
                : `Rev ${String(candidate.revisionNumber)}`}
            </span>
          </ChatToolCardListItem>
        ))}
      </ChatToolCardList>
    );
  }

  return undefined;
};

/**
 * How the card summarises the answer beside the `where` line.
 *
 * @param output - The tool's own answer.
 * @returns A short phrase, or an empty string when the count adds nothing.
 */
const summaryOf = (output: RevisionsOutput): string => {
  if (output.revisions !== undefined) {
    return countOf(output.revisions.length, 'revision');
  }
  if (output.changes !== undefined) {
    return countOf(output.changes.length, 'file');
  }
  if (output.branches !== undefined) {
    return countOf(output.branches.length, 'branch').replace('branchs', 'branches');
  }
  return '';
};

/**
 * The agent's read-only look at this project's history (S28, I10).
 *
 * Read-only by construction, and the card says so by having nothing to press:
 * an agent can see where the project is and what changed, and branching,
 * restoring and discarding stay a person's verbs in the Revisions pane.
 *
 * @param props - The tool part this message carries.
 * @param props.part - The `revisions` invocation, in whatever state it is in.
 * @returns The card.
 */
export function ChatMessageToolRevisions({ part }: { readonly part: RevisionsInvocation }): ReactNode {
  const action = part.input?.action;

  switch (part.state) {
    case 'input-streaming':
    case 'input-available': {
      return (
        <ChatToolCard variant='minimal' status='loading' isCollapsible={false}>
          <ChatToolCardHeader>
            <ChatToolCardIcon icon={History} />
            <ChatToolCardTitle>
              <ChatToolLabel verb={action === undefined ? 'Reading' : verbs[action].pending}>
                <ChatToolDescription>{nounFor(action)}...</ChatToolDescription>
              </ChatToolLabel>
            </ChatToolCardTitle>
          </ChatToolCardHeader>
        </ChatToolCard>
      );
    }

    case 'output-available': {
      const { output } = part;
      const summary = summaryOf(output);
      const rows = revisionRows(output);
      /* The `where` line is the whole point of the answer — one line, the same
       * one `tau revisions describe` prints and the pane renders (I3) — so the
       * header carries it whether or not there are rows to disclose. */
      const header = (
        <ChatToolCardHeader>
          <ChatToolCardIcon icon={History} />
          <ChatToolCardTitle>
            <ChatToolLabel verb={action === undefined ? 'Read' : verbs[action].done}>
              <ChatToolDescription>
                {output.where}
                {summary === '' ? '' : ` · ${summary}`}
              </ChatToolDescription>
            </ChatToolLabel>
          </ChatToolCardTitle>
        </ChatToolCardHeader>
      );

      if (rows === undefined) {
        return (
          <ChatToolCard variant='minimal' status='ready' isCollapsible={false}>
            {header}
          </ChatToolCard>
        );
      }

      return (
        <ChatToolCard variant='minimal' status='ready' isDefaultOpen={false}>
          {header}
          <ChatToolCardContent>{rows}</ChatToolCardContent>
        </ChatToolCard>
      );
    }

    case 'output-error': {
      return <ChatToolError errorText={part.errorText} icon={XCircle} noun='revision history' />;
    }

    case 'approval-requested':
    case 'approval-responded':
    case 'output-denied': {
      throw new Error(`Unexpected ${toolName.revisions} state: ${part.state}`);
    }
  }
}
