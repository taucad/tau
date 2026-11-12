// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyOnboardingState } from '@taucad/preferences';
import type { OnboardingState } from '@taucad/preferences';

const flags = vi.hoisted(() => ({ onboarding: true }));
vi.mock('#flags/feature-flags.js', () => ({ isFeatureEnabled: (flag: keyof typeof flags) => flags[flag] }));

const { prepareFirstProjectTour, wantsFirstProjectTour } = await import('#components/tour/first-project-tour.js');
const { personRecordStores } = await import('#preferences/person-record.store.js');

const now = Date.UTC(2026, 10, 12);
const day = 24 * 60 * 60 * 1000;
const newcomer = {
  isOnboardingEnabled: true,
  onboarding: emptyOnboardingState,
  projectCount: 0,
  accountCreatedAt: undefined,
  now,
};
const withTour = (tour: OnboardingState['tour'], setup?: OnboardingState['setup']): OnboardingState => ({
  ...emptyOnboardingState,
  tour,
  ...(setup === undefined ? {} : { setup }),
});

describe('wantsFirstProjectTour', () => {
  it('asks for the tour on a newcomer’s first project, signed out or with a new account', () => {
    expect(wantsFirstProjectTour(newcomer)).toBe(true);
    expect(wantsFirstProjectTour({ ...newcomer, accountCreatedAt: now - day })).toBe(true);
  });

  it('never asks for someone who already had projects, an older account, or the flag off', () => {
    expect(wantsFirstProjectTour({ ...newcomer, projectCount: 1 })).toBe(false);
    expect(wantsFirstProjectTour({ ...newcomer, accountCreatedAt: now - 8 * day })).toBe(false);
    expect(wantsFirstProjectTour({ ...newcomer, isOnboardingEnabled: false })).toBe(false);
  });

  it('never asks for someone who skipped setup, or who already chose, saw or ended the tour', () => {
    expect(wantsFirstProjectTour({ ...newcomer, onboarding: withTour({ seen: [] }, { status: 'skipped' }) })).toBe(
      false,
    );
    expect(wantsFirstProjectTour({ ...newcomer, onboarding: withTour({ seen: [], wanted: false }) })).toBe(false);
    expect(wantsFirstProjectTour({ ...newcomer, onboarding: withTour({ seen: ['ask'] }) })).toBe(false);
    expect(wantsFirstProjectTour({ ...newcomer, onboarding: withTour({ seen: [], ended: 'dismissed' }) })).toBe(false);
    expect(wantsFirstProjectTour({ ...newcomer, onboarding: withTour({ seen: [] }, { status: 'offered' }) })).toBe(
      true,
    );
  });
});

describe('prepareFirstProjectTour', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    flags.onboarding = true;
  });

  it('stores tour.wanted once the first project exists', async () => {
    const askForTour = await prepareFirstProjectTour({
      readProjectCount: async () => 0,
      readAccount: async () => ({ isSignedIn: false }),
    });

    expect(personRecordStores.onboarding.read().tour.wanted).toBeUndefined();
    askForTour?.();
    expect(personRecordStores.onboarding.read().tour.wanted).toBe(true);
  });

  it('reads neither the workspace nor the session when the record rules it out', async () => {
    personRecordStores.onboarding.write({ setupStatus: 'skipped' });
    const readProjectCount = vi.fn(async () => 0);
    const readAccount = vi.fn(async (): Promise<{ isSignedIn: false }> => ({ isSignedIn: false }));

    expect(await prepareFirstProjectTour({ readProjectCount, readAccount })).toBeUndefined();
    flags.onboarding = false;
    globalThis.localStorage.clear();
    expect(await prepareFirstProjectTour({ readProjectCount, readAccount })).toBeUndefined();
    expect(readProjectCount).not.toHaveBeenCalled();
    expect(readAccount).not.toHaveBeenCalled();
  });

  it('asks for nothing when the session cannot be read or the account’s age is unknown', async () => {
    expect(
      await prepareFirstProjectTour({
        readProjectCount: async () => 0,
        readAccount: async () => {
          throw new Error('offline');
        },
      }),
    ).toBeUndefined();
    expect(
      await prepareFirstProjectTour({
        readProjectCount: async () => 0,
        readAccount: async () => ({ isSignedIn: true, createdAt: undefined }),
      }),
    ).toBeUndefined();
    expect(
      await prepareFirstProjectTour({
        readProjectCount: async () => 3,
        readAccount: async () => ({ isSignedIn: false }),
      }),
    ).toBeUndefined();
  });
});
