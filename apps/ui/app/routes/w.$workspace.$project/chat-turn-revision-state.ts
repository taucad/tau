import type { MyMetadata } from '@taucad/chat';
import type { RevisionCard } from '#hooks/use-revisions.js';
import type { ChatSidebarState } from '#hooks/use-sidebar-status.js';

/** One message's persisted lifecycle status. @public */
export type MessageStatus = NonNullable<MyMetadata['status']>;

/** The revision a turn started from, as far as the placement says. @public */
export type TurnRevisionBase =
  | Readonly<{ kind: 'revision'; n: number | undefined }>
  | Readonly<{ kind: 'first' }>
  | Readonly<{ kind: 'unknown' }>;

/** What one request's revision summary says (chat turn revision story blueprint). @public */
export type TurnRevisionState =
  | Readonly<{ kind: 'hidden' }>
  | Readonly<{ kind: 'working'; base: TurnRevisionBase; isWaiting: boolean }>
  | Readonly<{ kind: 'saving' }>
  | Readonly<{ kind: 'saved'; revision: RevisionCard; isInterrupted: boolean }>
  | Readonly<{ kind: 'notSaved' }>
  | Readonly<{ kind: 'conflicted' }>
  | Readonly<{ kind: 'unconfirmed'; base: TurnRevisionBase }>;

/** Every fact the summary is derived from; each already has an owner. @public */
export type TurnRevisionFacts = Readonly<{
  /** The revision the host attested for this turn (`useRevisions().byTurnId`). */
  revision: RevisionCard | undefined;
  /** A `turn.conflicted` or `turn.failed` outcome for this turn. */
  outcome: 'conflicted' | 'failed' | undefined;
  /** The chat's latest settlement names this turn and minted nothing. */
  isSettledWithoutChange: boolean;
  /** Only the chat's latest request can still be running. */
  isLatestTurn: boolean;
  /**
   * This turn's own durable lifecycle status, from its user message.
   *
   * The chat's `runState` belongs to the chat's *current* run, so the same turn
   * lost "Work interrupted" the moment another message was sent and never read
   * interrupted again after a reload (C38). The message metadata is per turn
   * and persists with the transcript.
   */
  turnStatus: MessageStatus | undefined;
  /** The chat session machine's run state. */
  runState: ChatSidebarState | undefined;
  /** The AI SDK request is in flight. */
  isRequestActive: boolean;
  /** The transport is between automatic retry attempts. */
  isRetrying: boolean;
  /** The chat holds a runtime or persisted error. */
  hasError: boolean;
  /** The starting point, when this page placed the turn. */
  base: TurnRevisionBase | undefined;
  /** What the summary said before this read, so a reconnect holds it. */
  previous: TurnRevisionState | undefined;
}>;

const hidden: TurnRevisionState = { kind: 'hidden' };

const runningStates: ReadonlySet<ChatSidebarState> = new Set(['queued', 'working', 'tool', 'approval', 'question']);

/**
 * Derive one request's revision summary.
 *
 * A reconnect is connection status, not a revision state: settlements replay
 * from the durable log on every reattach, so the summary holds what it last
 * said. Only an error with no settlement leaves the save genuinely unknown.
 *
 * @param facts - The turn's facts.
 * @returns The state the summary renders.
 * @public
 */
export const deriveTurnRevisionState = (facts: TurnRevisionFacts): TurnRevisionState => {
  if (facts.revision !== undefined) {
    /* The durable fact first, so the same turn keeps saying what happened to it
       after the next message and after a reload (C38); the live run state still
       answers for the turn that is running now. */
    const isInterrupted =
      facts.turnStatus === 'cancelled' ||
      facts.turnStatus === 'error' ||
      (facts.isLatestTurn && (facts.runState === 'failed' || facts.runState === 'stopped'));
    return { kind: 'saved', revision: facts.revision, isInterrupted };
  }
  if (facts.outcome === 'conflicted') {
    return { kind: 'conflicted' };
  }
  if (facts.outcome === 'failed') {
    return { kind: 'notSaved' };
  }
  if (!facts.isLatestTurn || facts.isSettledWithoutChange) {
    return hidden;
  }
  return deriveUnsettledState(facts);
};

/**
 * The latest request before any settlement names it.
 *
 * @param facts - The turn's facts.
 * @returns The pending, unconfirmed or hidden state.
 */
const deriveUnsettledState = (facts: TurnRevisionFacts): TurnRevisionState => {
  const base = facts.base ?? { kind: 'unknown' };
  if (facts.isRetrying || facts.runState === 'reconnecting') {
    return facts.previous !== undefined && facts.previous.kind !== 'hidden'
      ? facts.previous
      : { kind: 'working', base, isWaiting: false };
  }
  if (facts.runState === 'finishing') {
    return { kind: 'saving' };
  }
  if (facts.isRequestActive || (facts.runState !== undefined && runningStates.has(facts.runState))) {
    return { kind: 'working', base, isWaiting: facts.runState === 'approval' || facts.runState === 'question' };
  }
  const hadWork =
    facts.base !== undefined ||
    facts.previous?.kind === 'working' ||
    facts.previous?.kind === 'saving' ||
    facts.previous?.kind === 'unconfirmed';
  if (facts.hasError && hadWork) {
    return { kind: 'unconfirmed', base };
  }
  /* Finishing → done can land a beat before the graph row; Saving holds until
   * the card or the no-change settlement arrives. */
  if (facts.runState === 'done' && facts.previous?.kind === 'saving') {
    return facts.previous;
  }
  return hidden;
};

const baseName = (base: TurnRevisionBase): string | undefined => {
  if (base.kind === 'first') {
    return 'first revision';
  }
  return base.kind === 'revision' && base.n !== undefined ? `Rev ${String(base.n)}` : undefined;
};

/**
 * The collapsed summary text.
 *
 * @param state - A visible state.
 * @param fileCount - Files the saved revision changed.
 * @returns The one-line label.
 * @public
 */
export const turnRevisionLabel = (state: TurnRevisionState, fileCount: number): string => {
  switch (state.kind) {
    case 'working': {
      const name = baseName(state.base);
      const activity = state.isWaiting ? 'Waiting for you' : 'Working';
      if (name === undefined) {
        return activity;
      }
      return state.base.kind === 'first' ? `Starting ${name} · ${activity}` : `Starting from ${name} · ${activity}`;
    }
    case 'saving': {
      return 'Saving revision';
    }
    case 'saved': {
      const name = state.revision.n === undefined ? 'Revision' : `Rev ${String(state.revision.n)}`;
      if (state.isInterrupted) {
        return `${name} saved · Work interrupted`;
      }
      return fileCount === 0
        ? `${name} saved`
        : `${name} saved · ${String(fileCount)} file${fileCount === 1 ? '' : 's'}`;
    }
    case 'notSaved': {
      return 'Revision not saved';
    }
    case 'conflicted': {
      return 'Changes need review';
    }
    case 'unconfirmed': {
      return 'Save not confirmed';
    }
    case 'hidden': {
      return '';
    }
  }
};

/**
 * The sentence shown when a pending or unresolved summary is expanded.
 *
 * @param state - A visible, unsaved state.
 * @returns The detail sentence.
 * @public
 */
export const turnRevisionDetail = (state: TurnRevisionState): string => {
  switch (state.kind) {
    case 'working': {
      return 'The new revision will appear here when it is saved.';
    }
    case 'saving': {
      return 'The changes are ready. Waiting for the save to finish.';
    }
    case 'unconfirmed': {
      const name = baseName(state.base);
      return `Tau could not reach the host to confirm this save.${name === undefined || state.base.kind === 'first' ? '' : ` ${name} is the last confirmed revision.`}`;
    }
    case 'notSaved': {
      return 'Nothing was saved for this request.';
    }
    case 'conflicted': {
      return 'Two versions changed the same files. Review them in Revisions.';
    }
    default: {
      return '';
    }
  }
};
