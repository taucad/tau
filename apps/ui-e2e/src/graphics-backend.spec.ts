import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

/**
 * Graphics-backend regression spec.
 *
 * Catches WebGPU validation regressions automatically by installing a `console` listener that
 * fails the test on any line matching one of `webgpuValidationPatterns`. The patterns cover
 * the specific failure modes documented in the `webgpu-override-material-vertex-binding-failure`
 * research doc plus a small set of high-signal validation strings that have historically masked
 * regressions in the override-material / compose-quad area:
 *
 * - `/Vertex buffer slot \d+ required/` — the override-material attribute-mismatch signature.
 * - `/Invalid CommandBuffer/` — symptomatic of broken pass dependencies (e.g. depth attachment
 *   never populated, MRT slots missing).
 * - `/depth-stencil format mismatch/` — composite-quad depth-write contract violation (rule 12).
 *
 * Whenever the in-canvas WebGPU path matches one of those, the test fails fast with the captured
 * line attached so reviewers see the validation message directly in the Vitest report.
 *
 * The screenshot-at-three-angles assertion from the audit's R-test plan
 * (`webgpu-grid-{angle}.png`) is parked as `test.fixme` below until the editor exposes a
 * scriptable camera-orbit API — the gizmo currently requires synthetic pointer drags whose
 * deterministic stop-position varies across headless GPUs.
 *
 * A pixel-histogram fallback (`assertCanvasHasNonBackgroundPixels`) supplements the console
 * listener: it samples the rendered canvas via `drawImage`-into-2D and asserts the frame is not
 * dominated by a single solid-background colour. This catches "everything went invisible"
 * regressions like the composite-quad `depthNode` mis-step documented in
 * `docs/research/webgpu-composite-quad-depth-write-non-functional.md`, where the priority-2
 * overlay scene (grid + axes) depth-tested against stale canvas depth and disappeared at close
 * zoom levels. Without this check, the validation-error listener alone would have passed the
 * frame even though the visual was broken.
 */

const webgpuValidationPatterns: readonly RegExp[] = [
  /Vertex buffer slot \d+ required/,
  /Invalid CommandBuffer/,
  /depth-stencil format mismatch/,
];

type GraphicsBackend = 'webgl' | 'webgpu';

type GraphicsTestBridgeWindow = Window & {
  __TAU_SECTION_VIEW_TEST__?: {
    setCamera(camera: {
      position: readonly [number, number, number];
      target?: readonly [number, number, number];
      fov?: number;
      zoom?: number;
    }): void;
    setFovAngle(angle: number): void;
    getCamera(): {
      position: readonly [number, number, number];
      quaternion: readonly [number, number, number, number];
      target: readonly [number, number, number];
      fov?: number;
      zoom?: number;
      controlsDistance: number;
      controlsEnabled: boolean;
      viewportGizmoLockActive: boolean;
    };
  };
};

type GraphicsTestCameraState = ReturnType<
  NonNullable<GraphicsTestBridgeWindow['__TAU_SECTION_VIEW_TEST__']>['getCamera']
>;

type CanvasSampleRegion = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

type EdgeOcclusionSampleStats = Readonly<{
  totalSampled: number;
  blueSurfacePixels: number;
  edgeLikePixels: number;
  redLeakPixels: number;
}>;

const previewCanvasSelector =
  '[role="img"][aria-label*="3D model preview" i] canvas, canvas[role="img"][aria-label*="3D model preview" i]';

const edgeOcclusionCenterRegion: CanvasSampleRegion = {
  x: 0.32,
  y: 0.32,
  width: 0.36,
  height: 0.36,
};

const consoleMessageCount = async (): Promise<number> => {
  const events = await target.events();
  return events.consoleMessages.length;
};

const webGpuValidationFailures = async (from: number): Promise<string[]> => {
  const events = await target.events();
  return events.consoleMessages
    .slice(from)
    .filter(({ text }) => webgpuValidationPatterns.some((pattern) => pattern.test(text)))
    .map(({ text, type }) => `[${type}] ${text}`);
};

/**
 * Sample the rendered canvas via `drawImage`-into-2D and return a histogram of pixel-colour
 * buckets quantised to 5 bits per channel (32^3 = 32_768 buckets). The histogram lets the test
 * distinguish "canvas dominated by a single solid colour" (the broken state we want to fail on
 * — either uninitialised, fully-cleared background, or fully-cleared depth that culled every
 * draw) from a "real render" (≥ N distinct buckets each with non-trivial weight).
 *
 * Runs entirely in the page so we don't take a Node image-decoder dependency on `sharp` / `pngjs` for
 * PNG decode. `drawImage(HTMLCanvasElement, ...)` is canvas-context-agnostic — it copies the
 * presented framebuffer regardless of whether the source is WebGL, WebGPU, or 2D.
 */
async function assertCanvasHasNonBackgroundPixels(canvasSelector: string, context: string): Promise<void> {
  const stats = await target.evaluate((selector) => {
    const canvas = document.querySelector<HTMLCanvasElement>(selector);
    if (canvas === null) {
      return { distinctBuckets: 0, totalSampled: 0, dominantWeight: 0, error: 'canvas not found' };
    }

    // Sample at a fixed grid resolution so the test stays deterministic across viewport sizes.
    const sampleWidth = 64;
    const sampleHeight = 64;

    const offscreen = document.createElement('canvas');
    offscreen.width = sampleWidth;
    offscreen.height = sampleHeight;
    const offscreenContext = offscreen.getContext('2d');
    if (offscreenContext === null) {
      return { distinctBuckets: 0, totalSampled: 0, dominantWeight: 0, error: '2d context unavailable' };
    }
    offscreenContext.drawImage(canvas, 0, 0, sampleWidth, sampleHeight);

    const { data } = offscreenContext.getImageData(0, 0, sampleWidth, sampleHeight);
    const histogram = new Map<number, number>();
    // Quantise each 8-bit channel to 5 bits (32 levels) via integer division, then pack into a
    // single bucket index `r * 1024 + g * 32 + b`. Equivalent to `(r << 10) | (g << 5) | b` but
    // expressed arithmetically because `eslint(no-bitwise)` is enabled for ui-e2e.
    for (let index = 0; index < data.length; index += 4) {
      const r = Math.floor(data[index]! / 8);
      const g = Math.floor(data[index + 1]! / 8);
      const b = Math.floor(data[index + 2]! / 8);
      const bucket = r * 1024 + g * 32 + b;
      histogram.set(bucket, (histogram.get(bucket) ?? 0) + 1);
    }

    const totalSampled = sampleWidth * sampleHeight;
    let dominantWeight = 0;
    for (const weight of histogram.values()) {
      if (weight > dominantWeight) {
        dominantWeight = weight;
      }
    }
    return {
      distinctBuckets: histogram.size,
      totalSampled,
      dominantWeight,
      error: undefined as string | undefined,
    };
  }, canvasSelector);

  expect(stats.error, `${context}: canvas sampling failed`).toBeUndefined();
  expect(stats.totalSampled, `${context}: total sampled pixels must be > 0`).toBeGreaterThan(0);

  // The composite-quad-depth regression manifested as ~100% of canvas pixels collapsing to the
  // single background-clear colour (everything else got depth-culled). A healthy render at
  // 64×64 samples produces dozens of distinct quantised buckets across the geometry, lighting,
  // AO, and grid colour ramps. Lower bound chosen to be defensible across headless GPUs while
  // still flagging "single solid colour" regressions.
  expect(
    stats.distinctBuckets,
    `${context}: canvas histogram has too few distinct colour buckets (${stats.distinctBuckets}) — likely a "render went invisible" regression. Total sampled = ${stats.totalSampled}, dominant bucket weight = ${stats.dominantWeight}.`,
  ).toBeGreaterThanOrEqual(8);

  // A frame where one bucket covers >= 99% of sampled pixels is functionally a solid background.
  const dominantRatio = stats.dominantWeight / stats.totalSampled;
  expect(
    dominantRatio,
    `${context}: a single colour bucket covers ${(dominantRatio * 100).toFixed(1)}% of the canvas — render is likely dominated by background.`,
  ).toBeLessThan(0.99);
}

async function isWebGpuAvailable(): Promise<boolean> {
  return target.evaluate(() => 'gpu' in navigator);
}

async function driveLowFovEdgeOcclusionCamera(): Promise<void> {
  await waitForGraphicsTestBridge();
  await target.evaluate(() => {
    const bridge = (globalThis as unknown as GraphicsTestBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Graphics e2e bridge is not installed.');
    }

    bridge.setCamera({
      position: [0, -5000, 0],
      target: [0, 0, 0],
      fov: 0.1,
      zoom: 1,
    });
  });
}

async function waitForGraphicsTestBridge(): Promise<void> {
  await target.waitFor(() => Boolean((globalThis as unknown as GraphicsTestBridgeWindow).__TAU_SECTION_VIEW_TEST__));
}

function calculateViewportFovFromAngle(cameraFovAngle: number): number {
  const clamped = Math.max(0, Math.min(90, cameraFovAngle));
  return 0.1 + 89.9 * (clamped / 90);
}

function calculateProjectedScale(camera: GraphicsTestCameraState): number {
  const fov = camera.fov ?? 75;
  const zoom = camera.zoom ?? 1;
  return zoom / (camera.controlsDistance * Math.tan((fov * Math.PI) / 360));
}

function distanceBetweenPositions(
  first: readonly [number, number, number],
  second: readonly [number, number, number],
): number {
  return Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2]);
}

function quaternionAngularDistance(
  first: readonly [number, number, number, number],
  second: readonly [number, number, number, number],
): number {
  const dot = Math.abs(first[0] * second[0] + first[1] * second[1] + first[2] * second[2] + first[3] * second[3]);
  return 2 * Math.acos(Math.min(1, dot));
}

async function dragMainPreviewCanvas(): Promise<void> {
  const canvas = selectors.getByCss(previewCanvasSelector).first();
  await target.expectVisible(canvas, 60_000);
  const box = await target.boundingBox(canvas);
  expect(box, 'main preview canvas should have a measurable bounding box').toBeDefined();

  if (!box) {
    return;
  }

  const startX = box.x + box.width * 0.52;
  const startY = box.y + box.height * 0.52;
  await target.mouseMove(startX, startY);
  await target.mouseDown();
  await target.mouseMove(startX + 140, startY + 60, { steps: 8 });
  await target.mouseUp();
}

async function sampleCameraFrames(frameCount: number): Promise<GraphicsTestCameraState[]> {
  return target.evaluate(async (count) => {
    const bridge = (globalThis as unknown as GraphicsTestBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Graphics e2e bridge is not installed.');
    }

    const samples: GraphicsTestCameraState[] = [];
    const collectSample = async (remainingCount: number): Promise<void> => {
      if (remainingCount <= 0) {
        return;
      }

      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
      samples.push(bridge.getCamera());
      await collectSample(remainingCount - 1);
    };

    await collectSample(count);

    return samples;
  }, frameCount);
}

async function waitForCameraToSettle(): Promise<GraphicsTestCameraState> {
  const samples = await sampleCameraFrames(40);
  return samples.at(-1)!;
}

function expectGizmoAnimationProgress(samples: readonly GraphicsTestCameraState[], backend: GraphicsBackend): void {
  expect(samples.length, `${backend}: camera samples must be collected`).toBeGreaterThanOrEqual(8);

  const initial = samples[0]!;
  const distancesFromInitial = samples.map((sample) => distanceBetweenPositions(sample.position, initial.position));
  const totalMovement = distancesFromInitial.at(-1) ?? 0;

  expect(totalMovement, `${backend}: viewport gizmo click should move the camera`).toBeGreaterThan(1);

  const firstVisibleMovement = distancesFromInitial.slice(1, 4).some((distance) => distance > totalMovement * 0.05);
  expect(
    firstVisibleMovement,
    `${backend}: viewport gizmo animation should start promptly. Distances=${JSON.stringify(distancesFromInitial)}`,
  ).toBe(true);

  for (let index = 2; index < distancesFromInitial.length; index += 1) {
    const previous = distancesFromInitial[index - 1]!;
    const current = distancesFromInitial[index]!;
    expect(
      current + totalMovement * 0.1,
      `${backend}: viewport gizmo animation should not visibly backtrack. Distances=${JSON.stringify(distancesFromInitial)}`,
    ).toBeGreaterThanOrEqual(previous);
  }

  const frameSteps = samples
    .slice(1)
    .map((sample, index) => distanceBetweenPositions(sample.position, samples[index]!.position));
  const largestStep = Math.max(...frameSteps);
  expect(
    largestStep,
    `${backend}: viewport gizmo animation has a large snap step. Steps=${JSON.stringify(frameSteps)}`,
  ).toBeLessThan(totalMovement * 0.75);
}

function expectMainCanvasDragChangedCamera(
  before: GraphicsTestCameraState,
  after: GraphicsTestCameraState,
  backend: GraphicsBackend,
): void {
  const positionDistance = distanceBetweenPositions(before.position, after.position);
  const quaternionDistance = quaternionAngularDistance(before.quaternion, after.quaternion);
  expect(
    positionDistance > 0.5 || quaternionDistance > 0.005,
    `${backend}: main canvas drag should change the camera after gizmo animation. Before=${JSON.stringify(before)}, after=${JSON.stringify(after)}`,
  ).toBe(true);
}

function expectMainCanvasControlsAvailable(camera: GraphicsTestCameraState, backend: GraphicsBackend): void {
  expect(camera.controlsEnabled, `${backend}: CameraControls should be enabled after viewport gizmo animation`).toBe(
    true,
  );
  expect(camera.viewportGizmoLockActive, `${backend}: viewport gizmo interaction lock should be released`).toBe(false);
}

async function setFovAngleAndWait(angle: number): Promise<GraphicsTestCameraState> {
  const expectedFov = calculateViewportFovFromAngle(angle);
  await target.evaluate((nextAngle) => {
    const bridge = (globalThis as unknown as GraphicsTestBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Graphics e2e bridge is not installed.');
    }

    bridge.setFovAngle(nextAngle);
  }, angle);

  await target.waitFor(
    ({ expected }) => {
      const bridge = (globalThis as unknown as GraphicsTestBridgeWindow).__TAU_SECTION_VIEW_TEST__;
      const camera = bridge?.getCamera();
      return camera?.fov !== undefined && Math.abs(camera.fov - expected) < 0.01;
    },
    { expected: expectedFov },
  );

  return target.evaluate(() => {
    const bridge = (globalThis as unknown as GraphicsTestBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Graphics e2e bridge is not installed.');
    }

    return bridge.getCamera();
  });
}

async function sampleEdgeOcclusionCanvas(): Promise<EdgeOcclusionSampleStats> {
  const canvas = selectors.getByCss(previewCanvasSelector).first();
  await target.expectVisible(canvas, 60_000);
  const screenshot = await target.screenshot(canvas);

  return target.evaluate(
    async ({ pngBase64, region }) => {
      const sampleWidth = 128;
      const sampleHeight = 128;
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

      const sourceX = Math.floor(image.naturalWidth * region.x);
      const sourceY = Math.floor(image.naturalHeight * region.y);
      const sourceWidth = Math.max(1, Math.floor(image.naturalWidth * region.width));
      const sourceHeight = Math.max(1, Math.floor(image.naturalHeight * region.height));

      const offscreen = document.createElement('canvas');
      offscreen.width = sampleWidth;
      offscreen.height = sampleHeight;
      const context = offscreen.getContext('2d');
      if (!context) {
        return { totalSampled: 0, blueSurfacePixels: 0, edgeLikePixels: 0, redLeakPixels: 0 };
      }

      context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sampleWidth, sampleHeight);
      const { data } = context.getImageData(0, 0, sampleWidth, sampleHeight);
      let blueSurfacePixels = 0;
      let edgeLikePixels = 0;
      let redLeakPixels = 0;

      for (let index = 0; index < data.length; index += 4) {
        const r = data[index]!;
        const g = data[index + 1]!;
        const b = data[index + 2]!;

        if (b > 90 && b > r + 30 && g > r + 8) {
          blueSurfacePixels += 1;
        }

        if (r < 80 && g < 80 && b < 80) {
          edgeLikePixels += 1;
        }

        if (r > 120 && r > g * 1.4 && r > b * 1.4) {
          redLeakPixels += 1;
        }
      }

      return {
        totalSampled: sampleWidth * sampleHeight,
        blueSurfacePixels,
        edgeLikePixels,
        redLeakPixels,
      };
    },
    {
      pngBase64: screenshot,
      region: edgeOcclusionCenterRegion,
    },
  );
}

async function renderAndSampleEdgeOcclusionFixture(backend: GraphicsBackend): Promise<EdgeOcclusionSampleStats> {
  await target.navigate(`/examples/jscad_edge_occlusion_fixture?graphicsBackend=${backend}`);

  const canvas = selectors.getByRole('img', { name: /3d model preview/i });
  await target.expectVisible(canvas, 60_000);

  const bboxViewer = selectors.getByTestId('bbox-viewer');
  await target.expectVisible(bboxViewer, 60_000);

  await driveLowFovEdgeOcclusionCamera();
  await target.delay(1000);

  return sampleEdgeOcclusionCanvas();
}

function expectFrontSlabDominates(stats: EdgeOcclusionSampleStats, context: string): void {
  expect(stats.totalSampled, `${context}: sampled region must contain pixels`).toBeGreaterThan(0);
  expect(
    stats.blueSurfacePixels,
    `${context}: front blue slab should dominate the central sample. Stats: ${JSON.stringify(stats)}`,
  ).toBeGreaterThan(stats.totalSampled * 0.25);
}

function expectRearEdgesStayOccluded(
  stats: EdgeOcclusionSampleStats,
  baselineStats: EdgeOcclusionSampleStats,
  context: string,
): void {
  expect(
    stats.edgeLikePixels,
    `${context}: hidden rear cuboid edges leaked through the front slab. WebGPU stats: ${JSON.stringify(stats)}; WebGL baseline: ${JSON.stringify(baselineStats)}`,
  ).toBeLessThan(Math.max(128, baselineStats.edgeLikePixels + 96));
  expect(
    stats.edgeLikePixels / stats.totalSampled,
    `${context}: too much of the center region is edge-like. Stats: ${JSON.stringify(stats)}`,
  ).toBeLessThan(0.012);
  expect(
    stats.redLeakPixels,
    `${context}: rear cuboid surface color leaked into the central sample. Stats: ${JSON.stringify(stats)}`,
  ).toBeLessThan(32);
}

test.describe('Graphics backend regression guard', () => {
  for (const backend of ['webgl', 'webgpu'] as const satisfies readonly GraphicsBackend[]) {
    test(`FOV changes preserve projected size through CameraControls on ${backend}`, async ({ skip }) => {
      if (backend === 'webgpu') {
        const hasWebGpu = await isWebGpuAvailable();
        skip(!hasWebGpu, 'WebGPU is not available in this browser runtime.');
      }

      await target.navigate(`/examples/jscad_edge_occlusion_fixture?graphicsBackend=${backend}`);

      const canvas = selectors.getByRole('img', { name: /3d model preview/i });
      await target.expectVisible(canvas, 60_000);
      await target.expectVisible(selectors.getByTestId('bbox-viewer'), 60_000);

      await waitForGraphicsTestBridge();
      await target.evaluate(() => {
        const bridge = (globalThis as unknown as GraphicsTestBridgeWindow).__TAU_SECTION_VIEW_TEST__;
        if (!bridge) {
          throw new Error('Graphics e2e bridge is not installed.');
        }

        bridge.setCamera({
          position: [0, -500, 0],
          target: [0, 0, 0],
          zoom: 1,
        });
      });

      const nearOrthographicCamera = await setFovAngleAndWait(0);
      const perspectiveCamera = await setFovAngleAndWait(2);

      const nearOrthographicScale = calculateProjectedScale(nearOrthographicCamera);
      const perspectiveScale = calculateProjectedScale(perspectiveCamera);
      const ratio = perspectiveScale / nearOrthographicScale;

      expect(
        ratio,
        `${backend}: projected scale changed after FOV update. Before=${JSON.stringify(nearOrthographicCamera)}, after=${JSON.stringify(perspectiveCamera)}`,
      ).toBeGreaterThan(0.98);
      expect(
        ratio,
        `${backend}: projected scale changed after FOV update. Before=${JSON.stringify(nearOrthographicCamera)}, after=${JSON.stringify(perspectiveCamera)}`,
      ).toBeLessThan(1.02);
    });

    test(`viewport gizmo animation progresses smoothly through Tau CameraControls on ${backend}`, async ({ skip }) => {
      if (backend === 'webgpu') {
        const hasWebGpu = await isWebGpuAvailable();
        skip(!hasWebGpu, 'WebGPU is not available in this browser runtime.');
      }

      await target.navigate(`/examples/jscad_edge_occlusion_fixture?graphicsBackend=${backend}`);

      const canvas = selectors.getByRole('img', { name: /3d model preview/i });
      await target.expectVisible(canvas, 60_000);
      await target.expectVisible(selectors.getByTestId('bbox-viewer'), 60_000);

      await waitForGraphicsTestBridge();
      await target.evaluate(() => {
        const bridge = (globalThis as unknown as GraphicsTestBridgeWindow).__TAU_SECTION_VIEW_TEST__;
        if (!bridge) {
          throw new Error('Graphics e2e bridge is not installed.');
        }

        bridge.setCamera({
          position: [125, -180, 95],
          target: [0, 0, 0],
          zoom: 1,
        });
      });

      await waitForCameraToSettle();
      const samples = await target.sampleCameraDuringClick<GraphicsTestCameraState>(
        selectors.getByCss('.viewport-gizmo-cube').first(),
        20,
      );

      expectGizmoAnimationProgress(samples, backend);

      const beforeCanvasDrag = await waitForCameraToSettle();
      expectMainCanvasControlsAvailable(beforeCanvasDrag, backend);

      await dragMainPreviewCanvas();
      const afterCanvasDragSamples = await sampleCameraFrames(4);
      const afterCanvasDrag = afterCanvasDragSamples.at(-1)!;

      expectMainCanvasDragChangedCamera(beforeCanvasDrag, afterCanvasDrag, backend);
    });
  }

  test('no WebGPU validation errors emit during a Birdhouse preview render', async ({ skip }) => {
    const hasWebGpu = await isWebGpuAvailable();
    skip(!hasWebGpu, 'WebGPU is not available in this browser runtime.');
    const messageStart = await consoleMessageCount();

    await target.navigate('/examples/proj_birdhouse');

    const canvas = selectors.getByRole('img', { name: /3d model preview/i });
    await target.expectVisible(canvas, 60_000);

    // Wait for the diagnostic panel to confirm a non-empty render — the same surface the
    // birdhouse-preview spec uses. Once it appears the WebGPU pipelines have been compiled,
    // the scenePass has rasterised at least once, and the composite quad has drawn,
    // which is the window during which override-material / composite-depth bugs surface.
    const bboxViewer = selectors.getByTestId('bbox-viewer');
    await target.expectVisible(bboxViewer, 60_000);

    // Drain any async console messages that have not flushed yet.
    await target.delay(250);

    const failures = await webGpuValidationFailures(messageStart);
    expect(failures, `WebGPU validation errors leaked to the console:\n${failures.join('\n')}`).toEqual([]);
  });

  test('canvas pixel histogram detects "render went invisible" regressions', async ({ skip }) => {
    const hasWebGpu = await isWebGpuAvailable();
    skip(!hasWebGpu, 'WebGPU is not available in this browser runtime.');
    const messageStart = await consoleMessageCount();

    await target.navigate('/examples/proj_birdhouse');

    const canvas = selectors.getByRole('img', { name: /3d model preview/i });
    await target.expectVisible(canvas, 60_000);

    // Wait for the first non-empty render — the bbox-viewer mounting is the
    // synchronisation point that proves geometry has been delivered to the renderer.
    const bboxViewer = selectors.getByTestId('bbox-viewer');
    await target.expectVisible(bboxViewer, 60_000);

    // Give the canvas a few frames after geometry arrival to let the post-pipeline warmup
    // resolve (compileAsync IIFE in PostProcessingWebGPU) and the priority-2 overlay scene
    // (grid + axes) to land at least one frame into the canvas depth + colour attachments.
    await target.delay(750);

    await assertCanvasHasNonBackgroundPixels(
      'canvas[role="img"][aria-label*="3D model preview" i]',
      'Birdhouse preview canvas after first render',
    );

    // Cross-check: pixel-histogram regressions should not be paired with WebGPU validation
    // noise; if they are, the validation message is more diagnostic than the pixel check.
    const failures = await webGpuValidationFailures(messageStart);
    expect(
      failures,
      `Pixel-histogram check passed but WebGPU validation errors were observed:\n${failures.join('\n')}`,
    ).toEqual([]);
  });

  test('low-FOV WebGPU keeps rear GLTF edges occluded behind the front slab', async ({ skip }) => {
    const hasWebGpu = await isWebGpuAvailable();
    skip(!hasWebGpu, 'WebGPU is not available in this browser runtime.');

    const webGlStats = await renderAndSampleEdgeOcclusionFixture('webgl');
    expectFrontSlabDominates(webGlStats, 'WebGL low-FOV edge occlusion baseline');
    expectRearEdgesStayOccluded(webGlStats, webGlStats, 'WebGL low-FOV edge occlusion baseline');

    const messageStart = await consoleMessageCount();
    const webGpuStats = await renderAndSampleEdgeOcclusionFixture('webgpu');
    expectFrontSlabDominates(webGpuStats, 'WebGPU low-FOV edge occlusion fixture');
    expectRearEdgesStayOccluded(webGpuStats, webGlStats, 'WebGPU low-FOV edge occlusion fixture');
    const failures = await webGpuValidationFailures(messageStart);
    expect(failures, `WebGPU validation errors leaked to the console:\n${failures.join('\n')}`).toEqual([]);
  });
});
