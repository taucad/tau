import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { composerSelector, prepareComposerPage } from '#support/chat-attachments.js';

/**
 * The phone shell's geometry: at every detent the open surface, its composer and Send end above the fixed
 * workbench nav, and the nav's 40px targets fit inside it. The surface once took a fixed 48px off each detent
 * while the grabber row and the nav took 68px, so the composer and Send sat about 20px under the nav.
 */

const navigation = (): Locator => selectors.getByRole('navigation', { name: 'Workbench' });
const navButton = (name: string): Locator => navigation().getByRole('button', { name, exact: true });
const grabber = (): Locator => selectors.getByRole('slider', { name: 'Drawer height' });

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
  expect(detents).toBeGreaterThan(1);
  for (let detent = 0; detent < detents; detent++) {
    if (detent > 0) {
      // oxlint-disable-next-line no-await-in-loop -- each detent in turn.
      await target.press(grabber(), 'Enter');
      // oxlint-disable-next-line no-await-in-loop -- each detent in turn.
      await expect.poll(async () => target.getAttribute(grabber(), 'aria-valuenow')).toBe(String(detent + 1));
    }
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
