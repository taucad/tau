import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

type SectionViewBridgeWindow = Window & {
  __TAU_SECTION_VIEW_TEST__?: {
    setSectionCuts(
      cuts: ReadonlyArray<{ kind: 'plane'; plane: 'xy' | 'xz' | 'yz'; offset: number; isFlipped: boolean }>,
    ): void;
    getSectionState(): { isCommitted: boolean };
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

    // Far enough back that both cuboids fit a viewer sharing the workbench with another pane.
    bridge.setCamera({
      position: [0, -0.26, 0.092],
      target: [0, 0, 0],
      fov: 38,
      zoom: 1,
    });
    // Removes the +X side; picking reads the cuts once the caps commit them.
    bridge.setSectionCuts([{ kind: 'plane', plane: 'yz', offset: 0, isFlipped: false }]);
  });
  await target.waitFor(
    () => (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__?.getSectionState().isCommitted,
    undefined,
    { timeout: 30_000 },
  );
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
