/**
 * When setup opens by itself (onboarding blueprint, Finding 3, E1): at most once per device, never for someone who
 * was already using Tau there, and never in the way of a destination the person chose. Pure: the home hook passes in
 * what it read, and nothing here makes a request.
 */
import type { OnboardingState } from '@taucad/preferences';

/** How long an account counts as new. Milliseconds. */
export const newAccountWindow = 7 * 24 * 60 * 60 * 1000;

/** What the decision reads. */
export type SetupOfferInput = Readonly<{
  /** The `onboarding` and `onboardingAutoOpen` flags. */
  isOnboardingEnabled: boolean;
  isAutoOpenEnabled: boolean;
  /** Home's address, after it removed its own `?app` marker. */
  location: Readonly<{ pathname: string; search: string }>;
  /** The device's onboarding section. */
  onboarding: OnboardingState;
  /** The signed-in account's creation time in epoch milliseconds, or `undefined` when signed out. */
  accountCreatedAt: number | undefined;
  /** Desktop: this install's first run (no window-state file, an empty project list, no link or file at launch). */
  isDesktopFirstRun: boolean;
  /** A key press, a pointer press or composer focus on home since the page loaded. */
  hasUsedHome: boolean;
  /** Now, in epoch milliseconds. */
  now: number;
}>;

/**
 * Whether home should open setup now. True only when every line of Finding 3 holds:
 *
 * 1. `onboarding` and `onboardingAutoOpen` are on;
 * 2. the location is exactly `/` with no query;
 * 3. the device has no setup record and no tour progress;
 * 4. the person is new: an account created within seven days, or the desktop's first run;
 * 5. the person has not started using home.
 *
 * @param input - What home read.
 * @returns Whether to open setup.
 */
export const shouldOfferSetup = (input: SetupOfferInput): boolean => {
  if (!input.isOnboardingEnabled || !input.isAutoOpenEnabled) {
    return false;
  }
  if (input.location.pathname !== '/' || input.location.search !== '') {
    return false;
  }
  if (input.onboarding.setup !== undefined || input.onboarding.tour.seen.length > 0) {
    return false;
  }
  const isNewAccount =
    input.accountCreatedAt !== undefined &&
    input.now - input.accountCreatedAt >= 0 &&
    input.now - input.accountCreatedAt < newAccountWindow;
  if (!isNewAccount && !input.isDesktopFirstRun) {
    return false;
  }
  return !input.hasUsedHome;
};

/**
 * The invite on home (E2): shown with `onboarding` on, on a device with no setup record whose invite was not
 * dismissed.
 *
 * @param input - The flag, the onboarding section and whether the invite was dismissed here.
 * @returns Whether to show the invite.
 */
export const shouldShowSetupInvite = (
  input: Readonly<{ isOnboardingEnabled: boolean; onboarding: OnboardingState; isDismissed: boolean }>,
): boolean => input.isOnboardingEnabled && input.onboarding.setup === undefined && !input.isDismissed;

/**
 * An account's creation time from the session, which may carry it as a `Date`, an ISO string or epoch milliseconds.
 *
 * @param createdAt - The session's `user.createdAt`.
 * @returns Epoch milliseconds, or `undefined` when absent or unreadable.
 */
export const readAccountCreatedAt = (createdAt: unknown): number | undefined => {
  let time: number | undefined;
  if (createdAt instanceof Date) {
    time = createdAt.getTime();
  } else if (typeof createdAt === 'string') {
    time = Date.parse(createdAt);
  } else if (typeof createdAt === 'number') {
    time = createdAt;
  }
  return time === undefined || Number.isNaN(time) ? undefined : time;
};
