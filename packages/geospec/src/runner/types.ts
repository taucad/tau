import type { BuiltinModule, BundleResult, VmFileSystem, VmIssue } from '@taucad/vm';
import type { GeometryDiagnostic, Vec3 } from '#mesh/types.js';
import type { GeoSpecModelLoader } from '#model/index.js';
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
  evidence?: 'auto' | 'mesh' | 'brep';
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
 * Component-overlap expectation accepted by
 * `expectGeo(...).toHaveNoComponentOverlap(...)`.
 *
 * GeoSpec checks for positive solid intersection volume between assembly
 * components. Tangent contact and correctly meshed gears are allowed.
 *
 * @public
 */
export type GeoSpecComponentOverlapExpectation = {
  tolerance?: number;
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
  evidence?: 'auto' | 'mesh' | 'brep';
};

/**
 * Volume expectation accepted by `expectGeo(...).toHaveVolume(...)`.
 *
 * @public
 */
export type GeoSpecVolumeExpectation = {
  value: number | GeoSpecNumericExpectation;
  tolerance?: number;
  evidence?: 'auto' | 'mesh' | 'brep';
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
  evidence?: 'auto' | 'mesh' | 'brep';
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
  evidence?: 'auto' | 'mesh' | 'brep';
};

/**
 * Chamfer-distance expectation accepted by
 * `expectGeo(...).toHaveChamferDistanceTo(...)`.
 *
 * @public
 */
export type GeoSpecChamferDistanceExpectation = {
  min?: GeoSpecNumericExpectation;
  mean?: GeoSpecNumericExpectation;
  max?: GeoSpecNumericExpectation;
  p50?: GeoSpecNumericExpectation;
  p95?: GeoSpecNumericExpectation;
  p99?: GeoSpecNumericExpectation;
  rms?: GeoSpecNumericExpectation;
  samples?: number;
  seed?: number;
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
 * Minimum-distance expectation accepted by
 * `expectGeo(...).toHaveMinimumDistanceTo(...)`.
 *
 * @public
 */
export type GeoSpecMinimumDistanceExpectation = {
  value: GeoSpecNumericExpectation;
  samples?: number;
  seed?: number;
  tolerance?: number;
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
  toHaveNoComponentOverlap(expected?: GeoSpecComponentOverlapExpectation): GeoSpecAssertion;
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
   * Assert deterministic sampled distance between this subject and a reference.
   */
  toHaveChamferDistanceTo(reference: unknown, expected: GeoSpecChamferDistanceExpectation): GeoSpecAssertion;
  /**
   * Assert deterministic Hausdorff-style worst-case surface distance.
   */
  toHaveHausdorffDistanceTo(reference: unknown, expected: GeoSpecMinimumDistanceExpectation): GeoSpecAssertion;
  /**
   * Assert the minimum observed distance to a reference subject.
   */
  toHaveMinimumDistanceTo(reference: unknown, expected: GeoSpecMinimumDistanceExpectation): GeoSpecAssertion;
  /**
   * Assert that exact BRep evidence reports a valid shape.
   */
  toBeValidBrep(): GeoSpecAssertion;
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
    | 'componentOverlap'
    | 'surfaceArea'
    | 'volume'
    | 'mass'
    | 'centerOfMass'
    | 'chamferDistance'
    | 'hausdorffDistance'
    | 'minimumDistance'
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
    | 'minimumWallThickness';
  /** User-authored value passed to expectGeo(). */
  subject: unknown;
  /** Expected geometry condition. */
  expected: unknown;
  /** True when the assertion evaluated successfully. */
  passed?: boolean;
  /** Structured diagnostics from matcher evaluation. */
  diagnostics?: GeometryDiagnostic[];
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
};

/**
 * Options for executing a GeoSpec ESM test module.
 *
 * @public
 */
export type RunGeoSpecModuleOptions = {
  /** Filesystem containing the test module and its project imports. */
  filesystem: VmFileSystem;
  /** Absolute project root path. */
  projectPath: string;
  /** Absolute ESM test entry path. */
  entryPath: string;
  /** JavaScript regular expression matched against full `suite > test` names. */
  testNamePattern?: string | RegExp;
  /** Timeout for async test callbacks, in milliseconds. */
  testTimeout?: number;
  /** Model loader exposed to VM tests through `geospec/model`. */
  modelLoader?: GeoSpecModelLoader;
  /** STEP loader exposed to VM tests through `geospec/step`. */
  stepLoader?: GeoSpecStepLoader;
  /** Additional in-memory modules made available to the VM. */
  builtinModules?: Record<string, BuiltinModule>;
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
