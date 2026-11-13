import { describe, expect, it } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

type Point = readonly [number, number, number];
type ProjectedPoint = { x: number; y: number; visible: boolean };
type RenderFrame = { anchorFrameId: string; originMeters: Point; metersPerRenderUnit: number };
type SectionCut =
  | { id: string; kind: 'plane'; plane: 'xy' | 'xz' | 'yz'; offset: number; isFlipped: boolean }
  | { id: string; kind: 'revolution'; axis: 'x' | 'y' | 'z'; start: number; sweep: number };

type SectionViewBridgeWindow = Window & {
  __TAU_SECTION_VIEW_TEST__?: {
    setSectionCuts(cuts: ReadonlyArray<{ kind: 'plane'; plane: 'xy' | 'xz' | 'yz' }>): string[];
    selectSectionCut(id: string | undefined): void;
    getSectionState(): { cuts: SectionCut[] };
    projectSectionHandle(kind: 'plane', cutId: string): ProjectedPoint | undefined;
    setCamera(camera: { position: Point; target?: Point; fov?: number; zoom?: number }): void;
    getRenderFrame(): RenderFrame;
    setRenderFrame(renderFrame: RenderFrame): void;
    projectWorldPoint(point: Point): ProjectedPoint;
  };
};

type SampleBox = Readonly<{ left: number; top: number; right: number; bottom: number }>;
/**
 * A picker sample: the XY tile's blue band and the ink of its label. The band's box is in sample pixels; the label ink
 * counts neutral pixels well darker than the tile's face inside the middle of that box.
 */
type PixelStats = Readonly<{
  sampledPixels: number;
  sampleSize: number;
  blueish: number;
  blueBox: SampleBox | undefined;
  labelInk: number;
}>;
type CanvasSampleRegion = Readonly<{ x: number; y: number; width: number; height: number }>;

const previewCanvasSelector = 'canvas[data-engine]';
const sectionControlFixtureRoute = (backend: 'webgl' | 'webgpu'): string =>
  `/__e2e/example-fixture?locator=jscad.cube-cylinder-section-fixture&graphicsBackend=${backend}`;
/** The fixture's bounds centre: a 50 mm cube standing on the XY plane. A plane's arrow stands on it. */
const fixtureCenter: Point = [0, 0, 0.025];

async function openSectionControlFixture(backend: 'webgl' | 'webgpu' = 'webgl'): Promise<void> {
  await target.setViewport({ width: 960, height: 720 });
  await target.navigate(sectionControlFixtureRoute(backend));
  await target.expectVisible(selectors.getByCss(previewCanvasSelector), 60_000);
  // The banner sits over the bar's centre and the view cube's corner.
  await target.expectPresentedGraphicsBackend(backend);
  await target.expectGeometryFramed();
}

async function waitForTwoAnimationFrames(): Promise<void> {
  await target.evaluate(
    async () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
}

async function readCuts(): Promise<SectionCut[]> {
  return target.evaluate(
    () => (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__!.getSectionState().cuts,
  );
}

async function readPlaneOffset(cutId: string): Promise<number | undefined> {
  const cuts = await readCuts();
  const cut = cuts.find(({ id }) => id === cutId);
  return cut?.kind === 'plane' ? cut.offset : undefined;
}

async function projectArrow(cutId: string): Promise<ProjectedPoint | undefined> {
  return target.evaluate(
    (id) =>
      (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__!.projectSectionHandle('plane', id),
    cutId,
  );
}

/** Cuts on `plane` through the bounds centre and selects the cut, so its push-pull arrow is drawn. */
async function selectPlaneCut(
  plane: 'xy' | 'yz',
  camera: { position: Point; target: Point; fov: number; zoom: number },
): Promise<string> {
  const cutId = await target.evaluate(
    ({ nextPlane, nextCamera }) => {
      const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
      if (!bridge) {
        throw new Error('Section view e2e bridge is not installed.');
      }
      bridge.setCamera(nextCamera);
      const [id] = bridge.setSectionCuts([{ kind: 'plane', plane: nextPlane }]);
      bridge.selectSectionCut(id);
      return id!;
    },
    { nextPlane: plane, nextCamera: camera },
  );
  // Section implementations load on first demand; animation frames do not prove the module mounted.
  await expect
    .poll(async () => {
      const arrow = await projectArrow(cutId);
      return arrow?.visible ?? false;
    })
    .toBe(true);
  await waitForTwoAnimationFrames();
  return cutId;
}

/** The arrow on screen, and a unit screen direction along the plane's normal from it. */
async function readArrow(
  cutId: string,
  normal: Point,
): Promise<{ handle: ProjectedPoint; unitX: number; unitY: number; offset: number }> {
  const offset = await readPlaneOffset(cutId);
  if (offset === undefined) {
    throw new Error(`Plane cut ${cutId} is missing.`);
  }
  const axisIndex = normal.indexOf(1);
  const ahead = fixtureCenter.map((value, index) => (index === axisIndex ? offset : value) + normal[index]! * 0.01);
  const handle = await projectArrow(cutId);
  const axisPoint = await target.evaluate(
    (point) => (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__!.projectWorldPoint(point),
    ahead as unknown as Point,
  );
  if (!handle?.visible) {
    throw new Error(`The arrow of ${cutId} is not on screen: ${JSON.stringify(handle)}`);
  }
  const directionX = axisPoint.x - handle.x;
  const directionY = axisPoint.y - handle.y;
  const length = Math.hypot(directionX, directionY);
  expect(length, 'the plane normal should not point at the camera').toBeGreaterThan(0);
  return { handle, unitX: directionX / length, unitY: directionY / length, offset };
}

async function samplePng(pngBase64: string, region: CanvasSampleRegion): Promise<PixelStats> {
  return target.evaluate(
    async ({ pngBase64, sampleRegion }) => {
      const sampleWidth = 160;
      const sampleHeight = 160;
      const image = new Image();
      const imageLoaded = new Promise<void>((resolve, reject) => {
        image.addEventListener('load', () => {
          resolve();
        });
        image.addEventListener('error', () => {
          reject(new Error('3D preview canvas screenshot could not be decoded.'));
        });
      });
      image.src = `data:image/png;base64,${pngBase64}`;
      await imageLoaded;

      const offscreen = document.createElement('canvas');
      offscreen.width = sampleWidth;
      offscreen.height = sampleHeight;
      const context = offscreen.getContext('2d');
      if (!context) {
        throw new Error('2D sampling context unavailable.');
      }

      context.drawImage(
        image,
        image.width * sampleRegion.x,
        image.height * sampleRegion.y,
        image.width * sampleRegion.width,
        image.height * sampleRegion.height,
        0,
        0,
        sampleWidth,
        sampleHeight,
      );

      const { data } = context.getImageData(0, 0, sampleWidth, sampleHeight);
      const pixel = (x: number, y: number): readonly [number, number, number] => {
        const index = (y * sampleWidth + x) * 4;
        return [data[index]!, data[index + 1]!, data[index + 2]!];
      };
      let blueish = 0;
      let blueBox: { left: number; top: number; right: number; bottom: number } | undefined;
      for (let y = 0; y < sampleHeight; y += 1) {
        for (let x = 0; x < sampleWidth; x += 1) {
          const [r, g, b] = pixel(x, y);
          if (b > 145 && b > r + 25 && b > g + 20) {
            blueish += 1;
            blueBox = {
              left: Math.min(blueBox?.left ?? x, x),
              top: Math.min(blueBox?.top ?? y, y),
              right: Math.max(blueBox?.right ?? x, x),
              bottom: Math.max(blueBox?.bottom ?? y, y),
            };
          }
        }
      }

      // The label is printed on the face in the cube's font: small, anti-aliased neutral ink on a light face.
      let labelInk = 0;
      if (blueBox) {
        const insetX = Math.round((blueBox.right - blueBox.left) / 5);
        const insetY = Math.round((blueBox.bottom - blueBox.top) / 5);
        for (let y = blueBox.top + insetY; y < blueBox.bottom - insetY; y += 1) {
          for (let x = blueBox.left + insetX; x < blueBox.right - insetX; x += 1) {
            const channels = pixel(x, y);
            labelInk += Number(Math.max(...channels) < 170 && Math.max(...channels) - Math.min(...channels) < 20);
          }
        }
      }

      return { sampledPixels: sampleWidth * sampleHeight, sampleSize: sampleWidth, blueish, blueBox, labelInk };
    },
    { pngBase64, sampleRegion: region },
  );
}

/**
 * The plane picker's square in page pixels, placed as `resolveSectionPlanePickerRect` places it: 11/12 of the view
 * cube's size, just left of the cube and centred on it vertically.
 */
async function readPickerSquare(): Promise<{
  canvas: Readonly<{ x: number; y: number; width: number; height: number }>;
  left: number;
  top: number;
  size: number;
}> {
  const canvasBox = await target.boundingBox(selectors.getByCss(previewCanvasSelector));
  const cubeBox = await target.boundingBox(selectors.getByCss('.viewport-gizmo-cube'));
  if (!canvasBox || !cubeBox) {
    throw new Error('The canvas or the view cube has no rendered box.');
  }
  const cubeSize = Math.min(cubeBox.width, cubeBox.height);
  const size = Math.round((cubeSize * 11) / 12);
  return { canvas: canvasBox, left: cubeBox.x + cubeSize / 24 - size, top: cubeBox.y + (cubeSize - size) / 2, size };
}

describe('Section view controls', () => {
  it('should keep React updates bounded during a sustained plane-arrow drag', async () => {
    await openSectionControlFixture('webgl');
    const cutId = await selectPlaneCut('xy', {
      position: [0.096, -0.11, 0.078],
      target: [0, 0, 0.025],
      fov: 36,
      zoom: 1.05,
    });
    const { handle, unitX, unitY, offset: startOffset } = await readArrow(cutId, [0, 0, 1]);
    const eventBaseline = await target.events();

    await target.mouseMove(handle.x, handle.y);
    await target.mouseDown();
    try {
      await target.mouseMove(handle.x + unitX * 28, handle.y + unitY * 28, { steps: 12 });
      await expect
        .poll(async () => (await readPlaneOffset(cutId)) ?? startOffset, {
          message: 'dragging the arrow along the normal should move the plane along it',
        })
        .toBeGreaterThan(startOffset);
      await target.mouseMove(handle.x - unitX * 28, handle.y - unitY * 28, { steps: 64 });
      await target.mouseMove(handle.x + unitX * 36, handle.y + unitY * 36, { steps: 64 });
    } finally {
      await target.mouseUp();
    }
    await target.delay(300);

    const events = await target.events();
    const updateDepthFailures = [
      ...events.pageErrors.slice(eventBaseline.pageErrors.length),
      ...events.consoleMessages
        .slice(eventBaseline.consoleMessages.length)
        .filter(({ type }) => type === 'error')
        .map(({ text }) => text),
    ].filter((message) => message.includes('Maximum update depth exceeded'));

    expect(updateDepthFailures, 'a sustained arrow drag should not recursively update React').toEqual([]);
    await target.expectVisible(selectors.getByCss(previewCanvasSelector));
  });

  for (const backend of ['webgl', 'webgpu'] as const) {
    it(`should keep plane-arrow drags physical across render-frame retargeting in ${backend}`, async () => {
      await openSectionControlFixture(backend);
      const cutId = await selectPlaneCut('yz', {
        position: [0.072, -0.088, 0.054],
        target: [0, 0, 0.025],
        fov: 42,
        zoom: 1.15,
      });
      const before = await readArrow(cutId, [1, 0, 0]);
      const dragPixels = 36;

      await target.mouseMove(before.handle.x, before.handle.y);
      await target.mouseDown();
      await target.mouseMove(before.handle.x + before.unitX * dragPixels, before.handle.y + before.unitY * dragPixels, {
        steps: 8,
      });
      await target.mouseUp();

      await expect
        .poll(async () => Math.abs(((await readPlaneOffset(cutId)) ?? before.offset) - before.offset))
        .toBeGreaterThan(1e-6);
      const dragged = await readArrow(cutId, [1, 0, 0]);
      expect(Math.abs(dragged.offset - before.offset), 'a short drag should move the plane a short way').toBeLessThan(
        0.05,
      );

      await target.evaluate(
        (origin) => {
          const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__!;
          const frame = bridge.getRenderFrame();
          bridge.setRenderFrame({
            anchorFrameId: frame.anchorFrameId,
            originMeters: origin,
            metersPerRenderUnit: frame.metersPerRenderUnit / 1000,
          });
        },
        [dragged.offset - 0.002, fixtureCenter[1] + 0.001, fixtureCenter[2]] as const,
      );
      await waitForTwoAnimationFrames();

      await expect
        .poll(
          async () => {
            const arrow = await projectArrow(cutId);
            return arrow?.visible === true && (await readPlaneOffset(cutId)) === dragged.offset;
          },
          {
            message: 'retargeting the render frame should keep the cut and redraw its arrow',
          },
        )
        .toBe(true);
      const retargeted = await projectArrow(cutId);
      expect(
        Math.hypot(retargeted!.x - dragged.handle.x, retargeted!.y - dragged.handle.y),
        'the arrow should stay where it was drawn after the render frame moves and rescales',
      ).toBeLessThanOrEqual(0.25);
    });
  }

  it('should edit cuts from their chips and the editor', async () => {
    await openSectionControlFixture('webgl');
    const toggle = selectors.getByRole('button', { name: 'Section view' });
    await target.click(toggle);
    await target.expectAttribute(toggle, 'aria-pressed', 'true');

    // The first cut is the XZ plane through the bounds centre, open in the editor.
    await target.expectAttribute(selectors.getByRole('button', { name: 'Plane XZ 0 mm' }), 'aria-expanded', 'true');
    await target.click(selectors.getByRole('radio', { name: 'XY' }));
    await target.expectVisible(selectors.getByRole('button', { name: 'Plane XY 25 mm' }));

    const offsetField = selectors.getByRole('spinbutton', { name: 'Offset in mm' });
    await target.fill(offsetField, '12');
    await target.press(offsetField, 'Enter');
    await target.expectVisible(selectors.getByRole('button', { name: 'Plane XY 12 mm' }));
    const [openCut] = await readCuts();
    const wasFlipped = openCut?.kind === 'plane' && openCut.isFlipped;
    const flip = selectors.getByRole('button', { name: 'Flip' });
    await target.click(flip);
    await target.expectAttribute(flip, 'aria-pressed', String(!wasFlipped));
    expect(await readCuts()).toMatchObject([{ kind: 'plane', plane: 'xy', offset: 0.012, isFlipped: !wasFlipped }]);

    await target.click(selectors.getByRole('button', { name: 'Add section' }));
    await target.click(selectors.getByRole('menuitem', { name: /Revolution cutaway/u }));
    // The new cut opens in the editor in place of the plane.
    await target.expectAttribute(
      selectors.getByRole('button', { name: 'Revolution cutaway 90° about Z' }),
      'aria-expanded',
      'true',
    );
    await target.expectVisible(selectors.getByRole('radiogroup', { name: 'Axis' }));
    await target.expectAttribute(selectors.getByRole('button', { name: 'Plane XY 12 mm' }), 'aria-expanded', 'false');
    expect(await readCuts()).toMatchObject([
      { kind: 'plane', plane: 'xy' },
      { kind: 'revolution', axis: 'z', sweep: 90 },
    ]);

    await target.click(selectors.getByRole('button', { name: 'Remove revolution cutaway 90° about Z' }));
    await target.expectCount(selectors.getByCss('[data-section-chip]'), 1);
    await target.click(selectors.getByRole('button', { name: 'Remove plane XY 12 mm' }));
    // Removing the last cut ends the section.
    await target.expectAttribute(toggle, 'aria-pressed', 'false');
    await target.expectCount(selectors.getByRole('group', { name: 'Section view options' }), 0);
  });

  for (const backend of ['webgl', 'webgpu'] as const) {
    it(`should draw the plane picker beside the view cube and add a plane from a tile in ${backend}`, async () => {
      await openSectionControlFixture(backend);
      // Straight down: the XY tile faces the camera in the middle of the picker, and the others stand edge on.
      await target.evaluate(() => {
        const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__!;
        bridge.setCamera({ position: [0, 0, 0.2], target: [0, 0, 0.025], fov: 38, zoom: 1 });
        bridge.setSectionCuts([{ kind: 'plane', plane: 'yz' }]);
      });
      await waitForTwoAnimationFrames();
      await target.delay(300);

      const square = await readPickerSquare();
      const png = await target.screenshot(
        selectors.getByCss(previewCanvasSelector),
        `section-plane-picker-top-${backend}.png`,
      );
      const stats = await samplePng(png, {
        x: (square.left - square.canvas.x) / square.canvas.width,
        y: (square.top - square.canvas.y) / square.canvas.height,
        width: square.size / square.canvas.width,
        height: square.size / square.canvas.height,
      });
      // Since 75bd18137f the tiles are flat in the cube's face tone, each edged by a band in its normal's muted axis
      // colour. Facing the camera, the XY tile's band is a square ring in the middle of the picker; the other two
      // stand edge on and draw no ring.
      const { blueBox, sampleSize } = stats;
      if (!blueBox) {
        throw new Error(`the XY tile should be drawn in the picker: ${JSON.stringify(stats)}`);
      }
      const bandWidth = blueBox.right - blueBox.left;
      const bandHeight = blueBox.bottom - blueBox.top;
      expect(bandWidth, `the XY tile should face the camera: ${JSON.stringify(stats)}`).toBeGreaterThan(
        sampleSize * 0.3,
      );
      expect(bandHeight, `the XY tile should face the camera: ${JSON.stringify(stats)}`).toBeGreaterThan(
        sampleSize * 0.3,
      );
      expect(
        Math.abs(bandWidth - bandHeight),
        `the XY tile should be square on: ${JSON.stringify(stats)}`,
      ).toBeLessThan(sampleSize * 0.05);
      expect(
        Math.hypot((blueBox.left + blueBox.right - sampleSize) / 2, (blueBox.top + blueBox.bottom - sampleSize) / 2),
        `the XY tile should sit in the middle of the picker: ${JSON.stringify(stats)}`,
      ).toBeLessThan(sampleSize * 0.05);
      expect(stats.labelInk, `the XY tile should carry its label: ${JSON.stringify(stats)}`).toBeGreaterThan(20);

      await target.mouseMove(square.left + square.size / 2, square.top + square.size / 2);
      await target.mouseDown();
      await target.mouseUp();
      await expect
        .poll(async () => {
          const cuts = await readCuts();
          return cuts.map((cut) => (cut.kind === 'plane' ? cut.plane : cut.axis));
        })
        .toEqual(['yz', 'xy']);
    });
  }
});
