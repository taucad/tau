/**
 * The History pane's own gestures, as every desktop-e2e spec drives them
 * (revisions charter D7; canvas rounds 14–21).
 *
 * The strip is the pane's first region: where you are, the one status sentence
 * and its verbs. History's rows are `data-revision-row` buttons named
 * `<title> · <time>` or `V2 · <title>` that open in place; a restore is the
 * opened row's *Restore …*. An entry has no number (M11).
 */
import process from 'node:process';
import { expect } from 'vitest';
import type { Locator, Page } from 'playwright';

/** The pane's strip: where you are, the status sentence and its verbs. */
export const revisionStrip = (page: Page): Locator =>
  page.getByRole('region', { name: 'Where you are' }).filter({ visible: true }).first();

/** The strip's one status sentence, such as `Saved · Backed up` or `Saved on this device`. */
export const revisionStatus = (page: Page): Locator =>
  revisionStrip(page).getByRole('status', { name: 'History status' });

/**
 * Opt a new project out of backup by default (D19) before its first revision.
 *
 * The pane offers no opt-out of its own, so this forgets the project's stored
 * intent (`tau:tau-cloud-intent:<id>`, `use-cloud-projects.ts`) once creation
 * has written it, then reloads so no in-memory copy survives.
 */
export const forgetBackupByDefault = async (page: Page, projectId: string): Promise<void> => {
  const key = `tau:tau-cloud-intent:${projectId}`;
  await expect
    .poll(async () => page.evaluate((intentKey) => localStorage.getItem(intentKey), key), { timeout: 60_000 })
    .not.toBeNull();
  await page.evaluate((intentKey) => {
    localStorage.removeItem(`${intentKey}:account`);
    localStorage.removeItem(intentKey);
  }, key);
  await page.reload({ waitUntil: 'domcontentloaded' });
};

/**
 * History's entry rows, newest first: one button per entry, named
 * `<title> · <time>` or `V2 · <title>`. An entry has no number (M11).
 */
export const historyRows = (page: Page): Locator =>
  page.getByRole('list', { name: 'History entries' }).first().locator('button[data-revision-row]');

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
export const answerIfAsked = async (page: Page, confirm: string | RegExp, outcome: Locator): Promise<void> => {
  const verbMilliseconds = 120_000;
  const button = page
    .getByRole('alertdialog')
    .getByRole('button', typeof confirm === 'string' ? { name: confirm, exact: true } : { name: confirm });
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
 * *Restore …* (`Restore V2`, `Restore “Thicker base”`, `Restore the 10:31 AM
 * autosave`), and confirm when the restore asks.
 *
 * @param page - The page.
 * @param row - The row's button.
 * @param outcome - What is on screen once the restore has landed.
 */
export const restoreFromHistory = async (page: Page, row: Locator, outcome: Locator): Promise<void> => {
  await row.waitFor({ state: 'visible', timeout: 60_000 });
  if ((await row.getAttribute('aria-expanded')) !== 'true') {
    await row.click();
  }
  /* Only the open row shows its verbs, so the list holds one *Restore …*. */
  await page
    .getByRole('list', { name: 'History entries' })
    .first()
    .getByRole('button', { name: /^Restore (?:V\d+|“.*”|the .* autosave|an autosave|this point)$/u })
    .first()
    .click();
  await answerIfAsked(page, /^Restore /u, outcome);
};

/** The Current row once it is a restore: `Restored V2`, `Restored “…”` or `Restored an earlier point`. */
export const currentRestoreRow = (page: Page): Locator =>
  historyRows(page)
    .filter({ hasText: 'Current' })
    .filter({ hasText: /Restored /u });

/**
 * Open the Sync region's chooser through the pane's own offer (A29, canvas
 * round 16): the strip's *Back up*, or More's *Back up…* while the strip's
 * button is *Save*. Nothing offers a backup before the first
 * revision (S1), so a project with none saves one first: from the strip when
 * it has edits, with the save chord when it has none — a fresh, unedited
 * project reads *Nothing saved yet* and its strip offers no verb at all.
 * A project that already has a remote shows the region directly, and so
 * does one an entitled account backs up by default (D19): its first revision
 * connects Tau Cloud itself, so the region can replace *Back up* before the
 * strip ever draws it.
 *
 * @param page - The page, with the Revisions pane open.
 */
export const openBackupChooser = async (page: Page): Promise<void> => {
  const sync = page.getByRole('region', { name: 'Sync' }).filter({ visible: true }).first();
  const strip = revisionStrip(page);
  const backUp = strip.getByRole('button', { name: 'Back up', exact: true });
  const save = strip.getByRole('button', { name: 'Save', exact: true });
  const nothingSaved = strip.getByRole('status', { name: 'History status' }).filter({ hasText: 'Nothing saved yet' });
  type Offer = 'sync' | 'backUp' | 'save' | 'nothingSaved';
  const offerAmong = async (accepted: readonly Offer[]): Promise<Offer> => {
    let offer: Offer | undefined;
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
          return offer !== undefined && accepted.includes(offer);
        },
        { timeout: 120_000 },
      )
      .toBe(true);
    return offer ?? 'sync';
  };
  let offer = await offerAmong(['sync', 'backUp', 'save', 'nothingSaved']);
  if (offer === 'nothingSaved') {
    await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+KeyS`);
    offer = await offerAmong(['sync', 'backUp']);
  }
  if (offer === 'save') {
    // oxlint-disable-next-line unicorn/prefer-dom-node-text-content -- Playwright's own locator method.
    const status = await strip.getByRole('status', { name: 'History status' }).innerText();
    if (status.includes('Nothing saved yet')) {
      await save.click();
      offer = await offerAmong(['sync', 'backUp']);
    } else {
      await strip.getByRole('button', { name: 'More', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Back up…' }).first().click();
    }
  }
  if (offer === 'backUp') {
    /* D19's default connection can replace *Back up* with the region between
     * the read and the click; the region below is the outcome either way. */
    await backUp.click({ timeout: 15_000 }).catch(() => undefined);
  }
  await sync.waitFor({ state: 'visible', timeout: 60_000 });
};

/**
 * Connect Tau Cloud from an open Sync region.
 *
 * An entitled new project connects itself once its first revision exists
 * (D19), so the chooser is driven only when it is still offered after that has
 * had its chance; racing the default connection with a hand-picked one would
 * click a *Connect backup* that is about to unmount.
 *
 * @param page - The page, with the Sync region open.
 */
export const connectTauCloud = async (page: Page): Promise<void> => {
  const region = page.getByRole('region', { name: 'Sync' }).filter({ visible: true }).first();
  const choice = region.getByRole('radio', { name: 'Tau Cloud' });
  const stillOffered = await expect
    .poll(async () => choice.isVisible(), { timeout: 30_000 })
    .toBe(false)
    .then(
      () => false,
      () => true,
    );
  if (!stillOffered) {
    return;
  }
  await choice.click();
  await region.getByRole('button', { name: 'Connect backup', exact: true }).click();
};
