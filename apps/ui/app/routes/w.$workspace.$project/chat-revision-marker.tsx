import { memo, useCallback, useMemo, useSyncExternalStore } from 'react';
import { messageRole } from '@taucad/chat/constants';
import { cn } from '@taucad/ui/utils/cn';
import { ActionButton } from '@taucad/ui/components/actions';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { entryTime, turnRevisionGlyph } from '#routes/w.$workspace.$project/revision-vocabulary.js';
import {
  deriveTurnRevisionState,
  turnRevisionDetail,
  turnRevisionLabel,
} from '#routes/w.$workspace.$project/chat-turn-revision-state.js';
import type { TurnRevisionBase, TurnRevisionState } from '#routes/w.$workspace.$project/chat-turn-revision-state.js';
import { requestRevisionReveal } from '@taucad/project-workspace/utils/revision-reveal';
import { selectVisibleChatError } from '#routes/w.$workspace.$project/chat-error.js';
import { useProjectWorkspace } from '#routes/w.$workspace.$project/project-workspace-context.js';
import { useRevisionCards, useRevisionChanges, useRevisions } from '#hooks/use-revisions.js';
import type { RevisionCard } from '#hooks/use-revisions.js';
import { useChatActions, useChatContext, useChatSelector } from '#hooks/use-chat.js';
import { useChatSidebarStatus } from '#hooks/use-sidebar-status.js';
import { useProject } from '#hooks/use-project.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { selectTurnRevision } from '#machines/chat-projection.logic.js';
import type { TurnRevisionLog } from '#machines/chat-projection.logic.js';

/** Tucked under the user bubble, like a status strip attached to a composer (R11, R12). */
const cardClassName = 'mx-2 -mt-3 rounded-b-lg border border-t-0 bg-muted/40 pt-3';

/**
 * One revision's card: from the loaded page when it is on it, looked up otherwise.
 *
 * @param revisionId - The revision, or `undefined` for none.
 * @returns Its card, once the revision client has it.
 */
function useRevisionCard(revisionId: string | undefined): RevisionCard | undefined {
  const { revisions } = useRevisions();
  const loaded = revisions.find((revision) => revision.revisionId === revisionId);
  return (
    useRevisionCards(loaded === undefined && revisionId !== undefined ? [revisionId] : []).get(revisionId ?? '') ??
    loaded
  );
}

/**
 * One turn's facts from its chat's log (PV-S9): `selectTurnRevision` over the store's projection.
 *
 * @param chatId - The chat.
 * @param turnId - The turn's user-message id.
 * @returns The newest attempt's facts, or `undefined` while the log names no run for the turn.
 */
function useTurnLog(chatId: string, turnId: string): TurnRevisionLog | undefined {
  const chats = useChatSessionStore();
  const subscribe = useCallback((listener: () => void) => chats.subscribeProjection(chatId, listener), [chats, chatId]);
  const read = useCallback(() => chats.getProjection(chatId), [chats, chatId]);
  const projection = useSyncExternalStore(subscribe, read, read);
  return useMemo(
    () => (projection === undefined ? undefined : selectTurnRevision(projection, turnId)),
    [projection, turnId],
  );
}

/**
 * The revision facts for one request (§5.8): its log, the revision client's cards and whether the host answers.
 *
 * @param userMessageId - The user message that anchors the turn.
 * @param isLatestTurn - Whether this is the chat's latest turn.
 * @returns The derived state, and when the entry the turn started from was saved, once its card is read.
 */
function useTurnRevisionState(
  userMessageId: string,
  isLatestTurn: boolean,
): Readonly<{ state: TurnRevisionState; lastConfirmedAt: number | undefined }> {
  const { projectId } = useProject();
  const { activeChatId } = useChatContext();
  const log = useTurnLog(activeChatId, userMessageId);
  const settled = useRevisionCard(log?.settlement?.revisionId);
  const placement = log?.placement;
  const baseRevisionId = placement?.baseRevisionId;
  /* The base only names a working or unconfirmed turn, which only the latest turn can be. */
  const baseCard = useRevisionCard(isLatestTurn && log?.settlement === undefined ? baseRevisionId : undefined);
  const previousResult = useRevisionCard(log?.previousRevisionId);
  const run = useChatSidebarStatus(projectId, activeChatId);
  const hasError = useChatSelector((state) => selectVisibleChatError(state) !== undefined);

  const base: TurnRevisionBase | undefined =
    placement === undefined
      ? undefined
      : baseRevisionId === undefined
        ? { kind: 'first' }
        : { kind: 'revision', n: baseCard?.n };

  const state = deriveTurnRevisionState({
    log,
    settled,
    recorded: previousResult,
    base,
    hasChanges: log?.hasChanges === true,
    isUnreachable: isLatestTurn && hasError,
    isReconnecting: isLatestTurn && run?.state === 'reconnecting',
    previous: undefined,
  });
  return { state, lastConfirmedAt: base?.kind === 'revision' ? baseCard?.createdAt : undefined };
}

/**
 * Why a save is not confirmed, and which save is (copy table, M11): the entry
 * the turn started from, by its time, never by a number.
 *
 * @param state - An unconfirmed turn.
 * @param lastConfirmedAt - When the turn's starting entry was saved, once its card is read.
 * @returns The sentence.
 */
const unconfirmedSentence = (state: TurnRevisionState, lastConfirmedAt: number | undefined): string => {
  const time = lastConfirmedAt === undefined ? '' : entryTime(lastConfirmedAt);
  const detail = turnRevisionDetail(state);
  return time === '' ? detail : `${detail} Your last confirmed save was at ${time}.`;
};

/**
 * One request's line under its user message (blueprint C5): what happened to
 * the files, and the way to where the detail lives.
 *
 * One line, with no menu and no facts. A saved or stopped request's whole line
 * opens its entry in History, where creating a version, branching and the id
 * live once. A save that could not be confirmed offers Try again; a conflict
 * offers Resolve. Working and Saving show only once the turn has changed a
 * file, and a confirmed no-change request renders nothing. Backup is the
 * History header's fact, not the chat's.
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
  const { state, lastConfirmedAt } = useTurnRevisionState(userMessageId, isLatestTurn);
  const savedRevision = state.kind === 'saved' ? state.revision : undefined;
  const fileCount = useRevisionChanges(savedRevision).length;
  const { continueChat } = useChatActions();
  const workspace = useProjectWorkspace({ enableNoContext: true });

  if (!isUserMessage || state.kind === 'hidden') {
    return undefined;
  }

  /*
   * The lifecycle sentence and the file count are announced separately (C46).
   *
   * The diff resolves a beat after the line, so a live region holding both said
   * `Saved` and then `Saved · 2 files`: two announcements for one transition.
   * `role='status'` wraps only the lifecycle, which is what actually
   * transitions; the count is ordinary visible text beside it.
   */
  const label = turnRevisionLabel(state, 0);
  const fileSuffix =
    state.kind === 'saved' && !state.isInterrupted && fileCount > 0
      ? ` · ${String(fileCount)} file${fileCount === 1 ? '' : 's'}`
      : undefined;
  const openHistory = (revisionId?: string): void => {
    if (revisionId !== undefined) {
      requestRevisionReveal(projectId, revisionId);
    }
    workspace?.openPanel('revisions');
  };
  const glyph = turnRevisionGlyph(state);
  const line = (
    <span className='flex min-w-0 flex-1 items-center gap-2 py-1.5'>
      <glyph.icon aria-hidden data-slot='marker-glyph' className={cn('size-4 shrink-0', glyph.tone)} />
      <span className='min-w-0 flex-1 wrap-break-word'>
        <span
          role='status'
          aria-live='polite'
          aria-label='Save status'
          aria-busy={state.kind === 'working' || state.kind === 'saving'}
        >
          {label}
        </span>
        {fileSuffix === undefined ? null : <span>{fileSuffix}</span>}
      </span>
    </span>
  );

  if (savedRevision !== undefined) {
    /* The whole line is View's target: its hit area stretches over the line,
       so the live region stays outside the button and keeps its own name. */
    return (
      <div
        role='group'
        aria-label='Changes from this request'
        className={cn(
          cardClassName,
          'relative flex items-center gap-2 pr-3 pl-2 text-xs text-muted-foreground hover:bg-accent/50 has-[button:focus-visible]:focus-outline',
        )}
      >
        {line}
        <button
          type='button'
          className='cursor-action text-xs font-medium text-foreground outline-none after:absolute after:inset-0 after:rounded-b-lg focus-visible:outline-none'
          onClick={() => {
            openHistory(savedRevision.revisionId);
          }}
        >
          View
        </button>
      </div>
    );
  }

  return (
    <div
      role='group'
      aria-label='Changes from this request'
      className={cn(cardClassName, 'flex items-center gap-2 pr-1 pl-2 text-xs text-muted-foreground')}
    >
      {line}
      {state.kind === 'unconfirmed' ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <ActionButton verb='Try again' className='mb-1' onClick={continueChat} />
          </TooltipTrigger>
          <TooltipContent className='max-w-64 text-pretty'>
            {unconfirmedSentence(state, lastConfirmedAt)}
          </TooltipContent>
        </Tooltip>
      ) : null}
      {state.kind === 'conflicted' ? (
        <ActionButton
          verb='Resolve'
          className='mb-1'
          onClick={() => {
            openHistory();
          }}
        />
      ) : null}
    </div>
  );
});
