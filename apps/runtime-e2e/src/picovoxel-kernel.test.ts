// @vitest-environment node

import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { esbuild } from '@taucad/esbuild';
import { picovoxel } from '@taucad/picovoxel';
import type { PicovoxelOptionsInput } from '@taucad/picovoxel';
import { Worker as NodeWorker } from 'node:worker_threads';
import { asKnownArtifact, createRuntimeClient } from '@taucad/runtime';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { fromNodeFs } from '@taucad/runtime/filesystem/node';
import { createNodeClient } from '@taucad/runtime/node';
import { nodeWorkerTransport } from '@taucad/runtime/transport/node';
import { defineRuntime } from '@taucad/runtime/worker';
import { extractGltfFromExportResult, glbToDocument, validateGlbData } from '@taucad/runtime-testing';
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
      const document = client.open({ source: { path: 'main.ts' }, evaluateOptions: { lane: 'fast' } });
      const renderGlb = async (lane: 'fast' | 'exact'): Promise<Uint8Array<ArrayBuffer>> => {
        if (lane === 'exact') {
          await document.update({ evaluateOptions: { lane } });
        }
        const outcome = await document.view('model').rendering();
        if (outcome.superseded || !outcome.rendering.success) {
          throw new Error(`PicoVoxel ${lane} render failed`);
        }
        const artifact = asKnownArtifact(outcome.rendering.artifact);
        if (artifact?.mimeType !== 'model/gltf-binary') {
          throw new Error(`PicoVoxel ${lane} did not render GLB`);
        }
        return artifact.content;
      };
      const fast = await measureGlb(await renderGlb('fast'));
      // The export replays the model exactly; canonical Z-up millimetres, so it measures in voxel units.
      const exported = extractGltfFromExportResult(
        await document.export('glb', { options: { coordinateSystem: 'z-up', unit: { length: 'millimeter' } } }),
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
      await client.shutdown();
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
      const document = client.open({
        source: { path: 'main.ts' },
        parameters: { steps: 1 },
        evaluateOptions: { lane: 'exact' },
      });
      const logs: string[] = [];
      const stopLogs = client.on('log', ({ message }) => logs.push(message));

      // Warm the worker (bundle, module, runtime) so the heavy build reaches its loop quickly.
      const warm = await document.evaluation();
      expect(!warm.superseded && warm.evaluation.success).toBe(true);

      // Supersede only once the heavy native evaluation begins, ordered by the worker's own
      // progress event rather than a wall clock (invariant I5). Logs can arrive after the build,
      // so a log-ordered supersede lands too late.
      // Large enough that no machine finishes it before the superseding render arrives; supersession
      // makes the size free.
      const heavySteps = 400;
      const computing = new Promise<void>((resolve) => {
        const stop = document.on('progress', ({ phase }) => {
          if (phase === 'evaluate') {
            stop();
            resolve();
          }
        });
      });
      const heavy = document.update({ parameters: { steps: heavySteps } });
      await computing;
      const light = await document.update({ parameters: { steps: 1 } });

      const superseded = await heavy;
      expect(superseded.superseded).toBe(true);
      expect(!light.superseded && light.evaluation.success).toBe(true);
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
      const stl = await document.export('stl');
      expect(stl.success && stlHeader(stl.files[0].bytes)).toBe('PicoGK UNITS=mm');
    } finally {
      client.terminate();
    }
  }, 300_000);

  it('should stop synchronous native render and write hooks through the packaged Node worker', async () => {
    const client = createRuntimeClient({
      transport: nodeWorkerTransport({
        url: new URL('fixtures/picovoxel-node-runtime.ts', import.meta.url),
        fileSystem: fromMemoryFs({ 'native.hook': 'fixture' }),
        workerCtor: TsxWorker,
      }),
    });
    const logs: string[] = [];
    const stopLogs = client.on('log', ({ message }) => {
      logs.push(message);
    });
    try {
      const document = client.open({ source: { path: 'native.hook' }, parameters: { spin: true } });
      const first = await document.evaluation();
      expect(first.superseded).toBe(false);
      if (first.superseded) {
        throw new Error('Native render fixture evaluation was superseded.');
      }
      expect(first.evaluation.success).toBe(true);

      const renderStarted = Promise.withResolvers<void>();
      const stopRenderProgress = document.on('progress', ({ phase }) => {
        if (phase === 'render') {
          stopRenderProgress();
          renderStarted.resolve();
        }
      });
      const slowView = document.view('model');
      const slowRender = slowView.rendering();
      await renderStarted.promise;
      const lightEvaluation = await document.update({ parameters: { spin: false } });
      expect(lightEvaluation.superseded).toBe(false);
      const stoppedRender = await slowRender;
      expect(stoppedRender.superseded).toBe(true);
      const recoveredRender = await document.view('model').rendering();
      expect(recoveredRender.superseded).toBe(false);
      if (recoveredRender.superseded) {
        throw new Error('Recovery render was superseded.');
      }
      expect(recoveredRender.rendering.success).toBe(true);

      const heavyEvaluation = await document.update({ parameters: { spin: true } });
      expect(heavyEvaluation.superseded).toBe(false);
      const writeStarted = Promise.withResolvers<void>();
      const stopWriteProgress = document.on('progress', ({ phase }) => {
        if (phase === 'write') {
          stopWriteProgress();
          writeStarted.resolve();
        }
      });
      const controller = new AbortController();
      const slowExport = document.export('text', { signal: controller.signal });
      await writeStarted.promise;
      controller.abort();
      await expect(slowExport).rejects.toMatchObject({ name: 'OperationAbortedError' });
      const finalEvaluation = await document.update({ parameters: { spin: false } });
      expect(finalEvaluation.superseded).toBe(false);
      const recoveredExport = await document.export('text');
      expect(recoveredExport.success).toBe(true);
      if (recoveredExport.success) {
        expect(new TextDecoder().decode(recoveredExport.files[0].bytes)).toBe('recovered');
      }
      expect(logs.some((message) => message.startsWith('Native render stopped after '))).toBe(true);
      expect(logs.some((message) => message.startsWith('Native write stopped after '))).toBe(true);
    } finally {
      stopLogs();
      client.terminate();
    }
  }, 60_000);

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
        const document = client.open({ source: { path: 'main.ts' } });
        for (const format of ['stl', 'glb'] as const) {
          // oxlint-disable-next-line no-await-in-loop -- one client, one export at a time
          const result = await document.export(format);
          if (!result.success) {
            throw new Error(result.issues.map(({ message }) => message).join('; '));
          }
          exported[format] = digest(result.files[0].bytes);
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
      const document = client.open({ source: { path: 'main.ts' } });
      const rendered = await document.view('model', { content: { includeEdges: true } }).rendering();
      if (rendered.superseded || !rendered.rendering.success) {
        throw new Error(`PicoVoxel render failed: ${JSON.stringify(rendered)}`);
      }

      const glb = extractGltfFromExportResult(await document.export('glb'));
      expect(glb).toBeDefined();
      validateGlbData(glb!);

      const stl = await document.export('stl');
      if (!stl.success) {
        throw new Error(stl.issues.map(({ message }) => message).join('; '));
      }
      expect(stl.files.map(({ name }) => name)).toEqual(['Shape 1.stl']);
      // The default export lane is exact: no LANE=fast stamp.
      expect(stlHeader(stl.files[0].bytes)).toBe('PicoGK UNITS=mm');

      const fast = await document.export('stl', { options: { lane: 'fast' } });
      expect(fast.success && stlHeader(fast.files[0].bytes)).toBe('PicoGK UNITS=mm LANE=fast');
    } finally {
      await client.shutdown();
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
      const document = client.open({ source: { path: starter.mainFile } });
      const rendered = await document.view('model').rendering();
      expect(rendered.superseded || rendered.rendering.success).toBe(true);

      const stl = await document.export('stl');
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
        const result = await client.open({ source: { path: 'main.ts' } }).export('glb');
        if (!result.success) {
          throw new Error(result.issues.map(({ message }) => message).join('; '));
        }
        return result.files[0].bytes;
      } finally {
        client.terminate();
      }
    };

    // Node reports cross-origin isolated, so 'auto' selects multi for the fast lane here.
    const [auto, serial] = [await exportExact('auto'), await exportExact('serial')];
    expect(auto).toEqual(serial);
  }, 180_000);
});
