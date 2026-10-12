# picovoxel — Types

36 top-level symbols. Signatures are verbatim typescript.

AllocatedCounts: Omit<MemoryUsage, 'total'>

  voxels: number

  meshes: number

  lattices: number

  polyLines: number

  scalarFields: number

  vectorFields: number

  vdbFiles: number

  metadata: number

// RGBA color, each channel 0..1
Color: readonly [number, number, number] | readonly [number, number, number, number]

CreateScalarFieldOptions: {
  from: Voxels;
  value?: number;
  sdThreshold?: number;
} | Record<string, never>

  from: Voxels

  value?: number

  sdThreshold?: number

CreateVectorFieldOptions: {
  from: Voxels;
  value?: Vec3;
  sdThreshold?: number;
} | Record<string, never>

  from: Voxels

  value?: Vec3

  sdThreshold?: number

CreateVoxelsOptions: {
  shape: 'empty';
} | {
  shape: 'sphere';
  center?: Vec3;
  radius: number;
} | {
  shape: 'beam';
  start: Vec3;
  end: Vec3;
  radius?: number;
  startRadius?: number;
  endRadius?: number;
} |
/** Alias of 'beam', kept for source compatibility. */
{
  shape: 'capsule';
  start: Vec3;
  end: Vec3;
  radius?: number;
  startRadius?: number;
  endRadius?: number;
} |
/**
 * A JS `sdf` function runs on upstream's serial fill (the callback is only
 * reachable from the main thread). A serializable {@link SdfExpression} is
 * compiled to a tape and filled in parallel in-module — on the /multi build
 * this engages every worker thread.
 */
{
  shape: 'implicit';
  boundsMin: Vec3;
  boundsMax: Vec3;
  sdf: SdfFunction | SdfExpression;
}

  shape: 'empty'

GetSliceOptions: {
  index: number;
  axis?: SliceAxis;
  mode?: SliceMode;
} | {
  z: number;
  interpolated: true;
  mode?: SliceMode;
}

  mode?: SliceMode

// 4x4 transform, column-major in System.Numerics order (row-vector convention
Mat4: Float32Array | readonly number[]

MetadataType: 'string' | 'float' | 'vector' | 'unknown'

MetadataValue: string | number | Vec3

PicoErrorCode: 'PICO_INVALID_HANDLE' | 'PICO_WASM_INIT_FAILED' | 'PICO_OUT_OF_MEMORY' | 'PICO_DISPOSED' | 'PICO_CALL_FAILED' | 'PICO_INVALID_ARGUMENT' | 'PICO_SESSION_MISMATCH' | 'PICO_ALLOC_FAILED' | 'PICO_RESERVED_METADATA' | 'PICO_VDB_NO_COMPATIBLE_FIELD' | 'PICO_LANE_LOOSENED' | 'PICO_LANE_EXPORT' | 'PICO_NOT_IMPLEMENTED'

// A serializable SDF
SdfExpression: number | 'x' | 'y' | 'z' | readonly [SdfOperator, ...SdfExpression[]]

// Signed distance in millimetres at (x, y, z) — scalars, never a vector object
SdfFunction: (x: number, y: number, z: number) => number

SdfOperator: '+' | '-' | '*' | '/' | 'abs' | 'sqrt' | 'sin' | 'cos' | 'floor' | 'exp' | 'log' | 'mod' | 'pow' | 'min' | 'max'

SliceAxis: 'x' | 'y' | 'z'

// Slice modes are pure post-processing over the native narrow-band floats
SliceMode: 'sdf' | 'bw' | 'antialiased'

StlUnit: 'auto' | 'mm' | 'cm' | 'm' | 'ft' | 'in'

TransformOptions: {
  matrix: Mat4;
} | {
  scale: number | Vec3;
  offset?: Vec3;
}

VdbFieldType: 'voxels' | 'scalarField' | 'vectorField' | 'unsupported'

// A 3D coordinate or direction, `[x, y, z]`, in millimetres unless noted
Vec3: readonly [number, number, number]

// Normalized overhang severity 0..1 (C# `PicoGK.Numerics.Overhang`)
Overhang: number & {
  readonly [overhangBrand]: true;
}

  readonly [overhangBrand]: true

// A rotation quaternion as [x, y, z, w] (System.Numerics `Quaternion` analog)
Quat: readonly [number, number, number, number]

// An angle in radians (C# `PicoGK.Numerics.Rad`)
Rad: number & {
  readonly [radBrand]: true;
}

  readonly [radBrand]: true

// A 2D vector as an immutable tuple (System.Numerics `Vector2` analog)
Vec2: readonly [number, number]

CylindricalDirection: 'radial' | 'tangential' | 'z'

FrameType: 'cylindrical' | 'spherical' | 'z' | 'minRotation'

ModulationCoord: 'x' | 'y' | 'z'

ModulationLine: 'first' | 'second'

PipeSegmentMethod: 'startEnd' | 'midRange'

PolygonPreset: 'hex' | 'quad' | 'tri'

// A uniform [0, 1) source (the C# `Random.NextDouble` role)
RandomSource: () => number

RatioFunc: (ratio: number) => number

SplineEnds: 'open' | 'closed'

SuperShapePreset: 'round' | 'hex' | 'quad' | 'tri'

SurfaceRatioFunc: (phi: number, lengthRatio: number) => number

// Point-wise vertex transformation applied during construction (C# `fnVertexTransformation`)
VertexTransformation: (pt: Vec3) => Vec3

ContourWinding: 'ccw' | 'cw' | 'unknown'
