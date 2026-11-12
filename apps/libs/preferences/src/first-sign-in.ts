import { overlayLeaves } from '#leaf-merge.js';
import { mergeOnboarding, onboardingDeltaOf } from '#onboarding-state.js';
import type { OnboardingState } from '#onboarding-state.js';
import type { PersonProfile } from '#person-profile.js';
import type { ViewerPreferences } from '#viewer-preferences.js';

/**
 * The sections that follow the person through the account once sync exists. The device record never syncs.
 *
 * @public
 */
export type SyncedSections = {
  'person-profile': PersonProfile;
  'viewer-preferences': ViewerPreferences;
  onboarding: OnboardingState;
};

/**
 * Merge this device's copy of a section with the account's on a device that has never synced, the
 * first time account sync runs there.
 * With no account copy the device's is uploaded unchanged; with no device copy the account's is adopted. With both,
 * `person-profile` and `viewer-preferences` take the account's value leaf by leaf and the device fills only leaves the
 * account does not hold; `onboarding` merges by its own rules, so progress is never lost. No stored value changes
 * shape. Launch has no caller.
 *
 * @param section - The section's key.
 * @param device - This device's value, if it holds one.
 * @param account - The account's value, if it holds one.
 * @returns The value both should hold, or `undefined` when neither holds one.
 *
 * @public
 */
export const firstSignInMerge = <K extends keyof SyncedSections>(
  section: K,
  device: SyncedSections[K] | undefined,
  account: SyncedSections[K] | undefined,
): SyncedSections[K] | undefined => {
  if (account === undefined) {
    return device;
  }
  if (device === undefined) {
    return account;
  }
  if (section === 'onboarding') {
    return mergeOnboarding(
      device as OnboardingState,
      onboardingDeltaOf(account as OnboardingState),
    ) as SyncedSections[K];
  }
  return overlayLeaves(device, account);
};
