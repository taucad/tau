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
    // oxlint-disable-next-line no-await-in-loop -- Each nested directory exists only after its parent expands.
    await target.expectVisible(folder, 15_000);
    // oxlint-disable-next-line no-await-in-loop -- Folder expansion is intentionally sequential.
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

type HeaderVisualState = {
  readonly actionSize: number;
  readonly actionsOpacity: string;
  readonly backgroundColor: string;
  readonly borderRadius: number;
  readonly frameworkTabIndex: number;
  readonly headerHeight: number;
  readonly parameterBodyOwned: boolean;
  readonly savedGroupHeight: number;
  readonly separatorColor: string;
};

type SurfaceVisualState = {
  readonly bodyBackground: string;
  readonly bodyToPaneBottomGap: number;
  readonly bottomRadius: number;
  readonly catalogBottomPadding: number;
  readonly catalogInlinePadding: number;
  readonly filterToHeaderGap: number;
  readonly filterBackground: string;
  readonly filterHeight: number;
  readonly headerBottomBorderWidth: number;
  readonly headerBottomRadius: number;
  readonly horizontalEdgeDelta: number;
  readonly panelBackground: string;
  readonly seamDelta: number;
  readonly scrollFadeEnd: string;
  readonly scrollFadeSize: string;
  readonly toolbarBorderWidth: number;
};

type ButtonVisualState = {
  readonly backgroundColor: string;
  readonly borderRadius: number;
  readonly color: string;
};

const readHeaderVisualState = async (header: Locator): Promise<HeaderVisualState> =>
  target.evaluateLocator(header, (element) => {
    const root = element.closest<HTMLElement>('[data-slot="paneview-header"]');
    const frameworkHeader = element.closest<HTMLElement>('.dv-pane-header');
    const pane = element.closest<HTMLElement>('.dv-pane');
    const action = root?.querySelector<HTMLElement>('[aria-label="Compilation unit actions"]');
    const actions = root?.querySelector<HTMLElement>('[data-testid="paneview-header-actions"]');
    const savedGroup = root?.querySelector<HTMLElement>('[aria-label="Parameter groups"]');
    if (!root || !frameworkHeader || !action || !actions || !savedGroup) {
      throw new Error('Parameters Paneview header was incomplete.');
    }

    const rootStyle = getComputedStyle(root);
    return {
      actionSize: action.getBoundingClientRect().height,
      actionsOpacity: getComputedStyle(actions).opacity,
      backgroundColor: rootStyle.backgroundColor,
      borderRadius: Number.parseFloat(rootStyle.borderRadius),
      frameworkTabIndex: frameworkHeader.tabIndex,
      headerHeight: root.getBoundingClientRect().height,
      parameterBodyOwned: Boolean(pane?.querySelector('[data-slot="parameters"]')),
      savedGroupHeight: savedGroup.getBoundingClientRect().height,
      separatorColor: getComputedStyle(frameworkHeader).getPropertyValue('--dv-paneview-header-border-color').trim(),
    };
  });

const readSurfaceVisualState = async (header: Locator): Promise<SurfaceVisualState> =>
  target.evaluateLocator(header, (element) => {
    const headerRoot = element.closest<HTMLElement>('[data-slot="paneview-header"]');
    const pane = element.closest<HTMLElement>('.dv-pane');
    const body = pane?.querySelector<HTMLElement>('[data-slot="parameters"]');
    const paneBody = body?.closest<HTMLElement>('.dv-pane-body');
    const panel = document.querySelector<HTMLElement>('[data-slot="parameters-panel-body"]');
    const toolbar = document.querySelector<HTMLElement>('[data-slot="parameters-filter"]');
    const filter = document.querySelector<HTMLInputElement>('[aria-label="Filter parameters"]');
    const catalog = body.querySelector<HTMLElement>('[data-slot="parameter-catalog"]');
    const scroller = body.querySelector<HTMLElement>('form');
    if (!headerRoot || !body || !paneBody || !panel || !toolbar || !filter || !catalog || !scroller) {
      throw new Error('Parameters attached surface was incomplete.');
    }

    const headerBounds = headerRoot.getBoundingClientRect();
    const headerStyle = getComputedStyle(headerRoot);
    const bodyBounds = body.getBoundingClientRect();
    const catalogStyle = getComputedStyle(catalog);
    const filterBounds = filter.getBoundingClientRect();
    const scrollerStyle = getComputedStyle(scroller);
    return {
      bodyBackground: getComputedStyle(body).backgroundColor,
      bodyToPaneBottomGap: paneBody.getBoundingClientRect().bottom - bodyBounds.bottom,
      bottomRadius: Number.parseFloat(getComputedStyle(body).borderBottomLeftRadius),
      catalogBottomPadding: Number.parseFloat(catalogStyle.paddingBottom),
      catalogInlinePadding: Number.parseFloat(catalogStyle.paddingLeft),
      filterToHeaderGap: headerBounds.top - filterBounds.bottom,
      filterBackground: getComputedStyle(filter).backgroundColor,
      filterHeight: filter.getBoundingClientRect().height,
      headerBottomBorderWidth: Number.parseFloat(headerStyle.borderBottomWidth),
      headerBottomRadius: Number.parseFloat(headerStyle.borderBottomLeftRadius),
      horizontalEdgeDelta: Math.max(
        Math.abs(headerBounds.left - bodyBounds.left),
        Math.abs(headerBounds.right - bodyBounds.right),
      ),
      panelBackground: getComputedStyle(panel).backgroundColor,
      seamDelta: Math.abs(headerBounds.bottom - bodyBounds.top),
      scrollFadeEnd: scrollerStyle.getPropertyValue('--scroll-fade-end').trim(),
      scrollFadeSize: scrollerStyle.getPropertyValue('--scroll-fade-size').trim(),
      toolbarBorderWidth: Number.parseFloat(getComputedStyle(toolbar).borderBottomWidth),
    };
  });

const readAdjacentGroupGap = async (firstGroup: Locator, secondLabel: string): Promise<number> =>
  target.evaluateLocator(
    firstGroup,
    (element, label) => {
      const first = element.closest<HTMLElement>('[data-slot="parameter-group"]');
      const parameters = element.closest<HTMLElement>('[data-slot="parameters"]');
      const secondTrigger = [...(parameters?.querySelectorAll<HTMLElement>('[aria-label]') ?? [])].find(
        (candidate) => candidate.getAttribute('aria-label') === label,
      );
      const second = secondTrigger?.closest<HTMLElement>('[data-slot="parameter-group"]');
      if (!first || !second) {
        throw new Error('Adjacent parameter groups were incomplete.');
      }
      return second.getBoundingClientRect().top - first.getBoundingClientRect().bottom;
    },
    secondLabel,
  );

const readButtonVisualState = async (button: Locator): Promise<ButtonVisualState> =>
  target.evaluateLocator(button, (element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderRadius: Number.parseFloat(style.borderRadius),
      color: style.color,
    };
  });

const expectHoverTreatment = async (button: Locator, reference: ButtonVisualState): Promise<void> => {
  await target.hover(button);
  await expect
    .poll(async () => {
      const state = await readButtonVisualState(button);
      return {
        hasBackground: state.backgroundColor !== 'rgba(0, 0, 0, 0)',
        color: state.color,
        isRounded: state.borderRadius > 0,
      };
    })
    .toEqual({ hasBackground: true, color: reference.color, isRounded: true });
};

test('keeps rounded file disclosures accessible and reorderable through Paneview', async () => {
  await target.emulateColorScheme('light');
  await target.setViewport({ width: 1440, height: 900 });
  await openSeededProject();
  await openSecondGeometryUnit();
  await openCommand('Open parameters');

  const main = disclosure(mainPath);
  const secondary = disclosure(secondaryPath);
  await target.expectVisible(main, 60_000);
  await target.expectVisible(secondary, 60_000);
  await target.expectAttribute(main, 'aria-expanded', 'true');
  await target.expectAttribute(secondary, 'aria-expanded', 'false');

  const filter = selectors.getByRole('textbox', { name: 'Filter parameters' });
  await target.expectVisible(filter);
  await target.expectCount(selectors.getByRole('textbox', { name: 'Filter parameters' }), 1);
  await target.expectCount(selectors.getByRole('button', { name: /show search|hide search/iu }), 0);

  const dimensions = selectors.getByRole('button', { name: 'Group: Dimensions' }).first();
  const pattern = selectors.getByRole('button', { name: 'Group: Pattern' }).first();
  await target.expectVisible(dimensions, 60_000);
  await target.expectVisible(pattern);

  const openGroupGap = await readAdjacentGroupGap(dimensions, 'Group: Pattern');
  expect(openGroupGap).toBeCloseTo(8, 0);

  await target.click(dimensions);
  await target.click(pattern);
  await target.expectAttribute(dimensions, 'aria-expanded', 'false');
  await target.expectAttribute(pattern, 'aria-expanded', 'false');
  const closedGroupGap = await readAdjacentGroupGap(dimensions, 'Group: Pattern');
  expect(closedGroupGap).toBeCloseTo(8, 0);
  await target.click(dimensions);
  await target.click(pattern);

  const lightIdle = await readHeaderVisualState(main);
  expect(lightIdle.headerHeight).toBe(32);
  expect(lightIdle.actionSize).toBeGreaterThanOrEqual(24);
  expect(lightIdle.savedGroupHeight).toBeGreaterThanOrEqual(24);
  expect(lightIdle.borderRadius).toBeGreaterThan(0);
  expect(lightIdle.frameworkTabIndex).toBe(-1);
  expect(lightIdle.separatorColor).toBe('transparent');
  expect(lightIdle.actionsOpacity).toBe('0');
  expect(lightIdle.parameterBodyOwned).toBe(true);

  const lightSurface = await readSurfaceVisualState(main);
  expect(lightSurface.seamDelta).toBeLessThanOrEqual(1);
  expect(lightSurface.horizontalEdgeDelta).toBeLessThanOrEqual(1);
  expect(lightSurface.bodyToPaneBottomGap).toBeCloseTo(8, 0);
  expect(lightSurface.bottomRadius).toBeGreaterThan(0);
  expect(lightSurface.catalogBottomPadding).toBe(8);
  expect(lightSurface.catalogInlinePadding).toBe(8);
  expect(lightSurface.filterToHeaderGap).toBeCloseTo(8, 0);
  expect(lightSurface.filterHeight).toBe(28);
  expect(lightSurface.headerBottomBorderWidth).toBe(0);
  expect(lightSurface.headerBottomRadius).toBe(0);
  expect(lightSurface.scrollFadeEnd).toBe('transparent');
  expect(lightSurface.scrollFadeSize).toBe('28px');
  expect(lightSurface.toolbarBorderWidth).toBe(0);
  expect(lightSurface.bodyBackground).not.toBe(lightSurface.panelBackground);
  expect(lightSurface.filterBackground).not.toBe(lightSurface.panelBackground);

  await target.hover(main);
  await expect
    .poll(async () => {
      const state = await readHeaderVisualState(main);
      return state.actionsOpacity;
    })
    .toBe('1');
  await target.click(selectors.getByRole('button', { name: 'Parameter groups' }).first());
  await target.expectAttribute(main, 'aria-expanded', 'true');
  await target.keyboardPress('Escape');

  await target.focus(main);
  await target.expectFocused(main);

  const widthInput = selectors.getByLabelText('Input for Width').first();
  await target.fill(widthInput, '21');
  await target.keyboardPress('Enter');
  const reset = selectors.getByRole('button', { name: 'Reset parameters' }).first();
  await target.expectVisible(reset, 15_000);

  const close = selectors.getByRole('button', { name: `Close ${secondaryPath}` });
  await target.hover(close);
  const lightClose = await readButtonVisualState(close);
  expect(lightClose.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  for (const action of [
    selectors.getByRole('button', { name: 'Parameter groups' }).first(),
    selectors.getByRole('button', { name: 'Collapse all' }).first(),
    selectors.getByRole('button', { name: 'Compilation unit actions' }).first(),
    reset,
  ]) {
    // oxlint-disable-next-line no-await-in-loop -- Hover styles are mutually exclusive and must be sampled sequentially.
    await expectHoverTreatment(action, lightClose);
  }
  await target.screenshot(selectors.getByCss('body'), 'parameters-pane-light.png');

  await target.click(secondary);
  await target.expectAttribute(secondary, 'aria-expanded', 'true');
  const secondaryBody = selectors.getByCss('[data-slot="parameters"]').nth(1);
  await target.expectVisible(secondaryBody);
  await target.expectVisible(selectors.getByLabelText('Parameter: Corner Radius'), 60_000);

  await target.fill(filter, 'corner radius');
  await target.expectVisible(selectors.getByLabelText('Parameter: Corner Radius'), 15_000);
  await target.expectVisible(selectors.getByText('No parameters matching "corner radius"', { exact: true }));
  await target.click(selectors.getByRole('button', { name: 'Clear search' }));
  await target.expectVisible(selectors.getByLabelText('Parameter: Cell Size'));
  await target.expectVisible(selectors.getByLabelText('Parameter: Corner Radius'));

  await target.evaluate(() => {
    document.body.dataset['parametersDropTargetSeen'] = 'false';
    const observer = new MutationObserver(() => {
      if (!document.querySelector('.dv-drop-target-selection')) {
        return;
      }
      document.body.dataset['parametersDropTargetSeen'] = 'true';
      observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
  await target.drag(main, secondaryBody);
  await expect
    .poll(async () => target.getAttribute(selectors.getByCss('body'), 'data-parameters-drop-target-seen'))
    .toBe('true');

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
  const reordered = await readHeaderVisualState(main);
  expect(reordered.borderRadius).toBeGreaterThan(0);
  await target.screenshot(selectors.getByCss('body'), 'parameters-pane-reordered.png');

  const expandedSecondary = await readHeaderVisualState(secondary);
  expect(expandedSecondary.parameterBodyOwned).toBe(true);

  await target.expectVisible(selectors.getByLabelText('Parameter: Cell Size'));
  await target.expectVisible(selectors.getByLabelText('Parameter: Corner Radius'));

  await target.emulateColorScheme('dark');
  await target.expectClass(selectors.getByCss('html'), /\bdark\b/u);
  const dark = await readHeaderVisualState(main);
  expect(dark.backgroundColor).not.toBe(lightIdle.backgroundColor);
  const darkSurface = await readSurfaceVisualState(main);
  expect(darkSurface.bodyBackground).not.toBe(darkSurface.panelBackground);
  expect(darkSurface.filterBackground).not.toBe(darkSurface.panelBackground);

  await target.hover(close);
  const darkClose = await readButtonVisualState(close);
  for (const action of [
    selectors.getByRole('button', { name: 'Parameter groups' }).first(),
    selectors.getByRole('button', { name: 'Collapse all' }).first(),
    selectors.getByRole('button', { name: 'Compilation unit actions' }).first(),
    reset,
  ]) {
    // oxlint-disable-next-line no-await-in-loop -- Hover styles are mutually exclusive and must be sampled sequentially.
    await expectHoverTreatment(action, darkClose);
  }
  await target.screenshot(selectors.getByCss('body'), 'parameters-pane-dark.png');

  await target.setViewport({ width: 960, height: 760 });
  const overflow = await target.evaluate(() => {
    const paneview = document
      .querySelector<HTMLElement>('[data-slot="paneview-header"]')
      ?.closest<HTMLElement>('.dv-pane-container');
    return paneview ? paneview.scrollWidth - paneview.clientWidth : Number.POSITIVE_INFINITY;
  });
  expect(overflow).toBeLessThanOrEqual(0);
  await target.screenshot(selectors.getByCss('body'), 'parameters-pane-dark-narrow.png');
});
