/* oxlint-disable no-await-in-loop -- Every reading here is one sequential gesture; a parallel one would measure the harness. */
/**
 * W6's two revision latency budgets, measured rather than asserted (B1, B4).
 *
 * The numbers the blueprint states — *Saved* within 100 ms of `Mod+S`, History
 * open within 50 ms — are budgets for a project with real bulk in it, so the
 * fixture seeds that bulk instead of measuring an empty tree. Each reading is
 * written to an artifact, and the assertion is a regression ceiling set from a
 * measured baseline rather than from the stated budget: OQ5 rules that the first
 * run records the baseline and that a ceiling may be tightened by evidence,
 * never loosened.
 *
 * *Saved* is read from the always-on header chip, not from the History list.
 * The code editor and the Revisions pane share one workbench slot, so a reading
 * taken off the list is a reading of a panel swap — which is how the first
 * version of this file came to assert against a pane that was not on screen.
 * The chip drops its *Modified* suffix the moment the checkout stops being
 * dirty, which is exactly the transition B1 budgets.
 *
 * The depth B4 reads at is whatever the time budget below buys, and the artifact
 * records it. Reaching 500 revisions in a run needs a bulk-seed verb on the
 * revision port (`packages/revisions`), which this lane does not own.
 *
 * **B7 is deliberately not here.** "Mint → push request issued" needs a
 * connected remote, which needs a signed-in account and a live Tau Cloud API;
 * `apps/ui-e2e` boots neither (C60) and this lane may not make it. Its debounce
 * lives in `sync.machine.ts`, so under contract §7 — "benchmarks are owned by
 * the lane that owns the file under test" — B7 belongs beside that machine.
 */

import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

const visibleRevisionsPanel = '[data-slot="revisions-panel-body"]:visible';
const revisionChip = (): ReturnType<typeof selectors.getByRole> =>
  selectors.getByRole('button', { name: /^Open Revisions\./u });

/*
 * The baseline OQ5 asks the first run to record, measured 2026-09-16 on an Apple
 * M2 Pro against real OPFS in a headless Chromium (`revision-latency-b*.json`):
 *
 * | Reading                         | Budget | Loaded 1 | Loaded 2 | Quiet  |
 * | ------------------------------- | ------ | -------- | -------- | ------ |
 * | B1 warm save → *Saved*          | 100 ms | 1,987 ms | 1,611 ms | 350 ms |
 * | B1 cold save of the seeded tree | —      | 3,983 ms | 3,713 ms | 639 ms |
 * | B4 History open                 |  50 ms |   349 ms |   423 ms | 138 ms |
 * | B4 depth reached in 90 s        | —      |       71 |      132 |    464 |
 *
 * **Both budgets are breached in every run** — 3.5× and 2.8× on an otherwise idle
 * machine, 16–20× and 7–8× while peer test suites were running. The spread is why
 * the ceilings below are regression ceilings over the *loaded* baseline rather
 * than the budgets themselves: a gate at 100 ms would fail on work this lane does
 * not own, and one at the quiet reading would flake on a shared checkout. OQ5
 * forbids loosening a budget, not recording that it is not yet met — so
 * `savedBudgetMilliseconds` and `historyBudgetMilliseconds` keep the real numbers
 * and every artifact carries them beside the reading.
 *
 * **What B1 actually costs, measured rather than supposed.** This file's first
 * version guessed the cause was the cut hashing the fixture's 5 MiB export. It
 * is not: an A/B over the fixture's own parameters puts the warm save at 442 ms
 * with `binaryMib=5` and 444 ms with `binaryMib=0` — the export is worth **2 ms**
 * — while a sweep over the file count reads 295 / 611 / 1,437 ms at 25 / 100 /
 * 400 bulk files. B1 is linear in the number of versioned *files*, at about 3 ms
 * each under load, and the tree hash it was blamed on costs 1.2 ms for the whole
 * tree (C48's `blobOid` and `cleanedTrees` memoization both work). The cost is
 * one whole-tree **capture** per save: `captureRevisionTree` walks the project
 * and reads every versioned file, and that walk is what a save pays for.
 * Raising the file count is therefore the way to reproduce a B1 regression, and
 * shrinking the export is not a fix.
 *
 * The walk used to `stat` every child to learn its kind, and OPFS `stat` reads a
 * text file whole to count its lines — two reads per file. It now takes kinds
 * from the rooted view's `readdirEntries` (lane H): zero `stat` calls, the same
 * tree ids, and a warm save of 339 ms against 440 ms in 32 interleaved pairs
 * at load 17–31 (24 of 32 pairs favour it).
 *
 * Owner of the residual: `libs/filesystem/src/revision-capture.ts`. Meeting
 * 100 ms still needs a capture that does not re-read unchanged files, not a
 * faster digest — `crypto.subtle` (C53) was measured and declined on this evidence.
 */
/** B1's stated budget, and the regression ceiling actually asserted. */
const savedBudgetMilliseconds = 100;
const savedCeilingMilliseconds = 3000;
/** B4's stated budget, and the regression ceiling actually asserted. */
const historyBudgetMilliseconds = 50;
const historyCeilingMilliseconds = 800;

/** How long B4 may spend building depth before it takes its reading. */
const depthBudgetMilliseconds = 90_000;
const depthTarget = 500;

const declineCookies = async (): Promise<void> => {
  const decline = selectors.getByRole('button', { name: 'Decline' }).last();
  await target.expectVisible(decline, 15_000);
  await target.click(decline);
};

const openFixture = async (query: string): Promise<void> => {
  await target.setViewport({ width: 1440, height: 900 });
  await target.navigate(`/__e2e/project-file-tree${query}`);
  await target.expectUrl(/\/w\/[^/]+\/[^/]+$/u, 180_000);
  await declineCookies();
};

const saveShortcut = async (): Promise<string> =>
  target.evaluate(() => (/mac/i.test(navigator.userAgent) ? 'Meta+s' : 'Control+s'));

const filesPane = (): ReturnType<typeof selectors.getByRole> =>
  selectors.getByRole('region', { name: /^Files for /u }).first();
const treeItem = (path: string): ReturnType<typeof selectors.getByCss> =>
  filesPane().getByCss(`[data-testid="file-tree-item"][data-file-tree-path="${path}"]`);

/**
 * Open the seed's source file the way a person opens it, through the tree.
 *
 * A fresh project opens with no editor tab, and the Files pane is reached from
 * the command palette when the workbench is showing something else.
 */
const openSourceFile = async (): Promise<void> => {
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
    await target.expectVisible(folder, 30_000);
    if ((await target.getAttribute(folder, 'aria-expanded')) !== 'true') {
      await target.click(folder, { position: { x: 8, y: 14 } });
    }
  }
  const entry = treeItem('public/models/honeycomb.js');
  await target.expectVisible(entry, 30_000);
  await target.click(entry);
};

/** Put the caret in the source editor. Once: a save does not move focus. */
const focusSource = async (): Promise<void> => {
  const lines = selectors.getByCss('.monaco-editor .view-lines').last();
  await target.expectVisible(lines, 60_000);
  await target.click(lines);
};

/**
 * One character into the open file, then wait for the chip to say *Modified*.
 *
 * `Escape` closes Monaco's suggest widget, which otherwise covers the editor
 * and swallows the next gesture — the second reading of this file's first
 * chip-based run died on exactly that, a click retried until it timed out.
 */
const editSource = async (): Promise<void> => {
  await target.keyboardPress('a');
  await target.keyboardPress('Escape');
  await target.waitFor(
    () =>
      [...document.querySelectorAll('button')].some((button) =>
        /^Open Revisions\..*Modified/u.test(button.getAttribute('aria-label') ?? ''),
      ),
    undefined,
    { timeout: 60_000 },
  );
};

/** Wait for the checkout to stop being dirty — the chip's own *Saved* signal. */
const awaitSaved = async (timeout = 60_000): Promise<void> => {
  await target.waitFor(
    () =>
      [...document.querySelectorAll('button')].some((button) => {
        const label = button.getAttribute('aria-label') ?? '';
        return label.startsWith('Open Revisions.') && !label.includes('Modified');
      }),
    undefined,
    { timeout },
  );
};

test('records how long *Saved* takes after Mod+S in a project with bulk in it (B1)', async () => {
  /* 100 source files and one 5 MiB export: W6's stated condition. */
  await openFixture('?files=100&binaryMib=5');
  const shortcut = await saveShortcut();
  await target.expectVisible(revisionChip(), 120_000);
  await openSourceFile();
  await focusSource();

  /*
   * Two readings, because they answer different questions. The cold one is the
   * first cut of the whole seeded tree; the warm one is the gesture a person
   * repeats all day, which is the one B1 is about.
   */
  await editSource();
  const coldStartedAt = performance.now();
  await target.keyboardPress(shortcut);
  await awaitSaved(180_000);
  const coldDuration = performance.now() - coldStartedAt;

  await editSource();
  const warmStartedAt = performance.now();
  await target.keyboardPress(shortcut);
  await awaitSaved();
  const warmDuration = performance.now() - warmStartedAt;

  await target.writeArtifact(
    'revision-latency-b1.json',
    JSON.stringify(
      { fileCount: 100, binaryMib: 5, coldDuration, warmDuration, budgetMilliseconds: savedBudgetMilliseconds },
      undefined,
      2,
    ),
  );
  expect(warmDuration).toBeLessThan(savedCeilingMilliseconds);
});

test('records how long the History region takes to open at depth (B4)', async () => {
  await openFixture('');
  const shortcut = await saveShortcut();
  await target.expectVisible(revisionChip(), 120_000);
  await openSourceFile();
  await focusSource();

  /* Depth is built through the product's own save gesture, in the editor, with
   * the Revisions pane closed; nothing else here is part of B4's budget. */
  let depth = 0;
  const startedAt = performance.now();
  while (depth < depthTarget && performance.now() - startedAt < depthBudgetMilliseconds) {
    await editSource();
    await target.keyboardPress(shortcut);
    await awaitSaved();
    depth += 1;
  }

  /* The pane has never been opened in this session, so this is the region's
   * first paint from a projection the page already holds. */
  const openedAt = performance.now();
  await target.click(revisionChip());
  await target.expectVisible(selectors.getByCss(`${visibleRevisionsPanel} #revision-history-heading`), 30_000);
  const openDuration = performance.now() - openedAt;

  await target.writeArtifact(
    'revision-latency-b4.json',
    JSON.stringify({ depth, depthTarget, openDuration, budgetMilliseconds: historyBudgetMilliseconds }, undefined, 2),
  );
  expect(depth).toBeGreaterThan(0);
  expect(openDuration).toBeLessThan(historyCeilingMilliseconds);
});
