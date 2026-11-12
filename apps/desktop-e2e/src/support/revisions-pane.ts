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

/** The pane's last line: where the backup is, its chooser and Manage (C2, C4). */
export const backupLine = (page: Page): Locator =>
  page.getByRole('region', { name: 'Backup' }).filter({ visible: true }).first();

/**
 * Open the Backup line's chooser through the pane's own offer (C2, C4): the
 * line's *Back up to Tau Cloud* while the project is on this device only.
 * The helper keeps S1's order — a backup follows the first revision — so a
 * project with none saves one first: from the strip when it has edits, with
 * the save chord when it has none (a fresh, unedited project reads *Nothing
 * saved yet* and its strip offers no verb at all). A project that already has
 * a remote shows its connected line instead, and so does one an entitled
 * account backs up by default (D19): its first revision connects Tau Cloud
 * itself, so the line can leave *This device only* before the offer is read.
 *
 * @param page - The page, with the Revisions pane open.
 */
export const openBackupChooser = async (page: Page): Promise<void> => {
  const line = backupLine(page);
  const strip = revisionStrip(page);
  const chooser = line.getByRole('radiogroup', { name: 'Where to back up' });
  const connected = line.getByRole('status', { name: /^Backup (?:status|connection progress)$/u });
  const backUp = line.getByRole('button', { name: 'Back up to Tau Cloud', exact: true });
  const save = strip.getByRole('button', { name: 'Save', exact: true });
  const nothingSaved = revisionStatus(page).filter({ hasText: 'Nothing saved yet' });
  type Offer = 'chooser' | 'connected' | 'unsaved' | 'nothingSaved' | 'backUp';
  const offerAmong = async (accepted: readonly Offer[]): Promise<Offer> => {
    let offer: Offer | undefined;
    await expect
      .poll(
        async () => {
          offer = (await chooser.isVisible())
            ? 'chooser'
            : (await connected.first().isVisible())
              ? 'connected'
              : (await nothingSaved.isVisible())
                ? (await save.isVisible())
                  ? 'unsaved'
                  : 'nothingSaved'
                : (await backUp.isVisible())
                  ? 'backUp'
                  : undefined;
          return offer !== undefined && accepted.includes(offer);
        },
        { timeout: 120_000 },
      )
      .toBe(true);
    return offer ?? 'chooser';
  };
  let offer = await offerAmong(['chooser', 'connected', 'unsaved', 'nothingSaved', 'backUp']);
  if (offer === 'unsaved') {
    await save.click();
    offer = await offerAmong(['chooser', 'connected', 'backUp']);
  } else if (offer === 'nothingSaved') {
    await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+KeyS`);
    offer = await offerAmong(['chooser', 'connected', 'backUp']);
  }
  if (offer === 'backUp') {
    /* D19's default connection can replace the offer with the connected line
     * between the read and the click; the outcome below holds either way. */
    await backUp.click({ timeout: 15_000 }).catch(() => undefined);
  }
  await offerAmong(['chooser', 'connected']);
};

/**
 * Connect Tau Cloud from an open Backup chooser.
 *
 * An entitled new project connects itself once its first revision exists
 * (D19), so the chooser is driven only when it is still offered after that has
 * had its chance; racing the default connection with a hand-picked one would
 * click a *Back up to Tau Cloud* that is about to unmount.
 *
 * @param page - The page, with the Backup chooser open.
 */
export const connectTauCloud = async (page: Page): Promise<void> => {
  const chooser = backupLine(page).getByRole('radiogroup', { name: 'Where to back up' });
  const choice = chooser.getByRole('radio', { name: 'Tau Cloud' });
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
  await backupLine(page)
    .getByRole('button', { name: /^(?:Back up to Tau Cloud|Change backup)$/u })
    .click();
};
