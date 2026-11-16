/* oxlint-disable no-await-in-loop -- Setup's steps are read in order: each is reached from the one before. */
import { describe, expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { pdfModelName, selectModel } from '#support/chat-attachments.js';
import { reply } from '#support/chat-admission.js';
import { useFlagState } from '#support/flag-state-test.js';

/*
 * The Auto wording, end to end, with every onboarding flag on: Home shows the composer's kernel pill reading `Auto`
 * and no row of kernel chips; no onboarding surface says "Automatic"; setup's
 * Design card carries the `Auto` badge; and in a first project the pill reads `Auto`, then `Auto · <kernel>` once the
 * model's entry exists, with tip 1 of the tour anchored to that composer.
 *
 * Auto is every person's default since AKS-11 (#1982), so nothing turns it on here; the onboarding flags come from
 * the flag-state harness. The chat turn is the scripted gateway fixture, so no provider is called.
 */

const composer = '[aria-label="Ask Tau to build anything..."]';
const kernelPill = () => selectors.getByCss('[data-slot="kernel-pill"]').first();
const kernelChip = (name: string) => selectors.getByRole('button', { name, exact: true });
const stepHeading = (name: string) => selectors.getByRole('heading', { level: 1, name });
const continueButton = () => selectors.getByRole('button', { name: 'Continue', exact: true });
const seedRoute = '/__e2e/project-file-tree?main=touch-parameters';
const seedProjectName = 'Touch parameters e2e';

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

/** The text of the page's main landmark, hidden text for assistive technology included. */
const mainText = async (): Promise<string> => target.evaluate(() => document.querySelector('main')?.textContent ?? '');

/** The kernel pill's text. */
const pillText = async (): Promise<string | undefined> => {
  const text = await target.textContent(kernelPill());
  return text?.trim();
};

/**
 * The scripted first turn: it writes an OpenSCAD model and evaluates it, which makes the file the project's entry,
 * then says so. It parks before its tool calls, so tip 1 can be read while the model does not exist yet.
 */
const firstTurn = [
  reply('Writing a 20 mm cube.', {
    gated: true,
    toolCalls: [
      {
        name: 'create_file',
        args: { targetFile: 'main.scad', content: 'cube([20, 20, 20], center = true);\n' },
      },
    ],
  }),
  reply('', { toolCalls: [{ name: 'evaluate_model', args: { targetFile: 'main.scad' } }] }),
  reply('A 20 mm cube, in OpenSCAD.'),
];

describe('the Auto wording on onboarding surfaces', () => {
  test('shows the Auto pill on Home and no kernel chip row', async () => {
    await useFlagState('all-on');
    await target.setViewport({ width: 1440, height: 900 });
    await target.navigate('/');
    await target.expectVisible(selectors.getByCss(composer), 60_000);
    await target.expectVisible(kernelPill(), 30_000);
    expect(await target.getAttribute(kernelPill(), 'aria-label')).toBe('Kernel: Auto');
    expect(await pillText()).toBe('Auto');
    for (const name of ['OpenSCAD', 'Replicad', 'JSCAD', 'Manifold', 'tscircuit']) {
      expect(await target.isVisible(kernelChip(name)), `${name} chip`).toBe(false);
    }
    expect(await mainText()).not.toMatch(/automatic/iu);
  });

  test('says Auto, and never "Automatic", on every step of setup', async () => {
    await useFlagState('all-on');
    await target.setViewport({ width: 1280, height: 800 });
    await target.navigate('/welcome?entry=help');
    await target.expectVisible(stepHeading('What do you want to make?'), 60_000);
    await target.click(selectors.getByRole('checkbox', { name: /3D printing/u }));

    const texts: string[] = [await mainText()];
    for (const heading of ['Where are you coming from?', 'Make the viewer feel like home', 'Design, verify, build']) {
      await target.click(continueButton());
      await target.expectVisible(stepHeading(heading), 30_000);
      texts.push(await mainText());
    }
    // Step 4's Design card: the Auto badge and its line, with the goal answered.
    expect(texts.at(-1)).toMatch(/Auto\s*picks the kernel from your prompt and what you make, and tells you why/u);
    await target.click(selectors.getByRole('button', { name: 'Finish', exact: true }));
    await target.expectVisible(stepHeading('You’re set'), 30_000);
    texts.push(await mainText());
    for (const text of texts) {
      expect(text).not.toMatch(/automatic/iu);
    }
  });

  test('reads Auto in a first project, then Auto · <kernel> once its model exists', async () => {
    await useFlagState('all-on');
    await target.installAgentHostGatewayFixture(firstTurn);
    await target.setViewport({ width: 1600, height: 1000 });
    await target.navigate('/');
    await target.expectVisible(selectors.getByCss(composer), 60_000);
    expect(await pillText()).toBe('Auto');
    await selectModel(pdfModelName);
    await target.type(selectors.getByCss(composer).first(), 'Make a 20 mm cube.');
    await target.click(selectors.getByCss('button:has(svg.lucide-arrow-up)').last());
    await target.expectUrl(/\/w\/[^/]+\/[^/?]+\?(?:.*&)?chat=/u, 120_000);

    // The turn is parked before it writes anything: the project has no entry, so Auto names no kernel.
    await target.expectVisible(kernelPill(), 60_000);
    await target.waitForAgentHostGatewayGate({ kind: 'stream' }, 120_000);
    expect(await pillText()).toBe('Auto');
    expect(await target.getAttribute(kernelPill(), 'aria-label')).toBe('Kernel: Auto');

    await target.releaseAgentHostGatewayFixture();
    await expect.poll(pillText, { timeout: 120_000 }).toBe('Auto · OpenSCAD');
    expect(await target.getAttribute(kernelPill(), 'aria-label')).toBe('Kernel: Auto, running OpenSCAD');
  });

  test('anchors tip 1 to the composer that carries the Auto pill', async () => {
    await useFlagState('all-on');
    await target.setViewport({ width: 1600, height: 1000 });
    await target.navigate('/');
    await target.expectVisible(selectors.getByCss(composer), 60_000);
    // The tour is wanted, as setup's switch leaves it, so tip 1 opens in the next project.
    await target.evaluate(() => {
      localStorage.setItem(
        'tau-onboarding',
        JSON.stringify({ value: { version: 1, setup: { status: 'completed' }, tour: { wanted: true, seen: [] } } }),
      );
      localStorage.setItem('tau-device', JSON.stringify({ value: { version: 1 } }));
    });
    await openSeed();
    await target.expectVisible(
      selectors.getByRole('dialog', { name: 'Tour tip 1 of 5: Describe what you want' }),
      90_000,
    );
    expect(await pillText()).toMatch(/^Auto(?: · \S.*)?$/u);
    const tipText = await target.textContent(selectors.getByTestId('tour-tip'));
    expect(tipText).toMatch(/You can pick a kernel yourself from the Auto menu\./u);
    expect(tipText).not.toMatch(/automatic/iu);

    const anchor = await target.evaluate((composerSelector) => {
      // oxlint-disable-next-line no-restricted-types -- querySelector answers null for a missing element.
      const box = (element: Element | null) => {
        const rect = element?.getBoundingClientRect();
        return rect === undefined
          ? undefined
          : { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      };
      const tipBox = box(document.querySelector('[data-testid="tour-tip"]'));
      const composerBox = box(document.querySelector(composerSelector));
      /* The tip beside the composer: overlapping it on one axis and within a short reach of it on the other. */
      if (tipBox === undefined || composerBox === undefined) {
        return { beside: false, tipBox, composerBox };
      }
      const reach = 160;
      const horizontalGap = Math.max(composerBox.left - tipBox.right, tipBox.left - composerBox.right, 0);
      const verticalGap = Math.max(composerBox.top - tipBox.bottom, tipBox.top - composerBox.bottom, 0);
      const beside = (verticalGap === 0 && horizontalGap <= reach) || (horizontalGap === 0 && verticalGap <= reach);
      return { beside, tipBox, composerBox };
    }, composer);
    expect(anchor.beside, JSON.stringify(anchor)).toBe(true);
  });
});
