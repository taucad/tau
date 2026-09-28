/* oxlint-disable no-await-in-loop -- Every revision here is one sequential save gesture. */
/**
 * Restoring an older revision, in a real browser over real OPFS (audit §7.1 T9;
 * revisions charter D1, W3).
 *
 * The defect this pins: restore used to detach the checkout, and the page could
 * not say *detached*, so History blanked to *No revisions yet*, the chip fell
 * back to *Setting up* and the next save lost its compare-and-swap — all
 * without a reload. D1 rules the fix: restore mints a revision on the branch
 * the person is on. So after a restore the chip still names `main` at a head
 * one past the old one, History still lists every revision plus the restore
 * row, and `Mod+S` mints the next revision on top of it.
 *
 * Red-first: this fails on the detaching restore and passes once W0 lands.
 * Depth is built with the latency gates' own save gesture
 * (`#support/revision-session.js`); no API is needed.
 */

import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import {
  awaitSaved,
  editSource,
  focusSource,
  historyRow,
  openFixture,
  openSourceFile,
  restoreFromHistory,
  revisionChip,
  saveShortcut,
  visibleRevisionsPanel,
} from '#support/revision-session.js';
import * as target from '#support/external-target.js';

/* Few enough that History's first twelve rows hold every one (`chat-revisions.tsx`). */
const mintedRevisions = 3;
const restoredRevision = 2;

/** The chip's accessible name: `Open Revisions. You are on main, Rev 6. …`. */
const chipLabel = async (): Promise<string> => (await target.getAttribute(revisionChip(), 'aria-label')) ?? '';

/** The head revision number the chip names on `main`, or `undefined` when it names none. */
const headOnMain = async (): Promise<number | undefined> => {
  const match = /^Open Revisions\. You are on main, Rev (\d+)\./u.exec(await chipLabel());
  return match === null ? undefined : Number(match[1]);
};

/** The chip once it names `main` at `revision`. */
const chipOnMain = (revision: number): Locator =>
  selectors.getByRole('button', {
    name: new RegExp(String.raw`^Open Revisions\. You are on main, Rev ${String(revision)}\.`, 'u'),
  });

/** Every revision row History renders in the visible pane, by its accessible name `Rev N · <title>`. */
const historyRows = async (): Promise<readonly string[]> =>
  target.evaluate(
    (selector) =>
      [
        ...([...document.querySelectorAll<HTMLElement>(selector)]
          .find((panel) => panel.getClientRects().length > 0)
          ?.querySelectorAll('ol[aria-label="Revision history"] button[data-revision-row][aria-label^="Rev "]') ?? []),
      ].map((row) => row.getAttribute('aria-label') ?? ''),
    /* Plain CSS: `:visible` is Playwright's, and the visible panel is found above. */
    '[data-slot="revisions-panel-body"]',
  );

test('keeps History, the chip and the next save on main after restoring an older revision (T9)', async () => {
  await openFixture('');
  const shortcut = await saveShortcut();
  await target.expectVisible(revisionChip(), 120_000);
  await openSourceFile();
  await focusSource();

  for (let index = 0; index < mintedRevisions; index += 1) {
    await editSource();
    await target.keyboardPress(shortcut);
    await awaitSaved();
  }
  const head = await headOnMain();
  expect(head, `the chip must name a head on main before the restore: ${await chipLabel()}`).toBeGreaterThanOrEqual(
    mintedRevisions,
  );

  await target.click(revisionChip());
  await target.expectVisible(selectors.getByCss(`${visibleRevisionsPanel} #revision-history-heading`), 30_000);
  await target.expectVisible(historyRow(restoredRevision), 30_000);
  const before = await historyRows();
  expect(before.some((row) => row.startsWith(`Rev ${String(restoredRevision)} · `))).toBe(true);

  /* D1: the restore is a revision on main, one past the old head — never *Setting up*.
   * The row opens, *Restore Rev N* restores it, and the dialog is answered when the restore asks. */
  const restoredHead = (head ?? 0) + 1;
  await restoreFromHistory(restoredRevision, chipOnMain(restoredHead));
  expect(await chipLabel()).not.toContain('Setting up');

  /* History still lists every revision, plus the restore row, named by what it restored (A9). */
  const restoreRow = historyRow(restoredHead);
  await target.expectVisible(restoreRow, 30_000);
  const after = await historyRows();
  expect(after).toHaveLength(before.length + 1);
  expect(after).toEqual(
    expect.arrayContaining([...before, `Rev ${String(restoredHead)} · Restored Rev ${String(restoredRevision)}`]),
  );
  expect(await target.textContent(restoreRow)).toContain(`Restored Rev ${String(restoredRevision)}`);

  /* The next save mints on top of the restore, on main (the lost-CAS path, L1-F2).
   * The editor and the Revisions pane share one workbench slot, so the file is
   * reopened for the edit and the pane again for the count. */
  await openSourceFile();
  await focusSource();
  await editSource();
  await target.keyboardPress(shortcut);
  await awaitSaved();
  await target.expectVisible(chipOnMain(restoredHead + 1), 60_000);
  await target.click(revisionChip());
  await target.expectVisible(historyRow(restoredHead + 1), 30_000);
  expect(await historyRows()).toHaveLength(before.length + 2);
});
