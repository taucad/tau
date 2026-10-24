import { useSelector } from '@xstate/react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@taucad/ui/components/hover-card';
import { cn } from '@taucad/ui/utils/cn';
import { StatusMark } from '#components/nav/status-mark.js';
import { PaneButton } from '@taucad/workbench-panes/components/pane-button';
import { useProject } from '#hooks/use-project.js';
import { useRevisions, useWithRestoreTargets } from '#hooks/use-revisions.js';
import type { RevisionCard } from '#hooks/use-revisions.js';
import type { RevisionStatusProjection } from '@taucad/revisions';
import { useRevisionCommands } from '#hooks/use-revision-status.js';
import { useChatRecords } from '#hooks/use-chat-records.js';
import { formatRelativeTime } from '#utils/date.utils.js';
import { backupByDefaultNotice, useTauCloudEligibility, useTauCloudIntent } from '#hooks/use-cloud-projects.js';
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

/** The focused chat's other branch, and the verb that moves the workbench onto it. @public */
export type FollowChat = Readonly<{
  /** The focused chat, as History's card names it. */
  chatName: string;
  /** The line the focused chat works on. */
  branch: string;
  /** Pin the workbench to the chat's checkout. */
  follow: () => void;
}>;

/**
 * Whether the focused chat works on a branch other than the workbench's, read
 * once here so the desktop trigger and the phone status line cannot disagree
 * about when *Follow chat* applies (I4).
 *
 * @param status - The revision status projection, from the caller's {@link useRevisionFacts}.
 * @param branch - The line the workbench is on.
 * @returns The chat's branch and the verb, or `undefined` while the chat is where the workbench is.
 * @public
 */
export function useFollowChat(
  status: RevisionStatusProjection | undefined,
  branch: string | undefined,
): FollowChat | undefined {
  const commands = useRevisionCommands();
  const { editorRef, projectId } = useProject();
  const { chats } = useChatRecords(projectId);
  const focusedChatId = useSelector(editorRef, (state) => state.context.focusedChatId);
  if (status === undefined || focusedChatId === undefined) {
    return undefined;
  }
  const focusedChat = chats.find((chat) => chat.id === focusedChatId);
  const chatCheckoutId = focusedChat?.checkoutId;
  const chatBranch =
    chatCheckoutId === undefined ? undefined : status.branches.find((row) => row.checkoutId === chatCheckoutId)?.name;
  if (focusedChat === undefined || chatCheckoutId === undefined || chatBranch === undefined || chatBranch === branch) {
    return undefined;
  }
  return {
    chatName: focusedChat.name,
    branch: chatBranch,
    follow: () => {
      commands.pinTo(chatCheckoutId);
    },
  };
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
  const { projectId } = useProject();
  const { openPanel } = useProjectWorkspace();
  const followChat = useFollowChat(status, branch);
  /* Before the first save of a project backed up by default, the pane's own line (D19). */
  const pendingBackup =
    backupByDefaultNotice(useTauCloudIntent(projectId), useTauCloudEligibility(), status?.remote) === 'pending';

  /* Before the root answers there is nothing to be on; an *unborn* branch is a
   * different thing, and the trigger says *Setting up* rather than vanishing
   * at the moment a person most wants to know (review R10). */
  if (status === undefined) {
    return undefined;
  }

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
            backup={
              backupCopy(status.sync, where, status.remote) ??
              (pendingBackup ? 'Backs up to Tau Cloud automatically after your first save' : 'No backup connected')
            }
            chat={followChat === undefined ? undefined : `${followChat.chatName} · on ${followChat.branch}`}
            revisions={revisions}
          />
        </HoverCardContent>
      </HoverCard>
      {followChat === undefined ? null : (
        <PaneButton
          size='label'
          aria-label={`Follow chat, which is working on ${followChat.branch}`}
          tooltip={`Switch the workbench to ${followChat.branch}`}
          onClick={followChat.follow}
        >
          Follow chat
        </PaneButton>
      )}
    </span>
  );
}
