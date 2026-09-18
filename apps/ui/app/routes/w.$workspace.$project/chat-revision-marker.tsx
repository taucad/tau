import { memo, useCallback, useState, useSyncExternalStore } from 'react';
import { AlertCircle, Check, ChevronDown, ChevronRight, CircleDashed, RotateCcw } from 'lucide-react';
import { messageRole } from '@taucad/chat/constants';
import { Button } from '@taucad/ui/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import { cn } from '@taucad/ui/utils/cn';
import { FileRow, RevisionNameAction } from '#routes/w.$workspace.$project/revision-marker.js';
import {
  deriveTurnRevisionState,
  turnRevisionDetail,
  turnRevisionLabel,
} from '#routes/w.$workspace.$project/chat-turn-revision-state.js';
import type { TurnRevisionBase, TurnRevisionState } from '#routes/w.$workspace.$project/chat-turn-revision-state.js';
import { useTurnOutcomes } from '#routes/w.$workspace.$project/revision-outcomes.js';
import { requestRevisionReveal } from '#routes/w.$workspace.$project/revision-reveal.js';
import { useProjectWorkspace } from '#routes/w.$workspace.$project/project-workspace-context.js';
import { useRevisionChanges, useRevisions } from '#hooks/use-revisions.js';
import type { RevisionCard } from '#hooks/use-revisions.js';
import { useRestoreToPoint } from '#hooks/use-restore-to-point.js';
import { useRevisionCommands } from '#hooks/use-revision-status.js';
import { useChatActions, useChatContext, useChatRetrySnapshot, useChatSelector } from '#hooks/use-chat.js';
import { useChatSidebarStatus } from '#hooks/use-sidebar-status.js';
import { useProject } from '#hooks/use-project.js';
import { useOptionalChatWorkspaceAuthority } from '#providers/chat-workspace-authority-provider.js';
import {
  getHostTurnSettlement,
  subscribeHostTurnSettlements,
} from '#chat-clients/_internal/browser-agent-host-transport.js';

const noSubscription = (): (() => void) => () => undefined;

/** Tucked under the user bubble, like a status strip attached to a composer (R11, R12). */
const cardClassName = 'mx-2 -mt-3 rounded-b-lg border border-t-0 bg-muted/40 pt-3';

const stateKey = (state: TurnRevisionState | undefined): string =>
  state === undefined
    ? ''
    : `${state.kind}:${state.kind === 'saved' ? state.revision.revisionId : ''}:${turnRevisionLabel(state, 0)}`;

/**
 * The revision a turn recorded, never the base mint that opened it.
 *
 * A turn that starts dirty mints the pre-turn tree under its *own* turn id
 * (`turn.machine` D17) — on a new project, the scaffold — so the graph names a
 * card for a turn that has saved nothing yet. The turn's lease says which
 * revision that base is, and a starting point is not a result.
 *
 * @param card - The card the graph attached to this turn.
 * @param baseRevisionId - The revision this turn started from.
 * @returns The card, unless it is this turn's own base.
 */
const turnSave = (card: RevisionCard | undefined, baseRevisionId: string | undefined): RevisionCard | undefined =>
  card?.revisionId === baseRevisionId ? undefined : card;

/**
 * The revision facts for one request, read from their existing owners.
 *
 * @param userMessageId - The user message that anchors the turn.
 * @param isLatestTurn - Whether this is the chat's latest turn.
 * @returns The derived summary state.
 */
function useTurnRevisionState(userMessageId: string, isLatestTurn: boolean): TurnRevisionState {
  const { projectId } = useProject();
  const { activeChatId } = useChatContext();
  const { byTurnId, revisions } = useRevisions();
  const outcome = useTurnOutcomes(projectId).find((notice) => notice.turnId === userMessageId)?.kind;
  /* Stable closures: a fresh `subscribe` every render makes React unsubscribe
     and resubscribe both stores on every render of every turn marker (C47). */
  const readSettlement = useCallback(() => getHostTurnSettlement(activeChatId), [activeChatId]);
  const settlement = useSyncExternalStore(subscribeHostTurnSettlements, readSettlement, () => undefined);
  /* The turn's own durable lifecycle status, which survives the next message
     and a reload — unlike the chat's live run state (C38). */
  const turnStatus = useChatSelector((state) => state.messagesById.get(userMessageId)?.metadata?.status);
  const run = useChatSidebarStatus(projectId, activeChatId);
  const { retryAttempt } = useChatRetrySnapshot();
  const isRequestActive = useChatSelector((state) => state.status === 'submitted' || state.status === 'streaming');
  const hasError = useChatSelector((state) => state.error !== undefined || state.persistedError !== undefined);
  const authority = useOptionalChatWorkspaceAuthority();
  const readWorkspace = useCallback(() => authority?.get(activeChatId), [authority, activeChatId]);
  const workspace = useSyncExternalStore(authority?.subscribe ?? noSubscription, readWorkspace, () => undefined);
  /* The last visible state, so a reconnect holds what the summary said. */
  const [held, setHeld] = useState<TurnRevisionState>();

  const baseRevisionId = workspace?.execution.baseRevisionId;
  const base: TurnRevisionBase | undefined =
    workspace === undefined
      ? undefined
      : baseRevisionId === undefined
        ? { kind: 'first' }
        : { kind: 'revision', n: revisions.find((revision) => revision.revisionId === baseRevisionId)?.n };

  const state = deriveTurnRevisionState({
    revision: turnSave(byTurnId.get(userMessageId), baseRevisionId),
    outcome,
    isSettledWithoutChange:
      settlement?.type === 'turn.finalized' &&
      settlement.turnId === userMessageId &&
      settlement.revisionId === undefined,
    isLatestTurn,
    turnStatus,
    runState: isLatestTurn ? run?.state : undefined,
    isRequestActive: isLatestTurn && isRequestActive,
    isRetrying: isLatestTurn && retryAttempt > 0,
    hasError: isLatestTurn && hasError,
    base: isLatestTurn ? base : undefined,
    previous: held,
  });
  if (stateKey(state) !== stateKey(held)) {
    setHeld(state);
  }
  return state;
}

function StatusIcon({ state }: { readonly state: TurnRevisionState }): React.JSX.Element {
  if (state.kind === 'working' || state.kind === 'saving') {
    return <CircleDashed aria-hidden className='size-4 shrink-0 text-muted-foreground' />;
  }
  if (state.kind === 'saved' && !state.isInterrupted) {
    return <Check aria-hidden className='size-4 shrink-0' />;
  }
  return <AlertCircle aria-hidden className='size-4 shrink-0 text-feature' />;
}

function ExpandableSection({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant='ghost' size='xs' className='-ml-2 justify-start'>
          <ChevronRight aria-hidden className={cn('size-3 transition-transform', isOpen && 'rotate-90')} />
          {label}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className='pt-1'>{children}</CollapsibleContent>
    </Collapsible>
  );
}

function SavedRevisionDetails({ revision }: { readonly revision: RevisionCard }): React.JSX.Element {
  const { headRevisionId } = useRevisions();
  const { restore, isBusy } = useRestoreToPoint();
  const commands = useRevisionCommands();
  const changes = useRevisionChanges(revision);
  const name = revision.n === undefined ? 'Revision' : `Revision ${String(revision.n)}`;
  const title = revision.tags?.[0] ?? (revision.summary === '' ? undefined : revision.summary);

  return (
    <div className='flex flex-col gap-3'>
      {title === undefined ? null : <p className='text-sm font-medium wrap-break-word'>{title}</p>}
      <div className='flex flex-wrap items-center gap-2'>
        {headRevisionId === revision.revisionId ? (
          <span className='flex items-center gap-1 text-xs'>
            <Check aria-hidden className='size-3' />
            Current
          </span>
        ) : (
          <Button
            size='xs'
            variant='outline'
            disabled={isBusy}
            aria-label={`Restore to ${name}`}
            onClick={() => {
              restore(revision.revisionId);
            }}
          >
            <RotateCcw aria-hidden className='size-3' />
            Restore
          </Button>
        )}
        <RevisionNameAction
          revisionName={name}
          onTag={async (tag) => {
            await commands.tag({ name: tag, revisionId: revision.revisionId });
          }}
        />
      </div>
      <ExpandableSection label={`Files · ${String(changes.length)}`}>
        <div aria-label='Changed files' className='-mx-2 flex flex-col'>
          {changes.map((file) => (
            <FileRow key={file.path} file={file} revisionId={revision.revisionId} compareAgainst='parent' />
          ))}
        </div>
      </ExpandableSection>
      <ExpandableSection label='Engineering details'>
        <dl className='grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs'>
          <dt className='text-muted-foreground'>Revision</dt>
          <dd className='font-mono break-all'>{revision.revisionId}</dd>
          {revision.createdAt > 0 ? (
            <>
              <dt className='text-muted-foreground'>Saved</dt>
              <dd className='tabular-nums'>
                {new Date(revision.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} ·
                On this device
              </dd>
            </>
          ) : null}
        </dl>
      </ExpandableSection>
    </div>
  );
}

/**
 * One request's revision summary, directly after its user message.
 *
 * A card attached under the user message whose header is the disclosure.
 * Pending, saved and unconfirmed work update this line in place; a confirmed no-change request
 * renders nothing. Earlier saved requests link to Revisions instead of
 * expanding in the conversation.
 */
export const ChatRevisionMarker = memo(function ({
  userMessageId,
  isLatestTurn,
}: {
  readonly userMessageId: string;
  readonly isLatestTurn: boolean;
}): React.JSX.Element | undefined {
  const { projectId } = useProject();
  const isUserMessage = useChatSelector((state) => state.messagesById.get(userMessageId)?.role === messageRole.user);
  const state = useTurnRevisionState(userMessageId, isLatestTurn);
  const savedRevision = state.kind === 'saved' ? state.revision : undefined;
  const fileCount = useRevisionChanges(savedRevision).length;
  const { continueChat } = useChatActions();
  const workspace = useProjectWorkspace({ enableNoContext: true });
  const [isOpen, setIsOpen] = useState(false);

  if (!isUserMessage || state.kind === 'hidden') {
    return undefined;
  }

  /*
   * The lifecycle sentence and the file count are announced separately (C46).
   *
   * The diff resolves a beat after the card, so a live region holding both said
   * `Rev 5 saved` and then `Rev 5 saved · 2 files` — two announcements for one
   * transition. `role='status'` now wraps only the lifecycle, which is what
   * actually transitions; the count is ordinary visible text beside it.
   */
  const label = turnRevisionLabel(state, 0);
  const fileSuffix =
    state.kind === 'saved' && !state.isInterrupted && fileCount > 0
      ? ` · ${String(fileCount)} file${fileCount === 1 ? '' : 's'}`
      : undefined;
  const openRevisions = (revisionId?: string): void => {
    if (revisionId !== undefined) {
      requestRevisionReveal(projectId, revisionId);
    }
    workspace?.openPanel('revisions');
  };

  const status = (
    <>
      <StatusIcon state={state} />
      <span className='min-w-0 flex-1 wrap-break-word'>
        <span
          role='status'
          aria-live='polite'
          aria-label='Turn revision status'
          aria-busy={state.kind === 'working' || state.kind === 'saving'}
        >
          {label}
        </span>
        {fileSuffix === undefined ? null : <span>{fileSuffix}</span>}
      </span>
    </>
  );

  if (savedRevision !== undefined && !isLatestTurn) {
    return (
      <div aria-label='Turn revision' className={cn(cardClassName, 'flex items-center gap-2 pr-1 pl-2')}>
        <span className='flex min-w-0 flex-1 items-start gap-2 py-1.5 text-xs text-muted-foreground'>{status}</span>
        <Button
          size='xs'
          variant='ghost'
          onClick={() => {
            openRevisions(savedRevision.revisionId);
          }}
        >
          View revision
        </Button>
      </div>
    );
  }

  /* The whole header is the disclosure (R11); Retry stays a separate button
     because it is an action, not disclosure. */
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} aria-label='Turn revision' className={cardClassName}>
      <div className='flex items-start'>
        <CollapsibleTrigger asChild>
          <button
            type='button'
            aria-label={`${label}${fileSuffix ?? ''} · revision details`}
            className='group/revision flex min-w-0 flex-1 cursor-action items-start gap-2 rounded-b-lg px-2 py-1.5 text-left text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:focus-outline'
          >
            {status}
            <ChevronDown
              aria-hidden
              className='mt-px size-3.5 shrink-0 transition-transform group-data-[state=open]/revision:rotate-180'
            />
          </button>
        </CollapsibleTrigger>
        {state.kind === 'unconfirmed' ? (
          <Button size='xs' variant='ghost' className='mt-0.5 mr-1' onClick={continueChat}>
            <RotateCcw aria-hidden className='size-3' />
            Retry
          </Button>
        ) : null}
      </div>
      <CollapsibleContent className='px-4 pb-3'>
        {savedRevision === undefined ? (
          <div className='flex flex-col items-start gap-2'>
            <p className='text-xs leading-relaxed text-muted-foreground'>{turnRevisionDetail(state)}</p>
            {state.kind === 'conflicted' ? (
              <Button
                size='xs'
                variant='outline'
                onClick={() => {
                  openRevisions();
                }}
              >
                Open Revisions
              </Button>
            ) : null}
          </div>
        ) : (
          <SavedRevisionDetails revision={savedRevision} />
        )}
      </CollapsibleContent>
    </Collapsible>
  );
});
