/* eslint-disable @typescript-eslint/naming-convention -- glTF extension keys use standardized names. */
import { afterEach, describe, expect, it } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { replicadKernel } from '@taucad/replicad';
import type { Material } from '@taucad/replicad/model';
import { esbuildBundler } from '@taucad/esbuild';
import { defineRuntime } from '@taucad/runtime/worker';
import {
  assertSuccess,
  createTestRuntimeClient,
  extractGltfFromResult,
  createMockKernelRuntime,
} from '@taucad/runtime-testing';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { mock } from 'vitest-mock-extended';
import { normalizeRenderShapes, render } from '#utils/render-output.js';
import { convertReplicadGeometriesToGltf } from '#utils/replicad-to-gltf.js';
import type { GeometryReplicad } from '#replicad.types.js';

const copper: Material = {
  name: 'Brushed copper',
  pbrMetallicRoughness: { baseColorFactor: [0.955, 0.638, 0.538, 1], metallicFactor: 1, roughnessFactor: 0.23 },
  extensions: {
    KHR_materials_anisotropy: { anisotropyStrength: 0.85, anisotropyRotation: 0.3 },
    KHR_materials_clearcoat: { clearcoatFactor: 0.3, clearcoatRoughnessFactor: 0.12 },
  },
};
const glass: Material = {
  name: 'Tinted glass',
  pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.08 },
  extensions: {
    KHR_materials_transmission: { transmissionFactor: 1 },
    KHR_materials_ior: { ior: 1.52 },
    KHR_materials_volume: { thicknessFactor: 0.003, attenuationColor: [0.8, 0.93, 1], attenuationDistance: 0.2 },
    KHR_materials_dispersion: { dispersion: 0.1 },
    KHR_materials_specular: { specularFactor: 0.9, specularColorFactor: [1, 0.9, 0.9] },
    KHR_materials_iridescence: {
      iridescenceFactor: 0.2,
      iridescenceIor: 1.3,
      iridescenceThicknessMinimum: 120,
      iridescenceThicknessMaximum: 360,
    },
  },
};
const source = `
  import { makeCylinder } from 'replicad';
  import type { Model } from '@taucad/replicad/model';
  export const defaultParams = { anisotropy: 0.85 };
  export default function main(p = defaultParams): Model {
    const cylinder = makeCylinder(12, 20).rotate(35, [0,0,0], [1,1,0]).translate([4,5,6]);
    const copper = ${JSON.stringify(copper)};
    copper.extensions.KHR_materials_anisotropy.anisotropyStrength = p.anisotropy;
    return { shapes: [
      { name: 'Copper', shape: cylinder, material: copper },
      { name: 'Glass', shape: cylinder.clone().translateX(30), material: ${JSON.stringify(glass)} },
    ] };
  }
`;
const runtime = (tessellationInstancing: boolean) =>
  defineRuntime({
    kernels: [replicadKernel({ wasm: 'single', tessellationInstancing })],
    bundlers: [esbuildBundler()],
  });
const clients = new Set<ReturnType<typeof createTestRuntimeClient>>();
afterEach(async () => {
  await Promise.all([...clients].map(async (client) => client.shutdown()));
  clients.clear();
});

describe('standard physical materials through Replicad and the runtime', () => {
  it.each([false, true])(
    'should preserve per-occurrence materials, seam UVs, edits and exports (instancing=%s)',
    async (tessellationInstancing) => {
      const client = createTestRuntimeClient({
        runtime: runtime(tessellationInstancing),
        files: { 'main.ts': source },
      });
      clients.add(client);
      const rendered = await client.render({
        source: { path: 'main.ts' },
        content: { includeEdges: true, includeTopology: true },
      });
      expect(rendered.superseded).toBe(false);
      if (rendered.superseded) {
        throw new Error('Unexpected superseded render');
      }
      assertSuccess(rendered.geometry);
      const bytes = extractGltfFromResult(rendered.geometry)!;
      const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
      const { json } = await io.binaryToJSON(bytes);
      expect(json.materials).toEqual(expect.arrayContaining([copper, glass]));
      expect(json.meshes?.every((mesh) => mesh.primitives.some((primitive) => primitive.mode === 1))).toBe(true);
      const document = await io.readBinary(bytes);
      const primitive = document.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
      const uv = primitive.getAttribute('TEXCOORD_0')!;
      const position = primitive.getAttribute('POSITION')!;
      const tangent = primitive.getAttribute('TANGENT')!;
      expect(tangent.getCount()).toBe(position.getCount());
      const normal = primitive.getAttribute('NORMAL')!;
      const tangentValue = [0, 0, 0, 0];
      const normalValue = [0, 0, 0];
      for (let i = 0; i < tangent.getCount(); i++) {
        tangent.getElement(i, tangentValue);
        normal.getElement(i, normalValue);
        expect(Math.hypot(...tangentValue.slice(0, 3))).toBeCloseTo(1, 5);
        expect(
          tangentValue[0]! * normalValue[0]! + tangentValue[1]! * normalValue[1]! + tangentValue[2]! * normalValue[2]!,
        ).toBeCloseTo(0, 5);
        expect(Math.abs(tangentValue[3]!)).toBe(1);
      }
      expect(uv.getCount()).toBe(position.getCount());
      expect([...uv.getArray()!].every((value) => Number.isFinite(value))).toBe(true);
      // A cylindrical seam has coincident positions and separate U=0 / U=1 vertices.
      const seam = new Map<string, number[]>();
      const p = [0, 0, 0];
      const t = [0, 0];
      for (let i = 0; i < uv.getCount(); i++) {
        position.getElement(i, p);
        uv.getElement(i, t);
        const key = p.map((value) => value.toFixed(6)).join(',');
        seam.set(key, [...(seam.get(key) ?? []), t[0]!]);
      }
      expect([...seam.values()].some((values) => Math.max(...values) - Math.min(...values) > 0.99)).toBe(true);

      const exported = await client.export('glb');
      assertSuccess(exported);
      const exportedJson = await io.binaryToJSON(exported.data[0]!.bytes);
      expect(exportedJson.json.materials).toEqual(expect.arrayContaining([copper, glass]));
      const edited = await client.updateParameters({ anisotropy: 0.25 });
      expect(edited.superseded).toBe(false);
      if (edited.superseded) {
        throw new Error('Unexpected superseded edit');
      }
      assertSuccess(edited.geometry);
      const { json: editedJson } = await io.binaryToJSON(extractGltfFromResult(edited.geometry)!);
      const editedCopper = editedJson.materials?.find((material) => material.name === copper.name);
      expect(editedCopper?.extensions?.['KHR_materials_anisotropy']).toEqual({
        anisotropyStrength: 0.25,
        anisotropyRotation: 0.3,
      });
    },
    60_000,
  );

  it('should diagnose mixed legacy and standard material settings', async () => {
    const client = createTestRuntimeClient({
      runtime: runtime(false),
      files: {
        'main.ts': `import { makeBox } from 'replicad'; export default () => ({ shape: makeBox([0,0,0],[1,1,1]), color: '#fff', material: {} });`,
      },
    });
    clients.add(client);
    const result = await client.render({ source: { path: 'main.ts' } });
    expect(result.superseded).toBe(false);
    if (result.superseded) {
      throw new Error('Unexpected superseded render');
    }
    expect(result.geometry.success).toBe(false);
    expect(JSON.stringify(result.geometry.issues)).toContain('Use material or legacy');
  }, 60_000);

  it('should retain embedded textures and physical materials across native-handle serialization', async () => {
    const client = createTestRuntimeClient({ runtime: runtime(false), files: { 'main.ts': source } });
    clients.add(client);
    const boot = await client.render({ source: { path: 'main.ts' } });
    if (boot.superseded) {
      throw new Error('Unexpected superseded render');
    }
    assertSuccess(boot.geometry);
    const library = await import('replicad');
    const definition = await resolveRuntimePluginDefinition('kernel', replicadKernel());
    const serialize = definition.serializeNativeHandle!;
    const deserialize = definition.deserializeNativeHandle!;
    const context = mock<Parameters<typeof deserialize>[2]>();
    context.replicadLibrary = library;
    const image = Uint8Array.from(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1EAAAAASUVORK5CYII=',
        'base64',
      ),
    );
    const material: Material = {
      ...copper,
      pbrMetallicRoughness: { ...copper.pbrMetallicRoughness, baseColorTexture: { index: 0 } },
    };
    const nativeHandle: Parameters<typeof serialize>[0]['nativeHandle'] = {
      shapes: normalizeRenderShapes({ shape: library.makeCylinder(10, 20), material, name: 'Textured copper' }),
      images: [{ data: image, mimeType: 'image/png' }],
      textures: [{ source: 0 }],
    };
    const serialized = serialize({ nativeHandle }, createMockKernelRuntime(), context);
    const restored = deserialize(
      { serializedNativeHandle: structuredClone(serialized) },
      createMockKernelRuntime(),
      context,
    );
    expect(restored.images?.[0]?.data).toEqual(image);
    expect(restored.shapes[0]?.material).toEqual(material);
    const geometries = render(normalizeRenderShapes(restored.shapes)).filter(
      (entry): entry is GeometryReplicad => entry.format === 'replicad',
    );
    const { json } = await new NodeIO().binaryToJSON(convertReplicadGeometriesToGltf({ ...restored, geometries }));
    expect(json.materials).toContainEqual(material);
    expect(json.images).toHaveLength(1);
    expect(json.textures).toEqual([{ source: 0 }]);
    expect(json.meshes![0]!.primitives[0]!.attributes['TEXCOORD_0']).toBeTypeOf('number');
    for (const entry of [...nativeHandle.shapes, ...restored.shapes]) {
      entry.shape.delete();
    }
  }, 60_000);
});
