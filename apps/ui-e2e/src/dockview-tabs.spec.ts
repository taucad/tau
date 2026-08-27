import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';

const seedRoute = '/__e2e/project-file-tree';
const seedProjectName = 'sgenoud/models file-tree e2e';

const filesPane = (): Locator => selectors.getByRole('region', { name: /^Files for /u }).first();
const treeItem = (path: string): Locator =>
  filesPane().getByCss(`[data-testid="file-tree-item"][data-file-tree-path="${path}"]`);

const editorTab = (path: string): Locator => selectors.getByCss(`.dv-tab[aria-label="${path}"]`);
const tabTooltipTrigger = (path: string): Locator =>
  selectors.getByCss(`.dv-tab[aria-label="${path}"] .dv-default-tab[data-slot="tooltip-trigger"]`);

const expandPath = async (path: string): Promise<void> => {
  const segments = path.split('/');
  let current = '';
  for (const segment of segments) {
    current = current ? `${current}/${segment}` : segment;
    const item = treeItem(current);
    // oxlint-disable-next-line no-await-in-loop -- Each child exists only after its parent expands.
    await target.expectVisible(item, 15_000);
    // oxlint-disable-next-line no-await-in-loop -- Folder expansion is intentionally sequential.
    if ((await target.getAttribute(item, 'aria-expanded')) !== 'true') {
      // oxlint-disable-next-line no-await-in-loop -- Folder expansion is intentionally sequential.
      await target.click(item, { position: { x: 8, y: 14 } });
    }
    // oxlint-disable-next-line no-await-in-loop -- Folder expansion is intentionally sequential.
    await target.expectAttribute(item, 'aria-expanded', 'true', 15_000);
  }
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
  const searchButton = selectors.getByRole('button', { name: 'Search', exact: true });
  await target.expectVisible(searchButton);
  await target.click(searchButton);
  const commandSearch = selectors.getByPlaceholder('Search projects, chats, and actions...');
  await target.expectVisible(commandSearch);
  await target.fill(commandSearch, 'Open files');
  const openFilesCommand = selectors.getByText('Open files', { exact: true });
  await target.expectVisible(openFilesCommand);
  await target.click(openFilesCommand);

  await target.expectVisible(treeItem('package.json'), 60_000);
  await target.click(selectors.getByRole('button', { name: /^decline$/iu }), { timeout: 5000 }).catch(() => undefined);
};

type TabVisualState = {
  readonly backgroundColor: string;
  readonly borderRadius: number;
  readonly closePosition: string;
  readonly closeLayer: string;
  readonly color: string;
  readonly maskImage: string;
  readonly width: number;
};

const readTabVisualState = async (tab: Locator): Promise<TabVisualState> =>
  target.evaluateLocator(tab, (element) => {
    const title = element.querySelector<HTMLElement>('.scroll-shadow-right');
    const close = element.querySelector<HTMLElement>('.dv-default-tab-action');
    if (!title || !close) {
      throw new Error('Tau Dockview tab content was incomplete.');
    }
    const style = getComputedStyle(element);
    const titleStyle = getComputedStyle(title);
    const closeStyle = getComputedStyle(close);
    return {
      backgroundColor: style.backgroundColor,
      borderRadius: Number.parseFloat(style.borderRadius),
      closePosition: closeStyle.position,
      closeLayer: closeStyle.zIndex,
      color: style.color,
      maskImage: titleStyle.maskImage,
      width: element.getBoundingClientRect().width,
    };
  });

test('keeps fixed fading tabs usable across visual and interaction states', async () => {
  await target.emulateColorScheme('light');
  await target.setViewport({ width: 1440, height: 900 });
  await openSeededProject();

  await expandPath('public/models/nested');
  await expandPath('src');

  const paths = [
    'package.json',
    'public/models/box-corner.js',
    'public/models/nested/strainer.js',
    'src/readme.md',
  ] as const;
  for (const path of paths) {
    const parentPath = path.split('/').slice(0, -1).join('/');
    if (parentPath) {
      // oxlint-disable-next-line no-await-in-loop -- Each newly opened pane owns a fresh tree expansion state.
      await expandPath(parentPath);
    }
    // oxlint-disable-next-line no-await-in-loop -- Virtualized tree rows must be scrolled into view before interaction.
    await target.scrollIntoView(treeItem(path));
    // oxlint-disable-next-line no-await-in-loop -- File tabs are opened in a deterministic user sequence.
    await target.click(treeItem(path));
    // oxlint-disable-next-line no-await-in-loop -- Each tab must exist before opening the next one.
    await target.expectVisible(editorTab(path), 15_000);
  }

  const shortTab = editorTab('package.json');
  const longTab = editorTab('public/models/nested/strainer.js');
  const dragTarget = editorTab('public/models/box-corner.js');

  await target.scrollIntoView(longTab);
  await target.click(longTab);
  const activeLight = await readTabVisualState(longTab);
  expect(activeLight.width).toBeGreaterThanOrEqual(112);
  expect(activeLight.width).toBeLessThanOrEqual(160);
  expect(activeLight.borderRadius).toBeGreaterThan(0);
  expect(activeLight.maskImage).toContain('linear-gradient');
  expect(activeLight.closePosition).toBe('absolute');
  expect(Number(activeLight.closeLayer)).toBeGreaterThan(0);
  expect(activeLight.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');

  const stripMetrics = await target.evaluateLocator(longTab, (element) => {
    const strip = element.parentElement;
    if (!strip) {
      throw new Error('Dockview tab strip was missing.');
    }
    return { clientWidth: strip.clientWidth, scrollWidth: strip.scrollWidth };
  });
  expect(stripMetrics.scrollWidth).toBeGreaterThan(stripMetrics.clientWidth);

  const wheelState = await target.evaluateLocator(longTab, (element) => {
    const strip = element.parentElement;
    if (!(strip instanceof HTMLElement)) {
      throw new Error('Dockview tab strip was missing.');
    }

    strip.scrollLeft = 0;
    const forward = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 80 });
    const forwardDispatch = element.dispatchEvent(forward);
    const afterForward = strip.scrollLeft;
    const reverse = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -40 });
    const reverseDispatch = element.dispatchEvent(reverse);

    return {
      afterForward,
      afterReverse: strip.scrollLeft,
      forwardDispatch,
      forwardPrevented: forward.defaultPrevented,
      hasLegacyWrapper: element.closest('.dv-scrollable') !== null,
      reverseDispatch,
      reversePrevented: reverse.defaultPrevented,
    };
  });
  expect(wheelState).toEqual({
    afterForward: 80,
    afterReverse: 40,
    forwardDispatch: false,
    forwardPrevented: true,
    hasLegacyWrapper: false,
    reverseDispatch: false,
    reversePrevented: true,
  });

  const longTooltipTrigger = tabTooltipTrigger('public/models/nested/strainer.js');
  // Radix intentionally suppresses a tooltip on pointer-down until the
  // pointer leaves and re-enters the trigger. Exercise a real hover after
  // activating the tab rather than leaving the pointer parked from click().
  await target.mouseMove(1, 1);
  await target.hover(longTooltipTrigger);
  const tooltip = selectors.getByCss('[data-slot="tooltip-content"]');
  await target.expectVisible(tooltip);
  expect(await target.textContent(tooltip)).toContain('public/models/nested/strainer.js');

  await target.scrollIntoView(shortTab);
  const inactiveBeforeHover = await readTabVisualState(shortTab);
  const shortTabBox = await target.boundingBox(shortTab);
  if (!shortTabBox) {
    throw new Error('package.json tab did not have a bounding box.');
  }
  await target.mouseMove(shortTabBox.x + 2, shortTabBox.y + shortTabBox.height / 2);
  await target.delay(200);
  const inactiveOnHover = await readTabVisualState(shortTab);
  expect(inactiveOnHover.backgroundColor).not.toBe(inactiveBeforeHover.backgroundColor);

  await target.focus(shortTab);
  await target.expectFocused(shortTab);
  expect(await target.getAttribute(shortTab, 'aria-label')).toBe('package.json');

  await target.scrollIntoView(dragTarget);
  await target.drag(shortTab, dragTarget);
  await target.expectVisible(shortTab);
  await target.expectVisible(dragTarget);
  const draggedTab = await readTabVisualState(shortTab);
  expect(draggedTab.width).toBe(activeLight.width);

  await target.click(shortTab);
  await target.screenshot(selectors.getByCss('body'), 'dockview-tabs-light.png');
  await target.emulateColorScheme('dark');
  await target.expectClass(selectors.getByCss('html'), /\bdark\b/u);
  const activeDark = await readTabVisualState(shortTab);
  expect(activeDark.backgroundColor).not.toBe(activeLight.backgroundColor);
  expect(activeDark.color).not.toBe(activeLight.color);
  await target.screenshot(selectors.getByCss('body'), 'dockview-tabs-dark.png');

  await target.scrollIntoView(longTab);
  await target.hover(longTab);
  await target.click(selectors.getByRole('button', { name: 'Close public/models/nested/strainer.js' }));
  await target.expectCount(longTab, 0);

  await target.setViewport({ width: 1000, height: 900 });
  await target.hover(shortTab);
  await target.click(
    selectors.getByCss('.dv-groupview:has(.dv-tab[aria-label="package.json"]) button[aria-label="Split right"]'),
  );
  const workbenchTabStrips = selectors.getByCss(
    '[data-slot="omni-scroller"]:has(.dv-tab[aria-label="package.json"]) .dv-tabs-container',
  );
  await target.expectCount(workbenchTabStrips, 2);
  const secondStrip = workbenchTabStrips.nth(1);
  await target.drag(editorTab('public/models/box-corner.js'), secondStrip);
  await target.drag(editorTab('src/readme.md'), secondStrip);

  const splitWheelState = await target.evaluateLocator(secondStrip, (strip) => {
    const firstStrip = strip.closest('[data-slot="omni-scroller"]')?.querySelector<HTMLElement>('.dv-tabs-container');
    const tab = strip.querySelector<HTMLElement>('.dv-tab');
    if (!(strip instanceof HTMLElement) || !firstStrip || !tab) {
      throw new Error('Split Dockview tab strips were incomplete.');
    }

    firstStrip.scrollLeft = 0;
    strip.scrollLeft = 0;
    const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 70 });
    const dispatchResult = tab.dispatchEvent(wheel);

    return {
      dispatchResult,
      firstScrollLeft: firstStrip.scrollLeft,
      prevented: wheel.defaultPrevented,
      secondClientWidth: strip.clientWidth,
      secondScrollLeft: strip.scrollLeft,
      secondScrollWidth: strip.scrollWidth,
    };
  });
  expect(splitWheelState.secondScrollWidth).toBeGreaterThan(splitWheelState.secondClientWidth);
  expect(splitWheelState).toMatchObject({
    dispatchResult: false,
    firstScrollLeft: 0,
    prevented: true,
    secondScrollLeft: 70,
  });
});
