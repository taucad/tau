import type { ConsoleMessage, Page, TestInfo } from '@playwright/test';
import { test, expect } from '@playwright/test';

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
    getSectionHelperSummary(): {
      sectionHelperMeshCount: number;
      sectionHelperLineSegments2Count: number;
      sectionHelperContourSegmentCount: number;
      sectionHelperMaterialStates: ReadonlyArray<{
        objectType: string;
        materialType: string;
        renderOrder: number;
        transparent: boolean;
        depthTest: boolean;
        depthWrite: boolean;
      }>;
    };
    getSectionCapPerformanceDiagnostics?():
      | {
          latestFrame: {
            baseCapTopologyKey?: string;
            baseCapFrameTopologyKey?: string;
            baseCapIsCurrent?: boolean;
            exactDiagnosticIsCurrent?: boolean;
            pendingReason?: string;
            counters: Record<string, number>;
          };
        }
      | undefined;
  };
};

const webgpuValidationPatterns: readonly RegExp[] = [
  /Vertex buffer slot \d+ required/,
  /Invalid CommandBuffer/,
  /depth-stencil format mismatch/,
];

function attachWebGpuValidationListener(page: Page): {
  failuresRef: { lines: string[] };
  detach(): void;
} {
  const failuresRef: { lines: string[] } = { lines: [] };

  const listener = (message: ConsoleMessage): void => {
    const text = message.text();
    for (const pattern of webgpuValidationPatterns) {
      if (pattern.test(text)) {
        failuresRef.lines.push(`[${message.type()}] ${text}`);
        break;
      }
    }
  };

  page.on('console', listener);

  return {
    failuresRef,
    detach: () => {
      page.off('console', listener);
    },
  };
}

async function driveSectionView(page: Page, rotationY: number): Promise<void> {
  await page.evaluate((nextRotationY) => {
    const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Section view e2e bridge is not installed.');
    }

    bridge.setCamera({
      position: [72, -88, 58],
      target: [0, 0, 0],
      fov: 42,
      zoom: 1,
    });
    bridge.setSectionView({
      plane: 'yz',
      direction: 1,
      rotationRadians: [0, nextRotationY, 0],
      pivot: [0, 0, 0],
    });
  }, rotationY);
}

async function sampleSectionCanvas(page: Page): Promise<{
  distinctBuckets: number;
  dominantRatio: number;
  yellowish: number;
  blueish: number;
  reddish: number;
  greenish: number;
  beigeish: number;
  whiteish: number;
  gridLineish: number;
  edgeLineish: number;
}> {
  return sampleSectionCanvasRegion(page, { x: 0, y: 0, width: 1, height: 1 });
}

type CanvasSampleRegion = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

async function sampleSectionCanvasRegion(
  page: Page,
  region: CanvasSampleRegion,
): Promise<{
  distinctBuckets: number;
  dominantRatio: number;
  yellowish: number;
  blueish: number;
  reddish: number;
  greenish: number;
  beigeish: number;
  whiteish: number;
  gridLineish: number;
  edgeLineish: number;
}> {
  const canvas = page.locator('[role="img"][aria-label*="3D model preview" i] canvas');
  await expect(canvas).toBeVisible({ timeout: 60_000 });
  const screenshot = await canvas.screenshot({ animations: 'disabled' });

  return page.evaluate(
    async ({ pngBase64, region: sampleRegion }) => {
      const sampleWidth = 96;
      const sampleHeight = 96;
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
      let yellowish = 0;
      let blueish = 0;
      let reddish = 0;
      let greenish = 0;
      let beigeish = 0;
      let whiteish = 0;
      let gridLineish = 0;
      let edgeLineish = 0;

      for (let index = 0; index < data.length; index += 4) {
        const r = data[index]!;
        const g = data[index + 1]!;
        const b = data[index + 2]!;
        const channelMax = Math.max(r, g, b);
        const channelMin = Math.min(r, g, b);
        const bucket = Math.floor(r / 8) * 1024 + Math.floor(g / 8) * 32 + Math.floor(b / 8);
        histogram.set(bucket, (histogram.get(bucket) ?? 0) + 1);

        if (r > 145 && g > 105 && b < 105) {
          yellowish++;
        }

        if (b > 120 && r < 130 && g > 70) {
          blueish++;
        }

        if (r > 145 && g < 115 && b < 115) {
          reddish++;
        }

        if (g > 120 && r < 125 && b < 125) {
          greenish++;
        }

        if (r > 105 && g > 90 && b > 70 && r > b && g > b && Math.abs(r - g) < 55) {
          beigeish++;
        }

        if (r > 245 && g > 245 && b > 245) {
          whiteish++;
        }

        if (channelMax - channelMin < 18 && r >= 145 && r <= 238 && g >= 145 && g <= 238 && b >= 145 && b <= 238) {
          gridLineish++;
        }

        if (channelMax - channelMin < 24 && channelMax <= 150) {
          edgeLineish++;
        }
      }

      let dominantWeight = 0;
      for (const weight of histogram.values()) {
        dominantWeight = Math.max(dominantWeight, weight);
      }

      return {
        distinctBuckets: histogram.size,
        dominantRatio: dominantWeight / (sampleWidth * sampleHeight),
        yellowish,
        blueish,
        reddish,
        greenish,
        beigeish,
        whiteish,
        gridLineish,
        edgeLineish,
      };
    },
    { pngBase64: screenshot.toString('base64'), region },
  );
}

async function getSectionHelperSummary(page: Page): Promise<{
  sectionHelperMeshCount: number;
  sectionHelperLineSegments2Count: number;
  sectionHelperContourSegmentCount: number;
  sectionHelperMaterialStates: ReadonlyArray<{
    objectType: string;
    materialType: string;
    renderOrder: number;
    transparent: boolean;
    depthTest: boolean;
    depthWrite: boolean;
  }>;
}> {
  return page.evaluate(() => {
    const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Section view e2e bridge is not installed.');
    }

    return bridge.getSectionHelperSummary();
  });
}

async function getSectionCapPerformanceDiagnostics(page: Page): Promise<
  | {
      latestFrame: {
        baseCapTopologyKey?: string;
        baseCapFrameTopologyKey?: string;
        baseCapIsCurrent?: boolean;
        exactDiagnosticIsCurrent?: boolean;
        pendingReason?: string;
        counters: Record<string, number>;
      };
    }
  | undefined
> {
  return page.evaluate(() => {
    const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Section view e2e bridge is not installed.');
    }

    return bridge.getSectionCapPerformanceDiagnostics?.();
  });
}

async function expectClosedSectionCapIntegrity(
  page: Page,
  backend: 'webgl' | 'webgpu',
  rotationY: number,
): Promise<void> {
  await driveSectionView(page, rotationY);
  await page.waitForTimeout(750);
  const stats = await sampleSectionCanvas(page);
  const helperSummary = await getSectionHelperSummary(page);

  expect(
    stats.distinctBuckets,
    `rotationY=${rotationY}: section view should render varied pixels`,
  ).toBeGreaterThanOrEqual(12);
  expect(
    stats.dominantRatio,
    `rotationY=${rotationY}: frame should not collapse to one cap/background color`,
  ).toBeLessThan(0.96);
  expect(stats.yellowish, `rotationY=${rotationY}: yellow internal part should remain visible`).toBeGreaterThan(6);
  expect(stats.blueish, `rotationY=${rotationY}: blue holed housing cap should remain visible`).toBeGreaterThan(6);
  expect(stats.reddish, `rotationY=${rotationY}: red internal posts should remain visible`).toBeGreaterThan(2);
  expect(
    helperSummary.sectionHelperLineSegments2Count,
    `${backend}: section contour fills should render fat-line clipped-cap borders`,
  ).toBeGreaterThan(0);
  expect(
    helperSummary.sectionHelperContourSegmentCount,
    `${backend}: section contour fill borders should contain drawable segment endpoints`,
  ).toBeGreaterThan(0);
  expect(
    helperSummary.sectionHelperMaterialStates.some(
      (state) => state.objectType === 'LineSegments2' && !state.transparent && state.depthTest && !state.depthWrite,
    ),
    `${backend}: section contour outlines should use opaque, depth-tested, non-depth-writing material state`,
  ).toBe(true);
  expect(
    stats.edgeLineish,
    `rotationY=${rotationY}: generated cap outlines should remain visibly near-black in the composed frame`,
  ).toBeGreaterThan(20);
}

async function driveNonManifoldSectionView(page: Page): Promise<void> {
  await page.evaluate(() => {
    const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Section view e2e bridge is not installed.');
    }

    bridge.setCamera({
      position: [5, -7, 5],
      target: [0, 0, 0],
      fov: 38,
      zoom: 1.2,
    });
    bridge.setSectionView({
      plane: 'xy',
      direction: 1,
      rotationRadians: [0, 0, 0],
      pivot: [0, 0, 0],
      translation: 0,
    });
  });
}

async function driveCubeCylinderOverlayDepthSectionView(page: Page): Promise<void> {
  await page.evaluate(() => {
    const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Section view e2e bridge is not installed.');
    }

    bridge.setCamera({
      position: [88, -104, 44],
      target: [0, 0, 14],
      fov: 42,
      zoom: 1,
    });
    bridge.setSectionView({
      plane: 'yz',
      direction: 1,
      rotationRadians: [0, 0, 0],
      pivot: [0, 0, 25],
      translation: 0,
    });
  });
}

async function driveFlowerAttachmentSectionView(page: Page, translation = 0): Promise<void> {
  await page.evaluate((nextTranslation) => {
    const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Section view e2e bridge is not installed.');
    }

    bridge.setCamera({
      position: [54, -64, 28],
      target: [0, 0, 4],
      fov: 38,
      zoom: 1.18,
    });
    bridge.setSectionView({
      plane: 'yz',
      direction: 1,
      rotationRadians: [0, 0, 0],
      pivot: [0, 0, 3],
      translation: nextTranslation,
    });
  }, translation);
}

async function expectFlowerAttachmentContoursVisible(page: Page, backend: 'webgl' | 'webgpu'): Promise<void> {
  const stats = await sampleSectionCanvasRegion(page, { x: 0.16, y: 0.14, width: 0.68, height: 0.68 });
  const helperSummary = await getSectionHelperSummary(page);

  expect(
    stats.distinctBuckets,
    `${backend}: Flower section frame should contain varied geometry pixels`,
  ).toBeGreaterThan(12);
  expect(stats.reddish, `${backend}: Flower section cap/source red pixels should be visible`).toBeGreaterThan(120);
  expect(
    stats.edgeLineish,
    `${backend}: Flower generated contour outlines should survive final canvas composition`,
  ).toBeGreaterThan(45);
  expect(
    helperSummary.sectionHelperLineSegments2Count,
    `${backend}: Flower section should create contour outline line helpers`,
  ).toBeGreaterThan(0);
  expect(
    helperSummary.sectionHelperContourSegmentCount,
    `${backend}: Flower section outline helpers should contain drawable segments`,
  ).toBeGreaterThan(0);
}

async function expectOverlayAxesVisibleThroughClippedAwayRegion(
  page: Page,
  backend: 'webgl' | 'webgpu',
): Promise<void> {
  const stats = await sampleSectionCanvasRegion(page, { x: 0.42, y: 0.38, width: 0.18, height: 0.2 });
  const sampledPixels = 96 * 96;

  expect(
    stats.distinctBuckets,
    `${backend}: clipped-away region should retain visible overlay variation`,
  ).toBeGreaterThanOrEqual(4);
  expect(
    stats.reddish,
    `${backend}: red scene-axis pixels should remain visible in the clipped-away half`,
  ).toBeGreaterThan(3);
  expect(
    stats.blueish,
    `${backend}: blue scene-axis pixels should remain visible in the clipped-away half`,
  ).toBeGreaterThan(3);
  expect(
    stats.greenish,
    `${backend}: green scene-axis pixels should remain visible in the clipped-away half`,
  ).toBeGreaterThan(3);
  expect(
    stats.whiteish / sampledPixels,
    `${backend}: clipped-away region should not be a depth-owned white silhouette`,
  ).toBeLessThan(0.94);
}

async function captureSectionCanvas(page: Page, testInfo: TestInfo, fileName: string): Promise<void> {
  const canvas = page.locator('[role="img"][aria-label*="3D model preview" i] canvas');
  await expect(canvas).toBeVisible({ timeout: 60_000 });
  await canvas.screenshot({ animations: 'disabled', path: testInfo.outputPath(fileName) });
}

test.describe('Section view contour fill regression', () => {
  for (const backend of ['webgl', 'webgpu'] as const) {
    test(`keeps closed caps from bleeding over colored internals in ${backend}`, async ({ page }) => {
      if (backend === 'webgpu') {
        const hasWebGpu = await page.evaluate(() => 'gpu' in navigator);
        test.skip(!hasWebGpu, 'WebGPU is not available in this browser runtime.');
      }

      const listener = backend === 'webgpu' ? attachWebGpuValidationListener(page) : undefined;

      try {
        await page.goto(`/examples/jscad_section_cap_fixture?graphicsBackend=${backend}`);
        await expect(page.getByRole('img', { name: /3d model preview/i })).toBeVisible({ timeout: 60_000 });
        await expect(page.getByTestId('bbox-viewer')).toBeVisible({ timeout: 60_000 });
        await page.waitForFunction(() =>
          Boolean((globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__),
        );

        await expectClosedSectionCapIntegrity(page, backend, -1.47);
        await expectClosedSectionCapIntegrity(page, backend, -0.84);
        await expectClosedSectionCapIntegrity(page, backend, 0.42);

        expect(
          listener?.failuresRef.lines ?? [],
          `WebGPU validation errors leaked to the console:\n${listener?.failuresRef.lines.join('\n') ?? ''}`,
        ).toEqual([]);
      } finally {
        listener?.detach();
      }
    });
  }

  for (const backend of ['webgl', 'webgpu'] as const) {
    test(`keeps clipped-away cube-cylinder region transparent to overlay axes in ${backend}`, async ({
      page,
    }, testInfo) => {
      if (backend === 'webgpu') {
        const hasWebGpu = await page.evaluate(() => 'gpu' in navigator);
        test.skip(!hasWebGpu, 'WebGPU is not available in this browser runtime.');
      }

      const listener = backend === 'webgpu' ? attachWebGpuValidationListener(page) : undefined;

      try {
        await page.goto(`/examples/jscad_cube_cylinder_section_fixture?graphicsBackend=${backend}`);
        await expect(page.getByRole('img', { name: /3d model preview/i })).toBeVisible({ timeout: 60_000 });
        await expect(page.getByTestId('bbox-viewer')).toBeVisible({ timeout: 60_000 });
        await page.waitForFunction(() =>
          Boolean((globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__),
        );

        await page.waitForTimeout(500);
        await driveCubeCylinderOverlayDepthSectionView(page);
        await page.waitForTimeout(750);
        await captureSectionCanvas(page, testInfo, `cube-cylinder-overlay-depth-${backend}.png`);
        await expectOverlayAxesVisibleThroughClippedAwayRegion(page, backend);

        expect(
          listener?.failuresRef.lines ?? [],
          `WebGPU validation errors leaked to the console:\n${listener?.failuresRef.lines.join('\n') ?? ''}`,
        ).toEqual([]);
      } finally {
        listener?.detach();
      }
    });
  }

  for (const backend of ['webgl', 'webgpu'] as const) {
    test(`keeps Flower Attachment generated contour outlines visible in ${backend}`, async ({ page }, testInfo) => {
      if (backend === 'webgpu') {
        const hasWebGpu = await page.evaluate(() => 'gpu' in navigator);
        test.skip(!hasWebGpu, 'WebGPU is not available in this browser runtime.');
      }

      const listener = backend === 'webgpu' ? attachWebGpuValidationListener(page) : undefined;

      try {
        await page.goto(`/examples/proj_flower_attachment_section_outline_fixture?graphicsBackend=${backend}`);
        await expect(page.getByRole('img', { name: /3d model preview/i })).toBeVisible({ timeout: 60_000 });
        await expect(page.getByTestId('bbox-viewer')).toBeVisible({ timeout: 60_000 });
        await page.waitForFunction(() =>
          Boolean((globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__),
        );

        await driveFlowerAttachmentSectionView(page);
        await page.waitForTimeout(1000);
        await captureSectionCanvas(page, testInfo, `flower-attachment-section-outline-${backend}.png`);
        await expectFlowerAttachmentContoursVisible(page, backend);
        const firstDiagnostics = await getSectionCapPerformanceDiagnostics(page);
        expect(firstDiagnostics?.latestFrame.baseCapIsCurrent, `${backend}: Flower base cap should be current`).toBe(
          true,
        );
        expect(
          firstDiagnostics?.latestFrame.counters['baseFillVertexCount'] ?? 0,
          `${backend}: Flower base cap should publish fill vertices`,
        ).toBeGreaterThan(0);
        expect(
          firstDiagnostics?.latestFrame.counters['baseBoundarySegmentCount'] ?? 0,
          `${backend}: Flower base cap should publish sanitized boundary segments`,
        ).toBeGreaterThan(0);

        await driveFlowerAttachmentSectionView(page, 5);
        await page.waitForTimeout(250);
        await captureSectionCanvas(page, testInfo, `flower-attachment-section-outline-drag-${backend}.png`);
        await expectFlowerAttachmentContoursVisible(page, backend);
        const draggedDiagnostics = await getSectionCapPerformanceDiagnostics(page);
        expect(draggedDiagnostics?.latestFrame.baseCapIsCurrent, `${backend}: dragged base cap should be current`).toBe(
          true,
        );
        expect(
          draggedDiagnostics?.latestFrame.baseCapTopologyKey,
          `${backend}: dragging the clipping plane should update the base cap topology key`,
        ).not.toBe(firstDiagnostics?.latestFrame.baseCapTopologyKey);

        expect(
          listener?.failuresRef.lines ?? [],
          `WebGPU validation errors leaked to the console:\n${listener?.failuresRef.lines.join('\n') ?? ''}`,
        ).toEqual([]);
      } finally {
        listener?.detach();
      }
    });
  }

  for (const backend of ['webgl', 'webgpu'] as const) {
    test(`fills branched non-manifold section caps in ${backend}`, async ({ page }, testInfo) => {
      if (backend === 'webgpu') {
        const hasWebGpu = await page.evaluate(() => 'gpu' in navigator);
        test.skip(!hasWebGpu, 'WebGPU is not available in this browser runtime.');
      }

      const listener = backend === 'webgpu' ? attachWebGpuValidationListener(page) : undefined;

      try {
        await page.goto(`/examples/jscad_non_manifold_section_fixture?graphicsBackend=${backend}`);
        await expect(page.getByRole('img', { name: /3d model preview/i })).toBeVisible({ timeout: 60_000 });
        await expect(page.getByTestId('bbox-viewer')).toBeVisible({ timeout: 60_000 });
        await page.waitForFunction(() =>
          Boolean((globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__),
        );

        await driveNonManifoldSectionView(page);
        await page.waitForTimeout(750);
        await captureSectionCanvas(page, testInfo, `non-manifold-section-${backend}.png`);

        const stats = await sampleSectionCanvasRegion(page, { x: 0.35, y: 0.28, width: 0.3, height: 0.36 });
        expect(stats.distinctBuckets, 'non-manifold cap should render shaded/striped pixels').toBeGreaterThanOrEqual(8);
        expect(stats.dominantRatio, 'non-manifold cap should not be transparent background').toBeLessThan(0.92);
        expect(stats.beigeish, 'non-manifold cap should recover beige source-material fill').toBeGreaterThan(80);

        expect(
          listener?.failuresRef.lines ?? [],
          `WebGPU validation errors leaked to the console:\n${listener?.failuresRef.lines.join('\n') ?? ''}`,
        ).toEqual([]);
      } finally {
        listener?.detach();
      }
    });
  }
});
