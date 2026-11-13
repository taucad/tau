import { afterEach, expect, test } from 'vitest';
import type { Locator, Page } from 'playwright';
import { launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { expectVisible } from '#support/scenario.js';
/* eslint-disable @nx/enforce-module-boundaries -- Both e2e harnesses share one definition of the FL4 flag states; no production dependency is introduced. */
// oxlint-disable-next-line no-restricted-imports -- The flag states are harness-only data both hosts must agree on.
import { flagProbeGlobal, flagStateFlags, flagStateNames } from '../../ui-e2e/src/support/flag-state.ts';
// oxlint-disable-next-line no-restricted-imports -- The resolved-flags type is shared by the two harnesses only.
import type { FlagStateName, OnboardingFlags } from '../../ui-e2e/src/support/flag-state.ts';
/* eslint-enable @nx/enforce-module-boundaries -- Restore normal boundaries after the harness-only imports. */

/*
 * FL4 harness smoke on desktop (T0.4): each launch opens the renderer in the flag state it names, and the app
 * resolves exactly that state. A stored `tau:flags` override changes nothing (FL1, FL2).
 */

let session: DesktopSession | undefined;

afterEach(async ({ task }) => {
  try {
    if (task.result?.state === 'fail') {
      await session?.capture('desktop-flag-state-failure');
    }
  } finally {
    await session?.close();
    session = undefined;
  }
});

const readAppFlags = async (current: DesktopSession): Promise<OnboardingFlags> =>
  current.page.evaluate((probe) => {
    const read = (globalThis as unknown as Record<string, (() => OnboardingFlags) | undefined>)[probe];
    if (read === undefined) {
      throw new Error(`${probe} is missing: the renderer does not honour a seeded flag state`);
    }
    const { viewerControls, onboarding, onboardingAutoOpen } = read();
    const flags: OnboardingFlags = { viewerControls, onboarding, onboardingAutoOpen };
    return flags;
  }, flagProbeGlobal);

/**
 * The screen a fresh launch opens on. `onboardingAutoOpen` sends a first run to setup at `/welcome` (#1925), which
 * has no composer; every other state opens Home. A reload stays on whichever it is.
 */
const firstScreen = (page: Page, state: FlagStateName): Locator =>
  flagStateFlags[state].onboardingAutoOpen
    ? page.getByRole('heading', { level: 1, name: 'What do you want to make?' })
    : page.locator('[aria-label="Ask Tau to build anything..."]');

test.for(flagStateNames)('opens the renderer in the %s flag state', async (state) => {
  session = await launchDesktopApp({ token: 'unused', flagState: state });
  const { page } = session;
  await expectVisible(firstScreen(page, state), 120_000);
  expect(await readAppFlags(session)).toStrictEqual(flagStateFlags[state]);

  await page.evaluate(() => {
    localStorage.setItem(
      'tau:flags',
      JSON.stringify({ viewerControls: true, onboarding: true, onboardingAutoOpen: true }),
    );
  });
  await page.reload({ waitUntil: 'load' });
  await expectVisible(firstScreen(page, state), 120_000);
  expect(await readAppFlags(session)).toStrictEqual(flagStateFlags[state]);
});
