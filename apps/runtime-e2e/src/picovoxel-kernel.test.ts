// @vitest-environment node

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { esbuild } from '@taucad/esbuild';
import { picovoxel } from '@taucad/picovoxel';
import { createNodeClient } from '@taucad/runtime/node';
import { defineRuntime } from '@taucad/runtime/worker';
import { extractGltfFromExportResult, validateGlbData } from '@taucad/runtime-testing';

const runtime = defineRuntime({ plugins: [picovoxel(), esbuild()] });
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => rm(directory, { recursive: true })));
});

describe('Picovoxel packaged runtime', () => {
  it('renders and exports a multi-file ShapeKernel model through the Node worker client', async () => {
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
          return makeSphere(pico, params.radius);
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

    const client = await createNodeClient(directory, { runtime });
    try {
      const rendered = await client.render({ source: { path: 'main.ts' }, content: { includeEdges: true } });
      expect(rendered.superseded).toBe(false);
      if (rendered.superseded) {
        throw new Error('Picovoxel render was superseded');
      }
      if (!rendered.geometry.success) {
        throw new Error(JSON.stringify(rendered.geometry.issues, undefined, 2));
      }

      const exported = await client.export('glb');
      const glb = extractGltfFromExportResult(exported);
      expect(glb).toBeDefined();
      validateGlbData(glb!);

      const stl = await client.export('stl');
      expect(stl.success).toBe(true);
      if (stl.success) {
        expect(stl.data).toHaveLength(1);
        expect(stl.data[0]?.name).toBe('Shape 1.stl');
      }
    } finally {
      await client.shutdown({ drain: true });
      client.terminate();
    }
  }, 60_000);
});
