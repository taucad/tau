/* eslint-disable @typescript-eslint/naming-convention -- glTF extension keys use standardized names. */
import { describe, expect, it } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import { validateGlbResources } from '#utils/glb-material.js';
import { writeGlb, writeGltfJson } from '#utils/glb-writer.js';
import type { GlbInput, GlbMaterial } from '#utils/glb-writer.js';
import { normalizeGltfGeometryNames } from '#utils/gltf-geometry-name-normalizer.js';
import { transformGltfExportBytes } from '#utils/gltf-export-transform.js';

const whitePng = Uint8Array.from(
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1EAAAAASUVORK5CYII=', 'base64'),
);

const material: GlbMaterial = {
  name: 'Coated copper',
  pbrMetallicRoughness: { baseColorFactor: [0.955, 0.638, 0.538, 1], metallicFactor: 1, roughnessFactor: 0.25 },
  emissiveFactor: [0.1, 0.02, 0],
  alphaMode: 'MASK',
  alphaCutoff: 0.4,
  doubleSided: false,
  extensions: {
    KHR_materials_anisotropy: { anisotropyStrength: 0.8, anisotropyRotation: 0.5 },
    KHR_materials_clearcoat: { clearcoatFactor: 0.4, clearcoatRoughnessFactor: 0.1 },
    KHR_materials_transmission: { transmissionFactor: 0.2 },
    KHR_materials_ior: { ior: 1.5 },
    KHR_materials_volume: { thicknessFactor: 0.002, attenuationColor: [0.8, 0.9, 1], attenuationDistance: 0.1 },
    KHR_materials_sheen: { sheenColorFactor: [0.2, 0.1, 0], sheenRoughnessFactor: 0.6 },
    KHR_materials_specular: { specularFactor: 0.9, specularColorFactor: [1, 0.9, 0.8] },
    KHR_materials_iridescence: { iridescenceFactor: 0.2, iridescenceIor: 1.4, iridescenceThicknessMaximum: 420 },
    KHR_materials_dispersion: { dispersion: 0.2 },
    KHR_materials_emissive_strength: { emissiveStrength: 2 },
  },
};

function input(configuredMaterial: GlbMaterial = material): GlbInput {
  return {
    nodes: [
      {
        primitives: [
          {
            mode: 4,
            positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
            normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
            tangents: new Float32Array([1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1]),
            texCoords: [new Float32Array([0, 0, 1, 0, 0, 1])],
            material: configuredMaterial,
          },
        ],
      },
    ],
  };
}

describe('standard glTF material serialization', () => {
  it('should preserve every authored material property and register extensions in binary and JSON output', async () => {
    const before = structuredClone(material);
    const io = new NodeIO();
    const { json } = await io.binaryToJSON(writeGlb(input()));
    expect(json.materials).toEqual([material]);
    expect(json.extensionsUsed).toEqual(expect.arrayContaining(Object.keys(material.extensions ?? {})));
    expect(json.meshes?.[0]?.primitives[0]?.attributes['TEXCOORD_0']).toBeTypeOf('number');
    expect(JSON.parse(new TextDecoder().decode(writeGltfJson(input()))).materials).toEqual([material]);
    expect(material).toEqual(before);
  });

  it('should retain distinct emission, cutoff and extension values when deduplicating materials', async () => {
    const scene = input();
    scene.nodes.push(...input({ ...material, emissiveFactor: [1, 0, 0] }).nodes);
    scene.nodes.push(...input({ ...material, alphaCutoff: 0.7 }).nodes);
    scene.nodes.push(...input().nodes);
    const { json } = await new NodeIO().binaryToJSON(writeGlb(scene));
    expect(json.materials).toHaveLength(3);
    expect(json.meshes?.map((mesh) => mesh.primitives[0]?.material)).toEqual([0, 1, 2, 0]);
  });

  it.each([Number.NaN, Infinity, -0.1, 1.1])(
    'should reject invalid roughness %s before encoding',
    (roughnessFactor) => {
      expect(() => writeGlb(input({ pbrMetallicRoughness: { roughnessFactor } }))).toThrow(/roughnessFactor/);
    },
  );

  it('should reject missing texture resources with an actionable property path', () => {
    expect(() => writeGlb(input({ normalTexture: { index: 2 } }))).toThrow(/normalTexture.index.*2/);
  });

  it('should reject incomplete UV attributes instead of writing malformed accessors', () => {
    const scene = input();
    scene.nodes[0]!.primitives[0]!.texCoords = [new Float32Array([0, 0])];
    expect(() => writeGlb(scene)).toThrow(/TEXCOORD_0.*count/);
  });

  it('should preserve encoded images, shared samplers and transformed texture coordinates', async () => {
    const transform = { offset: [0.2, 0.3], scale: [2, 3], rotation: 0.4, texCoord: 1 };
    const textured = input({
      pbrMetallicRoughness: { baseColorTexture: { index: 0, extensions: { KHR_texture_transform: transform } } },
      normalTexture: { index: 0, scale: 0.5 },
      occlusionTexture: { index: 0, strength: 0.4 },
      emissiveTexture: { index: 0 },
      emissiveFactor: [1, 1, 1],
    });
    textured.nodes[0]!.primitives[0]!.texCoords!.push(new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]));
    textured.images = [{ data: whitePng, mimeType: 'image/png' }];
    textured.textures = [{ source: 0, sampler: 0 }];
    textured.samplers = [{ wrapS: 10_497, wrapT: 33_071, minFilter: 9987, magFilter: 9729 }];
    const bytes = writeGlb(textured);
    const { json, resources } = await new NodeIO().binaryToJSON(bytes);
    expect(json.materials).toEqual([textured.nodes[0]!.primitives[0]!.material]);
    expect(json.extensionsUsed).toContain('KHR_texture_transform');
    expect(json.textures).toEqual(textured.textures);
    expect(json.samplers).toEqual(textured.samplers);
    const view = json.bufferViews![json.images![0]!.bufferView!]!;
    const buffer = Object.values(resources)[0]!;
    expect(buffer.slice(view.byteOffset, view.byteOffset! + view.byteLength)).toEqual(whitePng);
  });

  it('should preserve physical extensions through naming and coordinate export transforms', async () => {
    const named = await normalizeGltfGeometryNames(writeGlb(input()), { format: 'glb' });
    const transformed = await transformGltfExportBytes(named, { format: 'glb', coordinateSystem: 'z-up' });
    const { json } = await new NodeIO().binaryToJSON(transformed);
    expect(json.extensionsUsed).toEqual(expect.arrayContaining(Object.keys(material.extensions!)));
    const emitted = json.materials![0]!;
    expect(emitted.extensions).toMatchObject(material.extensions!);
    expect(emitted.alphaCutoff).toBe(0.4);
  });

  it('should scale volume distances with a millimetre export while retaining dimensionless factors', async () => {
    const bytes = await transformGltfExportBytes(writeGlb(input()), { format: 'glb', unit: { length: 'millimeter' } });
    const { json } = await new NodeIO().binaryToJSON(bytes);
    expect(json.materials?.[0]?.extensions?.['KHR_materials_volume']).toEqual({
      thicknessFactor: 2,
      attenuationDistance: 100,
      attenuationColor: [0.8, 0.9, 1],
    });
    expect({ metallicFactor: 1, roughnessFactor: 1, ...json.materials?.[0]?.pbrMetallicRoughness }).toEqual(
      material.pbrMetallicRoughness,
    );
  });

  it('should preserve custom extension values without applying physical material ranges to opaque fields', async () => {
    const custom = {
      extensions: { VENDOR_measured_material: { strength: 12, roughnessFactor: 9 } },
      extras: { strength: 100 },
    };
    const { json } = await new NodeIO().binaryToJSON(writeGlb(input(custom)));
    expect(json.materials).toEqual([custom]);
  });

  it.each([
    { extensions: { KHR_materials_ior: { ior: 0.8 } } },
    { extensions: { KHR_materials_volume: { attenuationDistance: 0 } } },
    {
      extensions: { KHR_materials_iridescence: { iridescenceThicknessMinimum: 500, iridescenceThicknessMaximum: 200 } },
    },
    { extensions: { CUSTOM_material: { invalid: Number.NaN } } },
    { pbrMetallicRoughness: { baseColorFactor: [1, 1, 1] } },
  ])('should reject invalid standard or non-JSON data: %j', (invalid) => {
    expect(() => writeGlb(input(invalid))).toThrow(TypeError);
  });

  it.each([
    { pbrMetallicRoughness: [] },
    { pbrMetallicRoughness: 1 },
    { extensions: [] },
    { extensions: { KHR_materials_unlit: {}, KHR_materials_anisotropy: {} } },
    { normalTexture: { index: 0, scale: '1' } },
    { normalTexture: { index: 0, extensions: { KHR_texture_transform: { rotation: '0' } } } },
  ])('should reject malformed material data at the JavaScript boundary: %j', (invalid) => {
    const scene = input();
    scene.nodes[0]!.primitives[0]!.material = invalid as GlbMaterial;
    scene.images = [{ data: whitePng, mimeType: 'image/png' }];
    scene.textures = [{ source: 0 }];
    expect(() => writeGlb(scene)).toThrow(TypeError);
  });

  it.each([
    [2, 0, 0, 1],
    [1, 0, 0, 0],
    [Number.NaN, 0, 0, 1],
  ])('should reject invalid tangent %j', (...tangent) => {
    const scene = input();
    scene.nodes[0]!.primitives[0]!.tangents!.set(tangent);
    expect(() => writeGlb(scene)).toThrow(/TANGENT/);
  });

  it('should require normals when tangent vectors are authored', () => {
    const scene = input();
    delete scene.nodes[0]!.primitives[0]!.normals;
    expect(() => writeGlb(scene)).toThrow(/TANGENT requires matching NORMAL/);
  });

  it('should reject a referenced UV set that is absent', () => {
    const scene = input({ normalTexture: { index: 0, texCoord: 1 } });
    scene.images = [{ data: whitePng, mimeType: 'image/png' }];
    scene.textures = [{ source: 0 }];
    expect(() => writeGlb(scene)).toThrow(/TEXCOORD_1/);
  });
});

describe('resource admission', () => {
  it.each([
    null,
    [],
    { images: {} },
    { textures: [null] },
    { samplers: [1] },
    { images: [{ data: whitePng, mimeType: 'image/png', name: 1 }] },
    { textures: [{ extensions: { EXT_texture_webp: 1 } }] },
    { textures: [{ extensions: [] }] },
  ])('should reject malformed resource envelopes: %j', (resources) => {
    expect(() => {
      validateGlbResources(resources);
    }).toThrow(TypeError);
  });
});
