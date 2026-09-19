# geospec API index

geospec 0.1.0-beta.1 · 185 symbols · extracted by TypeScript 5.9.3.

Every symbol appears here exactly once. The heading above each block names the file with its signature.

## Functions — `api-functions.md`

createGeoSpec (function) — Create a GeoSpec instance
describe (function) — GeoSpec suite helper used inside VM-executed test modules
expectGeo (function) — Start a geometry assertion chain
it (function) — GeoSpec test helper used inside VM-executed test modules
test (function) — Alias for {@link it}
analyzeBrep (function) — Read BRep evidence from a loaded GeoSpec subject
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
createGeoSpecNodeRunner (function) — Create a GeoSpec runner for Node.js and CLI environments
createGeoSpecNodePoolRunner (function) — Create a worker-pool GeoSpec runner for Node.js
createNodeVmFileSystem (function) — Create a Node `VmFileSystem` rooted at `root`
createGeoSpecWebRunner (function) — Create a GeoSpec runner for browser environments
createGeoSpecWebPoolRunner (function) — Create a worker-pool GeoSpec runner for browser environments
createNoMatchingGeoSpecTestsIssue (function) — Create a run-level issue when filters select no tests
startGeoSpecPoolWorkerHost (function) — Start serving shards
createStepLoader (function) — Create a {@link loadStep} function with shared defaults
loadStep (function) — Load STEP/XDE/BRep evidence into a GeoSpec geometry subject
parseXdeReadResultJson (function) — Parse the native reader's JSON payload into a structured XDE…

## Constants — `api-constants.md`

geoSpecMatcherNames (constant) — Every matcher name exposed by {@link expectGeo}, derived from the…
defaultGeoSpecIgnoredDirectories (constant) — Directories skipped by recursive GeoSpec discovery unless callers provide their…
defaultGeoSpecInclude (constant) — Default file globs used by GeoSpec test discovery

## Types — `api-types.md`

GeoSpec (type) — Stateful GeoSpec API created by {@link createGeoSpec}
GeoSpecUnit (type) — Geometry units accepted at GeoSpec evidence-loading boundaries
GeoSpecAssertion (type) — Geometry assertion collected from a GeoSpec test module
GeoSpecAssemblyOccurrenceExpectation (type) — Assembly occurrence rule accepted by `expectGeo(...).toHaveAssemblyOccurrences(...)`
GeoSpecAssemblyOccurrencesExpectation (type) — Assembly occurrence expectation accepted by `expectGeo(...).toHaveAssemblyOccurrences(...)`
GeoSpecAxisExpectation (type) — Axis-keyed numeric expectation used by high-level geometry matchers
GeoSpecBoundingBoxExpectation (type) — Bounding-box expectation accepted by `expectGeo(...).toHaveBoundingBox(...)`
GeoSpecCenterOfMassExpectation (type) — Center-of-mass expectation accepted by `expectGeo(...).toHaveCenterOfMass(...)`
GeoSpecChamferFeatureExpectation (type) — Chamfer-feature expectation accepted by `expectGeo(...).toHaveChamferFeature(...)`
GeoSpecCircularHoleExpectation (type) — Circular-hole expectation accepted by `expectGeo(...).toHaveCircularHole(...)`
GeoSpecCylindricalFaceExpectation (type) — Cylindrical-face expectation accepted by `expectGeo(...).toHaveCylindricalFace(...)`
GeoSpecComponentInterferenceAllowance (type) — Intentional component interference allowance accepted by `expectGeo(...).toHaveNoComponentInterference(...)`
GeoSpecComponentInterferenceExpectation (type) — Component-interference expectation accepted by `expectGeo(...).toHaveNoComponentInterference(...)`
GeoSpecComponentInterferencePairExpectation (type) — A pair-specific component-interference check accepted by `expectGeo(...).toHaveNoComponentInterference(...)`
GeoSpecConnectedComponentsExpectation (type) — Connected-components expectation accepted by `expectGeo(...).toHaveConnectedComponents(...)`
GeoSpecGeometrySelector (type) — Geometry selector used by inspection and spatial relationship matchers
GeoSpecMatcher (type) — Assertion chain returned by `expectGeo(subject)`
GeoSpecMassExpectation (type) — Mass expectation accepted by `expectGeo(...).toHaveMass(...)`
GeoSpecMeshIntegrityExpectation (type) — Mesh integrity expectation accepted by `expectGeo(...).toHaveMeshIntegrity(...)`
GeoSpecNoDiagnosticsExpectation (type) — Diagnostic severities rejected by `expectGeo(...).toHaveNoDiagnostics(...)`
GeoSpecMinimumWallThicknessExpectation (type) — Minimum-wall-thickness expectation accepted by `expectGeo(...).toHaveMinimumWallThickness(...)`
GeoSpecCircularHolePatternExpectation (type) — Circular-hole-pattern expectation accepted by `expectGeo(...).toHaveCircularHolePattern(...)`
GeoSpecFilletFeatureExpectation (type) — Fillet-feature expectation accepted by `expectGeo(...).toHaveFilletFeature(...)`
GeoSpecNumericExpectation (type) — Shared scalar expectation used by geometry measurements
GeoSpecPlanarFaceExpectation (type) — Planar-face expectation accepted by `expectGeo(...).toHavePlanarFace(...)`
GeoSpecPointExpectation (type) — Point expectation accepted by center and feature matchers
GeoSpecProductStructureExpectation (type) — Product-structure expectation accepted by `expectGeo(...).toHaveProductStructure(...)`
GeoSpecSpatialRelationshipExpectation (type) — One spatial relationship accepted by `expectGeo(...).toHaveSpatialRelationships(...)`
GeoSpecSpatialRelationshipsExpectation (type) — Spatial relationship expectation accepted by `expectGeo(...).toHaveSpatialRelationships(...)`
GeoSpecStepUnitsExpectation (type) — STEP unit expectation accepted by `expectGeo(...).toHaveStepUnits(...)`
GeoSpecSurfaceAreaExpectation (type) — Surface-area expectation accepted by `expectGeo(...).toHaveSurfaceArea(...)`
GeoSpecTopologyCountsExpectation (type) — Topology-count expectation accepted by `expectGeo(...).toHaveTopologyCounts(...)`
GeoSpecValidBrepExpectation (type) — Exact BRep validity expectation accepted by `expectGeo(...).toBeValidBrep(...)`
GeoSpecVoidContinuityExpectation (type) — Void-continuity expectation accepted by `expectGeo(...).toHaveVoidContinuity(...)`
GeoSpecVoidWaypoint (type) — One void-continuity waypoint
GeoSpecVolumeExpectation (type) — Volume expectation accepted by `expectGeo(...).toHaveVolume(...)`
BrepEvidence (type) — Basic exact or topology-derived BRep evidence consumed by early feature…
GeometryFileFormat (type) — Geometry file formats understood by GeoSpec provenance
GeometryCapability (type) — Capability exposed by a loaded subject
GeometryDiagnostic (type) — Diagnostic emitted by GeoSpec loaders, analyzers, and matchers
GeometryProvenance (type) — Provenance recorded by GeoSpec loaders
GeometrySource (type) — Source metadata for a loaded geometry subject
GeometrySubject (type) — Canonical P0 object under test for GeoSpec
GeometrySubjectMeshEvidence (type) — Wire-safe mesh summary carried by an opaque geometry subject
MeshEvidence (type) — Mesh evidence loaded from geometry bytes or buffers
MeshFileFormat (type) — Geometry file formats supported by the P0 mesh loader
MeshQualityStats (type) — Triangle quality and scalar mesh metrics used by P0 GeoSpec…
MeshTriangle (type) — One triangle from mesh evidence, in geometry document coordinates
StepEvidence (type) — STEP/XDE evidence extracted while loading a STEP subject
Vec3 (type) — Numeric 3D vector
AnalyzeMeshOptions (type) — Analyze source bytes or an already retained subject, never both
AnalyzeMeshResult (type) — Mesh analysis result
LoadMeshOptions (type) — Options for loading mesh evidence
LoadMeshResult (type) — Result of loading mesh evidence into a GeoSpec geometry subject
GeoSpecVec3 (type) — Numeric 3D vector
AnalyzeBrepOptions (type) — Options for BRep evidence analysis
AnalyzeBrepResult (type) — Typed result returned by {@link analyzeBrep}
AnalyzeMeshOverlapOptions (type) — Options for component-overlap analysis
AnalyzeMeshOverlapResult (type) — Typed result for component-overlap analysis
MeshComponentOverlap (type) — One overlapping component pair found by {@link analyzeMeshOverlap}
MeshOverlapEvidence (type) — Successful overlap analysis
LoadMeshFailure (type) — Failed mesh load result
LoadMeshSuccess (type) — Successful mesh load result
MeshBufferSource (type) — In-memory triangle mesh source
MeshSource (type) — Mesh source forms accepted by {@link loadMesh}
AabbMeters (type) — Axis-aligned bounding box in glTF document units (meters)
BoundingBoxAxisExtremum (type) — Dominant primitive on an axis extremum for `boundingBox` failures
BoundingBoxAxisFailure (type) — One axis failure for `boundingBox` checks
BoundingBoxFailure (type) — Structured payload when `boundingBox` fails
BoundingBoxStats (type) — Scene bounding box with per-primitive contributors in the subject's unit…
CheckResult (type) — Result of evaluating a single test requirement against geometry stats
ClusterGap (type) — Smallest clearance between two clusters along the dominant separation axis
ClusterReport (type) — One spatial cluster from AABB overlap grouping
ConnectedComponentsFailure (type) — Structured payload when `connectedComponents` fails
ConnectedComponentsResult (type) — Full connected-components analysis at one tolerance
GeometryEvidenceDiagnostic (type) — Diagnostic form permitted inside a wire-safe subject snapshot
GeometryStats (type) — Statistics about a parsed GLB geometry
PrimitiveRecord (type) — One TRIANGLES primitive with identity for spatial-test feedback
WatertightFailure (type) — Structured payload when `watertight` fails
WatertightIrregularEdgeCluster (type) — Spatial cluster of related irregular edges
WatertightIrregularEdgeKind (type) — Class of irregular mesh edge found during watertight analysis
WatertightIrregularEdgeSample (type) — Representative irregular edge, in glTF document coordinates
WatertightPrimitiveBreakdown (type) — Per-primitive watertight diagnostic (local tessellation only)
WatertightResult (type) — Full watertight analysis (global + per-primitive breakdown)
GeoSpecExportRoute (type) — Runtime route metadata used to decide whether a runtime export…
RuntimeBackedModelFormat (type)
RuntimeClientWithRoutes (type) — Runtime client shape for route-aware Tau runtimes
RuntimeExportIntent (type) — Resolved runtime export request and provenance for a GeoSpec model…
RuntimeExportIntentFailure (type) — Structured failure returned when a runtime cannot provide the requested…
CreateModelLoaderOptions (type) — Defaults accepted by {@link import ('./load-model.js').createModelLoader}
GeoSpecModelFormat (type) — Geometry formats accepted by {@link import ('./load-model.js').loadModel}
GeoSpecModelLoader (type) — Function shape used by GeoSpec runners to provide model loading…
ManagedGeoSpecModelLoader (type) — A configured loader whose shared runtime can be released with…
GeoSpecRuntimeClient (type)
GeoSpecRuntimeClientFactory (type) — Lazy runtime factory consumed by `geospec/model`
GeoSpecRuntimeSourceAdapter (type) — Explicit source adapter for formats whose runtime setup is not…
LoadModelCodeOptions (type) — Inline code-CAD model load options
LoadModelFileOptions (type) — Filesystem-backed model load options
LoadModelOptions (type) — Options accepted by {@link import ('./load-model.js').loadModel}
LoadModelSourceOptions (type) — Direct geometry-source model load options
GeoSpecTestNamePattern (type) — Compiled Vitest-style test-name pattern used by a GeoSpec run
DiscoverGeoSpecFilesOptions (type) — Options for recursive GeoSpec test discovery
GeoSpecDiscoveryFileKind (type) — File kind returned by a GeoSpec discovery filesystem
GeoSpecDiscoveryFileStat (type) — Minimal stat object required for recursive GeoSpec test discovery
GeoSpecDiscoveryFileSystem (type) — Minimal filesystem contract used by GeoSpec test discovery
GeoSpecDiscoveryResult (type) — Result returned by recursive GeoSpec test discovery
GeoSpecModuleBundleCache (type) — Worker-local cache for successful GeoSpec bundles
GeoSpecRunFailure (type) — Failed GeoSpec run result
GeoSpecRunResult (type) — Result returned by {@link import ('./run-geospec-module.js').runGeoSpecModule}
GeoSpecRunSuccess (type) — Successful GeoSpec run result
GeoSpecTestCase (type) — A collected GeoSpec test case
GeoSpecTestStatus (type) — Test case status after runner collection
RunGeoSpecModuleOptions (type) — Options for executing a GeoSpec ESM test module
GeoSpecNodeRunnerOptions (type) — Options accepted by {@link createGeoSpecNodeRunner}
GeoSpecNodePoolRunnerOptions (type) — Options accepted by {@link createGeoSpecNodePoolRunner}
GeoSpecWebRunnerOptions (type) — Options accepted by {@link createGeoSpecWebRunner}
GeoSpecWebPoolRunnerOptions (type) — Options accepted by {@link createGeoSpecWebPoolRunner}
GeoSpecPoolWorkerHostOptions (type) — Options accepted by {@link startGeoSpecPoolWorkerHost}
GeoSpecPoolHostMessage (type)
GeoSpecPoolShard (type) — One schedulable work unit
GeoSpecPoolWorkerHandle (type)
GeoSpecPoolWorkerMessage (type)
GeoSpecForensicEvent (type) — One structured forensic measurement emitted by a runner
GeoSpecRunner (type) — Public GeoSpec runner lifecycle surface
GeoSpecRunnerEvent (type) — Lifecycle event emitted by GeoSpec worker-style runners
GeoSpecRunnerFileResult (type) — One GeoSpec test file executed by a worker-style runner
GeoSpecRunnerOptions (type) — Shared options for Node and browser GeoSpec runner factories
GeoSpecRunnerResult (type) — Aggregate result returned by GeoSpec worker-style runners
GeoSpecRunnerRunOptions (type) — Options accepted by a GeoSpec worker-style runner run
GeoSpecStepLoader (type) — A configured STEP loader
BrepFacetName (type) — The five lazily materialized BRep evidence facets
CreateStepLoaderOptions (type) — Defaults accepted by {@link import ('./load-step.js').createStepLoader}
LoadStepOptions (type) — Options for loading STEP/XDE/BRep evidence
StepLoadProgressEvent (type) — Progress event emitted while GeoSpec normalizes a STEP source
StepSource (type) — STEP source forms accepted by {@link import ('./load-step.js').loadStep}
StepStreamingMode (type) — STEP reader strategy used by GeoSpec
XdeDatumPlacement (type) — One native AP242 datum placement row (a coordinate *frame* from…
XdeDatumSystem (type) — One GD&T datum reference frame (`DATUM_SYSTEM`) with its precedence compartments,…
XdeOccurrence (type) — One placed occurrence recovered from an AP242 STEP structure read
XdeReadResult (type) — Structured AP242 read result produced by the GeoSpec verification kernel's…
XdeSemanticDatum (type) — One semantic GD&T datum (`DATUM` + `DATUM_FEATURE` family) recovered from…
XdeSubshapeName (type) — One part-relative authored subshape name, expanded per occurrence of the…
XdeSupplementalPlane (type) — One supplemental-geometry `PLANE` item (e.g

## Classs — `api-classs.md`

GeoSpecModelLoadError (class) [2 members] — Error thrown by {@link import ('./load-model.js').loadModel} when geometry cannot be…
  GeoSpecModelLoadError.diagnostics (property) — Structured diagnostics explaining why model loading failed
  GeoSpecModelLoadError.constructor (constructor)
GeoSpecAssertionError (class) [2 members] — Assertion error thrown by GeoSpec matchers when an expectation does…
  GeoSpecAssertionError.diagnostics (property)
  GeoSpecAssertionError.constructor (constructor)
