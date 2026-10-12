# geospec — Types

104 top-level symbols. Signatures are verbatim typescript.

// Stateful GeoSpec API created by {@link createGeoSpec}
GeoSpec: {
    loadMesh(options: LoadMeshOptions): Promise<LoadMeshResult>;
    analyzeMesh(options: AnalyzeMeshOptions): Promise<AnalyzeMeshResult>;
}

  // GeoSpec.loadMesh (method)
  loadMesh(options: LoadMeshOptions): Promise<LoadMeshResult>;

  // GeoSpec.analyzeMesh (method)
  analyzeMesh(options: AnalyzeMeshOptions): Promise<AnalyzeMeshResult>;

// A model admitted by one live GeoSpec host scope
GeoSpecSubject: {
    readonly [subjectBrand]: true;
}

  readonly [subjectBrand]: true

// Geometry units accepted at GeoSpec evidence-loading boundaries
// Remarks: Loaded subjects normalize coordinates into canonical millimetres; this type describes source and provenance units, not a project-wide configuration.
GeoSpecUnit: 'mm' | 'cm' | 'm' | 'in' | 'ft' | (string & {})

// Geometry assertion collected from a GeoSpec test module
GeoSpecAssertion: {
    /** Assertion kind. */
    kind: 'boundingBox' | 'connectedComponents' | 'watertight' | 'componentInterference' | 'assemblyOccurrences' | 'spatialRelationships' | 'meshIntegrity' | 'noDiagnostics' | 'surfaceArea' | 'volume' | 'mass' | 'centerOfMass' | 'validBrep' | 'topologyCounts' | 'stepUnits' | 'productStructure' | 'planarFace' | 'cylindricalFace' | 'circularHole' | 'circularHolePattern' | 'chamferFeature' | 'filletFeature' | 'minimumWallThickness' | 'voidContinuity' | 'toSatisfyRationalPlate' | 'toSatisfyParallelPlaneDistance';
    /** User-authored value passed to expectGeo(). */
    subject: unknown;
    /** Expected geometry condition. */
    expected: unknown;
    /** True when the assertion evaluated successfully. */
    passed?: boolean;
    /** Structured diagnostics from matcher evaluation. */
    diagnostics?: GeometryDiagnostic[];
    /** Exact compiled assertion report, including core-owned bytes and polarity. */
    report?: GeoSpecCanonicalClaimReport;
    /** The host load which admitted this assertion's subject; independent of equal geometry hashes. */
    loadId?: string;
    /** Wall-clock cost of matcher evaluation in milliseconds (R1: budgeted matchers only). */
    durationMs?: number;
}

  // Assertion kind
  kind: 'boundingBox' | 'connectedComponents' | 'watertight' | 'componentInterference' | 'assemblyOccurrences' | 'spatialRelationships' | 'meshIntegrity' | 'noDiagnostics' | 'surfaceArea' | 'volume' | 'mass' | 'centerOfMass' | 'validBrep' | 'topologyCounts' | 'stepUnits' | 'productStructure' | 'planarFace' | 'cylindricalFace' | 'circularHole' | 'circularHolePattern' | 'chamferFeature' | 'filletFeature' | 'minimumWallThickness' | 'voidContinuity' | 'toSatisfyRationalPlate' | 'toSatisfyParallelPlaneDistance'

  // User-authored value passed to expectGeo()
  subject: unknown

  // Expected geometry condition
  expected: unknown

  // True when the assertion evaluated successfully
  passed?: boolean

  // Structured diagnostics from matcher evaluation
  diagnostics?: GeometryDiagnostic[]

  // Exact compiled assertion report, including core-owned bytes and polarity
  report?: GeoSpecCanonicalClaimReport

  // The host load which admitted this assertion's subject
  loadId?: string

  // Wall-clock cost of matcher evaluation in milliseconds (R1
  durationMs?: number

// Assembly occurrence rule accepted by `expectGeo(...).toHaveAssemblyOccurrences(...)`
GeoSpecAssemblyOccurrenceExpectation: {
    name: GeoSpecComponentSelector;
    count?: GeoSpecNumericExpectation;
    bounds?: {
        within?: GeoSpecComponentSelector;
        min?: Vec3 | GeoSpecAxisExpectation;
        max?: Vec3 | GeoSpecAxisExpectation;
        center?: GeoSpecPointExpectation;
        tolerance?: number;
    };
}

  name: GeoSpecComponentSelector

  count?: GeoSpecNumericExpectation

  bounds?: {
          within?: GeoSpecComponentSelector;
          min?: Vec3 | GeoSpecAxisExpectation;
          max?: Vec3 | GeoSpecAxisExpectation;
          center?: GeoSpecPointExpectation;
          tolerance?: number;
      }

// Assembly occurrence expectation accepted by `expectGeo(...).toHaveAssemblyOccurrences(...)`
GeoSpecAssemblyOccurrencesExpectation: {
    occurrences: GeoSpecAssemblyOccurrenceExpectation[];
    uniqueNames?: boolean;
}

  occurrences: GeoSpecAssemblyOccurrenceExpectation[]

  uniqueNames?: boolean

// Axis-keyed numeric expectation used by high-level geometry matchers
GeoSpecAxisExpectation: {
    x?: number;
    y?: number;
    z?: number;
}

  x?: number

  y?: number

  z?: number

// Bounding-box expectation accepted by `expectGeo(...).toHaveBoundingBox(...)`
GeoSpecBoundingBoxExpectation: {
    min?: Vec3 | Partial<Record<keyof GeoSpecAxisExpectation, GeoSpecNumericExpectation>>;
    max?: Vec3 | Partial<Record<keyof GeoSpecAxisExpectation, GeoSpecNumericExpectation>>;
    size?: Vec3 | Partial<Record<keyof GeoSpecAxisExpectation, GeoSpecNumericExpectation>>;
    center?: Vec3 | Partial<Record<keyof GeoSpecAxisExpectation, GeoSpecNumericExpectation>>;
    tolerance?: number;
}

  min?: Vec3 | Partial<Record<keyof GeoSpecAxisExpectation, GeoSpecNumericExpectation>>

  max?: Vec3 | Partial<Record<keyof GeoSpecAxisExpectation, GeoSpecNumericExpectation>>

  size?: Vec3 | Partial<Record<keyof GeoSpecAxisExpectation, GeoSpecNumericExpectation>>

  center?: Vec3 | Partial<Record<keyof GeoSpecAxisExpectation, GeoSpecNumericExpectation>>

  tolerance?: number

// Center-of-mass expectation accepted by `expectGeo(...).toHaveCenterOfMass(...)`
GeoSpecCenterOfMassExpectation: {
    point: GeoSpecPointExpectation;
    tolerance?: number;
}

  point: GeoSpecPointExpectation

  tolerance?: number

// Chamfer-feature expectation accepted by `expectGeo(...).toHaveChamferFeature(...)`
GeoSpecChamferFeatureExpectation: {
    distance: number;
    selection?: string;
    tolerance?: number;
}

  distance: number

  selection?: string

  tolerance?: number

// Circular-hole expectation accepted by `expectGeo(...).toHaveCircularHole(...)`
GeoSpecCircularHoleExpectation: {
    diameter: number;
    through?: boolean;
    axis?: 'x' | 'y' | 'z';
    center?: GeoSpecPointExpectation;
    tolerance?: number;
}

  diameter: number

  through?: boolean

  axis?: 'x' | 'y' | 'z'

  center?: GeoSpecPointExpectation

  tolerance?: number

// Cylindrical-face expectation accepted by `expectGeo(...).toHaveCylindricalFace(...)`
GeoSpecCylindricalFaceExpectation: {
    radius: number;
    axis: 'x' | 'y' | 'z';
    tolerance?: number;
}

  radius: number

  axis: 'x' | 'y' | 'z'

  tolerance?: number

// Intentional component interference allowance accepted by `expectGeo(...).toHaveNoComponentInterference(...)`
GeoSpecComponentInterferenceAllowance: {
    kind?: 'intentionalInterference';
    left: GeoSpecComponentSelector;
    right: GeoSpecComponentSelector;
    maxVolume?: number;
    reason: string;
}

  kind?: 'intentionalInterference'

  left: GeoSpecComponentSelector

  right: GeoSpecComponentSelector

  maxVolume?: number

  reason: string

// Component-interference expectation accepted by `expectGeo(...).toHaveNoComponentInterference(...)`
// Remarks: GeoSpec checks for positive solid intersection volume between assembly components. Tangent contact and correctly meshed gears are allowed. `pairs` narrows the check to specific component-label pairs while preserving exact positive-volume evidence for every selected pair. `allowances` documents explicitly intentional positive-volume interference such as gasket compression, press fits, or simplified thread engagement.
GeoSpecComponentInterferenceExpectation: {
    tolerance?: number;
    pairs?: GeoSpecComponentInterferencePairExpectation[];
    allowances?: GeoSpecComponentInterferenceAllowance[];
}

  tolerance?: number

  pairs?: GeoSpecComponentInterferencePairExpectation[]

  allowances?: GeoSpecComponentInterferenceAllowance[]

// A pair-specific component-interference check accepted by `expectGeo(...).toHaveNoComponentInterference(...)`
GeoSpecComponentInterferencePairExpectation: {
    left: GeoSpecComponentSelector;
    right: GeoSpecComponentSelector;
}

  left: GeoSpecComponentSelector

  right: GeoSpecComponentSelector

// Connected-components expectation accepted by `expectGeo(...).toHaveConnectedComponents(...)`
GeoSpecConnectedComponentsExpectation: {
    count: number;
    tolerance?: number;
    toleranceMm?: number;
}

  count: number

  tolerance?: number

  toleranceMm?: number

// Geometry selector used by inspection and spatial relationship matchers
GeoSpecGeometrySelector: GeoSpecComponentSelector | {
    kind: 'occurrence';
    /** Product or instance name to match (also matches the PRODUCT name shared by instanced parts). */
    name?: GeoSpecComponentSelector;
    /** Exact occurrence path — the per-instance identity when instances share one product. */
    path?: GeoSpecComponentSelector;
} | {
    kind: 'axis';
    name?: GeoSpecComponentSelector;
    axis?: 'x' | 'y' | 'z';
    center?: Vec3;
    direction?: Vec3;
    radius?: number;
    tolerance?: number;
} | {
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
 | Exclude<GeometrySelector, string | {
    kind: 'occurrence' | 'axis' | 'plane';
}>

// Assertion chain returned by `expectGeo(subject)`
GeoSpecMatcher: {
    /** Core-owned negation; missing or refused evidence still fails. */
    readonly not: Omit<GeoSpecMatcher, 'not'>;
    /** Assert the fixed rational plate contract. */
    toSatisfyRationalPlate(): GeoSpecAssertion;
    /** Assert the fixed parallel-plane distance contract. */
    toSatisfyParallelPlaneDistance(): GeoSpecAssertion;
    /**
     * Assert axis-aligned bounds, size, or center for a loaded geometry subject.
     */
    toHaveBoundingBox(first: Vec3 | GeoSpecBoundingBoxExpectation, second?: Vec3): GeoSpecAssertion;
    /**
     * Assert how many spatially disjoint chunks the mesh contains.
     */
    toHaveConnectedComponents(expected: GeoSpecConnectedComponentsExpectation): GeoSpecAssertion;
    /**
     * Assert closed mesh edge incidence; this does not prove vertex-manifold
     * validity, embeddedness, a Boolean fuse, or material connectivity.
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
     * Assert that the subject carries no diagnostics at the rejected severities.
     */
    toHaveNoDiagnostics(expected?: GeoSpecNoDiagnosticsExpectation): GeoSpecAssertion;
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
}

  // Core-owned negation
  readonly not: Omit<GeoSpecMatcher, 'not'>

  // Assert the fixed rational plate contract
  // GeoSpecMatcher.toSatisfyRationalPlate (method)
  toSatisfyRationalPlate(): GeoSpecAssertion;

  // Assert the fixed parallel-plane distance contract
  // GeoSpecMatcher.toSatisfyParallelPlaneDistance (method)
  toSatisfyParallelPlaneDistance(): GeoSpecAssertion;

  // Assert axis-aligned bounds, size, or center for a loaded geometry subject
  // GeoSpecMatcher.toHaveBoundingBox (method)
  toHaveBoundingBox(first: Vec3 | GeoSpecBoundingBoxExpectation, second?: Vec3): GeoSpecAssertion;

  // Assert how many spatially disjoint chunks the mesh contains
  // GeoSpecMatcher.toHaveConnectedComponents (method)
  toHaveConnectedComponents(expected: GeoSpecConnectedComponentsExpectation): GeoSpecAssertion;

  // Assert closed mesh edge incidence
  // GeoSpecMatcher.toBeWatertight (method)
  toBeWatertight(): GeoSpecAssertion;

  // Assert that separate assembly components do not occupy the same solid volume
  // GeoSpecMatcher.toHaveNoComponentInterference (method)
  toHaveNoComponentInterference(expected?: GeoSpecComponentInterferenceExpectation): GeoSpecAssertion;

  // Assert that named assembly occurrences exist with expected counts and bounds
  // GeoSpecMatcher.toHaveAssemblyOccurrences (method)
  toHaveAssemblyOccurrences(expected: GeoSpecAssemblyOccurrencesExpectation): GeoSpecAssertion;

  // Assert that selected entities satisfy declared spatial relationships
  // GeoSpecMatcher.toHaveSpatialRelationships (method)
  toHaveSpatialRelationships(expected: GeoSpecSpatialRelationshipsExpectation): GeoSpecAssertion;

  // Assert rendered mesh evidence is internally trustworthy for downstream checks
  // GeoSpecMatcher.toHaveMeshIntegrity (method)
  toHaveMeshIntegrity(expected: GeoSpecMeshIntegrityExpectation): GeoSpecAssertion;

  // Assert that the subject carries no diagnostics at the rejected severities
  // GeoSpecMatcher.toHaveNoDiagnostics (method)
  toHaveNoDiagnostics(expected?: GeoSpecNoDiagnosticsExpectation): GeoSpecAssertion;

  // Assert total surface area, preferring exact BRep mass properties when available
  // GeoSpecMatcher.toHaveSurfaceArea (method)
  toHaveSurfaceArea(expected: GeoSpecSurfaceAreaExpectation): GeoSpecAssertion;

  // Assert enclosed volume, preferring exact BRep mass properties when available
  // GeoSpecMatcher.toHaveVolume (method)
  toHaveVolume(expected: GeoSpecVolumeExpectation): GeoSpecAssertion;

  // Assert mass derived from exact mass properties or volume times density
  // GeoSpecMatcher.toHaveMass (method)
  toHaveMass(expected: GeoSpecMassExpectation): GeoSpecAssertion;

  // Assert the center of mass or mesh-derived centroid for a closed subject
  // GeoSpecMatcher.toHaveCenterOfMass (method)
  toHaveCenterOfMass(expected: GeoSpecCenterOfMassExpectation): GeoSpecAssertion;

  // Assert that exact BRep evidence reports a valid shape
  // GeoSpecMatcher.toBeValidBrep (method)
  toBeValidBrep(expected?: GeoSpecValidBrepExpectation): GeoSpecAssertion;

  // Assert exact BRep topology counts
  // GeoSpecMatcher.toHaveTopologyCounts (method)
  toHaveTopologyCounts(expected: GeoSpecTopologyCountsExpectation): GeoSpecAssertion;

  // Assert the STEP unit evidence
  // GeoSpecMatcher.toHaveStepUnits (method)
  toHaveStepUnits(expected: GeoSpecStepUnitsExpectation): GeoSpecAssertion;

  // Assert STEP product-structure evidence
  // GeoSpecMatcher.toHaveProductStructure (method)
  toHaveProductStructure(expected: GeoSpecProductStructureExpectation): GeoSpecAssertion;

  // Assert that BRep evidence contains a planar face matching the requested constraints
  // GeoSpecMatcher.toHavePlanarFace (method)
  toHavePlanarFace(expected: GeoSpecPlanarFaceExpectation): GeoSpecAssertion;

  // Assert that BRep evidence contains a cylindrical face with the requested radius and axis
  // GeoSpecMatcher.toHaveCylindricalFace (method)
  toHaveCylindricalFace(expected: GeoSpecCylindricalFaceExpectation): GeoSpecAssertion;

  // Assert that BRep evidence contains a circular hole matching diameter, center, and axis
  // GeoSpecMatcher.toHaveCircularHole (method)
  toHaveCircularHole(expected: GeoSpecCircularHoleExpectation): GeoSpecAssertion;

  // Assert that BRep evidence contains a repeated circular-hole pattern
  // GeoSpecMatcher.toHaveCircularHolePattern (method)
  toHaveCircularHolePattern(expected: GeoSpecCircularHolePatternExpectation): GeoSpecAssertion;

  // Assert that BRep evidence contains a chamfer feature with the requested distance
  // GeoSpecMatcher.toHaveChamferFeature (method)
  toHaveChamferFeature(expected: GeoSpecChamferFeatureExpectation): GeoSpecAssertion;

  // Assert that BRep evidence contains a fillet feature with the requested radius
  // GeoSpecMatcher.toHaveFilletFeature (method)
  toHaveFilletFeature(expected: GeoSpecFilletFeatureExpectation): GeoSpecAssertion;

  // Assert that BRep evidence reports a minimum wall thickness satisfying the expectation
  // GeoSpecMatcher.toHaveMinimumWallThickness (method)
  toHaveMinimumWallThickness(expected: GeoSpecMinimumWallThicknessExpectation): GeoSpecAssertion;

  // Assert that the declared waypoints share one connected void, stay isolated from the declared spaces, and hold the minimum cross-section
  // GeoSpecMatcher.toHaveVoidContinuity (method)
  toHaveVoidContinuity(expected: GeoSpecVoidContinuityExpectation): GeoSpecAssertion;

// Mass expectation accepted by `expectGeo(...).toHaveMass(...)`
GeoSpecMassExpectation: {
    value: number | GeoSpecNumericExpectation;
    density?: number;
    tolerance?: number;
}

  value: number | GeoSpecNumericExpectation

  density?: number

  tolerance?: number

// Mesh integrity expectation accepted by `expectGeo(...).toHaveMeshIntegrity(...)`
GeoSpecMeshIntegrityExpectation: {
    finitePositions?: boolean;
    degenerateTriangles?: {
        count?: number;
        maxCount?: number;
        areaTolerance?: number;
    };
    duplicateFaces?: {
        count?: number;
        maxCount?: number;
    };
    watertight?: boolean;
    triangleCount?: GeoSpecNumericExpectation;
}

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

// Diagnostic severities rejected by `expectGeo(...).toHaveNoDiagnostics(...)`
// Remarks: Defaults to `error` and `warning` when omitted.
GeoSpecNoDiagnosticsExpectation: {
    severities?: Array<GeometryDiagnostic['severity']>;
}

  severities?: Array<GeometryDiagnostic['severity']>

// Minimum-wall-thickness expectation accepted by `expectGeo(...).toHaveMinimumWallThickness(...)`
GeoSpecMinimumWallThicknessExpectation: {
    value: GeoSpecNumericExpectation;
    tolerance?: number;
}

  value: GeoSpecNumericExpectation

  tolerance?: number

// Circular-hole-pattern expectation accepted by `expectGeo(...).toHaveCircularHolePattern(...)`
GeoSpecCircularHolePatternExpectation: {
    count: number;
    holeDiameter: number;
    boltCircleDiameter?: number;
    axis?: 'x' | 'y' | 'z';
    center?: GeoSpecPointExpectation;
    tolerance?: number;
}

  count: number

  holeDiameter: number

  boltCircleDiameter?: number

  axis?: 'x' | 'y' | 'z'

  center?: GeoSpecPointExpectation

  tolerance?: number

// Fillet-feature expectation accepted by `expectGeo(...).toHaveFilletFeature(...)`
GeoSpecFilletFeatureExpectation: {
    radius: number;
    selection?: string;
    tolerance?: number;
}

  radius: number

  selection?: string

  tolerance?: number

// Shared scalar expectation used by geometry measurements
GeoSpecNumericExpectation: number | {
    value?: number;
    greaterThan?: number;
    greaterThanOrEqual?: number;
    lessThan?: number;
    lessThanOrEqual?: number;
}

// Planar-face expectation accepted by `expectGeo(...).toHavePlanarFace(...)`
GeoSpecPlanarFaceExpectation: {
    normal: GeoSpecPointExpectation;
    offset: number;
    area?: GeoSpecNumericExpectation;
    tolerance?: number;
}

  normal: GeoSpecPointExpectation

  offset: number

  area?: GeoSpecNumericExpectation

  tolerance?: number

// Point expectation accepted by center and feature matchers
GeoSpecPointExpectation: Vec3 | GeoSpecAxisExpectation

// Product-structure expectation accepted by `expectGeo(...).toHaveProductStructure(...)`
GeoSpecProductStructureExpectation: {
    names?: string[];
    count?: GeoSpecNumericExpectation;
}

  names?: string[]

  count?: GeoSpecNumericExpectation

// One spatial relationship accepted by `expectGeo(...).toHaveSpatialRelationships(...)`
// Remarks: Verdicts are decided by exact BRep evidence only (D3): extrema for `contact`/`clearance`, analytic fact comparison for `coaxial`/`concentric`/`coplanar`/`parallel`/`perpendicular`/`angle`, exact solid classification for `containment`/`insertion`, and exact boolean common volume for `interference` (positive volume outside the `minVolume`/`maxVolume` allowance band fails).
GeoSpecSpatialRelationshipExpectation: {
    id?: string;
    kind: 'contact' | 'clearance' | 'coaxial' | 'concentric' | 'coplanar' | 'parallel' | 'perpendicular' | 'angle' | 'containment' | 'insertion' | 'interference';
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
}

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

// Spatial relationship expectation accepted by `expectGeo(...).toHaveSpatialRelationships(...)`
GeoSpecSpatialRelationshipsExpectation: {
    relationships: GeoSpecSpatialRelationshipExpectation[];
}

  relationships: GeoSpecSpatialRelationshipExpectation[]

// STEP unit expectation accepted by `expectGeo(...).toHaveStepUnits(...)`
GeoSpecStepUnitsExpectation: {
    unit: string;
}

  unit: string

// Surface-area expectation accepted by `expectGeo(...).toHaveSurfaceArea(...)`
GeoSpecSurfaceAreaExpectation: {
    value: number | GeoSpecNumericExpectation;
    tolerance?: number;
}

  value: number | GeoSpecNumericExpectation

  tolerance?: number

// Topology-count expectation accepted by `expectGeo(...).toHaveTopologyCounts(...)`
GeoSpecTopologyCountsExpectation: {
    vertices?: GeoSpecNumericExpectation;
    edges?: GeoSpecNumericExpectation;
    wires?: GeoSpecNumericExpectation;
    faces?: GeoSpecNumericExpectation;
    shells?: GeoSpecNumericExpectation;
    solids?: GeoSpecNumericExpectation;
    compounds?: GeoSpecNumericExpectation;
    tolerance?: number;
}

  vertices?: GeoSpecNumericExpectation

  edges?: GeoSpecNumericExpectation

  wires?: GeoSpecNumericExpectation

  faces?: GeoSpecNumericExpectation

  shells?: GeoSpecNumericExpectation

  solids?: GeoSpecNumericExpectation

  compounds?: GeoSpecNumericExpectation

  tolerance?: number

// Exact BRep validity expectation accepted by `expectGeo(...).toBeValidBrep(...)`
GeoSpecValidBrepExpectation: {
    maxTolerance?: number;
    freeBounds?: {
        count?: GeoSpecNumericExpectation;
    };
    minEdgeLength?: number;
    sameParameter?: boolean;
    closedShells?: boolean;
    closedWires?: boolean;
}

  maxTolerance?: number

  freeBounds?: {
          count?: GeoSpecNumericExpectation;
      }

  minEdgeLength?: number

  sameParameter?: boolean

  closedShells?: boolean

  closedWires?: boolean

// Void-continuity expectation accepted by `expectGeo(...).toHaveVoidContinuity(...)`
// Remarks: A whole-assembly negative-space claim: the ordered `path` waypoints must all lie in ONE connected open-void component (void = outside every `material` solid), that component must not reach any `isolatedFrom` point, and its tightest sampled cross-section must meet `minCrossSection`. Connectivity and isolation are proven from Boolean shell topology, generalized winding-number body identity, and deterministic cross-sections.
GeoSpecVoidContinuityExpectation: {
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
    bounds?: {
        min: Vec3;
        max: Vec3;
    };
}

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

// One void-continuity waypoint
GeoSpecVoidWaypoint: Vec3 | {
    occurrence: string;
}

// Volume expectation accepted by `expectGeo(...).toHaveVolume(...)`
GeoSpecVolumeExpectation: {
    value: number | GeoSpecNumericExpectation;
    tolerance?: number;
}

  value: number | GeoSpecNumericExpectation

  tolerance?: number

// Basic exact or topology-derived BRep evidence consumed by early feature matchers
BrepEvidence: {
    validity?: {
        valid: boolean;
        checks?: Array<{
            shape: string;
            status: string;
        }>;
        maxTolerance?: number;
        freeBounds?: {
            count: number;
        };
        smallEdges?: Array<{
            length: number;
            shape?: string;
            location?: Vec3;
        }>;
        sameParameter?: boolean;
        closedShells?: boolean;
        closedSolids?: boolean;
        solidCount?: number;
        invalidSolidCount?: number;
        openEdgeCount?: number;
        reason?: string;
        closedWires?: boolean;
    };
    topologyCounts?: {
        vertices?: number;
        edges?: number;
        wires?: number;
        faces?: number;
        shells?: number;
        solids?: number;
        compounds?: number;
    };
    boundingBox?: {
        min: Vec3;
        max: Vec3;
        size: Vec3;
        center: Vec3;
    };
    massProperties?: {
        surfaceArea?: number;
        volume?: number;
        centerOfMass?: Vec3;
        mass?: number;
    };
    planarFaces?: Array<{
        normal: Vec3;
        offset: number;
        area?: number;
        center?: Vec3;
    }>;
    cylindricalFaces?: Array<{
        radius: number;
        axis: 'x' | 'y' | 'z';
        center?: Vec3;
        axisRange?: {
            min: number;
            max: number;
        };
    }>;
    circularHoles?: Array<{
        diameter: number;
        through: boolean;
        axis: 'x' | 'y' | 'z';
        center?: Vec3;
        axisRange?: {
            min: number;
            max: number;
        };
    }>;
    circularHolePatterns?: Array<{
        count: number;
        holeDiameter: number;
        boltCircleDiameter: number;
        axis: 'x' | 'y' | 'z';
        center?: Vec3;
    }>;
    chamferFeatures?: Array<{
        distance: number;
        selection?: string;
    }>;
    filletFeatures?: Array<{
        radius: number;
        selection?: string;
    }>;
    minimumWallThickness?: {
        value: number;
        location?: Vec3;
        pointA?: Vec3;
        pointB?: Vec3;
        solidIndex?: number;
        tieCount?: number;
        algorithm?: string;
        tolerance?: number;
        supportA?: {
            faceIndex?: number;
            surfaceType?: string;
            supportType?: string;
        };
        supportB?: {
            faceIndex?: number;
            surfaceType?: string;
            supportType?: string;
        };
        rejections?: Record<string, number>;
    };
}

  validity?: {
          valid: boolean;
          checks?: Array<{
              shape: string;
              status: string;
          }>;
          maxTolerance?: number;
          freeBounds?: {
              count: number;
          };
          smallEdges?: Array<{
              length: number;
              shape?: string;
              location?: Vec3;
          }>;
          sameParameter?: boolean;
          closedShells?: boolean;
          closedSolids?: boolean;
          solidCount?: number;
          invalidSolidCount?: number;
          openEdgeCount?: number;
          reason?: string;
          closedWires?: boolean;
      }

  topologyCounts?: {
          vertices?: number;
          edges?: number;
          wires?: number;
          faces?: number;
          shells?: number;
          solids?: number;
          compounds?: number;
      }

  boundingBox?: {
          min: Vec3;
          max: Vec3;
          size: Vec3;
          center: Vec3;
      }

  massProperties?: {
          surfaceArea?: number;
          volume?: number;
          centerOfMass?: Vec3;
          mass?: number;
      }

  planarFaces?: Array<{
          normal: Vec3;
          offset: number;
          area?: number;
          center?: Vec3;
      }>

  cylindricalFaces?: Array<{
          radius: number;
          axis: 'x' | 'y' | 'z';
          center?: Vec3;
          axisRange?: {
              min: number;
              max: number;
          };
      }>

  circularHoles?: Array<{
          diameter: number;
          through: boolean;
          axis: 'x' | 'y' | 'z';
          center?: Vec3;
          axisRange?: {
              min: number;
              max: number;
          };
      }>

  circularHolePatterns?: Array<{
          count: number;
          holeDiameter: number;
          boltCircleDiameter: number;
          axis: 'x' | 'y' | 'z';
          center?: Vec3;
      }>

  chamferFeatures?: Array<{
          distance: number;
          selection?: string;
      }>

  filletFeatures?: Array<{
          radius: number;
          selection?: string;
      }>

  minimumWallThickness?: {
          value: number;
          location?: Vec3;
          pointA?: Vec3;
          pointB?: Vec3;
          solidIndex?: number;
          tieCount?: number;
          algorithm?: string;
          tolerance?: number;
          supportA?: {
              faceIndex?: number;
              surfaceType?: string;
              supportType?: string;
          };
          supportB?: {
              faceIndex?: number;
              surfaceType?: string;
              supportType?: string;
          };
          rejections?: Record<string, number>;
      }

// Geometry file formats understood by GeoSpec provenance
GeometryFileFormat: MeshFileFormat | 'step' | 'stp'

// Capability exposed by a loaded subject
GeometryCapability: {
    kind: 'mesh';
    feature: 'triangles' | 'bounding-box' | 'connected-components' | 'watertightness' | 'surface-area' | 'volume' | 'center-of-mass' | 'distance' | 'component-overlap';
} | {
    kind: 'brep';
    feature: 'validity' | 'topology-counts' | 'bounding-box' | 'mass-properties' | 'planar-faces' | 'cylindrical-faces' | 'circular-holes' | 'circular-hole-patterns' | 'chamfer-features' | 'fillet-features' | 'wall-thickness';
} | {
    kind: 'step';
    feature: 'schema' | 'units' | 'product-structure' | 'reader-provenance';
} | {
    kind: 'unsupported';
    feature: string;
    reason: string;
}

  kind: 'mesh'

  feature: 'triangles' | 'bounding-box' | 'connected-components' | 'watertightness' | 'surface-area' | 'volume' | 'center-of-mass' | 'distance' | 'component-overlap'

// Diagnostic emitted by GeoSpec loaders, analyzers, and matchers
GeometryDiagnostic: {
    code: KernelIssueCode | (string & {});
    severity: 'error' | 'warning' | 'info';
    message: string;
    suggestion?: string;
    spatial?: {
        min?: Vec3;
        max?: Vec3;
        center?: Vec3;
    };
    details?: unknown;
}

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

// Provenance recorded by GeoSpec loaders
GeometryProvenance: {
    source: GeometrySource;
    unit: GeoSpecUnit;
    loader: 'gltf-transform' | 'in-memory' | 'opencascade-step';
    contentHash?: string;
    parameters?: Record<string, JSONValue>;
    exportIntent?: GeometryExportIntent;
}

  source: GeometrySource

  unit: GeoSpecUnit

  loader: 'gltf-transform' | 'in-memory' | 'opencascade-step'

  contentHash?: string

  parameters?: Record<string, JSONValue>

  exportIntent?: GeometryExportIntent

// Source metadata for a loaded geometry subject
GeometrySource: {
    kind: 'bytes' | 'array-buffer' | 'blob' | 'file' | 'path' | 'url' | 'mesh-buffer' | 'readable-stream' | 'async-iterable';
    format: GeometryFileFormat;
    path?: string;
    name?: string;
    byteLength?: number;
}

  kind: 'bytes' | 'array-buffer' | 'blob' | 'file' | 'path' | 'url' | 'mesh-buffer' | 'readable-stream' | 'async-iterable'

  format: GeometryFileFormat

  path?: string

  name?: string

  byteLength?: number

// Canonical P0 object under test for GeoSpec
// Remarks: This is intentionally a GeoSpec-loaded subject rather than a Tau runtime contract. Runtime integrations pass GLB/glTF bytes or files into loaders.
GeometrySubject: {
    kind: 'geometry-subject';
    /** Opaque engine-owned identifier used by every protocol claim. */
    subjectId: string;
    mesh: GeometrySubjectMeshEvidence;
    brep?: BrepEvidence;
    step?: StepEvidence;
    provenance: GeometryProvenance;
    capabilities: GeometryCapability[];
    diagnostics: GeometryEvidenceDiagnostic[];
}

  kind: 'geometry-subject'

  // Opaque engine-owned identifier used by every protocol claim
  subjectId: string

  mesh: GeometrySubjectMeshEvidence

  brep?: BrepEvidence

  step?: StepEvidence

  provenance: GeometryProvenance

  capabilities: GeometryCapability[]

  diagnostics: GeometryEvidenceDiagnostic[]

// Wire-safe mesh summary carried by an opaque geometry subject
GeometrySubjectMeshEvidence: {
    format: MeshFileFormat;
    stats: Pick<GeometryStats, 'vertexCount' | 'meshCount' | 'triangleCount'>;
}

  format: MeshFileFormat

  stats: Pick<GeometryStats, 'vertexCount' | 'meshCount' | 'triangleCount'>

// Mesh evidence loaded from geometry bytes or buffers
MeshEvidence: {
    format: MeshFileFormat;
    stats: GeometryStats;
}

  format: MeshFileFormat

  stats: GeometryStats

// Geometry file formats supported by the P0 mesh loader
MeshFileFormat: 'glb' | 'gltf' | 'mesh-buffer'

// Triangle quality and scalar mesh metrics used by P0 GeoSpec matchers
// Remarks: Values are reported in the glTF document coordinate units.
MeshQualityStats: {
    triangleCount: number;
    nonFiniteVertices: Array<{
        primitive: string;
        vertexIndex: number;
        position: [number, number, number];
    }>;
    degenerateTriangles: Array<{
        primitive: string;
        triangleIndex: number;
        area: number;
        center: [number, number, number];
    }>;
    duplicateFaces: Array<{
        primitive: string;
        triangleIndex: number;
        firstTriangleIndex: number;
    }>;
    triangles: MeshTriangle[];
    surfaceArea: number;
    signedVolume: number;
    centerOfMass?: Vec3;
}

  triangleCount: number

  nonFiniteVertices: Array<{
          primitive: string;
          vertexIndex: number;
          position: [number, number, number];
      }>

  degenerateTriangles: Array<{
          primitive: string;
          triangleIndex: number;
          area: number;
          center: [number, number, number];
      }>

  duplicateFaces: Array<{
          primitive: string;
          triangleIndex: number;
          firstTriangleIndex: number;
      }>

  triangles: MeshTriangle[]

  surfaceArea: number

  signedVolume: number

  centerOfMass?: Vec3

// One triangle from mesh evidence, in geometry document coordinates
MeshTriangle: {
    primitive: string;
    triangleIndex: number;
    a: [number, number, number];
    b: [number, number, number];
    c: [number, number, number];
    center: [number, number, number];
    area: number;
}

  primitive: string

  triangleIndex: number

  a: [number, number, number]

  b: [number, number, number]

  c: [number, number, number]

  center: [number, number, number]

  area: number

// STEP/XDE evidence extracted while loading a STEP subject
StepEvidence: {
    schema?: string;
    unit?: GeoSpecUnit;
    productStructure?: Array<{
        name: string;
        path: string;
        transform?: number[];
    }>;
    readStrategy: {
        strategy: 'native-stream' | 'filesystem';
        inputKind: GeometrySource['kind'];
        bytesRead: number;
        nativeReadStream: boolean;
        copiedToEmscriptenFs: boolean;
    };
    capabilities: Array<{
        feature: string;
        supported: boolean;
        reason?: string;
    }>;
    /** Structured AP242 XDE read result (occurrences, subshape names, datum placements). */
    xde?: XdeReadResult;
}

  schema?: string

  unit?: GeoSpecUnit

  productStructure?: Array<{
          name: string;
          path: string;
          transform?: number[];
      }>

  readStrategy: {
          strategy: 'native-stream' | 'filesystem';
          inputKind: GeometrySource['kind'];
          bytesRead: number;
          nativeReadStream: boolean;
          copiedToEmscriptenFs: boolean;
      }

  capabilities: Array<{
          feature: string;
          supported: boolean;
          reason?: string;
      }>

  // Structured AP242 XDE read result (occurrences, subshape names, datum placements)
  xde?: XdeReadResult

// Numeric 3D vector
Vec3: readonly [number, number, number]

// Analyze source bytes or an already retained subject, never both
AnalyzeMeshOptions: (LoadMeshOptions & {
    subject?: never;
}) | ({
    subject: GeometrySubject;
} & {
    [Key in keyof LoadMeshOptions]?: never;
})

  source: MeshSource

  format?: MeshFileFormat

  path?: string

  name?: string

  // Unit exposed by the returned GeoSpec subject
  unit?: GeoSpecUnit

  // Coordinate unit of the supplied mesh data before normalization
  sourceUnit?: GeoSpecUnit

  parameters?: Record<string, unknown>

  subject?: never

// Mesh analysis result
AnalyzeMeshResult: {
    success: true;
    stats: GeometryStats;
    subject: GeometrySubject;
} | LoadMeshFailure

  success: true

// Options for loading mesh evidence
LoadMeshOptions: {
    source: MeshSource;
    format?: MeshFileFormat;
    path?: string;
    name?: string;
    /**
     * Unit exposed by the returned GeoSpec subject. Direct GLB/glTF loading
     * defaults to raw glTF metres; in-memory mesh buffers default to millimetres.
     */
    unit?: GeoSpecUnit;
    /**
     * Coordinate unit of the supplied mesh data before normalization. Direct
     * GLB/glTF files default to their raw document units; runtime-backed
     * `loadModel` calls pass the unit honored by the selected export route.
     */
    sourceUnit?: GeoSpecUnit;
    parameters?: Record<string, unknown>;
}

  source: MeshSource

  format?: MeshFileFormat

  path?: string

  name?: string

  // Unit exposed by the returned GeoSpec subject
  unit?: GeoSpecUnit

  // Coordinate unit of the supplied mesh data before normalization
  sourceUnit?: GeoSpecUnit

  parameters?: Record<string, unknown>

// Result of loading mesh evidence into a GeoSpec geometry subject
LoadMeshResult: LoadMeshSuccess | LoadMeshFailure

  success: false

// Numeric 3D vector
GeoSpecVec3: readonly [number, number, number]

// Options for BRep evidence analysis
AnalyzeBrepOptions: {
    subject: GeometrySubject;
}

  subject: GeometrySubject

// Typed result returned by {@link analyzeBrep}
AnalyzeBrepResult: {
    success: true;
    brep: BrepEvidence;
    diagnostics: GeometryDiagnostic[];
} | {
    success: false;
    diagnostics: GeometryDiagnostic[];
}

  success: true

  diagnostics: GeometryDiagnostic[]

// One matcher's contract entry
GeoSpecMatcherDescriptor: {
    readonly kind: GeoSpecAssertion['kind'];
    readonly expected: GeoSpecMatcherExpectedShape;
    readonly mode: GeoSpecMatcherMode;
}

  readonly kind: GeoSpecAssertion['kind']

  readonly expected: GeoSpecMatcherExpectedShape

  readonly mode: GeoSpecMatcherMode

// How the substrate derives an assertion's recorded `expected` value from the arguments the spec author passed
// Remarks: - `first` — the first argument verbatim. - `first-or-empty` — the first argument, defaulting to `{}`. - `bounds` — `(min, max)` pairs collapse to `{ min, max }`; a lone object argument passes through. - `true` — nullary matchers record the literal `true`.
GeoSpecMatcherExpectedShape: 'first' | 'first-or-empty' | 'bounds' | 'true'

// Whether a matcher settles synchronously (throwing its `GeoSpecAssertionError` inside the `it()` body) or asynchronously (settled before the test completes)
GeoSpecMatcherMode: 'sync' | 'async'

// Every matcher name exposed by `expectGeo(...)`
GeoSpecMatcherName: Exclude<keyof GeoSpecMatcher, 'not'>

// Per-request or per-claim cancellation
GeoSpecCancelRequest: {
    readonly requestId: GeoSpecRequestId;
    readonly claimId?: GeoSpecClaimId;
}

  readonly requestId: GeoSpecRequestId

  readonly claimId?: GeoSpecClaimId

// Idempotent cancellation acknowledgement
GeoSpecCancelResult: {
    readonly requestId: GeoSpecRequestId;
    readonly cancelled: boolean;
}

  readonly requestId: GeoSpecRequestId

  readonly cancelled: boolean

// Canonical JSON payload encoded into one claim byte lane
GeoSpecClaim: {
    readonly claimId: GeoSpecClaimId;
    readonly capability: string;
    readonly subjectIds: readonly GeoSpecSubjectId[];
    readonly payload: JSONValue;
    readonly workUnitBudget: number;
}

  readonly claimId: GeoSpecClaimId

  readonly capability: string

  readonly subjectIds: readonly GeoSpecSubjectId[]

  readonly payload: JSONValue

  readonly workUnitBudget: number

// Opaque claim identifier
GeoSpecClaimId: string

// One serializable claim result
GeoSpecClaimResult: {
    readonly claimId: GeoSpecClaimId;
    readonly status: 'passed' | 'failed' | 'refused' | 'cancelled';
    readonly diagnostics: readonly JSONValue[];
    readonly evidence?: JSONValue;
    readonly provenance: JSONValue;
}

  readonly claimId: GeoSpecClaimId

  readonly status: 'passed' | 'failed' | 'refused' | 'cancelled'

  readonly diagnostics: readonly JSONValue[]

  readonly evidence?: JSONValue

  readonly provenance: JSONValue

// Determinism class negotiated during initialization (DL6)
GeoSpecDeterminismClass: 'reference-wasm' | 'bit-parity-verified' | 'defers-to-reference'

// First TypeScript binding of Contract B
// Remarks: The methods are transport operations; every data type they exchange is a protocol DTO above. `Uint8Array` is the one ratified bulk lane.
GeoSpecEngineProtocol: {
    initialize(request: GeoSpecInitializeRequest): GeoSpecInitializeResult;
    ingestSubject(request: GeoSpecIngestSubjectRequest, bytes: Uint8Array<ArrayBuffer>): Promise<GeoSpecIngestSubjectResult>;
    submitClaims(request: GeoSpecSubmitClaimsRequest): GeoSpecSubmitClaimsResult | Promise<GeoSpecSubmitClaimsResult>;
    cancel(request: GeoSpecCancelRequest): GeoSpecCancelResult;
    releaseSubject(request: GeoSpecReleaseSubjectRequest): GeoSpecReleaseSubjectResult;
    on<Kind extends GeoSpecProtocolEvent['kind']>(event: Kind, handler: (event: Extract<GeoSpecProtocolEvent, {
        kind: Kind;
    }>) => void): () => void;
}

  // GeoSpecEngineProtocol.initialize (method)
  initialize(request: GeoSpecInitializeRequest): GeoSpecInitializeResult;

  // GeoSpecEngineProtocol.ingestSubject (method)
  ingestSubject(request: GeoSpecIngestSubjectRequest, bytes: Uint8Array<ArrayBuffer>): Promise<GeoSpecIngestSubjectResult>;

  // GeoSpecEngineProtocol.submitClaims (method)
  submitClaims(request: GeoSpecSubmitClaimsRequest): GeoSpecSubmitClaimsResult | Promise<GeoSpecSubmitClaimsResult>;

  // GeoSpecEngineProtocol.cancel (method)
  cancel(request: GeoSpecCancelRequest): GeoSpecCancelResult;

  // GeoSpecEngineProtocol.releaseSubject (method)
  releaseSubject(request: GeoSpecReleaseSubjectRequest): GeoSpecReleaseSubjectResult;

  // GeoSpecEngineProtocol.on (method)
  on<Kind extends GeoSpecProtocolEvent['kind']>(event: Kind, handler: (event: Extract<GeoSpecProtocolEvent, {
          kind: Kind;
      }>) => void): () => void;

// Resolved operational controls carried outside canonical claim bytes
GeoSpecExecutionOptions: {
    readonly forensic: boolean;
    readonly matcherWallBackstop: number;
}

  readonly forensic: boolean

  readonly matcherWallBackstop: number

// Metadata lane for subject ingestion
GeoSpecIngestSubjectRequest: {
    readonly requestId: GeoSpecRequestId;
    readonly contentHash: string;
    readonly format: 'glb' | 'gltf' | 'step' | 'stp';
    readonly frame: GeoSpecSubjectFrame;
    readonly provenance: JSONValue;
    readonly options: JSONValue;
}

  readonly requestId: GeoSpecRequestId

  readonly contentHash: string

  readonly format: 'glb' | 'gltf' | 'step' | 'stp'

  readonly frame: GeoSpecSubjectFrame

  readonly provenance: JSONValue

  readonly options: JSONValue

// Subject-ingestion response
GeoSpecIngestSubjectResult: {
    readonly requestId: GeoSpecRequestId;
    readonly subject: GeoSpecSubjectReference;
}

  readonly requestId: GeoSpecRequestId

  readonly subject: GeoSpecSubjectReference

// Client half of the Contract-B initialization handshake
GeoSpecInitializeRequest: {
    readonly protocolVersion: number;
    readonly client: {
        readonly name: string;
        readonly version: string;
    };
}

  readonly protocolVersion: number

  readonly client: {
          readonly name: string;
          readonly version: string;
      }

// Engine half of the Contract-B initialization handshake
GeoSpecInitializeResult: {
    readonly protocolVersion: number;
    readonly engine: {
        readonly name: string;
        readonly version: string;
    };
    readonly determinism: GeoSpecDeterminismClass;
    readonly capabilities: readonly GeoSpecProtocolCapability[];
    readonly provenance: GeoSpecProtocolProvenance;
}

  readonly protocolVersion: number

  readonly engine: {
          readonly name: string;
          readonly version: string;
      }

  readonly determinism: GeoSpecDeterminismClass

  readonly capabilities: readonly GeoSpecProtocolCapability[]

  readonly provenance: GeoSpecProtocolProvenance

// One capability honestly advertised by an engine build
GeoSpecProtocolCapability: {
    readonly name: string;
    readonly registryVersion: number;
}

  readonly name: string

  readonly registryVersion: number

// Advisory event
GeoSpecProtocolEvent: {
    readonly requestId: GeoSpecRequestId;
    readonly kind: 'progress';
    readonly payload: JSONValue;
} | {
    readonly requestId: GeoSpecRequestId;
    readonly kind: 'forensic-span';
    readonly payload: JSONValue;
} | {
    readonly requestId: GeoSpecRequestId;
    readonly kind: 'cache';
    readonly payload: JSONValue;
}

  readonly requestId: GeoSpecRequestId

  readonly kind: 'progress'

  readonly payload: JSONValue

// Serializable build provenance returned by initialization
GeoSpecProtocolProvenance: {
    readonly engineDigest?: string;
    readonly build?: JSONValue;
    readonly license?: string;
}

  readonly engineDigest?: string

  readonly build?: JSONValue

  readonly license?: string

// Idempotent subject-release request
GeoSpecReleaseSubjectRequest: {
    readonly requestId: GeoSpecRequestId;
    readonly subjectId: GeoSpecSubjectId;
}

  readonly requestId: GeoSpecRequestId

  readonly subjectId: GeoSpecSubjectId

// Subject-release acknowledgement
GeoSpecReleaseSubjectResult: {
    readonly requestId: GeoSpecRequestId;
    readonly released: boolean;
}

  readonly requestId: GeoSpecRequestId

  readonly released: boolean

// Opaque request identifier
GeoSpecRequestId: string

// Canonical frame attached to bytes entering the engine
GeoSpecSubjectFrame: {
    readonly coordinateSystem: 'z-up';
    readonly sourceUnit: string;
    readonly targetUnit: 'mm';
}

  readonly coordinateSystem: 'z-up'

  readonly sourceUnit: string

  readonly targetUnit: 'mm'

// Opaque engine-owned subject identifier
GeoSpecSubjectId: string

// Opaque subject handle returned after ingestion
GeoSpecSubjectReference: {
    readonly kind: 'geometry-subject-reference';
    readonly subjectId: GeoSpecSubjectId;
    readonly contentHash: string;
}

  readonly kind: 'geometry-subject-reference'

  readonly subjectId: GeoSpecSubjectId

  readonly contentHash: string

// A canonical claim batch
GeoSpecSubmitClaimsRequest: {
    readonly requestId: GeoSpecRequestId;
    readonly registryVersion: number;
    readonly execution: GeoSpecExecutionOptions;
    readonly claims: ReadonlyArray<Uint8Array<ArrayBuffer>>;
}

  readonly requestId: GeoSpecRequestId

  readonly registryVersion: number

  readonly execution: GeoSpecExecutionOptions

  readonly claims: ReadonlyArray<Uint8Array<ArrayBuffer>>

// Claim-batch response
GeoSpecSubmitClaimsResult: {
    readonly requestId: GeoSpecRequestId;
    readonly results: readonly GeoSpecClaimResult[];
}

  readonly requestId: GeoSpecRequestId

  readonly results: readonly GeoSpecClaimResult[]

// A capability name an engine build may advertise
GeoSpecEngineCapability: string

// Serializable description of the registered engine — the capability discovery surface (D-S0
GeoSpecEngineDescriptor: GeoSpecEngineRegistryDescriptor

  readonly protocolVersion: number

  readonly engine: string

  readonly version: string

  readonly capabilities: readonly string[]

// Host-only bootstrap operations
GeoSpecEngineHostBindings: {
    loadMesh(options: LoadMeshOptions): Promise<LoadMeshResult>;
    analyzeMesh(options: LoadMeshOptions): Promise<AnalyzeMeshResult>;
    loadStep(options: LoadStepOptions): Promise<GeometrySubject>;
    loadModel<Code extends Record<string, string> = Record<string, string>>(options: LoadModelOptions<Code>): Promise<GeoSpecSubject>;
    createModelLoader(options: CreateModelLoaderOptions): ManagedGeoSpecModelLoader;
    createGeoSpecNodeRunner(options: GeoSpecNodeRunnerOptions): GeoSpecRunner;
    createGeoSpecNodePoolRunner(options: GeoSpecNodePoolRunnerOptions): GeoSpecRunner;
    createGeoSpecWebRunner(options: GeoSpecWebRunnerOptions): GeoSpecRunner;
    createGeoSpecWebPoolRunner(options: GeoSpecWebPoolRunnerOptions): GeoSpecRunner;
    createNodeVmFileSystem(root: string): VmFileSystem;
    startGeoSpecPoolWorkerHost(options: GeoSpecPoolWorkerHostOptions): void;
    flushEvidenceStore(): Promise<void>;
}

  // GeoSpecEngineHostBindings.loadMesh (method)
  loadMesh(options: LoadMeshOptions): Promise<LoadMeshResult>;

  // GeoSpecEngineHostBindings.analyzeMesh (method)
  analyzeMesh(options: LoadMeshOptions): Promise<AnalyzeMeshResult>;

  // GeoSpecEngineHostBindings.loadStep (method)
  loadStep(options: LoadStepOptions): Promise<GeometrySubject>;

  // GeoSpecEngineHostBindings.loadModel (method)
  loadModel<Code extends Record<string, string> = Record<string, string>>(options: LoadModelOptions<Code>): Promise<GeoSpecSubject>;

  // GeoSpecEngineHostBindings.createModelLoader (method)
  createModelLoader(options: CreateModelLoaderOptions): ManagedGeoSpecModelLoader;

  // GeoSpecEngineHostBindings.createGeoSpecNodeRunner (method)
  createGeoSpecNodeRunner(options: GeoSpecNodeRunnerOptions): GeoSpecRunner;

  // GeoSpecEngineHostBindings.createGeoSpecNodePoolRunner (method)
  createGeoSpecNodePoolRunner(options: GeoSpecNodePoolRunnerOptions): GeoSpecRunner;

  // GeoSpecEngineHostBindings.createGeoSpecWebRunner (method)
  createGeoSpecWebRunner(options: GeoSpecWebRunnerOptions): GeoSpecRunner;

  // GeoSpecEngineHostBindings.createGeoSpecWebPoolRunner (method)
  createGeoSpecWebPoolRunner(options: GeoSpecWebPoolRunnerOptions): GeoSpecRunner;

  // GeoSpecEngineHostBindings.createNodeVmFileSystem (method)
  createNodeVmFileSystem(root: string): VmFileSystem;

  // GeoSpecEngineHostBindings.startGeoSpecPoolWorkerHost (method)
  startGeoSpecPoolWorkerHost(options: GeoSpecPoolWorkerHostOptions): void;

  // GeoSpecEngineHostBindings.flushEvidenceStore (method)
  flushEvidenceStore(): Promise<void>;

// What an engine registers with the substrate
GeoSpecEngineImplementation: {
    /** Must equal {@link geoSpecEngineProtocolVersion}. */
    readonly protocolVersion: number;
    /** Engine identity, e.g. `'@taucad/geospec-engine'`. */
    readonly engine: string;
    /** Engine build version, recorded in provenance and cache keys. */
    readonly version: string;
    /** Contract-B transport binding used for every geometry claim. */
    readonly protocol: GeoSpecEngineProtocol;
    /** Optional in-process host bootstrap; never part of the wire contract. */
    readonly host?: Partial<GeoSpecEngineHostBindings>;
}

  // Must equal {@link geoSpecEngineProtocolVersion }
  readonly protocolVersion: number

  // Engine identity, e.g
  readonly engine: string

  // Engine build version, recorded in provenance and cache keys
  readonly version: string

  // Contract-B transport binding used for every geometry claim
  readonly protocol: GeoSpecEngineProtocol

  // Optional in-process host bootstrap
  readonly host?: Partial<GeoSpecEngineHostBindings>

// One inspected geometry entity
GeometryInspectionEntity: {
    kind: 'occurrence';
    name: string;
    color?: string;
    bounds: AabbMeters;
    center: Vec3;
    triangleCount?: number;
    source: 'mesh' | 'step';
} | {
    kind: 'axis';
    name: string;
    axis?: 'x' | 'y' | 'z';
    center?: Vec3;
    direction?: Vec3;
    radius?: number;
    bounds?: AabbMeters;
    source: 'selector' | 'brep';
} | {
    kind: 'plane';
    name: string;
    normal?: Vec3;
    offset?: number;
    bounds?: AabbMeters;
    source: 'selector' | 'brep';
}

  kind: 'occurrence'

  name: string

  bounds: AabbMeters

  source: 'mesh' | 'step'

// Result of one selector inspection
GeometryInspectionSelection: {
    selector: GeoSpecGeometrySelector;
    matches: GeometryInspectionEntity[];
}

  selector: GeoSpecGeometrySelector

  matches: GeometryInspectionEntity[]

// Options for {@link inspectGeometry}
InspectGeometryOptions: {
    subject: GeometrySubject;
    selectors: GeoSpecGeometrySelector[];
    evidence?: Array<'bounds' | 'facts' | 'frames'>;
}

  subject: GeometrySubject

  selectors: GeoSpecGeometrySelector[]

  evidence?: Array<'bounds' | 'facts' | 'frames'>

// Structured inspection result used by relationship and occurrence matchers
InspectGeometryResult: {
    selections: GeometryInspectionSelection[];
    diagnostics: GeometryDiagnostic[];
}

  selections: GeometryInspectionSelection[]

  diagnostics: GeometryDiagnostic[]

// Options for component-overlap analysis
AnalyzeMeshOverlapOptions: {
    subject: GeometrySubject;
    tolerance?: number;
    pairs?: MeshOverlapPairSelector[];
}

  subject: GeometrySubject

  tolerance?: number

  pairs?: MeshOverlapPairSelector[]

// Typed result for component-overlap analysis
AnalyzeMeshOverlapResult: {
    success: true;
    evidence: MeshOverlapEvidence;
    diagnostics: GeometryDiagnostic[];
} | {
    success: false;
    diagnostics: GeometryDiagnostic[];
}

  success: true

  diagnostics: GeometryDiagnostic[]

// One overlapping component pair found by {@link analyzeMeshOverlap}
MeshComponentOverlap: {
    leftComponentId: number;
    rightComponentId: number;
    leftLabel: string;
    rightLabel: string;
    leftColor?: string;
    rightColor?: string;
    intersectionVolume: number;
    witnessPoint?: Vec3;
    penetration: 'positive-volume';
}

  leftComponentId: number

  rightComponentId: number

  leftLabel: string

  rightLabel: string

  leftColor?: string

  rightColor?: string

  intersectionVolume: number

  witnessPoint?: Vec3

  penetration: 'positive-volume'

// Successful overlap analysis
MeshOverlapEvidence: {
    componentSource: 'named';
    componentCount: number;
    selectedPairs?: MeshOverlapSelectedPair[];
    checkedPairs: number;
    tolerance: number;
    overlaps: MeshComponentOverlap[];
}

  componentSource: 'named'

  componentCount: number

  selectedPairs?: MeshOverlapSelectedPair[]

  checkedPairs: number

  tolerance: number

  overlaps: MeshComponentOverlap[]

// Failed mesh load result
LoadMeshFailure: {
    success: false;
    diagnostics: GeometryDiagnostic[];
}

  success: false

  diagnostics: GeometryDiagnostic[]

// Successful mesh load result
LoadMeshSuccess: {
    success: true;
    subject: GeometrySubject;
}

  success: true

  subject: GeometrySubject

// In-memory triangle mesh source
MeshBufferSource: {
    format: 'mesh-buffer';
    positions: Float32Array<ArrayBuffer> | number[];
    indices?: Uint32Array<ArrayBuffer> | Uint16Array<ArrayBuffer> | number[];
    name?: string;
}

  format: 'mesh-buffer'

  positions: Float32Array<ArrayBuffer> | number[]

  indices?: Uint32Array<ArrayBuffer> | Uint16Array<ArrayBuffer> | number[]

  name?: string

// Mesh source forms accepted by {@link loadMesh}
MeshSource: Uint8Array<ArrayBuffer> | ArrayBuffer | Blob | File | URL | string | MeshBufferSource

// Axis-aligned bounding box in glTF document units (meters)
AabbMeters: {
    min: [number, number, number];
    max: [number, number, number];
}

  min: [number, number, number]

  max: [number, number, number]

// Dominant primitive on an axis extremum for `boundingBox` failures
BoundingBoxAxisExtremum: {
    name: string;
    aabb: AabbMeters;
    value: number;
}

  name: string

  aabb: AabbMeters

  value: number

// One axis failure for `boundingBox` checks
BoundingBoxAxisFailure: {
    axis: 'x' | 'y' | 'z';
    field: 'size' | 'center';
    expected: number;
    actual: number;
    tolerance: number;
    minExtremum?: BoundingBoxAxisExtremum;
    maxExtremum?: BoundingBoxAxisExtremum;
}

  axis: 'x' | 'y' | 'z'

  field: 'size' | 'center'

  expected: number

  actual: number

  tolerance: number

  minExtremum?: BoundingBoxAxisExtremum

  maxExtremum?: BoundingBoxAxisExtremum
