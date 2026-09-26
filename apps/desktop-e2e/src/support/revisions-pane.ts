/**
 * The Revisions pane's own gestures, as every desktop-e2e spec drives them
 * (revisions charter D7; canvas rounds 14–21).
 *
 * The strip is the pane's first region: where you are, the one status sentence
 * and its verbs. History's rows are buttons named `Rev N · <title>` that open
 * in place; a restore is the opened row's *Restore Rev N*.
 */
import process from 'node:process';
import { expect } from 'vitest';
import type { Locator, Page } from 'playwright';

/** The pane's strip: where you are, the status sentence and its verbs. */
export const revisionStrip = (page: Page): Locator =>
  page.getByRole('region', { name: 'Where you are' }).filter({ visible: true }).first();

/** History's revision rows, newest first: one button per revision, named `Rev N · <title>`. */
export const historyRows = (page: Page): Locator =>
  page
    .getByRole('list', { name: 'Revision history' })
    .first()
    .getByRole('button', { name: /^Rev \d+ · /u });

/**
 * Answer the question a verb asks only sometimes, then wait for its outcome.
 *
 * A restore asks first only when it removes files or saves edits
 * (`restore.machine` `isRisky`), a branch verb only when D10's guard has a
 * question; whichever arrives first decides.
 *
 * @param page - The page.
 * @param confirm - The dialog's confirming button.
 * @param outcome - What is on screen once the verb has settled, within two minutes.
 */
export const answerIfAsked = async (page: Page, confirm: string, outcome: Locator): Promise<void> => {
  const verbMilliseconds = 120_000;
  const button = page.getByRole('alertdialog').getByRole('button', { name: confirm, exact: true });
  let arrived: 'outcome' | 'question' | undefined;
  await expect
    .poll(
      async () => {
        arrived = (await outcome.first().isVisible()) ? 'outcome' : (await button.isVisible()) ? 'question' : undefined;
        return arrived;
      },
      { timeout: verbMilliseconds },
    )
    .toBeDefined();
  if (arrived === 'question') {
    await button.click();
    await outcome.first().waitFor({ state: 'visible', timeout: verbMilliseconds });
  }
};

/**
 * Restore a History row the way a person does: open it, press its
 * *Restore Rev N*, and confirm when the restore asks.
 *
 * @param page - The page.
 * @param row - The row's button.
 * @param outcome - What is on screen once the restore has landed.
 * @returns The restored revision's number.
 */
export const restoreFromHistory = async (
  page: Page,
  row: Locator,
  outcome: (n: string) => Locator,
): Promise<string> => {
  await row.waitFor({ state: 'visible', timeout: 60_000 });
  const n = /^Rev (\d+) · /u.exec((await row.getAttribute('aria-label')) ?? '')?.[1];
  if (n === undefined) {
    throw new Error('The History row names no revision.');
  }
  if ((await row.getAttribute('aria-expanded')) !== 'true') {
    await row.click();
  }
  await page
    .getByRole('button', { name: `Restore Rev ${n}`, exact: true })
    .first()
    .click();
  await answerIfAsked(page, `Restore Rev ${n}`, outcome(n));
  return n;
};

/**
 * Open the Sync region's chooser through the pane's own offer (A29, canvas
 * round 16): the strip's *Back up*, or More's *Back up…* while the strip's
 * button is *Save revision*. Nothing offers a backup before the first
 * revision (S1), so a project with none saves one first: from the strip when
 * it has edits, with the save chord when it has none — a fresh, unedited
 * project reads *Nothing saved yet* and its strip offers no verb at all.
 * A project that already has a remote shows the region directly.
 *
 * @param page - The page, with the Revisions pane open.
 */
export const openBackupChooser = async (page: Page): Promise<void> => {
  const sync = page.getByRole('region', { name: 'Sync' }).filter({ visible: true }).first();
  const strip = revisionStrip(page);
  const backUp = strip.getByRole('button', { name: 'Back up', exact: true });
  const save = strip.getByRole('button', { name: 'Save revision', exact: true });
  const nothingSaved = strip.getByRole('status', { name: 'Revision status' }).filter({ hasText: 'Nothing saved yet' });
  let offer: 'sync' | 'backUp' | 'save' | 'nothingSaved' | undefined;
  await expect
    .poll(
      async () => {
        offer = (await sync.isVisible())
          ? 'sync'
          : (await backUp.isVisible())
            ? 'backUp'
            : (await save.isVisible())
              ? 'save'
              : (await nothingSaved.isVisible())
                ? 'nothingSaved'
                : undefined;
        return offer;
      },
      { timeout: 120_000 },
    )
    .toBeDefined();
  if (offer === 'nothingSaved') {
    await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+KeyS`);
    await backUp.waitFor({ state: 'visible', timeout: 120_000 });
    offer = 'backUp';
  }
  if (offer === 'save') {
    // oxlint-disable-next-line unicorn/prefer-dom-node-text-content -- Playwright's own locator method.
    const status = await strip.getByRole('status', { name: 'Revision status' }).innerText();
    if (status.includes('Not saved yet')) {
      await save.click();
      await backUp.waitFor({ state: 'visible', timeout: 120_000 });
      offer = 'backUp';
    } else {
      await strip.getByRole('button', { name: 'More', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Back up…' }).first().click();
    }
  }
  if (offer === 'backUp') {
    await backUp.click();
  }
  await sync.waitFor({ state: 'visible', timeout: 60_000 });
};
