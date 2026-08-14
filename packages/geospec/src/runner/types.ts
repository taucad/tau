import type { BuiltinModule, BundleResult, VmFileSystem, VmIssue } from '@taucad/vm';
import type { GeometryDiagnostic, Vec3 } from '#mesh/types.js';
import type { GeometrySelector } from '#selector/types.js';
import type { GeoSpecModelLoader } from '#model/index.js';
import type { GeoSpecRunProfile } from '#runner/profile.js';
import type { GeoSpecStepLoader } from '#step/index.js';

/**
 * Axis-keyed numeric expectation used by high-level geometry matchers.
 *
 * @public
 */
export type GeoSpecAxisExpectation = {
  x?: number;
  y?: number;
  z?: number;
};

/**
 * Bounding-box expectation accepted by `expectGeo(...).toHaveBoundingBox(...)`.
 *
 * @public
 */
export type GeoSpecBoundingBoxExpectation = {
  min?: Vec3 | GeoSpecAxisExpectation;
  max?: Vec3 | GeoSpecAxisExpectation;
  size?: GeoSpecAxisExpectation;
  center?: GeoSpecAxisExpectation;
  tolerance?: number;
};

/**
 * Connected-components expectation accepted by
 * `expectGeo(...).toHaveConnectedComponents(...)`.
 *
 * @public
 */
export type GeoSpecConnectedComponentsExpectation = {
  count: number;
  tolerance?: number;
  toleranceMm?: number;
};

/**
 * Component selector used by pair-filtered component-interference checks.
 *
 * @public
 */
export type GeoSpecComponentSelector = string | RegExp;

/**
 * A pair-specific component-interference check accepted by
 * `expectGeo(...).toHaveNoComponentInterference(...)`.
 *
 * @public
 */
export type GeoSpecComponentInterferencePairExpectation = {
  left: GeoSpecComponentSelector;
  right: GeoSpecComponentSelector;
};

/**
 * Intentional component interference allowance accepted by
 * `expectGeo(...).toHaveNoComponentInterference(...)`.
 *
 * @public
 */
export type GeoSpecComponentInterferenceAllowance = {
  kind: 'intentionalInterference';
  left: GeoSpecComponentSelector;
  right: GeoSpecComponentSelector;
  maxVolume?: number;
  reason: string;
};

/**
 * Component-interference expectation accepted by
 * `expectGeo(...).toHaveNoComponentInterference(...)`.
 *
 * GeoSpec checks for positive solid intersection volume between assembly
 * components. Tangent contact and correctly meshed gears are allowed.
 * `pairs` narrows the check to specific component-label pairs while preserving
 * exact positive-volume evidence for every selected pair. `allowances`
 * documents explicitly intentional positive-volume interference such as gasket
 * compression, press fits, or simplified thread engagement.
 *
 * @public
 */
export type GeoSpecComponentInterferenceExpectation = {
  tolerance?: number;
  pairs?: GeoSpecComponentInterferencePairExpectation[];
  allowances?: GeoSpecComponentInterferenceAllowance[];
};

/**
 * Shared scalar expectation used by geometry measurements.
 *
 * @public
 */
export type GeoSpecNumericExpectation =
  | number
  | {
      value?: number;
      greaterThan?: number;
      greaterThanOrEqual?: number;
      lessThan?: number;
      lessThanOrEqual?: number;
    };

/**
 * Point expectation accepted by center and feature matchers.
 *
 * @public
 */
export type GeoSpecPointExpectation = Vec3 | GeoSpecAxisExpectation;

/**
 * Surface-area expectation accepted by `expectGeo(...).toHaveSurfaceArea(...)`.
 *
 * @public
 */
export type GeoSpecSurfaceAreaExpectation = {
  value: number | GeoSpecNumericExpectation;
  tolerance?: number;
};

/**
 * Volume expectation accepted by `expectGeo(...).toHaveVolume(...)`.
 *
 * @public
 */
export type GeoSpecVolumeExpectation = {
  value: number | GeoSpecNumericExpectation;
  tolerance?: number;
};

/**
 * Mass expectation accepted by `expectGeo(...).toHaveMass(...)`.
 *
 * @public
 */
export type GeoSpecMassExpectation = {
  value: number | GeoSpecNumericExpectation;
  density?: number;
  tolerance?: number;
};

/**
 * Center-of-mass expectation accepted by
 * `expectGeo(...).toHaveCenterOfMass(...)`.
 *
 * @public
 */
export type GeoSpecCenterOfMassExpectation = {
  point: GeoSpecPointExpectation;
  tolerance?: number;
};

/**
 * Planar-face expectation accepted by `expectGeo(...).toHavePlanarFace(...)`.
 *
 * @public
 */
export type GeoSpecPlanarFaceExpectation = {
  normal: GeoSpecPointExpectation;
  offset: number;
  area?: GeoSpecNumericExpectation;
  tolerance?: number;
};

/**
 * Cylindrical-face expectation accepted by
 * `expectGeo(...).toHaveCylindricalFace(...)`.
 *
 * @public
 */
export type GeoSpecCylindricalFaceExpectation = {
  radius: number;
  axis: 'x' | 'y' | 'z';
  tolerance?: number;
};

/**
 * Circular-hole expectation accepted by `expectGeo(...).toHaveCircularHole(...)`.
 *
 * @public
 */
export type GeoSpecCircularHoleExpectation = {
  diameter: number;
  through?: boolean;
  axis?: 'x' | 'y' | 'z';
  center?: GeoSpecAxisExpectation;
  tolerance?: number;
};

/**
 * Chamfer-feature expectation accepted by
 * `expectGeo(...).toHaveChamferFeature(...)`.
 *
 * @public
 */
export type GeoSpecChamferFeatureExpectation = {
  distance: number;
  selection?: string;
  tolerance?: number;
};

/**
 * Minimum-wall-thickness expectation accepted by
 * `expectGeo(...).toHaveMinimumWallThickness(...)`.
 *
 * @public
 */
export type GeoSpecMinimumWallThicknessExpectation = {
  value: GeoSpecNumericExpectation;
  tolerance?: number;
};

/**
 * One void-continuity waypoint: an explicit subject-frame point known to lie
 * in the void, or an occurrence whose bounds centre is taken as the waypoint
 * (convenient for "this bore/cavity connects to that one" claims).
 *
 * @public
 */
export type GeoSpecVoidWaypoint = Vec3 | { occurrence: string };

/**
 * Void-continuity expectation accepted by
 * `expectGeo(...).toHaveVoidContinuity(...)`.
 *
 * A whole-assembly negative-space claim: the ordered `path` waypoints must all
 * lie in ONE connected open-void component (void = outside every `material`
 * solid), that component must not reach any `isolatedFrom` point, and its
 * tightest sampled cross-section must meet `minCrossSection`. Connectivity and
 * isolation are proven from Boolean shell topology, generalized winding-number
 * body identity, and deterministic cross-sections.
 *
 * @public
 */
export type GeoSpecVoidContinuityExpectation = {
  /** Ordered waypoints (>= 1) known to lie in the void being proven. */
  path: GeoSpecVoidWaypoint[];
  /**
   * Occurrence names whose solids bound the void. Defaults to every occurrence
   * in the subject (the whole-assembly negative space).
   */
  material?: string[];
  /** Minimum required bottleneck cross-section (mm²), sampled. */
  minCrossSection?: number;
  /** Points that must NOT be reachable from the path void (isolation claim). */
  isolatedFrom?: Vec3[];
  /**
   * Region bounded for the proof (subject frame). Defaults to the union
   * of the `material` occurrence bounds, which encloses every interior void.
   */
  bounds?: { min: Vec3; max: Vec3 };
};

/**
 * Topology-count expectation accepted by `expectGeo(...).toHaveTopologyCounts(...)`.
 *
 * @public
 */
export type GeoSpecTopologyCountsExpectation = {
  vertices?: GeoSpecNumericExpectation;
  edges?: GeoSpecNumericExpectation;
  wires?: GeoSpecNumericExpectation;
  faces?: GeoSpecNumericExpectation;
  shells?: GeoSpecNumericExpectation;
  solids?: GeoSpecNumericExpectation;
  compounds?: GeoSpecNumericExpectation;
  tolerance?: number;
};

/**
 * STEP unit expectation accepted by `expectGeo(...).toHaveStepUnits(...)`.
 *
 * @public
 */
export type GeoSpecStepUnitsExpectation = {
  unit: string;
};

/**
 * Product-structure expectation accepted by `expectGeo(...).toHaveProductStructure(...)`.
 *
 * @public
 */
export type GeoSpecProductStructureExpectation = {
  names?: string[];
  count?: GeoSpecNumericExpectation;
};

/**
 * Circular-hole-pattern expectation accepted by
 * `expectGeo(...).toHaveCircularHolePattern(...)`.
 *
 * @public
 */
export type GeoSpecCircularHolePatternExpectation = {
  count: number;
  holeDiameter: number;
  boltCircleDiameter?: number;
  axis?: 'x' | 'y' | 'z';
  center?: GeoSpecAxisExpectation;
  tolerance?: number;
};

/**
 * Fillet-feature expectation accepted by `expectGeo(...).toHaveFilletFeature(...)`.
 *
 * @public
 */
export type GeoSpecFilletFeatureExpectation = {
  radius: number;
  selection?: string;
  tolerance?: number;
};

/**
 * Geometry selector used by inspection and spatial relationship matchers.
 *
 * @public
 */
export type GeoSpecGeometrySelector =
  | GeoSpecComponentSelector
  | {
      kind: 'occurrence';
      /** Product or instance name to match (also matches the PRODUCT name shared by instanced parts). */
      name?: GeoSpecComponentSelector;
      /** Exact occurrence path — the per-instance identity when instances share one product. */
      path?: GeoSpecComponentSelector;
    }
  | {
      kind: 'axis';
      name?: GeoSpecComponentSelector;
      axis?: 'x' | 'y' | 'z';
      center?: Vec3;
      direction?: Vec3;
      radius?: number;
      tolerance?: number;
    }
  | {
      kind: 'plane';
      name?: GeoSpecComponentSelector;
      normal?: Vec3;
      offset?: number;
      tolerance?: number;
    }
  /**
   * SB3 V1 selector catalog kinds (body/face/datum/interface/group plus the
   * string shorthand), resolved by the `geospec/selector` engine. SB4 routes
   * relationship endpoints through that engine: the legacy explicit
   * axis/plane members above resolve as `stability: 'explicit'` fixtures
   * (rejected by the production evidence policy), while named legacy forms
   * become engine queries. The catalog's occurrence/axis/plane query forms
   * stay out of this union because their `kind` discriminants collide with
   * the legacy explicit members.
   */
  | Exclude<GeometrySelector, string | { kind: 'occurrence' | 'axis' | 'plane' }>;

/**
 * Assembly occurrence rule accepted by
 * `expectGeo(...).toHaveAssemblyOccurrences(...)`.
 *
 * @public
 */
export type GeoSpecAssemblyOccurrenceExpectation = {
  name: GeoSpecComponentSelector;
  count?: GeoSpecNumericExpectation;
  bounds?: {
    within?: GeoSpecComponentSelector;
    min?: Vec3 | GeoSpecAxisExpectation;
    max?: Vec3 | GeoSpecAxisExpectation;
    center?: GeoSpecPointExpectation;
    tolerance?: number;
  };
};

/**
 * Assembly occurrence expectation accepted by
 * `expectGeo(...).toHaveAssemblyOccurrences(...)`.
 *
 * @public
 */
export type GeoSpecAssemblyOccurrencesExpectation = {
  occurrences: GeoSpecAssemblyOccurrenceExpectation[];
  uniqueNames?: boolean;
};

/**
 * One spatial relationship accepted by
 * `expectGeo(...).toHaveSpatialRelationships(...)`.
 *
 * Verdicts are decided by exact BRep evidence only (D3): extrema for
 * `contact`/`clearance`, analytic fact comparison for
 * `coaxial`/`concentric`/`coplanar`/`parallel`/`perpendicular`/`angle`,
 * exact solid classification for `containment`/`insertion`, and exact
 * boolean common volume for `interference` (positive volume outside the
 * `minVolume`/`maxVolume` allowance band fails).
 *
 * @public
 */
export type GeoSpecSpatialRelationshipExpectation = {
  id?: string;
  kind:
    | 'contact'
    | 'clearance'
    | 'coaxial'
    | 'concentric'
    | 'coplanar'
    | 'parallel'
    | 'perpendicular'
    | 'angle'
    | 'containment'
    | 'insertion'
    | 'interference';
  subject: GeoSpecGeometrySelector;
  target: GeoSpecGeometrySelector;
  tolerance?: number;
  angularToleranceDegrees?: number;
  /** Expected angle in degrees for `kind: 'angle'` (orientation-insensitive). */
  angleDegrees?: number;
  /** Declared insertion axis (subject-frame direction) for `kind: 'insertion'`. */
  axis?: Vec3;
  min?: number;
  max?: number;
  minVolume?: number;
  maxVolume?: number;
  reason?: string;
};

/**
 * Spatial relationship expectation accepted by
 * `expectGeo(...).toHaveSpatialRelationships(...)`.
 *
 * @public
 */
export type GeoSpecSpatialRelationshipsExpectation = {
  relationships: GeoSpecSpatialRelationshipExpectation[];
};

/**
 * Mesh integrity expectation accepted by
 * `expectGeo(...).toHaveMeshIntegrity(...)`.
 *
 * @public
 */
export type GeoSpecMeshIntegrityExpectation = {
  finitePositions?: boolean;
  degenerateTriangles?: { count?: number; maxCount?: number; areaTolerance?: number };
  duplicateFaces?: { count?: number; maxCount?: number };
  watertight?: boolean;
  triangleCount?: GeoSpecNumericExpectation;
};

/**
 * Exact BRep validity expectation accepted by `expectGeo(...).toBeValidBrep(...)`.
 *
 * @public
 */
export type GeoSpecValidBrepExpectation = {
  maxTolerance?: number;
  freeBounds?: { count?: GeoSpecNumericExpectation };
  minEdgeLength?: number;
  sameParameter?: boolean;
  closedShells?: boolean;
  closedWires?: boolean;
};

/**
 * Assertion chain returned by `expectGeo(subject)`.
 *
 * @public
 */
export type GeoSpecMatcher = {
  /**
   * Assert axis-aligned bounds, size, or center for a loaded geometry subject.
   */
  toHaveBoundingBox(first: Vec3 | GeoSpecBoundingBoxExpectation, second?: Vec3): GeoSpecAssertion;
  /**
   * Assert how many spatially disjoint chunks the mesh contains.
   */
  toHaveConnectedComponents(expected: GeoSpecConnectedComponentsExpectation): GeoSpecAssertion;
  /**
   * Assert that each mesh surface is closed and manifold-like.
   */
  toBeWatertight(): GeoSpecAssertion;
  /**
   * Assert that separate assembly components do not occupy the same solid volume.
   */
  toHaveNoComponentInterference(expected?: GeoSpecComponentInterferenceExpectation): GeoSpecAssertion;
  /**
   * Assert that named assembly occurrences exist with expected counts and bounds.
   */
  toHaveAssemblyOccurrences(expected: GeoSpecAssemblyOccurrencesExpectation): GeoSpecAssertion;
  /**
   * Assert that selected entities satisfy declared spatial relationships.
   */
  toHaveSpatialRelationships(expected: GeoSpecSpatialRelationshipsExpectation): GeoSpecAssertion;
  /**
   * Assert rendered mesh evidence is internally trustworthy for downstream checks.
   */
  toHaveMeshIntegrity(expected: GeoSpecMeshIntegrityExpectation): GeoSpecAssertion;
  /**
   * Assert total surface area, preferring exact BRep mass properties when available.
   */
  toHaveSurfaceArea(expected: GeoSpecSurfaceAreaExpectation): GeoSpecAssertion;
  /**
   * Assert enclosed volume, preferring exact BRep mass properties when available.
   */
  toHaveVolume(expected: GeoSpecVolumeExpectation): GeoSpecAssertion;
  /**
   * Assert mass derived from exact mass properties or volume times density.
   */
  toHaveMass(expected: GeoSpecMassExpectation): GeoSpecAssertion;
  /**
   * Assert the center of mass or mesh-derived centroid for a closed subject.
   */
  toHaveCenterOfMass(expected: GeoSpecCenterOfMassExpectation): GeoSpecAssertion;
  /**
   * Assert that exact BRep evidence reports a valid shape.
   */
  toBeValidBrep(expected?: GeoSpecValidBrepExpectation): GeoSpecAssertion;
  /**
   * Assert exact BRep topology counts.
   */
  toHaveTopologyCounts(expected: GeoSpecTopologyCountsExpectation): GeoSpecAssertion;
  /**
   * Assert the STEP unit evidence.
   */
  toHaveStepUnits(expected: GeoSpecStepUnitsExpectation): GeoSpecAssertion;
  /**
   * Assert STEP product-structure evidence.
   */
  toHaveProductStructure(expected: GeoSpecProductStructureExpectation): GeoSpecAssertion;
  /**
   * Assert that BRep evidence contains a planar face matching the requested constraints.
   */
  toHavePlanarFace(expected: GeoSpecPlanarFaceExpectation): GeoSpecAssertion;
  /**
   * Assert that BRep evidence contains a cylindrical face with the requested radius and axis.
   */
  toHaveCylindricalFace(expected: GeoSpecCylindricalFaceExpectation): GeoSpecAssertion;
  /**
   * Assert that BRep evidence contains a circular hole matching diameter, center, and axis.
   */
  toHaveCircularHole(expected: GeoSpecCircularHoleExpectation): GeoSpecAssertion;
  /**
   * Assert that BRep evidence contains a repeated circular-hole pattern.
   */
  toHaveCircularHolePattern(expected: GeoSpecCircularHolePatternExpectation): GeoSpecAssertion;
  /**
   * Assert that BRep evidence contains a chamfer feature with the requested distance.
   */
  toHaveChamferFeature(expected: GeoSpecChamferFeatureExpectation): GeoSpecAssertion;
  /**
   * Assert that BRep evidence contains a fillet feature with the requested radius.
   */
  toHaveFilletFeature(expected: GeoSpecFilletFeatureExpectation): GeoSpecAssertion;
  /**
   * Assert that BRep evidence reports a minimum wall thickness satisfying the expectation.
   */
  toHaveMinimumWallThickness(expected: GeoSpecMinimumWallThicknessExpectation): GeoSpecAssertion;
  /**
   * Assert that the declared waypoints share one connected void, stay isolated
   * from the declared spaces, and hold the minimum cross-section.
   */
  toHaveVoidContinuity(expected: GeoSpecVoidContinuityExpectation): GeoSpecAssertion;
};

/**
 * Geometry assertion collected from a GeoSpec test module.
 *
 * @public
 */
export type GeoSpecAssertion = {
  /** Assertion kind. */
  kind:
    | 'boundingBox'
    | 'connectedComponents'
    | 'watertight'
    | 'componentInterference'
    | 'assemblyOccurrences'
    | 'spatialRelationships'
    | 'meshIntegrity'
    | 'surfaceArea'
    | 'volume'
    | 'mass'
    | 'centerOfMass'
    | 'validBrep'
    | 'topologyCounts'
    | 'stepUnits'
    | 'productStructure'
    | 'planarFace'
    | 'cylindricalFace'
    | 'circularHole'
    | 'circularHolePattern'
    | 'chamferFeature'
    | 'filletFeature'
    | 'minimumWallThickness'
    | 'voidContinuity';
  /** User-authored value passed to expectGeo(). */
  subject: unknown;
  /** Expected geometry condition. */
  expected: unknown;
  /** True when the assertion evaluated successfully. */
  passed?: boolean;
  /** Structured diagnostics from matcher evaluation. */
  diagnostics?: GeometryDiagnostic[];
  /** Wall-clock cost of matcher evaluation in milliseconds (R1: budgeted matchers only). */
  durationMs?: number;
};

/**
 * Test case status after runner collection.
 *
 * @public
 */
export type GeoSpecTestStatus = 'passed' | 'failed' | 'skipped';

/**
 * A collected GeoSpec test case.
 *
 * @public
 */
export type GeoSpecTestCase = {
  /** Hierarchical suite path. */
  suite: string[];
  /** Test case name. */
  name: string;
  /** Assertions produced by the test callback. */
  assertions: GeoSpecAssertion[];
  /** Final test status. */
  status: GeoSpecTestStatus;
  /** Structured diagnostics emitted by test execution. */
  diagnostics: GeometryDiagnostic[];
  /** Wall-clock cost of the test body plus its pending assertions, in milliseconds (R1). */
  durationMs?: number;
};

/**
 * Options for executing a GeoSpec ESM test module.
 *
 * @public
 */
export type RunGeoSpecModuleOptions = {
  /** Filesystem containing the test module and its project imports. */
  filesystem: VmFileSystem;
  /** Absolute ESM test entry path. */
  entryPath: string;
  /** JavaScript regular expression matched against full `suite > test` names. */
  testNamePattern?: string | RegExp;
  /** Timeout for async test callbacks, in milliseconds. */
  testTimeout?: number;
  /** Milliseconds. Non-verdict matcher infrastructure backstop. */
  matcherWallBackstop?: number;
  /** Emit structured forensic events for this run. */
  forensic?: boolean;
  /** Model loader exposed to VM tests through `geospec/model`. */
  modelLoader?: GeoSpecModelLoader;
  /** STEP loader exposed to VM tests through `geospec/step`. */
  stepLoader?: GeoSpecStepLoader;
  /** Additional in-memory modules made available to the VM. */
  builtinModules?: Record<string, BuiltinModule>;
  /** Internal profile counters used by opt-in benchmark tooling. */
  internalProfile?: GeoSpecRunProfile;
  /**
   * List-only collection pass (R3 shard splitting): execute the module to
   * REGISTER tests, skip every body, and return all registered tests as
   * `skipped` in registration order. Used by the pool to split heavy files
   * into per-test shards.
   */
  collectOnly?: boolean;
};

/**
 * Successful GeoSpec run result.
 *
 * @public
 */
export type GeoSpecRunSuccess = {
  success: true;
  /** True when every collected test passed or was skipped. */
  passed: boolean;
  tests: GeoSpecTestCase[];
  bundle: BundleResult;
};

/**
 * Failed GeoSpec run result.
 *
 * @public
 */
export type GeoSpecRunFailure = {
  success: false;
  issues: VmIssue[];
  bundle?: BundleResult;
};

/**
 * Result returned by {@link import('./run-geospec-module.js').runGeoSpecModule}.
 *
 * @public
 */
export type GeoSpecRunResult = GeoSpecRunSuccess | GeoSpecRunFailure;
