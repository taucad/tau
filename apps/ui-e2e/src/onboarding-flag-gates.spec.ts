/* oxlint-disable no-await-in-loop -- The entry points are checked one after another on one page. */
import { describe, expect } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { flagStateFlags } from '#support/flag-state.js';
import { flagTest, readAppFlags, runsInFlagStates } from '#support/flag-state-test.js';

/*
 * What each flag gates, in the flag state the run is in: Settings → Viewer and setup's viewer step follow
 * `viewerControls`; `/welcome`, its entry points (the invite on home, Help and the command palette) and the setup
 * answers in Settings → Agents follow `onboarding`. With `onboardingAutoOpen` off, those three entry points are the
 * only ways into setup. Run it under each `ui-e2e:test:e2e` configuration.
 */

const composer = '[aria-label="Ask Tau to build anything..."]';
const setupHeading = () => selectors.getByRole('heading', { level: 1, name: 'What do you want to make?' });

const openHome = async (): Promise<void> => {
  await target.setViewport({ width: 1280, height: 800 });
  await target.navigate('/');
  await target.expectVisible(selectors.getByCss(composer), 60_000);
};

const openHelp = async (): Promise<void> => {
  await target.click(selectors.getByRole('button', { name: 'Help', exact: true }));
};

const searchPalette = async (query: string): Promise<void> => {
  await target.click(selectors.getByRole('button', { name: 'Search', exact: true }));
  await target.fill(selectors.getByPlaceholder('Search projects, chats, and actions…'), query);
};

const paletteSetupItem = () => selectors.getByRole('option', { name: /^Set up Tau(?:\s|$)/u });

/** Settings opened over home at one section, and its section list. */
const openSettings = async (section: string): Promise<void> => {
  await target.navigate(`/?settings=${section}`);
  await target.expectVisible(selectors.getByRole('dialog', { name: 'Settings' }), 60_000);
};
const settingsSection = (name: string) =>
  selectors.getByRole('navigation', { name: 'Settings navigation' }).getByRole('button', { name, exact: true });

describe('the onboarding flags gate exactly their surfaces', () => {
  flagTest('resolves the flags of the run’s state', async ({ flagState }) => {
    await openHome();
    expect(await readAppFlags()).toStrictEqual(flagStateFlags[flagState]);
  });

  flagTest('shows Settings → Viewer only with viewerControls on', async ({ flagState }) => {
    const { viewerControls } = flagStateFlags[flagState];
    await openHome();
    await openSettings('viewer');
    await target.expectVisible(settingsSection('General'), 30_000);
    expect(await target.isVisible(settingsSection('Viewer'))).toBe(viewerControls);
    expect(await target.isVisible(selectors.getByRole('region', { name: 'Viewer settings' }))).toBe(viewerControls);
  });

  flagTest('shows the setup answers in Settings → Agents only with onboarding on', async ({ flagState }) => {
    const { onboarding } = flagStateFlags[flagState];
    await openHome();
    await openSettings('agents');
    await target.expectVisible(selectors.getByRole('region', { name: 'Agents settings' }), 30_000);
    await target.expectVisible(selectors.getByRole('switch', { name: 'Project files' }), 30_000);
    expect(await target.isVisible(selectors.getByRole('switch', { name: 'Use my setup answers', exact: true }))).toBe(
      onboarding,
    );
  });

  flagTest('offers setup from the invite, Help and the palette only with onboarding on', async ({ flagState }) => {
    const { onboarding } = flagStateFlags[flagState];
    await openHome();
    expect(await target.isVisible(selectors.getByTestId('setup-invite'))).toBe(onboarding);

    await openHelp();
    await target.expectVisible(selectors.getByRole('menu'), 30_000);
    expect(await target.isVisible(selectors.getByRole('menuitem', { name: 'Set up Tau' }))).toBe(onboarding);
    expect(await target.isVisible(selectors.getByRole('menuitem', { name: 'How Tau works' }))).toBe(onboarding);
    await target.keyboardPress('Escape');

    await searchPalette('Set up');
    await target.delay(500);
    expect(await target.isVisible(paletteSetupItem())).toBe(onboarding);
    await target.keyboardPress('Escape');
  });
});

describe.runIf(runsInFlagStates(['all-off', 'viewer-controls']))('with onboarding off', () => {
  flagTest('sends /welcome home', async () => {
    await target.navigate('/welcome?entry=help');
    await target.expectVisible(selectors.getByCss(composer), 60_000);
    expect(new URL(await target.currentUrl()).pathname).toBe('/');
  });
});

describe.runIf(runsInFlagStates(['all-on', 'viewer-controls-onboarding']))('with onboarding on', () => {
  flagTest('has the viewer step in setup only with viewerControls on', async ({ flagState }) => {
    const { viewerControls } = flagStateFlags[flagState];
    await target.navigate('/welcome?entry=help');
    await target.expectVisible(setupHeading(), 60_000);
    expect(await target.textContent(selectors.getByText(/^1 of \d$/u))).toBe(viewerControls ? '1 of 4' : '1 of 3');
  });

  flagTest('opens setup from the command palette', async () => {
    await openHome();
    await searchPalette('Set up');
    await target.click(paletteSetupItem());
    await target.expectUrl(/\/welcome\?entry=palette$/u, 30_000);
    await target.expectVisible(setupHeading(), 30_000);
  });
});

describe.runIf(runsInFlagStates(['viewer-controls-onboarding']))('with onboardingAutoOpen off', () => {
  flagTest('reaches setup from the invite, Help and the palette, and from nothing else on home', async () => {
    await openHome();
    // Home stays: setup does not open by itself.
    await target.delay(2000);
    expect(new URL(await target.currentUrl()).pathname).toBe('/');

    // Every link into setup on home, with Help open, is one of the three entry points.
    await openHelp();
    await target.expectVisible(selectors.getByRole('menuitem', { name: 'Set up Tau' }), 30_000);
    const entries = await target.evaluate(() =>
      [...document.querySelectorAll<HTMLAnchorElement>('a[href^="/welcome"]')].map((link) =>
        new URL(link.href).searchParams.get('entry'),
      ),
    );
    expect(new Set(entries)).toStrictEqual(new Set(['invite', 'help']));
    await target.keyboardPress('Escape');

    for (const [open, entry] of [
      [
        async () => {
          await target.click(selectors.getByTestId('setup-invite').getByRole('link', { name: 'Set up', exact: true }));
        },
        'invite',
      ],
      [
        async () => {
          await openHelp();
          await target.click(selectors.getByRole('menuitem', { name: 'Set up Tau' }));
        },
        'help',
      ],
      [
        async () => {
          await searchPalette('Set up');
          await target.click(paletteSetupItem());
        },
        'palette',
      ],
    ] as const) {
      await openHome();
      await open();
      await target.expectUrl(new RegExp(`/welcome\\?entry=${entry}$`, 'u'), 30_000);
      await target.expectVisible(setupHeading(), 30_000);
    }
  });
});
