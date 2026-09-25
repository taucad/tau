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
import {
  awaitSaved,
  editSource,
  focusSource,
  openFixture,
  openSourceFile,
  revisionChip,
  saveShortcut,
  visibleRevisionsPanel,
} from '#support/revision-session.js';
import * as target from '#support/external-target.js';

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
 * Owner of the residual: `packages/revisions/src/algorithms/revision-capture.ts`. Meeting
 * 100 ms still needs a capture that does not re-read unchanged files, not a
 * faster digest — `crypto.subtle` (C53) was measured and declined on this evidence.
 */
/*
 * The gates (revisions charter EQ12, D11, I13).
 *
 * Each gate asserts one ceiling, 1.5× its *loaded* baseline, and names the
 * fixture that baseline was read at. The budgets stay the stated numbers and
 * never loosen; a ceiling only ratchets down, and after W4 lands it is
 * re-measured and tightened. To (re)set a gate, run this spec on the loaded
 * machine, read the reading from its artifact, and write it into the one
 * baseline constant below with the run it came from.
 *
 * `Number.NaN` is a baseline not yet measured at the gate's current fixture:
 * the assertion fails until it is filled, loudly, rather than passing on a
 * number read at another fixture.
 */
const ceilingOverLoadedBaseline = 1.5;

/** B1's stated budget (rule 20). */
const savedBudgetMilliseconds = 100;
/**
 * B1's fixture (D11): 1 000 source files and one 5 MiB export, warm save.
 * Loaded baseline: `revision-latency-b1.json` `warmDuration` from coordinator
 * run 2026-09-25-execution r11 (70.5 ms, 1-minute load under 15, incremental
 * capture on). The 100-file reading above is superseded.
 */
const savedLoadedBaselineMilliseconds = 70.5;
const savedFixtureQuery = '?files=1000&binaryMib=5';

/** B4's stated budget (rule 20). */
const historyBudgetMilliseconds = 50;
/**
 * B4's fixture: the default seed on one branch, at whatever depth
 * `depthBudgetMilliseconds` of saves reaches (recorded as `depth`). D11's
 * 500 revisions × 8 branches needs a bulk-seed verb on the revision port.
 * Loaded baseline: `revision-latency-b4.json` `openDuration` from coordinator
 * run 2026-09-25-execution (to fill).
 */
const historyLoadedBaselineMilliseconds = Number.NaN;

/** How long B4 may spend building depth before it takes its reading. */
const depthBudgetMilliseconds = 90_000;
const depthTarget = 500;

test('records how long *Saved* takes after Mod+S in a project with bulk in it (B1)', async () => {
  await openFixture(savedFixtureQuery);
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
      {
        fixture: savedFixtureQuery,
        coldDuration,
        warmDuration,
        budgetMilliseconds: savedBudgetMilliseconds,
        loadedBaselineMilliseconds: savedLoadedBaselineMilliseconds,
      },
      undefined,
      2,
    ),
  );
  expect(warmDuration).toBeLessThan(savedLoadedBaselineMilliseconds * ceilingOverLoadedBaseline);
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
    JSON.stringify(
      {
        depth,
        depthTarget,
        openDuration,
        budgetMilliseconds: historyBudgetMilliseconds,
        loadedBaselineMilliseconds: historyLoadedBaselineMilliseconds,
      },
      undefined,
      2,
    ),
  );
  expect(depth).toBeGreaterThan(0);
  expect(openDuration).toBeLessThan(historyLoadedBaselineMilliseconds * ceilingOverLoadedBaseline);
});
