# @taucad/smlib — Types

6 top-level symbols. Signatures are verbatim typescript.

// Anything an SMLib model can return for display
SmlibShape: Shape | Mesh

// A shape with optional display and material metadata for rendering
// Remarks: Returned from an SMLib model's `main()` function to control per-shape appearance in glTF rendering and STEP export. A body's own `named()` and `colored()` values apply when the config leaves `name` or `color` out.
ShapeConfig: {
    shape: SmlibShape;
    name?: string;
    /** Drawing stroke style for curves: `'dashes'` or `'dots'`. */
    strokeType?: string;
    /** Physical density in g/cm³, retained on the part for mass evidence. */
    density?: number;
} & ({
    /** CSS color, converted from sRGB to linear glTF base color. */
    color?: string;
    opacity?: number;
    metalness?: number;
    roughness?: number;
    material?: never;
} | {
    /** Standard glTF material. Color factors are linear; volume distances are metres. */
    material: GlbMaterial;
    color?: never;
    opacity?: never;
    metalness?: never;
    roughness?: never;
})
// Example (Shape with PBR material properties):
//   import { Cylinder } from '@classcad/smlibwasm';
//   
//   export default function main() {
//   return {
//   shape: Cylinder(10, 30),
//   material: {
//   pbrMetallicRoughness: { metallicFactor: 1, roughnessFactor: 0.25 },
//   extensions: { KHR_materials_anisotropy: { anisotropyStrength: 0.8 } },
//   },
//   };
//   }

  shape: SmlibShape

  name?: string

  // Drawing stroke style for curves
  strokeType?: string

  // Physical density in g/cm³, retained on the part for mass evidence
  density?: number

  // CSS color, converted from sRGB to linear glTF base color
  color?: string

  opacity?: number

  metalness?: number

  roughness?: number

  material?: never

// Model-level textures and images shared by the returned shapes
Model: GlbResources & {
    shapes: ShapeConfig[];
}

  // An array of textures
  textures?: ITexture[]

  // An array of samplers
  samplers?: ISampler[]

  images?: GlbImage[]

  shapes: ShapeConfig[]

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

  // The user-defined name of this object
  name?: string

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
