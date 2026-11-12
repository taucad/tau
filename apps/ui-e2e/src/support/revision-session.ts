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
export const revisionChip = (): Locator => selectors.getByRole('button', { name: /^Open History\./u });

/**
 * Seed a project through the e2e fixture route and wait for its workspace.
 *
 * @param query - The fixture's search string, e.g. `?files=1000&binaryMib=5`.
 */
export const openFixture = async (query: string): Promise<void> => {
  await target.setViewport({ width: 1440, height: 900 });
  await target.navigate(`/__e2e/project-file-tree${query}`);
  await target.expectUrl(/\/w\/[^/]+\/[^/]+$/u, 180_000);
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
    const search = selectors.getByPlaceholder('Search projects, chats, and actions…');
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
  const lines = selectors.getByCss('.cm-editor .cm-content').last();
  await target.expectVisible(lines, 60_000);
  await target.click(lines);
};

/**
 * Wait for the chip to say the files differ from the head.
 *
 * `revision-vocabulary.ts` words that two ways: *Unsaved changes* on a line
 * with a head, *Nothing saved yet* before the first save — which is where every
 * spec's fresh fixture starts.
 */
const awaitModified = async (): Promise<void> => {
  await target.waitFor(
    () =>
      [...document.querySelectorAll('button')].some((button) =>
        /^Open History\..*\. (?:Unsaved changes|Nothing saved yet)/u.test(button.getAttribute('aria-label') ?? ''),
      ),
    undefined,
    { timeout: 60_000 },
  );
};

/**
 * One character into the open file, then wait for the chip to say *Modified*.
 *
 * `Escape` closes CodeMirror's completion tooltip, which otherwise covers the editor
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
 * @param line - The file's new contents; no brackets or quotes, which CodeMirror would close.
 */
export const replaceSource = async (line: string): Promise<void> => {
  await target.keyboardPress('ControlOrMeta+a');
  await target.type(selectors.getByCss('.cm-editor .cm-content[contenteditable="true"]'), line);
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
        /^Open History\..*\. Saved\b/u.test(button.getAttribute('aria-label') ?? ''),
      ),
    undefined,
    { timeout },
  );
};

/** The pane's strip: where you are, the one status sentence and its verbs. */
export const revisionStrip = (): Locator => selectors.getByCss(`${visibleRevisionsPanel} [aria-label="Where you are"]`);

/**
 * History's entry rows in the visible pane, newest first: the button that opens
 * each one. An entry has no number (M11), so a row is found by its place or its
 * title, never by `Rev N`.
 *
 * @returns Every row's button, named `<title> · <time>` or `V2 · <title>`.
 */
export const historyRows = (): Locator =>
  selectors.getByCss(`${visibleRevisionsPanel} ol[aria-label="History entries"] button[data-revision-row]`);

/**
 * One History row by its place, newest first.
 *
 * @param index - 0 for the newest row.
 * @returns The row's button.
 */
export const historyRow = (index: number): Locator => historyRows().nth(index);

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
export const answerIfAsked = async (confirm: string | RegExp, outcome: Locator, timeout = 60_000): Promise<void> => {
  const button = selectors
    .getByRole('alertdialog')
    .getByRole('button', typeof confirm === 'string' ? { name: confirm, exact: true } : { name: confirm });
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
 * Restore an entry the way a person does: open its History row, press its
 * *Restore …* (`Restore V2`, `Restore “Thicker base”`, `Restore the 10:31 AM
 * autosave`), and confirm the dialog when the restore asks.
 *
 * @param row - The entry's row, from {@link historyRow}.
 * @param outcome - What is on screen once the restore has landed.
 */
export const restoreFromHistory = async (row: Locator, outcome: Locator): Promise<void> => {
  await target.expectVisible(row, 30_000);
  if ((await target.getAttribute(row, 'aria-expanded')) !== 'true') {
    await target.click(row);
  }
  /* Only the open row shows its verbs, so the pane holds one *Restore …*. */
  const restore = selectors
    .getByCss(visibleRevisionsPanel)
    .getByRole('list', { name: 'History entries' })
    .getByRole('button', { name: /^Restore (?:V\d+|“.*”|the .* autosave|an autosave|this point)$/u })
    .first();
  await target.click(restore);
  await answerIfAsked(/^Restore /u, outcome);
};

/**
 * Open the Sync region's chooser through the pane's own offer (A29, canvas
 * round 16): the strip's *Back up*, or More's *Back up…* while the strip's
 * button is *Save*. Nothing offers a backup before the first
 * revision (S1), so a project with none saves one first: from the strip when
 * it has edits, with the save chord when it has none — a fresh, unedited
 * project's strip offers no *Save* at all.
 */
export const openBackupChooser = async (): Promise<void> => {
  const sync = selectors.getByCss(`${visibleRevisionsPanel} #revision-sync-heading`);
  const strip = revisionStrip();
  const backUp = strip.getByRole('button', { name: 'Back up', exact: true });
  const save = strip.getByRole('button', { name: 'Save', exact: true });
  const nothingSaved = strip.getByRole('status', { name: 'History status' }).filter({ hasText: 'Nothing saved yet' });
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
    const status = await target.textContent(strip.getByRole('status', { name: 'History status' }));
    if (status?.includes('Nothing saved yet') === true) {
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
