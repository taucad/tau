# @taucad/testing / GeoSpec TODO

Working backlog for the Tau-facing geometry testing adapter and the new standalone **GeoSpec** core.

Naming update: the previous **Tau Gauge** nickname is superseded by **GeoSpec**. GeoSpec lives in `packages/geospec` as a standalone CAD testing library. `@taucad/testing` remains the Tau adapter, compatibility layer, parameter-aware render harness, and CAD-agent bridge over GeoSpec.

See `docs/research/geospec-standalone-cad-testing-blueprint.md` for the current architecture blueprint.

## Eigenquestions

- [ ] Decide the canonical object under test.
  - Answer to preserve: GeoSpec tests target a GeoSpec-loaded `GeometrySubject`, created from runtime-produced geometry files/bytes such as GLB/glTF and later STEP. Tau runtime must not grow a public `GeometryArtifact` contract in this slice.
- [ ] Decide what the runtime must emit versus what testing computes.
  - Answer to preserve: the runtime emits geometry files/bytes; GeoSpec loads evidence and computes assertions. Mesh-only assertions must stay pure-geometry and must not depend on kernel metadata. Future B-rep/topology assertions may consume STEP/B-rep files or sidecars through explicit loader capabilities.
- [ ] Decide how tests stay kernel-agnostic when kernels have uneven geometric fidelity.
  - Answer to preserve: every advanced matcher declares evidence requirements and returns a typed `unsupported` diagnostic when the artifact lacks required evidence. Tests can opt into `requires('brep')` or use mesh fallback matchers.
- [ ] Decide the unit contract.
  - Answer to preserve: public testing APIs speak millimeters by default. Internally preserve raw units and transforms, but normalize reported measurements through an explicit `UnitContext`.
- [ ] Decide whether tests validate a generated artifact or source intent.
  - Answer to preserve: assertions validate observable geometry, but expected values should derive from source parameters or saved parameter groups whenever the design is parametric.
- [ ] Decide whether "Chamfer distance" means CAD chamfer features or point-cloud/mesh Chamfer distance.
  - Answer to preserve: use `chamferDistance` only for bidirectional shape-distance metrics. Use `edgeChamfer` / `featureChamfer` for CAD chamfer features.

## Package Ownership

- [x] Use **GeoSpec** as the standalone package/product name.
- [x] Keep `@taucad/testing` as the Tau-specific adapter instead of absorbing it into GeoSpec immediately.
- [x] Move standalone P0 mesh geometry algorithms into `geospec`.
- [ ] Keep Tau chat result schemas, parameter helpers, and runtime render harnesses in `@taucad/testing`; do not restore legacy JSON requirement-file authoring compatibility.

## Package Shape

- [x] Add `geospec` as the standalone package under `packages/geospec`.
- [x] Expose standalone Vitest-style authoring from root `geospec` (`describe`, `it`, `test`, `expectGeo`).
- [x] Add `geospec/mesh` for pure mesh loading and analysis utilities.
- [ ] Add `geospec/brep` for exact B-rep evidence and analysis utilities.
- [ ] Add `geospec/step` for STEP/AP242 import and evidence extraction.
  - [ ] Use the brepjs `StepStreamIO` pattern as prior art: native OCCT `ReadStream` first, Emscripten FS fallback second.
  - [ ] Implement GeoSpec's STEP wrapper with `STEPCAFControl_Reader::ReadStream` so AP242/XDE product structure, colors, materials, validation properties, and GDT/PMI modes are preserved.
  - [ ] Expose `loadStep({ source, streaming: 'auto', onProgress, signal, maxBytes })` with read-strategy provenance on the resulting artifact.
  - [ ] Keep `streaming: 'filesystem'` only as an explicit compatibility/debug strategy.
- [x] Add `geospec/runner` for VM runner APIs.
- [x] Add `geospec/config` for `defineGeoSpecConfig`.
- [x] Keep Tau-aware render/parameter helper adapters in `@taucad/testing`.
- [ ] Remove any remaining legacy requirement-file migration notes after active GeoSpec adoption is complete.
- [ ] Keep runtime-heavy initialization out of the root export; root authoring symbols must remain lazy.

## GeoSpec Evidence Model

- [x] Define the P0 file/bytes-based `GeometrySubject`.
  - P0 fields: `mesh`, `source`, `parameters`, `unit`, `provenance`, `capabilities`, `diagnostics`.
  - Runtime contract: render/export geometry bytes or files; GeoSpec owns evidence loading.
  - Do not add a public Tau runtime `GeometryArtifact` contract.
- [ ] Define `GeometryEvidenceCapabilities`.
  - `mesh.triangles`, `mesh.normals`, `mesh.materials`, `mesh.sceneGraph`
  - `topology.faces`, `topology.edges`, `topology.vertices`, `topology.relations`
  - `brep.surfaces`, `brep.curves`, `brep.massProperties`, `brep.solids`
  - `assembly.occurrences`, `assembly.frames`, `assembly.mates`
- [ ] Emit topology sidecars from Tau runtime, not ad hoc per test.
- [ ] Preserve the current pure-GLB rule for mesh checks.
- [ ] Add a Tau topology manifest inspired by `repos/text-to-cad`'s STEP topology extension:
  - occurrence rows with transforms, names, bbox, child/leaf ranges
  - shape rows with kind, bbox, area, volume, center of mass
  - face rows with surface type, area, center, normal, bbox, params, adjacent edges
  - edge rows with curve type, length, center, bbox, params, adjacent faces/vertices
  - vertex rows with center and adjacency
  - relation buffers for face-edge, edge-face, edge-vertex, vertex-edge
- [ ] Support artifact provenance:
  - kernel id and version
  - source file and dependency hash
  - parameter hash and active group name
  - tessellation options
  - coordinate-system transform
- [x] Expose adapter `analyze({ file, parameters, renderer })` and `render({ file, parameters, renderer })` paths that work with geometry bytes.
- [ ] Add typed outcome unions for unsupported analysis instead of throwing for missing optional evidence.

## Authoring API

- [x] `render({ file, parameters, renderer })`
- [x] `analyze({ file, parameters, renderer })`
- [x] `parameterCases(defaults, cases)`
- [x] `parameterGroups({ file, readFile, defaults })`
- [ ] `parameters.defaults(file)`
- [ ] `parameters.active(file)`
- [ ] `parameters.groups(file)`
- [ ] `select(artifact, query)` for named features, topology selectors, and occurrence paths.
- [ ] `measure(artifact)` fluent helper for derived measurements.
- [ ] `compare(left, right, options?)` for regression/reference metrics.
- [ ] `frame(artifact, selector)` for transform/frame inspection.
- [ ] `mate(left, right, options)` for read-only mate delta validation.
- [ ] `requires(artifact, capability)` for explicit advanced-test gating.

## P0 Mesh Matchers

- [ ] `toHaveBoundingBox({ min, max, size, center, tolerance })`
- [ ] `toHaveConnectedComponents(count, { tolerance })`
- [ ] `toBeWatertight()`
- [x] `toHaveNoComponentOverlap({ tolerance })`
  - Chosen first-class assembly-overlap API.
  - Public options stay limited to `{ tolerance?: number }`; no component mode, pair exemptions, sample budget, or volume budget is exposed.
  - Verdicts are native-only through GeoSpec OpenCascade.js faceted-solid intersection. Correct gear meshing and tangent contact pass because only positive common solid volume fails.
  - If GeoSpec cannot identify independently testable components or native overlap support is missing, return structured diagnostics rather than a false pass or a JavaScript fallback.
- [ ] `toHaveNoDegenerateTriangles({ areaTolerance })`
- [ ] `toHaveNoNonFiniteVertices()`
- [ ] `toHaveNoDuplicateFaces({ tolerance })`
- [ ] `toHaveValidNormals({ tolerance })`
- [ ] `toHaveConsistentWinding()`
- [ ] `toHaveTriangleCount(rangeOrCount)`
- [ ] `toHaveSurfaceArea(value, { tolerance })`
- [ ] `toHaveClosedMeshVolume(value, { tolerance })`

## P0 Shape Distance and Regression Metrics

- [ ] `toMatchReferenceGeometry(reference, { metric: 'hausdorff', max })`
- [ ] `toMatchReferenceGeometry(reference, { metric: 'chamfer', mean, max, p95 })`
- [ ] `toHaveChamferDistanceTo(reference, { mean, max, p95 })`
- [ ] `toHaveHausdorffDistanceTo(reference, { max })`
- [ ] `toHaveVolumeDifference(reference, { maxAbsolute, maxRelative })`
- [ ] `toHaveBoundingBoxDifference(reference, { max })`
- [ ] Implement robust spatial acceleration for mesh-distance metrics.
- [ ] Validate distance metrics against synthetic point clouds, analytic primitives, and translated/scaled fixtures.

## P1 B-Rep and Topology Matchers

- [ ] `toHaveSolidCount(count)`
- [ ] `toHaveShellCount(count)`
- [ ] `toHaveFaceCount(countOrRange)`
- [ ] `toHaveEdgeCount(countOrRange)`
- [ ] `toHaveEulerCharacteristic(value)`
- [ ] `toHaveSurfaceTypes({ plane, cylinder, cone, sphere, torus, bspline })`
- [ ] `toHavePlane({ axis, coordinate, area, tolerance })`
- [ ] `toHaveCylinder({ radius, axis, center, tolerance })`
- [ ] `toHaveCircularHole({ diameter, axis, center, through, tolerance })`
- [ ] `toHaveHolePattern({ count, diameter, boltCircleDiameter, angularSpacing, tolerance })`
- [ ] `toHaveFillet({ radius, selector?, tolerance })`
- [ ] `toHaveEdgeChamfer({ distance, selector?, tolerance })`
- [ ] `toHaveWallThickness({ min, max, sampleCount, tolerance })`
- [ ] `toHaveOpenTop({ axis, side })`
- [ ] `toHaveCavity({ accessibleFrom, minVolume })`
- [ ] `toHaveNoUnexpectedTopologyChange(reference, options)`

## P1 Assembly, Frame, and Mate Matchers

- [ ] `toHaveOccurrenceCount(count)`
- [ ] `toHaveNamedOccurrence(name)`
- [ ] `toHaveFrame(selector, { origin, axes, tolerance })`
- [ ] `toHaveTransform(selector, matrixOrPose, { tolerance })`
- [ ] `toBeFlushWith(leftSelector, rightSelector, { axis, offset, tolerance })`
- [ ] `toBeCenteredWith(leftSelector, rightSelector, { axes, tolerance })`
- [ ] `toBeCoaxialWith(leftSelector, rightSelector, { tolerance })`
- [ ] `toBeParallelTo(leftSelector, rightSelector, { angularTolerance })`
- [ ] `toBePerpendicularTo(leftSelector, rightSelector, { angularTolerance })`
- [ ] `toHaveClearanceTo(selector, { min, max, tolerance })`
- [ ] Selector-aware exact interference API for a future slice.
  - Do not add a duplicate alias for the P0 whole-assembly invariant. Use `toHaveNoComponentOverlap({ tolerance })` today.
  - Future selector APIs should express positive relationships such as clearance, contact, press-fit, or intentional interference with explicit selector evidence.
- [ ] `toHaveContactWith(selector, { tolerance })`
- [ ] `toHaveMateDelta({ translation, rotation, tolerance })`

## P1 Volumetric and Mass-Property Matchers

- [ ] `toHaveVolume(value, { tolerance })`
- [ ] `toHaveSurfaceArea(value, { tolerance })`
- [ ] `toHaveCenterOfMass(point, { tolerance })`
- [ ] `toHaveInertiaTensor(tensor, { tolerance })`
- [ ] `toHaveMass(value, { materialDensity, tolerance })`
- [ ] `toContainPoint(point)`
- [ ] `toContainVolume(other, { tolerance })`
- [ ] `toHaveBooleanOverlapWith(other, { expectedVolume, tolerance })`
- [ ] `toHaveMinimumWallThickness(value, options)`
- [ ] `toHaveSectionArea({ plane, expected, tolerance })`

## P2 Feature and Manufacturing Matchers

- [ ] `toHaveSymmetry({ plane, tolerance })`
- [ ] `toHaveRadialPattern({ count, radius, angularSpacing, tolerance })`
- [ ] `toHaveHelicalPattern({ count, pitch, turns, tolerance })`
- [ ] `toHaveGearTeeth({ count, rootDiameter, outerDiameter, pitchDiameter, tolerance })`
- [ ] `toHaveBladeCount(count)`
- [ ] `toHaveBladeCurvature({ angle, tolerance })`
- [ ] `toHaveDraftAngle({ min, faces })`
- [ ] `toHaveNoUndercuts({ pullDirection })`
- [ ] `toBePrintable({ minWall, minClearance, maxOverhangAngle })`
- [ ] `toBeMachinable({ toolDiameter, reach, minInsideRadius })`
- [ ] `toMeetSheetMetalRules({ thickness, bendRadius, relief })`

## P2 Semantic and Visual Evidence Matchers

- [ ] `toHaveMaterial(nameOrProperties)`
- [ ] `toHaveColor(selector, color)`
- [ ] `toHaveNamedPart(name)`
- [ ] `toHaveLayer(name)`
- [ ] `toHaveExplodedViewSafeNames()`
- [ ] `toHaveStableSelectors(reference)`
- [ ] `toMatchSilhouette(referenceImageOrProjection, options)` as visual supplementary evidence only.

## Node and Browser Execution

- [ ] Implement a runner adapter abstraction:
  - `native-node-worker`: Node `worker_threads`, dynamic ESM import, timeout, transferable buffers.
  - `browser-module-worker`: browser module `Worker`, Blob URL, structured clone/transfer.
  - `browser-iframe`: sandboxed iframe fallback for DOM-dependent viewer-side tests.
  - `quickjs-vm`: future pure-JS predicate sandbox, not first runtime-kernel path.
- [ ] Do not rely on Node `vm.SourceTextModule` for the primary runner while it remains experimental and flag-gated.
- [ ] Do not embed full Vitest browser mode inside Tau UI.
- [ ] Support real Vitest in Node as an external developer workflow.
- [ ] Keep embedded runner syntax intentionally small: `describe`, `it/test`, hooks, `describe.each`, `it.each`, `expect`, async tests.
- [ ] Add deterministic timeout, abort, and leak cleanup for every test task.
- [ ] Ensure browser and Node runners use the same matcher implementations and result schema.

## Test-The-Tester Coverage

- [ ] Create exact synthetic mesh fixtures:
  - closed tetrahedron, cube, sphere approximation
  - single open triangle, open strip, non-manifold edge, bow-tie vertex
  - duplicate triangles, zero-area triangles, inverted winding, NaN/Infinity vertices
  - unwelded-but-touching triangles, color-binned OpenSCAD-style unwelded mesh
- [ ] Create runtime-rendered good/bad fixtures with Replicad:
  - good box, bad open shell, fused vs touching vs disjoint boxes
  - holes with exact centers and diameters
  - fillet/chamfer positive and false-positive traps
- [ ] Create runtime-rendered good/bad fixtures with OpenSCAD:
  - same-color disjoint primitives in one glTF primitive
  - touching cubes, separated cubes, parameterized dimensions
- [ ] Create runtime-rendered fixtures with JSCAD and Manifold for cross-kernel parity.
- [ ] Add OpenCascade/Replicad B-rep evidence fixtures for exact volume, cylinder, plane, circle, and topology assertions.
- [ ] Add browser/Node parity tests for every analyzer:
  - same input bytes
  - same result JSON
  - same failure diagnostics
- [ ] Add golden-failure tests for LLM usefulness:
  - every failure includes spatial location, selector/part name when available, actual/expected/tolerance, and an actionable fix hint.
- [ ] Add property/fuzz tests for distance metrics:
  - identical objects distance is zero
  - translation distance is known
  - symmetric metric is symmetric
  - sampled estimates converge as sample count rises
- [ ] Add edge-case unit tests:
  - meters vs millimeters
  - coordinate transform y-up/z-up
  - negative coordinates
  - tiny/large models
  - degenerate B-rep entities
  - missing optional evidence produces `unsupported`, not false pass/fail.
- [ ] Add STEP stream-import tests:
  - native `STEPCAFControl_Reader::ReadStream` path imports a simple AP242 fixture
  - XDE names/colors/product tree survive native stream import
  - Emscripten FS fallback produces equivalent evidence and records `strategy: 'filesystem'`
  - invalid and empty STEP inputs return structured failures
  - browser `Blob.stream()` and Node `AsyncIterable<Uint8Array>` sources emit progress
  - a large STEP fixture imports in worker isolation without FS writes when native stream is present.

## text-to-cad Findings To Carry Forward

- [ ] Treat `repos/text-to-cad/benchmarks/*.md` as a benchmark vocabulary for GeoSpec and the Tau adapter.
- [ ] Cover rectangular blocks, flanges, brackets, shafts, enclosures, clevises, radial cylinders, impellers, spiral staircases, and planetary gear assemblies.
- [ ] Port its high-value validation categories:
  - import success
  - solid/body count
  - exact bounding dimensions and placement
  - through/blind holes
  - hole axes, diameters, locations, and patterns
  - chamfer and fillet radii
  - coaxiality and axis alignment
  - wall/floor thickness and open-top/cavity checks
  - symmetry
  - ribs, bosses, standoffs, lugs
  - helical/radial/gear/blade patterns
  - negative checks for missing, floating, fused, or decorative geometry
- [ ] Use its STEP topology manifest as prior art for Tau runtime evidence, while keeping Tau's schema TypeScript-first and kernel-agnostic.

## Migration Priorities

- [ ] P0: environment-neutral `analyzeGlb` and mesh matcher parity.
- [ ] P0: embedded Vitest-style collector and Node/browser runners.
- [ ] P0: parameter-aware render cases and virtual parameter modules.
- [ ] P0: mesh distance metrics: Chamfer, Hausdorff, volume/bbox deltas.
- [ ] P1: runtime-emitted topology/B-rep evidence manifest.
- [ ] P1: B-rep facts and selector/mate APIs.
- [ ] P1: volume, mass, center-of-mass, and section metrics.
- [ ] P1: text-to-cad benchmark-derived fixture suite.
- [ ] P2: manufacturing/process rule matchers.
- [ ] P2: visual/silhouette supplementary assertions.
- [ ] P3: simulation/URDF/SDF semantic validation integration.
