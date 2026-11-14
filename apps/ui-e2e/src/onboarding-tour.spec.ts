/* oxlint-disable no-await-in-loop -- The tour's tips are walked in order: each one is answered on its own tip. */
import { describe, expect } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { axeAudit, measureHorizontalOverflow } from '#support/page-audit.js';
import { flagTest, runsInFlagStates } from '#support/flag-state-test.js';

/*
 * The product tour on a project page, in the flag states that turn `onboarding` on: a guided run through the five
 * tips with every tour event carrying exactly its listed properties; Escape left to whatever has focus while a tip is
 * open (a CodeMirror completion, the viewer); axe on the editor with a tip open; and the phone layout, where a tip
 * stays inside the window at 320 and 768 pixels wide.
 *
 * The tour is asked for by writing the person record before the project opens, as setup's switch does.
 */

const seedRoute = '/__e2e/project-file-tree?main=touch-parameters';
const seedProjectName = 'Touch parameters e2e';
const consentCookieName = 'tau-cookie-consent';
const onboardingKey = 'tau-onboarding';
const deviceKey = 'tau-device';

const tourEvents = [
  'tour_started',
  'tour_step_shown',
  'tour_step_seen',
  'tour_paused',
  'tour_resumed',
  'tour_dismissed',
  'tour_completed',
] as const;

const tip = () => selectors.getByTestId('tour-tip');
const tipNamed = (title: string) =>
  selectors.getByRole('dialog', { name: new RegExp(`^Tour tip \\d of 5: ${title}$`, 'u') });
const tipButton = (name: string) => tip().getByRole('button', { name, exact: true });
const announcer = () => selectors.getByTestId('tour-announcer');
const viewerCanvas = () => selectors.getByCss('canvas[data-engine]').first();

/** PostHog's own keys on every event; everything else on an event is the app's. */
const isPostHogKey = (key: string): boolean => key.startsWith('$') || key === 'token' || key === 'distinct_id';

/** The app's properties on each captured tour event, PostHog's own keys left out. */
const tourAppEvents = async (): Promise<Array<Readonly<{ event: string; properties: Record<string, unknown> }>>> => {
  const captured = await target.readPostHogEvents(tourEvents);
  return captured.map(({ event, properties }) => ({
    event,
    properties: Object.fromEntries(Object.entries(properties).filter(([key]) => !isPostHogKey(key))),
  }));
};

/** Whether a tour event with this name has been captured. */
const hasTourEvent = async (name: (typeof tourEvents)[number]): Promise<boolean> => {
  const events = await tourAppEvents();
  return events.some(({ event }) => event === name);
};

/** How many tour events with this name have been captured. */
const countTourEvents = async (name: (typeof tourEvents)[number]): Promise<number> => {
  const events = await tourAppEvents();
  return events.filter(({ event }) => event === name).length;
};

/** Accept analytics as the marketing site records it, and prompt the app to re-read the decision. */
const acceptAnalytics = async (): Promise<void> => {
  await target.addCookies([
    {
      name: consentCookieName,
      value: encodeURIComponent(JSON.stringify({ status: 'accepted', version: 1 })),
      url: new URL('/', await target.currentUrl()).toString(),
    },
  ]);
  await target.evaluate(() => {
    globalThis.dispatchEvent(new Event('focus'));
  });
};

/** Store a guided tour that is wanted and untouched, and no pause, on this browser profile. */
const askForTheTour = async (): Promise<void> => {
  await target.evaluate(
    ({ onboarding, device }) => {
      globalThis.localStorage.setItem(
        onboarding,
        JSON.stringify({ value: { version: 1, setup: { status: 'completed' }, tour: { wanted: true, seen: [] } } }),
      );
      globalThis.localStorage.setItem(device, JSON.stringify({ value: { version: 1 } }));
    },
    { onboarding: onboardingKey, device: deviceKey },
  );
};

/** The stored guided tour, as the person record holds it. */
const storedTour = async (): Promise<unknown> =>
  target.evaluate((key) => {
    const raw = globalThis.localStorage.getItem(key);
    return raw === null ? undefined : (JSON.parse(raw) as { value: { tour: unknown } }).value.tour;
  }, onboardingKey);

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

/** A fresh profile state with the tour wanted, then the seeded project with tip 1 on screen. */
const openProjectWithTour = async (options: { readonly analytics?: boolean } = {}): Promise<void> => {
  if (options.analytics === true) {
    await target.installPostHogFixture('phc_test_key');
  }
  await target.navigate('/');
  await target.expectVisible(selectors.getByRole('main'), 60_000);
  if (options.analytics === true) {
    await acceptAnalytics();
  }
  await askForTheTour();
  await openSeed();
  await target.expectVisible(tipNamed('Describe what you want'), 90_000);
};

/** Drag across the middle of the viewer and let the camera come to rest. */
const orbitTheViewer = async (): Promise<void> => {
  const box = await target.boundingBox(viewerCanvas());
  if (!box) {
    throw new Error('The viewer canvas has no box.');
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await target.mouseMove(x, y);
  await target.mouseDown();
  await target.mouseMove(x + 120, y + 40, { steps: 12 });
  await target.mouseUp();
};

/** Bring the Parameters pane on screen if the tip sits beside the control that reveals it. */
const showParameters = async (): Promise<void> => {
  if (await target.isVisible(tipButton('Show me'))) {
    await target.click(tipButton('Show me'));
  }
  await target.expectVisible(selectors.getByCss('[data-slot=parameters] input').first(), 60_000);
};

describe.runIf(runsInFlagStates(['all-on', 'viewer-controls-onboarding']))('the product tour', () => {
  flagTest('walks the five tips in order and reports each tour event with exactly its properties', async () => {
    await target.setViewport({ width: 1600, height: 1000 });
    await openProjectWithTour({ analytics: true });
    expect(await target.getAttribute(tip(), 'aria-modal')).toBeNull();
    await expect.poll(async () => target.textContent(announcer())).toMatch(/^Tip 1 of 5: Describe what you want\./u);

    // Tip 1: Next marks it seen and performs nothing.
    await target.click(tipButton('Next'));
    await target.expectVisible(tipNamed('Look around'), 90_000);

    // Tip 2: the real action, a camera move that comes to rest.
    await target.expectVisible(viewerCanvas(), 60_000);
    await orbitTheViewer();
    await target.expectVisible(tipNamed('Change it without asking again'), 30_000);

    // Tip 3: the real action, a parameter changed.
    await showParameters();
    const field = selectors.getByLabelText('Input for Width', { exact: true }).first();
    await target.fill(field, '12');
    await target.press(field, 'Enter');
    await target.expectVisible(tipNamed('Check it against what you need'), 30_000);

    // Tip 4 without a test run offers to fill the composer; Next goes on.
    await target.expectVisible(tipButton('Ask Tau to check it'));
    await target.click(tipButton('Next'));

    // Tip 5 is the last: Done ends the tour.
    await target.expectVisible(tipNamed('Export and make it'), 30_000);
    expect(await target.textContent(tip())).toMatch(/Export writes the formats this model’s kernel offers/u);
    await target.click(tipButton('Done'));
    await target.expectHidden(tip(), 30_000);
    await expect.poll(async () => target.textContent(announcer())).toBe('Tour finished. Take it again from Help.');
    expect(await storedTour()).toMatchObject({
      wanted: true,
      seen: ['ask', 'look', 'adjust', 'verify', 'build'],
      ended: 'completed',
    });

    await expect.poll(async () => hasTourEvent('tour_completed'), { timeout: 30_000 }).toBe(true);
    expect(await tourAppEvents()).toStrictEqual([
      { event: 'tour_started', properties: { mode: 'guided' } },
      { event: 'tour_step_shown', properties: { mode: 'guided', step: 'ask' } },
      { event: 'tour_step_seen', properties: { mode: 'guided', step: 'ask', by: 'next' } },
      { event: 'tour_step_shown', properties: { mode: 'guided', step: 'look' } },
      { event: 'tour_step_seen', properties: { mode: 'guided', step: 'look', by: 'action' } },
      { event: 'tour_step_shown', properties: { mode: 'guided', step: 'adjust' } },
      { event: 'tour_step_seen', properties: { mode: 'guided', step: 'adjust', by: 'action' } },
      { event: 'tour_step_shown', properties: { mode: 'guided', step: 'verify' } },
      { event: 'tour_step_seen', properties: { mode: 'guided', step: 'verify', by: 'next' } },
      { event: 'tour_step_shown', properties: { mode: 'guided', step: 'build' } },
      { event: 'tour_step_seen', properties: { mode: 'guided', step: 'build', by: 'next' } },
      { event: 'tour_completed', properties: { mode: 'guided' } },
    ]);
  });

  flagTest('reports a pause, a resume from Help, a skip and a replay with exactly their properties', async () => {
    await target.setViewport({ width: 1600, height: 1000 });
    await openProjectWithTour({ analytics: true });

    await target.click(tip().getByRole('button', { name: 'Pause tour' }));
    await target.expectHidden(tip(), 30_000);
    await expect.poll(async () => target.textContent(announcer())).toBe('Tour paused at tip 1. Resume it from Help.');

    // The pause belongs to the device and survives a reload.
    await target.reload();
    await target.expectVisible(viewerCanvas(), 90_000);
    expect(await target.isVisible(tip())).toBe(false);
    await target.click(selectors.getByRole('button', { name: 'Help', exact: true }));
    await target.click(selectors.getByRole('menuitem', { name: 'Resume tour (tip 1 of 5)' }));
    await target.expectVisible(tipNamed('Describe what you want'), 60_000);

    await target.click(tipButton('Skip tour'));
    await target.expectHidden(tip(), 30_000);
    await expect.poll(async () => target.textContent(announcer())).toBe('Tour skipped. Take it any time from Help.');

    // A replay from Help steps through the tips and stores nothing.
    const stored = await storedTour();
    await target.click(selectors.getByRole('button', { name: 'Help', exact: true }));
    await target.click(selectors.getByRole('menuitem', { name: 'Take the tour' }));
    await target.expectVisible(tipNamed('Describe what you want'), 60_000);
    await target.click(tipButton('Next'));
    await target.expectVisible(tipNamed('Look around'));
    await target.click(tipButton('Close'));
    await target.expectHidden(tip(), 30_000);
    expect(await storedTour()).toStrictEqual(stored);

    await expect.poll(async () => countTourEvents('tour_dismissed'), { timeout: 30_000 }).toBe(2);
    expect(await tourAppEvents()).toStrictEqual([
      { event: 'tour_started', properties: { mode: 'guided' } },
      { event: 'tour_step_shown', properties: { mode: 'guided', step: 'ask' } },
      { event: 'tour_paused', properties: { mode: 'guided', step: 'ask' } },
      { event: 'tour_resumed', properties: { mode: 'guided', step: 'ask' } },
      // The resumed tour loads afresh and, with nothing seen yet, starts again on this page.
      { event: 'tour_started', properties: { mode: 'guided' } },
      { event: 'tour_step_shown', properties: { mode: 'guided', step: 'ask' } },
      { event: 'tour_dismissed', properties: { mode: 'guided', step: 'ask' } },
      { event: 'tour_started', properties: { mode: 'replay' } },
      { event: 'tour_step_shown', properties: { mode: 'replay', step: 'ask' } },
      { event: 'tour_step_shown', properties: { mode: 'replay', step: 'look' } },
      { event: 'tour_dismissed', properties: { mode: 'replay', step: 'look' } },
    ]);
  });

  flagTest('leaves Escape to a CodeMirror completion and to the viewer while a tip is open', async () => {
    await target.setViewport({ width: 1600, height: 1000 });
    await openProjectWithTour();

    // A completion list open in the code editor closes on Escape; the tip stays.
    const file = selectors.getByRole('treeitem', { name: /touch-parameters\.js$/u }).first();
    if (!(await target.isVisible(file))) {
      // The Files pane is not part of the seed's opening layout: open it from the command palette.
      await target.click(selectors.getByRole('button', { name: 'Search', exact: true }));
      await target.fill(selectors.getByPlaceholder('Search projects, chats, and actions…'), 'Open files');
      await target.click(selectors.getByText('Open files', { exact: true }));
      for (const folder of ['public', 'models']) {
        await target.click(selectors.getByRole('treeitem', { name: folder, exact: true }).first());
      }
    }
    await target.click(file);
    const editor = selectors.getByCss('.cm-editor .cm-content').first();
    await target.expectVisible(editor, 60_000);
    await target.click(editor);
    await target.keyboardPress('Control+End');
    await target.keyboardPress('Enter');
    await target.type(editor, 'Math.');
    await target.keyboardPress('Control+Space');
    const completion = selectors.getByCss('.cm-tooltip-autocomplete').first();
    await target.expectVisible(completion, 30_000);
    await target.keyboardPress('Escape');
    await target.expectHidden(completion, 10_000);
    expect(await target.isVisible(tip())).toBe(true);

    // Escape pressed in the viewer travels on to the document uncancelled: the tour adds no key listener of its own.
    await target.evaluate(() => {
      const record = globalThis as typeof globalThis & { tourEscapes?: Array<{ prevented: boolean; inTip: boolean }> };
      record.tourEscapes = [];
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          const inTip = event.target instanceof Element && event.target.closest('[data-testid="tour-tip"]') !== null;
          record.tourEscapes?.push({ prevented: event.defaultPrevented, inTip });
        }
      });
    });
    // The viewer's region lies over its canvas and takes the pointer: clicking it focuses the viewer.
    await target.click(selectors.getByRole('application', { name: 'CAD canvas' }).first());
    await target.keyboardPress('Escape');
    expect(
      await target.evaluate(
        () =>
          (globalThis as typeof globalThis & { tourEscapes?: Array<{ prevented: boolean; inTip: boolean }> })
            .tourEscapes,
      ),
    ).toStrictEqual([{ prevented: false, inTip: false }]);
    expect(await target.isVisible(tip())).toBe(true);

    // Escape inside the tip pauses the tour.
    await target.focus(tip());
    await target.keyboardPress('Escape');
    await target.expectHidden(tip(), 30_000);
  });

  flagTest('has no axe violation in the open tip or its live region, and the editor gains none', async () => {
    await target.setViewport({ width: 1600, height: 1000 });
    await openProjectWithTour();

    const inTip = await axeAudit({ selector: '[data-testid="tour-tip"]' });
    expect(inTip.violations).toStrictEqual([]);
    const announcement = await axeAudit({ selector: '[data-testid="tour-announcer"]' });
    expect(announcement.violations).toStrictEqual([]);
    // The rules a non-modal tip could break anywhere in the editor: its name, its role, and nothing hidden from focus.
    const editor = await axeAudit({
      rules: ['aria-dialog-name', 'aria-allowed-role', 'aria-hidden-focus', 'duplicate-id-aria'],
    });
    expect(editor.violations.map(({ id, targets }) => ({ id, targets }))).toStrictEqual([]);
  });

  for (const viewport of [
    { width: 320, height: 640 },
    { width: 768, height: 1024 },
  ] as const) {
    flagTest(`keeps the tip inside the window on a ${viewport.width}px touch screen`, async () => {
      await target.commands.uiOpenTarget({ hasTouch: true, isMobile: true });
      await target.setViewport(viewport);
      await openProjectWithTour();

      const box = await target.boundingBox(tip());
      if (!box) {
        throw new Error('The tip has no box.');
      }
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      const overflow = await measureHorizontalOverflow();
      expect(overflow.document).toBe(0);

      // Every control in the tip is at least 32px tall under a coarse pointer.
      const heights = await target.evaluate(() =>
        [...document.querySelectorAll('[data-testid="tour-tip"] button')].map(
          (button) => button.getBoundingClientRect().height,
        ),
      );
      expect(heights.every((height) => height >= 32)).toBe(true);
    });
  }
});
