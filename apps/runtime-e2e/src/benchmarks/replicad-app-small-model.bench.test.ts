// @vitest-environment node
import { spawn, execFileSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it, onTestFinished } from 'vitest';
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

// Explicit cohort acquisition only; the earlier five failed fresh-client samples remain immutable.
it.skipIf(process.env['TAU_E2E_HONEYCOMB_COHORT'] !== 'true')(
  'should compare exact Honeycomb cold processes, warmed-module fresh clients and warm cache without dropping samples',
  async () => {
    const lifecycle = new AbortController();
    const activeChildren = new Set<ChildProcess>();
    const assertActive = (): void => {
      lifecycle.signal.throwIfAborted();
    };
    onTestFinished(() => {
      lifecycle.abort(new Error('Honeycomb cohort test finished.'));
      for (const child of activeChildren) {
        child.kill('SIGKILL');
      }
    });
    const workspace = resolve(import.meta.dirname, '../../../..');
    const resourceRoot = resolve(workspace, 'apps/ui/public/assets/engines/replicad/density-single-v1');
    const expectedAssets = [
      { name: 'replicad_single.wasm', digest: '9eecb79da12acf0c6270d36548feb6595191640d87bb7f7931e90da12262ccc9' },
      { name: 'replicad_single.mjs', digest: 'cfc514722fddc9295b93da66c9ceca8627edcf22edf463db5fd316d4bb155e27' },
    ];
    const assets = await Promise.all(
      expectedAssets.map(async ({ name, digest }) => {
        const bytes = await readFile(resolve(resourceRoot, name));
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(digest);
        return { name, digest, byteLength: bytes.byteLength };
      }),
    );
    const source = await readHoneycombSource();
    const gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workspace, encoding: 'utf8' }).trim();
    const implementationSources = await Promise.all(
      [
        'packages/plugins/replicad/src/replicad.kernel.ts',
        'packages/plugins/replicad/src/utils/replicad-to-gltf.ts',
        'packages/runtime/src/framework/kernel-runtime-worker.ts',
        'apps/runtime-e2e/src/benchmarks/benchmark-runner.ts',
      ].map(async (path) => ({
        path,
        digest: createHash('sha256')
          .update(await readFile(resolve(workspace, path)))
          .digest('hex'),
      })),
    );
    const wasm = {
      wasmUrl: pathToFileURL(resolve(resourceRoot, 'replicad_single.wasm')).href,
      wasmBindingsUrl: pathToFileURL(resolve(resourceRoot, 'replicad_single.mjs')).href,
    };
    const benchCase: BenchmarkCase = {
      name: 'app-custom-honeycomb-cohort-v1',
      category: 'app-small-model',
      files: { 'public/models/honeycomb.js': source },
      mainFile: 'public/models/honeycomb.js',
      mode: 'first-call',
      operation: 'render',
    };
    const directory = resolve(
      workspace,
      'out/reports/benchmarks/runtime-e2e/app-custom-small-model/honeycomb/cohort-v2',
    );
    await mkdir(directory, { recursive: true });
    const inputPath = resolve(directory, 'cold-process-input.json');
    const reportPath = resolve(directory, 'acquisition.json');
    await writeFile(
      inputPath,
      JSON.stringify({
        source,
        sourceDigest: honeycombSourceDigest,
        wasmUrl: wasm.wasmUrl,
        wasmBindingsUrl: wasm.wasmBindingsUrl,
        wasmDigest: assets[0]!.digest,
        bindingsDigest: assets[1]!.digest,
        gitHead,
        implementationSources,
      }),
    );
    type ColdProcessResult = {
      processId: number;
      bootToken: string;
      startupToEntry: number;
      setupBeforeCad: number;
      moduleResolutionPathHash: string;
      gitHead: string;
      implementationSources: typeof implementationSources;
      sourceDigest: string;
      assetDigests: [string, string];
      run: BenchmarkRunResult;
      launchToExit: number;
    };
    const coldProcessRuns: ColdProcessResult[] = [];
    const freshClientRuns: BenchmarkRunResult[] = [];
    const cohortState: {
      warmModulePrep?: BenchmarkRunResult;
      warmRun?: BenchmarkRunResult;
      coldProcessStats?: ReturnType<typeof computeStats>;
      freshClientStats?: ReturnType<typeof computeStats>;
    } = {};
    const persist = async (status: string): Promise<void> => {
      assertActive();
      await writeFile(
        reportPath,
        JSON.stringify(
          {
            status,
            sourceDigest: honeycombSourceDigest,
            sourceByteLength: 347,
            gitHead,
            implementationSources,
            assets,
            measuredWindow: 'runBenchmarks first-call render only; OS startup and module setup separate',
            warmModuleProtocol:
              'one recorded prep, then five measured fresh clients, then one client with eight warmups and 15 measurements',
            coldProcessRuns,
            coldProcessStats: cohortState.coldProcessStats,
            warmedModuleProcess: {
              processId: process.pid,
              moduleResolutionPathHash: createHash('sha256')
                .update(import.meta.resolve('@taucad/replicad'))
                .digest('hex'),
            },
            warmModulePrep: cohortState.warmModulePrep,
            freshClientRuns,
            freshClientStats: cohortState.freshClientStats,
            warmRun: cohortState.warmRun,
            cvCeiling: 0.1,
          },
          undefined,
          2,
        ),
      );
      assertActive();
    };
    assertActive();
    await persist('prepared');
    /* oxlint-disable no-await-in-loop -- Each fresh OS process must finish and persist before the next starts. */
    for (let sample = 0; sample < 5; sample += 1) {
      assertActive();
      const resultPath = resolve(directory, `cold-process-${sample}.json`);
      const log = await open(resolve(directory, `cold-process-${sample}.log`), 'w');
      let launchToExit = 0;
      const launchedAt = performance.now();
      try {
        assertActive();
        const child = spawn(
          process.execPath,
          [
            '--import=tsx',
            resolve(import.meta.dirname, 'replicad-honeycomb-cold-process.fixture.ts'),
            inputPath,
            resultPath,
          ],
          { cwd: workspace, stdio: ['ignore', log.fd, log.fd] },
        );
        activeChildren.add(child);
        const exit = await new Promise<number | undefined>((resolve, reject) => {
          child.once('error', reject);
          child.once('close', (code) => {
            activeChildren.delete(child);
            launchToExit = performance.now() - launchedAt;
            resolve(code ?? undefined);
          });
        });
        assertActive();
        expect(exit).toBe(0);
      } finally {
        for (const child of activeChildren) {
          child.kill('SIGKILL');
        }
        await log.close();
      }
      assertActive();
      const childResult = JSON.parse(
        await readFile(resultPath, { encoding: 'utf8', signal: lifecycle.signal }),
      ) as Omit<ColdProcessResult, 'launchToExit'>;
      assertActive();
      expect(childResult.sourceDigest).toBe(honeycombSourceDigest);
      expect(childResult.gitHead).toBe(gitHead);
      expect(childResult.implementationSources).toEqual(implementationSources);
      expect(childResult.assetDigests).toEqual(assets.map(({ digest }) => digest));
      expect(childResult.run.results[0]?.timings).toHaveLength(1);
      coldProcessRuns.push({ ...childResult, launchToExit });
      await persist('cold-process-in-progress');
    }
    /* oxlint-enable no-await-in-loop */
    expect(new Set(coldProcessRuns.map(({ bootToken }) => bootToken)).size).toBe(5);
    expect(new Set(coldProcessRuns.map(({ processId }) => processId)).size).toBe(5);
    expect(new Set(coldProcessRuns.map(({ moduleResolutionPathHash }) => moduleResolutionPathHash)).size).toBe(1);

    // Predeclared module/WASM warmup is evidence, never a discarded member of the five-client distribution.
    assertActive();
    const warmModulePrep = await runBenchmarks([benchCase], {
      iterations: 1,
      operation: 'render',
      includeEdges: true,
      wasm,
      onIterationProgress: assertActive,
    });
    cohortState.warmModulePrep = warmModulePrep;
    await persist('warm-module-prepared');
    for (let sample = 0; sample < 5; sample += 1) {
      assertActive();
      freshClientRuns.push(
        // oxlint-disable-next-line no-await-in-loop -- Five fresh clients are one serial warmed-module cohort.
        await runBenchmarks([benchCase], {
          iterations: 1,
          operation: 'render',
          includeEdges: true,
          wasm,
          onIterationProgress: assertActive,
        }),
      );
      // oxlint-disable-next-line no-await-in-loop -- Persist each genuine measurement before the next client.
      await persist('fresh-client-in-progress');
    }
    assertActive();
    const warmRun = await runBenchmarks([{ ...benchCase, mode: 'steady-state' }], {
      iterations: 15,
      operation: 'render',
      includeEdges: true,
      wasm,
      onIterationProgress: assertActive,
    });
    const processDurations = coldProcessRuns.map(({ run }) => run.results[0]!.timings[0]!);
    const clientDurations = freshClientRuns.map(({ results }) => results[0]!.timings[0]!);
    const coldProcessStats = computeStats(processDurations);
    const freshClientStats = computeStats(clientDurations);
    cohortState.warmRun = warmRun;
    cohortState.coldProcessStats = coldProcessStats;
    cohortState.freshClientStats = freshClientStats;
    await persist('complete-before-cv');

    const allRuns = [...coldProcessRuns.map(({ run }) => run), warmModulePrep, ...freshClientRuns, warmRun];
    const first = allRuns[0]!.results[0]!;
    for (const run of allRuns) {
      expect(run.measurement.wasmVariant).toBe(wasm.wasmUrl);
      expect(run.results).toHaveLength(1);
      const result = run.results[0]!;
      expect(result.outputHash).toBe(first.outputHash);
      expect(result.outputSizeBytes).toBe(first.outputSizeBytes);
      expect(result.triangleCount).toBe(first.triangleCount);
    }
    expect(warmModulePrep.results[0]?.timings).toHaveLength(1);
    expect(warmRun.results[0]?.warmupRuns).toBe(8);
    expect(warmRun.results[0]?.timings).toHaveLength(15);
    expect(await readHoneycombSource()).toBe(source);
    expect(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workspace, encoding: 'utf8' }).trim()).toBe(gitHead);
    await Promise.all(
      implementationSources.map(async ({ path, digest }) => {
        expect(
          createHash('sha256')
            .update(await readFile(resolve(workspace, path)))
            .digest('hex'),
        ).toBe(digest);
      }),
    );
    /* oxlint-disable no-await-in-loop -- Recheck each selected implementation asset after the complete serial cohort. */
    for (const { name, digest } of assets) {
      expect(
        createHash('sha256')
          .update(await readFile(resolve(resourceRoot, name)))
          .digest('hex'),
      ).toBe(digest);
    }
    /* oxlint-enable no-await-in-loop */
    expect(processDurations).toHaveLength(5);
    expect(clientDurations).toHaveLength(5);
    expect(coldProcessStats.coefficientOfVariation).toBeLessThanOrEqual(0.1);
    expect(freshClientStats.coefficientOfVariation).toBeLessThanOrEqual(0.1);
    expect(warmRun.results[0]!.coefficientOfVariation).toBeLessThanOrEqual(0.1);
    await persist('qualified');
  },
);
