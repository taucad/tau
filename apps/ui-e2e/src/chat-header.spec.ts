import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { composerSelector, dismissCookies, prepareComposerPage } from '#support/chat-attachments.js';

/**
 * The chat header one-row blueprint's browser pin (W6): the pane opens with one
 * header row that carries the chat's name; the ⋯ menu carries Rename, Export and
 * the read-only meta; and renaming works from the menu and by double-clicking
 * the name, in place, with the sidebar row following the new name.
 */

const headerSelector = '[data-slot="floating-panel-content"] > [data-slot="floating-panel-content-header"]';
const header = (): Locator => selectors.getByCss(headerSelector).first();
const nameField = (): Locator => selectors.getByRole('textbox', { name: 'Chat name' });

const openSeededChat = async (): Promise<void> => {
  await prepareComposerPage();
  await target.installAgentHostGatewayFixture([]);
  await target.setViewport({ width: 1440, height: 960 });
  await target.navigate('/__e2e/chat-attachments?chats=2');
  await target.expectUrl(/\/w\/[^/]+\/[^/?]+\?/u, 60_000);
  await dismissCookies();
  await target.expectVisible(selectors.getByCss(composerSelector).first(), 60_000);
};

test('carries the name in one header row and lists the meta in the chat menu', async () => {
  await openSeededChat();

  expect(await target.evaluate((selector) => document.querySelectorAll(selector).length, headerSelector)).toBe(1);
  await target.expectVisible(header().getByText('Attachments chat', { exact: true }));
  // The status row is gone: nothing sticky sits between the header and the transcript.
  expect(
    await target.evaluate(() => document.querySelector('[data-slot="floating-panel-content"] > .sticky') === null),
  ).toBe(true);

  await target.click(selectors.getByRole('button', { name: 'Chat options' }));
  await target.expectVisible(selectors.getByRole('menuitem', { name: 'Rename' }));
  await target.expectVisible(selectors.getByRole('menuitem', { name: 'Export transcript' }));
  const menuText = (await target.textContent(selectors.getByRole('menu'))) ?? '';
  expect(menuText).toContain('Activity');
  expect(menuText).toContain('Runs on');
  expect(menuText).toContain('Haiku 4.5');
  expect(menuText).toContain('Credits');
  await target.keyboardPress('Escape');
  await target.expectHidden(selectors.getByRole('menu'));
});

test('renames in place from the menu and by double-click, and the sidebar row follows', async () => {
  await openSeededChat();

  await target.click(selectors.getByRole('button', { name: 'Chat options' }));
  await target.click(selectors.getByRole('menuitem', { name: 'Rename' }));
  await target.expectVisible(nameField());
  await target.fill(nameField(), 'Renamed from the menu');
  await target.press(nameField(), 'Enter');

  await target.expectVisible(header().getByText('Renamed from the menu', { exact: true }), 30_000);
  await target.expectHidden(nameField());
  await target.expectVisible(selectors.getByRole('link', { name: 'Renamed from the menu', exact: true }), 30_000);

  // Double-click opens the same field; Escape leaves the name as it was.
  await target.click(header().getByText('Renamed from the menu', { exact: true }), { clickCount: 2 });
  await target.expectVisible(nameField());
  await target.fill(nameField(), 'Abandoned edit');
  await target.press(nameField(), 'Escape');
  await target.expectHidden(nameField());
  await target.expectVisible(header().getByText('Renamed from the menu', { exact: true }));
  expect(await target.textContent(header())).not.toContain('Abandoned edit');
});
