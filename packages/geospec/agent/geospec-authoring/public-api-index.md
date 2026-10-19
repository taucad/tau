# geospec public API index

geospec 0.1.0-beta.7 · 877 symbols · extracted by TypeScript 5.9.3.

Every symbol appears here exactly once. The heading above each block names the file with its signature, and each top-level symbol names the lines of that file which hold its declaration and members: read only that range.

## Functions — `public-api-functions.md`

describe (function) [lines 5-10] [1 members] — GeoSpec suite helper used inside VM-executed test modules
  describe.skip (method)
expectGeo (function) [lines 12-16] — Start a geometry assertion chain
it (function) [lines 18-23] [1 members] — GeoSpec test helper used inside VM-executed test modules
  it.skip (method)
test (function) [lines 25-30] [1 members] — Alias for {@link it}
  test.skip (method)
normalizeGeoSpecExpected (function) [lines 32-36] — Derive the `expected` value an assertion records from the call…
assertGeoSpecJsonValue (function) [lines 38-40] — Reject a non-wire value rather than letting JSON.stringify erase it
decodeGeoSpecCanonicalJson (function) [lines 42-44] — Parse and validate canonical bytes without re-canonicalizing them
encodeGeoSpecCanonicalJson (function) [lines 46-48] — Encode client-owned canonical claim bytes
isGeoSpecJsonValue (function) [lines 50-52] — Runtime JSON-value guard used at every protocol trust boundary
toGeoSpecProtocolJson (function) [lines 54-56] — Convert an authoring value to protocol JSON, including the two…
createModelLoader (function) [lines 58-61] — Create a {@link loadModel} function over a host-supplied compiled engine
loadModel (function) [lines 63-68] — Load a CAD model into GeoSpec evidence
resolveRuntimeExportIntent (function) [lines 70-83]
clearCollectorGlobals (function) [lines 85-86]
createCollector (function) [lines 88-91] — Create the collector used by the embedded GeoSpec runner
installCollector (function) [lines 93-94]
compileGeoSpecTestNamePattern (function) [lines 96-106] — Compile a Vitest-style test-name pattern once for a GeoSpec run
filterGeoSpecTests (function) [lines 108-112] — Filter collected GeoSpec tests by compiled test-name pattern
matchesGeoSpecTestName (function) [lines 114-118] — Return true when a collected GeoSpec test matches the supplied…
discoverGeoSpecFiles (function) [lines 120-124] — Discover GeoSpec test files from exact files or directory roots
isGeoSpecTestFile (function) [lines 126-129] — Return true when a project-relative path names a GeoSpec test…
runGeoSpecModule (function) [lines 131-134] — Execute an ESM GeoSpec module using the shared Tau VM…
isGeoSpecTimeoutCode (function) [lines 136-139] — Whether a diagnostic or issue code belongs to the GeoSpec…
createNativeGeoSpecRunner (function) [lines 141-144] — Compose compiled assertion and model bindings with the SDK's serial…
allocateNativePoolGrants (function) [lines 146-153] — Assign a bounded CPU budget across already-selected worker isolates
createGeoSpecNativeModelLoader (function) [lines 155-158] — Create a native model loader that admits actual STEP/GLB bytes…
createNodeVmFileSystem (function) [lines 160-163] — Create a Node `VmFileSystem` rooted at `root`
resolveUnderRoot (function) [lines 165-170] — Resolve one VM path to a real path under the…
createNoMatchingGeoSpecTestsIssue (function) [lines 172-174] — Create a run-level issue when filters select no tests
createGeoSpecAssertionClient (function) [lines 176-179] — Create a standalone native GeoSpec assertion client
createGeoSpecMatcherMethods (function) [lines 181-188] — Create the one registry-derived matcher surface used by every JavaScript…
evaluateGeoSpecNativeQuery (function) [lines 190-194] — Submit an ancillary query with positive polarity through the native…
resolveGeoSpecMaximumWorkUnitLimit (function) [lines 196-200] — Resolve a host's largest authored work-unit budget
createGeoSpecVitestAdapter (function) [lines 202-205] — Create Vitest matchers over an existing runner-independent client
installGeoSpecVitest (function) [lines 207-210] — Register GeoSpec matchers and their settlement hook in the active…
setupGeoSpecVitest (function) [lines 212-215] — Create a native client and register it with the active…
exportTauProjectArtifact (function) [lines 217-221] — Export one Tau project from Runtime's coherent source snapshot
loadGeoSpecConfig (function) [lines 223-227] — Load one trusted project config using Node's native module loader

## Constants — `public-api-constants.md`

geoSpecMatcherNames (constant) [lines 5-6] — Every matcher name exposed by {@link expectGeo}, derived from the…
geoSpecMatcherDescriptors (constant) [lines 8-13] — The 26-entry matcher registry
geoSpecMeshEvidenceMatchers (constant) [lines 15-16] — The matchers mesh evidence answers, as the GeoSpec authoring skill…
geoSpecRegionScopedKinds (constant) [lines 18-20] — The claims a region-cropped subject answers
geoSpecRegionWholeModelClaimCode (constant) [lines 22-23] — Diagnostic code of a whole-model claim made on a region-cropped…
defaultGeoSpecIgnoredDirectories (constant) [lines 25-26] — Directories skipped by recursive GeoSpec discovery unless callers provide their…
defaultGeoSpecInclude (constant) [lines 28-29] — Default file globs used by GeoSpec test discovery
geoSpecTimeoutCode (constant) [lines 31-48] [3 members] — Codes for GeoSpec wall-clock timeouts, one per bound
  geoSpecTimeoutCode.test (property) — A test's async body outlived `testTimeout` / `--test-timeout`
  geoSpecTimeoutCode.shard (property) — A pool shard outlived the non-verdict `--shard-timeout` watchdog
  geoSpecTimeoutCode.run (property) — A whole run outlived its host run budget
geoSpecMaximumWorkUnitLimit (constant) [lines 50-51] — Default largest work-unit budget a spec may author through `loadModel`…

## Types — `public-api-types.md`

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
GeoSpecMatcherDescriptor (type) [lines 1346-1357] [3 members] — One matcher's contract entry
  GeoSpecMatcherDescriptor.kind (property)
  GeoSpecMatcherDescriptor.expected (property)
  GeoSpecMatcherDescriptor.mode (property)
GeoSpecMatcherExpectedShape (type) [lines 1359-1361] — How the substrate derives an assertion's recorded `expected` value from…
GeoSpecMatcherMode (type) [lines 1363-1364] — Whether a matcher settles synchronously (throwing its `GeoSpecAssertionError` inside the…
GeoSpecMatcherName (type) [lines 1366-1367] — Every matcher name exposed by `expectGeo(...)`
MeshBufferSource (type) [lines 1369-1383] [4 members] — In-memory triangle mesh source
  MeshBufferSource.format (property)
  MeshBufferSource.positions (property)
  MeshBufferSource.indices (property)
  MeshBufferSource.name (property)
MeshSource (type) [lines 1385-1386] — Mesh source forms accepted by {@link import ('./load-model.js').loadModel}
AabbMeters (type) [lines 1388-1396] [2 members] — Axis-aligned bounding box in glTF document units (meters)
  AabbMeters.min (property)
  AabbMeters.max (property)
BoundingBoxAxisExtremum (type) [lines 1398-1409] [3 members] — Dominant primitive on an axis extremum for `boundingBox` failures
  BoundingBoxAxisExtremum.name (property)
  BoundingBoxAxisExtremum.aabb (property)
  BoundingBoxAxisExtremum.value (property)
BoundingBoxAxisFailure (type) [lines 1411-1434] [7 members] — One axis failure for `boundingBox` checks
  BoundingBoxAxisFailure.axis (property)
  BoundingBoxAxisFailure.field (property)
  BoundingBoxAxisFailure.expected (property)
  BoundingBoxAxisFailure.actual (property)
  BoundingBoxAxisFailure.tolerance (property)
  BoundingBoxAxisFailure.minExtremum (property)
  BoundingBoxAxisFailure.maxExtremum (property)
BoundingBoxFailure (type) [lines 1436-1441] [1 members] — Structured payload when `boundingBox` fails
  BoundingBoxFailure.axisFailures (property)
BoundingBoxStats (type) [lines 1443-1454] [3 members] — Scene bounding box with per-primitive contributors in the subject's unit…
  BoundingBoxStats.size (property)
  BoundingBoxStats.center (property)
  BoundingBoxStats.primitives (property)
CheckResult (type) [lines 1456-1484] [1 members] — Result of evaluating a single test requirement against geometry stats
  CheckResult.passed (property)
ClusterGap (type) [lines 1486-1508] [6 members] — Smallest clearance between two clusters along the dominant separation axis
  ClusterGap.fromLabel (property)
  ClusterGap.toLabel (property)
  ClusterGap.axis (property)
  ClusterGap.gapMm (property) — Millimetres — clearance between the two named primitives' AABBs
  ClusterGap.fromPrimitive (property)
  ClusterGap.toPrimitive (property)
ClusterReport (type) [lines 1510-1527] [5 members] — One spatial cluster from AABB overlap grouping
  ClusterReport.label (property)
  ClusterReport.primitives (property)
  ClusterReport.aabb (property)
  ClusterReport.centroid (property)
  ClusterReport.totalVertices (property)
ConnectedComponentsFailure (type) [lines 1529-1546] [5 members] — Structured payload when `connectedComponents` fails
  ConnectedComponentsFailure.expected (property)
  ConnectedComponentsFailure.got (property)
  ConnectedComponentsFailure.toleranceMm (property)
  ConnectedComponentsFailure.clusters (property)
  ConnectedComponentsFailure.gaps (property)
ConnectedComponentsResult (type) [lines 1548-1559] [3 members] — Full connected-components analysis at one tolerance
  ConnectedComponentsResult.count (property)
  ConnectedComponentsResult.clusters (property)
  ConnectedComponentsResult.gaps (property)
GeometryEvidenceDiagnostic (type) [lines 1561-1580] [6 members] — Diagnostic form permitted inside a wire-safe subject snapshot
  GeometryEvidenceDiagnostic.code (property)
  GeometryEvidenceDiagnostic.severity (property)
  GeometryEvidenceDiagnostic.message (property)
  GeometryEvidenceDiagnostic.suggestion (property)
  GeometryEvidenceDiagnostic.spatial (property)
  GeometryEvidenceDiagnostic.details (property)
GeometryStats (type) [lines 1582-1603] [6 members] — Statistics about a parsed GLB geometry
  GeometryStats.vertexCount (property)
  GeometryStats.meshCount (property)
  GeometryStats.triangleCount (property)
  GeometryStats.meshQuality (property)
  GeometryStats.watertight (property)
  GeometryStats.boundingBox (property)
PrimitiveRecord (type) [lines 1605-1621] [4 members] — One TRIANGLES primitive with identity for spatial-test feedback
  PrimitiveRecord.name (property) — The glTF node / mesh name (from kernel ShapeConfig.name when…
  PrimitiveRecord.color (property)
  PrimitiveRecord.vertices (property)
  PrimitiveRecord.aabb (property)
WatertightFailure (type) [lines 1623-1658] [7 members] — Structured payload when `watertight` fails
  WatertightFailure.irregularEdges (property) — Edges with incidence ≠ 2 (open or non-manifold)
  WatertightFailure.openBoundaryEdges (property) — Edges shared by exactly one triangle (open boundary)
  WatertightFailure.nonManifoldEdges (property) — Edges shared by more than two triangles (over-adjacent/non-manifold)
  WatertightFailure.irregularEdgeKindCounts (property)
  WatertightFailure.irregularEdgeClusters (property)
  WatertightFailure.irregularEdgeFraction (property)
  WatertightFailure.perPrimitive (property)
WatertightIrregularEdgeCluster (type) [lines 1660-1682] [4 members] — Spatial cluster of related irregular edges
  WatertightIrregularEdgeCluster.kind (property)
  WatertightIrregularEdgeCluster.edgeCount (property)
  WatertightIrregularEdgeCluster.aabb (property)
  WatertightIrregularEdgeCluster.samples (property)
WatertightIrregularEdgeKind (type) [lines 1684-1685] — Class of irregular mesh edge found during watertight analysis
WatertightIrregularEdgeSample (type) [lines 1687-1707] [6 members] — Representative irregular edge, in glTF document coordinates
  WatertightIrregularEdgeSample.start (property)
  WatertightIrregularEdgeSample.end (property)
  WatertightIrregularEdgeSample.center (property)
  WatertightIrregularEdgeSample.incidentTriangleCount (property)
  WatertightIrregularEdgeSample.primitives (property)
  WatertightIrregularEdgeSample.color (property)
WatertightPrimitiveBreakdown (type) [lines 1709-1720] [3 members] — Per-primitive watertight diagnostic (local tessellation only)
  WatertightPrimitiveBreakdown.name (property)
  WatertightPrimitiveBreakdown.boundaryEdges (property)
  WatertightPrimitiveBreakdown.loopCentroid (property)
WatertightResult (type) [lines 1722-1757] [9 members] — Full watertight analysis (global + per-primitive breakdown)
  WatertightResult.watertight (property)
  WatertightResult.irregularEdges (property)
  WatertightResult.openBoundaryEdges (property)
  WatertightResult.nonManifoldEdges (property)
  WatertightResult.irregularEdgeKindCounts (property)
  WatertightResult.irregularEdgeClusters (property)
  WatertightResult.totalEdges (property)
  WatertightResult.irregularEdgeFraction (property)
  WatertightResult.perPrimitive (property)
GeoSpecExportRoute (type) [lines 1759-1772] — Runtime route metadata used to decide whether a runtime export…
RuntimeBackedModelFormat (type) [lines 1774-1774]
RuntimeClientWithRoutes (type) [lines 1776-1798] [3 members] — Runtime client shape for route-aware Tau runtimes
  RuntimeClientWithRoutes.open (property)
  RuntimeClientWithRoutes.on (method)
  RuntimeClientWithRoutes.bestRouteFor (method)
RuntimeExportIntent (type) [lines 1800-1811] [3 members] — Resolved runtime export request and provenance for a GeoSpec model…
  RuntimeExportIntent.options (property)
  RuntimeExportIntent.provenance (property)
  RuntimeExportIntent.sourceUnit (property)
RuntimeExportIntentFailure (type) [lines 1813-1821] [2 members] — Structured failure returned when a runtime cannot provide the requested…
  RuntimeExportIntentFailure.success (property)
  RuntimeExportIntentFailure.diagnostics (property)
CreateModelLoaderOptions (type) [lines 1823-1875] [10 members] — Defaults accepted by {@link import ('./load-model.js').createModelLoader}
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
GeoSpecLoadRegion (type) [lines 1877-1885] [2 members] — Axis-aligned crop box in canonical Z-up millimetres
  GeoSpecLoadRegion.min (property)
  GeoSpecLoadRegion.max (property)
GeoSpecModelFormat (type) [lines 1887-1888] — Geometry formats accepted by {@link import ('./load-model.js').loadModel}
GeoSpecModelLoader (type) [lines 1890-1891] — Function shape used by GeoSpec runners to provide model loading…
ManagedGeoSpecModelLoader (type) [lines 1893-1899] [1 members] — A configured loader whose shared runtime can be released with…
  ManagedGeoSpecModelLoader.dispose (method)
GeoSpecRuntimeClient (type) [lines 1901-1925] [2 members] — Runtime client surface consumed by `geospec/model`
  GeoSpecRuntimeClient.open (property)
  GeoSpecRuntimeClient.on (method)
GeoSpecRuntimeClientFactory (type) [lines 1927-1928] — Lazy runtime factory consumed by `geospec/model`
GeoSpecRuntimeSourceAdapter (type) [lines 1930-1948] [3 members] — Explicit source adapter for formats whose runtime setup is not…
  GeoSpecRuntimeSourceAdapter.id (property)
  GeoSpecRuntimeSourceAdapter.extensions (property)
  GeoSpecRuntimeSourceAdapter.createRuntime (method)

## Types (2) — `public-api-types-2.md`

LoadModelCodeOptions (type) [lines 5-88] [14 members] — Inline code-CAD model load options
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
LoadModelFileOptions (type) [lines 90-175] [13 members] — Filesystem-backed model load options
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
LoadModelOptions (type) [lines 177-202] [8 members] — Options accepted by {@link import ('./load-model.js').loadModel}
  LoadModelOptions.rootDir (property) — Project-relative folder `file` resolves in, for a suite that loads…
  LoadModelOptions.format (property) — Geometry format to export
  LoadModelOptions.parameters (property) — Explicit parameters passed to the runtime
  LoadModelOptions.stepStreaming (property) — STEP reader strategy used for STEP exports
  LoadModelOptions.mesh (property) — Whether STEP loading should also produce mesh evidence
  LoadModelOptions.meshLinearTolerance (property) — Linear tolerance used while meshing exact BRep evidence
  LoadModelOptions.meshAngularToleranceDegrees (property) — Angular tolerance in degrees used while meshing exact BRep evidence
  LoadModelOptions.workUnitLimit (property) — Default work-unit budget for every claim on this subject
LoadModelSourceOptions (type) [lines 204-284] [13 members] — Direct geometry-source model load options
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
GeoSpecCollector (type) [lines 286-315] [7 members] — Collects suites, tests, assertions, and async completion state for one…
  GeoSpecCollector.tests (property)
  GeoSpecCollector.describe (method)
  GeoSpecCollector.describeSkip (method)
  GeoSpecCollector.it (method)
  GeoSpecCollector.itSkip (method)
  GeoSpecCollector.expectGeo (method)
  GeoSpecCollector.waitForCompletion (method)
GeoSpecCollectorOptions (type) [lines 317-333] [4 members] — Per-module collector configuration
  GeoSpecCollectorOptions.matcherWallBackstop (property)
  GeoSpecCollectorOptions.forensic (property)
  GeoSpecCollectorOptions.nativeAssertions (property)
  GeoSpecCollectorOptions.onTestEvent (property) — Observes each selected test as it starts and settles, for…
GeoSpecTestNamePattern (type) [lines 335-336] — Compiled Vitest-style test-name pattern used by a GeoSpec run
GeoSpecTimeoutCode (type) [lines 338-339] — One GeoSpec timeout code
DiscoverGeoSpecFilesOptions (type) [lines 341-362] [6 members] — Options for recursive GeoSpec test discovery
  DiscoverGeoSpecFilesOptions.filesystem (property)
  DiscoverGeoSpecFilesOptions.projectPath (property)
  DiscoverGeoSpecFilesOptions.files (property)
  DiscoverGeoSpecFilesOptions.include (property)
  DiscoverGeoSpecFilesOptions.exclude (property)
  DiscoverGeoSpecFilesOptions.ignoredDirectories (property)
GeoSpecDiscoveryFileKind (type) [lines 364-365] — File kind returned by a GeoSpec discovery filesystem
GeoSpecDiscoveryFileStat (type) [lines 367-372] [1 members] — Minimal stat object required for recursive GeoSpec test discovery
  GeoSpecDiscoveryFileStat.kind (property)
GeoSpecDiscoveryFileSystem (type) [lines 374-385] [2 members] — Minimal filesystem contract used by GeoSpec test discovery
  GeoSpecDiscoveryFileSystem.readdir (method)
  GeoSpecDiscoveryFileSystem.stat (method)
GeoSpecDiscoveryResult (type) [lines 387-396] [2 members] — Result returned by recursive GeoSpec test discovery
  GeoSpecDiscoveryResult.files (property)
  GeoSpecDiscoveryResult.unmatchedRoots (property)
GeoSpecModuleBundleCache (type) [lines 398-415] — Worker-local cache for successful GeoSpec bundles
GeoSpecRunFailure (type) [lines 417-439] [6 members] — Failed GeoSpec run result
  GeoSpecRunFailure.success (property)
  GeoSpecRunFailure.issues (property)
  GeoSpecRunFailure.bundle (property)
  GeoSpecRunFailure.accounting (property)
  GeoSpecRunFailure.lineage (property)
  GeoSpecRunFailure.tests (property) — Tests registered before a module execution failure, including their retained…
GeoSpecRunResult (type) [lines 441-453] [5 members] — Result returned by {@link import ('./run-geospec-module.js').runGeoSpecModule}
  GeoSpecRunResult.success (property)
  GeoSpecRunResult.bundle (property)
  GeoSpecRunResult.accounting (property)
  GeoSpecRunResult.lineage (property)
  GeoSpecRunResult.tests (property) — Tests registered before a module execution failure, including their retained…
GeoSpecRunSuccess (type) [lines 455-477] [6 members] — Successful GeoSpec run result
  GeoSpecRunSuccess.success (property)
  GeoSpecRunSuccess.passed (property) — True only when selected tests completed successfully with coherent available…
  GeoSpecRunSuccess.tests (property)
  GeoSpecRunSuccess.bundle (property)
  GeoSpecRunSuccess.accounting (property)
  GeoSpecRunSuccess.lineage (property)
GeoSpecTestCase (type) [lines 479-516] [7 members] — A collected GeoSpec test case
  GeoSpecTestCase.ordinal (property) — Registration ordinal before filtering, scoped to the source module's collection
  GeoSpecTestCase.suite (property) — Hierarchical suite path
  GeoSpecTestCase.name (property) — Test case name
  GeoSpecTestCase.assertions (property) — Assertions produced by the test callback
  GeoSpecTestCase.status (property) — Final test status
  GeoSpecTestCase.diagnostics (property) — Structured diagnostics emitted by test execution
  GeoSpecTestCase.durationMs (property) — Wall-clock cost of the test body plus its pending assertions,…
GeoSpecTestEvent (type) [lines 518-526] [2 members] — A selected test starting or settling inside a module run
  GeoSpecTestEvent.type (property)
  GeoSpecTestEvent.test (property)
GeoSpecTestStatus (type) [lines 528-529] — Test case status after runner collection
RunGeoSpecModuleOptions (type) [lines 531-606] [12 members] — Options for executing a GeoSpec ESM test module
  RunGeoSpecModuleOptions.filesystem (property) — Filesystem containing the test module and its project imports
  RunGeoSpecModuleOptions.entryPath (property) — Filesystem-root-relative ESM test entry path
  RunGeoSpecModuleOptions.testNamePattern (property) — JavaScript regular expression matched against full `suite > test` names
  RunGeoSpecModuleOptions.testTimeout (property) — Timeout for async test callbacks, in milliseconds
  RunGeoSpecModuleOptions.matcherWallBackstop (property) — Milliseconds
  RunGeoSpecModuleOptions.forensic (property) — Emit structured forensic events for this run
  RunGeoSpecModuleOptions.onTestEvent (property) — Observes each selected test as it starts and settles, for…
  RunGeoSpecModuleOptions.nativeAssertions (property) — Host-provided protocol-3 compiled assertion client
  RunGeoSpecModuleOptions.nativeModelLoader (property) — Host-composed identity loader
  RunGeoSpecModuleOptions.builtinModules (property) — Additional in-memory modules made available to the VM
  RunGeoSpecModuleOptions.bundleCache (property) — Successful bundle cache owned by a serial runner worker
  RunGeoSpecModuleOptions.collectOnly (property) — List-only collection pass (R3 shard splitting)
GeoSpecNativeRunnerAssertions (type) [lines 608-625] [6 members] — Native assertion options whose engine can also admit and release…
  GeoSpecNativeRunnerAssertions.claimId (property)
  GeoSpecNativeRunnerAssertions.evidenceProfile (property) — Success-evidence profile of every claim and query
  GeoSpecNativeRunnerAssertions.subjectSlot (property)
  GeoSpecNativeRunnerAssertions.workUnitLimit (property)
  GeoSpecNativeRunnerAssertions.maximumWorkUnitLimit (property) — The largest `workUnitLimit` a spec may author in `loadModel` or…
  GeoSpecNativeRunnerAssertions.engine (property)
GeoSpecNativeRunnerOptions (type) [lines 627-650] [5 members] — Options for the native serial runner
  GeoSpecNativeRunnerOptions.filesystem (property) — Filesystem containing the project and test modules
  GeoSpecNativeRunnerOptions.builtinModules (property) — Additional in-memory modules made available to the VM
  GeoSpecNativeRunnerOptions.nativeAssertions (property) — Actual protocol-3 engine used by authored assertions
  GeoSpecNativeRunnerOptions.nativeModelLoader (property) — Optional managed loader
  GeoSpecNativeRunnerOptions.model (property) — Defaults used when the runner constructs its own native loader
CreateGeoSpecNativeModelLoaderOptions (type) [lines 652-691] [8 members] — Defaults and host dependencies for a managed native model loader
  CreateGeoSpecNativeModelLoaderOptions.engine (property)
  CreateGeoSpecNativeModelLoaderOptions.format (property)
  CreateGeoSpecNativeModelLoaderOptions.projectPath (property)
  CreateGeoSpecNativeModelLoaderOptions.readSource (property)
  CreateGeoSpecNativeModelLoaderOptions.runtime (property)
  CreateGeoSpecNativeModelLoaderOptions.sourceAdapters (property)
  CreateGeoSpecNativeModelLoaderOptions.carried (property) — Subject handles carried between the release scopes of loaders that…
  CreateGeoSpecNativeModelLoaderOptions.maximumWorkUnitLimit (property) — The largest `loadModel` `workUnitLimit` a spec may author
GeoSpecNativeLoadModelOptions (type) [lines 693-729] [10 members] — Native additions accepted by the injected `geospec/runner/native` loader
  GeoSpecNativeLoadModelOptions.rootDir (property) — Project-relative folder `file` resolves in, for a suite that loads…
  GeoSpecNativeLoadModelOptions.format (property) — Geometry format to export
  GeoSpecNativeLoadModelOptions.parameters (property) — Explicit parameters passed to the runtime
  GeoSpecNativeLoadModelOptions.stepStreaming (property) — STEP reader strategy used for STEP exports
  GeoSpecNativeLoadModelOptions.mesh (property) — Whether STEP loading should also produce mesh evidence
  GeoSpecNativeLoadModelOptions.meshLinearTolerance (property) — Linear tolerance used while meshing exact BRep evidence
  GeoSpecNativeLoadModelOptions.meshAngularToleranceDegrees (property) — Angular tolerance in degrees used while meshing exact BRep evidence
  GeoSpecNativeLoadModelOptions.workUnitLimit (property) — Default work-unit budget for every claim on this subject
  GeoSpecNativeLoadModelOptions.resources (property) — Ordered external resource payloads declared to the native admission request
  GeoSpecNativeLoadModelOptions.ingestOptions (property) — Format-specific native ingest options
GeoSpecNativeModelEngine (type) [lines 731-751] [5 members] — Native engine operations required for model admission and run-level cleanup
  GeoSpecNativeModelEngine.evaluateClaim (method)
  GeoSpecNativeModelEngine.processRequest (method)
  GeoSpecNativeModelEngine.ingestSubject (method)
  GeoSpecNativeModelEngine.subjectHandle (method)
  GeoSpecNativeModelEngine.releaseSubject (method)
GeoSpecNativeModelLoader (type) [lines 753-755] — Model loader injected into native VM runs
GeoSpecNativeModelSubject (type) [lines 757-769] [3 members] — Subject identity returned by native STEP/GLB admission
  GeoSpecNativeModelSubject.contentHash (property)
  GeoSpecNativeModelSubject.subjectHash (property)
  GeoSpecNativeModelSubject.load (property) — Exact successful-load evidence retained by the admitting host, when available
GeoSpecNativeModelResource (type) [lines 771-779] [2 members] — One named external resource referenced by a direct glTF-family source
  GeoSpecNativeModelResource.name (property)
  GeoSpecNativeModelResource.source (property)
GeoSpecNativeSourceReader (type) [lines 781-783] — Resolve a non-memory source into ordinary ArrayBuffer-backed bytes
ManagedGeoSpecNativeModelLoader (type) [lines 785-805] [1 members] — Reusable native model loader whose admitted subjects can be released…
  ManagedGeoSpecNativeModelLoader.releaseAll (method) — Drain registered admissions, including additions while drainage awaits, then release…
GeoSpecPoolHostMessage (type) [lines 807-828] [1 members]
  GeoSpecPoolHostMessage.type (property)
GeoSpecPoolShard (type) [lines 830-847] [3 members] — One schedulable work unit
  GeoSpecPoolShard.id (property) — Stable shard id, unique within one pool run
  GeoSpecPoolShard.file (property) — GeoSpec file this shard executes
  GeoSpecPoolShard.testNamePattern (property) — Exact-test pattern for split shards (R3
GeoSpecPoolWorkerHandle (type) [lines 849-874] [4 members]
  GeoSpecPoolWorkerHandle.postMessage (method)
  GeoSpecPoolWorkerHandle.onMessage (method)
  GeoSpecPoolWorkerHandle.onExit (method)
  GeoSpecPoolWorkerHandle.terminate (method) — Hard-stop the worker thread (R11 watchdog primitive)
GeoSpecPoolWorkerMessage (type) [lines 876-919] [1 members]
  GeoSpecPoolWorkerMessage.type (property)
GeoSpecForensicEvent (type) [lines 921-938] [5 members] — One structured forensic measurement emitted by a runner
  GeoSpecForensicEvent.type (property)
  GeoSpecForensicEvent.name (property)
  GeoSpecForensicEvent.value (property)
  GeoSpecForensicEvent.unit (property)
  GeoSpecForensicEvent.shardId (property)
GeoSpecRunner (type) [lines 940-970] [4 members] — Public GeoSpec runner lifecycle surface
  GeoSpecRunner.run (method) — Execute GeoSpec files and return a compact aggregate result
  GeoSpecRunner.on (method) — Subscribe to one lifecycle event type
  GeoSpecRunner.abort (method) — Request cooperative abort before the next file starts
  GeoSpecRunner.close (method) — Close the runner and release owned resources
GeoSpecRunnerEvent (type) [lines 972-1004] [1 members] — Lifecycle event emitted by GeoSpec worker-style runners
  GeoSpecRunnerEvent.type (property)
GeoSpecRunnerFileResult (type) [lines 1006-1033] [5 members] — One GeoSpec test file executed by a worker-style runner
  GeoSpecRunnerFileResult.file (property) — Absolute or project-relative GeoSpec test file path supplied to the…
  GeoSpecRunnerFileResult.result (property) — Low-level module execution result for this file
  GeoSpecRunnerFileResult.durationMs (property) — Wall-clock cost of executing this file, in milliseconds (R1)
  GeoSpecRunnerFileResult.primaryLoadKey (property) — First deterministic model-load cache key observed in this file (R9…
  GeoSpecRunnerFileResult.workerMemoryBytes (property) — Executing worker's isolate-resident memory at file completion, in bytes (R15…
GeoSpecRunnerOptions (type) [lines 1035-1057] [4 members] — Shared options for GeoSpec runner factories
  GeoSpecRunnerOptions.filesystem (property) — Filesystem containing the project and test modules
  GeoSpecRunnerOptions.nativeAssertions (property) — Protocol-3 assertion client shared by every authored assertion and model…
  GeoSpecRunnerOptions.nativeModelLoader (property) — Managed native model loader released after each settled run
  GeoSpecRunnerOptions.builtinModules (property) — Additional in-memory modules made available to the VM
GeoSpecRunnerResult (type) [lines 1059-1106] [9 members] — Aggregate result returned by GeoSpec worker-style runners
  GeoSpecRunnerResult.success (property) — True when no files or tests failed and at least…
  GeoSpecRunnerResult.passed (property) — Number of non-skipped tests that passed
  GeoSpecRunnerResult.failed (property) — Number of file-level or test-level failures
  GeoSpecRunnerResult.selectedTests (property) — Number of collected tests after filters were applied
  GeoSpecRunnerResult.files (property) — Per-file module execution results
  GeoSpecRunnerResult.issues (property) — Run-level issues such as aborts or empty filter selections
  GeoSpecRunnerResult.durationMs (property) — Wall-clock cost of the whole run, in milliseconds (R1)
  GeoSpecRunnerResult.accounting (property) — Complete requested-file accounting
  GeoSpecRunnerResult.lineageStatus (property) — Coherence of the consumed source graphs, not a geometry verdict
GeoSpecRunnerRunOptions (type) [lines 1108-1152] [7 members] — Options accepted by a GeoSpec worker-style runner run
  GeoSpecRunnerRunOptions.files (property) — GeoSpec test files to execute
  GeoSpecRunnerRunOptions.testNamePattern (property) — JavaScript regular expression matched against full `suite > test` names
  GeoSpecRunnerRunOptions.testTimeout (property) — Timeout for each async test callback, in milliseconds
  GeoSpecRunnerRunOptions.matcherWallBackstop (property) — Non-verdict matcher wall backstop
  GeoSpecRunnerRunOptions.workUnitLimit (property) — Engine work-unit budget for this run's claims, replacing the runner's…
  GeoSpecRunnerRunOptions.forensic (property) — Emit structured forensic measurements for this run
  GeoSpecRunnerRunOptions.bail (property) — Stop after the first failing file (R1)
GeoSpecAssertionClient (type) [lines 1154-1171] [2 members] — Runner-independent native assertion client
  GeoSpecAssertionClient.expectGeo (method) — Start a chain
  GeoSpecAssertionClient.query (method)
GeoSpecAssertionClientOptions (type) [lines 1173-1201] [6 members] — Flat construction options for a runner-independent native assertion client
  GeoSpecAssertionClientOptions.claimId (property)
  GeoSpecAssertionClientOptions.engine (property)
  GeoSpecAssertionClientOptions.evidenceProfile (property) — Success-evidence profile of every claim and query
  GeoSpecAssertionClientOptions.subjectSlot (property)
  GeoSpecAssertionClientOptions.workUnitLimit (property)
  GeoSpecAssertionClientOptions.maximumWorkUnitLimit (property) — The largest `workUnitLimit` a spec may author in `loadModel` or…
GeoSpecAssertionMatchers (type) [lines 1203-1208] [1 members] — Standalone native matcher chain, including core-owned negation
  GeoSpecAssertionMatchers.not (property)
GeoSpecAuthoringInvocation (type) [lines 1210-1230] [6 members] — One authored call shared by the collector and native assertion…
  GeoSpecAuthoringInvocation.arguments (property)
  GeoSpecAuthoringInvocation.expected (property)
  GeoSpecAuthoringInvocation.kind (property)
  GeoSpecAuthoringInvocation.matcher (property)
  GeoSpecAuthoringInvocation.polarity (property)
  GeoSpecAuthoringInvocation.subject (property)
GeoSpecMatcherMethods (type) [lines 1232-1235] — Matcher methods derived mechanically from the existing GeoSpec registry
GeoSpecQueryOptions (type) [lines 1237-1252] [4 members] — One positive-only ancillary query
  GeoSpecQueryOptions.capability (property)
  GeoSpecQueryOptions.claimId (property)
  GeoSpecQueryOptions.payload (property)
  GeoSpecQueryOptions.subject (property)
MinimumDistanceFact (type) [lines 1254-1283] [9 members] — Complete native minimum and ordered finite witnesses in canonical millimetres/Z-up
  MinimumDistanceFact.source (property)
  MinimumDistanceFact.assurance (property)
  MinimumDistanceFact.unit (property)
  MinimumDistanceFact.coordinateSystem (property)
  MinimumDistanceFact.subjectHash (property)
  MinimumDistanceFact.algorithmProfile (property)
  MinimumDistanceFact.occurrences (property)
  MinimumDistanceFact.distance (property)
  MinimumDistanceFact.points (property)
MinimumDistanceQuery (type) [lines 1285-1308] [3 members] — Complete AP242 minimum over two subject-bound occurrence paths
  MinimumDistanceQuery.capability (property)
  MinimumDistanceQuery.subject (property)
  MinimumDistanceQuery.payload (property)
MinimumDistanceResult (type) [lines 1310-1324] [1 members] — Geometry refusal and infrastructure interruption never masquerade as facts
  MinimumDistanceResult.status (property)
GeoSpecNativeQueryOptions (type) [lines 1326-1349] [9 members] — Flat native query transport options
  GeoSpecNativeQueryOptions.engine (property)
  GeoSpecNativeQueryOptions.claimId (property)
  GeoSpecNativeQueryOptions.evidenceProfile (property)
  GeoSpecNativeQueryOptions.subjectSlot (property)
  GeoSpecNativeQueryOptions.workUnitLimit (property)
  GeoSpecNativeQueryOptions.maximumWorkUnitLimit (property) — The host's largest authored budget, reported as `details.maximumLimit` on `MATCHER_TIMEOUT`
  GeoSpecNativeQueryOptions.subject (property)
  GeoSpecNativeQueryOptions.capability (property)
  GeoSpecNativeQueryOptions.payload (property)
GeoSpecQueryCapability (type) [lines 1351-1352] — Existing positive-only ancillary operations owned by the native core
GeoSpecPmiField (type) [lines 1354-1365] [3 members] — Explicit support state for one source-attributed inventory field
  GeoSpecPmiField.status (property)
  GeoSpecPmiField.value (property)
  GeoSpecPmiField.reason (property)
GeoSpecPmiRawEntity (type) [lines 1367-1378] [3 members] — Original Part21 entity ID and exact source argument tokens
  GeoSpecPmiRawEntity.sourceId (property)
  GeoSpecPmiRawEntity.kind (property)
  GeoSpecPmiRawEntity.arguments (property)
GeoSpecPmiNumber (type) [lines 1380-1400] [6 members] — Source-authored scalar and Rust-normalized reduced rational millimetres
  GeoSpecPmiNumber.sourceId (property)
  GeoSpecPmiNumber.authoredText (property)
  GeoSpecPmiNumber.unitId (property)
  GeoSpecPmiNumber.unitRecords (property)
  GeoSpecPmiNumber.millimetres (property)
  GeoSpecPmiNumber.name (property)
GeoSpecPmiFaceAssociation (type) [lines 1402-1416] [4 members] — A uniquely forward-transferred face
  GeoSpecPmiFaceAssociation.sourceFaceId (property)
  GeoSpecPmiFaceAssociation.occurrenceRoute (property)
  GeoSpecPmiFaceAssociation.occurrence (property)
  GeoSpecPmiFaceAssociation.publicFaceOrdinal (property)
GeoSpecPmiShapeReference (type) [lines 1418-1435] [5 members] — One ordered role reference, including incomplete source/transfer evidence
  GeoSpecPmiShapeReference.sourceAspectId (property)
  GeoSpecPmiShapeReference.sourceUsageIds (property)
  GeoSpecPmiShapeReference.sourceItemIds (property)
  GeoSpecPmiShapeReference.requestedRoute (property)
  GeoSpecPmiShapeReference.associations (property)
GeoSpecPmiLimits (type) [lines 1437-1448] [3 members] — Normalized authored limits
  GeoSpecPmiLimits.lowerMillimetres (property)
  GeoSpecPmiLimits.upperMillimetres (property)
  GeoSpecPmiLimits.basis (property)
GeoSpecPmiRecord (type) [lines 1450-1485] [11 members] — Source record preserving semantic/presentation separation and ordered roles
  GeoSpecPmiRecord.sourceId (property)
  GeoSpecPmiRecord.family (property)
  GeoSpecPmiRecord.channel (property)
  GeoSpecPmiRecord.kind (property)
  GeoSpecPmiRecord.name (property)
  GeoSpecPmiRecord.first (property)
  GeoSpecPmiRecord.second (property)
  GeoSpecPmiRecord.numbers (property)
  GeoSpecPmiRecord.limits (property)
  GeoSpecPmiRecord.interpretation (property)
  GeoSpecPmiRecord.raw (property)
GeoSpecPmiInventory (type) [lines 1487-1504] [5 members] — Positive-only inventory value inside the ordinary canonical query report
  GeoSpecPmiInventory.contract (property)
  GeoSpecPmiInventory.status (property)
  GeoSpecPmiInventory.fileSchema (property)
  GeoSpecPmiInventory.editionValidation (property)
  GeoSpecPmiInventory.records (property)
GeoSpecPmiQueryPayload (type) [lines 1506-1514] [2 members] — Strict inventory output limits
  GeoSpecPmiQueryPayload.maxRecords (property)
  GeoSpecPmiQueryPayload.maxOutputBytes (property)
GeoSpecPmiQueryValue (type) [lines 1516-1527] [3 members] — Complete inventory value
  GeoSpecPmiQueryValue.inventory (property)
  GeoSpecPmiQueryValue.subjectHash (property)
  GeoSpecPmiQueryValue.provenance (property)

## Types (3) — `public-api-types-3.md`

GeoSpecCanonicalClaimReport (type) [lines 5-39] [10 members] — Full native assertion result with the exact core-owned bytes retained
  GeoSpecCanonicalClaimReport.canonicalClaim (property)
  GeoSpecCanonicalClaimReport.canonicalPlan (property)
  GeoSpecCanonicalClaimReport.canonicalResult (property)
  GeoSpecCanonicalClaimReport.claim (property)
  GeoSpecCanonicalClaimReport.claimId (property)
  GeoSpecCanonicalClaimReport.diagnostics (property) — Engine diagnostics
  GeoSpecCanonicalClaimReport.evidence (property)
  GeoSpecCanonicalClaimReport.polarity (property)
  GeoSpecCanonicalClaimReport.result (property)
  GeoSpecCanonicalClaimReport.status (property)
GeoSpecNativeClaimEvaluation (type) [lines 41-52] [3 members] — Exact core bytes of one claim evaluated in one engine…
  GeoSpecNativeClaimEvaluation.canonicalClaim (property)
  GeoSpecNativeClaimEvaluation.canonicalPlan (property)
  GeoSpecNativeClaimEvaluation.canonicalResult (property)
GeoSpecNativeEngine (type) [lines 54-64] [2 members] — Byte-only engine surface consumed by the runner-independent assertion client
  GeoSpecNativeEngine.evaluateClaim (method)
  GeoSpecNativeEngine.processRequest (method)
GeoSpecNativeEvidenceProfile (type) [lines 66-67] — Success-evidence profile a product selects for its plans (PERF-OUTPUT-01)
GeoSpecNativeSubject (type) [lines 69-77] [2 members] — Content-addressed subject accepted by a protocol-3 assertion plan
  GeoSpecNativeSubject.contentHash (property)
  GeoSpecNativeSubject.subjectHash (property)
GeoSpecFixedMatcherDescriptor (type) [lines 79-90] [3 members] — A canonical fixed-contract matcher
  GeoSpecFixedMatcherDescriptor.contract (property)
  GeoSpecFixedMatcherDescriptor.expected (property)
  GeoSpecFixedMatcherDescriptor.mode (property)
GeoSpecVitestAdapter (type) [lines 92-101] [2 members] — Installed Vitest matcher map and lifecycle settlement hook
  GeoSpecVitestAdapter.matchers (property)
  GeoSpecVitestAdapter.flush (method)
ExportTauProjectArtifactOptions (type) [lines 103-116] [3 members] — Input for exporting one validated Tau project descriptor
  ExportTauProjectArtifactOptions.descriptor (property)
  ExportTauProjectArtifactOptions.createRuntime (property) — Called twice so source discovery and export use separate runtime…
  ExportTauProjectArtifactOptions.signal (property)
GeoSpecTauProjectArtifact (type) [lines 118-171] [7 members] — Finalized geometry bytes and the exact source/export metadata that produced…
  GeoSpecTauProjectArtifact.format (property)
  GeoSpecTauProjectArtifact.name (property)
  GeoSpecTauProjectArtifact.mimeType (property)
  GeoSpecTauProjectArtifact.bytes (property)
  GeoSpecTauProjectArtifact.frame (property)
  GeoSpecTauProjectArtifact.source (property)
  GeoSpecTauProjectArtifact.export (property)
GeoSpecTauProjectRuntime (type) [lines 173-191] [3 members] — Runtime surface required to snapshot and export one Tau project
  GeoSpecTauProjectRuntime.open (property)
  GeoSpecTauProjectRuntime.on (method)
  GeoSpecTauProjectRuntime.bestRouteFor (method)
GeoSpecConfig (type) [lines 193-232] [10 members] — Trusted project configuration using existing discovery and runner options
  GeoSpecConfig.include (property)
  GeoSpecConfig.exclude (property)
  GeoSpecConfig.testNamePattern (property)
  GeoSpecConfig.testTimeout (property) — Positive finite milliseconds
  GeoSpecConfig.matcherWallBackstop (property) — Positive finite milliseconds
  GeoSpecConfig.bail (property)
  GeoSpecConfig.forensic (property)
  GeoSpecConfig.cache (property)
  GeoSpecConfig.cacheDirectory (property) — Requested cache location only
  GeoSpecConfig.subjects (property)
GeoSpecTauProjectDescriptor (type) [lines 234-254] [5 members] — Imported Tau project data for later host resolution
  GeoSpecTauProjectDescriptor.kind (property)
  GeoSpecTauProjectDescriptor.manifestPath (property) — Normalized project-relative POSIX path identifying the imported manifest
  GeoSpecTauProjectDescriptor.manifest (property)
  GeoSpecTauProjectDescriptor.format (property)
  GeoSpecTauProjectDescriptor.parameters (property)
LoadedGeoSpecConfig (type) [lines 256-264] [2 members] — Resolved file identity and validated configuration data
  LoadedGeoSpecConfig.configPath (property)
  LoadedGeoSpecConfig.options (property)
LoadGeoSpecConfigOptions (type) [lines 266-281] [3 members] — Options for one trusted Node configuration load
  LoadGeoSpecConfigOptions.projectPath (property)
  LoadGeoSpecConfigOptions.configPath (property) — Explicit file, resolved relative to the project unless absolute
  LoadGeoSpecConfigOptions.overrides (property) — Own defined fields override configuration without deep merging

## Classes — `public-api-classes.md`

GeoSpecModelLoadError (class) [lines 5-13] [2 members] — Error thrown by {@link import ('./load-model.js').loadModel} when geometry cannot be…
  GeoSpecModelLoadError.diagnostics (property) — Structured diagnostics explaining why model loading failed
  GeoSpecModelLoadError.constructor (constructor)
GeoSpecAssertionError (class) [lines 15-22] [2 members] — Assertion error thrown by GeoSpec matchers when an expectation does…
  GeoSpecAssertionError.diagnostics (property)
  GeoSpecAssertionError.constructor (constructor)
