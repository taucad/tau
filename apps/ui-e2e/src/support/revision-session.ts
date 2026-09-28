/**
 * A seeded project, its source file open, and the save gesture — as every
 * revision spec drives them.
 *
 * Lifted out of `revision-latency.spec.ts` so the restore spec builds its depth
 * the same way the latency gates do (audit §7.1 T9) instead of copying it.
 */

import { expect } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { filesPane, treeItem } from '#support/file-tree.js';

/** The Revisions pane body that is on screen (the workbench mounts one per slot). */
export const visibleRevisionsPanel = '[data-slot="revisions-panel-body"]:visible';

/** The always-on header chip; its accessible name carries branch, head and state. */
export const revisionChip = (): Locator => selectors.getByRole('button', { name: /^Open Revisions\./u });

const declineCookies = async (): Promise<void> => {
  const decline = selectors.getByRole('button', { name: 'Decline' }).last();
  await target.expectVisible(decline, 15_000);
  await target.click(decline);
};

/**
 * Seed a project through the e2e fixture route and wait for its workspace.
 *
 * @param query - The fixture's search string, e.g. `?files=1000&binaryMib=5`.
 */
export const openFixture = async (query: string): Promise<void> => {
  await target.setViewport({ width: 1440, height: 900 });
  await target.navigate(`/__e2e/project-file-tree${query}`);
  await target.expectUrl(/\/w\/[^/]+\/[^/]+$/u, 180_000);
  await declineCookies();
};

/** The platform's save chord. */
export const saveShortcut = async (): Promise<string> =>
  target.evaluate(() => (/mac/i.test(navigator.userAgent) ? 'Meta+s' : 'Control+s'));

/**
 * Open the seed's source file the way a person opens it, through the tree.
 *
 * A fresh project opens with no editor tab, and the Files pane is reached from
 * the command palette when the workbench is showing something else.
 */
export const openSourceFile = async (): Promise<void> => {
  if (!(await target.isVisible(filesPane()))) {
    await target.click(selectors.getByRole('button', { name: /Search/u }));
    const search = selectors.getByPlaceholder('Search projects, chats, and actions...');
    await target.expectVisible(search, 15_000);
    await target.fill(search, 'Open files');
    await target.click(selectors.getByText('Open files', { exact: true }));
  }
  await target.expectVisible(filesPane(), 60_000);
  for (const path of ['public', 'public/models']) {
    const folder = treeItem(path);
    // oxlint-disable-next-line no-await-in-loop -- Each child row only exists after its parent opens.
    await target.expectVisible(folder, 30_000);
    // oxlint-disable-next-line no-await-in-loop -- Each child row only exists after its parent opens.
    if ((await target.getAttribute(folder, 'aria-expanded')) !== 'true') {
      // oxlint-disable-next-line no-await-in-loop -- Each child row only exists after its parent opens.
      await target.click(folder, { position: { x: 8, y: 14 } });
    }
  }
  const entry = treeItem('public/models/honeycomb.js');
  await target.expectVisible(entry, 30_000);
  await target.click(entry);
};

/** Put the caret in the source editor. Once: a save does not move focus. */
export const focusSource = async (): Promise<void> => {
  const lines = selectors.getByCss('.monaco-editor .view-lines').last();
  await target.expectVisible(lines, 60_000);
  await target.click(lines);
};

/**
 * Wait for the chip to say the files differ from the head.
 *
 * `revision-vocabulary.ts` words that two ways: *Modified since Rev N* on a line
 * with a head, *Not saved yet* before the first revision — which is where every
 * spec's fresh fixture starts.
 */
const awaitModified = async (): Promise<void> => {
  await target.waitFor(
    () =>
      [...document.querySelectorAll('button')].some((button) =>
        /^Open Revisions\..*\. (?:Modified since|Not saved yet)/u.test(button.getAttribute('aria-label') ?? ''),
      ),
    undefined,
    { timeout: 60_000 },
  );
};

/**
 * One character into the open file, then wait for the chip to say *Modified*.
 *
 * `Escape` closes Monaco's suggest widget, which otherwise covers the editor
 * and swallows the next gesture.
 */
export const editSource = async (): Promise<void> => {
  await target.keyboardPress('a');
  await target.keyboardPress('Escape');
  await awaitModified();
};

/**
 * Replace the whole open file with one line, then wait for *Modified*: two
 * lines that each replace it with a different line conflict on a merge, where
 * one character typed at a clicked caret may not.
 *
 * @param line - The file's new contents; no brackets or quotes, which Monaco would close.
 */
export const replaceSource = async (line: string): Promise<void> => {
  await target.keyboardPress('ControlOrMeta+a');
  /* Whatever Monaco focused: its EditContext host where the browser has one;
   * its hidden textarea only receives input where it does not. */
  await target.type(selectors.getByCss('.monaco-editor :focus'), line);
  await target.keyboardPress('Escape');
  await awaitModified();
};

/**
 * Wait for the checkout to rest on a revision — the chip's own *Saved* signal.
 *
 * The resting sentence itself (*Saved on this device*, *Saved, …*), not the
 * absence of *Modified*: *Not saved yet* and *Saving…* carry no *Modified*
 * either, so that test passed before the save had landed.
 *
 * @param timeout - How long the save may take.
 */
export const awaitSaved = async (timeout = 60_000): Promise<void> => {
  await target.waitFor(
    () =>
      [...document.querySelectorAll('button')].some((button) =>
        /^Open Revisions\..*\. Saved\b/u.test(button.getAttribute('aria-label') ?? ''),
      ),
    undefined,
    { timeout },
  );
};

/** The pane's strip: where you are, the one status sentence and its verbs. */
export const revisionStrip = (): Locator => selectors.getByCss(`${visibleRevisionsPanel} [aria-label="Where you are"]`);

/**
 * A History row, the button that opens it, by its revision number.
 *
 * @param n - The row's `Rev N`.
 * @returns The row's button, named `Rev N · <title>`.
 */
export const historyRow = (n: number): Locator =>
  selectors
    .getByCss(visibleRevisionsPanel)
    .getByRole('list', { name: 'Revision history' })
    .getByRole('button', { name: new RegExp(String.raw`^Rev ${String(n)} · `, 'u') });

/**
 * Answer the question a verb asks only sometimes, then wait for its outcome.
 *
 * A restore asks first only when it removes files or saves edits
 * (`restore.machine` `isRisky`); a branch verb only when D10's guard has a
 * question. Whichever arrives first decides: the outcome, or the dialog whose
 * confirming button is then pressed.
 *
 * @param confirm - The dialog's confirming button.
 * @param outcome - What is on screen once the verb has settled.
 * @param timeout - How long the verb may take.
 */
export const answerIfAsked = async (confirm: string, outcome: Locator, timeout = 60_000): Promise<void> => {
  const button = selectors.getByRole('alertdialog').getByRole('button', { name: confirm, exact: true });
  let arrived: 'outcome' | 'question' | undefined;
  await expect
    .poll(
      async () => {
        arrived = (await target.isVisible(outcome))
          ? 'outcome'
          : (await target.isVisible(button))
            ? 'question'
            : undefined;
        return arrived;
      },
      { timeout },
    )
    .toBeDefined();
  if (arrived === 'question') {
    await target.click(button);
    await target.expectVisible(outcome, timeout);
  }
};

/**
 * Restore a revision the way a person does: open its History row, press its
 * *Restore Rev N*, and confirm the dialog when the restore asks.
 *
 * @param n - The revision to restore.
 * @param outcome - What is on screen once the restore has landed.
 */
export const restoreFromHistory = async (n: number, outcome: Locator): Promise<void> => {
  const row = historyRow(n);
  await target.expectVisible(row, 30_000);
  if ((await target.getAttribute(row, 'aria-expanded')) !== 'true') {
    await target.click(row);
  }
  const restore = selectors
    .getByCss(visibleRevisionsPanel)
    .getByRole('button', { name: `Restore Rev ${String(n)}`, exact: true });
  await target.click(restore);
  await answerIfAsked(`Restore Rev ${String(n)}`, outcome);
};

/**
 * Open the Sync region's chooser through the pane's own offer (A29, canvas
 * round 16): the strip's *Back up*, or More's *Back up…* while the strip's
 * button is *Save revision*. Nothing offers a backup before the first
 * revision (S1), so a project with none saves one first: from the strip when
 * it has edits, with the save chord when it has none — a fresh, unedited
 * project's strip offers no *Save revision* at all.
 */
export const openBackupChooser = async (): Promise<void> => {
  const sync = selectors.getByCss(`${visibleRevisionsPanel} #revision-sync-heading`);
  const strip = revisionStrip();
  const backUp = strip.getByRole('button', { name: 'Back up', exact: true });
  const save = strip.getByRole('button', { name: 'Save revision', exact: true });
  const nothingSaved = strip.getByRole('status', { name: 'Revision status' }).filter({ hasText: 'Nothing saved yet' });
  let offer: 'sync' | 'backUp' | 'save' | 'nothingSaved' | undefined;
  await expect
    .poll(
      async () => {
        offer = (await target.isVisible(sync))
          ? 'sync'
          : (await target.isVisible(backUp))
            ? 'backUp'
            : (await target.isVisible(save))
              ? 'save'
              : (await target.isVisible(nothingSaved))
                ? 'nothingSaved'
                : undefined;
        return offer;
      },
      { timeout: 120_000 },
    )
    .toBeDefined();
  if (offer === 'nothingSaved') {
    await target.keyboardPress(await saveShortcut());
    await target.expectVisible(backUp, 120_000);
    offer = 'backUp';
  }
  if (offer === 'save') {
    const status = await target.textContent(strip.getByRole('status', { name: 'Revision status' }));
    if (status?.includes('Not saved yet') === true) {
      await target.click(save);
      await target.expectVisible(backUp, 120_000);
      offer = 'backUp';
    } else {
      await target.click(strip.getByRole('button', { name: 'More', exact: true }));
      await target.click(selectors.getByRole('menuitem', { name: 'Back up…' }));
    }
  }
  if (offer === 'backUp') {
    await target.click(backUp);
  }
  await target.expectVisible(sync, 60_000);
};
