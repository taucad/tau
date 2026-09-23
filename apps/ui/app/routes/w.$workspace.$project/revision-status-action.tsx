import { useSelector } from '@xstate/react';
import { CircleAlert, CircleDashed, CloudAlert, FileDiff, GitMerge, History, Rewind } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { RevisionStatusProjection } from '@taucad/revisions';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@taucad/ui/components/hover-card';
import { cn } from '@taucad/ui/utils/cn';
import { StatusMark } from '#components/nav/status-mark.js';
import { PaneButton } from '#components/ui/pane-button.js';
import type { SidebarMark } from '#hooks/use-sidebar-status.js';
import { useProject } from '#hooks/use-project.js';
import { useRevisions } from '#hooks/use-revisions.js';
import type { RevisionCard } from '#hooks/use-revisions.js';
import { useRevisionCommands, useRevisionStatus } from '#hooks/use-revision-status.js';
import { useChats } from '#hooks/use-chats.js';
import { formatRelativeTime } from '#utils/date.utils.js';
import { useProjectWorkspace } from '#routes/w.$workspace.$project/project-workspace-context.js';
import { syncCopy } from '#routes/w.$workspace.$project/revision-sync-region.js';

/** What the trigger draws for one state: one glyph in one tone, the mark it stands for, and the sentence. */
export type RevisionFacts = Readonly<{
  icon: LucideIcon;
  tone: string;
  mark: SidebarMark;
  /** The card's status line and the accessible name's last clause. */
  sentence: string;
}>;

/** Where the checkout is, as the trigger names it. */
export type RevisionWhere = Readonly<{
  branch: string | undefined;
  /** The revision the files are at. */
  head: number | undefined;
  /** The branch's latest revision, only while the files are at an older one. */
  latest: number | undefined;
  isDirty: boolean;
}>;

const operationWords: Record<NonNullable<RevisionStatusProjection['branchVerb']['operation']>, string> = {
  switch: 'Switching',
  merge: 'Merging',
  discard: 'Discarding',
  create: 'Creating',
  rename: 'Renaming',
};

/** Backup refusals only the pane can repair; the rest ask the person for something. */
const failedBackupReasons: ReadonlySet<string> = new Set(['rejected', 'forbidden', 'notFound', 'unknown']);

const revisionName = (n: number | undefined): string | undefined => (n === undefined ? undefined : `Rev ${String(n)}`);

const backupAsks: Partial<Record<string, string>> = {
  unauthorized: 'Sign in',
  quota: 'Over your plan',
  notEntitled: 'Backup is a Pro feature',
};

/** Failed, then needs you: the two tiers that interrupt. */
const interruptingFacts = (status: RevisionStatusProjection, where: RevisionWhere): RevisionFacts | undefined => {
  const { sync } = status;
  // `attention` counts conflicts too, and a conflict saved everything it was asked to (review R5).
  if (status.attention - status.conflicts.length > 0) {
    return { icon: CircleAlert, tone: 'text-destructive', mark: 'failed', sentence: 'Save not confirmed' };
  }
  if (sync.state === 'failed' && failedBackupReasons.has(sync.reason ?? 'unknown')) {
    return { icon: CircleAlert, tone: 'text-destructive', mark: 'failed', sentence: 'Backup failed' };
  }
  if (status.conflicts.length > 0 || sync.state === 'conflicted') {
    const branch = status.conflicts[0]?.branch ?? where.branch;
    return {
      icon: GitMerge,
      tone: 'text-warning',
      mark: 'attention',
      sentence: branch === undefined ? 'Needs your decision' : `Needs your decision · both sides changed ${branch}`,
    };
  }
  const ask = sync.state === 'failed' ? backupAsks[sync.reason ?? 'unknown'] : undefined;
  return ask === undefined
    ? undefined
    : { icon: CloudAlert, tone: 'text-warning', mark: 'attention', sentence: `Not backed up · ${ask}` };
};

/** Work the person started, while it runs. */
const runningSentence = (status: RevisionStatusProjection, where: RevisionWhere): string | undefined => {
  if (status.minting) {
    return where.branch === undefined ? 'Setting up history' : 'Saving…';
  }
  if (status.restore.busy) {
    const target = revisionName(status.restore.revisionNumber);
    return `Restoring${target === undefined ? '' : ` ${target}`}…`;
  }
  const { busy, operation, branch } = status.branchVerb;
  return busy && operation !== undefined
    ? `${operationWords[operation]}${branch === undefined ? '' : ` ${branch}`}…`
    : undefined;
};

/** At rest: what the files are. */
const restingFacts = (status: RevisionStatusProjection, where: RevisionWhere): RevisionFacts => {
  if (where.latest !== undefined) {
    return {
      icon: Rewind,
      tone: 'text-information',
      mark: 'none',
      sentence: `Viewing ${revisionName(where.head) ?? 'an older revision'} · ${where.branch ?? 'the branch'} is at ${revisionName(where.latest) ?? 'a later one'}`,
    };
  }
  if (where.isDirty) {
    const since = revisionName(where.head);
    return {
      icon: FileDiff,
      tone: 'text-warning',
      mark: 'none',
      sentence: since === undefined ? 'Not saved yet' : `Modified since ${since}`,
    };
  }
  if (where.head === undefined) {
    return { icon: History, tone: '', mark: 'none', sentence: 'Nothing saved yet' };
  }
  const backup = syncCopy(status.sync);
  return {
    icon: History,
    tone: '',
    mark: 'none',
    sentence: backup === undefined ? 'Saved on this device' : `Saved · ${backup}`,
  };
};

/**
 * The one glyph and sentence for a checkout (the swap icon, section 6).
 *
 * Most urgent first — failed, then needs you, then in flight — and otherwise
 * the glyph says what the files are: at a revision, modified since one, or
 * showing an older one. Backup transfer, a queued or offline backup, and the
 * asks a pane dialog is already showing stay calm here: their owners are the
 * card and the pane.
 *
 * @param status - The revision status projection.
 * @param where - Where the checkout is.
 * @returns The glyph, its tone, the mark it stands for and the sentence.
 */
export const selectRevisionFacts = (status: RevisionStatusProjection, where: RevisionWhere): RevisionFacts => {
  const interrupting = interruptingFacts(status, where);
  if (interrupting !== undefined) {
    return interrupting;
  }
  const running = runningSentence(status, where);
  return running === undefined
    ? restingFacts(status, where)
    : { icon: CircleDashed, tone: '', mark: 'running', sentence: running };
};

/**
 * The trigger's name, which carries what the card shows at a glance, because
 * a hover card is not reachable by a screen reader.
 *
 * @param where - Where the checkout is.
 * @param sentence - The status sentence.
 * @returns `Open Revisions. You are on main, Rev 12. Modified since Rev 12.`
 */
export const revisionAccessibleName = (where: RevisionWhere, sentence: string): string => {
  const head = revisionName(where.head);
  const place =
    where.branch === undefined
      ? 'Setting up'
      : where.latest === undefined
        ? `You are on ${where.branch}${head === undefined ? '' : `, ${head}`}`
        : `You are on ${head ?? 'an older revision'} of ${where.branch}`;
  const status = sentence.replaceAll(' · ', ', ');
  return `Open Revisions. ${place}. ${status}${status.endsWith('…') ? '' : '.'}`;
};

/**
 * What the card shows: where you are, the one status sentence, the facts
 * behind it, the last three revisions, and where the verb lives. No controls:
 * a hover card cannot hold interactive content, and the trigger already opens
 * the pane that owns every verb.
 */
function RevisionHoverCard({
  where,
  facts,
  showing,
  backup,
  chat,
  recent,
}: {
  readonly where: RevisionWhere;
  readonly facts: RevisionFacts;
  readonly showing: RevisionCard | undefined;
  readonly backup: string;
  readonly chat: string | undefined;
  readonly recent: readonly RevisionCard[];
}): React.JSX.Element {
  const head = revisionName(where.head);
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
        {showing === undefined ? null : (
          <>
            <dt className='text-muted-foreground'>Showing</dt>
            <dd className='truncate'>
              <span className='font-mono tabular-nums'>{revisionName(showing.n)}</span> · {showing.summary}
            </dd>
          </>
        )}
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
              <span className='min-w-0 flex-1 truncate'>{revision.summary}</span>
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
 * becomes `Rev N` only while the files are at an older one. A19 holds in
 * intent: the card names only the branch you are on and carries no verb.
 *
 * *Follow chat* stays a visible control beside it while the focused chat's
 * branch and the workbench's differ.
 *
 * @returns The trigger, or nothing before the project's root has answered.
 */
export function RevisionStatusAction(): React.JSX.Element | undefined {
  const { branch, headRevisionId, revisions, isDirty, canReturnToLatest } = useRevisions();
  const status = useRevisionStatus();
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

  const head = revisions.find((revision) => revision.revisionId === headRevisionId);
  const where: RevisionWhere = {
    branch,
    head: head?.n,
    latest: canReturnToLatest ? revisions[0]?.n : undefined,
    isDirty,
  };
  const facts = selectRevisionFacts(status, where);
  const focusedChat = chats.find((chat) => chat.id === focusedChatId);
  const chatCheckoutId = focusedChat?.checkoutId;
  const chatBranch =
    chatCheckoutId === undefined ? undefined : status.branches.find((row) => row.checkoutId === chatCheckoutId)?.name;
  const hasDiverged = chatBranch !== undefined && chatBranch !== branch;
  const label = where.latest === undefined ? (branch ?? 'Setting up') : (revisionName(where.head) ?? 'Older revision');

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
            showing={where.latest === undefined ? undefined : head}
            backup={syncCopy(status.sync) ?? 'No backup connected'}
            chat={hasDiverged && focusedChat !== undefined ? `${focusedChat.name} · on ${chatBranch}` : undefined}
            recent={revisions.slice(0, 3)}
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
