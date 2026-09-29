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
 * B4 reads at D11's fixture, 500 revisions and 8 branches, built through the
 * product's own gestures: 500 saves on `main`, and a *New branch* from the
 * Revisions pane every 62 of them, so seven more lines fork along it. Saves are
 * incremental, so no bulk-seed verb is needed; the fixture has a 180 s
 * allowance (`depthBudgetMilliseconds`). A run that falls short fails on
 * `depth` or `branches` rather than reading at a smaller fixture.
 *
 * One sample is not a reading (a4 ruling): B1 is the median of `warmSaves` warm
 * saves and B4 the median of `reopens` reopenings, with every sample and — for
 * B4 — the session's first open recorded beside it.
 *
 * **Both gates read the page's own clock** (a3 ruling). A reading taken as
 * wall time around `target.click` and `expectVisible` measured the harness:
 * the click command is one vitest-browser RPC plus Playwright's actionability
 * checks, and every visibility read is seven sequential CDP calls, so the r11
 * B4 reading of 120 ms held 37 ms of product (click → heading visible) and
 * 48 ms to the painted frame. Each gate now runs from the trigger event's
 * `timeStamp` in the page to the frame after the surface it budgets changed,
 * and records the harness's wall time beside it as `harnessDuration`.
 *
 * **B2 is deliberately not here.** "Mint → push request issued" needs a
 * connected remote, which needs a signed-in account and a live Tau Cloud API;
 * `apps/ui-e2e` boots neither (C60) and this lane may not make it. Its debounce
 * lives in `sync.machine.ts`, so under contract §7 — "benchmarks are owned by
 * the lane that owns the file under test" — B2 belongs beside that machine.
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
 * Loaded baseline: `revision-latency-b1.json` `warmDuration` — the median of
 * `warmSaves` page-clock samples — read at 8ed6eb2b6 (after W5b and W13) in
 * the quiet-window run E2E-D u1 at a 1-minute load of 9–12; its repeat u2 read
 * 57.9 ms. A run under load reads several times higher (r23: 284 ms at ~25),
 * so this spec is read only below a load of 15.
 */
const savedLoadedBaselineMilliseconds = 61.5;
/** Warm saves B1 reads; `warmDuration` is their median (a4 ruling). */
const warmSaves = 5;
const savedFixtureQuery = '?files=1000&binaryMib=5';

/** B4's stated budget (rule 20). */
const historyBudgetMilliseconds = 50;
/**
 * B4's fixture (D11): 500 revisions on `main` and 8 branches, the other seven
 * forked along it by *New branch*; read on the page's clock, after a reload so
 * the open is the session's first.
 * Loaded baseline: `revision-latency-b4.json` `openDuration` — the median of
 * `reopens` page-clock samples — read at 8ed6eb2b6 in the quiet-window run
 * E2E-D u1 (500 revisions, 8 branches, fixture built in 98 s).
 */
const historyLoadedBaselineMilliseconds = 31.6;
/** Times B4 closes and reopens History; `openDuration` is their median (a4 ruling). */
const reopens = 3;

/**
 * How long B4 may spend building its fixture before it takes its reading: an
 * allowance for the fixture, not a latency budget. 90 s reached 413 revisions
 * and 7 branches at load 11–13.5 (W4c a3); the a4 ruling allows 180 s inside
 * the 300 s test timeout, and a fixture still short of D11 fails.
 */
const depthBudgetMilliseconds = 180_000;
const depthTarget = 500;
const branchTarget = 8;

/** Which surface a page-clock reading waits for. */
type PageClockSurface = 'saved' | 'history';

/**
 * Start a reading on the page's own clock (a3 ruling).
 *
 * The next trigger event — the save chord's `keydown`, or a `click` — is time
 * zero, at its own `timeStamp`; the reading ends at the frame after the surface
 * changed: the chip saying *Saved*, or History's first row. Capture on
 * the global, so an editor that stops the chord's propagation cannot hide it.
 *
 * @param surface - What the reading waits for.
 */
const armPageClock = async (surface: PageClockSurface): Promise<void> => {
  await target.evaluate((kind: PageClockSurface) => {
    const clock: { startAt?: number; paintedAt?: number } = {};
    Object.assign(globalThis, { __tauPageClock: clock });
    const trigger = kind === 'saved' ? 'keydown' : 'click';
    const onTrigger = (event: Event): void => {
      if (kind === 'saved' && !(event instanceof KeyboardEvent && event.key.toLowerCase() === 's')) {
        return;
      }
      clock.startAt ??= event.timeStamp;
      globalThis.removeEventListener(trigger, onTrigger, { capture: true });
    };
    globalThis.addEventListener(trigger, onTrigger, { capture: true });
    const reached = (): boolean =>
      kind === 'saved'
        ? [...document.querySelectorAll('button')].some((button) =>
            /^Open Revisions\..*\. Saved\b/u.test(button.getAttribute('aria-label') ?? ''),
          )
        : document.querySelector(
            '[data-slot="revisions-panel-body"] ol[aria-label="Revision history"] button[data-revision-row]',
          ) !== null;
    const observer = new MutationObserver(() => {
      if (clock.startAt === undefined || !reached()) {
        return;
      }
      observer.disconnect();
      requestAnimationFrame(() => {
        setTimeout(() => {
          clock.paintedAt = performance.now();
        });
      });
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-label'],
    });
  }, surface);
};

/**
 * The middle sample; the mean of the middle two for an even count.
 *
 * @param samples - At least one reading.
 * @returns The median.
 */
const median = (samples: readonly number[]): number => {
  const sorted = samples.toSorted((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

/**
 * Finish a page-clock reading.
 *
 * @returns Milliseconds from the trigger to the frame after the surface changed.
 */
const readPageClock = async (): Promise<number> => {
  await target.waitFor(
    () =>
      (globalThis as unknown as { __tauPageClock?: { paintedAt?: number } }).__tauPageClock?.paintedAt !== undefined,
    undefined,
    { timeout: 30_000 },
  );
  return target.evaluate(() => {
    const { startAt = Number.NaN, paintedAt = Number.NaN } = (
      globalThis as unknown as { __tauPageClock: { startAt?: number; paintedAt?: number } }
    ).__tauPageClock;
    return paintedAt - startAt;
  });
};

/**
 * Fork one more line off `main` where it is now, from the pane's strip — the
 * product's only *New branch* (C3) — and hand the slot and the caret back to
 * the editor.
 *
 * @param name - The new branch's name.
 */
const forkBranchHere = async (name: string): Promise<void> => {
  await target.click(revisionChip());
  const panel = selectors.getByCss(visibleRevisionsPanel);
  await target.click(panel.getByCss('[aria-label="Where you are"]').getByRole('button', { name: 'New branch' }));
  await target.fill(selectors.getByRole('textbox', { name: 'Name for the new branch' }), name);
  await target.click(selectors.getByRole('button', { name: 'Create branch' }));
  await target.expectVisible(
    selectors.getByRole('list', { name: 'Branches' }).getByText(name, { exact: true }),
    60_000,
  );
  await target.click(selectors.getByRole('button', { name: 'Close Revisions' }));
  await target.expectHidden(selectors.getByCss(visibleRevisionsPanel), 15_000);
  /* Focus, not a click: sixty saves in, the typed line has scrolled the editor
   * sideways and the lines' centre sits under the gutter. The caret stays put. */
  await target.focus(
    selectors.getByCss('.monaco-editor .native-edit-context, .monaco-editor textarea.inputarea').last(),
  );
};

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
  await armPageClock('saved');
  const coldStartedAt = performance.now();
  await target.keyboardPress(shortcut);
  await awaitSaved(180_000);
  const coldHarnessDuration = performance.now() - coldStartedAt;
  const coldDuration = await readPageClock();

  const warmSamples: Array<Readonly<{ page: number; harness: number }>> = [];
  for (let sample = 0; sample < warmSaves; sample += 1) {
    await editSource();
    await armPageClock('saved');
    const warmStartedAt = performance.now();
    await target.keyboardPress(shortcut);
    await awaitSaved();
    const harness = performance.now() - warmStartedAt;
    warmSamples.push({ page: await readPageClock(), harness });
  }
  const warmDuration = median(warmSamples.map((sample) => sample.page));
  const harnessDuration = median(warmSamples.map((sample) => sample.harness));

  await target.writeArtifact(
    'revision-latency-b1.json',
    JSON.stringify(
      {
        fixture: savedFixtureQuery,
        clock: 'page: save keydown timeStamp to the frame after the chip says Saved',
        coldDuration,
        coldHarnessDuration,
        warmSamples,
        warmDuration,
        harnessDuration,
        budgetMilliseconds: savedBudgetMilliseconds,
        loadedBaselineMilliseconds: savedLoadedBaselineMilliseconds,
      },
      undefined,
      2,
    ),
  );
  expect(warmDuration).toBeLessThanOrEqual(savedBudgetMilliseconds);
  expect(warmDuration).toBeLessThan(savedLoadedBaselineMilliseconds * ceilingOverLoadedBaseline);
});

test('records how long the History region takes to open at D11 (B4)', async () => {
  await openFixture('');
  const shortcut = await saveShortcut();
  await target.expectVisible(revisionChip(), 120_000);
  await openSourceFile();
  await focusSource();

  /* D11 through the product's own gestures: saves in the editor, and every
   * `branchEvery` of them one more line forked from the pane's strip. */
  const branchEvery = Math.floor(depthTarget / branchTarget);
  let depth = 0;
  let branches = 1;
  const startedAt = performance.now();
  while (depth < depthTarget && performance.now() - startedAt < depthBudgetMilliseconds) {
    await editSource();
    await target.keyboardPress(shortcut);
    await awaitSaved();
    depth += 1;
    if (depth % branchEvery === 0 && branches < branchTarget) {
      await forkBranchHere(`line-${String(branches)}`);
      branches += 1;
    }
  }
  const fixtureDuration = performance.now() - startedAt;

  /* A new session, so the open below is the pane's first in it — the fixture
   * opened it seven times. Wait for the header chip's own history read (its
   * card lists the newest rows), then let the card close again. */
  await target.reload();
  await target.expectVisible(revisionChip(), 120_000);
  await target.hover(revisionChip());
  const recent = selectors.getByRole('list', { name: 'Recent revisions' });
  await target.expectVisible(recent.getByText(`Rev ${String(depth)}`, { exact: true }), 60_000);
  await target.mouseMove(8, 450);
  await target.expectHidden(recent, 15_000);

  const openHistory = async (): Promise<Readonly<{ page: number; harness: number }>> => {
    await armPageClock('history');
    const openedAt = performance.now();
    await target.click(revisionChip());
    await target.expectVisible(selectors.getByCss(`${visibleRevisionsPanel} #revision-history-heading`), 30_000);
    const harness = performance.now() - openedAt;
    return { page: await readPageClock(), harness };
  };
  const firstOpen = await openHistory();
  const branchList = await target.read(selectors.getByRole('list', { name: 'Branches' }).getByRole('listitem'));
  const branchRows = branchList.count;
  const openSamples: Array<Readonly<{ page: number; harness: number }>> = [];
  for (let sample = 0; sample < reopens; sample += 1) {
    await target.click(selectors.getByRole('button', { name: 'Close Revisions' }));
    /* Closed means unmounted: a pane kept in the DOM would hand the next
     * reading a row that is already there. */
    await target.expectCount(selectors.getByCss('[data-slot="revisions-panel-body"]'), 0, 15_000);
    openSamples.push(await openHistory());
  }
  const openDuration = median(openSamples.map((sample) => sample.page));
  const harnessDuration = median(openSamples.map((sample) => sample.harness));

  await target.writeArtifact(
    'revision-latency-b4.json',
    JSON.stringify(
      {
        depth,
        depthTarget,
        branches: branchRows,
        branchTarget,
        fixtureDuration,
        clock: 'page: chip click timeStamp to the frame after History shows its first row',
        firstOpen,
        openSamples,
        openDuration,
        harnessDuration,
        budgetMilliseconds: historyBudgetMilliseconds,
        loadedBaselineMilliseconds: historyLoadedBaselineMilliseconds,
      },
      undefined,
      2,
    ),
  );
  /* Short of D11 is a failed fixture, never a reading at a smaller one. */
  expect(depth).toBe(depthTarget);
  expect(branchRows).toBe(branchTarget);
  expect(openDuration).toBeLessThanOrEqual(historyBudgetMilliseconds);
  expect(openDuration).toBeLessThan(historyLoadedBaselineMilliseconds * ceilingOverLoadedBaseline);
});
