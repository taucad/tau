/* oxlint-disable no-await-in-loop, no-eval -- Each required viewport mutates one rendered project session; axe-core crosses the existing trusted browser-command evaluation boundary as source text. */
import axe from 'axe-core';
import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

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
    const historyList = panel.querySelector<HTMLElement>('ol[aria-label="Recent revision history"]');
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
  await target.click(openRevisions);
  await target.expectVisible(selectors.getByCss(visibleRevisionsPanel), 60_000);
  const emptyTitle = selectors.getByCss(`${visibleRevisionsPanel} [data-slot="panel-empty-state-title"]`);
  const emptyDescription = selectors.getByCss(`${visibleRevisionsPanel} [data-slot="panel-empty-state-description"]`);
  await target.expectVisible(emptyTitle, 60_000);
  await target.expectText(emptyTitle, 'No revisions yet');
  await target.expectVisible(emptyDescription, 60_000);
  await target.expectText(emptyDescription, 'Saved changes will appear here.');

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
  await target.screenshot(selectors.getByCss(visibleRevisionsPanel), 'revisions-empty-1440-light.png');

  const saveShortcut = await target.evaluate(() => (/mac/i.test(navigator.userAgent) ? 'Meta+s' : 'Control+s'));
  await target.keyboardPress(saveShortcut);
  const history = selectors.getByCss('[aria-label="Recent revision history"] > li');
  await target.expectCount(history, 1, 120_000);

  const nameRevision = selectors.getByRole('button', { name: 'Name version' }).first();
  await target.focus(nameRevision);
  await target.keyboardPress('Enter');
  const nameInput = selectors.getByRole('textbox', { name: /Name Revision/u });
  await target.expectVisible(nameInput);
  await target.expectFocused(nameInput);
  const cancelName = selectors.getByRole('button', { name: 'Cancel' }).first();
  await target.focus(cancelName);
  await target.keyboardPress('Enter');
  await target.expectHidden(nameInput);

  await target.click(selectors.getByRole('button', { name: 'Connect Tau Cloud' }));
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
      await target.click(selectors.getByCss(`${visibleRevisionsPanel} button:has-text("Connect Tau Cloud")`));
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
    await target.click(selectors.getByCss(`${visibleRevisionsPanel} button:has-text("Connect Tau Cloud")`));
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
    await target.click(selectors.getByCss(`${visibleRevisionsPanel} button:has-text("Connect Tau Cloud")`));
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
