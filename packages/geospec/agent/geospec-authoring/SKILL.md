---
name: geospec-authoring
description: Guides canonical GeoSpec geometry tests in TypeScript or JavaScript for every Tau kernel. Use for *.geospec.ts and *.geospec.js tests.
---

# GeoSpec authoring

Write tests before implementation; assert deterministic, measurable properties.

## Test shape

- Use `*.geospec.ts` or `*.geospec.js`. Import `describe`, `it` and `expectGeo` from `geospec`, and `loadModel` from `geospec/model`.
- Await `loadModel`, then assert synchronously with `expectGeo(model)`. The host supplies the compiled binding; authoring does not select an engine.
- Await or return the complete model-load chain from the test callback; detached future loads are not part of a completed test.
- Omit `parameters` for model-code defaults; use `{ file, parameters }` for variants. Loaded subjects are opaque.

Canonical TypeScript authoring:

```ts
import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('main geometry', () => {
  it('has the intended envelope', async () => {
    const model = await loadModel({ file: 'main.ts', parameters: { width: 120 } });
    expectGeo(model).toHaveBoundingBox({ size: { x: 120 }, tolerance: 1 });
  });
});
```

Specs are always TypeScript or JavaScript, whatever the model's kernel: `loadModel({ file })` evaluates `main.ts`, `main.tsx`, `main.py`, `main.scad`, `main.kcl` or `main.cs` through Tau's runtime. `test_model` discovers `*.geospec.ts` and `*.geospec.js` only.

Every matcher takes one expectation object:

- Wrong: `expectGeo(model).toHaveVolume(5000, { tolerance: 5 })`. Correct: `expectGeo(model).toHaveVolume({ value: 5000, tolerance: 5 })`.
- Wrong: `await expectGeo(model)…`. Correct: await `loadModel`, then assert synchronously.
- Wrong: exact-feature matchers on a mesh kernel (Manifold, JSCAD, OpenSCAD, PicoGK, PicoVoxel). Correct: `toBeValidBrep`, `toHaveTopologyCounts`, the face, hole, pattern, chamfer, fillet and wall-thickness matchers, `toHaveStepUnits`, `toHaveProductStructure` and `toHaveVoidContinuity` need STEP BRep evidence and report unsupported on meshes; assert meshes with bounds, volume, surface area, connected components and `toBeWatertight`.

## Coverage

Bounds and physical properties are insufficient. Cover major components, named features, variants, dimensions/positions, disjoint counts, closure, interference and supported exact features. Explicitly report unsupported requirements; proxies cannot fulfill them.

- `toHaveBoundingBox`: size/position.
- `toHaveConnectedComponents`: qualified material connectivity; visual touching cannot justify tolerance changes.
- `toBeWatertight`: closed edge incidence, not manifold validity, fusion or material connectivity. Bounds prove none of these. Missing evidence is unsupported.
- `toHaveSurfaceArea`, `toHaveVolume`, `toHaveCenterOfMass`, `toHaveMass`: physical measurements.
- `toHaveNoComponentInterference`: overlap; allow deliberate press fits.
- `loadModel({ file, format: 'step' })`: use BRep evidence for supported topology and feature assertions. Missing occurrence, interference, clearance, containment, lumen, wall, section or motion evidence is unsupported, not a pass or an envelope substitute.

Test assemblies and independent units; preserve sibling coverage when adding files. Non-top-level geometry needs kernel export/invocation, not test removal.

Fix geometry at its root; never weaken tolerances, delete assertions, or reduce detail to pass.

`public-api-index.md` covers the host and framework API; authoring needs only the Core API below and `api-*` files.

## Core API

The symbols real Tau models use most, as verbatim declarations. Anything not shown is in the API reference below.

### Functions

```ts
// Start a geometry assertion chain
export declare function expectGeo(subject: GeoSpecSubject): GeoSpecMatcher;

// A model admitted by one live GeoSpec host scope
GeoSpecSubject: {
  readonly [subjectBrand]: true
}

// Load a CAD model into GeoSpec evidence
export declare function loadModel<Code extends Record<string, string> = Record<string, string>>(options: LoadModelOptions<Code>): Promise<GeoSpecSubject>;

// Options accepted by {@link import ('./load-model.js').loadModel}
LoadModelOptions: LoadModelSourceOptions | LoadModelCodeOptions<Code> | LoadModelFileOptions
  // Geometry format to export
  format?: GeoSpecModelFormat
  // Explicit parameters passed to the runtime
  parameters?: Record<string, unknown>
  // STEP reader strategy used for STEP exports
  stepStreaming?: StepStreamingMode
  // Whether STEP loading should also produce mesh evidence
  mesh?: boolean
  // Linear tolerance used while meshing exact BRep evidence
  meshLinearTolerance?: number
  // Angular tolerance in degrees used while meshing exact BRep evidence
  meshAngularToleranceDegrees?: number

// Geometry formats accepted by {@link import ('./load-model.js').loadModel}
GeoSpecModelFormat: MeshFileFormat | 'step' | 'stp'

// STEP reader strategy used by GeoSpec
StepStreamingMode: 'auto' | 'native-stream' | 'filesystem'
```

### Types

```ts
// Assertion chain returned by `expectGeo(subject)`
GeoSpecMatcher: {
  // Core-owned negation
  readonly not: Omit<GeoSpecMatcher, 'not'>
  // Assert the fixed rational plate contract
  toSatisfyRationalPlate(): GeoSpecAssertion;
  // Assert the fixed parallel-plane distance contract
  toSatisfyParallelPlaneDistance(): GeoSpecAssertion;
  // Assert axis-aligned bounds, size, or center for a loaded geometry subject
  toHaveBoundingBox(first: Vec3 | GeoSpecBoundingBoxExpectation, second?: Vec3): GeoSpecAssertion;
  // Assert how many spatially disjoint chunks the mesh contains
  toHaveConnectedComponents(expected: GeoSpecConnectedComponentsExpectation): GeoSpecAssertion;
  // Assert closed mesh edge incidence
  toBeWatertight(): GeoSpecAssertion;
  // Assert that separate assembly components do not occupy the same solid volume
  toHaveNoComponentInterference(expected?: GeoSpecComponentInterferenceExpectation): GeoSpecAssertion;
  // Assert that named assembly occurrences exist with expected counts and bounds
  toHaveAssemblyOccurrences(expected: GeoSpecAssemblyOccurrencesExpectation): GeoSpecAssertion;
  // Assert that selected entities satisfy declared spatial relationships
  toHaveSpatialRelationships(expected: GeoSpecSpatialRelationshipsExpectation): GeoSpecAssertion;
  // Assert rendered mesh evidence is internally trustworthy for downstream checks
  toHaveMeshIntegrity(expected: GeoSpecMeshIntegrityExpectation): GeoSpecAssertion;
  // Assert that the subject carries no diagnostics at the rejected severities
  toHaveNoDiagnostics(expected?: GeoSpecNoDiagnosticsExpectation): GeoSpecAssertion;
  // Assert total surface area, preferring exact BRep mass properties when available
  toHaveSurfaceArea(expected: GeoSpecSurfaceAreaExpectation): GeoSpecAssertion;
  // Assert enclosed volume, preferring exact BRep mass properties when available
  toHaveVolume(expected: GeoSpecVolumeExpectation): GeoSpecAssertion;
  // Assert mass derived from exact mass properties or volume times density
  toHaveMass(expected: GeoSpecMassExpectation): GeoSpecAssertion;
  // Assert the center of mass or mesh-derived centroid for a closed subject
  toHaveCenterOfMass(expected: GeoSpecCenterOfMassExpectation): GeoSpecAssertion;
  // Assert that exact BRep evidence reports a valid shape
  toBeValidBrep(expected?: GeoSpecValidBrepExpectation): GeoSpecAssertion;
  // Assert exact BRep topology counts
  toHaveTopologyCounts(expected: GeoSpecTopologyCountsExpectation): GeoSpecAssertion;
  // Assert the STEP unit evidence
  toHaveStepUnits(expected: GeoSpecStepUnitsExpectation): GeoSpecAssertion;
  // Assert STEP product-structure evidence
  toHaveProductStructure(expected: GeoSpecProductStructureExpectation): GeoSpecAssertion;
  // Assert that BRep evidence contains a planar face matching the requested constraints
  toHavePlanarFace(expected: GeoSpecPlanarFaceExpectation): GeoSpecAssertion;
  // Assert that BRep evidence contains a cylindrical face with the requested radius and axis
  toHaveCylindricalFace(expected: GeoSpecCylindricalFaceExpectation): GeoSpecAssertion;
  // Assert that BRep evidence contains a circular hole matching diameter, center, and axis
  toHaveCircularHole(expected: GeoSpecCircularHoleExpectation): GeoSpecAssertion;
  // Assert that BRep evidence contains a repeated circular-hole pattern
  toHaveCircularHolePattern(expected: GeoSpecCircularHolePatternExpectation): GeoSpecAssertion;
  // Assert that BRep evidence contains a chamfer feature with the requested distance
  toHaveChamferFeature(expected: GeoSpecChamferFeatureExpectation): GeoSpecAssertion;
  // Assert that BRep evidence contains a fillet feature with the requested radius
  toHaveFilletFeature(expected: GeoSpecFilletFeatureExpectation): GeoSpecAssertion;
  // Assert that BRep evidence reports a minimum wall thickness satisfying the expectation
  toHaveMinimumWallThickness(expected: GeoSpecMinimumWallThicknessExpectation): GeoSpecAssertion;
  // Assert that the declared waypoints share one connected void, stay isolated from the declared…
  toHaveVoidContinuity(expected: GeoSpecVoidContinuityExpectation): GeoSpecAssertion;
}

// Numeric 3D vector
Vec3: readonly [number, number, number]

// Bounding-box expectation accepted by `expectGeo(...).toHaveBoundingBox(...)`
GeoSpecBoundingBoxExpectation: {
  min?: Vec3 | Partial<Record<keyof GeoSpecAxisExpectation, GeoSpecNumericExpectation>>
  max?: Vec3 | Partial<Record<keyof GeoSpecAxisExpectation, GeoSpecNumericExpectation>>
  size?: Vec3 | Partial<Record<keyof GeoSpecAxisExpectation, GeoSpecNumericExpectation>>
  center?: Vec3 | Partial<Record<keyof GeoSpecAxisExpectation, GeoSpecNumericExpectation>>
  tolerance?: number
}

// Connected-components expectation accepted by `expectGeo(...).toHaveConnectedComponents(...)`
GeoSpecConnectedComponentsExpectation: {
  count: number
  tolerance?: number
  toleranceMm?: number
}

// Component-interference expectation accepted by `expectGeo(...).toHaveNoComponentInterference(...)`
GeoSpecComponentInterferenceExpectation: {
  tolerance?: number
  pairs?: GeoSpecComponentInterferencePairExpectation[]
  allowances?: GeoSpecComponentInterferenceAllowance[]
}

// Assembly occurrence expectation accepted by `expectGeo(...).toHaveAssemblyOccurrences(...)`
GeoSpecAssemblyOccurrencesExpectation: {
  occurrences: GeoSpecAssemblyOccurrenceExpectation[]
  uniqueNames?: boolean
}

// Spatial relationship expectation accepted by `expectGeo(...).toHaveSpatialRelationships(...)`
GeoSpecSpatialRelationshipsExpectation: {
  relationships: GeoSpecSpatialRelationshipExpectation[]
}

// Mesh integrity expectation accepted by `expectGeo(...).toHaveMeshIntegrity(...)`
GeoSpecMeshIntegrityExpectation: {
  finitePositions?: boolean
  degenerateTriangles?: {
          count?: number;
          maxCount?: number;
          areaTolerance?: number;
      }
  duplicateFaces?: {
          count?: number;
          maxCount?: number;
      }
  watertight?: boolean
  triangleCount?: GeoSpecNumericExpectation
}

// Diagnostic severities rejected by `expectGeo(...).toHaveNoDiagnostics(...)`
GeoSpecNoDiagnosticsExpectation: {
  severities?: Array<GeometryDiagnostic['severity']>
}

// Surface-area expectation accepted by `expectGeo(...).toHaveSurfaceArea(...)`
GeoSpecSurfaceAreaExpectation: {
  value: number | GeoSpecNumericExpectation
  tolerance?: number
}

// Volume expectation accepted by `expectGeo(...).toHaveVolume(...)`
GeoSpecVolumeExpectation: {
  value: number | GeoSpecNumericExpectation
  tolerance?: number
}

// Mass expectation accepted by `expectGeo(...).toHaveMass(...)`
GeoSpecMassExpectation: {
  value: number | GeoSpecNumericExpectation
  density?: number
  tolerance?: number
}

// Center-of-mass expectation accepted by `expectGeo(...).toHaveCenterOfMass(...)`
GeoSpecCenterOfMassExpectation: {
  point: GeoSpecPointExpectation
  tolerance?: number
}

// Exact BRep validity expectation accepted by `expectGeo(...).toBeValidBrep(...)`
GeoSpecValidBrepExpectation: {
  maxTolerance?: number
  freeBounds?: {
          count?: GeoSpecNumericExpectation;
      }
  minEdgeLength?: number
  sameParameter?: boolean
  closedShells?: boolean
  closedWires?: boolean
}

// Topology-count expectation accepted by `expectGeo(...).toHaveTopologyCounts(...)`
GeoSpecTopologyCountsExpectation: {
  vertices?: GeoSpecNumericExpectation
  edges?: GeoSpecNumericExpectation
  wires?: GeoSpecNumericExpectation
  faces?: GeoSpecNumericExpectation
  shells?: GeoSpecNumericExpectation
  solids?: GeoSpecNumericExpectation
  compounds?: GeoSpecNumericExpectation
  tolerance?: number
}

// STEP unit expectation accepted by `expectGeo(...).toHaveStepUnits(...)`
GeoSpecStepUnitsExpectation: {
  unit: string
}

// Product-structure expectation accepted by `expectGeo(...).toHaveProductStructure(...)`
GeoSpecProductStructureExpectation: {
  names?: string[]
  count?: GeoSpecNumericExpectation
}

// Planar-face expectation accepted by `expectGeo(...).toHavePlanarFace(...)`
GeoSpecPlanarFaceExpectation: {
  normal: GeoSpecPointExpectation
  offset: number
  area?: GeoSpecNumericExpectation
  tolerance?: number
}

// Cylindrical-face expectation accepted by `expectGeo(...).toHaveCylindricalFace(...)`
GeoSpecCylindricalFaceExpectation: {
  radius: number
  axis: 'x' | 'y' | 'z'
  tolerance?: number
}

// Circular-hole expectation accepted by `expectGeo(...).toHaveCircularHole(...)`
GeoSpecCircularHoleExpectation: {
  diameter: number
  through?: boolean
  axis?: 'x' | 'y' | 'z'
  center?: GeoSpecPointExpectation
  tolerance?: number
}

// Circular-hole-pattern expectation accepted by `expectGeo(...).toHaveCircularHolePattern(...)`
GeoSpecCircularHolePatternExpectation: {
  count: number
  holeDiameter: number
  boltCircleDiameter?: number
  axis?: 'x' | 'y' | 'z'
  center?: GeoSpecPointExpectation
  tolerance?: number
}

// Chamfer-feature expectation accepted by `expectGeo(...).toHaveChamferFeature(...)`
GeoSpecChamferFeatureExpectation: {
  distance: number
  selection?: string
  tolerance?: number
}

// Fillet-feature expectation accepted by `expectGeo(...).toHaveFilletFeature(...)`
GeoSpecFilletFeatureExpectation: {
  radius: number
  selection?: string
  tolerance?: number
}

// Minimum-wall-thickness expectation accepted by `expectGeo(...).toHaveMinimumWallThickness(...)`
GeoSpecMinimumWallThicknessExpectation: {
  value: GeoSpecNumericExpectation
  tolerance?: number
}

// Void-continuity expectation accepted by `expectGeo(...).toHaveVoidContinuity(...)`
GeoSpecVoidContinuityExpectation: {
  // Ordered waypoints (>= 1) known to lie in the void being proven
  path: GeoSpecVoidWaypoint[]
  // Occurrence names whose solids bound the void
  material?: string[]
  // Minimum required bottleneck cross-section (mm²), sampled
  minCrossSection?: number
  // Points that must NOT be reachable from the path void (isolation claim)
  isolatedFrom?: Vec3[]
  // Region bounded for the proof (subject frame)
  bounds?: {
          min: Vec3;
          max: Vec3;
      }
}

// Axis-keyed numeric expectation used by high-level geometry matchers
GeoSpecAxisExpectation: {
  x?: number
  y?: number
  z?: number
}

// Shared scalar expectation used by geometry measurements
GeoSpecNumericExpectation: number | {
    value?: number;
    greaterThan?: number;
    greaterThanOrEqual?: number;
    lessThan?: number;
    lessThanOrEqual?: number;
}

// A pair-specific component-interference check accepted by `expectGeo(...).toHaveNoComponentInterference(...)`
GeoSpecComponentInterferencePairExpectation: {
  left: GeoSpecComponentSelector
  right: GeoSpecComponentSelector
}

// Intentional component interference allowance accepted by `expectGeo(...).toHaveNoComponentInterference(...)`
GeoSpecComponentInterferenceAllowance: {
  kind?: 'intentionalInterference'
  left: GeoSpecComponentSelector
  right: GeoSpecComponentSelector
  maxVolume?: number
  reason: string
}

// Assembly occurrence rule accepted by `expectGeo(...).toHaveAssemblyOccurrences(...)`
GeoSpecAssemblyOccurrenceExpectation: {
  name: GeoSpecComponentSelector
  count?: GeoSpecNumericExpectation
  bounds?: {
          within?: GeoSpecComponentSelector;
          min?: Vec3 | GeoSpecAxisExpectation;
          max?: Vec3 | GeoSpecAxisExpectation;
          center?: GeoSpecPointExpectation;
          tolerance?: number;
      }
}

// One spatial relationship accepted by `expectGeo(...).toHaveSpatialRelationships(...)`
GeoSpecSpatialRelationshipExpectation: {
  id?: string
  kind: 'contact' | 'clearance' | 'coaxial' | 'concentric' | 'coplanar' | 'parallel' | 'perpendicular' | 'angle' | 'containment' | 'insertion' | 'interference'
  subject: GeoSpecGeometrySelector
  target: GeoSpecGeometrySelector
  tolerance?: number
  angularToleranceDegrees?: number
  // Expected angle in degrees for `kind
  angleDegrees?: number
  // Declared insertion axis (subject-frame direction) for `kind
  axis?: Vec3
  min?: number
  max?: number
  minVolume?: number
  maxVolume?: number
  reason?: string
}

// Shared scalar expectation used by geometry measurements
GeoSpecNumericExpectation: number | {
    value?: number;
    greaterThan?: number;
    greaterThanOrEqual?: number;
    lessThan?: number;
    lessThanOrEqual?: number;
}

// Diagnostic emitted by GeoSpec loaders, analyzers, and matchers
GeometryDiagnostic: {
  code: KernelIssueCode | (string & {})
  severity: 'error' | 'warning' | 'info'
  message: string
  suggestion?: string
  spatial?: {
          min?: Vec3;
          max?: Vec3;
          center?: Vec3;
      }
  details?: unknown
}

// Shared scalar expectation used by geometry measurements
GeoSpecNumericExpectation: number | {
    value?: number;
    greaterThan?: number;
    greaterThanOrEqual?: number;
    lessThan?: number;
    lessThanOrEqual?: number;
}

// Shared scalar expectation used by geometry measurements
GeoSpecNumericExpectation: number | {
    value?: number;
    greaterThan?: number;
    greaterThanOrEqual?: number;
    lessThan?: number;
    lessThanOrEqual?: number;
}

// Shared scalar expectation used by geometry measurements
GeoSpecNumericExpectation: number | {
    value?: number;
    greaterThan?: number;
    greaterThanOrEqual?: number;
    lessThan?: number;
    lessThanOrEqual?: number;
}

// Point expectation accepted by center and feature matchers
GeoSpecPointExpectation: Vec3 | GeoSpecAxisExpectation

// Shared scalar expectation used by geometry measurements
GeoSpecNumericExpectation: number | {
    value?: number;
    greaterThan?: number;
    greaterThanOrEqual?: number;
    lessThan?: number;
    lessThanOrEqual?: number;
}

// Shared scalar expectation used by geometry measurements
GeoSpecNumericExpectation: number | {
    value?: number;
    greaterThan?: number;
    greaterThanOrEqual?: number;
    lessThan?: number;
    lessThanOrEqual?: number;
}

// Point expectation accepted by center and feature matchers
GeoSpecPointExpectation: Vec3 | GeoSpecAxisExpectation

// Point expectation accepted by center and feature matchers
GeoSpecPointExpectation: Vec3 | GeoSpecAxisExpectation
```

## API reference

To read any other signature, grep the skill directory for the name followed by `(` (or the bare type name): each hit is the declaration line and names its file; read a few lines around it for overloads and parameter notes. `api-index.md` lists all 370 symbols by file.

- `api-functions.md` — Functions
- `api-constants.md` — Constants
- `api-types.md` — Types
- `api-classes.md` — Classes

Read ranges, not whole files. Never copy a reference into a source file.
