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

/** The sheet's detents as the grabber reports them (`aria-valuenow`): peek, half and full (D4). */
export const detents = { peek: '1', half: '2', full: '3' } as const;

export const navigation = (): Locator => selectors.getByRole('navigation', { name: 'Workbench' });
export const navButton = (name: string): Locator => navigation().getByRole('button', { name, exact: true });
export const grabber = (): Locator => selectors.getByRole('slider', { name: 'Drawer height' });
export const allSheet = (): Locator => selectors.getByRole('dialog', { name: 'All surfaces' });
/** The open sheet surface, named by its title. */
export const surface = (title: string): Locator => selectors.getByRole('region', { name: title, exact: true });
/** Every open sheet surface, whatever its title. */
export const anySurface = (): Locator => selectors.getByCss('[data-slot="mobile-surface"]');
export const projectTitle = (): Locator => selectors.getByCss('[data-slot="project-title-button"]');

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
    const sheet = handle.closest('[data-slot=drawer-content]');
    if (!sheet) {
      throw new Error('The grabber is not inside the sheet.');
    }
    // A cancelled transition has settled too: a newer one replaced it or the sheet stopped moving.
    await Promise.all(sheet.getAnimations().map(async (animation) => animation.finished.catch(() => undefined)));
  });

/**
 * Move the sheet with the grabber's own keys (D4) and wait for the detent: `Home` peek, `End` full; the arrows step
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
export const unshownReason = async (locator: Locator): Promise<string | undefined> =>
  target.evaluateLocator(locator, (element) => {
    const box = element.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) {
      return 'has no box';
    }
    const nav = document.querySelector('nav[aria-label="Workbench"]')?.getBoundingClientRect();
    if (nav && box.bottom > nav.top + 0.5) {
      return `ends at ${String(box.bottom)}, under the nav at ${String(nav.top)}`;
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
  });
