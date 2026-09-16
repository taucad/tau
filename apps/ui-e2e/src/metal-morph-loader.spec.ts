import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

/**
 * Metal morph loader backend evidence (`shader-policy.ts` site `metal-morph-loader`).
 *
 * The `/loader` route exposes `__TAU_METAL_MORPH__` under `TAU_DEBUG`; the spec drives both node-renderer
 * backends through the `?graphicsBackend=` override, reads the generated shader stages, reads a frame back
 * through each backend for a chrome signature (independent of canvas presentation, which headless WebGPU
 * adapters may not provide), samples the presented WebGL canvas, and checks the loop keeps advancing without
 * WebGPU validation noise.
 */

type LoaderBackend = 'webgl' | 'webgpu';

type LoaderState = Readonly<{
  backend: 'webgl2' | 'webgpu';
  currentShape: string;
  framesPerSecond: number;
  history: readonly string[];
  isBloomEnabled: boolean;
  isPlaying: boolean;
  nextShape: string;
  phase: 'morph' | 'rest';
  status: 'failed' | 'pending' | 'ready';
  transitionCount: number;
  vertexCount: number;
}>;

type LoaderCapture = Readonly<{
  backend: 'webgl2' | 'webgpu';
  bodyContrast: number;
  bodyLuminance: number;
  cornerAlpha: number;
  coverage: number;
  distinctColors: number;
  highlightShare: number;
  shadowShare: number;
  size: number;
}>;

type LoaderBridge = Readonly<{
  captureFrame: () => Promise<LoaderCapture>;
  getShaderSource: () => Promise<{ readonly fragmentShader: string; readonly vertexShader: string }>;
  getState: () => LoaderState;
}>;

type LoaderWindow = typeof globalThis & { __TAU_METAL_MORPH__?: LoaderBridge };

/** Document-space rectangle of the stage inside a full-page screenshot. */
type StageRegion = Readonly<{
  height: number;
  width: number;
  x: number;
  y: number;
}>;

type StageStatistics = Readonly<{
  centreContrast: number;
  centreLuminance: number;
  cornerSpread: number;
  distinctBuckets: number;
  dominantShare: number;
  highlightShare: number;
  shadowShare: number;
}>;

const webgpuValidationPatterns: readonly RegExp[] = [
  /Vertex buffer slot \d+ required/,
  /Invalid CommandBuffer/,
  /depth-stencil format mismatch/,
  /uncaptured error/i,
  /shader compilation error/i,
];

const stageName = /liquid metal loader showcase/i;
const expectedVertexCount = 40_962;

const readState = async (): Promise<LoaderState | undefined> =>
  target.evaluate(() => (globalThis as LoaderWindow).__TAU_METAL_MORPH__?.getState());

const readField = async <Key extends keyof LoaderState>(key: Key): Promise<LoaderState[Key] | undefined> => {
  const state = await readState();
  return state?.[key];
};

/** Read the current pose back through the active backend and keep the statistics as a test artifact. */
const captureStage = async (name: string): Promise<LoaderCapture> => {
  const capture = await target.evaluate(async () => (globalThis as LoaderWindow).__TAU_METAL_MORPH__?.captureFrame());
  if (!capture) {
    throw new Error('The metal morph loader debug bridge is missing.');
  }
  await target.writeArtifact(`metal-morph-capture-${name}.json`, JSON.stringify(capture));
  return capture;
};

/** Milliseconds; software adapters prefilter the studio and compile the pipelines slowly. */
const readyTimeout = 120_000;
/** Milliseconds; two transitions at the default timing plus software-renderer slack. */
const sequenceTimeout = 90_000;
/** Milliseconds for a playback toggle to settle. */
const playbackTimeout = 15_000;

/** Poll from the runner rather than `target.waitFor`: the command transport drops the optional timeout. */
const waitForReady = async (): Promise<LoaderState> => {
  await expect.poll(async () => readField('status'), { timeout: readyTimeout }).toBe('ready');
  const state = await readState();
  if (!state) {
    throw new Error('The metal morph loader debug bridge is missing.');
  }
  return state;
};

/** The consent banner floats over the stage's bottom-right corner until it is answered. */
const dismissCookieBanner = async (): Promise<void> => {
  await target.click(selectors.getByRole('button', { name: /^decline$/iu }), { timeout: 5000 }).catch(() => undefined);
};

/**
 * Downsample the stage out of a page screenshot and describe its tonal signature. A page screenshot is used
 * because an element screenshot waits for the animating stage to hold still, which a software adapter never
 * manages inside the action budget.
 */
const analyseStage = async (pngBase64: string, region: StageRegion): Promise<StageStatistics> =>
  target.evaluate(
    async ({ encoded, stage: crop }) => {
      const image = new Image();
      const loaded = new Promise<void>((resolve, reject) => {
        image.addEventListener('load', () => {
          resolve();
        });
        image.addEventListener('error', () => {
          reject(new Error('Metal morph stage screenshot could not be decoded.'));
        });
      });
      image.src = `data:image/png;base64,${encoded}`;
      await loaded;

      const size = 64;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('2D canvas is unavailable for stage qualification.');
      }
      context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, size, size);
      const pixels = context.getImageData(0, 0, size, size).data;
      const histogram = new Map<number, number>();
      const centre: number[] = [];
      const corners: number[] = [];
      let highlights = 0;
      let shadows = 0;
      const cornerReach = 6;
      // The renderer badge sits over the top-left corner, so the page surface is sampled at the other three.
      const isBadgeCorner = (x: number, y: number): boolean => x < cornerReach && y < cornerReach;
      for (let index = 0; index < pixels.length; index += 4) {
        const luminance = (pixels[index]! * 0.2126 + pixels[index + 1]! * 0.7152 + pixels[index + 2]! * 0.0722) / 255;
        const bucket =
          Math.floor(pixels[index]! / 8) * 1024 +
          Math.floor(pixels[index + 1]! / 8) * 32 +
          Math.floor(pixels[index + 2]! / 8);
        histogram.set(bucket, (histogram.get(bucket) ?? 0) + 1);
        const pixelIndex = index / 4;
        const x = pixelIndex % size;
        const y = Math.floor(pixelIndex / size);
        const dx = x - (size - 1) / 2;
        const dy = y - (size - 1) / 2;
        if (dx * dx + dy * dy <= (size * 0.22) ** 2) {
          centre.push(luminance);
          if (luminance > 0.85) {
            highlights += 1;
          }
          if (luminance < 0.25) {
            shadows += 1;
          }
        }
        const nearCorner = (x < cornerReach || x >= size - cornerReach) && (y < cornerReach || y >= size - cornerReach);
        if (nearCorner && !isBadgeCorner(x, y)) {
          corners.push(luminance);
        }
      }
      const mean = centre.reduce((sum, value) => sum + value, 0) / centre.length;
      const variance = centre.reduce((sum, value) => sum + (value - mean) ** 2, 0) / centre.length;
      return {
        centreContrast: Math.sqrt(variance),
        centreLuminance: mean,
        cornerSpread: Math.max(...corners) - Math.min(...corners),
        distinctBuckets: histogram.size,
        dominantShare: Math.max(...histogram.values()) / (size * size),
        highlightShare: highlights / centre.length,
        shadowShare: shadows / centre.length,
      };
    },
    { encoded: pngBase64, stage: region },
  );

/** Screenshot the page and locate the stage within it, in document coordinates. */
const screenshotStage = async (artifactName: string): Promise<{ png: string; region: StageRegion }> => {
  const box = await target.boundingBox(selectors.getByRole('img', { name: stageName }));
  if (!box) {
    throw new Error('The metal morph stage has no bounding box.');
  }
  const scroll = await target.evaluate(() => ({ x: globalThis.scrollX, y: globalThis.scrollY }));
  const png = await target.screenshot(undefined, artifactName);
  return { png, region: { x: box.x + scroll.x, y: box.y + scroll.y, width: box.width, height: box.height } };
};

const hasSameShapePairRun = (history: readonly string[]): boolean => {
  for (let end = 4; end <= history.length; end += 1) {
    const run = history.slice(end - 4, end);
    if (new Set(run).size === 2 && run.every((shape, index) => index === 0 || shape !== run[index - 1])) {
      return true;
    }
  }
  return false;
};

/** Reduced motion holds the loop at its deterministic first frame, so both backends draw the same pose. */
const captureRestingStage = async (backend: LoaderBackend): Promise<LoaderCapture> => {
  await target.navigate(`/loader?graphicsBackend=${backend}`);
  const state = await waitForReady();
  expect(state.isPlaying).toBe(false);
  const capture = await captureStage(`resting-${backend}`);
  expect(capture.backend).toBe(backend === 'webgpu' ? 'webgpu' : 'webgl2');
  return capture;
};

const expectNoRendererNoise = async (pageErrorStart: number, consoleStart: number): Promise<void> => {
  const events = await target.events();
  expect(events.pageErrors.slice(pageErrorStart)).toEqual([]);
  const validationNoise = events.consoleMessages
    .slice(consoleStart)
    .filter((message) => webgpuValidationPatterns.some((pattern) => pattern.test(message.text)));
  expect(validationNoise).toEqual([]);
};

test.describe('metal morph loader', () => {
  for (const backend of ['webgpu', 'webgl'] as const satisfies readonly LoaderBackend[]) {
    test(`compiles the liquid metal body through Three ${backend}`, async () => {
      const initial = await target.events();
      await target.navigate(`/loader?graphicsBackend=${backend}`);
      const state = await waitForReady();
      expect(state.backend).toBe(backend === 'webgpu' ? 'webgpu' : 'webgl2');

      const source = await target.evaluate(async () =>
        (globalThis as LoaderWindow).__TAU_METAL_MORPH__?.getShaderSource(),
      );
      expect(source?.vertexShader.length).toBeGreaterThan(1000);
      expect(source?.fragmentShader.length).toBeGreaterThan(1000);
      if (backend === 'webgpu') {
        expect(source?.vertexShader).toContain('@vertex');
        expect(source?.fragmentShader).toContain('@fragment');
      } else {
        expect(source?.vertexShader).toContain('#version 300 es');
        expect(source?.fragmentShader).toContain('#version 300 es');
      }
      expect(source?.vertexShader).toContain('shapeSample4');
      await expectNoRendererNoise(initial.pageErrors.length, initial.consoleMessages.length);
    });

    test(`renders a chrome body with highlights and dark facets through ${backend}`, async () => {
      await target.navigate(`/loader?graphicsBackend=${backend}`);
      const state = await waitForReady();
      expect(state.backend).toBe(backend === 'webgpu' ? 'webgpu' : 'webgl2');

      const capture = await captureStage(`body-${backend}`);
      expect(capture.backend).toBe(state.backend);
      expect(capture.size).toBe(256);
      expect(capture.coverage, `${backend}: the body must fill a fair share of the stage`).toBeGreaterThan(0.08);
      expect(capture.coverage, `${backend}: the body must leave air around it`).toBeLessThan(0.75);
      expect(capture.distinctColors, `${backend}: chrome must carry a wide tonal range`).toBeGreaterThan(40);
      expect(
        capture.bodyContrast,
        `${backend}: fillets and flats must alternate highlights and shadows`,
      ).toBeGreaterThan(0.08);
      expect(
        capture.highlightShare + capture.shadowShare,
        `${backend}: chrome needs both bright and dark regions`,
      ).toBeGreaterThan(0.05);
    });

    test(`keeps the transparent canvas clear outside the body silhouette through ${backend}`, async () => {
      await target.navigate(`/loader?graphicsBackend=${backend}`);
      await waitForReady();

      const capture = await captureStage(`corners-${backend}`);
      expect(
        capture.cornerAlpha,
        `${backend}: the readback corners must stay clear of the body and its halo`,
      ).toBeLessThan(0.05);
      if (backend === 'webgl') {
        // The presented canvas composites over the page; WebGL always presents, headless WebGPU may not.
        await dismissCookieBanner();
        await target.delay(300);
        const { png, region } = await screenshotStage(`metal-morph-page-corners-${backend}.png`);
        const stage = await analyseStage(png, region);
        expect(stage.cornerSpread, 'the page surface must show through the canvas corners').toBeLessThan(0.08);
        expect(stage.distinctBuckets, 'the presented canvas must carry the chrome').toBeGreaterThan(40);
        expect(stage.centreContrast, 'the presented canvas must alternate highlights and shadows').toBeGreaterThan(
          0.08,
        );
      }
    });

    test(`advances the sequence under the pair rule and holds when paused through ${backend}`, async () => {
      await target.navigate(`/loader?graphicsBackend=${backend}`);
      await waitForReady();
      await expect
        .poll(async () => readField('transitionCount'), { timeout: sequenceTimeout })
        .toBeGreaterThanOrEqual(2);
      const advanced = await readState();
      expect(advanced?.history.length).toBeGreaterThanOrEqual(3);
      expect(hasSameShapePairRun(advanced?.history ?? [])).toBe(false);
      expect(new Set(advanced?.history).size).toBeGreaterThanOrEqual(2);

      await target.click(selectors.getByRole('button', { name: /pause loader animation/i }));
      await expect.poll(async () => readField('isPlaying'), { timeout: playbackTimeout }).toBe(false);
      const paused = await readState();
      await target.delay(400);
      const held = await readState();
      expect(held?.transitionCount).toBe(paused?.transitionCount);
      expect(held?.isPlaying).toBe(false);

      await target.click(selectors.getByRole('button', { name: /play loader animation/i }));
      await expect.poll(async () => readField('isPlaying'), { timeout: playbackTimeout }).toBe(true);
    });
  }

  test('renders one body of 40,962 vertices with the bloom chain enabled', async () => {
    await target.navigate('/loader?graphicsBackend=webgpu');
    const state = await waitForReady();
    expect(state.vertexCount).toBe(expectedVertexCount);
    expect(state.isBloomEnabled).toBe(true);
    expect(state.history).toHaveLength(1);
  });

  test('sustains the loop under a bounded frame interval', async () => {
    await target.navigate('/loader?graphicsBackend=webgpu');
    await waitForReady();
    await target.delay(500);
    const intervals = await target.evaluate(
      async () =>
        new Promise<number[]>((resolve) => {
          const samples: number[] = [];
          let previous = performance.now();
          const tick = (now: number): void => {
            samples.push(now - previous);
            previous = now;
            if (samples.length >= 90) {
              resolve(samples.slice(10));
              return;
            }
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
    );
    const sorted = [...intervals].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    const p95 = sorted[Math.floor(sorted.length * 0.95)]!;
    const state = await readState();
    await target.writeArtifact(
      'metal-morph-frame-timing.json',
      JSON.stringify({
        backend: state?.backend,
        median,
        p95,
        samples: sorted.length,
        framesPerSecond: state?.framesPerSecond,
      }),
    );
    expect(median, 'median frame interval in milliseconds').toBeLessThan(400);
  });

  test('renders the same resting silhouette on both backends', async () => {
    await target.emulateReducedMotion('reduce');
    try {
      const webgpu = await captureRestingStage('webgpu');
      const webgl = await captureRestingStage('webgl');
      expect(Math.abs(webgpu.coverage - webgl.coverage)).toBeLessThan(0.03);
      expect(Math.abs(webgpu.bodyLuminance - webgl.bodyLuminance)).toBeLessThan(0.12);
      expect(Math.abs(webgpu.bodyContrast - webgl.bodyContrast)).toBeLessThan(0.1);
      expect(Math.abs(webgpu.highlightShare - webgl.highlightShare)).toBeLessThan(0.15);
    } finally {
      await target.emulateReducedMotion('no-preference');
    }
  });
});
