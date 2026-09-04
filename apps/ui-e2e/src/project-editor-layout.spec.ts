import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

type Bounds = { readonly height: number; readonly width: number; readonly x: number; readonly y: number };

type LayoutMetrics = {
  readonly clientHeight: number;
  readonly compact: boolean;
  readonly contentLeft: number;
  readonly mainLeft: number;
  readonly outerClientHeight: number;
  readonly outerRootBottom: number;
  readonly outerRootLeft: number;
  readonly outerRootRight: number;
  readonly outerRootTop: number;
  readonly outerScrollHeight: number;
  readonly outerScrollLeft: number;
  readonly outerScrollTop: number;
  readonly paneBottom: number;
  readonly paneTop: number;
  readonly rootBottom: number;
  readonly rootLeft: number;
  readonly rootRight: number;
  readonly rootTop: number;
  readonly sashBottom: number;
  readonly sashLeft: number;
  readonly sashRight: number;
  readonly sashTop: number;
  readonly scrollHeight: number;
  readonly scrollLeft: number;
  readonly scrollTop: number;
  readonly sidebarOpen: boolean;
  readonly sidebarRight: number;
  readonly viewportBottom: number;
  readonly viewportRight: number;
};

const readLayoutMetrics = async (): Promise<LayoutMetrics> =>
  target.evaluate(() => {
    const outerRoot = document.querySelector<HTMLElement>('#application-allotment');
    const main = outerRoot?.querySelector<HTMLElement>('main');
    const sidebar = document.querySelector<HTMLElement>('[role="complementary"][aria-label="Application sidebar"]');
    const workspace = document.querySelector<HTMLElement>('[data-project-workspace]');
    const root = workspace?.querySelector<HTMLElement>(':scope > .split-view');
    const firstPane = root?.querySelector<HTMLElement>(':scope > .split-view-container > .split-view-view-visible');
    const sashContainer = root?.querySelector<HTMLElement>(':scope > .sash-container');
    const content = document.querySelector<HTMLElement>('[data-slot="collection-empty-state"]');
    if (!outerRoot || !main || !sidebar || !workspace || !root || !firstPane || !sashContainer || !content) {
      throw new Error('Desktop editor layout was not ready.');
    }

    const contentBounds = content.getBoundingClientRect();
    const mainBounds = main.getBoundingClientRect();
    const outerRootBounds = outerRoot.getBoundingClientRect();
    const rootBounds = root.getBoundingClientRect();
    const paneBounds = firstPane.getBoundingClientRect();
    const sashBounds = sashContainer.getBoundingClientRect();
    const sidebarBounds = sidebar.getBoundingClientRect();
    return {
      clientHeight: root.clientHeight,
      compact: workspace.dataset['compact'] === 'true',
      contentLeft: contentBounds.left,
      mainLeft: mainBounds.left,
      outerClientHeight: outerRoot.clientHeight,
      outerRootBottom: outerRootBounds.bottom,
      outerRootLeft: outerRootBounds.left,
      outerRootRight: outerRootBounds.right,
      outerRootTop: outerRootBounds.top,
      outerScrollHeight: outerRoot.scrollHeight,
      outerScrollLeft: outerRoot.scrollLeft,
      outerScrollTop: outerRoot.scrollTop,
      paneBottom: paneBounds.bottom,
      paneTop: paneBounds.top,
      rootBottom: rootBounds.bottom,
      rootLeft: rootBounds.left,
      rootRight: rootBounds.right,
      rootTop: rootBounds.top,
      sashBottom: sashBounds.bottom,
      sashLeft: sashBounds.left,
      sashRight: sashBounds.right,
      sashTop: sashBounds.top,
      scrollHeight: root.scrollHeight,
      scrollLeft: root.scrollLeft,
      scrollTop: root.scrollTop,
      sidebarOpen:
        document.querySelector<HTMLElement>('[data-slot="application-shell"]')?.dataset.sidebarOpen === 'true',
      sidebarRight: sidebarBounds.right,
      viewportBottom: window.innerHeight,
      viewportRight: window.innerWidth,
    };
  });

const requireBounds = async (selector: target.TargetSelector): Promise<Bounds> => {
  const bounds = await target.boundingBox(selector);
  if (!bounds) {
    throw new Error('Expected visible control bounds.');
  }

  return bounds;
};

const expectSameBounds = (actual: Bounds, expected: Bounds): void => {
  expect.soft(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(0.5);
  expect.soft(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(0.5);
  expect.soft(Math.abs(actual.width - expected.width)).toBeLessThanOrEqual(0.5);
  expect.soft(Math.abs(actual.height - expected.height)).toBeLessThanOrEqual(0.5);
};

const expectConstrainedLayout = (metrics: LayoutMetrics): void => {
  expect.soft(metrics.scrollTop).toBe(0);
  expect.soft(metrics.scrollLeft).toBe(0);
  expect.soft(metrics.scrollHeight).toBe(metrics.clientHeight);
  expect.soft(metrics.outerScrollTop).toBe(0);
  expect.soft(metrics.outerScrollLeft).toBe(0);
  expect.soft(metrics.outerScrollHeight).toBe(metrics.outerClientHeight);
  expect.soft(Math.abs(metrics.outerRootTop)).toBeLessThanOrEqual(0.5);
  expect.soft(Math.abs(metrics.outerRootLeft)).toBeLessThanOrEqual(0.5);
  expect.soft(Math.abs(metrics.outerRootRight - metrics.viewportRight)).toBeLessThanOrEqual(0.5);
  expect.soft(Math.abs(metrics.outerRootBottom - metrics.viewportBottom)).toBeLessThanOrEqual(0.5);
  expect.soft(Math.abs(metrics.rootLeft - metrics.mainLeft)).toBeLessThanOrEqual(0.5);
  expect.soft(Math.abs(metrics.rootTop)).toBeLessThanOrEqual(0.5);
  expect.soft(Math.abs(metrics.paneTop)).toBeLessThanOrEqual(0.5);
  expect.soft(Math.abs(metrics.paneBottom - metrics.rootBottom)).toBeLessThanOrEqual(0.5);
  expect.soft(Math.abs(metrics.viewportBottom - metrics.rootBottom)).toBeLessThanOrEqual(0.5);
  expect.soft(Math.abs(metrics.sashTop - metrics.rootTop)).toBeLessThanOrEqual(0.5);
  expect.soft(Math.abs(metrics.sashBottom - metrics.rootBottom)).toBeLessThanOrEqual(0.5);
  expect.soft(Math.abs(metrics.sashLeft - metrics.rootLeft)).toBeLessThanOrEqual(0.5);
  expect.soft(Math.abs(metrics.sashRight - metrics.rootRight)).toBeLessThanOrEqual(0.5);
  expect.soft(metrics.contentLeft - metrics.mainLeft).toBeGreaterThanOrEqual(7.5);
  expect.soft(metrics.contentLeft - metrics.mainLeft).toBeLessThanOrEqual(8.5);
  if (metrics.sidebarOpen) {
    expect.soft(Math.abs(metrics.sidebarRight - metrics.mainLeft)).toBeLessThanOrEqual(0.5);
  }
};

test('the project shell keeps stable controls, split geometry, and focus scroll', async () => {
  await target.setViewport({ width: 1400, height: 900 });
  await target.navigate('/__e2e/project-navigation');
  await target.expectUrl(/\/w\/[^/]+\/[^/]+$/u, 60_000);

  const composer = selectors.getByCss('.tiptap[contenteditable="true"]').first();
  const home = selectors.getByRole('link', { name: 'Home' }).first();
  const sidebarTrigger = selectors.getByRole('button', { name: 'Toggle Sidebar' }).first();
  const workbenchTrigger = selectors.getByRole('button', { name: 'Toggle Workbench lane' }).first();
  const outerSash = selectors.getByCss('#application-allotment > .sash-container > .sash').first();
  const canvas = selectors.getByTestId('cad-viewer-canvas-region').getByCss('canvas').first();

  await target.expectVisible(canvas, 60_000);
  await target.expectVisible(selectors.getByCss('[data-project-workspace] > .split-view'), 60_000);
  await target.expectVisible(composer, 60_000);
  await target.expectVisible(home);
  await target.expectVisible(sidebarTrigger);
  await target.expectVisible(workbenchTrigger);

  if ((await target.getAttribute(sidebarTrigger, 'data-open')) !== 'true') {
    await target.click(sidebarTrigger);
    await target.expectAttribute(sidebarTrigger, 'data-open', 'true');
  }

  await target.evaluate(() => {
    const canvasElement = document.querySelector<HTMLElement>('[data-testid="cad-viewer-canvas-region"] canvas');
    if (canvasElement) {
      canvasElement.dataset['shellIdentity'] = 'preserved';
    }
  });

  const homeBounds = await requireBounds(home);
  const sidebarOpenBounds = await requireBounds(sidebarTrigger);
  const workbenchOpenBounds = await requireBounds(workbenchTrigger);
  const beforeFocus = await readLayoutMetrics();

  expect.soft(sidebarOpenBounds.width).toBe(28);
  expect.soft(sidebarOpenBounds.height).toBe(28);
  expect.soft(workbenchOpenBounds.width).toBe(28);
  expect.soft(workbenchOpenBounds.height).toBe(28);
  expect.soft(sidebarOpenBounds.x - (homeBounds.x + homeBounds.width)).toBe(4);
  expect.soft(sidebarOpenBounds.y).toBe(workbenchOpenBounds.y);
  expect.soft(beforeFocus.compact).toBe(false);
  expectConstrainedLayout(beforeFocus);

  await target.click(sidebarTrigger);
  await target.expectAttribute(sidebarTrigger, 'data-open', 'false');
  const sidebarClosedBounds = await requireBounds(sidebarTrigger);
  const closedLayout = await readLayoutMetrics();
  expectSameBounds(sidebarClosedBounds, sidebarOpenBounds);
  expect.soft(closedLayout.mainLeft).toBe(0);
  expectConstrainedLayout(closedLayout);

  const modifierShortcut = await target.evaluate(() => {
    const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform;
    return /mac/i.test(platform ?? navigator.userAgent) ? 'Meta+b' : 'Control+b';
  });
  await target.focus(sidebarTrigger);
  await target.keyboardPress(modifierShortcut);
  await target.expectAttribute(sidebarTrigger, 'data-open', 'true');
  await target.keyboardPress(modifierShortcut);
  await target.expectAttribute(sidebarTrigger, 'data-open', 'false');
  await target.click(sidebarTrigger);
  await target.expectAttribute(sidebarTrigger, 'data-open', 'true');

  await target.expectVisible(outerSash);
  const sashBounds = await requireBounds(outerSash);
  const beforeDrag = await readLayoutMetrics();
  const sashCenterY = sashBounds.y + sashBounds.height / 2;
  await target.mouseMove(sashBounds.x + sashBounds.width / 2, sashCenterY);
  await target.mouseDown();
  await target.mouseMove(sashBounds.x + sashBounds.width / 2 + 96, sashCenterY, { steps: 4 });
  await target.mouseUp();
  await expect
    .poll(async () => {
      const metrics = await readLayoutMetrics();
      return metrics.sidebarRight;
    })
    .toBeGreaterThan(beforeDrag.sidebarRight + 80);
  await expect
    .poll(async () => {
      const metrics = await readLayoutMetrics();
      return metrics.compact;
    })
    .toBe(true);
  const afterDrag = await readLayoutMetrics();
  expect.soft(afterDrag.compact).toBe(true);
  expectSameBounds(await requireBounds(sidebarTrigger), sidebarOpenBounds);
  expectConstrainedLayout(afterDrag);

  await target.focus(sidebarTrigger);
  await target.press(sidebarTrigger, 'ArrowLeft');
  await expect
    .poll(async () => {
      const metrics = await readLayoutMetrics();
      return Math.round(metrics.sidebarRight);
    })
    .toBe(Math.round(afterDrag.sidebarRight - 16));
  expectSameBounds(await requireBounds(sidebarTrigger), sidebarOpenBounds);

  const workbenchWasOpen = (await target.getAttribute(workbenchTrigger, 'aria-pressed')) === 'true';
  await target.click(workbenchTrigger);
  await target.expectAttribute(workbenchTrigger, 'aria-pressed', String(!workbenchWasOpen));
  expectSameBounds(await requireBounds(workbenchTrigger), workbenchOpenBounds);
  await target.click(workbenchTrigger);
  await target.expectAttribute(workbenchTrigger, 'aria-pressed', String(workbenchWasOpen));

  await target.focus(composer);
  await target.expectFocused(composer);
  const afterFocus = await readLayoutMetrics();
  expectConstrainedLayout(afterFocus);
  expect(
    await target.evaluate(
      () =>
        document.querySelector<HTMLElement>('[data-testid="cad-viewer-canvas-region"] canvas')?.dataset[
          'shellIdentity'
        ],
    ),
  ).toBe('preserved');
});
