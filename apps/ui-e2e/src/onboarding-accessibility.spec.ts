/* oxlint-disable no-await-in-loop -- Setup's steps are audited in order: each is reached from the one before. */
import { describe, expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { pageAxeViolations, readPageSemantics } from '#support/page-audit.js';
import { useFlagState } from '#support/flag-state-test.js';

/*
 * The onboarding accessibility audit, in one spec: axe reports no violation on any step of `/welcome`, on Settings →
 * Viewer, or on the editor with a tour tip open. It puts itself in the state with every flag on, whatever the run's
 * state, so it runs under every `ui-e2e:test:e2e` configuration. The two shell nodes axe finds outside a landmark on
 * every route (`shellNodesOutsideLandmarks`) are the shell's, and are left out. The screen-reader half of the audit is a manual run
 * from the VoiceOver and NVDA scripts kept with the onboarding blueprint.
 */

const seedRoute = '/__e2e/project-file-tree?main=touch-parameters';
const seedProjectName = 'Touch parameters e2e';

const stepHeading = (name: string) => selectors.getByRole('heading', { level: 1, name });
const continueButton = () => selectors.getByRole('button', { name: 'Continue', exact: true });
const tip = () => selectors.getByTestId('tour-tip');

/** Every finding, written as one artifact at the end of each test. */
type Findings = Record<string, unknown>;

/**
 * Run axe over the whole document, with the app shell's own nodes outside a landmark left out, and keep its findings.
 *
 * @param findings - Where to keep them.
 * @param name - What was audited.
 */
const audit = async (findings: Findings, name: string): Promise<void> => {
  const violations = await pageAxeViolations();
  findings[name] = violations;
  expect.soft(violations, `${name}: axe violations`).toStrictEqual([]);
};

/** Store a guided tour that is wanted and untouched, and no pause, on this browser profile. */
const askForTheTour = async (): Promise<void> => {
  await target.evaluate(() => {
    globalThis.localStorage.setItem(
      'tau-onboarding',
      JSON.stringify({ value: { version: 1, setup: { status: 'completed' }, tour: { wanted: true, seen: [] } } }),
    );
    globalThis.localStorage.setItem('tau-device', JSON.stringify({ value: { version: 1 } }));
  });
};

/** Open the touch-parameters seed, from the project list when a reused browser already holds it. */
const openSeed = async (): Promise<void> => {
  await target.navigate(seedRoute);
  try {
    await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 10_000);
  } catch {
    const project = selectors.getByRole('link', { name: seedProjectName }).first();
    await target.expectVisible(project, 60_000);
    const href = await target.getAttribute(project, 'href');
    if (!href) {
      throw new Error('Seeded project link did not include an href.');
    }
    await target.navigate(href);
    await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
  }
};

describe('onboarding accessibility', () => {
  test('meets axe on every step of /welcome', async () => {
    await useFlagState('all-on');
    await target.setViewport({ width: 1280, height: 800 });
    await target.navigate('/welcome?entry=help');
    await target.expectVisible(stepHeading('What do you want to make?'), 60_000);
    const findings: Findings = {};

    await audit(findings, 'goals');
    for (const [heading, step] of [
      ['Where are you coming from?', 'background'],
      ['Make the viewer feel like home', 'viewer'],
      ['Design, verify, build', 'how'],
    ] as const) {
      await target.click(continueButton());
      await target.expectVisible(stepHeading(heading), 30_000);
      await audit(findings, step);
    }
    await target.click(selectors.getByRole('button', { name: 'Finish', exact: true }));
    await target.expectVisible(stepHeading('You’re set'), 30_000);
    await audit(findings, 'finish');
    const { headingOnes, mainLandmarks } = await readPageSemantics();
    expect.soft(headingOnes).toHaveLength(1);
    expect.soft(mainLandmarks).toBe(1);
    await target.writeArtifact('onboarding-accessibility/welcome.json', `${JSON.stringify(findings, null, 2)}\n`);
  });

  test('meets axe on Settings → Viewer', async () => {
    await useFlagState('all-on');
    await target.setViewport({ width: 1280, height: 800 });
    await target.navigate('/');
    await target.expectVisible(selectors.getByRole('main'), 60_000);
    await target.navigate('/?settings=viewer');
    const region = selectors.getByRole('region', { name: 'Viewer settings' });
    await target.expectVisible(region, 60_000);
    await target.expectVisible(region.getByText('Mouse controls').first(), 30_000);
    const findings: Findings = {};

    await audit(findings, 'settings-viewer');
    await target.writeArtifact(
      'onboarding-accessibility/settings-viewer.json',
      `${JSON.stringify(findings, null, 2)}\n`,
    );
  });

  test('meets axe on the editor with a tour tip open', async () => {
    await useFlagState('all-on');
    await target.setViewport({ width: 1600, height: 1000 });
    await target.navigate('/');
    await target.expectVisible(selectors.getByRole('main'), 60_000);
    await askForTheTour();
    await openSeed();
    await target.expectVisible(
      selectors.getByRole('dialog', { name: 'Tour tip 1 of 5: Describe what you want' }),
      90_000,
    );
    await target.expectVisible(selectors.getByCss('canvas[data-engine]').first(), 60_000);
    const findings: Findings = {};

    await audit(findings, 'editor-tip-1');
    // The second tip sits inside the viewer, the one tip that overlaps its target.
    await target.click(tip().getByRole('button', { name: 'Next', exact: true }));
    await target.expectVisible(selectors.getByRole('dialog', { name: 'Tour tip 2 of 5: Look around' }), 90_000);
    await audit(findings, 'editor-tip-2');
    await target.writeArtifact('onboarding-accessibility/editor.json', `${JSON.stringify(findings, null, 2)}\n`);
  });
});
