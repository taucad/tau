# geospec public API index

geospec 0.1.0-beta.1 · 1460 symbols · extracted by TypeScript 5.9.3.

Every symbol appears here exactly once. The heading above each block names the file with its signature; grep the skill directory for `name(` to land on the declaration directly.

## Functions — `public-api-functions.md`

createGeoSpec (function) — Create a GeoSpec instance
describe (function) [1 members] — GeoSpec suite helper used inside VM-executed test modules
  describe.skip (method)
expectGeo (function) — Start a geometry assertion chain
it (function) [1 members] — GeoSpec test helper used inside VM-executed test modules
  it.skip (method)
test (function) [1 members] — Alias for {@link it}
  test.skip (method)
analyzeBrep (function) — Read BRep evidence from a loaded GeoSpec subject
normalizeGeoSpecExpected (function) — Derive the `expected` value an assertion records from the call…
assertGeoSpecJsonValue (function) — Reject a non-wire value rather than letting JSON.stringify erase it
decodeGeoSpecCanonicalJson (function) — Parse and validate canonical bytes without re-canonicalizing them
encodeGeoSpecCanonicalJson (function) — Encode client-owned canonical claim bytes
isGeoSpecJsonValue (function) — Runtime JSON-value guard used at every protocol trust boundary
toGeoSpecProtocolJson (function) — Convert an authoring value to protocol JSON, including the two…
clearGeoSpecEngine (function) — Remove the registered engine
describeGeoSpecEngine (function) — Describe the registered engine and its advertised capabilities
geoSpecEngineUnavailableDiagnostic (function)
getGeoSpecEngine (function) — The registered engine, if any
getGeoSpecEngineHostBinding (function) — Look up one engine export
getGeoSpecEngineProtocol (function) — The registered Contract-B binding, if any
registerGeoSpecEngine (function) — Register the engine that executes GeoSpec claims
requireGeoSpecEngineHostBinding (function) — Look up one engine export or fail with the engine-unavailable…
inspectGeometry (function) — Resolve selectors against a subject and report the matched entities
analyzeMeshOverlap (function) — Find positive-volume intersections between a subject's components
analyzeMesh (function) — Return a detached full-statistics snapshot
loadMesh (function) — Load mesh evidence into a GeoSpec geometry subject
createModelLoader (function) — Create a {@link loadModel} function with shared defaults
loadModel (function) — Load a CAD model into GeoSpec evidence
resolveRuntimeExportIntent (function)
clearCollectorGlobals (function)
createCollector (function)
installCollector (function)
chargeBudget (function)
checkBudget (function)
compileGeoSpecTestNamePattern (function) — Compile a Vitest-style test-name pattern once for a GeoSpec run
filterGeoSpecTests (function) — Filter collected GeoSpec tests by compiled test-name pattern
matchesGeoSpecTestName (function) — Return true when a collected GeoSpec test matches the supplied…
discoverGeoSpecFiles (function) — Discover GeoSpec test files from exact files or directory roots
isGeoSpecTestFile (function) — Return true when a project-relative path names a GeoSpec test…
runGeoSpecModule (function) — Execute an ESM GeoSpec module using the shared Tau VM…
createNativeGeoSpecRunner (function) — Compose compiled assertion and model bindings with the SDK's serial…
allocateNativePoolGrants (function) — Assign a bounded CPU budget across already-selected worker isolates
createGeoSpecNativeModelLoader (function) — Create a native model loader that admits actual STEP/GLB bytes…
createGeoSpecNodeRunner (function) — Create a GeoSpec runner for Node.js and CLI environments
createGeoSpecNodePoolRunner (function) — Create a worker-pool GeoSpec runner for Node.js
createNodeVmFileSystem (function) — Create a Node `VmFileSystem` rooted at `root`
createGeoSpecWebRunner (function) — Create a GeoSpec runner for browser environments
createGeoSpecWebPoolRunner (function) — Create a worker-pool GeoSpec runner for browser environments
createNoMatchingGeoSpecTestsIssue (function) — Create a run-level issue when filters select no tests
startGeoSpecPoolWorkerHost (function) — Start serving shards
composeFullName (function) — Compose a full selector name from an occurrence path and…
isValidStoredName (function) — Validate a stored (artifact-side) interface or occurrence name against the…
parseSelectorPath (function) — Parse a selector-side dotted path into segments
resolveTolerances (function) — Resolve effective tolerances from optional overrides
deserializeSelector (function) — Reconstruct a selector from its JSON-safe serialized form
serializeSelector (function) — Serialize a selector to a JSON-safe value (RegExp as `{…
buildSelectorIndex (function) — Build the per-subject selector index from an SB1 XDE read…
resolve (function) — Resolve a geometry selector against a per-subject selector index
ambiguousDiagnostic (function) — Build a `GEOSPEC_SELECTOR_AMBIGUOUS` diagnostic
unmatchedDiagnostic (function) — Build a `GEOSPEC_SELECTOR_UNMATCHED` diagnostic
unsupportedEvidenceDiagnostic (function) — Build a `GEOSPEC_SELECTOR_UNSUPPORTED_EVIDENCE` diagnostic
createStepLoader (function) — Create a {@link loadStep} function with shared defaults
loadStep (function) — Load STEP/XDE/BRep evidence into a GeoSpec geometry subject
parseXdeReadResultJson (function) — Parse the native reader's JSON payload into a structured XDE…
createGeoSpecAssertionClient (function) — Create a standalone native GeoSpec assertion client
createGeoSpecMatcherMethods (function) — Create the one registry-derived matcher surface used by every JavaScript…
evaluateGeoSpecNativeQuery (function) — Submit an ancillary query with positive polarity through the native…
createGeoSpecVitestAdapter (function) — Create Vitest matchers over an existing runner-independent client
installGeoSpecVitest (function) — Register GeoSpec matchers and their settlement hook in the active…
setupGeoSpecVitest (function) — Create a native client and register it with the active…
exportTauProjectArtifact (function) — Export one Tau project from Runtime's coherent source snapshot
loadGeoSpecConfig (function) — Load one trusted project config using Node's native module loader

## Constants — `public-api-constants.md`

geoSpecMatcherNames (constant) — Every matcher name exposed by {@link expectGeo}, derived from the…
geoSpecMatcherDescriptors (constant) — The 26-entry matcher registry
geoSpecEngineProtocolVersion (constant) — Contract-B protocol version spoken by this substrate
geoSpecMatcherRegistryVersion (constant) — Registry version consumed by the Wave-1 matcher vocabulary
geoSpecEngineGlobalKey (constant)
geoSpecEngineUnavailableCode (constant)
GeoSpecEngineUnavailableError (constant) [3 members] — Registry error constructor, re-exported without changing its identity
  GeoSpecEngineUnavailableError.captureStackTrace (method) — Creates a `.stack` property on `targetObject`, which when accessed returns…
  GeoSpecEngineUnavailableError.prepareStackTrace (method)
  GeoSpecEngineUnavailableError.stackTraceLimit (property) — The `Error.stackTraceLimit` property specifies the number of stack frames collected…
defaultGeoSpecIgnoredDirectories (constant) — Directories skipped by recursive GeoSpec discovery unless callers provide their…
defaultGeoSpecInclude (constant) — Default file globs used by GeoSpec test discovery
storedNamePattern (constant) — Full-name regex for stored interface names per the profile
defaultSelectorTolerances (constant) [2 members] — Default selector tolerances
  defaultSelectorTolerances.linearMm (property) — Linear/contact tolerance in millimetres (offset bands, `near`, radii)
  defaultSelectorTolerances.angularToleranceDegrees (property) — Angular tolerance in degrees for normal/axis/parallelism predicates
selectorDiagnosticCodes (constant) [3 members] — Diagnostic codes emitted by selector resolution
  selectorDiagnosticCodes.unmatched (property)
  selectorDiagnosticCodes.ambiguous (property)
  selectorDiagnosticCodes.unsupportedEvidence (property)

## Types — `public-api-types.md`

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
AnalyzeBrepOptions (type) [1 members] — Options for BRep evidence analysis
  AnalyzeBrepOptions.subject (property)
AnalyzeBrepResult (type) [2 members] — Typed result returned by {@link analyzeBrep}
  AnalyzeBrepResult.success (property)
  AnalyzeBrepResult.diagnostics (property)
GeoSpecMatcherDescriptor (type) [3 members] — One matcher's contract entry
  GeoSpecMatcherDescriptor.kind (property)
  GeoSpecMatcherDescriptor.expected (property)
  GeoSpecMatcherDescriptor.mode (property)
GeoSpecMatcherExpectedShape (type) — How the substrate derives an assertion's recorded `expected` value from…
GeoSpecMatcherMode (type) — Whether a matcher settles synchronously (throwing its `GeoSpecAssertionError` inside the…
GeoSpecMatcherName (type) — Every matcher name exposed by `expectGeo(...)`
GeoSpecCancelRequest (type) [2 members] — Per-request or per-claim cancellation
  GeoSpecCancelRequest.requestId (property)
  GeoSpecCancelRequest.claimId (property)
GeoSpecCancelResult (type) [2 members] — Idempotent cancellation acknowledgement
  GeoSpecCancelResult.requestId (property)
  GeoSpecCancelResult.cancelled (property)
GeoSpecClaim (type) [5 members] — Canonical JSON payload encoded into one claim byte lane
  GeoSpecClaim.claimId (property)
  GeoSpecClaim.capability (property)
  GeoSpecClaim.subjectIds (property)
  GeoSpecClaim.payload (property)
  GeoSpecClaim.workUnitBudget (property)
GeoSpecClaimId (type) — Opaque claim identifier
GeoSpecClaimResult (type) [5 members] — One serializable claim result
  GeoSpecClaimResult.claimId (property)
  GeoSpecClaimResult.status (property)
  GeoSpecClaimResult.diagnostics (property)
  GeoSpecClaimResult.evidence (property)
  GeoSpecClaimResult.provenance (property)
GeoSpecDeterminismClass (type) — Determinism class negotiated during initialization (DL6)
GeoSpecEngineProtocol (type) [6 members] — First TypeScript binding of Contract B
  GeoSpecEngineProtocol.initialize (method)
  GeoSpecEngineProtocol.ingestSubject (method)
  GeoSpecEngineProtocol.submitClaims (method)
  GeoSpecEngineProtocol.cancel (method)
  GeoSpecEngineProtocol.releaseSubject (method)
  GeoSpecEngineProtocol.on (method)
GeoSpecExecutionOptions (type) [2 members] — Resolved operational controls carried outside canonical claim bytes
  GeoSpecExecutionOptions.forensic (property)
  GeoSpecExecutionOptions.matcherWallBackstop (property)
GeoSpecIngestSubjectRequest (type) [6 members] — Metadata lane for subject ingestion
  GeoSpecIngestSubjectRequest.requestId (property)
  GeoSpecIngestSubjectRequest.contentHash (property)
  GeoSpecIngestSubjectRequest.format (property)
  GeoSpecIngestSubjectRequest.frame (property)
  GeoSpecIngestSubjectRequest.provenance (property)
  GeoSpecIngestSubjectRequest.options (property)
GeoSpecIngestSubjectResult (type) [2 members] — Subject-ingestion response
  GeoSpecIngestSubjectResult.requestId (property)
  GeoSpecIngestSubjectResult.subject (property)
GeoSpecInitializeRequest (type) [2 members] — Client half of the Contract-B initialization handshake
  GeoSpecInitializeRequest.protocolVersion (property)
  GeoSpecInitializeRequest.client (property)
GeoSpecInitializeResult (type) [5 members] — Engine half of the Contract-B initialization handshake
  GeoSpecInitializeResult.protocolVersion (property)
  GeoSpecInitializeResult.engine (property)
  GeoSpecInitializeResult.determinism (property)
  GeoSpecInitializeResult.capabilities (property)
  GeoSpecInitializeResult.provenance (property)
GeoSpecProtocolCapability (type) [2 members] — One capability honestly advertised by an engine build
  GeoSpecProtocolCapability.name (property)
  GeoSpecProtocolCapability.registryVersion (property)
GeoSpecProtocolEvent (type) [3 members] — Advisory event
  GeoSpecProtocolEvent.requestId (property)
  GeoSpecProtocolEvent.kind (property)
  GeoSpecProtocolEvent.payload (property)
GeoSpecProtocolProvenance (type) [3 members] — Serializable build provenance returned by initialization
  GeoSpecProtocolProvenance.engineDigest (property)
  GeoSpecProtocolProvenance.build (property)
  GeoSpecProtocolProvenance.license (property)
GeoSpecReleaseSubjectRequest (type) [2 members] — Idempotent subject-release request
  GeoSpecReleaseSubjectRequest.requestId (property)
  GeoSpecReleaseSubjectRequest.subjectId (property)
GeoSpecReleaseSubjectResult (type) [2 members] — Subject-release acknowledgement
  GeoSpecReleaseSubjectResult.requestId (property)
  GeoSpecReleaseSubjectResult.released (property)
GeoSpecRequestId (type) — Opaque request identifier
GeoSpecSubjectFrame (type) [3 members] — Canonical frame attached to bytes entering the engine
  GeoSpecSubjectFrame.coordinateSystem (property)
  GeoSpecSubjectFrame.sourceUnit (property)
  GeoSpecSubjectFrame.targetUnit (property)
GeoSpecSubjectId (type) — Opaque engine-owned subject identifier
GeoSpecSubjectReference (type) [3 members] — Opaque subject handle returned after ingestion
  GeoSpecSubjectReference.kind (property)
  GeoSpecSubjectReference.subjectId (property)
  GeoSpecSubjectReference.contentHash (property)
GeoSpecSubmitClaimsRequest (type) [4 members] — A canonical claim batch
  GeoSpecSubmitClaimsRequest.requestId (property)
  GeoSpecSubmitClaimsRequest.registryVersion (property)
  GeoSpecSubmitClaimsRequest.execution (property)
  GeoSpecSubmitClaimsRequest.claims (property)
GeoSpecSubmitClaimsResult (type) [2 members] — Claim-batch response
  GeoSpecSubmitClaimsResult.requestId (property)
  GeoSpecSubmitClaimsResult.results (property)
GeoSpecEngineCapability (type) — A capability name an engine build may advertise
GeoSpecEngineDescriptor (type) [4 members] — Serializable description of the registered engine — the capability discovery…
  GeoSpecEngineDescriptor.protocolVersion (property)
  GeoSpecEngineDescriptor.engine (property)
  GeoSpecEngineDescriptor.version (property)
  GeoSpecEngineDescriptor.capabilities (property)
GeoSpecEngineHostBindings (type) [12 members] — Host-only bootstrap operations
  GeoSpecEngineHostBindings.loadMesh (method)
  GeoSpecEngineHostBindings.analyzeMesh (method)
  GeoSpecEngineHostBindings.loadStep (method)
  GeoSpecEngineHostBindings.loadModel (method)
  GeoSpecEngineHostBindings.createModelLoader (method)
  GeoSpecEngineHostBindings.createGeoSpecNodeRunner (method)
  GeoSpecEngineHostBindings.createGeoSpecNodePoolRunner (method)
  GeoSpecEngineHostBindings.createGeoSpecWebRunner (method)
  GeoSpecEngineHostBindings.createGeoSpecWebPoolRunner (method)
  GeoSpecEngineHostBindings.createNodeVmFileSystem (method)
  GeoSpecEngineHostBindings.startGeoSpecPoolWorkerHost (method)
  GeoSpecEngineHostBindings.flushEvidenceStore (method)
GeoSpecEngineImplementation (type) [5 members] — What an engine registers with the substrate
  GeoSpecEngineImplementation.protocolVersion (property) — Must equal {@link geoSpecEngineProtocolVersion }
  GeoSpecEngineImplementation.engine (property) — Engine identity, e.g
  GeoSpecEngineImplementation.version (property) — Engine build version, recorded in provenance and cache keys
  GeoSpecEngineImplementation.protocol (property) — Contract-B transport binding used for every geometry claim
  GeoSpecEngineImplementation.host (property) — Optional in-process host bootstrap
GeometryInspectionEntity (type) [4 members] — One inspected geometry entity
  GeometryInspectionEntity.kind (property)
  GeometryInspectionEntity.name (property)
  GeometryInspectionEntity.bounds (property)
  GeometryInspectionEntity.source (property)
GeometryInspectionSelection (type) [2 members] — Result of one selector inspection
  GeometryInspectionSelection.selector (property)
  GeometryInspectionSelection.matches (property)
InspectGeometryOptions (type) [3 members] — Options for {@link inspectGeometry}
  InspectGeometryOptions.subject (property)
  InspectGeometryOptions.selectors (property)
  InspectGeometryOptions.evidence (property)
InspectGeometryResult (type) [2 members] — Structured inspection result used by relationship and occurrence matchers
  InspectGeometryResult.selections (property)
  InspectGeometryResult.diagnostics (property)
AnalyzeMeshOverlapOptions (type) [3 members] — Options for component-overlap analysis
  AnalyzeMeshOverlapOptions.subject (property)
  AnalyzeMeshOverlapOptions.tolerance (property)
  AnalyzeMeshOverlapOptions.pairs (property)
AnalyzeMeshOverlapResult (type) [2 members] — Typed result for component-overlap analysis
  AnalyzeMeshOverlapResult.success (property)
  AnalyzeMeshOverlapResult.diagnostics (property)
MeshComponentOverlap (type) [9 members] — One overlapping component pair found by {@link analyzeMeshOverlap}
  MeshComponentOverlap.leftComponentId (property)
  MeshComponentOverlap.rightComponentId (property)
  MeshComponentOverlap.leftLabel (property)
  MeshComponentOverlap.rightLabel (property)
  MeshComponentOverlap.leftColor (property)
  MeshComponentOverlap.rightColor (property)
  MeshComponentOverlap.intersectionVolume (property)
  MeshComponentOverlap.witnessPoint (property)
  MeshComponentOverlap.penetration (property)
MeshOverlapEvidence (type) [6 members] — Successful overlap analysis
  MeshOverlapEvidence.componentSource (property)
  MeshOverlapEvidence.componentCount (property)
  MeshOverlapEvidence.selectedPairs (property)
  MeshOverlapEvidence.checkedPairs (property)
  MeshOverlapEvidence.tolerance (property)
  MeshOverlapEvidence.overlaps (property)
LoadMeshFailure (type) [2 members] — Failed mesh load result
  LoadMeshFailure.success (property)
  LoadMeshFailure.diagnostics (property)
LoadMeshSuccess (type) [2 members] — Successful mesh load result
  LoadMeshSuccess.success (property)
  LoadMeshSuccess.subject (property)
MeshBufferSource (type) [4 members] — In-memory triangle mesh source
  MeshBufferSource.format (property)
  MeshBufferSource.positions (property)
  MeshBufferSource.indices (property)
  MeshBufferSource.name (property)
MeshSource (type) — Mesh source forms accepted by {@link loadMesh}
AabbMeters (type) [2 members] — Axis-aligned bounding box in glTF document units (meters)
  AabbMeters.min (property)
  AabbMeters.max (property)
BoundingBoxAxisExtremum (type) [3 members] — Dominant primitive on an axis extremum for `boundingBox` failures
  BoundingBoxAxisExtremum.name (property)
  BoundingBoxAxisExtremum.aabb (property)
  BoundingBoxAxisExtremum.value (property)
BoundingBoxAxisFailure (type) [7 members] — One axis failure for `boundingBox` checks
  BoundingBoxAxisFailure.axis (property)
  BoundingBoxAxisFailure.field (property)
  BoundingBoxAxisFailure.expected (property)
  BoundingBoxAxisFailure.actual (property)
  BoundingBoxAxisFailure.tolerance (property)
  BoundingBoxAxisFailure.minExtremum (property)
  BoundingBoxAxisFailure.maxExtremum (property)

## Types (2) — `public-api-types-2.md`

BoundingBoxFailure (type) [1 members] — Structured payload when `boundingBox` fails
  BoundingBoxFailure.axisFailures (property)
BoundingBoxStats (type) [3 members] — Scene bounding box with per-primitive contributors in the subject's unit…
  BoundingBoxStats.size (property)
  BoundingBoxStats.center (property)
  BoundingBoxStats.primitives (property)
CheckResult (type) [1 members] — Result of evaluating a single test requirement against geometry stats
  CheckResult.passed (property)
ClusterGap (type) [6 members] — Smallest clearance between two clusters along the dominant separation axis
  ClusterGap.fromLabel (property)
  ClusterGap.toLabel (property)
  ClusterGap.axis (property)
  ClusterGap.gapMm (property) — Millimetres — clearance between the two named primitives' AABBs
  ClusterGap.fromPrimitive (property)
  ClusterGap.toPrimitive (property)
ClusterReport (type) [5 members] — One spatial cluster from AABB overlap grouping
  ClusterReport.label (property)
  ClusterReport.primitives (property)
  ClusterReport.aabb (property)
  ClusterReport.centroid (property)
  ClusterReport.totalVertices (property)
ConnectedComponentsFailure (type) [5 members] — Structured payload when `connectedComponents` fails
  ConnectedComponentsFailure.expected (property)
  ConnectedComponentsFailure.got (property)
  ConnectedComponentsFailure.toleranceMm (property)
  ConnectedComponentsFailure.clusters (property)
  ConnectedComponentsFailure.gaps (property)
ConnectedComponentsResult (type) [3 members] — Full connected-components analysis at one tolerance
  ConnectedComponentsResult.count (property)
  ConnectedComponentsResult.clusters (property)
  ConnectedComponentsResult.gaps (property)
GeometryEvidenceDiagnostic (type) [6 members] — Diagnostic form permitted inside a wire-safe subject snapshot
  GeometryEvidenceDiagnostic.code (property)
  GeometryEvidenceDiagnostic.severity (property)
  GeometryEvidenceDiagnostic.message (property)
  GeometryEvidenceDiagnostic.suggestion (property)
  GeometryEvidenceDiagnostic.spatial (property)
  GeometryEvidenceDiagnostic.details (property)
GeometryStats (type) [6 members] — Statistics about a parsed GLB geometry
  GeometryStats.vertexCount (property)
  GeometryStats.meshCount (property)
  GeometryStats.triangleCount (property)
  GeometryStats.meshQuality (property)
  GeometryStats.watertight (property)
  GeometryStats.boundingBox (property)
PrimitiveRecord (type) [4 members] — One TRIANGLES primitive with identity for spatial-test feedback
  PrimitiveRecord.name (property) — The glTF node / mesh name (from kernel ShapeConfig.name when…
  PrimitiveRecord.color (property)
  PrimitiveRecord.vertices (property)
  PrimitiveRecord.aabb (property)
WatertightFailure (type) [7 members] — Structured payload when `watertight` fails
  WatertightFailure.irregularEdges (property) — Edges with incidence ≠ 2 (open or non-manifold)
  WatertightFailure.openBoundaryEdges (property) — Edges shared by exactly one triangle (open boundary)
  WatertightFailure.nonManifoldEdges (property) — Edges shared by more than two triangles (over-adjacent/non-manifold)
  WatertightFailure.irregularEdgeKindCounts (property)
  WatertightFailure.irregularEdgeClusters (property)
  WatertightFailure.irregularEdgeFraction (property)
  WatertightFailure.perPrimitive (property)
WatertightIrregularEdgeCluster (type) [4 members] — Spatial cluster of related irregular edges
  WatertightIrregularEdgeCluster.kind (property)
  WatertightIrregularEdgeCluster.edgeCount (property)
  WatertightIrregularEdgeCluster.aabb (property)
  WatertightIrregularEdgeCluster.samples (property)
WatertightIrregularEdgeKind (type) — Class of irregular mesh edge found during watertight analysis
WatertightIrregularEdgeSample (type) [6 members] — Representative irregular edge, in glTF document coordinates
  WatertightIrregularEdgeSample.start (property)
  WatertightIrregularEdgeSample.end (property)
  WatertightIrregularEdgeSample.center (property)
  WatertightIrregularEdgeSample.incidentTriangleCount (property)
  WatertightIrregularEdgeSample.primitives (property)
  WatertightIrregularEdgeSample.color (property)
WatertightPrimitiveBreakdown (type) [3 members] — Per-primitive watertight diagnostic (local tessellation only)
  WatertightPrimitiveBreakdown.name (property)
  WatertightPrimitiveBreakdown.boundaryEdges (property)
  WatertightPrimitiveBreakdown.loopCentroid (property)
WatertightResult (type) [9 members] — Full watertight analysis (global + per-primitive breakdown)
  WatertightResult.watertight (property)
  WatertightResult.irregularEdges (property)
  WatertightResult.openBoundaryEdges (property)
  WatertightResult.nonManifoldEdges (property)
  WatertightResult.irregularEdgeKindCounts (property)
  WatertightResult.irregularEdgeClusters (property)
  WatertightResult.totalEdges (property)
  WatertightResult.irregularEdgeFraction (property)
  WatertightResult.perPrimitive (property)
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
RelationshipBroadPhase (type) [3 members] — Labeled broad-phase record
  RelationshipBroadPhase.method (property)
  RelationshipBroadPhase.candidate (property)
  RelationshipBroadPhase.detail (property)
RelationshipEndpointReport (type) [2 members] — Selector resolution summary attached to relationship diagnostics so every failure…
  RelationshipEndpointReport.role (property)
  RelationshipEndpointReport.selection (property)
RelationshipEvidence (type) [4 members] — Structured result of one relationship proof (L4)
  RelationshipEvidence.verdict (property)
  RelationshipEvidence.broadPhase (property)
  RelationshipEvidence.final (property)
  RelationshipEvidence.diagnostics (property) — `GEOSPEC_SPATIAL_RELATIONSHIP_MISMATCH` on fail
RelationshipFinalEvidence (type) [4 members] — Final exact-evidence record for a relationship verdict
  RelationshipFinalEvidence.method (property)
  RelationshipFinalEvidence.measured (property) — Measured values in millimetres/degrees (shared unit contract)
  RelationshipFinalEvidence.expected (property) — Expected values in millimetres/degrees (shared unit contract)
  RelationshipFinalEvidence.witnesses (property)
RelationshipWitness (type) [4 members] — One geometric witness backing a relationship verdict
  RelationshipWitness.kind (property)
  RelationshipWitness.value (property)
  RelationshipWitness.topologyRef (property)
  RelationshipWitness.provenance (property) — Where the witness points came from
GeoSpecCollector (type) [7 members] — Collects suites, tests, assertions, and async completion state for one…
  GeoSpecCollector.tests (property)
  GeoSpecCollector.describe (method)
  GeoSpecCollector.describeSkip (method)
  GeoSpecCollector.it (method)
  GeoSpecCollector.itSkip (method)
  GeoSpecCollector.expectGeo (method)
  GeoSpecCollector.waitForCompletion (method)
GeoSpecNativeCollector (type) [7 members] — Native collector surface for hosts that explicitly supply a native…
  GeoSpecNativeCollector.tests (property)
  GeoSpecNativeCollector.describe (method)
  GeoSpecNativeCollector.describeSkip (method)
  GeoSpecNativeCollector.it (method)
  GeoSpecNativeCollector.itSkip (method)
  GeoSpecNativeCollector.waitForCompletion (method)
  GeoSpecNativeCollector.expectGeo (method)
GeoSpecCollectorOptions (type) [3 members] — Per-module collector configuration
  GeoSpecCollectorOptions.matcherWallBackstop (property)
  GeoSpecCollectorOptions.forensic (property)
  GeoSpecCollectorOptions.nativeAssertions (property)
GeoSpecTestNamePattern (type) — Compiled Vitest-style test-name pattern used by a GeoSpec run
DiscoverGeoSpecFilesOptions (type) [6 members] — Options for recursive GeoSpec test discovery
  DiscoverGeoSpecFilesOptions.filesystem (property)
  DiscoverGeoSpecFilesOptions.projectPath (property)
  DiscoverGeoSpecFilesOptions.files (property)
  DiscoverGeoSpecFilesOptions.include (property)
  DiscoverGeoSpecFilesOptions.exclude (property)
  DiscoverGeoSpecFilesOptions.ignoredDirectories (property)
GeoSpecDiscoveryFileKind (type) — File kind returned by a GeoSpec discovery filesystem
GeoSpecDiscoveryFileStat (type) [1 members] — Minimal stat object required for recursive GeoSpec test discovery
  GeoSpecDiscoveryFileStat.kind (property)
GeoSpecDiscoveryFileSystem (type) [2 members] — Minimal filesystem contract used by GeoSpec test discovery
  GeoSpecDiscoveryFileSystem.readdir (method)
  GeoSpecDiscoveryFileSystem.stat (method)
GeoSpecDiscoveryResult (type) [2 members] — Result returned by recursive GeoSpec test discovery
  GeoSpecDiscoveryResult.files (property)
  GeoSpecDiscoveryResult.unmatchedRoots (property)
GeoSpecModuleBundleCache (type) — Worker-local cache for successful GeoSpec bundles
GeoSpecRunFailure (type) [6 members] — Failed GeoSpec run result
  GeoSpecRunFailure.success (property)
  GeoSpecRunFailure.issues (property)
  GeoSpecRunFailure.bundle (property)
  GeoSpecRunFailure.accounting (property)
  GeoSpecRunFailure.lineage (property)
  GeoSpecRunFailure.tests (property) — Tests registered before a module execution failure, including their retained…
GeoSpecRunResult (type) [5 members] — Result returned by {@link import ('./run-geospec-module.js').runGeoSpecModule}
  GeoSpecRunResult.success (property)
  GeoSpecRunResult.bundle (property)
  GeoSpecRunResult.accounting (property)
  GeoSpecRunResult.lineage (property)
  GeoSpecRunResult.tests (property) — Tests registered before a module execution failure, including their retained…
GeoSpecRunSuccess (type) [6 members] — Successful GeoSpec run result
  GeoSpecRunSuccess.success (property)
  GeoSpecRunSuccess.passed (property) — True only when selected tests completed successfully with coherent available…
  GeoSpecRunSuccess.tests (property)
  GeoSpecRunSuccess.bundle (property)
  GeoSpecRunSuccess.accounting (property)
  GeoSpecRunSuccess.lineage (property)
GeoSpecTestCase (type) [7 members] — A collected GeoSpec test case
  GeoSpecTestCase.ordinal (property) — Registration ordinal before filtering, scoped to the source module's collection
  GeoSpecTestCase.suite (property) — Hierarchical suite path
  GeoSpecTestCase.name (property) — Test case name
  GeoSpecTestCase.assertions (property) — Assertions produced by the test callback
  GeoSpecTestCase.status (property) — Final test status
  GeoSpecTestCase.diagnostics (property) — Structured diagnostics emitted by test execution
  GeoSpecTestCase.durationMs (property) — Wall-clock cost of the test body plus its pending assertions,…
GeoSpecTestStatus (type) — Test case status after runner collection
RunGeoSpecModuleOptions (type) [14 members] — Options for executing a GeoSpec ESM test module
  RunGeoSpecModuleOptions.filesystem (property) — Filesystem containing the test module and its project imports
  RunGeoSpecModuleOptions.entryPath (property) — Filesystem-root-relative ESM test entry path
  RunGeoSpecModuleOptions.testNamePattern (property) — JavaScript regular expression matched against full `suite > test` names
  RunGeoSpecModuleOptions.testTimeout (property) — Timeout for async test callbacks, in milliseconds
  RunGeoSpecModuleOptions.matcherWallBackstop (property) — Milliseconds
  RunGeoSpecModuleOptions.forensic (property) — Emit structured forensic events for this run
  RunGeoSpecModuleOptions.nativeAssertions (property) — Host-provided protocol-3 compiled assertion client
  RunGeoSpecModuleOptions.nativeModelLoader (property) — Host-composed identity loader
  RunGeoSpecModuleOptions.modelLoader (property) — Model loader exposed to VM tests through `geospec/model`
  RunGeoSpecModuleOptions.stepLoader (property) — STEP loader exposed to VM tests through `geospec/step`
  RunGeoSpecModuleOptions.builtinModules (property) — Additional in-memory modules made available to the VM
  RunGeoSpecModuleOptions.internalProfile (property) — Internal profile counters used by opt-in benchmark tooling
  RunGeoSpecModuleOptions.bundleCache (property) — Successful bundle cache owned by a serial runner worker
  RunGeoSpecModuleOptions.collectOnly (property) — List-only collection pass (R3 shard splitting)
GeoSpecNativeRunnerAssertions (type) [5 members] — Native assertion options whose engine can also admit and release…
  GeoSpecNativeRunnerAssertions.claimId (property)
  GeoSpecNativeRunnerAssertions.evidenceProfile (property) — Success-evidence profile of every claim and query
  GeoSpecNativeRunnerAssertions.subjectSlot (property)
  GeoSpecNativeRunnerAssertions.workUnitLimit (property)
  GeoSpecNativeRunnerAssertions.engine (property)
GeoSpecNativeRunnerOptions (type) [6 members] — Options for the native serial runner
  GeoSpecNativeRunnerOptions.filesystem (property) — Filesystem containing the project and test modules
  GeoSpecNativeRunnerOptions.builtinModules (property) — Additional in-memory modules made available to the VM
  GeoSpecNativeRunnerOptions.internalProfile (property) — Internal profile counters used by opt-in benchmark tooling
  GeoSpecNativeRunnerOptions.nativeAssertions (property) — Actual protocol-3 engine used by authored assertions
  GeoSpecNativeRunnerOptions.nativeModelLoader (property) — Optional managed loader
  GeoSpecNativeRunnerOptions.model (property) — Defaults used when the runner constructs its own native loader
CreateGeoSpecNativeModelLoaderOptions (type) [7 members] — Defaults and host dependencies for a managed native model loader
  CreateGeoSpecNativeModelLoaderOptions.engine (property)
  CreateGeoSpecNativeModelLoaderOptions.format (property)
  CreateGeoSpecNativeModelLoaderOptions.projectPath (property)
  CreateGeoSpecNativeModelLoaderOptions.readSource (property)
  CreateGeoSpecNativeModelLoaderOptions.runtime (property)
  CreateGeoSpecNativeModelLoaderOptions.sourceAdapters (property)
  CreateGeoSpecNativeModelLoaderOptions.carried (property) — Subject handles carried between the release scopes of loaders that…
GeoSpecNativeLoadModelOptions (type) [8 members] — Native additions accepted by the injected `geospec/runner/native` loader
  GeoSpecNativeLoadModelOptions.format (property) — Geometry format to export
  GeoSpecNativeLoadModelOptions.parameters (property) — Explicit parameters passed to the runtime
  GeoSpecNativeLoadModelOptions.stepStreaming (property) — STEP reader strategy used for STEP exports
  GeoSpecNativeLoadModelOptions.mesh (property) — Whether STEP loading should also produce mesh evidence
  GeoSpecNativeLoadModelOptions.meshLinearTolerance (property) — Linear tolerance used while meshing exact BRep evidence
  GeoSpecNativeLoadModelOptions.meshAngularToleranceDegrees (property) — Angular tolerance in degrees used while meshing exact BRep evidence
  GeoSpecNativeLoadModelOptions.resources (property) — Ordered external resource payloads declared to the native admission request
  GeoSpecNativeLoadModelOptions.ingestOptions (property) — Format-specific native ingest options
GeoSpecNativeModelEngine (type) [5 members] — Native engine operations required for model admission and run-level cleanup
  GeoSpecNativeModelEngine.evaluateClaim (method)
  GeoSpecNativeModelEngine.processRequest (method)
  GeoSpecNativeModelEngine.ingestSubject (method)
  GeoSpecNativeModelEngine.subjectHandle (method)
  GeoSpecNativeModelEngine.releaseSubject (method)
GeoSpecNativeModelLoader (type) — Model loader injected into native VM runs
GeoSpecNativeModelSubject (type) [3 members] — Subject identity returned by native STEP/GLB admission
  GeoSpecNativeModelSubject.contentHash (property)
  GeoSpecNativeModelSubject.subjectHash (property)
  GeoSpecNativeModelSubject.load (property) — Exact successful-load evidence retained by the admitting host, when available
GeoSpecNativeModelResource (type) [2 members] — One named external resource referenced by a direct glTF-family source
  GeoSpecNativeModelResource.name (property)
  GeoSpecNativeModelResource.source (property)
GeoSpecNativeSourceReader (type) — Resolve a non-memory source into ordinary ArrayBuffer-backed bytes
ManagedGeoSpecNativeModelLoader (type) [1 members] — Reusable native model loader whose admitted subjects can be released…
  ManagedGeoSpecNativeModelLoader.releaseAll (method) — Drain registered admissions, including additions while drainage awaits, then release…
GeoSpecNodeRunnerOptions (type) [10 members] — Options accepted by {@link createGeoSpecNodeRunner}
  GeoSpecNodeRunnerOptions.filesystem (property) — Filesystem containing the project and test modules
  GeoSpecNodeRunnerOptions.modelLoader (property) — Model loader exposed to authored tests through `geospec/model`
  GeoSpecNodeRunnerOptions.nativeAssertions (property) — Protocol-3 assertion client used by explicitly native runners
  GeoSpecNodeRunnerOptions.nativeModelLoader (property) — Managed native model loader released after each settled run
  GeoSpecNodeRunnerOptions.stepLoader (property) — STEP loader exposed to authored tests through `geospec/step`
  GeoSpecNodeRunnerOptions.builtinModules (property) — Additional in-memory modules made available to the VM
  GeoSpecNodeRunnerOptions.internalProfile (property) — Internal profile counters used by opt-in benchmark tooling
  GeoSpecNodeRunnerOptions.projectPath (property) — Absolute project root path
  GeoSpecNodeRunnerOptions.cache (property) — Enable the authenticated persistent evidence cache
  GeoSpecNodeRunnerOptions.cacheDirectory (property) — Absolute out-of-tree evidence-cache directory
GeoSpecNodePoolRunnerOptions (type) [6 members] — Options accepted by {@link createGeoSpecNodePoolRunner}
  GeoSpecNodePoolRunnerOptions.projectPath (property) — Absolute project root path
  GeoSpecNodePoolRunnerOptions.workers (property) — Compiled worker count
  GeoSpecNodePoolRunnerOptions.shardTimeout (property) — Per-shard non-verdict watchdog override, milliseconds (R11)
  GeoSpecNodePoolRunnerOptions.cache (property) — Persistent reference-engine evidence caching is unsupported
  GeoSpecNodePoolRunnerOptions.cacheDirectory (property) — Reference-engine cache directories are unsupported and refused when supplied
  GeoSpecNodePoolRunnerOptions.runtimeFactoryModule (property) — Reference-engine runtime factories are unsupported and refused when supplied
GeoSpecWebRunnerOptions (type) [7 members] — Options accepted by {@link createGeoSpecWebRunner}
  GeoSpecWebRunnerOptions.filesystem (property) — Filesystem containing the project and test modules
  GeoSpecWebRunnerOptions.modelLoader (property) — Model loader exposed to authored tests through `geospec/model`
  GeoSpecWebRunnerOptions.nativeAssertions (property) — Protocol-3 assertion client used by explicitly native runners
  GeoSpecWebRunnerOptions.nativeModelLoader (property) — Managed native model loader released after each settled run
  GeoSpecWebRunnerOptions.stepLoader (property) — STEP loader exposed to authored tests through `geospec/step`
  GeoSpecWebRunnerOptions.builtinModules (property) — Additional in-memory modules made available to the VM
  GeoSpecWebRunnerOptions.internalProfile (property) — Internal profile counters used by opt-in benchmark tooling
GeoSpecWebPoolRunnerOptions (type) [3 members] — Options accepted by {@link createGeoSpecWebPoolRunner}
  GeoSpecWebPoolRunnerOptions.createWorker (property) — Spawn one pool worker whose script calls `startGeoSpecPoolWorkerHost` with the…
  GeoSpecWebPoolRunnerOptions.workers (property) — Worker count
  GeoSpecWebPoolRunnerOptions.shardTimeout (property) — Per-shard non-verdict watchdog override, milliseconds (R11)
GeoSpecPoolWorkerHostOptions (type) [10 members] — Options accepted by {@link startGeoSpecPoolWorkerHost}
  GeoSpecPoolWorkerHostOptions.filesystem (property) — Filesystem containing the project and test modules
  GeoSpecPoolWorkerHostOptions.modelLoader (property) — Model loader exposed to authored tests through `geospec/model`
  GeoSpecPoolWorkerHostOptions.nativeAssertions (property) — Native assertion client shared with this worker's model admissions
  GeoSpecPoolWorkerHostOptions.nativeModelLoader (property) — Managed native admissions, released after every shard and collection pass…
  GeoSpecPoolWorkerHostOptions.stepLoader (property) — STEP loader exposed to authored tests through `geospec/step`
  GeoSpecPoolWorkerHostOptions.builtinModules (property) — Additional in-memory modules made available to the VM
  GeoSpecPoolWorkerHostOptions.postMessage (property) — Post a message to the pool host
  GeoSpecPoolWorkerHostOptions.onHostMessage (property) — Subscribe to pool-host messages
  GeoSpecPoolWorkerHostOptions.measureMemoryBytes (property) — Sample this worker's resident memory in bytes (R15 telemetry)
  GeoSpecPoolWorkerHostOptions.onShutdown (property) — Release platform resources on shutdown (after the shared scope disposes)
GeoSpecPoolHostMessage (type) [1 members]
  GeoSpecPoolHostMessage.type (property)
GeoSpecPoolShard (type) [3 members] — One schedulable work unit
  GeoSpecPoolShard.id (property) — Stable shard id, unique within one pool run
  GeoSpecPoolShard.file (property) — GeoSpec file this shard executes
  GeoSpecPoolShard.testNamePattern (property) — Exact-test pattern for split shards (R3
GeoSpecPoolWorkerHandle (type) [4 members]
  GeoSpecPoolWorkerHandle.postMessage (method)
  GeoSpecPoolWorkerHandle.onMessage (method)
  GeoSpecPoolWorkerHandle.onExit (method)
  GeoSpecPoolWorkerHandle.terminate (method) — Hard-stop the worker thread (R11 watchdog primitive)
GeoSpecPoolWorkerMessage (type) [1 members]
  GeoSpecPoolWorkerMessage.type (property)
GeoSpecForensicEvent (type) [5 members] — One structured forensic measurement emitted by a runner
  GeoSpecForensicEvent.type (property)
  GeoSpecForensicEvent.name (property)
  GeoSpecForensicEvent.value (property)
  GeoSpecForensicEvent.unit (property)
  GeoSpecForensicEvent.shardId (property)
GeoSpecRunner (type) [4 members] — Public GeoSpec runner lifecycle surface
  GeoSpecRunner.run (method) — Execute GeoSpec files and return a compact aggregate result
  GeoSpecRunner.on (method) — Subscribe to one lifecycle event type
  GeoSpecRunner.abort (method) — Request cooperative abort before the next file starts
  GeoSpecRunner.close (method) — Close the runner and release owned resources
GeoSpecRunnerEvent (type) [1 members] — Lifecycle event emitted by GeoSpec worker-style runners
  GeoSpecRunnerEvent.type (property)

## Types (3) — `public-api-types-3.md`

GeoSpecRunnerFileResult (type) [5 members] — One GeoSpec test file executed by a worker-style runner
  GeoSpecRunnerFileResult.file (property) — Absolute or project-relative GeoSpec test file path supplied to the…
  GeoSpecRunnerFileResult.result (property) — Low-level module execution result for this file
  GeoSpecRunnerFileResult.durationMs (property) — Wall-clock cost of executing this file, in milliseconds (R1)
  GeoSpecRunnerFileResult.primaryLoadKey (property) — First deterministic model-load cache key observed in this file (R9…
  GeoSpecRunnerFileResult.workerMemoryBytes (property) — Executing worker's isolate-resident memory at file completion, in bytes (R15…
GeoSpecRunnerOptions (type) [7 members] — Shared options for Node and browser GeoSpec runner factories
  GeoSpecRunnerOptions.filesystem (property) — Filesystem containing the project and test modules
  GeoSpecRunnerOptions.modelLoader (property) — Model loader exposed to authored tests through `geospec/model`
  GeoSpecRunnerOptions.nativeAssertions (property) — Protocol-3 assertion client used by explicitly native runners
  GeoSpecRunnerOptions.nativeModelLoader (property) — Managed native model loader released after each settled run
  GeoSpecRunnerOptions.stepLoader (property) — STEP loader exposed to authored tests through `geospec/step`
  GeoSpecRunnerOptions.builtinModules (property) — Additional in-memory modules made available to the VM
  GeoSpecRunnerOptions.internalProfile (property) — Internal profile counters used by opt-in benchmark tooling
GeoSpecRunnerResult (type) [9 members] — Aggregate result returned by GeoSpec worker-style runners
  GeoSpecRunnerResult.success (property) — True when no files or tests failed and at least…
  GeoSpecRunnerResult.passed (property) — Number of non-skipped tests that passed
  GeoSpecRunnerResult.failed (property) — Number of file-level or test-level failures
  GeoSpecRunnerResult.selectedTests (property) — Number of collected tests after filters were applied
  GeoSpecRunnerResult.files (property) — Per-file module execution results
  GeoSpecRunnerResult.issues (property) — Run-level issues such as aborts or empty filter selections
  GeoSpecRunnerResult.durationMs (property) — Wall-clock cost of the whole run, in milliseconds (R1)
  GeoSpecRunnerResult.accounting (property) — Complete requested-file accounting
  GeoSpecRunnerResult.lineageStatus (property) — Coherence of the consumed source graphs, not a geometry verdict
GeoSpecRunnerRunOptions (type) [6 members] — Options accepted by a GeoSpec worker-style runner run
  GeoSpecRunnerRunOptions.files (property) — GeoSpec test files to execute
  GeoSpecRunnerRunOptions.testNamePattern (property) — JavaScript regular expression matched against full `suite > test` names
  GeoSpecRunnerRunOptions.testTimeout (property) — Timeout for each async test callback, in milliseconds
  GeoSpecRunnerRunOptions.matcherWallBackstop (property) — Non-verdict matcher wall backstop
  GeoSpecRunnerRunOptions.forensic (property) — Emit structured forensic measurements for this run
  GeoSpecRunnerRunOptions.bail (property) — Stop after the first failing file (R1)
SelectorPathSegment (type) [3 members] — One parsed segment of a selector path (`name`, `name[3]`, or…
  SelectorPathSegment.name (property) — Bare segment name without index
  SelectorPathSegment.index (property) — 1-based member index when the segment is `name[n]`
  SelectorPathSegment.wildcard (property) — True when the segment is the selector-side wildcard `name[*]`
SelectorTolerances (type) [2 members] — Tolerance vocabulary consumed by selector predicates
  SelectorTolerances.linearMm (property) — Linear/contact tolerance in millimetres (offset bands, `near`, radii)
  SelectorTolerances.angularToleranceDegrees (property) — Angular tolerance in degrees for normal/axis/parallelism predicates
AxisQuery (type) [12 members] — Axis query predicates over cylindrical/conical face facts
  AxisQuery.axis (property) — Axis direction parallelism
  AxisQuery.radius (property)
  AxisQuery.near (property)
  AxisQuery.containsPoint (property)
  AxisQuery.nearestTo (property)
  AxisQuery.within (property)
  AxisQuery.orderBy (property)
  AxisQuery.along (property)
  AxisQuery.pick (property)
  AxisQuery.allOf (property)
  AxisQuery.anyOf (property)
  AxisQuery.not (property)
AxisSelector (type) [4 members] — Axis selector resolved from cylindrical/conical face facts
  AxisSelector.kind (property)
  AxisSelector.of (property)
  AxisSelector.query (property)
  AxisSelector.expect (property)
BodyQuery (type) [10 members] — Body query predicates over available source facts
  BodyQuery.area (property)
  BodyQuery.near (property)
  BodyQuery.nearestTo (property)
  BodyQuery.within (property)
  BodyQuery.orderBy (property)
  BodyQuery.along (property)
  BodyQuery.pick (property)
  BodyQuery.allOf (property)
  BodyQuery.anyOf (property)
  BodyQuery.not (property)
BodySelector (type) [4 members] — Body selector over source-backed solid evidence
  BodySelector.kind (property)
  BodySelector.of (property) — STEP occurrence scope, or the exact retained mesh primitive label…
  BodySelector.query (property)
  BodySelector.expect (property)
CandidateEntity (type) [8 members] — Ranked candidate reported on ambiguous/unmatched resolutions, with the disambiguating facts…
  CandidateEntity.id (property)
  CandidateEntity.entityType (property)
  CandidateEntity.occurrencePath (property)
  CandidateEntity.facts (property)
  CandidateEntity.topologyRef (property) — Snapshot topology ref (`'#o1.2.f7'`) for diagnostics and pinning
  CandidateEntity.rank (property) — 1-based deterministic rank
  CandidateEntity.excludedBy (property) — Name of the predicate that excluded this near-miss candidate
  CandidateEntity.distance (property) — Probe distance in millimetres, when a probe ranked this candidate
Cardinality (type) — Cardinality expectation for a selector resolution (master catalog G7)
DatumSelector (type) [4 members] — Datum selector
  DatumSelector.kind (property)
  DatumSelector.name (property) — Full datum name, or part-relative name when `of` scopes an…
  DatumSelector.of (property)
  DatumSelector.expect (property)
DirectionPredicate (type) [2 members] — Direction predicate with optional angular tolerance in degrees
  DirectionPredicate.direction (property)
  DirectionPredicate.angularToleranceDegrees (property)
FaceQuery (type) [17 members] — Face query predicates (master catalog G1/G2)
  FaceQuery.surfaceType (property)
  FaceQuery.normal (property) — Face normal parallelism (planar faces)
  FaceQuery.axis (property) — Rotation-axis parallelism (cylindrical/conical faces)
  FaceQuery.radius (property)
  FaceQuery.area (property)
  FaceQuery.offset (property) — Plane offset band
  FaceQuery.near (property) — Centroid coordinate bands, per-axis
  FaceQuery.containsPoint (property) — Probe
  FaceQuery.nearestTo (property) — Probe
  FaceQuery.hitByRay (property) — Probe
  FaceQuery.within (property) — Restrict candidates to entities resolved by another selector
  FaceQuery.orderBy (property) — Deterministic ordering
  FaceQuery.along (property) — Projection direction for `orderBy
  FaceQuery.pick (property) — Deterministic pick after ordering
  FaceQuery.allOf (property)
  FaceQuery.anyOf (property)
  FaceQuery.not (property)
FaceSelector (type) [4 members] — Face selector resolved via query/probe predicates
  FaceSelector.kind (property)
  FaceSelector.of (property)
  FaceSelector.query (property)
  FaceSelector.expect (property)
GeometryFacts (type) [16 members] — Typed geometric facts carried by a resolved entity — full…
  GeometryFacts.surfaceType (property)
  GeometryFacts.normal (property)
  GeometryFacts.offset (property)
  GeometryFacts.axisOrigin (property)
  GeometryFacts.axisDirection (property)
  GeometryFacts.radius (property)
  GeometryFacts.area (property)
  GeometryFacts.centroid (property)
  GeometryFacts.bounds (property)
  GeometryFacts.origin (property) — Datum frame origin (subject frame)
  GeometryFacts.xAxis (property) — Datum frame x axis (subject frame)
  GeometryFacts.zAxis (property) — Datum frame z axis (subject frame)
  GeometryFacts.transform (property) — Occurrence placement transform (4x4 row-major, part-local → subject)
  GeometryFacts.productName (property)
  GeometryFacts.faceIndex (property)
  GeometryFacts.memberCount (property) — Group member count
GeometrySelection (type) [8 members] — Structured result of resolving one selector against a selector index
  GeometrySelection.selector (property)
  GeometrySelection.status (property)
  GeometrySelection.entities (property) — Set-valued result (E4)
  GeometrySelection.expected (property)
  GeometrySelection.source (property)
  GeometrySelection.stability (property)
  GeometrySelection.candidates (property) — Ranked candidates with facts — ambiguous/unmatched repair data
  GeometrySelection.diagnostics (property)
GeometrySelectionSource (type) — Evidence source a selection resolved against
GeometrySelectionStability (type) — Durability-ladder stability class of a resolution
GeometrySelectionStatus (type) — Resolution status
GeometrySelector (type) — The V1 geometry selector union (D4 scope)
GroupSelector (type) [4 members] — Group selector
  GroupSelector.kind (property)
  GroupSelector.name (property) — Full group prefix, or part-relative prefix when `of` scopes an…
  GroupSelector.of (property)
  GroupSelector.expect (property)
InterfaceSelector (type) [4 members] — Interface selector
  InterfaceSelector.kind (property)
  InterfaceSelector.name (property) — Full interface name, or part-relative name when `of` scopes an…
  InterfaceSelector.of (property)
  InterfaceSelector.expect (property)
NumericRange (type) — Inclusive numeric band
OccurrenceSelector (type) [4 members] — Occurrence selector
  OccurrenceSelector.kind (property)
  OccurrenceSelector.name (property) — Product or instance name to match
  OccurrenceSelector.path (property) — Occurrence path (dot-joined instance segments, root omitted) to match
  OccurrenceSelector.expect (property)
PlaneQuery (type) [13 members] — Plane query predicates over planar face facts
  PlaneQuery.normal (property)
  PlaneQuery.offset (property)
  PlaneQuery.area (property)
  PlaneQuery.near (property)
  PlaneQuery.containsPoint (property)
  PlaneQuery.nearestTo (property)
  PlaneQuery.within (property)
  PlaneQuery.orderBy (property)
  PlaneQuery.along (property)
  PlaneQuery.pick (property)
  PlaneQuery.allOf (property)
  PlaneQuery.anyOf (property)
  PlaneQuery.not (property)
PlaneSelector (type) [4 members] — Plane selector resolved from planar face facts
  PlaneSelector.kind (property)
  PlaneSelector.of (property)
  PlaneSelector.query (property)
  PlaneSelector.expect (property)
RayPredicate (type) [2 members] — Ray probe predicate (world-space origin and direction, millimetres)
  RayPredicate.origin (property)
  RayPredicate.direction (property)
ResolvedEntity (type) [5 members] — One resolved geometry entity (index-local, snapshot-scoped identity)
  ResolvedEntity.id (property)
  ResolvedEntity.entityType (property)
  ResolvedEntity.occurrencePath (property)
  ResolvedEntity.facts (property)
  ResolvedEntity.topologyRef (property) — Snapshot topology ref (`'#o1.2.f7'`) for diagnostics and pinning
ResolvedEntityType (type) — Entity kind a resolved entity denotes
SelectorFaceFacts (type) [10 members] — Per-face analytic facts in the subject frame, matching the verification…
  SelectorFaceFacts.faceIndex (property)
  SelectorFaceFacts.surfaceType (property)
  SelectorFaceFacts.normal (property)
  SelectorFaceFacts.offset (property)
  SelectorFaceFacts.axisOrigin (property)
  SelectorFaceFacts.axisDirection (property)
  SelectorFaceFacts.radius (property)
  SelectorFaceFacts.area (property)
  SelectorFaceFacts.centroid (property)
  SelectorFaceFacts.bounds (property)
SelectorSurfaceType (type) — Surface classification carried by selector face facts, matching the verification…
SerializedRegExp (type) [2 members] — JSON-serialized RegExp representation used by selector serialization
  SerializedRegExp.pattern (property)
  SerializedRegExp.flags (property)
Vec3Record (type) [3 members] — Cartesian coordinate record used by coordinate-band (`near`) predicates
  Vec3Record.x (property)
  Vec3Record.y (property)
  Vec3Record.z (property)
BuildSelectorIndexOptions (type) [2 members] — Inputs for {@link buildSelectorIndex}
  BuildSelectorIndexOptions.xde (property)
  BuildSelectorIndexOptions.faceFactsByOccurrence (property)
SelectorBodyRow (type) [5 members] — One per-occurrence solid aggregate row backing body selectors
  SelectorBodyRow.id (property)
  SelectorBodyRow.occurrencePath (property)
  SelectorBodyRow.area (property) — Total face area (mm²)
  SelectorBodyRow.centroid (property) — Area-weighted centroid of the occurrence's faces
  SelectorBodyRow.bounds (property)
SelectorDatumRow (type) [7 members] — One materialized datum row (subject frame)
  SelectorDatumRow.id (property)
  SelectorDatumRow.fullName (property)
  SelectorDatumRow.occurrencePath (property)
  SelectorDatumRow.name (property)
  SelectorDatumRow.origin (property)
  SelectorDatumRow.xAxis (property)
  SelectorDatumRow.zAxis (property)
SelectorFaceFactsTable (type) — Per-occurrence face facts keyed by occurrence path, matching the verification…
SelectorFaceRow (type) [5 members] — One BRep face row with subject-frame analytic facts
  SelectorFaceRow.id (property)
  SelectorFaceRow.occurrencePath (property)
  SelectorFaceRow.faceIndex (property)
  SelectorFaceRow.facts (property)
  SelectorFaceRow.topologyRef (property) — Snapshot topology ref, e.g
SelectorGroupRow (type) [6 members] — One reconstructed group row (shared `prefix[i]` family per occurrence)
  SelectorGroupRow.id (property)
  SelectorGroupRow.fullName (property)
  SelectorGroupRow.occurrencePath (property)
  SelectorGroupRow.name (property) — Part-relative group prefix
  SelectorGroupRow.members (property) — Members ordered by 1-based index
  SelectorGroupRow.memberIndices (property) — The members' 1-based indices, ascending
SelectorIndex (type) [7 members] — The per-subject selector index consumed by the L3 resolution engine
  SelectorIndex.occurrences (property)
  SelectorIndex.faces (property)
  SelectorIndex.bodies (property)
  SelectorIndex.interfaces (property)
  SelectorIndex.datums (property)
  SelectorIndex.groups (property)
  SelectorIndex.diagnostics (property)
SelectorInterfaceRow (type) [8 members] — One authored interface record joining a subshape name to its…
  SelectorInterfaceRow.id (property)
  SelectorInterfaceRow.fullName (property) — Composed full name
  SelectorInterfaceRow.occurrencePath (property)
  SelectorInterfaceRow.name (property) — Part-relative authored name
  SelectorInterfaceRow.faceIndex (property)
  SelectorInterfaceRow.entityKinds (property) — Entity kinds derived from the carrier face's geometry (profile rule)
  SelectorInterfaceRow.dangling (property) — True when the named `faceIndex` no longer exists in the…
  SelectorInterfaceRow.face (property)
SelectorOccurrenceRow (type) [7 members] — One placed occurrence row in the selector index
  SelectorOccurrenceRow.path (property)
  SelectorOccurrenceRow.productName (property)
  SelectorOccurrenceRow.instanceName (property)
  SelectorOccurrenceRow.transform (property) — 4x4 row-major placement transform (part-local frame → subject frame)
  SelectorOccurrenceRow.shapeIndex (property)
  SelectorOccurrenceRow.ordinalPath (property) — 1-based ordinal path in the occurrence tree (snapshot refs `#o1.2`)
  SelectorOccurrenceRow.bounds (property) — Union of the occurrence's face bounds (subject frame), when faces…
SelectorDiagnosticOptions (type) [6 members] — Payload accepted by the selector diagnostic builders
  SelectorDiagnosticOptions.selector (property)
  SelectorDiagnosticOptions.stability (property)
  SelectorDiagnosticOptions.message (property)
  SelectorDiagnosticOptions.suggestion (property)
  SelectorDiagnosticOptions.candidates (property) — Ranked candidates or near-misses with disambiguating facts
  SelectorDiagnosticOptions.details (property) — Extra structured payload merged into `details`
GeoSpecStepLoader (type) — A configured STEP loader
BrepFacetName (type) — The five lazily materialized BRep evidence facets
CreateStepLoaderOptions (type) [11 members] — Defaults accepted by {@link import ('./load-step.js').createStepLoader}
  CreateStepLoaderOptions.mesh (property)
  CreateStepLoaderOptions.path (property)
  CreateStepLoaderOptions.name (property)
  CreateStepLoaderOptions.unit (property)
  CreateStepLoaderOptions.parameters (property)
  CreateStepLoaderOptions.streaming (property)
  CreateStepLoaderOptions.meshLinearTolerance (property)
  CreateStepLoaderOptions.meshAngularToleranceDegrees (property)
  CreateStepLoaderOptions.maxBytes (property)
  CreateStepLoaderOptions.signal (property)
  CreateStepLoaderOptions.onProgress (property)
LoadStepOptions (type) [12 members] — Options for loading STEP/XDE/BRep evidence
  LoadStepOptions.source (property)
  LoadStepOptions.unit (property)
  LoadStepOptions.streaming (property)
  LoadStepOptions.mesh (property)
  LoadStepOptions.meshLinearTolerance (property)
  LoadStepOptions.meshAngularToleranceDegrees (property)
  LoadStepOptions.maxBytes (property)
  LoadStepOptions.signal (property)
  LoadStepOptions.onProgress (property)
  LoadStepOptions.parameters (property)
  LoadStepOptions.path (property)
  LoadStepOptions.name (property)
StepLoadProgressEvent (type) [2 members] — Progress event emitted while GeoSpec normalizes a STEP source
  StepLoadProgressEvent.phase (property)
  StepLoadProgressEvent.bytesRead (property)
StepSource (type) — STEP source forms accepted by {@link import ('./load-step.js').loadStep}
StepStreamingMode (type) — STEP reader strategy used by GeoSpec
XdeDatumPlacement (type) [5 members] — One native AP242 datum placement row (a coordinate *frame* from…
  XdeDatumPlacement.occurrencePath (property)
  XdeDatumPlacement.name (property)
  XdeDatumPlacement.origin (property)
  XdeDatumPlacement.xAxis (property)
  XdeDatumPlacement.zAxis (property)
XdeDatumSystem (type) [3 members] — One GD&T datum reference frame (`DATUM_SYSTEM`) with its precedence compartments,…
  XdeDatumSystem.occurrencePath (property)
  XdeDatumSystem.name (property)
  XdeDatumSystem.references (property) — Compartments in precedence order
XdeOccurrence (type) [6 members] — One placed occurrence recovered from an AP242 STEP structure read
  XdeOccurrence.path (property)
  XdeOccurrence.productName (property)
  XdeOccurrence.instanceName (property)
  XdeOccurrence.transform (property) — 4x4 row-major placement transform (part-local frame -> subject frame)
  XdeOccurrence.shapeIndex (property) — Index into the native result's retained shape table (proof calls…
  XdeOccurrence.bounds (property) — Analytic axis-aligned bounds of the placed occurrence in subject space
XdeReadResult (type) [7 members] — Structured AP242 read result produced by the GeoSpec verification kernel's…
  XdeReadResult.occurrences (property)
  XdeReadResult.subshapeNames (property)
  XdeReadResult.datumPlacements (property)
  XdeReadResult.semanticDatums (property) — Semantic GD&T datums (the `DATUM` family) — empty for graphical-only…
  XdeReadResult.datumSystems (property) — GD&T datum reference frames (`DATUM_SYSTEM`)
  XdeReadResult.supplementalPlanes (property) — Supplemental-geometry `PLANE` items
  XdeReadResult.freeShapeCount (property) — Free (non-assembly) top-level shapes — the flat-export degenerate case
XdeSemanticDatum (type) [4 members] — One semantic GD&T datum (`DATUM` + `DATUM_FEATURE` family) recovered from…
  XdeSemanticDatum.occurrencePath (property)
  XdeSemanticDatum.label (property) — The GD&T datum identification letter(s)
  XdeSemanticDatum.featureName (property) — DATUM_FEATURE name when the file authored one
  XdeSemanticDatum.faceIndexes (property) — Attached faces in the owning product's deterministic face traversal order
XdeSubshapeName (type) [4 members] — One part-relative authored subshape name, expanded per occurrence of the…
  XdeSubshapeName.occurrencePath (property)
  XdeSubshapeName.name (property)
  XdeSubshapeName.shapeType (property)
  XdeSubshapeName.faceIndex (property) — Index within the owning product shape's deterministic face traversal order
XdeSupplementalPlane (type) [4 members] — One supplemental-geometry `PLANE` item (e.g
  XdeSupplementalPlane.occurrencePath (property)
  XdeSupplementalPlane.name (property)
  XdeSupplementalPlane.origin (property)
  XdeSupplementalPlane.normal (property)
GeoSpecAssertionClient (type) [2 members] — Runner-independent native assertion client
  GeoSpecAssertionClient.expectGeo (method)
  GeoSpecAssertionClient.query (method)
GeoSpecAssertionClientOptions (type) [5 members] — Flat construction options for a runner-independent native assertion client
  GeoSpecAssertionClientOptions.claimId (property)
  GeoSpecAssertionClientOptions.engine (property)
  GeoSpecAssertionClientOptions.evidenceProfile (property) — Success-evidence profile of every claim and query
  GeoSpecAssertionClientOptions.subjectSlot (property)
  GeoSpecAssertionClientOptions.workUnitLimit (property)
GeoSpecAssertionMatchers (type) [1 members] — Standalone native matcher chain, including core-owned negation
  GeoSpecAssertionMatchers.not (property)
GeoSpecAuthoringInvocation (type) [6 members] — One authored call shared by the collector and native assertion…
  GeoSpecAuthoringInvocation.arguments (property)
  GeoSpecAuthoringInvocation.expected (property)
  GeoSpecAuthoringInvocation.kind (property)
  GeoSpecAuthoringInvocation.matcher (property)
  GeoSpecAuthoringInvocation.polarity (property)
  GeoSpecAuthoringInvocation.subject (property)
GeoSpecMatcherMethods (type) — Matcher methods derived mechanically from the existing GeoSpec registry
GeoSpecQueryOptions (type) [4 members] — One positive-only ancillary query
  GeoSpecQueryOptions.capability (property)
  GeoSpecQueryOptions.claimId (property)
  GeoSpecQueryOptions.payload (property)
  GeoSpecQueryOptions.subject (property)
MinimumDistanceFact (type) [9 members] — Complete native minimum and ordered finite witnesses in canonical millimetres/Z-up
  MinimumDistanceFact.source (property)
  MinimumDistanceFact.assurance (property)
  MinimumDistanceFact.unit (property)
  MinimumDistanceFact.coordinateSystem (property)
  MinimumDistanceFact.subjectHash (property)
  MinimumDistanceFact.algorithmProfile (property)
  MinimumDistanceFact.occurrences (property)
  MinimumDistanceFact.distance (property)
  MinimumDistanceFact.points (property)
MinimumDistanceQuery (type) [3 members] — Complete AP242 minimum over two subject-bound occurrence paths
  MinimumDistanceQuery.capability (property)
  MinimumDistanceQuery.subject (property)
  MinimumDistanceQuery.payload (property)
MinimumDistanceResult (type) [1 members] — Geometry refusal and infrastructure interruption never masquerade as facts
  MinimumDistanceResult.status (property)
GeoSpecNativeQueryOptions (type) [8 members] — Flat native query transport options
  GeoSpecNativeQueryOptions.subject (property)
  GeoSpecNativeQueryOptions.engine (property)
  GeoSpecNativeQueryOptions.claimId (property)
  GeoSpecNativeQueryOptions.evidenceProfile (property)
  GeoSpecNativeQueryOptions.subjectSlot (property)
  GeoSpecNativeQueryOptions.workUnitLimit (property)
  GeoSpecNativeQueryOptions.capability (property)
  GeoSpecNativeQueryOptions.payload (property)
GeoSpecQueryCapability (type) — Existing positive-only ancillary operations owned by the native core
GeoSpecPmiField (type) [3 members] — Explicit support state for one source-attributed inventory field
  GeoSpecPmiField.status (property)
  GeoSpecPmiField.value (property)
  GeoSpecPmiField.reason (property)
GeoSpecPmiRawEntity (type) [3 members] — Original Part21 entity ID and exact source argument tokens
  GeoSpecPmiRawEntity.sourceId (property)
  GeoSpecPmiRawEntity.kind (property)
  GeoSpecPmiRawEntity.arguments (property)
GeoSpecPmiNumber (type) [6 members] — Source-authored scalar and Rust-normalized reduced rational millimetres
  GeoSpecPmiNumber.sourceId (property)
  GeoSpecPmiNumber.authoredText (property)
  GeoSpecPmiNumber.unitId (property)
  GeoSpecPmiNumber.unitRecords (property)
  GeoSpecPmiNumber.millimetres (property)
  GeoSpecPmiNumber.name (property)
GeoSpecPmiFaceAssociation (type) [4 members] — A uniquely forward-transferred face
  GeoSpecPmiFaceAssociation.sourceFaceId (property)
  GeoSpecPmiFaceAssociation.occurrenceRoute (property)
  GeoSpecPmiFaceAssociation.occurrence (property)
  GeoSpecPmiFaceAssociation.publicFaceOrdinal (property)
GeoSpecPmiShapeReference (type) [5 members] — One ordered role reference, including incomplete source/transfer evidence
  GeoSpecPmiShapeReference.sourceAspectId (property)
  GeoSpecPmiShapeReference.sourceUsageIds (property)
  GeoSpecPmiShapeReference.sourceItemIds (property)
  GeoSpecPmiShapeReference.requestedRoute (property)
  GeoSpecPmiShapeReference.associations (property)
GeoSpecPmiLimits (type) [3 members] — Normalized authored limits
  GeoSpecPmiLimits.lowerMillimetres (property)
  GeoSpecPmiLimits.upperMillimetres (property)
  GeoSpecPmiLimits.basis (property)
GeoSpecPmiRecord (type) [11 members] — Source record preserving semantic/presentation separation and ordered roles
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
GeoSpecPmiInventory (type) [5 members] — Positive-only inventory value inside the ordinary canonical query report
  GeoSpecPmiInventory.contract (property)
  GeoSpecPmiInventory.status (property)
  GeoSpecPmiInventory.fileSchema (property)
  GeoSpecPmiInventory.editionValidation (property)
  GeoSpecPmiInventory.records (property)
GeoSpecPmiQueryPayload (type) [2 members] — Strict inventory output limits
  GeoSpecPmiQueryPayload.maxRecords (property)
  GeoSpecPmiQueryPayload.maxOutputBytes (property)
GeoSpecPmiQueryValue (type) [3 members] — Complete inventory value
  GeoSpecPmiQueryValue.inventory (property)
  GeoSpecPmiQueryValue.subjectHash (property)
  GeoSpecPmiQueryValue.provenance (property)
GeoSpecCanonicalClaimReport (type) [10 members] — Full native assertion result with the exact core-owned bytes retained
  GeoSpecCanonicalClaimReport.canonicalClaim (property)
  GeoSpecCanonicalClaimReport.canonicalPlan (property)
  GeoSpecCanonicalClaimReport.canonicalResult (property)
  GeoSpecCanonicalClaimReport.claim (property)
  GeoSpecCanonicalClaimReport.claimId (property)
  GeoSpecCanonicalClaimReport.diagnostics (property)
  GeoSpecCanonicalClaimReport.evidence (property)
  GeoSpecCanonicalClaimReport.polarity (property)
  GeoSpecCanonicalClaimReport.result (property)
  GeoSpecCanonicalClaimReport.status (property)
GeoSpecNativeClaimEvaluation (type) [3 members] — Exact core bytes of one claim evaluated in one engine…
  GeoSpecNativeClaimEvaluation.canonicalClaim (property)
  GeoSpecNativeClaimEvaluation.canonicalPlan (property)
  GeoSpecNativeClaimEvaluation.canonicalResult (property)
GeoSpecNativeEngine (type) [2 members] — Byte-only engine surface consumed by the runner-independent assertion client
  GeoSpecNativeEngine.evaluateClaim (method)
  GeoSpecNativeEngine.processRequest (method)
GeoSpecNativeEvidenceProfile (type) — Success-evidence profile a product selects for its plans (PERF-OUTPUT-01)
GeoSpecNativeSubject (type) [2 members] — Content-addressed subject accepted by a protocol-3 assertion plan
  GeoSpecNativeSubject.contentHash (property)
  GeoSpecNativeSubject.subjectHash (property)
GeoSpecFixedMatcherDescriptor (type) [3 members] — A canonical fixed-contract matcher
  GeoSpecFixedMatcherDescriptor.contract (property)
  GeoSpecFixedMatcherDescriptor.expected (property)
  GeoSpecFixedMatcherDescriptor.mode (property)
GeoSpecVitestAdapter (type) [2 members] — Installed Vitest matcher map and lifecycle settlement hook
  GeoSpecVitestAdapter.matchers (property)
  GeoSpecVitestAdapter.flush (method)
ExportTauProjectArtifactOptions (type) [3 members] — Input for exporting one validated Tau project descriptor
  ExportTauProjectArtifactOptions.descriptor (property)
  ExportTauProjectArtifactOptions.createRuntime (property) — Called twice so source discovery and export use separate runtime…
  ExportTauProjectArtifactOptions.signal (property)
GeoSpecTauProjectArtifact (type) [7 members] — Finalized geometry bytes and the exact source/export metadata that produced…
  GeoSpecTauProjectArtifact.format (property)
  GeoSpecTauProjectArtifact.name (property)
  GeoSpecTauProjectArtifact.mimeType (property)
  GeoSpecTauProjectArtifact.bytes (property)
  GeoSpecTauProjectArtifact.frame (property)
  GeoSpecTauProjectArtifact.source (property)
  GeoSpecTauProjectArtifact.export (property)
GeoSpecTauProjectRuntime (type) [3 members] — Runtime surface required to snapshot and export one Tau project
  GeoSpecTauProjectRuntime.open (property)
  GeoSpecTauProjectRuntime.on (method)
  GeoSpecTauProjectRuntime.bestRouteFor (method)

## Types (4) — `public-api-types-4.md`

GeoSpecConfig (type) [10 members] — Trusted project configuration using existing discovery and runner options
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
GeoSpecTauProjectDescriptor (type) [5 members] — Imported Tau project data for later host resolution
  GeoSpecTauProjectDescriptor.kind (property)
  GeoSpecTauProjectDescriptor.manifestPath (property) — Normalized project-relative POSIX path identifying the imported manifest
  GeoSpecTauProjectDescriptor.manifest (property)
  GeoSpecTauProjectDescriptor.format (property)
  GeoSpecTauProjectDescriptor.parameters (property)
LoadedGeoSpecConfig (type) [2 members] — Resolved file identity and validated configuration data
  LoadedGeoSpecConfig.configPath (property)
  LoadedGeoSpecConfig.options (property)
LoadGeoSpecConfigOptions (type) [3 members] — Options for one trusted Node configuration load
  LoadGeoSpecConfigOptions.projectPath (property)
  LoadGeoSpecConfigOptions.configPath (property) — Explicit file, resolved relative to the project unless absolute
  LoadGeoSpecConfigOptions.overrides (property) — Own defined fields override configuration without deep merging

## Classes — `public-api-classes.md`

GeoSpecModelLoadError (class) [2 members] — Error thrown by {@link import ('./load-model.js').loadModel} when geometry cannot be…
  GeoSpecModelLoadError.diagnostics (property) — Structured diagnostics explaining why model loading failed
  GeoSpecModelLoadError.constructor (constructor)
GeoSpecAssertionError (class) [2 members] — Assertion error thrown by GeoSpec matchers when an expectation does…
  GeoSpecAssertionError.diagnostics (property)
  GeoSpecAssertionError.constructor (constructor)
