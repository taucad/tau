import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

type LayoutMetrics = {
  readonly clientHeight: number;
  readonly clientWidth: number;
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
  readonly scrollWidth: number;
  readonly viewportBottom: number;
};

const readLayoutMetrics = async (page: Page): Promise<LayoutMetrics> =>
  page.evaluate(() => {
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
      clientWidth: root.clientWidth,
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
      scrollWidth: root.scrollWidth,
      viewportBottom: window.innerHeight,
    };
  });

const expectConstrainedLayout = (metrics: LayoutMetrics): void => {
  expect.soft(metrics.scrollTop).toBe(0);
  expect.soft(metrics.scrollLeft).toBe(0);
  expect.soft(metrics.scrollHeight).toBe(metrics.clientHeight);
  expect.soft(metrics.scrollWidth).toBe(metrics.clientWidth);
  expect.soft(Math.abs(metrics.rootTop - metrics.headerBottom)).toBeLessThanOrEqual(0.5);
  expect.soft(Math.abs(metrics.paneTop - metrics.headerBottom)).toBeLessThanOrEqual(0.5);
  expect.soft(Math.abs(metrics.paneBottom - metrics.rootBottom)).toBeLessThanOrEqual(0.5);
  expect.soft(Math.abs(metrics.viewportBottom - metrics.rootBottom - 8)).toBeLessThanOrEqual(0.5);
  expect.soft(Math.abs(metrics.sashTop - metrics.rootTop)).toBeLessThanOrEqual(0.5);
  expect.soft(Math.abs(metrics.sashBottom - metrics.rootBottom)).toBeLessThanOrEqual(0.5);
  expect.soft(Math.abs(metrics.sashLeft - metrics.rootLeft)).toBeLessThanOrEqual(0.5);
  expect.soft(Math.abs(metrics.sashRight - metrics.rootRight)).toBeLessThanOrEqual(0.5);
};

test('focusing the chat composer cannot scroll the desktop editor beneath the header', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/__e2e/project-navigation?singleProject');
  await expect(page).toHaveURL(/\/w\/[^/]+\/[^/]+$/u, { timeout: 60_000 });

  const composer = page.getByRole('textbox', { name: 'Ask Tau to build anything...' });
  const sidebarTrigger = page.locator('[data-slot="sidebar-trigger"]');
  await expect(page.getByTestId('cad-viewer-canvas-region').locator('canvas').first()).toBeVisible({ timeout: 60_000 });
  await expect(composer).toBeVisible({ timeout: 60_000 });
  await expect(sidebarTrigger).toBeVisible();

  const beforeFocus = await readLayoutMetrics(page);
  await composer.focus();
  await expect(composer).toBeFocused();
  const afterFocus = await readLayoutMetrics(page);

  const sidebarWasOpen = (await sidebarTrigger.getAttribute('data-open')) === 'true';
  await sidebarTrigger.click();
  await expect(sidebarTrigger).toHaveAttribute('data-open', String(!sidebarWasOpen));
  await composer.focus();
  await expect(composer).toBeFocused();
  await expect
    .poll(async () => {
      const metrics = await readLayoutMetrics(page);
      return {
        horizontalOverflow: metrics.scrollWidth - metrics.clientWidth,
        verticalOverflow: metrics.scrollHeight - metrics.clientHeight,
      };
    })
    .toEqual({ horizontalOverflow: 0, verticalOverflow: 0 });
  const afterSidebarTransition = await readLayoutMetrics(page);

  expectConstrainedLayout(beforeFocus);
  expectConstrainedLayout(afterFocus);
  expectConstrainedLayout(afterSidebarTransition);
});
