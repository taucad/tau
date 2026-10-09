# geospec — Types (2)

75 top-level symbols. Signatures are verbatim typescript.

// Structured payload when `boundingBox` fails
BoundingBoxFailure: {
    axisFailures: BoundingBoxAxisFailure[];
}

  axisFailures: BoundingBoxAxisFailure[]

// Scene bounding box with per-primitive contributors in the subject's unit and frame
BoundingBoxStats: {
    size: [number, number, number];
    center: [number, number, number];
    primitives: PrimitiveRecord[];
}

  size: [number, number, number]

  center: [number, number, number]

  primitives: PrimitiveRecord[]

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

  passed: true

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

  fromLabel: string

  toLabel: string

  axis: 'x' | 'y' | 'z'

  // Millimetres — clearance between the two named primitives' AABBs
  gapMm: number

  fromPrimitive: string

  toPrimitive: string

// One spatial cluster from AABB overlap grouping
ClusterReport: {
    label: string;
    primitives: PrimitiveRecord[];
    aabb: AabbMeters;
    centroid: [number, number, number];
    totalVertices: number;
}

  label: string

  primitives: PrimitiveRecord[]

  aabb: AabbMeters

  centroid: [number, number, number]

  totalVertices: number

// Structured payload when `connectedComponents` fails
ConnectedComponentsFailure: {
    expected: number;
    got: number;
    toleranceMm: number;
    clusters: ClusterReport[];
    gaps: ClusterGap[];
}

  expected: number

  got: number

  toleranceMm: number

  clusters: ClusterReport[]

  gaps: ClusterGap[]

// Full connected-components analysis at one tolerance
ConnectedComponentsResult: {
    count: number;
    clusters: ClusterReport[];
    gaps: ClusterGap[];
}

  count: number

  clusters: ClusterReport[]

  gaps: ClusterGap[]

// Diagnostic form permitted inside a wire-safe subject snapshot
GeometryEvidenceDiagnostic: Omit<GeometryDiagnostic, 'details'> & {
    details?: JSONValue;
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

  details?: JSONValue

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

  vertexCount: number

  meshCount: number

  triangleCount: number

  meshQuality: MeshQualityStats

  watertight: boolean

  boundingBox?: BoundingBoxStats

// One TRIANGLES primitive with identity for spatial-test feedback
PrimitiveRecord: {
    /** The glTF node / mesh name (from kernel ShapeConfig.name when present). */
    name: string;
    color?: string;
    vertices: number;
    aabb: AabbMeters;
}

  // The glTF node / mesh name (from kernel ShapeConfig.name when present)
  name: string

  color?: string

  vertices: number

  aabb: AabbMeters

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

  // Edges with incidence ≠ 2 (open or non-manifold)
  irregularEdges: number

  // Edges shared by exactly one triangle (open boundary)
  openBoundaryEdges: number

  // Edges shared by more than two triangles (over-adjacent/non-manifold)
  nonManifoldEdges: number

  irregularEdgeKindCounts: {
          openBoundary: number;
          nonManifold: number;
      }

  irregularEdgeClusters: WatertightIrregularEdgeCluster[]

  irregularEdgeFraction: number

  perPrimitive: WatertightPrimitiveBreakdown[]

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

  kind: WatertightIrregularEdgeKind

  edgeCount: number

  aabb: {
          min: Vec3;
          max: Vec3;
          center: Vec3;
      }

  samples: WatertightIrregularEdgeSample[]

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

  start: Vec3

  end: Vec3

  center: Vec3

  incidentTriangleCount: number

  primitives: string[]

  color?: string

// Per-primitive watertight diagnostic (local tessellation only)
WatertightPrimitiveBreakdown: {
    name: string;
    boundaryEdges: number;
    loopCentroid: [number, number, number];
}

  name: string

  boundaryEdges: number

  loopCentroid: [number, number, number]

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

  watertight: boolean

  irregularEdges: number

  openBoundaryEdges: number

  nonManifoldEdges: number

  irregularEdgeKindCounts: {
          openBoundary: number;
          nonManifold: number;
      }

  irregularEdgeClusters: WatertightIrregularEdgeCluster[]

  totalEdges: number

  irregularEdgeFraction: number

  perPrimitive: WatertightPrimitiveBreakdown[]

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

  open: (input: Pick<Parameters<RuntimeClient['open']>[0], 'source' | 'parameters' | 'stage' | 'watch' | 'signal'>) => Pick<ReturnType<RuntimeClient['open']>, 'export' | 'close'>

  // RuntimeClientWithRoutes.on (method)
  on?(event: 'telemetry', handler: (batch: {
          readonly entries: ReadonlyArray<{
              name: string;
              duration: number;
              startTime: number;
              workerTimeOrigin: number;
          }>;
      }) => void): () => void;

  // RuntimeClientWithRoutes.bestRouteFor (method)
  bestRouteFor(format: string, options?: {
          readonly kernelId?: string;
      }): GeoSpecExportRoute | undefined;

// Resolved runtime export request and provenance for a GeoSpec model load
RuntimeExportIntent: {
    options: Record<string, unknown>;
    provenance: GeometryExportIntent;
    sourceUnit: GeoSpecUnit;
}

  options: Record<string, unknown>

  provenance: GeometryExportIntent

  sourceUnit: GeoSpecUnit

// Structured failure returned when a runtime cannot provide the requested GeoSpec evidence
RuntimeExportIntentFailure: {
    success: false;
    diagnostics: GeometryDiagnostic[];
}

  success: false

  diagnostics: GeometryDiagnostic[]

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

  // Initialized compiled engine supplied by the host, never selected by an authored spec
  engine?: GeoSpecNativeModelEngine

  // Rooted host reader for direct filesystem or URL sources
  readSource?: GeoSpecNativeSourceReader

  // Geometry format to export when an individual call does not specify one
  format?: GeoSpecModelFormat

  // Runtime client or lazy runtime factory
  runtime?: GeoSpecRuntimeClient | GeoSpecRuntimeClientFactory

  // Source-specific runtime adapters, e.g
  sourceAdapters?: readonly GeoSpecRuntimeSourceAdapter[]

  // Project root used by runtime integrations
  projectPath?: string

  // STEP reader strategy used for STEP sources or exports
  stepStreaming?: StepStreamingMode

  // Whether STEP loading should also produce mesh evidence
  mesh?: boolean

  // Linear tolerance used while meshing exact BRep evidence
  meshLinearTolerance?: number

  // Angular tolerance in degrees used while meshing exact BRep evidence
  meshAngularToleranceDegrees?: number

// Geometry formats accepted by {@link import ('./load-model.js').loadModel}
GeoSpecModelFormat: MeshFileFormat | 'step' | 'stp'

// Function shape used by GeoSpec runners to provide model loading inside VM executed test files
GeoSpecModelLoader: <Code extends Record<string, string> = Record<string, string>>(options: LoadModelOptions<Code>) => Promise<GeoSpecSubject>

// A configured loader whose shared runtime can be released with its owner
ManagedGeoSpecModelLoader: GeoSpecModelLoader & {
    dispose(): Promise<void>;
}

  // ManagedGeoSpecModelLoader.dispose (method)
  dispose(): Promise<void>;

// Runtime client surface consumed by `geospec/model`
// Remarks: GeoSpec accepts concrete Tau runtime clients from multiple call sites but only needs connection lifecycle and request-scoped documents. Keep this shape small so typed runtime clients do not have to widen their full generic method surface to GeoSpec's testing DSL. A client with `shutdown` is awaited through it when GeoSpec releases an owned runtime, so its host resources are closed before the caller (for example a worker thread) exits.
GeoSpecRuntimeClient: Pick<RuntimeClient, 'connect' | 'terminate'> & Partial<Pick<RuntimeClient, 'shutdown'>> & {
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

  open: (input: Pick<Parameters<RuntimeClient['open']>[0], 'source' | 'parameters' | 'stage' | 'watch' | 'signal'>) => Pick<ReturnType<RuntimeClient['open']>, 'export' | 'close'>

  // GeoSpecRuntimeClient.on (method)
  on?(event: 'telemetry', handler: (batch: {
          readonly entries: ReadonlyArray<{
              name: string;
              duration: number;
              startTime: number;
              workerTimeOrigin: number;
          }>;
      }) => void): () => void;

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

  id: string

  extensions: readonly string[]

  // GeoSpecRuntimeSourceAdapter.createRuntime (method)
  createRuntime(options: {
          projectPath?: string;
          file?: string;
      }): Promise<GeoSpecRuntimeClient>;

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

  // Source files keyed by project-relative path
  code: Code

  // Entry path to render from {@link code }
  file: keyof Code & string

  // Geometry format to export
  format?: GeoSpecModelFormat

  // Explicit parameters passed to the runtime
  parameters?: Record<string, unknown>

  // Runtime client or lazy runtime factory
  runtime?: GeoSpecRuntimeClient | GeoSpecRuntimeClientFactory

  // Source-specific runtime adapters, e.g
  sourceAdapters?: readonly GeoSpecRuntimeSourceAdapter[]

  // Project root used by runtime integrations
  projectPath?: string

  // STEP reader strategy used for STEP exports
  stepStreaming?: StepStreamingMode

  // Whether STEP loading should also produce mesh evidence
  mesh?: boolean

  // Linear tolerance used while meshing exact BRep evidence
  meshLinearTolerance?: number

  // Angular tolerance in degrees used while meshing exact BRep evidence
  meshAngularToleranceDegrees?: number

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

  // Project-relative model file to render
  file: string

  // Project root used by runtime integrations
  projectPath?: string

  // Geometry format to export
  format?: GeoSpecModelFormat

  // Explicit parameters passed to the runtime
  parameters?: Record<string, unknown>

  // Runtime client or lazy runtime factory
  runtime?: GeoSpecRuntimeClient | GeoSpecRuntimeClientFactory

  // Source-specific runtime adapters, e.g
  sourceAdapters?: readonly GeoSpecRuntimeSourceAdapter[]

  // STEP reader strategy used for STEP exports
  stepStreaming?: StepStreamingMode

  // Whether STEP loading should also produce mesh evidence
  mesh?: boolean

  // Linear tolerance used while meshing exact BRep evidence
  meshLinearTolerance?: number

  // Angular tolerance in degrees used while meshing exact BRep evidence
  meshAngularToleranceDegrees?: number

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

  // Geometry bytes, path, browser file/blob, or in-memory mesh buffer
  source: MeshSource | StepSource

  // Named external resources consumed alongside the direct geometry bytes
  resources?: ReadonlyArray<{
          readonly name: string;
          readonly source: MeshSource | StepSource;
      }>

  // Source geometry format
  format?: GeoSpecModelFormat

  // Source path recorded in provenance
  path?: string

  // Human-readable source name recorded in provenance
  name?: string

  // Coordinate unit of raw GLB/glTF or mesh-buffer data before canonical millimetre normalization
  sourceUnit?: GeoSpecUnit

  // Explicit parameters recorded in provenance
  parameters?: Record<string, unknown>

  // STEP reader strategy used for STEP sources
  stepStreaming?: StepStreamingMode

  // Whether STEP loading should also produce mesh evidence
  mesh?: boolean

  // Linear tolerance used while meshing exact BRep evidence
  meshLinearTolerance?: number

  // Angular tolerance in degrees used while meshing exact BRep evidence
  meshAngularToleranceDegrees?: number

// Labeled broad-phase record
RelationshipBroadPhase: {
    method: 'aabb' | 'mesh-overlap';
    candidate: boolean;
    detail: string;
}

  method: 'aabb' | 'mesh-overlap'

  candidate: boolean

  detail: string

// Selector resolution summary attached to relationship diagnostics so every failure names both endpoints with their stability class (R7)
RelationshipEndpointReport: {
    role: 'subject' | 'target';
    selection: GeometrySelection;
}

  role: 'subject' | 'target'

  selection: GeometrySelection

// Structured result of one relationship proof (L4)
RelationshipEvidence: {
    verdict: 'pass' | 'fail' | 'unsupported';
    broadPhase?: RelationshipBroadPhase;
    final?: RelationshipFinalEvidence;
    /** `GEOSPEC_SPATIAL_RELATIONSHIP_MISMATCH` on fail; policy codes otherwise. */
    diagnostics: GeometryDiagnostic[];
}

  verdict: 'pass' | 'fail' | 'unsupported'

  broadPhase?: RelationshipBroadPhase

  final?: RelationshipFinalEvidence

  // `GEOSPEC_SPATIAL_RELATIONSHIP_MISMATCH` on fail
  diagnostics: GeometryDiagnostic[]

// Final exact-evidence record for a relationship verdict
RelationshipFinalEvidence: {
    method: 'extrema' | 'analytic' | 'classification' | 'boolean-intersection';
    /** Measured values in millimetres/degrees (shared unit contract). */
    measured: Record<string, number>;
    /** Expected values in millimetres/degrees (shared unit contract). */
    expected: Record<string, number>;
    witnesses: RelationshipWitness[];
}

  method: 'extrema' | 'analytic' | 'classification' | 'boolean-intersection'

  // Measured values in millimetres/degrees (shared unit contract)
  measured: Record<string, number>

  // Expected values in millimetres/degrees (shared unit contract)
  expected: Record<string, number>

  witnesses: RelationshipWitness[]

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

  kind: 'point' | 'axis' | 'plane'

  value: number[]

  topologyRef?: string

  // Where the witness points came from
  provenance?: 'mesh'

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

  tests: GeoSpecTestCase[]

  // GeoSpecCollector.describe (method)
  describe(name: string, function_: GeoSpecTestFunction): void;

  // GeoSpecCollector.describeSkip (method)
  describeSkip(name: string, _function?: GeoSpecTestFunction): void;

  // GeoSpecCollector.it (method)
  it(name: string, function_: GeoSpecTestFunction): void;

  // GeoSpecCollector.itSkip (method)
  itSkip(name: string, _function?: GeoSpecTestFunction): void;

  // GeoSpecCollector.expectGeo (method)
  expectGeo(subject: unknown): GeoSpecMatcher;

  // GeoSpecCollector.waitForCompletion (method)
  waitForCompletion(testTimeout?: number, testNamePattern?: GeoSpecTestNamePattern): Promise<void>;

// Native collector surface for hosts that explicitly supply a native engine
GeoSpecNativeCollector: Omit<GeoSpecCollector, 'expectGeo'> & {
    expectGeo(subject: unknown): GeoSpecMatcher;
}

  tests: GeoSpecTestCase[]

  // GeoSpecNativeCollector.describe (method)
  describe(name: string, function_: GeoSpecTestFunction): void;

  // GeoSpecNativeCollector.describeSkip (method)
  describeSkip(name: string, _function?: GeoSpecTestFunction): void;

  // GeoSpecNativeCollector.it (method)
  it(name: string, function_: GeoSpecTestFunction): void;

  // GeoSpecNativeCollector.itSkip (method)
  itSkip(name: string, _function?: GeoSpecTestFunction): void;

  // GeoSpecNativeCollector.waitForCompletion (method)
  waitForCompletion(testTimeout?: number, testNamePattern?: GeoSpecTestNamePattern): Promise<void>;

  // GeoSpecNativeCollector.expectGeo (method)
  expectGeo(subject: unknown): GeoSpecMatcher;

// Per-module collector configuration
GeoSpecCollectorOptions: {
    matcherWallBackstop?: number;
    forensic?: boolean;
    nativeAssertions?: GeoSpecAssertionClientOptions;
}

  matcherWallBackstop?: number

  forensic?: boolean

  nativeAssertions?: GeoSpecAssertionClientOptions

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

  filesystem: GeoSpecDiscoveryFileSystem

  projectPath: string

  files?: readonly string[]

  include?: readonly string[]

  exclude?: readonly string[]

  ignoredDirectories?: readonly string[]

// File kind returned by a GeoSpec discovery filesystem
GeoSpecDiscoveryFileKind: 'file' | 'directory'

// Minimal stat object required for recursive GeoSpec test discovery
GeoSpecDiscoveryFileStat: {
    kind: GeoSpecDiscoveryFileKind;
}

  kind: GeoSpecDiscoveryFileKind

// Minimal filesystem contract used by GeoSpec test discovery
// Remarks: Browser workers, Node CLI hosts, and embedded runners adapt their native filesystem APIs to this shape so discovery has one shared behavior.
GeoSpecDiscoveryFileSystem: {
    readdir(path: string): Promise<readonly string[]>;
    stat(path: string): Promise<GeoSpecDiscoveryFileStat>;
}

  // GeoSpecDiscoveryFileSystem.readdir (method)
  readdir(path: string): Promise<readonly string[]>;

  // GeoSpecDiscoveryFileSystem.stat (method)
  stat(path: string): Promise<GeoSpecDiscoveryFileStat>;

// Result returned by recursive GeoSpec test discovery
// Remarks: `files` are project-relative, sorted, and de-duplicated. `unmatchedRoots` contains requested file or directory roots that did not select any GeoSpec files.
GeoSpecDiscoveryResult: {
    files: string[];
    unmatchedRoots: string[];
}

  files: string[]

  unmatchedRoots: string[]

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

  success: false

  issues: VmIssue[]

  bundle?: BundleResult

  accounting?: GeoSpecTestAccounting

  lineage?: GeoSpecRunLineage

  // Tests registered before a module execution failure, including their retained assertions
  tests?: GeoSpecTestCase[]

// Result returned by {@link import ('./run-geospec-module.js').runGeoSpecModule}
GeoSpecRunResult: GeoSpecRunSuccess | GeoSpecRunFailure

  success: false

  bundle?: BundleResult

  accounting?: GeoSpecTestAccounting

  lineage?: GeoSpecRunLineage

  // Tests registered before a module execution failure, including their retained assertions
  tests?: GeoSpecTestCase[]

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

  success: true

  // True only when selected tests completed successfully with coherent available lineage
  passed: boolean

  tests: GeoSpecTestCase[]

  bundle: BundleResult

  accounting?: GeoSpecTestAccounting

  lineage?: GeoSpecRunLineage

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

  // Registration ordinal before filtering, scoped to the source module's collection
  ordinal?: number

  // Hierarchical suite path
  suite: string[]

  // Test case name
  name: string

  // Assertions produced by the test callback
  assertions: GeoSpecAssertion[]

  // Final test status
  status: GeoSpecTestStatus

  // Structured diagnostics emitted by test execution
  diagnostics: GeometryDiagnostic[]

  // Wall-clock cost of the test body plus its pending assertions, in milliseconds (R1)
  durationMs?: number

// Test case status after runner collection
GeoSpecTestStatus: 'passed' | 'failed' | 'unsupported' | 'inconclusive' | 'not-run' | 'skipped'

// Options for executing a GeoSpec ESM test module
RunGeoSpecModuleOptions: {
    /** Filesystem containing the test module and its project imports. */
    filesystem: VmFileSystem;
    /** Filesystem-root-relative ESM test entry path. */
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

  // Filesystem containing the test module and its project imports
  filesystem: VmFileSystem

  // Filesystem-root-relative ESM test entry path
  entryPath: string

  // JavaScript regular expression matched against full `suite > test` names
  testNamePattern?: string | RegExp

  // Timeout for async test callbacks, in milliseconds
  testTimeout?: number

  // Milliseconds
  matcherWallBackstop?: number

  // Emit structured forensic events for this run
  forensic?: boolean

  // Host-provided protocol-3 compiled assertion client
  nativeAssertions?: GeoSpecAssertionClientOptions

  // Host-composed identity loader
  nativeModelLoader?: (options: Parameters<GeoSpecNativeModelLoader>[0]) => Promise<GeoSpecNativeSubject & {
          readonly load?: GeoSpecModelLoadEvidence;
      }>

  // Model loader exposed to VM tests through `geospec/model`
  modelLoader?: GeoSpecModelLoader

  // STEP loader exposed to VM tests through `geospec/step`
  stepLoader?: GeoSpecStepLoader

  // Additional in-memory modules made available to the VM
  builtinModules?: Record<string, BuiltinModule>

  // Internal profile counters used by opt-in benchmark tooling
  internalProfile?: GeoSpecRunProfile

  // Successful bundle cache owned by a serial runner worker
  bundleCache?: GeoSpecModuleBundleCache

  // List-only collection pass (R3 shard splitting)
  collectOnly?: boolean

// Native assertion options whose engine can also admit and release subjects
GeoSpecNativeRunnerAssertions: Omit<GeoSpecAssertionClientOptions, 'engine'> & {
    readonly engine: GeoSpecNativeModelEngine;
}

  readonly claimId?: (matcher: GeoSpecMatcherName, sequence: number) => string

  // Success-evidence profile of every claim and query
  readonly evidenceProfile?: GeoSpecNativeEvidenceProfile

  readonly subjectSlot?: string

  readonly workUnitLimit?: number

  readonly engine: GeoSpecNativeModelEngine

// Options for the native serial runner
GeoSpecNativeRunnerOptions: Omit<GeoSpecRunnerOptions, 'modelLoader' | 'nativeAssertions' | 'nativeModelLoader' | 'stepLoader'> & {
    /** Actual protocol-3 engine used by authored assertions. */
    readonly nativeAssertions: GeoSpecNativeRunnerAssertions;
    /** Optional managed loader; the runner releases its subjects after every run. */
    readonly nativeModelLoader?: ManagedGeoSpecNativeModelLoader;
    /** Defaults used when the runner constructs its own native loader. */
    readonly model?: Omit<CreateGeoSpecNativeModelLoaderOptions, 'engine'>;
}

  // Filesystem containing the project and test modules
  filesystem: VmFileSystem

  // Additional in-memory modules made available to the VM
  builtinModules?: RunGeoSpecModuleOptions['builtinModules']

  // Internal profile counters used by opt-in benchmark tooling
  internalProfile?: GeoSpecRunProfile

  // Actual protocol-3 engine used by authored assertions
  readonly nativeAssertions: GeoSpecNativeRunnerAssertions

  // Optional managed loader
  readonly nativeModelLoader?: ManagedGeoSpecNativeModelLoader

  // Defaults used when the runner constructs its own native loader
  readonly model?: Omit<CreateGeoSpecNativeModelLoaderOptions, 'engine'>

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

  readonly engine: GeoSpecNativeModelEngine

  readonly format?: Extract<GeoSpecModelFormat, 'glb' | 'step' | 'stp'>

  readonly projectPath?: string

  readonly readSource?: GeoSpecNativeSourceReader

  readonly runtime?: GeoSpecRuntimeClient | GeoSpecRuntimeClientFactory

  readonly sourceAdapters?: readonly GeoSpecRuntimeSourceAdapter[]

  // Subject handles carried between the release scopes of loaders that share one engine, keyed by subjectHash
  readonly carried?: Map<string, unknown>

// Native additions accepted by the injected `geospec/runner/native` loader
GeoSpecNativeLoadModelOptions: LoadModelOptions<Code> & {
    /** Ordered external resource payloads declared to the native admission request. */
    readonly resources?: readonly GeoSpecNativeModelResource[];
    /** Format-specific native ingest options. */
    readonly ingestOptions?: Readonly<Record<string, unknown>>;
}

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

  // Ordered external resource payloads declared to the native admission request
  readonly resources?: readonly GeoSpecNativeModelResource[]

  // Format-specific native ingest options
  readonly ingestOptions?: Readonly<Record<string, unknown>>

// Native engine operations required for model admission and run-level cleanup
GeoSpecNativeModelEngine: GeoSpecNativeEngine & {
    ingestSubject(request: Uint8Array<ArrayBuffer>, primary: Uint8Array<ArrayBuffer>, resources: ReadonlyArray<Uint8Array<ArrayBuffer>>): Uint8Array<ArrayBuffer>;
    subjectHandle(request: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>;
    releaseSubject(request: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>;
}

  // GeoSpecNativeModelEngine.evaluateClaim (method)
  evaluateClaim(request: Uint8Array<ArrayBuffer>): GeoSpecNativeClaimEvaluation;

  // GeoSpecNativeModelEngine.processRequest (method)
  processRequest(request: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>;

  // GeoSpecNativeModelEngine.ingestSubject (method)
  ingestSubject(request: Uint8Array<ArrayBuffer>, primary: Uint8Array<ArrayBuffer>, resources: ReadonlyArray<Uint8Array<ArrayBuffer>>): Uint8Array<ArrayBuffer>;

  // GeoSpecNativeModelEngine.subjectHandle (method)
  subjectHandle(request: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>;

  // GeoSpecNativeModelEngine.releaseSubject (method)
  releaseSubject(request: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>;

// Model loader injected into native VM runs
// Remarks: The freshness unit is one load: every call reads its source again (the source reader or a Runtime export) and the engine digests those exact bytes. Nothing is deduplicated per run or per scope; bytes equal to an admitted subject's reuse that subject by digest, length and descriptor, and edited bytes admit a new subject. Only concurrent identical inline-code Runtime loads share one in-flight export.
GeoSpecNativeModelLoader: <Code extends Record<string, string> = Record<string, string>>(options: GeoSpecNativeLoadModelOptions<Code>) => Promise<GeoSpecNativeModelSubject>

// Subject identity returned by native STEP/GLB admission
GeoSpecNativeModelSubject: GeoSpecNativeSubject & {
    readonly subjectHash: string;
    /** Exact successful-load evidence retained by the admitting host, when available. */
    readonly load?: GeoSpecModelLoadEvidence;
}

  readonly contentHash?: string

  readonly subjectHash?: string

  // Exact successful-load evidence retained by the admitting host, when available
  readonly load?: GeoSpecModelLoadEvidence

// One named external resource referenced by a direct glTF-family source
GeoSpecNativeModelResource: {
    readonly name: string;
    readonly source: LoadModelSourceOptions['source'];
}

  readonly name: string

  readonly source: LoadModelSourceOptions['source']

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

  // Drain registered admissions, including additions while drainage awaits, then release this scope's subjects (with a carrier
  // Remarks: Await the intended complete load chain before final release, and await this method before closing the caller-owned engine. Calls after it returns start a new scope requiring another release; future detached loads are not part of the completed scope.
  // ManagedGeoSpecNativeModelLoader.releaseAll (method)
  releaseAll(): Promise<void>;

// Options accepted by {@link createGeoSpecNodeRunner}
GeoSpecNodeRunnerOptions: GeoSpecRunnerOptions & {
    /** Absolute project root path. */
    projectPath: string;
    /** Enable the authenticated persistent evidence cache. Defaults to true. */
    cache?: boolean;
    /** Absolute out-of-tree evidence-cache directory. */
    cacheDirectory?: string;
}

  // Filesystem containing the project and test modules
  filesystem: VmFileSystem

  // Model loader exposed to authored tests through `geospec/model`
  modelLoader?: RunGeoSpecModuleOptions['modelLoader']

  // Protocol-3 assertion client used by explicitly native runners
  nativeAssertions?: RunGeoSpecModuleOptions['nativeAssertions']

  // Managed native model loader released after each settled run
  nativeModelLoader?: ManagedGeoSpecNativeModelLoader

  // STEP loader exposed to authored tests through `geospec/step`
  stepLoader?: RunGeoSpecModuleOptions['stepLoader']

  // Additional in-memory modules made available to the VM
  builtinModules?: RunGeoSpecModuleOptions['builtinModules']

  // Internal profile counters used by opt-in benchmark tooling
  internalProfile?: GeoSpecRunProfile

  // Absolute project root path
  projectPath: string

  // Enable the authenticated persistent evidence cache
  cache?: boolean

  // Absolute out-of-tree evidence-cache directory
  cacheDirectory?: string

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

  // Absolute project root path
  projectPath: string

  // Compiled worker count
  workers?: number

  // Per-shard non-verdict watchdog override, milliseconds (R11)
  shardTimeout?: number

  // Persistent reference-engine evidence caching is unsupported
  cache?: boolean

  // Reference-engine cache directories are unsupported and refused when supplied
  cacheDirectory?: string

  // Reference-engine runtime factories are unsupported and refused when supplied
  runtimeFactoryModule?: {
          /** Absolute URL or resolvable Node module specifier. */
          specifier: string;
          /** Named export with signature `(projectPath: string) => Promise<GeoSpecRuntimeClient>`. */
          exportName: string;
      }

// Options accepted by {@link createGeoSpecWebRunner}
GeoSpecWebRunnerOptions: GeoSpecRunnerOptions

  // Filesystem containing the project and test modules
  filesystem: VmFileSystem

  // Model loader exposed to authored tests through `geospec/model`
  modelLoader?: RunGeoSpecModuleOptions['modelLoader']

  // Protocol-3 assertion client used by explicitly native runners
  nativeAssertions?: RunGeoSpecModuleOptions['nativeAssertions']

  // Managed native model loader released after each settled run
  nativeModelLoader?: ManagedGeoSpecNativeModelLoader

  // STEP loader exposed to authored tests through `geospec/step`
  stepLoader?: RunGeoSpecModuleOptions['stepLoader']

  // Additional in-memory modules made available to the VM
  builtinModules?: RunGeoSpecModuleOptions['builtinModules']

  // Internal profile counters used by opt-in benchmark tooling
  internalProfile?: GeoSpecRunProfile

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

  // Spawn one pool worker whose script calls `startGeoSpecPoolWorkerHost` with the application's filesystem and loaders
  createWorker: () => WebWorkerLike | Promise<WebWorkerLike>

  // Worker count
  workers?: number

  // Per-shard non-verdict watchdog override, milliseconds (R11)
  shardTimeout?: number

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

  // Filesystem containing the project and test modules
  filesystem: RunGeoSpecModuleOptions['filesystem']

  // Model loader exposed to authored tests through `geospec/model`
  modelLoader?: RunGeoSpecModuleOptions['modelLoader']

  // Native assertion client shared with this worker's model admissions
  nativeAssertions?: RunGeoSpecModuleOptions['nativeAssertions']

  // Managed native admissions, released after every shard and collection pass and before shutdown
  nativeModelLoader?: ManagedGeoSpecNativeModelLoader

  // STEP loader exposed to authored tests through `geospec/step`
  stepLoader?: RunGeoSpecModuleOptions['stepLoader']

  // Additional in-memory modules made available to the VM
  builtinModules?: RunGeoSpecModuleOptions['builtinModules']

  // Post a message to the pool host
  postMessage: (message: GeoSpecPoolWorkerMessage) => void

  // Subscribe to pool-host messages
  onHostMessage: (listener: (message: GeoSpecPoolHostMessage) => void) => void

  // Sample this worker's resident memory in bytes (R15 telemetry)
  measureMemoryBytes?: () => number | undefined

  // Release platform resources on shutdown (after the shared scope disposes)
  onShutdown?: () => Promise<void> | void

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

  type: 'initialize'

// One schedulable work unit
GeoSpecPoolShard: {
    /** Stable shard id, unique within one pool run. */
    id: number;
    /** GeoSpec file this shard executes. */
    file: string;
    /** Exact-test pattern for split shards (R3: `(file, testNamePattern)` work units). */
    testNamePattern?: string;
}

  // Stable shard id, unique within one pool run
  id: number

  // GeoSpec file this shard executes
  file: string

  // Exact-test pattern for split shards (R3
  testNamePattern?: string

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

  // GeoSpecPoolWorkerHandle.postMessage (method)
  postMessage(message: GeoSpecPoolHostMessage): void;

  // GeoSpecPoolWorkerHandle.onMessage (method)
  onMessage(listener: (message: GeoSpecPoolWorkerMessage) => void): void;

  // GeoSpecPoolWorkerHandle.onExit (method)
  onExit(listener: (details: {
          unexpected: boolean;
          message?: string;
      }) => void): void;

  // Hard-stop the worker thread (R11 watchdog primitive)
  // GeoSpecPoolWorkerHandle.terminate (method)
  terminate(): Promise<void> | void;

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

  type: 'ready'

// One structured forensic measurement emitted by a runner
GeoSpecForensicEvent: {
    type: 'forensic';
    name: string;
    value: number;
    unit: 'milliseconds' | 'count';
    shardId?: number;
}

  type: 'forensic'

  name: string

  value: number

  unit: 'milliseconds' | 'count'

  shardId?: number

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

  // Execute GeoSpec files and return a compact aggregate result
  // GeoSpecRunner.run (method)
  run(options: GeoSpecRunnerRunOptions): Promise<GeoSpecRunnerResult>;

  // Subscribe to one lifecycle event type
  // GeoSpecRunner.on (method)
  on<Type extends GeoSpecRunnerEvent['type']>(event: Type, handler: (event: Extract<GeoSpecRunnerEvent, {
          type: Type;
      }>) => void): () => void;

  // Request cooperative abort before the next file starts
  // GeoSpecRunner.abort (method)
  abort(reason?: string): void;

  // Close the runner and release owned resources
  // GeoSpecRunner.close (method)
  close(): Promise<void>;

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

  type: 'forensic'
