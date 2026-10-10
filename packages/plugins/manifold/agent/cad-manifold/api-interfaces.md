# manifold-3d — Interfaces

5 top-level symbols. Signatures are verbatim typescript.

// Define a material using the glTF metallic-roughness physically-based rendering model
GLTFMaterial: export declare interface GLTFMaterial

  // Every vertex in a glTF Mesh has a set of attributes
  // Remarks: This array specifies how vertex properties are arranged in memory. For example, a value of `['TEXCOORD_0', 'NORMAL', 'SKIP_2', 'COLOR_0']` would implicitly use property channels 0-2 for position, followed by channels 3-4 for texture, 5-7 for surface normal, ignore 8-9, and 10-12 for color. Some properties such as `TEXCOORD_0` or `COLOR_0` may be set when importing a model that has a texture or material. When vertex property `COLOR_0` is specified, it will be multiplied against {@link baseColorFactor}.
  attributes?: GLTFAttribute[]

  // Roughness of the material
  roughness?: number

  // Metallic property of the material
  metallic?: number

  // Base colour of the material
  // Remarks: If the {@link attributesattribute} `COLOR_0` is specifed, it will be multiplied against `baseColorFactor`. In this case, use an appropriate value like `[1.0, 1.0, 1.0]`.
  baseColorFactor?: [number, number, number]

  // Transparency of the material
  alpha?: number

  // Render model as unlit or shadeless, as opposed to physically based rendering
  unlit?: boolean

  // Material name
  name?: string

  // If set, this material is a copy of another material on an in-memory glTF model
  sourceMaterial?: GLTFTransform.Material

  // If set, this material is a copy of another material on an in-memory glTF model
  sourceRunID?: number

  // Treat this material as double sided
  doubleSided?: boolean

ImportOptions: export declare interface ImportOptions

  // Use `mimetype` to determine the format of the imported model, rather than inferring it
  mimetype?: string

  // When an imported model is not manifold, try closing gaps smaller than tolerance in an effort to make it manifold
  tolerance?: number

MeshOptions: export declare interface MeshOptions

  numProp: number

  vertProperties: Float32Array

  triVerts: Uint32Array

  mergeFromVert?: Uint32Array

  mergeToVert?: Uint32Array

  runIndex?: Uint32Array

  runOriginalID?: Uint32Array

  runTransform?: Float32Array

  faceID?: Uint32Array

  halfedgeTangent?: Float32Array

  tolerance?: number

SealedFloat32Array: export declare interface SealedFloat32Array<N extends number> extends Float32Array

  // The length of the array
  length: N

SealedUint32Array: export declare interface SealedUint32Array<N extends number> extends Uint32Array

  // The length of the array
  length: N
