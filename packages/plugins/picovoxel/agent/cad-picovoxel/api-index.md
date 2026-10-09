# picovoxel API index

picovoxel 0.1.0-beta.0 · 964 symbols · extracted by TypeScript 5.9.3.

Every symbol appears here exactly once. The heading above each block names the file with its signature; grep the skill directory for `name(` to land on the declaration directly.

## Interfaces — `api-interfaces.md`

AddBeamOptions (interface) [6 members]
  AddBeamOptions.start (property)
  AddBeamOptions.end (property)
  AddBeamOptions.radius (property) — Uniform radius
  AddBeamOptions.startRadius (property)
  AddBeamOptions.endRadius (property)
  AddBeamOptions.roundCap (property) — Hemispherical end caps (default true, as upstream)
Bounds (interface) [2 members] — An axis-aligned box in millimetres
  Bounds.min (property)
  Bounds.max (property)
CreatePicoOptions (interface) — `createPico` options
CreatePicoRuntimeOptions (interface) [2 members] — Options that shape a runtime
  CreatePicoRuntimeOptions.wasm (property) — Emscripten Module overrides forwarded to instantiation
  CreatePicoRuntimeOptions.wasmModule (property) — A compiled `WebAssembly.Module` of this entry's wasm (`pico.wasm` for the…
CreatePicoSessionOptions (interface) [7 members] — Options that shape a session
  CreatePicoSessionOptions.voxelSize (property) — Voxel edge length in millimetres
  CreatePicoSessionOptions.memoryWarningBytes (property) — Native-memory warning threshold in bytes (default 1 GiB)
  CreatePicoSessionOptions.lane (property) — The session's lane, a policy claim about every value it…
  CreatePicoSessionOptions.fastRenorm (property) — Session-wide default for the offset family's `fastRenorm` (first-order renormalization —…
  CreatePicoSessionOptions.serialLattice (property) — Routes lattice rendering down the serial C#-identical `Voxels::RenderLattice` loop instead…
  CreatePicoSessionOptions.registry (property)
  CreatePicoSessionOptions.now (property)
FromStlOptions (interface) [3 members]
  FromStlOptions.unit (property) — 'auto' honours the UNITS= header, defaulting to mm
  FromStlOptions.scale (property) — Post-scale applied after unit conversion
  FromStlOptions.offset (property) — Post-offset in mm, applied last
Lattice (interface) [7 members]
  Lattice.addSphere (method)
  Lattice.addBeam (method)
  Lattice.toVoxels (method) — Renders the lattice into a fresh voxel field
  Lattice.memUsage (property)
  Lattice.handle (property) — Raw ABI handle — escape hatch
  Lattice.dispose (method) — Optional
  Lattice.[Symbol.dispose] (method)
MemoryUsage (interface) [9 members]
  MemoryUsage.total (property)
  MemoryUsage.voxels (property)
  MemoryUsage.meshes (property)
  MemoryUsage.lattices (property)
  MemoryUsage.polyLines (property)
  MemoryUsage.scalarFields (property)
  MemoryUsage.vectorFields (property)
  MemoryUsage.vdbFiles (property)
  MemoryUsage.metadata (property)
Mesh (interface) [17 members]
  Mesh.vertices (property) — Vertex positions, xyz triples in mm
  Mesh.triangles (property) — Triangle corner indices, triples
  Mesh.vertexCount (property)
  Mesh.triangleCount (property)
  Mesh.bounds (method) — Bounding box
  Mesh.measure (method) — Enclosed volume (mm³) and surface area (mm²) from the triangles
  Mesh.transform (method) — Pure transformed copy
  Mesh.mirror (method) — Pure mirrored copy across the plane through `point` with `normal`
  Mesh.merged (method) — Pure concatenation — no dedup, no boolean (as upstream Append…
  Mesh.toVoxels (method) — Voxelizes the (closed) mesh
  Mesh.shellVoxels (method) — Offset in ALL directions from a not-necessarily-closed mesh
  Mesh.toStl (method) — Binary STL bytes with the UNITS= header convention
  Mesh.toGlb (method) — GLB container (positions + indices)
  Mesh.lane (property) — Value provenance, inherited from the producing voxels/mesh chain
  Mesh.handle (property) — Raw ABI handle — escape hatch
  Mesh.dispose (method) — Optional
  Mesh.[Symbol.dispose] (method)
Metadata (interface) [9 members]
  Metadata.count (property) — Number of entries in the table
  Metadata.names (method) — Every entry name, index order
  Metadata.typeOf (method)
  Metadata.get (method) — Typed read
  Metadata.set (method) — Reserved names (`PicoGK.*`, `PicoVoxel.*`, `class`, `name`, `file_*`) throw
  Metadata.remove (method) — The reserved-name guard applies here too
  Metadata.handle (property) — Raw ABI handle — escape hatch
  Metadata.dispose (method) — Optional
  Metadata.[Symbol.dispose] (method)
Pico (interface) [24 members]
  Pico.voxelSize (property)
  Pico.lane (property) — The RESOLVED session lane (never `'auto'`
  Pico.name (property)
  Pico.version (property)
  Pico.buildInfo (property)
  Pico.voxelToMm (method) — Convert voxel-index coordinates to world millimetres
  Pico.mmToVoxel (method) — Convert world millimetres to integer voxel indices (upstream `MmToVoxels` converts…
  Pico.createVoxels (method)
  Pico.createMesh (method) — Builds a mesh from vertex/triangle data via the bulk imports…
  Pico.createLattice (method)
  Pico.createPolyLine (method)
  Pico.createScalarField (method)
  Pico.createVectorField (method)
  Pico.createVdb (method) — An empty writable .vdb container
  Pico.openVdb (method) — Opens .vdb bytes as a container for field-level access
  Pico.vdbVoxelSize (method) — The voxel-size handshake — the voxel size recorded in .vdb…
  Pico.voxelsFromVdb (method) — The first GRID_LEVEL_SET field wins
  Pico.meshFromStl (method) — Binary STL bytes to a mesh (UNITS= header honoured on…
  Pico.memory (property) — PicoGK-side memory usage in bytes, per object type
  Pico.allocated (property) — PicoGK's own per-type allocation counters — the leak oracle
  Pico.module (property) — Escape hatch
  Pico.handle (property) — Escape hatch
  Pico.dispose (method) — Deterministic teardown
  Pico.[Symbol.dispose] (method)
PicoRuntime (interface) [3 members] — One instantiated wasm module — plus, on `picovoxel/multi`, its warm…
  PicoRuntime.createPico (method) — Opens a session on this runtime
  PicoRuntime.dispose (method) — Disposes every open session, then terminates the pthread pool
  PicoRuntime.[Symbol.dispose] (method)
PicoWasmOverrides (interface) [4 members] — The Emscripten Module overrides picovoxel forwards to its glue
  PicoWasmOverrides.locateFile (property) — Returns the URL of the wasm file (a filesystem path…
  PicoWasmOverrides.mainScriptUrlOrBlob (property) — The pthread worker script (`picovoxel/multi/worker`), loaded by every worker as…
  PicoWasmOverrides.instantiateWasm (property) — Instantiates the module yourself
  PicoWasmOverrides.wasmBinary (property) — The wasm file's bytes, compiled in place of fetching the…
PolyLine (interface) [10 members]
  PolyLine.addVertex (method) — Appends one vertex
  PolyLine.addVertices (method) — Appends many vertices
  PolyLine.vertices (property) — All vertices, index order
  PolyLine.vertexCount (property)
  PolyLine.color (property) — RGBA, each 0..1, as the line was created
  PolyLine.bounds (method)
  PolyLine.memUsage (property)
  PolyLine.handle (property) — Raw ABI handle — escape hatch
  PolyLine.dispose (method) — Optional
  PolyLine.[Symbol.dispose] (method)
ScalarField (interface) [9 members]
  ScalarField.set (method) — Sets (and activates) the value at a position in mm
  ScalarField.get (method) — Value at the position, or null when the position holds…
  ScalarField.remove (method)
  ScalarField.traverse (method) — Visits every active value
  ScalarField.dimensions (method) — Field extent in discrete voxel units
  ScalarField.getSlice (method) — One Z slice of raw field values
  ScalarField.bounds (method) — Bounding box of active voxels in mm (dims × voxel…
  ScalarField.signedDistanceAt (method) — Stored values are voxel-unit signed distance
  ScalarField.clone (method)
ScalarFieldSlice (interface) [3 members]
  ScalarFieldSlice.width (property)
  ScalarFieldSlice.height (property)
  ScalarFieldSlice.data (property) — Raw field values, row-major
ShellOptions (interface) [5 members]
  ShellOptions.offset (property)
  ShellOptions.inner (property)
  ShellOptions.outer (property)
  ShellOptions.smoothInner (property)
  ShellOptions.fastRenorm (property) — See `offset({ fastRenorm })`
SurfaceNormalFieldOptions (interface) [4 members]
  SurfaceNormalFieldOptions.surfaceThresholdVx (property) — Active values with |sd| above this (voxel units) are skipped…
  SurfaceNormalFieldOptions.directionFilter (property) — Keep only normals within the tolerance of this direction (C#…
  SurfaceNormalFieldOptions.directionFilterTolerance (property) — Allowed |1 - dot| deviation, 0..1 (C# `fDirectionFilterTolerance`)
  SurfaceNormalFieldOptions.scaleBy (property) — Component-wise scale applied to stored normals (C# `vecScaleBy`)
ToStlOptions (interface) [4 members]
  ToStlOptions.unit (property)
  ToStlOptions.scale (property) — Scale applied while still in mm, after offset
  ToStlOptions.offset (property) — Offset in mm, applied first
  ToStlOptions.acceptLane (property) — Acknowledges, for this one export, that the geometry has non-exact…
VdbFile (interface) [10 members]
  VdbFile.fieldCount (property)
  VdbFile.fields (method) — Name + type of every field, index order
  VdbFile.add (method) — Adds a field under `name`
  VdbFile.getVoxels (method)
  VdbFile.getScalarField (method)
  VdbFile.getVectorField (method)
  VdbFile.toBytes (method) — Serialises the container to .vdb bytes
  VdbFile.handle (property) — Raw ABI handle — escape hatch
  VdbFile.dispose (method) — Optional
  VdbFile.[Symbol.dispose] (method)
VectorField (interface) [5 members]
  VectorField.set (method)
  VectorField.get (method)
  VectorField.remove (method)
  VectorField.traverse (method) — Visits every active value
  VectorField.clone (method)
VoxelSlice (interface) [4 members]
  VoxelSlice.width (property)
  VoxelSlice.height (property)
  VoxelSlice.data (property) — Row-major samples
  VoxelSlice.background (property) — The native background (outside-narrow-band) value of the raw sdf data
Voxels (interface) [40 members]
  Voxels.clone (method) — An independent copy of this field
  Voxels.union (method) — Pure union
  Voxels.subtract (method) — Pure subtraction of every operand
  Voxels.intersect (method) — Pure intersection
  Voxels.equals (method) — Content equality
  Voxels.isEmpty (property) — THE emptiness oracle
  Voxels.offset (method) — Pure surface offset
  Voxels.doubleOffset (method) — Two offsets in sequence (closing/opening when signs differ)
  Voxels.smoothen (method) — In, 2× out, in again
  Voxels.fillet (method) — Over-offset composition
  Voxels.shell (method) — Shell
  Voxels.trim (method) — Everything outside the box is trimmed away (cube-mesh intersect, as…
  Voxels.projectZSlice (method) — Projects the slice at startZ through endZ (mm)
  Voxels.withMesh (method) — Pure
  Voxels.withLattice (method) — Pure
  Voxels.withImplicit (method) — Pure
  Voxels.maskedByImplicit (method) — The gyroid-in-sphere idiom
  Voxels.volume (property) — Volume in mm³ from the raw grid — fast but…
  Voxels.properties (method) — Volume (mm³), surface area (mm²) and bounds free of boolean…
  Voxels.gridHash (method) — The canonical grid hash
  Voxels.densifyInterior (method) — Oracle test tooling
  Voxels.bounds (method) — Bounding box via the intermediate mesh (the only accurate way)
  Voxels.isInside (method) — True if the point is at or below the surface
  Voxels.surfaceNormal (method) — Surface normal at a point on the surface (use after…
  Voxels.closestPointOnSurface (method) — Closest surface point, or null when the field is empty
  Voxels.raycastToSurface (method) — Ray-surface intersection, or null on a miss
  Voxels.raycastBatch (method) — N rays over ONE cached intersector and one ABI crossing
  Voxels.closestPointsOnSurface (method) — N closest-surface-point queries over one index build (openvdb ClosestSurfacePoint)
  Voxels.dimensions (method) — Field extent in discrete voxel units
  Voxels.sliceCount (property) — Number of Z slices
  Voxels.sliceOrigin (method) — Real-world origin of slice `index` in mm
  Voxels.getSlice (method) — One slice image
  Voxels.toMesh (method)
  Voxels.toScalarField (method)
  Voxels.metadata (property)
  Voxels.memUsage (property)
  Voxels.lane (property) — Value provenance
  Voxels.handle (property) — Raw ABI handle — escape hatch
  Voxels.dispose (method) — Optional
  Voxels.[Symbol.dispose] (method)
BeamThickness (interface) [3 members] — Beam thickness for a given point in space (C# `IBeamThickness`)
  BeamThickness.beamThickness (method)
  BeamThickness.updateCell (method)
  BeamThickness.setBoundingVoxels (method)
CellArray (interface) [1 members] — A collection of unit cells (C# `ICellArray`)
  CellArray.unitCells (method)
CoordinateTrafo (interface) [1 members] — Coordinate transformation ahead of a raw TPMS lookup (C# `ICoordinateTrafo`)
  CoordinateTrafo.apply (method)
LatticeType (interface) [1 members] — Beam-connecting logic for one unit cell (C# `ILatticeType`)
  LatticeType.addCell (method)
RawTpmsPattern (interface) [1 members] — Raw TPMS surface equation (C# `IRawTPMSPattern`)
  RawTpmsPattern.signedDistance (method)
SplittingLogic (interface) [1 members] — Turns a raw signed distance + wall thickness into the…
  SplittingLogic.advancedSignedDistance (method)
UnitCell (interface) [3 members] — A lattice unit cell (C# `IUnitCell`, preview dropped)
  UnitCell.cornerPoints (method)
  UnitCell.cellCentre (method)
  UnitCell.cellBounding (method)
Cylindrical (interface) [3 members] — A cylindrical coordinate (C# `Cylindrical`)
  Cylindrical.r (property)
  Cylindrical.phi (property)
  Cylindrical.z (property)
Frame (interface) [4 members] — A rigid transform stored as explicit axes (C# `PicoGK.Shapes.Frame3d`)
  Frame.pos (property) — Origin of the frame in world coordinates (C# `vecPos`)
  Frame.lx (property) — Local X axis in world coordinates (C# `vecLx`)
  Frame.ly (property) — Local Y axis in world coordinates (C# `vecLy`)
  Frame.lz (property) — Local Z axis in world coordinates (C# `vecLz`)
Polar (interface) [2 members] — A polar coordinate (C# `PicoGK.Numerics.Polar`)
  Polar.r (property)
  Polar.phi (property)
Spherical (interface) [3 members] — A spherical coordinate (C# `Spherical`)
  Spherical.r (property)
  Spherical.phi (property)
  Spherical.theta (property)
Implicit (interface) [2 members]
  Implicit.sdf (property) — C# `IImplicit.fSignedDistance` as a picovoxel SdfFunction
  Implicit.expression (property) — The same field as a tape expression for the parallel…
LatticeBaseShape (interface) [1 members] — C# `ILatticeBaseShape`
  LatticeBaseShape.latConstruct (method)
LatticeManifoldOptions (interface) [5 members]
  LatticeManifoldOptions.length (property) — Required for the Frame form
  LatticeManifoldOptions.radius (property)
  LatticeManifoldOptions.maxOverhangAngle (property) — Degrees
  LatticeManifoldOptions.extendBothSides (property) — Extend the teardrop in -Z as well (C# `bExtendBothSides =…
  LatticeManifoldOptions.minPrintableRadius (property) — C# `fMinPrintableRadius = 0.1`
MeshBaseShape (interface) [1 members] — C# `IMeshBaseShape`
  MeshBaseShape.mshConstruct (method)
PipeSegmentOptions (interface) [6 members]
  PipeSegmentOptions.length (property) — Required for the Frame form
  PipeSegmentOptions.innerRadius (property)
  PipeSegmentOptions.outerRadius (property)
  PipeSegmentOptions.startOrMid (property) — START_END
  PipeSegmentOptions.endOrRange (property) — START_END
  PipeSegmentOptions.method (property)
SpineBaseShape (interface) [1 members] — C# `ISpineBaseShape`
  SpineBaseShape.spinePoint (method)
Spline (interface) [1 members] — ShapeKernel `ISpline`
  Spline.points (method)
SurfaceBaseShape (interface) [1 members] — C# `ISurfaceBaseShape`
  SurfaceBaseShape.surfacePoint (method)
TangentOptions (interface) [4 members]
  TangentOptions.startTangentStrength (property)
  TangentOptions.endTangentStrength (property)
  TangentOptions.relativeStartStrength (property)
  TangentOptions.relativeEndStrength (property)

## Interfaces (2) — `api-interfaces-2.md`

FromCliResult (interface) [4 members]
  FromCliResult.unitsHeader (property)
  FromCliResult.date (property)
  FromCliResult.headerLayerCount (property)
  FromCliResult.warnings (property)
SdfImage (interface) [3 members]
  SdfImage.width (property)
  SdfImage.height (property)
  SdfImage.data (property) — Row-major samples, negative inside
Slice (interface) [3 members]
  Slice.z (property) — Layer height position in mm (first layer at one layerHeight,…
  Slice.contours (property)
  Slice.lane (property) — Value provenance of the sliced voxels (`'exact'` or absent =…
SliceContour (interface) [2 members]
  SliceContour.points (property) — Flat [x0, y0, x1, y1, …] loop in mm
  SliceContour.winding (property) — Solid boundaries are CCW, holes CW (upstream contract)
SliceStack (interface) [3 members]
  SliceStack.slices (property)
  SliceStack.bounds (property) — XY bounds over every contour + Z from first/last layer
  SliceStack.lane (property) — Value provenance (`'exact'` or absent = exact)
SliceVoxelsOptions (interface) [3 members]
  SliceVoxelsOptions.layerHeight (property) — Layer height in mm
  SliceVoxelsOptions.useAbsoluteXY (property) — Keep absolute XY coordinates instead of the bbox-relative default
  SliceVoxelsOptions.onProgress (property) — Monotonic 0→1
ToCliOptions (interface) [4 members]
  ToCliOptions.units (property) — Units in mm per CLI unit (1 = mm, upstream…
  ToCliOptions.emptyFirstLayer (property) — Emit an intentionally-empty first layer so readers can infer layer…
  ToCliOptions.date (property) — Header date string
  ToCliOptions.onProgress (property)
ToSvgOptions (interface) [3 members]
  ToSvgOptions.solid (property) — Filled single-path rendering (holes via winding) instead of stroked outlines
  ToSvgOptions.strokeWidth (property)
  ToSvgOptions.viewBox (property) — Override the viewBox [minX, minY, width, height]

## Types — `api-types.md`

AllocatedCounts (type) [8 members]
  AllocatedCounts.voxels (property)
  AllocatedCounts.meshes (property)
  AllocatedCounts.lattices (property)
  AllocatedCounts.polyLines (property)
  AllocatedCounts.scalarFields (property)
  AllocatedCounts.vectorFields (property)
  AllocatedCounts.vdbFiles (property)
  AllocatedCounts.metadata (property)
Color (type) — RGBA color, each channel 0..1
CreateScalarFieldOptions (type) [3 members]
  CreateScalarFieldOptions.from (property)
  CreateScalarFieldOptions.value (property)
  CreateScalarFieldOptions.sdThreshold (property)
CreateVectorFieldOptions (type) [3 members]
  CreateVectorFieldOptions.from (property)
  CreateVectorFieldOptions.value (property)
  CreateVectorFieldOptions.sdThreshold (property)
CreateVoxelsOptions (type) [1 members]
  CreateVoxelsOptions.shape (property)
GetSliceOptions (type) [1 members]
  GetSliceOptions.mode (property)
Mat4 (type) — 4x4 transform, column-major in System.Numerics order (row-vector convention
MetadataType (type)
MetadataValue (type)
PicoErrorCode (type)
SdfExpression (type) — A serializable SDF
SdfFunction (type) — Signed distance in millimetres at (x, y, z) — scalars,…
SdfOperator (type)
SliceAxis (type)
SliceMode (type) — Slice modes are pure post-processing over the native narrow-band floats
StlUnit (type)
TransformOptions (type)
VdbFieldType (type)
Vec3 (type) — A 3D coordinate or direction, `[x, y, z]`, in millimetres…
Overhang (type) [1 members] — Normalized overhang severity 0..1 (C# `PicoGK.Numerics.Overhang`)
  Overhang.[overhangBrand] (property)
Quat (type) — A rotation quaternion as [x, y, z, w] (System.Numerics `Quaternion`…
Rad (type) [1 members] — An angle in radians (C# `PicoGK.Numerics.Rad`)
  Rad.[radBrand] (property)
Vec2 (type) — A 2D vector as an immutable tuple (System.Numerics `Vector2` analog)
CylindricalDirection (type)
FrameType (type)
ModulationCoord (type)
ModulationLine (type)
PipeSegmentMethod (type)
PolygonPreset (type)
RandomSource (type) — A uniform [0, 1) source (the C# `Random.NextDouble` role)
RatioFunc (type)
SplineEnds (type)
SuperShapePreset (type)
SurfaceRatioFunc (type)
VertexTransformation (type) — Point-wise vertex transformation applied during construction (C# `fnVertexTransformation`)
ContourWinding (type)

## Classes — `api-classes.md`

PicoError (class) [2 members]
  PicoError.code (property)
  PicoError.constructor (constructor)
BodyCentreLattice (class) [1 members] — Body-centred lattice
  BodyCentreLattice.addCell (method)
BoundaryBeamThickness (class) [4 members] — Thickness from the distance to the bounding voxel surface
  BoundaryBeamThickness.constructor (constructor)
  BoundaryBeamThickness.beamThickness (method)
  BoundaryBeamThickness.updateCell (method)
  BoundaryBeamThickness.setBoundingVoxels (method)
CellBasedBeamThickness (class) [4 members] — Thickness from the point's position within the current unit cell
  CellBasedBeamThickness.constructor (constructor)
  CellBasedBeamThickness.updateCell (method)
  CellBasedBeamThickness.beamThickness (method)
  CellBasedBeamThickness.setBoundingVoxels (method)
CombinedTrafo (class) [2 members] — Sequential composition of trafos
  CombinedTrafo.constructor (constructor)
  CombinedTrafo.apply (method)
ConformalCellArray (class) [2 members] — Regular grid cell array conformal to a BaseBox, BaseLens or…
  ConformalCellArray.constructor (constructor)
  ConformalCellArray.unitCells (method)
ConstantBeamThickness (class) [4 members] — Constant thickness, independent of cell or boundary (C# `ConstantBeamThickness`)
  ConstantBeamThickness.constructor (constructor)
  ConstantBeamThickness.beamThickness (method)
  ConstantBeamThickness.updateCell (method)
  ConstantBeamThickness.setBoundingVoxels (method)
CuboidCell (class) [4 members] — Simple unit cell with 8 corner points in the shape…
  CuboidCell.constructor (constructor)
  CuboidCell.cornerPoints (method)
  CuboidCell.cellCentre (method)
  CuboidCell.cellBounding (method)
FullVoidLogic (class) [1 members] — Complement of the full wall (C# `FullVoidLogic`)
  FullVoidLogic.advancedSignedDistance (method)
FullWallLogic (class) [1 members] — Wall on both sides of the zero surface (C# `FullWallLogic`)
  FullWallLogic.advancedSignedDistance (method)
FunctionalScaleTrafo (class) [1 members] — Z-dependent scale ramp 20→5 over z 0..50
  FunctionalScaleTrafo.apply (method)
GlobalFuncBeamThickness (class) [4 members] — Thickness from a global function of the point — upstream…
  GlobalFuncBeamThickness.constructor (constructor)
  GlobalFuncBeamThickness.beamThickness (method)
  GlobalFuncBeamThickness.updateCell (method)
  GlobalFuncBeamThickness.setBoundingVoxels (method)
ImplicitLidinoid (class) [3 members] — Implicit lidinoid
  ImplicitLidinoid.sdf (property) — C# `IImplicit.fSignedDistance` as a picovoxel SdfFunction
  ImplicitLidinoid.expression (property) — The same field as a tape expression for the parallel…
  ImplicitLidinoid.constructor (constructor)
ImplicitModular (class) [2 members] — Modular implicit
  ImplicitModular.sdf (property)
  ImplicitModular.constructor (constructor)
ImplicitRadialGyroid (class) [2 members] — Gyroid unwrapped around the Z axis
  ImplicitRadialGyroid.sdf (property)
  ImplicitRadialGyroid.constructor (constructor)
ImplicitRandomizedSchwarzPrimitive (class) [2 members] — Schwarz primitive over a randomly deformed grid
  ImplicitRandomizedSchwarzPrimitive.sdf (property)
  ImplicitRandomizedSchwarzPrimitive.constructor (constructor)
ImplicitSchwarzDiamond (class) [3 members] — Implicit Schwarz diamond
  ImplicitSchwarzDiamond.sdf (property) — C# `IImplicit.fSignedDistance` as a picovoxel SdfFunction
  ImplicitSchwarzDiamond.expression (property) — The same field as a tape expression for the parallel…
  ImplicitSchwarzDiamond.constructor (constructor)
ImplicitSchwarzPrimitive (class) [3 members] — Implicit Schwarz primitive (C# `ImplicitSchwarzPrimitive`)
  ImplicitSchwarzPrimitive.sdf (property) — C# `IImplicit.fSignedDistance` as a picovoxel SdfFunction
  ImplicitSchwarzPrimitive.expression (property) — The same field as a tape expression for the parallel…
  ImplicitSchwarzPrimitive.constructor (constructor)
ImplicitSplitVoidGyroid (class) [3 members] — One side of the gyroid surface as a void, shrunk…
  ImplicitSplitVoidGyroid.sdf (property) — C# `IImplicit.fSignedDistance` as a picovoxel SdfFunction
  ImplicitSplitVoidGyroid.expression (property) — The same field as a tape expression for the parallel…
  ImplicitSplitVoidGyroid.constructor (constructor)
ImplicitSplitWallGyroid (class) [3 members] — Gyroid wall on one side of the surface, solid on…
  ImplicitSplitWallGyroid.sdf (property) — C# `IImplicit.fSignedDistance` as a picovoxel SdfFunction
  ImplicitSplitWallGyroid.expression (property) — The same field as a tape expression for the parallel…
  ImplicitSplitWallGyroid.constructor (constructor)
NegativeHalfWallLogic (class) [1 members] — Wall only on the negative side (C# `NegativeHalfWallLogic`)
  NegativeHalfWallLogic.advancedSignedDistance (method)
NegativeVoidLogic (class) [1 members] — Negative-side volume shrunk by the half wall (C# `NegativeVoidLogic`)
  NegativeVoidLogic.advancedSignedDistance (method)
OctahedronLattice (class) [1 members] — Octahedron lattice
  OctahedronLattice.addCell (method)
PositiveHalfWallLogic (class) [1 members] — Wall only on the positive side (C# `PositiveHalfWallLogic`)
  PositiveHalfWallLogic.advancedSignedDistance (method)
PositiveVoidLogic (class) [1 members] — Positive-side volume shrunk by the half wall (C# `PositiveVoidLogic`)
  PositiveVoidLogic.advancedSignedDistance (method)
RadialTrafo (class) [2 members] — Cylindrical unwrap
  RadialTrafo.constructor (constructor)
  RadialTrafo.apply (method)
RandomDeformationField (class) [2 members] — Regular cuboid 3D grid with a random 3D value at…
  RandomDeformationField.constructor (constructor)
  RandomDeformationField.dataAt (method) — Tri-linear interpolation of the noise grid at the point, clamped…
RandomSplineLattice (class) [2 members] — Custom lattice type connecting random corners of a cell through…
  RandomSplineLattice.constructor (constructor)
  RandomSplineLattice.addCell (method)
RawGyroidTpmsPattern (class) [1 members] — C# `RawGyroidTPMSPattern`
  RawGyroidTpmsPattern.signedDistance (method)
RawLidinoidTpmsPattern (class) [1 members] — C# `RawLidinoidTPMSPattern`
  RawLidinoidTpmsPattern.signedDistance (method)
RawSchwarzDiamondTpmsPattern (class) [1 members] — C# `RawSchwarzDiamondTPMSPattern`
  RawSchwarzDiamondTpmsPattern.signedDistance (method)
RawSchwarzPrimitiveTpmsPattern (class) [1 members] — C# `RawSchwarzPrimitiveTPMSPattern`
  RawSchwarzPrimitiveTpmsPattern.signedDistance (method)
RawTransitionTpmsPattern (class) [1 members] — Schwarz diamond blending into Schwarz primitive over x in -2..3…
  RawTransitionTpmsPattern.signedDistance (method)
RegularCellArray (class) [2 members] — Regular grid cell array housing the bounding box of the…
  RegularCellArray.constructor (constructor)
  RegularCellArray.unitCells (method)
RegularUnitCell (class) [2 members] — A grid of exactly one unit cell, centred in XY…
  RegularUnitCell.constructor (constructor)
  RegularUnitCell.unitCells (method)
ScaleTrafo (class) [2 members] — Per-axis division by the unit sizes (C# `ScaleTrafo`)
  ScaleTrafo.constructor (constructor)
  ScaleTrafo.apply (method)
BaseBox (class) [19 members] — Box along a straight frame or spine with width/depth line…
  BaseBox.lengthSteps (property)
  BaseBox.widthSteps (property)
  BaseBox.depthSteps (property)
  BaseBox.widthModulation (property)
  BaseBox.depthModulation (property)
  BaseBox.frames (property)
  BaseBox.constructor (constructor)
  BaseBox.fromBounds (method) — From a bounding box
  BaseBox.setWidth (method) — C# `SetWidth` — modulated width bumps width+length sampling to 500
  BaseBox.setDepth (method) — C# `SetDepth` — modulated depth bumps depth+length sampling to 500
  BaseBox.setWidthSteps (method)
  BaseBox.setDepthSteps (method)
  BaseBox.setLengthSteps (method)
  BaseBox.voxConstruct (method)
  BaseBox.mshConstruct (method)
  BaseBox.depthRatioFromStep (method)
  BaseBox.widthRatioFromStep (method)
  BaseBox.lengthRatioFromStep (method)
  BaseBox.surfacePoint (method) — Surface point
BaseCone (class) [4 members] — Cone
  BaseCone.cylinder (property)
  BaseCone.constructor (constructor)
  BaseCone.voxConstruct (method)
  BaseCone.baseCylinder (method) — The underlying cylinder (C# `oGetBaseCylinder`)
BaseCylinder (class) [19 members] — Cylinder along a straight frame or a spine, with a…
  BaseCylinder.lengthSteps (property)
  BaseCylinder.polarSteps (property)
  BaseCylinder.radialSteps (property)
  BaseCylinder.radiusModulation (property)
  BaseCylinder.frames (property)
  BaseCylinder.constructor (constructor)
  BaseCylinder.setRadius (method) — C# `SetRadius` — modulated radii bump the length sampling to…
  BaseCylinder.setRadialSteps (method)
  BaseCylinder.setPolarSteps (method)
  BaseCylinder.setLengthSteps (method)
  BaseCylinder.voxConstruct (method)
  BaseCylinder.mshConstruct (method)
  BaseCylinder.addTopSurface (method) — Top disc at full length (C# `AddTopSurface`)
  BaseCylinder.addBottomSurface (method) — Bottom disc, wound the other way (C# `AddBottomSurface`)
  BaseCylinder.addOuterMantle (method) — Outer mantle across phi and length (C# `AddOuterMantle`)
  BaseCylinder.radiusRatioFromStep (method)
  BaseCylinder.phiRatioFromStep (method)
  BaseCylinder.lengthRatioFromStep (method)
  BaseCylinder.surfacePoint (method) — Surface point at (lengthRatio, phiRatio, radiusRatio), all 0..1 (C# `vecGetSurfacePoint`)
BaseLens (class) [19 members] — Lens/washer
  BaseLens.radialSteps (property)
  BaseLens.polarSteps (property)
  BaseLens.heightSteps (property)
  BaseLens.innerRadius (property)
  BaseLens.outerRadius (property)
  BaseLens.upperModulation (property)
  BaseLens.lowerModulation (property)
  BaseLens.frame (property)
  BaseLens.constructor (constructor)
  BaseLens.setHeight (method) — C# `SetHeight` — modulated faces bump radial sampling to 500
  BaseLens.setRadialSteps (method)
  BaseLens.setPolarSteps (method)
  BaseLens.setHeightSteps (method)
  BaseLens.voxConstruct (method)
  BaseLens.mshConstruct (method)
  BaseLens.radiusRatioFromStep (method)
  BaseLens.phiRatioFromStep (method)
  BaseLens.heightRatioFromStep (method)
  BaseLens.surfacePoint (method) — Surface point (C# `vecGetSurfacePoint`
BasePipe (class) [22 members] — Pipe (annular cylinder) along a straight frame or spine (C#…
  BasePipe.lengthSteps (property)
  BasePipe.polarSteps (property)
  BasePipe.radialSteps (property)
  BasePipe.outerRadiusModulation (property)
  BasePipe.innerRadiusModulation (property)
  BasePipe.frames (property)
  BasePipe.constructor (constructor)
  BasePipe.setRadius (method) — C# `SetRadius(inner, outer)` — bumps length sampling to 500
  BasePipe.setRadialSteps (method)
  BasePipe.setPolarSteps (method)
  BasePipe.setLengthSteps (method)
  BasePipe.voxConstruct (method)
  BasePipe.mshConstruct (method)
  BasePipe.addTopSurface (method)
  BasePipe.addBottomSurface (method)
  BasePipe.addOuterMantle (method)
  BasePipe.addInnerMantle (method)
  BasePipe.radiusRatioFromStep (method)
  BasePipe.phiRatioFromStep (method)
  BasePipe.lengthRatioFromStep (method)
  BasePipe.axesAt (method) — Spine point and local axes at a length ratio
  BasePipe.surfacePoint (method) — Surface point
BasePipeSegment (class) [5 members] — Angular pipe segment
  BasePipeSegment.rangeModulation (property)
  BasePipeSegment.midModulation (property)
  BasePipeSegment.constructor (constructor)
  BasePipeSegment.mshConstruct (method)
  BasePipeSegment.surfacePoint (method) — Phi spans mid ± range/2 at the length ratio (C#…
BaseRevolve (class) [22 members] — Revolves a spine cross-section about the reference frame's Z axis…
  BaseRevolve.lengthSteps (property)
  BaseRevolve.polarSteps (property)
  BaseRevolve.radialSteps (property)
  BaseRevolve.frames (property)
  BaseRevolve.frame (property)
  BaseRevolve.outerRadiusModulation (property)
  BaseRevolve.innerRadiusModulation (property)
  BaseRevolve.constructor (constructor)
  BaseRevolve.setRadius (method)
  BaseRevolve.setRadialSteps (method)
  BaseRevolve.setPolarSteps (method)
  BaseRevolve.setLengthSteps (method)
  BaseRevolve.voxConstruct (method)
  BaseRevolve.mshConstruct (method)
  BaseRevolve.radiusRatioFromStep (method)
  BaseRevolve.phiRatioFromStep (method)
  BaseRevolve.lengthRatioFromStep (method)
  BaseRevolve.surfacePoint (method) — Spine offset along local X, revolved about the reference frame's…
  BaseRevolve.spinePoint (method) — Spine position (C# `vecGetSpineAlongLength`)
  BaseRevolve.outerSurfacePoint (method) — Outer surface point at (phi, lengthRatio) (C# `vecGetOuterSurfacePoint`)
  BaseRevolve.innerSurfacePoint (method) — Inner surface point at (phi, lengthRatio) (C# `vecGetInnerSurfacePoint`)
  BaseRevolve.framesFromContour (method) — Cylindrical frames traced from a rotationally-symmetric contour (C# `aGetFramesFromContour`)
BaseRing (class) [14 members] — Torus ring on a local frame
  BaseRing.polarSteps (property)
  BaseRing.radialSteps (property)
  BaseRing.ringRadius (property)
  BaseRing.radiusModulation (property)
  BaseRing.frame (property)
  BaseRing.constructor (constructor)
  BaseRing.setRadius (method)
  BaseRing.setRadialSteps (method)
  BaseRing.setPolarSteps (method)
  BaseRing.voxConstruct (method)
  BaseRing.mshConstruct (method)
  BaseRing.alphaRatioFromStep (method)
  BaseRing.phiRatioFromStep (method)
  BaseRing.surfacePoint (method) — Surface point on the torus
BaseShape (class) [3 members] — C# `BaseShape` — the vertex-transformation seam every shape shares
  BaseShape.trafo (property)
  BaseShape.setTransformation (method) — Point-wise transformation applied during construction (C# `SetTransformation`)
  BaseShape.voxConstruct (method)
BaseSphere (class) [11 members] — Sphere on a local frame with a surface-modulated radius (C#…
  BaseSphere.azimuthalSteps (property)
  BaseSphere.polarSteps (property)
  BaseSphere.radiusModulation (property)
  BaseSphere.frame (property)
  BaseSphere.constructor (constructor)
  BaseSphere.setRadius (method)
  BaseSphere.setAzimuthalSteps (method) — No lower clamp upstream (unlike the other shapes' step setters)
  BaseSphere.setPolarSteps (method)
  BaseSphere.voxConstruct (method)
  BaseSphere.mshConstruct (method)
  BaseSphere.surfacePoint (method) — Surface point
ControlPointSpline (class) [3 members] — BSpline-based control point spline, open or closed ends (C# `ControlPointSpline`)
  ControlPointSpline.constructor (constructor)
  ControlPointSpline.points (method) — Render with the given sample count (C# `aGetPoints`)
  ControlPointSpline.pointAt (method) — Sample dynamically at a length ratio (C# `vecGetPointAt`)
CylindricalControlSpline (class) [4 members] — Step-wise cylindrical path builder (C# `CylindricalControlSpline`)
  CylindricalControlSpline.constructor (constructor)
  CylindricalControlSpline.addRelativeStep (method) — Append a step relative to the last position (C# `AddRelativeStep`)
  CylindricalControlSpline.addAbsoluteStep (method) — Append a step to an absolute radius or z (C#…
  CylindricalControlSpline.points (method)
Distribution (class) [3 members] — Bundles a normalized line modulation with a physical length (C#…
  Distribution.totalLength (property)
  Distribution.modulation (property)
  Distribution.constructor (constructor)
Frames (class) [13 members]
  Frames.alongLine (method) — Extrude a const local frame along a straight line (C#…
  Frames.alongSpline (method) — Extrude a const local frame along a spline (C# `Frames(aPoints,…
  Frames.withTargetX (method) — Tangential Z along the spline, X aligned to a const…
  Frames.ofType (method) — Tangential Z along the spline, X from a coordinate-system-dependent target…
  Frames.applyToFrame (method) — Transform all points and axes onto a frame's coordinate system,…
  Frames.alignWithTargetX (method) — Best in-plane direction matching the target
  Frames.targetXFor (method) — The alignment target per frame type (C# `vecGetTargetX`)
  Frames.spineAt (method) — Spine position at a length ratio 0..1 (C# `vecGetSpineAlongLength`)
  Frames.localXAt (method) — Local X at a length ratio (C# `vecGetLocalXAlongLength`)
  Frames.localYAt (method) — Local Y at a length ratio (C# `vecGetLocalYAlongLength`)
  Frames.localZAt (method) — Local Z at a length ratio (C# `vecGetLocalZAlongLength`)
  Frames.frameAt (method) — The full local frame at a length ratio (C# `oGetLocalFrame`)
  Frames.points (method) — The spine points (C# `aGetPoints()`)
GenericContour (class) — A Distribution describing contours of rotationally symmetric objects (C# `GenericContour`)
ImplicitGenus (class) [3 members] — Implicit genus-2 surface
  ImplicitGenus.sdf (property) — C# `IImplicit.fSignedDistance` as a picovoxel SdfFunction
  ImplicitGenus.expression (property) — The same field as a tape expression for the parallel…
  ImplicitGenus.constructor (constructor)
ImplicitGyroid (class) [4 members] — Gyroid pattern with a wall-thickness ratio (C# `ImplicitGyroid`)
  ImplicitGyroid.sdf (property) — C# `IImplicit.fSignedDistance` as a picovoxel SdfFunction
  ImplicitGyroid.expression (property) — The same field as a tape expression for the parallel…
  ImplicitGyroid.constructor (constructor)
  ImplicitGyroid.thicknessRatio (method) — Thickness ratio for a target wall thickness in mm (C#…
ImplicitSphere (class) [3 members] — Implicit sphere (C# `ImplicitSphere`)
  ImplicitSphere.sdf (property) — C# `IImplicit.fSignedDistance` as a picovoxel SdfFunction
  ImplicitSphere.expression (property) — The same field as a tape expression for the parallel…
  ImplicitSphere.constructor (constructor)
ImplicitSuperEllipsoid (class) [3 members] — Implicit superellipsoid (C# `ImplicitSuperEllipsoid`
  ImplicitSuperEllipsoid.sdf (property) — C# `IImplicit.fSignedDistance` as a picovoxel SdfFunction
  ImplicitSuperEllipsoid.expression (property) — The same field as a tape expression for the parallel…
  ImplicitSuperEllipsoid.constructor (constructor)
LatticeManifold (class) [6 members] — Manifold pipe
  LatticeManifold.maxPrintableRadius (property)
  LatticeManifold.limitAngle (property)
  LatticeManifold.extendBothSides (property)
  LatticeManifold.constructor (constructor)
  LatticeManifold.latConstruct (method) — Chained beams along the spine (C# `latConstruct`)
  LatticeManifold.addTip (method) — Teardrop tip via circular-segment geometry (C# `AddTip`)
LatticePipe (class) [10 members] — Round pipe built from lattice beams along a frame or…
  LatticePipe.radiusModulation (property)
  LatticePipe.lengthSteps (property)
  LatticePipe.frames (property)
  LatticePipe.constructor (constructor)
  LatticePipe.setRadius (method)
  LatticePipe.setLengthSteps (method) — No lower clamp upstream
  LatticePipe.voxConstruct (method)
  LatticePipe.latConstruct (method) — Chained beams along the spine (C# `latConstruct`)
  LatticePipe.spinePoint (method) — Centre-axis position along the pipe (C# `vecGetSpinePoint`)
  LatticePipe.radius (method)

## Classes (2) — `api-classes-2.md`

LineModulation (class) [7 members] — 1D modulation
  LineModulation.constValue (property) — The constant value when built from one (C# public `m_fConstValue`)
  LineModulation.constructor (constructor)
  LineModulation.fromPoints (method) — From a discrete point list
  LineModulation.modulation (method) — The modulation value at a 0..1 ratio (C# `fGetModulation`)
  LineModulation.add (method) — Sum of two modulations (C# `operator +`)
  LineModulation.sub (method) — Difference of two modulations (C# `operator -`)
  LineModulation.scale (method) — Scaled modulation (C# `operator *`)
MeshBuilder (class) [6 members] — Accumulates upstream-style per-triangle geometry, built through ONE bulk `createMesh` call
  MeshBuilder.vertexCount (property) — Number of vertices added so far
  MeshBuilder.addVertex (method) — Adds one vertex and returns its index, for {@link MeshBuilder.addIndexedTriangle}…
  MeshBuilder.addIndexedTriangle (method) — One triangle over vertices already added, by index (C# `Mesh.nAddTriangle(Triangle)`)
  MeshBuilder.addTriangle (method) — Three fresh vertices + one triangle, exactly like C# `Mesh.nAddTriangle(v0,…
  MeshBuilder.addQuad (method) — The two-triangle quad both upstream mesh helpers and shape mantles…
  MeshBuilder.build (method)
SurfaceModulation (class) [6 members] — 2D modulation over (phi, lengthRatio) (C# `SurfaceModulation`
  SurfaceModulation.constructor (constructor)
  SurfaceModulation.fromLineModulation (method) — Lift a 1D modulation
  SurfaceModulation.modulation (method) — The modulation value at the given ratios (C# `fGetModulation`)
  SurfaceModulation.add (method) — Sum of two modulations (C# `operator +`)
  SurfaceModulation.sub (method) — Difference of two modulations (C# `operator -`)
  SurfaceModulation.scale (method) — Scaled modulation (C# `operator *`)
TangentialControlSpline (class) [3 members] — Cubic-feel connector between two points/frames with tangent control (C# `TangentialControlSpline`)
  TangentialControlSpline.constructor (constructor)
  TangentialControlSpline.betweenFrames (method) — The frame-to-frame form
  TangentialControlSpline.points (method)

## Functions — `api-functions.md`

createPico (function) — Creates a single-threaded PicoGK session
createPicoRuntime (function) — Creates a single-threaded runtime
emptyBounds (function) — The empty-bounds sentinel the ABI structs use (`BBox3()` default
isEmptyBounds (function) — True for the empty-bounds sentinel (an empty mesh/field produced it)
meshToStlBytes (function) — Serialises indexed geometry to binary STL bytes (deindexed, as the…
surfaceNormalFieldExtractor (function) — Builds a VectorField of surface normals from a voxel field's…
vectorFieldMerge (function) — Writes every active value of `source` into `target` (C# `VectorFieldMerge.Merge`)
createRandom (function) — Reproducible mulberry32 stream from a 32-bit seed
inverseGrid (function) — Row/column swap for point grids (C# `GridOperations.aGetInverseGrid`)
contoursFromSdf (function) — Vectorizes one signed-distance slice image into closed contours
detectWinding (function) — Signed-area winding detection over a flat point loop
sliceToSvg (function) — Renders one slice as a standalone SVG document string
sliceVoxels (function) — Vectorizes a voxel field slice-by-slice via interpolated Z slices
slicesFromCli (function) — Parses ASCII CLI bytes back into a slice stack
slicesToCli (function) — Serialises a slice stack to ASCII CLI bytes

## Constants — `api-constants.md`

conformalShowcaseShapes (constant) [3 members] — The three modulated demo shapes conformal arrays showcase (C# `ConformalShowcaseShapes`)
  conformalShowcaseShapes.box01 (property) — Modulated box, length 100 (C# `oGetBox_01`)
  conformalShowcaseShapes.lens01 (property) — Height-modulated lens (C# `oGetLens_01`)
  conformalShowcaseShapes.segment01 (property) — Radius- and phi-range-modulated pipe segment (C# `oGetSegment_01`)
TWO_PI (constant) — 2π (C# `Rad.TwoPi`)
cylindrical (constant) [6 members] — `Cylindrical` factories and conversions
  cylindrical.create (property) — Validated constructor (C# `Cylindrical(fR, rPhi, fZ)`)
  cylindrical.fromPolar (property) — From a polar coordinate plus height (C# `Cylindrical(Polar, fZ)`)
  cylindrical.fromCartesian (property) — From a cartesian point (C# `Cylindrical(Vector3)`)
  cylindrical.fromSpherical (property) — From a spherical coordinate (C# `Cylindrical(Spherical)`)
  cylindrical.toCartesian (property) — To cartesian (C# `vecAsCartesian`)
  cylindrical.lerp (property) — Lerp in cylindrical space
frame (constant) [25 members] — `Frame` factories and operations (C# `Frame3d` surface
  frame.world (property) — The world coordinate system (C# `frmWorld`)
  frame.fromPos (property) — World-aligned axes at a position (C# `frmFromPos` / `Frame3d(vecPos)`)
  frame.fromZX (property) — From approximate Z and X directions
  frame.fromMat4 (property) — From a row-vector rigid matrix — rows [X
  frame.ptToWorld (property) — Local point (2D points lie in the frame's XY plane)…
  frame.dirToWorld (property) — Local direction → world direction, safe-normalized (C# `vecDirToWorld`)
  frame.ptFromWorld (property) — World point → local coordinates (C# `vecPtFromWorld`)
  frame.dirFromWorld (property) — World direction → local direction, safe-normalized (C# `vecDirFromWorld`)
  frame.compose (property) — Combined transform
  frame.inverse (property) — The inverse transform — maps world to local (C# `frmInverse`),…
  frame.movedLocal (property) — Origin moved by a local-space distance (C# `frmMovedLocal`)
  frame.movedLocalX (property) — Origin moved along local X (C# `frmMovedLocalX`)
  frame.movedLocalY (property) — Origin moved along local Y (C# `frmMovedLocalY`)
  frame.movedLocalZ (property) — Origin moved along local Z (C# `frmMovedLocalZ`)
  frame.movedWorld (property) — Origin moved by a world-space distance (C# `frmMovedWorld`)
  frame.movedWorldX (property) — Origin moved along world X (C# `frmMovedWorldX`)
  frame.movedWorldY (property) — Origin moved along world Y (C# `frmMovedWorldY`)
  frame.movedWorldZ (property) — Origin moved along world Z (C# `frmMovedWorldZ`)
  frame.rotatedWorld (property) — Rotated about a world-space axis through the frame's origin (C#…
  frame.repositioned (property) — Same orientation at a new origin (C# `frmRepositioned`)
  frame.toMat4 (property) — As a row-vector rigid `Mat4` — basis in rows, translation…
  frame.composeWithScale (property) — Scale-then-frame model matrix for drawing scaled geometry (C# `matComposeWithScale`)
  frame.asRigid (property) — The transform as rotation quaternion + origin (C# `AsRigid`
  frame.interpolate (property) — Interpolate two frames
  frame.equals (property) — Exact component equality (C# `Equals`)
mat4 (constant) [3 members] — `Matrix4x4` operations
  mat4.identity (property) — The identity matrix (C# `Matrix4x4.Identity`)
  mat4.createScale (property) — Scale matrix (C# `Matrix4x4.CreateScale`)
  mat4.multiply (property) — Matrix product `a·b` (C# `Matrix4x4.operator *`)
overhang (constant) [11 members] — `Overhang` factories and accessors
  overhang.none (property) — No overhang — vertical, self-supporting (C# `uNone`)
  overhang.full (property) — Maximum overhang — horizontal (C# `uFull`)
  overhang.fromNormalized (property) — From normalized severity 0..1 (C# `uFromNormalized`)
  overhang.fromPercent (property) — From percent 0..100 (C# `uFromPercent`)
  overhang.fromRad (property) — From radians 0..π/2 (C# `uFromRad`)
  overhang.fromDeg (property) — From degrees 0..90 (C# `uFromDeg`)
  overhang.fromDegFromHorizontal (property) — From degrees measured from the horizontal plane — some 3D-printing…
  overhang.percent (property) — Severity as percent 0..100 (C# `fPercent`)
  overhang.rad (property) — Overhang angle in radians 0..π/2 (C# `fRad`)
  overhang.deg (property) — Overhang angle in degrees 0..90 (C# `fDeg`)
  overhang.degFromHorizontal (property) — Degrees from horizontal — the inverted vendor convention (C# `fDegFromHorizontal`)
polar (constant) [4 members] — `Polar` factories and conversions
  polar.create (property) — Validated constructor (C# `Polar(fR, rPhi)`)
  polar.fromCartesian (property) — From a 2D cartesian point (C# `Polar(Vector2)`
  polar.toCartesian (property) — To 2D cartesian (C# `vecAsCartesian`)
  polar.lerp (property) — Lerp in polar space
quat (constant) [7 members] — `Quaternion` operations
  quat.identity (property) — The identity rotation (C# `Quaternion.Identity`)
  quat.fromAxisAngle (property) — From a rotation axis and angle (C# `Quaternion.CreateFromAxisAngle`)
  quat.fromMat4 (property) — Extract the rotation from a rigid row-vector matrix (C# `Quaternion.CreateFromRotationMatrix`,…
  quat.dot (property) — Dot product (C# `Quaternion.Dot`)
  quat.neg (property) — Component-wise negation — the same rotation, opposite hemisphere
  quat.slerp (property) — Spherical linear interpolation (C# `Quaternion.Slerp`)
  quat.transform (property) — Rotate a vector by the quaternion (C# `Vector3.Transform(v, q)`)
rad (constant) [25 members] — `Rad` factories, constants and helpers
  rad.zero (property) — 0º (C# `Rad.Zero` / `Rad.Deg0`)
  rad.full (property) — 360º (C# `Rad.Full` / `Rad.Deg360`)
  rad.half (property) — 180º (C# `Rad.Half` / `Rad.Deg180`)
  rad.quarter (property) — 90º (C# `Rad.Quarter` / `Rad.Deg90`)
  rad.deg45 (property) — 45º (C# `Rad.Deg45`)
  rad.fromRad (property) — Brand a radians value (C# `rFromRad` / the explicit float→Rad…
  rad.fromDeg (property) — From degrees (C# `rFromDeg`)
  rad.fromNormalized (property) — From a normalized 0..1 value mapped to 0..360º, clamped (C#…
  rad.deg (property) — The angle in degrees (C# `fDeg`)
  rad.normalizedSigned (property) — Normalize to -π..+π (C# `rNormalizedSigned`
  rad.normalizedPositive (property) — Normalize to [0, 2π) (C# `rNormalizedPositive`)
  rad.almostEqual (property) — Fuzzy equality (C# `bAlmostEqual`)
  rad.almostEqualPeriodic (property) — Fuzzy equality of the normalized angle — 0º == 360º…
  rad.atan2 (property) — Quadrant-correct angle from +X (C# `rAtan2`)
  rad.atan (property) — Arc tangent (C# `rAtan`)
  rad.acos (property) — Arc cosine (C# `rAcos`)
  rad.acosClamped (property) — Arc cosine of the value clamped to [-1, 1] —…
  rad.asin (property) — Arc sine (C# `rAsin`)
  rad.asinClamped (property) — Arc sine of the value clamped to [-1, 1] (C#…
  rad.add (property)
  rad.sub (property)
  rad.scale (property)
  rad.div (property)
  rad.ratio (property) — Dimensionless ratio of two angles (C# `Rad / Rad`)
  rad.neg (property)
scalar (constant) [4 members] — Fuzzy scalar comparisons (C# `ComparisonExtensions` on `float`)
  scalar.almostEqual (property) — Fuzzy equality with both an absolute and a relative tolerance…
  scalar.almostLessOrEqual (property) — `a <= b + tol` (C# `bAlmostLessOrEqual`)
  scalar.almostMoreOrEqual (property) — `a >= b - tol` (C# `bAlmostMoreOrEqual`)
  scalar.almostZero (property) — Fuzzy zero test (C# `bAlmostZero`)
spherical (constant) [5 members] — `Spherical` factories and conversions
  spherical.create (property) — Validated constructor (C# `Spherical(fR, rPhi, rTheta)`
  spherical.fromCartesian (property) — From a cartesian point (C# `Spherical(Vector3)`
  spherical.fromCylindrical (property) — From a cylindrical coordinate (C# `Spherical(Cylindrical)`)
  spherical.toCartesian (property) — To cartesian (C# `vecAsCartesian`)
  spherical.lerp (property) — Lerp in spherical space
tolerances (constant) [4 members] — Default tolerances for fuzzy comparisons (C# `PicoGK.Numerics.Tolerances`)
  tolerances.def (property) — Default tolerance for fuzzy comparisons (`Tolerances.fDef`)
  tolerances.defSquared (property) — `Tolerances.fDefSquared` — for squared-distance comparisons
  tolerances.zero (property) — Value regarded as zero in fuzzy zero checks (`Tolerances.fZero`)
  tolerances.zeroSquared (property) — `Tolerances.fZeroSquared` — squared variant
vec2 (constant) [15 members] — `Vector2` operations
  vec2.zero (property)
  vec2.add (property)
  vec2.sub (property)
  vec2.scale (property)
  vec2.dot (property)
  vec2.lengthSquared (property)
  vec2.length (property)
  vec2.distanceSquared (property)
  vec2.lerp (property)
  vec2.normalized (property) — Unit-length copy
  vec2.safeNormalized (property) — Unit-length copy, or (0,0) for (almost) zero-length input (C# `vecSafeNormalized`)
  vec2.asVec3 (property) — Lift to 3D by appending Z (C# `vecAsVector3`)
  vec2.almostEqual (property) — Fuzzy equality by squared distance (C# `Vector2.bAlmostEqual`)
  vec2.almostZero (property) — Fuzzy zero-length test (C# `Vector2.bAlmostZero`)
  vec2.isFinite (property) — All components finite (C# `Vector2.bIsFinite`)
vec3 (constant) [24 members] — `Vector3` operations
  vec3.zero (property)
  vec3.unitX (property)
  vec3.unitY (property)
  vec3.unitZ (property)
  vec3.one (property)
  vec3.add (property)
  vec3.sub (property)
  vec3.neg (property)
  vec3.scale (property)
  vec3.dot (property)
  vec3.cross (property)
  vec3.lengthSquared (property)
  vec3.length (property)
  vec3.distanceSquared (property)
  vec3.distance (property)
  vec3.lerp (property)
  vec3.normalized (property) — Unit-length copy
  vec3.safeNormalized (property) — Unit-length copy, or (0,0,0) for (almost) zero-length input (C# `vecSafeNormalized`)
  vec3.stripZ (property) — Drop Z (C# `vecStripZ`)
  vec3.transformed (property) — Row-vector matrix transform — translation lives in elements 12–14, the…
  vec3.mirrored (property) — Mirror a point across the plane through `planePoint` with `planeNormal`…
  vec3.almostEqual (property) — Fuzzy equality by squared distance (C# `Vector3.bAlmostEqual`)
  vec3.almostZero (property) — Fuzzy zero-length test (C# `Vector3.bAlmostZero`)
  vec3.isFinite (property) — All components finite (C# `Vector3.bIsFinite`)
localFrame (constant) [9 members] — ShapeKernel `LocalFrame` construction helpers over the numerics `Frame`
  localFrame.identity (property) — World-aligned frame at the origin (C# `LocalFrame()`)
  localFrame.create (property) — World-aligned axes at a position (C# `LocalFrame(vecPos)`)
  localFrame.at (property) — Same axes as the base frame at a new position…
  localFrame.createZ (property) — Position + local Z
  localFrame.createZX (property) — Position + local Z + local X
  localFrame.translated (property) — Translated frame, axes unchanged (C# `oTranslate` / `oGetTranslatedFrame`)
  localFrame.rotated (property) — All axes rotated about an axis, position unchanged (C# `oRotate`…
  localFrame.inverted (property) — Selected axes negated, position unchanged (C# `oGetInvertFrame`
  localFrame.localY (property) — Y completing Z and X right-handedly (C# `vecGetLocalY`
meshUtility (constant) [5 members] — ShapeKernel `MeshUtility` (static class → const object
  meshUtility.meshFromGrid (property) — Mesh from a regular point grid, quad by quad (C#…
  meshUtility.meshFromQuad (property) — Mesh from one quad (C# `mshFromQuad`)
  meshUtility.applyTransformation (property) — New mesh with the transformation applied per vertex (C# `mshApplyTransformation`)
  meshUtility.voxApplyTransformation (property) — Voxels → mesh → per-vertex transform → voxels (C# `voxApplyTransformation`)
  meshUtility.translateMeshOntoFrame (property) — Mesh re-expressed from the input frame onto the output frame…
sh (constant) [12 members] — ShapeKernel `Sh` — the headless subset, session-first
  sh.latFromLine (property) — Beams along a point list (C# `latFromLine`)
  sh.addLine (property) — Adds a point list to an existing lattice (C# `AddLine`)
  sh.latFromPoints (property) — Node-only lattice from a point cloud (C# `latFromPoints`)
  sh.latFromEdges (property) — Beams along multiple point lists (C# `latFromEdges`)
  sh.latFromPoint (property) — Node-only lattice from one point (C# `latFromPoint`)
  sh.latFromGrid (property) — Lattice from a grid
  sh.latFromBeam (property) — One beam, constant radius (C# `latFromBeam`)
  sh.latFromTaperedBeam (property) — One beam, variable radius (C# `latFromBeam` overload)
  sh.exportMeshToStl (property) — Binary STL bytes of a mesh (C# `ExportMeshToSTLFile` — bytes,…
  sh.exportVoxelsToStl (property) — Binary STL bytes of a voxel field via meshing (C#…
  sh.exportVoxelsToVdb (property) — VDB bytes of a voxel field (C# `ExportVoxelsToVDBFile`)
  sh.exportVoxelsToCli (property) — CLI slice bytes of a voxel field (C# `ExportVoxelsToCLIFile`)
splineOps (constant) [22 members] — ShapeKernel `SplineOperations` (static class → const object)
  splineOps.linearInterpolation (property) — Linearly interpolated points from start to end inclusive (C# `aGetLinearInterpolation`)
  splineOps.snappedSpline (property) — Each point snapped to the closest surface point of the…
  splineOps.reparametrizedByCount (property) — Resample to a target count with constant spacing
  splineOps.reparametrizedBySpacing (property) — Resample to a target spacing (min 10 samples, C# spacing…
  splineOps.lengthsAtIndices (property) — Cumulative arc length at each index (C# `aGetLengthsAtIndices`)
  splineOps.averagePointSpacing (property) — Average spacing between consecutive points (C# `fGetAveragePointSpacing`)
  splineOps.totalLength (property) — Total arc length (C# `fGetTotalLength`)
  splineOps.splitAt (property) — Split at an index into two non-overlapping lists (C# `aSplitLists`)
  splineOps.combine (property) — Concatenate lists (C# `aCombineLists`)
  splineOps.rotatedAroundZ (property) — Every point rotated about the absolute Z axis (C# `aRotateListAroundZ`)
  splineOps.translated (property) — Every point translated (C# `aTranslateList`)
  splineOps.scaled (property) — Every point scaled about the origin (C# `aScaleList`)
  splineOps.nurbsSpline (property) — NURBS smoothing via a degree-2 open BSpline (C# `aGetNURBSpline`)
  splineOps.overSampled (property) — Linear oversampling with N samples per step (C# `aOverSampleList`)
  splineOps.subSampled (property) — Every Nth point, end preserved (C# `aSubSampleList`)
  splineOps.ontoFrame (property) — Every point moved onto a frame's coordinate system (C# `aTranslateListOntoFrame`)
  splineOps.inFrame (property) — Every point expressed relative to a frame (C# `aExpressListInFrame`)
  splineOps.rotatedAroundAxis (property) — Every point rotated about an arbitrary axis (C# `aRotateListAroundAxis`)
  splineOps.average (property) — Average of all positions (C# `vecGetAverage`)
  splineOps.closestPoint (property) — The list point closest to `start` (C# `vecGetClosestPoint`)
  splineOps.distanceToClosestPoint (property) — Distance to the closest list point (C# `fGetDistanceToClosestPoint`)
  splineOps.clusteredPoints (property) — Greedy clustering
uf (constant) [13 members] — ShapeKernel `Uf` (the "useful formulas" grab-bag)
  uf.transFixed (property) — BSpline-eased transition between two values at position s in 0..1…
  uf.vecTransFixed (property) — Component-wise transFixed between two points (C# `vecTransFixed`)
  uf.transSmooth (property) — tanh-smoothed transition between two values (C# `fTransSmooth`)
  uf.vecTransSmooth (property) — tanh-smoothed transition between two points (C# `vecTransSmooth`)
  uf.randomGaussian (property) — Box-Muller gaussian sample (C# `fGetRandomGaussian`)
  uf.randomLinear (property) — Uniform sample in [min, max) (C# `fGetRandomLinear`)
  uf.randomBool (property) — Fair coin (C# `bGetRandomBool`)
  uf.fibonacciCirclePoints (property) — Fibonacci-distributed points in a 2D disc (C# `aGetFibonacciCirlePoints`)
  uf.fibonacciSpherePoints (property) — Fibonacci-distributed points on a 3D sphere surface (C# `aGetFibonacciSpherePoints`)
  uf.superShapeRadius (property) — Superformula radius at a polar angle, reference radius 1 (C#…
  uf.superShapeRadiusPreset (property) — Superformula radius from a preset (C# preset overload)
  uf.polygonRadius (property) — Regular-polygon radius at a polar angle, inscribed in the unit…
  uf.polygonRadiusPreset (property) — Regular-polygon radius from a preset (C# preset overload)
vecOps (constant) [24 members] — ShapeKernel `VecOperations` (Hungarian prefixes dropped)
  vecOps.cylPoint (property) — Cartesian point from cylindrical coordinates (C# `vecGetCylPoint`)
  vecOps.sphPoint (property) — Cartesian point from spherical coordinates, theta measured from the XY…
  vecOps.radius (property) — Planar (XY) radius about the absolute Z axis (C# `fGetRadius`…
  vecOps.phi (property) — Planar polar angle about the absolute Z axis, radians (C#…
  vecOps.theta (property) — Elevation angle from the XY plane, radians (C# `fGetTheta`)
  vecOps.setRadius (property) — Same phi and z, new radius (C# `vecSetRadius`)
  vecOps.setPhi (property) — Same radius and z, new phi (C# `vecSetPhi`)
  vecOps.setZ (property) — Same radius and phi, new z (C# `vecSetZ`)
  vecOps.updateRadius (property) — Radially shifted by deltaRadius (C# `vecUpdateRadius`)
  vecOps.updatePhi (property) — Turned about the absolute Z axis by deltaPhi (C# `vecUpdatePhi`)
  vecOps.updateZ (property) — Vertically shifted by deltaZ (C# `vecUpdateZ`)
  vecOps.planarDir (property) — Normalized planar radial direction from the Z axis to the…
  vecOps.flipForAlignment (property) — The vector or its negation, whichever aligns better with the…
  vecOps.checkAlignment (property) — True when the direction points the same way as the…
  vecOps.rotateAroundZ (property) — Rotate a point about the absolute Z axis through an…
  vecOps.orthogonalDir (property) — An arbitrary direction orthogonal to the given one (C# `vecGetOrthogonalDir`)
  vecOps.angleBetween (property) — Minimum angle between two vectors, radians (C# `fGetAngleBetween`)
  vecOps.signedAngleBetween (property) — Minimum SIGNED angle between two vectors about a reference normal…
  vecOps.rotateAroundAxis (property) — Rotate a point about an arbitrary axis through an optional…
  vecOps.directionToAxis (property) — Radial direction from a frame's Z axis to the point,…
  vecOps.radiusToAxis (property) — Radius from a frame's Z axis to the point (C#…
  vecOps.phiToAxis (property) — Polar angle about a frame's Z axis to the point…
  vecOps.cylindricalInterpolation (property) — Cylindrically interpolated point between two points (C# `vecCylindricalInterpolation`)
  vecOps.sphericalInterpolation (property) — Spherically interpolated point between two points (C# `vecSphericalInterpolation`)
