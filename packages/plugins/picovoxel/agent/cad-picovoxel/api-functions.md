# picovoxel — Functions

15 top-level symbols. Signatures are verbatim typescript.

// Creates a single-threaded PicoGK session
declare function createPico(options?: CreatePicoOptions): Promise<Pico>;

// Creates a single-threaded runtime
declare function createPicoRuntime(options?: CreatePicoRuntimeOptions): Promise<PicoRuntime>;

// SG15 — the empty-bounds sentinel the ABI structs use (`BBox3()` default
declare function emptyBounds(): Bounds;

// True for the SG15 sentinel (an empty mesh/field produced it)
declare function isEmptyBounds(bounds: Bounds): boolean;

// Serialises indexed geometry to binary STL bytes (deindexed, as the format is)
declare function meshToStlBytes(vertices: Float32Array, triangles: Uint32Array, options?: ToStlOptions, lane?: 'exact' | 'fast'): Uint8Array<ArrayBuffer>;

// Builds a VectorField of surface normals from a voxel field's narrow band (C# `SurfaceNormalFieldExtractor.oExtract`)
declare function surfaceNormalFieldExtractor(pk: Pico, voxels: Voxels, options?: SurfaceNormalFieldOptions): VectorField;

// Writes every active value of `source` into `target` (C# `VectorFieldMerge.Merge`)
declare function vectorFieldMerge(source: VectorField, target: VectorField): void;

// Reproducible mulberry32 stream from a 32-bit seed
declare function createRandom(seed: number): RandomSource;

// Row/column swap for point grids (C# `GridOperations.aGetInverseGrid`)
declare function inverseGrid(grid: readonly (readonly Vec3[])[]): Vec3[][];

// Vectorizes one signed-distance slice image into closed contours
declare function contoursFromSdf(image: SdfImage, scale?: number, offsetX?: number, offsetY?: number): SliceContour[];

// Signed-area winding detection over a flat point loop
declare function detectWinding(points: ArrayLike<number>): ContourWinding;

// Renders one slice as a standalone SVG document string
declare function sliceToSvg(slice: Slice, options?: ToSvgOptions): string;

// Vectorizes a voxel field slice-by-slice via interpolated Z slices
declare function sliceVoxels(voxels: Voxels, options?: SliceVoxelsOptions): SliceStack;

// Parses ASCII CLI bytes back into a slice stack
declare function slicesFromCli(bytes: Uint8Array, options?: {
  onProgress?: (fraction: number) => void;
}): FromCliResult;

// Serialises a slice stack to ASCII CLI bytes
declare function slicesToCli(stack: SliceStack, options?: ToCliOptions): Uint8Array;
