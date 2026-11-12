import { describe, expect, it } from 'vitest';
import { emptyOnboardingState, mergeOnboarding, onboardingDeltaOf, onboardingStateSchema } from '@taucad/preferences';
import type { OnboardingState } from '@taucad/preferences';

const state = (patch: Partial<OnboardingState> = {}): OnboardingState => ({ ...emptyOnboardingState, ...patch });

describe('mergeOnboarding', () => {
  it('keeps the higher setup status in the order offered < skipped < completed', () => {
    const completed = state({ setup: { status: 'completed' } });
    expect(mergeOnboarding(completed, { setupStatus: 'offered' }).setup).toEqual({ status: 'completed' });
    expect(mergeOnboarding(completed, { setupStatus: 'skipped' }).setup).toEqual({ status: 'completed' });
    expect(mergeOnboarding(state({ setup: { status: 'offered' } }), { setupStatus: 'skipped' }).setup).toEqual({
      status: 'skipped',
    });
    expect(mergeOnboarding(state(), { setupStatus: 'offered' }).setup).toEqual({ status: 'offered' });
    expect(mergeOnboarding(state(), {}).setup).toBeUndefined();
  });

  it('takes the union of seen tips, in tour order, without duplicates', () => {
    const stored = state({ tour: { seen: ['look', 'ask'] } });
    expect(mergeOnboarding(stored, { seenAdd: ['build', 'ask'] }).tour.seen).toEqual(['ask', 'look', 'build']);
    expect(mergeOnboarding(stored, {}).tour.seen).toEqual(['ask', 'look']);
  });

  it('keeps the higher ending in the order dismissed < completed, and never clears it', () => {
    const completed = state({ tour: { seen: [], ended: 'completed' } });
    expect(mergeOnboarding(completed, { ended: 'dismissed' }).tour.ended).toBe('completed');
    expect(mergeOnboarding(completed, {}).tour.ended).toBe('completed');
    expect(mergeOnboarding(state({ tour: { seen: [], ended: 'dismissed' } }), { ended: 'completed' }).tour.ended).toBe(
      'completed',
    );
  });

  it('replaces wanted only when the write sets it', () => {
    const wanted = state({ tour: { wanted: true, seen: [] } });
    expect(mergeOnboarding(wanted, { seenAdd: ['ask'] }).tour.wanted).toBe(true);
    expect(mergeOnboarding(wanted, { wanted: false }).tour.wanted).toBe(false);
    expect(mergeOnboarding(state(), {}).tour).not.toHaveProperty('wanted');
  });

  it('does not mutate the stored state and always parses', () => {
    const stored = state({ tour: { seen: ['ask'] } });
    const snapshot = structuredClone(stored);
    const next = mergeOnboarding(stored, {
      setupStatus: 'completed',
      seenAdd: ['look'],
      ended: 'completed',
      wanted: true,
    });
    expect(stored).toEqual(snapshot);
    expect(onboardingStateSchema.parse(next)).toEqual(next);
  });

  it('merges a whole copy through its delta without losing either side', () => {
    const device = state({ setup: { status: 'completed' }, tour: { wanted: true, seen: ['ask'] } });
    const account = state({ setup: { status: 'skipped' }, tour: { seen: ['look'], ended: 'dismissed' } });
    expect(mergeOnboarding(device, onboardingDeltaOf(account))).toEqual({
      version: 1,
      setup: { status: 'completed' },
      tour: { wanted: true, seen: ['ask', 'look'], ended: 'dismissed' },
    });
  });
});
