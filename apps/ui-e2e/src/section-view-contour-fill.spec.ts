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
    getSectionCapCompleteness(): SectionCapCompleteness | undefined;
    getRenderFrame(): { metersPerRenderUnit: number };
  };
};

type SectionCapCompleteness =
  | Readonly<{
      status: 'complete';
      admittedSourceCount: number;
      extensionSourceCount: number;
      fallbackSourceCount: number;
      trueCutComponentCount: number;
      cappedTrueCutComponentCount: number;
      unresolvedTrueCutEdgeCount: number;
      unsupportedSourceCount: number;
    }>
  | Readonly<{
      status: 'unsupported' | 'failed';
      failure: Readonly<{ sourceKey: string; code: string; message: string }>;
    }>;

const webgpuValidationPatterns: readonly RegExp[] = [
  /Vertex buffer slot \d+ required/,
  /Invalid CommandBuffer/,
  /depth-stencil format mismatch/,
];

const consoleMessageCount = async (): Promise<number> => {
  const events = await target.events();
  return events.consoleMessages.length;
};

const expectNoWebGpuValidationFailures = async (from?: number): Promise<void> => {
  if (from === undefined) {
    return;
  }
  const events = await target.events();
  const failures = events.consoleMessages
    .slice(from)
    .filter(({ text }) => webgpuValidationPatterns.some((pattern) => pattern.test(text)))
    .map(({ text, type }) => `[${type}] ${text}`);
  expect(failures, `WebGPU validation errors leaked to the console:\n${failures.join('\n')}`).toEqual([]);
};

async function driveSectionView(rotationY: number): Promise<void> {
  await target.evaluate((nextRotationY) => {
    const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Section view e2e bridge is not installed.');
    }

    bridge.setCamera({
      position: [0.072, -0.088, 0.058],
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

async function sampleSectionCanvas(): Promise<{
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
  return sampleSectionCanvasRegion({ x: 0, y: 0, width: 1, height: 1 });
}

type CanvasSampleRegion = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

async function sampleSectionCanvasRegion(region: CanvasSampleRegion): Promise<{
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
  const canvas = selectors.getByCss('canvas[data-engine]');
  await target.expectVisible(canvas, 60_000);
  const screenshot = await target.screenshot(canvas);

  return target.evaluate(
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

        if (channelMax <= 150) {
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
    { pngBase64: screenshot, region },
  );
}

async function getSectionHelperSummary(): Promise<{
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
  return target.evaluate(() => {
    const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Section view e2e bridge is not installed.');
    }

    return bridge.getSectionHelperSummary();
  });
}

async function getSectionCapPerformanceDiagnostics(): Promise<
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
  return target.evaluate(() => {
    const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Section view e2e bridge is not installed.');
    }

    return bridge.getSectionCapPerformanceDiagnostics?.();
  });
}

async function getSectionCapCompleteness(): Promise<SectionCapCompleteness | undefined> {
  return target.evaluate(() => {
    const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Section view e2e bridge is not installed.');
    }
    return bridge.getSectionCapCompleteness();
  });
}

async function expectCompleteSectionCaps(context: string): Promise<void> {
  const completeness = await getSectionCapCompleteness();
  expect(completeness, `${context}: section-cap completeness diagnostics should be published`).toBeDefined();
  expect(
    completeness?.status,
    `${context}: every admitted source should produce a safe section snapshot\n${JSON.stringify(completeness)}`,
  ).toBe('complete');
  if (completeness?.status !== 'complete') {
    return;
  }
  expect(
    completeness.admittedSourceCount,
    `${context}: at least one logical source should be admitted`,
  ).toBeGreaterThan(0);
  expect(completeness.cappedTrueCutComponentCount, `${context}: every true-cut component should be capped`).toBe(
    completeness.trueCutComponentCount,
  );
  expect(completeness.unresolvedTrueCutEdgeCount, `${context}: no true-cut edge may remain unresolved`).toBe(0);
  expect(completeness.unsupportedSourceCount, `${context}: no admitted source may be unsupported`).toBe(0);
}

async function expectClosedSectionCapIntegrity(backend: 'webgl' | 'webgpu', rotationY: number): Promise<void> {
  await driveSectionView(rotationY);
  await target.delay(750);
  await expectCompleteSectionCaps(`${backend} rotationY=${rotationY}`);
  const stats = await sampleSectionCanvas();
  const helperSummary = await getSectionHelperSummary();

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

async function driveNonManifoldSectionView(): Promise<void> {
  await target.evaluate(() => {
    const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Section view e2e bridge is not installed.');
    }

    bridge.setCamera({
      position: [0.005, -0.007, 0.005],
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

async function driveCubeCylinderOverlayDepthSectionView(): Promise<void> {
  await target.evaluate(() => {
    const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Section view e2e bridge is not installed.');
    }

    bridge.setCamera({
      position: [0.088, -0.104, 0.044],
      target: [0, 0, 0.014],
      fov: 42,
      zoom: 1,
    });
    bridge.setSectionView({
      plane: 'yz',
      direction: 1,
      rotationRadians: [0, 0, 0],
      pivot: [0, 0, 0.025],
      translation: 0,
    });
  });
}

async function driveFlowerAttachmentSectionView(translation = 0): Promise<void> {
  await target.evaluate((nextTranslation) => {
    const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Section view e2e bridge is not installed.');
    }

    bridge.setCamera({
      position: [0.054, -0.064, 0.028],
      target: [0, 0, 0.004],
      fov: 38,
      zoom: 1.18,
    });
    bridge.setSectionView({
      plane: 'yz',
      direction: 1,
      rotationRadians: [0, 0, 0],
      pivot: [0, 0, 0.003],
      translation: nextTranslation / 1000,
    });
  }, translation);
}

async function expectFlowerAttachmentContoursVisible(backend: 'webgl' | 'webgpu'): Promise<void> {
  const stats = await sampleSectionCanvasRegion({ x: 0.16, y: 0.14, width: 0.68, height: 0.68 });
  const helperSummary = await getSectionHelperSummary();

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

async function expectOverlayAxesVisibleThroughClippedAwayRegion(backend: 'webgl' | 'webgpu'): Promise<void> {
  const stats = await sampleSectionCanvasRegion({ x: 0.42, y: 0.38, width: 0.18, height: 0.2 });
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

async function captureSectionCanvas(fileName: string): Promise<void> {
  const canvas = selectors.getByCss('canvas[data-engine]');
  await target.expectVisible(canvas, 60_000);
  await target.screenshot(canvas, fileName);
}

test.describe('Section view contour fill regression', () => {
  for (const backend of ['webgl', 'webgpu'] as const) {
    test(`keeps closed caps from bleeding over colored internals in ${backend}`, async () => {
      const messageStart = backend === 'webgpu' ? await consoleMessageCount() : undefined;
      await target.navigate(`/__e2e/example-fixture?locator=jscad.section-cap-fixture&graphicsBackend=${backend}`);
      await target.expectVisible(selectors.getByCss('canvas[data-engine]'), 60_000);
      await target.expectGraphicsBackend(backend);
      await target.expectGeometryFramed();

      await expectClosedSectionCapIntegrity(backend, -1.47);
      await expectClosedSectionCapIntegrity(backend, -0.84);
      await expectClosedSectionCapIntegrity(backend, 0.42);
      await expectNoWebGpuValidationFailures(messageStart);
    });
  }

  for (const backend of ['webgl', 'webgpu'] as const) {
    test(`keeps clipped-away cube-cylinder region transparent to overlay axes in ${backend}`, async () => {
      const messageStart = backend === 'webgpu' ? await consoleMessageCount() : undefined;
      await target.navigate(
        `/__e2e/example-fixture?locator=jscad.cube-cylinder-section-fixture&graphicsBackend=${backend}`,
      );
      await target.expectVisible(selectors.getByCss('canvas[data-engine]'), 60_000);
      await target.expectGraphicsBackend(backend);
      await target.expectGeometryFramed();

      await target.delay(500);
      await driveCubeCylinderOverlayDepthSectionView();
      await target.delay(750);
      await expectCompleteSectionCaps(`${backend} cube-cylinder`);
      await captureSectionCanvas(`cube-cylinder-overlay-depth-${backend}.png`);
      await expectOverlayAxesVisibleThroughClippedAwayRegion(backend);
      await expectNoWebGpuValidationFailures(messageStart);
    });
  }

  for (const backend of ['webgl', 'webgpu'] as const) {
    test(`keeps Flower Attachment generated contour outlines visible in ${backend}`, async () => {
      const messageStart = backend === 'webgpu' ? await consoleMessageCount() : undefined;
      await target.navigate(
        `/__e2e/example-fixture?locator=replicad.flower-attachment-section-outline-fixture&graphicsBackend=${backend}`,
      );
      await target.expectVisible(selectors.getByCss('canvas[data-engine]'), 60_000);
      await target.expectGraphicsBackend(backend);
      await target.expectGeometryFramed();

      await driveFlowerAttachmentSectionView();
      await target.delay(1000);
      await expectCompleteSectionCaps(`${backend} Flower Attachment`);
      await captureSectionCanvas(`flower-attachment-section-outline-${backend}.png`);
      await expectFlowerAttachmentContoursVisible(backend);
      const firstDiagnostics = await getSectionCapPerformanceDiagnostics();
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

      await driveFlowerAttachmentSectionView(5);
      await target.delay(250);
      await expectCompleteSectionCaps(`${backend} dragged Flower Attachment`);
      await captureSectionCanvas(`flower-attachment-section-outline-drag-${backend}.png`);
      await expectFlowerAttachmentContoursVisible(backend);
      const draggedDiagnostics = await getSectionCapPerformanceDiagnostics();
      expect(draggedDiagnostics?.latestFrame.baseCapIsCurrent, `${backend}: dragged base cap should be current`).toBe(
        true,
      );
      expect(
        draggedDiagnostics?.latestFrame.baseCapTopologyKey,
        `${backend}: dragging the clipping plane should update the base cap topology key`,
      ).not.toBe(firstDiagnostics?.latestFrame.baseCapTopologyKey);
      await expectNoWebGpuValidationFailures(messageStart);
    });
  }

  for (const backend of ['webgl', 'webgpu'] as const) {
    test(`keeps branched non-manifold sections in the ordinary safe view in ${backend}`, async () => {
      const messageStart = backend === 'webgpu' ? await consoleMessageCount() : undefined;
      await target.navigate(
        `/__e2e/example-fixture?locator=jscad.non-manifold-section-fixture&graphicsBackend=${backend}`,
      );
      await target.expectVisible(selectors.getByCss('canvas[data-engine]'), 60_000);
      await target.expectGraphicsBackend(backend);
      await target.expectGeometryFramed();

      await driveNonManifoldSectionView();
      await target.delay(750);
      await captureSectionCanvas(`non-manifold-section-${backend}.png`);

      const completeness = await getSectionCapCompleteness();
      expect(completeness?.status, JSON.stringify(completeness)).toBe('unsupported');
      expect(
        ['open-surface', 'inconsistent-orientation', 'ambiguous-seam', 'non-manifold-vertex'].includes(
          completeness?.status === 'unsupported' ? completeness.failure.code : '',
        ),
      ).toBe(true);
      const diagnostics = await getSectionCapPerformanceDiagnostics();
      expect(diagnostics?.latestFrame.counters['safeSnapshotCurrentCount']).toBe(0);
      const helperSummary = await getSectionHelperSummary();
      expect(helperSummary.sectionHelperContourSegmentCount).toBe(0);
      await expectNoWebGpuValidationFailures(messageStart);
    });
  }
});
