# @taucad/picovoxel — Types

6 top-level symbols. Signatures are verbatim typescript.

// A delivered part's geometry, display name and standard glTF material
PicovoxelPart: Readonly<{
    shape: Mesh | Voxels;
    name?: string;
    material?: GlbMaterial;
}>

  shape: Mesh | Voxels

  name?: string

  material?: GlbMaterial

// A flat model with shared indexed images, textures and samplers
PicovoxelModel: GlbResources & Readonly<{
    shapes: readonly Part[];
}>

  // An array of textures
  textures?: ITexture[]

  // An array of samplers
  samplers?: ISampler[]

  images?: GlbImage[]

  shapes: readonly Part[]

// A PicoVoxel model's single part, flat list, or model with shared image resources
// Remarks: Raw geometry keeps generated names. Descriptors attach a display name at the output boundary; names are trimmed, blank names fall back to `Shape N`, and duplicates are preserved. Names do not create stable identity, hierarchy or assembly occurrences. Descriptor materials apply to the final geometry and are copied with image bytes when returned. Absent material retains CAD defaults; authored glTF alpha modes and double-sided values are preserved.
PicovoxelResult: Part | readonly Part[] | PicovoxelModel
// Example (Name a delivered part):
//   import type { Pico } from 'picovoxel';
//   import type { PicovoxelResult } from '@taucad/picovoxel';
//   
//   export default function main(pico: Pico): PicovoxelResult {
//   return { shape: pico.createVoxels({ shape: 'sphere', radius: 10 }), name: 'Housing' };
//   }

// Standard glTF 2.0 material properties, including the ratified physical material extensions
Material: Omit<GLTF.IMaterial, 'extensions' | 'extras'> & {
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
        KHR_materials_dispersion?: {
            dispersion?: number;
        };
        KHR_materials_emissive_strength?: {
            emissiveStrength?: number;
        };
        KHR_materials_ior?: {
            ior?: number;
        };
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
        KHR_materials_transmission?: {
            transmissionFactor?: number;
            transmissionTexture?: TextureInfo;
        };
        KHR_materials_unlit?: Record<string, never>;
        KHR_materials_volume?: {
            thicknessFactor?: number;
            thicknessTexture?: TextureInfo;
            attenuationDistance?: number;
            attenuationColor?: number[];
        };
    };
}

  // The user-defined name of this object
  name?: string

  // A set of parameter values that are used to define the metallic-roughness material model from Physically-Based Rendering (PBR) methodology
  pbrMetallicRoughness?: IMaterialPbrMetallicRoughness

  // The normal map texture
  normalTexture?: IMaterialNormalTextureInfo

  // The occlusion map texture
  occlusionTexture?: IMaterialOcclusionTextureInfo

  // The emissive map texture
  emissiveTexture?: ITextureInfo

  // The RGB components of the emissive color of the material
  emissiveFactor?: number[]

  // The alpha rendering mode of the material
  alphaMode?: MaterialAlphaMode

  // The alpha cutoff value of the material
  alphaCutoff?: number

  // Specifies whether the material is double sided
  doubleSided?: boolean

  extras?: JSONObject

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
          KHR_materials_dispersion?: {
              dispersion?: number;
          };
          KHR_materials_emissive_strength?: {
              emissiveStrength?: number;
          };
          KHR_materials_ior?: {
              ior?: number;
          };
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
          KHR_materials_transmission?: {
              transmissionFactor?: number;
              transmissionTexture?: TextureInfo;
          };
          KHR_materials_unlit?: Record<string, never>;
          KHR_materials_volume?: {
              thicknessFactor?: number;
              thicknessTexture?: TextureInfo;
              attenuationDistance?: number;
              attenuationColor?: number[];
          };
      }

// An image encoded into a GLB's binary buffer
Image: {
    name?: string;
    mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
    data: Uint8Array<ArrayBuffer>;
}

  name?: string

  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'

  data: Uint8Array<ArrayBuffer>

// Shared image, texture and sampler resources referenced by standard glTF material indexes
Resources: Pick<GLTF.IGLTF, 'textures' | 'samplers'> & {
    images?: GlbImage[];
}

  // An array of textures
  textures?: ITexture[]

  // An array of samplers
  samplers?: ISampler[]

  images?: GlbImage[]
