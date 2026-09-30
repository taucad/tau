/* eslint-disable @typescript-eslint/naming-convention -- Assert standardized glTF wire keys verbatim. */
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Pico } from 'picovoxel';
import { esbuild } from '@taucad/esbuild';
import { createNodeIo } from '@taucad/geometry-core';
import { geometryCache } from '@taucad/middleware';
import { createRuntimeClient } from '@taucad/runtime/client';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { createSqliteComputeEngine, fromSqlite } from '@taucad/runtime/node';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { defineRuntime } from '@taucad/runtime/worker';
import {
  assertSuccess,
  createMockKernelRuntime,
  createTestRuntimeClient,
  extractGltfFromResult,
} from '@taucad/runtime-testing';
import { picovoxel, picovoxelKernel } from '@taucad/picovoxel';
import type { Material } from '@taucad/picovoxel';

const workspaceRoot = resolve(import.meta.dirname, '../../../..');
const png = new Uint8Array(
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=', 'base64'),
);
const changedPng = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAU0lEQVR4nO3SIQEAIAwF0UUhClGIQCRi0WZYwMOZE1Nf7ImLUnvuN0c77vUeAnDA74f3LoAH4BEKwAF4hAJwAB6hAByARygAB+ARCsABeIQCaMACMopMiEeoqxsAAAAASUVORK5CYII=',
    'base64',
  ),
);
const jpeg = new Uint8Array(readFileSync(resolve(workspaceRoot, 'apps/ui/public/textures/matcap-sculpt.jpg')));
const webp = new Uint8Array(readFileSync(resolve(workspaceRoot, 'infra/seed/default-thumb.webp')));
const texture = (slot: number) => ({
  index: slot % 3,
  texCoord: 0,
  extensions: {
    KHR_texture_transform: {
      offset: [slot / 20, slot === 0 ? 0 : -slot / 30],
      scale: [1 + slot / 10, 2 + slot / 20],
      rotation: slot / 15,
      texCoord: 0,
    },
  },
});
const material: Material = {
  name: 'All physical fields',
  pbrMetallicRoughness: {
    baseColorFactor: [0.7, 0.3, 0.1, 0.8],
    metallicFactor: 0.8,
    roughnessFactor: 0.25,
    baseColorTexture: texture(0),
    metallicRoughnessTexture: texture(1),
  },
  normalTexture: { ...texture(2), scale: 0.45 },
  occlusionTexture: { ...texture(3), strength: 0.4 },
  emissiveTexture: texture(4),
  emissiveFactor: [0.1, 0.2, 0.3],
  alphaMode: 'MASK',
  alphaCutoff: 0.35,
  doubleSided: false,
  extensions: {
    KHR_materials_anisotropy: { anisotropyStrength: 0.8, anisotropyRotation: 0.3, anisotropyTexture: texture(5) },
    KHR_materials_clearcoat: {
      clearcoatFactor: 0.6,
      clearcoatRoughnessFactor: 0.2,
      clearcoatTexture: texture(6),
      clearcoatRoughnessTexture: texture(7),
      clearcoatNormalTexture: { ...texture(8), scale: 0.6 },
    },
    KHR_materials_dispersion: { dispersion: 0.2 },
    KHR_materials_emissive_strength: { emissiveStrength: 2 },
    KHR_materials_ior: { ior: 1.5 },
    KHR_materials_iridescence: {
      iridescenceFactor: 0.2,
      iridescenceIor: 1.4,
      iridescenceThicknessMinimum: 120,
      iridescenceThicknessMaximum: 360,
      iridescenceTexture: texture(9),
      iridescenceThicknessTexture: texture(10),
    },
    KHR_materials_sheen: {
      sheenColorFactor: [0.2, 0.3, 0.4],
      sheenRoughnessFactor: 0.3,
      sheenColorTexture: texture(11),
      sheenRoughnessTexture: texture(12),
    },
    KHR_materials_specular: {
      specularFactor: 0.9,
      specularColorFactor: [0.8, 0.9, 1],
      specularTexture: texture(13),
      specularColorTexture: texture(14),
    },
    KHR_materials_transmission: { transmissionFactor: 0.3, transmissionTexture: texture(15) },
    KHR_materials_volume: {
      thicknessFactor: 0.002,
      attenuationDistance: 0.25,
      attenuationColor: [0.8, 0.9, 1],
      thicknessTexture: texture(16),
    },
  },
};
const unlit: Material = {
  name: 'Unlit',
  alphaMode: 'BLEND',
  doubleSided: true,
  pbrMetallicRoughness: { baseColorFactor: [0.2, 0.4, 0.6, 0.5] },
  extensions: { KHR_materials_unlit: {} },
};
const samplers = [
  { wrapS: 33_648, wrapT: 33_071, magFilter: 9729, minFilter: 9987 },
  { wrapS: 10_497, wrapT: 33_648, magFilter: 9728, minFilter: 9984 },
];
const textures = [
  { source: 0, sampler: 0 },
  { source: 1, sampler: 1 },
  { sampler: 0, extensions: { EXT_texture_webp: { source: 2 } } },
];
const source = (appearance = true, mutation = '') => `
import image from './map.png' with { type: 'bytes' };
import jpeg from './map.jpg' with { type: 'bytes' };
import webp from './map.webp' with { type: 'bytes' };
import type { Pico } from 'picovoxel';
import type { PicovoxelModel } from '@taucad/picovoxel';
export const defaultParams = { voxelSize: 1 };
const material = ${JSON.stringify(material)};
const resources = { images: [{name:'PNG',mimeType:'image/png',data:image},{name:'JPEG',mimeType:'image/jpeg',data:jpeg},{name:'WebP',mimeType:'image/webp',data:webp}], textures: ${JSON.stringify(textures)}, samplers: ${JSON.stringify(samplers)} };
${mutation}
export default function main(pico: Pico): PicovoxelModel {
 const sphere = pico.createVoxels({ shape:'sphere', radius:3 });
 const bore = pico.createVoxels({ shape:'sphere', radius:1.5, center:[2,0,0] });
 const shape = sphere.subtract(bore).clone().offset({distance:0.3});
 return { ${appearance ? '...resources,' : ''} shapes: [
   {shape, name:'蓋 / Mesh 🧩', ${appearance ? 'material' : ''}},
   {shape:shape.toMesh(), name:'蓋 / Mesh 🧩', ${appearance ? `material:${JSON.stringify(unlit)}` : ''}},
   shape.toMesh()
 ]};
}`;
const files = (main = source(), image = png) => ({
  'main.ts': main,
  'map.png': image,
  'map.jpg': jpeg,
  'map.webp': webp,
});
const runtime = () =>
  defineRuntime({
    plugins: [picovoxel({ kernels: { default: { wasm: 'serial' } } }), esbuild()],
    middleware: [geometryCache()],
  });
const parse = async (bytes: Uint8Array<ArrayBuffer>) => {
  const io = await createNodeIo();
  const { json } = await io.binaryToJSON(bytes);
  return { json, document: await io.readBinary(bytes) };
};
const expandedAttributes = (document: Awaited<ReturnType<typeof parse>>['document']) =>
  document
    .getRoot()
    .listMeshes()
    .map((mesh) =>
      mesh.listPrimitives().map((primitive) => {
        const indices = primitive.getIndices()!.getArray()!;
        return Object.fromEntries(
          ['POSITION', 'NORMAL'].map((name) => {
            const attribute = primitive.getAttribute(name)!;
            return [name, [...indices].flatMap((index) => attribute.getElement(index, []))];
          }),
        );
      }),
    );
const render = async (
  client: ReturnType<typeof createTestRuntimeClient>,
  main = source(),
  lane: 'fast' | 'exact' = 'fast',
) => {
  const outcome = await client.render({ source: { entry: 'main.ts', files: files(main) }, renderOptions: { lane } });
  if (outcome.superseded) {
    throw new Error('Unexpected superseded PicoVoxel material render');
  }
  assertSuccess(outcome.geometry);
  return extractGltfFromResult(outcome.geometry)!;
};

const assertMaterialDelivery = async (bytes: Uint8Array<ArrayBuffer>, image = png) => {
  const { json, document } = await parse(bytes);
  expect(json.materials).toContainEqual(material);
  expect(json.materials).toContainEqual(unlit);
  expect(json.samplers).toEqual(samplers);
  expect(json.textures).toEqual(textures);
  expect(json.images?.map(({ mimeType }) => mimeType)).toEqual(['image/png', 'image/jpeg', 'image/webp']);
  expect(json.extensionsUsed).toEqual(
    expect.arrayContaining([
      ...Object.keys(material.extensions!),
      'KHR_materials_unlit',
      'KHR_texture_transform',
      'EXT_texture_webp',
    ]),
  );
  expect(
    document
      .getRoot()
      .listTextures()
      .map((entry) => new Uint8Array(entry.getImage()!)),
  ).toEqual([image, jpeg, webp]);
  expect(
    document
      .getRoot()
      .listNodes()
      .map((node) => node.getName()),
  ).toEqual(['蓋 / Mesh 🧩', '蓋 / Mesh 🧩', 'Shape 3']);
  expect(
    document
      .getRoot()
      .listMeshes()
      .map((mesh) => mesh.getName()),
  ).toEqual(['蓋 / Mesh 🧩', '蓋 / Mesh 🧩', 'Shape 3']);
  const primitives = document
    .getRoot()
    .listMeshes()
    .flatMap((mesh) => mesh.listPrimitives());
  expect(primitives.map((primitive) => primitive.getMode())).toEqual([4, 4, 4]);
  const mapped = primitives[0]!;
  expect(mapped.getAttribute('TEXCOORD_0')!.getCount()).toBe(mapped.getAttribute('POSITION')!.getCount());
  expect(mapped.getAttribute('TANGENT')!.getCount()).toBe(mapped.getAttribute('POSITION')!.getCount());
  return { json, document };
};

describe('PicoVoxel full physical materials through real WASM and runtime', () => {
  it.each(['fast', 'exact'] as const)(
    'should preserve every factor, all 17 maps, codecs and geometry in the %s lane',
    async (lane) => {
      const client = createTestRuntimeClient({ runtime: runtime() });
      try {
        const plain = await parse(await render(client, source(false), lane));
        const delivered = await assertMaterialDelivery(await render(client, source(), lane));
        expect(expandedAttributes(delivered.document)).toEqual(expandedAttributes(plain.document));
        expect(delivered.json.materials?.find((entry) => !entry.name)).toEqual(plain.json.materials?.[0]);
        const exported = await client.export('glb');
        assertSuccess(exported);
        await assertMaterialDelivery(exported.data[0]!.bytes);
        const gltf = await client.export('gltf');
        assertSuccess(gltf);
        expect(gltf.data).toHaveLength(1);
        const io = await createNodeIo();
        const json = JSON.parse(new TextDecoder().decode(gltf.data[0]!.bytes)) as Awaited<
          ReturnType<typeof io.writeJSON>
        >['json'];
        const resolved = await io.readJSON({ json, resources: {} });
        expect(
          resolved
            .getRoot()
            .listTextures()
            .map((entry) => new Uint8Array(entry.getImage()!)),
        ).toEqual([png, jpeg, webp]);
        expect(resolved.getRoot().listMeshes()).toHaveLength(3);
        const scaled = await client.export('glb', {
          exportOptions: { coordinateSystem: 'z-up', unit: { length: 'millimeter' } },
        });
        assertSuccess(scaled);
        const { json: millimeters } = await parse(scaled.data[0]!.bytes);
        const expected = structuredClone(material);
        expected.extensions!.KHR_materials_volume!.thicknessFactor = 2;
        expected.extensions!.KHR_materials_volume!.attenuationDistance = 250;
        expect(millimeters.materials).toContainEqual(expected);
        const stl = await client.export('stl');
        assertSuccess(stl);
        await render(client, source(false), 'exact');
        const plainStl = await client.export('stl');
        assertSuccess(plainStl);
        expect(stl.data.map(({ bytes }) => bytes)).toEqual(plainStl.data.map(({ bytes }) => bytes));
        for (const format of ['glb', 'gltf'] as const) {
          // oxlint-disable-next-line eslint/no-await-in-loop -- One client owns one export request at a time.
          const refused = await client.export(format, { exportOptions: { lane: 'fast' } });
          expect(refused.success).toBe(false);
          expect(refused.issues).toEqual(
            expect.arrayContaining([expect.objectContaining({ code: 'REPRESENTATION_UNSUPPORTED' })]),
          );
        }
      } finally {
        await client.shutdown();
      }
    },
    120_000,
  );

  it('should restore material snapshots from reopened SQLite and invalidate only the imported texture dependency', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tau-picovoxel-pbr-cache-'));
    const plugin = picovoxelKernel({ wasm: 'serial' });
    const definition = await resolveRuntimePluginDefinition('kernel', plugin);
    const build = vi.spyOn(definition, 'createGeometry');
    const restore = vi.spyOn(definition, 'deserializeNativeHandle');
    const cachedRuntime = defineRuntime({ kernels: [plugin], plugins: [esbuild()], middleware: [geometryCache()] });
    const reopen = async (image: Uint8Array<ArrayBuffer>, format: 'glb' | 'gltf') => {
      const store = createSqliteComputeEngine({ directory });
      const client = createRuntimeClient({
        transport: inProcessTransport({
          runtime: cachedRuntime,
          fileSystem: fromMemoryFs(),
          compute: { mode: 'durable', store: fromSqlite({ store, workspace: 'picovoxel-pbr-cache' }) },
        }),
      });
      try {
        const result = await client.render({
          source: { entry: 'main.ts', files: files(source(), image) },
          renderOptions: { lane: 'exact' },
        });
        if (result.superseded) {
          throw new Error('Unexpected superseded durable render');
        }
        assertSuccess(result.geometry);
        const exported = await client.export(format);
        assertSuccess(exported);
        if (format === 'glb') {
          return exported.data[0]!.bytes;
        }
        expect(exported.data).toHaveLength(1);
        const io = await createNodeIo();
        const json = JSON.parse(new TextDecoder().decode(exported.data[0]!.bytes)) as Awaited<
          ReturnType<typeof io.writeJSON>
        >['json'];
        return await io.writeBinary(await io.readJSON({ json, resources: {} }));
      } finally {
        await client.shutdown();
        await store.dispose();
      }
    };
    try {
      const first = await assertMaterialDelivery(await reopen(png, 'glb'));
      expect(build).toHaveBeenCalledTimes(1);
      const second = await parse(await reopen(png, 'gltf'));
      expect(build).toHaveBeenCalledTimes(1);
      expect(restore).toHaveBeenCalledTimes(1);
      const io = await createNodeIo();
      const normalized = await io.writeJSON(first.document);
      expect(second.json.materials).toEqual(normalized.json.materials);
      expect(
        second.document
          .getRoot()
          .listTextures()
          .map((entry) => new Uint8Array(entry.getImage()!)),
      ).toEqual([png, jpeg, webp]);
      for (const name of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'TANGENT']) {
        expect(second.document.getRoot().listMeshes()[0]!.listPrimitives()[0]!.getAttribute(name)!.getArray()).toEqual(
          first.document.getRoot().listMeshes()[0]!.listPrimitives()[0]!.getAttribute(name)!.getArray(),
        );
      }
      await assertMaterialDelivery(await reopen(changedPng, 'glb'), changedPng);
      expect(build).toHaveBeenCalledTimes(2);
    } finally {
      build.mockRestore();
      restore.mockRestore();
      await rm(directory, { recursive: true, force: true });
    }
  }, 120_000);

  it('should own nested author materials, sampler fields and an offset image view after capture and serialization', async () => {
    const authored = structuredClone(material);
    const storage = new Uint8Array(png.length + 8);
    storage.set(png, 4);
    const image = storage.subarray(4, 4 + png.length);
    const resources = {
      images: [
        { mimeType: 'image/png', data: image },
        { mimeType: 'image/jpeg', data: new Uint8Array(jpeg) },
        { mimeType: 'image/webp', data: new Uint8Array(webp) },
      ],
      textures: structuredClone(textures),
      samplers: structuredClone(samplers),
    };
    const definition = await resolveRuntimePluginDefinition('kernel', picovoxelKernel({ wasm: 'serial' }));
    const runtimeMock = createMockKernelRuntime();
    vi.spyOn(runtimeMock.bundler, 'bundle').mockResolvedValue({
      code: 'bundled',
      success: true,
      issues: [],
      dependencies: [],
      unresolvedPaths: [],
    });
    vi.spyOn(runtimeMock, 'execute').mockResolvedValue({
      success: true,
      value: {
        default: (pico: Pico) => ({
          ...resources,
          shapes: [{ name: 'Captured', material: authored, shape: pico.createVoxels({ shape: 'sphere', radius: 2 }) }],
        }),
      },
    });
    const context = await definition.initialize({ wasm: 'serial' }, runtimeMock);
    try {
      const result = await definition.createGeometry(
        { entryPath: 'main.ts', parameters: { voxelSize: 1 }, options: { lane: 'exact' } },
        runtimeMock,
        context,
      );
      const handle = result.nativeHandle;
      const serialized = definition.serializeNativeHandle!({ nativeHandle: handle }, runtimeMock, context);
      authored.pbrMetallicRoughness!.baseColorFactor![0] = 0;
      authored.extensions!.KHR_materials_anisotropy!.anisotropyStrength = 0;
      authored.normalTexture!.extensions!['KHR_texture_transform'] = { offset: [9, 9] };
      image.fill(0);
      resources.textures[0]!.source = 1;
      resources.samplers[0]!.wrapS = 10_497;
      resources.images.length = 0;
      expect(handle.shapes[0]!.material).toEqual(material);
      expect(handle.images?.[0]?.data).toEqual(png);
      expect(handle.images?.[0]?.data.byteLength).toBe(png.byteLength);
      expect(handle.textures).toEqual(textures);
      expect(handle.samplers).toEqual(samplers);
      const restored = definition.deserializeNativeHandle!(
        { serializedNativeHandle: structuredClone(serialized) },
        runtimeMock,
        context,
      );
      expect(restored.shapes[0]!.material).toEqual(material);
      expect(restored.images?.[0]?.data).toEqual(png);
      const unalignedBytes = (bytes: Uint8Array<ArrayBuffer>) => {
        const buffer = new Uint8Array(bytes.length + 1);
        buffer.set(bytes, 1);
        return buffer.subarray(1);
      };
      const unaligned = {
        ...serialized,
        shapes: serialized.shapes.map((shape) => ({
          ...shape,
          vertices: unalignedBytes(shape.vertices),
          triangles: unalignedBytes(shape.triangles),
        })),
      };
      const copied = definition.deserializeNativeHandle!({ serializedNativeHandle: unaligned }, runtimeMock, context);
      expect(copied.shapes[0]!.vertices).toEqual(handle.shapes[0]!.vertices);
      expect(copied.shapes[0]!.triangles).toEqual(handle.shapes[0]!.triangles);
      unaligned.shapes[0]!.vertices.fill(0);
      expect(copied.shapes[0]!.vertices).toEqual(handle.shapes[0]!.vertices);
      const malformed = {
        ...serialized,
        shapes: serialized.shapes.map((shape) => ({ ...shape, vertices: shape.vertices.subarray(1) })),
      };
      expect(() =>
        definition.deserializeNativeHandle!({ serializedNativeHandle: malformed }, runtimeMock, context),
      ).toThrow(TypeError);
      expect(() =>
        definition.deserializeNativeHandle!({ serializedNativeHandle: malformed }, runtimeMock, context),
      ).toThrow('byte');
      const meshed = await definition.meshGeometry!(
        { nativeHandle: restored, options: { lane: 'exact' }, content: {} },
        runtimeMock,
        context,
      );
      if (meshed.geometry.format !== 'gltf') {
        throw new Error('Expected restored GLB mesh');
      }
      const { json, document } = await parse(meshed.geometry.content);
      expect(json.materials).toEqual([material]);
      expect(
        document
          .getRoot()
          .listTextures()
          .map((entry) => new Uint8Array(entry.getImage()!)),
      ).toEqual([png, jpeg, webp]);
    } finally {
      await definition.cleanup?.(context);
    }
  }, 120_000);

  it('should reject malformed physical properties and resources with actionable paths and recover on the same runtime', async () => {
    const cases = [
      ['material.pbrMetallicRoughness.metallicFactor', 'material.pbrMetallicRoughness.metallicFactor = Number.NaN'],
      ['material.pbrMetallicRoughness.roughnessFactor', 'material.pbrMetallicRoughness.roughnessFactor = 1.1'],
      ['material.pbrMetallicRoughness.baseColorFactor', 'material.pbrMetallicRoughness.baseColorFactor = [0,1]'],
      ['material.emissiveFactor', 'material.emissiveFactor = [0,Infinity,0]'],
      ['material.alphaMode', "material.alphaMode = 'invalid'"],
      ['material.doubleSided', 'material.doubleSided = 1'],
      ['material.extensions.KHR_materials_anisotropy', 'material.extensions.KHR_materials_unlit = {}'],
      [
        'material.extensions.KHR_materials_anisotropy.anisotropyRotation',
        'material.extensions.KHR_materials_anisotropy.anisotropyRotation = Infinity',
      ],
      [
        'material.extensions.KHR_materials_clearcoat.clearcoatFactor',
        'material.extensions.KHR_materials_clearcoat.clearcoatFactor = -1',
      ],
      [
        'material.extensions.KHR_materials_dispersion.dispersion',
        'material.extensions.KHR_materials_dispersion.dispersion = -1',
      ],
      [
        'material.extensions.KHR_materials_emissive_strength.emissiveStrength',
        'material.extensions.KHR_materials_emissive_strength.emissiveStrength = -1',
      ],
      ['material.extensions.KHR_materials_ior.ior', 'material.extensions.KHR_materials_ior.ior = 0.5'],
      [
        'material.extensions.KHR_materials_iridescence.iridescenceThicknessMinimum',
        'material.extensions.KHR_materials_iridescence.iridescenceThicknessMinimum = 500',
      ],
      [
        'material.extensions.KHR_materials_sheen.sheenColorFactor',
        'material.extensions.KHR_materials_sheen.sheenColorFactor = [2,0,0]',
      ],
      [
        'material.extensions.KHR_materials_specular.specularFactor',
        'material.extensions.KHR_materials_specular.specularFactor = 2',
      ],
      [
        'material.extensions.KHR_materials_transmission.transmissionFactor',
        'material.extensions.KHR_materials_transmission.transmissionFactor = -1',
      ],
      [
        'material.extensions.KHR_materials_volume.attenuationDistance',
        'material.extensions.KHR_materials_volume.attenuationDistance = 0',
      ],
      ['material.normalTexture.scale', "material.normalTexture.scale = 'bad'"],
      ['material.occlusionTexture.strength', 'material.occlusionTexture.strength = 2'],
      ['material.normalTexture.index', 'material.normalTexture.index = 99'],
      ['material.normalTexture.texCoord', 'material.normalTexture.extensions.KHR_texture_transform.texCoord = 1'],
      [
        'material.normalTexture.extensions.KHR_texture_transform.offset',
        'material.normalTexture.extensions.KHR_texture_transform.offset = [0]',
      ],
      ['images[0].data', 'resources.images[0].data = new Uint8Array()'],
      ['images[0].mimeType', "resources.images[0].mimeType = 'image/gif'"],
      ['textures[0].source', 'resources.textures[0].source = 99'],
      ['textures[0].sampler', 'resources.textures[0].sampler = 99'],
      ['samplers[0].wrapS', 'resources.samplers[0].wrapS = 42'],
      [
        'textures[2].extensions.EXT_texture_webp.source',
        'resources.textures[2].extensions.EXT_texture_webp.source = 0',
      ],
    ] as const;
    const client = createTestRuntimeClient({ runtime: runtime() });
    try {
      for (const [property, mutation] of cases) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- Sequential failures prove recovery of this same runtime.
        const result = await client.render({ source: { entry: 'main.ts', files: files(source(true, mutation)) } });
        expect(result.superseded, property).toBe(false);
        if (result.superseded) {
          throw new Error('Unexpected superseded invalid render');
        }
        expect(result.geometry.success, property).toBe(false);
        expect(result.geometry.issues.map(({ message }) => message).join('; '), property).toContain(property);
      }
      await assertMaterialDelivery(await render(client));
    } finally {
      await client.shutdown();
    }
  }, 120_000);
});
