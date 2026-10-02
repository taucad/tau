import { expect, it } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import { validateGlbResources, writeGlb } from '#index.js';
import type { GlbInput, GlbPrimitive } from '#index.js';

const volumeExtension = 'KHR_materials_volume';
const iorExtension = 'KHR_materials_ior';
const iridescenceExtension = 'KHR_materials_iridescence';
const textureTransformExtension = 'KHR_texture_transform';
const customExtension = 'CUSTOM_material';
const webpExtension = 'EXT_texture_webp';
const anisotropyExtension = 'KHR_materials_anisotropy';

const withMaterial = (material: unknown): GlbInput => {
  const primitive: GlbPrimitive = {
    mode: 4,
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    tangents: new Float32Array([1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1]),
    texCoords: [new Float32Array(6), new Float32Array(6)],
    material: {},
  };
  Reflect.set(primitive, 'material', material);
  return {
    nodes: [{ primitives: [primitive] }],
    images: [{ mimeType: 'image/png', data: new Uint8Array([1]) }],
    samplers: [{}],
    textures: [{ source: 0, sampler: 0 }],
  };
};

it.each([
  [null, /material must be an object/],
  [{ extensions: { [volumeExtension]: { thicknessFactor: -1 } } }, /must be nonnegative/],
  [{ name: undefined, pbrMetallicRoughness: null }, /must be an object/],
  [{ extensions: null }, /extensions must be an object/],
  [{ extensions: { [iorExtension]: { ior: 0.5 } } }, /zero or at least 1/],
  [{ extensions: { [iridescenceExtension]: { iridescenceIor: 0 } } }, /at least 1/],
  [{ extensions: { [iridescenceExtension]: { iridescenceThicknessMaximum: 10 } } }, /must not exceed/],
  [{ normalTexture: { index: 0, extensions: { [textureTransformExtension]: { offset: 0 } } } }, /two finite numbers/],
  [{ normalTexture: { index: 0, extensions: { [textureTransformExtension]: { scale: [1] } } } }, /two finite numbers/],
  [
    { normalTexture: { index: 0, extensions: { [textureTransformExtension]: { offset: [0, '1'] } } } },
    /two finite numbers/,
  ],
  [
    { normalTexture: { index: 0, extensions: { [textureTransformExtension]: { scale: [1, Number.NaN] } } } },
    /two finite numbers/,
  ],
  [{ emissiveFactor: 1 }, /3 finite components/],
  [{ emissiveFactor: ['1', 0, 0] }, /3 finite components/],
  [{ emissiveFactor: [Number.POSITIVE_INFINITY, 0, 0] }, /3 finite components/],
  [{ emissiveFactor: [-0.1, 0, 0] }, /3 finite components/],
  [{ emissiveFactor: [1.1, 0, 0] }, /3 finite components/],
  [{ normalTexture: null }, /existing texture/],
  [{ normalTexture: 1 }, /existing texture/],
  [{ normalTexture: {} }, /existing texture/],
  [{ normalTexture: { index: '0' } }, /existing texture/],
  [{ normalTexture: { index: 0.5 } }, /existing texture/],
  [{ normalTexture: { index: -1 } }, /existing texture/],
  [{ normalTexture: { index: 1 } }, /existing texture/],
  [{ normalTexture: { index: 0, texCoord: '0' } }, /nonnegative integer/],
  [{ normalTexture: { index: 0, texCoord: 0.5 } }, /nonnegative integer/],
  [{ normalTexture: { index: 0, texCoord: -1 } }, /nonnegative integer/],
  [{ normalTexture: { index: 0, extensions: { [textureTransformExtension]: { texCoord: Number.NaN } } } }, /TEXCOORD/],
  [{ normalTexture: { index: 0, extensions: { [textureTransformExtension]: { texCoord: -1 } } } }, /TEXCOORD/],
  [{ alphaMode: 'INVALID' }, /OPAQUE, MASK or BLEND/],
  [{ doubleSided: 1 }, /boolean/],
  [{ unknownNumericProperty: Number.NaN }, /must be finite/],
])('should diagnose malformed authored material %j and retain source ownership', (material, message) => {
  const input = withMaterial(material);
  const original = structuredClone(input);
  expect(() => writeGlb(input)).toThrow(TypeError);
  expect(() => writeGlb(input)).toThrow(message);
  expect(input).toEqual(original);
});

it('should preserve texture transform overrides, defaults and opaque authored metadata', async () => {
  const material = {
    name: 'authored',
    doubleSided: false,
    alphaMode: 'BLEND',
    normalTexture: {
      index: 0,
      extensions: { [textureTransformExtension]: { texCoord: 1, offset: [0, 1], scale: [1, 2], rotation: 0 } },
    },
    extensions: { [iridescenceExtension]: {}, [customExtension]: { opaque: null } },
    customObject: { scalar: 0, nested: { label: 'preserved', array: [1, 2] } },
    customNull: null,
    extras: { arbitrary: [1, 2] },
  };
  const { json } = await new NodeIO().binaryToJSON(writeGlb(withMaterial(material)));
  expect(json.materials![0]).toEqual(material);
  expect(json.extensionsUsed).toEqual(
    expect.arrayContaining(['KHR_texture_transform', 'KHR_materials_iridescence', 'CUSTOM_material']),
  );
});

it.each([
  { images: [{ data: new Uint8Array(), mimeType: 'image/png' }] },
  { images: [{ data: [], mimeType: 'image/png' }] },
  { images: [{ data: new Uint8Array([1]), mimeType: 'application/octet-stream' }] },
  { samplers: [{ magFilter: 0 }] },
  { samplers: [{ minFilter: 0 }] },
  { textures: [{ extensions: { [webpExtension]: null } }] },
  { textures: [{ extensions: { [webpExtension]: [] } }] },
  { textures: [{}] },
  { textures: [{ source: 0.5 }] },
  { textures: [{ source: -1 }] },
  { textures: [{ source: 0 }] },
  { images: [{ data: new Uint8Array([1]), mimeType: 'image/webp' }], textures: [{ source: 0 }] },
  {
    images: [{ data: new Uint8Array([1]), mimeType: 'image/png' }],
    textures: [{ extensions: { [webpExtension]: { source: 0 } } }],
  },
  { images: [{ data: new Uint8Array([1]), mimeType: 'image/png' }], textures: [{ source: 0, sampler: 0.5 }] },
  { images: [{ data: new Uint8Array([1]), mimeType: 'image/png' }], textures: [{ source: 0, sampler: -1 }] },
  { images: [{ data: new Uint8Array([1]), mimeType: 'image/png' }], textures: [{ source: 0, sampler: 0 }] },
])('should reject invalid encoded resource data or references %j', (resources) => {
  const original = structuredClone(resources);
  expect(() => {
    validateGlbResources(resources);
  }).toThrow(TypeError);
  expect(() => {
    validateGlbResources(resources);
  }).toThrow(/must/);
  expect(resources).toEqual(original);
});

it('should require a tangent frame or textured normal for nonzero anisotropy', () => {
  const input = withMaterial({ extensions: { [anisotropyExtension]: { anisotropyStrength: 1 } } });
  delete input.nodes[0]!.primitives[0]!.tangents;
  expect(() => writeGlb(input)).toThrow(TypeError);
  expect(() => writeGlb(input)).toThrow(/requires TANGENT or a normalTexture/);
});
