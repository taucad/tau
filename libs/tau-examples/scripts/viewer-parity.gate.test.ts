/**
 * Viewer parity gate (Tau Brain `research/nanoraster-viewer-parity-charter.md`, W6, D2): each fixture's nanoraster
 * capture, rendered from the options Tau sends for the viewer's camera, is within 1% mean absolute RGB difference of
 * the production viewer's frame, with ambient occlusion on and off, through both nanoraster builds Tau ships: the
 * native addon (desktop, the CLI, the MCP host) rendered here, and the WASM build (the web app's image worker) that
 * `viewer-parity.wasm.browser.test.ts` rendered in Chromium just before.
 *
 * Run by `pnpm nx run tau-examples:test:viewer-parity` after `export-parity-fixtures.mts` has generated the fixture
 * GLBs and `pnpm nx run viewer:capture:viewer-parity` has written the viewer references from those same files (the
 * `viewer-parity` workflow does all three on software GPUs). Each GLB's size and SHA-256 are recorded in results.json,
 * not pinned. Inputs:
 *   TAU_PARITY_NANORASTER  nanoraster checkout built with `pnpm run build:napi` and `pnpm run build:wasm`. Until the
 *                          catalog moves to nanoraster 0.9.0 the gate runs against the program branch build the
 *                          workflow pins; afterwards it is unset and the gate runs against the installed package.
 *   PARITY_VIEWER_OUT      viewer references (default: out/test-results/viewer-parity/viewer)
 *   PARITY_OUT             nanoraster renders and results.json (default: out/test-results/viewer-parity/nanoraster)
 *   PARITY_FIXTURES        comma-separated fixture names (default: every fixture)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  ambientOcclusionCorrelation,
  coverage,
  flattenedRgb,
  loadViewerParityRenderer,
  meanAbsoluteRgbDifference,
  readViewerParityManifest,
  readViewerParityReference,
  resolveFixturePath,
  sha256,
  viewerParityBackendTolerancePoints,
  viewerParityThresholdPercent,
} from '#scripts/viewer-parity.js';
import type { ViewerParityDifference, ViewerParityFixture } from '#scripts/viewer-parity.js';
import {
  viewerParityBackends,
  viewerParityRenderName,
  viewerParityWasmRecordName,
} from '#scripts/viewer-parity-files.js';
import type { ViewerParityBackend } from '#scripts/viewer-parity-files.js';
import {
  buildViewerParityImageOptions,
  renderViewerParityImage,
  viewerParitySize,
} from '#scripts/viewer-parity-render.js';
import type { ViewerParityImageOptions } from '#scripts/viewer-parity-render.js';

const workspaceRoot = fileURLToPath(new URL('../../..', import.meta.url));
const manifest = readViewerParityManifest(
  fileURLToPath(new URL('../fixtures/viewer-parity/fixtures.json', import.meta.url)),
);
const viewerDirectory = resolve(
  workspaceRoot,
  process.env['PARITY_VIEWER_OUT'] ?? 'out/test-results/viewer-parity/viewer',
);
const outDirectory = resolve(workspaceRoot, process.env['PARITY_OUT'] ?? 'out/test-results/viewer-parity/nanoraster');
const only = new Set((process.env['PARITY_FIXTURES'] ?? '').split(',').filter(Boolean));
const fixtures = manifest.fixtures.filter((fixture) => only.size === 0 || only.has(fixture.name));
const renderer = await loadViewerParityRenderer(process.env['TAU_PARITY_NANORASTER'], workspaceRoot);
const nativeAdapter = await renderer.module.describeAdapter();

/** One build's D2 on one fixture. */
type BackendResult = Readonly<{
  aoOn: ViewerParityDifference;
  aoOff: ViewerParityDifference;
  aoCorrelation: number;
  pass: boolean;
}>;

/** What the WASM pass recorded beside its renders. */
type WasmRecord = Readonly<{ nanoraster: string; adapter: unknown; userAgent: string }>;

type FixtureResult = Readonly<{
  fixture: string;
  /**
   * The GLB both the viewer and nanoraster drew, generated for this run: a record, not a pin, because some kernels'
   * exports differ in bytes from run to run while rendering the same.
   */
  glb: Readonly<{ bytes: number; sha256: string }>;
  native: BackendResult;
  wasm: BackendResult;
  /** WASM D2 minus native D2, percentage points. */
  backendGapPoints: Readonly<{ aoOn: number; aoOff: number }>;
  /** The AO-on image options, as the transcoder receives them. */
  options: ViewerParityImageOptions;
  knownFailure?: string;
}>;
const results: FixtureResult[] = [];
let wasmRecord: WasmRecord | undefined;

const score = async (
  frames: Readonly<{
    /** The viewer's straight-alpha AO-on frame, for its coverage. */
    coverage: string;
    /** The viewer's page composites. */
    viewerOn: string;
    viewerOff: string;
    renderedOn: Uint8Array<ArrayBuffer> | string;
    renderedOff: Uint8Array<ArrayBuffer> | string;
  }>,
): Promise<BackendResult> => {
  const alpha = await coverage(frames.coverage);
  const [viewerOn, viewerOff, renderedOn, renderedOff] = await Promise.all(
    [frames.viewerOn, frames.viewerOff, frames.renderedOn, frames.renderedOff].map(async (image) =>
      flattenedRgb(image),
    ),
  );
  const aoOn = meanAbsoluteRgbDifference(renderedOn!, viewerOn!, alpha);
  const aoOff = meanAbsoluteRgbDifference(renderedOff!, viewerOff!, alpha);
  return {
    aoOn,
    aoOff,
    aoCorrelation: ambientOcclusionCorrelation({
      viewerOn: viewerOn!,
      viewerOff: viewerOff!,
      renderedOn: renderedOn!,
      renderedOff: renderedOff!,
      alpha,
    }),
    pass: aoOn.percent < viewerParityThresholdPercent && aoOff.percent < viewerParityThresholdPercent,
  };
};

const measure = async (fixture: ViewerParityFixture): Promise<FixtureResult> => {
  const glbPath = resolveFixturePath(workspaceRoot, fixture);
  if (!existsSync(glbPath)) {
    throw new Error(
      `${fixture.name}: no GLB at ${glbPath}; generate the fixtures first (libs/tau-examples/scripts/export-parity-fixtures.mts)`,
    );
  }
  const glb = new Uint8Array(readFileSync(glbPath));
  const references = [true, false].map((ao) => readViewerParityReference(viewerDirectory, fixture.name, ao));
  const [on, off] = references;
  if (!on || !off) {
    throw new Error(
      `${fixture.name}: no viewer reference in ${viewerDirectory}; run viewer:capture:viewer-parity first`,
    );
  }
  for (const reference of [on, off]) {
    expect(reference.size, `${fixture.name}: viewer frame size`).toEqual([
      viewerParitySize.width,
      viewerParitySize.height,
    ]);
    expect(reference.isWebGPUBackend, `${fixture.name}: viewer reference fell back to WebGL2`).toBe(true);
  }
  const directory = join(outDirectory, fixture.name);
  mkdirSync(directory, { recursive: true });
  const options = buildViewerParityImageOptions({ camera: on.camera, ao: true });
  const [nativeOn, nativeOff] = await Promise.all(
    [options, buildViewerParityImageOptions({ camera: off.camera, ao: false })].map(async (imageOptions, index) => {
      const png = await renderViewerParityImage(renderer.module, glb, imageOptions);
      writeFileSync(join(directory, viewerParityRenderName('native', index === 0)), png);
      return png;
    }),
  );
  const [wasmOn, wasmOff] = [true, false].map((ao) => join(directory, viewerParityRenderName('wasm', ao)));
  const record = join(directory, viewerParityWasmRecordName);
  if (!existsSync(wasmOn!) || !existsSync(wasmOff!) || !existsSync(record)) {
    throw new Error(`${fixture.name}: no WASM render in ${directory}; the wasm project renders it before the gate`);
  }
  wasmRecord ??= JSON.parse(readFileSync(record, 'utf8')) as WasmRecord;
  // Viewer colour from the page composite; coverage from the straight-alpha frame.
  const viewer = { coverage: on.png, viewerOn: on.composited, viewerOff: off.composited };
  const [native, wasm] = await Promise.all([
    score({ ...viewer, renderedOn: nativeOn!, renderedOff: nativeOff! }),
    score({ ...viewer, renderedOn: wasmOn!, renderedOff: wasmOff! }),
  ]);
  return {
    fixture: fixture.name,
    glb: { bytes: glb.byteLength, sha256: sha256(glb) },
    native,
    wasm,
    backendGapPoints: {
      aoOn: wasm.aoOn.percent - native.aoOn.percent,
      aoOff: wasm.aoOff.percent - native.aoOff.percent,
    },
    options,
    ...(fixture.knownFailure === undefined ? {} : { knownFailure: fixture.knownFailure }),
  };
};

// One measurement per fixture, shared by its native and WASM tests.
const measurements = new Map<string, Promise<FixtureResult>>();
const measured = async (fixture: ViewerParityFixture): Promise<FixtureResult> => {
  let measurement = measurements.get(fixture.name);
  if (!measurement) {
    measurement = measure(fixture);
    measurements.set(fixture.name, measurement);
    results.push(await measurement);
  }
  return measurement;
};

const describeResult = (result: FixtureResult): string => {
  const verdict = (backend: BackendResult) =>
    backend.pass ? 'PASS' : result.knownFailure === undefined ? 'FAIL' : 'KNOWN FAILURE';
  const gap = Math.max(Math.abs(result.backendGapPoints.aoOn), Math.abs(result.backendGapPoints.aoOff));
  return [
    ...viewerParityBackends.map((backend) => {
      const scored = result[backend];
      return (
        `${result.fixture.padEnd(32)} ${backend.padEnd(6)} ao-on ${scored.aoOn.percent.toFixed(3)}%  ` +
        `ao-off ${scored.aoOff.percent.toFixed(3)}%  ao corr ${scored.aoCorrelation.toFixed(3)}  ${verdict(scored)}`
      );
    }),
    ...(gap > viewerParityBackendTolerancePoints ? [`${''.padEnd(32)} native/WASM gap ${gap.toFixed(3)} points`] : []),
  ].join('\n');
};

describe(`viewer parity against nanoraster ${renderer.source}`, () => {
  afterAll(() => {
    const scored = results.length;
    const passed = results.filter((result) => result.native.pass && result.wasm.pass).length;
    const max = Math.max(
      0,
      ...results.flatMap((result) =>
        viewerParityBackends.flatMap((backend) => [result[backend].aoOn.percent, result[backend].aoOff.percent]),
      ),
    );
    const gap = Math.max(
      0,
      ...results.flatMap((result) => [Math.abs(result.backendGapPoints.aoOn), Math.abs(result.backendGapPoints.aoOff)]),
    );
    const summary =
      `parity: ${passed}/${scored} under ${viewerParityThresholdPercent}% (max ${max.toFixed(3)}%) ` +
      `on native and WASM; native/WASM gap max ${gap.toFixed(3)} points`;
    mkdirSync(outDirectory, { recursive: true });
    writeFileSync(
      join(outDirectory, 'results.json'),
      `${JSON.stringify(
        {
          nanoraster: { native: renderer.source, wasm: wasmRecord?.nanoraster },
          adapters: { native: nativeAdapter, wasm: wasmRecord?.adapter },
          browser: wasmRecord?.userAgent,
          viewerDirectory,
          summary,
          results,
        },
        undefined,
        2,
      )}\n`,
    );
    // oxlint-disable-next-line eslint/no-console -- The gate's one-line verdict, read by people and the real-GPU ping.
    console.info([...results.map((result) => describeResult(result)), summary].join('\n'));
  });

  for (const fixture of fixtures) {
    for (const backend of viewerParityBackends) {
      const title =
        `should render ${fixture.name} through nanoraster ${backend} within ${viewerParityThresholdPercent}% ` +
        'of the viewer with AO on and off';
      // A known failure is still rendered and measured; the test fails once the fixture passes, so its entry is
      // removed.
      const test = fixture.knownFailure === undefined ? it : it.fails;
      test(title, { timeout: 300_000 }, async () => {
        const measurement = await measured(fixture);
        const result = measurement[backend];
        const name = `${fixture.name} (${backend satisfies ViewerParityBackend})`;
        expect(result.aoOn.percent, `${name}: D2 with AO on`).toBeLessThan(viewerParityThresholdPercent);
        expect(result.aoOff.percent, `${name}: D2 with AO off`).toBeLessThan(viewerParityThresholdPercent);
      });
    }
  }
});
