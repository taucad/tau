/* oxlint-disable no-await-in-loop -- Setup's steps are walked in order: each answer is given on the step it belongs to. */
import { describe, expect } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { axeAudit, readPageSemantics } from '#support/page-audit.js';
import { flagTest, runsInFlagStates } from '#support/flag-state-test.js';

/* eslint-disable @typescript-eslint/naming-convention -- event and person properties are analytics wire names. */

/*
 * Setup over the whole flow (onboarding plan T6.8): in each flag state the run is in, setup is reachable exactly where
 * it should be; with consent accepted every setup event and person property reaches analytics with exactly its listed
 * properties (M1, M2); with consent declined none does; and axe reports no violation on any step of `/welcome`
 * (QA1). Run it under each `ui-e2e:test:e2e` configuration.
 */

const consentCookieName = 'tau-cookie-consent';
const composer = '[aria-label="Ask Tau to build anything..."]';

/** The onboarding and viewer events setup sends (Finding 12). */
const setupEvents = [
  'onboarding_setup_opened',
  'onboarding_step_completed',
  'onboarding_setup_completed',
  'onboarding_setup_skipped',
  'onboarding_preview_fallback_shown',
  'viewer_preset_selected',
  'viewer_gizmo_selected',
  'viewer_default_changed',
] as const;

/** PostHog's own keys on every event; everything else on an event is the app's. */
const isPostHogKey = (key: string): boolean => key.startsWith('$') || key === 'token' || key === 'distinct_id';

/** The app's properties on each captured event, PostHog's own keys left out. */
const appEvents = async (
  names: readonly string[],
): Promise<Array<Readonly<{ event: string; properties: Record<string, unknown> }>>> => {
  const captured = await target.readPostHogEvents(names);
  return captured.map(({ event, properties }) => ({
    event,
    properties: Object.fromEntries(Object.entries(properties).filter(([key]) => !isPostHogKey(key))),
  }));
};

/** Every person property set with `$set`, merged in capture order. */
const personProperties = async (): Promise<Record<string, unknown>> => {
  const merged: Record<string, unknown> = {};
  for (const { properties } of await target.readPostHogEvents(['$set'])) {
    Object.assign(merged, properties['$set'] as Record<string, unknown> | undefined);
  }
  return merged;
};

/** Each `setup_status` value set with `$set`, in order. */
const setupStatuses = async (): Promise<unknown[]> => {
  const captured = await target.readPostHogEvents(['$set']);
  return captured
    .map(({ properties }) => (properties['$set'] as Record<string, unknown> | undefined)?.['setup_status'])
    .filter((status) => status !== undefined);
};

/**
 * Record a decision as the marketing site does, in the shared cookie, and prompt the app to re-read it (the same
 * route `analytics-consent.spec.ts` takes).
 */
const decide = async (status: 'accepted' | 'declined'): Promise<void> => {
  await target.addCookies([
    {
      name: consentCookieName,
      value: encodeURIComponent(JSON.stringify({ status, version: 1 })),
      url: new URL('/', await target.currentUrl()).toString(),
    },
  ]);
  await target.evaluate(() => {
    globalThis.dispatchEvent(new Event('focus'));
  });
};

const openHome = async (): Promise<void> => {
  await target.navigate('/');
  await target.expectVisible(selectors.getByRole('main'), 60_000);
};

const stepHeading = (name: string) => selectors.getByRole('heading', { level: 1, name });
const continueButton = () => selectors.getByRole('button', { name: 'Continue', exact: true });

/** Help → "Set up Tau", which opens setup at step 1 with `entry=help`. */
const openSetupFromHelp = async (): Promise<void> => {
  await target.click(selectors.getByRole('button', { name: 'Help', exact: true }));
  await target.click(selectors.getByRole('menuitem', { name: 'Set up Tau' }));
  await target.expectUrl(/\/welcome\?entry=help$/u, 30_000);
  await target.expectVisible(stepHeading('What do you want to make?'), 30_000);
};

/**
 * Answer every step and finish: 3D printing; Blender, which suggests middle-drag orbit with Shift pan and axis balls;
 * then Right-drag orbit, the Axes gizmo and the trackpad switch, none of them the suggestion.
 */
const answerEveryStep = async (): Promise<void> => {
  await target.click(selectors.getByRole('checkbox', { name: /3D printing/u }));
  await target.click(continueButton());
  await target.expectVisible(stepHeading('Where are you coming from?'));
  await target.click(selectors.getByRole('radio', { name: 'Blender', exact: true }));
  await target.click(continueButton());
  await target.expectVisible(stepHeading('Make the viewer feel like home'));
  await target.click(
    selectors.getByRole('group', { name: 'Mouse controls' }).getByRole('radio', { name: /Right-drag orbit/u }),
  );
  await target.click(selectors.getByRole('radio', { name: 'Axes', exact: true }));
  await target.click(selectors.getByRole('switch', { name: 'I use a trackpad' }));
  await target.click(continueButton());
  await target.expectVisible(stepHeading('Design, verify, build'));
  await target.click(selectors.getByRole('button', { name: 'Finish', exact: true }));
  await target.expectVisible(stepHeading('You’re set'), 30_000);
};

describe.runIf(runsInFlagStates(['all-off', 'viewer-controls']))('setup with onboarding off', () => {
  flagTest('has no entry in Help and sends /welcome home', async () => {
    await openHome();
    await target.click(selectors.getByRole('button', { name: 'Help', exact: true }));
    expect(await target.isVisible(selectors.getByRole('menuitem', { name: 'Set up Tau' }))).toBe(false);
    expect(await target.isVisible(selectors.getByRole('menuitem', { name: 'How Tau works' }))).toBe(false);
    await target.keyboardPress('Escape');

    await target.navigate('/welcome');
    await target.expectVisible(selectors.getByCss(composer), 60_000);
    expect(new URL(await target.currentUrl()).pathname).toBe('/');
  });
});

describe.runIf(runsInFlagStates(['all-on', 'viewer-controls-onboarding']))('setup with onboarding on', () => {
  flagTest('captures every setup event and person property with exactly its properties (M1, M2)', async () => {
    await target.installPostHogFixture('phc_test_key');
    await openHome();
    await decide('accepted');
    await expect
      .poll(async () => {
        const summary = await target.readPostHogSummary([]);
        return summary.events.includes('$pageview');
      })
      .toBe(true);

    await openSetupFromHelp();
    await answerEveryStep();

    await expect
      .poll(
        async () => {
          const completed = await appEvents(['onboarding_setup_completed']);
          return completed.length;
        },
        { timeout: 30_000 },
      )
      .toBe(1);
    const events = await appEvents(setupEvents);
    expect(events.filter(({ event }) => event !== 'onboarding_setup_completed')).toStrictEqual([
      { event: 'onboarding_setup_opened', properties: { entry: 'help', host: 'web' } },
      { event: 'onboarding_step_completed', properties: { step: 'goals', answered: true } },
      { event: 'onboarding_step_completed', properties: { step: 'background', answered: true } },
      { event: 'viewer_preset_selected', properties: { preset: 'right-orbit', suggested: false, source: 'setup' } },
      { event: 'viewer_gizmo_selected', properties: { style: 'axes', suggested: false, source: 'setup' } },
      { event: 'onboarding_step_completed', properties: { step: 'viewer', answered: true } },
      { event: 'onboarding_step_completed', properties: { step: 'how', answered: true } },
    ]);
    const completed = events.find(({ event }) => event === 'onboarding_setup_completed');
    expect(Object.keys(completed?.properties ?? {}).toSorted()).toStrictEqual([
      'duration_ms',
      'steps_answered',
      'tour_wanted',
    ]);
    expect(completed?.properties).toStrictEqual({
      steps_answered: 3,
      duration_ms: expect.any(Number) as unknown,
      tour_wanted: true,
    });

    // Other surfaces may set their own person properties; setup's six hold these values.
    expect(await personProperties()).toMatchObject({
      setup_status: 'completed',
      goals: ['printing'],
      tool: 'blender',
      mouse_preset: 'right-orbit',
      gizmo_style: 'axes',
      input_device: 'trackpad',
    });
    expect(await setupStatuses()).toStrictEqual(['offered', 'completed']);
  });

  flagTest('captures a skip with the step it happened on', async () => {
    await target.installPostHogFixture('phc_test_key');
    await openHome();
    await decide('accepted');
    await openSetupFromHelp();
    await target.click(continueButton());
    await target.expectVisible(stepHeading('Where are you coming from?'));
    await target.click(selectors.getByRole('button', { name: 'Skip setup' }));
    await target.expectVisible(selectors.getByCss(composer), 60_000);

    await expect
      .poll(async () => appEvents(['onboarding_setup_skipped']))
      .toStrictEqual([{ event: 'onboarding_setup_skipped', properties: { at_step: 'background' } }]);
    expect(await setupStatuses()).toStrictEqual(['offered', 'skipped']);
  });

  flagTest('sends nothing to analytics with consent declined (M1)', async () => {
    await target.installPostHogFixture('phc_test_key');
    await openHome();
    await decide('declined');
    await openSetupFromHelp();
    await answerEveryStep();
    /* Give a late capture the time to reach the network before reading what was sent. */
    await target.delay(2000);

    expect(await target.readPostHogEvents([...setupEvents, '$set'])).toStrictEqual([]);
    const summary = await target.readPostHogSummary([]);
    expect(summary.requests).toStrictEqual([]);
  });

  flagTest('reaches "How Tau works" from Help at step 4 (E3)', async () => {
    await openHome();
    await target.click(selectors.getByRole('button', { name: 'Help', exact: true }));
    await target.click(selectors.getByRole('menuitem', { name: 'How Tau works' }));
    await target.expectUrl(/\/welcome\?entry=help&step=how$/u, 30_000);
    await target.expectVisible(stepHeading('Design, verify, build'), 30_000);
  });

  flagTest('meets axe with no violation on every step of /welcome (QA1)', async () => {
    await target.setViewport({ width: 1280, height: 800 });
    await target.navigate('/welcome?entry=help');
    await target.expectVisible(stepHeading('What do you want to make?'), 60_000);
    const findings: Record<string, unknown> = {};
    const audit = async (step: string): Promise<void> => {
      const semantics = await readPageSemantics();
      const { violations } = await axeAudit();
      findings[step] = { semantics, violations };
      expect.soft(violations, `${step}: axe violations`).toStrictEqual([]);
      expect.soft(semantics.headingOnes, `${step}: exactly one h1`).toHaveLength(1);
      expect.soft(semantics.mainLandmarks, `${step}: one main landmark`).toBe(1);
    };

    await audit('goals');
    for (const [heading, step] of [
      ['Where are you coming from?', 'background'],
      ['Make the viewer feel like home', 'viewer'],
      ['Design, verify, build', 'how'],
    ] as const) {
      await target.click(continueButton());
      await target.expectVisible(stepHeading(heading), 30_000);
      await audit(step);
    }
    await target.click(selectors.getByRole('button', { name: 'Finish', exact: true }));
    await target.expectVisible(stepHeading('You’re set'), 30_000);
    await audit('finish');
    await target.writeArtifact('onboarding-setup/axe.json', `${JSON.stringify(findings, null, 2)}\n`);
  });
});

describe.runIf(runsInFlagStates(['all-on']))('setup auto-open with onboardingAutoOpen on (E1)', () => {
  flagTest('opens by itself once for a new account reaching home', async () => {
    await target.authenticateTauTestUser({
      email: `onboarding-setup-${globalThis.crypto.randomUUID()}@e2e.tau`,
      name: 'Onboarding Setup E2E',
      password: 'Tau-test-password-7!',
    });
    await target.navigate('/');
    await target.expectUrl(/\/welcome\?entry=signup$/u, 60_000);
    await target.expectVisible(stepHeading('What do you want to make?'), 30_000);

    // `offered` is stored, so a return to home stays there.
    await target.click(selectors.getByRole('button', { name: 'Skip setup' }));
    await target.expectVisible(selectors.getByCss(composer), 60_000);
    await target.reload();
    await target.expectVisible(selectors.getByCss(composer), 60_000);
    await target.delay(2000);
    expect(new URL(await target.currentUrl()).pathname).toBe('/');
  });
});

describe.runIf(runsInFlagStates(['viewer-controls-onboarding']))('setup with onboardingAutoOpen off (FL4)', () => {
  flagTest('does not open by itself; the invite on home opens it', async () => {
    await target.authenticateTauTestUser({
      email: `onboarding-invite-${globalThis.crypto.randomUUID()}@e2e.tau`,
      name: 'Onboarding Invite E2E',
      password: 'Tau-test-password-7!',
    });
    await openHome();
    await target.expectVisible(selectors.getByTestId('setup-invite'), 60_000);
    await target.delay(2000);
    expect(new URL(await target.currentUrl()).pathname).toBe('/');

    await target.click(selectors.getByTestId('setup-invite').getByRole('link', { name: 'Set up', exact: true }));
    await target.expectUrl(/\/welcome\?entry=invite$/u, 30_000);
    await target.expectVisible(stepHeading('What do you want to make?'), 30_000);
  });
});

/* eslint-enable @typescript-eslint/naming-convention -- restore application naming rules. */
