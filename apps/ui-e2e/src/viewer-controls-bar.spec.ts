import { describe, expect, it } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import { dismissCookies } from '#support/chat-attachments.js';
import * as target from '#support/external-target.js';

type Point = readonly [number, number, number];
type Box = Readonly<{ left: number; top: number; right: number; bottom: number }>;
type SectionCut =
  | { id: string; kind: 'plane'; plane: 'xy' | 'xz' | 'yz'; offset: number; isFlipped: boolean }
  | { id: string; kind: 'revolution'; axis: 'x' | 'y' | 'z'; start: number; sweep: number };

type ViewerBridge = {
  getModelHoverState(): { activeUnitId: string | undefined };
  getSectionState(): {
    isActive: boolean;
    cuts: SectionCut[];
    selectedCutId: string | undefined;
    committedCuts: SectionCut[];
    isCommitted: boolean;
  };
  addSectionCut(cut: { kind: 'plane'; plane: 'xy' | 'xz' | 'yz' }): string | undefined;
  selectSectionCut(id: string | undefined): void;
  getSectionCapCompleteness():
    | { status: 'complete'; trueCutComponentCount: number; cappedTrueCutComponentCount: number }
    | { status: 'unsupported' | 'failed' }
    | undefined;
  getMeasureState(): { isMeasureActive: boolean; currentStart: Point | undefined };
  getViewSettings(): { enableGrid: boolean } | undefined;
  getCamera(): { requestedFov: number; projection: 'orthographic' | 'perspective' };
  setCamera(camera: { position: Point; target?: Point; fov?: number }): void;
  projectWorldPoint(point: Point): { x: number; y: number; visible: boolean };
};

type ViewerBridgeWindow = Window & {
  __TAU_SECTION_VIEW_TEST__?: ViewerBridge;
  __TAU_SECTION_VIEW_TEST_BRIDGES__?: ViewerBridge[];
};

type BarLayout = Readonly<{
  viewer: Box;
  /** The line above the bar, holding the issues card and the AR button. */
  line: Box;
  bar: Box;
  controls: Box;
  section: Box | undefined;
  measure: Box | undefined;
}>;

const fixtureRoute = '/__e2e/example-fixture?locator=jscad.section-picking-fixture&graphicsBackend=webgl';
/** The fixture: two 14 mm cubes centred at x = ±24 mm on the origin. Metres throughout. */
const leftCubeCenter: Point = [-0.024, 0, 0];
const rightCubeCenter: Point = [0.024, 0, 0];
/** On the left cube's top face, just inside its corner on the side a default XZ plane keeps. */
const leftCubeTopPoint: Point = [-0.0295, -0.0055, 0.007];

/** Calls a method of the newest viewer's e2e bridge in the page. */
async function callBridge<Name extends keyof ViewerBridge>(
  name: Name,
  ...parameters: Parameters<ViewerBridge[Name]>
): Promise<ReturnType<ViewerBridge[Name]>> {
  return target.evaluate(
    ({ method, values }) => {
      const bridge = (globalThis as unknown as ViewerBridgeWindow).__TAU_SECTION_VIEW_TEST__ as unknown as
        | Record<string, (...values: unknown[]) => unknown>
        | undefined;
      if (!bridge) {
        throw new Error('The viewer e2e bridge is not installed.');
      }
      // The command transport turns an undefined argument into null.
      return bridge[method]!(...values.map((value) => value ?? undefined));
    },
    { method: name, values: parameters as unknown[] },
  ) as Promise<ReturnType<ViewerBridge[Name]>>;
}

const viewer = (index = 0): Locator => selectors.getByTestId('chat-viewer-layout').nth(index);
const toolToggle = (name: 'Section view' | 'Measure', index = 0): Locator =>
  viewer(index).getByRole('button', { name, exact: true });

async function openFixture(): Promise<void> {
  await target.setViewport({ width: 1440, height: 900 });
  await target.navigate(fixtureRoute);
  await target.expectVisible(selectors.getByCss('canvas[data-engine]'), 60_000);
  // The banner sits over the bar's centre.
  await dismissCookies();
  await target.expectGeometryFramed();
}

/** Puts the pointer over a viewer's canvas and takes focus off any field, so a key goes to that viewer. */
async function hoverViewer(index = 0): Promise<void> {
  const box = await target.boundingBox(viewer(index).getByTestId('cad-viewer-canvas-region'));
  if (!box) {
    throw new Error(`Viewer ${index} has no canvas region.`);
  }
  await target.mouseMove(box.x + box.width / 2, box.y + box.height / 2);
  await target.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
}

async function readBarLayout(): Promise<BarLayout> {
  return target.evaluate(() => {
    const toBox = (element: unknown): Box | undefined => {
      if (!(element instanceof Element)) {
        return undefined;
      }
      const { left, top, right, bottom } = element.getBoundingClientRect();
      return { left, top, right, bottom };
    };
    const layout = document.querySelector('[data-testid="chat-viewer-layout"]');
    const bar = layout?.querySelector('[data-slot="viewer-controls"]');
    const viewerBox = toBox(layout);
    const line = toBox(bar?.previousElementSibling);
    const barBox = toBox(bar);
    const controls = toBox(bar?.querySelector('[role="group"][aria-label="Viewer controls"]'));
    if (!viewerBox || !line || !barBox || !controls) {
      throw new Error('The viewer bar is not rendered.');
    }
    return {
      viewer: viewerBox,
      line,
      bar: barBox,
      controls,
      section: toBox(bar?.querySelector('[data-tool-bar="section"]')),
      measure: toBox(bar?.querySelector('[data-tool-bar="measure"]')),
    };
  });
}

const centerX = (box: Box): number => (box.left + box.right) / 2;

/** The name of the tool row holding focus. */
async function readFocusedRow(): Promise<string | undefined> {
  return target.evaluate(
    () => document.activeElement?.closest('[data-tool-bar]')?.getAttribute('aria-label') ?? undefined,
  );
}

async function readPlanes(): Promise<string[]> {
  const { cuts } = await callBridge('getSectionState');
  return cuts.map((cut) => (cut.kind === 'plane' ? cut.plane : `about ${cut.axis}`));
}

async function readMeasurementStart(): Promise<Point | undefined> {
  const { currentStart } = await callBridge('getMeasureState');
  return currentStart;
}

async function readRequestedFov(): Promise<number> {
  const { requestedFov } = await callBridge('getCamera');
  return requestedFov;
}

async function isFixtureInView(): Promise<boolean> {
  const [left, right] = await Promise.all([
    callBridge('projectWorldPoint', leftCubeCenter),
    callBridge('projectWorldPoint', rightCubeCenter),
  ]);
  return left.visible && right.visible;
}

/** Straight down onto the left cube's top face. */
async function lookDownOnLeftCube(): Promise<void> {
  await callBridge('setCamera', { position: [-0.024, 0, 0.08], target: [-0.024, 0, 0], fov: 38 });
  await expect
    .poll(
      async () => {
        const { visible } = await callBridge('projectWorldPoint', leftCubeTopPoint);
        return visible;
      },
      { timeout: 5000 },
    )
    .toBe(true);
  // The camera eases to a new view; the measure spec waits the same.
  await target.delay(900);
}

async function clickWorldPoint(point: Point): Promise<void> {
  const projected = await callBridge('projectWorldPoint', point);
  expect(projected.visible, `${point.join(',')} should be in view`).toBe(true);
  await target.mouseMove(projected.x, projected.y);
  await target.delay(150);
  await target.mouseDown();
  await target.mouseUp();
}

describe('Viewer controls bar', () => {
  it('should centre the bar and grow its rows upward above the controls row', async () => {
    await openFixture();
    const idle = await readBarLayout();
    expect(Math.abs(centerX(idle.bar) - centerX(idle.viewer)), 'the bar should be centred').toBeLessThanOrEqual(1);
    expect(idle.line.bottom, 'the line above should end above the bar').toBeLessThanOrEqual(idle.bar.top);

    await target.click(toolToggle('Section view'));
    await target.click(toolToggle('Measure'));
    await target.expectVisible(selectors.getByRole('group', { name: 'Section view options' }));
    await target.expectVisible(selectors.getByRole('group', { name: 'Measuring options' }));
    const running = await readBarLayout();
    const { section, measure } = running;
    if (!section || !measure) {
      throw new Error(`Both tool rows should be in the bar: ${JSON.stringify(running)}`);
    }

    // The bar grows upward: its bottom and its controls row stay put.
    expect(running.bar.bottom).toBeCloseTo(idle.bar.bottom, 0);
    expect(running.controls.top).toBeCloseTo(idle.controls.top, 0);
    expect(running.bar.top).toBeLessThan(idle.bar.top);
    // Section's row, then Measure's, then the controls row, top to bottom and apart.
    expect(section.bottom).toBeLessThanOrEqual(measure.top);
    expect(measure.bottom).toBeLessThanOrEqual(running.controls.top);
    // The line above moves up by as much as the bar grew, and stays clear of it.
    expect(running.line.bottom).toBeLessThanOrEqual(running.bar.top);
    expect(idle.line.bottom - running.line.bottom).toBeCloseTo(idle.bar.top - running.bar.top, 0);
    expect(Math.abs(centerX(running.bar) - centerX(running.viewer))).toBeLessThanOrEqual(1);
  });

  it('should run Section and Measure together, focus each started row and unwind them with Escape', async () => {
    await openFixture();
    await lookDownOnLeftCube();

    await target.click(toolToggle('Section view'));
    await target.expectAttribute(toolToggle('Section view'), 'aria-pressed', 'true');
    await expect.poll(readFocusedRow).toBe('Section view options');
    await target.click(toolToggle('Measure'));
    await target.expectAttribute(toolToggle('Measure'), 'aria-pressed', 'true');
    await expect.poll(readFocusedRow).toBe('Measuring options');
    const { isActive } = await callBridge('getSectionState');
    expect(isActive, 'Section should keep running beside Measure').toBe(true);

    // A half-placed measurement. The open cut's handles would sit in the way of the click, so none is open.
    await callBridge('selectSectionCut', undefined);
    await clickWorldPoint(leftCubeTopPoint);
    await expect.poll(readMeasurementStart).toBeDefined();

    await target.keyboardPress('Escape');
    await expect.poll(readMeasurementStart).toBeUndefined();
    await target.expectAttribute(toolToggle('Measure'), 'aria-pressed', 'true');

    await target.keyboardPress('Escape');
    await target.expectAttribute(toolToggle('Measure'), 'aria-pressed', 'false');
    await target.expectAttribute(toolToggle('Section view'), 'aria-pressed', 'true');

    await target.keyboardPress('Escape');
    await target.expectAttribute(toolToggle('Section view'), 'aria-pressed', 'false');
    await target.expectCount(selectors.getByRole('group', { name: 'Section view options' }), 0);
  });

  it('should run the viewer shortcuts F, S, M, P, G, Escape and Delete', async () => {
    await openFixture();
    await hoverViewer();

    await target.keyboardPress('s');
    await target.expectAttribute(toolToggle('Section view'), 'aria-pressed', 'true');
    expect(await readPlanes(), 'S should start Section with its default plane').toEqual(['xz']);

    // Delete removes the selected cut and leaves the others.
    await callBridge('addSectionCut', { kind: 'plane', plane: 'xy' });
    await expect.poll(readPlanes).toEqual(['xz', 'xy']);
    await target.keyboardPress('Delete');
    await expect.poll(readPlanes).toEqual(['xz']);
    const { isActive } = await callBridge('getSectionState');
    expect(isActive).toBe(true);

    // M starts Measure beside Section; Escape stops Measure, then Section.
    await target.keyboardPress('m');
    await target.expectAttribute(toolToggle('Measure'), 'aria-pressed', 'true');
    await target.keyboardPress('Escape');
    await target.expectAttribute(toolToggle('Measure'), 'aria-pressed', 'false');
    await target.expectAttribute(toolToggle('Section view'), 'aria-pressed', 'true');
    await target.keyboardPress('Escape');
    await target.expectAttribute(toolToggle('Section view'), 'aria-pressed', 'false');

    // G hides the grid, then shows it again.
    const isGridEnabled = async (): Promise<boolean | undefined> => {
      const settings = await callBridge('getViewSettings');
      return settings?.enableGrid;
    };
    const wasGridEnabled = await isGridEnabled();
    expect(wasGridEnabled).toBeTypeOf('boolean');
    await target.keyboardPress('g');
    await expect.poll(isGridEnabled, { timeout: 5000 }).toBe(!wasGridEnabled);
    await target.keyboardPress('g');
    await expect.poll(isGridEnabled, { timeout: 5000 }).toBe(wasGridEnabled);

    // P switches to orthographic and back to the last perspective field of view.
    const { requestedFov } = await callBridge('getCamera');
    expect(requestedFov).toBeGreaterThan(0);
    await target.keyboardPress('p');
    await expect
      .poll(async () => callBridge('getCamera'), { timeout: 5000 })
      .toMatchObject({
        requestedFov: 0,
        projection: 'orthographic',
      });
    await target.keyboardPress('p');
    await expect
      .poll(async () => callBridge('getCamera'), { timeout: 5000 })
      .toMatchObject({
        requestedFov,
        projection: 'perspective',
      });

    // F brings the model back after a sideways pan has taken it out of view.
    await callBridge('setCamera', { position: [0.5, 0, 0.1], target: [0.5, 0, 0] });
    await expect.poll(isFixtureInView, { timeout: 5000 }).toBe(false);
    await target.keyboardPress('f');
    await expect.poll(isFixtureInView, { timeout: 10_000 }).toBe(true);
  });

  it('should send a key to the viewer under the pointer in split viewers', async () => {
    await openFixture();
    const { activeUnitId: unitId } = await callBridge('getModelHoverState');
    if (!unitId?.startsWith('file:')) {
      throw new Error(`The viewer is not bound to a source file: ${unitId}`);
    }
    await target.click(selectors.getByRole('button', { name: 'Split right' }).first());
    const sourceFile = selectors.getByCss(
      `[data-testid="viewer-empty-file-list"] button[title="${unitId.slice('file:'.length)}"]`,
    );
    await target.expectVisible(sourceFile, 30_000);
    await target.click(sourceFile);
    await target.expectCount(selectors.getByTestId('chat-viewer-layout'), 2, 60_000);
    await target.waitFor(
      () => (globalThis as unknown as ViewerBridgeWindow).__TAU_SECTION_VIEW_TEST_BRIDGES__?.length === 2,
      undefined,
      { timeout: 60_000 },
    );
    await target.expectGeometryFramed();

    await hoverViewer(1);
    await target.keyboardPress('s');
    await target.expectAttribute(toolToggle('Section view', 1), 'aria-pressed', 'true');
    await target.expectAttribute(toolToggle('Section view', 0), 'aria-pressed', 'false');

    await hoverViewer(0);
    await target.keyboardPress('s');
    await target.expectAttribute(toolToggle('Section view', 0), 'aria-pressed', 'true');

    await hoverViewer(1);
    await target.keyboardPress('Escape');
    await target.expectAttribute(toolToggle('Section view', 1), 'aria-pressed', 'false');
    await target.expectAttribute(toolToggle('Section view', 0), 'aria-pressed', 'true');
  });

  it('should show a chip for each of two cuts and cap them', async () => {
    await openFixture();
    await target.click(toolToggle('Section view'));
    const sections = selectors.getByRole('group', { name: 'Sections' });
    await target.click(sections.getByRole('button', { name: 'Add section' }));
    await target.click(selectors.getByRole('menuitem', { name: 'XY plane' }));

    await target.expectCount(sections.getByRole('button', { name: /^Plane / }), 2);
    await target.expectVisible(sections.getByRole('button', { name: /^Plane XZ /, expanded: false }));
    await target.expectVisible(sections.getByRole('button', { name: /^Plane XY /, expanded: true }));

    await expect
      .poll(
        async () => {
          const { isCommitted, committedCuts } = await callBridge('getSectionState');
          return isCommitted ? committedCuts.length : 0;
        },
        { timeout: 30_000, message: 'both cuts should reach the caps' },
      )
      .toBe(2);
    await expect
      .poll(
        async () => {
          const completeness = await callBridge('getSectionCapCompleteness');
          return completeness?.status;
        },
        { timeout: 30_000 },
      )
      .toBe('complete');
    const completeness = await callBridge('getSectionCapCompleteness');
    if (completeness?.status !== 'complete') {
      throw new Error(`The caps are incomplete: ${JSON.stringify(completeness)}`);
    }
    expect(completeness.trueCutComponentCount).toBeGreaterThan(0);
    expect(completeness.cappedTrueCutComponentCount).toBe(completeness.trueCutComponentCount);
  });

  it('should set the field of view from Viewer settings', async () => {
    await openFixture();
    const { requestedFov } = await callBridge('getCamera');
    await target.click(selectors.getByRole('button', { name: 'Viewer settings' }));
    const row = selectors.getByRole('menuitem', { name: /^Field of view, 0° is orthographic, / });
    await target.expectVisible(row);
    await target.focus(row);

    await target.keyboardPress('ArrowRight');
    await expect.poll(readRequestedFov).toBe(requestedFov + 1);
    await target.expectAttribute(row, 'aria-label', `Field of view, 0° is orthographic, ${requestedFov + 1}°`);
    await target.keyboardPress('Shift+ArrowLeft');
    await expect.poll(readRequestedFov).toBe(requestedFov - 4);

    // Enter types in the field; 0° is orthographic.
    await target.keyboardPress('Enter');
    await target.keyboardPress('0');
    await target.keyboardPress('Enter');
    await expect
      .poll(async () => callBridge('getCamera'), { timeout: 5000 })
      .toMatchObject({
        requestedFov: 0,
        projection: 'orthographic',
      });
    await target.expectAttribute(row, 'aria-label', 'Field of view, 0° is orthographic, 0°');
  });
});
