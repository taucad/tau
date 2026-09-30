#!/usr/bin/env -S pnpm tsx
// Benchmark Tau's OpenRSCAD document evaluation and artifact path.
//
// One kernel, whichever payload `@taulabs/openrscad-engine` bound for this host
// (the addon under Node when a platform package matches; its WebAssembly build
// otherwise). Backend-to-backend comparison is not this script's job — that is
// `apps/runtime-e2e/src/benchmarks/native-speedup.bench.test.ts`.

/* oxlint-disable no-await-in-loop -- Interleaved benchmark samples must execute serially. */
import { glob, mkdir, writeFile } from 'node:fs/promises';
import { cpus, platform, release } from 'node:os';
import { dirname, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { clearCache } from '@taulabs/openrscad-engine';
import { openrscadKernel } from '@taucad/openrscad';
import { asKnownArtifact, createRuntimeClient } from '@taucad/runtime/client';
import { fromNodeFs } from '@taucad/runtime/filesystem/node';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { defineRuntime } from '@taucad/runtime/worker';

const parseArgs = (args: string[]) => {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
OpenRSCAD Kernel Benchmark

Usage:
  pnpm tsx scripts/src/benchmark-openrscad-kernel.ts [options]

Options:
      --corpus <dir>   Add every .scad file below a corpus directory
      --report <file>  JSON report path
                       (default: out/reports/benchmarks/openrscad-kernel/kernel-results.json)
      --samples <n>    Samples per case (default: 30)
  -h, --help           Show this help message
`);
    process.exit(0);
  }
  const result = {
    corpus: undefined as string | undefined,
    report: resolve('out/reports/benchmarks/openrscad-kernel/kernel-results.json'),
    samples: 30,
  };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index + 1];
    if (args[index] === '--corpus' && value) {
      result.corpus = resolve(value);
      index += 1;
    } else if (args[index] === '--report' && value) {
      result.report = resolve(value);
      index += 1;
    } else if (args[index] === '--samples' && value) {
      result.samples = Number(value);
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${args[index]}`);
    }
  }
  if (!Number.isInteger(result.samples) || result.samples < 1) {
    throw new Error('--samples must be a positive integer');
  }
  return result;
};

const args = parseArgs(process.argv.slice(2));
const { samples } = args;
const options = { tessellation: { segments: 0, minimumAngle: 12, minimumSize: 2 } } as const;
const fixtureEntries = [
  resolve('packages/plugins/openrscad/src/fixtures/planetary-gearbox/main.scad'),
  resolve('libs/tau-examples/src/kernels/openscad/kitchen-sink/main.scad'),
  resolve('packages/plugins/openrscad/src/fixtures/greenhouse/main.scad'),
];
const reportPath = args.report;

type BenchmarkSample = {
  bytes: number;
  cache: string;
  durationMs: number;
  fixture: string;
  heapDeltaBytes: number;
  iteration: number;
  lineSegments: number;
  nodes: number;
  path: string;
  rssDeltaBytes: number;
  sameByteArray?: boolean;
};

type Fixture = {
  entryPath: string;
  name: string;
  root: string;
};

const median = (values: number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

const p95 = (values: number[]): number =>
  [...values].sort((left, right) => left - right)[Math.ceil(values.length * 0.95) - 1]!;

const loadFixture = (entry: string, root = dirname(entry)): Fixture => {
  const entryPath = relative(root, entry).split(sep).join('/');
  return {
    name: relative(resolve('.'), entry),
    entryPath,
    root,
  };
};

const corpusFixtures = async (root: string): Promise<Fixture[]> => {
  const entries: string[] = [];
  for await (const path of glob(['**/*.scad', '.*/**/*.scad'], { cwd: root })) {
    entries.push(resolve(root, path));
  }
  entries.sort();
  if (entries.length === 0) {
    throw new Error(`No SCAD files found below ${root}`);
  }
  return entries.map((entry) => loadFixture(entry, root));
};

const inspectGlb = (bytes: Uint8Array<ArrayBuffer>): { lineSegments: number; nodes: number } => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))) as {
    accessors?: Array<{ count?: number }>;
    meshes?: Array<{ primitives?: Array<{ indices?: number; mode?: number }> }>;
    nodes?: unknown[];
  };
  return {
    nodes: json.nodes?.length ?? 0,
    lineSegments: (json.meshes ?? [])
      .flatMap(({ primitives = [] }) => primitives)
      .filter(({ mode = 4 }) => mode === 1)
      .reduce(
        (total, { indices }) => total + (indices === undefined ? 0 : (json.accessors?.[indices]?.count ?? 0) / 2),
        0,
      ),
  };
};

const main = async () => {
  await mkdir(dirname(reportPath), { recursive: true });
  const runtime = defineRuntime({ kernels: [openrscadKernel()] });
  const raw: BenchmarkSample[] = [];
  const failures: Array<{ fixture: string; message: string }> = [];
  const builtIns = fixtureEntries.map((entry) => loadFixture(entry));
  const fixtures = args.corpus ? [...builtIns, ...(await corpusFixtures(args.corpus))] : builtIns;
  const persistReport = async (): Promise<void> => {
    const keys = [...new Set(raw.map((sample) => `${sample.fixture}\0${sample.path}\0${sample.cache}`))];
    const summary = keys.map((key) => {
      const [fixture, path, cache] = key.split('\0');
      const group = raw.filter(
        (sample) => sample.fixture === fixture && sample.path === path && sample.cache === cache,
      );
      const values = group.map(({ durationMs }) => durationMs);
      const reuseSamples = group.filter(({ sameByteArray }) => sameByteArray !== undefined);
      return {
        fixture,
        path,
        cache,
        samples: values.length,
        medianMs: median(values),
        p95Ms: p95(values),
        medianBytes: median(group.map(({ bytes }) => bytes)),
        medianLineSegments: median(group.map(({ lineSegments }) => lineSegments)),
        medianHeapDeltaBytes: median(group.map(({ heapDeltaBytes }) => heapDeltaBytes)),
        medianRssDeltaBytes: median(group.map(({ rssDeltaBytes }) => rssDeltaBytes)),
        sameByteArrayRate:
          reuseSamples.length === 0
            ? null
            : reuseSamples.filter(({ sameByteArray }) => sameByteArray === true).length / reuseSamples.length,
      };
    });
    const comparisons = [...new Set(raw.map(({ fixture }) => fixture))].flatMap((fixture) => {
      const entry = (path: string, cache: string) =>
        summary.find((sample) => sample.fixture === fixture && sample.path === path && sample.cache === cache);
      return (['cold', 'warm'] as const).flatMap((cache) => {
        const plain = entry('T2-', cache);
        const edged = entry('T2+', cache);
        if (!plain || !edged) {
          return [];
        }
        return [
          {
            fixture,
            cache,
            /** Milliseconds. */
            edgeDelta: edged.medianMs - plain.medianMs,
            edgePayloadDeltaBytes: edged.medianBytes - plain.medianBytes,
            edgeLineSegments: edged.medianLineSegments,
          },
        ];
      });
    });
    await writeFile(
      reportPath,
      `${JSON.stringify(
        {
          schemaVersion: 2,
          createdAt: new Date().toISOString(),
          environment: {
            platform: platform(),
            release: release(),
            cpu: cpus()[0]?.model,
            logicalCpuCount: cpus().length,
            node: process.version,
          },
          methodology: {
            samples,
            tessellation: { $fn: 0, $fa: 12, $fs: 2 },
            t2: 'new document evaluation plus model render; cold clears engine caches, warm primes only the identical mode',
            t3: 'repeat model view.update against the same retained document evaluation and edge mode',
            corpus: args.corpus
              ? 'every dynamically discovered .scad file was attempted as an entrypoint; failures are retained'
              : 'built-in acceptance fixtures only',
            checkpoint: 'the complete report is rewritten after every fixture',
          },
          inventory: fixtures.map(({ name }) => name),
          completed: new Set([...raw.map(({ fixture }) => fixture), ...failures.map(({ fixture }) => fixture)]).size,
          failures,
          summary,
          comparisons,
          raw,
        },
        null,
        2,
      )}\n`,
    );
  };
  for (const [fixtureIndex, fixture] of fixtures.entries()) {
    const client = createRuntimeClient({
      transport: inProcessTransport({ runtime, fileSystem: fromNodeFs(fixture.root) }),
    });
    const open = () => client.open({ source: { path: fixture.entryPath }, watch: false });
    const readRendering = async (
      outcome: Awaited<ReturnType<ReturnType<ReturnType<typeof open>['view']>['rendering']>>,
    ) => {
      if (outcome.superseded || !outcome.rendering.success) {
        throw new Error(
          outcome.superseded
            ? 'render was superseded'
            : outcome.rendering.issues.map((issue) => issue.message).join('; '),
        );
      }
      const artifact = asKnownArtifact(outcome.rendering.artifact);
      if (artifact?.mimeType !== 'model/gltf-binary') {
        throw new Error(`expected GLB artifact, received ${outcome.rendering.artifact.mimeType}`);
      }
      return artifact.content;
    };
    const execute = async (includeEdges: boolean) => {
      const document = open();
      const view = document.view('model', { options, content: { includeEdges } });
      try {
        return await readRendering(await view.rendering());
      } finally {
        view.close();
        document.close();
      }
    };

    try {
      for (let iteration = 0; iteration < samples; iteration += 1) {
        for (const includeEdges of iteration % 2 ? [true, false] : [false, true]) {
          for (const cache of ['cold', 'warm'] as const) {
            await clearCache();
            if (cache === 'warm') {
              await execute(includeEdges);
            }
            const memoryBefore = process.memoryUsage();
            const start = performance.now();
            const bytes = await execute(includeEdges);
            const durationMs = performance.now() - start;
            const memoryAfter = process.memoryUsage();
            const inspected = inspectGlb(bytes);
            if (!includeEdges && inspected.lineSegments !== 0) {
              throw new Error(`edge-disabled GLB contains ${inspected.lineSegments} line segments`);
            }
            raw.push({
              fixture: fixture.name,
              path: `T2${includeEdges ? '+' : '-'}`,
              cache,
              iteration,
              durationMs,
              bytes: bytes.byteLength,
              ...inspected,
              rssDeltaBytes: memoryAfter.rss - memoryBefore.rss,
              heapDeltaBytes: memoryAfter.heapUsed - memoryBefore.heapUsed,
            });
          }
        }
      }

      for (const includeEdges of [false, true]) {
        await clearCache();
        const document = open();
        const view = document.view('model', { options, content: { includeEdges } });
        try {
          const first = await readRendering(await view.rendering());
          for (let iteration = 0; iteration < samples; iteration += 1) {
            const memoryBefore = process.memoryUsage();
            const start = performance.now();
            const bytes = await readRendering(await view.update({ content: { includeEdges } }));
            const durationMs = performance.now() - start;
            const memoryAfter = process.memoryUsage();
            const inspected = inspectGlb(bytes);
            raw.push({
              fixture: fixture.name,
              path: `T3${includeEdges ? '+' : '-'}`,
              cache: 'document',
              iteration,
              durationMs,
              bytes: bytes.byteLength,
              ...inspected,
              rssDeltaBytes: memoryAfter.rss - memoryBefore.rss,
              heapDeltaBytes: memoryAfter.heapUsed - memoryBefore.heapUsed,
              sameByteArray: bytes === first,
            });
          }
        } finally {
          view.close();
          document.close();
        }
      }
    } catch (error) {
      failures.push({ fixture: fixture.name, message: error instanceof Error ? error.message : String(error) });
    } finally {
      await client.shutdown();
    }
    await persistReport();
    console.log(`[${fixtureIndex + 1}/${fixtures.length}] ${fixture.name}`);
  }
  console.log(`Wrote ${reportPath}`);
};

await main();
