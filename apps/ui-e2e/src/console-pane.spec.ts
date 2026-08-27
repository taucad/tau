import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';

const seedRoute = '/__e2e/project-file-tree';
const seedProjectName = 'sgenoud/models file-tree e2e';
const mainPath = 'public/models/honeycomb.js';
const secondaryPath = 'public/models/box-corner.js';

const treeItem = (path: string): Locator =>
  selectors.getByCss(`[data-testid="file-tree-item"][data-file-tree-path="${path}"]`);

const disclosure = (path: string): Locator => selectors.getByRole('button', { name: path, exact: true });

const openCommand = async (name: string): Promise<void> => {
  await target.click(selectors.getByRole('button', { name: 'Search', exact: true }));
  const commandSearch = selectors.getByPlaceholder('Search projects, chats, and actions...');
  await target.fill(commandSearch, name);
  await target.click(selectors.getByText(name, { exact: true }));
};

const openSeededProject = async (): Promise<void> => {
  await target.navigate(seedRoute);
  try {
    await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 10_000);
  } catch {
    const project = selectors.getByRole('link', { name: seedProjectName }).first();
    await target.expectVisible(project, 60_000);
    const href = await target.getAttribute(project, 'href');
    if (!href) {
      throw new Error('Seeded project link did not include an href.');
    }
    await target.navigate(href);
    await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
  }

  await target.expectVisible(selectors.getByTestId('cad-viewer-canvas-region').getByCss('canvas').first(), 60_000);
  await target.click(selectors.getByRole('button', { name: /^decline$/iu }), { timeout: 5000 }).catch(() => undefined);
};

const openSecondGeometryUnit = async (): Promise<void> => {
  await openCommand('Open files');
  for (const path of ['public', 'public/models']) {
    const folder = treeItem(path);
    // oxlint-disable-next-line no-await-in-loop -- Nested folders must be expanded in order.
    await target.expectVisible(folder, 15_000);
    // oxlint-disable-next-line no-await-in-loop -- Each child is unavailable until its parent expands.
    if ((await target.getAttribute(folder, 'aria-expanded')) !== 'true') {
      // oxlint-disable-next-line no-await-in-loop -- Folder expansion is intentionally sequential.
      await target.click(folder, { position: { x: 8, y: 14 } });
    }
  }

  await target.hover(treeItem(secondaryPath));
  await target.click(selectors.getByRole('button', { name: 'Actions for box-corner.js' }));
  await target.click(selectors.getByRole('menuitem', { name: 'Open in Viewer' }));
  await target.expectVisible(selectors.getByCss(`.dv-tab[aria-label="${secondaryPath}"]`), 60_000);
};

type ConsoleSurfaceState = {
  readonly bodyBackground: string;
  readonly bodyToPaneBottomGap: number;
  readonly bottomRadius: number;
  readonly filterBackground: string;
  readonly filterHeight: number;
  readonly filterToHeaderGap: number;
  readonly footerHeight: number;
  readonly headerBottomBorderWidth: number;
  readonly headerBottomRadius: number;
  readonly horizontalEdgeDelta: number;
  readonly panelBackground: string;
  readonly rowRadius: number;
  readonly scrollFadeEnd: string;
  readonly scrollFadeSize: string;
  readonly seamDelta: number;
  readonly toolbarBorderWidth: number;
};

const readConsoleSurfaceState = async (header: Locator): Promise<ConsoleSurfaceState> =>
  target.evaluateLocator(header, (element) => {
    const headerRoot = element.closest<HTMLElement>('[data-slot="paneview-header"]');
    const pane = element.closest<HTMLElement>('.dv-pane');
    const body = pane?.querySelector<HTMLElement>('[data-slot="console-unit-surface"]');
    const paneBody = body?.closest<HTMLElement>('.dv-pane-body');
    const panel = document.querySelector<HTMLElement>('[data-slot="console-panel-body"]');
    const toolbar = document.querySelector<HTMLElement>('[data-slot="console-filter"]');
    const filter = document.querySelector<HTMLInputElement>('[aria-label="Filter logs"]');
    const scroller = body?.querySelector<HTMLElement>('[role="log"]');
    const row = body?.querySelector<HTMLElement>('[data-console-log-row]');
    const footer = body?.querySelector<HTMLElement>('[data-slot="console-scroll-footer"]');
    if (!headerRoot || !body || !paneBody || !panel || !toolbar || !filter || !scroller || !row || !footer) {
      throw new Error('Console attached surface was incomplete.');
    }

    const headerBounds = headerRoot.getBoundingClientRect();
    const bodyBounds = body.getBoundingClientRect();
    const headerStyle = getComputedStyle(headerRoot);
    const scrollerStyle = getComputedStyle(scroller);
    return {
      bodyBackground: getComputedStyle(body).backgroundColor,
      bodyToPaneBottomGap: paneBody.getBoundingClientRect().bottom - bodyBounds.bottom,
      bottomRadius: Number.parseFloat(getComputedStyle(body).borderBottomLeftRadius),
      filterBackground: getComputedStyle(filter).backgroundColor,
      filterHeight: filter.getBoundingClientRect().height,
      filterToHeaderGap: headerBounds.top - filter.getBoundingClientRect().bottom,
      footerHeight: footer.getBoundingClientRect().height,
      headerBottomBorderWidth: Number.parseFloat(headerStyle.borderBottomWidth),
      headerBottomRadius: Number.parseFloat(headerStyle.borderBottomLeftRadius),
      horizontalEdgeDelta: Math.max(
        Math.abs(headerBounds.left - bodyBounds.left),
        Math.abs(headerBounds.right - bodyBounds.right),
      ),
      panelBackground: getComputedStyle(panel).backgroundColor,
      rowRadius: Number.parseFloat(getComputedStyle(row).borderRadius),
      scrollFadeEnd: scrollerStyle.getPropertyValue('--scroll-fade-end').trim(),
      scrollFadeSize: scrollerStyle.getPropertyValue('--scroll-fade-size').trim(),
      seamDelta: Math.abs(headerBounds.bottom - bodyBounds.top),
      toolbarBorderWidth: Number.parseFloat(getComputedStyle(toolbar).borderBottomWidth),
    };
  });

test('modernizes Console as a global-filtered multi-unit bottom-following log surface', async () => {
  await target.emulateColorScheme('light');
  await target.setViewport({ width: 1440, height: 900 });
  await openSeededProject();
  await openSecondGeometryUnit();
  await openCommand('Open console');

  const main = disclosure(mainPath);
  const secondary = disclosure(secondaryPath);
  await target.expectVisible(main, 60_000);
  await target.expectVisible(secondary, 60_000);
  await target.expectAttribute(main, 'aria-expanded', 'true');
  await target.expectAttribute(secondary, 'aria-expanded', 'false');

  const filter = selectors.getByRole('textbox', { name: 'Filter logs' });
  await target.expectVisible(filter);
  await target.expectAttribute(filter, 'placeholder', 'Filter logs...');
  await target.expectCount(selectors.getByRole('textbox', { name: 'Filter logs' }), 1);
  await target.expectVisible(selectors.getByRole('button', { name: 'Filter by log level' }));
  await target.expectVisible(selectors.getByRole('button', { name: 'Console settings' }));
  await target.expectVisible(selectors.getByRole('button', { name: 'Clear logs' }));

  const mainLog = selectors.getByRole('log', { name: `Console logs for ${mainPath}` });
  await target.expectVisible(mainLog, 60_000);
  const lightSurface = await readConsoleSurfaceState(main);
  expect(lightSurface.seamDelta).toBeLessThanOrEqual(1);
  expect(lightSurface.horizontalEdgeDelta).toBeLessThanOrEqual(1);
  expect(lightSurface.bodyToPaneBottomGap).toBeCloseTo(8, 0);
  expect(lightSurface.bottomRadius).toBeGreaterThan(0);
  expect(lightSurface.filterHeight).toBe(28);
  expect(lightSurface.filterToHeaderGap).toBeCloseTo(8, 0);
  expect(lightSurface.footerHeight).toBeCloseTo(8, 0);
  expect(lightSurface.headerBottomBorderWidth).toBe(0);
  expect(lightSurface.headerBottomRadius).toBe(0);
  expect(lightSurface.rowRadius).toBeGreaterThan(0);
  expect(lightSurface.scrollFadeEnd).toBe('transparent');
  expect(lightSurface.scrollFadeSize).toBe('28px');
  expect(lightSurface.toolbarBorderWidth).toBe(0);
  expect(lightSurface.bodyBackground).not.toBe(lightSurface.panelBackground);
  expect(lightSurface.filterBackground).not.toBe(lightSurface.panelBackground);

  await target.click(secondary);
  await target.expectAttribute(secondary, 'aria-expanded', 'true');
  await target.expectVisible(selectors.getByRole('log', { name: `Console logs for ${secondaryPath}` }), 60_000);
  await target.fill(filter, '__no_such_log__');
  await target.expectCount(selectors.getByText('No matching logs.', { exact: true }), 2, 15_000);
  await target.click(selectors.getByRole('button', { name: 'Clear search' }));

  const secondarySurface = selectors.getByCss('[data-slot="console-unit-surface"]').nth(1);
  await target.drag(main, secondarySurface);
  const secondaryAfter = await target.boundingBox(secondary);
  if (!secondaryAfter) {
    throw new Error('Reordered secondary Console header did not expose drag geometry.');
  }
  await expect
    .poll(async () => {
      const mainAfter = await target.boundingBox(main);
      return mainAfter?.y;
    })
    .toBeGreaterThan(secondaryAfter.y);

  await target.emulateColorScheme('dark');
  await target.expectClass(selectors.getByCss('html'), /\bdark\b/u);
  const darkSurface = await readConsoleSurfaceState(main);
  expect(darkSurface.bodyBackground).not.toBe(lightSurface.bodyBackground);
  expect(darkSurface.bodyBackground).not.toBe(darkSurface.panelBackground);
  expect(darkSurface.filterBackground).not.toBe(darkSurface.panelBackground);

  await target.setViewport({ width: 960, height: 760 });
  const overflow = await target.evaluate(() => {
    const paneview = document
      .querySelector<HTMLElement>('[data-slot="console-unit-surface"]')
      ?.closest<HTMLElement>('.dv-pane-container');
    return paneview ? paneview.scrollWidth - paneview.clientWidth : Number.POSITIVE_INFINITY;
  });
  expect(overflow).toBeLessThanOrEqual(0);
  await target.screenshot(selectors.getByCss('body'), 'console-pane-dark-narrow.png');
});
