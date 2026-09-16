# geospec — Types

143 top-level symbols. Signatures are verbatim typescript.

// Stateful GeoSpec API created by {@link createGeoSpec}
GeoSpec: {
    loadMesh(options: LoadMeshOptions): Promise<LoadMeshResult>;
    analyzeMesh(options: AnalyzeMeshOptions): Promise<AnalyzeMeshResult>;
}

// Geometry units accepted at GeoSpec evidence-loading boundaries
GeoSpecUnit: 'mm' | 'cm' | 'm' | 'in' | 'ft' | (string & {})

// Geometry assertion collected from a GeoSpec test module
GeoSpecAssertion: {
    /** Assertion kind. */
    kind: 'boundingBox' | 'connectedComponents' | 'watertight' | 'componentInterference' | 'assemblyOccurrences' | 'spatialRelationships' | 'meshIntegrity' | 'noDiagnostics' | 'surfaceArea' | 'volume' | 'mass' | 'centerOfMass' | 'validBrep' | 'topologyCounts' | 'stepUnits' | 'productStructure' | 'planarFace' | 'cylindricalFace' | 'circularHole' | 'circularHolePattern' | 'chamferFeature' | 'filletFeature' | 'minimumWallThickness' | 'voidContinuity';
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
    min?: Vec3 | GeoSpecAxisExpectation;
    max?: Vec3 | GeoSpecAxisExpectation;
    size?: GeoSpecAxisExpectation;
    center?: GeoSpecAxisExpectation;
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
    center?: GeoSpecAxisExpectation;
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
    kind: 'intentionalInterference';
    left: GeoSpecComponentSelector;
    right: GeoSpecComponentSelector;
    maxVolume?: number;
    reason: string;
}

// Component-interference expectation accepted by `expectGeo(...).toHaveNoComponentInterference(...)`
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
    center?: GeoSpecAxisExpectation;
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
GeoSpecModelLoader: <Code extends Record<string, string> = Record<string, string>>(options: LoadModelOptions<Code>) => Promise<GeometrySubject>

// A configured loader whose shared runtime can be released with its owner
ManagedGeoSpecModelLoader: GeoSpecModelLoader & {
    dispose(): Promise<void>;
}

GeoSpecRuntimeClient: {
    connect(): Promise<void>;
    terminate(): void;
    on?(event: 'telemetry', handler: (entries: Array<{
        name: string;
        duration: number;
        startTime: number;
        workerTimeOrigin: number;
    }>) => void): () => void;
    export<const Format extends GeoSpecRuntimeExportFormat, const Files extends RuntimeSourceFiles = RuntimeSourceFiles>(format: Format, options?: {
        readonly source?: RuntimeSource<Files>;
        readonly parameters?: Record<string, unknown>;
        readonly exportOptions?: Record<string, unknown>;
    }): Promise<ExportResult>;
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

// Compiled Vitest-style test-name pattern used by a GeoSpec run
GeoSpecTestNamePattern: RegExp

// Options for recursive GeoSpec test discovery
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
GeoSpecDiscoveryFileSystem: {
    readdir(path: string): Promise<readonly string[]>;
    stat(path: string): Promise<GeoSpecDiscoveryFileStat>;
}

// Result returned by recursive GeoSpec test discovery
GeoSpecDiscoveryResult: {
    files: string[];
    unmatchedRoots: string[];
}

// Worker-local cache for successful GeoSpec bundles
GeoSpecModuleBundleCache: Map<string, {
    builtinIdentity: string;
    runToken: string;
    bundle: BundleResult;
    dependencyContents: ReadonlyMap<string, Uint8Array<ArrayBuffer>>;
}>

// Failed GeoSpec run result
GeoSpecRunFailure: {
    success: false;
    issues: VmIssue[];
    bundle?: BundleResult;
}

// Result returned by {@link import ('./run-geospec-module.js').runGeoSpecModule}
GeoSpecRunResult: GeoSpecRunSuccess | GeoSpecRunFailure

// Successful GeoSpec run result
GeoSpecRunSuccess: {
    success: true;
    /** True when every collected test passed or was skipped. */
    passed: boolean;
    tests: GeoSpecTestCase[];
    bundle: BundleResult;
}

// A collected GeoSpec test case
GeoSpecTestCase: {
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
GeoSpecTestStatus: 'passed' | 'failed' | 'skipped'

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
    /** Worker count; omit for auto-sizing (`min(shards, cpus − 2, mem/3.5 GiB)`). */
    workers?: number;
    /** Per-shard non-verdict watchdog override, milliseconds (R11). */
    shardTimeout?: number;
    /** Enable the authenticated persistent evidence cache. Defaults to true. */
    cache?: boolean;
    /** Absolute out-of-tree evidence-cache directory used by every worker. */
    cacheDirectory?: string;
    /** Node module exporting the runtime factory every worker should use. */
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

// A configured STEP loader
GeoSpecStepLoader: (options: LoadStepOptions) => Promise<GeometrySubject>

// The five lazily materialized BRep evidence facets
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
