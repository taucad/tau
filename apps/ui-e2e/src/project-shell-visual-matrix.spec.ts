import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';

const seedRoute = '/__e2e/project-navigation';
const seededProjectName = 'Project Navigation A';
const widths = [1024, 1280, 1440, 1920] as const;
const themes = ['light', 'dark'] as const;

const chatToggle = (): Locator => selectors.getByRole('button', { name: 'Toggle Chat lane' });
const workbenchToggle = (): Locator => selectors.getByRole('button', { name: 'Toggle Workbench lane' });
const composer = (): Locator => selectors.getByCss('.tiptap[contenteditable="true"]').first();
const parametersTab = (): Locator => selectors.getByCss('.dv-tab[aria-label="Parameters"]');

async function openSeededProject(): Promise<void> {
  await target.navigate(seedRoute);
  try {
    await target.expectUrl(/\/w\/[^/]+\/[^/]+$/u, 10_000);
  } catch {
    const project = selectors.getByRole('link', { name: seededProjectName }).first();
    await target.expectVisible(project, 60_000);
    const href = await target.getAttribute(project, 'href');
    if (!href) {
      throw new Error('Seeded project link did not include an href.');
    }
    await target.navigate(href);
    await target.expectUrl(/\/w\/[^/]+\/[^/]+$/u, 60_000);
  }

  await target.expectVisible(selectors.getByTestId('cad-viewer-canvas-region').getByCss('canvas').first(), 60_000);
  await target.expectVisible(chatToggle(), 60_000);
  await target.expectVisible(workbenchToggle(), 60_000);
  await target.click(selectors.getByRole('button', { name: /^decline$/iu }), { timeout: 5000 }).catch(() => undefined);
}

async function ensureSidebarOpen(): Promise<void> {
  const trigger = selectors.getByCss('[data-slot="sidebar-trigger"]');
  await target.expectVisible(trigger);
  if ((await target.getAttribute(trigger, 'data-open')) !== 'true') {
    await target.click(trigger);
  }
  await target.expectAttribute(trigger, 'data-open', 'true');
}

async function ensureWideLanesOpen(): Promise<void> {
  for (const toggle of [chatToggle(), workbenchToggle()]) {
    // oxlint-disable-next-line no-await-in-loop -- Each lane must be opened before the next state assertion.
    if ((await target.getAttribute(toggle, 'aria-pressed')) !== 'true') {
      // oxlint-disable-next-line no-await-in-loop -- Each click mutates the shared workspace layout.
      await target.click(toggle);
    }
    // oxlint-disable-next-line no-await-in-loop -- The workspace state update is asynchronous.
    await target.expectAttribute(toggle, 'aria-pressed', 'true');
  }
}

async function openParameters(): Promise<void> {
  const searchButton = selectors.getByRole('button', { name: /Search projects and chats/u });
  await target.click(searchButton);
  const commandSearch = selectors.getByPlaceholder('Search projects, chats, and actions...');
  await target.fill(commandSearch, 'Open parameters');
  await target.click(selectors.getByText('Open parameters', { exact: true }));
  await target.expectVisible(parametersTab(), 15_000);
}

async function selectCompactAuxiliary(toggle: Locator): Promise<void> {
  if ((await target.getAttribute(toggle, 'aria-pressed')) !== 'true') {
    await target.click(toggle);
  }
  await target.expectAttribute(toggle, 'aria-pressed', 'true');
}

async function expectWorkspaceMode(width: (typeof widths)[number]): Promise<void> {
  const isCompact = width < 1440;
  try {
    await expect
      .poll(async () => target.getAttribute(selectors.getByCss('[data-project-workspace]'), 'data-compact'))
      .toBe(String(isCompact));
  } catch {
    const metrics = await target.evaluate(() => {
      const workspace = document.querySelector<HTMLElement>('[data-project-workspace]');
      return {
        compact: workspace?.dataset['compact'],
        innerWidth: window.innerWidth,
        workspaceWidth: workspace?.getBoundingClientRect().width,
      };
    });
    throw new Error(`Workspace mode did not settle for ${width}px: ${JSON.stringify(metrics)}`);
  }
}

async function expectLayout(width: (typeof widths)[number]): Promise<void> {
  const isCompact = width < 1440;
  await expectWorkspaceMode(width);

  const metrics = await target.evaluate(() => {
    const workspace = document.querySelector<HTMLElement>('[data-project-workspace]');
    const splitView = workspace?.querySelector<HTMLElement>(':scope > .split-view');
    const visiblePanes = splitView
      ? [
          ...splitView.querySelectorAll<HTMLElement>(':scope > .split-view-container > .split-view-view-visible'),
        ].filter((pane) => pane.getBoundingClientRect().width > 0).length
      : 0;
    return {
      documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
      visiblePanes,
      workspaceOverflow: workspace ? workspace.scrollWidth - workspace.clientWidth : Number.POSITIVE_INFINITY,
    };
  });
  expect(metrics.documentOverflow).toBeLessThanOrEqual(0);
  expect(metrics.workspaceOverflow).toBeLessThanOrEqual(0);
  expect(metrics.visiblePanes).toBe(isCompact ? 2 : 3);
}

test('captures the Codex-inspired shell across the charter visual matrix', async () => {
  await target.emulateColorScheme('light');
  await target.setViewport({ width: 1440, height: 900 });
  await openSeededProject();
  await ensureSidebarOpen();
  await ensureWideLanesOpen();
  await openParameters();

  const backgrounds = new Map<string, string>();
  for (const theme of themes) {
    // oxlint-disable-next-line no-await-in-loop -- Theme screenshots intentionally share one stable project session.
    await target.emulateColorScheme(theme);
    for (const width of widths) {
      // oxlint-disable-next-line no-await-in-loop -- Each viewport is a required charter evidence state.
      await target.setViewport({ width, height: 900 });
      // oxlint-disable-next-line no-await-in-loop -- The compact toggle semantics depend on the measured mode.
      await expectWorkspaceMode(width);
      if (width === 1024) {
        // oxlint-disable-next-line no-await-in-loop -- Compact-chat is one required responsive state.
        await selectCompactAuxiliary(chatToggle());
      } else if (width === 1280) {
        // oxlint-disable-next-line no-await-in-loop -- Compact-workbench is the complementary responsive state.
        await selectCompactAuxiliary(workbenchToggle());
      }

      // oxlint-disable-next-line no-await-in-loop -- ResizeObserver and Allotment settle asynchronously.
      await expectLayout(width);
      if (width === 1024) {
        // oxlint-disable-next-line no-await-in-loop -- The compact state must expose Chat only.
        await target.expectVisible(composer(), 15_000);
        // oxlint-disable-next-line no-await-in-loop -- Workbench remains open but undisplayed.
        await target.expectAttribute(workbenchToggle(), 'aria-pressed', 'false');
      } else if (width === 1280) {
        // oxlint-disable-next-line no-await-in-loop -- The compact state must expose Workbench only.
        await target.expectAttribute(chatToggle(), 'aria-pressed', 'false');
        // oxlint-disable-next-line no-await-in-loop -- The selected utility stays usable.
        await target.expectVisible(parametersTab(), 15_000);
      } else {
        // oxlint-disable-next-line no-await-in-loop -- Wide mode restores every open lane.
        await target.expectVisible(composer(), 15_000);
        // oxlint-disable-next-line no-await-in-loop -- Wide mode restores every open lane.
        await target.expectVisible(parametersTab(), 15_000);
      }

      // oxlint-disable-next-line no-await-in-loop -- Each required state produces a named review artifact.
      await target.screenshot(selectors.getByCss('body'), `codex-shell-${width}-${theme}.png`);
    }
    // oxlint-disable-next-line no-await-in-loop -- Theme tokens are verified after their full width pass.
    backgrounds.set(theme, await target.evaluate(() => getComputedStyle(document.body).backgroundColor));
  }

  expect(backgrounds.get('dark')).not.toBe(backgrounds.get('light'));
});
