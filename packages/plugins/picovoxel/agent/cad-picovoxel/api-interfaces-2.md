# picovoxel — Interfaces (2)

18 top-level symbols. Signatures are verbatim typescript.

// A spherical coordinate (C# `Spherical`)
Spherical: interface Spherical

  readonly r: number

  readonly phi: Rad

  readonly theta: Rad

Implicit: interface Implicit

  // C# `IImplicit.fSignedDistance` as a picovoxel SdfFunction
  readonly sdf: SdfFunction

  // The same field as a tape expression for the parallel fill
  readonly expression: SdfExpression

// C# `ILatticeBaseShape`
LatticeBaseShape: interface LatticeBaseShape

  // LatticeBaseShape.latConstruct (method)
  latConstruct(pk: Pico): Lattice;

LatticeManifoldOptions: interface LatticeManifoldOptions

  // Required for the Frame form
  length?: number

  radius?: number

  // Degrees
  maxOverhangAngle?: number

  // Extend the teardrop in -Z as well (C# `bExtendBothSides = false`)
  extendBothSides?: boolean

  // C# `fMinPrintableRadius = 0.1`
  minPrintableRadius?: number

// C# `IMeshBaseShape`
MeshBaseShape: interface MeshBaseShape

  // MeshBaseShape.mshConstruct (method)
  mshConstruct(pk: Pico): Mesh;

PipeSegmentOptions: interface PipeSegmentOptions

  // Required for the Frame form
  length?: number

  innerRadius: number

  outerRadius: number

  // START_END
  startOrMid: LineModulation

  // START_END
  endOrRange: LineModulation

  method: PipeSegmentMethod

// C# `ISpineBaseShape`
SpineBaseShape: interface SpineBaseShape

  // SpineBaseShape.spinePoint (method)
  spinePoint(ratio1: number): Vec3;

// ShapeKernel `ISpline`
Spline: interface Spline

  // Spline.points (method)
  points(samples?: number): Vec3[];

// C# `ISurfaceBaseShape`
SurfaceBaseShape: interface SurfaceBaseShape

  // SurfaceBaseShape.surfacePoint (method)
  surfacePoint(ratio1: number, ratio2: number, ratio3: number): Vec3;

TangentOptions: interface TangentOptions

  startTangentStrength?: number

  endTangentStrength?: number

  relativeStartStrength?: boolean

  relativeEndStrength?: boolean

FromCliResult: interface FromCliResult extends SliceStack

  unitsHeader: number

  date: string

  headerLayerCount: number

  warnings: string[]

SdfImage: interface SdfImage

  width: number

  height: number

  // Row-major samples, negative inside
  data: ArrayLike<number>

Slice: interface Slice

  // Layer height position in mm (first layer at one layerHeight, as CLI wants)
  z: number

  contours: SliceContour[]

  // Value provenance of the sliced voxels (`'exact'` or absent = exact
  lane?: 'exact' | 'fast'

SliceContour: interface SliceContour

  // Flat [x0, y0, x1, y1, …] loop in mm
  points: Float64Array

  // Solid boundaries are CCW, holes CW (upstream contract)
  winding: ContourWinding

SliceStack: interface SliceStack

  slices: Slice[]

  // XY bounds over every contour + Z from first/last layer
  bounds: {
      min: readonly [number, number, number];
      max: readonly [number, number, number];
    }

  // Value provenance (`'exact'` or absent = exact)
  lane?: 'exact' | 'fast'

SliceVoxelsOptions: interface SliceVoxelsOptions

  // Layer height in mm
  layerHeight?: number

  // Keep absolute XY coordinates instead of the bbox-relative default
  useAbsoluteXY?: boolean

  // Monotonic 0→1
  onProgress?: (fraction: number) => void

ToCliOptions: interface ToCliOptions

  // Units in mm per CLI unit (1 = mm, upstream default)
  units?: number

  // Emit an intentionally-empty first layer so readers can infer layer height
  emptyFirstLayer?: boolean

  // Header date string
  date?: string

  onProgress?: (fraction: number) => void

ToSvgOptions: interface ToSvgOptions

  // Filled single-path rendering (holes via winding) instead of stroked outlines
  solid?: boolean

  strokeWidth?: number

  // Override the viewBox [minX, minY, width, height]
  viewBox?: readonly [number, number, number, number]
