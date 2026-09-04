import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

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
    getRenderFrame(): { metersPerRenderUnit: number };
  };
};

const previewCanvasSelector = 'canvas[data-engine]';
const sectionPickingFixtureRoute = '/__e2e/example-fixture?locator=jscad.section-picking-fixture&graphicsBackend=webgl';

async function openSectionPickingFixture(): Promise<void> {
  await target.setViewport({ width: 1440, height: 900 });
  await target.navigate(sectionPickingFixtureRoute);
  await target.expectVisible(selectors.getByCss(previewCanvasSelector), 60_000);
  const declineCookies = selectors.getByRole('button', { name: /^decline$/i });
  if (await target.isVisible(declineCookies).catch(() => false)) {
    await target.click(declineCookies);
  }

  const closeParameters = selectors.getByRole('button', { name: /^close parameters$/i });
  const closeParametersResult = await target.read(closeParameters).catch(() => ({ count: 0 }));
  if (closeParametersResult.count > 0) {
    await target.click(closeParameters, { force: true });
  }

  await target.expectGeometryFramed();
}

async function driveClippedPickingView(): Promise<void> {
  await target.evaluate(() => {
    const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Section view e2e bridge is not installed.');
    }

    bridge.setCamera({
      position: [0, -0.13, 0.046],
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
  point: readonly [number, number, number],
): Promise<{ x: number; y: number; visible: boolean }> {
  return target.evaluate((nextPoint) => {
    const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Section view e2e bridge is not installed.');
    }

    return bridge.projectWorldPoint(nextPoint);
  }, point);
}

async function currentHoveredComponentId(): Promise<string | undefined> {
  return target.evaluate(() => {
    const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Section view e2e bridge is not installed.');
    }

    return bridge.getModelHoverState().hoveredComponentId;
  });
}

async function captureSectionPickingCanvas(fileName: string): Promise<void> {
  const canvas = selectors.getByCss(previewCanvasSelector);
  await target.expectVisible(canvas, 60_000);
  await target.screenshot(canvas, fileName);
}

test.describe('Section view clipping-aware model picking', () => {
  test('does not hover a component whose hit is hidden by the active clipping plane', async () => {
    await openSectionPickingFixture();
    await driveClippedPickingView();
    await target.delay(900);

    const visiblePoint = await projectWorldPoint([-0.024, 0, 0.005]);
    expect(visiblePoint.visible, 'visible cuboid test point should be inside the camera frustum').toBe(true);
    await target.mouseMove(visiblePoint.x, visiblePoint.y);
    await expect
      .poll(async () => currentHoveredComponentId(), {
        message: 'moving over the kept cuboid should hover a model component',
      })
      .toBeDefined();

    const clippedPoint = await projectWorldPoint([0.024, 0, 0.005]);
    expect(clippedPoint.visible, 'clipped cuboid test point should be inside the camera frustum').toBe(true);
    await target.mouseMove(clippedPoint.x, clippedPoint.y);
    await expect
      .poll(async () => currentHoveredComponentId(), {
        message: 'moving over the clipped cuboid should clear model hover',
      })
      .toBeUndefined();

    await captureSectionPickingCanvas('section-view-clipped-picking-webgl.png');
  });
});
