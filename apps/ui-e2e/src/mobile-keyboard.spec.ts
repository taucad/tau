import { beforeEach, expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { composerSelector, prepareComposerPage } from '#support/chat-attachments.js';
import {
  dismissIosKeyboard,
  installIosKeyboard,
  iosViewport,
  openIosKeyboard,
  readFocusedFieldPlacement,
} from '#support/ios-keyboard.js';

/**
 * Typing on a phone in the editor: every field the user focuses stays on screen, unclipped and
 * unobstructed, once Safari's keyboard is up. Before the drawer owned keyboard layout, vaul resized
 * the snap drawer around the keyboard twice over, so the composer was clipped and the panels' fields
 * slid under the keyboard or above the screen.
 */

const drawer = '[data-slot="drawer-content"]';
const navTab = (name: string): Locator => selectors.getByRole('tab', { name, exact: true });

beforeEach(async () => {
  // A phone: coarse pointer, so fields take their 16px touch size, and taps.
  await target.commands.uiOpenTarget({ hasTouch: true, isMobile: true });
  await prepareComposerPage();
  await installIosKeyboard();
  await target.setViewport(iosViewport);
  await target.navigate('/__e2e/chat-attachments');
  await target.expectUrl(/\/w\/[^/]+\/[^/?]+\?/u, 60_000);
  await target.expectVisible(selectors.getByCss(composerSelector).first(), 60_000);
});

const expectTypable = async (field: Locator, options: { readonly pan?: boolean } = {}): Promise<void> => {
  await target.click(field, { touch: true });
  await openIosKeyboard(options);
  // 16px also keeps iOS from zooming into the field.
  await expect
    .poll(readFocusedFieldPlacement)
    .toMatchObject({ visibleFraction: 1, unobstructed: true, fontSize: '16px', userSelect: 'text' });
};

test.each([{ pan: true }, { pan: false }])(
  'keeps the chat composer whole above the keyboard (Safari pans: $pan)',
  async ({ pan }) => {
    await expectTypable(selectors.getByCss(composerSelector).first(), { pan });
    // The nav would ride up over the composer with Safari's pan, so it steps aside while typing.
    await expect.poll(async () => target.isVisible(navTab('Files'))).toBe(false);

    await dismissIosKeyboard();
    await expect.poll(async () => target.isVisible(navTab('Files'))).toBe(true);
  },
);

test('keeps the file filter above the keyboard', async () => {
  await target.click(navTab('Files'), { touch: true });
  await expectTypable(selectors.getByCss(`${drawer} input[placeholder="Filter files…"]`).first());
});

test('keeps the details fields above the keyboard, scrolling a low one into view', async () => {
  await target.click(navTab('Details'), { touch: true });
  await expectTypable(selectors.getByCss(`${drawer} textarea`).first());
  await dismissIosKeyboard();
  await expectTypable(selectors.getByCss(`${drawer} [data-slot="input-tags-input"]`).first());
});

test('keeps a picker drawer search above the keyboard', async () => {
  await target.click(selectors.getByRole('button', { name: 'Open file' }).first(), { touch: true });
  await expectTypable(selectors.getByCss(`${drawer} [cmdk-input]`).last());
});
