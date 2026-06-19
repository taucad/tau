import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from '@playwright/test';

type SectionViewBridgeWindow = Window & {
  __TAU_SECTION_VIEW_TEST__?: {
    setSectionView(state: {
      plane: 'xy' | 'xz' | 'yz';
      direction?: 1 | -1;
      rotationRadians?: readonly [number, number, number];
      pivot?: readonly [number, number, number];
      translation?: number;
    }): void;
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

const previewCanvasSelector = '[role="img"][aria-label*="3D model preview" i] canvas';
const sectionPickingFixtureRoute = '/projects/jscad_section_picking_fixture/preview?graphicsBackend=webgl';

async function openSectionPickingFixture(page: Page): Promise<void> {
  await page.setViewportSize({ width: 960, height: 720 });
  await page.goto(sectionPickingFixtureRoute);
  await expect(page.getByRole('img', { name: /3d model preview/i })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('bbox-viewer')).toBeVisible({ timeout: 60_000 });
  const declineCookies = page.getByRole('button', { name: /^decline$/i });
  if (await declineCookies.isVisible().catch(() => false)) {
    await declineCookies.click();
  }

  const parametersToggle = page.getByRole('button', { name: /^parameters$/i });
  if (await parametersToggle.isVisible().catch(() => false)) {
    await parametersToggle.click();
  }

  await page.waitForFunction(() =>
    Boolean((globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__),
  );
}

async function driveClippedPickingView(page: Page): Promise<void> {
  await page.evaluate(() => {
    const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Section view e2e bridge is not installed.');
    }

    bridge.setCamera({
      position: [0, -130, 46],
      target: [0, 0, 0],
      fov: 38,
      zoom: 1.2,
    });
    bridge.setSectionView({
      plane: 'yz',
      direction: 1,
      pivot: [0, 0, 0],
      translation: 0,
    });
  });
}

async function projectWorldPoint(
  page: Page,
  point: readonly [number, number, number],
): Promise<{ x: number; y: number; visible: boolean }> {
  return page.evaluate((nextPoint) => {
    const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Section view e2e bridge is not installed.');
    }

    return bridge.projectWorldPoint(nextPoint);
  }, point);
}

async function currentHoveredComponentId(page: Page): Promise<string | undefined> {
  return page.evaluate(() => {
    const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Section view e2e bridge is not installed.');
    }

    return bridge.getModelHoverState().hoveredComponentId;
  });
}

async function captureSectionPickingCanvas(page: Page, testInfo: TestInfo, fileName: string): Promise<void> {
  const canvas = page.locator(previewCanvasSelector);
  await expect(canvas).toBeVisible({ timeout: 60_000 });
  await canvas.screenshot({ animations: 'disabled', path: testInfo.outputPath(fileName) });
}

test.describe('Section view clipping-aware model picking', () => {
  test('does not hover a component whose hit is hidden by the active clipping plane', async ({ page }, testInfo) => {
    await openSectionPickingFixture(page);
    await driveClippedPickingView(page);
    await page.waitForTimeout(900);

    const visiblePoint = await projectWorldPoint(page, [-24, 0, 0]);
    expect(visiblePoint.visible, 'visible cuboid test point should be inside the camera frustum').toBe(true);
    await page.mouse.move(visiblePoint.x, visiblePoint.y);
    await expect
      .poll(async () => currentHoveredComponentId(page), {
        message: 'moving over the kept cuboid should hover a model component',
      })
      .toBeDefined();

    const clippedPoint = await projectWorldPoint(page, [24, 0, 0]);
    expect(clippedPoint.visible, 'clipped cuboid test point should be inside the camera frustum').toBe(true);
    await page.mouse.move(clippedPoint.x, clippedPoint.y);
    await expect
      .poll(async () => currentHoveredComponentId(page), {
        message: 'moving over the clipped cuboid should clear model hover',
      })
      .toBeUndefined();

    await captureSectionPickingCanvas(page, testInfo, 'section-view-clipped-picking-webgl.png');
  });
});
