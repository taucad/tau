/* oxlint-disable no-await-in-loop -- Every reading here is one sequential gesture; a parallel one would measure the harness. */
/**
 * W6's two revision latency budgets, measured rather than asserted (B1, B4).
 *
 * The numbers the blueprint states — *Saved* within 100 ms of `Mod+S`, History
 * open within 50 ms — are budgets for a project with real bulk in it, so the
 * fixture seeds that bulk instead of measuring an empty tree. Each reading is
 * written to an artifact; the assertions are deliberately loose regression
 * ceilings, because a run on unknown CI hardware that failed at 101 ms would be
 * deleted within a week and then nothing would be measured at all.
 *
 * The depth B4 reads at is whatever the revision budget below buys, and the
 * artifact records it. Reaching 500 revisions in a run needs a bulk-seed verb
 * on the revision port (`packages/revisions`), which this lane does not own.
 */

import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

const visibleRevisionsPanel = '[data-slot="revisions-panel-body"]:visible';
const historyRows = (): ReturnType<typeof selectors.getByCss> =>
  selectors.getByCss('[aria-label="Recent revision history"] > li');

/** B1's stated ceiling, and the regression ceiling actually asserted. */
const savedBudgetMilliseconds = 100;
const savedCeilingMilliseconds = 5000;
/** B4's stated ceiling, and the regression ceiling actually asserted. */
const historyBudgetMilliseconds = 50;
const historyCeilingMilliseconds = 2000;

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

const openRevisions = async (): Promise<void> => {
  const opener = selectors.getByRole('button', { name: /^Open Revisions\./u });
  await target.expectVisible(opener, 120_000);
  await target.click(opener);
  await target.expectVisible(selectors.getByCss(visibleRevisionsPanel), 60_000);
};

const saveShortcut = async (): Promise<string> =>
  target.evaluate(() => (/mac/i.test(navigator.userAgent) ? 'Meta+s' : 'Control+s'));

const filesPane = (): ReturnType<typeof selectors.getByRole> =>
  selectors.getByRole('region', { name: /^Files for /u }).first();
const treeItem = (path: string): ReturnType<typeof selectors.getByCss> =>
  filesPane().getByCss(`[data-testid="file-tree-item"][data-file-tree-path="${path}"]`);

/**
 * Put the caret in the source editor, so a later keystroke is a file change.
 *
 * A fresh project opens with no editor tab, so the file has to be opened the
 * way a person opens it — the seed's own entry point, through the tree.
 */
const focusEditor = async (): Promise<void> => {
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
  const lines = selectors.getByCss('.monaco-editor .view-lines').last();
  await target.expectVisible(lines, 60_000);
  await target.click(lines);
};

test('records how long *Saved* takes after Mod+S in a project with bulk in it (B1)', async () => {
  /* 100 source files and one 5 MiB export: W6's stated condition. */
  await openFixture('?files=100&binaryMib=5');
  await openRevisions();
  const shortcut = await saveShortcut();

  /*
   * Two readings, because they answer different questions. The cold one is the
   * first cut of the whole seeded tree; the warm one is the gesture a person
   * repeats all day, which is the one B1 is about.
   */
  const coldStartedAt = performance.now();
  await target.keyboardPress(shortcut);
  await target.expectCount(historyRows(), 1, 180_000);
  const coldDuration = performance.now() - coldStartedAt;

  await focusEditor();
  await target.keyboardPress('a');
  const warmStartedAt = performance.now();
  await target.keyboardPress(shortcut);
  await target.expectCount(historyRows(), 2, 60_000);
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
  await openFixture('?chat=1');
  await openRevisions();
  const shortcut = await saveShortcut();

  /*
   * Branches first, while the graph is still shallow: the picker in the
   * composer is the only *New branch* a one-branch project offers, and the
   * pane's own Branches region only exists once a second branch does (A29).
   */
  const picker = selectors.getByCss('[data-slot="chat-branch-picker"]');
  let branchCount = 1;
  if (await target.isVisible(picker)) {
    for (const name of ['enclosure-v2', 'lid-v3']) {
      await target.click(picker);
      await target.click(selectors.getByRole('button', { name: 'New branch' }));
      const nameInput = selectors.getByRole('textbox', { name: 'Name for the new branch' });
      await target.expectVisible(nameInput, 15_000);
      await target.fill(nameInput, name);
      await target.click(selectors.getByRole('button', { name: 'Create branch' }));
      /* Counted rather than "visible": the Branches region is below History and
       * may be scrolled out of the pane, which is layout, not existence. */
      await target.expectCount(selectors.getByCss(`[aria-label="Switch to ${name}"]`), 1, 60_000);
      branchCount += 1;
    }
  }

  await focusEditor();
  let depth = 0;
  const startedAt = performance.now();
  while (depth < depthTarget && performance.now() - startedAt < depthBudgetMilliseconds) {
    await target.keyboardPress('a');
    await target.keyboardPress(shortcut);
    depth += 1;
    /* Past the eighth the visible rows stop growing, so the fold's own count is
     * what says the cut landed — without it the loop would outrun the worker. */
    if (depth <= 8) {
      await target.expectCount(historyRows(), depth, 60_000);
    } else {
      const earlier = depth - 8;
      await target.expectVisible(
        selectors.getByText(`Earlier · ${String(earlier)} revision${earlier === 1 ? '' : 's'}`),
        60_000,
      );
    }
  }

  /* Close the pane and reopen it: what B4 measures is the region's first paint
   * from the projection it already has, not the project's boot. */
  const opener = selectors.getByRole('button', { name: /^Open Revisions\./u });
  await target.click(opener);
  await target.expectHidden(selectors.getByCss(visibleRevisionsPanel), 30_000);
  const openedAt = performance.now();
  await target.click(opener);
  await target.expectVisible(selectors.getByCss(`${visibleRevisionsPanel} #revision-history-heading`), 30_000);
  const openDuration = performance.now() - openedAt;

  await target.writeArtifact(
    'revision-latency-b4.json',
    JSON.stringify(
      {
        depth,
        depthTarget,
        branchCount,
        openDuration,
        budgetMilliseconds: historyBudgetMilliseconds,
      },
      undefined,
      2,
    ),
  );
  expect(depth).toBeGreaterThan(0);
  expect(openDuration).toBeLessThan(historyCeilingMilliseconds);
});
