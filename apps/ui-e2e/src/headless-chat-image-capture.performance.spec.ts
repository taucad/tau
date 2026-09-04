import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';
import {
  readCaptureEvidence,
  seedVisionModel,
  waitForCaptureAttachments,
  waitForRenderedGeometry,
} from '#support/headless-capture.js';
import type { BenchmarkArtifact, BenchmarkSample } from '#support/headless-capture-performance.js';
import {
  benchmarkArtifactSchema,
  readBenchmarkProvenance,
  summarizeSamples,
} from '#support/headless-capture-performance.js';

/* oxlint-disable no-await-in-loop, tau-lint/no-time-unit-suffix -- Samples are sequential; the durable artifact names its millisecond unit explicitly. */

type BenchmarkPageState = {
  workers: string[];
  terminations: number;
  longTasks: number[];
  visible?: { expected: number; startedAt: number; duration?: number };
};

type DebugTimingRecord = Readonly<{
  name: string;
  startTime: number;
  duration: number;
  detail: Readonly<Record<string, unknown>>;
}>;

const attachment = (index: number): Locator => selectors.getByAltText(`Uploaded ${index + 1}`);

const installInstrumentation = async (): Promise<void> => {
  await target.addInitScript(() => {
    const state: BenchmarkPageState = { workers: [], terminations: 0, longTasks: [] };
    (globalThis as typeof globalThis & { __TAU_CAPTURE_BENCHMARK__?: BenchmarkPageState }).__TAU_CAPTURE_BENCHMARK__ =
      state;
    const nativeWorker = globalThis.Worker;
    globalThis.Worker = class extends nativeWorker {
      public constructor(scriptURL: string | URL, options?: WorkerOptions) {
        super(scriptURL, options);
        state.workers.push(options?.name ?? '');
      }

      public override terminate(): void {
        state.terminations += 1;
        super.terminate();
      }
    };
    if ('PerformanceObserver' in globalThis) {
      try {
        new PerformanceObserver((entries) => {
          state.longTasks.push(...entries.getEntries().map(({ duration }) => duration));
        }).observe({ type: 'longtask', buffered: true });
      } catch {
        // The artifact keeps an empty list when this browser omits Long Tasks.
      }
    }
  });
};

const dismissCookies = async (): Promise<void> => {
  await target.click(selectors.getByRole('button', { name: /^decline$/iu }), { timeout: 5000 }).catch(() => undefined);
};

const clearAttachments = async (): Promise<void> => {
  for (;;) {
    const buttons = await target.read(selectors.getByRole('button', { name: /Remove uploaded image/u }));
    if (buttons.count === 0) {
      return;
    }
    await target.click(selectors.getByRole('button', { name: 'Remove uploaded image 1' }));
  }
};

const beginVisibleSample = async (expected: number): Promise<void> => {
  await target.evaluate((count) => {
    const state = (globalThis as typeof globalThis & { __TAU_CAPTURE_BENCHMARK__?: BenchmarkPageState })
      .__TAU_CAPTURE_BENCHMARK__;
    if (!state) {
      throw new Error('Capture benchmark instrumentation is unavailable');
    }
    state.visible = { expected: count, startedAt: performance.now() };
    const recordVisibleFrame = () => {
      if (state.visible && document.querySelectorAll('img[alt^="Uploaded "]').length >= state.visible.expected) {
        state.visible.duration = performance.now() - state.visible.startedAt;
        return;
      }
      requestAnimationFrame(recordVisibleFrame);
    };
    requestAnimationFrame(recordVisibleFrame);
  }, expected);
};

const currentCaptureSize = async (): Promise<readonly [number, number]> => {
  const aspect = await target.evaluate(() => {
    const rect = [...document.querySelectorAll<HTMLCanvasElement>('[data-testid="cad-viewer-canvas-region"] canvas')]
      .map((canvas) => canvas.getBoundingClientRect())
      .find(({ width, height }) => width > 0 && height > 0);
    if (!rect) {
      throw new Error('No visible CAD viewer canvas was found');
    }
    return rect.width / rect.height;
  });
  return aspect >= 1
    ? [2400, Math.max(16, Math.round(2400 / aspect))]
    : [Math.max(16, Math.round(2400 * aspect)), 2400];
};

const finishVisibleSample = async (
  expected: number,
  expectedSize: readonly [number, number],
): Promise<BenchmarkSample> => {
  await waitForCaptureAttachments(expected, 30_000);
  await target.waitFor(() => {
    const state = (globalThis as typeof globalThis & { __TAU_CAPTURE_BENCHMARK__?: BenchmarkPageState })
      .__TAU_CAPTURE_BENCHMARK__;
    return state?.visible?.duration !== undefined;
  });
  const clickToVisibleMs = await target.evaluate(() => {
    const duration = (globalThis as typeof globalThis & { __TAU_CAPTURE_BENCHMARK__?: BenchmarkPageState })
      .__TAU_CAPTURE_BENCHMARK__?.visible?.duration;
    if (duration === undefined) {
      throw new Error('Capture visibility duration is unavailable');
    }
    return duration;
  });
  const evidence = await readCaptureEvidence(attachment(0));
  expect(evidence).toMatchObject({ width: expectedSize[0], height: expectedSize[1] });
  expect(evidence.modelPixels).toBeGreaterThan(100);
  return {
    clickToVisibleMs,
    digest: evidence.digest,
    width: evidence.width,
    height: evidence.height,
    modelPixels: evidence.modelPixels,
  };
};

const captureCurrent = async (): Promise<BenchmarkSample> => {
  await clearAttachments();
  const expectedSize = await currentCaptureSize();
  await beginVisibleSample(1);
  await target.click(selectors.getByRole('button', { name: 'Capture view to chat' }));
  return finishVisibleSample(1, expectedSize);
};

const captureBatch = async (): Promise<BenchmarkSample> => {
  await clearAttachments();
  const editor = selectors.getByCss('.tiptap[contenteditable="true"]');
  await target.fill(editor, '@');
  await target.click(selectors.getByText('Take Screenshot', { exact: true }));
  await beginVisibleSample(6);
  await target.click(selectors.getByRole('button', { name: 'Orthographic views x 6' }));
  return finishVisibleSample(6, [1600, 1600]);
};

const setCamera = async (alternate: boolean): Promise<void> => {
  await target.evaluate((useAlternate) => {
    const bridge = (
      globalThis as {
        __TAU_SECTION_VIEW_TEST__?: {
          setCamera(
            camera: Readonly<{
              position: readonly [number, number, number];
              target: readonly [number, number, number];
              fov: number;
              zoom: number;
            }>,
          ): void;
        };
      }
    ).__TAU_SECTION_VIEW_TEST__;
    bridge?.setCamera(
      useAlternate
        ? { position: [0.105, -0.125, 0.082], target: [0, 0, 0.006], fov: 47, zoom: 1.1 }
        : { position: [0.13, -0.095, 0.075], target: [0, 0, 0.006], fov: 42, zoom: 1 },
    );
  }, alternate);
  await target.evaluate(
    async () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            resolve();
          }),
        );
      }),
  );
};

const distribution = (samples: BenchmarkSample[], warmups: number) => ({
  warmups,
  discarded: [],
  samples,
  summary: summarizeSamples(samples),
});

const takeDebugRecords = async (scenario: string): Promise<unknown[]> =>
  target.evaluate((name) => {
    const bridge = (
      globalThis as typeof globalThis & {
        __TAU_HEADLESS_IMAGE_DEBUG__?: { readonly records: DebugTimingRecord[]; reset(): void };
      }
    ).__TAU_HEADLESS_IMAGE_DEBUG__;
    const records = bridge?.records.map((record) => ({ ...record, scenario: name })) ?? [];
    bridge?.reset();
    return records;
  }, scenario);

const takeLongTasks = async (): Promise<number[]> =>
  target.evaluate(() => {
    const state = (globalThis as typeof globalThis & { __TAU_CAPTURE_BENCHMARK__?: BenchmarkPageState })
      .__TAU_CAPTURE_BENCHMARK__;
    return state?.longTasks.splice(0) ?? [];
  });

test('records canonical GLB capture wall-time distributions', async () => {
  const benchmarkEnvironment = (
    import.meta as ImportMeta & { readonly env: Readonly<Record<string, string | undefined>> }
  ).env;
  const source = benchmarkEnvironment['VITE_TAU_BENCH_SOURCE'] ?? 'candidate';
  const provenance = readBenchmarkProvenance(benchmarkEnvironment);
  const startedAt = new Date().toISOString();
  await seedVisionModel();
  await installInstrumentation();
  await target.setViewport({ width: 1440, height: 960 });

  const firstOverlap: BenchmarkSample[] = [];
  const firstOverlapDiscarded: Array<{ reason: string }> = [];
  const firstOverlapLongTasks: number[] = [];
  const debugRecords: unknown[] = [];
  for (let attempt = 0; firstOverlap.length < 10 && attempt < 12; attempt++) {
    await target.navigate('/__e2e/headless-chat-image-capture');
    await target.expectUrl(/\/w\/[^/]+\/[^/]+$/u, 60_000);
    await dismissCookies();
    await waitForRenderedGeometry('gltf');
    await target.delay(1000);
    await takeLongTasks();
    try {
      firstOverlap.push(await captureCurrent());
      debugRecords.push(...(await takeDebugRecords('firstOverlap')));
      firstOverlapLongTasks.push(...(await takeLongTasks()));
    } catch (error) {
      firstOverlapDiscarded.push({ reason: error instanceof Error ? error.message : String(error) });
    }
  }
  expect(
    firstOverlap,
    `First-overlap capture collected ${firstOverlap.length}/10 samples: ${JSON.stringify(firstOverlapDiscarded)}`,
  ).toHaveLength(10);

  for (let index = 0; index < 3; index++) {
    await captureCurrent();
  }
  await takeLongTasks();
  const exactRepeat: BenchmarkSample[] = [];
  for (let index = 0; index < 30; index++) {
    exactRepeat.push(await captureCurrent());
  }
  debugRecords.push(...(await takeDebugRecords('exactRepeat')));
  const exactRepeatLongTasks = await takeLongTasks();

  for (let index = 0; index < 3; index++) {
    await setCamera(index % 2 !== 0);
    await captureCurrent();
  }
  await takeDebugRecords('discardedWarmup');
  await takeLongTasks();
  const changedCamera: BenchmarkSample[] = [];
  for (let index = 0; index < 30; index++) {
    await setCamera(index % 2 === 0);
    changedCamera.push(await captureCurrent());
  }
  const primaryDigests = new Set(changedCamera.filter((_, index) => index % 2 === 0).map(({ digest }) => digest));
  const alternateDigests = new Set(changedCamera.filter((_, index) => index % 2 !== 0).map(({ digest }) => digest));
  expect(primaryDigests.size).toBe(1);
  expect(alternateDigests.size).toBe(1);
  expect([...primaryDigests][0]).not.toBe([...alternateDigests][0]);
  debugRecords.push(...(await takeDebugRecords('changedCamera')));
  const changedCameraLongTasks = await takeLongTasks();

  for (let index = 0; index < 3; index++) {
    await captureCurrent();
    await takeDebugRecords('discardedWarmup');
    await captureBatch();
    await takeDebugRecords('discardedWarmup');
  }
  await takeLongTasks();
  const sixViewBatch: BenchmarkSample[] = [];
  for (let index = 0; index < 20; index++) {
    await captureCurrent();
    await takeDebugRecords('discardedCacheEviction');
    sixViewBatch.push(await captureBatch());
    debugRecords.push(...(await takeDebugRecords('sixViewBatch')));
  }
  const sixViewBatchLongTasks = await takeLongTasks();

  const environment = await target.evaluate(async (gpuBackend) => {
    const adapter = await (
      navigator as Navigator & {
        readonly gpu: {
          requestAdapter(): Promise<
            | {
                readonly info: {
                  readonly vendor: string;
                  readonly architecture: string;
                  readonly description: string;
                  readonly isFallbackAdapter: boolean;
                };
              }
            | undefined
          >;
        };
      }
    ).gpu.requestAdapter();
    const info = adapter?.info;
    const deviceType: BenchmarkArtifact['environment']['adapter']['deviceType'] = info?.isFallbackAdapter
      ? 'cpu'
      : 'unknown';
    return {
      browser: navigator.userAgent,
      launchArguments:
        gpuBackend === 'metal' ? ['--enable-unsafe-webgpu', '--use-angle=metal'] : ['--enable-unsafe-webgpu'],
      adapter: {
        backend: 'webgpu',
        name: [...new Set([info?.vendor, info?.architecture, info?.description])].filter(Boolean).join(' '),
        deviceType,
      },
      crossOriginIsolated,
      hardwareConcurrency: navigator.hardwareConcurrency,
      viewport: [innerWidth, innerHeight] as [number, number],
    };
  }, benchmarkEnvironment['VITE_TAU_BENCH_GPU_BACKEND'] ?? 'swiftshader');
  const pageState = await target.evaluate(
    () =>
      (globalThis as typeof globalThis & { __TAU_CAPTURE_BENCHMARK__?: BenchmarkPageState }).__TAU_CAPTURE_BENCHMARK__!,
  );
  const artifact: BenchmarkArtifact = {
    schemaVersion: 1,
    source,
    startedAt,
    finishedAt: new Date().toISOString(),
    ...(provenance ? { provenance } : {}),
    environment,
    scenarios: {
      firstOverlap: { ...distribution(firstOverlap, 0), discarded: firstOverlapDiscarded },
      exactRepeat: distribution(exactRepeat, 3),
      changedCamera: distribution(changedCamera, 3),
      sixViewBatch: distribution(sixViewBatch, 3),
    },
    workers: { names: pageState.workers, terminations: pageState.terminations },
    longTasks: {
      firstOverlap: firstOverlapLongTasks,
      exactRepeat: exactRepeatLongTasks,
      changedCamera: changedCameraLongTasks,
      sixViewBatch: sixViewBatchLongTasks,
    },
    debugRecords,
  };
  expect(benchmarkArtifactSchema.parse(artifact)).toEqual(artifact);
  await target.writeArtifact(
    `nanoraster-canonical-glb-performance-${source.replaceAll(/[^a-z0-9-]/giu, '-')}.json`,
    JSON.stringify(artifact, undefined, 2),
  );
}, 900_000);

/* oxlint-enable no-await-in-loop, tau-lint/no-time-unit-suffix -- Benchmark scope ends here. */
