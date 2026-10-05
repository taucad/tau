// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
import { loadFixture } from '@taucad/tau-examples/fixtures';
import { computeStats, runBenchmarks } from '#benchmarks/benchmark-runner.js';
import type { BenchmarkRunResult } from '#benchmarks/benchmark-runner.js';
import type { BenchmarkCase } from '#benchmarks/benchmark-suite.js';

const honeycombSource = `import { makeBaseBox } from 'replicad';

export const defaultParams = {
  dimensions: { width: 20, height: 14, depth: 4, rotationAngle: 45 },
  pattern: { cellSize: 3, wallThickness: 1 },
};

export default function main(params = defaultParams) {
  const { width, height, depth } = params.dimensions;
  return makeBaseBox(width, height, depth);
}
`;
const honeycombSourceDigest = '9433c7f5d9d2f2bc521efddeb71e25488ee906e4f888c39b82aa7677abb2806b';

const readHoneycombSource = async (): Promise<string> => {
  const route = await readFile(
    resolve(import.meta.dirname, '../../../ui/app/routes/[__e2e].project-file-tree/route.tsx'),
    'utf8',
  );
  const declaration = 'const honeycombModel = `';
  const start = route.indexOf(declaration);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = route.indexOf('`;', start + declaration.length);
  expect(end).toBeGreaterThan(start);
  const source = route.slice(start + declaration.length, end);
  expect(source).toBe(honeycombSource);
  expect(Buffer.byteLength(source)).toBe(347);
  expect(createHash('sha256').update(source).digest('hex')).toBe(honeycombSourceDigest);
  expect(route).toContain("['public/models/honeycomb.js', { content: encode(honeycombModel) }]");
  return source;
};

it('should bind the Honeycomb benchmark to the exact existing route seed without native acquisition', async () => {
  expect(await readHoneycombSource()).toBe(honeycombSource);
});

// Existing runtime-e2e owner proposal; no default suite silently executes the opt-in native acquisition.
it.skipIf(process.env['TAU_E2E_CUSTOM_SMALL_MODEL_BASELINE'] !== 'true').each([
  {
    title:
      'should acquire the delivered custom pair small-CAD cold-client and warm baseline without inheriting default goldens',
    honeycomb: false,
  },
  {
    title:
      'should acquire the exact Honeycomb delivered custom pair cold-client and warm baseline with bounded variation',
    honeycomb: true,
  },
])('$title', async ({ honeycomb }) => {
  const workspace = resolve(import.meta.dirname, '../../../..');
  const resourceRoot = resolve(workspace, 'apps/ui/public/assets/engines/replicad/density-single-v1');
  const delivered = [
    { name: 'replicad_single.wasm', digest: '9eecb79da12acf0c6270d36548feb6595191640d87bb7f7931e90da12262ccc9' },
    { name: 'replicad_single.mjs', digest: 'cfc514722fddc9295b93da66c9ceca8627edcf22edf463db5fd316d4bb155e27' },
  ];
  const assets = await Promise.all(
    delivered.map(async (asset) => {
      const bytes = await readFile(resolve(resourceRoot, asset.name));
      const digest = createHash('sha256').update(bytes).digest('hex');
      expect(digest).toBe(asset.digest);
      return { ...asset, byteLength: bytes.byteLength, digest };
    }),
  );
  const wasm = {
    wasmUrl: pathToFileURL(resolve(resourceRoot, 'replicad_single.wasm')).href,
    wasmBindingsUrl: pathToFileURL(resolve(resourceRoot, 'replicad_single.mjs')).href,
  };
  const fixtures: Array<Pick<BenchmarkCase, 'name' | 'files' | 'mainFile'>> = honeycomb
    ? [
        {
          name: 'honeycomb',
          mainFile: 'public/models/honeycomb.js',
          files: { 'public/models/honeycomb.js': await readHoneycombSource() },
        },
      ]
    : (['tray', 'birdhouse'] as const).map((name) => ({ name, ...loadFixture('replicad', name) }));
  const coldClientRuns: BenchmarkRunResult[] = [];
  // Each existing runner invocation creates and terminates its own clients. Node module cache remains warm.
  // This loop is sequential so native work cannot contend with another sample.
  for (let sample = 0; sample < 5; sample += 1) {
    coldClientRuns.push(
      // oxlint-disable-next-line no-await-in-loop -- Five fresh-client samples are a single serialized acquisition cohort.
      await runBenchmarks(
        fixtures.map<BenchmarkCase>((fixture) => ({
          ...fixture,
          name: `app-custom-${fixture.name}-fresh-client-v1`,
          category: 'app-small-model',
          mode: 'first-call',
          operation: 'render',
        })),
        { iterations: 1, operation: 'render', includeEdges: true, wasm },
      ),
    );
  }
  const warmRun = await runBenchmarks(
    fixtures.map<BenchmarkCase>((fixture) => ({
      ...fixture,
      name: `app-custom-${fixture.name}-unchanged-warm-v1`,
      category: 'app-small-model',
      mode: 'steady-state',
      operation: 'render',
    })),
    { iterations: 15, operation: 'render', includeEdges: true, wasm },
  );
  for (const run of [...coldClientRuns, warmRun]) {
    expect(run.measurement.wasmVariant).toBe(wasm.wasmUrl);
    for (const result of run.results) {
      expect(result.outputSizeBytes).toBeGreaterThan(0);
      expect(result.triangleCount).toBeGreaterThan(0);
      expect(result.timings.every((duration) => Number.isFinite(duration) && duration >= 0)).toBe(true);
    }
  }
  // Cold and warm timing arms must describe the same actual rendered output for each selected canonical source.
  for (const fixture of fixtures) {
    const warm = warmRun.results.find(({ name }) => name === `app-custom-${fixture.name}-unchanged-warm-v1`);
    if (!warm) {
      throw new Error(`Warm result is absent for ${fixture.name}.`);
    }
    for (const run of coldClientRuns) {
      const cold = run.results.find(({ name }) => name === `app-custom-${fixture.name}-fresh-client-v1`);
      if (!cold) {
        throw new Error(`Fresh-client result is absent for ${fixture.name}.`);
      }
      expect(cold.outputHash).toBe(warm.outputHash);
      expect(cold.outputSizeBytes).toBe(warm.outputSizeBytes);
      expect(cold.triangleCount).toBe(warm.triangleCount);
    }
  }
  const coldFirst = coldClientRuns[0];
  if (!coldFirst) {
    throw new Error('Fresh-client acquisition produced no result.');
  }
  const coldAggregate = {
    ...coldFirst,
    results: coldFirst.results.map((first) => {
      const timings = coldClientRuns.map((run) => {
        const row = run.results.find(({ name }) => name === first.name);
        if (
          row?.timings.length !== 1 ||
          row.outputHash !== first.outputHash ||
          row.outputSizeBytes !== first.outputSizeBytes ||
          row.triangleCount !== first.triangleCount ||
          row.workloadFingerprint !== first.workloadFingerprint
        ) {
          throw new Error('Cold-client series changed output/workload identity; cannot freeze this baseline.');
        }
        const value = row.timings[0];
        if (value === undefined) {
          throw new Error('Fresh-client timing sample is absent.');
        }
        return value;
      });
      return {
        ...first,
        iterations: timings.length,
        timings,
        ...computeStats(timings),
      };
    }),
  };
  const directory = resolve(
    workspace,
    'out/reports/benchmarks/runtime-e2e/app-custom-small-model',
    ...(honeycomb ? ['honeycomb'] : []),
  );
  await mkdir(directory, { recursive: true });
  await writeFile(
    resolve(directory, 'acquisition.json'),
    JSON.stringify(
      {
        status: 'new custom-pair baseline acquisition; independent review/freeze required before regression comparison',
        assets,
        wasm,
        ...(honeycomb
          ? { sourceDigest: honeycombSourceDigest, sourceByteLength: 347, requiredCoefficientOfVariation: 0.1 }
          : {}),
        coldClientRuns,
        coldAggregate,
        warmRun,
        selectedConfiguration: { variant: 'custom', implementationAssets: assets },
        coldKind: 'fresh runtime clients in one Node process; not cold-process/browser time-to-paint',
        pixelBaseline: 'separate actual ordinary-source browser captures on both backends',
        installedPackageWasmSizes:
          'runner wasmSizes are installed package reference sizes; assets above are the actual selected pair',
        defaultBaseline:
          'noncomparable; do not rewrite variant, outputHash, workloadFingerprint or comparator tolerances',
      },
      undefined,
      2,
    ),
  );
  const after = await Promise.all(
    delivered.map(async ({ name }) =>
      createHash('sha256')
        .update(await readFile(resolve(resourceRoot, name)))
        .digest('hex'),
    ),
  );
  expect(after).toEqual(assets.map(({ digest }) => digest));
  if (honeycomb) {
    expect(await readHoneycombSource()).toBe(honeycombSource);
    for (const result of coldAggregate.results) {
      expect(result.iterations).toBe(5);
      expect(result.coefficientOfVariation).toBeLessThanOrEqual(0.1);
    }
    for (const result of warmRun.results) {
      expect(result.warmupRuns).toBe(8);
      expect(result.iterations).toBe(15);
      expect(result.coefficientOfVariation).toBeLessThanOrEqual(0.1);
    }
  }
});
