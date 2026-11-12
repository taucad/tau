import { describe, expect, it } from 'vitest';
import { emptyOnboardingState } from '@taucad/preferences';
import {
  readAccountCreatedAt,
  newAccountWindow,
  shouldOfferSetup,
  shouldShowSetupInvite,
} from '#components/onboarding/should-offer-setup.js';
import type { SetupOfferInput } from '#components/onboarding/should-offer-setup.js';

const now = Date.UTC(2026, 10, 12);
const day = 24 * 60 * 60 * 1000;

const newAccount: SetupOfferInput = {
  isOnboardingEnabled: true,
  isAutoOpenEnabled: true,
  location: { pathname: '/', search: '' },
  onboarding: emptyOnboardingState,
  accountCreatedAt: now - day,
  isDesktopFirstRun: false,
  hasUsedHome: false,
  now,
};

describe('shouldOfferSetup', () => {
  it('opens for a new account on plain home', () => {
    expect(shouldOfferSetup(newAccount)).toBe(true);
  });

  it('opens on the desktop first run with no account', () => {
    expect(shouldOfferSetup({ ...newAccount, accountCreatedAt: undefined, isDesktopFirstRun: true })).toBe(true);
  });

  it.each<[string, Partial<SetupOfferInput>]>([
    ['onboarding off (line 1)', { isOnboardingEnabled: false }],
    ['onboardingAutoOpen off', { isAutoOpenEnabled: false }],
    ['auto-open on but onboarding off', { isOnboardingEnabled: false, isAutoOpenEnabled: true }],
    ['a settings deep link (line 2)', { location: { pathname: '/', search: '?settings=billing' } }],
    ['a Checkout return (line 2)', { location: { pathname: '/', search: '?settings=billing&payment_action=x' } }],
    ['home still carrying ?app (line 2)', { location: { pathname: '/', search: '?app' } }],
    ['an invitation (line 2)', { location: { pathname: '/invitations/abc', search: '' } }],
    ['a share (line 2)', { location: { pathname: '/s/slug', search: '' } }],
    ['an import (line 2)', { location: { pathname: '/import/repo', search: '' } }],
    ['a project (line 2)', { location: { pathname: '/w/me/bracket', search: '' } }],
    [
      'a device with a setup record (line 3)',
      { onboarding: { version: 1, setup: { status: 'offered' }, tour: { seen: [] } } },
    ],
    ['setup skipped (line 3)', { onboarding: { version: 1, setup: { status: 'skipped' }, tour: { seen: [] } } }],
    ['setup completed (line 3)', { onboarding: { version: 1, setup: { status: 'completed' }, tour: { seen: [] } } }],
    ['tour progress on the device (line 3)', { onboarding: { version: 1, tour: { seen: ['ask'] } } }],
    ['an account older than seven days (line 4)', { accountCreatedAt: now - newAccountWindow - 1 }],
    ['signed out in the browser (line 4)', { accountCreatedAt: undefined }],
    ['a desktop install that has run before (line 4)', { accountCreatedAt: undefined, isDesktopFirstRun: false }],
    ['a key press, pointer press or composer focus on home (line 5)', { hasUsedHome: true }],
  ])('never opens for %s', (_name, change) => {
    expect(shouldOfferSetup({ ...newAccount, ...change })).toBe(false);
  });
});

describe('shouldShowSetupInvite', () => {
  it('shows with onboarding on on a device with no setup record', () => {
    expect(
      shouldShowSetupInvite({ isOnboardingEnabled: true, onboarding: emptyOnboardingState, isDismissed: false }),
    ).toBe(true);
  });

  it('shows to someone following tips who has no setup record', () => {
    expect(
      shouldShowSetupInvite({
        isOnboardingEnabled: true,
        onboarding: { version: 1, tour: { seen: ['ask'] } },
        isDismissed: false,
      }),
    ).toBe(true);
  });

  it.each<[string, Parameters<typeof shouldShowSetupInvite>[0]]>([
    ['onboarding off', { isOnboardingEnabled: false, onboarding: emptyOnboardingState, isDismissed: false }],
    ['dismissed', { isOnboardingEnabled: true, onboarding: emptyOnboardingState, isDismissed: true }],
    [
      'setup opened',
      {
        isOnboardingEnabled: true,
        onboarding: { version: 1, setup: { status: 'offered' }, tour: { seen: [] } },
        isDismissed: false,
      },
    ],
  ])('is absent when %s', (_name, input) => {
    expect(shouldShowSetupInvite(input)).toBe(false);
  });
});

describe('readAccountCreatedAt', () => {
  it('reads a Date, an ISO string and epoch milliseconds', () => {
    expect(readAccountCreatedAt(new Date(now))).toBe(now);
    expect(readAccountCreatedAt(new Date(now).toISOString())).toBe(now);
    expect(readAccountCreatedAt(now)).toBe(now);
    expect(readAccountCreatedAt('not a date')).toBeUndefined();
    expect(readAccountCreatedAt(undefined)).toBeUndefined();
  });
});
