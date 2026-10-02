# picovoxel — Interfaces

43 top-level symbols. Signatures are verbatim typescript.

AddBeamOptions: interface AddBeamOptions

  start: Vec3

  end: Vec3

  // Uniform radius
  radius: number

  startRadius: number

  endRadius: number

  // Hemispherical end caps (default true, as upstream)
  roundCap: boolean

// An axis-aligned box in millimetres
Bounds: interface Bounds

  min: Vec3

  max: Vec3

// `createPico` options
CreatePicoOptions: interface CreatePicoOptions extends CreatePicoRuntimeOptions, CreatePicoSessionOptions

// Options that shape a runtime
CreatePicoRuntimeOptions: interface CreatePicoRuntimeOptions

  // Emscripten Module overrides forwarded to instantiation
  wasm: PicoWasmOverrides

  // A compiled `WebAssembly.Module` of this entry's wasm (`pico.wasm` for the base entry, `pico-multi.wasm` for `picovoxel/multi`)
  wasmModule: WebAssembly.Module

// Options that shape a session
CreatePicoSessionOptions: interface CreatePicoSessionOptions

  // Voxel edge length in millimetres
  voxelSize: number

  // Native-memory warning threshold in bytes (default 1 GiB)
  memoryWarningBytes: number

  // The session's lane, a policy claim about every value it produces (see docs/lanes.md)
  lane: 'exact' | 'fast' | 'auto'

  // Session-wide default for the offset family's `fastRenorm` (first-order renormalization — 3.5–3.9× on offsets, output bounded and gated, see `offset()`)
  fastRenorm: boolean

  // Routes lattice rendering down the serial C#-identical `Voxels::RenderLattice` loop instead of the parallel tube-complex lane
  // Remarks: Choose `true` for tiny lattices: the tube lane's fixed setup cost (spatial
bucketing, the deterministic split tree) is negligible at 10^5 beams and
dominant at ~14 — the 14-beam HeatX print web takes 2.9 ms serial and
7.3 ms on the tube lane. The catch: the serial arm mis-renders beams whose
end spheres nest (an upstream defect that loses 90.7% of the volume), which
the tube lane renders correctly.
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

  // Raw ABI handle — escape hatch
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

  // Enclosed volume (mm³) and surface area (mm²) from the triangles
  // Remarks: No voxels are involved, so `voxels.toMesh().measure()` cross-checks
`Voxels.properties()`, whose round trip fills sealed cavities and cavities
behind passages about two voxels wide or narrower (see
https://github.com/taucad/picovoxel/blob/main/docs/memory-and-limits.md#known-limits).

The volume assumes a closed mesh and is negative when the triangles face
inwards. Coincident duplicate faces count twice in the area. An empty mesh
measures 0 and 0.
  measure(): {
      volume: number;
      area: number;
    };

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

  // Offset in ALL directions from a not-necessarily-closed mesh
  shellVoxels(options: {
      radius: number;
    }): Voxels;

  // Binary STL bytes with the UNITS= header convention
  // Remarks: Export is keyed by the session's lane claim (see docs/lanes.md). Exact
provenance always exports with the standard header. Non-exact provenance
is stamped into the 80-byte header (`LANE=fast`, read back by
`meshFromStl`) and
- in a `lane: 'fast'` session (explicit, or resolved from `'auto'`)
  exports without asking when every member is `fast`;
- otherwise — a session that declared no lane (`'open'`), or any member
  other than `fast` (`gpu-l1`, `unknown`, …) — refuses with
  `PICO_LANE_EXPORT` unless acknowledged with `{ acceptLane: 'fast' }`.
A `lane: 'exact'` session never holds non-exact geometry. The stamp is a
best-effort audit, not security: third-party tools rewrite STL headers.
  toStl(options?: ToStlOptions): Uint8Array;

  // GLB container (positions + indices)
  toGlb(options?: {
      acceptLane?: 'fast';
    }): Uint8Array;

  // Value provenance, inherited from the producing voxels/mesh chain
  lane: 'exact' | 'fast'

  // Raw ABI handle — escape hatch
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

  // Reserved names (`PicoGK.*`, `PicoVoxel.*`, `class`, `name`, `file_*`) throw
  set(name: string, value: MetadataValue): void;

  // The reserved-name guard applies here too
  remove(name: string): void;

  // Raw ABI handle — escape hatch
  handle: bigint

  // Optional
  dispose(): void;

  [Symbol.dispose](): void;

Pico: interface Pico

  voxelSize: number

  // The RESOLVED session lane (never `'auto'`
  lane: 'exact' | 'fast' | 'open'

  name: string

  version: string

  buildInfo: string

  // Convert voxel-index coordinates to world millimetres
  voxelToMm(voxel: Vec3): Vec3;

  // Convert world millimetres to integer voxel indices (upstream `MmToVoxels` converts the wrong way)
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

  // The voxel-size handshake — the voxel size recorded in .vdb bytes (mm), 0 when the file carries no PicoGK metadata
  vdbVoxelSize(bytes: Uint8Array): number;

  // The first GRID_LEVEL_SET field wins
  voxelsFromVdb(bytes: Uint8Array): Voxels;

  // Binary STL bytes to a mesh (UNITS= header honoured on 'auto')
  meshFromStl(bytes: Uint8Array, options?: FromStlOptions): Mesh;

  // PicoGK-side memory usage in bytes, per object type
  memory: MemoryUsage

  // PicoGK's own per-type allocation counters — the leak oracle
  allocated: AllocatedCounts

  // Escape hatch
  module: PicoWasmModule

  // Escape hatch
  handle: bigint

  // Deterministic teardown
  dispose(): void;

  [Symbol.dispose](): void;

// One instantiated wasm module — plus, on `picovoxel/multi`, its warm pthread pool — that any number of sessions share
PicoRuntime: interface PicoRuntime

  // Opens a session on this runtime
  createPico(options?: CreatePicoSessionOptions): Promise<Pico>;

  // Disposes every open session, then terminates the pthread pool
  dispose(): void;

  [Symbol.dispose](): void;

// The Emscripten Module overrides picovoxel forwards to its glue
PicoWasmOverrides: interface PicoWasmOverrides

  // Returns the URL of the wasm file (a filesystem path also works in Node)
  locateFile: (file: string, scriptDirectory: string) => string

  // The pthread worker script (`picovoxel/multi/worker`), loaded by every worker as a module
  mainScriptUrlOrBlob: string | Blob

  // Instantiates the module yourself
  instantiateWasm: (imports: WebAssembly.Imports, receive: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void) => unknown

  // The wasm file's bytes, compiled in place of fetching the file
  wasmBinary: ArrayBuffer | Uint8Array

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

  // Raw ABI handle — escape hatch
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

  // Stored values are voxel-unit signed distance
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

  // See `offset({ fastRenorm })`
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

  // Acknowledges, for this one export, that the geometry has non-exact provenance
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

  // Raw ABI handle — escape hatch
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

  // Content equality
  equals(other: Voxels): boolean;

  // THE emptiness oracle
  isEmpty: boolean

  // Pure surface offset
  // Remarks: `fastRenorm` (opt-in) runs the renormalization upstream performs after
every half-voxel CFL step with a first-order upwind gradient instead of 5th-order
HJ-WENO — 3.5–3.9x on the offset family, since renormalization is 94–97% of the
offset wall. It CHANGES THE OUTPUT (measured at ≤2.2% volume, ≤0.36 mm peak
narrow-band displacement, level set still clean; the measurements are recorded in
the repository's bench/results/webgpu-v2/sk-0.8-ab.json), so it is never the library default —
a session may default it on (see `CreatePicoOptions.fastRenorm`), and an
explicit per-op value always wins.
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

  // In, 2× out, in again
  smoothen(options: {
      distance: number;
      fastRenorm?: boolean;
    }): Voxels;

  // Over-offset composition
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

  // Volume in mm³ from the raw grid — fast but approximate after booleans (use `properties()`)
  volume: number

  // Volume (mm³), surface area (mm²) and bounds free of boolean residue, from one native traversal of the mesh → fresh-voxels round-trip (src/pico-props.cpp)
  // Remarks: As in C# `CalculateProperties`, the round trip fills a sealed cavity, or one
whose openings are about two voxels wide or narrower, and drops its surface.
Cross-check parts with internal voids with `toMesh().measure()`; see
https://github.com/taucad/picovoxel/blob/main/docs/memory-and-limits.md#known-limits.
  properties(): {
      volume: number;
      area: number;
      bounds: Bounds;
    };

  // The canonical grid hash
  gridHash(): {
      hash: string;
      activeVoxels: number;
      insideTiles: number;
      insideOffVoxels: number;
    };

  // Oracle test tooling
  densifyInterior(): void;

  // Bounding box via the intermediate mesh (the only accurate way)
  bounds(): Bounds;

  // True if the point is at or below the surface
  isInside(position: Vec3): boolean;

  // Surface normal at a point on the surface (use after closest/raycast)
  surfaceNormal(surfacePoint: Vec3): Vec3;

  // Closest surface point, or null when the field is empty
  closestPointOnSurface(position: Vec3): Vec3 | null;

  // Ray-surface intersection, or null on a miss
  raycastToSurface(position: Vec3, direction: Vec3): Vec3 | null;

  // N rays over ONE cached intersector and one ABI crossing
  raycastBatch(options: {
      origins: ArrayLike<number>;
      directions: ArrayLike<number>;
    }): {
      hits: Float32Array;
      hit: Uint8Array;
    };

  // N closest-surface-point queries over one index build (openvdb ClosestSurfacePoint)
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

  // Value provenance
  lane: 'exact' | 'fast'

  // Raw ABI handle — escape hatch
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
