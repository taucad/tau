# @taucad/replicad — Types

11 top-level symbols. Signatures are verbatim typescript.

// A shape with optional display and material metadata for rendering
// Remarks: Returned from a Replicad model's `main()` function to control per-shape appearance in both GLTF preview rendering and STEP export.
ShapeConfig: {
    shape: AnyShape;
    name?: string;
    strokeType?: string;
    /** Physical density in g/cm³ for STEP mass computation. */
    density?: number;
    interfaces?: InterfaceDeclarations;
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
//   import { makeCylinder } from 'replicad';
//   
//   export default function main() {
//   return {
//   shape: makeCylinder(10, 30),
//   material: {
//   pbrMetallicRoughness: { metallicFactor: 1, roughnessFactor: 0.25 },
//   extensions: { KHR_materials_anisotropy: { anisotropyStrength: 0.8 } },
//   },
//   density: 7.85,
//   };
//   }

  shape: AnyShape

  name?: string

  strokeType?: string

  // Physical density in g/cm³ for STEP mass computation
  density?: number

  interfaces?: InterfaceDeclarations

  // CSS color, converted from sRGB to linear glTF base color
  color?: string

  opacity?: number

  metalness?: number

  roughness?: number

  material?: never

// Model-level textures and images shared by the returned BRep shapes
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

// Named face selector declaration resolved by the Tau Replicad kernel before export
FaceDeclaration: {
    kind: 'face';
    select: (finder: FaceFinder) => FaceFinder;
}

  kind: 'face'

  select: (finder: FaceFinder) => FaceFinder

// Named cylindrical or conical axis selector declaration resolved from a Replicad face
AxisDeclaration: {
    kind: 'axis';
    select: (finder: FaceFinder) => FaceFinder;
}

  kind: 'axis'

  select: (finder: FaceFinder) => FaceFinder

// Named orthonormal datum frame declaration exported as an AP242 placement
DatumDeclaration: {
    kind: 'datum';
    origin: SimplePoint;
    xAxis: SimplePoint;
    zAxis: SimplePoint;
}

  kind: 'datum'

  origin: SimplePoint

  xAxis: SimplePoint

  zAxis: SimplePoint

// Named group of face and axis declarations
GroupDeclaration: {
    kind: 'group';
    members: Array<FaceDeclaration | AxisDeclaration>;
}

  kind: 'group'

  members: Array<FaceDeclaration | AxisDeclaration>

// Replicad interface annotation declaration accepted by Tau's STEP exporter
InterfaceDeclaration: FaceDeclaration | AxisDeclaration | DatumDeclaration | GroupDeclaration

  kind: 'face'

// Map of interface names to annotation declarations
InterfaceDeclarations: Record<string, InterfaceDeclaration>
