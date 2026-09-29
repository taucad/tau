/* oxlint-disable no-await-in-loop, no-eval -- Each required viewport mutates one rendered project session; axe-core crosses the existing trusted browser-command evaluation boundary as source text. */
import axe from 'axe-core';
import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';
import {
  answerIfAsked,
  awaitSaved,
  editSource,
  focusSource,
  openBackupChooser,
  openFixture,
  openSourceFile,
  replaceSource,
  restoreFromHistory,
  revisionChip,
  revisionStrip,
  saveShortcut,
} from '#support/revision-session.js';

const revisionsPanel = '[data-slot="revisions-panel-body"]';
const visibleRevisionsPanel = `${revisionsPanel}:visible`;
/*
 * Height is part of the matrix, not a constant (C60).
 *
 * Every viewport here used to be 900 tall, which is exactly why C36 shipped:
 * the History list only overflowed its own section — and painted over Sync —
 * when the pane was shorter than its content. The two 520-tall rows are the
 * reproduction; the 320- and 512-wide rows are the reflow widths a person hits
 * at phone size and at 200% zoom.
 */
const viewports = [
  { width: 320, height: 800 },
  { width: 320, height: 520 },
  { width: 360, height: 900 },
  { width: 600, height: 900 },
  { width: 1024, height: 900 },
  { width: 1100, height: 520 },
] as const;

const expectRevisionLayout = async (): Promise<void> => {
  const result = await target.evaluate((selector) => {
    const panel = [...document.querySelectorAll<HTMLElement>(selector)].find(
      (candidate) => candidate.getClientRects().length > 0,
    );
    if (!panel) {
      return {
        documentOverflow: 1_000_000,
        panelOverflow: 1_000_000,
        panelOffscreen: 1_000_000,
        escapedControl: 'panel missing',
        historyOverflow: 1_000_000,
        sectionOverlap: 1_000_000,
      };
    }
    const panelRect = panel.getBoundingClientRect();
    const escaped = [
      ...panel.querySelectorAll<HTMLElement>('button, input, summary, [role="radio"], [role="switch"]'),
    ].find((control) => {
      const rect = control.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (rect.left < panelRect.left - 1 || rect.right > panelRect.right + 1);
    });
    /*
     * The vertical half (C60). C36 was a section that shrank below its own
     * `<ol>`: the list then painted outside its box and over whatever followed
     * it. Two numbers say that, and both are `1_000_000` when the element the
     * assertion is about is missing, so an absent History or Sync fails loudly
     * rather than passing vacuously.
     */
    const historyList = panel.querySelector<HTMLElement>('ol[aria-label="Revision history"]');
    const historySection = historyList?.closest('section');
    const syncSection = panel.querySelector<HTMLElement>('#revision-sync-heading')?.closest('section');
    const historyRect = historySection?.getBoundingClientRect();
    return {
      documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
      panelOverflow: panel.scrollWidth - panel.clientWidth,
      panelOffscreen: Math.max(0, -panelRect.left, panelRect.right - window.innerWidth),
      escapedControl: escaped?.getAttribute('aria-label') ?? escaped?.textContent.trim(),
      historyOverflow:
        historyList && historyRect ? historyList.getBoundingClientRect().bottom - historyRect.bottom : 1_000_000,
      sectionOverlap:
        historyRect && syncSection ? historyRect.bottom - syncSection.getBoundingClientRect().top : 1_000_000,
    };
  }, revisionsPanel);
  expect(result.documentOverflow).toBeLessThanOrEqual(0);
  expect(result.panelOverflow).toBeLessThanOrEqual(1);
  expect(result.panelOffscreen).toBeLessThanOrEqual(1);
  expect(result.escapedControl).toBeUndefined();
  expect(result.historyOverflow).toBeLessThanOrEqual(1);
  expect(result.sectionOverlap).toBeLessThanOrEqual(1);
};

test('keeps every revision surface usable across the closeout UX matrix', async () => {
  await target.emulateColorScheme('light');
  await target.setViewport({ width: 1440, height: 900 });
  await target.navigate('/__e2e/project-file-tree');
  await target.expectUrl(/\/w\/[^/]+\/[^/]+$/u, 180_000);
  const declineCookies = selectors.getByRole('button', { name: 'Decline' }).last();
  await target.expectVisible(declineCookies, 15_000);
  await target.click(declineCookies);

  const openRevisions = selectors.getByRole('button', { name: /^Open Revisions\./u });
  await target.expectVisible(openRevisions, 120_000);
  /*
   * S20 (M2, I6): while History has not answered, the pane says *Loading
   * history…* and can never say *No revisions yet* in the same frame. The
   * window is too short to photograph reliably, so it is watched instead: an
   * observer records every frame in which both are on screen.
   */
  await target.evaluate(() => {
    const record = globalThis as typeof globalThis & { revisionLoadingContradictions?: number };
    record.revisionLoadingContradictions = 0;
    new MutationObserver(() => {
      const panel = [...document.querySelectorAll<HTMLElement>('[data-slot="revisions-panel-body"]')].find(
        (candidate) => candidate.getClientRects().length > 0,
      );
      const text = panel?.textContent ?? '';
      if (text.includes('Loading history') && text.includes('No revisions yet')) {
        record.revisionLoadingContradictions = (record.revisionLoadingContradictions ?? 0) + 1;
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  await target.click(openRevisions);
  await target.expectVisible(selectors.getByCss(visibleRevisionsPanel), 60_000);
  const emptyTitle = selectors.getByCss(`${visibleRevisionsPanel} [data-slot="panel-empty-state-title"]`);
  const emptyDescription = selectors.getByCss(`${visibleRevisionsPanel} [data-slot="panel-empty-state-description"]`);
  await target.expectVisible(emptyTitle, 60_000);
  await target.expectText(emptyTitle, 'No revisions yet');
  await target.expectVisible(emptyDescription, 60_000);
  await target.expectText(emptyDescription, 'Save a revision or send a request and it will appear here.');
  expect(
    await target.evaluate(
      () =>
        (globalThis as typeof globalThis & { revisionLoadingContradictions?: number }).revisionLoadingContradictions,
    ),
  ).toBe(0);
  /* S1: the strip says so plainly, and nothing offers a branch or a backup before there is a revision. */
  const stripStatus = selectors.getByCss(`${visibleRevisionsPanel} [role="status"][aria-label="Revision status"]`);
  await target.expectVisible(stripStatus, 60_000);
  expect(await target.isVisible(selectors.getByRole('button', { name: 'New branch' }))).toBe(false);
  expect(await target.isVisible(selectors.getByRole('button', { name: 'Back up' }))).toBe(false);

  const emptyStateSpacing = await target.evaluate(() => {
    const title = [...document.querySelectorAll<HTMLElement>('[data-slot="panel-empty-state-title"]')]
      .find((candidate) => candidate.getClientRects().length > 0)
      ?.getBoundingClientRect();
    const description = [...document.querySelectorAll<HTMLElement>('[data-slot="panel-empty-state-description"]')]
      .find((candidate) => candidate.getClientRects().length > 0)
      ?.getBoundingClientRect();
    return title && description ? description.top - title.bottom : -1;
  });
  expect(emptyStateSpacing).toBeGreaterThanOrEqual(0);
  await target.screenshot(selectors.getByCss(visibleRevisionsPanel), 'revisions-S1-fresh-1440-light.png');

  /* Two revisions with different files, as a person makes them: an edit, then Save. */
  const saveShortcut = await target.evaluate(() => (/mac/i.test(navigator.userAgent) ? 'Meta+s' : 'Control+s'));
  await openSourceFile();
  await focusSource();
  for (let index = 0; index < 2; index += 1) {
    await editSource();
    await target.keyboardPress(saveShortcut);
    await awaitSaved();
  }
  if (!(await target.isVisible(selectors.getByCss(visibleRevisionsPanel)))) {
    await target.click(openRevisions);
  }
  const historyRows = selectors.getByCss(
    `${visibleRevisionsPanel} ol[aria-label="Revision history"] button[data-revision-row]`,
  );
  await target.expectCount(historyRows, 2, 120_000);

  /* Round 16/18: naming lives in the row's More; Cancel hands focus back to it. */
  await target.click(selectors.getByRole('button', { name: /^Rev 1 · /u }));
  const moreForRev1 = selectors.getByRole('button', { name: 'More actions for Rev 1' });
  await target.click(moreForRev1);
  await target.click(selectors.getByRole('menuitem', { name: 'Name version…' }));
  const nameInput = selectors.getByRole('textbox', { name: 'Name Rev 1' });
  await target.expectVisible(nameInput);
  await target.expectFocused(nameInput);
  const cancelName = selectors.getByRole('button', { name: 'Cancel' }).first();
  await target.focus(cancelName);
  await target.keyboardPress('Enter');
  await target.expectHidden(nameInput);
  await target.expectFocused(moreForRev1);

  /* S5 (A9, D1, D2): a restore is a new row named by what it restored, with Undo restore on the strip and the row. */
  await restoreFromHistory(1, selectors.getByRole('button', { name: 'Rev 3 · Restored Rev 1' }));
  await target.expectVisible(
    selectors
      .getByCss(`${visibleRevisionsPanel} [data-slot="strip-actions"]`)
      .getByRole('button', { name: 'Undo restore' }),
    30_000,
  );
  await target.screenshot(selectors.getByCss(visibleRevisionsPanel), 'revisions-S5-restored-1440-light.png');

  /* S25: New branch has one home, on the strip; Branches appears with the line it made. */
  await target.click(
    selectors
      .getByCss(`${visibleRevisionsPanel} [aria-label="Where you are"]`)
      .getByRole('button', { name: 'New branch' }),
  );
  const branchName = selectors.getByRole('textbox', { name: 'Name for the new branch' });
  await target.expectFocused(branchName);
  await target.fill(branchName, 'fillet-exploration');
  await target.click(selectors.getByRole('button', { name: 'Create branch' }));
  await target.expectVisible(selectors.getByCss(`${visibleRevisionsPanel} #revision-branches-heading`), 60_000);
  await target.expectVisible(selectors.getByRole('list', { name: 'Branches' }).getByText('fillet-exploration'), 30_000);
  await target.screenshot(selectors.getByCss(visibleRevisionsPanel), 'revisions-S25-first-branch-1440-light.png');

  await openBackupChooser();
  const noRemote = selectors.getByRole('radio', { name: 'No remote' });
  const tauCloud = selectors.getByRole('radio', { name: 'Tau Cloud' });
  const connectBackup = selectors.getByRole('button', { name: 'Connect backup' });
  await target.expectAttribute(noRemote, 'aria-checked', 'true');
  await target.expectAttribute(connectBackup, 'disabled', '');
  await target.click(tauCloud);
  await target.expectAttribute(tauCloud, 'aria-checked', 'true');
  expect(await target.getAttribute(connectBackup, 'disabled')).toBeNull();
  await target.expectVisible(selectors.getByRole('switch', { name: 'Sync chats' }));
  const coarsePointer = await target.evaluate(() => matchMedia('(pointer: coarse)').matches);

  for (const { width, height } of viewports) {
    await target.setViewport({ width, height });
    if (!(await target.isVisible(selectors.getByCss(visibleRevisionsPanel)))) {
      if (width < 768) {
        const historyTab = selectors.getByCss('button[role="tab"]:has-text("History"):visible');
        await target.waitFor(
          () => [...document.querySelectorAll('[role="tab"]')].some((tab) => tab.textContent.trim() === 'History'),
          undefined,
          { timeout: 15_000 },
        );
        await target.evaluate(() => {
          [...document.querySelectorAll<HTMLElement>('[role="tab"]')]
            .find((tab) => tab.textContent.trim() === 'History')
            ?.scrollIntoView({ inline: 'center' });
        });
        await target.expectVisible(historyTab, 15_000);
        await target.click(historyTab, { touch: coarsePointer });
      } else {
        await target.expectVisible(openRevisions, 15_000);
        await target.click(openRevisions);
      }
      await target.expectVisible(selectors.getByCss(visibleRevisionsPanel));
    }
    const syncHeading = selectors.getByCss(`${visibleRevisionsPanel} #revision-sync-heading`);
    if (!(await target.isVisible(syncHeading))) {
      await openBackupChooser();
      await target.expectVisible(syncHeading);
    }
    await expectRevisionLayout();
    await target.screenshot(
      selectors.getByCss(visibleRevisionsPanel),
      `revisions-${String(width)}x${String(height)}-light.png`,
    );
  }

  /* A 1024-device-pixel viewport at 200% browser zoom has 512 CSS pixels and
   * must enter the same reflow path a person sees, unlike the CSS zoom property. */
  await target.setViewport({ width: 512, height: 900 });
  await target.waitFor(
    () => [...document.querySelectorAll('[role="tab"]')].some((tab) => tab.textContent.trim() === 'History'),
    undefined,
    { timeout: 15_000 },
  );
  const zoomHistoryTab = selectors.getByCss('button[role="tab"]:has-text("History"):visible');
  await target.evaluate(() => {
    [...document.querySelectorAll<HTMLElement>('[role="tab"]')]
      .find((tab) => tab.textContent.trim() === 'History')
      ?.scrollIntoView({ inline: 'center' });
  });
  await target.click(zoomHistoryTab, { touch: coarsePointer });
  await target.expectVisible(selectors.getByCss(visibleRevisionsPanel));
  const zoomSyncHeading = selectors.getByCss(`${visibleRevisionsPanel} #revision-sync-heading`);
  if (!(await target.isVisible(zoomSyncHeading))) {
    await openBackupChooser();
    await target.expectVisible(zoomSyncHeading);
  }
  await expectRevisionLayout();
  await target.screenshot(selectors.getByCss(visibleRevisionsPanel), 'revisions-200-percent-zoom.png');

  await target.setViewport({ width: 1024, height: 900 });
  if (!(await target.isVisible(selectors.getByCss(visibleRevisionsPanel)))) {
    await target.expectVisible(openRevisions, 15_000);
    await target.click(openRevisions);
    await target.expectVisible(selectors.getByCss(visibleRevisionsPanel));
  }
  const desktopSyncHeading = selectors.getByCss(`${visibleRevisionsPanel} #revision-sync-heading`);
  if (!(await target.isVisible(desktopSyncHeading))) {
    await openBackupChooser();
    await target.expectVisible(desktopSyncHeading);
  }

  await target.emulateColorScheme('dark');
  await target.screenshot(selectors.getByCss(visibleRevisionsPanel), 'revisions-1024-dark.png');
  await target.emulateReducedMotion('reduce');
  await target.expectVisible(selectors.getByCss(`${visibleRevisionsPanel} #revision-history-heading`));
  await target.screenshot(selectors.getByCss(visibleRevisionsPanel), 'revisions-1024-reduced-motion.png');
  await target.emulateReducedMotion('no-preference');
  await target.emulateContrast('more');
  await target.emulateForcedColors('active');
  await target.expectVisible(selectors.getByCss(`${visibleRevisionsPanel} #revision-history-heading`));
  await target.expectVisible(selectors.getByCss(`${visibleRevisionsPanel} #revision-sync-heading`));
  await target.screenshot(selectors.getByCss(visibleRevisionsPanel), 'revisions-1024-forced-colors.png');
  await target.emulateForcedColors('none');
  await target.emulateContrast('no-preference');
  await target.emulateColorScheme('light');

  const violations = await target.evaluate(
    async ({ axeSource, selector }) => {
      globalThis.eval(axeSource);
      const runner = (
        globalThis as typeof globalThis & {
          axe: {
            run(
              root: Element,
              options: unknown,
            ): Promise<{
              violations: Array<{ impact?: string; id: string; nodes: unknown[] }>;
            }>;
          };
        }
      ).axe;
      const root = [...document.querySelectorAll<HTMLElement>(selector)].find(
        (candidate) => candidate.getClientRects().length > 0,
      );
      if (!root) {
        throw new Error('Revision panel was unavailable for accessibility audit.');
      }
      const results = await runner.run(root, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
      });
      return results.violations
        .filter(({ impact }) => impact === 'serious' || impact === 'critical')
        .map(({ id, impact, nodes }) => ({ id, impact, nodes: nodes.length }));
    },
    { axeSource: axe.source, selector: revisionsPanel },
  );
  expect(violations).toEqual([]);
});

/*
 * S7, S19 and S24: each state is reached through the real machines — a merge
 * that collides, a save the store refuses, a chat placed on a branch — never by
 * painting the DOM. Each row seeds its own project, so no row inherits another's.
 */

const branchName = 'fillet-exploration';

/** Open the Revisions pane through the header chip unless it is already on screen. */
const openPane = async (): Promise<void> => {
  if (!(await target.isVisible(selectors.getByCss(visibleRevisionsPanel)))) {
    await target.click(revisionChip());
  }
  await target.expectVisible(selectors.getByCss(visibleRevisionsPanel), 60_000);
};

/**
 * Make the open file one line and save it as a revision, as a person does.
 *
 * @param line - The file's new contents.
 */
const saveSource = async (line: string): Promise<void> => {
  const shortcut = await saveShortcut();
  await openSourceFile();
  await focusSource();
  await replaceSource(line);
  await target.keyboardPress(shortcut);
  await awaitSaved();
};

/** The Branches row a branch's own *Actions for* button sits in. */
const branchRow = (name: string, isCurrent = false): Locator =>
  selectors
    .getByCss(`${visibleRevisionsPanel} ul[aria-label="Branches"] > li${isCurrent ? '[aria-current="true"]' : ''}`)
    .filter({ has: selectors.getByRole('button', { name: `Actions for ${name}`, exact: true }) });

/** S25's gesture: New branch on the strip, named, then the Branches row it made. */
const createBranch = async (name: string): Promise<void> => {
  await target.click(revisionStrip().getByRole('button', { name: 'New branch' }));
  await target.fill(selectors.getByRole('textbox', { name: 'Name for the new branch' }), name);
  await target.click(selectors.getByRole('button', { name: 'Create branch' }));
  await target.expectVisible(branchRow(name), 60_000);
};

/** Put the workbench on a branch through its row's Switch, answering the guard when it asks. */
const workOn = async (name: string): Promise<void> => {
  if (await target.isVisible(branchRow(name, true))) {
    return;
  }
  await target.click(selectors.getByRole('button', { name: `Switch to ${name}`, exact: true }));
  await answerIfAsked('Switch branch', branchRow(name, true));
};

test('S24: places the chat in focus on a branch from its row, then offers Follow chat', async () => {
  await target.emulateColorScheme('light');
  await openFixture('?chat=1');
  await target.expectVisible(revisionChip(), 120_000);
  await saveSource('// S24 base');
  await openPane();
  await createBranch(branchName);
  /* The chat in focus works in main, the live checkout, as the canvas row has it. */
  await workOn('main');
  await target.click(branchRow(branchName).getByRole('button', { name: `Actions for ${branchName}`, exact: true }));
  const place = selectors.getByRole('menuitem', { name: `Use ${branchName} in this chat`, exact: true });
  await target.expectVisible(place, 30_000);
  await target.screenshot(undefined, 'revisions-S24-use-in-chat-1440-light.png');
  await target.click(place);
  await target.expectVisible(
    selectors.getByRole('button', { name: `Follow chat, which is working on ${branchName}`, exact: true }),
    60_000,
  );
  await target.screenshot(undefined, 'revisions-S24-follow-chat-1440-light.png');
});

test('S7: a merge that changed the same lines on both branches waits for a decision on main', async () => {
  await target.emulateColorScheme('light');
  await openFixture('');
  await target.expectVisible(revisionChip(), 120_000);
  await saveSource('// S7 base');
  await openPane();
  await createBranch(branchName);
  await workOn(branchName);
  await saveSource('// S7 fillet side');
  await openPane();
  await workOn('main');
  await saveSource('// S7 main side');
  await openPane();
  await target.click(branchRow(branchName).getByRole('button', { name: `Actions for ${branchName}`, exact: true }));
  await target.click(selectors.getByRole('menuitem', { name: `Merge ${branchName} into main`, exact: true }));
  const decision = selectors.getByCss(`${visibleRevisionsPanel} #revision-conflicts-heading`);
  await answerIfAsked('Merge branch', decision, 120_000);
  /* HQ1, HQ2: one sentence, naming the line the decision lands on; main is untouched until then. */
  await target.expectText(
    revisionStrip().getByRole('status', { name: 'Revision status' }),
    'Needs your decision on main',
    60_000,
  );
  const files = selectors.getByRole('list', { name: `Files to resolve in ${branchName}` });
  await target.expectContainingText(files, 'public/models/honeycomb.js', 30_000);
  /* Both sides are offered for the one file, as one choice. */
  await target.expectCount(files.getByRole('button', { name: /^Keep .+ in public\/models\/honeycomb\.js$/u }), 2);
  await target.expectVisible(selectors.getByRole('button', { name: 'Merge into main' }));
  await target.screenshot(selectors.getByCss(visibleRevisionsPanel), 'revisions-S7-needs-decision-1440-light.png');
});

test('S19: says Save not confirmed when the store refuses a save, and keeps where you are', async () => {
  await target.emulateColorScheme('light');
  await openFixture('');
  await target.expectVisible(revisionChip(), 120_000);
  await saveSource('// S19 saved');
  /* The fixture's fault (`routes/[__e2e].project-file-tree`): another holder takes the branch
   * ref's exclusive handle, as a second tab or a full disk would, so the next save's ref
   * update is refused by the store itself. */
  await target.evaluate(async () => {
    await (
      globalThis as typeof globalThis & { __tauE2eHoldProjectFile?: (path: string) => Promise<void> }
    ).__tauE2eHoldProjectFile?.('.git/refs/heads/main');
  });
  await replaceSource('// S19 not confirmed');
  await target.keyboardPress(await saveShortcut());
  await openPane();
  await target.expectText(
    revisionStrip().getByRole('status', { name: 'Revision status' }),
    'Save not confirmed',
    120_000,
  );
  await target.expectContainingText(
    selectors.getByRole('alert', { name: 'Unsaved changes' }),
    'One change could not be saved.',
    30_000,
  );
  /* The last known identity is held: main at Rev 1, never *Setting up*. */
  await target.expectVisible(
    selectors.getByRole('button', { name: 'Open Revisions. You are on main, Rev 1. Save not confirmed.', exact: true }),
    30_000,
  );
  await target.screenshot(selectors.getByCss(visibleRevisionsPanel), 'revisions-S19-save-not-confirmed-1440-light.png');
});
