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
  __TAU_SECTION_VIEW_TEST_BRIDGES__?: Array<NonNullable<GraphicsTestBridgeWindow['__TAU_SECTION_VIEW_TEST__']>>;
  __TAU_SECTION_VIEW_TEST__?: {
    getGraphicsBackend(): GraphicsBackend;
    isGeometryFramed(): boolean;
    setCamera(camera: {
      position: readonly [number, number, number];
      target?: readonly [number, number, number];
      fov?: number;
      zoom?: number;
    }): void;
    setFovAngle(angle: number): void;
    setPresentation(presentation: Readonly<{ surfaces: boolean; lines: boolean }>): void;
    setPostProcessingEnabled(enabled: boolean): void;
    setGridPresentationClipPolicy(policy: Readonly<{ far: boolean; near: boolean }>): void;
    getCamera(): {
      actorStatus: string;
      projection: 'orthographic' | 'perspective';
      requestedFov: number;
      handoffFov?: number;
      verticalSpan: number;
      position: readonly [number, number, number];
      quaternion: readonly [number, number, number, number];
      target: readonly [number, number, number];
      fov?: number;
      zoom?: number;
      controlsDistance: number;
      controlsEnabled: boolean;
      viewportGizmoLockActive: boolean;
      clipping: Readonly<{ near: number; far: number }>;
      nativeClipping: Readonly<{ near: number; far: number }>;
    };
    getCameraTransitionDiagnostics(): {
      requests: number;
      frames: number;
      actorSyncFailures: number;
      averageRequestToActorSyncMilliseconds: number;
      maximumRequestToActorSyncMilliseconds: number;
      maximumRequestToFrameMilliseconds: number;
      staleFrames: number;
    };
    resetCameraTransitionDiagnostics(): void;
    getRenderFrame(): {
      anchorFrameId: string;
      originMeters: readonly [number, number, number];
      metersPerRenderUnit: number;
    };
    setRenderFrame(renderFrame: {
      anchorFrameId: string;
      originMeters: readonly [number, number, number];
      metersPerRenderUnit: number;
    }): void;
    projectWorldPoint(point: readonly [number, number, number]): { x: number; y: number; visible: boolean };
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

type CanvasFrameDifference = Readonly<{
  beforeDistinctBuckets: number;
  afterDistinctBuckets: number;
  meanAbsoluteChannelDifference: number;
  changedPixelRatio: number;
  totalSampled: number;
}>;

type GridFadeRowProfile = Readonly<{
  peakDetail: number;
  maximumAbsoluteNormalizedStep: number;
  maximumNegativeNormalizedStep: number;
  maximumNegativeStepRow: number;
  maximumPositiveNormalizedStep: number;
  maximumPositiveStepRow: number;
  fallRows: number;
  riseRows: number;
  rowDetail: readonly number[];
}>;

const previewCanvasSelector =
  '[data-testid="cad-viewer-canvas-region"] canvas, [role="img"][aria-label*="3D model preview" i] canvas, canvas[role="img"][aria-label*="3D model preview" i]';
const edgeOcclusionFixturePath = '/__e2e/example-fixture?locator=jscad.edge-occlusion-fixture';
const birdhouseFixturePath = '/s/builtin~replicad.birdhouse';

const edgeOcclusionCenterRegion: CanvasSampleRegion = {
  // Stay inside the front slab so its legitimate black perimeter is not
  // misclassified as a leaked rear edge on backends with different AA.
  x: 0.42,
  y: 0.38,
  width: 0.16,
  height: 0.24,
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
  const canvas = selectors.getByCss(canvasSelector).first();
  await target.expectVisible(canvas, 60_000);
  const screenshot = await target.screenshot(canvas);

  const stats = await target.evaluate(async (pngBase64) => {
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
    offscreenContext.drawImage(image, 0, 0, sampleWidth, sampleHeight);

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
  }, screenshot);

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

async function compareCanvasFrames(
  beforePngBase64: string,
  afterPngBase64: string,
  sampleRegion: 'center' | 'perimeter' = 'perimeter',
): Promise<CanvasFrameDifference> {
  return target.evaluate(
    async ({ beforePng, afterPng, region }) => {
      const decode = async (pngBase64: string): Promise<HTMLImageElement> => {
        const image = new Image();
        const loaded = new Promise<void>((resolve, reject) => {
          image.addEventListener('load', () => {
            resolve();
          });
          image.addEventListener('error', () => {
            reject(new Error('3D preview canvas screenshot could not be decoded.'));
          });
        });
        image.src = `data:image/png;base64,${pngBase64}`;
        await loaded;
        return image;
      };

      const [beforeImage, afterImage] = await Promise.all([decode(beforePng), decode(afterPng)]);
      const sampleWidth = 64;
      const sampleHeight = 64;
      const readPixels = (image: HTMLImageElement): Uint8ClampedArray => {
        const canvas = document.createElement('canvas');
        canvas.width = sampleWidth;
        canvas.height = sampleHeight;
        const context = canvas.getContext('2d');
        if (context === null) {
          throw new Error('2d context unavailable');
        }
        context.drawImage(image, 0, 0, sampleWidth, sampleHeight);
        return context.getImageData(0, 0, sampleWidth, sampleHeight).data;
      };

      const before = readPixels(beforeImage);
      const after = readPixels(afterImage);
      const beforeBuckets = new Set<number>();
      const afterBuckets = new Set<number>();
      let totalDifference = 0;
      let changedPixels = 0;
      let totalSampled = 0;

      for (let y = 0; y < sampleHeight; y += 1) {
        for (let x = 0; x < sampleWidth; x += 1) {
          const isCenter = x >= 16 && x < 48 && y >= 16 && y < 48;
          if ((region === 'perimeter' && isCenter) || (region === 'center' && !isCenter)) {
            continue;
          }

          const index = (y * sampleWidth + x) * 4;
          const differences = [0, 1, 2].map((channel) => Math.abs(before[index + channel]! - after[index + channel]!));
          totalDifference += differences[0]! + differences[1]! + differences[2]!;
          if (Math.max(...differences) > 16) {
            changedPixels += 1;
          }
          beforeBuckets.add(
            Math.floor(before[index]! / 8) * 1024 +
              Math.floor(before[index + 1]! / 8) * 32 +
              Math.floor(before[index + 2]! / 8),
          );
          afterBuckets.add(
            Math.floor(after[index]! / 8) * 1024 +
              Math.floor(after[index + 1]! / 8) * 32 +
              Math.floor(after[index + 2]! / 8),
          );
          totalSampled += 1;
        }
      }

      return {
        beforeDistinctBuckets: beforeBuckets.size,
        afterDistinctBuckets: afterBuckets.size,
        meanAbsoluteChannelDifference: totalDifference / (totalSampled * 3),
        changedPixelRatio: changedPixels / totalSampled,
        totalSampled,
      };
    },
    { beforePng: beforePngBase64, afterPng: afterPngBase64, region: sampleRegion },
  );
}

async function sampleGridFadeRows(pngBase64: string): Promise<GridFadeRowProfile> {
  return target.evaluate(async (png) => {
    const image = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      image.addEventListener('load', () => {
        resolve();
      });
      image.addEventListener('error', () => {
        reject(new Error('Grid fade screenshot could not be decoded.'));
      });
    });
    image.src = `data:image/png;base64,${png}`;
    await loaded;

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('2d context unavailable');
    }
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const bands = [
      [0.05, 0.35],
      [0.65, 0.95],
    ] as const;
    const luminanceAt = (x: number, y: number): number => {
      const index = (y * canvas.width + x) * 4;
      return data[index]! * 0.2126 + data[index + 1]! * 0.7152 + data[index + 2]! * 0.0722;
    };
    let backgroundTotal = 0;
    let backgroundSamples = 0;
    const backgroundRows = Math.max(1, Math.floor(canvas.height * 0.08));
    for (let y = 0; y < backgroundRows; y += 1) {
      for (const [start, end] of bands) {
        for (let x = Math.floor(canvas.width * start); x < Math.floor(canvas.width * end); x += 1) {
          backgroundTotal += luminanceAt(x, y);
          backgroundSamples += 1;
        }
      }
    }
    const background = backgroundTotal / backgroundSamples;
    const rawRows = Array.from({ length: canvas.height }, (_, y) => {
      let total = 0;
      let samples = 0;
      for (const [start, end] of bands) {
        for (let x = Math.floor(canvas.width * start); x < Math.floor(canvas.width * end); x += 1) {
          total += Math.abs(luminanceAt(x, y) - background);
          samples += 1;
        }
      }
      return total / samples;
    });
    const smoothingRadius = 2;
    const rowDetail = rawRows.map((_value, row) => {
      const start = Math.max(0, row - smoothingRadius);
      const end = Math.min(rawRows.length, row + smoothingRadius + 1);
      return rawRows.slice(start, end).reduce((sum, value) => sum + value, 0) / (end - start);
    });
    const analysisStart = Math.floor(canvas.height * 0.12);
    const analysisEnd = Math.floor(canvas.height * 0.88);
    const analysed = rowDetail.slice(analysisStart, analysisEnd);
    const peakDetail = Math.max(...analysed);
    const lowThreshold = peakDetail * 0.1;
    const highThreshold = peakDetail * 0.6;
    const transitionWidth = (values: readonly number[]): number => {
      const lowRow = values.findIndex((value) => value >= lowThreshold);
      const highOffset = lowRow === -1 ? -1 : values.slice(lowRow).findIndex((value) => value >= highThreshold);
      return lowRow === -1 || highOffset === -1 ? 0 : highOffset;
    };
    const riseRows = transitionWidth(analysed);
    const fallRows = transitionWidth([...analysed].reverse());
    let maximumPositiveStep = 0;
    let maximumNegativeStep = 0;
    let maximumPositiveStepRow = analysisStart;
    let maximumNegativeStepRow = analysisStart;
    for (let row = 1; row < analysed.length; row += 1) {
      const step = analysed[row]! - analysed[row - 1]!;
      if (step > maximumPositiveStep) {
        maximumPositiveStep = step;
        maximumPositiveStepRow = analysisStart + row;
      }
      if (-step > maximumNegativeStep) {
        maximumNegativeStep = -step;
        maximumNegativeStepRow = analysisStart + row;
      }
    }

    return {
      peakDetail,
      maximumAbsoluteNormalizedStep:
        peakDetail > 0 ? Math.max(maximumPositiveStep, maximumNegativeStep) / peakDetail : 1,
      maximumNegativeNormalizedStep: peakDetail > 0 ? maximumNegativeStep / peakDetail : 1,
      maximumNegativeStepRow,
      maximumPositiveNormalizedStep: peakDetail > 0 ? maximumPositiveStep / peakDetail : 1,
      maximumPositiveStepRow,
      fallRows,
      riseRows,
      rowDetail,
    };
  }, pngBase64);
}

async function driveEdgeOcclusionCamera({
  distance,
  fov,
}: {
  readonly distance: number;
  readonly fov: number;
}): Promise<void> {
  await waitForGraphicsTestBridge();
  await target.evaluate(
    ({ cameraDistance, cameraFov }) => {
      const bridge = (globalThis as unknown as GraphicsTestBridgeWindow).__TAU_SECTION_VIEW_TEST__;
      if (!bridge) {
        throw new Error('Graphics e2e bridge is not installed.');
      }

      bridge.setCamera({
        position: [0, -cameraDistance, 0],
        target: [0, 0.004, 0],
        fov: cameraFov === 0 ? 90 : cameraFov,
        zoom: 1,
      });
      if (cameraFov === 0) {
        bridge.setFovAngle(0);
      }
      bridge.setPostProcessingEnabled(false);
    },
    { cameraDistance: distance, cameraFov: fov },
  );
}

async function waitForGraphicsTestBridge(): Promise<void> {
  await target.waitFor(() => Boolean((globalThis as unknown as GraphicsTestBridgeWindow).__TAU_SECTION_VIEW_TEST__));
  const requestedBackend = await target.evaluate(() => new URL(location.href).searchParams.get('graphicsBackend'));
  if (requestedBackend === 'webgl' || requestedBackend === 'webgpu') {
    await target.expectGraphicsBackend(requestedBackend);
  }
  await target.expectGeometryFramed();
}

async function waitForGraphicsViewer(): Promise<void> {
  try {
    await target.expectVisible(selectors.getByCss(previewCanvasSelector).first(), 60_000);
  } catch (error) {
    const [events, url] = await Promise.all([target.events(), target.currentUrl()]);
    throw new Error(`Graphics viewer did not become ready at ${url}: ${JSON.stringify(events)}`, { cause: error });
  }
}

function calculateProjectedScale(camera: GraphicsTestCameraState): number {
  return 1 / camera.verticalSpan;
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

  const firstVisibleMovement = distancesFromInitial.slice(1, 5).some((distance) => distance > totalMovement * 0.05);
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
  const previousFrames = await target.evaluate(() => {
    const bridge = (globalThis as unknown as GraphicsTestBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    return bridge?.getCameraTransitionDiagnostics().frames ?? 0;
  });
  await target.evaluate((nextAngle) => {
    const bridge = (globalThis as unknown as GraphicsTestBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Graphics e2e bridge is not installed.');
    }

    bridge.setFovAngle(nextAngle);
  }, angle);

  try {
    await target.waitFor(
      ({ expected, expectedFrames }) => {
        const bridge = (globalThis as unknown as GraphicsTestBridgeWindow).__TAU_SECTION_VIEW_TEST__;
        const camera = bridge?.getCamera();
        const diagnostics = bridge?.getCameraTransitionDiagnostics();
        return (
          camera?.requestedFov === expected &&
          camera.projection === (expected === 0 ? 'orthographic' : 'perspective') &&
          diagnostics !== undefined &&
          diagnostics.frames >= expectedFrames
        );
      },
      { expected: angle, expectedFrames: previousFrames + 1 },
    );
  } catch (error) {
    const state = await target.evaluate(() => {
      const scope = globalThis as unknown as GraphicsTestBridgeWindow;
      return (scope.__TAU_SECTION_VIEW_TEST_BRIDGES__ ?? []).map((bridge) => ({
        backend: bridge.getGraphicsBackend(),
        camera: bridge.getCamera(),
        diagnostics: bridge.getCameraTransitionDiagnostics(),
        geometryFramed: bridge.isGeometryFramed(),
      }));
    });
    throw new Error(`Camera FOV ${angle} did not settle: ${JSON.stringify(state)}`, { cause: error });
  }

  return target.evaluate(() => {
    const bridge = (globalThis as unknown as GraphicsTestBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Graphics e2e bridge is not installed.');
    }

    return bridge.getCamera();
  });
}

async function sampleEdgeOcclusionCanvas(fileName: string): Promise<EdgeOcclusionSampleStats> {
  const canvas = selectors.getByCss(previewCanvasSelector).first();
  await target.expectVisible(canvas, 60_000);
  const screenshot = await target.screenshot(canvas, fileName);

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
      const isBlue = (r: number, g: number, b: number): boolean => b > 90 && b > r + 30 && g > r + 8;
      const isEdge = (r: number, g: number, b: number): boolean => r < 80 && g < 80 && b < 80;
      let blueSurfacePixels = 0;
      let edgeLikePixels = 0;
      let redLeakPixels = 0;

      for (let index = 0; index < data.length; index += 4) {
        const r = data[index]!;
        const g = data[index + 1]!;
        const b = data[index + 2]!;

        if (isBlue(r, g, b)) {
          blueSurfacePixels += 1;
        }

        if (isEdge(r, g, b)) {
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

async function renderAndSampleEdgeOcclusionFixture(
  backend: GraphicsBackend,
  camera: { readonly distance: number; readonly fov: number },
): Promise<EdgeOcclusionSampleStats> {
  await target.navigate(`${edgeOcclusionFixturePath}?graphicsBackend=${backend}`);

  await waitForGraphicsViewer();
  await waitForGraphicsTestBridge();

  await driveEdgeOcclusionCamera(camera);
  await target.delay(1000);

  return sampleEdgeOcclusionCanvas(`edge-occlusion-${backend}-${camera.fov}-degrees.png`);
}

function expectFrontSlabDominates(stats: EdgeOcclusionSampleStats, context: string): void {
  expect(stats.totalSampled, `${context}: sampled region must contain pixels`).toBeGreaterThan(0);
  expect(
    stats.blueSurfacePixels,
    `${context}: front blue slab should dominate the central sample. Stats: ${JSON.stringify(stats)}`,
  ).toBeGreaterThan(stats.totalSampled * 0.25);
}

function expectRearEdgesStayOccluded(stats: EdgeOcclusionSampleStats, context: string): void {
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
    test(`FOV changes preserve projected size through CameraControls on ${backend}`, async () => {
      await target.navigate(`${edgeOcclusionFixturePath}?graphicsBackend=${backend}`);

      await waitForGraphicsViewer();

      await waitForGraphicsTestBridge();
      await target.evaluate(() => {
        const bridge = (globalThis as unknown as GraphicsTestBridgeWindow).__TAU_SECTION_VIEW_TEST__;
        if (!bridge) {
          throw new Error('Graphics e2e bridge is not installed.');
        }

        bridge.setPostProcessingEnabled(false);

        bridge.setCamera({
          position: [0, -500, 0],
          target: [0, 0, 0],
          zoom: 1,
        });
      });

      const nearOrthographicCamera = await setFovAngleAndWait(0);
      const perspectiveCamera = await setFovAngleAndWait(0.1);

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

    test(`render-frame rebase and rescale are pixel-invariant on ${backend}`, async () => {
      await target.navigate(`${edgeOcclusionFixturePath}?graphicsBackend=${backend}`);
      await waitForGraphicsViewer();
      await waitForGraphicsTestBridge();
      await target.evaluate(() => {
        const bridge = (globalThis as unknown as GraphicsTestBridgeWindow).__TAU_SECTION_VIEW_TEST__!;
        bridge.setPostProcessingEnabled(false);
      });
      await target.delay(250);
      const canvas = selectors.getByCss(previewCanvasSelector).first();
      const beforePixels = await target.screenshot(canvas);
      const before = await target.evaluate(() => {
        const bridge = (globalThis as unknown as GraphicsTestBridgeWindow).__TAU_SECTION_VIEW_TEST__!;
        return {
          camera: bridge.getCamera(),
          point: bridge.projectWorldPoint([0, 0, 0]),
          frame: bridge.getRenderFrame(),
        };
      });
      await target.evaluate((current) => {
        const bridge = (globalThis as unknown as GraphicsTestBridgeWindow).__TAU_SECTION_VIEW_TEST__!;
        const scale = current.metersPerRenderUnit * 1000;
        bridge.setRenderFrame({
          anchorFrameId: current.anchorFrameId,
          originMeters: [scale * 10, -scale * 20, scale * 30],
          metersPerRenderUnit: scale,
        });
      }, before.frame);
      await target.delay(250);
      const afterPixels = await target.screenshot(canvas);
      const after = await target.evaluate(() => {
        const bridge = (globalThis as unknown as GraphicsTestBridgeWindow).__TAU_SECTION_VIEW_TEST__!;
        return { camera: bridge.getCamera(), point: bridge.projectWorldPoint([0, 0, 0]) };
      });

      expect(distanceBetweenPositions(after.camera.position, before.camera.position)).toBeLessThan(1e-12);
      expect(distanceBetweenPositions(after.camera.target, before.camera.target)).toBeLessThan(1e-12);
      expect(Math.hypot(after.point.x - before.point.x, after.point.y - before.point.y)).toBeLessThanOrEqual(0.25);
      const pixelDifference = await compareCanvasFrames(beforePixels, afterPixels);
      expect(pixelDifference.totalSampled).toBeGreaterThan(0);
      expect(
        pixelDifference.beforeDistinctBuckets,
        `${backend}: the pre-rebase grid-only perimeter must contain visible detail`,
      ).toBeGreaterThanOrEqual(4);
      expect(
        pixelDifference.afterDistinctBuckets,
        `${backend}: the post-rebase grid-only perimeter must contain visible detail`,
      ).toBeGreaterThanOrEqual(4);
      expect(
        pixelDifference.meanAbsoluteChannelDifference,
        `${backend}: grid-only pixels changed after render-frame rebase: ${JSON.stringify(pixelDifference)}`,
      ).toBeLessThan(3);
      expect(
        pixelDifference.changedPixelRatio,
        `${backend}: too many grid-only pixels changed after render-frame rebase: ${JSON.stringify(pixelDifference)}`,
      ).toBeLessThan(0.08);

      await target.evaluate((frame) => {
        const bridge = (globalThis as unknown as GraphicsTestBridgeWindow).__TAU_SECTION_VIEW_TEST__!;
        bridge.setRenderFrame(frame);
        bridge.setPostProcessingEnabled(true);
      }, before.frame);
      await target.delay(750);
      const beforeAoPixels = await target.screenshot(canvas);
      await target.evaluate((current) => {
        const bridge = (globalThis as unknown as GraphicsTestBridgeWindow).__TAU_SECTION_VIEW_TEST__!;
        const scale = current.metersPerRenderUnit * 1000;
        bridge.setRenderFrame({
          anchorFrameId: current.anchorFrameId,
          originMeters: [scale * 10, -scale * 20, scale * 30],
          metersPerRenderUnit: scale,
        });
      }, before.frame);
      await target.delay(250);
      const afterAoPixels = await target.screenshot(canvas);
      const aoDifference = await compareCanvasFrames(beforeAoPixels, afterAoPixels, 'center');
      expect(
        aoDifference.meanAbsoluteChannelDifference,
        `${backend}: central model/AO pixels changed after render-frame rebase: ${JSON.stringify(aoDifference)}`,
      ).toBeLessThan(3);
      expect(
        aoDifference.changedPixelRatio,
        `${backend}: too many central model/AO pixels changed after render-frame rebase: ${JSON.stringify(aoDifference)}`,
      ).toBeLessThan(0.08);
      await assertCanvasHasNonBackgroundPixels(previewCanvasSelector, `${backend} render-frame rebase`);
    });

    test(`framed GLTF grid fade distinguishes near and far clipping controls on ${backend}`, async () => {
      await target.navigate(`${edgeOcclusionFixturePath}?graphicsBackend=${backend}`);
      await waitForGraphicsViewer();
      await waitForGraphicsTestBridge();
      await target.evaluate(() => {
        const bridge = (globalThis as unknown as GraphicsTestBridgeWindow).__TAU_SECTION_VIEW_TEST__!;
        bridge.setPostProcessingEnabled(false);
        bridge.setPresentation({ surfaces: false, lines: false });
        bridge.setCamera({ position: [1, -1, 0.7], target: [0, 0, 0], fov: 60, zoom: 1 });
      });
      await target.delay(500);

      const canvas = selectors.getByCss(previewCanvasSelector).first();
      const paddedPixels = await target.screenshot(canvas, `grid-fade-padded-${backend}.png`);
      const paddedCamera = await target.evaluate(() => {
        return (globalThis as unknown as GraphicsTestBridgeWindow).__TAU_SECTION_VIEW_TEST__!.getCamera();
      });

      await target.evaluate(() => {
        (globalThis as unknown as GraphicsTestBridgeWindow).__TAU_SECTION_VIEW_TEST__!.setGridPresentationClipPolicy({
          far: true,
          near: false,
        });
      });
      await target.delay(250);
      const nearClippedPixels = await target.screenshot(canvas, `grid-fade-no-near-control-${backend}.png`);
      const farOnlyCamera = await target.evaluate(() => {
        return (globalThis as unknown as GraphicsTestBridgeWindow).__TAU_SECTION_VIEW_TEST__!.getCamera();
      });

      await target.evaluate(() => {
        (globalThis as unknown as GraphicsTestBridgeWindow).__TAU_SECTION_VIEW_TEST__!.setGridPresentationClipPolicy({
          far: false,
          near: true,
        });
      });
      await target.delay(250);
      const farClippedPixels = await target.screenshot(canvas, `grid-fade-no-far-control-${backend}.png`);
      const nearOnlyCamera = await target.evaluate(() => {
        return (globalThis as unknown as GraphicsTestBridgeWindow).__TAU_SECTION_VIEW_TEST__!.getCamera();
      });

      await target.evaluate(() => {
        (globalThis as unknown as GraphicsTestBridgeWindow).__TAU_SECTION_VIEW_TEST__!.setGridPresentationClipPolicy({
          far: true,
          near: true,
        });
      });
      await target.delay(250);
      const restoredPixels = await target.screenshot(canvas, `grid-fade-restored-${backend}.png`);
      const [paddedProfile, nearClippedProfile, farClippedProfile, restoredProfile] = await Promise.all([
        sampleGridFadeRows(paddedPixels),
        sampleGridFadeRows(nearClippedPixels),
        sampleGridFadeRows(farClippedPixels),
        sampleGridFadeRows(restoredPixels),
      ]);
      const summarizeProfile = ({ rowDetail: _rowDetail, ...summary }: GridFadeRowProfile) => summary;
      const context = JSON.stringify({
        paddedCamera,
        farOnlyCamera,
        nearOnlyCamera,
        paddedProfile: summarizeProfile(paddedProfile),
        nearClippedProfile: summarizeProfile(nearClippedProfile),
        farClippedProfile: summarizeProfile(farClippedProfile),
        restoredProfile: summarizeProfile(restoredProfile),
      });

      expect(paddedCamera.clipping.near).toBeLessThan(farOnlyCamera.clipping.near);
      expect(paddedCamera.clipping.far).toBe(farOnlyCamera.clipping.far);
      expect(paddedCamera.clipping.near).toBe(nearOnlyCamera.clipping.near);
      expect(paddedCamera.clipping.far - nearOnlyCamera.clipping.far).toBeCloseTo(paddedCamera.verticalSpan * 4, 10);
      expect(paddedCamera.nativeClipping.far - nearOnlyCamera.nativeClipping.far).toBeCloseTo(
        (paddedCamera.verticalSpan * 4) / (paddedCamera.clipping.far / paddedCamera.nativeClipping.far),
        8,
      );
      expect(restoredProfile.peakDetail, `${backend}: restored grid must contain detail. ${context}`).toBeGreaterThan(
        1,
      );
      expect(
        restoredProfile.maximumAbsoluteNormalizedStep,
        `${backend}: restored fade retained a row-wide hard edge. ${context}`,
      ).toBeLessThan(0.1);
      expect(
        nearClippedProfile.maximumNegativeNormalizedStep,
        `${backend}: no-near positive control did not reproduce the lower row-wide clip. ${context}`,
      ).toBeGreaterThan(restoredProfile.maximumNegativeNormalizedStep * 1.4);
      expect(
        nearClippedProfile.fallRows,
        `${backend}: no-near positive control did not collapse the lower fade envelope. ${context}`,
      ).toBeLessThan(restoredProfile.fallRows * 0.25);
      expect(
        farClippedProfile.maximumPositiveNormalizedStep,
        `${backend}: no-far positive control did not reproduce the upper row-wide clip. ${context}`,
      ).toBeGreaterThan(restoredProfile.maximumPositiveNormalizedStep * 3);
      expect(restoredProfile.riseRows, `${backend}: restored fade must span multiple rows. ${context}`).toBeGreaterThan(
        8,
      );
      expect(
        Math.abs(restoredProfile.maximumAbsoluteNormalizedStep - paddedProfile.maximumAbsoluteNormalizedStep),
        `${backend}: restoring the policy did not reproduce the initial padded frame. ${context}`,
      ).toBeLessThan(0.02);
    });

    for (const cameraCase of [
      { label: 'perspective-above', fov: 60, position: [1, -1, 0.7], crossesPlane: false },
      { label: 'perspective-below', fov: 60, position: [1, -1, -0.7], crossesPlane: false },
      { label: 'orthographic-above', fov: 0, position: [1, -1, 0.7], crossesPlane: false },
      { label: 'orthographic-below', fov: 0, position: [1, -1, -0.7], crossesPlane: false },
      { label: 'orthographic-shallow-above', fov: 0, position: [1, -1, 0.01], crossesPlane: true },
      { label: 'orthographic-shallow-below', fov: 0, position: [1, -1, -0.01], crossesPlane: true },
    ] as const) {
      test(`framed GLTF keeps the complete radial grid fade for ${cameraCase.label} on ${backend}`, async () => {
        await target.navigate(`${edgeOcclusionFixturePath}?graphicsBackend=${backend}`);
        await waitForGraphicsViewer();
        await waitForGraphicsTestBridge();
        await target.evaluate(({ fov, position }) => {
          const bridge = (globalThis as unknown as GraphicsTestBridgeWindow).__TAU_SECTION_VIEW_TEST__!;
          bridge.setPostProcessingEnabled(false);
          bridge.setPresentation({ surfaces: false, lines: false });
          bridge.setCamera({ position, target: [0, 0, 0], fov, zoom: 1 });
          bridge.setGridPresentationClipPolicy({ far: true, near: true });
        }, cameraCase);
        await target.delay(500);

        const canvas = selectors.getByCss(previewCanvasSelector).first();
        const protectedPixels = await target.screenshot(
          canvas,
          `grid-fade-${cameraCase.label}-protected-${backend}.png`,
        );
        const protectedCamera = await target.evaluate(() => {
          return (globalThis as unknown as GraphicsTestBridgeWindow).__TAU_SECTION_VIEW_TEST__!.getCamera();
        });

        await target.evaluate(() => {
          (globalThis as unknown as GraphicsTestBridgeWindow).__TAU_SECTION_VIEW_TEST__!.setGridPresentationClipPolicy({
            far: true,
            near: false,
          });
        });
        await target.delay(250);
        const unprotectedPixels = await target.screenshot(
          canvas,
          `grid-fade-${cameraCase.label}-no-near-control-${backend}.png`,
        );
        const farOnlyCamera = await target.evaluate(() => {
          return (globalThis as unknown as GraphicsTestBridgeWindow).__TAU_SECTION_VIEW_TEST__!.getCamera();
        });

        await target.evaluate(() => {
          (globalThis as unknown as GraphicsTestBridgeWindow).__TAU_SECTION_VIEW_TEST__!.setGridPresentationClipPolicy({
            far: true,
            near: true,
          });
        });
        await target.delay(250);
        const restoredPixels = await target.screenshot(canvas, `grid-fade-${cameraCase.label}-restored-${backend}.png`);
        const [protectedProfile, unprotectedProfile, restoredProfile, clippedPixels, restoredPixelDifference] =
          await Promise.all([
            sampleGridFadeRows(protectedPixels),
            sampleGridFadeRows(unprotectedPixels),
            sampleGridFadeRows(restoredPixels),
            compareCanvasFrames(protectedPixels, unprotectedPixels),
            compareCanvasFrames(protectedPixels, restoredPixels),
          ]);
        const summarizeProfile = ({ rowDetail: _rowDetail, ...summary }: GridFadeRowProfile) => summary;
        const context = JSON.stringify({
          backend,
          cameraCase,
          protectedCamera,
          farOnlyCamera,
          protectedProfile: summarizeProfile(protectedProfile),
          unprotectedProfile: summarizeProfile(unprotectedProfile),
          restoredProfile: summarizeProfile(restoredProfile),
          clippedPixels,
          restoredPixelDifference,
        });

        expect(
          protectedCamera.clipping.near,
          `${backend}/${cameraCase.label}: presentation near did not contain the guarded plane. ${context}`,
        ).toBeLessThan(farOnlyCamera.clipping.near);
        expect(protectedCamera.clipping.far).toBe(farOnlyCamera.clipping.far);
        if (cameraCase.crossesPlane) {
          expect(
            protectedCamera.nativeClipping.near,
            `${backend}/${cameraCase.label}: native orthographic near did not contain the signed guarded depth. ${context}`,
          ).toBeLessThanOrEqual(0);
          expect(farOnlyCamera.nativeClipping.near).toBeGreaterThan(0);
          expect(
            Math.abs(protectedCamera.clipping.near / (protectedCamera.controlsDistance * 1e-9) - 1),
            `${backend}/${cameraCase.label}: crossing did not select the distance-relative near floor. ${context}`,
          ).toBeLessThan(1e-10);
          expect(
            restoredProfile.peakDetail,
            `${backend}/${cameraCase.label}: protected crossing did not recover clipped grid detail. ${context}`,
          ).toBeGreaterThan(unprotectedProfile.peakDetail * 1.2);
          expect(
            clippedPixels.changedPixelRatio,
            `${backend}/${cameraCase.label}: no-near control did not change visible grid pixels. ${context}`,
          ).toBeGreaterThan(0.005);
        } else {
          expect(
            restoredProfile.maximumAbsoluteNormalizedStep,
            `${backend}/${cameraCase.label}: restored underside fade retained a hard edge. ${context}`,
          ).toBeLessThan(0.1);
          expect(
            unprotectedProfile.maximumAbsoluteNormalizedStep,
            `${backend}/${cameraCase.label}: no-near control did not reproduce an underside hard edge. ${context}`,
          ).toBeGreaterThan(restoredProfile.maximumAbsoluteNormalizedStep * 1.4);
        }
        expect(
          Math.abs(restoredProfile.maximumAbsoluteNormalizedStep - protectedProfile.maximumAbsoluteNormalizedStep),
          `${backend}/${cameraCase.label}: restoring the policy did not reproduce the protected frame. ${context}`,
        ).toBeLessThan(0.02);
        expect(
          restoredPixelDifference.changedPixelRatio,
          `${backend}/${cameraCase.label}: restoring the policy changed protected pixels. ${context}`,
        ).toBeLessThan(0.005);
      });
    }

    test(`zero-FOV crossings render continuously without stale camera frames on ${backend}`, async () => {
      await target.navigate(`${edgeOcclusionFixturePath}?graphicsBackend=${backend}`);
      await waitForGraphicsViewer();
      await waitForGraphicsTestBridge();
      await target.evaluate(() => {
        const bridge = (globalThis as unknown as GraphicsTestBridgeWindow).__TAU_SECTION_VIEW_TEST__;
        bridge?.setPostProcessingEnabled(false);
        bridge?.resetCameraTransitionDiagnostics();
      });

      const orthographicCamera = await setFovAngleAndWait(0);
      expect(orthographicCamera.handoffFov).toBeGreaterThan(0);
      const matrix = [orthographicCamera.handoffFov!, 0, 0.1, 60] as const;
      const crossings = Array.from({ length: 40 }, (_, index) => (index % 2 === 0 ? 0 : 0.1));
      const angles = [...matrix, ...crossings];
      /* oxlint-disable no-await-in-loop -- each assertion must observe the frame produced by the preceding camera state. */
      for (const angle of angles) {
        await setFovAngleAndWait(angle);
        await assertCanvasHasNonBackgroundPixels(
          previewCanvasSelector,
          `${backend} camera handoff at ${angle} degrees`,
        );
      }
      /* oxlint-enable no-await-in-loop -- sequential camera observation ends. */

      const diagnostics = await target.evaluate(() => {
        const bridge = (globalThis as unknown as GraphicsTestBridgeWindow).__TAU_SECTION_VIEW_TEST__;
        return bridge?.getCameraTransitionDiagnostics();
      });
      expect(diagnostics?.requests).toBe(angles.length + 1);
      expect(diagnostics?.frames).toBe(angles.length + 1);
      expect(diagnostics?.actorSyncFailures).toBe(0);
      expect(diagnostics?.staleFrames).toBe(0);
      expect(
        diagnostics?.maximumRequestToActorSyncMilliseconds,
        `${backend}: actor-to-native-camera synchronization must remain synchronous`,
      ).toBeLessThan(50);
      if (target.currentWebGpuProfile() === 'hardware') {
        expect(
          diagnostics?.maximumRequestToFrameMilliseconds,
          `${backend}: hardware endpoint switches should reach a rendered frame without a transition delay`,
        ).toBeLessThan(100);
      }
    });

    test(`post-processing keeps one live render owner across zero-FOV crossings on ${backend}`, async () => {
      await target.navigate(`${edgeOcclusionFixturePath}?graphicsBackend=${backend}`);
      await waitForGraphicsViewer();
      await waitForGraphicsTestBridge();
      await target.evaluate(() => {
        const bridge = (globalThis as unknown as GraphicsTestBridgeWindow).__TAU_SECTION_VIEW_TEST__;
        bridge?.setPostProcessingEnabled(true);
        bridge?.resetCameraTransitionDiagnostics();
      });

      /* oxlint-disable no-await-in-loop -- each assertion must observe the frame produced by the preceding camera state. */
      for (const angle of [0, 0.1, 0] as const) {
        await setFovAngleAndWait(angle);
        await assertCanvasHasNonBackgroundPixels(
          previewCanvasSelector,
          `${backend} post-processing camera handoff at ${angle} degrees`,
        );
      }
      /* oxlint-enable no-await-in-loop -- sequential camera observation ends. */

      const diagnostics = await target.evaluate(() => {
        const bridge = (globalThis as unknown as GraphicsTestBridgeWindow).__TAU_SECTION_VIEW_TEST__;
        return bridge?.getCameraTransitionDiagnostics();
      });
      expect(diagnostics?.requests).toBe(3);
      expect(diagnostics?.frames).toBe(3);
      expect(diagnostics?.actorSyncFailures).toBe(0);
      expect(diagnostics?.staleFrames).toBe(0);
    });

    test(`viewport gizmo animation progresses smoothly through Tau CameraControls on ${backend}`, async () => {
      await target.navigate(`${edgeOcclusionFixturePath}?graphicsBackend=${backend}`);

      await waitForGraphicsViewer();

      await waitForGraphicsTestBridge();
      await target.evaluate(() => {
        const bridge = (globalThis as unknown as GraphicsTestBridgeWindow).__TAU_SECTION_VIEW_TEST__;
        if (!bridge) {
          throw new Error('Graphics e2e bridge is not installed.');
        }

        bridge.setPostProcessingEnabled(false);

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

  test('no WebGPU validation errors emit during a Birdhouse preview render', async () => {
    const messageStart = await consoleMessageCount();

    await target.navigate(`${birdhouseFixturePath}?graphicsBackend=webgpu`);

    await waitForGraphicsViewer();
    await waitForGraphicsTestBridge();

    // Drain any async console messages that have not flushed yet.
    await target.delay(250);

    const failures = await webGpuValidationFailures(messageStart);
    expect(failures, `WebGPU validation errors leaked to the console:\n${failures.join('\n')}`).toEqual([]);
  });

  test('canvas pixel histogram detects "render went invisible" regressions', async () => {
    const messageStart = await consoleMessageCount();

    await target.navigate(`${birdhouseFixturePath}?graphicsBackend=webgpu`);

    await waitForGraphicsViewer();
    await waitForGraphicsTestBridge();

    // Give the canvas a few frames after geometry arrival to let the post-pipeline warmup
    // resolve (compileAsync IIFE in PostProcessingWebGPU) and the priority-2 overlay scene
    // (grid + axes) to land at least one frame into the canvas depth + colour attachments.
    await target.delay(750);

    await assertCanvasHasNonBackgroundPixels(previewCanvasSelector, 'Birdhouse preview canvas after first render');

    // Cross-check: pixel-histogram regressions should not be paired with WebGPU validation
    // noise; if they are, the validation message is more diagnostic than the pixel check.
    const failures = await webGpuValidationFailures(messageStart);
    expect(
      failures,
      `Pixel-histogram check passed but WebGPU validation errors were observed:\n${failures.join('\n')}`,
    ).toEqual([]);
  });

  test('WebGPU harness reports invalid WGSL, exact compute, and expected device loss', async () => {
    await target.navigate(`${birdhouseFixturePath}?graphicsBackend=webgpu`);
    await waitForGraphicsViewer();
    await waitForGraphicsTestBridge();
    const result = await target.qualifyWebGpu();

    expect(result.deviceAvailable).toBe(true);
    expect(result.validShaderErrors).toBe(0);
    expect(result.invalidShaderErrors).toBeGreaterThan(0);
    expect(result.computeReadback).toBe(42);
    expect(result.expectedDeviceLossReason).toBe('destroyed');
    expect(result.uncapturedErrors).toEqual([]);
    expect(result.qualificationErrors).toEqual([]);
  });

  test('WebGL harness observes a deliberately invalid shader compile', async () => {
    const result = await target.evaluate(() => {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('webgl2');
      if (!context) {
        return undefined;
      }
      const shader = context.createShader(context.VERTEX_SHADER);
      if (!shader) {
        return undefined;
      }
      context.shaderSource(shader, '#version 300 es\nthis is not valid GLSL');
      context.compileShader(shader);
      const compiled = context.getShaderParameter(shader, context.COMPILE_STATUS) as boolean;
      const log = context.getShaderInfoLog(shader);
      context.deleteShader(shader);
      return { compiled, log };
    });

    expect(result).toBeDefined();
    expect(result?.compiled).toBe(false);
    expect(result?.log).toBeTruthy();
  });

  const edgeOcclusionCameras = [
    { label: 'orthographic', distance: 0.16, fov: 0 },
    { label: '0.1-degree', distance: 180, fov: 0.1 },
    { label: '30-degree', distance: 0.6, fov: 30 },
    { label: '60-degree', distance: 0.28, fov: 60 },
    { label: '90-degree', distance: 0.16, fov: 90 },
  ] as const;

  for (const backend of ['webgl', 'webgpu'] as const satisfies readonly GraphicsBackend[]) {
    for (const camera of edgeOcclusionCameras) {
      test(`${camera.label} ${backend} keeps nearby rear GLTF edges occluded behind the front slab`, async () => {
        const messageStart = backend === 'webgpu' ? await consoleMessageCount() : 0;
        const stats = await renderAndSampleEdgeOcclusionFixture(backend, camera);
        const context = `${backend} ${camera.label} edge occlusion fixture`;
        expectFrontSlabDominates(stats, context);
        expectRearEdgesStayOccluded(stats, context);

        if (backend === 'webgpu') {
          const failures = await webGpuValidationFailures(messageStart);
          expect(failures, `WebGPU validation errors leaked to the console:\n${failures.join('\n')}`).toEqual([]);
        }
      });
    }
  }
});
