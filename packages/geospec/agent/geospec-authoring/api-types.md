# geospec — Types

257 top-level symbols. Signatures are verbatim typescript.

// Stateful GeoSpec API created by {@link createGeoSpec}
GeoSpec: {
    loadMesh(options: LoadMeshOptions): Promise<LoadMeshResult>;
    analyzeMesh(options: AnalyzeMeshOptions): Promise<AnalyzeMeshResult>;
}

// A model admitted by one live GeoSpec host scope
GeoSpecSubject: {
    readonly [subjectBrand]: true;
}

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

// Assembly occurrence expectation accepted by `expectGeo(...).toHaveAssemblyOccurrences(...)`
GeoSpecAssemblyOccurrencesExpectation: {
    occurrences: GeoSpecAssemblyOccurrenceExpectation[];
    uniqueNames?: boolean;
}

// Axis-keyed numeric expectation used by high-level geometry matchers
GeoSpecAxisExpectation: {
    x?: number;
    y?: number;
    z?: number;
}

// Bounding-box expectation accepted by `expectGeo(...).toHaveBoundingBox(...)`
GeoSpecBoundingBoxExpectation: {
    min?: Vec3 | Partial<Record<keyof GeoSpecAxisExpectation, GeoSpecNumericExpectation>>;
    max?: Vec3 | Partial<Record<keyof GeoSpecAxisExpectation, GeoSpecNumericExpectation>>;
    size?: Vec3 | Partial<Record<keyof GeoSpecAxisExpectation, GeoSpecNumericExpectation>>;
    center?: Vec3 | Partial<Record<keyof GeoSpecAxisExpectation, GeoSpecNumericExpectation>>;
    tolerance?: number;
}

// Center-of-mass expectation accepted by `expectGeo(...).toHaveCenterOfMass(...)`
GeoSpecCenterOfMassExpectation: {
    point: GeoSpecPointExpectation;
    tolerance?: number;
}

// Chamfer-feature expectation accepted by `expectGeo(...).toHaveChamferFeature(...)`
GeoSpecChamferFeatureExpectation: {
    distance: number;
    selection?: string;
    tolerance?: number;
}

// Circular-hole expectation accepted by `expectGeo(...).toHaveCircularHole(...)`
GeoSpecCircularHoleExpectation: {
    diameter: number;
    through?: boolean;
    axis?: 'x' | 'y' | 'z';
    center?: GeoSpecPointExpectation;
    tolerance?: number;
}

// Cylindrical-face expectation accepted by `expectGeo(...).toHaveCylindricalFace(...)`
GeoSpecCylindricalFaceExpectation: {
    radius: number;
    axis: 'x' | 'y' | 'z';
    tolerance?: number;
}

// Intentional component interference allowance accepted by `expectGeo(...).toHaveNoComponentInterference(...)`
GeoSpecComponentInterferenceAllowance: {
    kind?: 'intentionalInterference';
    left: GeoSpecComponentSelector;
    right: GeoSpecComponentSelector;
    maxVolume?: number;
    reason: string;
}

// Component-interference expectation accepted by `expectGeo(...).toHaveNoComponentInterference(...)`
// Remarks: GeoSpec checks for positive solid intersection volume between assembly components. Tangent contact and correctly meshed gears are allowed. `pairs` narrows the check to specific component-label pairs while preserving exact positive-volume evidence for every selected pair. `allowances` documents explicitly intentional positive-volume interference such as gasket compression, press fits, or simplified thread engagement.
GeoSpecComponentInterferenceExpectation: {
    tolerance?: number;
    pairs?: GeoSpecComponentInterferencePairExpectation[];
    allowances?: GeoSpecComponentInterferenceAllowance[];
}

// A pair-specific component-interference check accepted by `expectGeo(...).toHaveNoComponentInterference(...)`
GeoSpecComponentInterferencePairExpectation: {
    left: GeoSpecComponentSelector;
    right: GeoSpecComponentSelector;
}

// Connected-components expectation accepted by `expectGeo(...).toHaveConnectedComponents(...)`
GeoSpecConnectedComponentsExpectation: {
    count: number;
    tolerance?: number;
    toleranceMm?: number;
}

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

// Mass expectation accepted by `expectGeo(...).toHaveMass(...)`
GeoSpecMassExpectation: {
    value: number | GeoSpecNumericExpectation;
    density?: number;
    tolerance?: number;
}

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

// Diagnostic severities rejected by `expectGeo(...).toHaveNoDiagnostics(...)`
// Remarks: Defaults to `error` and `warning` when omitted.
GeoSpecNoDiagnosticsExpectation: {
    severities?: Array<GeometryDiagnostic['severity']>;
}

// Minimum-wall-thickness expectation accepted by `expectGeo(...).toHaveMinimumWallThickness(...)`
GeoSpecMinimumWallThicknessExpectation: {
    value: GeoSpecNumericExpectation;
    tolerance?: number;
}

// Circular-hole-pattern expectation accepted by `expectGeo(...).toHaveCircularHolePattern(...)`
GeoSpecCircularHolePatternExpectation: {
    count: number;
    holeDiameter: number;
    boltCircleDiameter?: number;
    axis?: 'x' | 'y' | 'z';
    center?: GeoSpecPointExpectation;
    tolerance?: number;
}

// Fillet-feature expectation accepted by `expectGeo(...).toHaveFilletFeature(...)`
GeoSpecFilletFeatureExpectation: {
    radius: number;
    selection?: string;
    tolerance?: number;
}

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

// Point expectation accepted by center and feature matchers
GeoSpecPointExpectation: Vec3 | GeoSpecAxisExpectation

// Product-structure expectation accepted by `expectGeo(...).toHaveProductStructure(...)`
GeoSpecProductStructureExpectation: {
    names?: string[];
    count?: GeoSpecNumericExpectation;
}

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

// Spatial relationship expectation accepted by `expectGeo(...).toHaveSpatialRelationships(...)`
GeoSpecSpatialRelationshipsExpectation: {
    relationships: GeoSpecSpatialRelationshipExpectation[];
}

// STEP unit expectation accepted by `expectGeo(...).toHaveStepUnits(...)`
GeoSpecStepUnitsExpectation: {
    unit: string;
}

// Surface-area expectation accepted by `expectGeo(...).toHaveSurfaceArea(...)`
GeoSpecSurfaceAreaExpectation: {
    value: number | GeoSpecNumericExpectation;
    tolerance?: number;
}

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

// One void-continuity waypoint
GeoSpecVoidWaypoint: Vec3 | {
    occurrence: string;
}

// Volume expectation accepted by `expectGeo(...).toHaveVolume(...)`
GeoSpecVolumeExpectation: {
    value: number | GeoSpecNumericExpectation;
    tolerance?: number;
}

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

// Provenance recorded by GeoSpec loaders
GeometryProvenance: {
    source: GeometrySource;
    unit: GeoSpecUnit;
    loader: 'gltf-transform' | 'in-memory' | 'opencascade-step';
    contentHash?: string;
    parameters?: Record<string, JSONValue>;
    exportIntent?: GeometryExportIntent;
}

// Source metadata for a loaded geometry subject
GeometrySource: {
    kind: 'bytes' | 'array-buffer' | 'blob' | 'file' | 'path' | 'url' | 'mesh-buffer' | 'readable-stream' | 'async-iterable';
    format: GeometryFileFormat;
    path?: string;
    name?: string;
    byteLength?: number;
}

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

// Wire-safe mesh summary carried by an opaque geometry subject
GeometrySubjectMeshEvidence: {
    format: MeshFileFormat;
    stats: Pick<GeometryStats, 'vertexCount' | 'meshCount' | 'triangleCount'>;
}

// Mesh evidence loaded from geometry bytes or buffers
MeshEvidence: {
    format: MeshFileFormat;
    stats: GeometryStats;
}

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

// Mesh analysis result
AnalyzeMeshResult: {
    success: true;
    stats: GeometryStats;
    subject: GeometrySubject;
} | LoadMeshFailure

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

// Result of loading mesh evidence into a GeoSpec geometry subject
LoadMeshResult: LoadMeshSuccess | LoadMeshFailure

// Numeric 3D vector
GeoSpecVec3: readonly [number, number, number]

// Options for BRep evidence analysis
AnalyzeBrepOptions: {
    subject: GeometrySubject;
}

// Typed result returned by {@link analyzeBrep}
AnalyzeBrepResult: {
    success: true;
    brep: BrepEvidence;
    diagnostics: GeometryDiagnostic[];
} | {
    success: false;
    diagnostics: GeometryDiagnostic[];
}

// One matcher's contract entry
GeoSpecMatcherDescriptor: {
    readonly kind: GeoSpecAssertion['kind'];
    readonly expected: GeoSpecMatcherExpectedShape;
    readonly mode: GeoSpecMatcherMode;
}

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

// Idempotent cancellation acknowledgement
GeoSpecCancelResult: {
    readonly requestId: GeoSpecRequestId;
    readonly cancelled: boolean;
}

// Canonical JSON payload encoded into one claim byte lane
GeoSpecClaim: {
    readonly claimId: GeoSpecClaimId;
    readonly capability: string;
    readonly subjectIds: readonly GeoSpecSubjectId[];
    readonly payload: JSONValue;
    readonly workUnitBudget: number;
}

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

// Resolved operational controls carried outside canonical claim bytes
GeoSpecExecutionOptions: {
    readonly forensic: boolean;
    readonly matcherWallBackstop: number;
}

// Metadata lane for subject ingestion
GeoSpecIngestSubjectRequest: {
    readonly requestId: GeoSpecRequestId;
    readonly contentHash: string;
    readonly format: 'glb' | 'gltf' | 'step' | 'stp';
    readonly frame: GeoSpecSubjectFrame;
    readonly provenance: JSONValue;
    readonly options: JSONValue;
}

// Subject-ingestion response
GeoSpecIngestSubjectResult: {
    readonly requestId: GeoSpecRequestId;
    readonly subject: GeoSpecSubjectReference;
}

// Client half of the Contract-B initialization handshake
GeoSpecInitializeRequest: {
    readonly protocolVersion: number;
    readonly client: {
        readonly name: string;
        readonly version: string;
    };
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

// One capability honestly advertised by an engine build
GeoSpecProtocolCapability: {
    readonly name: string;
    readonly registryVersion: number;
}

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

// Serializable build provenance returned by initialization
GeoSpecProtocolProvenance: {
    readonly engineDigest?: string;
    readonly build?: JSONValue;
    readonly license?: string;
}

// Idempotent subject-release request
GeoSpecReleaseSubjectRequest: {
    readonly requestId: GeoSpecRequestId;
    readonly subjectId: GeoSpecSubjectId;
}

// Subject-release acknowledgement
GeoSpecReleaseSubjectResult: {
    readonly requestId: GeoSpecRequestId;
    readonly released: boolean;
}

// Opaque request identifier
GeoSpecRequestId: string

// Canonical frame attached to bytes entering the engine
GeoSpecSubjectFrame: {
    readonly coordinateSystem: 'z-up';
    readonly sourceUnit: string;
    readonly targetUnit: 'mm';
}

// Opaque engine-owned subject identifier
GeoSpecSubjectId: string

// Opaque subject handle returned after ingestion
GeoSpecSubjectReference: {
    readonly kind: 'geometry-subject-reference';
    readonly subjectId: GeoSpecSubjectId;
    readonly contentHash: string;
}

// A canonical claim batch
GeoSpecSubmitClaimsRequest: {
    readonly requestId: GeoSpecRequestId;
    readonly registryVersion: number;
    readonly execution: GeoSpecExecutionOptions;
    readonly claims: ReadonlyArray<Uint8Array<ArrayBuffer>>;
}

// Claim-batch response
GeoSpecSubmitClaimsResult: {
    readonly requestId: GeoSpecRequestId;
    readonly results: readonly GeoSpecClaimResult[];
}

// A capability name an engine build may advertise
GeoSpecEngineCapability: string

// Serializable description of the registered engine — the capability discovery surface (D-S0
GeoSpecEngineDescriptor: GeoSpecEngineRegistryDescriptor

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

// Result of one selector inspection
GeometryInspectionSelection: {
    selector: GeoSpecGeometrySelector;
    matches: GeometryInspectionEntity[];
}

// Options for {@link inspectGeometry}
InspectGeometryOptions: {
    subject: GeometrySubject;
    selectors: GeoSpecGeometrySelector[];
    evidence?: Array<'bounds' | 'facts' | 'frames'>;
}

// Structured inspection result used by relationship and occurrence matchers
InspectGeometryResult: {
    selections: GeometryInspectionSelection[];
    diagnostics: GeometryDiagnostic[];
}

// Options for component-overlap analysis
AnalyzeMeshOverlapOptions: {
    subject: GeometrySubject;
    tolerance?: number;
    pairs?: MeshOverlapPairSelector[];
}

// Typed result for component-overlap analysis
AnalyzeMeshOverlapResult: {
    success: true;
    evidence: MeshOverlapEvidence;
    diagnostics: GeometryDiagnostic[];
} | {
    success: false;
    diagnostics: GeometryDiagnostic[];
}

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

// Successful overlap analysis
MeshOverlapEvidence: {
    componentSource: 'named';
    componentCount: number;
    selectedPairs?: MeshOverlapSelectedPair[];
    checkedPairs: number;
    tolerance: number;
    overlaps: MeshComponentOverlap[];
}

// Failed mesh load result
LoadMeshFailure: {
    success: false;
    diagnostics: GeometryDiagnostic[];
}

// Successful mesh load result
LoadMeshSuccess: {
    success: true;
    subject: GeometrySubject;
}

// In-memory triangle mesh source
MeshBufferSource: {
    format: 'mesh-buffer';
    positions: Float32Array<ArrayBuffer> | number[];
    indices?: Uint32Array<ArrayBuffer> | Uint16Array<ArrayBuffer> | number[];
    name?: string;
}

// Mesh source forms accepted by {@link loadMesh}
MeshSource: Uint8Array<ArrayBuffer> | ArrayBuffer | Blob | File | URL | string | MeshBufferSource

// Axis-aligned bounding box in glTF document units (meters)
AabbMeters: {
    min: [number, number, number];
    max: [number, number, number];
}

// Dominant primitive on an axis extremum for `boundingBox` failures
BoundingBoxAxisExtremum: {
    name: string;
    aabb: AabbMeters;
    value: number;
}

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

// Structured payload when `boundingBox` fails
BoundingBoxFailure: {
    axisFailures: BoundingBoxAxisFailure[];
}

// Scene bounding box with per-primitive contributors in the subject's unit and frame
BoundingBoxStats: {
    size: [number, number, number];
    center: [number, number, number];
    primitives: PrimitiveRecord[];
}

// Result of evaluating a single test requirement against geometry stats
CheckResult: {
    passed: true;
} | {
    passed: false;
    check: 'boundingBox';
    reason: string;
    suggestion: string;
    failure: BoundingBoxFailure;
} | {
    passed: false;
    check: 'connectedComponents';
    reason: string;
    suggestion: string;
    failure: ConnectedComponentsFailure;
} | {
    passed: false;
    check: 'watertight';
    reason: string;
    suggestion: string;
    failure: WatertightFailure;
} | {
    passed: false;
    check: 'invalid';
    reason: string;
    suggestion: string;
}

// Smallest clearance between two clusters along the dominant separation axis
ClusterGap: {
    fromLabel: string;
    toLabel: string;
    axis: 'x' | 'y' | 'z';
    /** Millimetres — clearance between the two named primitives' AABBs. */
    gapMm: number;
    fromPrimitive: string;
    toPrimitive: string;
}

// One spatial cluster from AABB overlap grouping
ClusterReport: {
    label: string;
    primitives: PrimitiveRecord[];
    aabb: AabbMeters;
    centroid: [number, number, number];
    totalVertices: number;
}

// Structured payload when `connectedComponents` fails
ConnectedComponentsFailure: {
    expected: number;
    got: number;
    toleranceMm: number;
    clusters: ClusterReport[];
    gaps: ClusterGap[];
}

// Full connected-components analysis at one tolerance
ConnectedComponentsResult: {
    count: number;
    clusters: ClusterReport[];
    gaps: ClusterGap[];
}

// Diagnostic form permitted inside a wire-safe subject snapshot
GeometryEvidenceDiagnostic: Omit<GeometryDiagnostic, 'details'> & {
    details?: JSONValue;
}

// Statistics about a parsed GLB geometry
// Remarks: `vertexCount` and `meshCount` are kept on the type for internal diagnostic use (and for the kernel-author Vitest harness in `kernel-geometry-testing.utils.ts`); they are no longer exposed via the agent-facing requirement schema.
GeometryStats: {
    vertexCount: number;
    meshCount: number;
    triangleCount: number;
    meshQuality: MeshQualityStats;
    watertight: boolean;
    boundingBox?: BoundingBoxStats;
}

// One TRIANGLES primitive with identity for spatial-test feedback
PrimitiveRecord: {
    /** The glTF node / mesh name (from kernel ShapeConfig.name when present). */
    name: string;
    color?: string;
    vertices: number;
    aabb: AabbMeters;
}

// Structured payload when `watertight` fails
WatertightFailure: {
    /** Edges with incidence ≠ 2 (open or non-manifold). */
    irregularEdges: number;
    /** Edges shared by exactly one triangle (open boundary). */
    openBoundaryEdges: number;
    /** Edges shared by more than two triangles (over-adjacent/non-manifold). */
    nonManifoldEdges: number;
    irregularEdgeKindCounts: {
        openBoundary: number;
        nonManifold: number;
    };
    irregularEdgeClusters: WatertightIrregularEdgeCluster[];
    irregularEdgeFraction: number;
    perPrimitive: WatertightPrimitiveBreakdown[];
}

// Spatial cluster of related irregular edges
WatertightIrregularEdgeCluster: {
    kind: WatertightIrregularEdgeKind;
    edgeCount: number;
    aabb: {
        min: Vec3;
        max: Vec3;
        center: Vec3;
    };
    samples: WatertightIrregularEdgeSample[];
}

// Class of irregular mesh edge found during watertight analysis
WatertightIrregularEdgeKind: 'open-boundary' | 'non-manifold'

// Representative irregular edge, in glTF document coordinates
WatertightIrregularEdgeSample: {
    start: Vec3;
    end: Vec3;
    center: Vec3;
    incidentTriangleCount: number;
    primitives: string[];
    color?: string;
}

// Per-primitive watertight diagnostic (local tessellation only)
WatertightPrimitiveBreakdown: {
    name: string;
    boundaryEdges: number;
    loopCentroid: [number, number, number];
}

// Full watertight analysis (global + per-primitive breakdown)
WatertightResult: {
    watertight: boolean;
    irregularEdges: number;
    openBoundaryEdges: number;
    nonManifoldEdges: number;
    irregularEdgeKindCounts: {
        openBoundary: number;
        nonManifold: number;
    };
    irregularEdgeClusters: WatertightIrregularEdgeCluster[];
    totalEdges: number;
    irregularEdgeFraction: number;
    perPrimitive: WatertightPrimitiveBreakdown[];
}

// Runtime route metadata used to decide whether a runtime export can honor GeoSpec evidence requirements
GeoSpecExportRoute: Partial<ExportRoute> & {
    kernelId?: string;
    sourceFormat?: string;
    targetFormat?: string;
    transcoderId?: string;
    fidelity?: string;
    exportOptions?: {
        schema?: {
            properties?: Record<string, unknown>;
        };
        defaults?: Record<string, unknown>;
    };
}

RuntimeBackedModelFormat: Exclude<GeoSpecModelFormat, 'mesh-buffer'>

// Runtime client shape for route-aware Tau runtimes
RuntimeClientWithRoutes: GeoSpecRuntimeClient & {
    bestRouteFor(format: string, options?: {
        readonly kernelId?: string;
    }): GeoSpecExportRoute | undefined;
}

// Resolved runtime export request and provenance for a GeoSpec model load
RuntimeExportIntent: {
    options: Record<string, unknown>;
    provenance: GeometryExportIntent;
    sourceUnit: GeoSpecUnit;
}

// Structured failure returned when a runtime cannot provide the requested GeoSpec evidence
RuntimeExportIntentFailure: {
    success: false;
    diagnostics: GeometryDiagnostic[];
}

// Defaults accepted by {@link import ('./load-model.js').createModelLoader}
CreateModelLoaderOptions: {
    /** Initialized compiled engine supplied by the host, never selected by an authored spec. */
    engine?: GeoSpecNativeModelEngine;
    /** Rooted host reader for direct filesystem or URL sources. */
    readSource?: GeoSpecNativeSourceReader;
    /** Geometry format to export when an individual call does not specify one. */
    format?: GeoSpecModelFormat;
    /** Runtime client or lazy runtime factory. */
    runtime?: GeoSpecRuntimeClient | GeoSpecRuntimeClientFactory;
    /** Source-specific runtime adapters, e.g. host-provided GPL-isolated kernels. */
    sourceAdapters?: readonly GeoSpecRuntimeSourceAdapter[];
    /** Project root used by runtime integrations. */
    projectPath?: string;
    /** STEP reader strategy used for STEP sources or exports. */
    stepStreaming?: StepStreamingMode;
    /** Whether STEP loading should also produce mesh evidence. Defaults to true. */
    mesh?: boolean;
    /** Linear tolerance used while meshing exact BRep evidence. */
    meshLinearTolerance?: number;
    /** Angular tolerance in degrees used while meshing exact BRep evidence. */
    meshAngularToleranceDegrees?: number;
}

// Geometry formats accepted by {@link import ('./load-model.js').loadModel}
GeoSpecModelFormat: MeshFileFormat | 'step' | 'stp'

// Function shape used by GeoSpec runners to provide model loading inside VM executed test files
GeoSpecModelLoader: <Code extends Record<string, string> = Record<string, string>>(options: LoadModelOptions<Code>) => Promise<GeoSpecSubject>

// A configured loader whose shared runtime can be released with its owner
ManagedGeoSpecModelLoader: GeoSpecModelLoader & {
    dispose(): Promise<void>;
}

// Runtime client surface consumed by `geospec/model`
// Remarks: GeoSpec accepts concrete Tau runtime clients from multiple call sites but only needs connection lifecycle and request-scoped documents. Keep this shape small so typed runtime clients do not have to widen their full generic method surface to GeoSpec's testing DSL.
GeoSpecRuntimeClient: Pick<RuntimeClient, 'connect' | 'terminate'> & {
    open: (input: Pick<Parameters<RuntimeClient['open']>[0], 'source' | 'parameters' | 'stage' | 'watch' | 'signal'>) => Pick<ReturnType<RuntimeClient['open']>, 'export' | 'close'>;
    on?(event: 'telemetry', handler: (batch: {
        readonly entries: ReadonlyArray<{
            name: string;
            duration: number;
            startTime: number;
            workerTimeOrigin: number;
        }>;
    }) => void): () => void;
}

// Lazy runtime factory consumed by `geospec/model`
GeoSpecRuntimeClientFactory: () => Promise<GeoSpecRuntimeClient>

// Explicit source adapter for formats whose runtime setup is not part of the generic Tau runtime preset
GeoSpecRuntimeSourceAdapter: {
    id: string;
    extensions: readonly string[];
    createRuntime(options: {
        projectPath?: string;
        file?: string;
    }): Promise<GeoSpecRuntimeClient>;
}

// Inline code-CAD model load options
LoadModelCodeOptions: {
    /** Source files keyed by project-relative path. */
    code: Code;
    /** Entry path to render from {@link code}. */
    file: keyof Code & string;
    /** Geometry format to export. Defaults to `glb`. */
    format?: GeoSpecModelFormat;
    /** Explicit parameters passed to the runtime. */
    parameters?: Record<string, unknown>;
    /** Runtime client or lazy runtime factory. */
    runtime?: GeoSpecRuntimeClient | GeoSpecRuntimeClientFactory;
    /** Source-specific runtime adapters, e.g. host-provided GPL-isolated kernels. */
    sourceAdapters?: readonly GeoSpecRuntimeSourceAdapter[];
    /** Project root used by runtime integrations. */
    projectPath?: string;
    /** STEP reader strategy used for STEP exports. */
    stepStreaming?: StepStreamingMode;
    /** Whether STEP loading should also produce mesh evidence. Defaults to true. */
    mesh?: boolean;
    /** Linear tolerance used while meshing exact BRep evidence. */
    meshLinearTolerance?: number;
    /** Angular tolerance in degrees used while meshing exact BRep evidence. */
    meshAngularToleranceDegrees?: number;
}

// Filesystem-backed model load options
LoadModelFileOptions: {
    /** Project-relative model file to render. */
    file: string;
    /** Project root used by runtime integrations. */
    projectPath?: string;
    /** Geometry format to export. Defaults to `glb`. */
    format?: GeoSpecModelFormat;
    /** Explicit parameters passed to the runtime. */
    parameters?: Record<string, unknown>;
    /** Runtime client or lazy runtime factory. */
    runtime?: GeoSpecRuntimeClient | GeoSpecRuntimeClientFactory;
    /** Source-specific runtime adapters, e.g. host-provided GPL-isolated kernels. */
    sourceAdapters?: readonly GeoSpecRuntimeSourceAdapter[];
    /** STEP reader strategy used for STEP exports. */
    stepStreaming?: StepStreamingMode;
    /** Whether STEP loading should also produce mesh evidence. Defaults to true. */
    mesh?: boolean;
    /** Linear tolerance used while meshing exact BRep evidence. */
    meshLinearTolerance?: number;
    /** Angular tolerance in degrees used while meshing exact BRep evidence. */
    meshAngularToleranceDegrees?: number;
}

// Options accepted by {@link import ('./load-model.js').loadModel}
LoadModelOptions: LoadModelSourceOptions | LoadModelCodeOptions<Code> | LoadModelFileOptions

// Direct geometry-source model load options
LoadModelSourceOptions: {
    /** Geometry bytes, path, browser file/blob, or in-memory mesh buffer. */
    source: MeshSource | StepSource;
    /** Named external resources consumed alongside the direct geometry bytes. */
    resources?: ReadonlyArray<{
        readonly name: string;
        readonly source: MeshSource | StepSource;
    }>;
    /** Source geometry format. Defaults to `glb`. */
    format?: GeoSpecModelFormat;
    /** Source path recorded in provenance. */
    path?: string;
    /** Human-readable source name recorded in provenance. */
    name?: string;
    /** Coordinate unit of raw GLB/glTF or mesh-buffer data before canonical millimetre normalization. */
    sourceUnit?: GeoSpecUnit;
    /** Explicit parameters recorded in provenance. */
    parameters?: Record<string, unknown>;
    /** STEP reader strategy used for STEP sources. */
    stepStreaming?: StepStreamingMode;
    /** Whether STEP loading should also produce mesh evidence. Defaults to true. */
    mesh?: boolean;
    /** Linear tolerance used while meshing exact BRep evidence. */
    meshLinearTolerance?: number;
    /** Angular tolerance in degrees used while meshing exact BRep evidence. */
    meshAngularToleranceDegrees?: number;
}

// Labeled broad-phase record
RelationshipBroadPhase: {
    method: 'aabb' | 'mesh-overlap';
    candidate: boolean;
    detail: string;
}

// Selector resolution summary attached to relationship diagnostics so every failure names both endpoints with their stability class (R7)
RelationshipEndpointReport: {
    role: 'subject' | 'target';
    selection: GeometrySelection;
}

// Structured result of one relationship proof (L4)
RelationshipEvidence: {
    verdict: 'pass' | 'fail' | 'unsupported';
    broadPhase?: RelationshipBroadPhase;
    final?: RelationshipFinalEvidence;
    /** `GEOSPEC_SPATIAL_RELATIONSHIP_MISMATCH` on fail; policy codes otherwise. */
    diagnostics: GeometryDiagnostic[];
}

// Final exact-evidence record for a relationship verdict
RelationshipFinalEvidence: {
    method: 'extrema' | 'analytic' | 'classification' | 'boolean-intersection';
    /** Measured values in millimetres/degrees (shared unit contract). */
    measured: Record<string, number>;
    /** Expected values in millimetres/degrees (shared unit contract). */
    expected: Record<string, number>;
    witnesses: RelationshipWitness[];
}

// One geometric witness backing a relationship verdict
// Remarks: `value` layout by kind: `point` is `[x, y, z]`; `axis` is `[ox, oy, oz, dx, dy, dz]`; `plane` is `[nx, ny, nz, offset]`. `topologyRef` is the snapshot topology-ref string (`'#o1.2.f7'`) — diagnostics and pinning only, never a durable reference.
RelationshipWitness: {
    kind: 'point' | 'axis' | 'plane';
    value: number[];
    topologyRef?: string;
    /**
     * Where the witness points came from: absent = the exact BRep evaluator;
     * `'mesh'` = a realizable tessellation pair backing a certified-bound proof
     * (CR4) — honest reporting, never a verdict input.
     */
    provenance?: 'mesh';
}

// Collects suites, tests, assertions, and async completion state for one GeoSpec module execution
GeoSpecCollector: {
    tests: GeoSpecTestCase[];
    describe(name: string, function_: GeoSpecTestFunction): void;
    describeSkip(name: string, _function?: GeoSpecTestFunction): void;
    it(name: string, function_: GeoSpecTestFunction): void;
    itSkip(name: string, _function?: GeoSpecTestFunction): void;
    expectGeo(subject: unknown): GeoSpecMatcher;
    waitForCompletion(testTimeout?: number, testNamePattern?: GeoSpecTestNamePattern): Promise<void>;
}

// Native collector surface for hosts that explicitly supply a native engine
GeoSpecNativeCollector: Omit<GeoSpecCollector, 'expectGeo'> & {
    expectGeo(subject: unknown): GeoSpecMatcher;
}

// Per-module collector configuration
GeoSpecCollectorOptions: {
    matcherWallBackstop?: number;
    forensic?: boolean;
    nativeAssertions?: GeoSpecAssertionClientOptions;
}

// Compiled Vitest-style test-name pattern used by a GeoSpec run
GeoSpecTestNamePattern: RegExp

// Options for recursive GeoSpec test discovery
// Remarks: `files` accepts either exact `*.geospec.ts` / `*.geospec.js` files or directory roots. When omitted, discovery starts at `projectPath`. `include` and `exclude` are Vitest-style file globs applied to project-relative GeoSpec paths after `files` roots have been expanded.
DiscoverGeoSpecFilesOptions: {
    filesystem: GeoSpecDiscoveryFileSystem;
    projectPath: string;
    files?: readonly string[];
    include?: readonly string[];
    exclude?: readonly string[];
    ignoredDirectories?: readonly string[];
}

// File kind returned by a GeoSpec discovery filesystem
GeoSpecDiscoveryFileKind: 'file' | 'directory'

// Minimal stat object required for recursive GeoSpec test discovery
GeoSpecDiscoveryFileStat: {
    kind: GeoSpecDiscoveryFileKind;
}

// Minimal filesystem contract used by GeoSpec test discovery
// Remarks: Browser workers, Node CLI hosts, and embedded runners adapt their native filesystem APIs to this shape so discovery has one shared behavior.
GeoSpecDiscoveryFileSystem: {
    readdir(path: string): Promise<readonly string[]>;
    stat(path: string): Promise<GeoSpecDiscoveryFileStat>;
}

// Result returned by recursive GeoSpec test discovery
// Remarks: `files` are project-relative, sorted, and de-duplicated. `unmatchedRoots` contains requested file or directory roots that did not select any GeoSpec files.
GeoSpecDiscoveryResult: {
    files: string[];
    unmatchedRoots: string[];
}

// Worker-local cache for successful GeoSpec bundles
// Remarks: The cache is internal runner infrastructure. Each invocation still creates a fresh collector, run token and host binding, so runs that reuse one entry stay isolated. An entry is reused only while every read its bundle was built from still returns the answer the bundler got.
GeoSpecModuleBundleCache: Map<string, {
    builtinIdentity: string;
    /** The run token embedded in `bundle.code`; a reuse executes a copy under its own run's token. */
    runToken: string;
    bundle: BundleResult;
    /**
     * Each filesystem read the bundler made while building `bundle`, with the
     * answer it got. Existence probes are reads too: they decide which file an
     * import resolves to.
     */
    bundlerReads: ReadonlyArray<{
        question: 'exists' | 'utf8' | 'bytes';
        path: string;
        answer: boolean | string | Uint8Array<ArrayBuffer>;
    }>;
}>

// Failed GeoSpec run result
GeoSpecRunFailure: {
    success: false;
    issues: VmIssue[];
    bundle?: BundleResult;
    accounting?: GeoSpecTestAccounting;
    lineage?: GeoSpecRunLineage;
    /** Tests registered before a module execution failure, including their retained assertions. */
    tests?: GeoSpecTestCase[];
}

// Result returned by {@link import ('./run-geospec-module.js').runGeoSpecModule}
GeoSpecRunResult: GeoSpecRunSuccess | GeoSpecRunFailure

// Successful GeoSpec run result
GeoSpecRunSuccess: {
    success: true;
    /** True only when selected tests completed successfully with coherent available lineage. */
    passed: boolean;
    tests: GeoSpecTestCase[];
    bundle: BundleResult;
    accounting?: GeoSpecTestAccounting;
    lineage?: GeoSpecRunLineage;
}

// A collected GeoSpec test case
GeoSpecTestCase: {
    /** Registration ordinal before filtering, scoped to the source module's collection. */
    ordinal?: number;
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
}

// Test case status after runner collection
GeoSpecTestStatus: 'passed' | 'failed' | 'unsupported' | 'inconclusive' | 'not-run' | 'skipped'

// Options for executing a GeoSpec ESM test module
RunGeoSpecModuleOptions: {
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
    /**
     * Host-provided protocol-3 compiled assertion client. The host owns engine and
     * admitted subject lifetimes and supplies bindings through builtinModules;
     * authored tests use the canonical GeoSpec API, not a separate native dialect.
     */
    nativeAssertions?: GeoSpecAssertionClientOptions;
    /** Host-composed identity loader; authored tests use the canonical `geospec/model` API. */
    nativeModelLoader?: (options: Parameters<GeoSpecNativeModelLoader>[0]) => Promise<GeoSpecNativeSubject & {
        readonly load?: GeoSpecModelLoadEvidence;
    }>;
    /** Model loader exposed to VM tests through `geospec/model`. */
    modelLoader?: GeoSpecModelLoader;
    /** STEP loader exposed to VM tests through `geospec/step`. */
    stepLoader?: GeoSpecStepLoader;
    /** Additional in-memory modules made available to the VM. */
    builtinModules?: Record<string, BuiltinModule>;
    /** Internal profile counters used by opt-in benchmark tooling. */
    internalProfile?: GeoSpecRunProfile;
    /** Successful bundle cache owned by a serial runner worker. @internal */
    bundleCache?: GeoSpecModuleBundleCache;
    /**
     * List-only collection pass (R3 shard splitting): execute the module to
     * REGISTER tests, skip every body, and return all registered tests as
     * `skipped` in registration order. Used by the pool to split heavy files
     * into per-test shards.
     */
    collectOnly?: boolean;
}

// Native assertion options whose engine can also admit and release subjects
GeoSpecNativeRunnerAssertions: Omit<GeoSpecAssertionClientOptions, 'engine'> & {
    readonly engine: GeoSpecNativeModelEngine;
}

// Options for the native serial runner
GeoSpecNativeRunnerOptions: Omit<GeoSpecRunnerOptions, 'modelLoader' | 'nativeAssertions' | 'nativeModelLoader' | 'stepLoader'> & {
    /** Actual protocol-3 engine used by authored assertions. */
    readonly nativeAssertions: GeoSpecNativeRunnerAssertions;
    /** Optional managed loader; the runner releases its subjects after every run. */
    readonly nativeModelLoader?: ManagedGeoSpecNativeModelLoader;
    /** Defaults used when the runner constructs its own native loader. */
    readonly model?: Omit<CreateGeoSpecNativeModelLoaderOptions, 'engine'>;
}

// Defaults and host dependencies for a managed native model loader
CreateGeoSpecNativeModelLoaderOptions: {
    readonly engine: GeoSpecNativeModelEngine;
    readonly format?: Extract<GeoSpecModelFormat, 'glb' | 'step' | 'stp'>;
    readonly projectPath?: string;
    readonly readSource?: GeoSpecNativeSourceReader;
    readonly runtime?: GeoSpecRuntimeClient | GeoSpecRuntimeClientFactory;
    readonly sourceAdapters?: readonly GeoSpecRuntimeSourceAdapter[];
    /**
     * Subject handles carried between the release scopes of loaders that share one engine, keyed by
     * subjectHash. With a carrier, `releaseAll` keeps this scope's subjects for the next scope and
     * releases only the previous scope's subjects this scope did not load again, so reloading
     * unchanged bytes in the next scope is digest-only. Share one carrier per engine and run its
     * scopes one at a time: a scope's release touches only subjects whose scope has settled.
     */
    readonly carried?: Map<string, unknown>;
}

// Native additions accepted by the injected `geospec/runner/native` loader
GeoSpecNativeLoadModelOptions: LoadModelOptions<Code> & {
    /** Ordered external resource payloads declared to the native admission request. */
    readonly resources?: readonly GeoSpecNativeModelResource[];
    /** Format-specific native ingest options. */
    readonly ingestOptions?: Readonly<Record<string, unknown>>;
}

// Native engine operations required for model admission and run-level cleanup
GeoSpecNativeModelEngine: GeoSpecNativeEngine & {
    ingestSubject(request: Uint8Array<ArrayBuffer>, primary: Uint8Array<ArrayBuffer>, resources: ReadonlyArray<Uint8Array<ArrayBuffer>>): Uint8Array<ArrayBuffer>;
    subjectHandle(request: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>;
    releaseSubject(request: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>;
}

// Model loader injected into native VM runs
// Remarks: The freshness unit is one load: every call reads its source again (the source reader or a Runtime export) and the engine digests those exact bytes. Nothing is deduplicated per run or per scope; bytes equal to an admitted subject's reuse that subject by digest, length and descriptor, and edited bytes admit a new subject. Only concurrent identical inline-code Runtime loads share one in-flight export.
GeoSpecNativeModelLoader: <Code extends Record<string, string> = Record<string, string>>(options: GeoSpecNativeLoadModelOptions<Code>) => Promise<GeoSpecNativeModelSubject>

// Subject identity returned by native STEP/GLB admission
GeoSpecNativeModelSubject: GeoSpecNativeSubject & {
    readonly subjectHash: string;
    /** Exact successful-load evidence retained by the admitting host, when available. */
    readonly load?: GeoSpecModelLoadEvidence;
}

// One named external resource referenced by a direct glTF-family source
GeoSpecNativeModelResource: {
    readonly name: string;
    readonly source: LoadModelSourceOptions['source'];
}

// Resolve a non-memory source into ordinary ArrayBuffer-backed bytes
// Remarks: The loader takes ownership of the returned bytes and admits them without a copy, so a reader must return bytes that nothing mutates afterwards (a fresh read, not a view of a shared or reused buffer).
GeoSpecNativeSourceReader: (source: LoadModelSourceOptions['source']) => Promise<Uint8Array<ArrayBuffer>>

// Reusable native model loader whose admitted subjects can be released as one run
ManagedGeoSpecNativeModelLoader: GeoSpecNativeModelLoader & {
    /**
     * Drain registered admissions, including additions while drainage awaits,
     * then release this scope's subjects (with a carrier: the previous scope's
     * subjects this scope did not load again) and owned Runtime clients.
     *
     * Await the intended complete load chain before final release, and await
     * this method before closing the caller-owned engine. Calls after it returns
     * start a new scope requiring another release; future detached loads are not
     * part of the completed scope.
     *
     * @returns Completion of the current scope's admission drain and release.
     */
    releaseAll(): Promise<void>;
}

// Options accepted by {@link createGeoSpecNodeRunner}
GeoSpecNodeRunnerOptions: GeoSpecRunnerOptions & {
    /** Absolute project root path. */
    projectPath: string;
    /** Enable the authenticated persistent evidence cache. Defaults to true. */
    cache?: boolean;
    /** Absolute out-of-tree evidence-cache directory. */
    cacheDirectory?: string;
}

// Options accepted by {@link createGeoSpecNodePoolRunner}
GeoSpecNodePoolRunnerOptions: {
    /** Absolute project root path. */
    projectPath: string;
    /** Compiled worker count; defaults to one, within the caller-inclusive host cap. */
    workers?: number;
    /** Per-shard non-verdict watchdog override, milliseconds (R11). */
    shardTimeout?: number;
    /** Persistent reference-engine evidence caching is unsupported; omit or use false. True is refused. */
    cache?: boolean;
    /** Reference-engine cache directories are unsupported and refused when supplied. */
    cacheDirectory?: string;
    /** Reference-engine runtime factories are unsupported and refused when supplied. */
    runtimeFactoryModule?: {
        /** Absolute URL or resolvable Node module specifier. */
        specifier: string;
        /** Named export with signature `(projectPath: string) => Promise<GeoSpecRuntimeClient>`. */
        exportName: string;
    };
}

// Options accepted by {@link createGeoSpecWebRunner}
GeoSpecWebRunnerOptions: GeoSpecRunnerOptions

// Options accepted by {@link createGeoSpecWebPoolRunner}
GeoSpecWebPoolRunnerOptions: {
    /**
     * Spawn one pool worker whose script calls `startGeoSpecPoolWorkerHost`
     * with the application's filesystem and loaders.
     */
    createWorker: () => WebWorkerLike | Promise<WebWorkerLike>;
    /** Worker count; omit for `min(shards, hardwareConcurrency − 2, 4)`. */
    workers?: number;
    /** Per-shard non-verdict watchdog override, milliseconds (R11). */
    shardTimeout?: number;
}

// Options accepted by {@link startGeoSpecPoolWorkerHost}
GeoSpecPoolWorkerHostOptions: {
    /** Filesystem containing the project and test modules. */
    filesystem: RunGeoSpecModuleOptions['filesystem'];
    /** Model loader exposed to authored tests through `geospec/model`. */
    modelLoader?: RunGeoSpecModuleOptions['modelLoader'];
    /** Native assertion client shared with this worker's model admissions. */
    nativeAssertions?: RunGeoSpecModuleOptions['nativeAssertions'];
    /** Managed native admissions, released after every shard and collection pass and before shutdown. */
    nativeModelLoader?: ManagedGeoSpecNativeModelLoader;
    /** STEP loader exposed to authored tests through `geospec/step`. */
    stepLoader?: RunGeoSpecModuleOptions['stepLoader'];
    /** Additional in-memory modules made available to the VM. */
    builtinModules?: RunGeoSpecModuleOptions['builtinModules'];
    /** Post a message to the pool host. */
    postMessage: (message: GeoSpecPoolWorkerMessage) => void;
    /** Subscribe to pool-host messages. */
    onHostMessage: (listener: (message: GeoSpecPoolHostMessage) => void) => void;
    /** Sample this worker's resident memory in bytes (R15 telemetry); optional. */
    measureMemoryBytes?: () => number | undefined;
    /** Release platform resources on shutdown (after the shared scope disposes). */
    onShutdown?: () => Promise<void> | void;
}

GeoSpecPoolHostMessage: {
    type: 'initialize';
    compiledWasmModule?: WebAssembly.Module;
} | {
    type: 'run-shard';
    shard: GeoSpecPoolShard;
    testNamePattern?: string;
    testTimeout?: number;
    matcherWallBackstop?: number;
    forensic?: boolean;
} | {
    /** List-only collection pass: register tests, run no bodies (R3 splitting). */
    type: 'list-tests';
    shardId: number;
    file: string;
    testTimeout?: number;
    matcherWallBackstop?: number;
    forensic?: boolean;
} | {
    type: 'shutdown';
}

// One schedulable work unit
GeoSpecPoolShard: {
    /** Stable shard id, unique within one pool run. */
    id: number;
    /** GeoSpec file this shard executes. */
    file: string;
    /** Exact-test pattern for split shards (R3: `(file, testNamePattern)` work units). */
    testNamePattern?: string;
}

GeoSpecPoolWorkerHandle: {
    postMessage(message: GeoSpecPoolHostMessage): void;
    onMessage(listener: (message: GeoSpecPoolWorkerMessage) => void): void;
    onExit(listener: (details: {
        unexpected: boolean;
        message?: string;
    }) => void): void;
    /** Hard-stop the worker thread (R11 watchdog primitive). */
    terminate(): Promise<void> | void;
}

GeoSpecPoolWorkerMessage: {
    type: 'ready';
} | {
    type: 'initialized';
} | {
    type: 'initialization-error';
    message: string;
} | {
    type: 'file-start';
    shardId: number;
    file: string;
} | {
    type: 'forensic';
    shardId: number;
    name: string;
    value: number;
    unit: 'milliseconds' | 'count';
} | {
    type: 'tests-listed';
    shardId: number;
    file: string;
    names: string[];
} | {
    type: 'list-error';
    shardId: number;
    file: string;
    message: string;
} | {
    type: 'shard-complete';
    shardId: number;
    file: string;
    result: GeoSpecRunResult;
    durationMs: number;
    primaryLoadKey?: string;
    /** Worker-isolate resident memory at completion (heap + external), bytes. */
    workerMemoryBytes?: number;
} | {
    type: 'shard-error';
    shardId: number;
    file: string;
    message: string;
}

// One structured forensic measurement emitted by a runner
GeoSpecForensicEvent: {
    type: 'forensic';
    name: string;
    value: number;
    unit: 'milliseconds' | 'count';
    shardId?: number;
}

// Public GeoSpec runner lifecycle surface
GeoSpecRunner: {
    /** Execute GeoSpec files and return a compact aggregate result. */
    run(options: GeoSpecRunnerRunOptions): Promise<GeoSpecRunnerResult>;
    /** Subscribe to one lifecycle event type. */
    on<Type extends GeoSpecRunnerEvent['type']>(event: Type, handler: (event: Extract<GeoSpecRunnerEvent, {
        type: Type;
    }>) => void): () => void;
    /** Request cooperative abort before the next file starts. */
    abort(reason?: string): void;
    /** Close the runner and release owned resources. */
    close(): Promise<void>;
}

// Lifecycle event emitted by GeoSpec worker-style runners
GeoSpecRunnerEvent: {
    type: 'run-start';
    files: readonly string[];
} | {
    type: 'file-start';
    file: string;
} | {
    type: 'file-complete';
    file: string;
    result: GeoSpecRunResult;
    durationMs?: number;
    primaryLoadKey?: string;
    workerMemoryBytes?: number;
} | {
    type: 'run-complete';
    result: GeoSpecRunnerResult;
} | GeoSpecForensicEvent | {
    type: 'abort';
    reason?: string;
} | {
    type: 'close';
}

// One GeoSpec test file executed by a worker-style runner
GeoSpecRunnerFileResult: {
    /** Absolute or project-relative GeoSpec test file path supplied to the runner. */
    file: string;
    /** Low-level module execution result for this file. */
    result: GeoSpecRunResult;
    /** Wall-clock cost of executing this file, in milliseconds (R1). */
    durationMs?: number;
    /** First deterministic model-load cache key observed in this file (R9 affinity telemetry). */
    primaryLoadKey?: string;
    /** Executing worker's isolate-resident memory at file completion, in bytes (R15 memory-class telemetry). */
    workerMemoryBytes?: number;
}

// Shared options for Node and browser GeoSpec runner factories
GeoSpecRunnerOptions: {
    /** Filesystem containing the project and test modules. */
    filesystem: VmFileSystem;
    /** Model loader exposed to authored tests through `geospec/model`. */
    modelLoader?: RunGeoSpecModuleOptions['modelLoader'];
    /** Protocol-3 assertion client used by explicitly native runners. */
    nativeAssertions?: RunGeoSpecModuleOptions['nativeAssertions'];
    /** Managed native model loader released after each settled run. */
    nativeModelLoader?: ManagedGeoSpecNativeModelLoader;
    /** STEP loader exposed to authored tests through `geospec/step`. */
    stepLoader?: RunGeoSpecModuleOptions['stepLoader'];
    /** Additional in-memory modules made available to the VM. */
    builtinModules?: RunGeoSpecModuleOptions['builtinModules'];
    /** Internal profile counters used by opt-in benchmark tooling. */
    internalProfile?: GeoSpecRunProfile;
}

// Aggregate result returned by GeoSpec worker-style runners
GeoSpecRunnerResult: {
    /** True when no files or tests failed and at least one test was selected. */
    success: boolean;
    /** Number of non-skipped tests that passed. */
    passed: number;
    /** Number of file-level or test-level failures. */
    failed: number;
    /** Number of collected tests after filters were applied. */
    selectedTests: number;
    /** Per-file module execution results. */
    files: GeoSpecRunnerFileResult[];
    /** Run-level issues such as aborts or empty filter selections. */
    issues?: VmIssue[];
    /** Wall-clock cost of the whole run, in milliseconds (R1). */
    durationMs?: number;
    /** Complete requested-file accounting; discovery may remain unknown in unstarted or broken modules. */
    accounting?: GeoSpecRunnerAccounting;
    /** Coherence of the consumed source graphs, not a geometry verdict. */
    lineageStatus?: 'complete' | 'unavailable' | 'mixed';
}

// Options accepted by a GeoSpec worker-style runner run
GeoSpecRunnerRunOptions: {
    /** GeoSpec test files to execute. Files run serially by default. */
    files: readonly string[];
    /** JavaScript regular expression matched against full `suite > test` names. */
    testNamePattern?: string | RegExp;
    /** Timeout for each async test callback, in milliseconds. */
    testTimeout?: number;
    /** Non-verdict matcher wall backstop. Milliseconds. */
    matcherWallBackstop?: number;
    /** Emit structured forensic measurements for this run. */
    forensic?: boolean;
    /**
     * Stop after the first failing file (R1). Interactive fail-fast only —
     * never the default for reward runs, which want the complete red set.
     */
    bail?: boolean;
}

// One parsed segment of a selector path (`name`, `name[3]`, or selector-side `name[*]`)
SelectorPathSegment: {
    /** Bare segment name without index. */
    name: string;
    /** 1-based member index when the segment is `name[n]`. */
    index?: number;
    /** True when the segment is the selector-side wildcard `name[*]`. */
    wildcard?: boolean;
}

// Tolerance vocabulary consumed by selector predicates
SelectorTolerances: {
    /** Linear/contact tolerance in millimetres (offset bands, `near`, radii). */
    linearMm: number;
    /** Angular tolerance in degrees for normal/axis/parallelism predicates. */
    angularToleranceDegrees: number;
}

// Axis query predicates over cylindrical/conical face facts
AxisQuery: {
    /** Axis direction parallelism. */
    axis?: DirectionPredicate;
    radius?: NumericRange;
    near?: Partial<Vec3Record> & {
        tolerance?: number;
    };
    containsPoint?: Vec3;
    nearestTo?: Vec3;
    within?: GeometrySelector;
    orderBy?: 'radius' | 'offsetAlong';
    along?: Vec3;
    pick?: 'first' | 'last' | number;
    allOf?: AxisQuery[];
    anyOf?: AxisQuery[];
    not?: AxisQuery;
}

// Axis selector resolved from cylindrical/conical face facts
AxisSelector: {
    kind: 'axis';
    of?: string | RegExp;
    query?: AxisQuery;
    expect?: Cardinality;
}

// Body query predicates over per-occurrence solid aggregates
BodyQuery: {
    area?: NumericRange;
    near?: Partial<Vec3Record> & {
        tolerance?: number;
    };
    nearestTo?: Vec3;
    within?: GeometrySelector;
    orderBy?: 'area' | 'offsetAlong';
    along?: Vec3;
    pick?: 'first' | 'last' | number;
    allOf?: BodyQuery[];
    anyOf?: BodyQuery[];
    not?: BodyQuery;
}

// Body selector
BodySelector: {
    kind: 'body';
    of?: string | RegExp;
    query?: BodyQuery;
    expect?: Cardinality;
}

// Ranked candidate reported on ambiguous/unmatched resolutions, with the disambiguating facts and — for near-misses — the excluding predicate
CandidateEntity: ResolvedEntity & {
    /** 1-based deterministic rank. */
    rank: number;
    /** Name of the predicate that excluded this near-miss candidate. */
    excludedBy?: string;
    /** Probe distance in millimetres, when a probe ranked this candidate. */
    distance?: number;
}

// Cardinality expectation for a selector resolution (master catalog G7)
Cardinality: 'one' | 'many' | {
    exactly: number;
} | {
    atLeast: number;
}

// Datum selector
DatumSelector: {
    kind: 'datum';
    /** Full datum name, or part-relative name when `of` scopes an occurrence. */
    name: string;
    of?: string | RegExp;
    expect?: Cardinality;
}

// Direction predicate with optional angular tolerance in degrees
DirectionPredicate: {
    direction: Vec3;
    angularToleranceDegrees?: number;
}

// Face query predicates (master catalog G1/G2)
FaceQuery: {
    surfaceType?: SelectorSurfaceType;
    /** Face normal parallelism (planar faces). */
    normal?: DirectionPredicate;
    /** Rotation-axis parallelism (cylindrical/conical faces). */
    axis?: DirectionPredicate;
    radius?: NumericRange;
    area?: NumericRange;
    /** Plane offset band: signed distance of the plane from the origin. */
    offset?: NumericRange;
    /** Centroid coordinate bands, per-axis. */
    near?: Partial<Vec3Record> & {
        tolerance?: number;
    };
    /** Probe: point lying on the face surface (bounds + analytic residual). */
    containsPoint?: Vec3;
    /** Probe: face whose centroid is nearest to the point; ties are ambiguous. */
    nearestTo?: Vec3;
    /** Probe: first face hit by the ray (analytic plane/cylinder only in V1). */
    hitByRay?: RayPredicate;
    /** Restrict candidates to entities resolved by another selector. */
    within?: GeometrySelector;
    /** Deterministic ordering; `offsetAlong` projects centroids on `along`. */
    orderBy?: 'area' | 'radius' | 'offsetAlong';
    /** Projection direction for `orderBy: 'offsetAlong'`. */
    along?: Vec3;
    /** Deterministic pick after ordering: `'first' | 'last'` or 0-based index. */
    pick?: 'first' | 'last' | number;
    allOf?: FaceQuery[];
    anyOf?: FaceQuery[];
    not?: FaceQuery;
}

// Face selector resolved via query/probe predicates
FaceSelector: {
    kind: 'face';
    of?: string | RegExp;
    query?: FaceQuery;
    expect?: Cardinality;
}

// Typed geometric facts carried by a resolved entity — full `Vec3` normals/axes in the subject frame, never principal-axis projections
GeometryFacts: {
    surfaceType?: SelectorSurfaceType;
    normal?: Vec3;
    offset?: number;
    axisOrigin?: Vec3;
    axisDirection?: Vec3;
    radius?: number;
    area?: number;
    centroid?: Vec3;
    bounds?: {
        min: Vec3;
        max: Vec3;
    };
    /** Datum frame origin (subject frame). */
    origin?: Vec3;
    /** Datum frame x axis (subject frame). */
    xAxis?: Vec3;
    /** Datum frame z axis (subject frame). */
    zAxis?: Vec3;
    /** Occurrence placement transform (4x4 row-major, part-local → subject). */
    transform?: number[];
    productName?: string;
    faceIndex?: number;
    /** Group member count. */
    memberCount?: number;
}

// Structured result of resolving one selector against a selector index
GeometrySelection: {
    selector: GeometrySelector;
    status: GeometrySelectionStatus;
    /** Set-valued result (E4). */
    entities: ResolvedEntity[];
    expected: Cardinality;
    source: GeometrySelectionSource;
    stability: GeometrySelectionStability;
    /** Ranked candidates with facts — ambiguous/unmatched repair data. */
    candidates?: CandidateEntity[];
    diagnostics: GeometryDiagnostic[];
}

// Evidence source a selection resolved against
GeometrySelectionSource: 'step-xde' | 'brep' | 'mesh' | 'explicit'

// Durability-ladder stability class of a resolution
GeometrySelectionStability: 'authored' | 'derived-query' | 'derived-probe' | 'derived-ordinal' | 'explicit'

// Resolution status
GeometrySelectionStatus: 'resolved' | 'unmatched' | 'ambiguous' | 'unsupported'

// The V1 geometry selector union (D4 scope)
GeometrySelector: string | OccurrenceSelector | BodySelector | FaceSelector | AxisSelector | PlaneSelector | DatumSelector | InterfaceSelector | GroupSelector

// Group selector
GroupSelector: {
    kind: 'group';
    /** Full group prefix, or part-relative prefix when `of` scopes an occurrence. */
    name: string;
    of?: string | RegExp;
    expect?: Cardinality;
}

// Interface selector
InterfaceSelector: {
    kind: 'interface';
    /** Full interface name, or part-relative name when `of` scopes an occurrence. */
    name: string;
    of?: string | RegExp;
    expect?: Cardinality;
}

// Inclusive numeric band
NumericRange: number | {
    min?: number;
    max?: number;
}

// Occurrence selector
OccurrenceSelector: {
    kind: 'occurrence';
    /** Product or instance name to match. */
    name?: string | RegExp;
    /** Occurrence path (dot-joined instance segments, root omitted) to match. */
    path?: string | RegExp;
    expect?: Cardinality;
}

// Plane query predicates over planar face facts
PlaneQuery: {
    normal?: DirectionPredicate;
    offset?: NumericRange;
    area?: NumericRange;
    near?: Partial<Vec3Record> & {
        tolerance?: number;
    };
    containsPoint?: Vec3;
    nearestTo?: Vec3;
    within?: GeometrySelector;
    orderBy?: 'area' | 'offsetAlong';
    along?: Vec3;
    pick?: 'first' | 'last' | number;
    allOf?: PlaneQuery[];
    anyOf?: PlaneQuery[];
    not?: PlaneQuery;
}

// Plane selector resolved from planar face facts
PlaneSelector: {
    kind: 'plane';
    of?: string | RegExp;
    query?: PlaneQuery;
    expect?: Cardinality;
}

// Ray probe predicate (world-space origin and direction, millimetres)
RayPredicate: {
    origin: Vec3;
    direction: Vec3;
}

// One resolved geometry entity (index-local, snapshot-scoped identity)
ResolvedEntity: {
    id: string;
    entityType: ResolvedEntityType;
    occurrencePath?: string;
    facts: GeometryFacts;
    /** Snapshot topology ref (`'#o1.2.f7'`) for diagnostics and pinning. */
    topologyRef?: string;
}

// Entity kind a resolved entity denotes
ResolvedEntityType: 'occurrence' | 'body' | 'face' | 'axis' | 'plane' | 'datum' | 'interface' | 'group'

// Per-face analytic facts in the subject frame, matching the verification kernel's `faceFacts(occurrence)` JSON payload (SB1)
SelectorFaceFacts: {
    faceIndex: number;
    surfaceType: SelectorSurfaceType;
    normal?: Vec3;
    offset?: number;
    axisOrigin?: Vec3;
    axisDirection?: Vec3;
    radius?: number;
    area: number;
    centroid: Vec3;
    bounds: {
        min: Vec3;
        max: Vec3;
    };
}

// Surface classification carried by selector face facts, matching the verification kernel's `faceFacts` payload vocabulary
SelectorSurfaceType: 'plane' | 'cylinder' | 'cone' | 'sphere' | 'torus' | 'bspline' | 'other'

// JSON-serialized RegExp representation used by selector serialization
SerializedRegExp: {
    __isRegExp: true;
    pattern: string;
    flags: string;
}

// Cartesian coordinate record used by coordinate-band (`near`) predicates
Vec3Record: {
    x: number;
    y: number;
    z: number;
}

// Inputs for {@link buildSelectorIndex}
BuildSelectorIndexOptions: {
    xde: XdeReadResult;
    faceFactsByOccurrence: SelectorFaceFactsTable;
}

// One per-occurrence solid aggregate row backing body selectors
SelectorBodyRow: {
    id: string;
    occurrencePath: string;
    /** Total face area (mm²). */
    area: number;
    /** Area-weighted centroid of the occurrence's faces. */
    centroid?: Vec3;
    bounds?: {
        min: Vec3;
        max: Vec3;
    };
}

// One materialized datum row (subject frame)
SelectorDatumRow: {
    id: string;
    fullName: string;
    occurrencePath: string;
    name: string;
    origin: Vec3;
    xAxis: Vec3;
    zAxis: Vec3;
}

// Per-occurrence face facts keyed by occurrence path, matching the verification kernel's `faceFacts(occurrence)` payload
SelectorFaceFactsTable: Record<string, {
    faces: SelectorFaceFacts[];
} | undefined>

// One BRep face row with subject-frame analytic facts
SelectorFaceRow: {
    id: string;
    occurrencePath: string;
    faceIndex: number;
    facts: SelectorFaceFacts;
    /** Snapshot topology ref, e.g. `#o1.f7`. */
    topologyRef: string;
}

// One reconstructed group row (shared `prefix[i]` family per occurrence)
SelectorGroupRow: {
    id: string;
    fullName: string;
    occurrencePath: string;
    /** Part-relative group prefix. */
    name: string;
    /** Members ordered by 1-based index. */
    members: SelectorInterfaceRow[];
    /** The members' 1-based indices, ascending. */
    memberIndices: number[];
}

// The per-subject selector index consumed by the L3 resolution engine
SelectorIndex: {
    occurrences: SelectorOccurrenceRow[];
    faces: SelectorFaceRow[];
    bodies: SelectorBodyRow[];
    interfaces: SelectorInterfaceRow[];
    datums: SelectorDatumRow[];
    groups: SelectorGroupRow[];
    diagnostics: GeometryDiagnostic[];
}

// One authored interface record joining a subshape name to its face row
SelectorInterfaceRow: {
    id: string;
    /** Composed full name: `${occurrencePath}.${name}`. */
    fullName: string;
    occurrencePath: string;
    /** Part-relative authored name. */
    name: string;
    faceIndex: number;
    /** Entity kinds derived from the carrier face's geometry (profile rule). */
    entityKinds: ResolvedEntityType[];
    /** True when the named `faceIndex` no longer exists in the geometry. */
    dangling: boolean;
    face?: SelectorFaceRow;
}

// One placed occurrence row in the selector index
SelectorOccurrenceRow: {
    path: string;
    productName: string;
    instanceName?: string;
    /** 4x4 row-major placement transform (part-local frame → subject frame). */
    transform: number[];
    shapeIndex: number;
    /** 1-based ordinal path in the occurrence tree (snapshot refs `#o1.2`). */
    ordinalPath: number[];
    /** Union of the occurrence's face bounds (subject frame), when faces exist. */
    bounds?: {
        min: Vec3;
        max: Vec3;
    };
}

// Payload accepted by the selector diagnostic builders
SelectorDiagnosticOptions: {
    selector: GeometrySelector;
    stability: GeometrySelectionStability;
    message: string;
    suggestion: string;
    /** Ranked candidates or near-misses with disambiguating facts. */
    candidates?: CandidateEntity[];
    /** Extra structured payload merged into `details`. */
    details?: Record<string, unknown>;
}

// A configured STEP loader
GeoSpecStepLoader: (options: LoadStepOptions) => Promise<GeometrySubject>

// The five lazily materialized BRep evidence facets
// Remarks: Facet → evidence-field ownership: - `summary` → `topologyCounts`, `boundingBox` - `massProperties` → `massProperties` - `validity` → `validity` - `faceFeatures` → `planarFaces`, `cylindricalFaces`, `circularHoles`, `circularHolePatterns`, `chamferFeatures`, `filletFeatures` - `wallThickness` → `minimumWallThickness`
BrepFacetName: 'summary' | 'massProperties' | 'validity' | 'faceFeatures' | 'wallThickness'

// Defaults accepted by {@link import ('./load-step.js').createStepLoader}
CreateStepLoaderOptions: Omit<LoadStepOptions, 'source'>

// Options for loading STEP/XDE/BRep evidence
LoadStepOptions: {
    source: StepSource;
    unit?: GeoSpecUnit;
    streaming?: StepStreamingMode;
    mesh?: boolean;
    meshLinearTolerance?: number;
    meshAngularToleranceDegrees?: number;
    maxBytes?: number;
    signal?: AbortSignal;
    onProgress?: (event: StepLoadProgressEvent) => void;
    parameters?: Record<string, unknown>;
    path?: string;
    name?: string;
}

// Progress event emitted while GeoSpec normalizes a STEP source
StepLoadProgressEvent: {
    phase: 'read-source' | 'parse-step' | 'mesh-brep';
    bytesRead?: number;
}

// STEP source forms accepted by {@link import ('./load-step.js').loadStep}
StepSource: string | URL | Uint8Array<ArrayBuffer> | ArrayBuffer | Blob | File | ReadableStream<Uint8Array<ArrayBuffer>> | AsyncIterable<Uint8Array<ArrayBuffer>>

// STEP reader strategy used by GeoSpec
StepStreamingMode: 'auto' | 'native-stream' | 'filesystem'

// One native AP242 datum placement row (a coordinate *frame* from the supplemental-geometry channel), expanded per occurrence like subshape names and expressed in subject-frame coordinates
// Remarks: Distinct from {@link XdeSemanticDatum}: this is supplemental geometry (`AXIS2_PLACEMENT_3D` items in a CONSTRUCTIVE_GEOMETRY_REPRESENTATION), not the GD&T `DATUM` family.
XdeDatumPlacement: {
    occurrencePath: string;
    name: string;
    origin: [number, number, number];
    xAxis: [number, number, number];
    zAxis: [number, number, number];
}

// One GD&T datum reference frame (`DATUM_SYSTEM`) with its precedence compartments, expanded per occurrence of the owning product
XdeDatumSystem: {
    occurrencePath: string;
    name: string;
    /** Compartments in precedence order; each holds one or more datum labels (common datums). */
    references: string[][];
}

// One placed occurrence recovered from an AP242 STEP structure read
// Remarks: `path` is dot-joined instance-name segments from the root (root omitted) per the GeoSpec AP242 profile; repeated names under one parent are disambiguated `name[k]` in the parent's stored component order.
XdeOccurrence: {
    path: string;
    productName: string;
    instanceName?: string;
    /** 4x4 row-major placement transform (part-local frame -> subject frame). */
    transform: number[];
    /** Index into the native result's retained shape table (proof calls use it). */
    shapeIndex: number;
    /** Analytic axis-aligned bounds of the placed occurrence in subject space. */
    bounds?: {
        min: [number, number, number];
        max: [number, number, number];
    };
}

// Structured AP242 read result produced by the GeoSpec verification kernel's XDE reader (SB1)
XdeReadResult: {
    occurrences: XdeOccurrence[];
    subshapeNames: XdeSubshapeName[];
    datumPlacements: XdeDatumPlacement[];
    /** Semantic GD&T datums (the `DATUM` family) — empty for graphical-only files. */
    semanticDatums: XdeSemanticDatum[];
    /** GD&T datum reference frames (`DATUM_SYSTEM`). */
    datumSystems: XdeDatumSystem[];
    /** Supplemental-geometry `PLANE` items. */
    supplementalPlanes: XdeSupplementalPlane[];
    /** Free (non-assembly) top-level shapes — the flat-export degenerate case. */
    freeShapeCount: number;
}

// One semantic GD&T datum (`DATUM` + `DATUM_FEATURE` family) recovered from an AP242 file, attached to product faces via GEOMETRIC_ITEM_SPECIFIC_USAGE and expanded per occurrence of the owning product
XdeSemanticDatum: {
    occurrencePath: string;
    /** The GD&T datum identification letter(s): 'A', 'B', … */
    label: string;
    /** DATUM_FEATURE name when the file authored one. */
    featureName?: string;
    /** Attached faces in the owning product's deterministic face traversal order. */
    faceIndexes: number[];
}

// One part-relative authored subshape name, expanded per occurrence of the owning product (full selector name = `${occurrencePath}.${name}`)
XdeSubshapeName: {
    occurrencePath: string;
    name: string;
    shapeType: 'face' | 'edge' | 'vertex' | 'solid';
    /** Index within the owning product shape's deterministic face traversal order. */
    faceIndex: number;
}

// One supplemental-geometry `PLANE` item (e.g
XdeSupplementalPlane: {
    occurrencePath: string;
    name: string;
    origin: [number, number, number];
    normal: [number, number, number];
}

// Runner-independent native assertion client
GeoSpecAssertionClient: {
    expectGeo(subject: GeoSpecNativeSubject | GeoSpecSubject): GeoSpecAssertionMatchers;
    query(options: MinimumDistanceQuery): Promise<MinimumDistanceResult>;
    query(options: GeoSpecQueryOptions): Promise<GeoSpecCanonicalClaimReport>;
}

// Flat construction options for a runner-independent native assertion client
GeoSpecAssertionClientOptions: {
    readonly claimId?: (matcher: GeoSpecMatcherName, sequence: number) => string;
    readonly engine: GeoSpecNativeEngine;
    /** Success-evidence profile of every claim and query; omitted means `complete`. */
    readonly evidenceProfile?: GeoSpecNativeEvidenceProfile;
    readonly subjectSlot?: string;
    readonly workUnitLimit?: number;
}

// Standalone native matcher chain, including core-owned negation
GeoSpecAssertionMatchers: GeoSpecMatcherMethods<GeoSpecCanonicalClaimReport> & {
    readonly not: GeoSpecMatcherMethods<GeoSpecCanonicalClaimReport>;
}

// One authored call shared by the collector and native assertion client
GeoSpecAuthoringInvocation: {
    readonly arguments: readonly unknown[];
    readonly expected: unknown;
    readonly kind: GeoSpecAssertion['kind'];
    readonly matcher: GeoSpecMatcherName;
    readonly polarity: GeoSpecClaimPolarity;
    readonly subject: unknown;
}

// Matcher methods derived mechanically from the existing GeoSpec registry
GeoSpecMatcherMethods: {
    [Name in GeoSpecMatcherName]: (...arguments_: Parameters<GeoSpecMatcher[Name]>) => Result;
}

// One positive-only ancillary query
// Remarks: An explicit claimId leaves the automatic sequence unchanged. Queries return full reports, including failed/refused reports, without assertion errors.
GeoSpecQueryOptions: {
    readonly capability: GeoSpecQueryCapability;
    readonly claimId?: string;
    readonly payload?: unknown;
    readonly subject: GeoSpecNativeSubject;
}

// Complete native minimum and ordered finite witnesses in canonical millimetres/Z-up
MinimumDistanceFact: {
    readonly source: 'ap242';
    readonly assurance: 'exact-brep';
    readonly unit: 'mm';
    readonly coordinateSystem: 'z-up';
    readonly subjectHash: string;
    readonly algorithmProfile: 'geospec-minimum-distance-v1';
    readonly occurrences: readonly [string, string];
    readonly distance: number;
    readonly points: readonly [readonly [number, number, number], readonly [number, number, number]];
}

// Complete AP242 minimum over two subject-bound occurrence paths
MinimumDistanceQuery: {
    readonly capability: 'minimumDistance';
    readonly subject: GeoSpecNativeSubject;
    readonly payload: {
        readonly pair: readonly [{
            readonly occurrencePath: string;
        }, {
            readonly occurrencePath: string;
        }];
    };
}

// Geometry refusal and infrastructure interruption never masquerade as facts
MinimumDistanceResult: {
    readonly status: 'complete';
    readonly fact: MinimumDistanceFact;
} | {
    readonly status: 'refused';
    readonly code: 'unsupported-evidence' | 'invalid-selection' | 'work-limit';
    readonly message: string;
} | {
    readonly status: 'interrupted';
    readonly code: 'cancelled' | 'executor-exited' | 'deadline' | 'engine-error';
    readonly message: string;
}

// Flat native query transport options
GeoSpecNativeQueryOptions: Omit<GeoSpecNativeClaimOptions, 'arguments' | 'capability' | 'kind' | 'polarity'> & {
    readonly capability: GeoSpecQueryCapability | 'minimumDistance';
    readonly payload?: unknown;
}

// Existing positive-only ancillary operations owned by the native core
GeoSpecQueryCapability: Exclude<(typeof geoSpecQueryCapabilities)[number], 'minimumDistance'>

// Explicit support state for one source-attributed inventory field
GeoSpecPmiField: {
    readonly status: 'supported' | 'missing' | 'invalid' | 'ambiguous' | 'unsupported';
    readonly value: Value | null;
    readonly reason: string | null;
}

// Original Part21 entity ID and exact source argument tokens
GeoSpecPmiRawEntity: {
    readonly sourceId: number;
    readonly kind: string;
    readonly arguments: readonly string[];
}

// Source-authored scalar and Rust-normalized reduced rational millimetres
GeoSpecPmiNumber: {
    readonly sourceId: number;
    readonly authoredText: string;
    readonly unitId: number;
    readonly unitRecords: readonly GeoSpecPmiRawEntity[];
    readonly millimetres: string;
    readonly name: string;
}

// A uniquely forward-transferred face
GeoSpecPmiFaceAssociation: {
    readonly sourceFaceId: number;
    readonly occurrenceRoute: readonly number[];
    readonly occurrence: number | null;
    readonly publicFaceOrdinal: number;
}

// One ordered role reference, including incomplete source/transfer evidence
GeoSpecPmiShapeReference: {
    readonly sourceAspectId: number | null;
    readonly sourceUsageIds: readonly number[];
    readonly sourceItemIds: readonly number[];
    readonly requestedRoute: GeoSpecPmiField<readonly number[]>;
    readonly associations: GeoSpecPmiField<readonly GeoSpecPmiFaceAssociation[]>;
}

// Normalized authored limits
GeoSpecPmiLimits: {
    readonly lowerMillimetres: string;
    readonly upperMillimetres: string;
    readonly basis: 'authored-limits' | 'nominal-plus-minus';
}

// Source record preserving semantic/presentation separation and ordered roles
GeoSpecPmiRecord: {
    readonly sourceId: number;
    readonly family: 'dimension' | 'datum' | 'tolerance' | 'presentation';
    readonly channel: 'semantic' | 'presentation';
    readonly kind: string;
    readonly name: GeoSpecPmiField<string>;
    readonly first: readonly GeoSpecPmiShapeReference[];
    readonly second: readonly GeoSpecPmiShapeReference[];
    readonly numbers: GeoSpecPmiField<readonly GeoSpecPmiNumber[]>;
    readonly limits: GeoSpecPmiField<GeoSpecPmiLimits>;
    readonly interpretation: GeoSpecPmiField<string>;
    readonly raw: readonly GeoSpecPmiRawEntity[];
}

// Positive-only inventory value inside the ordinary canonical query report
GeoSpecPmiInventory: {
    readonly contract: 'geospec.pmi.inventory/v1';
    readonly status: 'semantic' | 'graphical-only' | 'empty';
    readonly fileSchema: string;
    readonly editionValidation: 'not-validated';
    readonly records: readonly GeoSpecPmiRecord[];
}
