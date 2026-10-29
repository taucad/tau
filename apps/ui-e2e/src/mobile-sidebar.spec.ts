import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { prepareComposerPage } from '#support/chat-attachments.js';

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
/** The phone chat title: named by the chat, then the switcher it opens. */
const chatTitle = (): Locator =>
  selectors.getByRole('button', { name: new RegExp(`, Chats in ${projectNames.a}$`, 'u') });
const chatSwitcher = (): Locator => selectors.getByRole('dialog', { name: `Chats in ${projectNames.a}` });
const switcherChats = (): Locator => chatSwitcher().getByRole('list', { name: 'Chats' });
const composer = (): Locator => selectors.getByRole('textbox', { name: 'Ask Tau to build anything...', exact: true });
/** Whether a located element holds focus. */
const hasFocus = async (locator: Locator): Promise<boolean> =>
  target.evaluateLocator(locator, (element) => element.contains(document.activeElement));

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

const openMenu = (): Locator => selectors.getByRole('menu');

/** The open menu's items, by their names and variants, in order. */
const readOpenMenu = async (): Promise<ReadonlyArray<{ readonly name: string; readonly variant: string }>> =>
  target.evaluateLocator(openMenu(), (menu) =>
    [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')].map((item) => ({
      name: item.textContent.trim(),
      variant: item.dataset['variant'] ?? 'default',
    })),
  );

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
  await target.expectVisible(openMenu());
  const fromActions = await readOpenMenu();
  expect(fromActions.map(({ name }) => name)).toContain('Rename');
  expect(fromActions.find(({ name }) => name === 'Move to Trash')?.variant).toBe('destructive');
  // Every item but Trash is plain: the destructive styling is Trash's alone.
  expect(fromActions.filter(({ variant }) => variant === 'destructive')).toHaveLength(1);
  await target.keyboardPress('Escape');
  await target.expectHidden(openMenu());
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
  await target.expectVisible(openMenu());
  expect(await readOpenMenu()).toEqual(fromActions);
});

test('lists local projects signed out, with sign-in reachable from the footer', async () => {
  await openSeededProject({ width: 390, height: 844 });
  await openSidebarSheet();

  await target.expectVisible(sidebarSheet().getByRole('link', { name: projectNames.a, exact: true }));
  await target.expectVisible(sidebarSheet().getByRole('link', { name: projectNames.b, exact: true }));
  // The footer's account control; signed out, it carries the way in.
  await target.click(sidebarSheet().getByRole('button', { name: 'Account', exact: true }), { touch: true });
  const signIn = selectors.getByRole('menuitem', { name: 'Sign in', exact: true });
  await target.expectVisible(signIn);
  expect(await target.getAttribute(signIn, 'href')).toMatch(/sign-in/u);
});

test('opens this project’s chats from the chat title, switches chat, and starts a new chat with the composer focused', async () => {
  await openSeededProject({ width: 390, height: 844 });
  await target.click(navigation().getByRole('button', { name: 'Chat', exact: true }), { touch: true });
  await target.expectVisible(chatTitle(), 60_000);
  await target.expectVisible(composer(), 60_000);

  await target.click(chatTitle(), { touch: true });
  await target.expectVisible(chatSwitcher());
  // New chat leads, then this project's chats, most recent first: each row is found by its name, in that order.
  const rowNames = ['New chat', ...chatNames];
  const rowTop = async (name: string): Promise<number> => {
    const box = await target.boundingBox(switcherChats().getByRole('button', { name, exact: true }));
    if (!box) {
      throw new Error(`The ${name} row has no layout box.`);
    }
    return box.y;
  };
  await target.expectVisible(switcherChats().getByRole('button', { name: chatNames[1], exact: true }));
  const tops = await Promise.all(rowNames.map(async (name) => rowTop(name)));
  expect(tops).toEqual([...tops].sort((left, right) => left - right));
  expect(new Set(tops).size).toBe(rowNames.length);
  const currentFlags = await Promise.all(
    chatNames.map(async (name) =>
      target.getAttribute(switcherChats().getByRole('button', { name, exact: true }), 'aria-current'),
    ),
  );
  // Exactly one chat is the open one.
  expect(currentFlags.filter((flag) => flag === 'true')).toHaveLength(1);
  const current = chatNames[currentFlags.indexOf('true')];
  const other = chatNames.find((name) => name !== current);
  if (!other) {
    throw new Error('The seed has no second chat to switch to.');
  }
  const urlBefore = await target.currentUrl();

  await target.click(switcherChats().getByRole('button', { name: other, exact: true }), { touch: true });
  await target.expectHidden(chatSwitcher());
  await expect.poll(async () => target.textContent(chatTitle())).toContain(other);
  await expect.poll(async () => target.currentUrl()).not.toBe(urlBefore);
  expect(new URL(await target.currentUrl()).searchParams.get('chat')).toBeTruthy();
  // The switcher hands focus back to the title it opened from.
  await expect.poll(async () => hasFocus(chatTitle())).toBe(true);

  await target.click(chatTitle(), { touch: true });
  await target.expectVisible(chatSwitcher());
  const switchedUrl = await target.currentUrl();
  await target.click(switcherChats().getByRole('button', { name: 'New chat', exact: true }), { touch: true });
  await target.expectHidden(chatSwitcher());
  await expect.poll(async () => target.textContent(chatTitle())).toContain('New chat');
  await expect.poll(async () => target.currentUrl()).not.toBe(switchedUrl);
  // PN-CHAT-3: the new chat's composer takes focus.
  await expect.poll(async () => hasFocus(composer())).toBe(true);

  // Rename from the switcher: the editor starts once the sheet has gone, and the page is left scrollable.
  await target.click(chatTitle(), { touch: true });
  await target.expectVisible(chatSwitcher());
  await target.click(chatSwitcher().getByRole('button', { name: 'Rename this chat', exact: true }), { touch: true });
  const field = selectors.getByRole('textbox', { name: 'Chat name' });
  await target.expectVisible(field);
  await target.expectHidden(chatSwitcher());
  await expect.poll(async () => hasFocus(field)).toBe(true);
  await target.fill(field, 'Renamed on a phone');
  await target.press(field, 'Enter');
  await expect.poll(async () => target.textContent(chatTitle())).toContain('Renamed on a phone');
  expect(await target.evaluate(() => document.body.style.position)).not.toBe('fixed');
  expect(await target.evaluate(() => document.body.style.pointerEvents)).not.toBe('none');
});
