import { Bot, FileDiff, FilePlus, FileX, History, XCircle } from 'lucide-react';
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
} from '@taucad/chat-ui/components/chat-tool-card';
import { ChatToolDescription } from '@taucad/chat-ui/components/chat-tool-text';
import { ChatToolLabel } from '@taucad/chat-ui/components/chat-tool-label';
import { ChatToolError } from '#components/chat/chat-tool-error.js';
import { useProject } from '#hooks/use-project.js';
import { revisionWho, useRevisionWhoContext } from '#lib/revision-actor.js';
import type { RevisionWhoEntry } from '#lib/revision-actor.js';
import {
  entryTime,
  entryTitle,
  needsDecision,
  versionLabel,
} from '#routes/w.$workspace.$project/revision-vocabulary.js';

/**
 * Who made a revision, from the same resolver History reads: never a model id or an account id (HQ4).
 *
 * @param props - The row's id, typed who and source.
 * @returns The who line, or nothing when the row shows none (Q2).
 */
function ActorName({ revisionId, who, source }: RevisionWhoEntry): React.JSX.Element | undefined {
  const context = useRevisionWhoContext(useProject({ enableNoContext: true })?.projectId);
  const { line, isAgent } = revisionWho({ revisionId, who, source }, context);
  return line === '' ? undefined : (
    <span data-slot='entry-who' className='inline-flex shrink-0 items-center gap-1'>
      {isAgent ? <Bot aria-hidden className='size-3' /> : null}
      {line}
    </span>
  );
}

type RevisionsInvocation = ToolInvocation<typeof toolName.history>;
type RevisionsOutput = Extract<RevisionsInvocation, { state: 'output-available' }>['output'];
type RevisionsAction = NonNullable<RevisionsInvocation['input']>['action'];

/** What the agent was doing, in the words the rest of the product uses (A18, I12). */
const verbs = {
  log: { pending: 'Reading', done: 'Read' },
  diff: { pending: 'Comparing', done: 'Compared' },
  describe: { pending: 'Checking', done: 'Checked' },
  conflict: { pending: 'Reading', done: 'Read' },
} as const satisfies Record<NonNullable<RevisionsAction>, { readonly pending: string; readonly done: string }>;

const nounFor = (action: RevisionsAction | undefined): string =>
  action === 'diff' ? 'what changed' : action === 'conflict' ? 'both sides of a conflict' : 'this project’s history';

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
 * An entry is named the way History names it, from the same functions: its
 * time (a version's `V3` in its place), its title, and who made it. Never a
 * number, a commit id or the engine's placeholder title (M6, M11). A changed
 * path is plain text rather than a file link: it is the path *that entry*
 * touched, which today's tree need not still hold.
 *
 * @param output - The tool's own answer.
 * @returns The rows, or `undefined` when this answer has none.
 */
const revisionRows = (output: RevisionsOutput): ReactNode => {
  const { branch, branches, changes, conflict, revisions } = output;

  if (conflict !== undefined) {
    return (
      <ChatToolCardList maxHeight='max-h-48'>
        {conflict.files.map((file) => (
          <ChatToolCardListItem key={file.path} icon={FileDiff}>
            <span className='min-w-0 truncate font-mono text-xs'>{file.path}</span>
          </ChatToolCardListItem>
        ))}
      </ChatToolCardList>
    );
  }

  if (revisions !== undefined) {
    return (
      <ChatToolCardList maxHeight='max-h-48'>
        {revisions.length === 0 ? (
          <ChatToolCardListItem className='text-muted-foreground/70 italic'>No history yet</ChatToolCardListItem>
        ) : (
          revisions.map((revision) => (
            <ChatToolCardListItem key={revision.revisionId} className='[&>span]:flex-1'>
              <span className='flex min-w-0 items-start gap-2'>
                <span className='w-16 shrink-0 font-mono tabular-nums'>
                  {revision.version === undefined ? (
                    entryTime(revision.createdAt)
                  ) : (
                    <span className='font-medium text-foreground'>{versionLabel(revision.version.number)}</span>
                  )}
                </span>
                <span className='min-w-0 flex-1 truncate text-foreground'>
                  {entryTitle(revision)}
                  {revision.conflicted ? ` · ${needsDecision}` : ''}
                </span>
                <ActorName revisionId={revision.revisionId} who={revision.who} source={revision.source} />
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
          <ChatToolCardListItem className='text-muted-foreground/70 italic'>No changes</ChatToolCardListItem>
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
            {candidate.name === branch ? (
              <span className='ml-1 text-xs text-muted-foreground/70'>current</span>
            ) : undefined}
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
    return output.revisions.length === 1 ? '1 entry' : `${String(output.revisions.length)} entries`;
  }
  if (output.changes !== undefined) {
    return countOf(output.changes.length, 'file');
  }
  if (output.branches !== undefined) {
    return countOf(output.branches.length, 'branch').replace('branchs', 'branches');
  }
  if (output.conflict !== undefined) {
    return countOf(output.conflict.files.length, 'file');
  }
  return '';
};

/**
 * The agent's read-only look at this project's history (S28, I10).
 *
 * Read-only by construction, and the card says so by having nothing to press:
 * an agent can see where the project is and what changed, and branching,
 * restoring and discarding stay a person's verbs in the History pane.
 *
 * @param props - The tool part this message carries.
 * @param props.part - The `history` invocation, in whatever state it is in.
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
       * one `tau history describe` prints and the pane renders (I3) — so the
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
      return <ChatToolError errorText={part.errorText} icon={XCircle} noun='history' />;
    }

    case 'approval-requested':
    case 'approval-responded':
    case 'output-denied': {
      throw new Error(`Unexpected ${toolName.history} state: ${part.state}`);
    }
  }
}
