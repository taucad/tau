#!/usr/bin/env -S pnpm tsx
// Benchmark Tau's native OpenRSCAD artifact path and native-handle reuse.

/* oxlint-disable no-await-in-loop -- Interleaved benchmark samples must execute serially. */
/* oxlint-disable typescript/no-unsafe-assignment -- Dynamic kernel definitions erase handle/context types. */
/* eslint-disable @nx/enforce-module-boundaries -- This workspace benchmark measures packages together. */

import { glob, mkdir, readFile, writeFile } from 'node:fs/promises';
import { cpus, platform, release } from 'node:os';
import { dirname, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { clearCache } from '@taulabs/openrscad-engine';
import { openrscadKernel } from '@taucad/openrscad';
import type { AnyKernelDefinition, KernelRuntime } from '@taucad/runtime/kernel';

const parseArgs = (args: string[]) => {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
OpenRSCAD Native Kernel Benchmark

Usage:
  pnpm tsx scripts/src/benchmark-openrscad-native-kernel.ts [options]

Options:
      --corpus <dir>   Add every .scad file below a corpus directory
      --report <file>  JSON report path
                       (default: out/reports/benchmarks/openrscad-native-kernel/native-kernel-results.json)
      --samples <n>    Samples per case (default: 30)
  -h, --help           Show this help message
`);
    process.exit(0);
  }
  const result = {
    corpus: undefined as string | undefined,
    report: resolve('out/reports/benchmarks/openrscad-native-kernel/native-kernel-results.json'),
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
  spans: Array<{ durationMs: number; name: string; phase?: string }>;
};

type Fixture = {
  entryPath: string;
  name: string;
  readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>>;
};

const median = (values: number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

const p95 = (values: number[]): number =>
  [...values].sort((left, right) => left - right)[Math.ceil(values.length * 0.95) - 1]!;

const loadFixture = async (entry: string, root = dirname(entry)): Promise<Fixture> => {
  const entryPath = `/project/${relative(root, entry).split(sep).join('/')}`;
  return {
    name: relative(resolve('.'), entry),
    entryPath,
    async readFile(path, encoding) {
      const absolute = resolve(root, path.replace(/^\/project\/?/, ''));
      if (!absolute.startsWith(`${root}${sep}`) && absolute !== root) {
        throw Object.assign(new Error(`Path escapes benchmark root: ${path}`), { code: 'EACCES' });
      }
      if (encoding === 'utf8') {
        return readFile(absolute, 'utf8');
      }
      const bytes = await readFile(absolute);
      return new Uint8Array(bytes);
    },
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
  return Promise.all(entries.map(async (entry) => loadFixture(entry, root)));
};

const readGlb = (geometry: unknown): Uint8Array<ArrayBuffer> => {
  const value = geometry as { format?: string; content?: Uint8Array<ArrayBuffer> } | undefined;
  if (value?.format !== 'gltf' || !value.content) {
    throw new Error('expected GLB geometry');
  }
  return value.content;
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
  const plugin = openrscadKernel();
  const load = (plugin as unknown as Record<symbol, () => AnyKernelDefinition | Promise<AnyKernelDefinition>>)[
    Symbol.for('@taucad/runtime/plugin-definition')
  ];
  if (!load) {
    throw new Error('OpenRSCAD kernel definition is unavailable');
  }
  const definition = await load();
  const raw: BenchmarkSample[] = [];
  const failures: Array<{ fixture: string; message: string }> = [];
  const builtIns = await Promise.all(fixtureEntries.map(async (entry) => loadFixture(entry)));
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
          schemaVersion: 1,
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
            t2: 'createGeometry plus meshGeometry; cold clears engine caches, warm primes only the identical mode',
            t3: 'repeat meshGeometry against the same retained native handle and edge mode',
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
    const spans: Array<{ durationMs: number; name: string; phase?: string }> = [];
    const noop = () => undefined;
    const runtime = {
      signal: new AbortController().signal,
      filesystem: {
        readFile: fixture.readFile,
      },
      logger: { log: noop, debug: noop, trace: noop, warn: noop, error: noop, custom: noop },
      fileContentCache: new Map(),
      bundler: {},
      emitEvent: noop,
      execute: async () => ({ success: false, issues: [] }),
      tracer: {
        startSpan(name: string, attributes?: Record<string, unknown>) {
          const start = performance.now();
          const phase = attributes?.['phase'];
          return {
            end() {
              spans.push({
                durationMs: performance.now() - start,
                name,
                phase: typeof phase === 'string' ? phase : undefined,
              });
            },
          };
        },
      },
    } as unknown as KernelRuntime;
    const context = await definition.initialize({}, runtime);
    const request = { entryPath: fixture.entryPath, parameters: {}, options };
    const execute = async (includeEdges: boolean) => {
      const created = await definition.createGeometry(request, runtime, context);
      const meshed = await definition.meshGeometry!(
        { nativeHandle: created.nativeHandle, options, content: { includeEdges } },
        runtime,
        context,
      );
      return { bytes: readGlb(meshed.geometry), nativeHandle: created.nativeHandle };
    };

    try {
      for (let iteration = 0; iteration < samples; iteration += 1) {
        for (const includeEdges of iteration % 2 ? [true, false] : [false, true]) {
          for (const cache of ['cold', 'warm'] as const) {
            await clearCache();
            if (cache === 'warm') {
              await execute(includeEdges);
            }
            spans.length = 0;
            const memoryBefore = process.memoryUsage();
            const start = performance.now();
            const result = await execute(includeEdges);
            const durationMs = performance.now() - start;
            const memoryAfter = process.memoryUsage();
            const inspected = inspectGlb(result.bytes);
            if (!includeEdges && inspected.lineSegments !== 0) {
              throw new Error(`edge-disabled GLB contains ${inspected.lineSegments} line segments`);
            }
            raw.push({
              fixture: fixture.name,
              path: `T2${includeEdges ? '+' : '-'}`,
              cache,
              iteration,
              durationMs,
              bytes: result.bytes.byteLength,
              ...inspected,
              rssDeltaBytes: memoryAfter.rss - memoryBefore.rss,
              heapDeltaBytes: memoryAfter.heapUsed - memoryBefore.heapUsed,
              spans: [...spans],
            });
          }
        }
      }

      for (const includeEdges of [false, true]) {
        await clearCache();
        const artifact = await execute(includeEdges);
        for (let iteration = 0; iteration < samples; iteration += 1) {
          spans.length = 0;
          const memoryBefore = process.memoryUsage();
          const start = performance.now();
          const meshed = await definition.meshGeometry!(
            { nativeHandle: artifact.nativeHandle, options, content: { includeEdges } },
            runtime,
            context,
          );
          const bytes = readGlb(meshed.geometry);
          const durationMs = performance.now() - start;
          const memoryAfter = process.memoryUsage();
          const inspected = inspectGlb(bytes);
          raw.push({
            fixture: fixture.name,
            path: `T3${includeEdges ? '+' : '-'}`,
            cache: 'artifact',
            iteration,
            durationMs,
            bytes: bytes.byteLength,
            ...inspected,
            rssDeltaBytes: memoryAfter.rss - memoryBefore.rss,
            heapDeltaBytes: memoryAfter.heapUsed - memoryBefore.heapUsed,
            sameByteArray: bytes === artifact.bytes,
            spans: [...spans],
          });
        }
      }
    } catch (error) {
      failures.push({ fixture: fixture.name, message: error instanceof Error ? error.message : String(error) });
    }
    await persistReport();
    console.log(`[${fixtureIndex + 1}/${fixtures.length}] ${fixture.name}`);
  }
  console.log(`Wrote ${reportPath}`);
};

await main();
