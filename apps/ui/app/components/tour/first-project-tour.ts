/**
 * A newcomer's first project asks for the guided tour, even when they never opened setup. "Newcomer" means the
 * project list was empty and, when signed in, the account is new. Someone who skipped setup, or who already chose in
 * setup whether to see the tour, is left as they are.
 */

import type { OnboardingState } from '@taucad/preferences';
import { newAccountWindow, readAccountCreatedAt } from '#components/onboarding/should-offer-setup.js';
import { isFeatureEnabled } from '#flags/feature-flags.js';
import { personRecordStores } from '#preferences/person-record.store.js';

/** What the decision reads. */
export type FirstProjectTourInput = Readonly<{
  isOnboardingEnabled: boolean;
  onboarding: OnboardingState;
  /** Projects before this one, trashed ones included. */
  projectCount: number;
  /** The signed-in account's creation time in epoch milliseconds, or `undefined` when signed out. */
  accountCreatedAt: number | undefined;
  now: number;
}>;

/**
 * Whether the record alone allows the first-project tour: the flag is on, setup was not skipped, and nothing about
 * the tour has been chosen, seen or ended. Checked before anything is read from the workspace or the session.
 *
 * @param input - The flag and the onboarding section.
 * @returns Whether to look further.
 */
export const mayWantFirstProjectTour = (
  input: Pick<FirstProjectTourInput, 'isOnboardingEnabled' | 'onboarding'>,
): boolean => {
  const { setup, tour } = input.onboarding;
  return (
    input.isOnboardingEnabled &&
    setup?.status !== 'skipped' &&
    tour.wanted === undefined &&
    tour.ended === undefined &&
    tour.seen.length === 0
  );
};

/**
 * Whether creating this project should ask for the guided tour.
 *
 * @param input - The flag, the record, the project count and the account.
 * @returns Whether to store `tour.wanted = true`.
 */
export const wantsFirstProjectTour = (input: FirstProjectTourInput): boolean =>
  mayWantFirstProjectTour(input) &&
  input.projectCount === 0 &&
  (input.accountCreatedAt === undefined ||
    (input.now - input.accountCreatedAt >= 0 && input.now - input.accountCreatedAt < newAccountWindow));

/** Where the decision reads the workspace and the session. */
export type FirstProjectTourPorts = Readonly<{
  /** Projects in the workspace, trashed ones included. */
  readProjectCount: () => Promise<number>;
  /** The session: signed out, or signed in with the user's `createdAt`. Throws when it cannot be read. */
  readAccount: () => Promise<Readonly<{ isSignedIn: false }> | Readonly<{ isSignedIn: true; createdAt: unknown }>>;
}>;

/**
 * Decide, before a project is created, whether it is a newcomer's first. Nothing is read from the workspace or the
 * session unless the flag and the record allow it, and a session that cannot be read asks for nothing.
 *
 * @param ports - The workspace and session reads.
 * @returns A function to call once the project exists, or `undefined` when nothing is to be stored.
 */
export const prepareFirstProjectTour = async (ports: FirstProjectTourPorts): Promise<(() => void) | undefined> => {
  const isOnboardingEnabled = isFeatureEnabled('onboarding');
  if (!mayWantFirstProjectTour({ isOnboardingEnabled, onboarding: personRecordStores.onboarding.read() })) {
    return undefined;
  }
  try {
    const projectCount = await ports.readProjectCount();
    if (projectCount > 0) {
      return undefined;
    }
    const account = await ports.readAccount();
    const accountCreatedAt = account.isSignedIn ? readAccountCreatedAt(account.createdAt) : undefined;
    /* A signed-in account whose age cannot be read is not taken for a new one. */
    if (account.isSignedIn && accountCreatedAt === undefined) {
      return undefined;
    }
    const isWanted = wantsFirstProjectTour({
      isOnboardingEnabled,
      onboarding: personRecordStores.onboarding.read(),
      projectCount,
      accountCreatedAt,
      now: Date.now(),
    });
    return isWanted
      ? () => {
          personRecordStores.onboarding.write({ wanted: true });
        }
      : undefined;
  } catch {
    return undefined;
  }
};
