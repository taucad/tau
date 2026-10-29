import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { composerSelector, prepareComposerPage } from '#support/chat-attachments.js';
import { waitForStageReady } from '#support/viewer-stage.js';

/**
 * The phone shell's geometry: at every detent the open surface, its composer and Send end above the fixed
 * workbench nav, and the nav's 40px targets fit inside it. The surface once took a fixed 48px off each detent
 * while the grabber row and the nav took 68px, so the composer and Send sat about 20px under the nav.
 */

const navigation = (): Locator => selectors.getByRole('navigation', { name: 'Workbench' });
const navButton = (name: string): Locator => navigation().getByRole('button', { name, exact: true });
const grabber = (): Locator => selectors.getByRole('slider', { name: 'Drawer height' });

/**
 * Waits for the sheet to finish moving to its detent. The detent's value changes at once, but the sheet slides there
 * over a transition while the surface takes its new height in one step, so a box read mid-slide is not the detent's.
 */
const sheetSettled = async (): Promise<void> =>
  target.evaluateLocator(grabber(), async (handle) => {
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

type Box = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

const boxOf = async (locator: Locator, what: string): Promise<Box> => {
  const box = await target.boundingBox(locator);
  if (!box) {
    throw new Error(`${what} has no layout box.`);
  }
  return box;
};

test.each([
  { width: 320, height: 640 },
  { width: 390, height: 844 },
])('keeps the chat surface, composer and Send above the nav at every detent at $width×$height', async (viewport) => {
  await target.commands.uiOpenTarget({ hasTouch: true, isMobile: true });
  await prepareComposerPage();
  await target.setViewport(viewport);
  await target.navigate('/__e2e/chat-attachments');
  await target.expectUrl(/\/w\/[^/]+\/[^/?]+\?/u, 60_000);
  /* A tap needs a stable target, which needs compositor frames: wait until the stage has presented its first frame. */
  await waitForStageReady();
  await target.click(navButton('Chat'), { touch: true });
  await target.expectVisible(selectors.getByCss(composerSelector).first(), 60_000);

  const nav = await boxOf(navigation(), 'The workbench nav');
  expect(nav.y + nav.height).toBeLessThanOrEqual(viewport.height + 0.5);
  for (const name of ['Chat', 'Parameters', 'Model', 'All']) {
    // oxlint-disable-next-line no-await-in-loop -- one destination at a time.
    const button = await boxOf(navButton(name), `The ${name} destination`);
    expect(button.height).toBeGreaterThanOrEqual(40);
    expect(button.y).toBeGreaterThanOrEqual(nav.y);
    expect(button.y + button.height).toBeLessThanOrEqual(nav.y + nav.height + 0.5);
  }

  const detents = Number(await target.getAttribute(grabber(), 'aria-valuemax'));
  // Half and full; collapsed is the sheet closed. A surface opens at half.
  expect(detents).toBe(2);
  expect(await target.getAttribute(grabber(), 'aria-valuenow')).toBe('1');
  // Half is the lowest detent: Home keeps it there, and the chat's composer must clear the nav there too (R4).
  await target.press(grabber(), 'Home');
  await expect.poll(async () => target.getAttribute(grabber(), 'aria-valuenow')).toBe('1');
  // Chat fits half at rest: across a 1s window, sampled every frame, the sheet never raises itself (I5), and
  // nothing in it is clipped. A raise lands within a frame or two of the resize, well inside the window.
  const heldDetents = await target.evaluateLocator(grabber(), async (handle) => {
    const seen = new Set<string>();
    const until = performance.now() + 1000;
    while (performance.now() < until) {
      seen.add(String(handle.getAttribute('aria-valuenow')));
      // oxlint-disable-next-line no-await-in-loop -- one sample per frame.
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    }
    seen.add(String(handle.getAttribute('aria-valuenow')));
    return [...seen];
  });
  expect(heldDetents).toEqual(['1']);
  expect(await target.getAttribute(grabber(), 'aria-valuetext')).toBe('Half');
  const clipped = await target.evaluateLocator(
    selectors.getByRole('region', { name: 'Chat', exact: true }),
    (surface) => {
      const content = surface.querySelector('[data-slot=floating-panel-content]');
      return content ? content.scrollHeight - content.clientHeight : Number.POSITIVE_INFINITY;
    },
  );
  expect(clipped).toBeLessThanOrEqual(1);
  for (let detent = 0; detent < detents; detent++) {
    if (detent > 0) {
      // oxlint-disable-next-line no-await-in-loop -- each detent in turn.
      await target.press(grabber(), 'Enter');
      // oxlint-disable-next-line no-await-in-loop -- each detent in turn.
      await expect.poll(async () => target.getAttribute(grabber(), 'aria-valuenow')).toBe(String(detent + 1));
    }
    // oxlint-disable-next-line no-await-in-loop -- each detent in turn.
    await sheetSettled();
    // oxlint-disable-next-line no-await-in-loop -- each detent in turn.
    const [surface, composer, send] = await Promise.all([
      boxOf(selectors.getByRole('region', { name: 'Chat', exact: true }), 'The chat surface'),
      boxOf(selectors.getByCss(composerSelector).first(), 'The composer'),
      boxOf(selectors.getByRole('button', { name: 'Send', exact: true }).first(), 'Send'),
    ]);
    for (const box of [surface, composer, send]) {
      expect(box.y + box.height).toBeLessThanOrEqual(nav.y + 0.5);
    }
  }
});

test.each([
  { width: 320, height: 640 },
  { width: 390, height: 844 },
])(
  'gives the sheet grabber a target that covers neither the pane header nor the viewer bar at $width×$height',
  async (viewport) => {
    await target.commands.uiOpenTarget({ hasTouch: true, isMobile: true });
    await prepareComposerPage();
    await target.setViewport(viewport);
    await target.navigate('/__e2e/chat-attachments');
    await target.expectUrl(/\/w\/[^/]+\/[^/?]+\?/u, 60_000);
    await waitForStageReady();
    await target.click(navButton('Parameters'), { touch: true });
    const surface = selectors.getByRole('region', { name: 'Parameters', exact: true });
    await target.expectVisible(surface, 60_000);
    await sheetSettled();

    const handle = await boxOf(grabber(), 'The grabber');
    const header = await boxOf(
      surface.getByCss('[data-slot=floating-panel-content-header]').first(),
      'The pane header',
    );
    /* The bar sits a gap above the header with no row of its own below it, so the target is the 8px row plus
     * 8px above the sheet's edge; the grabber's keys and the nav remain the other ways to move the sheet. */
    expect(handle.height).toBeGreaterThanOrEqual(16);
    const indicator = await boxOf(selectors.getByCss('[data-slot=drawer-handle-indicator]').first(), 'The bar');
    // The space between the bar and the header actions equals the space below them.
    const action = await boxOf(surface.getByRole('button', { name: /^Close/u }).first(), 'The header Close');
    expect(
      Math.abs(action.y - (indicator.y + indicator.height) - (header.y + header.height - (action.y + action.height))),
    ).toBeLessThanOrEqual(1);
    expect(handle.width).toBeGreaterThanOrEqual(viewport.width - 2);
    // The target ends where the header begins, so Close and the header actions are never part of it (I3).
    expect(handle.y + handle.height).toBeLessThanOrEqual(header.y + 0.5);
    const hits = await target.evaluate(
      ({ x, top, bottom }) => ({
        above: Boolean(document.elementFromPoint(x, top + 2)?.closest('[data-vaul-handle]')),
        below: Boolean(document.elementFromPoint(x, bottom + 2)?.closest('[data-vaul-handle]')),
      }),
      { x: handle.x + handle.width / 2, top: handle.y, bottom: handle.y + handle.height },
    );
    expect(hits).toEqual({ above: true, below: false });
    // The viewer bar stays on the stage above the sheet, clear of the grabber target.
    const bar = await boxOf(selectors.getByRole('group', { name: 'Viewer controls' }).first(), 'The viewer bar');
    expect(bar.y + bar.height).toBeLessThanOrEqual(handle.y + 0.5);
  },
);
