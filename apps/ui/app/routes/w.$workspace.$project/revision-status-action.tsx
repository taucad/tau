import { useSelector } from '@xstate/react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@taucad/ui/components/hover-card';
import { cn } from '@taucad/ui/utils/cn';
import { StatusMark } from '#components/nav/status-mark.js';
import { PaneButton } from '#components/ui/pane-button.js';
import { useProject } from '#hooks/use-project.js';
import { useRevisions, useWithRestoreTargets } from '#hooks/use-revisions.js';
import type { RevisionCard } from '#hooks/use-revisions.js';
import { useRevisionCommands } from '#hooks/use-revision-status.js';
import { useChats } from '#hooks/use-chats.js';
import { formatRelativeTime } from '#utils/date.utils.js';
import { useProjectWorkspace } from '#routes/w.$workspace.$project/project-workspace-context.js';
import {
  backupCopy,
  revisionAccessibleName,
  revisionName,
  revisionTitle,
  useRevisionFacts,
} from '#routes/w.$workspace.$project/revision-vocabulary.js';
import type { RevisionFacts, RevisionWhere } from '#routes/w.$workspace.$project/revision-vocabulary.js';

/**
 * What the card shows: where you are, the one status sentence, the facts
 * behind it, the last three revisions, and where the verb lives. No controls:
 * a hover card cannot hold interactive content, and the trigger already opens
 * the pane that owns every verb.
 */
function RevisionHoverCard({
  where,
  facts,
  backup,
  chat,
  revisions,
}: {
  readonly where: RevisionWhere;
  readonly facts: RevisionFacts;
  readonly backup: string;
  readonly chat: string | undefined;
  /** The line's history; the card lists the last three, and a restore names what it restored from it. */
  readonly revisions: readonly RevisionCard[];
}): React.JSX.Element {
  const head = revisionName(where.head);
  const recent = revisions.slice(0, 3);
  const named = useWithRestoreTargets(revisions);
  return (
    <div data-slot='revision-card' className='flex flex-col text-xs'>
      <div className='flex items-start gap-2 px-3 pt-3'>
        <facts.icon aria-hidden className={cn('mt-0.5 size-3.5 shrink-0', facts.tone || 'text-muted-foreground')} />
        <span className='min-w-0 flex-1 text-sm font-medium break-all text-foreground'>
          {where.branch ?? 'Setting up'}
        </span>
        {head === undefined ? null : (
          <span className='mt-0.5 font-mono text-muted-foreground tabular-nums'>{head}</span>
        )}
      </div>
      <div className='flex min-h-6 items-center px-3 pb-2 text-foreground'>
        {facts.mark === 'none' ? null : (
          <StatusMark facts={{ mark: facts.mark, sentence: facts.sentence }} className='-ml-1.5' />
        )}
        <span>{facts.sentence}</span>
      </div>
      <dl className='grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-t px-3 py-2'>
        <dt className='text-muted-foreground'>Backup</dt>
        <dd className='break-words'>{backup}</dd>
        {chat === undefined ? null : (
          <>
            <dt className='text-muted-foreground'>Chat</dt>
            <dd className='truncate'>{chat}</dd>
          </>
        )}
      </dl>
      {recent.length === 0 ? null : (
        <ol aria-label='Recent revisions' className='flex flex-col gap-1 border-t px-3 py-2'>
          {recent.map((revision) => (
            <li key={revision.revisionId} className='flex items-center gap-2'>
              <span className='w-12 shrink-0 font-mono text-muted-foreground tabular-nums'>
                {revisionName(revision.n)}
              </span>
              <span className='min-w-0 flex-1 truncate'>{revisionTitle(revision, named)}</span>
              <span className='shrink-0 text-muted-foreground'>
                {formatRelativeTime(revision.createdAt, { short: true })}
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className='border-t px-3 py-2 text-muted-foreground'>Click to open Revisions</p>
    </div>
  );
}

/**
 * The workbench's checkout in the header (S29): `[glyph] main` at rest, where
 * one glyph says the most urgent thing about it. Hover or focus shows the card
 * after 300 ms and holds it 100 ms; click opens Revisions, which owns every
 * verb. Supersedes R33/C47 (`main · Rev N` in the row) for the header alone:
 * the revision is in the accessible name, the card and the pane, and the label
 * is always the line (RA2). A19 holds in
 * intent: the card names only the branch you are on and carries no verb.
 *
 * *Follow chat* stays a visible control beside it while the focused chat's
 * branch and the workbench's differ.
 *
 * @returns The trigger, or nothing before the project's root has answered.
 */
export function RevisionStatusAction(): React.JSX.Element | undefined {
  const { revisions } = useRevisions();
  const { where, facts, status } = useRevisionFacts();
  const { branch } = where;
  const commands = useRevisionCommands();
  const { editorRef, projectId } = useProject();
  const { chats } = useChats(projectId);
  const { openPanel } = useProjectWorkspace();
  const focusedChatId = useSelector(editorRef, (state) => state.context.focusedChatId);

  /* Before the root answers there is nothing to be on; an *unborn* branch is a
   * different thing, and the trigger says *Setting up* rather than vanishing
   * at the moment a person most wants to know (review R10). */
  if (status === undefined) {
    return undefined;
  }

  const focusedChat = chats.find((chat) => chat.id === focusedChatId);
  const chatCheckoutId = focusedChat?.checkoutId;
  const chatBranch =
    chatCheckoutId === undefined ? undefined : status.branches.find((row) => row.checkoutId === chatCheckoutId)?.name;
  const hasDiverged = chatBranch !== undefined && chatBranch !== branch;
  const label = branch ?? 'Setting up';

  return (
    <span className='flex items-center gap-1'>
      <HoverCard openDelay={300} closeDelay={100}>
        <HoverCardTrigger asChild>
          <PaneButton
            data-slot='revision-trigger'
            size='label'
            className='max-w-full'
            aria-label={revisionAccessibleName(where, facts.sentence)}
            onClick={() => {
              openPanel('revisions');
            }}
          >
            <facts.icon aria-hidden data-slot='revision-icon' className={cn('size-3.5', facts.tone)} />
            {/* Share and Export's weight and colour: the glyph carries the state, not the label. */}
            <span className='max-w-40 truncate'>{label}</span>
          </PaneButton>
        </HoverCardTrigger>
        <HoverCardContent align='end' className='w-72 p-0'>
          <RevisionHoverCard
            where={where}
            facts={facts}
            backup={backupCopy(status.sync, where.role) ?? 'No backup connected'}
            chat={hasDiverged && focusedChat !== undefined ? `${focusedChat.name} · on ${chatBranch}` : undefined}
            revisions={revisions}
          />
        </HoverCardContent>
      </HoverCard>
      {hasDiverged && focusedChatId !== undefined ? (
        <PaneButton
          size='label'
          aria-label={`Follow chat, which is working on ${chatBranch}`}
          tooltip={`Switch the workbench to ${chatBranch}`}
          onClick={() => {
            if (chatCheckoutId !== undefined) {
              commands.pinTo(chatCheckoutId);
            }
          }}
        >
          Follow chat
        </PaneButton>
      ) : null}
    </span>
  );
}
