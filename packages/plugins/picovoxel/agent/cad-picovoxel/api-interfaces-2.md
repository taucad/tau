# picovoxel — Interfaces (2)

30 top-level symbols. Signatures are verbatim typescript.

Voxels: interface Voxels

  // An independent copy of this field
  // Voxels.clone (method)
  clone(): Voxels;

  // Pure union
  // Voxels.union (method)
  union(...others: Voxels[]): Voxels;
  union(...operands: [...others: Voxels[], options: ConsumeOptions]): Voxels;

  // Pure subtraction of every operand
  // Voxels.subtract (method)
  subtract(...others: Voxels[]): Voxels;
  subtract(...operands: [...others: Voxels[], options: ConsumeOptions]): Voxels;

  // Pure intersection
  // Voxels.intersect (method)
  intersect(other: Voxels, options?: ConsumeOptions): Voxels;

  // Content equality
  // Voxels.equals (method)
  equals(other: Voxels): boolean;

  // THE emptiness oracle
  readonly isEmpty: boolean

  // Pure surface offset
  // Remarks: `fastRenorm` (opt-in) runs the renormalization upstream performs after every half-voxel CFL step with a first-order upwind gradient instead of 5th-order HJ-WENO — 3.5–3.9x on the offset family, since renormalization is 94–97% of the offset wall. It CHANGES THE OUTPUT (measured at ≤2.2% volume, ≤0.36 mm peak narrow-band displacement, level set still clean; the measurements are recorded in the repository's bench/results/webgpu-v2/sk-0.8-ab.json), so it is never the library default — a session may default it on (see `CreatePicoOptions.fastRenorm`), and an explicit per-op value always wins. `fastSweeping`: opt-in sweep engine, `fast` (docs/lanes.md).
  // Voxels.offset (method)
  offset(options: OffsetOptions): Voxels;

  // Two offsets in sequence (closing/opening when signs differ)
  // Voxels.doubleOffset (method)
  doubleOffset(options: {
      first: number;
      second: number;
      fastRenorm?: boolean;
      fastSweeping?: boolean;
    } & ConsumeOptions): Voxels;

  // In, 2× out, in again
  // Voxels.smoothen (method)
  smoothen(options: OffsetOptions): Voxels;

  // Over-offset composition
  // Voxels.fillet (method)
  fillet(options: {
      rounding: number;
      finalSurfaceDistance?: number;
      fastRenorm?: boolean;
      fastSweeping?: boolean;
    } & ConsumeOptions): Voxels;

  // Shell
  // Voxels.shell (method)
  shell(options: ShellOptions): Voxels;

  // Everything outside the box is trimmed away (cube-mesh intersect, as C#)
  // Voxels.trim (method)
  trim(bounds: Bounds): Voxels;

  // Projects the slice at startZ through endZ (mm)
  // Voxels.projectZSlice (method)
  projectZSlice(options: {
      startZ: number;
      endZ: number;
    }): Voxels;

  // Pure
  // Voxels.withMesh (method)
  withMesh(mesh: Mesh): Voxels;

  // Pure
  // Voxels.withLattice (method)
  withLattice(lattice: Lattice): Voxels;

  // Pure
  // Voxels.withImplicit (method)
  withImplicit(options: {
      sdf: SdfFunction | SdfExpression;
      boundsMin: Vec3;
      boundsMax: Vec3;
    }): Voxels;

  // The gyroid-in-sphere idiom
  // Voxels.maskedByImplicit (method)
  maskedByImplicit(options: {
      sdf: SdfFunction | SdfExpression;
    }): Voxels;

  // Volume in mm³ from the raw grid — fast but approximate after booleans (use `properties()`)
  readonly volume: number

  // Volume (mm³), surface area (mm²) and bounds free of boolean residue, from one native traversal of the mesh → fresh-voxels round-trip (src/pico-props.cpp)
  // Remarks: As in C# `CalculateProperties`, the round trip fills a sealed cavity, or one whose openings are about two voxels wide or narrower, and drops its surface. Cross-check parts with internal voids with `toMesh().measure()`; see https://github.com/taucad/picovoxel/blob/main/docs/memory-and-limits.md#known-limits.
  // Voxels.properties (method)
  properties(): {
      volume: number;
      area: number;
      bounds: Bounds;
    };

  // The canonical grid hash
  // Voxels.gridHash (method)
  gridHash(): {
      hash: string;
      activeVoxels: number;
      insideTiles: number;
      insideOffVoxels: number;
    };

  // Oracle test tooling
  // Voxels.densifyInterior (method)
  densifyInterior(): void;

  // Bounding box via the intermediate mesh (the only accurate way)
  // Voxels.bounds (method)
  bounds(): Bounds;

  // True if the point is at or below the surface
  // Voxels.isInside (method)
  isInside(position: Vec3): boolean;

  // Surface normal at a point on the surface (use after closest/raycast)
  // Voxels.surfaceNormal (method)
  surfaceNormal(surfacePoint: Vec3): Vec3;

  // Closest surface point, or null when the field is empty
  // Voxels.closestPointOnSurface (method)
  closestPointOnSurface(position: Vec3): Vec3 | null;

  // Ray-surface intersection, or null on a miss
  // Voxels.raycastToSurface (method)
  raycastToSurface(position: Vec3, direction: Vec3): Vec3 | null;

  // N rays over ONE cached intersector and one ABI crossing
  // Remarks: `subVoxel: true` (opt-in) keeps each hit's fractional position instead of truncating it to a whole voxel, which can put an upstream hit up to one voxel inside the surface on each positive axis. Hit and miss are the same rays either way; only the hit positions move onto the surface.
  // Voxels.raycastBatch (method)
  raycastBatch(options: {
      origins: ArrayLike<number>;
      directions: ArrayLike<number>;
      subVoxel?: boolean;
    }): {
      hits: Float32Array;
      hit: Uint8Array;
    };

  // N closest-surface-point queries over one index build (openvdb ClosestSurfacePoint)
  // Voxels.closestPointsOnSurface (method)
  closestPointsOnSurface(options: {
      points: ArrayLike<number>;
    }): {
      points: Float32Array;
      found: Uint8Array;
    };

  // Field extent in discrete voxel units
  // Voxels.dimensions (method)
  dimensions(): {
      origin: Vec3;
      size: Vec3;
    };

  // Number of Z slices
  readonly sliceCount: number

  // Real-world origin of slice `index` in mm
  // Voxels.sliceOrigin (method)
  sliceOrigin(index?: number): Vec3;

  // One slice image
  // Voxels.getSlice (method)
  getSlice(options: GetSliceOptions): VoxelSlice;

  // Triangle mesh of the zero level set
  // Voxels.toMesh (method)
  toMesh(options?: ToMeshOptions): Mesh;

  // Streams the binary STL of the uniform mesh — the bytes `toMesh().toStl()` returns — to `write` in chunks, with no `Mesh` and no whole-file buffer
  // Remarks: Chunks are views into wasm memory, valid only during the call; see {@link StlChunkSink}. Millimetres only (use `toMesh().toStl({ unit })` for other units). The header, `includeHeader` and lane rules are those of `Mesh.streamStl`; with `includeHeader: true` a counting pass of the mesher runs first, since the triangle count leads the file.
  // Voxels.streamStl (method)
  streamStl(write: StlChunkSink, options?: VoxelsStreamStlOptions): StreamStlResult;

  // Streams the uniform mesh as indexed batches
  // Voxels.streamMesh (method)
  streamMesh(onChunk: (chunk: MeshChunk) => void, options?: StreamMeshOptions): StreamMeshResult;

  // Voxels.toScalarField (method)
  toScalarField(): ScalarField;

  readonly metadata: Metadata

  readonly memUsage: number

  // Value provenance
  readonly lane: 'exact' | 'fast'

  // Raw ABI handle — escape hatch
  readonly handle: bigint

  // Frees the grid now
  // Voxels.dispose (method)
  dispose(): void;

  // Voxels.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

// Options for {@link Voxels.streamStl}
VoxelsStreamStlOptions: interface VoxelsStreamStlOptions extends StreamStlOptions, StreamMeshOptions

// Beam thickness for a given point in space (C# `IBeamThickness`)
BeamThickness: interface BeamThickness

  // BeamThickness.beamThickness (method)
  beamThickness(pt: Vec3): number;

  // BeamThickness.updateCell (method)
  updateCell(cell: UnitCell): void;

  // BeamThickness.setBoundingVoxels (method)
  setBoundingVoxels(voxels: Voxels): void;

// A collection of unit cells (C# `ICellArray`)
CellArray: interface CellArray

  // CellArray.unitCells (method)
  unitCells(): readonly UnitCell[];

// Coordinate transformation ahead of a raw TPMS lookup (C# `ICoordinateTrafo`)
CoordinateTrafo: interface CoordinateTrafo

  // CoordinateTrafo.apply (method)
  apply(pt: Vec3): Vec3;

// Beam-connecting logic for one unit cell (C# `ILatticeType`)
LatticeType: interface LatticeType

  // LatticeType.addCell (method)
  addCell(lattice: Lattice, cell: UnitCell, beamThickness: BeamThickness, subSamples?: number): void;

// Raw TPMS surface equation (C# `IRawTPMSPattern`)
RawTpmsPattern: interface RawTpmsPattern

  // RawTpmsPattern.signedDistance (method)
  signedDistance(x: number, y: number, z: number): number;

// Turns a raw signed distance + wall thickness into the final field (C# `ISplittingLogic`)
SplittingLogic: interface SplittingLogic

  // SplittingLogic.advancedSignedDistance (method)
  advancedSignedDistance(signedDistance: number, wallThickness: number): number;

// A lattice unit cell (C# `IUnitCell`, preview dropped)
UnitCell: interface UnitCell

  // UnitCell.cornerPoints (method)
  cornerPoints(): readonly Vec3[];

  // UnitCell.cellCentre (method)
  cellCentre(): Vec3;

  // UnitCell.cellBounding (method)
  cellBounding(): Bounds;

// A cylindrical coordinate (C# `Cylindrical`)
Cylindrical: interface Cylindrical

  readonly r: number

  readonly phi: Rad

  readonly z: number

// A rigid transform stored as explicit axes (C# `PicoGK.Shapes.Frame3d`)
Frame: interface Frame

  // Origin of the frame in world coordinates (C# `vecPos`)
  readonly pos: Vec3

  // Local X axis in world coordinates (C# `vecLx`)
  readonly lx: Vec3

  // Local Y axis in world coordinates (C# `vecLy`)
  readonly ly: Vec3

  // Local Z axis in world coordinates (C# `vecLz`)
  readonly lz: Vec3

// A polar coordinate (C# `PicoGK.Numerics.Polar`)
Polar: interface Polar

  readonly r: number

  readonly phi: Rad

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
