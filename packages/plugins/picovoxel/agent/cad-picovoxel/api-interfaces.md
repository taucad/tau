# picovoxel — Interfaces

33 top-level symbols. Signatures are verbatim typescript.

AddBeamOptions: interface AddBeamOptions

  start: Vec3

  end: Vec3

  // Uniform radius
  radius?: number

  startRadius?: number

  endRadius?: number

  // Hemispherical end caps (default true, as upstream)
  roundCap?: boolean

// An axis-aligned box in millimetres
Bounds: interface Bounds

  min: Vec3

  max: Vec3

// The opt-in for an operation that uses up its receiver
ConsumeOptions: interface ConsumeOptions

  consume?: boolean

// `createPico` options
CreatePicoOptions: interface CreatePicoOptions extends CreatePicoRuntimeOptions, CreatePicoSessionOptions

// Options that shape a runtime
CreatePicoRuntimeOptions: interface CreatePicoRuntimeOptions

  // Emscripten Module overrides forwarded to instantiation
  wasm?: PicoWasmOverrides

  // A compiled `WebAssembly.Module` of this entry's wasm (`pico.wasm` for the base entry, `pico-multi.wasm` for `picovoxel/multi`)
  wasmModule?: WebAssembly.Module

  // The grid pager, on by default
  pager?: PagerOptions | false

// Options that shape a session
CreatePicoSessionOptions: interface CreatePicoSessionOptions

  // Voxel edge length in millimetres
  voxelSize?: number

  // Native-memory warning threshold in bytes (default 1 GiB)
  memoryWarningBytes?: number

  // The session's lane, a policy claim about every value it produces (see docs/lanes.md)
  lane?: 'exact' | 'fast' | 'auto'

  // Session-wide default for the offset family's `fastRenorm` (first-order renormalization — 3.5–3.9× on offsets, output bounded and gated, see `offset()`)
  fastRenorm?: boolean

  // Routes lattice rendering down the serial C#-identical `Voxels::RenderLattice` loop instead of the parallel tube-complex lane
  // Remarks: Choose `true` for tiny lattices: the tube lane's fixed setup cost (spatial bucketing, the deterministic split tree) is negligible at 10^5 beams and dominant at ~14 — the 14-beam HeatX print web takes 2.9 ms serial and 7.3 ms on the tube lane. The catch: the serial arm mis-renders beams whose end spheres nest (an upstream defect that loses 90.7% of the volume), which the tube lane renders correctly.
  serialLattice?: boolean

  registry?: HandleRegistry

  now?: () => number

// Runtime-wide memory
Footprint: interface Footprint

  // Bytes of wasm linear memory (the heap's current size, at most 4 GiB)
  heapBytes: number

  // Bytes the far store holds on its host, RAM or disk
  farBytes: number

  // The pager's figures
  pager: PagerStats | null

FromStlOptions: interface FromStlOptions

  // 'auto' honours the UNITS= header, defaulting to mm
  unit?: StlUnit

  // Post-scale applied after unit conversion
  scale?: number

  // Post-offset in mm, applied last
  offset?: Vec3

Lattice: interface Lattice

  // Lattice.addSphere (method)
  addSphere(options: {
      center: Vec3;
      radius: number;
    }): void;

  // Lattice.addBeam (method)
  addBeam(options: AddBeamOptions): void;

  // Renders the lattice into a fresh voxel field
  // Lattice.toVoxels (method)
  toVoxels(): Voxels;

  readonly memUsage: number

  // Raw ABI handle — escape hatch
  readonly handle: bigint

  // Optional
  // Lattice.dispose (method)
  dispose(): void;

  // Lattice.[Symbol.dispose] (method)
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
  readonly vertices: Float32Array

  // Triangle corner indices, triples
  readonly triangles: Uint32Array

  readonly vertexCount: number

  readonly triangleCount: number

  // Bounding box
  // Mesh.bounds (method)
  bounds(): Bounds;

  // Enclosed volume (mm³) and surface area (mm²) from the triangles
  // Remarks: No voxels are involved, so `voxels.toMesh().measure()` cross-checks `Voxels.properties()`, whose round trip fills sealed cavities and cavities behind passages about two voxels wide or narrower (see https://github.com/taucad/picovoxel/blob/main/docs/memory-and-limits.md#known-limits). The volume assumes a closed mesh and is negative when the triangles face inwards. Coincident duplicate faces count twice in the area. An empty mesh measures 0 and 0.
  // Mesh.measure (method)
  measure(): {
      volume: number;
      area: number;
    };

  // Pure transformed copy
  // Mesh.transform (method)
  transform(options: TransformOptions): Mesh;

  // Pure mirrored copy across the plane through `point` with `normal`
  // Mesh.mirror (method)
  mirror(options: {
      point: Vec3;
      normal: Vec3;
    }): Mesh;

  // Pure concatenation — no dedup, no boolean (as upstream Append documents)
  // Mesh.merged (method)
  merged(other: Mesh): Mesh;

  // Voxelizes the (closed) mesh
  // Mesh.toVoxels (method)
  toVoxels(): Voxels;

  // Offset in ALL directions from a not-necessarily-closed mesh
  // Mesh.shellVoxels (method)
  shellVoxels(options: {
      radius: number;
    }): Voxels;

  // Binary STL bytes with the UNITS= header convention
  // Remarks: Export is keyed by the session's lane claim (see docs/lanes.md). Exact provenance always exports with the standard header. Non-exact provenance is stamped into the 80-byte header (`LANE=fast`, read back by `meshFromStl`) and - in a `lane: 'fast'` session (explicit, or resolved from `'auto'`) exports without asking when every member is `fast`; - otherwise — a session that declared no lane (`'open'`), or any member other than `fast` (`gpu-l1`, `unknown`, …) — refuses with `PICO_LANE_EXPORT` unless acknowledged with `{ acceptLane: 'fast' }`. A `lane: 'exact'` session never holds non-exact geometry. The stamp is a best-effort audit, not security: third-party tools rewrite STL headers.
  // Mesh.toStl (method)
  toStl(options?: ToStlOptions): Uint8Array;

  // Streams the binary STL of this mesh to `write` in chunks instead of returning one buffer
  // Remarks: By default `write` receives the 50-byte triangle records only, and the result carries the 84-byte header for the caller to place first (for example `new Blob([result.header, ...chunks])`). With `includeHeader: true` the header is the first chunk, so the chunks are the whole file in order. Lane rules are those of `toStl()`.
  // Mesh.streamStl (method)
  streamStl(write: StlChunkSink, options?: StreamStlOptions): StreamStlResult;

  // GLB container (positions + indices)
  // Mesh.toGlb (method)
  toGlb(options?: {
      acceptLane?: 'fast';
    }): Uint8Array;

  // Value provenance, inherited from the producing voxels/mesh chain
  readonly lane: 'exact' | 'fast'

  // Raw ABI handle — escape hatch
  readonly handle: bigint

  // Frees the mesh now
  // Mesh.dispose (method)
  dispose(): void;

  // Mesh.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

// One batch of the uniform mesh
MeshChunk: interface MeshChunk

  // The batch's new vertices, xyz triples in mm
  vertices: Float32Array

  // The batch's triangles as corner triples indexing the WHOLE mesh's vertices
  triangles: Uint32Array

Metadata: interface Metadata

  // Number of entries in the table
  readonly count: number

  // Every entry name, index order
  // Metadata.names (method)
  names(): string[];

  // Metadata.typeOf (method)
  typeOf(name: string): MetadataType;

  // Typed read
  // Metadata.get (method)
  get(name: string): MetadataValue | undefined;

  // Reserved names (`PicoGK.*`, `PicoVoxel.*`, `class`, `name`, `file_*`) throw
  // Metadata.set (method)
  set(name: string, value: MetadataValue): void;

  // The reserved-name guard applies here too
  // Metadata.remove (method)
  remove(name: string): void;

  // Raw ABI handle — escape hatch
  readonly handle: bigint

  // Optional
  // Metadata.dispose (method)
  dispose(): void;

  // Metadata.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

// Options for {@link Voxels.offset} and {@link Voxels.smoothen}
OffsetOptions: interface OffsetOptions extends ConsumeOptions

  // Millimetres
  distance: number

  // See {@link Voxels.offset}
  fastRenorm?: boolean

  // Opt-in sweep engine, `fast` (docs/lanes.md)
  fastSweeping?: boolean

// `createPico({ pager })`
PagerOptions: interface PagerOptions

  // Resident grid bytes (Σ `memUsage` of live Voxels) allowed at a safe point
  budgetBytes?: number

  // Frame codec (default `'lz4'`)
  codec?: PagerCodec

  // `'pipelined'` (default on picovoxel/multi) overlaps coding on the pool with storing and freeing
  mode?: PagerMode

  // The encode arena, taken once when the runtime starts — heap the model cannot use
  arena?: {
      slots?: number;
      reserveMiB?: number;
    }

  // Where parked grids go
  store?: 'ram' | 'disk'

  // Size bound of the store in bytes (default unbounded for `'ram'`, 16 GiB for `'disk'`)
  storeMaxBytes?: number

  // `'disk'` only
  directory?: string

  minParkBytes?: number

// What the pager has done, for memory reports
PagerStats: interface PagerStats

  readonly budgetBytes: number

  readonly codec: PagerCodec

  readonly mode: PagerMode

  readonly store: 'ram' | 'disk'

  // Σ `memUsage` of resident grids
  readonly residentBytes: number

  readonly parkedGrids: number

  // Σ `memUsage` the parked grids had when parked
  readonly parkedBytes: number

  // Bytes of park images in the far store
  readonly imageBytes: number

  // Bytes the far store holds on its host (RAM or disk)
  readonly farBytes: number

  // Heap the encode arena holds
  readonly arenaBytes: number

  readonly parks: number

  readonly restores: number

Pico: interface Pico

  readonly voxelSize: number

  // The RESOLVED session lane (never `'auto'`
  readonly lane: 'exact' | 'fast' | 'open'

  readonly name: string

  readonly version: string

  readonly buildInfo: string

  // Convert voxel-index coordinates to world millimetres
  // Pico.voxelToMm (method)
  voxelToMm(voxel: Vec3): Vec3;

  // Convert world millimetres to integer voxel indices (upstream `MmToVoxels` converts the wrong way)
  // Pico.mmToVoxel (method)
  mmToVoxel(mm: Vec3): Vec3;

  // Pico.createVoxels (method)
  createVoxels(options: CreateVoxelsOptions): Voxels;

  // Builds a mesh from vertex/triangle data via the bulk imports (two crossings)
  // Pico.createMesh (method)
  createMesh(options: {
      vertices: ArrayLike<number>;
      triangles: ArrayLike<number>;
    }): Mesh;

  // Pico.createLattice (method)
  createLattice(): Lattice;

  // Pico.createPolyLine (method)
  createPolyLine(options?: {
      color?: Color;
    }): PolyLine;

  // Pico.createScalarField (method)
  createScalarField(options?: CreateScalarFieldOptions): ScalarField;

  // Pico.createVectorField (method)
  createVectorField(options?: CreateVectorFieldOptions): VectorField;

  // An empty writable .vdb container
  // Pico.createVdb (method)
  createVdb(): VdbFile;

  // Opens .vdb bytes as a container for field-level access
  // Pico.openVdb (method)
  openVdb(bytes: Uint8Array): VdbFile;

  // The voxel-size handshake — the voxel size recorded in .vdb bytes (mm), 0 when the file carries no PicoGK metadata
  // Pico.vdbVoxelSize (method)
  vdbVoxelSize(bytes: Uint8Array): number;

  // The first GRID_LEVEL_SET field wins
  // Pico.voxelsFromVdb (method)
  voxelsFromVdb(bytes: Uint8Array): Voxels;

  // Binary STL bytes to a mesh (UNITS= header honoured on 'auto')
  // Pico.meshFromStl (method)
  meshFromStl(bytes: Uint8Array, options?: FromStlOptions): Mesh;

  // PicoGK-side memory usage in bytes, per object type
  readonly memory: MemoryUsage

  // PicoGK's own per-type allocation counters — the leak oracle
  readonly allocated: AllocatedCounts

  // Runtime-wide heap and far-store bytes (see {@link Footprint})
  readonly footprint: Footprint

  // Escape hatch
  readonly module: PicoWasmModule

  // Escape hatch
  readonly handle: bigint

  // Runs `build` and disposes every object it created except what it returns
  // Remarks: To free an intermediate before the scope ends, dispose it, or pass `{ consume: true }` to the operation that uses it last.
  // Pico.scope (method)
  scope<T>(build: () => T): T;

  // Deterministic teardown
  // Pico.dispose (method)
  dispose(): void;

  // Pico.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

// One instantiated wasm module — plus, on `picovoxel/multi`, its warm pthread pool — that any number of sessions share
PicoRuntime: interface PicoRuntime

  // Opens a session on this runtime
  // PicoRuntime.createPico (method)
  createPico(options?: CreatePicoSessionOptions): Promise<Pico>;

  // Disposes every open session, then terminates the pthread pool
  // PicoRuntime.dispose (method)
  dispose(): void;

  // PicoRuntime.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

// The Emscripten Module overrides picovoxel forwards to its glue
PicoWasmOverrides: interface PicoWasmOverrides

  // Returns the URL of the wasm file (a filesystem path also works in Node)
  locateFile?: (file: string, scriptDirectory: string) => string

  // The pthread worker script (`picovoxel/multi/worker`), loaded by every worker as a module
  mainScriptUrlOrBlob?: string | Blob

  // Instantiates the module yourself
  instantiateWasm?: (imports: WebAssembly.Imports, receive: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void) => unknown

  // The wasm file's bytes, compiled in place of fetching the file
  wasmBinary?: ArrayBuffer | Uint8Array

PolyLine: interface PolyLine

  // Appends one vertex
  // PolyLine.addVertex (method)
  addVertex(position: Vec3): number;

  // Appends many vertices
  // PolyLine.addVertices (method)
  addVertices(positions: readonly Vec3[]): void;

  // All vertices, index order
  readonly vertices: Vec3[]

  readonly vertexCount: number

  // RGBA, each 0..1, as the line was created
  readonly color: readonly [number, number, number, number]

  // PolyLine.bounds (method)
  bounds(): {
      min: Vec3;
      max: Vec3;
    };

  readonly memUsage: number

  // Raw ABI handle — escape hatch
  readonly handle: bigint

  // Optional
  // PolyLine.dispose (method)
  dispose(): void;

  // PolyLine.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ScalarField: interface ScalarField extends FieldBase

  // Sets (and activates) the value at a position in mm
  // ScalarField.set (method)
  set(position: Vec3, value: number): void;

  // Value at the position, or null when the position holds no value
  // ScalarField.get (method)
  get(position: Vec3): number | null;

  // ScalarField.remove (method)
  remove(position: Vec3): void;

  // Visits every active value
  // ScalarField.traverse (method)
  traverse(callback: (x: number, y: number, z: number, value: number) => void): void;

  // Field extent in discrete voxel units
  // ScalarField.dimensions (method)
  dimensions(): {
      origin: Vec3;
      size: Vec3;
    };

  // One Z slice of raw field values
  // ScalarField.getSlice (method)
  getSlice(options: {
      index: number;
    }): ScalarFieldSlice;

  // Bounding box of active voxels in mm (dims × voxel size, as C# does)
  // ScalarField.bounds (method)
  bounds(): Bounds;

  // Stored values are voxel-unit signed distance
  // ScalarField.signedDistanceAt (method)
  signedDistanceAt(position: Vec3): number | null;

  // ScalarField.clone (method)
  clone(): ScalarField;

ScalarFieldSlice: interface ScalarFieldSlice

  width: number

  height: number

  // Raw field values, row-major
  data: Float32Array

ShellOptions: interface ShellOptions extends ConsumeOptions

  offset?: number

  inner?: number

  outer?: number

  smoothInner?: number

  // See `offset({ fastRenorm })`
  fastRenorm?: boolean

  // See `offset({ fastSweeping })`
  fastSweeping?: boolean

// Options for {@link Voxels.streamMesh}
StreamMeshOptions: interface StreamMeshOptions

  // The most surface leaves (8³ voxels each) one batch owns
  batchLeaves?: number

// What {@link Voxels.streamMesh} returns once every chunk has been delivered
StreamMeshResult: interface StreamMeshResult

  vertexCount: number

  triangleCount: number

// Options for `Mesh.streamStl` and `Voxels.streamStl`
StreamStlOptions: interface StreamStlOptions

  // Hand the 84-byte header to the sink as the first chunk, so the chunks are the whole file in order (an append-only sink, such as a `WritableStream`, needs this)
  includeHeader?: boolean

  // The most triangle records in one chunk (50 bytes each)
  chunkTriangles?: number

  // As `ToStlOptions.acceptLane`
  acceptLane?: 'fast'

// What a streamed STL export returns once every chunk has been written
StreamStlResult: interface StreamStlResult

  // The finished 84-byte header (`PicoGK UNITS=mm`, the lane stamp for non-exact provenance, the triangle count)
  header: Uint8Array<ArrayBuffer>

  // Triangles written
  triangleCount: number

SurfaceNormalFieldOptions: interface SurfaceNormalFieldOptions

  // Active values with |sd| above this (voxel units) are skipped (C# `fSurfaceThresholdVx`, default 0.5)
  surfaceThresholdVx?: number

  // Keep only normals within the tolerance of this direction (C# `vecDirectionFilter`)
  directionFilter?: Vec3

  // Allowed |1 - dot| deviation, 0..1 (C# `fDirectionFilterTolerance`)
  directionFilterTolerance?: number

  // Component-wise scale applied to stored normals (C# `vecScaleBy`)
  scaleBy?: Vec3

// Options for {@link Voxels.toMesh}
ToMeshOptions: interface ToMeshOptions

  // OpenVDB mesh adaptivity in `[0, 1)`
  adaptivity?: number

  // Run OpenVDB's `relaxDisorientedTriangles` pass after adaptive merging
  relax?: boolean

ToStlOptions: interface ToStlOptions

  unit?: StlUnit

  // Scale applied while still in mm, after offset
  scale?: number

  // Offset in mm, applied first
  offset?: Vec3

  // Acknowledges, for this one export, that the geometry has non-exact provenance
  acceptLane?: 'fast'

VdbFile: interface VdbFile

  readonly fieldCount: number

  // Name + type of every field, index order
  // VdbFile.fields (method)
  fields(): Array<{
      name: string;
      type: VdbFieldType;
    }>;

  // Adds a field under `name`
  // VdbFile.add (method)
  add(field: Voxels | ScalarField | VectorField, name?: string): number;

  // VdbFile.getVoxels (method)
  getVoxels(indexOrName: number | string): Voxels;

  // VdbFile.getScalarField (method)
  getScalarField(indexOrName: number | string): ScalarField;

  // VdbFile.getVectorField (method)
  getVectorField(indexOrName: number | string): VectorField;

  // Serialises the container to .vdb bytes
  // VdbFile.toBytes (method)
  toBytes(options?: {
      acceptLane?: 'fast';
    }): Uint8Array;

  // Raw ABI handle — escape hatch
  readonly handle: bigint

  // Optional
  // VdbFile.dispose (method)
  dispose(): void;

  // VdbFile.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

VectorField: interface VectorField extends FieldBase

  // VectorField.set (method)
  set(position: Vec3, value: Vec3): void;

  // VectorField.get (method)
  get(position: Vec3): Vec3 | null;

  // VectorField.remove (method)
  remove(position: Vec3): void;

  // Visits every active value
  // VectorField.traverse (method)
  traverse(callback: (x: number, y: number, z: number, vx: number, vy: number, vz: number) => void): void;

  // VectorField.clone (method)
  clone(): VectorField;

VoxelSlice: interface VoxelSlice

  width: number

  height: number

  // Row-major samples
  data: Float32Array

  // The native background (outside-narrow-band) value of the raw sdf data
  background: number
