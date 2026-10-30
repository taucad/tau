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
const navButton = (name: string): Locator =>
  selectors.getByRole('navigation', { name: 'Workbench' }).getByRole('button', { name, exact: true });
/** Secondary surfaces open from the All surfaces sheet. */
const openSurface = async (name: string): Promise<void> => {
  await target.click(navButton('All'), { touch: true });
  await target.click(
    selectors.getByRole('dialog', { name: 'All surfaces' }).getByRole('button', { name, exact: true }),
    {
      touch: true,
    },
  );
};

beforeEach(async () => {
  // A phone: coarse pointer, so fields take their 16px touch size, and taps.
  await target.commands.uiOpenTarget({ hasTouch: true, isMobile: true });
  await prepareComposerPage();
  await installIosKeyboard();
  await target.setViewport(iosViewport);
  await target.navigate('/__e2e/chat-attachments');
  await target.expectUrl(/\/w\/[^/]+\/[^/?]+\?/u, 60_000);
  // A project opens on the model stage (Option B); the composer lives on the Chat surface.
  await target.click(navButton('Chat'), { touch: true });
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
    // The unfolded bar rides with the editor: Send stays on screen above the keyboard (D14).
    await expect
      .poll(async () =>
        target.evaluateLocator(selectors.getByRole('button', { name: 'Send', exact: true }).first(), (send) => {
          const box = send.getBoundingClientRect();
          const viewport = globalThis.visualViewport;
          const bottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? innerHeight);
          return box.height > 0 && box.top >= (viewport?.offsetTop ?? 0) && box.bottom <= bottom + 0.5;
        }),
      )
      .toBe(true);
    // The nav would ride up over the composer with Safari's pan, so it steps aside while typing.
    await expect.poll(async () => target.isVisible(navButton('Chat'))).toBe(false);

    await dismissIosKeyboard();
    await expect.poll(async () => target.isVisible(navButton('Chat'))).toBe(true);
  },
);

test('keeps the file filter above the keyboard', async () => {
  await openSurface('Files');
  await expectTypable(selectors.getByCss(`${drawer} input[placeholder="Filter files…"]`).first());
});

test('keeps the details fields above the keyboard, scrolling a low one into view', async () => {
  await openSurface('Details');
  await expectTypable(selectors.getByCss(`${drawer} textarea`).first());
  await dismissIosKeyboard();
  await expectTypable(selectors.getByCss(`${drawer} [data-slot="input-tags-input"]`).first());
});

test('keeps a picker drawer search above the keyboard', async () => {
  await target.click(navButton('All'), { touch: true });
  await target.click(
    selectors.getByRole('dialog', { name: 'All surfaces' }).getByRole('button', { name: 'Open file', exact: true }),
    { touch: true },
  );
  await target.expectVisible(selectors.getByRole('dialog', { name: 'Open File', exact: true }));
  await expectTypable(selectors.getByCss(`${drawer} [cmdk-input]`).last());
});
