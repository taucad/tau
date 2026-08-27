import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';

type ViewerContextMenuBridgeWindow = Window & {
  __TAU_SECTION_VIEW_TEST_BRIDGES__?: ViewerContextMenuBridge[];
  __TAU_SECTION_VIEW_TEST__?: {
    setCamera(camera: {
      position: readonly [number, number, number];
      target?: readonly [number, number, number];
      fov?: number;
      zoom?: number;
    }): void;
    projectWorldPoint(point: readonly [number, number, number]): { x: number; y: number; visible: boolean };
    getModelHoverState(): { activeUnitId: string | undefined; hoveredComponentId: string | undefined };
    getModelComponents(): Array<{ id: string; name: string }>;
    projectModelComponent(componentId: string): Array<{ x: number; y: number; visible: boolean }>;
  };
};

type ViewerContextMenuBridge = NonNullable<ViewerContextMenuBridgeWindow['__TAU_SECTION_VIEW_TEST__']> & {
  getRenderedModelComponentState(componentId: string): {
    meshCount: number;
    visibleMeshCount: number;
    materialOpacities: readonly number[];
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

async function dismissCookieBanner(): Promise<void> {
  const declineCookies = selectors.getByRole('button', { name: /^decline$/i });
  await target.click(declineCookies, { timeout: 5000 }).catch(() => undefined);
}

async function readMenuItemVisualState(locator: Locator): Promise<MenuItemVisualState> {
  return target.evaluateLocator(locator, (element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      color: style.color,
    };
  });
}

async function driveStableCamera(): Promise<void> {
  await target.evaluate(() => {
    const bridgeWindow = globalThis as unknown as ViewerContextMenuBridgeWindow;
    const bridges =
      bridgeWindow.__TAU_SECTION_VIEW_TEST_BRIDGES__ ??
      (bridgeWindow.__TAU_SECTION_VIEW_TEST__ ? [bridgeWindow.__TAU_SECTION_VIEW_TEST__] : []);
    if (bridges.length === 0) {
      throw new Error('Viewer context menu e2e bridge is not installed.');
    }
    for (const bridge of bridges) {
      bridge.setCamera({
        position: [44, -58, 34],
        target: [0, 0, 0],
        fov: 36,
        zoom: 1.2,
      });
    }
  });
}

async function projectWorldPoint(
  point: readonly [number, number, number],
  bridgeIndex?: number,
): Promise<{ x: number; y: number; visible: boolean }> {
  return target.evaluate(
    ({ nextPoint, nextBridgeIndex }) => {
      const bridgeWindow = globalThis as unknown as ViewerContextMenuBridgeWindow;
      const bridge =
        nextBridgeIndex === undefined
          ? bridgeWindow.__TAU_SECTION_VIEW_TEST__
          : bridgeWindow.__TAU_SECTION_VIEW_TEST_BRIDGES__?.[nextBridgeIndex];
      if (!bridge) {
        throw new Error('Viewer context menu e2e bridge is not installed.');
      }

      return bridge.projectWorldPoint(nextPoint);
    },
    { nextPoint: point, nextBridgeIndex: bridgeIndex },
  );
}

async function getHoveredComponentId(bridgeIndex?: number): Promise<string | undefined> {
  return target.evaluate(
    ({ nextBridgeIndex }: { nextBridgeIndex?: number }) => {
      const bridgeWindow = globalThis as unknown as ViewerContextMenuBridgeWindow;
      const bridge =
        nextBridgeIndex === undefined
          ? bridgeWindow.__TAU_SECTION_VIEW_TEST__
          : bridgeWindow.__TAU_SECTION_VIEW_TEST_BRIDGES__?.[nextBridgeIndex];
      if (!bridge) {
        throw new Error('Viewer context menu e2e bridge is not installed.');
      }

      return bridge.getModelHoverState().hoveredComponentId;
    },
    { nextBridgeIndex: bridgeIndex },
  );
}

async function waitForViewerBridge(): Promise<void> {
  await target.waitFor(
    () => ((globalThis as unknown as ViewerContextMenuBridgeWindow).__TAU_SECTION_VIEW_TEST_BRIDGES__?.length ?? 0) > 0,
  );
}

async function waitForViewerBridgeCount(count: number): Promise<void> {
  await target.waitFor(
    (expectedCount) =>
      (globalThis as unknown as ViewerContextMenuBridgeWindow).__TAU_SECTION_VIEW_TEST_BRIDGES__?.length ===
      expectedCount,
    count,
    { timeout: 60_000 },
  );
}

async function getBridgeSourcePath(bridgeIndex: number): Promise<string> {
  return target.evaluate((nextBridgeIndex) => {
    const unitId = (globalThis as unknown as ViewerContextMenuBridgeWindow).__TAU_SECTION_VIEW_TEST_BRIDGES__?.[
      nextBridgeIndex
    ]?.getModelHoverState().activeUnitId;
    if (!unitId?.startsWith('file:')) {
      throw new Error(`Viewer bridge ${nextBridgeIndex} is not bound to a source-file unit.`);
    }
    return unitId.slice('file:'.length);
  }, bridgeIndex);
}

async function readRenderedComponentStates(componentId: string) {
  return target.evaluate((nextComponentId) => {
    const bridges = (globalThis as unknown as ViewerContextMenuBridgeWindow).__TAU_SECTION_VIEW_TEST_BRIDGES__ ?? [];
    return bridges.map((bridge) => bridge.getRenderedModelComponentState(nextComponentId));
  }, componentId);
}

async function waitForSharedRenderedModel(): Promise<void> {
  await target.waitFor(
    () => {
      const bridges = (globalThis as unknown as ViewerContextMenuBridgeWindow).__TAU_SECTION_VIEW_TEST_BRIDGES__ ?? [];
      const componentIds = bridges[0]?.getModelComponents().map(({ id }) => id) ?? [];
      return (
        bridges.length === 2 &&
        componentIds.some((componentId) =>
          bridges.every((bridge) => bridge.getRenderedModelComponentState(componentId).visibleMeshCount > 0),
        )
      );
    },
    { timeout: 60_000 },
  );
}

async function hasHoverAtPoint(
  screenPoint: { readonly x: number; readonly y: number },
  bridgeIndex?: number,
  attempts = 20,
): Promise<boolean> {
  await target.mouseMove(screenPoint.x, screenPoint.y);

  for (let attempt = 0; attempt < attempts; attempt++) {
    // oxlint-disable-next-line no-await-in-loop -- Hover state updates only after the previous pointer move is processed.
    if ((await getHoveredComponentId(bridgeIndex)) !== undefined) {
      return true;
    }

    // oxlint-disable-next-line no-await-in-loop -- Polling the browser-side hover state at a tight deterministic cadence.
    await target.delay(100);
  }

  return false;
}

async function findComponentHitPoint(bridgeIndex?: number): Promise<{ x: number; y: number }> {
  let projectedComponentPoints: Array<{ x: number; y: number; visible: boolean }> = [];
  if (bridgeIndex !== undefined) {
    projectedComponentPoints = await target.evaluate((nextBridgeIndex) => {
      const bridge = (globalThis as unknown as ViewerContextMenuBridgeWindow).__TAU_SECTION_VIEW_TEST_BRIDGES__?.[
        nextBridgeIndex
      ];
      if (!bridge) {
        throw new Error(`Viewer bridge ${nextBridgeIndex} is not installed.`);
      }
      return bridge
        .getModelComponents()
        .flatMap(({ id }) => bridge.projectModelComponent(id))
        .filter((point) => point.visible);
    }, bridgeIndex);

    for (const screenPoint of projectedComponentPoints) {
      // oxlint-disable-next-line no-await-in-loop -- Each projected component must be verified against the live raycast.
      if (await hasHoverAtPoint(screenPoint, bridgeIndex, 3)) {
        return { x: screenPoint.x, y: screenPoint.y };
      }
    }
  }

  for (const candidate of componentHitCandidates) {
    // oxlint-disable-next-line no-await-in-loop -- Each candidate is projected and verified before trying the next one.
    const screenPoint = await projectWorldPoint(candidate, bridgeIndex);
    if (!screenPoint.visible) {
      continue;
    }

    // oxlint-disable-next-line no-await-in-loop -- Pointer hover has observable state; candidates must run sequentially.
    if (await hasHoverAtPoint(screenPoint, bridgeIndex)) {
      return { x: screenPoint.x, y: screenPoint.y };
    }
  }

  const canvasBounds = await target.evaluate(() =>
    [...document.querySelectorAll<HTMLCanvasElement>('[data-testid="cad-viewer-canvas-region"] canvas')].map(
      (canvas) => {
        const rect = canvas.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      },
    ),
  );
  throw new Error(
    `Unable to find a screen point that hovers a rendered model component: ${JSON.stringify({ bridgeIndex, projectedComponentPoints, canvasBounds })}`,
  );
}

async function openSeededProject(): Promise<void> {
  await target.setViewport({ width: 1280, height: 900 });
  await target.navigate(seedRoute);
  await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
  await dismissCookieBanner();
  await target.expectVisible(selectors.getByTestId('cad-viewer-canvas-region'), 60_000);
  await target.expectVisible(selectors.getByCss(canvasSelector), 60_000);
  await waitForViewerBridge();
  await driveStableCamera();
}

test.describe('Chat viewer model component context menu', () => {
  test('opens the shared model component action menu from a real viewer right-click', async () => {
    await openSeededProject();

    const hitPoint = await findComponentHitPoint();
    await target.mouseClick(hitPoint.x, hitPoint.y, { button: 'right' });

    const focusMenuItem = selectors.getByRole('menuitem', { name: /focus on part/i });
    const addToChatMenuItem = selectors.getByRole('menuitem', { name: /add to chat/i });
    await target.expectVisible(focusMenuItem, 15_000);
    await target.expectVisible(addToChatMenuItem);
    await target.expectVisible(selectors.getByRole('menuitem', { name: /^hide$/i }));
    await target.expectVisible(selectors.getByRole('menuitem', { name: /^isolate$/i }));
    await target.expectVisible(selectors.getByText('Opacity'));

    const initialFocusVisualState = await readMenuItemVisualState(focusMenuItem);
    await target.hover(addToChatMenuItem);
    await expect.poll(async () => readMenuItemVisualState(addToChatMenuItem)).toEqual(initialFocusVisualState);
    await expect
      .poll(async () => {
        const visualState = await readMenuItemVisualState(focusMenuItem);
        return visualState.backgroundColor;
      })
      .not.toBe(initialFocusVisualState.backgroundColor);

    await target.keyboardPress('Escape');
    await target.expectCount(focusMenuItem, 0);

    const rightDragPoint = await findComponentHitPoint();
    await target.mouseMove(rightDragPoint.x, rightDragPoint.y);
    await target.mouseDown({ button: 'right' });
    await target.mouseMove(rightDragPoint.x + 36, rightDragPoint.y - 24);
    await target.mouseUp({ button: 'right' });

    await target.expectCount(selectors.getByRole('menuitem', { name: /focus on part/i }), 0);

    const dragPoint = await findComponentHitPoint();
    await target.mouseMove(dragPoint.x, dragPoint.y);
    await target.mouseDown({ button: 'middle' });
    await target.mouseMove(dragPoint.x + 36, dragPoint.y - 24);
    await target.mouseUp({ button: 'middle' });

    await target.expectCount(selectors.getByRole('menuitem', { name: /focus on part/i }), 0);

    const canvasBox = await target.boundingBox(selectors.getByCss(canvasSelector));
    if (!canvasBox) {
      throw new Error('Expected viewer canvas to have a bounding box.');
    }
    await target.mouseClick(canvasBox.x + 20, canvasBox.y + 20, { button: 'right' });

    await target.expectCount(selectors.getByRole('menuitem', { name: /focus on part/i }), 0);
  });

  test('synchronizes hide, show all, opacity, and reset across same-file viewer panes', async () => {
    await openSeededProject();
    await waitForViewerBridgeCount(1);
    const sourcePath = await getBridgeSourcePath(0);

    await target.click(selectors.getByRole('button', { name: 'Split right' }).first());
    const matchingFile = selectors.getByCss(`[data-testid="viewer-empty-file-list"] button[title="${sourcePath}"]`);
    await target.expectVisible(matchingFile, 30_000);
    await target.click(matchingFile);
    await target.expectCount(selectors.getByTestId('cad-viewer-canvas-region'), 2, 60_000);
    await waitForViewerBridgeCount(2);
    await waitForSharedRenderedModel();
    await driveStableCamera();
    await target.delay(500);

    const firstHit = await findComponentHitPoint(1);
    const hiddenComponentId = await getHoveredComponentId(1);
    if (!hiddenComponentId) {
      throw new Error('Expected the first viewer to hover a component before opening its menu.');
    }
    const initialHiddenComponentStates = await readRenderedComponentStates(hiddenComponentId);
    expect(initialHiddenComponentStates).toHaveLength(2);
    expect(initialHiddenComponentStates.every((state) => state.visibleMeshCount > 0)).toBe(true);

    await target.mouseClick(firstHit.x, firstHit.y, { button: 'right' });
    const showAll = selectors.getByRole('menuitem', { name: 'Show all' });
    const resetOpacities = selectors.getByRole('menuitem', { name: 'Reset all opacities' });
    await target.expectVisible(showAll);
    expect(await target.getAttribute(showAll, 'disabled')).not.toBeNull();
    expect(await target.getAttribute(resetOpacities, 'disabled')).not.toBeNull();
    await target.click(selectors.getByRole('menuitem', { name: 'Hide' }));

    await expect
      .poll(async () => {
        const states = await readRenderedComponentStates(hiddenComponentId);
        return states.length === 2 && states.every((state) => state.meshCount > 0 && state.visibleMeshCount === 0);
      })
      .toBe(true);

    const visibleHit = await findComponentHitPoint(1);
    await target.mouseClick(visibleHit.x, visibleHit.y, { button: 'right' });
    expect(await target.getAttribute(showAll, 'disabled')).toBeNull();
    await target.click(showAll);
    await expect.poll(async () => readRenderedComponentStates(hiddenComponentId)).toEqual(initialHiddenComponentStates);

    const opacityHit = await findComponentHitPoint(1);
    const opacityComponentId = await getHoveredComponentId(1);
    if (!opacityComponentId) {
      throw new Error('Expected a component for the opacity recovery check.');
    }
    const initialOpacityStates = await readRenderedComponentStates(opacityComponentId);
    await target.mouseClick(opacityHit.x, opacityHit.y, { button: 'right' });
    const opacitySlider = selectors.getByRole('slider').last();
    await target.click(opacitySlider);
    await target.keyboardPress('ArrowLeft');
    await expect.poll(async () => Number(await target.getAttribute(opacitySlider, 'aria-valuenow')) < 100).toBe(true);
    await expect
      .poll(async () => {
        const states = await readRenderedComponentStates(opacityComponentId);
        return (
          states.length === 2 &&
          states.every(
            (state) => state.materialOpacities.length > 0 && state.materialOpacities.every((opacity) => opacity < 1),
          )
        );
      })
      .toBe(true);
    expect(await target.getAttribute(resetOpacities, 'disabled')).toBeNull();
    await target.click(resetOpacities);
    await expect.poll(async () => readRenderedComponentStates(opacityComponentId)).toEqual(initialOpacityStates);
  });
});
