/* oxlint-disable no-await-in-loop -- Every revision here is one sequential save gesture. */
/**
 * Restoring an older entry, in a real browser over real OPFS (audit §7.1 T9;
 * revisions charter D1, W3; History blueprint M11: an entry has no number).
 *
 * The defect this pins: restore used to detach the checkout, and the page could
 * not say *detached*, so History blanked to *No history yet*, the chip fell
 * back to *Setting up* and the next save lost its compare-and-swap — all
 * without a reload. D1 rules the fix: restore mints a revision on the branch
 * the person is on. So after a restore the chip still names `main`, History
 * still lists every entry plus the restore row on top, and `Mod+S` saves the
 * next entry on top of it.
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

/** The chip's accessible name: `Open History. You are on main. …`. */
const chipLabel = async (): Promise<string> => (await target.getAttribute(revisionChip(), 'aria-label')) ?? '';

/** The chip once it names `main` with nothing unsaved. */
const chipOnMain = (): Locator => selectors.getByRole('button', { name: /^Open History\. You are on main\. Saved\b/u });

/** Every entry row History renders in the visible pane, newest first, by its accessible name. */
const historyRowNames = async (): Promise<readonly string[]> =>
  target.evaluate(
    (selector) =>
      [
        ...([...document.querySelectorAll<HTMLElement>(selector)]
          .find((panel) => panel.getClientRects().length > 0)
          ?.querySelectorAll('ol[aria-label="History entries"] button[data-revision-row]') ?? []),
      ].map((row) => row.getAttribute('aria-label') ?? ''),
    /* Plain CSS: `:visible` is Playwright's, and the visible panel is found above. */
    '[data-slot="revisions-panel-body"]',
  );

test('keeps History, the chip and the next save on main after restoring an older entry (T9)', async () => {
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
  await target.expectVisible(chipOnMain(), 60_000);
  /* M11: the chip names the branch and the state, never a number. */
  expect(await chipLabel()).not.toMatch(/Rev \d/u);

  await target.click(revisionChip());
  await target.expectVisible(selectors.getByCss(`${visibleRevisionsPanel} #revision-history-heading`), 30_000);
  await target.expectVisible(historyRow(1), 30_000);
  const before = await historyRowNames();
  expect(before.length).toBeGreaterThanOrEqual(mintedRevisions);
  expect(
    before.every((row) => !/^Rev \d/u.test(row)),
    before.join('\n'),
  ).toBe(true);

  /* D1: the restore is an entry on main, on top of the old head — never *Setting up*.
   * The second-newest row opens, its *Restore …* restores it, and the dialog is
   * answered when the restore asks. */
  const restoreRow = selectors.getByCss(
    `${visibleRevisionsPanel} ol[aria-label="History entries"] button[data-revision-row][aria-label^="Restored "]`,
  );
  await restoreFromHistory(historyRow(1), restoreRow);
  await target.expectVisible(chipOnMain(), 60_000);
  expect(await chipLabel()).not.toContain('Setting up');

  /* History still lists every entry, plus the restore row on top, named by what it restored (A9). A row is named
   * `<title> · <time>` (`revision-marker.tsx` `RevisionRow`), so the name ends at its title or at ` · `: a word
   * boundary cannot follow a closing quote. */
  await target.expectVisible(historyRow(0), 30_000);
  const after = await historyRowNames();
  expect(after).toHaveLength(before.length + 1);
  expect(after.slice(1)).toEqual(before);
  expect(after[0]).toMatch(/^Restored (?:V\d+|“.*”|the .* autosave|an autosave|an earlier point)(?: · |$)/u);

  /* The next save lands on top of the restore, on main (the lost-CAS path, L1-F2).
   * The editor and the History pane share one workbench slot, so the file is
   * reopened for the edit and the pane again for the count. */
  await openSourceFile();
  await focusSource();
  await editSource();
  await target.keyboardPress(shortcut);
  await awaitSaved();
  await target.expectVisible(chipOnMain(), 60_000);
  await target.click(revisionChip());
  await target.expectVisible(historyRow(0), 30_000);
  await expect
    .poll(
      async () => {
        const names = await historyRowNames();
        return names.length;
      },
      { timeout: 30_000 },
    )
    .toBe(before.length + 2);
});
