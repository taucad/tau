import { describe, expect, it } from 'vitest';
import { replicadKernel } from '@taucad/replicad';
import { esbuildBundler } from '@taucad/esbuild';
import { defineRuntime } from '@taucad/runtime/worker';
import { loadFixture } from '@taucad/tau-examples/fixtures';
import {
  assertSuccess,
  createTestRuntimeClient,
  extractGltfFromResult,
  glbToDocument,
  getSignedVolumeFromGlb,
} from '@taucad/runtime-testing';

const runtime = defineRuntime({ kernels: [replicadKernel({ wasm: 'single' })], bundlers: [esbuildBundler()] });

describe('physical material BRep examples through the public runtime', () => {
  it('should render and export the copper lampshade with physical materials and exact BRep edges', async () => {
    const fixture = loadFixture('replicad', 'copper-lampshade');
    const client = createTestRuntimeClient({ runtime, files: fixture.files });
    try {
      const result = await client.render({ source: { path: fixture.mainFile }, content: { includeEdges: true } });
      expect(result.superseded).toBe(false);
      if (result.superseded) {
        throw new Error('Unexpected superseded render');
      }
      assertSuccess(result.geometry);
      const bytes = extractGltfFromResult(result.geometry)!;
      const document = await glbToDocument(bytes);
      expect(document.getRoot().listMeshes()).toHaveLength(8);
      expect(
        document
          .getRoot()
          .listMeshes()
          .every((mesh) => mesh.listPrimitives().some((primitive) => primitive.getMode() === 1)),
      ).toBe(true);
      const materials = document.getRoot().listMaterials();
      expect(
        materials.find((material) => material.getName() === 'Brushed copper')?.getExtension('KHR_materials_anisotropy'),
      ).toBeTruthy();
      expect(
        materials
          .find((material) => material.getName() === 'Clear warm glass')
          ?.getExtension('KHR_materials_transmission'),
      ).toBeTruthy();
      expect(
        materials.find((material) => material.getName() === 'Charcoal fabric')?.getExtension('KHR_materials_sheen'),
      ).toBeTruthy();
      expect(
        materials
          .find((material) => material.getName() === 'Warm LED')
          ?.getExtension('KHR_materials_emissive_strength'),
      ).toBeTruthy();
      expect(await getSignedVolumeFromGlb(bytes)).toBeGreaterThan(0);
      const step = await client.export('step');
      assertSuccess(step);
      expect(new TextDecoder().decode(step.data[0]!.bytes)).toContain('MANIFOLD_SOLID_BREP');
      const json = await client.export('gltf');
      assertSuccess(json);
      expect(new TextDecoder().decode(json.data[0]!.bytes)).toContain('KHR_materials_anisotropy');
    } finally {
      await client.shutdown();
    }
  }, 60_000);
});
