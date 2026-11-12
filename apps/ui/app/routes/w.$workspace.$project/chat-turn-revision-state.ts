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
  | Readonly<{ kind: 'saved'; revision: RevisionCard; isInterrupted: boolean }>
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
  /** The turn's revision as the earlier attempt's verified result, named by the durable log. */
  recorded: RevisionCard | undefined;
  /** The starting point attempt 1's placement names. */
  base: TurnRevisionBase | undefined;
  /** Durable host proof that this attempt changed a versioned file. */
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
  if (card === undefined || card.revisionId !== settlement.revisionId) {
    /* Named, and on its way from the revision client. */
    return { kind: 'saving' };
  }
  return { kind: 'saved', revision: card, isInterrupted };
};

/**
 * Derive one request's revision summary from its newest attempt (§5.8).
 *
 * The settlement row decides; before it, the attempt's terminal row says the save is on its way, and before that the
 * attempt is working once its durable change proof exists. A graph card alone never establishes turn attribution.
 *
 * @param facts - The turn's facts.
 * @returns The state the summary renders.
 * @public
 */
export const deriveTurnRevisionState = (facts: TurnRevisionFacts): TurnRevisionState => {
  const { log } = facts;
  const isInterrupted = log?.terminal === 'failed' || log?.terminal === 'cancelled';
  /* A failed placement can name only the person's pre-turn base, never this request's result. */
  const earlier: TurnRevisionState =
    log?.previousRevisionId !== undefined && facts.recorded?.revisionId === log.previousRevisionId
      ? { kind: 'saved', revision: facts.recorded, isInterrupted: false }
      : hidden;
  if (
    log?.settlement?.type === 'turn.failed' ||
    (log?.settlement !== undefined &&
      log.settlement.type !== 'turn.conflicted' &&
      (log.settlement.revisionId === undefined || log.settlement.revisionId === log.placement?.baseRevisionId))
  ) {
    return earlier;
  }
  if (!facts.hasChanges) {
    return earlier;
  }
  if (log?.settlement !== undefined) {
    return settledState(log.settlement, facts.settled, isInterrupted);
  }
  if (log === undefined) {
    return hidden;
  }
  if (facts.isUnreachable) {
    return { kind: 'unconfirmed', base: facts.base ?? unknownBase };
  }
  if (log.terminal !== undefined) {
    return { kind: 'saving' };
  }
  /* Only attempt 1 carries a placement; a later attempt names no base. */
  return {
    kind: 'working',
    base: log.attempt === 1 ? (facts.base ?? unknownBase) : unknownBase,
    isWaiting: log.isWaiting,
  };
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
       * pause adds a suffix (chat activity indicator closeout R11). No base is
       * named: an entry has no number (M11). */
      return state.isWaiting ? 'Waiting for you' : 'Working…';
    }
    case 'saving': {
      return 'Saving…';
    }
    case 'saved': {
      if (state.isInterrupted) {
        return 'Saved · stopped early';
      }
      return fileCount === 0 ? 'Saved' : `Saved · ${String(fileCount)} file${fileCount === 1 ? '' : 's'}`;
    }
    case 'conflicted': {
      /* HQ1: a decision waiting on the person is said one way everywhere. */
      return 'Needs your decision';
    }
    case 'unconfirmed': {
      return 'Couldn’t confirm the save';
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
    case 'unconfirmed': {
      return 'Tau couldn’t reach your files to confirm this save.';
    }
    case 'saved': {
      return '';
    }
    case 'conflicted': {
      return 'Both branches changed the same files.';
    }
    default: {
      return '';
    }
  }
};
