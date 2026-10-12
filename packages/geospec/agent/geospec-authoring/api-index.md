# geospec API index

geospec 0.1.0-beta.1 · 370 symbols · extracted by TypeScript 5.9.3.

Every symbol appears here exactly once. The heading above each block names the file with its signature; grep the skill directory for `name(` to land on the declaration directly.

## Functions — `api-functions.md`

createGeoSpec (function) — Create a GeoSpec instance
describe (function) [1 members] — GeoSpec suite helper used inside VM-executed test modules
  describe.skip (method)
expectGeo (function) — Start a geometry assertion chain
it (function) [1 members] — GeoSpec test helper used inside VM-executed test modules
  it.skip (method)
test (function) [1 members] — Alias for {@link it}
  test.skip (method)
createModelLoader (function) — Create a {@link loadModel} function with shared defaults
loadModel (function) — Load a CAD model into GeoSpec evidence
resolveRuntimeExportIntent (function)

## Constants — `api-constants.md`

geoSpecMatcherNames (constant) — Every matcher name exposed by {@link expectGeo}, derived from the…

## Types — `api-types.md`

GeoSpec (type) [2 members] — Stateful GeoSpec API created by {@link createGeoSpec}
  GeoSpec.loadMesh (method)
  GeoSpec.analyzeMesh (method)
GeoSpecSubject (type) [1 members] — A model admitted by one live GeoSpec host scope
  GeoSpecSubject.[subjectBrand] (property)
GeoSpecUnit (type) — Geometry units accepted at GeoSpec evidence-loading boundaries
GeoSpecAssertion (type) [8 members] — Geometry assertion collected from a GeoSpec test module
  GeoSpecAssertion.kind (property) — Assertion kind
  GeoSpecAssertion.subject (property) — User-authored value passed to expectGeo()
  GeoSpecAssertion.expected (property) — Expected geometry condition
  GeoSpecAssertion.passed (property) — True when the assertion evaluated successfully
  GeoSpecAssertion.diagnostics (property) — Structured diagnostics from matcher evaluation
  GeoSpecAssertion.report (property) — Exact compiled assertion report, including core-owned bytes and polarity
  GeoSpecAssertion.loadId (property) — The host load which admitted this assertion's subject
  GeoSpecAssertion.durationMs (property) — Wall-clock cost of matcher evaluation in milliseconds (R1
GeoSpecAssemblyOccurrenceExpectation (type) [3 members] — Assembly occurrence rule accepted by `expectGeo(...).toHaveAssemblyOccurrences(...)`
  GeoSpecAssemblyOccurrenceExpectation.name (property)
  GeoSpecAssemblyOccurrenceExpectation.count (property)
  GeoSpecAssemblyOccurrenceExpectation.bounds (property)
GeoSpecAssemblyOccurrencesExpectation (type) [2 members] — Assembly occurrence expectation accepted by `expectGeo(...).toHaveAssemblyOccurrences(...)`
  GeoSpecAssemblyOccurrencesExpectation.occurrences (property)
  GeoSpecAssemblyOccurrencesExpectation.uniqueNames (property)
GeoSpecAxisExpectation (type) [3 members] — Axis-keyed numeric expectation used by high-level geometry matchers
  GeoSpecAxisExpectation.x (property)
  GeoSpecAxisExpectation.y (property)
  GeoSpecAxisExpectation.z (property)
GeoSpecBoundingBoxExpectation (type) [5 members] — Bounding-box expectation accepted by `expectGeo(...).toHaveBoundingBox(...)`
  GeoSpecBoundingBoxExpectation.min (property)
  GeoSpecBoundingBoxExpectation.max (property)
  GeoSpecBoundingBoxExpectation.size (property)
  GeoSpecBoundingBoxExpectation.center (property)
  GeoSpecBoundingBoxExpectation.tolerance (property)
GeoSpecCenterOfMassExpectation (type) [2 members] — Center-of-mass expectation accepted by `expectGeo(...).toHaveCenterOfMass(...)`
  GeoSpecCenterOfMassExpectation.point (property)
  GeoSpecCenterOfMassExpectation.tolerance (property)
GeoSpecChamferFeatureExpectation (type) [3 members] — Chamfer-feature expectation accepted by `expectGeo(...).toHaveChamferFeature(...)`
  GeoSpecChamferFeatureExpectation.distance (property)
  GeoSpecChamferFeatureExpectation.selection (property)
  GeoSpecChamferFeatureExpectation.tolerance (property)
GeoSpecCircularHoleExpectation (type) [5 members] — Circular-hole expectation accepted by `expectGeo(...).toHaveCircularHole(...)`
  GeoSpecCircularHoleExpectation.diameter (property)
  GeoSpecCircularHoleExpectation.through (property)
  GeoSpecCircularHoleExpectation.axis (property)
  GeoSpecCircularHoleExpectation.center (property)
  GeoSpecCircularHoleExpectation.tolerance (property)
GeoSpecCylindricalFaceExpectation (type) [3 members] — Cylindrical-face expectation accepted by `expectGeo(...).toHaveCylindricalFace(...)`
  GeoSpecCylindricalFaceExpectation.radius (property)
  GeoSpecCylindricalFaceExpectation.axis (property)
  GeoSpecCylindricalFaceExpectation.tolerance (property)
GeoSpecComponentInterferenceAllowance (type) [5 members] — Intentional component interference allowance accepted by `expectGeo(...).toHaveNoComponentInterference(...)`
  GeoSpecComponentInterferenceAllowance.kind (property)
  GeoSpecComponentInterferenceAllowance.left (property)
  GeoSpecComponentInterferenceAllowance.right (property)
  GeoSpecComponentInterferenceAllowance.maxVolume (property)
  GeoSpecComponentInterferenceAllowance.reason (property)
GeoSpecComponentInterferenceExpectation (type) [3 members] — Component-interference expectation accepted by `expectGeo(...).toHaveNoComponentInterference(...)`
  GeoSpecComponentInterferenceExpectation.tolerance (property)
  GeoSpecComponentInterferenceExpectation.pairs (property)
  GeoSpecComponentInterferenceExpectation.allowances (property)
GeoSpecComponentInterferencePairExpectation (type) [2 members] — A pair-specific component-interference check accepted by `expectGeo(...).toHaveNoComponentInterference(...)`
  GeoSpecComponentInterferencePairExpectation.left (property)
  GeoSpecComponentInterferencePairExpectation.right (property)
GeoSpecConnectedComponentsExpectation (type) [3 members] — Connected-components expectation accepted by `expectGeo(...).toHaveConnectedComponents(...)`
  GeoSpecConnectedComponentsExpectation.count (property)
  GeoSpecConnectedComponentsExpectation.tolerance (property)
  GeoSpecConnectedComponentsExpectation.toleranceMm (property)
GeoSpecGeometrySelector (type) — Geometry selector used by inspection and spatial relationship matchers
GeoSpecMatcher (type) [27 members] — Assertion chain returned by `expectGeo(subject)`
  GeoSpecMatcher.not (property) — Core-owned negation
  GeoSpecMatcher.toSatisfyRationalPlate (method) — Assert the fixed rational plate contract
  GeoSpecMatcher.toSatisfyParallelPlaneDistance (method) — Assert the fixed parallel-plane distance contract
  GeoSpecMatcher.toHaveBoundingBox (method) — Assert axis-aligned bounds, size, or center for a loaded geometry…
  GeoSpecMatcher.toHaveConnectedComponents (method) — Assert how many spatially disjoint chunks the mesh contains
  GeoSpecMatcher.toBeWatertight (method) — Assert closed mesh edge incidence
  GeoSpecMatcher.toHaveNoComponentInterference (method) — Assert that separate assembly components do not occupy the same…
  GeoSpecMatcher.toHaveAssemblyOccurrences (method) — Assert that named assembly occurrences exist with expected counts and…
  GeoSpecMatcher.toHaveSpatialRelationships (method) — Assert that selected entities satisfy declared spatial relationships
  GeoSpecMatcher.toHaveMeshIntegrity (method) — Assert rendered mesh evidence is internally trustworthy for downstream checks
  GeoSpecMatcher.toHaveNoDiagnostics (method) — Assert that the subject carries no diagnostics at the rejected…
  GeoSpecMatcher.toHaveSurfaceArea (method) — Assert total surface area, preferring exact BRep mass properties when…
  GeoSpecMatcher.toHaveVolume (method) — Assert enclosed volume, preferring exact BRep mass properties when available
  GeoSpecMatcher.toHaveMass (method) — Assert mass derived from exact mass properties or volume times…
  GeoSpecMatcher.toHaveCenterOfMass (method) — Assert the center of mass or mesh-derived centroid for a…
  GeoSpecMatcher.toBeValidBrep (method) — Assert that exact BRep evidence reports a valid shape
  GeoSpecMatcher.toHaveTopologyCounts (method) — Assert exact BRep topology counts
  GeoSpecMatcher.toHaveStepUnits (method) — Assert the STEP unit evidence
  GeoSpecMatcher.toHaveProductStructure (method) — Assert STEP product-structure evidence
  GeoSpecMatcher.toHavePlanarFace (method) — Assert that BRep evidence contains a planar face matching the…
  GeoSpecMatcher.toHaveCylindricalFace (method) — Assert that BRep evidence contains a cylindrical face with the…
  GeoSpecMatcher.toHaveCircularHole (method) — Assert that BRep evidence contains a circular hole matching diameter,…
  GeoSpecMatcher.toHaveCircularHolePattern (method) — Assert that BRep evidence contains a repeated circular-hole pattern
  GeoSpecMatcher.toHaveChamferFeature (method) — Assert that BRep evidence contains a chamfer feature with the…
  GeoSpecMatcher.toHaveFilletFeature (method) — Assert that BRep evidence contains a fillet feature with the…
  GeoSpecMatcher.toHaveMinimumWallThickness (method) — Assert that BRep evidence reports a minimum wall thickness satisfying…
  GeoSpecMatcher.toHaveVoidContinuity (method) — Assert that the declared waypoints share one connected void, stay…
GeoSpecMassExpectation (type) [3 members] — Mass expectation accepted by `expectGeo(...).toHaveMass(...)`
  GeoSpecMassExpectation.value (property)
  GeoSpecMassExpectation.density (property)
  GeoSpecMassExpectation.tolerance (property)
GeoSpecMeshIntegrityExpectation (type) [5 members] — Mesh integrity expectation accepted by `expectGeo(...).toHaveMeshIntegrity(...)`
  GeoSpecMeshIntegrityExpectation.finitePositions (property)
  GeoSpecMeshIntegrityExpectation.degenerateTriangles (property)
  GeoSpecMeshIntegrityExpectation.duplicateFaces (property)
  GeoSpecMeshIntegrityExpectation.watertight (property)
  GeoSpecMeshIntegrityExpectation.triangleCount (property)
GeoSpecNoDiagnosticsExpectation (type) [1 members] — Diagnostic severities rejected by `expectGeo(...).toHaveNoDiagnostics(...)`
  GeoSpecNoDiagnosticsExpectation.severities (property)
GeoSpecMinimumWallThicknessExpectation (type) [2 members] — Minimum-wall-thickness expectation accepted by `expectGeo(...).toHaveMinimumWallThickness(...)`
  GeoSpecMinimumWallThicknessExpectation.value (property)
  GeoSpecMinimumWallThicknessExpectation.tolerance (property)
GeoSpecCircularHolePatternExpectation (type) [6 members] — Circular-hole-pattern expectation accepted by `expectGeo(...).toHaveCircularHolePattern(...)`
  GeoSpecCircularHolePatternExpectation.count (property)
  GeoSpecCircularHolePatternExpectation.holeDiameter (property)
  GeoSpecCircularHolePatternExpectation.boltCircleDiameter (property)
  GeoSpecCircularHolePatternExpectation.axis (property)
  GeoSpecCircularHolePatternExpectation.center (property)
  GeoSpecCircularHolePatternExpectation.tolerance (property)
GeoSpecFilletFeatureExpectation (type) [3 members] — Fillet-feature expectation accepted by `expectGeo(...).toHaveFilletFeature(...)`
  GeoSpecFilletFeatureExpectation.radius (property)
  GeoSpecFilletFeatureExpectation.selection (property)
  GeoSpecFilletFeatureExpectation.tolerance (property)
GeoSpecNumericExpectation (type) — Shared scalar expectation used by geometry measurements
GeoSpecPlanarFaceExpectation (type) [4 members] — Planar-face expectation accepted by `expectGeo(...).toHavePlanarFace(...)`
  GeoSpecPlanarFaceExpectation.normal (property)
  GeoSpecPlanarFaceExpectation.offset (property)
  GeoSpecPlanarFaceExpectation.area (property)
  GeoSpecPlanarFaceExpectation.tolerance (property)
GeoSpecPointExpectation (type) — Point expectation accepted by center and feature matchers
GeoSpecProductStructureExpectation (type) [2 members] — Product-structure expectation accepted by `expectGeo(...).toHaveProductStructure(...)`
  GeoSpecProductStructureExpectation.names (property)
  GeoSpecProductStructureExpectation.count (property)
GeoSpecSpatialRelationshipExpectation (type) [13 members] — One spatial relationship accepted by `expectGeo(...).toHaveSpatialRelationships(...)`
  GeoSpecSpatialRelationshipExpectation.id (property)
  GeoSpecSpatialRelationshipExpectation.kind (property)
  GeoSpecSpatialRelationshipExpectation.subject (property)
  GeoSpecSpatialRelationshipExpectation.target (property)
  GeoSpecSpatialRelationshipExpectation.tolerance (property)
  GeoSpecSpatialRelationshipExpectation.angularToleranceDegrees (property)
  GeoSpecSpatialRelationshipExpectation.angleDegrees (property) — Expected angle in degrees for `kind
  GeoSpecSpatialRelationshipExpectation.axis (property) — Declared insertion axis (subject-frame direction) for `kind
  GeoSpecSpatialRelationshipExpectation.min (property)
  GeoSpecSpatialRelationshipExpectation.max (property)
  GeoSpecSpatialRelationshipExpectation.minVolume (property)
  GeoSpecSpatialRelationshipExpectation.maxVolume (property)
  GeoSpecSpatialRelationshipExpectation.reason (property)
GeoSpecSpatialRelationshipsExpectation (type) [1 members] — Spatial relationship expectation accepted by `expectGeo(...).toHaveSpatialRelationships(...)`
  GeoSpecSpatialRelationshipsExpectation.relationships (property)
GeoSpecStepUnitsExpectation (type) [1 members] — STEP unit expectation accepted by `expectGeo(...).toHaveStepUnits(...)`
  GeoSpecStepUnitsExpectation.unit (property)
GeoSpecSurfaceAreaExpectation (type) [2 members] — Surface-area expectation accepted by `expectGeo(...).toHaveSurfaceArea(...)`
  GeoSpecSurfaceAreaExpectation.value (property)
  GeoSpecSurfaceAreaExpectation.tolerance (property)
GeoSpecTopologyCountsExpectation (type) [8 members] — Topology-count expectation accepted by `expectGeo(...).toHaveTopologyCounts(...)`
  GeoSpecTopologyCountsExpectation.vertices (property)
  GeoSpecTopologyCountsExpectation.edges (property)
  GeoSpecTopologyCountsExpectation.wires (property)
  GeoSpecTopologyCountsExpectation.faces (property)
  GeoSpecTopologyCountsExpectation.shells (property)
  GeoSpecTopologyCountsExpectation.solids (property)
  GeoSpecTopologyCountsExpectation.compounds (property)
  GeoSpecTopologyCountsExpectation.tolerance (property)
GeoSpecValidBrepExpectation (type) [6 members] — Exact BRep validity expectation accepted by `expectGeo(...).toBeValidBrep(...)`
  GeoSpecValidBrepExpectation.maxTolerance (property)
  GeoSpecValidBrepExpectation.freeBounds (property)
  GeoSpecValidBrepExpectation.minEdgeLength (property)
  GeoSpecValidBrepExpectation.sameParameter (property)
  GeoSpecValidBrepExpectation.closedShells (property)
  GeoSpecValidBrepExpectation.closedWires (property)
GeoSpecVoidContinuityExpectation (type) [5 members] — Void-continuity expectation accepted by `expectGeo(...).toHaveVoidContinuity(...)`
  GeoSpecVoidContinuityExpectation.path (property) — Ordered waypoints (>= 1) known to lie in the void…
  GeoSpecVoidContinuityExpectation.material (property) — Occurrence names whose solids bound the void
  GeoSpecVoidContinuityExpectation.minCrossSection (property) — Minimum required bottleneck cross-section (mm²), sampled
  GeoSpecVoidContinuityExpectation.isolatedFrom (property) — Points that must NOT be reachable from the path void…
  GeoSpecVoidContinuityExpectation.bounds (property) — Region bounded for the proof (subject frame)
GeoSpecVoidWaypoint (type) — One void-continuity waypoint
GeoSpecVolumeExpectation (type) [2 members] — Volume expectation accepted by `expectGeo(...).toHaveVolume(...)`
  GeoSpecVolumeExpectation.value (property)
  GeoSpecVolumeExpectation.tolerance (property)
BrepEvidence (type) [11 members] — Basic exact or topology-derived BRep evidence consumed by early feature…
  BrepEvidence.validity (property)
  BrepEvidence.topologyCounts (property)
  BrepEvidence.boundingBox (property)
  BrepEvidence.massProperties (property)
  BrepEvidence.planarFaces (property)
  BrepEvidence.cylindricalFaces (property)
  BrepEvidence.circularHoles (property)
  BrepEvidence.circularHolePatterns (property)
  BrepEvidence.chamferFeatures (property)
  BrepEvidence.filletFeatures (property)
  BrepEvidence.minimumWallThickness (property)
GeometryFileFormat (type) — Geometry file formats understood by GeoSpec provenance
GeometryCapability (type) [2 members] — Capability exposed by a loaded subject
  GeometryCapability.kind (property)
  GeometryCapability.feature (property)
GeometryDiagnostic (type) [6 members] — Diagnostic emitted by GeoSpec loaders, analyzers, and matchers
  GeometryDiagnostic.code (property)
  GeometryDiagnostic.severity (property)
  GeometryDiagnostic.message (property)
  GeometryDiagnostic.suggestion (property)
  GeometryDiagnostic.spatial (property)
  GeometryDiagnostic.details (property)
GeometryProvenance (type) [6 members] — Provenance recorded by GeoSpec loaders
  GeometryProvenance.source (property)
  GeometryProvenance.unit (property)
  GeometryProvenance.loader (property)
  GeometryProvenance.contentHash (property)
  GeometryProvenance.parameters (property)
  GeometryProvenance.exportIntent (property)
GeometrySource (type) [5 members] — Source metadata for a loaded geometry subject
  GeometrySource.kind (property)
  GeometrySource.format (property)
  GeometrySource.path (property)
  GeometrySource.name (property)
  GeometrySource.byteLength (property)
GeometrySubject (type) [8 members] — Canonical P0 object under test for GeoSpec
  GeometrySubject.kind (property)
  GeometrySubject.subjectId (property) — Opaque engine-owned identifier used by every protocol claim
  GeometrySubject.mesh (property)
  GeometrySubject.brep (property)
  GeometrySubject.step (property)
  GeometrySubject.provenance (property)
  GeometrySubject.capabilities (property)
  GeometrySubject.diagnostics (property)
GeometrySubjectMeshEvidence (type) [2 members] — Wire-safe mesh summary carried by an opaque geometry subject
  GeometrySubjectMeshEvidence.format (property)
  GeometrySubjectMeshEvidence.stats (property)
MeshEvidence (type) [2 members] — Mesh evidence loaded from geometry bytes or buffers
  MeshEvidence.format (property)
  MeshEvidence.stats (property)
MeshFileFormat (type) — Geometry file formats supported by the P0 mesh loader
MeshQualityStats (type) [8 members] — Triangle quality and scalar mesh metrics used by P0 GeoSpec…
  MeshQualityStats.triangleCount (property)
  MeshQualityStats.nonFiniteVertices (property)
  MeshQualityStats.degenerateTriangles (property)
  MeshQualityStats.duplicateFaces (property)
  MeshQualityStats.triangles (property)
  MeshQualityStats.surfaceArea (property)
  MeshQualityStats.signedVolume (property)
  MeshQualityStats.centerOfMass (property)
MeshTriangle (type) [7 members] — One triangle from mesh evidence, in geometry document coordinates
  MeshTriangle.primitive (property)
  MeshTriangle.triangleIndex (property)
  MeshTriangle.a (property)
  MeshTriangle.b (property)
  MeshTriangle.c (property)
  MeshTriangle.center (property)
  MeshTriangle.area (property)
StepEvidence (type) [6 members] — STEP/XDE evidence extracted while loading a STEP subject
  StepEvidence.schema (property)
  StepEvidence.unit (property)
  StepEvidence.productStructure (property)
  StepEvidence.readStrategy (property)
  StepEvidence.capabilities (property)
  StepEvidence.xde (property) — Structured AP242 XDE read result (occurrences, subshape names, datum placements)
Vec3 (type) — Numeric 3D vector
AnalyzeMeshOptions (type) [8 members] — Analyze source bytes or an already retained subject, never both
  AnalyzeMeshOptions.source (property)
  AnalyzeMeshOptions.format (property)
  AnalyzeMeshOptions.path (property)
  AnalyzeMeshOptions.name (property)
  AnalyzeMeshOptions.unit (property) — Unit exposed by the returned GeoSpec subject
  AnalyzeMeshOptions.sourceUnit (property) — Coordinate unit of the supplied mesh data before normalization
  AnalyzeMeshOptions.parameters (property)
  AnalyzeMeshOptions.subject (property)
AnalyzeMeshResult (type) [1 members] — Mesh analysis result
  AnalyzeMeshResult.success (property)
LoadMeshOptions (type) [7 members] — Options for loading mesh evidence
  LoadMeshOptions.source (property)
  LoadMeshOptions.format (property)
  LoadMeshOptions.path (property)
  LoadMeshOptions.name (property)
  LoadMeshOptions.unit (property) — Unit exposed by the returned GeoSpec subject
  LoadMeshOptions.sourceUnit (property) — Coordinate unit of the supplied mesh data before normalization
  LoadMeshOptions.parameters (property)
LoadMeshResult (type) [1 members] — Result of loading mesh evidence into a GeoSpec geometry subject
  LoadMeshResult.success (property)
GeoSpecVec3 (type) — Numeric 3D vector
GeoSpecExportRoute (type) — Runtime route metadata used to decide whether a runtime export…
RuntimeBackedModelFormat (type)
RuntimeClientWithRoutes (type) [3 members] — Runtime client shape for route-aware Tau runtimes
  RuntimeClientWithRoutes.open (property)
  RuntimeClientWithRoutes.on (method)
  RuntimeClientWithRoutes.bestRouteFor (method)
RuntimeExportIntent (type) [3 members] — Resolved runtime export request and provenance for a GeoSpec model…
  RuntimeExportIntent.options (property)
  RuntimeExportIntent.provenance (property)
  RuntimeExportIntent.sourceUnit (property)
RuntimeExportIntentFailure (type) [2 members] — Structured failure returned when a runtime cannot provide the requested…
  RuntimeExportIntentFailure.success (property)
  RuntimeExportIntentFailure.diagnostics (property)
CreateModelLoaderOptions (type) [10 members] — Defaults accepted by {@link import ('./load-model.js').createModelLoader}
  CreateModelLoaderOptions.engine (property) — Initialized compiled engine supplied by the host, never selected by…
  CreateModelLoaderOptions.readSource (property) — Rooted host reader for direct filesystem or URL sources
  CreateModelLoaderOptions.format (property) — Geometry format to export when an individual call does not…
  CreateModelLoaderOptions.runtime (property) — Runtime client or lazy runtime factory
  CreateModelLoaderOptions.sourceAdapters (property) — Source-specific runtime adapters, e.g
  CreateModelLoaderOptions.projectPath (property) — Project root used by runtime integrations
  CreateModelLoaderOptions.stepStreaming (property) — STEP reader strategy used for STEP sources or exports
  CreateModelLoaderOptions.mesh (property) — Whether STEP loading should also produce mesh evidence
  CreateModelLoaderOptions.meshLinearTolerance (property) — Linear tolerance used while meshing exact BRep evidence
  CreateModelLoaderOptions.meshAngularToleranceDegrees (property) — Angular tolerance in degrees used while meshing exact BRep evidence
GeoSpecModelFormat (type) — Geometry formats accepted by {@link import ('./load-model.js').loadModel}
GeoSpecModelLoader (type) — Function shape used by GeoSpec runners to provide model loading…
ManagedGeoSpecModelLoader (type) [1 members] — A configured loader whose shared runtime can be released with…
  ManagedGeoSpecModelLoader.dispose (method)
GeoSpecRuntimeClient (type) [2 members] — Runtime client surface consumed by `geospec/model`
  GeoSpecRuntimeClient.open (property)
  GeoSpecRuntimeClient.on (method)
GeoSpecRuntimeClientFactory (type) — Lazy runtime factory consumed by `geospec/model`
GeoSpecRuntimeSourceAdapter (type) [3 members] — Explicit source adapter for formats whose runtime setup is not…
  GeoSpecRuntimeSourceAdapter.id (property)
  GeoSpecRuntimeSourceAdapter.extensions (property)
  GeoSpecRuntimeSourceAdapter.createRuntime (method)
LoadModelCodeOptions (type) [11 members] — Inline code-CAD model load options
  LoadModelCodeOptions.code (property) — Source files keyed by project-relative path
  LoadModelCodeOptions.file (property) — Entry path to render from {@link code }
  LoadModelCodeOptions.format (property) — Geometry format to export
  LoadModelCodeOptions.parameters (property) — Explicit parameters passed to the runtime
  LoadModelCodeOptions.runtime (property) — Runtime client or lazy runtime factory
  LoadModelCodeOptions.sourceAdapters (property) — Source-specific runtime adapters, e.g
  LoadModelCodeOptions.projectPath (property) — Project root used by runtime integrations
  LoadModelCodeOptions.stepStreaming (property) — STEP reader strategy used for STEP exports
  LoadModelCodeOptions.mesh (property) — Whether STEP loading should also produce mesh evidence
  LoadModelCodeOptions.meshLinearTolerance (property) — Linear tolerance used while meshing exact BRep evidence
  LoadModelCodeOptions.meshAngularToleranceDegrees (property) — Angular tolerance in degrees used while meshing exact BRep evidence
LoadModelFileOptions (type) [10 members] — Filesystem-backed model load options
  LoadModelFileOptions.file (property) — Project-relative model file to render
  LoadModelFileOptions.projectPath (property) — Project root used by runtime integrations
  LoadModelFileOptions.format (property) — Geometry format to export
  LoadModelFileOptions.parameters (property) — Explicit parameters passed to the runtime
  LoadModelFileOptions.runtime (property) — Runtime client or lazy runtime factory
  LoadModelFileOptions.sourceAdapters (property) — Source-specific runtime adapters, e.g
  LoadModelFileOptions.stepStreaming (property) — STEP reader strategy used for STEP exports
  LoadModelFileOptions.mesh (property) — Whether STEP loading should also produce mesh evidence
  LoadModelFileOptions.meshLinearTolerance (property) — Linear tolerance used while meshing exact BRep evidence
  LoadModelFileOptions.meshAngularToleranceDegrees (property) — Angular tolerance in degrees used while meshing exact BRep evidence
LoadModelOptions (type) [6 members] — Options accepted by {@link import ('./load-model.js').loadModel}
  LoadModelOptions.format (property) — Geometry format to export
  LoadModelOptions.parameters (property) — Explicit parameters passed to the runtime
  LoadModelOptions.stepStreaming (property) — STEP reader strategy used for STEP exports
  LoadModelOptions.mesh (property) — Whether STEP loading should also produce mesh evidence
  LoadModelOptions.meshLinearTolerance (property) — Linear tolerance used while meshing exact BRep evidence
  LoadModelOptions.meshAngularToleranceDegrees (property) — Angular tolerance in degrees used while meshing exact BRep evidence
LoadModelSourceOptions (type) [11 members] — Direct geometry-source model load options
  LoadModelSourceOptions.source (property) — Geometry bytes, path, browser file/blob, or in-memory mesh buffer
  LoadModelSourceOptions.resources (property) — Named external resources consumed alongside the direct geometry bytes
  LoadModelSourceOptions.format (property) — Source geometry format
  LoadModelSourceOptions.path (property) — Source path recorded in provenance
  LoadModelSourceOptions.name (property) — Human-readable source name recorded in provenance
  LoadModelSourceOptions.sourceUnit (property) — Coordinate unit of raw GLB/glTF or mesh-buffer data before canonical…
  LoadModelSourceOptions.parameters (property) — Explicit parameters recorded in provenance
  LoadModelSourceOptions.stepStreaming (property) — STEP reader strategy used for STEP sources
  LoadModelSourceOptions.mesh (property) — Whether STEP loading should also produce mesh evidence
  LoadModelSourceOptions.meshLinearTolerance (property) — Linear tolerance used while meshing exact BRep evidence
  LoadModelSourceOptions.meshAngularToleranceDegrees (property) — Angular tolerance in degrees used while meshing exact BRep evidence

## Classes — `api-classes.md`

GeoSpecModelLoadError (class) [2 members] — Error thrown by {@link import ('./load-model.js').loadModel} when geometry cannot be…
  GeoSpecModelLoadError.diagnostics (property) — Structured diagnostics explaining why model loading failed
  GeoSpecModelLoadError.constructor (constructor)
