# picovoxel API index

picovoxel 0.1.0-beta.0 · 715 symbols · extracted by TypeScript 5.9.3.

Every symbol appears here exactly once. The heading above each block names the file with its signature.

## Interfaces — `api-interfaces.md`

AddBeamOptions (interface) [6 members]
  AddBeamOptions.start (property)
  AddBeamOptions.end (property)
  AddBeamOptions.radius (property) — Uniform radius
  AddBeamOptions.startRadius (property)
  AddBeamOptions.endRadius (property)
  AddBeamOptions.roundCap (property) — Hemispherical end caps (SG12 default)
Bounds (interface) [2 members] — An axis-aligned box in millimetres
  Bounds.min (property)
  Bounds.max (property)
CreatePicoOptions (interface) — `createPico` options
CreatePicoRuntimeOptions (interface) [2 members] — Options that shape a runtime
  CreatePicoRuntimeOptions.wasm (property) — Emscripten Module overrides (e.g
  CreatePicoRuntimeOptions.wasmModule (property) — A compiled `WebAssembly.Module` of this entry's wasm (`pico.wasm` for the…
CreatePicoSessionOptions (interface) [7 members] — Options that shape a session
  CreatePicoSessionOptions.voxelSize (property) — Voxel edge length in millimetres
  CreatePicoSessionOptions.memoryWarningBytes (property) — Native-memory warning threshold in bytes (default 1 GiB)
  CreatePicoSessionOptions.lane (property) — SKv2-0 V0.5 (§14.1) — the named lane bundle
  CreatePicoSessionOptions.fastRenorm (property) — Session-wide default for the offset family's `fastRenorm` (SK-0.8 first-order renormalization…
  CreatePicoSessionOptions.serialLattice (property) — SKv2-0 V0.6 — routes lattice rendering down the serial C#-identical…
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
  Lattice.handle (property) — Raw ABI handle — escape hatch (§10)
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
Mesh (interface) [16 members]
  Mesh.vertices (property) — Vertex positions, xyz triples in mm
  Mesh.triangles (property) — Triangle corner indices, triples
  Mesh.vertexCount (property)
  Mesh.triangleCount (property)
  Mesh.bounds (method) — Bounding box
  Mesh.transform (method) — Pure transformed copy
  Mesh.mirror (method) — Pure mirrored copy across the plane through `point` with `normal`
  Mesh.merged (method) — Pure concatenation — no dedup, no boolean (as upstream Append…
  Mesh.toVoxels (method) — Voxelizes the (closed) mesh
  Mesh.shellVoxels (method) — SG13 — offset in ALL directions from a not-necessarily-closed mesh
  Mesh.toStl (method) — SG7 — binary STL bytes with the UNITS= header convention
  Mesh.toGlb (method) — GLB container (positions + indices)
  Mesh.lane (property) — §14.1 value-class provenance, inherited from the producing voxels/mesh chain
  Mesh.handle (property) — Raw ABI handle — escape hatch (§10)
  Mesh.dispose (method) — Optional
  Mesh.[Symbol.dispose] (method)
Metadata (interface) [9 members]
  Metadata.count (property) — Number of entries in the table
  Metadata.names (method) — Every entry name, index order
  Metadata.typeOf (method)
  Metadata.get (method) — Typed read
  Metadata.set (method) — SG3 — reserved names (`PicoGK.*`, `class`, `name`, `file_*`) throw
  Metadata.remove (method) — SG3 guard applies here too
  Metadata.handle (property) — Raw ABI handle — escape hatch (§10)
  Metadata.dispose (method) — Optional
  Metadata.[Symbol.dispose] (method)
Pico (interface) [24 members]
  Pico.voxelSize (property)
  Pico.lane (property) — SKv2-0 V0.5 — the RESOLVED session lane (never `'auto'`
  Pico.name (property)
  Pico.version (property)
  Pico.buildInfo (property)
  Pico.voxelToMm (method) — Convert voxel-index coordinates to world millimetres
  Pico.mmToVoxel (method) — Convert world millimetres to integer voxel indices (fixes upstream B2)
  Pico.createVoxels (method)
  Pico.createMesh (method) — Builds a mesh from vertex/triangle data via the bulk imports…
  Pico.createLattice (method)
  Pico.createPolyLine (method)
  Pico.createScalarField (method)
  Pico.createVectorField (method)
  Pico.createVdb (method) — An empty writable .vdb container
  Pico.openVdb (method) — Opens .vdb bytes as a container for field-level access
  Pico.vdbVoxelSize (method) — SG5 handshake — the voxel size recorded in .vdb bytes…
  Pico.voxelsFromVdb (method) — SG5 — first GRID_LEVEL_SET field wins
  Pico.meshFromStl (method) — SG7 — binary STL bytes to a mesh (UNITS= header…
  Pico.memory (property) — PicoGK-side memory usage in bytes, per object type
  Pico.allocated (property) — PicoGK's own per-type allocation counters — the leak oracle
  Pico.module (property) — §10 escape hatch
  Pico.handle (property) — §10 escape hatch
  Pico.dispose (method) — Deterministic teardown
  Pico.[Symbol.dispose] (method)
PicoRuntime (interface) [3 members] — One instantiated wasm module — plus, on `picovoxel/multi`, its warm…
  PicoRuntime.createPico (method) — Opens a session on this runtime
  PicoRuntime.dispose (method) — Disposes every open session, then terminates the pthread pool
  PicoRuntime.[Symbol.dispose] (method)
PolyLine (interface) [10 members]
  PolyLine.addVertex (method) — Appends one vertex
  PolyLine.addVertices (method) — Appends many vertices
  PolyLine.vertices (property) — All vertices, index order
  PolyLine.vertexCount (property)
  PolyLine.color (property) — RGBA, each 0..1, as the line was created
  PolyLine.bounds (method)
  PolyLine.memUsage (property)
  PolyLine.handle (property) — Raw ABI handle — escape hatch (§10)
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
  ScalarField.signedDistanceAt (method) — SG6 — stored values are voxel-unit signed distance
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
  ShellOptions.fastRenorm (property) — SK-0.8 — see `offset({ fastRenorm })`
SurfaceNormalFieldOptions (interface) [4 members]
  SurfaceNormalFieldOptions.surfaceThresholdVx (property) — Active values with |sd| above this (voxel units) are skipped…
  SurfaceNormalFieldOptions.directionFilter (property) — Keep only normals within the tolerance of this direction (C#…
  SurfaceNormalFieldOptions.directionFilterTolerance (property) — Allowed |1 - dot| deviation, 0..1 (C# `fDirectionFilterTolerance`)
  SurfaceNormalFieldOptions.scaleBy (property) — Component-wise scale applied to stored normals (C# `vecScaleBy`)
ToStlOptions (interface) [4 members]
  ToStlOptions.unit (property)
  ToStlOptions.scale (property) — Scale applied while still in mm, after offset
  ToStlOptions.offset (property) — Offset in mm, applied first
  ToStlOptions.acceptLane (property) — §14.1 — acknowledges, for this one export, that the geometry…
VdbFile (interface) [10 members]
  VdbFile.fieldCount (property)
  VdbFile.fields (method) — Name + type of every field, index order
  VdbFile.add (method) — Adds a field under `name`
  VdbFile.getVoxels (method)
  VdbFile.getScalarField (method)
  VdbFile.getVectorField (method)
  VdbFile.toBytes (method) — Serialises the container to .vdb bytes
  VdbFile.handle (property) — Raw ABI handle — escape hatch (§10)
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
  Voxels.equals (method) — Content equality (SG10-guarded)
  Voxels.isEmpty (property) — SG2 — THE emptiness oracle
  Voxels.offset (method) — Pure surface offset
  Voxels.doubleOffset (method) — Two offsets in sequence (closing/opening when signs differ)
  Voxels.smoothen (method) — SG9 — in, 2× out, in again
  Voxels.fillet (method) — SG9 — over-offset composition
  Voxels.shell (method) — Shell
  Voxels.trim (method) — Everything outside the box is trimmed away (cube-mesh intersect, as…
  Voxels.projectZSlice (method) — Projects the slice at startZ through endZ (mm)
  Voxels.withMesh (method) — Pure
  Voxels.withLattice (method) — Pure
  Voxels.withImplicit (method) — Pure
  Voxels.maskedByImplicit (method) — The gyroid-in-sphere idiom
  Voxels.volume (property) — Volume in mm³ from the raw grid — fast but…
  Voxels.properties (method) — SG1 — the correct volume (mm³), surface area (mm²) and…
  Voxels.gridHash (method) — SKv2-0 V0.1 — the G0 canonical grid hash (NON-DETERMINISM.md §14.5)
  Voxels.densifyInterior (method) — Oracle test tooling
  Voxels.bounds (method) — SG1 — bounding box via the intermediate mesh (the only…
  Voxels.isInside (method) — True if the point is at or below the surface
  Voxels.surfaceNormal (method) — Surface normal at a point on the surface (use after…
  Voxels.closestPointOnSurface (method) — Closest surface point, or null when the field is empty
  Voxels.raycastToSurface (method) — Ray-surface intersection, or null on a miss
  Voxels.raycastBatch (method) — SKv2-0 V0.11 (P8) — N rays over ONE cached intersector…
  Voxels.closestPointsOnSurface (method) — SKv2-0 V0.11 (P8) — N closest-surface-point queries over one index…
  Voxels.dimensions (method) — Field extent in discrete voxel units
  Voxels.sliceCount (property) — Number of Z slices
  Voxels.sliceOrigin (method) — Real-world origin of slice `index` in mm
  Voxels.getSlice (method) — One slice image
  Voxels.toMesh (method)
  Voxels.toScalarField (method)
  Voxels.metadata (property)
  Voxels.memUsage (property)
  Voxels.lane (property) — §14.1 value-class provenance
  Voxels.handle (property) — Raw ABI handle — escape hatch (§10)
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
  Slice.lane (property) — §14.1 value-class provenance of the sliced voxels (`'exact'` or absent…
SliceContour (interface) [2 members]
  SliceContour.points (property) — Flat [x0, y0, x1, y1, …] loop in mm
  SliceContour.winding (property) — Solid boundaries are CCW, holes CW (upstream contract)
SliceStack (interface) [3 members]
  SliceStack.slices (property)
  SliceStack.bounds (property) — XY bounds over every contour + Z from first/last layer
  SliceStack.lane (property) — §14.1 value-class provenance (`'exact'` or absent = exact)
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

AllocatedCounts (type)
Color (type) — RGBA color, each channel 0..1
CreateScalarFieldOptions (type)
CreateVectorFieldOptions (type)
CreateVoxelsOptions (type)
GetSliceOptions (type)
Mat4 (type) — 4x4 transform, column-major in System.Numerics order (row-vector convention
MetadataType (type)
MetadataValue (type)
PicoErrorCode (type)
SdfExpression (type) — A serializable SDF
SdfFunction (type) — Signed distance in millimetres at (x, y, z) — scalars,…
SdfOperator (type)
SliceAxis (type)
SliceMode (type) — SG8 — modes are pure post-processing over the native narrow-band…
StlUnit (type)
TransformOptions (type)
VdbFieldType (type)
Vec3 (type) — A 3D coordinate or direction, `[x, y, z]`, in millimetres…
Overhang (type) — Normalized overhang severity 0..1 (C# `PicoGK.Numerics.Overhang`)
Quat (type) — A rotation quaternion as [x, y, z, w] (System.Numerics `Quaternion`…
Rad (type) — An angle in radians (C# `PicoGK.Numerics.Rad`)
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

## Classs — `api-classs.md`

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
RegularUnitCell (class) [2 members] — A grid of just one unit cell, centred in XY…
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
BasePipe (class) [21 members] — Pipe (annular cylinder) along a straight frame or spine (C#…
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
LineModulation (class) [7 members] — 1D modulation
  LineModulation.constValue (property) — The constant value when built from one (C# public `m_fConstValue`)
  LineModulation.constructor (constructor)
  LineModulation.fromPoints (method) — From a discrete point list
  LineModulation.modulation (method) — The modulation value at a 0..1 ratio (C# `fGetModulation`)
  LineModulation.add (method) — Sum of two modulations (C# `operator +`)
  LineModulation.sub (method) — Difference of two modulations (C# `operator -`)
  LineModulation.scale (method) — Scaled modulation (C# `operator *`)
MeshBuilder (class) [3 members] — Accumulates upstream-style per-triangle geometry, built through ONE bulk `createMesh` call
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
emptyBounds (function) — SG15 — the empty-bounds sentinel the ABI structs use (`BBox3()`…
isEmptyBounds (function) — True for the SG15 sentinel (an empty mesh/field produced it)
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

conformalShowcaseShapes (constant) — The three modulated demo shapes conformal arrays showcase (C# `ConformalShowcaseShapes`)
TWO_PI (constant) — 2π (C# `Rad.TwoPi`)
cylindrical (constant) — `Cylindrical` factories and conversions
frame (constant) — `Frame` factories and operations (C# `Frame3d` surface
mat4 (constant) — `Matrix4x4` operations
overhang (constant) — `Overhang` factories and accessors
polar (constant) — `Polar` factories and conversions
quat (constant) — `Quaternion` operations
rad (constant) — `Rad` factories, constants and helpers
scalar (constant) — Fuzzy scalar comparisons (C# `ComparisonExtensions` on `float`)
spherical (constant) — `Spherical` factories and conversions
tolerances (constant) — Default tolerances for fuzzy comparisons (C# `PicoGK.Numerics.Tolerances`)
vec2 (constant) — `Vector2` operations
vec3 (constant) — `Vector3` operations
localFrame (constant) — ShapeKernel `LocalFrame` construction helpers over the numerics `Frame`
meshUtility (constant) — ShapeKernel `MeshUtility` (static class → const object
sh (constant) — ShapeKernel `Sh` — the headless subset, session-first
splineOps (constant) — ShapeKernel `SplineOperations` (static class → const object)
uf (constant) — ShapeKernel `Uf` (the "useful formulas" grab-bag)
vecOps (constant) — ShapeKernel `VecOperations` (Hungarian prefixes dropped)
