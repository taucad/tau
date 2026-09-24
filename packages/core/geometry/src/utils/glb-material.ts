import type { GLTF } from '@gltf-transform/core';
import type { JSONObject } from '@taucad/runtime/types';

type TextureInfo = GLTF.ITextureInfo;

/** Standard glTF 2.0 material properties, including the ratified physical material extensions. @public */
export type GlbMaterial = Omit<GLTF.IMaterial, 'extensions' | 'extras'> & {
  extras?: JSONObject;
  extensions?: {
    [extension: string]: unknown;
    KHR_materials_anisotropy?: {
      anisotropyStrength?: number;
      anisotropyRotation?: number;
      anisotropyTexture?: TextureInfo;
    };
    KHR_materials_clearcoat?: {
      clearcoatFactor?: number;
      clearcoatRoughnessFactor?: number;
      clearcoatTexture?: TextureInfo;
      clearcoatRoughnessTexture?: TextureInfo;
      clearcoatNormalTexture?: GLTF.IMaterialNormalTextureInfo;
    };
    KHR_materials_dispersion?: { dispersion?: number };
    KHR_materials_emissive_strength?: { emissiveStrength?: number };
    KHR_materials_ior?: { ior?: number };
    KHR_materials_iridescence?: {
      iridescenceFactor?: number;
      iridescenceIor?: number;
      iridescenceThicknessMinimum?: number;
      iridescenceThicknessMaximum?: number;
      iridescenceTexture?: TextureInfo;
      iridescenceThicknessTexture?: TextureInfo;
    };
    KHR_materials_sheen?: {
      sheenColorFactor?: number[];
      sheenRoughnessFactor?: number;
      sheenColorTexture?: TextureInfo;
      sheenRoughnessTexture?: TextureInfo;
    };
    KHR_materials_specular?: {
      specularFactor?: number;
      specularColorFactor?: number[];
      specularTexture?: TextureInfo;
      specularColorTexture?: TextureInfo;
    };
    KHR_materials_transmission?: { transmissionFactor?: number; transmissionTexture?: TextureInfo };
    KHR_materials_unlit?: Record<string, never>;
    KHR_materials_volume?: {
      thicknessFactor?: number;
      thicknessTexture?: TextureInfo;
      attenuationDistance?: number;
      attenuationColor?: number[];
    };
  };
};

/** An image encoded into a GLB's binary buffer. @public */
export type GlbImage = {
  name?: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  data: Uint8Array<ArrayBuffer>;
};

/** Shared image, texture and sampler resources referenced by standard glTF material indexes. @public */
export type GlbResources = Pick<GLTF.IGLTF, 'textures' | 'samplers'> & { images?: GlbImage[] };

const unitFactors = new Set([
  'metallicFactor',
  'roughnessFactor',
  'anisotropyStrength',
  'clearcoatFactor',
  'clearcoatRoughnessFactor',
  'iridescenceFactor',
  'sheenRoughnessFactor',
  'specularFactor',
  'transmissionFactor',
  'strength',
]);
const positiveFactors = new Set(['attenuationDistance']);
const nonnegativeFactors = new Set([
  'alphaCutoff',
  'dispersion',
  'emissiveStrength',
  'thicknessFactor',
  'iridescenceThicknessMinimum',
  'iridescenceThicknessMaximum',
]);
const colors = new Set([
  'baseColorFactor',
  'emissiveFactor',
  'sheenColorFactor',
  'specularColorFactor',
  'attenuationColor',
]);
const materialExtensions = new Set([
  'KHR_materials_anisotropy',
  'KHR_materials_clearcoat',
  'KHR_materials_dispersion',
  'KHR_materials_emissive_strength',
  'KHR_materials_ior',
  'KHR_materials_iridescence',
  'KHR_materials_sheen',
  'KHR_materials_specular',
  'KHR_materials_transmission',
  'KHR_materials_unlit',
  'KHR_materials_volume',
  'KHR_texture_transform',
]);

function fail(path: string, requirement: string): never {
  throw new TypeError(`${path} ${requirement}`);
}

/** Validate the supported material vocabulary before JSON encoding, retaining opaque extension data. @internal */
export function validateGlbMaterial(
  material: GlbMaterial,
  { textureCount, texCoordCount, hasTangents }: { textureCount: number; texCoordCount: number; hasTangents: boolean },
): void {
  const visit = (value: unknown, path: string): void => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      fail(path, 'must be an object');
    }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (child === undefined) {
        continue;
      }
      const property = `${path}.${key}`;
      if (key === 'extras') {
        continue;
      }
      if (key === 'extensions') {
        if (child === null || typeof child !== 'object' || Array.isArray(child)) {
          fail(property, 'must be an object');
        }
        for (const [name, extension] of Object.entries(child as Record<string, unknown>)) {
          if (materialExtensions.has(name) && extension !== undefined) {
            visit(extension, `${property}.${name}`);
          }
        }
      } else if (
        unitFactors.has(key) ||
        nonnegativeFactors.has(key) ||
        positiveFactors.has(key) ||
        key === 'ior' ||
        key === 'iridescenceIor' ||
        key === 'anisotropyRotation' ||
        (key === 'rotation' && path.endsWith('KHR_texture_transform')) ||
        (key === 'scale' && path.endsWith('Texture'))
      ) {
        if (typeof child !== 'number' || !Number.isFinite(child)) {
          fail(property, 'must be a finite number');
        }
        if (unitFactors.has(key) && (child < 0 || child > 1)) {
          fail(property, 'must be within [0, 1]');
        }
        if ((nonnegativeFactors.has(key) && child < 0) || (positiveFactors.has(key) && child <= 0)) {
          fail(property, positiveFactors.has(key) ? 'must be positive' : 'must be nonnegative');
        }
        if ((key === 'ior' && child !== 0 && child < 1) || (key === 'iridescenceIor' && child < 1)) {
          fail(property, key === 'ior' ? 'must be zero or at least 1' : 'must be at least 1');
        }
      } else if (path.endsWith('KHR_texture_transform') && (key === 'offset' || key === 'scale')) {
        if (
          !Array.isArray(child) ||
          child.length !== 2 ||
          child.some((component) => typeof component !== 'number' || !Number.isFinite(component))
        ) {
          fail(property, 'must contain two finite numbers');
        }
      } else if (colors.has(key)) {
        const length = key === 'baseColorFactor' ? 4 : 3;
        if (
          !Array.isArray(child) ||
          child.length !== length ||
          child.some(
            (channel) => typeof channel !== 'number' || !Number.isFinite(channel) || channel < 0 || channel > 1,
          )
        ) {
          fail(property, `must have ${length} finite components within [0, 1]`);
        }
      } else if (key.endsWith('Texture')) {
        if (
          child === null ||
          typeof child !== 'object' ||
          !('index' in child) ||
          typeof child.index !== 'number' ||
          !Number.isInteger(child.index) ||
          child.index < 0 ||
          child.index >= textureCount
        ) {
          fail(
            `${property}.index`,
            `must reference an existing texture; received ${child && typeof child === 'object' && 'index' in child ? String(child.index) : 'missing'}`,
          );
        }
        if (
          'texCoord' in child &&
          (typeof child.texCoord !== 'number' || !Number.isInteger(child.texCoord) || child.texCoord < 0)
        ) {
          fail(`${property}.texCoord`, 'must be a nonnegative integer');
        }
        const textureInfo = child as TextureInfo;
        const transform = textureInfo.extensions?.['KHR_texture_transform'] as { texCoord?: number } | undefined;
        const coordinate = transform?.texCoord ?? textureInfo.texCoord ?? 0;
        if (!Number.isInteger(coordinate) || coordinate < 0 || coordinate >= texCoordCount) {
          fail(`${property}.texCoord`, `requires TEXCOORD_${coordinate} on the primitive`);
        }
        visit(child, property);
      } else if (key === 'alphaMode' && child !== 'OPAQUE' && child !== 'MASK' && child !== 'BLEND') {
        fail(property, 'must be OPAQUE, MASK or BLEND');
      } else if (key === 'doubleSided' && typeof child !== 'boolean') {
        fail(property, 'must be a boolean');
      } else if (key === 'pbrMetallicRoughness') {
        visit(child, property);
      } else if (typeof child === 'number' && !Number.isFinite(child)) {
        fail(property, 'must be finite');
      } else if (child !== null && typeof child === 'object' && !Array.isArray(child)) {
        visit(child, property);
      }
    }
  };
  visit(material, 'material');
  if (
    (material.extensions?.KHR_materials_anisotropy?.anisotropyStrength ?? 0) > 0 &&
    !material.normalTexture &&
    !hasTangents
  ) {
    fail(
      'material.extensions.KHR_materials_anisotropy',
      'requires TANGENT or a normalTexture with texture coordinates',
    );
  }
  if (material.extensions?.KHR_materials_anisotropy && material.extensions.KHR_materials_unlit) {
    fail('material.extensions.KHR_materials_anisotropy', 'must not be combined with KHR_materials_unlit');
  }
  const iridescence = material.extensions?.KHR_materials_iridescence;
  if (
    iridescence &&
    (iridescence.iridescenceThicknessMinimum ?? 100) > (iridescence.iridescenceThicknessMaximum ?? 400)
  ) {
    fail(
      'material.extensions.KHR_materials_iridescence.iridescenceThicknessMinimum',
      'must not exceed iridescenceThicknessMaximum',
    );
  }
}

/**
 * Validate embedded image resources, texture indexes and glTF sampler values.
 * @param value - Resource fields from an authored model or GLB writer input.
 * @throws TypeError when resources are malformed or reference absent entries.
 * @public
 */
export function validateGlbResources(value: unknown): asserts value is GlbResources {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('resources', 'must be an object');
  }
  const fields = value as Record<string, unknown>;
  for (const key of ['images', 'textures', 'samplers']) {
    const entries: unknown = fields[key];
    if (entries === undefined) {
      continue;
    }
    if (!Array.isArray(entries)) {
      fail(key, 'must be an array');
    }
    for (const [index, entry] of (entries as unknown[]).entries()) {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
        fail(`${key}[${index}]`, 'must be an object');
      }
      if ('name' in entry && typeof entry.name !== 'string') {
        fail(`${key}[${index}].name`, 'must be a string');
      }
      if (
        'extensions' in entry &&
        (entry.extensions === null || typeof entry.extensions !== 'object' || Array.isArray(entry.extensions))
      ) {
        fail(`${key}[${index}].extensions`, 'must be an object');
      }
    }
  }
  const resources = value as GlbResources;
  for (const [index, image] of (resources.images ?? []).entries()) {
    if (!(image.data instanceof Uint8Array) || image.data.byteLength === 0) {
      fail(`images[${index}].data`, 'must contain encoded image bytes');
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(image.mimeType)) {
      fail(`images[${index}].mimeType`, 'must be image/png, image/jpeg or image/webp');
    }
  }
  for (const [index, sampler] of (resources.samplers ?? []).entries()) {
    for (const key of ['wrapS', 'wrapT', 'magFilter', 'minFilter'] as const) {
      const value = sampler[key];
      const allowed = key.startsWith('wrap')
        ? [33_071, 33_648, 10_497]
        : key === 'magFilter'
          ? [9728, 9729]
          : [9728, 9729, 9984, 9985, 9986, 9987];
      if (value !== undefined && !allowed.includes(value)) {
        fail(`samplers[${index}].${key}`, 'must be a standard glTF sampler value');
      }
    }
  }
  for (const [index, texture] of (resources.textures ?? []).entries()) {
    const rawWebp: unknown = texture.extensions?.['EXT_texture_webp'];
    if (rawWebp !== undefined && (rawWebp === null || typeof rawWebp !== 'object' || Array.isArray(rawWebp))) {
      fail(`textures[${index}].extensions.EXT_texture_webp`, 'must be an object');
    }
    const webp = rawWebp as { source?: number } | undefined;
    if (texture.source === undefined && webp?.source === undefined) {
      fail(`textures[${index}]`, 'must reference an image source');
    }
    for (const source of [texture.source, webp?.source]) {
      if (
        source !== undefined &&
        (!Number.isInteger(source) || source < 0 || source >= (resources.images?.length ?? 0))
      ) {
        fail(`textures[${index}].source`, 'must reference an existing image');
      }
    }
    if (texture.source !== undefined && resources.images?.[texture.source]?.mimeType === 'image/webp') {
      fail(`textures[${index}].source`, 'must use EXT_texture_webp.source for WebP images');
    }
    if (webp?.source !== undefined && resources.images?.[webp.source]?.mimeType !== 'image/webp') {
      fail(`textures[${index}].extensions.EXT_texture_webp.source`, 'must reference a WebP image');
    }
    if (
      texture.sampler !== undefined &&
      (!Number.isInteger(texture.sampler) ||
        texture.sampler < 0 ||
        texture.sampler >= (resources.samplers?.length ?? 0))
    ) {
      fail(`textures[${index}].sampler`, 'must reference an existing sampler');
    }
  }
}

/** Collect extension names recursively from glTF properties, excluding application extras. @internal */
export function collectGltfExtensions(value: unknown, extensions: Set<string>): void {
  if (Array.isArray(value)) {
    for (const child of value) {
      collectGltfExtensions(child, extensions);
    }
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'extras') {
        continue;
      }
      if (key === 'extensions' && child !== null && typeof child === 'object') {
        for (const name of Object.keys(child as Record<string, unknown>)) {
          extensions.add(name);
        }
      }
      collectGltfExtensions(child, extensions);
    }
  }
}
