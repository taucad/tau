// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest';
import { esbuildBundler } from '@taucad/esbuild';
import { defineRuntime } from '@taucad/runtime/worker';
import {
  createGeometryTestHelpers,
  createTestGeometry,
  createTestRuntimeClient,
  extractGltfFromExportResult,
  getTestParameters,
  validateGlbData,
} from '@taucad/runtime-testing';
import { picovoxelKernel } from '#picovoxel.kernel.js';

const runtime = defineRuntime({ kernels: [picovoxelKernel()], bundlers: [esbuildBundler()] });
const multiRuntime = defineRuntime({
  kernels: [picovoxelKernel({ wasm: 'multi' })],
  bundlers: [esbuildBundler()],
});
const clients = new Set<ReturnType<typeof createTestRuntimeClient>>();
const geometry = createGeometryTestHelpers();

const cubeSource = `
  import type { Pico } from 'picovoxel';

  export const defaultParams = { size: 2, voxelSize: 1 };

  export default function main(pico: Pico, params = defaultParams) {
    const h = params.size / 2;
    return pico.createMesh({
      vertices: [
        -h, -h, -h, h, -h, -h, h, h, -h, -h, h, -h,
        -h, -h, h, h, -h, h, h, h, h, -h, h, h,
      ],
      triangles: [
        0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7,
        0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5,
        2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7,
      ],
    });
  }
`;

const createClient = (
  files: Record<string, string>,
  selectedRuntime: typeof runtime = runtime,
) => {
  const client = createTestRuntimeClient({ runtime: selectedRuntime, files });
  clients.add(client);
  return client;
};

afterEach(async () => {
  await Promise.all([...clients].map(async (client) => client.shutdown()));
  clients.clear();
});

describe('PicovoxelKernel', () => {
  it('extracts parameters and renders packaged Picovoxel geometry', async () => {
    const parameters = await getTestParameters({ runtime, files: { 'main.ts': cubeSource }, mainFile: 'main.ts' });
    expect(parameters.defaultParameters).toEqual({ size: 2, voxelSize: 1 });

    const result = await createTestGeometry({
      runtime,
      files: { 'main.ts': cubeSource },
      mainFile: 'main.ts',
      parameters: { size: 4, voxelSize: 1 },
    });
    await geometry.expectValidGltf(result);
    await geometry.expectFaceCount(result, 12);
    await geometry.expectBoundingBoxSize(result, [0.004, 0.004, 0.004]);
  });

  it('renders and exports the focused pthread conformance model', async () => {
    const client = createClient({ 'main.ts': cubeSource }, multiRuntime);
    const outcome = await client.render({
      source: { path: 'main.ts' },
      parameters: { size: 2, voxelSize: 1 },
    });
    expect(outcome.superseded).toBe(false);
    if (outcome.superseded) {
      return;
    }
    await geometry.expectValidGltf(outcome.geometry);
    await geometry.expectFaceCount(outcome.geometry, 12);

    const exportResult = await client.export('glb', { source: { path: 'main.ts' } });
    const glb = extractGltfFromExportResult(exportResult);
    expect(glb).toBeDefined();
    validateGlbData(glb!);
  });

  it('exports valid GLB and STL through the public runtime client', async () => {
    const client = createClient({ 'main.ts': cubeSource });
    const glbResult = await client.export('glb', { source: { path: 'main.ts' } });
    const glb = extractGltfFromExportResult(glbResult);
    expect(glb).toBeDefined();
    validateGlbData(glb!);

    const stlResult = await client.export('stl', { source: { path: 'main.ts' } });
    expect(stlResult.success).toBe(true);
    if (stlResult.success) {
      expect(stlResult.data).toHaveLength(1);
      expect(stlResult.data[0]).toMatchObject({ name: 'Shape 1.stl', mimeType: 'model/stl' });
      expect(stlResult.data[0]!.bytes.byteLength).toBeGreaterThan(84);
    }
  });
});
