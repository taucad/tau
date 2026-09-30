import type { RevisionCard } from '#hooks/use-revisions.js';
import type { TurnRevisionLog } from '#machines/chat-projection.logic.js';

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
  /** `isBase`: an attempt that never ran saved only the person's unsaved edits, as its base (RV8-F4, V5 Q14). */
  | Readonly<{ kind: 'saved'; revision: RevisionCard; isInterrupted: boolean; isBase?: boolean }>
  | Readonly<{ kind: 'conflicted' }>
  | Readonly<{ kind: 'unconfirmed'; base: TurnRevisionBase }>;

/**
 * Every fact the summary is derived from (§5.8): the turn's log, the revision client's cards and the host's reach.
 *
 * @public
 */
export type TurnRevisionFacts = Readonly<{
  /** The turn's newest attempt, from its chat's log (`selectTurnRevision`); `undefined` while the log names no run. */
  log: TurnRevisionLog | undefined;
  /** The card for the revision the attempt's settlement names, once the revision client has it. */
  settled: RevisionCard | undefined;
  /** The turn's revision as the revision client recorded it, for a turn whose log will never settle it (legacy). */
  recorded: RevisionCard | undefined;
  /** The starting point attempt 1's placement names. */
  base: TurnRevisionBase | undefined;
  /** The turn's checkout has file changes after its starting revision. */
  hasChanges: boolean;
  /**
   * The host cannot be reached.
   *
   * ponytail: a request error stands in for the attachment region's `unreachable` until PV-S12 adds it.
   */
  isUnreachable: boolean;
  /**
   * The chat is reconnecting, so the summary holds what it said.
   *
   * ponytail: the run's `reconnecting` state stands in for the attachment's `backoff` until PV-S12.
   */
  isReconnecting: boolean;
  /** What the summary said before this read. */
  previous: TurnRevisionState | undefined;
}>;

const hidden: TurnRevisionState = { kind: 'hidden' };
const unknownBase: TurnRevisionBase = { kind: 'unknown' };

/**
 * What the attempt's settlement row says.
 *
 * @param settlement - The row, and the revision it names.
 * @param card - That revision's card, once the revision client has it.
 * @param isInterrupted - The attempt's terminal row is `failed` or `cancelled`.
 * @returns The settled state.
 */
const settledState = (
  settlement: NonNullable<TurnRevisionLog['settlement']>,
  card: RevisionCard | undefined,
  isInterrupted: boolean,
): TurnRevisionState => {
  if (settlement.type === 'turn.conflicted') {
    return { kind: 'conflicted' };
  }
  if (settlement.revisionId === undefined) {
    /* Nothing changed on a clean base, or the attempt never ran on one: the run's own card says why. */
    return hidden;
  }
  if (card === undefined) {
    /* Named, and on its way from the revision client. */
    return { kind: 'saving' };
  }
  return settlement.type === 'turn.failed'
    ? { kind: 'saved', revision: card, isInterrupted: false, isBase: true }
    : { kind: 'saved', revision: card, isInterrupted };
};

/**
 * Derive one request's revision summary from its newest attempt (§5.8).
 *
 * The settlement row decides; before it, the attempt's terminal row says the save is on its way, and before that the
 * attempt is working once files change. A run the log placed nowhere never settles, so the revision client's record
 * answers for it.
 *
 * @param facts - The turn's facts.
 * @returns The state the summary renders.
 * @public
 */
export const deriveTurnRevisionState = (facts: TurnRevisionFacts): TurnRevisionState => {
  const { log } = facts;
  const isInterrupted = log?.terminal === 'failed' || log?.terminal === 'cancelled';
  if (log?.settlement !== undefined) {
    return settledState(log.settlement, facts.settled, isInterrupted);
  }
  if (log === undefined || (log.terminal !== undefined && log.placement === undefined)) {
    return facts.recorded === undefined ? hidden : { kind: 'saved', revision: facts.recorded, isInterrupted };
  }
  /* A save can clear dirty before its settlement arrives; keep changes already shown visible until it answers. */
  const hadChanges =
    facts.previous?.kind === 'working' || facts.previous?.kind === 'saving' || facts.previous?.kind === 'unconfirmed';
  if (!facts.hasChanges && !hadChanges) {
    return hidden;
  }
  if (facts.isUnreachable) {
    return { kind: 'unconfirmed', base: facts.base ?? unknownBase };
  }
  if (log.terminal !== undefined) {
    return { kind: 'saving' };
  }
  if (facts.isReconnecting && facts.previous !== undefined && facts.previous.kind !== 'hidden') {
    return facts.previous;
  }
  /* Only attempt 1 carries a placement; a later attempt names no base. */
  return {
    kind: 'working',
    base: log.attempt === 1 ? (facts.base ?? unknownBase) : unknownBase,
    isWaiting: log.isWaiting,
  };
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
      /* The dashed status icon already says the work is in progress, so only a
       * pause adds a suffix (chat activity indicator closeout R11). */
      const name = baseName(state.base);
      if (name === undefined) {
        return state.isWaiting ? 'Waiting for you' : 'New revision';
      }
      const start = state.base.kind === 'first' ? `Starting ${name}` : `Starting from ${name}`;
      return state.isWaiting ? `${start} · Waiting for you` : start;
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
    case 'conflicted': {
      /* HQ1: a decision waiting on the person is said one way everywhere. */
      return 'Needs your decision';
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
    case 'saved': {
      return state.isBase === true ? 'Your unsaved edits, saved before this request.' : '';
    }
    case 'conflicted': {
      return 'Two versions changed the same files. Choose one in Revisions.';
    }
    default: {
      return '';
    }
  }
};
