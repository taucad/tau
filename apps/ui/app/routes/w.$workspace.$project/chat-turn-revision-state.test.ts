import { describe, expect, it } from 'vitest';
import {
  deriveTurnRevisionState,
  turnRevisionDetail,
  turnRevisionLabel,
} from '#routes/w.$workspace.$project/chat-turn-revision-state.js';
import type { TurnRevisionFacts } from '#routes/w.$workspace.$project/chat-turn-revision-state.js';
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

const facts = (over: Partial<TurnRevisionFacts> = {}): TurnRevisionFacts => ({
  revision: undefined,
  outcome: undefined,
  isSettledWithoutChange: false,
  isLatestTurn: true,
  turnStatus: undefined,
  runState: undefined,
  isRequestActive: false,
  isRetrying: false,
  hasError: false,
  base: undefined,
  previous: undefined,
  ...over,
});

describe('deriveTurnRevisionState', () => {
  it('should show a working state from the placed base revision', () => {
    const state = deriveTurnRevisionState(
      facts({ runState: 'working', base: { kind: 'revision', n: 4 }, isRequestActive: true }),
    );
    expect(state).toStrictEqual({ kind: 'working', base: { kind: 'revision', n: 4 }, isWaiting: false });
    expect(turnRevisionLabel(state, 0)).toBe('Starting from Rev 4');
  });

  it('should never invent a number for an unborn branch', () => {
    const state = deriveTurnRevisionState(facts({ runState: 'working', base: { kind: 'first' } }));
    expect(turnRevisionLabel(state, 0)).toBe('Starting first revision');
  });

  it('should name an unknown starting point as a new revision', () => {
    const state = deriveTurnRevisionState(facts({ runState: 'working', isRequestActive: true }));
    expect(turnRevisionLabel(state, 0)).toBe('New revision');
  });

  it('should say Waiting for you during an approval pause', () => {
    const state = deriveTurnRevisionState(facts({ runState: 'approval', base: { kind: 'revision', n: 4 } }));
    expect(turnRevisionLabel(state, 0)).toBe('Starting from Rev 4 · Waiting for you');
  });

  it('should show Saving while the run finishes without an attested revision', () => {
    expect(deriveTurnRevisionState(facts({ runState: 'finishing' })).kind).toBe('saving');
  });

  it('should show the attested revision with its file count', () => {
    const state = deriveTurnRevisionState(facts({ revision, runState: 'done' }));
    expect(turnRevisionLabel(state, 2)).toBe('Rev 5 saved · 2 files');
  });

  it('should keep a saved revision inspectable when the run failed or stopped', () => {
    for (const runState of ['failed', 'stopped'] as const) {
      const state = deriveTurnRevisionState(facts({ revision, runState }));
      expect(turnRevisionLabel(state, 2)).toBe('Rev 5 saved · Work interrupted');
    }
  });

  it('should hide the summary when the host confirms no change', () => {
    expect(deriveTurnRevisionState(facts({ isSettledWithoutChange: true, runState: 'done' }))).toStrictEqual({
      kind: 'hidden',
    });
  });

  /*
   * A refused turn settles as `turn.finalized` with no changed paths, which is
   * abandonment, not confirmation: the run failed before it could write. Hiding
   * the marker there unmounted the card and left the person reading the
   * *previous* turn's "Rev 1 saved".
   */
  it('should say Save not confirmed when a failed turn settles without a change', () => {
    const state = deriveTurnRevisionState(
      facts({ isSettledWithoutChange: true, hasError: true, runState: 'failed', base: { kind: 'revision', n: 1 } }),
    );
    expect(turnRevisionLabel(state, 0)).toBe('Save not confirmed');
  });

  it('should hold the last known state while reconnecting or retrying', () => {
    const previous = { kind: 'saving' } as const;
    expect(deriveTurnRevisionState(facts({ runState: 'reconnecting', previous }))).toBe(previous);
    expect(deriveTurnRevisionState(facts({ isRetrying: true, hasError: true, previous }))).toBe(previous);
  });

  it('should report Save not confirmed only for an error with no settlement after work began', () => {
    const state = deriveTurnRevisionState(facts({ hasError: true, base: { kind: 'revision', n: 4 } }));
    expect(turnRevisionLabel(state, 0)).toBe('Save not confirmed');
    expect(turnRevisionDetail(state)).toContain('Rev 4 is the last confirmed revision.');
    expect(deriveTurnRevisionState(facts({ hasError: true })).kind).toBe('hidden');
  });

  it('should let a settlement replace an unconfirmed state', () => {
    const previous = deriveTurnRevisionState(facts({ hasError: true, base: { kind: 'first' } }));
    expect(deriveTurnRevisionState(facts({ hasError: true, revision, previous })).kind).toBe('saved');
  });

  it('should route conflicted and failed outcomes to their own labels', () => {
    expect(turnRevisionLabel(deriveTurnRevisionState(facts({ outcome: 'conflicted' })), 0)).toBe('Changes need review');
    expect(turnRevisionLabel(deriveTurnRevisionState(facts({ outcome: 'failed' })), 0)).toBe('Revision not saved');
  });

  it('should hide unsaved state on earlier turns and keep their saved revisions', () => {
    expect(deriveTurnRevisionState(facts({ isLatestTurn: false, hasError: true, base: { kind: 'first' } })).kind).toBe(
      'hidden',
    );
    const state = deriveTurnRevisionState(facts({ isLatestTurn: false, revision, runState: 'failed' }));
    expect(state).toStrictEqual({ kind: 'saved', revision, isInterrupted: false });
  });

  /*
   * C38: the turn keeps its own outcome.
   *
   * `runState` belongs to the chat's *current* run, so the same turn used to
   * lose "Work interrupted" the moment another message was sent and never read
   * interrupted again after a reload. The user message's persisted status is
   * per turn and travels with the transcript.
   */
  it('should keep Work interrupted on an earlier turn from its durable status', () => {
    const state = deriveTurnRevisionState(facts({ isLatestTurn: false, revision, turnStatus: 'cancelled' }));
    expect(state).toStrictEqual({ kind: 'saved', revision, isInterrupted: true });
    expect(turnRevisionLabel(state, 2)).toBe('Rev 5 saved · Work interrupted');
  });

  it('should hold Saving across the gap between done and the revision card', () => {
    expect(deriveTurnRevisionState(facts({ runState: 'done', previous: { kind: 'saving' } })).kind).toBe('saving');
    expect(deriveTurnRevisionState(facts({ runState: 'done' })).kind).toBe('hidden');
  });
});
