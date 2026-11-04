/**
 * Viewer parity gate (Tau Brain `research/nanoraster-viewer-parity-charter.md`, W6, D2): each fixture's nanoraster
 * capture, rendered from the options Tau sends for the viewer's camera, is within 1% mean absolute RGB difference of
 * the production viewer's frame, with ambient occlusion on and off.
 *
 * Run by `pnpm nx run tau-examples:test:viewer-parity` after `pnpm nx run viewer:capture:viewer-parity` has written
 * the viewer references (the `viewer-parity` workflow does both on software GPUs). Inputs:
 *   TAU_PARITY_NANORASTER  nanoraster checkout with a built native addon. Until the catalog moves to nanoraster 0.9.0
 *                          the gate runs against the program branch build the workflow pins; afterwards it is unset
 *                          and the gate runs against the installed package.
 *   PARITY_VIEWER_OUT      viewer references (default: out/test-results/viewer-parity/viewer)
 *   PARITY_OUT             nanoraster renders and results.json (default: out/test-results/viewer-parity/nanoraster)
 *   PARITY_FIXTURES        comma-separated fixture names (default: every fixture)
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  ambientOcclusionCorrelation,
  buildViewerParityImageOptions,
  coverage,
  flattenedRgb,
  loadViewerParityRenderer,
  meanAbsoluteRgbDifference,
  readViewerParityManifest,
  readViewerParityReference,
  renderViewerParityImage,
  resolveFixturePath,
  sha256,
  viewerParitySize,
  viewerParityThresholdPercent,
} from '#scripts/viewer-parity.js';
import type { ViewerParityDifference, ViewerParityFixture, ViewerParityImageOptions } from '#scripts/viewer-parity.js';

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
const adapter = await renderer.module.describeAdapter();

type FixtureResult = Readonly<{
  fixture: string;
  aoOn: ViewerParityDifference;
  aoOff: ViewerParityDifference;
  aoCorrelation: number;
  pass: boolean;
  /** The AO-on image options, as the transcoder receives them. */
  options: ViewerParityImageOptions;
  knownFailure?: string;
}>;
const results: FixtureResult[] = [];

const measure = async (fixture: ViewerParityFixture): Promise<FixtureResult> => {
  const glb = new Uint8Array(readFileSync(resolveFixturePath(workspaceRoot, fixture)));
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
  const [renderedOnPng, renderedOffPng] = await Promise.all(
    [options, buildViewerParityImageOptions({ camera: off.camera, ao: false })].map(async (imageOptions, index) => {
      const png = await renderViewerParityImage(renderer.module, glb, imageOptions);
      writeFileSync(join(directory, `nanoraster.${index === 0 ? 'ao-on' : 'ao-off'}.png`), png);
      return png;
    }),
  );
  const alpha = await coverage(on.png);
  const [viewerOn, viewerOff, renderedOn, renderedOff] = await Promise.all([
    flattenedRgb(on.png),
    flattenedRgb(off.png),
    flattenedRgb(renderedOnPng!),
    flattenedRgb(renderedOffPng!),
  ]);
  const aoOn = meanAbsoluteRgbDifference(renderedOn, viewerOn, alpha);
  const aoOff = meanAbsoluteRgbDifference(renderedOff, viewerOff, alpha);
  return {
    fixture: fixture.name,
    aoOn,
    aoOff,
    aoCorrelation: ambientOcclusionCorrelation({ viewerOn, viewerOff, renderedOn, renderedOff, alpha }),
    pass: aoOn.percent < viewerParityThresholdPercent && aoOff.percent < viewerParityThresholdPercent,
    options,
    ...(fixture.knownFailure === undefined ? {} : { knownFailure: fixture.knownFailure }),
  };
};

describe(`viewer parity against ${renderer.source}`, () => {
  afterAll(() => {
    const scored = results.length;
    const passed = results.filter((result) => result.pass).length;
    const max = Math.max(0, ...results.flatMap((result) => [result.aoOn.percent, result.aoOff.percent]));
    const summary = `parity: ${passed}/${scored} under ${viewerParityThresholdPercent}% (max ${max.toFixed(3)}%)`;
    mkdirSync(outDirectory, { recursive: true });
    writeFileSync(
      join(outDirectory, 'results.json'),
      `${JSON.stringify({ nanoraster: renderer.source, adapter, viewerDirectory, summary, results }, undefined, 2)}\n`,
    );
    // oxlint-disable-next-line eslint/no-console -- The gate's one-line verdict, read by people and the real-GPU ping.
    console.info(
      [
        ...results.map(
          (result) =>
            `${result.fixture.padEnd(32)} ao-on ${result.aoOn.percent.toFixed(3)}%  ao-off ${result.aoOff.percent.toFixed(3)}%  ` +
            `ao corr ${result.aoCorrelation.toFixed(3)}  ${result.pass ? 'PASS' : result.knownFailure ? 'KNOWN FAILURE' : 'FAIL'}`,
        ),
        summary,
      ].join('\n'),
    );
  });

  it.each(fixtures)('should pin the GLB bytes of $name', (fixture) => {
    expect(sha256(readFileSync(resolveFixturePath(workspaceRoot, fixture))), `${fixture.name}: GLB bytes`).toBe(
      fixture.sha256,
    );
  });

  for (const fixture of fixtures) {
    const title = `should render ${fixture.name} within ${viewerParityThresholdPercent}% of the viewer with AO on and off`;
    // A known failure is still rendered and measured; the test fails once the fixture passes, so its entry is removed.
    const test = fixture.knownFailure === undefined ? it : it.fails;
    test(title, { timeout: 300_000 }, async () => {
      const result = await measure(fixture);
      results.push(result);
      expect(result.aoOn.percent, `${fixture.name}: D2 with AO on`).toBeLessThan(viewerParityThresholdPercent);
      expect(result.aoOff.percent, `${fixture.name}: D2 with AO off`).toBeLessThan(viewerParityThresholdPercent);
    });
  }
});
