/**
 * The revision card's state from its turn's log (W9 PV-S9, blueprint §5.8): the settlement row decides, the terminal
 * row says the save is on its way, and nothing waits on a run state.
 */

import { describe, expect, it } from 'vitest';
import {
  deriveTurnRevisionState,
  turnRevisionDetail,
  turnRevisionLabel,
} from '#routes/w.$workspace.$project/chat-turn-revision-state.js';
import type { TurnRevisionFacts } from '#routes/w.$workspace.$project/chat-turn-revision-state.js';
import type { TurnRevisionLog } from '#machines/chat-projection.logic.js';
import type { RevisionCard } from '#hooks/use-revisions.js';

const revision: RevisionCard = {
  revisionId: 'rev-5',
  n: 5,
  createdAt: 1,
  summary: 'Wider holes',
  actor: 'Tau',
  turnId: 'u1',
  conflicted: false,
  trigger: 'turn',
};

const placement = { checkoutId: 'live', baseRevisionId: 'rev-4', mode: 'direct' } as const;

const log = (over: Partial<TurnRevisionLog> = {}): TurnRevisionLog => ({
  attempt: 1,
  isWaiting: false,
  placement,
  ...over,
});

const facts = (over: Partial<TurnRevisionFacts> = {}): TurnRevisionFacts => ({
  log: log(),
  settled: undefined,
  recorded: undefined,
  base: { kind: 'revision', n: 4 },
  hasChanges: true,
  isUnreachable: false,
  isReconnecting: false,
  previous: undefined,
  ...over,
});

const finalized = { type: 'turn.finalized', revisionId: 'rev-5' } as const;

describe('deriveTurnRevisionState', () => {
  it('should reject stale progress, unverified graph cards and pre-turn saves', () => {
    const previous = { kind: 'working', base: { kind: 'revision', n: 4 }, isWaiting: false } as const;
    for (const attempt of [1, 2]) {
      expect(deriveTurnRevisionState(facts({ log: log({ attempt }), hasChanges: false, previous }))).toEqual({
        kind: 'hidden',
      });
    }
    expect(deriveTurnRevisionState(facts({ log: undefined, recorded: revision, hasChanges: false }))).toEqual({
      kind: 'hidden',
    });
    expect(
      deriveTurnRevisionState(
        facts({
          log: log({ settlement: { type: 'turn.failed', revisionId: 'rev-5' } }),
          settled: revision,
          hasChanges: false,
        }),
      ),
    ).toEqual({ kind: 'hidden' });
    expect(
      deriveTurnRevisionState(facts({ log: log({ settlement: { type: 'turn.conflicted' } }), hasChanges: false })),
    ).toEqual({ kind: 'hidden' });
    expect(
      deriveTurnRevisionState(facts({ log: log({ settlement: finalized }), settled: revision, hasChanges: false })),
    ).toEqual({ kind: 'hidden' });
  });

  it('should hide a request until files change, including a no-change request awaiting settlement', () => {
    for (const terminal of [undefined, 'completed', 'failed', 'cancelled'] as const) {
      for (const isWaiting of [false, true]) {
        const state = deriveTurnRevisionState(facts({ log: log({ terminal, isWaiting }), hasChanges: false }));
        expect(state).toStrictEqual({ kind: 'hidden' });
      }
    }
    expect(deriveTurnRevisionState(facts({ hasChanges: false, isUnreachable: true }))).toStrictEqual({
      kind: 'hidden',
    });
  });

  it('should keep changed work visible when saving clears dirty before settlement', () => {
    const previous = deriveTurnRevisionState(facts());
    const saving = deriveTurnRevisionState(facts({ log: log({ terminal: 'completed' }), hasChanges: true, previous }));
    expect(saving).toStrictEqual({ kind: 'saving' });
    expect(
      deriveTurnRevisionState(facts({ log: log({ terminal: 'completed' }), hasChanges: true, previous: saving })),
    ).toStrictEqual({ kind: 'saving' });
    expect(
      deriveTurnRevisionState(
        facts({
          log: log({ terminal: 'completed', settlement: { type: 'turn.finalized' } }),
          hasChanges: false,
          previous: saving,
        }),
      ),
    ).toStrictEqual({ kind: 'hidden' });
  });

  it('should hide unverified settlements, including cards that happen to be loaded', () => {
    for (const settlement of [
      finalized,
      { type: 'turn.conflicted' } as const,
      { type: 'turn.failed', revisionId: 'rev-5' } as const,
    ]) {
      expect(
        deriveTurnRevisionState(facts({ log: log({ settlement }), settled: revision, hasChanges: false })),
      ).toEqual({ kind: 'hidden' });
    }
  });

  it('should keep changed work visible through a reconnect or an unreachable host', () => {
    const previous = deriveTurnRevisionState(facts());
    expect(deriveTurnRevisionState(facts({ hasChanges: true, isReconnecting: true, previous }))).toEqual(previous);
    const unconfirmed = deriveTurnRevisionState(facts({ hasChanges: true, isUnreachable: true, previous }));
    expect(turnRevisionLabel(unconfirmed, 0)).toBe('Save not confirmed');
    expect(
      deriveTurnRevisionState(facts({ hasChanges: true, isUnreachable: true, previous: unconfirmed })),
    ).toStrictEqual(unconfirmed);
  });

  it('should not reuse a previous save as evidence of file changes in a retry', () => {
    const previous = deriveTurnRevisionState(facts({ log: log({ settlement: finalized }), settled: revision }));
    expect(deriveTurnRevisionState(facts({ log: log({ attempt: 2 }), hasChanges: false, previous }))).toStrictEqual({
      kind: 'hidden',
    });
  });

  it('should show a working state from attempt 1’s placement', () => {
    const state = deriveTurnRevisionState(facts());
    expect(state).toStrictEqual({ kind: 'working', base: { kind: 'revision', n: 4 }, isWaiting: false });
    expect(turnRevisionLabel(state, 0)).toBe('Starting from Rev 4');
  });

  it('should never invent a number for an unborn branch', () => {
    const state = deriveTurnRevisionState(facts({ base: { kind: 'first' } }));
    expect(turnRevisionLabel(state, 0)).toBe('Starting first revision');
  });

  it('should name no base for a later attempt, or before the placement', () => {
    expect(turnRevisionLabel(deriveTurnRevisionState(facts({ log: log({ attempt: 2 }) })), 0)).toBe('New revision');
    expect(turnRevisionLabel(deriveTurnRevisionState(facts({ base: undefined })), 0)).toBe('New revision');
  });

  it('should say Waiting for you while the attempt waits on the person', () => {
    const state = deriveTurnRevisionState(facts({ log: log({ isWaiting: true }) }));
    expect(turnRevisionLabel(state, 0)).toBe('Starting from Rev 4 · Waiting for you');
  });

  /* PV-A7: the run reads Done at its terminal row; the card alone waits on the settlement row. */
  it('should show saving until the settlement row', () => {
    const ended = facts({ log: log({ terminal: 'completed' }) });
    expect(turnRevisionLabel(deriveTurnRevisionState(ended), 0)).toBe('Saving revision');
    const settled = deriveTurnRevisionState({ ...ended, log: log({ terminal: 'completed', settlement: finalized }) });
    /* Named, with its card still on its way: still saving, never hidden. */
    expect(settled.kind).toBe('saving');
    const shown = deriveTurnRevisionState({
      ...ended,
      log: log({ terminal: 'completed', settlement: finalized }),
      settled: revision,
    });
    expect(turnRevisionLabel(shown, 2)).toBe('Rev 5 saved · 2 files');
  });

  /* PV-A20, TS-R11: a Stop after the agent changed files settles with its revision. */
  it('shows an interrupted save for a stopped attempt', () => {
    for (const terminal of ['cancelled', 'failed'] as const) {
      const state = deriveTurnRevisionState(
        facts({ log: log({ terminal, settlement: finalized }), settled: revision }),
      );
      expect(state).toStrictEqual({ kind: 'saved', revision, isInterrupted: true });
      expect(turnRevisionLabel(state, 2)).toBe('Rev 5 saved · Work interrupted');
    }
  });

  it('should hide the summary when the settlement names no revision', () => {
    for (const type of ['turn.finalized', 'turn.failed'] as const) {
      expect(
        deriveTurnRevisionState(facts({ log: log({ terminal: 'cancelled', settlement: { type } }) })),
      ).toStrictEqual({ kind: 'hidden' });
    }
  });

  it('should hide a failed attempt’s pre-turn base even when a card is loaded', () => {
    expect(
      deriveTurnRevisionState(
        facts({
          log: log({ terminal: 'failed', settlement: { type: 'turn.failed', revisionId: 'rev-5' } }),
          settled: revision,
        }),
      ),
    ).toEqual({ kind: 'hidden' });
  });

  it('should route a conflicted settlement to its own label', () => {
    const state = deriveTurnRevisionState(facts({ log: log({ settlement: { type: 'turn.conflicted' } }) }));
    expect(turnRevisionLabel(state, 0)).toBe('Needs your decision');
  });

  it('should hold the last known state while reconnecting', () => {
    const previous = { kind: 'working', base: { kind: 'revision', n: 4 }, isWaiting: false } as const;
    expect(deriveTurnRevisionState(facts({ isReconnecting: true, previous }))).toEqual(previous);
    expect(deriveTurnRevisionState(facts({ isReconnecting: true })).kind).toBe('working');
  });

  it('should say Save not confirmed while the host cannot be reached and nothing settled', () => {
    for (const terminal of [undefined, 'completed'] as const) {
      const state = deriveTurnRevisionState(facts({ log: log({ terminal }), isUnreachable: true }));
      expect(turnRevisionLabel(state, 0)).toBe('Save not confirmed');
      expect(turnRevisionDetail(state)).toContain('Rev 4 is the last confirmed revision.');
    }
    /* The settlement row answers whatever the connection does. */
    const settled = deriveTurnRevisionState(
      facts({ log: log({ terminal: 'completed', settlement: finalized }), settled: revision, isUnreachable: true }),
    );
    expect(settled.kind).toBe('saved');
  });

  it('should hide graph-only cards whose result attribution is unknown', () => {
    for (const source of [undefined, log({ terminal: 'cancelled', placement: undefined })]) {
      expect(deriveTurnRevisionState(facts({ log: source, recorded: revision, hasChanges: false }))).toEqual({
        kind: 'hidden',
      });
    }
  });

  it('should retain an earlier verified save without suggesting retry progress', () => {
    expect(
      deriveTurnRevisionState(
        facts({ log: log({ attempt: 2, previousRevisionId: 'rev-5' }), recorded: revision, hasChanges: false }),
      ),
    ).toEqual({ kind: 'saved', revision, isInterrupted: false });
  });
});
