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
  const commandSearch = selectors.getByPlaceholder('Search projects, chats, and actions…');
  await target.fill(commandSearch, name);
  await target.click(selectors.getByText(name, { exact: true }));
};

const openSeededProject = async (): Promise<void> => {
  await target.navigate(seedRoute);
  try {
    await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
  } catch {
    const project = selectors.getByRole('link', { name: seedProjectName }).first();
    await target.expectVisible(project, 60_000);
    await target.click(project);
    await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
  }

  await target.expectVisible(selectors.getByTestId('cad-viewer-canvas-region').getByCss('canvas').first(), 60_000);
  await target.click(selectors.getByRole('button', { name: /^decline$/iu }), { timeout: 5000 }).catch(() => undefined);
};

const openSecondGeometryUnit = async (): Promise<void> => {
  await openCommand('Open files');

  for (const path of ['public', 'public/models']) {
    const folder = treeItem(path);
    // oxlint-disable-next-line no-await-in-loop -- Each nested directory exists only after its parent expands.
    await target.expectVisible(folder, 15_000);
    // oxlint-disable-next-line no-await-in-loop -- Folder expansion is intentionally sequential.
    if ((await target.getAttribute(folder, 'aria-expanded')) !== 'true') {
      // oxlint-disable-next-line no-await-in-loop -- Folder expansion is intentionally sequential.
      await target.click(folder, { position: { x: 8, y: 14 } });
    }
  }

  await target.hover(treeItem(secondaryPath));
  await target.click(selectors.getByRole('button', { name: 'More actions for box-corner.js', exact: true }));
  await target.click(selectors.getByRole('menuitem', { name: 'Open in Viewer' }));
  await target.expectVisible(selectors.getByCss('.dv-tab').filter({ hasText: 'box-corner.js' }), 60_000);
};

type ModelSurfaceState = {
  readonly bodyBackground: string;
  readonly bodyBottomPadding: number;
  readonly bodyToPaneBottomGap: number;
  readonly bottomRadius: number;
  readonly filterBackground: string;
  readonly filterHeight: number;
  readonly filterToHeaderGap: number;
  readonly headerBottomBorderWidth: number;
  readonly headerBottomRadius: number;
  readonly horizontalEdgeDelta: number;
  readonly panelBackground: string;
  readonly rowRadius: number;
  readonly seamDelta: number;
  readonly scrollFadeEnd: string;
  readonly scrollFadeSize: string;
  readonly toolbarBorderWidth: number;
};

const readModelSurfaceState = async (header: Locator): Promise<ModelSurfaceState> =>
  target.evaluateLocator(header, (element) => {
    const headerRoot = element.closest<HTMLElement>('[data-slot="paneview-header"]');
    const pane = element.closest<HTMLElement>('.dv-pane');
    const body = pane?.querySelector<HTMLElement>('[data-slot="model-unit-surface"]');
    const scroller = body?.querySelector<HTMLElement>('[data-slot="model-unit-scroller"]');
    const paneBody = body?.closest<HTMLElement>('.dv-pane-body');
    const panel = document.querySelector<HTMLElement>('[data-slot="model-panel-body"]');
    const toolbar = document.querySelector<HTMLElement>('[data-slot="model-filter"]');
    const filter = document.querySelector<HTMLInputElement>('[aria-label="Filter parts"]');
    const row = body?.querySelector<HTMLElement>('[data-model-component-row]');
    if (!headerRoot || !body || !scroller || !paneBody || !panel || !toolbar || !filter || !row) {
      throw new Error('Model attached surface was incomplete.');
    }

    const headerBounds = headerRoot.getBoundingClientRect();
    const headerStyle = getComputedStyle(headerRoot);
    const bodyBounds = body.getBoundingClientRect();
    const scrollerStyle = getComputedStyle(scroller);
    const filterBounds = filter.getBoundingClientRect();
    return {
      bodyBackground: getComputedStyle(body).backgroundColor,
      bodyBottomPadding: Number.parseFloat(scrollerStyle.paddingBottom),
      bodyToPaneBottomGap: paneBody.getBoundingClientRect().bottom - bodyBounds.bottom,
      bottomRadius: Number.parseFloat(getComputedStyle(body).borderBottomLeftRadius),
      filterBackground: getComputedStyle(filter).backgroundColor,
      filterHeight: filterBounds.height,
      filterToHeaderGap: headerBounds.top - filterBounds.bottom,
      headerBottomBorderWidth: Number.parseFloat(headerStyle.borderBottomWidth),
      headerBottomRadius: Number.parseFloat(headerStyle.borderBottomLeftRadius),
      horizontalEdgeDelta: Math.max(
        Math.abs(headerBounds.left - bodyBounds.left),
        Math.abs(headerBounds.right - bodyBounds.right),
      ),
      panelBackground: getComputedStyle(panel).backgroundColor,
      rowRadius: Number.parseFloat(getComputedStyle(row).borderRadius),
      seamDelta: Math.abs(headerBounds.bottom - bodyBounds.top),
      scrollFadeEnd: scrollerStyle.getPropertyValue('--scroll-fade-end').trim(),
      scrollFadeSize: scrollerStyle.getPropertyValue('--scroll-fade-size').trim(),
      toolbarBorderWidth: Number.parseFloat(getComputedStyle(toolbar).borderBottomWidth),
    };
  });

test('keeps the Model hierarchy filterable, accessible, and reorderable through Paneview', async () => {
  await target.emulateColorScheme('light');
  await target.setViewport({ width: 1440, height: 900 });
  await openSeededProject();
  await openSecondGeometryUnit();
  await openCommand('Open model structure');

  const main = disclosure(mainPath);
  const secondary = disclosure(secondaryPath);
  await target.expectVisible(main, 60_000);
  await target.expectVisible(secondary, 60_000);
  await target.expectAttribute(main, 'aria-expanded', 'true');
  await target.expectAttribute(secondary, 'aria-expanded', 'true');

  const filter = selectors.getByRole('searchbox', { name: 'Filter parts' });
  await target.expectVisible(filter);
  await target.expectAttribute(filter, 'placeholder', 'Filter parts…');
  await target.expectCount(selectors.getByRole('searchbox', { name: 'Filter parts' }), 1);
  await target.expectCount(selectors.getByRole('button', { name: /show search|hide search/iu }), 0);

  const mainList = selectors.getByRole('list', { name: `Model components for ${mainPath}` });
  const secondaryList = selectors.getByRole('list', { name: `Model components for ${secondaryPath}` });
  await target.expectVisible(mainList, 60_000);
  await target.expectVisible(secondaryList, 60_000);

  const mainPart = mainList.getByCss('button[aria-pressed]:not([aria-label^="Isolate "])').first();
  const hideMainPart = mainList.getByCss('button[aria-label^="Hide "]');
  await target.expectVisible(mainPart);
  await target.focus(mainPart);
  await target.expectAttribute(mainPart, 'tabindex', '0');
  await target.expectAttribute(hideMainPart, 'tabindex', '-1');
  await target.keyboardPress('Tab');
  expect(await target.evaluateLocator(hideMainPart, (element) => element === document.activeElement)).toBe(false);
  await target.focus(mainPart);
  await target.keyboardPress('Enter');
  await target.expectVisible(selectors.getByText('Physical facts', { exact: true }));
  await expect
    .poll(async () => target.evaluateLocator(hideMainPart, (element) => getComputedStyle(element).opacity))
    .toBe('1');
  expect(
    await target.evaluateLocator(hideMainPart, (element) => Number.parseFloat(getComputedStyle(element).borderRadius)),
  ).toBeGreaterThan(0);

  const lightSurface = await readModelSurfaceState(main);
  expect(lightSurface.seamDelta).toBeLessThanOrEqual(1);
  expect(lightSurface.horizontalEdgeDelta).toBeLessThanOrEqual(1);
  expect(lightSurface.bodyToPaneBottomGap).toBeCloseTo(8, 0);
  expect(lightSurface.bodyBottomPadding).toBe(8);
  expect(lightSurface.bottomRadius).toBeGreaterThan(0);
  expect(lightSurface.rowRadius).toBeGreaterThan(0);
  expect(lightSurface.filterToHeaderGap).toBeCloseTo(8, 0);
  expect(lightSurface.filterHeight).toBe(28);
  expect(lightSurface.headerBottomBorderWidth).toBe(0);
  expect(lightSurface.headerBottomRadius).toBe(0);
  expect(lightSurface.scrollFadeEnd).toBe('transparent');
  expect(lightSurface.scrollFadeSize).toBe('28px');
  expect(lightSurface.toolbarBorderWidth).toBe(0);
  expect(lightSurface.bodyBackground).not.toBe(lightSurface.panelBackground);
  expect(lightSurface.filterBackground).not.toBe(lightSurface.panelBackground);

  await target.fill(filter, '__no_such_part__');
  await target.expectCount(selectors.getByText('No matching parts', { exact: true }), 2, 15_000);
  await target.click(selectors.getByRole('button', { name: 'Clear search' }));
  await target.expectVisible(mainList);
  await target.expectVisible(secondaryList);

  const secondarySurface = selectors.getByCss('[data-slot="model-unit-surface"]').nth(1);
  await target.drag(main, secondarySurface);
  const secondaryAfter = await target.boundingBox(secondary);
  if (!secondaryAfter) {
    throw new Error('Reordered secondary header did not expose drag geometry.');
  }
  await expect
    .poll(async () => {
      const mainAfter = await target.boundingBox(main);
      return mainAfter?.y;
    })
    .toBeGreaterThan(secondaryAfter.y);

  await target.emulateColorScheme('dark');
  await target.expectClass(selectors.getByCss('html'), /\bdark\b/u);
  const darkSurface = await readModelSurfaceState(main);
  expect(darkSurface.bodyBackground).not.toBe(lightSurface.bodyBackground);
  expect(darkSurface.bodyBackground).not.toBe(darkSurface.panelBackground);
  expect(darkSurface.filterBackground).not.toBe(darkSurface.panelBackground);

  await target.setViewport({ width: 960, height: 760 });
  const overflow = await target.evaluate(() => {
    const paneview = document
      .querySelector<HTMLElement>('[data-slot="paneview-header"]')
      ?.closest<HTMLElement>('.dv-pane-container');
    return paneview ? paneview.scrollWidth - paneview.clientWidth : Number.POSITIVE_INFINITY;
  });
  expect(overflow).toBeLessThanOrEqual(0);
  const rightBounds = await target.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('[data-slot="model-panel-body"]');
    const missing = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent.trim() === 'Missing',
    );
    return {
      viewport: innerWidth,
      panel: panel?.getBoundingClientRect().right,
      missing: missing?.getBoundingClientRect().right,
    };
  });
  expect(rightBounds.panel).toBeLessThanOrEqual(rightBounds.viewport);
  expect(rightBounds.missing).toBeLessThanOrEqual(rightBounds.viewport);
  await target.screenshot(selectors.getByCss('body'), 'model-pane-dark-narrow.png');

  await target.setViewport({ width: 1440, height: 900 });
  await target.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  const scaledLayout = await target.evaluate(() => {
    const paneHeaderOverlaps = [
      ...document.querySelectorAll<HTMLElement>('[data-slot="model-panel-body"] .dv-pane'),
    ].map((pane) => {
      const header = pane.querySelector<HTMLElement>('[data-slot="paneview-header"]');
      const body = pane.querySelector<HTMLElement>('.dv-pane-body');
      return header && body ? header.getBoundingClientRect().bottom - body.getBoundingClientRect().top : 0;
    });
    const facts = document.querySelector<HTMLElement>(
      '[data-slot="part-properties"] section[aria-label="Physical facts"] dl',
    );
    const label = facts?.querySelector('dt');
    const value = facts?.querySelector('dd');
    const modelContentBounds = [...document.querySelectorAll<HTMLElement>('[data-slot="model-unit-scroller"]')].map(
      (scroller) => {
        const row = scroller.querySelector<HTMLElement>('[data-model-component-row]');
        const surface = scroller.closest<HTMLElement>('[data-slot="model-unit-surface"]');
        const missing = [...(surface?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
          (button) => button.textContent.trim() === 'Missing',
        );
        const scrollBounds = scroller.getBoundingClientRect();
        const rowBounds = row?.getBoundingClientRect();
        const surfaceBounds = surface?.getBoundingClientRect();
        const missingBounds = missing?.getBoundingClientRect();
        return {
          missingInside: Boolean(missingBounds && surfaceBounds && missingBounds.bottom <= surfaceBounds.bottom + 1),
          rowInside: Boolean(
            rowBounds && rowBounds.top >= scrollBounds.top - 1 && rowBounds.bottom <= scrollBounds.bottom + 1,
          ),
        };
      },
    );
    return {
      firstValueWidth: value?.getBoundingClientRect().width,
      labelToValueGap:
        label && value ? value.getBoundingClientRect().top - label.getBoundingClientRect().bottom : undefined,
      modelContentBounds,
      paneHeaderOverlaps,
    };
  });
  expect(Math.max(...scaledLayout.paneHeaderOverlaps)).toBeLessThanOrEqual(1);
  expect(scaledLayout.firstValueWidth).toBeGreaterThan(120);
  expect(scaledLayout.labelToValueGap).toBeGreaterThanOrEqual(0);
  expect(scaledLayout.modelContentBounds).toHaveLength(2);
  expect(scaledLayout.modelContentBounds.every(({ rowInside, missingInside }) => rowInside && missingInside)).toBe(
    true,
  );
  const details = selectors.getByRole('button', { name: 'Details', exact: true });
  await target.scrollIntoView(details);
  await target.focus(details);
  const detailsState = await target.evaluateLocator(details, (element) => {
    const wrapper = element.closest<HTMLElement>('[data-slot="part-properties"]')?.parentElement;
    const bounds = element.getBoundingClientRect();
    return {
      bottom: bounds.bottom,
      focused: element === document.activeElement,
      overflowY: wrapper ? getComputedStyle(wrapper).overflowY : undefined,
      top: bounds.top,
      viewportHeight: innerHeight,
    };
  });
  expect(detailsState.focused).toBe(true);
  expect(detailsState.overflowY).toBe('auto');
  expect(detailsState.top).toBeGreaterThanOrEqual(0);
  expect(detailsState.bottom).toBeLessThanOrEqual(detailsState.viewportHeight);
  await target.keyboardPress('Enter');
  await target.expectVisible(selectors.getByText('Volume method', { exact: true }));
  await target.scrollIntoView(selectors.getByText('Density source', { exact: true }));
  await target.screenshot(selectors.getByCss('body'), 'model-pane-200pct-details.png');
});
