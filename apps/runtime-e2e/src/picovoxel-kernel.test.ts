// @vitest-environment node

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { esbuild } from '@taucad/esbuild';
import { picovoxel } from '@taucad/picovoxel';
import type { PicovoxelOptionsInput } from '@taucad/picovoxel';
import { createNodeClient } from '@taucad/runtime/node';
import { defineRuntime } from '@taucad/runtime/worker';
import { extractGltfFromExportResult, validateGlbData } from '@taucad/runtime-testing';
import { kernelConfigurations } from '@taucad/types/constants';

const createRuntime = (wasm?: PicovoxelOptionsInput['wasm']) =>
  defineRuntime({ plugins: [picovoxel(wasm ? { kernels: { default: { wasm } } } : undefined), esbuild()] });

const temporaryDirectories: string[] = [];

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

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => rm(directory, { recursive: true })));
});

describe('PicoVoxel packaged runtime', () => {
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
