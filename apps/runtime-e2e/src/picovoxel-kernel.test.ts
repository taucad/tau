// @vitest-environment node

import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { geometryCache } from '@taucad/middleware';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { esbuild } from '@taucad/esbuild';
import { picovoxel } from '@taucad/picovoxel';
import type { PicovoxelOptionsInput } from '@taucad/picovoxel';
import { Worker as NodeWorker } from 'node:worker_threads';
import { createRuntimeClient } from '@taucad/runtime';
import { fromNodeFs } from '@taucad/runtime/filesystem/node';
import { createNodeClient, createSqliteComputeEngine, fromSqlite } from '@taucad/runtime/node';
import { nodeWorkerTransport } from '@taucad/runtime/transport/node';
import { defineRuntime } from '@taucad/runtime/worker';
import {
  extractGltfFromExportResult,
  glbToDocument,
  readGltfNamingSummary,
  validateGlbData,
} from '@taucad/runtime-testing';
import { kernelConfigurations } from '@taucad/types/constants';

const createRuntime = (wasm?: PicovoxelOptionsInput['wasm']) =>
  defineRuntime({ plugins: [picovoxel(wasm ? { kernels: { default: { wasm } } } : undefined), esbuild()] });

const temporaryDirectories: string[] = [];

const picovoxelExamples = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../libs/tau-examples/src/kernels/picovoxel',
);

/** The worker entry is TypeScript in this workspace, so the thread needs tsx's loader. */
class TsxWorker extends NodeWorker {
  public constructor(url: string | URL) {
    super(url, { execArgv: ['--import', 'tsx'] });
  }
}

/** A multi-file ShapeKernel model with an offset, so the fast and exact lanes build different geometry. */
const writeProject = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'tau-picovoxel-e2e-'));
  temporaryDirectories.push(directory);
  await mkdir(join(directory, 'lib'));
  await writeFile(
    join(directory, 'main.ts'),
    `
      import type { Pico } from 'picovoxel';
      import { makeSphere } from './lib/widget.js';
      export const defaultParams = { voxelSize: 1, radius: 8 };
      export default function main(pico: Pico, params = defaultParams) {
        return makeSphere(pico, params.radius).offset({ distance: 0.5 });
      }
    `,
  );
  await writeFile(
    join(directory, 'lib/widget.ts'),
    `
      import type { Pico, Voxels } from 'picovoxel';
      import { BaseSphere, localFrame } from 'picovoxel/shapekernel';
      export const makeSphere = (pico: Pico, radius: number): Voxels =>
        new BaseSphere(localFrame.create([0, 0, 0]), radius).voxConstruct(pico);
    `,
  );
  return directory;
};

const stlHeader = (bytes: Uint8Array<ArrayBuffer>): string => new TextDecoder().decode(bytes.subarray(0, 80)).trimEnd();

/** Write a one-file project and return its directory. */
const writeModel = async (source: string): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'tau-picovoxel-e2e-'));
  temporaryDirectories.push(directory);
  await writeFile(join(directory, 'main.ts'), source);
  return directory;
};

/** Signed volume and bounds of every triangle primitive in a GLB, in its own units. */
const measureGlb = async (bytes: Uint8Array<ArrayBuffer>) => {
  const document = await glbToDocument(bytes);
  let volume = 0;
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const positions = primitive.getAttribute('POSITION')!.getArray()!;
      const indices = primitive.getIndices()!.getArray()!;
      for (let offset = 0; offset < positions.length; offset += 3) {
        for (const axis of [0, 1, 2]) {
          minimum[axis] = Math.min(minimum[axis]!, positions[offset + axis]!);
          maximum[axis] = Math.max(maximum[axis]!, positions[offset + axis]!);
        }
      }
      for (let offset = 0; offset < indices.length; offset += 3) {
        const [a, b, c] = [indices[offset]! * 3, indices[offset + 1]! * 3, indices[offset + 2]! * 3];
        volume +=
          (positions[a]! * (positions[b + 1]! * positions[c + 2]! - positions[b + 2]! * positions[c + 1]!) -
            positions[a + 1]! * (positions[b]! * positions[c + 2]! - positions[b + 2]! * positions[c]!) +
            positions[a + 2]! * (positions[b]! * positions[c + 1]! - positions[b + 1]! * positions[c]!)) /
          6;
      }
    }
  }
  return { volume, minimum, maximum };
};

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => rm(directory, { recursive: true })));
});

describe('PicoVoxel packaged runtime', () => {
  it.each(['serial', 'auto'] as const)(
    'should restore named multi-file parts in a fresh %s host and invalidate a helper rename',
    async (wasm) => {
      const projectPath = await writeProject();
      const hostState = await mkdtemp(join(tmpdir(), 'tau-picovoxel-compute-'));
      temporaryDirectories.push(hostState);
      const helper = (name: string) => `
      import type { Pico } from 'picovoxel';
      export const makeSphere = (pico: Pico, radius: number) => ({
        shape: pico.createVoxels({ shape: 'sphere', radius }).clone().offset({ distance: 0.5 }),
        name: ${JSON.stringify(name)},
      });
    `;
      await writeFile(
        join(projectPath, 'main.ts'),
        `
      import type { Pico } from 'picovoxel';
      import type { PicovoxelResult } from '@taucad/picovoxel';
      import { makeSphere } from './lib/widget.js';
      export const defaultParams = { voxelSize: 1 };
      export default function main(pico: Pico): PicovoxelResult {
        const part = makeSphere(pico, 4);
        return [part, { ...part, name: 'Mesh' }, part.shape];
      }
    `,
      );
      const run = async () => {
        const engine = createSqliteComputeEngine({ directory: hostState });
        const client = createRuntimeClient({
          transport: inProcessTransport({
            runtime: defineRuntime({
              plugins: [picovoxel({ kernels: { default: { wasm } } }), esbuild()],
              middleware: [geometryCache()],
            }),
            fileSystem: fromNodeFs(projectPath),
            compute: { mode: 'durable', store: fromSqlite({ store: engine, workspace: projectPath }) },
          }),
        });
        try {
          const preview = await client.render({ source: { path: 'main.ts' } });
          if (preview.superseded || !preview.geometry.success || preview.geometry.data.format !== 'gltf') {
            throw new Error('Preview failed');
          }
          const glb = extractGltfFromExportResult(await client.export('glb'));
          if (!glb) {
            throw new Error('Exact GLB export failed');
          }
          const stl = await client.export('stl');
          if (!stl.success) {
            throw new Error('STL export failed');
          }
          await client.shutdown({ drain: true });
          const control = await engine.control({ workspace: projectPath });
          const { entries } = await control.inspect({});
          return { preview: preview.geometry.data.content, glb, stl: stl.data, entries };
        } finally {
          try {
            await client.shutdown({ drain: true });
          } finally {
            await engine.dispose();
          }
        }
      };
      await writeFile(join(projectPath, 'lib/widget.ts'), helper('Housing / 蓋'));
      const before = await run();
      const restored = await run();
      expect(restored).toEqual(before);
      expect(before.entries).toBeGreaterThan(0);
      for (const bytes of [before.preview, before.glb, restored.preview, restored.glb]) {
        // oxlint-disable-next-line no-await-in-loop -- each restored artifact is checked separately
        const summary = await readGltfNamingSummary(bytes);
        expect(summary.nodeNames).toEqual(['Housing / 蓋', 'Mesh', 'Shape 3']);
        expect(summary.meshNames).toEqual(summary.nodeNames);
      }
      expect(before.stl.map((file) => file.name)).toEqual(['Housing _ 蓋.stl', 'Mesh.stl', 'Shape 3.stl']);
      await writeFile(join(projectPath, 'lib/widget.ts'), helper('Renamed 蓋'));
      const renamed = await run();
      expect(renamed.entries).toBeGreaterThan(before.entries);
      const renamedPreview = await readGltfNamingSummary(renamed.preview);
      const renamedGlb = await readGltfNamingSummary(renamed.glb);
      expect(renamedPreview.nodeNames).toEqual(['Renamed 蓋', 'Mesh', 'Shape 3']);
      expect(renamedGlb.nodeNames).toEqual(['Renamed 蓋', 'Mesh', 'Shape 3']);
      expect(renamed.stl.map((file) => file.bytes)).toEqual(before.stl.map((file) => file.bytes));
    },
    120_000,
  );

  it('should keep the fast viewer render within the lane tolerance of the exact export (DP1)', async () => {
    const voxelSize = 0.5;
    const projectPath = await writeModel(`
      import type { Pico } from 'picovoxel';
      export const defaultParams = { voxelSize: ${voxelSize} };
      export default function main(pico: Pico) {
        const sphere = pico.createVoxels({ shape: 'sphere', radius: 10 });
        const bore = pico.createVoxels({ shape: 'beam', start: [-12, 0, 0], end: [12, 0, 0], radius: 3.5 });
        return sphere.subtract(bore).fillet({ rounding: 1 }).offset({ distance: 0.5 });
      }
    `);
    const client = await createNodeClient({ runtime: createRuntime('serial'), projectPath });
    try {
      const renderGlb = async (lane: 'fast' | 'exact'): Promise<Uint8Array<ArrayBuffer>> => {
        const outcome = await client.render({ source: { path: 'main.ts' }, renderOptions: { lane } });
        if (outcome.superseded || !outcome.geometry.success || outcome.geometry.data.format !== 'gltf') {
          throw new Error(`PicoVoxel ${lane} render failed`);
        }
        return outcome.geometry.data.content;
      };
      const fast = await measureGlb(await renderGlb('fast'));
      // The export replays the model exactly; canonical Z-up millimetres, so it measures in voxel units.
      const exported = extractGltfFromExportResult(
        await client.export('glb', { exportOptions: { coordinateSystem: 'z-up', unit: { length: 'millimeter' } } }),
      );
      const exact = await measureGlb(exported!);
      const exactView = await measureGlb(await renderGlb('exact'));

      // The exact viewer render is the exported model in the viewer's frame: one uniform scale apart.
      const scale = (exactView.maximum[0]! - exactView.minimum[0]!) / (exact.maximum[0]! - exact.minimum[0]!);
      expect(exactView.volume / (exact.volume * scale ** 3)).toBeCloseTo(1, 6);
      expect(Math.abs(fast.volume - exactView.volume) / exactView.volume).toBeLessThanOrEqual(0.022);
      for (const axis of [0, 1, 2]) {
        expect(Math.abs(fast.minimum[axis]! - exactView.minimum[axis]!)).toBeLessThanOrEqual(voxelSize * scale);
        expect(Math.abs(fast.maximum[axis]! - exactView.maximum[axis]!)).toBeLessThanOrEqual(voxelSize * scale);
      }
    } finally {
      await client.shutdown({ drain: true });
      client.terminate();
    }
  }, 300_000);

  it('should abandon a superseded heavy build at its next PicoVoxel call and keep serving (DP15)', async () => {
    const projectPath = await writeModel(`
      import type { Pico } from 'picovoxel';
      export const defaultParams = { voxelSize: 0.4, steps: 40 };
      export default function main(pico: Pico, params = defaultParams) {
        let body = pico.createVoxels({ shape: 'sphere', radius: 12 });
        for (let step = 0; step < params.steps; step++) {
          body = body.offset({ distance: step % 2 === 0 ? -0.3 : 0.3 });
        }
        return body;
      }
    `);
    // A worker thread, so the newer render can supersede while the heavy build is still running.
    const client = createRuntimeClient({
      transport: nodeWorkerTransport({
        url: new URL('fixtures/picovoxel-node-runtime.ts', import.meta.url),
        fileSystem: fromNodeFs(projectPath),
        workerCtor: TsxWorker,
      }),
    });
    try {
      const render = async (steps: number) =>
        client.render({ source: { path: 'main.ts' }, parameters: { steps }, renderOptions: { lane: 'exact' } });
      const logs: string[] = [];
      const stopLogs = client.on('log', ({ message }) => logs.push(message));

      // Warm the worker (bundle, module, runtime) so the heavy build reaches its loop quickly.
      const warm = await render(1);
      expect(!warm.superseded && warm.geometry.success).toBe(true);

      // Supersede only once the heavy build is computing: ordered by the worker's own progress
      // event, never by a wall clock (invariant I5). Nothing later is orderable: logs reach the client
      // in the render's telemetry flush, after the build, so a log-ordered supersede lands too late.
      // Large enough that no machine finishes it before the superseding render arrives; supersession
      // makes the size free.
      const heavySteps = 400;
      const computing = new Promise<void>((resolve) => {
        const stop = client.on('progress', (phase) => {
          if (phase === 'computingGeometry') {
            stop();
            resolve();
          }
        });
      });
      const heavy = render(heavySteps);
      await computing;
      const light = await render(1);

      const superseded = await heavy;
      expect(superseded.superseded).toBe(true);
      expect(!light.superseded && light.geometry.success).toBe(true);
      // Cooperative, in work units: the kernel's own check caught the heavy build before its loop
      // finished (1 sphere + 400 offsets), rather than the runtime discarding a completed build. The
      // count can be 0 when the supersede lands while the build is still bundling or opening its
      // session; the log exists only because the kernel's own check stopped it.
      const stopped = logs
        .map((message) => /^PicoVoxel stopped a superseded build after (\d+) PicoVoxel calls$/u.exec(message)?.[1])
        .filter((calls) => calls !== undefined);
      expect(stopped).toHaveLength(1);
      expect(Number(stopped[0])).toBeLessThan(1 + heavySteps);
      stopLogs();

      // Worker recovery: the next export replays cleanly on the same worker.
      const stl = await client.export('stl');
      expect(stl.success && stlHeader(stl.data[0]!.bytes)).toBe('PicoGK UNITS=mm');
    } finally {
      client.terminate();
    }
  }, 300_000);

  it('should export the pinned exact STL and GLB of sphere-minus-beams on both wasm builds (DP18)', async () => {
    // The same pins the browser leg asserts (apps/ui-e2e picovoxel-multi.spec.ts).
    type Pin = { readonly sha256: string; readonly bytes: number };
    const pins = (
      JSON.parse(await readFile(join(picovoxelExamples, 'exact-pins.json'), 'utf8')) as {
        readonly 'sphere-minus-beams': { readonly stl: Pin; readonly glb: Pin };
      }
    )['sphere-minus-beams'];
    const digest = (bytes: Uint8Array<ArrayBuffer>): Pin => ({
      sha256: createHash('sha256').update(bytes).digest('hex'),
      bytes: bytes.byteLength,
    });
    const exportExact = async (wasm: PicovoxelOptionsInput['wasm']) => {
      const client = await createNodeClient({
        runtime: createRuntime(wasm),
        projectPath: join(picovoxelExamples, 'sphere-minus-beams'),
      });
      try {
        const exported: Record<'stl' | 'glb', Pin | undefined> = { stl: undefined, glb: undefined };
        for (const format of ['stl', 'glb'] as const) {
          // oxlint-disable-next-line no-await-in-loop -- one client, one export at a time
          const result = await client.export(format, { source: { path: 'main.ts' } });
          if (!result.success) {
            throw new Error(result.issues.map(({ message }) => message).join('; '));
          }
          exported[format] = digest(result.data[0]!.bytes);
        }
        return exported;
      } finally {
        client.terminate();
      }
    };

    expect(await exportExact('serial')).toEqual(pins);
    expect(await exportExact('auto')).toEqual(pins);
  }, 300_000);

  it('should render a multi-file ShapeKernel model and export exact GLB and STL through the Node client', async () => {
    const client = await createNodeClient({ runtime: createRuntime(), projectPath: await writeProject() });
    try {
      const rendered = await client.render({ source: { path: 'main.ts' }, content: { includeEdges: true } });
      if (rendered.superseded || !rendered.geometry.success) {
        throw new Error(`PicoVoxel render failed: ${JSON.stringify(rendered)}`);
      }

      const glb = extractGltfFromExportResult(await client.export('glb'));
      expect(glb).toBeDefined();
      validateGlbData(glb!);

      const stl = await client.export('stl');
      if (!stl.success) {
        throw new Error(stl.issues.map(({ message }) => message).join('; '));
      }
      expect(stl.data.map(({ name }) => name)).toEqual(['Shape 1.stl']);
      // The default export lane is exact: no LANE=fast stamp.
      expect(stlHeader(stl.data[0]!.bytes)).toBe('PicoGK UNITS=mm');

      const fast = await client.export('stl', { exportOptions: { lane: 'fast' } });
      expect(fast.success && stlHeader(fast.data[0]!.bytes)).toBe('PicoGK UNITS=mm LANE=fast');
    } finally {
      await client.shutdown({ drain: true });
      client.terminate();
    }
  }, 180_000);

  it('should render the catalog starter as an empty scene and refuse an empty STL export', async () => {
    const starter = kernelConfigurations.find(({ id }) => id === 'picovoxel')!;
    const directory = await mkdtemp(join(tmpdir(), 'tau-picovoxel-starter-'));
    temporaryDirectories.push(directory);
    await writeFile(join(directory, starter.mainFile), starter.emptyCode);
    const client = await createNodeClient({ runtime: createRuntime(), projectPath: directory });
    try {
      const rendered = await client.render({ source: { path: starter.mainFile } });
      expect(rendered.superseded || rendered.geometry.success).toBe(true);

      const stl = await client.export('stl');
      expect(stl.success).toBe(false);
      expect(stl.success ? [] : stl.issues.map(({ message }) => message)).toEqual([
        expect.stringContaining('no shapes to export'),
      ]);
    } finally {
      client.terminate();
    }
  }, 180_000);

  it('should export the same exact bytes whatever wasm build the host selects for the fast lane', async () => {
    const projectPath = await writeProject();
    const exportExact = async (wasm: PicovoxelOptionsInput['wasm']): Promise<Uint8Array<ArrayBuffer>> => {
      const client = await createNodeClient({ runtime: createRuntime(wasm), projectPath });
      try {
        // Request-scoped, as GeoSpec exports: one private exact build.
        const result = await client.export('glb', { source: { path: 'main.ts' } });
        if (!result.success) {
          throw new Error(result.issues.map(({ message }) => message).join('; '));
        }
        return result.data[0]!.bytes;
      } finally {
        client.terminate();
      }
    };

    // Node reports cross-origin isolated, so 'auto' selects multi for the fast lane here.
    const [auto, serial] = [await exportExact('auto'), await exportExact('serial')];
    expect(auto).toEqual(serial);
  }, 180_000);
});
