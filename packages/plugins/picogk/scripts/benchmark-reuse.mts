#!/usr/bin/env node

/**
 * Purpose: Measure transparent PicoGK reuse with unchanged ordinary C# bolt source.
 * Why: Compare work, geometry, bytes and cold/warm latency before changing ownership or instancing.
 * Environment: Node 24+, a matched prepared darwin-arm64 PicoGK payload; no environment variables.
 * Usage: node --import @oxc-node/core/register packages/plugins/picogk/scripts/benchmark-reuse.mts
 *        [--resource-root <target-directory>] [--output <directory>] [--counts 1,2,100,1000]
 *        [--samples 3] [--warmup 2]
 * Exit codes: 0 when every semantic gate passes; 1 for invalid inputs, resources or geometry.
 */

/* oxlint-disable no-await-in-loop -- Cold and warm worker measurements must be serialized. */
import { strictEqual, ok } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, loadavg, release } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';

import { createNodeIo } from '@taucad/geometry-core';
import type { RuntimeLogger } from '@taucad/runtime/kernel';

import { picogkArtifactToGlb } from '#picogk-mesh.js';
import { picogkAnalysisSchema, picogkBuildSchema } from '#picogk.protocol.js';
import { picogkRuntimeManifestSchema } from '#picogk-resources.js';
import { PicogkSession } from '#picogk-session.js';

const workspaceRoot = resolve(import.meta.dirname, '../../../..');
const target = `${process.platform}-${process.arch}`;
const modes = ['same-mesh-add', 'same-voxels-add', 'voxel-duplicates', 'mesh-transformed-copies'] as const;
const source = `using System;
using System.ComponentModel.DataAnnotations;
using System.Numerics;
using PicoGK;

Library.Go(1f, () =>
{
    var viewer = Library.oViewer();
    viewer.SetGroupMaterial(0, new ColorFloat("B87333"), 1f, .28f);
    if (Params.Case == 0 || Params.Case == 3)
    {
        var bolt = Fixture.IndexedBolt();
        for (int i = 0; i < Params.Count; i++)
        {
            var displayed = Params.Case == 0 ? bolt : bolt.mshCreateTransformed(Matrix4x4.CreateTranslation(i * 8f, 0, 0));
            viewer.Add(displayed, $"Bolt {i}");
        }
    }
    else
    {
        using var lattice = new Lattice();
        var origin = new Vector3(.17f, .13f, .27f);
        lattice.AddBeam(origin, origin + new Vector3(0, 0, 8), 1.5f, 1.5f, false);
        lattice.AddBeam(origin + new Vector3(0, 0, 8), origin + new Vector3(0, 0, 10), 3f, 3f, false);
        var bolt = new Voxels(lattice);
        for (int i = 0; i < Params.Count; i++)
        {
            var displayed = Params.Case == 1 ? bolt : bolt.voxDuplicate();
            viewer.Add(displayed, $"Bolt {i}");
            if (Params.Case == 2) viewer.SetObjectMatrix(displayed, Matrix4x4.CreateTranslation(i * 8f, 0, 0));
        }
    }
});

public static class Params
{
    [Range(0, 3)] public static int Case { get; set; } = 0;
    [Range(1, 1000)] public static int Count { get; set; } = 1;
}

public static class Fixture
{
    public static Mesh IndexedBolt()
    {
        const int sides = 24;
        var mesh = new Mesh();
        var heights = new[] { 0f, 8f, 8f, 10f };
        for (int ring = 0; ring < 4; ring++)
            for (int i = 0; i < sides; i++)
            {
                Vector3 point;
                if (ring < 2)
                {
                    float angle = 2 * MathF.PI * i / sides;
                    point = new Vector3(1.5f * MathF.Cos(angle), 1.5f * MathF.Sin(angle), heights[ring]);
                }
                else
                {
                    float start = MathF.PI * (i / 4) / 3;
                    float end = start + MathF.PI / 3;
                    var a = new Vector3(3f * MathF.Cos(start), 3f * MathF.Sin(start), heights[ring]);
                    var b = new Vector3(3f * MathF.Cos(end), 3f * MathF.Sin(end), heights[ring]);
                    point = Vector3.Lerp(a, b, (i % 4) / 4f);
                }
                mesh.nAddVertex(point);
            }
        for (int ring = 0; ring < 3; ring++)
            for (int i = 0; i < sides; i++)
            {
                int next = (i + 1) % sides;
                int a = ring * sides + i, b = ring * sides + next;
                int c = (ring + 1) * sides + next, d = (ring + 1) * sides + i;
                mesh.nAddTriangle(a, b, c);
                mesh.nAddTriangle(a, c, d);
            }
        int bottom = mesh.nAddVertex(Vector3.Zero);
        int top = mesh.nAddVertex(new Vector3(0, 0, 10));
        for (int i = 0; i < sides; i++)
        {
            int next = (i + 1) % sides;
            mesh.nAddTriangle(bottom, next, i);
            mesh.nAddTriangle(top, 3 * sides + i, 3 * sides + next);
        }
        return mesh;
    }
}
`;

type Point = readonly [number, number, number];
type Shape = {
  readonly name: string;
  readonly corners: readonly Point[];
  readonly volume: number;
  readonly bounds: readonly Point[];
};
const digest = (bytes: string | Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');
const logger: RuntimeLogger = {
  log: () => undefined,
  debug: () => undefined,
  trace: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  custom: () => undefined,
};

const options = (): {
  resourceRoot: string;
  output: string;
  counts: number[];
  samples: number;
  warmup: number;
} => {
  const values = new Map<string, string>();
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index]!;
    const value = args[index + 1];
    if (
      !['--resource-root', '--output', '--counts', '--samples', '--warmup'].includes(name) ||
      !value ||
      values.has(name)
    ) {
      throw new TypeError(`Invalid arguments. See the usage header in ${import.meta.filename}.`);
    }
    values.set(name, value);
  }
  const counts = (values.get('--counts') ?? '1,2,100,1000').split(',').map(Number);
  const samples = Number(values.get('--samples') ?? '3');
  const warmup = Number(values.get('--warmup') ?? '2');
  ok(
    counts[0] === 1 && counts.every((count) => Number.isInteger(count) && count >= 1 && count <= 1000),
    'Counts must begin with 1 and stay in [1,1000].',
  );
  strictEqual(new Set(counts).size, counts.length, 'Counts must be unique.');
  ok(Number.isInteger(samples) && samples >= 1 && samples <= 100, 'Samples must be in [1,100].');
  ok(Number.isInteger(warmup) && warmup >= 1 && warmup <= 100, 'Warmup must be in [1,100].');
  return {
    resourceRoot: resolve(
      values.get('--resource-root') ?? join(workspaceRoot, 'apps/desktop/resources/picogk', target),
    ),
    output: resolve(
      values.get('--output') ??
        join(workspaceRoot, 'out/reports/benchmarks/picogk-reuse', new Date().toISOString().replaceAll(':', '-')),
    ),
    counts,
    samples,
    warmup,
  };
};

const close = (actual: number, expected: number, bounds: { tolerance: number; message: string }): void => {
  ok(
    Number.isFinite(actual) && Math.abs(actual - expected) <= bounds.tolerance,
    `${bounds.message}: ${String(actual)} != ${String(expected)} ± ${String(bounds.tolerance)}`,
  );
};

/** Read real default-scene triangles, including node placement, in author millimetres/Z-up. */
const shapes = async (
  bytes: Uint8Array<ArrayBuffer>,
): Promise<{
  shapes: Shape[];
  meshes: number;
  positionAccessors: number;
  uniqueRenderVertices: number;
  binBytes: number;
}> => {
  const io = await createNodeIo();
  const document = await io.readBinary(bytes);
  const root = document.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  ok(scene, 'GLB must have an active scene.');
  const result: Shape[] = [];
  const accessors = new Map<unknown, number>();
  scene.traverse((node) => {
    const mesh = node.getMesh();
    if (!mesh) {
      return;
    }
    const matrix = node.getWorldMatrix();
    const corners: Point[] = [];
    for (const primitive of mesh.listPrimitives()) {
      strictEqual(primitive.getMode(), 4, 'Bolt must contain surface triangles.');
      const positions = primitive.getAttribute('POSITION');
      const normals = primitive.getAttribute('NORMAL');
      const indices = primitive.getIndices();
      ok(positions && normals && indices, 'Bolt needs indexed positions and normals.');
      strictEqual(normals.getCount(), positions.getCount(), 'Normals must address every render vertex.');
      accessors.set(positions, positions.getCount());
      strictEqual(indices.getCount() % 3, 0);
      for (let index = 0; index < indices.getCount(); index++) {
        const vertex = indices.getScalar(index);
        ok(Number.isInteger(vertex) && vertex >= 0 && vertex < positions.getCount(), 'Index must address a vertex.');
        const [x, y, z] = positions.getElement(vertex, [0, 0, 0]);
        const normal = normals.getElement(vertex, [0, 0, 0]);
        close(Math.hypot(...normal), 1, { tolerance: 0.001, message: 'Normal length' });
        const wx = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
        const wy = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
        const wz = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
        const point: Point = [wx * 1000, -wz * 1000, wy * 1000];
        ok(
          point.every((value) => Number.isFinite(value)),
          'World triangle must be finite.',
        );
        corners.push(point);
      }
    }
    const min: [number, number, number] = [Infinity, Infinity, Infinity];
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (const point of corners) {
      for (const axis of [0, 1, 2] as const) {
        min[axis] = Math.min(min[axis], point[axis]);
        max[axis] = Math.max(max[axis], point[axis]);
      }
    }
    const center = min.map((value, axis) => (value + max[axis]!) / 2);
    const edges = new Map<string, number>();
    const key = (point: Point): string =>
      point.map((value, axis) => Math.round((value - center[axis]!) * 1000)).join(',');
    let volume = 0;
    for (let index = 0; index < corners.length; index += 3) {
      const a = corners[index]!.map((value, axis) => value - center[axis]!);
      const b = corners[index + 1]!.map((value, axis) => value - center[axis]!);
      const c = corners[index + 2]!.map((value, axis) => value - center[axis]!);
      const cross = [b[1]! * c[2]! - b[2]! * c[1]!, b[2]! * c[0]! - b[0]! * c[2]!, b[0]! * c[1]! - b[1]! * c[0]!];
      volume += (a[0]! * cross[0]! + a[1]! * cross[1]! + a[2]! * cross[2]!) / 6;
      const vertices = [key(corners[index]!), key(corners[index + 1]!), key(corners[index + 2]!)];
      strictEqual(new Set(vertices).size, 3, 'Triangle must not collapse at the 0.001mm weld tolerance.');
      for (let edge = 0; edge < 3; edge++) {
        const pair = [vertices[edge]!, vertices[(edge + 1) % 3]!].sort().join('|');
        edges.set(pair, (edges.get(pair) ?? 0) + 1);
      }
    }
    ok(volume > 0 && edges.size > 0, 'Bolt must enclose positive oriented volume.');
    ok(
      [...edges.values()].every((count) => count === 2),
      'Spatially welded bolt must be closed/manifold.',
    );
    result.push({ name: node.getName(), corners, volume, bounds: [min, max] });
  });
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let binBytes = 0;
  for (let offset = 12; offset < bytes.byteLength; ) {
    const length = view.getUint32(offset, true);
    if (view.getUint32(offset + 4, true) === 0x00_4e_49_42) {
      binBytes += length;
    }
    offset += 8 + length;
  }
  return {
    shapes: result,
    meshes: root.listMeshes().length,
    positionAccessors: accessors.size,
    uniqueRenderVertices: [...accessors.values()].reduce((sum, count) => sum + count, 0),
    binBytes,
  };
};

const validateHexHead = (shape: Shape): void => {
  const boundary = shape.corners.filter(([x, y, z]) => z > 9.999 && Math.hypot(x, y) > 2);
  ok(boundary.length > 0, 'Hexagonal head must have top boundary corners.');
  for (const [x, y] of boundary) {
    const support = Math.max(
      ...Array.from({ length: 6 }, (_, side) => {
        const angle = Math.PI / 6 + (side * Math.PI) / 3;
        return x * Math.cos(angle) + y * Math.sin(angle);
      }),
    );
    close(support, 3 * Math.cos(Math.PI / 6), {
      tolerance: 0.001,
      message: 'Head corner on one of six straight edges',
    });
  }
};

const validate = (actual: Shape[], reference: Shape | undefined, input: { mode: number; count: number }): Shape => {
  const { mode, count } = input;
  const repeated = mode < 2;
  strictEqual(actual.length, repeated ? 1 : count, 'Final occurrence count (same Add replaces).');
  const base = reference ?? actual[0]!;
  const mesh = mode === 0 || mode === 3;
  const shaftArea = 0.5 * 24 * Math.sin((2 * Math.PI) / 24) * 1.5 ** 2;
  const headArea = 0.5 * 6 * Math.sin((2 * Math.PI) / 6) * 3 ** 2;
  const volume = mesh ? shaftArea * 8 + headArea * 2 : Math.PI * (1.5 ** 2 * 8 + 3 ** 2 * 2);
  close(base.volume, volume, {
    tolerance: mesh ? 0.001 : volume * 0.3,
    message: 'Analytical bolt volume (voxel resolution tolerance declared)',
  });
  if (mesh) {
    strictEqual(base.corners.length / 3, 192, 'Indexed fixture has 192 source triangles.');
    validateHexHead(base);
  }
  const origin = mesh ? [0, 0, 0] : [0.17, 0.13, 0.27];
  const halfWidth: Point = [3, mesh ? 3 * Math.sin(Math.PI / 3) : 3, 0];
  for (const axis of [0, 1, 2] as const) {
    close(base.bounds[0]![axis], origin[axis]! - halfWidth[axis], {
      tolerance: mesh ? 0.001 : 1,
      message: 'Source lower bounds',
    });
    close(base.bounds[1]![axis], origin[axis]! + (axis === 2 ? 10 : halfWidth[axis]), {
      tolerance: mesh ? 0.001 : 1,
      message: 'Source upper bounds',
    });
  }
  for (const [index, element] of actual.entries()) {
    const shape = element;
    strictEqual(shape.name, `Bolt ${String(repeated ? count - 1 : index)}`);
    strictEqual(shape.corners.length, base.corners.length, 'Triangle count must preserve reference surface.');
    const translation = repeated ? 0 : index * 8;
    const offset: Point = [translation, 0, 0];
    const tolerance = Math.max(0.003, translation * 5e-7);
    for (let corner = 0; corner < shape.corners.length; corner++) {
      for (const axis of [0, 1, 2] as const) {
        close(shape.corners[corner]![axis] - offset[axis], base.corners[corner]![axis], {
          tolerance,
          message: 'Translated triangle corner',
        });
      }
    }
    close(shape.volume, base.volume, { tolerance: Math.max(0.001, base.volume * 0.001), message: 'Placed volume' });
    for (let side = 0; side < 2; side++) {
      for (const axis of [0, 1, 2] as const) {
        close(shape.bounds[side]![axis] - offset[axis], base.bounds[side]![axis], {
          tolerance,
          message: 'Placed bounds',
        });
      }
    }
  }
  return base;
};

const distribution = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    samples: sorted.length,
    min: sorted[0],
    p50: sorted[Math.floor((sorted.length - 1) * 0.5)],
    p95: sorted[Math.ceil((sorted.length - 1) * 0.95)],
    max: sorted.at(-1),
  };
};

const main = async (): Promise<void> => {
  const settings = options();
  strictEqual(target, 'darwin-arm64', 'Native baseline currently qualifies darwin-arm64 only.');
  mkdirSync(settings.output, { recursive: true });
  ok(
    !existsSync(join(settings.output, 'receipt.json')),
    'Use a fresh output directory to preserve earlier run evidence.',
  );
  const manifestBytes = readFileSync(join(settings.resourceRoot, 'tau-runtime-manifest.json'));
  const manifest = picogkRuntimeManifestSchema.parse(JSON.parse(manifestBytes.toString()));
  strictEqual(manifest.target, target);
  const receipt = {
    started: new Date().toISOString(),
    command: process.argv,
    settings,
    target,
    host: {
      cpu: cpus()[0]?.model,
      logicalCpus: cpus().length,
      loadAverage: loadavg(),
      osRelease: release(),
      node: process.version,
    },
    tauHead: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: workspaceRoot,
      encoding: 'utf8',
    }).trim(),
    scriptSha256: digest(readFileSync(import.meta.filename)),
    sourceSha256: digest(source),
    manifestSha256: digest(manifestBytes),
    manifest,
    timingQualification: 'Host jobs are uncontrolled; load averages qualify provisional timings, not latency gains.',
    unavailableCounters:
      'This protocol exposes phase timings and live memory snapshots, not measured extraction/copy/layout/allocation counters or owned peak bytes.',
  };
  writeFileSync(join(settings.output, 'receipt.json'), `${JSON.stringify(receipt, undefined, 2)}\n`);
  writeFileSync(join(settings.output, 'main.cs'), source);
  const privateRoot = mkdtempSync(join(settings.output, 'sessions-'));
  const samples: Array<{
    mode: string;
    count: number;
    state: string;
    settledMilliseconds: number;
  }> = [];
  const references = new Map<number, Shape>();
  let ordinal = 0;
  const runSession = async (mode: number, count: number, cold: boolean): Promise<void> => {
    const directory = join(privateRoot, String(++ordinal));
    const workspace = join(directory, 'workspace');
    const artifacts = join(directory, 'artifacts');
    mkdirSync(workspace, { recursive: true });
    mkdirSync(artifacts);
    writeFileSync(join(workspace, 'main.cs'), source);
    const session = new PicogkSession({
      workerExecutable: join(settings.resourceRoot, manifest.workerPath),
      workerSha256: manifest.workerSha256,
      workspacePath: workspace,
      artifactPath: artifacts,
      resourceFiles: manifest.resourceFiles.map(({ path, ...entry }) => ({
        ...entry,
        path: join(settings.resourceRoot, path),
      })),
      requestTimeout: 120_000,
      maxArtifactBytes: 256 * 1024 * 1024,
      logger,
    });
    const { signal } = new AbortController();
    try {
      const runs = cold ? 1 : settings.warmup + settings.samples;
      for (let iteration = 0; iteration < runs; iteration++) {
        const loadAtStart = loadavg();
        const start = performance.now();
        const analyzed = await session.request({
          method: 'analyze',
          params: { entryPath: 'main.cs' },
          schema: picogkAnalysisSchema,
          signal,
        });
        const analyzeEnd = performance.now();
        strictEqual(analyzed.timings.cacheHit, iteration > 0, 'Compilation cache must follow this worker lifetime.');
        const built = await session.request({
          method: 'build',
          params: {
            entryPath: 'main.cs',
            // eslint-disable-next-line @typescript-eslint/naming-convention -- Keys retain the authored C# parameter property names.
            parameters: { Case: mode, Count: count },
          },
          schema: picogkBuildSchema,
          signal,
        });
        const buildEnd = performance.now();
        strictEqual(built.timings.compileCacheHit, true, 'Build must reuse analyzed unchanged source.');
        strictEqual(built.recycleAfterResponse, false, 'Ordinary baseline must not request worker recycling.');
        const artifact = await session.readArtifact(built);
        const readEnd = performance.now();
        const glb = picogkArtifactToGlb(artifact, built);
        const settledEnd = performance.now();
        const decoded = await shapes(glb);
        references.set(mode, validate(decoded.shapes, references.get(mode), { mode, count }));
        ok(!existsSync(built.artifactPath), 'Consumed mesh artifact must be unlinked.');
        const measured = cold || iteration >= settings.warmup;
        const sample = {
          mode: modes[mode]!,
          count,
          state: cold ? 'cold-worker' : measured ? 'warm-worker' : 'warmup',
          iteration,
          settledMilliseconds: settledEnd - start,
          hostLoadAverage: { start: loadAtStart, end: loadavg() },
          analyzeMilliseconds: analyzeEnd - start,
          buildMilliseconds: buildEnd - analyzeEnd,
          artifactReadMilliseconds: readEnd - buildEnd,
          glbMilliseconds: settledEnd - readEnd,
          validationMilliseconds: performance.now() - settledEnd,
          artifactBytes: artifact.byteLength,
          glbBytes: glb.byteLength,
          binBytes: decoded.binBytes,
          finalComponents: built.components.length,
          gltfMeshes: decoded.meshes,
          positionAccessors: decoded.positionAccessors,
          occurrenceRenderVertices: built.components.reduce((sum, component) => sum + component.positionCount / 3, 0),
          uniqueGltfRenderVertices: decoded.uniqueRenderVertices,
          surfaceTriangles: built.components.reduce((sum, component) => sum + component.indexCount / 3, 0),
          inputExpectation: mode === 0 || mode === 3 ? { indexedPrototypeVertices: 98, prototypeTriangles: 192 } : null,
          workerTimings: built.timings,
          compilationTimings: analyzed.timings,
          memorySnapshots: built.metrics,
          workCounters: 'counters' in built ? built.counters : null,
          geometry: {
            referenceBounds: references.get(mode)!.bounds,
            referenceVolumeCubicMm: references.get(mode)!.volume,
          },
          glbSha256: digest(glb),
        };
        appendFileSync(join(settings.output, 'samples.ndjson'), `${JSON.stringify(sample)}\n`);
        if (measured) {
          samples.push(sample);
        }
        console.error(
          `${sample.mode} N=${String(count)} ${sample.state}: ${sample.settledMilliseconds.toFixed(2)}ms, ${String(sample.glbBytes)}B GLB`,
        );
      }
    } finally {
      await session.cleanup();
    }
  };
  try {
    for (let mode = 0; mode < modes.length; mode++) {
      for (const count of settings.counts) {
        for (let sample = 0; sample < settings.samples; sample++) {
          await runSession(mode, count, true);
        }
        await runSession(mode, count, false);
      }
    }
    const summary = modes.flatMap((mode) =>
      settings.counts.flatMap((count) =>
        ['cold-worker', 'warm-worker'].map((state) => ({
          mode,
          count,
          state,
          settledMilliseconds: distribution(
            samples
              .filter((sample) => sample.mode === mode && sample.count === count && sample.state === state)
              .map((sample) => sample.settledMilliseconds),
          ),
        })),
      ),
    );
    writeFileSync(join(settings.output, 'summary.json'), `${JSON.stringify(summary, undefined, 2)}\n`);
    console.log(JSON.stringify({ output: settings.output, summary }, undefined, 2));
  } finally {
    rmSync(privateRoot, { recursive: true, force: true });
  }
};

try {
  await main();
} catch (error) {
  console.error('PicoGK reuse benchmark failed:', error);
  process.exit(1);
}
