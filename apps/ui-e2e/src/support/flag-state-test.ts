/**
 * The spec side of the flag-state harness (FL4): which state this run is in, a `flagState` fixture, a way to declare
 * the states a spec runs in, and a read of the flags the app resolved.
 *
 * A run takes its state from `TAU_E2E_FLAG_STATE` (one Nx configuration of `ui-e2e:test:e2e` per state), and every
 * target opens in it. A spec that must run in one state whatever the run's is calls {@link useFlagState} before its
 * first navigation.
 */
import { inject, test } from 'vitest';
import { commands, evaluate } from '#support/external-target.js';
import { flagProbeGlobal } from '#support/flag-state.js';
import type { FlagStateName, OnboardingFlags } from '#support/flag-state.js';

/** The flag state this run opens every target in. */
export const runFlagState: FlagStateName = inject('flagState');

/**
 * Whether this run is in one of `states`, for `describe.runIf(runsInFlagStates([...]))`.
 *
 * @param states - The states the spec runs in.
 * @returns Whether it runs in this one.
 */
export const runsInFlagStates = (states: readonly FlagStateName[]): boolean => states.includes(runFlagState);

/** `test` with a `flagState` fixture: the state the test's target opened in. */
export const flagTest = test.extend<{ flagState: FlagStateName }>({
  // oxlint-disable-next-line no-empty-pattern -- Vitest fixtures take their dependencies by destructuring.
  flagState: async ({}, use) => {
    await use(runFlagState);
  },
});

/**
 * Put this test's target in `state`. Call it before the test's first navigation.
 *
 * @param state - The state.
 */
export const useFlagState = async (state: FlagStateName): Promise<void> => {
  await commands.uiSetFlagState(state);
};

/**
 * The onboarding flags the app on the current page resolved.
 *
 * @returns The three flags.
 * @throws When the page's build does not honour a seeded flag state (a deployed build, or `TAU_DEBUG` off).
 */
export const readAppFlags = async (): Promise<OnboardingFlags> =>
  evaluate((probe) => {
    const read = (globalThis as unknown as Record<string, (() => Record<string, boolean>) | undefined>)[probe];
    if (read === undefined) {
      throw new Error(`${probe} is missing: the build does not honour a seeded flag state`);
    }
    const { viewerControls, onboarding, onboardingAutoOpen } = read();
    const flags: OnboardingFlags = { viewerControls, onboarding, onboardingAutoOpen };
    return flags;
  }, flagProbeGlobal);
