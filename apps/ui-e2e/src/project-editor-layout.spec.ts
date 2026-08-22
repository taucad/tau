import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

type LayoutMetrics = {
  readonly clientHeight: number;
  readonly headerBottom: number;
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
  readonly viewportBottom: number;
};

const readLayoutMetrics = async (): Promise<LayoutMetrics> =>
  target.evaluate(() => {
    const root = [...document.querySelectorAll<HTMLElement>('.split-view')].find((element) =>
      element.querySelector('.rs-center'),
    );
    const firstPane = root?.querySelector<HTMLElement>(':scope > .split-view-container > .split-view-view-visible');
    const sashContainer = root?.querySelector<HTMLElement>(':scope > .sash-container');
    const header = document.querySelector<HTMLElement>('header');
    if (!root || !firstPane || !sashContainer || !header) {
      throw new Error('Desktop editor layout was not ready.');
    }

    const rootBounds = root.getBoundingClientRect();
    const paneBounds = firstPane.getBoundingClientRect();
    const sashBounds = sashContainer.getBoundingClientRect();
    return {
      clientHeight: root.clientHeight,
      headerBottom: header.getBoundingClientRect().bottom,
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
      viewportBottom: window.innerHeight,
    };
  });

const expectConstrainedLayout = (metrics: LayoutMetrics): void => {
  expect.soft(metrics.scrollTop).toBe(0);
  // Allotment's disabled 8 px edge sash intentionally contributes 4 px to scrollWidth.
  expect.soft(metrics.scrollLeft).toBe(0);
  expect.soft(metrics.scrollHeight).toBe(metrics.clientHeight);
  expect.soft(Math.abs(metrics.rootTop - metrics.headerBottom)).toBeLessThanOrEqual(0.5);
  expect.soft(Math.abs(metrics.paneTop - metrics.headerBottom)).toBeLessThanOrEqual(0.5);
  expect.soft(Math.abs(metrics.paneBottom - metrics.rootBottom)).toBeLessThanOrEqual(0.5);
  expect.soft(Math.abs(metrics.viewportBottom - metrics.rootBottom - 8)).toBeLessThanOrEqual(0.5);
  expect.soft(Math.abs(metrics.sashTop - metrics.rootTop)).toBeLessThanOrEqual(0.5);
  expect.soft(Math.abs(metrics.sashBottom - metrics.rootBottom)).toBeLessThanOrEqual(0.5);
  expect.soft(Math.abs(metrics.sashLeft - metrics.rootLeft)).toBeLessThanOrEqual(0.5);
  expect.soft(Math.abs(metrics.sashRight - metrics.rootRight)).toBeLessThanOrEqual(0.5);
};

test('focusing the chat composer cannot scroll the desktop editor beneath the header', async () => {
  await target.navigate('/__e2e/project-navigation');
  await target.expectUrl(/\/w\/[^/]+\/[^/]+$/u, 60_000);

  const composer = selectors.getByCss('.tiptap[contenteditable="true"]').first();
  const sidebarTrigger = selectors.getByCss('[data-slot="sidebar-trigger"]');
  await target.expectVisible(selectors.getByTestId('cad-viewer-canvas-region').getByCss('canvas').first(), 60_000);
  await target.expectVisible(composer, 60_000);
  await target.expectVisible(sidebarTrigger);

  const beforeFocus = await readLayoutMetrics();
  await target.focus(composer);
  await target.expectFocused(composer);
  const afterFocus = await readLayoutMetrics();

  const sidebarWasOpen = (await target.getAttribute(sidebarTrigger, 'data-open')) === 'true';
  await target.click(sidebarTrigger);
  await target.expectAttribute(sidebarTrigger, 'data-open', String(!sidebarWasOpen));
  await target.focus(composer);
  await target.expectFocused(composer);
  await expect
    .poll(async () => {
      const metrics = await readLayoutMetrics();
      return {
        scrollLeft: metrics.scrollLeft,
        scrollTop: metrics.scrollTop,
        verticalOverflow: metrics.scrollHeight - metrics.clientHeight,
      };
    })
    .toEqual({ scrollLeft: 0, scrollTop: 0, verticalOverflow: 0 });
  const afterSidebarTransition = await readLayoutMetrics();

  expectConstrainedLayout(beforeFocus);
  expectConstrainedLayout(afterFocus);
  expectConstrainedLayout(afterSidebarTransition);
});
