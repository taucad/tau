/**
 * Offline, then online, on a GitHub-linked project (GitHub capability audit
 * F16, R15; revisions policy, audit invariant I2).
 *
 * The sync machine pins this in isolation (`sync.machine` rows 15, 16 and 40),
 * but the browser decides whether the worker that pushes ever hears that the
 * network went away: connectivity is observed inside the file-manager worker,
 * not the page. Here Playwright takes the whole context offline around a save,
 * so the page, the revisions worker and the git proxy all lose the network the
 * way a person's laptop does.
 *
 * While offline the save is one revision that is owed and not sent: the Sync
 * row says *Not backed up · 1 revision*, nothing reaches the repository, and no
 * surface says *Backed up*. Back online, exactly one push lands that revision,
 * the repository gains exactly one commit, and History gains exactly one row.
 *
 * The row does not wait for the Sync row's *Offline*: under Playwright's
 * emulation, Chromium flips a dedicated worker's `navigator.onLine` but fires
 * no `online` or `offline` event in it, and those events are all the worker
 * listens for. The failed attempts are what queue the save, and the retry
 * backoff is what lands it, so *Backed up* may take one backoff after the
 * network returns.
 *
 * The far side is `#support/linked-github-fixture.js`: the project is linked
 * through the Sync region's own GitHub picker to a real bare repository served
 * by `git http-backend`, behind the API's git proxy address, so no API process,
 * GitHub account or secret is needed.
 */

import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import {
  awaitSaved,
  focusSource,
  historyRow,
  openBackupChooser,
  openFixture,
  openSourceFile,
  replaceSource,
  revisionChip,
  saveShortcut,
  visibleRevisionsPanel,
} from '#support/revision-session.js';
import * as target from '#support/external-target.js';

/**
 * How long the save stays offline: past the sync debounce (2 s) and the first
 * two retry backoffs (5 s, then 10 s), so the attempts the worker makes while
 * offline fall inside it, and a push or a *Backed up* one produced is seen.
 */
const offlineWindowMilliseconds = 17_000;

/** The Sync row's status line: what is backed up, and whether this device is offline. */
const backupStatus = (): Locator =>
  selectors.getByCss(`${visibleRevisionsPanel} [role="status"][aria-label="Backup status"]`);

/** *Backed up* as a claim, never as part of *Not backed up* or *Backing up…*. */
const claimsBackedUp = /(?:^|, |·\s*)Backed up\b/u;

/** Link the open project to the fixture's repository through the Sync region's picker. */
const linkThroughPicker = async (repositoryFullName: string): Promise<void> => {
  await openBackupChooser();
  await target.click(selectors.getByRole('radio', { name: 'Git remote' }));
  const repository = selectors.getByRole('button', { name: /^Repository\b/u });
  await target.expectVisible(repository, 60_000);
  await target.click(repository);
  await target.click(selectors.getByRole('option', { name: new RegExp(`^${repositoryFullName}\\b`, 'u') }));
  await target.expectVisible(selectors.getByRole('button', { name: /^Branch main\b/u }), 30_000);
  await target.click(selectors.getByRole('button', { name: 'Connect repository', exact: true }));
};

/** Wait for the Sync row to read `sentence` as its first words. */
const awaitBackup = async (sentence: RegExp, timeout = 120_000): Promise<void> => {
  await expect.poll(async () => (await target.textContent(backupStatus())) ?? '', { timeout }).toMatch(sentence);
};

/**
 * Record every Sync row and chip sentence the page shows from now on, so a
 * *Backed up* that flashes between two polls is still seen.
 */
const recordBackupSentences = async (): Promise<void> => {
  await target.evaluate(() => {
    const seen: string[] = [];
    const host = globalThis as typeof globalThis & { __tauE2eBackupSentences?: string[] };
    host.__tauE2eBackupSentences = seen;
    const record = (): void => {
      for (const status of document.querySelectorAll('[role="status"][aria-label="Backup status"]')) {
        seen.push(status.textContent);
      }
      for (const chip of document.querySelectorAll('button[aria-label^="Open Revisions."]')) {
        seen.push(chip.getAttribute('aria-label') ?? '');
      }
    };
    new MutationObserver(record).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-label'],
    });
    record();
  });
};

const recordedBackupSentences = async (): Promise<readonly string[]> =>
  target.evaluate(
    () => (globalThis as typeof globalThis & { __tauE2eBackupSentences?: string[] }).__tauE2eBackupSentences ?? [],
  );

test('queues a save made offline and pushes it once on reconnect (F16, R15)', async () => {
  const linked = await target.commands.uiStartLinkedGithubFixture();
  const shortcut = await saveShortcut();
  await openFixture('');
  await openSourceFile();
  await focusSource();
  await replaceSource('// R15 linked');
  await target.keyboardPress(shortcut);
  await awaitSaved();

  await linkThroughPicker(linked.repositoryFullName);
  await awaitBackup(/^Backed up(?! ·)/u);
  const linkedState = await target.commands.uiReadLinkedGithubFixture();
  expect(
    linkedState.pushes,
    `linking pushes the first revision; unanswered API calls: ${linkedState.unanswered.join(', ')}`,
  ).toBeGreaterThan(0);
  expect(linkedState.commits).toBeGreaterThan(0);
  expect(linkedState.uncredited, 'every git request carries the minted GitHub credential').toBe(0);
  const linkedChip = (await target.getAttribute(revisionChip(), 'aria-label')) ?? '';
  const headBeforeOffline = Number(/Rev (\d+)\./u.exec(linkedChip)?.[1]);
  expect(headBeforeOffline).toBeGreaterThan(0);

  await target.commands.uiSetTargetOffline(true);
  await replaceSource('// R15 saved offline');
  await target.keyboardPress(shortcut);
  await awaitSaved();
  /* From here the revision is owed: until the network returns, *Backed up* would be a lie (I2). */
  await awaitBackup(/^Not backed up · 1 revision(?!s)/u, 60_000);
  await recordBackupSentences();
  await target.delay(offlineWindowMilliseconds);
  await awaitBackup(/^Not backed up · 1 revision(?!s)/u, 5000);
  const offlineState = await target.commands.uiReadLinkedGithubFixture();
  expect(offlineState.pushes, 'nothing is pushed while offline').toBe(linkedState.pushes);
  expect(offlineState.head, 'the repository has not moved').toBe(linkedState.head);
  const offlineSentences = await recordedBackupSentences();
  expect(
    offlineSentences.filter((sentence) => claimsBackedUp.test(sentence)),
    'no surface claims Backed up for the unsent revision (I2)',
  ).toEqual([]);

  await target.commands.uiSetTargetOffline(false);
  await awaitBackup(/^Backed up(?! ·)/u, 180_000);
  const onlineState = await target.commands.uiReadLinkedGithubFixture();
  expect(onlineState.pushes, 'exactly one push lands the queued revision').toBe(linkedState.pushes + 1);
  expect(onlineState.commits, 'the repository gains exactly one commit').toBe(linkedState.commits + 1);
  expect(onlineState.head).not.toBe(linkedState.head);
  expect(onlineState.uncredited).toBe(0);
  await target.expectVisible(historyRow(headBeforeOffline + 1), 30_000);
  expect(await target.isVisible(historyRow(headBeforeOffline + 2)), 'no duplicate revision').toBe(false);
});
