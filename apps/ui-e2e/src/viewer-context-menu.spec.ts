import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

type ViewerContextMenuBridgeWindow = Window & {
  __TAU_SECTION_VIEW_TEST__?: {
    setCamera(camera: {
      position: readonly [number, number, number];
      target?: readonly [number, number, number];
      fov?: number;
      zoom?: number;
    }): void;
    projectWorldPoint(point: readonly [number, number, number]): { x: number; y: number; visible: boolean };
    getModelHoverState(): { activeUnitId: string | undefined; hoveredComponentId: string | undefined };
  };
};

const seedRoute = '/__e2e/viewer-context-menu';
const canvasSelector = '[data-testid="cad-viewer-canvas-region"] canvas';
const componentHitCandidates: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 0],
  [0, 0, 4],
  [-6, 0, 0],
  [6, 0, 0],
  [0, -5, 0],
  [0, 5, 0],
];

type MenuItemVisualState = {
  readonly backgroundColor: string;
  readonly color: string;
};

async function dismissCookieBanner(page: Page): Promise<void> {
  const declineCookies = page.getByRole('button', { name: /^decline$/i });
  await declineCookies.click({ timeout: 5000 }).catch(() => undefined);
}

async function readMenuItemVisualState(locator: Locator): Promise<MenuItemVisualState> {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      color: style.color,
    };
  });
}

async function driveStableCamera(page: Page): Promise<void> {
  await page.evaluate(() => {
    const bridge = (globalThis as unknown as ViewerContextMenuBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Viewer context menu e2e bridge is not installed.');
    }

    bridge.setCamera({
      position: [44, -58, 34],
      target: [0, 0, 0],
      fov: 36,
      zoom: 1.2,
    });
  });
}

async function projectWorldPoint(
  page: Page,
  point: readonly [number, number, number],
): Promise<{ x: number; y: number; visible: boolean }> {
  return page.evaluate((nextPoint) => {
    const bridge = (globalThis as unknown as ViewerContextMenuBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Viewer context menu e2e bridge is not installed.');
    }

    return bridge.projectWorldPoint(nextPoint);
  }, point);
}

async function getHoveredComponentId(page: Page): Promise<string | undefined> {
  return page.evaluate(() => {
    const bridge = (globalThis as unknown as ViewerContextMenuBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Viewer context menu e2e bridge is not installed.');
    }

    return bridge.getModelHoverState().hoveredComponentId;
  });
}

async function waitForViewerBridge(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    Boolean((globalThis as unknown as ViewerContextMenuBridgeWindow).__TAU_SECTION_VIEW_TEST__),
  );
}

async function hasHoverAtPoint(page: Page, screenPoint: { readonly x: number; readonly y: number }): Promise<boolean> {
  await page.mouse.move(screenPoint.x, screenPoint.y);

  for (let attempt = 0; attempt < 20; attempt++) {
    // oxlint-disable-next-line no-await-in-loop -- Hover state updates only after the previous pointer move is processed.
    if ((await getHoveredComponentId(page)) !== undefined) {
      return true;
    }

    // oxlint-disable-next-line no-await-in-loop -- Polling the browser-side hover state at a tight deterministic cadence.
    await page.waitForTimeout(100);
  }

  return false;
}

async function findComponentHitPoint(page: Page): Promise<{ x: number; y: number }> {
  for (const candidate of componentHitCandidates) {
    // oxlint-disable-next-line no-await-in-loop -- Each candidate is projected and verified before trying the next one.
    const screenPoint = await projectWorldPoint(page, candidate);
    if (!screenPoint.visible) {
      continue;
    }

    // oxlint-disable-next-line no-await-in-loop -- Pointer hover has observable state; candidates must run sequentially.
    if (await hasHoverAtPoint(page, screenPoint)) {
      return { x: screenPoint.x, y: screenPoint.y };
    }
  }

  throw new Error('Unable to find a screen point that hovers a rendered model component.');
}

async function openSeededProject(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(seedRoute);
  await expect(page).toHaveURL(/\/projects\/proj_/u, { timeout: 60_000 });
  await dismissCookieBanner(page);
  await expect(page.getByTestId('cad-viewer-canvas-region')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(canvasSelector)).toBeVisible({ timeout: 60_000 });
  await waitForViewerBridge(page);
  await driveStableCamera(page);
}

test.describe('Chat viewer model component context menu', () => {
  test('opens the shared model component action menu from a real viewer right-click', async ({ page }) => {
    await openSeededProject(page);

    const hitPoint = await findComponentHitPoint(page);
    await page.mouse.click(hitPoint.x, hitPoint.y, { button: 'right' });

    const focusMenuItem = page.getByRole('menuitem', { name: /focus on part/i });
    const addToChatMenuItem = page.getByRole('menuitem', { name: /add to chat/i });
    await expect(focusMenuItem).toBeVisible({ timeout: 15_000 });
    await expect(addToChatMenuItem).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /^hide$/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /^isolate$/i })).toBeVisible();
    await expect(page.getByText('Opacity')).toBeVisible();

    const initialFocusVisualState = await readMenuItemVisualState(focusMenuItem);
    await addToChatMenuItem.hover();
    await expect.poll(async () => readMenuItemVisualState(addToChatMenuItem)).toEqual(initialFocusVisualState);
    await expect
      .poll(async () => {
        const visualState = await readMenuItemVisualState(focusMenuItem);
        return visualState.backgroundColor;
      })
      .not.toBe(initialFocusVisualState.backgroundColor);

    await page.keyboard.press('Escape');
    await expect(focusMenuItem).toHaveCount(0);

    const rightDragPoint = await findComponentHitPoint(page);
    await page.mouse.move(rightDragPoint.x, rightDragPoint.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(rightDragPoint.x + 36, rightDragPoint.y - 24);
    await page.mouse.up({ button: 'right' });

    await expect(page.getByRole('menuitem', { name: /focus on part/i })).toHaveCount(0);

    const dragPoint = await findComponentHitPoint(page);
    await page.mouse.move(dragPoint.x, dragPoint.y);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(dragPoint.x + 36, dragPoint.y - 24);
    await page.mouse.up({ button: 'middle' });

    await expect(page.getByRole('menuitem', { name: /focus on part/i })).toHaveCount(0);

    const canvasBox = await page.locator(canvasSelector).boundingBox();
    if (!canvasBox) {
      throw new Error('Expected viewer canvas to have a bounding box.');
    }
    await page.mouse.click(canvasBox.x + 20, canvasBox.y + 20, { button: 'right' });

    await expect(page.getByRole('menuitem', { name: /focus on part/i })).toHaveCount(0);
  });
});
