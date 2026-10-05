// @vitest-environment node
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assimpTranscoder } from '@taucad/assimp';
import { esbuildBundler } from '@taucad/esbuild';
import { jscadKernel } from '@taucad/jscad';
import { geometryCache } from '@taucad/middleware';
import type { RuntimeClient } from '@taucad/runtime/client';
import { createRuntimeClient } from '@taucad/runtime/client';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { createSqliteComputeEngine, fromSqlite } from '@taucad/runtime/node';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { createTestRuntimeClient, readCoordinateEvidence } from '@taucad/runtime-testing';
import { defineRuntime } from '@taucad/runtime/worker';
import { replicadKernel } from '#replicad.kernel.js';

const source = `
  import { primitives } from '@jscad/modeling';
  export default function main() {
    return Object.assign(primitives.cuboid({ size: [10, 20, 30], center: [12, 23, 34] }), { name: 'Asymmetric JSCAD part' });
  }
`;

const clients: Array<Pick<RuntimeClient, 'shutdown'>> = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map(async (client) => client.shutdown()));
});

const expectGlbBounds = async (bytes: Uint8Array<ArrayBuffer>, expected: ReadonlyArray<readonly [number, number]>) => {
  const evidence = await readCoordinateEvidence({ bytes });
  const positions = evidence.flatMap(({ positions: points }) => points);
  expect(positions.length).toBeGreaterThan(0);
  for (const [axis, interval] of expected.entries()) {
    const coordinates = positions.map((point) => point[axis]!);
    expect(Math.min(...coordinates)).toBeCloseTo(interval[0], 6);
    expect(Math.max(...coordinates)).toBeCloseTo(interval[1], 6);
  }
};

const exportJscadFixture = async () => {
  const producer = createTestRuntimeClient({
    runtime: defineRuntime({
      kernels: [jscadKernel()],
      transcoders: [assimpTranscoder({ backend: 'wasm' })],
      bundlers: [esbuildBundler()],
    }),
    files: { 'jscad.ts': source },
  });
  try {
    const glb = await producer.open({ source: { path: 'jscad.ts' } }).export('glb');
    if (!glb.success) {
      throw new Error(`JSCAD GLB export failed: ${JSON.stringify(glb.issues)}`);
    }
    const stl = await producer.open({ source: { path: 'jscad.ts' } }).export('stl');
    if (!stl.success) {
      throw new Error(`JSCAD GLB→Assimp STL export failed: ${JSON.stringify(stl.issues)}`);
    }
    return { glb: glb.files[0]!.bytes, stl: stl.files[0]!.bytes };
  } finally {
    await producer.shutdown();
  }
};

const meshSource = (bytes: Uint8Array<ArrayBuffer>) => `
  import { importSTLAsMesh } from 'replicad';
  export default async function main() {
    const stl = new Blob([new Uint8Array(${JSON.stringify([...bytes])})], { type: 'model/stl' });
    return { shapes: [{ shape: await importSTLAsMesh(stl), name: 'JSCAD mesh' }] };
  }
`;

const execFileAsync = promisify(execFile);
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const childPath = join(dirname(fileURLToPath(import.meta.url)), 'replicad-mesh-cache-process.fixture.ts');

type MeshProcessResult = {
  readonly builds: number;
  readonly restores: number;
  readonly stlBytes: number;
};

const runMeshProcess = async (mode: 'seed' | 'restore', directory: string): Promise<MeshProcessResult> => {
  const { stdout } = await execFileAsync(
    process.execPath,
    ['--import', '@oxc-node/core/register', childPath, mode, directory],
    { cwd: packageRoot, timeout: 120_000 },
  );
  const result = /^MESH_CACHE_RESULT (.+)$/mu.exec(stdout)?.[1];
  if (result === undefined) {
    throw new Error(`Mesh cache child produced no result: ${stdout}`);
  }
  return JSON.parse(result) as MeshProcessResult;
};

describe('JSCAD mesh handoff into Replicad', () => {
  it('transcodes a real JSCAD GLB to STL and restores its dimensions and axes as display-only MeshShape', async () => {
    const fixture = await exportJscadFixture();
    // The independent JSCAD cuboid oracle is X=[7,17], Y=[13,33], Z=[19,49] millimetres.
    const displayBounds = [
      [0.007, 0.017],
      [0.019, 0.049],
      [-0.033, -0.013],
    ] as const;
    await expectGlbBounds(fixture.glb, displayBounds);
    expect(fixture.stl.byteLength).toBeGreaterThan(84);
    const stlText = new TextDecoder().decode(fixture.stl);
    expect(stlText).toMatch(/^solid/u);
    const stlPositions = [...stlText.matchAll(/vertex\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)/gu)].map(([, x, y, z]) => [
      Number(x),
      Number(y),
      Number(z),
    ]);
    expect(stlPositions).toHaveLength(36);
    const rawStlBounds = [0, 1, 2].map((axis) => [
      Math.min(...stlPositions.map((point) => point[axis]!)),
      Math.max(...stlPositions.map((point) => point[axis]!)),
    ]);
    // STL is unitless. This selected route emits the original JSCAD Z-up millimetre coordinates.
    expect(rawStlBounds).toEqual([
      [7, 17],
      [13, 33],
      [19, 49],
    ]);

    const consumer = createTestRuntimeClient({
      runtime: defineRuntime({ kernels: [replicadKernel({ wasm: 'single' })], bundlers: [esbuildBundler()] }),
      files: { 'mesh.ts': meshSource(fixture.stl) },
    });
    clients.push(consumer);
    const restored = await consumer.open({ source: { path: 'mesh.ts' } }).export('glb');
    expect(restored.success).toBe(true);
    if (!restored.success) {
      throw new Error(`Replicad MeshShape display export failed: ${JSON.stringify(restored.issues)}`);
    }
    await expectGlbBounds(restored.files[0]!.bytes, displayBounds);
    const step = await consumer.open({ source: { path: 'mesh.ts' } }).export('step');
    expect(step.success).toBe(false);
    expect(step.issues.some((issue) => /native BRep|display-only/u.test(issue.message))).toBe(true);
  }, 120_000);

  it('reopens a MeshShape build snapshot in a second runtime client without running the producer again', async () => {
    const fixture = await exportJscadFixture();
    const model = meshSource(fixture.stl);
    const directory = await mkdtemp(join(tmpdir(), 'tau-replicad-mesh-'));
    const plugin = replicadKernel({ wasm: 'single', computeReuse: false });
    const definition = await resolveRuntimePluginDefinition('kernel', plugin);
    const createGeometry = vi.spyOn(definition, 'evaluate');
    const deserializeNativeHandle = vi.spyOn(definition, 'deserializeHandle');
    const runtime = defineRuntime({ kernels: [plugin], middleware: [geometryCache()], bundlers: [esbuildBundler()] });
    const run = async (exportStl: boolean) => {
      const store = createSqliteComputeEngine({ directory });
      const client = createRuntimeClient({
        transport: inProcessTransport({
          runtime,
          fileSystem: fromMemoryFs(),
          compute: { mode: 'durable', store: fromSqlite({ store, workspace: '/project/replicad-mesh' }) },
        }),
      });
      try {
        const document = client.open({ source: { entry: 'mesh.ts', files: { 'mesh.ts': model } } });
        const renderOutcome = await document.view('model').rendering();
        expect(renderOutcome.superseded).toBe(false);
        if (renderOutcome.superseded) {
          throw new Error('Unexpected superseded rendering.');
        }
        const render = renderOutcome.rendering;
        expect(render.success).toBe(true);
        if (exportStl) {
          const exported = await document.export('stl');
          expect(exported.success).toBe(true);
          if (!exported.success) {
            throw new Error(`Cold MeshShape STL export failed: ${JSON.stringify(exported.issues)}`);
          }
          expect(exported.files[0]!.bytes.byteLength).toBeGreaterThan(84);
        }
      } finally {
        await client.shutdown();
        await store.dispose();
      }
    };
    try {
      await run(false);
      expect(createGeometry).toHaveBeenCalledOnce();
      await run(true);
      expect(createGeometry).toHaveBeenCalledOnce();
      expect(deserializeNativeHandle).toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
      await rm(directory, { recursive: true, force: true });
    }
  }, 120_000);

  it('restores a MeshShape snapshot from SQLite in a fresh process before its producer initializes Manifold', async () => {
    const fixture = await exportJscadFixture();
    const directory = await mkdtemp(join(tmpdir(), 'tau-replicad-cold-mesh-'));
    try {
      await writeFile(join(directory, 'mesh.ts'), meshSource(fixture.stl));
      const seed = await runMeshProcess('seed', directory);
      expect(seed).toEqual({ builds: 1, restores: 0, stlBytes: 0 });

      const restored = await runMeshProcess('restore', directory);
      expect(restored.builds).toBe(0);
      expect(restored.restores).toBeGreaterThan(0);
      expect(restored.stlBytes).toBeGreaterThan(84);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 180_000);
});
