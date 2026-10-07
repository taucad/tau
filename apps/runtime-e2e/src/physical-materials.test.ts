import { describe, expect, it } from 'vitest';
import { replicadKernel } from '@taucad/replicad';
import { esbuildBundler } from '@taucad/esbuild';
import { defineRuntime } from '@taucad/runtime/worker';
import { loadFixture } from '@taucad/tau-examples/fixtures';
import {
  assertRenderingSuccess,
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
    const document = client.open({ source: { path: fixture.mainFile }, watch: false });
    const view = document.view('model', { content: { includeEdges: true } });
    try {
      const result = await view.rendering();
      expect(result.superseded).toBe(false);
      if (result.superseded) {
        throw new Error('Unexpected superseded render');
      }
      assertRenderingSuccess(result.rendering);
      const bytes = extractGltfFromResult(result.rendering);
      if (!bytes) {
        throw new TypeError('Replicad model did not render GLB bytes.');
      }
      const gltfDocument = await glbToDocument(bytes);
      expect(gltfDocument.getRoot().listMeshes()).toHaveLength(8);
      expect(
        gltfDocument
          .getRoot()
          .listMeshes()
          .every((mesh) => mesh.listPrimitives().some((primitive) => primitive.getMode() === 1)),
      ).toBe(true);
      const materials = gltfDocument.getRoot().listMaterials();
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
      const step = await document.export('step');
      expect(step.success, step.success ? undefined : step.issues.map(({ message }) => message).join('\n')).toBe(true);
      if (!step.success) {
        throw new Error('STEP export failed.');
      }
      expect(new TextDecoder().decode(step.files[0].bytes)).toContain('MANIFOLD_SOLID_BREP');
      const json = await document.export('gltf');
      expect(json.success, json.success ? undefined : json.issues.map(({ message }) => message).join('\n')).toBe(true);
      if (!json.success) {
        throw new Error('glTF export failed.');
      }
      expect(new TextDecoder().decode(json.files[0].bytes)).toContain('KHR_materials_anisotropy');
    } finally {
      view.close();
      document.close();
      await client.shutdown();
    }
  });
});
