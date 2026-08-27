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

type TelemetrySurfaceState = {
  readonly bodyBackground: string;
  readonly bodyToPaneBottomGap: number;
  readonly bottomRadius: number;
  readonly contentPadding: number;
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

const readTelemetrySurfaceState = async (header: Locator): Promise<TelemetrySurfaceState> =>
  target.evaluateLocator(header, (element) => {
    const headerRoot = element.closest<HTMLElement>('[data-slot="paneview-header"]');
    const pane = element.closest<HTMLElement>('.dv-pane');
    const body = pane?.querySelector<HTMLElement>('[data-slot="telemetry-unit-surface"]');
    const paneBody = body?.closest<HTMLElement>('.dv-pane-body');
    const content = body?.querySelector<HTMLElement>('[data-slot="telemetry-unit-content"]');
    const panel = document.querySelector<HTMLElement>('[data-slot="telemetry-panel-body"]');
    const toolbar = document.querySelector<HTMLElement>('[data-slot="telemetry-filter"]');
    const filter = document.querySelector<HTMLInputElement>('[aria-label="Filter telemetry"]');
    const scroller = body?.querySelector<HTMLElement>('[role="tree"]');
    const row = body?.querySelector<HTMLElement>('[data-telemetry-span-row]');
    const footer = body?.querySelector<HTMLElement>('[data-slot="telemetry-scroll-footer"]');
    if (
      !headerRoot ||
      !body ||
      !paneBody ||
      !content ||
      !panel ||
      !toolbar ||
      !filter ||
      !scroller ||
      !row ||
      !footer
    ) {
      throw new Error('Telemetry attached surface was incomplete.');
    }

    const headerBounds = headerRoot.getBoundingClientRect();
    const bodyBounds = body.getBoundingClientRect();
    const headerStyle = getComputedStyle(headerRoot);
    const scrollerStyle = getComputedStyle(scroller);
    return {
      bodyBackground: getComputedStyle(body).backgroundColor,
      bodyToPaneBottomGap: paneBody.getBoundingClientRect().bottom - bodyBounds.bottom,
      bottomRadius: Number.parseFloat(getComputedStyle(body).borderBottomLeftRadius),
      contentPadding: Number.parseFloat(getComputedStyle(content).paddingLeft),
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

test('modernizes Telemetry as a filterable, truthful, accessible trace explorer', async () => {
  await target.emulateColorScheme('light');
  await target.setViewport({ width: 1440, height: 900 });
  await openSeededProject();
  await openSecondGeometryUnit();
  await openCommand('Open telemetry');

  const main = disclosure(mainPath);
  const secondary = disclosure(secondaryPath);
  await target.expectVisible(main, 60_000);
  await target.expectVisible(secondary, 60_000);
  await target.expectAttribute(main, 'aria-expanded', 'true');
  await target.expectAttribute(secondary, 'aria-expanded', 'false');

  const filter = selectors.getByRole('textbox', { name: 'Filter telemetry' });
  await target.expectVisible(filter);
  await target.expectAttribute(filter, 'placeholder', 'Filter telemetry...');
  await target.expectCount(selectors.getByRole('textbox', { name: 'Filter telemetry' }), 1);
  await target.expectCount(selectors.getByRole('button', { name: /show search|hide search/iu }), 0);

  await target.expectVisible(selectors.getByRole('button', { name: /^Selected trace: Latest$/u }), 60_000);
  await target.expectVisible(selectors.getByText('Total', { exact: true }).first());
  await target.expectVisible(selectors.getByText('Spans', { exact: true }).first());
  await target.expectVisible(selectors.getByText('Slowest', { exact: true }).first());
  const traceTree = selectors.getByRole('tree', { name: 'Telemetry trace operations' }).first();
  const mainSurface = selectors.getByCss('[data-slot="telemetry-unit-surface"]').first();
  await target.expectVisible(traceTree, 60_000);

  const firstRow = traceTree.getByRole('treeitem').first();
  await target.expectAttribute(firstRow, 'aria-level', '1');
  await target.focus(firstRow);
  await target.keyboardPress('End');
  await expect.poll(async () => target.getAttribute(traceTree.getByRole('treeitem').last(), 'tabindex')).toBe('0');

  await target.click(traceTree.getByRole('treeitem').nth(1));
  await target.expectVisible(mainSurface.getByText('Span details', { exact: true }));
  await target.expectVisible(mainSurface.getByRole('button', { name: 'Copy span details' }));
  await target.expectCount(mainSurface.getByText('devtools', { exact: true }), 0);

  await target.click(mainSurface.getByRole('radio', { name: 'Timeline' }));
  await target.expectVisible(mainSurface.getByRole('tree', { name: 'Telemetry trace timeline' }));
  await target.click(mainSurface.getByRole('radio', { name: 'Trace' }));

  const lightSurface = await readTelemetrySurfaceState(main);
  expect(lightSurface.seamDelta).toBeLessThanOrEqual(1);
  expect(lightSurface.horizontalEdgeDelta).toBeLessThanOrEqual(1);
  expect(lightSurface.bodyToPaneBottomGap).toBeCloseTo(8, 0);
  expect(lightSurface.bottomRadius).toBeGreaterThan(0);
  expect(lightSurface.contentPadding).toBe(8);
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
  await target.fill(filter, '__no_such_telemetry__');
  await target.expectCount(selectors.getByText('No matching telemetry', { exact: true }), 2, 15_000);
  await target.click(selectors.getByRole('button', { name: 'Clear search' }));

  const secondarySurface = selectors.getByCss('[data-slot="telemetry-unit-surface"]').nth(1);
  await target.drag(main, secondarySurface);
  const secondaryAfter = await target.boundingBox(secondary);
  if (!secondaryAfter) {
    throw new Error('Reordered secondary Telemetry header did not expose drag geometry.');
  }
  await expect
    .poll(async () => {
      const mainAfter = await target.boundingBox(main);
      return mainAfter?.y;
    })
    .toBeGreaterThan(secondaryAfter.y);

  await target.emulateColorScheme('dark');
  await target.expectClass(selectors.getByCss('html'), /\bdark\b/u);
  const darkSurface = await readTelemetrySurfaceState(main);
  expect(darkSurface.bodyBackground).not.toBe(lightSurface.bodyBackground);
  expect(darkSurface.bodyBackground).not.toBe(darkSurface.panelBackground);
  expect(darkSurface.filterBackground).not.toBe(darkSurface.panelBackground);

  await target.setViewport({ width: 960, height: 760 });
  const overflow = await target.evaluate(() => {
    const paneview = document
      .querySelector<HTMLElement>('[data-slot="telemetry-unit-surface"]')
      ?.closest<HTMLElement>('.dv-pane-container');
    return paneview ? paneview.scrollWidth - paneview.clientWidth : Number.POSITIVE_INFINITY;
  });
  expect(overflow).toBeLessThanOrEqual(0);
  await target.screenshot(selectors.getByCss('body'), 'telemetry-pane-dark-narrow.png');
});
