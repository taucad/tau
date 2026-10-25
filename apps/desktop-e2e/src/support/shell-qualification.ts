import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect } from 'vitest';
import type { Page } from 'playwright';
import type { DesktopSession } from '#support/desktop-app.js';

/** Open the production workbench surface through its ordinary menu. */
export const openTerminalPane = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: 'Open workbench tab', exact: true }).first().click();
  await page.getByRole('menuitem', { name: 'Terminal', exact: true }).click();
  await page.getByRole('region', { name: 'Terminal', exact: true }).waitFor();
};

/** Create an offline project through the same form a person uses. */
export const createTerminalProject = async (session: DesktopSession): Promise<string> => {
  const { page } = session;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('app://tau/projects/new');
  await page.getByLabel('Project Name *').fill('Shell qualification');
  await page.getByRole('button', { name: /^Create Project/u }).click();
  await page.waitForURL(/\/w\//u, { timeout: 60_000 });
  await openTerminalPane(page);
  return join(session.homeRoot, 'shell-qualification');
};

/** Input goes through real keyboard events, never a direct bridge call. */
export const typeTerminalCommand = async (page: Page, command: string): Promise<void> => {
  await page.getByRole('textbox', { name: 'Terminal', exact: true }).focus();
  await page.keyboard.type(command);
  await page.keyboard.press('Enter');
};

/** External file bytes cannot be satisfied by echoed input in the terminal. */
export const expectTerminalFile = async (root: string, path: string, expected: string): Promise<void> => {
  await expect
    .poll(async () => readFile(join(root, path), 'utf8').catch(() => undefined), { timeout: 30_000 })
    .toBe(expected);
};
