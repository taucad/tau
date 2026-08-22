import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';

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
  point: readonly [number, number, number],
): Promise<{ x: number; y: number; visible: boolean }> {
  return target.evaluate((nextPoint) => {
    const bridge = (globalThis as unknown as ViewerContextMenuBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Viewer context menu e2e bridge is not installed.');
    }

    return bridge.projectWorldPoint(nextPoint);
  }, point);
}

async function getHoveredComponentId(): Promise<string | undefined> {
  return target.evaluate(() => {
    const bridge = (globalThis as unknown as ViewerContextMenuBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Viewer context menu e2e bridge is not installed.');
    }

    return bridge.getModelHoverState().hoveredComponentId;
  });
}

async function waitForViewerBridge(): Promise<void> {
  await target.waitFor(() =>
    Boolean((globalThis as unknown as ViewerContextMenuBridgeWindow).__TAU_SECTION_VIEW_TEST__),
  );
}

async function hasHoverAtPoint(screenPoint: { readonly x: number; readonly y: number }): Promise<boolean> {
  await target.mouseMove(screenPoint.x, screenPoint.y);

  for (let attempt = 0; attempt < 20; attempt++) {
    // oxlint-disable-next-line no-await-in-loop -- Hover state updates only after the previous pointer move is processed.
    if ((await getHoveredComponentId()) !== undefined) {
      return true;
    }

    // oxlint-disable-next-line no-await-in-loop -- Polling the browser-side hover state at a tight deterministic cadence.
    await target.delay(100);
  }

  return false;
}

async function findComponentHitPoint(): Promise<{ x: number; y: number }> {
  for (const candidate of componentHitCandidates) {
    // oxlint-disable-next-line no-await-in-loop -- Each candidate is projected and verified before trying the next one.
    const screenPoint = await projectWorldPoint(candidate);
    if (!screenPoint.visible) {
      continue;
    }

    // oxlint-disable-next-line no-await-in-loop -- Pointer hover has observable state; candidates must run sequentially.
    if (await hasHoverAtPoint(screenPoint)) {
      return { x: screenPoint.x, y: screenPoint.y };
    }
  }

  throw new Error('Unable to find a screen point that hovers a rendered model component.');
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
});
