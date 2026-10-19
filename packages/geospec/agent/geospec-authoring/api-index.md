# geospec API index

geospec 0.1.0-beta.7 · 364 symbols · extracted by TypeScript 5.9.3.

Every symbol appears here exactly once. The heading above each block names the file with its signature, and each top-level symbol names the lines of that file which hold its declaration and members: read only that range.

## Functions — `api-functions.md`

describe (function) [lines 5-10] [1 members] — GeoSpec suite helper used inside VM-executed test modules
  describe.skip (method)
expectGeo (function) [lines 12-16] — Start a geometry assertion chain
it (function) [lines 18-23] [1 members] — GeoSpec test helper used inside VM-executed test modules
  it.skip (method)
test (function) [lines 25-30] [1 members] — Alias for {@link it}
  test.skip (method)
createModelLoader (function) [lines 32-35] — Create a {@link loadModel} function over a host-supplied compiled engine
loadModel (function) [lines 37-42] — Load a CAD model into GeoSpec evidence
resolveRuntimeExportIntent (function) [lines 44-57]

## Constants — `api-constants.md`

geoSpecMatcherNames (constant) [lines 5-6] — Every matcher name exposed by {@link expectGeo}, derived from the…
geoSpecMeshEvidenceMatchers (constant) [lines 8-9] — The matchers mesh evidence answers, as the GeoSpec authoring skill…
geoSpecRegionScopedKinds (constant) [lines 11-13] — The claims a region-cropped subject answers
geoSpecRegionWholeModelClaimCode (constant) [lines 15-16] — Diagnostic code of a whole-model claim made on a region-cropped…

## Types — `api-types.md`

GeoSpecSubject (type) [lines 5-10] [1 members] — A model admitted by one live GeoSpec host scope
  GeoSpecSubject.[subjectBrand] (property)
GeoSpecUnit (type) [lines 12-14] — Geometry units accepted at GeoSpec evidence-loading boundaries
GeoSpecAssertion (type) [lines 16-66] [9 members] — Geometry assertion collected from a GeoSpec test module
  GeoSpecAssertion.kind (property) — Assertion kind
  GeoSpecAssertion.subject (property) — User-authored value passed to expectGeo()
  GeoSpecAssertion.expected (property) — Expected geometry condition
  GeoSpecAssertion.passed (property) — True when the assertion evaluated successfully
  GeoSpecAssertion.diagnostics (property) — Structured diagnostics from matcher evaluation
  GeoSpecAssertion.report (property) — Exact compiled assertion report, including core-owned bytes and polarity
  GeoSpecAssertion.loadId (property) — The host load which admitted this assertion's subject
  GeoSpecAssertion.region (property) — The crop this assertion's subject was loaded with
  GeoSpecAssertion.durationMs (property) — Wall-clock cost of matcher evaluation in milliseconds (R1
GeoSpecAssemblyOccurrenceExpectation (type) [lines 68-91] [3 members] — Assembly occurrence rule accepted by `expectGeo(...).toHaveAssemblyOccurrences(...)`
  GeoSpecAssemblyOccurrenceExpectation.name (property)
  GeoSpecAssemblyOccurrenceExpectation.count (property)
  GeoSpecAssemblyOccurrenceExpectation.bounds (property)
GeoSpecAssemblyOccurrencesExpectation (type) [lines 93-101] [2 members] — Assembly occurrence expectation accepted by `expectGeo(...).toHaveAssemblyOccurrences(...)`
  GeoSpecAssemblyOccurrencesExpectation.occurrences (property)
  GeoSpecAssemblyOccurrencesExpectation.uniqueNames (property)
GeoSpecAxisExpectation (type) [lines 103-114] [3 members] — Axis-keyed numeric expectation used by high-level geometry matchers
  GeoSpecAxisExpectation.x (property)
  GeoSpecAxisExpectation.y (property)
  GeoSpecAxisExpectation.z (property)
GeoSpecBoundingBoxExpectation (type) [lines 116-133] [5 members] — Bounding-box expectation accepted by `expectGeo(...).toHaveBoundingBox(...)`
  GeoSpecBoundingBoxExpectation.min (property)
  GeoSpecBoundingBoxExpectation.max (property)
  GeoSpecBoundingBoxExpectation.size (property)
  GeoSpecBoundingBoxExpectation.center (property)
  GeoSpecBoundingBoxExpectation.tolerance (property)
GeoSpecCenterOfMassExpectation (type) [lines 135-145] [2 members] — Center-of-mass expectation accepted by `expectGeo(...).toHaveCenterOfMass(...)`
  GeoSpecCenterOfMassExpectation.point (property) — Exact expected point in millimetres
  GeoSpecCenterOfMassExpectation.tolerance (property)
GeoSpecChamferFeatureExpectation (type) [lines 147-158] [3 members] — Chamfer-feature expectation accepted by `expectGeo(...).toHaveChamferFeature(...)`
  GeoSpecChamferFeatureExpectation.distance (property)
  GeoSpecChamferFeatureExpectation.selection (property)
  GeoSpecChamferFeatureExpectation.tolerance (property)
GeoSpecCircularHoleExpectation (type) [lines 160-177] [5 members] — Circular-hole expectation accepted by `expectGeo(...).toHaveCircularHole(...)`
  GeoSpecCircularHoleExpectation.diameter (property)
  GeoSpecCircularHoleExpectation.through (property)
  GeoSpecCircularHoleExpectation.axis (property)
  GeoSpecCircularHoleExpectation.center (property)
  GeoSpecCircularHoleExpectation.tolerance (property)
GeoSpecCylindricalFaceExpectation (type) [lines 179-190] [3 members] — Cylindrical-face expectation accepted by `expectGeo(...).toHaveCylindricalFace(...)`
  GeoSpecCylindricalFaceExpectation.radius (property)
  GeoSpecCylindricalFaceExpectation.axis (property)
  GeoSpecCylindricalFaceExpectation.tolerance (property)
GeoSpecExpectOptions (type) [lines 192-204] [1 members] — Per-chain options accepted by `expectGeo(subject, options)`
  GeoSpecExpectOptions.workUnitLimit (property) — Deterministic work-unit budget for every claim in this chain
GeoSpecComponentInterferenceAllowance (type) [lines 206-223] [5 members] — Intentional component interference allowance accepted by `expectGeo(...).toHaveNoComponentInterference(...)`
  GeoSpecComponentInterferenceAllowance.kind (property)
  GeoSpecComponentInterferenceAllowance.left (property)
  GeoSpecComponentInterferenceAllowance.right (property)
  GeoSpecComponentInterferenceAllowance.maxVolume (property)
  GeoSpecComponentInterferenceAllowance.reason (property)
GeoSpecComponentInterferenceExpectation (type) [lines 225-237] [3 members] — Component-interference expectation accepted by `expectGeo(...).toHaveNoComponentInterference(...)`
  GeoSpecComponentInterferenceExpectation.tolerance (property)
  GeoSpecComponentInterferenceExpectation.pairs (property)
  GeoSpecComponentInterferenceExpectation.allowances (property)
GeoSpecComponentInterferencePairExpectation (type) [lines 239-247] [2 members] — A pair-specific component-interference check accepted by `expectGeo(...).toHaveNoComponentInterference(...)`
  GeoSpecComponentInterferencePairExpectation.left (property)
  GeoSpecComponentInterferencePairExpectation.right (property)
GeoSpecConnectedComponentsExpectation (type) [lines 249-260] [3 members] — Connected-components expectation accepted by `expectGeo(...).toHaveConnectedComponents(...)`
  GeoSpecConnectedComponentsExpectation.count (property)
  GeoSpecConnectedComponentsExpectation.tolerance (property)
  GeoSpecConnectedComponentsExpectation.toleranceMm (property)
GeoSpecGeometrySelector (type) [lines 262-296] — Geometry selector used by inspection and spatial relationship matchers
GeoSpecMatcher (type) [lines 298-511] [27 members] — Assertion chain returned by `expectGeo(subject)`
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
GeoSpecMassExpectation (type) [lines 513-524] [3 members] — Mass expectation accepted by `expectGeo(...).toHaveMass(...)`
  GeoSpecMassExpectation.value (property)
  GeoSpecMassExpectation.density (property)
  GeoSpecMassExpectation.tolerance (property)
GeoSpecMeshIntegrityExpectation (type) [lines 526-557] [5 members] — Mesh integrity expectation accepted by `expectGeo(...).toHaveMeshIntegrity(...)`
  GeoSpecMeshIntegrityExpectation.finitePositions (property)
  GeoSpecMeshIntegrityExpectation.degenerateTriangles (property)
  GeoSpecMeshIntegrityExpectation.duplicateFaces (property)
  GeoSpecMeshIntegrityExpectation.watertight (property)
  GeoSpecMeshIntegrityExpectation.triangleCount (property)
GeoSpecNoDiagnosticsExpectation (type) [lines 559-565] [1 members] — Diagnostic severities rejected by `expectGeo(...).toHaveNoDiagnostics(...)`
  GeoSpecNoDiagnosticsExpectation.severities (property)
GeoSpecMinimumWallThicknessExpectation (type) [lines 567-575] [2 members] — Minimum-wall-thickness expectation accepted by `expectGeo(...).toHaveMinimumWallThickness(...)`
  GeoSpecMinimumWallThicknessExpectation.value (property)
  GeoSpecMinimumWallThicknessExpectation.tolerance (property)
GeoSpecCircularHolePatternExpectation (type) [lines 577-597] [6 members] — Circular-hole-pattern expectation accepted by `expectGeo(...).toHaveCircularHolePattern(...)`
  GeoSpecCircularHolePatternExpectation.count (property)
  GeoSpecCircularHolePatternExpectation.holeDiameter (property)
  GeoSpecCircularHolePatternExpectation.boltCircleDiameter (property)
  GeoSpecCircularHolePatternExpectation.axis (property)
  GeoSpecCircularHolePatternExpectation.center (property)
  GeoSpecCircularHolePatternExpectation.tolerance (property)
GeoSpecFilletFeatureExpectation (type) [lines 599-610] [3 members] — Fillet-feature expectation accepted by `expectGeo(...).toHaveFilletFeature(...)`
  GeoSpecFilletFeatureExpectation.radius (property)
  GeoSpecFilletFeatureExpectation.selection (property)
  GeoSpecFilletFeatureExpectation.tolerance (property)
GeoSpecNumericExpectation (type) [lines 612-619] — Shared scalar expectation used by geometry measurements
GeoSpecPlanarFaceExpectation (type) [lines 621-635] [4 members] — Planar-face expectation accepted by `expectGeo(...).toHavePlanarFace(...)`
  GeoSpecPlanarFaceExpectation.normal (property)
  GeoSpecPlanarFaceExpectation.offset (property)
  GeoSpecPlanarFaceExpectation.area (property)
  GeoSpecPlanarFaceExpectation.tolerance (property)
GeoSpecPointExpectation (type) [lines 637-638] — Point expectation accepted by center and feature matchers
GeoSpecProductStructureExpectation (type) [lines 640-648] [2 members] — Product-structure expectation accepted by `expectGeo(...).toHaveProductStructure(...)`
  GeoSpecProductStructureExpectation.names (property)
  GeoSpecProductStructureExpectation.count (property)
GeoSpecSpatialRelationshipExpectation (type) [lines 650-696] [13 members] — One spatial relationship accepted by `expectGeo(...).toHaveSpatialRelationships(...)`
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
GeoSpecSpatialRelationshipsExpectation (type) [lines 698-703] [1 members] — Spatial relationship expectation accepted by `expectGeo(...).toHaveSpatialRelationships(...)`
  GeoSpecSpatialRelationshipsExpectation.relationships (property)
GeoSpecStepUnitsExpectation (type) [lines 705-710] [1 members] — STEP unit expectation accepted by `expectGeo(...).toHaveStepUnits(...)`
  GeoSpecStepUnitsExpectation.unit (property)
GeoSpecSurfaceAreaExpectation (type) [lines 712-720] [2 members] — Surface-area expectation accepted by `expectGeo(...).toHaveSurfaceArea(...)`
  GeoSpecSurfaceAreaExpectation.value (property)
  GeoSpecSurfaceAreaExpectation.tolerance (property)
GeoSpecTopologyCountsExpectation (type) [lines 722-748] [8 members] — Topology-count expectation accepted by `expectGeo(...).toHaveTopologyCounts(...)`
  GeoSpecTopologyCountsExpectation.vertices (property)
  GeoSpecTopologyCountsExpectation.edges (property)
  GeoSpecTopologyCountsExpectation.wires (property)
  GeoSpecTopologyCountsExpectation.faces (property)
  GeoSpecTopologyCountsExpectation.shells (property)
  GeoSpecTopologyCountsExpectation.solids (property)
  GeoSpecTopologyCountsExpectation.compounds (property)
  GeoSpecTopologyCountsExpectation.tolerance (property)
GeoSpecValidBrepExpectation (type) [lines 750-774] [6 members] — Exact BRep validity expectation accepted by `expectGeo(...).toBeValidBrep(...)`
  GeoSpecValidBrepExpectation.maxTolerance (property)
  GeoSpecValidBrepExpectation.freeBounds (property)
  GeoSpecValidBrepExpectation.minEdgeLength (property)
  GeoSpecValidBrepExpectation.sameParameter (property)
  GeoSpecValidBrepExpectation.closedShells (property)
  GeoSpecValidBrepExpectation.closedWires (property)
GeoSpecVoidContinuityExpectation (type) [lines 776-816] [5 members] — Void-continuity expectation accepted by `expectGeo(...).toHaveVoidContinuity(...)`
  GeoSpecVoidContinuityExpectation.path (property) — Ordered waypoints (>= 1) known to lie in the void…
  GeoSpecVoidContinuityExpectation.material (property) — Occurrence names whose solids bound the void
  GeoSpecVoidContinuityExpectation.minCrossSection (property) — Minimum required bottleneck cross-section (mm²), sampled
  GeoSpecVoidContinuityExpectation.isolatedFrom (property) — Points that must NOT be reachable from the path void…
  GeoSpecVoidContinuityExpectation.bounds (property) — Region bounded for the proof (subject frame)
GeoSpecVoidWaypoint (type) [lines 818-821] — One void-continuity waypoint
GeoSpecVolumeExpectation (type) [lines 823-831] [2 members] — Volume expectation accepted by `expectGeo(...).toHaveVolume(...)`
  GeoSpecVolumeExpectation.value (property)
  GeoSpecVolumeExpectation.tolerance (property)
BrepEvidence (type) [lines 833-1058] [11 members] — Basic exact or topology-derived BRep evidence consumed by early feature…
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
GeometryFileFormat (type) [lines 1060-1061] — Geometry file formats understood by GeoSpec provenance
GeometryCapability (type) [lines 1063-1081] [2 members] — Capability exposed by a loaded subject
  GeometryCapability.kind (property)
  GeometryCapability.feature (property)
GeometryDiagnostic (type) [lines 1083-1111] [6 members] — Diagnostic emitted by GeoSpec loaders, analyzers, and matchers
  GeometryDiagnostic.code (property)
  GeometryDiagnostic.severity (property)
  GeometryDiagnostic.message (property)
  GeometryDiagnostic.suggestion (property)
  GeometryDiagnostic.spatial (property)
  GeometryDiagnostic.details (property)
GeometryProvenance (type) [lines 1113-1133] [6 members] — Provenance recorded by GeoSpec loaders
  GeometryProvenance.source (property)
  GeometryProvenance.unit (property)
  GeometryProvenance.loader (property)
  GeometryProvenance.contentHash (property)
  GeometryProvenance.parameters (property)
  GeometryProvenance.exportIntent (property)
GeometrySource (type) [lines 1135-1152] [5 members] — Source metadata for a loaded geometry subject
  GeometrySource.kind (property)
  GeometrySource.format (property)
  GeometrySource.path (property)
  GeometrySource.name (property)
  GeometrySource.byteLength (property)
GeometrySubject (type) [lines 1154-1183] [8 members] — Canonical P0 object under test for GeoSpec
  GeometrySubject.kind (property)
  GeometrySubject.subjectId (property) — Opaque engine-owned identifier used by every protocol claim
  GeometrySubject.mesh (property)
  GeometrySubject.brep (property)
  GeometrySubject.step (property)
  GeometrySubject.provenance (property)
  GeometrySubject.capabilities (property)
  GeometrySubject.diagnostics (property)
GeometrySubjectMeshEvidence (type) [lines 1185-1193] [2 members] — Wire-safe mesh summary carried by an opaque geometry subject
  GeometrySubjectMeshEvidence.format (property)
  GeometrySubjectMeshEvidence.stats (property)
MeshEvidence (type) [lines 1195-1203] [2 members] — Mesh evidence loaded from geometry bytes or buffers
  MeshEvidence.format (property)
  MeshEvidence.stats (property)
MeshFileFormat (type) [lines 1205-1206] — Geometry file formats supported by the P0 mesh loader
MeshQualityStats (type) [lines 1208-1261] [8 members] — Triangle quality and scalar mesh metrics used by P0 GeoSpec…
  MeshQualityStats.triangleCount (property)
  MeshQualityStats.nonFiniteVertices (property)
  MeshQualityStats.degenerateTriangles (property)
  MeshQualityStats.duplicateFaces (property)
  MeshQualityStats.triangles (property)
  MeshQualityStats.surfaceArea (property)
  MeshQualityStats.signedVolume (property)
  MeshQualityStats.centerOfMass (property)
MeshTriangle (type) [lines 1263-1286] [7 members] — One triangle from mesh evidence, in geometry document coordinates
  MeshTriangle.primitive (property)
  MeshTriangle.triangleIndex (property)
  MeshTriangle.a (property)
  MeshTriangle.b (property)
  MeshTriangle.c (property)
  MeshTriangle.center (property)
  MeshTriangle.area (property)
StepEvidence (type) [lines 1288-1338] [6 members] — STEP/XDE evidence extracted while loading a STEP subject
  StepEvidence.schema (property)
  StepEvidence.unit (property)
  StepEvidence.productStructure (property)
  StepEvidence.readStrategy (property)
  StepEvidence.capabilities (property)
  StepEvidence.xde (property) — Structured AP242 XDE read result (occurrences, subshape names, datum placements)
Vec3 (type) [lines 1340-1341] — Numeric 3D vector
GeoSpecVec3 (type) [lines 1343-1344] — Numeric 3D vector
GeoSpecExportRoute (type) [lines 1346-1359] — Runtime route metadata used to decide whether a runtime export…
RuntimeBackedModelFormat (type) [lines 1361-1361]
RuntimeClientWithRoutes (type) [lines 1363-1385] [3 members] — Runtime client shape for route-aware Tau runtimes
  RuntimeClientWithRoutes.open (property)
  RuntimeClientWithRoutes.on (method)
  RuntimeClientWithRoutes.bestRouteFor (method)
RuntimeExportIntent (type) [lines 1387-1398] [3 members] — Resolved runtime export request and provenance for a GeoSpec model…
  RuntimeExportIntent.options (property)
  RuntimeExportIntent.provenance (property)
  RuntimeExportIntent.sourceUnit (property)
RuntimeExportIntentFailure (type) [lines 1400-1408] [2 members] — Structured failure returned when a runtime cannot provide the requested…
  RuntimeExportIntentFailure.success (property)
  RuntimeExportIntentFailure.diagnostics (property)
CreateModelLoaderOptions (type) [lines 1410-1462] [10 members] — Defaults accepted by {@link import ('./load-model.js').createModelLoader}
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
GeoSpecLoadRegion (type) [lines 1464-1472] [2 members] — Axis-aligned crop box in canonical Z-up millimetres
  GeoSpecLoadRegion.min (property)
  GeoSpecLoadRegion.max (property)
GeoSpecModelFormat (type) [lines 1474-1475] — Geometry formats accepted by {@link import ('./load-model.js').loadModel}
GeoSpecModelLoader (type) [lines 1477-1478] — Function shape used by GeoSpec runners to provide model loading…
ManagedGeoSpecModelLoader (type) [lines 1480-1486] [1 members] — A configured loader whose shared runtime can be released with…
  ManagedGeoSpecModelLoader.dispose (method)
GeoSpecRuntimeClient (type) [lines 1488-1512] [2 members] — Runtime client surface consumed by `geospec/model`
  GeoSpecRuntimeClient.open (property)
  GeoSpecRuntimeClient.on (method)
GeoSpecRuntimeClientFactory (type) [lines 1514-1515] — Lazy runtime factory consumed by `geospec/model`
GeoSpecRuntimeSourceAdapter (type) [lines 1517-1535] [3 members] — Explicit source adapter for formats whose runtime setup is not…
  GeoSpecRuntimeSourceAdapter.id (property)
  GeoSpecRuntimeSourceAdapter.extensions (property)
  GeoSpecRuntimeSourceAdapter.createRuntime (method)
LoadModelCodeOptions (type) [lines 1537-1620] [14 members] — Inline code-CAD model load options
  LoadModelCodeOptions.code (property) — Source files keyed by project-relative path
  LoadModelCodeOptions.file (property) — Entry path to render from {@link code }
  LoadModelCodeOptions.rootDir (property) — Not accepted
  LoadModelCodeOptions.format (property) — Geometry format to export
  LoadModelCodeOptions.parameters (property) — Explicit parameters passed to the runtime
  LoadModelCodeOptions.runtime (property) — Runtime client or lazy runtime factory
  LoadModelCodeOptions.sourceAdapters (property) — Source-specific runtime adapters, e.g
  LoadModelCodeOptions.projectPath (property) — Project root used by runtime integrations
  LoadModelCodeOptions.stepStreaming (property) — STEP reader strategy used for STEP exports
  LoadModelCodeOptions.mesh (property) — Whether STEP loading should also produce mesh evidence
  LoadModelCodeOptions.meshLinearTolerance (property) — Linear tolerance used while meshing exact BRep evidence
  LoadModelCodeOptions.meshAngularToleranceDegrees (property) — Angular tolerance in degrees used while meshing exact BRep evidence
  LoadModelCodeOptions.workUnitLimit (property) — Default work-unit budget for every claim on this subject
  LoadModelCodeOptions.region (property) — Axis-aligned millimetre box the kernel crops the model to before…
LoadModelFileOptions (type) [lines 1622-1707] [13 members] — Filesystem-backed model load options
  LoadModelFileOptions.file (property) — Model file to render, as a path from the project…
  LoadModelFileOptions.rootDir (property) — Project-relative folder `file` resolves in, for a suite that loads…
  LoadModelFileOptions.projectPath (property) — Project root used by runtime integrations
  LoadModelFileOptions.format (property) — Geometry format to export
  LoadModelFileOptions.parameters (property) — Explicit parameters passed to the runtime
  LoadModelFileOptions.runtime (property) — Runtime client or lazy runtime factory
  LoadModelFileOptions.sourceAdapters (property) — Source-specific runtime adapters, e.g
  LoadModelFileOptions.stepStreaming (property) — STEP reader strategy used for STEP exports
  LoadModelFileOptions.mesh (property) — Whether STEP loading should also produce mesh evidence
  LoadModelFileOptions.meshLinearTolerance (property) — Linear tolerance used while meshing exact BRep evidence
  LoadModelFileOptions.meshAngularToleranceDegrees (property) — Angular tolerance in degrees used while meshing exact BRep evidence
  LoadModelFileOptions.workUnitLimit (property) — Default work-unit budget for every claim on this subject
  LoadModelFileOptions.region (property) — Axis-aligned millimetre box the kernel crops the model to before…
LoadModelOptions (type) [lines 1709-1734] [8 members] — Options accepted by {@link import ('./load-model.js').loadModel}
  LoadModelOptions.rootDir (property) — Project-relative folder `file` resolves in, for a suite that loads…
  LoadModelOptions.format (property) — Geometry format to export
  LoadModelOptions.parameters (property) — Explicit parameters passed to the runtime
  LoadModelOptions.stepStreaming (property) — STEP reader strategy used for STEP exports
  LoadModelOptions.mesh (property) — Whether STEP loading should also produce mesh evidence
  LoadModelOptions.meshLinearTolerance (property) — Linear tolerance used while meshing exact BRep evidence
  LoadModelOptions.meshAngularToleranceDegrees (property) — Angular tolerance in degrees used while meshing exact BRep evidence
  LoadModelOptions.workUnitLimit (property) — Default work-unit budget for every claim on this subject
LoadModelSourceOptions (type) [lines 1736-1816] [13 members] — Direct geometry-source model load options
  LoadModelSourceOptions.source (property) — Geometry bytes, path, browser file/blob, or in-memory mesh buffer
  LoadModelSourceOptions.resources (property) — Named external resources consumed alongside the direct geometry bytes
  LoadModelSourceOptions.rootDir (property) — Project-relative folder a path `source` and each resource path resolve…
  LoadModelSourceOptions.format (property) — Source geometry format
  LoadModelSourceOptions.path (property) — Source path recorded in provenance
  LoadModelSourceOptions.name (property) — Human-readable source name recorded in provenance
  LoadModelSourceOptions.sourceUnit (property) — Coordinate unit of raw GLB/glTF or mesh-buffer data before canonical…
  LoadModelSourceOptions.parameters (property) — Explicit parameters recorded in provenance
  LoadModelSourceOptions.stepStreaming (property) — STEP reader strategy used for STEP sources
  LoadModelSourceOptions.mesh (property) — Whether STEP loading should also produce mesh evidence
  LoadModelSourceOptions.meshLinearTolerance (property) — Linear tolerance used while meshing exact BRep evidence
  LoadModelSourceOptions.meshAngularToleranceDegrees (property) — Angular tolerance in degrees used while meshing exact BRep evidence
  LoadModelSourceOptions.workUnitLimit (property) — Default work-unit budget for every claim on this subject

## Classes — `api-classes.md`

GeoSpecModelLoadError (class) [lines 5-13] [2 members] — Error thrown by {@link import ('./load-model.js').loadModel} when geometry cannot be…
  GeoSpecModelLoadError.diagnostics (property) — Structured diagnostics explaining why model loading failed
  GeoSpecModelLoadError.constructor (constructor)
