import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

/**
 * Metal morph loader backend evidence (`shader-policy.ts` site `metal-morph-loader`).
 *
 * The `/loader` route exposes `__TAU_METAL_MORPH__` under `TAU_DEBUG`; the spec drives both node-renderer
 * backends through the `?graphicsBackend=` override, reads the generated shader stages, samples the rendered
 * stage for a chrome signature and checks the loop keeps advancing without WebGPU validation noise.
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

type LoaderBridge = Readonly<{
  getShaderSource: () => Promise<{ readonly fragmentShader: string; readonly vertexShader: string }>;
  getState: () => LoaderState;
}>;

type LoaderWindow = typeof globalThis & { __TAU_METAL_MORPH__?: LoaderBridge };

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

const waitForReady = async (): Promise<LoaderState> => {
  await target.waitFor(() => (globalThis as LoaderWindow).__TAU_METAL_MORPH__?.getState().status === 'ready');
  const state = await readState();
  if (!state) {
    throw new Error('The metal morph loader debug bridge is missing.');
  }
  return state;
};

const analyseStage = async (pngBase64: string): Promise<StageStatistics> =>
  target.evaluate(async (encoded) => {
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
    context.drawImage(image, 0, 0, size, size);
    const pixels = context.getImageData(0, 0, size, size).data;
    const histogram = new Map<number, number>();
    const centre: number[] = [];
    const corners: number[] = [];
    let highlights = 0;
    let shadows = 0;
    const cornerReach = 6;
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
      if (nearCorner) {
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
  }, pngBase64);

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
const captureRestingStage = async (backend: LoaderBackend): Promise<StageStatistics> => {
  await target.navigate(`/loader?graphicsBackend=${backend}`);
  const state = await waitForReady();
  expect(state.isPlaying).toBe(false);
  await target.delay(300);
  const screenshot = await target.screenshot(
    selectors.getByRole('img', { name: stageName }),
    `metal-morph-resting-${backend}.png`,
  );
  return analyseStage(screenshot);
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
      await waitForReady();
      await target.delay(600);

      const screenshot = await target.screenshot(
        selectors.getByRole('img', { name: stageName }),
        `metal-morph-stage-${backend}.png`,
      );
      const stage = await analyseStage(screenshot);
      expect(stage.distinctBuckets, `${backend}: chrome must carry a wide tonal range`).toBeGreaterThan(40);
      expect(stage.dominantShare, `${backend}: the stage must not collapse to one colour`).toBeLessThan(0.7);
      expect(stage.centreContrast, `${backend}: facets must alternate highlights and shadows`).toBeGreaterThan(0.08);
      expect(
        stage.highlightShare + stage.shadowShare,
        `${backend}: chrome needs both bright and dark facets`,
      ).toBeGreaterThan(0.05);
    });

    test(`keeps the transparent canvas clear outside the body silhouette through ${backend}`, async () => {
      await target.navigate(`/loader?graphicsBackend=${backend}`);
      await waitForReady();
      await target.delay(300);

      const screenshot = await target.screenshot(
        selectors.getByRole('img', { name: stageName }),
        `metal-morph-stage-corners-${backend}.png`,
      );
      const stage = await analyseStage(screenshot);
      expect(stage.cornerSpread, `${backend}: the page surface must show through the canvas corners`).toBeLessThan(
        0.08,
      );
    });

    test(`advances the sequence under the pair rule and holds when paused through ${backend}`, async () => {
      await target.navigate(`/loader?graphicsBackend=${backend}`);
      await waitForReady();
      await target.waitFor(
        () => ((globalThis as LoaderWindow).__TAU_METAL_MORPH__?.getState().transitionCount ?? 0) >= 2,
      );
      const advanced = await readState();
      expect(advanced?.history.length).toBeGreaterThanOrEqual(3);
      expect(hasSameShapePairRun(advanced?.history ?? [])).toBe(false);
      expect(new Set(advanced?.history).size).toBeGreaterThanOrEqual(2);

      await target.click(selectors.getByRole('button', { name: /pause loader animation/i }));
      await target.waitFor(() => (globalThis as LoaderWindow).__TAU_METAL_MORPH__?.getState().isPlaying === false);
      const paused = await readState();
      await target.delay(400);
      const held = await readState();
      expect(held?.transitionCount).toBe(paused?.transitionCount);
      expect(held?.isPlaying).toBe(false);

      await target.click(selectors.getByRole('button', { name: /play loader animation/i }));
      await target.waitFor(() => (globalThis as LoaderWindow).__TAU_METAL_MORPH__?.getState().isPlaying === true);
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
      expect(Math.abs(webgpu.centreLuminance - webgl.centreLuminance)).toBeLessThan(0.12);
      expect(Math.abs(webgpu.centreContrast - webgl.centreContrast)).toBeLessThan(0.1);
      expect(Math.abs(webgpu.dominantShare - webgl.dominantShare)).toBeLessThan(0.2);
    } finally {
      await target.emulateReducedMotion('no-preference');
    }
  });
});
