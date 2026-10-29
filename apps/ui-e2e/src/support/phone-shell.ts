/**
 * The phone project shell as the mobile specs drive it: the workbench nav, its sheet's grabber and detents, the open
 * surface, the sidebar sheet, and a touch phone opened on a seed route.
 */

import { expect } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { prepareComposerPage } from '#support/chat-attachments.js';

/** The two phone widths every mobile spec measures. */
export const phoneViewports = [
  { width: 320, height: 640 },
  { width: 390, height: 844 },
] as const;

export type PhoneViewport = (typeof phoneViewports)[number];

/**
 * The sheet's detents as the grabber reports them (`aria-valuenow`): half and full. Collapsed is the sheet closed
 * (the Model destination), so the sheet rests at 0, 50% or 100% of the screen.
 */
export const detents = { half: '1', full: '2' } as const;

export const navigation = (): Locator => selectors.getByRole('navigation', { name: 'Workbench' });
export const navButton = (name: string): Locator => navigation().getByRole('button', { name, exact: true });
export const grabber = (): Locator => selectors.getByRole('slider', { name: 'Drawer height' });
export const allSheet = (): Locator => selectors.getByRole('dialog', { name: 'All surfaces' });
/** The open sheet surface, named by its title. */
export const surface = (title: string): Locator => selectors.getByRole('region', { name: title, exact: true });
/** The open sheet, whatever surface it holds: the dialog the grabber moves. */
export const openSheet = (): Locator => selectors.getByRole('dialog').filter({ has: grabber() });
/**
 * The top bar's title button for a project: its name is the project's, then the status line.
 *
 * @param name - The project's name.
 */
export const projectTitle = (name: string): Locator =>
  selectors.getByRole('button', {
    name: new RegExp(`^${name.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`)}(?:\\s|$)`, 'u'),
  });

/**
 * Open a touch phone at `viewport` on a seed route and wait for the project route it navigates to.
 *
 * @param viewport - The phone size.
 * @param route - The seed route, e.g. `/__e2e/chat-attachments`.
 */
export const openPhone = async (viewport: PhoneViewport, route: string): Promise<void> => {
  await target.commands.uiOpenTarget({ hasTouch: true, isMobile: true });
  await prepareComposerPage();
  await target.setViewport(viewport);
  await target.navigate(route);
  await target.expectUrl(/\/w\/[^/]+\/[^/?]+/u, 60_000);
  await target.expectVisible(navigation(), 60_000);
};

/** The detent the grabber reports, `undefined` while no sheet is open. */
export const detent = async (): Promise<string | undefined> =>
  (await target.isVisible(grabber()))
    ? ((await target.getAttribute(grabber(), 'aria-valuenow')) ?? undefined)
    : undefined;

/**
 * Wait for the sheet to finish moving to its detent. The detent's value changes at once, but the sheet slides there
 * over a transition while the surface takes its new height in one step, so a box read mid-slide is not the detent's.
 */
export const sheetSettled = async (): Promise<void> =>
  target.evaluateLocator(grabber(), async (handle) => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
    const sheet = handle.closest('[role="dialog"]');
    if (!sheet) {
      throw new Error('The grabber is not inside the sheet.');
    }
    // A cancelled transition has settled too: a newer one replaced it or the sheet stopped moving.
    await Promise.all(sheet.getAnimations().map(async (animation) => animation.finished.catch(() => undefined)));
  });

/**
 * Move the sheet with the grabber's own keys (D4) and wait for the detent: `Home` half, `End` full; the arrows step
 * down and up; `Enter` cycles.
 *
 * @param key - The grabber key.
 * @param expected - The detent the key lands on.
 */
export const moveSheet = async (
  key: 'Home' | 'End' | 'Enter' | 'ArrowDown' | 'ArrowUp',
  expected: string,
): Promise<void> => {
  await target.press(grabber(), key);
  await expect.poll(detent).toBe(expected);
  await sheetSettled();
};

/**
 * Choose a nav destination by touch and wait for the nav to mark it current. `All` and the destinations it lists are
 * reached through {@link openFromAll}.
 *
 * @param name - Chat, Parameters or Model.
 */
export const tapDestination = async (name: 'Chat' | 'Parameters' | 'Model'): Promise<void> => {
  await target.click(navButton(name), { touch: true });
  await expect.poll(async () => target.getAttribute(navButton(name), 'aria-current'), { timeout: 30_000 }).toBe('page');
};

/**
 * Open a surface from All by touch and wait for its region.
 *
 * @param title - The surface's title in All.
 */
export const openFromAll = async (title: string): Promise<void> => {
  await target.click(navButton('All'), { touch: true });
  await target.click(allSheet().getByRole('button', { name: title, exact: true }), { touch: true });
  await target.expectVisible(surface(title), 60_000);
};

/**
 * Open the phone sidebar sheet and follow one of its links (a project or a chat) by touch.
 *
 * @param name - The link's name.
 */
export const followSidebarLink = async (name: string): Promise<void> => {
  await target.click(selectors.getByRole('button', { name: 'Open sidebar', exact: true }), { touch: true });
  const link = selectors.getByRole('link', { name, exact: true });
  await target.expectVisible(link, 30_000);
  await target.click(link, { touch: true });
};

/**
 * Browser history, as the person's Back and Forward gestures move it, then wait for the address to change.
 *
 * @param direction - Which way to go.
 * @returns The new pathname.
 */
export const traverseHistory = async (direction: 'back' | 'forward'): Promise<string> => {
  const before = new URL(await target.currentUrl()).pathname;
  await target.evaluate((way) => {
    if (way === 'back') {
      history.back();
    } else {
      history.forward();
    }
  }, direction);
  let after = before;
  await expect
    .poll(
      async () => {
        after = new URL(await target.currentUrl()).pathname;
        return after;
      },
      { timeout: 30_000 },
    )
    .not.toBe(before);
  return after;
};

/** The project path the page is on. */
export const currentPath = async (): Promise<string> => new URL(await target.currentUrl()).pathname;

/**
 * Whether an element is wholly on screen in the open sheet: inside the viewport, above the nav, and not clipped by
 * the surface or any scroller between them.
 *
 * @param locator - The element.
 * @returns The reason it is not, or `undefined` when it is wholly shown.
 */
export const unshownReason = async (locator: Locator): Promise<string | undefined> => {
  const navTop = await target.evaluateLocator(navigation(), (nav) => nav.getBoundingClientRect().top);
  return target.evaluateLocator(
    locator,
    (element, navigationTop) => {
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) {
        return 'has no box';
      }
      if (box.bottom > navigationTop + 0.5) {
        return `ends at ${String(box.bottom)}, under the nav at ${String(navigationTop)}`;
      }
      if (box.top < -0.5 || box.bottom > window.innerHeight + 0.5) {
        return 'is outside the viewport';
      }
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (style.overflowY === 'visible' && style.overflowX === 'visible') {
          continue;
        }
        const clip = parent.getBoundingClientRect();
        if (box.top < clip.top - 0.5 || box.bottom > clip.bottom + 0.5) {
          return `is clipped by ${parent.tagName.toLowerCase()}[${parent.dataset['slot'] ?? parent.className.slice(0, 40)}]`;
        }
      }
      return undefined;
    },
    navTop,
  );
};

/**
 * The detent once the sheet has stopped moving and stayed put for half a second: a raise lands within a frame or two of
 * the change that causes it, so a detent read sooner may not be the one the sheet keeps.
 *
 * @returns The settled detent.
 */
export const stableDetent = async (): Promise<string | undefined> => {
  let last: string | undefined;
  let since = 0;
  await expect
    .poll(
      async () => {
        await sheetSettled();
        const now = await detent();
        if (now !== last || since === 0) {
          last = now;
          since = performance.now();
          return false;
        }
        return performance.now() - since >= 500;
      },
      { timeout: 15_000, interval: 100 },
    )
    .toBe(true);
  return last;
};

/**
 * Assert the sheet holds a detent: sampled every frame for a second, it never leaves it.
 *
 * @param expected - The detent the sheet must keep.
 */
export const expectDetentHeld = async (expected: string): Promise<void> => {
  await sheetSettled();
  const seen = await target.evaluateLocator(grabber(), async (handle) => {
    const values = new Set<string>();
    const until = performance.now() + 1000;
    while (performance.now() < until) {
      values.add(String(handle.getAttribute('aria-valuenow')));
      // oxlint-disable-next-line no-await-in-loop -- one sample per frame.
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    }
    values.add(String(handle.getAttribute('aria-valuenow')));
    return [...values];
  });
  expect(seen).toEqual([expected]);
};
