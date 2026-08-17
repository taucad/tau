#!/usr/bin/env -S pnpm tsx

/* oxlint-disable no-await-in-loop -- Benchmark contenders must execute serially. */
/* eslint-disable @nx/enforce-module-boundaries -- Disposable benchmark imports a recovered historical kernel. */

import { glob, writeFile } from 'node:fs/promises';
import { cpus, platform, release } from 'node:os';
import { dirname, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { clearCache } from 'openrscad-engine';
import { createNodeClient } from '@taucad/runtime/node';
import { defineRuntime } from '@taucad/runtime';
import { gltfEdgeDetection } from '@taucad/runtime/middleware';
import { openrscad } from './.openrscad-legacy-kernel.ts';

const parseArgs = (values: string[]) => {
  const result = { corpus: '', report: '', samples: 30 };
  for (let index = 0; index < values.length; index += 1) {
    const next = values[index + 1];
    if (values[index] === '--corpus' && next) result.corpus = resolve(next);
    else if (values[index] === '--report' && next) result.report = resolve(next);
    else if (values[index] === '--samples' && next) result.samples = Number(next);
    else throw new Error(`Unknown or incomplete argument: ${values[index]}`);
    index += 1;
  }
  if (!result.corpus || !result.report || !Number.isInteger(result.samples) || result.samples < 1) {
    throw new Error('Usage: --corpus <directory> --report <file> [--samples <positive integer>]');
  }
  return result;
};

const args = parseArgs(process.argv.slice(2));
const parameters = { $fn: 0, $fa: 12, $fs: 2 };
const builtIns = [
  resolve('packages/kernels/openrscad/test/fixtures/planetary-gearbox/main.scad'),
  resolve('libs/tau-examples/src/kernels/openscad/kitchen-sink/main.scad'),
];

type Fixture = { root: string; entry: string; name: string };
type Sample = {
  fixture: string;
  path: 'T1-' | 'T1+';
  cache: 'cold' | 'warm';
  iteration: number;
  durationMs: number;
  bytes?: number;
  nodes?: number;
  lines?: number;
  rssDeltaBytes: number;
  heapDeltaBytes: number;
  spans: Record<string, number>;
  error?: string;
};

const corpusFixtures = async (): Promise<Fixture[]> => {
  const paths: string[] = [];
  for await (const path of glob(['**/*.scad', '.*/**/*.scad'], { cwd: args.corpus })) paths.push(path);
  paths.sort();
  if (paths.length === 0) throw new Error(`No SCAD files found below ${args.corpus}`);
  return paths.map((entry) => ({
    root: args.corpus,
    entry: entry.split(sep).join('/'),
    name: relative(resolve('.'), resolve(args.corpus, entry)),
  }));
};

const readGlb = (outcome: Awaited<ReturnType<Awaited<ReturnType<typeof createNodeClient>>['render']>>) => {
  if (outcome.superseded) throw new Error('render was superseded');
  if (!outcome.geometry.success) throw new Error(outcome.geometry.issues.map(({ message }) => message).join('; '));
  if (outcome.geometry.data.format !== 'gltf')
    throw new Error(`expected GLB, received ${outcome.geometry.data.format}`);
  return outcome.geometry.data.content;
};

const inspectGlb = (bytes: Uint8Array<ArrayBuffer>) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as {
    nodes?: unknown[];
    meshes?: Array<{ primitives?: Array<{ mode?: number }> }>;
  };
  return {
    bytes: bytes.byteLength,
    nodes: json.nodes?.length ?? 0,
    lines: json.meshes?.flatMap(({ primitives = [] }) => primitives).filter(({ mode = 4 }) => mode === 1).length ?? 0,
  };
};

const median = (input: number[]) => {
  const values = [...input].sort((left, right) => left - right);
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle]! : (values[middle - 1]! + values[middle]!) / 2;
};

const p95 = (input: number[]) => [...input].sort((left, right) => left - right)[Math.ceil(input.length * 0.95) - 1]!;

const runtimes = {
  'T1-': defineRuntime({ kernels: [openrscad()], middleware: [], bundlers: [], transcoders: [] }),
  'T1+': defineRuntime({ kernels: [openrscad()], middleware: [gltfEdgeDetection()], bundlers: [], transcoders: [] }),
};

const raw: Sample[] = [];
const fixtures: Fixture[] = [
  ...builtIns.map((entry) => ({ root: dirname(entry), entry: 'main.scad', name: relative(resolve('.'), entry) })),
  ...(await corpusFixtures()),
];

for (const [fixtureIndex, fixture] of fixtures.entries()) {
  const clients = {
    'T1-': await createNodeClient(fixture.root, { runtime: runtimes['T1-'] }),
    'T1+': await createNodeClient(fixture.root, { runtime: runtimes['T1+'] }),
  };
  try {
    for (let iteration = 0; iteration < args.samples; iteration += 1) {
      const paths = iteration % 2 === 0 ? (['T1-', 'T1+'] as const) : (['T1+', 'T1-'] as const);
      for (const path of paths) {
        const includeEdges = path === 'T1+';
        for (const cache of ['cold', 'warm'] as const) {
          await clearCache();
          if (cache === 'warm') {
            await clients[path].render({ source: { path: fixture.entry }, parameters, content: { includeEdges } });
          }
          const telemetry: Array<{ name: string; duration: number; startTime: number }> = [];
          const unsubscribe = clients[path].on('telemetry', (batch) => telemetry.push(...batch));
          const memoryBefore = process.memoryUsage();
          const start = performance.now();
          try {
            const bytes = readGlb(
              await clients[path].render({ source: { path: fixture.entry }, parameters, content: { includeEdges } }),
            );
            const end = performance.now();
            const memoryAfter = process.memoryUsage();
            const spans: Record<string, number> = {};
            for (const entry of telemetry.filter(({ startTime }) => startTime >= start && startTime <= end)) {
              spans[entry.name] = (spans[entry.name] ?? 0) + entry.duration;
            }
            raw.push({
              fixture: fixture.name,
              path,
              cache,
              iteration,
              durationMs: end - start,
              ...inspectGlb(bytes),
              rssDeltaBytes: memoryAfter.rss - memoryBefore.rss,
              heapDeltaBytes: memoryAfter.heapUsed - memoryBefore.heapUsed,
              spans,
            });
          } catch (error) {
            const end = performance.now();
            const memoryAfter = process.memoryUsage();
            raw.push({
              fixture: fixture.name,
              path,
              cache,
              iteration,
              durationMs: end - start,
              rssDeltaBytes: memoryAfter.rss - memoryBefore.rss,
              heapDeltaBytes: memoryAfter.heapUsed - memoryBefore.heapUsed,
              spans: {},
              error: error instanceof Error ? error.message : String(error),
            });
          } finally {
            unsubscribe();
          }
        }
      }
    }
  } finally {
    clients['T1-'].terminate();
    clients['T1+'].terminate();
  }
  const completed = new Set(raw.map(({ fixture: name }) => name)).size;
  const groups = [...new Set(raw.map(({ fixture: name, path, cache }) => `${name}\0${path}\0${cache}`))];
  const summary = groups.map((key) => {
    const [name, path, cache] = key.split('\0');
    const samples = raw.filter((sample) => sample.fixture === name && sample.path === path && sample.cache === cache);
    const successful = samples.filter((sample) => !sample.error);
    const timings = successful.map(({ durationMs }) => durationMs);
    return {
      fixture: name,
      path,
      cache,
      attempted: samples.length,
      successful: successful.length,
      failed: samples.length - successful.length,
      ...(timings.length > 0 ? { medianMs: median(timings), p95Ms: p95(timings) } : {}),
    };
  });
  await writeFile(
    args.report,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        environment: { platform: platform(), release: release(), cpu: cpus()[0]?.model, node: process.version },
        methodology: {
          samples: args.samples,
          contenders: {
            'T1-':
              'recovered pre-native Tau render() plus JavaScript color matching, spatial welding/splitting, and GLB assembly',
            'T1+': 'T1- plus the production gltfEdgeDetection middleware',
          },
          cache: 'cold clears the OpenRSCAD engine cache; warm clears then primes the identical path and edge mode',
          order: 'contenders alternate first position by iteration and execute serially',
          tessellation: { $fn: 0, $fa: 12, $fs: 2 },
        },
        inventory: fixtures.map(({ name }) => name),
        completed,
        summary,
        raw,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`[${fixtureIndex + 1}/${fixtures.length}] ${fixture.name}`);
}
