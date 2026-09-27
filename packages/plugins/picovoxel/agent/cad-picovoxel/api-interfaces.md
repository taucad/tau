# picovoxel — Interfaces

47 top-level symbols. Signatures are verbatim typescript.

AddBeamOptions: interface AddBeamOptions

  start: Vec3

  end: Vec3

  // Uniform radius
  radius: number

  startRadius: number

  endRadius: number

  // Hemispherical end caps (SG12 default)
  roundCap: boolean

// An axis-aligned box in millimetres
Bounds: interface Bounds

  min: Vec3

  max: Vec3

CreatePicoOptions: interface CreatePicoOptions

  // Voxel edge length in millimetres
  voxelSize: number

  // Emscripten Module overrides (e.g
  wasm: object

  // Native-memory warning threshold in bytes (default 1 GiB)
  memoryWarningBytes: number

  // SKv2-0 V0.5 (§14.1) — the named lane bundle
  lane: 'exact' | 'fast' | 'auto'

  // Session-wide default for the offset family's `fastRenorm` (SK-0.8 first-order renormalization — 3.5–3.9× on offsets, output bounded and gated, see `offset()`)
  fastRenorm: boolean

  // SKv2-0 V0.6 — routes lattice rendering down the serial C#-identical `Voxels::RenderLattice` loop instead of the parallel tube-complex lane (both deterministic
  serialLattice: boolean

  registry: HandleRegistry

  now: () => number

FromStlOptions: interface FromStlOptions

  // 'auto' honours the UNITS= header, defaulting to mm
  unit: StlUnit

  // Post-scale applied after unit conversion
  scale: number

  // Post-offset in mm, applied last
  offset: Vec3

Lattice: interface Lattice

  addSphere(options: {
      center: Vec3;
      radius: number;
    }): void;

  addBeam(options: AddBeamOptions): void;

  // Renders the lattice into a fresh voxel field
  toVoxels(): Voxels;

  memUsage: number

  // Raw ABI handle — escape hatch (§10)
  handle: bigint

  // Optional
  dispose(): void;

  [Symbol.dispose](): void;

MemoryUsage: interface MemoryUsage

  total: number

  voxels: number

  meshes: number

  lattices: number

  polyLines: number

  scalarFields: number

  vectorFields: number

  vdbFiles: number

  metadata: number

Mesh: interface Mesh

  // Vertex positions, xyz triples in mm
  vertices: Float32Array

  // Triangle corner indices, triples
  triangles: Uint32Array

  vertexCount: number

  triangleCount: number

  // Bounding box
  bounds(): Bounds;

  // Pure transformed copy
  transform(options: TransformOptions): Mesh;

  // Pure mirrored copy across the plane through `point` with `normal`
  mirror(options: {
      point: Vec3;
      normal: Vec3;
    }): Mesh;

  // Pure concatenation — no dedup, no boolean (as upstream Append documents)
  merged(other: Mesh): Mesh;

  // Voxelizes the (closed) mesh
  toVoxels(): Voxels;

  // SG13 — offset in ALL directions from a not-necessarily-closed mesh
  shellVoxels(options: {
      radius: number;
    }): Voxels;

  // SG7 — binary STL bytes with the UNITS= header convention
  toStl(options?: ToStlOptions): Uint8Array;

  // GLB container (positions + indices)
  toGlb(options?: {
      acceptLane?: 'fast';
    }): Uint8Array;

  // §14.1 value-class provenance, inherited from the producing voxels/mesh chain
  lane: 'exact' | 'fast'

  // Raw ABI handle — escape hatch (§10)
  handle: bigint

  // Optional
  dispose(): void;

  [Symbol.dispose](): void;

Metadata: interface Metadata

  // Number of entries in the table
  count: number

  // Every entry name, index order
  names(): string[];

  typeOf(name: string): MetadataType;

  // Typed read
  get(name: string): MetadataValue | undefined;

  // SG3 — reserved names (`PicoGK.*`, `class`, `name`, `file_*`) throw
  set(name: string, value: MetadataValue): void;

  // SG3 guard applies here too
  remove(name: string): void;

  // Raw ABI handle — escape hatch (§10)
  handle: bigint

  // Optional
  dispose(): void;

  [Symbol.dispose](): void;

Pico: interface Pico

  voxelSize: number

  // SKv2-0 V0.5 — the RESOLVED session lane (never `'auto'`
  lane: 'exact' | 'fast' | 'open'

  name: string

  version: string

  buildInfo: string

  // Convert voxel-index coordinates to world millimetres
  voxelToMm(voxel: Vec3): Vec3;

  // Convert world millimetres to integer voxel indices (fixes upstream B2)
  mmToVoxel(mm: Vec3): Vec3;

  createVoxels(options: CreateVoxelsOptions): Voxels;

  // Builds a mesh from vertex/triangle data via the bulk imports (two crossings)
  createMesh(options: {
      vertices: ArrayLike<number>;
      triangles: ArrayLike<number>;
    }): Mesh;

  createLattice(): Lattice;

  createPolyLine(options?: {
      color?: Color;
    }): PolyLine;

  createScalarField(options?: CreateScalarFieldOptions): ScalarField;

  createVectorField(options?: CreateVectorFieldOptions): VectorField;

  // An empty writable .vdb container
  createVdb(): VdbFile;

  // Opens .vdb bytes as a container for field-level access
  openVdb(bytes: Uint8Array): VdbFile;

  // SG5 handshake — the voxel size recorded in .vdb bytes (mm), 0 when the file carries no PicoGK metadata
  vdbVoxelSize(bytes: Uint8Array): number;

  // SG5 — first GRID_LEVEL_SET field wins
  voxelsFromVdb(bytes: Uint8Array): Voxels;

  // SG7 — binary STL bytes to a mesh (UNITS= header honoured on 'auto')
  meshFromStl(bytes: Uint8Array, options?: FromStlOptions): Mesh;

  // PicoGK-side memory usage in bytes, per object type
  memory: MemoryUsage

  // PicoGK's own per-type allocation counters — the leak oracle
  allocated: AllocatedCounts

  // §10 escape hatch
  module: PicoWasmModule

  // §10 escape hatch
  handle: bigint

  // Deterministic teardown
  dispose(): void;

  [Symbol.dispose](): void;

PolyLine: interface PolyLine

  // Appends one vertex
  addVertex(position: Vec3): number;

  // Appends many vertices
  addVertices(positions: readonly Vec3[]): void;

  // All vertices, index order
  vertices: Vec3[]

  vertexCount: number

  // RGBA, each 0..1, as the line was created
  color: readonly [number, number, number, number]

  bounds(): {
      min: Vec3;
      max: Vec3;
    };

  memUsage: number

  // Raw ABI handle — escape hatch (§10)
  handle: bigint

  // Optional
  dispose(): void;

  [Symbol.dispose](): void;

ScalarField: interface ScalarField extends FieldBase

  // Sets (and activates) the value at a position in mm
  set(position: Vec3, value: number): void;

  // Value at the position, or null when the position holds no value
  get(position: Vec3): number | null;

  remove(position: Vec3): void;

  // Visits every active value
  traverse(callback: (x: number, y: number, z: number, value: number) => void): void;

  // Field extent in discrete voxel units
  dimensions(): {
      origin: Vec3;
      size: Vec3;
    };

  // One Z slice of raw field values
  getSlice(options: {
      index: number;
    }): ScalarFieldSlice;

  // Bounding box of active voxels in mm (dims × voxel size, as C# does)
  bounds(): Bounds;

  // SG6 — stored values are voxel-unit signed distance
  signedDistanceAt(position: Vec3): number | null;

  clone(): ScalarField;

ScalarFieldSlice: interface ScalarFieldSlice

  width: number

  height: number

  // Raw field values, row-major
  data: Float32Array

ShellOptions: interface ShellOptions

  offset: number

  inner: number

  outer: number

  smoothInner: number

  // SK-0.8 — see `offset({ fastRenorm })`
  fastRenorm: boolean

SurfaceNormalFieldOptions: interface SurfaceNormalFieldOptions

  // Active values with |sd| above this (voxel units) are skipped (C# `fSurfaceThresholdVx`, default 0.5)
  surfaceThresholdVx: number

  // Keep only normals within the tolerance of this direction (C# `vecDirectionFilter`)
  directionFilter: Vec3

  // Allowed |1 - dot| deviation, 0..1 (C# `fDirectionFilterTolerance`)
  directionFilterTolerance: number

  // Component-wise scale applied to stored normals (C# `vecScaleBy`)
  scaleBy: Vec3

ToStlOptions: interface ToStlOptions

  unit: StlUnit

  // Scale applied while still in mm, after offset
  scale: number

  // Offset in mm, applied first
  offset: Vec3

  // §14.1 — acknowledges exporting `'fast'`-provenance geometry across the L0 boundary
  acceptLane: 'fast'

VdbFile: interface VdbFile

  fieldCount: number

  // Name + type of every field, index order
  fields(): Array<{
      name: string;
      type: VdbFieldType;
    }>;

  // Adds a field under `name`
  add(field: Voxels | ScalarField | VectorField, name?: string): number;

  getVoxels(indexOrName: number | string): Voxels;

  getScalarField(indexOrName: number | string): ScalarField;

  getVectorField(indexOrName: number | string): VectorField;

  // Serialises the container to .vdb bytes
  toBytes(options?: {
      acceptLane?: 'fast';
    }): Uint8Array;

  // Raw ABI handle — escape hatch (§10)
  handle: bigint

  // Optional
  dispose(): void;

  [Symbol.dispose](): void;

VectorField: interface VectorField extends FieldBase

  set(position: Vec3, value: Vec3): void;

  get(position: Vec3): Vec3 | null;

  remove(position: Vec3): void;

  // Visits every active value
  traverse(callback: (x: number, y: number, z: number, vx: number, vy: number, vz: number) => void): void;

  clone(): VectorField;

VoxelSlice: interface VoxelSlice

  width: number

  height: number

  // Row-major samples
  data: Float32Array

  // The native background (outside-narrow-band) value of the raw sdf data
  background: number

Voxels: interface Voxels

  // An independent copy of this field
  clone(): Voxels;

  // Pure union
  union(...others: Voxels[]): Voxels;

  // Pure subtraction of every operand
  subtract(...others: Voxels[]): Voxels;

  // Pure intersection
  intersect(other: Voxels): Voxels;

  // Content equality (SG10-guarded)
  equals(other: Voxels): boolean;

  // SG2 — THE emptiness oracle
  isEmpty: boolean

  // Pure surface offset
  offset(options: {
      distance: number;
      fastRenorm?: boolean;
    }): Voxels;

  // Two offsets in sequence (closing/opening when signs differ)
  doubleOffset(options: {
      first: number;
      second: number;
      fastRenorm?: boolean;
    }): Voxels;

  // SG9 — in, 2× out, in again
  smoothen(options: {
      distance: number;
      fastRenorm?: boolean;
    }): Voxels;

  // SG9 — over-offset composition
  fillet(options: {
      rounding: number;
      finalSurfaceDistance?: number;
      fastRenorm?: boolean;
    }): Voxels;

  // Shell
  shell(options: ShellOptions): Voxels;

  // Everything outside the box is trimmed away (cube-mesh intersect, as C#)
  trim(bounds: Bounds): Voxels;

  // Projects the slice at startZ through endZ (mm)
  projectZSlice(options: {
      startZ: number;
      endZ: number;
    }): Voxels;

  // Pure
  withMesh(mesh: Mesh): Voxels;

  // Pure
  withLattice(lattice: Lattice): Voxels;

  // Pure
  withImplicit(options: {
      sdf: SdfFunction | SdfExpression;
      boundsMin: Vec3;
      boundsMax: Vec3;
    }): Voxels;

  // The gyroid-in-sphere idiom
  maskedByImplicit(options: {
      sdf: SdfFunction | SdfExpression;
    }): Voxels;

  // Volume in mm³ from the raw grid — fast but approximate after booleans (SG1)
  volume: number

  // SG1 — the correct volume (mm³), surface area (mm²) and bounds, from one native traversal of the mesh → fresh-voxels round-trip (src/pico-props.cpp)
  properties(): {
      volume: number;
      area: number;
      bounds: Bounds;
    };

  // SKv2-0 V0.1 — the G0 canonical grid hash (NON-DETERMINISM.md §14.5)
  gridHash(): {
      hash: string;
      activeVoxels: number;
      insideTiles: number;
      insideOffVoxels: number;
    };

  // Oracle test tooling
  densifyInterior(): void;

  // SG1 — bounding box via the intermediate mesh (the only accurate way)
  bounds(): Bounds;

  // True if the point is at or below the surface
  isInside(position: Vec3): boolean;

  // Surface normal at a point on the surface (use after closest/raycast)
  surfaceNormal(surfacePoint: Vec3): Vec3;

  // Closest surface point, or null when the field is empty
  closestPointOnSurface(position: Vec3): Vec3 | null;

  // Ray-surface intersection, or null on a miss
  raycastToSurface(position: Vec3, direction: Vec3): Vec3 | null;

  // SKv2-0 V0.11 (P8) — N rays over ONE cached intersector and one ABI crossing
  raycastBatch(options: {
      origins: ArrayLike<number>;
      directions: ArrayLike<number>;
    }): {
      hits: Float32Array;
      hit: Uint8Array;
    };

  // SKv2-0 V0.11 (P8) — N closest-surface-point queries over one index build (openvdb ClosestSurfacePoint)
  closestPointsOnSurface(options: {
      points: ArrayLike<number>;
    }): {
      points: Float32Array;
      found: Uint8Array;
    };

  // Field extent in discrete voxel units
  dimensions(): {
      origin: Vec3;
      size: Vec3;
    };

  // Number of Z slices
  sliceCount: number

  // Real-world origin of slice `index` in mm
  sliceOrigin(index?: number): Vec3;

  // One slice image
  getSlice(options: GetSliceOptions): VoxelSlice;

  toMesh(): Mesh;

  toScalarField(): ScalarField;

  metadata: Metadata

  memUsage: number

  // §14.1 value-class provenance
  lane: 'exact' | 'fast'

  // Raw ABI handle — escape hatch (§10)
  handle: bigint

  // Optional
  dispose(): void;

  [Symbol.dispose](): void;

// Beam thickness for a given point in space (C# `IBeamThickness`)
BeamThickness: interface BeamThickness

  beamThickness(pt: Vec3): number;

  updateCell(cell: UnitCell): void;

  setBoundingVoxels(voxels: Voxels): void;

// A collection of unit cells (C# `ICellArray`)
CellArray: interface CellArray

  unitCells(): readonly UnitCell[];

// Coordinate transformation ahead of a raw TPMS lookup (C# `ICoordinateTrafo`)
CoordinateTrafo: interface CoordinateTrafo

  apply(pt: Vec3): Vec3;

// Beam-connecting logic for one unit cell (C# `ILatticeType`)
LatticeType: interface LatticeType

  addCell(lattice: Lattice, cell: UnitCell, beamThickness: BeamThickness, subSamples?: number): void;

// Raw TPMS surface equation (C# `IRawTPMSPattern`)
RawTpmsPattern: interface RawTpmsPattern

  signedDistance(x: number, y: number, z: number): number;

// Turns a raw signed distance + wall thickness into the final field (C# `ISplittingLogic`)
SplittingLogic: interface SplittingLogic

  advancedSignedDistance(signedDistance: number, wallThickness: number): number;

// A lattice unit cell (C# `IUnitCell`, preview dropped)
UnitCell: interface UnitCell

  cornerPoints(): readonly Vec3[];

  cellCentre(): Vec3;

  cellBounding(): Bounds;

// A cylindrical coordinate (C# `Cylindrical`)
Cylindrical: interface Cylindrical

  r: number

  phi: Rad

  z: number

// A rigid transform stored as explicit axes (C# `PicoGK.Shapes.Frame3d`)
Frame: interface Frame

  // Origin of the frame in world coordinates (C# `vecPos`)
  pos: Vec3

  // Local X axis in world coordinates (C# `vecLx`)
  lx: Vec3

  // Local Y axis in world coordinates (C# `vecLy`)
  ly: Vec3

  // Local Z axis in world coordinates (C# `vecLz`)
  lz: Vec3

// A polar coordinate (C# `PicoGK.Numerics.Polar`)
Polar: interface Polar

  r: number

  phi: Rad

// A spherical coordinate (C# `Spherical`)
Spherical: interface Spherical

  r: number

  phi: Rad

  theta: Rad

Implicit: interface Implicit

  // C# `IImplicit.fSignedDistance` as a picovoxel SdfFunction
  sdf: SdfFunction

  // The same field as a tape expression for the parallel fill
  expression: SdfExpression

// C# `ILatticeBaseShape`
LatticeBaseShape: interface LatticeBaseShape

  latConstruct(pk: Pico): Lattice;

LatticeManifoldOptions: interface LatticeManifoldOptions

  // Required for the Frame form
  length: number

  radius: number

  // Degrees
  maxOverhangAngle: number

  // Extend the teardrop in -Z as well (C# `bExtendBothSides = false`)
  extendBothSides: boolean

  // C# `fMinPrintableRadius = 0.1`
  minPrintableRadius: number

// C# `IMeshBaseShape`
MeshBaseShape: interface MeshBaseShape

  mshConstruct(pk: Pico): Mesh;

PipeSegmentOptions: interface PipeSegmentOptions

  // Required for the Frame form
  length: number

  innerRadius: number

  outerRadius: number

  // START_END
  startOrMid: LineModulation

  // START_END
  endOrRange: LineModulation

  method: PipeSegmentMethod

// C# `ISpineBaseShape`
SpineBaseShape: interface SpineBaseShape

  spinePoint(ratio1: number): Vec3;

// ShapeKernel `ISpline`
Spline: interface Spline

  points(samples?: number): Vec3[];

// C# `ISurfaceBaseShape`
SurfaceBaseShape: interface SurfaceBaseShape

  surfacePoint(ratio1: number, ratio2: number, ratio3: number): Vec3;

TangentOptions: interface TangentOptions

  startTangentStrength: number

  endTangentStrength: number

  relativeStartStrength: boolean

  relativeEndStrength: boolean

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

SliceVoxelsOptions: interface SliceVoxelsOptions

  // Layer height in mm
  layerHeight: number

  // Keep absolute XY coordinates instead of the bbox-relative default
  useAbsoluteXY: boolean

  // Monotonic 0→1
  onProgress: (fraction: number) => void

ToCliOptions: interface ToCliOptions

  // Units in mm per CLI unit (1 = mm, upstream default)
  units: number

  // Emit an intentionally-empty first layer so readers can infer layer height
  emptyFirstLayer: boolean

  // Header date string
  date: string

  onProgress: (fraction: number) => void

ToSvgOptions: interface ToSvgOptions

  // Filled single-path rendering (holes via winding) instead of stroked outlines
  solid: boolean

  strokeWidth: number

  // Override the viewBox [minX, minY, width, height]
  viewBox: readonly [number, number, number, number]
