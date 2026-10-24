import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { composerSelector, prepareComposerPage } from '#support/chat-attachments.js';

/**
 * The phone sidebar sheet and the phone chat switcher on a real project route (canvas SB-02, SB-04, SB-05, SB-07,
 * CH-09; charter D10, I2, I3).
 *
 * The seed (`/__e2e/project-navigation?activity=1`) makes two local projects, the first with two chats, and opens
 * the first. Every page here is signed out: the e2e build points at an API that is not running, so these are the
 * signed-out sheet as a visitor sees it (SB-05).
 */

const seedRoute = '/__e2e/project-navigation?activity=1';
const projectNames = { a: 'Project Navigation A', b: 'Project Navigation B' } as const;
const chatNames = ['Newer activity', 'Older activity'] as const;
/** The canvas's tap-out floor beside the sheet (SB-07, I3). */
const tapOutFloor = 48;
/** The canvas's sheet width wherever the floor allows it (`w-72`). */
const sheetWidth = 288;

const sidebarSheet = (): Locator => selectors.getByRole('dialog', { name: 'Sidebar' });
const navigation = (): Locator => selectors.getByRole('navigation', { name: 'Workbench' });
const chatTitle = (): Locator => selectors.getByCss('[data-slot="chat-title-button"]');
const chatSwitcher = (): Locator => selectors.getByCss('[data-slot="chat-switcher"]');

const openSeededProject = async (viewport: { readonly width: number; readonly height: number }): Promise<void> => {
  await target.commands.uiOpenTarget({ hasTouch: true, isMobile: true });
  await prepareComposerPage();
  await target.setViewport(viewport);
  await target.navigate(seedRoute);
  // The seed writes both projects through the file-manager worker before it navigates.
  await target.expectUrl(/\/w\/[^/]+\/[^/?]+/u, 60_000);
  await target.expectVisible(navigation(), 60_000);
};

const openSidebarSheet = async (): Promise<void> => {
  await target.click(selectors.getByRole('button', { name: 'Open sidebar', exact: true }), { touch: true });
  await target.expectVisible(sidebarSheet());
  // The sheet slides in; read its box only once it stops.
  await target.evaluateLocator(sidebarSheet(), async (sheet) => {
    await Promise.all(sheet.getAnimations().map(async (animation) => animation.finished.catch(() => undefined)));
  });
};

/** The visible menu's item names and variants, in order. */
const readOpenMenu = async (): Promise<ReadonlyArray<{ readonly name: string; readonly variant: string }>> =>
  target.evaluate(() => {
    const menu = document.querySelector<HTMLElement>('[role="menu"][data-state="open"]');
    if (!menu) {
      throw new Error('No menu is open.');
    }
    return [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')].map((item) => ({
      name: item.textContent.trim(),
      variant: item.dataset['variant'] ?? 'default',
    }));
  });

const openMenuSize = async (): Promise<number> => {
  const menu = await target.evaluate(
    () => document.querySelectorAll('[role="menu"][data-state="open"] [role="menuitem"]').length,
  );
  return menu;
};

test.each([
  { width: 320, height: 640 },
  { width: 390, height: 844 },
])(
  'leaves at least 48px to tap out, gives New project 44px with no keyboard chip, and closes on a tap outside at $width×$height',
  async (viewport) => {
    await openSeededProject(viewport);
    expect(await target.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    await openSidebarSheet();

    const sheet = await target.boundingBox(sidebarSheet());
    if (!sheet) {
      throw new Error('The sidebar sheet has no layout box.');
    }
    expect(sheet.x).toBeCloseTo(0, 0);
    const tapOut = viewport.width - (sheet.x + sheet.width);
    // SB-07: the sheet never takes more than 100% − 48px; where that leaves room it keeps the canvas's 288px.
    expect(tapOut).toBeGreaterThanOrEqual(tapOutFloor - 0.5);
    expect(sheet.width).toBeCloseTo(Math.min(sheetWidth, viewport.width - tapOutFloor), 0);
    expect(await target.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(
      0,
    );

    // SB-02: New project is a 44px row, and a coarse pointer gets no keyboard chip.
    const newProject = await target.evaluateLocator(
      sidebarSheet().getByRole('link', { name: /New Project/u }),
      (link) => {
        const button = link.querySelector<HTMLElement>('[data-slot="sidebar-menu-button"]');
        if (!button) {
          throw new Error('New Project has no menu button.');
        }
        // The words a person sees: leaf elements that render, so a chip hidden on a coarse pointer drops out.
        const shown = [...button.querySelectorAll<HTMLElement>('*')]
          .filter((element) => element.childElementCount === 0 && element.checkVisibility())
          .map((element) => element.textContent.trim())
          .filter((text) => text !== '');
        return { height: button.getBoundingClientRect().height, shown };
      },
    );
    expect(newProject.height).toBeGreaterThanOrEqual(44);
    expect(newProject.shown).toEqual(['New Project']);

    // A tap in the strip beside the sheet closes it.
    await target.mouseClick(sheet.x + sheet.width + tapOut / 2, viewport.height / 2);
    await target.expectHidden(sidebarSheet());
  },
);

test('opens a project row’s actions from ⋯ and from a long press, with Move to Trash destructive', async () => {
  await openSeededProject({ width: 390, height: 844 });
  await openSidebarSheet();

  await target.click(sidebarSheet().getByRole('button', { name: `More actions for ${projectNames.b}`, exact: true }), {
    touch: true,
  });
  await expect.poll(openMenuSize).toBeGreaterThan(0);
  const fromActions = await readOpenMenu();
  expect(fromActions.map(({ name }) => name)).toContain('Rename');
  expect(fromActions.find(({ name }) => name === 'Move to Trash')?.variant).toBe('destructive');
  // Every item but Trash is plain: the destructive styling is Trash's alone.
  expect(fromActions.filter(({ variant }) => variant === 'destructive')).toHaveLength(1);
  await target.keyboardPress('Escape');
  await expect
    .poll(async () => target.evaluate(() => document.querySelector('[role="menu"][data-state="open"]') === null))
    .toBe(true);
  // Escape closes only the menu, not the sheet under it.
  await target.expectVisible(sidebarSheet());

  // A long press on the row opens the same items (I2: long-press equals the context menu).
  await target.evaluateLocator(
    sidebarSheet().getByRole('link', { name: projectNames.b, exact: true }),
    async (link) => {
      const box = link.getBoundingClientRect();
      const init = {
        bubbles: true,
        cancelable: true,
        pointerId: 23,
        pointerType: 'touch',
        isPrimary: true,
        button: 0,
        buttons: 1,
        clientX: box.left + box.width / 2,
        clientY: box.top + box.height / 2,
      } satisfies PointerEventInit;
      link.dispatchEvent(new PointerEvent('pointerdown', init));
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 900);
      });
      link.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
    },
  );
  await expect.poll(openMenuSize).toBeGreaterThan(0);
  expect(await readOpenMenu()).toEqual(fromActions);
});

test('lists local projects signed out, with sign-in reachable from the footer', async () => {
  await openSeededProject({ width: 390, height: 844 });
  await openSidebarSheet();

  await target.expectVisible(sidebarSheet().getByRole('link', { name: projectNames.a, exact: true }));
  await target.expectVisible(sidebarSheet().getByRole('link', { name: projectNames.b, exact: true }));
  const footer = sidebarSheet().getByCss('[data-slot="sidebar-footer"]');
  await target.click(footer.getByRole('button', { name: 'Account' }), { touch: true });
  const signIn = selectors.getByRole('menuitem', { name: 'Log in' });
  await target.expectVisible(signIn);
  expect(await target.getAttribute(signIn, 'href')).toMatch(/sign-in/u);
});

test('opens this project’s chats from the chat title, switches chat, and starts a new chat with the composer focused', async () => {
  await openSeededProject({ width: 390, height: 844 });
  await target.click(navigation().getByRole('button', { name: 'Chat', exact: true }), { touch: true });
  await target.expectVisible(chatTitle(), 60_000);
  await target.expectVisible(selectors.getByCss(composerSelector).first(), 60_000);

  await target.click(chatTitle(), { touch: true });
  await target.expectVisible(chatSwitcher());
  await target.expectVisible(chatSwitcher().getByText(`Chats in ${projectNames.a}`, { exact: true }));
  const rows = async (): Promise<ReadonlyArray<{ readonly name: string; readonly isCurrent: boolean }>> =>
    target.evaluateLocator(chatSwitcher(), (sheet) =>
      [...sheet.querySelectorAll<HTMLElement>('ul[aria-label="Chats"] [data-slot="chat-switcher-row"]')].map((row) => ({
        name: row.textContent.trim(),
        isCurrent: row.getAttribute('aria-current') === 'true',
      })),
    );
  const rowNames = async (): Promise<readonly string[]> => {
    const listedRows = await rows();
    return listedRows.map(({ name }) => name);
  };
  await expect.poll(rowNames).toEqual(['New chat', ...chatNames]);
  const listed = await rows();
  const current = listed.find(({ isCurrent }) => isCurrent)?.name;
  const other = chatNames.find((name) => name !== current);
  if (!other) {
    throw new Error('The seed has no second chat to switch to.');
  }
  const urlBefore = await target.currentUrl();

  await target.click(chatSwitcher().getByRole('button', { name: other, exact: true }), { touch: true });
  await target.expectHidden(chatSwitcher());
  await expect.poll(async () => target.textContent(chatTitle())).toContain(other);
  await expect.poll(async () => target.currentUrl()).not.toBe(urlBefore);
  expect(new URL(await target.currentUrl()).searchParams.get('chat')).toBeTruthy();

  await target.click(chatTitle(), { touch: true });
  await target.expectVisible(chatSwitcher());
  const switchedUrl = await target.currentUrl();
  await target.click(chatSwitcher().getByRole('button', { name: 'New chat', exact: true }), { touch: true });
  await target.expectHidden(chatSwitcher());
  await expect.poll(async () => target.textContent(chatTitle())).toContain('New chat');
  await expect.poll(async () => target.currentUrl()).not.toBe(switchedUrl);
  // PN-CHAT-3: the new chat's composer takes focus.
  await expect
    .poll(async () =>
      target.evaluate((selector) => Boolean(document.activeElement?.closest(selector)), composerSelector),
    )
    .toBe(true);
});
