import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { prepareComposerPage } from '#support/chat-attachments.js';

/**
 * The phone viewer bar on the real project route (D6–D8, T5, T6, T9): one centred group of 28px controls with no
 * fullscreen, AR only where it can launch (never in Chromium, which has no Quick Look), nothing scrolling sideways, and
 * no control inside the model's image. Running tools keep their rows inside the stage and the controls line whole.
 */

const navigation = (): Locator => selectors.getByRole('navigation', { name: 'Workbench' });
const navButton = (name: string): Locator => navigation().getByRole('button', { name, exact: true });
const controls = (): Locator => selectors.getByRole('group', { name: 'Viewer controls' }).first();

type Box = Readonly<{ left: number; top: number; right: number; bottom: number; width: number; height: number }>;
type Layout = Readonly<{
  frame: Box;
  bar: Box;
  group: Box;
  buttons: ReadonlyArray<Readonly<{ name: string; box: Box; insideImage: boolean }>>;
  pageOverflow: number;
  rows?: Readonly<{ box: Box; scrollWidth: number; clientWidth: number }>;
}>;

/**
 * Waits for the sheet to finish moving to its detent. The detent's value changes at once and the stage takes its new
 * height in one step, but the sheet (and its grabber) slides there over a transition, so a box read mid-slide is not
 * the detent's.
 */
const sheetSettled = async (grabber: Locator): Promise<void> =>
  target.evaluateLocator(grabber, async (handle) => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
    const sheet = handle.closest('[data-slot=drawer-content]');
    if (!sheet) {
      throw new Error('The grabber is not inside the sheet.');
    }
    // A cancelled transition has settled too: a newer one replaced it or the sheet stopped moving.
    await Promise.all(sheet.getAnimations().map(async (animation) => animation.finished.catch(() => undefined)));
  });

const readLayout = async (): Promise<Layout> =>
  target.evaluateLocator(controls(), (group) => {
    const toBox = (element: Element): Box => {
      const { left, top, right, bottom, width, height } = element.getBoundingClientRect();
      return { left, top, right, bottom, width, height };
    };
    const bar = group.closest('[data-slot="viewer-controls"]');
    const frame = group.closest('[data-viewer-frame]');
    if (!bar || !frame) {
      throw new Error('The viewer bar is not on a viewer stage.');
    }
    const rows = bar.querySelector('[data-slot="viewer-tool-rows"]');
    return {
      frame: toBox(frame),
      bar: toBox(bar),
      group: toBox(group),
      buttons: [...group.querySelectorAll('button')]
        .filter((button) => button.getClientRects().length > 0)
        .map((button) => ({
          name: button.getAttribute('aria-label') ?? button.textContent.trim(),
          box: toBox(button),
          insideImage: button.closest('[role="img"]') !== null,
        })),
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      rows: rows ? { box: toBox(rows), scrollWidth: rows.scrollWidth, clientWidth: rows.clientWidth } : undefined,
    };
  });

const centre = (box: Box): number => (box.left + box.right) / 2;

async function openStage(viewport: { width: number; height: number }): Promise<void> {
  await target.commands.uiOpenTarget({ hasTouch: true, isMobile: true });
  await prepareComposerPage();
  await target.setViewport(viewport);
  await target.navigate('/__e2e/chat-attachments');
  await target.expectUrl(/\/w\/[^/]+\/[^/?]+\?/u, 60_000);
  await target.expectVisible(navigation(), 60_000);
  // Model restores the stage (D8).
  await target.click(navButton('Model'), { touch: true });
  await expect.poll(async () => target.getAttribute(navButton('Model'), 'aria-current')).toBe('page');
  await target.expectVisible(controls(), 60_000);
  await target.expectVisible(controls().getByRole('button', { name: /^Grid / }), 60_000);
}

test.each([
  { width: 320, height: 640 },
  { width: 390, height: 844 },
])('centres one group of 28px viewer controls with no fullscreen at $width×$height', async (viewport) => {
  await openStage(viewport);
  const layout = await readLayout();
  const names = layout.buttons.map((button) => button.name);

  // The D6 order; fullscreen never shows on a phone, and Chromium cannot launch AR, so AR is absent, not disabled.
  const tools = names.slice(names.findIndex((name) => name.startsWith('Grid ')));
  expect(tools[0]).toMatch(/^Grid .+, units and grid$/u);
  expect(tools.slice(1)).toEqual(expect.arrayContaining(['Section view', 'Measure', 'Fit view', 'Viewer settings']));
  expect(tools.indexOf('Section view')).toBeLessThan(tools.indexOf('Measure'));
  expect(tools.indexOf('Measure')).toBeLessThan(tools.indexOf('Fit view'));
  expect(tools.indexOf('Fit view')).toBeLessThan(tools.indexOf('Viewer settings'));
  expect(tools.at(-1)).toBe('Viewer settings');
  expect(names).not.toContain('Enter fullscreen');
  expect(names).not.toContain('View in your space');

  for (const button of layout.buttons.filter(({ name }) => tools.includes(name))) {
    expect([button.name, button.box.width, button.box.height]).toEqual([button.name, 28, 28]);
  }
  for (const button of layout.buttons) {
    // I3 floor and no overlap between neighbours on the same line.
    expect(button.box.height).toBeGreaterThanOrEqual(24);
    expect(button.insideImage, `${button.name} should not sit inside the model image`).toBe(false);
    expect(button.box.left).toBeGreaterThanOrEqual(layout.frame.left - 0.5);
    expect(button.box.right).toBeLessThanOrEqual(layout.frame.right + 0.5);
  }
  const toolBoxes = layout.buttons.filter(({ name }) => tools.includes(name)).map(({ box }) => box);
  for (const [index, box] of toolBoxes.entries()) {
    const next = toolBoxes[index + 1];
    if (next && Math.abs(next.top - box.top) < 1) {
      expect(next.left).toBeGreaterThanOrEqual(box.right - 0.5);
    }
  }

  expect(Math.abs(centre(layout.group) - centre(layout.frame))).toBeLessThanOrEqual(1);
  expect(layout.group.left).toBeGreaterThanOrEqual(layout.frame.left);
  expect(layout.group.right).toBeLessThanOrEqual(layout.frame.right);
  expect(layout.pageOverflow).toBeLessThanOrEqual(0);
});

test.each([
  { width: 320, height: 640 },
  { width: 390, height: 844 },
])('keeps running tool rows inside the stage above a whole controls line at $width×$height', async (viewport) => {
  await openStage(viewport);
  await target.click(controls().getByRole('button', { name: 'Section view', exact: true }), { touch: true });
  await target.click(controls().getByRole('button', { name: 'Measure', exact: true }), { touch: true });
  const measuring = selectors.getByRole('group', { name: 'Measuring options' });
  await target.expectVisible(selectors.getByRole('group', { name: 'Section view options' }));
  await target.expectVisible(measuring);

  const layout = await readLayout();
  expect(layout.bar.top).toBeGreaterThanOrEqual(layout.frame.top);
  expect(layout.bar.bottom).toBeLessThanOrEqual(layout.frame.bottom);
  expect(layout.group.top).toBeGreaterThanOrEqual(layout.frame.top);
  expect(Math.abs(centre(layout.group) - centre(layout.frame))).toBeLessThanOrEqual(1);
  expect(layout.rows, 'the tool rows should render in the bar').toBeDefined();
  expect(layout.rows!.scrollWidth).toBeLessThanOrEqual(layout.rows!.clientWidth);
  expect(layout.pageOverflow).toBeLessThanOrEqual(0);

  // Each row's Done is reachable inside the rows and ends its tool.
  const measureDone = measuring.getByRole('button', { name: 'Done with measure' });
  await target.scrollIntoView(measureDone);
  await target.click(measureDone, { touch: true });
  await target.expectCount(measuring, 0);
  const sectionDone = selectors.getByRole('button', { name: 'Done with section' });
  await target.scrollIntoView(sectionDone);
  await target.click(sectionDone, { touch: true });
  await target.expectCount(selectors.getByRole('group', { name: 'Section view options' }), 0);
});

test.each([
  { width: 320, height: 640 },
  { width: 390, height: 844 },
])('bounds running tool rows to the stage the sheet leaves at half at $width×$height', async (viewport) => {
  await openStage(viewport);
  // A surface opens the sheet at half, leaving a short stage above it.
  await target.click(navButton('Chat'), { touch: true });
  const grabber = selectors.getByRole('slider', { name: 'Drawer height' });
  await expect.poll(async () => target.getAttribute(grabber, 'aria-valuenow')).toBe('1');
  await target.click(controls().getByRole('button', { name: 'Section view', exact: true }), { touch: true });
  await target.click(controls().getByRole('button', { name: 'Measure', exact: true }), { touch: true });
  await target.expectVisible(selectors.getByRole('group', { name: 'Section view options' }));
  await target.expectVisible(selectors.getByRole('group', { name: 'Measuring options' }));

  const expectBounded = async (detent: string): Promise<void> => {
    await sheetSettled(grabber);
    // The bar settles once the sheet's move ends and the stage resizes.
    await expect
      .poll(
        async () => {
          const { bar, frame } = await readLayout();
          return bar.top >= frame.top + 7.5 && bar.bottom <= frame.bottom;
        },
        { timeout: 5000, message: `the bar should stay inside the stage at ${detent}` },
      )
      .toBe(true);
    const layout = await readLayout();
    const handle = await target.boundingBox(grabber);
    if (!handle) {
      throw new Error('The grabber has no layout box.');
    }
    // The controls line is whole, on the stage and above the sheet; the rows scroll rather than spill sideways.
    expect(layout.group.top, detent).toBeGreaterThanOrEqual(layout.frame.top);
    expect(layout.group.bottom, detent).toBeLessThanOrEqual(Math.min(layout.frame.bottom, handle.y) + 0.5);
    for (const button of layout.buttons.filter(({ name }) => name === 'Fit view' || name === 'Viewer settings')) {
      expect([detent, button.name, button.box.height]).toEqual([detent, button.name, 28]);
    }
    expect(layout.rows, `the tool rows should render in the bar at ${detent}`).toBeDefined();
    expect(layout.rows!.box.top).toBeGreaterThanOrEqual(layout.frame.top);
    expect(layout.rows!.scrollWidth).toBeLessThanOrEqual(layout.rows!.clientWidth);
    expect(layout.pageOverflow).toBeLessThanOrEqual(0);
  };

  await expectBounded('Half');
  // Up to full, which covers the stage, and back down to half: the stage returns, and the rows still fit inside it.
  await target.press(grabber, 'End');
  await expect.poll(async () => target.getAttribute(grabber, 'aria-valuenow')).toBe('2');
  await target.press(grabber, 'Home');
  await expect.poll(async () => target.getAttribute(grabber, 'aria-valuenow')).toBe('1');
  await expectBounded('Half again');
});

test('keeps the real fullscreen and no AR on desktop', async () => {
  await target.commands.uiOpenTarget();
  await prepareComposerPage();
  await target.setViewport({ width: 1280, height: 800 });
  await target.navigate('/__e2e/chat-attachments');
  await target.expectUrl(/\/w\/[^/]+\/[^/?]+\?/u, 60_000);
  await target.expectVisible(controls(), 60_000);
  await target.expectVisible(controls().getByRole('button', { name: 'Enter fullscreen' }), 60_000);
  await target.expectCount(controls().getByRole('button', { name: 'View in your space' }), 0);
  const fullscreen = await target.boundingBox(controls().getByRole('button', { name: 'Enter fullscreen' }));
  expect(fullscreen?.height).toBe(28);
});
