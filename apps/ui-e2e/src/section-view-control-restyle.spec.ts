import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

type SectionViewBridgeWindow = Window & {
  __TAU_SECTION_VIEW_TEST__?: {
    showPlaneSelectors(): void;
    getSelectorLabels(): string[];
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
  };
};

type PixelStats = Readonly<{
  sampledPixels: number;
  distinctBuckets: number;
  whiteish: number;
  reddish: number;
  greenish: number;
  blueish: number;
  darkTextish: number;
  softTextEdge: number;
}>;

type CanvasSampleRegion = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

const previewCanvasSelector = '[role="img"][aria-label*="3D model preview" i] canvas';
const sectionControlFixtureRoute = (backend: 'webgl' | 'webgpu'): string =>
  `/examples/jscad_cube_cylinder_section_fixture?graphicsBackend=${backend}`;
const expectedFaceSelectorLabels = ['Back', 'Bottom', 'Front', 'Left', 'Right', 'Top'];

async function openSectionControlFixture(backend: 'webgl' | 'webgpu' = 'webgl'): Promise<void> {
  await target.setViewport({ width: 960, height: 720 });
  await target.navigate(sectionControlFixtureRoute(backend));
  await target.expectVisible(selectors.getByRole('img', { name: /3d model preview/i }), 60_000);
  await target.expectVisible(selectors.getByTestId('bbox-viewer'), 60_000);
  await target.waitFor(() => Boolean((globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__));
}

async function driveObliqueTransformControls(): Promise<void> {
  await target.evaluate(() => {
    const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Section view e2e bridge is not installed.');
    }

    bridge.setCamera({
      position: [72, -88, 54],
      target: [0, 0, 8],
      fov: 42,
      zoom: 1.15,
    });
    bridge.setSectionView({
      plane: 'yz',
      direction: 1,
      rotationRadians: [0, 0.44, 0],
      pivot: [0, 0, 8],
      translation: 0,
    });
  });
}

async function driveStackedPlaneSelectors(side: 'front' | 'reverse' = 'front'): Promise<void> {
  const position = side === 'front' ? ([5.2, -6.8, 4.8] as const) : ([-5.2, 6.8, -4.8] as const);

  await target.evaluate((nextPosition) => {
    const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Section view e2e bridge is not installed.');
    }

    bridge.setCamera({
      position: nextPosition,
      target: [0, 0, 0],
      fov: 38,
      zoom: 1.4,
    });
    bridge.showPlaneSelectors();
  }, position);
}

async function expectAllFaceSelectorLabelsMounted(): Promise<void> {
  await expect
    .poll(async () =>
      target.evaluate(() => {
        const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
        if (!bridge) {
          throw new Error('Section view e2e bridge is not installed.');
        }

        return bridge.getSelectorLabels().sort();
      }),
    )
    .toEqual(expectedFaceSelectorLabels);
}

async function captureSectionCanvas(fileName: string): Promise<string> {
  const canvas = selectors.getByCss(previewCanvasSelector);
  await target.expectVisible(canvas, 60_000);
  return target.screenshot(canvas, fileName);
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
      const histogram = new Map<number, number>();
      let whiteish = 0;
      let reddish = 0;
      let greenish = 0;
      let blueish = 0;
      let darkTextish = 0;
      let softTextEdge = 0;

      for (let index = 0; index < data.length; index += 4) {
        const r = data[index]!;
        const g = data[index + 1]!;
        const b = data[index + 2]!;
        const maxChannelDelta = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
        const bucket = Math.floor(r / 8) * 1024 + Math.floor(g / 8) * 32 + Math.floor(b / 8);
        histogram.set(bucket, (histogram.get(bucket) ?? 0) + 1);

        whiteish += Number(r > 222 && g > 222 && b > 222);
        reddish += Number(r > 145 && g < 135 && b < 135);
        greenish += Number(g > 135 && r < 135 && b < 145);
        blueish += Number(b > 145 && r < 155 && g < 190);
        darkTextish += Number(r < 65 && g < 65 && b < 65);
        softTextEdge += Number(
          r >= 65 && r <= 190 && g >= 65 && g <= 190 && b >= 65 && b <= 190 && maxChannelDelta < 18,
        );
      }

      return {
        sampledPixels: sampleWidth * sampleHeight,
        distinctBuckets: histogram.size,
        whiteish,
        reddish,
        greenish,
        blueish,
        darkTextish,
        softTextEdge,
      };
    },
    { pngBase64, sampleRegion: region },
  );
}

test.describe('Section view control restyle regressions', () => {
  test('renders solid bordered transform arrows without interior seam walls', async () => {
    await openSectionControlFixture();
    await driveObliqueTransformControls();
    await target.delay(900);

    const png = await captureSectionCanvas('section-control-transform-arrows-webgl.png');
    const stats = await samplePng(png, { x: 0.2, y: 0.2, width: 0.62, height: 0.65 });
    const borderPixels = stats.reddish + stats.greenish + stats.blueish;

    expect(stats.distinctBuckets, 'transform arrow view should contain varied rendered pixels').toBeGreaterThan(18);
    expect(stats.reddish, 'red transform arrow border should remain visible').toBeGreaterThan(40);
    expect(stats.greenish, 'green transform arrow border should remain visible').toBeGreaterThan(20);
    expect(stats.blueish, 'blue transform arrow border should remain visible').toBeGreaterThan(100);
    expect(borderPixels, 'axis-colored arrow borders should remain visible').toBeGreaterThan(160);
    expect(stats.whiteish, 'white arrow cores should remain visible after the bordered extrusion fix').toBeGreaterThan(
      18,
    );
    expect(
      stats.darkTextish,
      `solid transform arrows should not gain a dark hollow interior: ${JSON.stringify(stats)}`,
    ).toBeLessThan(borderPixels * 0.04);
  });

  for (const backend of ['webgl', 'webgpu'] as const) {
    test(`renders half-width bordered selector bodies with labels occluded by nearer selector bodies in ${backend}`, async ({
      skip,
    }) => {
      if (backend === 'webgpu') {
        const hasWebGpu = await target.evaluate(() => 'gpu' in navigator);
        skip(!hasWebGpu, 'WebGPU is not available in this browser runtime.');
      }

      await openSectionControlFixture(backend);
      await driveStackedPlaneSelectors();
      await target.delay(900);
      await expectAllFaceSelectorLabelsMounted();

      const png = await captureSectionCanvas(`section-control-plane-selectors-${backend}.png`);
      const stats = await samplePng(png, { x: 0.32, y: 0.26, width: 0.38, height: 0.44 });
      const borderPixels = stats.reddish + stats.greenish + stats.blueish;

      expect(stats.distinctBuckets, 'selector stack view should contain varied rendered pixels').toBeGreaterThan(20);
      expect(borderPixels, 'selector colored borders should remain visible').toBeGreaterThan(160);
      expect(
        stats.whiteish,
        `white selector cores should dominate half-width borders: ${JSON.stringify(stats)}`,
      ).toBeGreaterThan(borderPixels * 1.15);
      expect(stats.darkTextish, 'multiple visible selector labels should remain readable').toBeGreaterThan(45);
      expect(
        stats.softTextEdge,
        `selector labels should preserve blended antialias edge pixels: ${JSON.stringify(stats)}`,
      ).toBeGreaterThan(35);
      expect(
        stats.softTextEdge,
        `selector labels should not collapse into hard alpha-tested black cutouts: ${JSON.stringify(stats)}`,
      ).toBeGreaterThan(stats.darkTextish * 0.08);
      expect(
        stats.darkTextish,
        `hidden labels should not overdraw every stacked body: ${JSON.stringify(stats)}`,
      ).toBeLessThan(stats.whiteish * 0.24);

      await driveStackedPlaneSelectors('reverse');
      await target.delay(900);
      await expectAllFaceSelectorLabelsMounted();

      const reversePng = await captureSectionCanvas(`section-control-plane-selectors-reverse-${backend}.png`);
      const reverseStats = await samplePng(reversePng, { x: 0.32, y: 0.26, width: 0.38, height: 0.44 });
      expect(
        reverseStats.darkTextish,
        `reverse selector labels should be visible on the opposite selector caps: ${JSON.stringify(reverseStats)}`,
      ).toBeGreaterThan(45);
      expect(
        reverseStats.softTextEdge,
        `reverse selector labels should preserve blended antialias edges: ${JSON.stringify(reverseStats)}`,
      ).toBeGreaterThan(35);

      await target.evaluate(() => {
        const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
        if (!bridge) {
          throw new Error('Section view e2e bridge is not installed.');
        }

        bridge.setSectionView({ plane: 'xy', direction: 1, pivot: [0, 0, 0] });
      });
      await target.delay(300);
      await driveStackedPlaneSelectors();
      await target.delay(900);
      await expectAllFaceSelectorLabelsMounted();

      const afterChangePng = await captureSectionCanvas(`section-control-plane-selectors-after-change-${backend}.png`);
      const afterChangeStats = await samplePng(afterChangePng, { x: 0.32, y: 0.26, width: 0.38, height: 0.44 });
      expect(
        afterChangeStats.darkTextish,
        `selector labels should remain visible after selecting a plane and reopening selector choices: ${JSON.stringify(
          afterChangeStats,
        )}`,
      ).toBeGreaterThan(45);
      expect(
        afterChangeStats.softTextEdge,
        `selector labels should remain antialiased after selecting a plane and reopening selector choices: ${JSON.stringify(
          afterChangeStats,
        )}`,
      ).toBeGreaterThan(35);
    });
  }
});
