import { describe, expect } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { flagStateFlags, flagStateNames } from '#support/flag-state.js';
import { flagTest, readAppFlags, useFlagState } from '#support/flag-state-test.js';

/*
 * FL4 harness smoke (T0.4): the app resolves exactly the flag state the run, or the test, put it in. Run it under
 * each `ui-e2e:test:e2e` configuration (`-c all-off|viewer-controls|all-on|viewer-controls-onboarding`).
 */

const openHome = async (): Promise<void> => {
  await target.navigate('/');
  await target.expectVisible(selectors.getByRole('main'), 60_000);
};

describe('flag-state harness', () => {
  flagTest("resolves the run's flag state", async ({ flagState }) => {
    await openHome();
    expect(await readAppFlags()).toStrictEqual(flagStateFlags[flagState]);
  });

  flagTest.for(flagStateNames)('can put one test in the %s state', async (state) => {
    await useFlagState(state);
    await openHome();
    expect(await readAppFlags()).toStrictEqual(flagStateFlags[state]);
    // The state holds across a reload, and a stored `tau:flags` override changes nothing (FL1, FL2).
    await target.evaluate(() => {
      localStorage.setItem(
        'tau:flags',
        JSON.stringify({ viewerControls: true, onboarding: true, onboardingAutoOpen: true }),
      );
    });
    await target.reload();
    await target.expectVisible(selectors.getByRole('main'), 60_000);
    expect(await readAppFlags()).toStrictEqual(flagStateFlags[state]);
  });
});
