# geospec — Types (2)

75 top-level symbols. Signatures are verbatim typescript.

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

  color: string

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

  color: string

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
  engine: GeoSpecNativeModelEngine

  // Rooted host reader for direct filesystem or URL sources
  readSource: GeoSpecNativeSourceReader

  // Geometry format to export when an individual call does not specify one
  format: GeoSpecModelFormat

  // Runtime client or lazy runtime factory
  runtime: GeoSpecRuntimeClient | GeoSpecRuntimeClientFactory

  // Source-specific runtime adapters, e.g
  sourceAdapters: readonly GeoSpecRuntimeSourceAdapter[]

  // Project root used by runtime integrations
  projectPath: string

  // STEP reader strategy used for STEP sources or exports
  stepStreaming: StepStreamingMode

  // Whether STEP loading should also produce mesh evidence
  mesh: boolean

  // Linear tolerance used while meshing exact BRep evidence
  meshLinearTolerance: number

  // Angular tolerance in degrees used while meshing exact BRep evidence
  meshAngularToleranceDegrees: number

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
  format: GeoSpecModelFormat

  // Explicit parameters passed to the runtime
  parameters: Record<string, unknown>

  // Runtime client or lazy runtime factory
  runtime: GeoSpecRuntimeClient | GeoSpecRuntimeClientFactory

  // Source-specific runtime adapters, e.g
  sourceAdapters: readonly GeoSpecRuntimeSourceAdapter[]

  // Project root used by runtime integrations
  projectPath: string

  // STEP reader strategy used for STEP exports
  stepStreaming: StepStreamingMode

  // Whether STEP loading should also produce mesh evidence
  mesh: boolean

  // Linear tolerance used while meshing exact BRep evidence
  meshLinearTolerance: number

  // Angular tolerance in degrees used while meshing exact BRep evidence
  meshAngularToleranceDegrees: number

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
  projectPath: string

  // Geometry format to export
  format: GeoSpecModelFormat

  // Explicit parameters passed to the runtime
  parameters: Record<string, unknown>

  // Runtime client or lazy runtime factory
  runtime: GeoSpecRuntimeClient | GeoSpecRuntimeClientFactory

  // Source-specific runtime adapters, e.g
  sourceAdapters: readonly GeoSpecRuntimeSourceAdapter[]

  // STEP reader strategy used for STEP exports
  stepStreaming: StepStreamingMode

  // Whether STEP loading should also produce mesh evidence
  mesh: boolean

  // Linear tolerance used while meshing exact BRep evidence
  meshLinearTolerance: number

  // Angular tolerance in degrees used while meshing exact BRep evidence
  meshAngularToleranceDegrees: number

// Options accepted by {@link import ('./load-model.js').loadModel}
LoadModelOptions: LoadModelSourceOptions | LoadModelCodeOptions<Code> | LoadModelFileOptions

  // Geometry format to export
  format: GeoSpecModelFormat

  // Explicit parameters passed to the runtime
  parameters: Record<string, unknown>

  // STEP reader strategy used for STEP exports
  stepStreaming: StepStreamingMode

  // Whether STEP loading should also produce mesh evidence
  mesh: boolean

  // Linear tolerance used while meshing exact BRep evidence
  meshLinearTolerance: number

  // Angular tolerance in degrees used while meshing exact BRep evidence
  meshAngularToleranceDegrees: number

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
  resources: ReadonlyArray<{
          readonly name: string;
          readonly source: MeshSource | StepSource;
      }>

  // Source geometry format
  format: GeoSpecModelFormat

  // Source path recorded in provenance
  path: string

  // Human-readable source name recorded in provenance
  name: string

  // Coordinate unit of raw GLB/glTF or mesh-buffer data before canonical millimetre normalization
  sourceUnit: GeoSpecUnit

  // Explicit parameters recorded in provenance
  parameters: Record<string, unknown>

  // STEP reader strategy used for STEP sources
  stepStreaming: StepStreamingMode

  // Whether STEP loading should also produce mesh evidence
  mesh: boolean

  // Linear tolerance used while meshing exact BRep evidence
  meshLinearTolerance: number

  // Angular tolerance in degrees used while meshing exact BRep evidence
  meshAngularToleranceDegrees: number

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

  broadPhase: RelationshipBroadPhase

  final: RelationshipFinalEvidence

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

  topologyRef: string

  // Where the witness points came from
  provenance: 'mesh'

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

  matcherWallBackstop: number

  forensic: boolean

  nativeAssertions: GeoSpecAssertionClientOptions

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

  filesystem: GeoSpecDiscoveryFileSystem

  projectPath: string

  files: readonly string[]

  include: readonly string[]

  exclude: readonly string[]

  ignoredDirectories: readonly string[]

// File kind returned by a GeoSpec discovery filesystem
GeoSpecDiscoveryFileKind: 'file' | 'directory'

// Minimal stat object required for recursive GeoSpec test discovery
GeoSpecDiscoveryFileStat: {
    kind: GeoSpecDiscoveryFileKind;
}

  kind: GeoSpecDiscoveryFileKind

// Minimal filesystem contract used by GeoSpec test discovery
GeoSpecDiscoveryFileSystem: {
    readdir(path: string): Promise<readonly string[]>;
    stat(path: string): Promise<GeoSpecDiscoveryFileStat>;
}

  // GeoSpecDiscoveryFileSystem.readdir (method)
  readdir(path: string): Promise<readonly string[]>;

  // GeoSpecDiscoveryFileSystem.stat (method)
  stat(path: string): Promise<GeoSpecDiscoveryFileStat>;

// Result returned by recursive GeoSpec test discovery
GeoSpecDiscoveryResult: {
    files: string[];
    unmatchedRoots: string[];
}

  files: string[]

  unmatchedRoots: string[]

// Worker-local cache for successful GeoSpec bundles
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

  bundle: BundleResult

  accounting: GeoSpecTestAccounting

  lineage: GeoSpecRunLineage

  // Tests registered before a module execution failure, including their retained assertions
  tests: GeoSpecTestCase[]

// Result returned by {@link import ('./run-geospec-module.js').runGeoSpecModule}
GeoSpecRunResult: GeoSpecRunSuccess | GeoSpecRunFailure

  success: false

  bundle: BundleResult

  accounting: GeoSpecTestAccounting

  lineage: GeoSpecRunLineage

  // Tests registered before a module execution failure, including their retained assertions
  tests: GeoSpecTestCase[]

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

  accounting: GeoSpecTestAccounting

  lineage: GeoSpecRunLineage

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
  ordinal: number

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
  durationMs: number

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

  // Filesystem containing the test module and its project imports
  filesystem: VmFileSystem

  // Absolute ESM test entry path
  entryPath: string

  // JavaScript regular expression matched against full `suite > test` names
  testNamePattern: string | RegExp

  // Timeout for async test callbacks, in milliseconds
  testTimeout: number

  // Milliseconds
  matcherWallBackstop: number

  // Emit structured forensic events for this run
  forensic: boolean

  // Host-provided protocol-3 compiled assertion client
  nativeAssertions: GeoSpecAssertionClientOptions

  // Host-composed identity loader
  nativeModelLoader: (options: Parameters<GeoSpecNativeModelLoader>[0]) => Promise<GeoSpecNativeSubject & {
          readonly load?: GeoSpecModelLoadEvidence;
      }>

  // Model loader exposed to VM tests through `geospec/model`
  modelLoader: GeoSpecModelLoader

  // STEP loader exposed to VM tests through `geospec/step`
  stepLoader: GeoSpecStepLoader

  // Additional in-memory modules made available to the VM
  builtinModules: Record<string, BuiltinModule>

  // Internal profile counters used by opt-in benchmark tooling
  internalProfile: GeoSpecRunProfile

  // Successful bundle cache owned by a serial runner worker
  bundleCache: GeoSpecModuleBundleCache

  // List-only collection pass (R3 shard splitting)
  collectOnly: boolean

// Native assertion options whose engine can also admit and release subjects
GeoSpecNativeRunnerAssertions: Omit<GeoSpecAssertionClientOptions, 'engine'> & {
    readonly engine: GeoSpecNativeModelEngine;
}

  claimId: (matcher: GeoSpecMatcherName, sequence: number) => string

  // Success-evidence profile of every claim and query
  evidenceProfile: GeoSpecNativeEvidenceProfile

  subjectSlot: string

  workUnitLimit: number

  engine: GeoSpecNativeModelEngine

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
  builtinModules: RunGeoSpecModuleOptions['builtinModules']

  // Internal profile counters used by opt-in benchmark tooling
  internalProfile: GeoSpecRunProfile

  // Actual protocol-3 engine used by authored assertions
  nativeAssertions: GeoSpecNativeRunnerAssertions

  // Optional managed loader
  nativeModelLoader: ManagedGeoSpecNativeModelLoader

  // Defaults used when the runner constructs its own native loader
  model: Omit<CreateGeoSpecNativeModelLoaderOptions, 'engine'>

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

  engine: GeoSpecNativeModelEngine

  format: Extract<GeoSpecModelFormat, 'glb' | 'step' | 'stp'>

  projectPath: string

  readSource: GeoSpecNativeSourceReader

  runtime: GeoSpecRuntimeClient | GeoSpecRuntimeClientFactory

  sourceAdapters: readonly GeoSpecRuntimeSourceAdapter[]

  // Subject handles carried between the release scopes of loaders that share one engine, keyed by subjectHash
  carried: Map<string, unknown>

// Native additions accepted by the injected `geospec/runner/native` loader
GeoSpecNativeLoadModelOptions: LoadModelOptions<Code> & {
    /** Ordered external resource payloads declared to the native admission request. */
    readonly resources?: readonly GeoSpecNativeModelResource[];
    /** Format-specific native ingest options. */
    readonly ingestOptions?: Readonly<Record<string, unknown>>;
}

  // Geometry format to export
  format: GeoSpecModelFormat

  // Explicit parameters passed to the runtime
  parameters: Record<string, unknown>

  // STEP reader strategy used for STEP exports
  stepStreaming: StepStreamingMode

  // Whether STEP loading should also produce mesh evidence
  mesh: boolean

  // Linear tolerance used while meshing exact BRep evidence
  meshLinearTolerance: number

  // Angular tolerance in degrees used while meshing exact BRep evidence
  meshAngularToleranceDegrees: number

  // Ordered external resource payloads declared to the native admission request
  resources: readonly GeoSpecNativeModelResource[]

  // Format-specific native ingest options
  ingestOptions: Readonly<Record<string, unknown>>

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
GeoSpecNativeModelLoader: <Code extends Record<string, string> = Record<string, string>>(options: GeoSpecNativeLoadModelOptions<Code>) => Promise<GeoSpecNativeModelSubject>

// Subject identity returned by native STEP/GLB admission
GeoSpecNativeModelSubject: GeoSpecNativeSubject & {
    readonly subjectHash: string;
    /** Exact successful-load evidence retained by the admitting host, when available. */
    readonly load?: GeoSpecModelLoadEvidence;
}

  contentHash: string

  subjectHash: string

  // Exact successful-load evidence retained by the admitting host, when available
  load: GeoSpecModelLoadEvidence

// One named external resource referenced by a direct glTF-family source
GeoSpecNativeModelResource: {
    readonly name: string;
    readonly source: LoadModelSourceOptions['source'];
}

  name: string

  source: LoadModelSourceOptions['source']

// Resolve a non-memory source into ordinary ArrayBuffer-backed bytes
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
  modelLoader: RunGeoSpecModuleOptions['modelLoader']

  // Protocol-3 assertion client used by explicitly native runners
  nativeAssertions: RunGeoSpecModuleOptions['nativeAssertions']

  // Managed native model loader released after each settled run
  nativeModelLoader: ManagedGeoSpecNativeModelLoader

  // STEP loader exposed to authored tests through `geospec/step`
  stepLoader: RunGeoSpecModuleOptions['stepLoader']

  // Additional in-memory modules made available to the VM
  builtinModules: RunGeoSpecModuleOptions['builtinModules']

  // Internal profile counters used by opt-in benchmark tooling
  internalProfile: GeoSpecRunProfile

  // Absolute project root path
  projectPath: string

  // Enable the authenticated persistent evidence cache
  cache: boolean

  // Absolute out-of-tree evidence-cache directory
  cacheDirectory: string

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
  workers: number

  // Per-shard non-verdict watchdog override, milliseconds (R11)
  shardTimeout: number

  // Persistent reference-engine evidence caching is unsupported
  cache: boolean

  // Reference-engine cache directories are unsupported and refused when supplied
  cacheDirectory: string

  // Reference-engine runtime factories are unsupported and refused when supplied
  runtimeFactoryModule: {
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
  modelLoader: RunGeoSpecModuleOptions['modelLoader']

  // Protocol-3 assertion client used by explicitly native runners
  nativeAssertions: RunGeoSpecModuleOptions['nativeAssertions']

  // Managed native model loader released after each settled run
  nativeModelLoader: ManagedGeoSpecNativeModelLoader

  // STEP loader exposed to authored tests through `geospec/step`
  stepLoader: RunGeoSpecModuleOptions['stepLoader']

  // Additional in-memory modules made available to the VM
  builtinModules: RunGeoSpecModuleOptions['builtinModules']

  // Internal profile counters used by opt-in benchmark tooling
  internalProfile: GeoSpecRunProfile

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
  workers: number

  // Per-shard non-verdict watchdog override, milliseconds (R11)
  shardTimeout: number

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
  modelLoader: RunGeoSpecModuleOptions['modelLoader']

  // Native assertion client shared with this worker's model admissions
  nativeAssertions: RunGeoSpecModuleOptions['nativeAssertions']

  // Managed native admissions, released after every shard and collection pass and before shutdown
  nativeModelLoader: ManagedGeoSpecNativeModelLoader

  // STEP loader exposed to authored tests through `geospec/step`
  stepLoader: RunGeoSpecModuleOptions['stepLoader']

  // Additional in-memory modules made available to the VM
  builtinModules: RunGeoSpecModuleOptions['builtinModules']

  // Post a message to the pool host
  postMessage: (message: GeoSpecPoolWorkerMessage) => void

  // Subscribe to pool-host messages
  onHostMessage: (listener: (message: GeoSpecPoolHostMessage) => void) => void

  // Sample this worker's resident memory in bytes (R15 telemetry)
  measureMemoryBytes: () => number | undefined

  // Release platform resources on shutdown (after the shared scope disposes)
  onShutdown: () => Promise<void> | void

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
  testNamePattern: string

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

  shardId: number

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

  // Absolute or project-relative GeoSpec test file path supplied to the runner
  file: string

  // Low-level module execution result for this file
  result: GeoSpecRunResult

  // Wall-clock cost of executing this file, in milliseconds (R1)
  durationMs: number

  // First deterministic model-load cache key observed in this file (R9 affinity telemetry)
  primaryLoadKey: string

  // Executing worker's isolate-resident memory at file completion, in bytes (R15 memory-class telemetry)
  workerMemoryBytes: number

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

  // Filesystem containing the project and test modules
  filesystem: VmFileSystem

  // Model loader exposed to authored tests through `geospec/model`
  modelLoader: RunGeoSpecModuleOptions['modelLoader']

  // Protocol-3 assertion client used by explicitly native runners
  nativeAssertions: RunGeoSpecModuleOptions['nativeAssertions']

  // Managed native model loader released after each settled run
  nativeModelLoader: ManagedGeoSpecNativeModelLoader

  // STEP loader exposed to authored tests through `geospec/step`
  stepLoader: RunGeoSpecModuleOptions['stepLoader']

  // Additional in-memory modules made available to the VM
  builtinModules: RunGeoSpecModuleOptions['builtinModules']

  // Internal profile counters used by opt-in benchmark tooling
  internalProfile: GeoSpecRunProfile

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

  // True when no files or tests failed and at least one test was selected
  success: boolean

  // Number of non-skipped tests that passed
  passed: number

  // Number of file-level or test-level failures
  failed: number

  // Number of collected tests after filters were applied
  selectedTests: number

  // Per-file module execution results
  files: GeoSpecRunnerFileResult[]

  // Run-level issues such as aborts or empty filter selections
  issues: VmIssue[]

  // Wall-clock cost of the whole run, in milliseconds (R1)
  durationMs: number

  // Complete requested-file accounting
  accounting: GeoSpecRunnerAccounting

  // Coherence of the consumed source graphs, not a geometry verdict
  lineageStatus: 'complete' | 'unavailable' | 'mixed'

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

  // GeoSpec test files to execute
  files: readonly string[]

  // JavaScript regular expression matched against full `suite > test` names
  testNamePattern: string | RegExp

  // Timeout for each async test callback, in milliseconds
  testTimeout: number

  // Non-verdict matcher wall backstop
  matcherWallBackstop: number

  // Emit structured forensic measurements for this run
  forensic: boolean

  // Stop after the first failing file (R1)
  bail: boolean

// One parsed segment of a selector path (`name`, `name[3]`, or selector-side `name[*]`)
SelectorPathSegment: {
    /** Bare segment name without index. */
    name: string;
    /** 1-based member index when the segment is `name[n]`. */
    index?: number;
    /** True when the segment is the selector-side wildcard `name[*]`. */
    wildcard?: boolean;
}

  // Bare segment name without index
  name: string

  // 1-based member index when the segment is `name[n]`
  index: number

  // True when the segment is the selector-side wildcard `name[*]`
  wildcard: boolean

// Tolerance vocabulary consumed by selector predicates
SelectorTolerances: {
    /** Linear/contact tolerance in millimetres (offset bands, `near`, radii). */
    linearMm: number;
    /** Angular tolerance in degrees for normal/axis/parallelism predicates. */
    angularToleranceDegrees: number;
}

  // Linear/contact tolerance in millimetres (offset bands, `near`, radii)
  linearMm: number

  // Angular tolerance in degrees for normal/axis/parallelism predicates
  angularToleranceDegrees: number

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

  // Axis direction parallelism
  axis: DirectionPredicate

  radius: NumericRange

  near: Partial<Vec3Record> & {
          tolerance?: number;
      }

  containsPoint: Vec3

  nearestTo: Vec3

  within: GeometrySelector

  orderBy: 'radius' | 'offsetAlong'

  along: Vec3

  pick: 'first' | 'last' | number

  allOf: AxisQuery[]

  anyOf: AxisQuery[]

  not: AxisQuery

// Axis selector resolved from cylindrical/conical face facts
AxisSelector: {
    kind: 'axis';
    of?: string | RegExp;
    query?: AxisQuery;
    expect?: Cardinality;
}

  kind: 'axis'

  of: string | RegExp

  query: AxisQuery

  expect: Cardinality

// Body query predicates over available source facts
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

  area: NumericRange

  near: Partial<Vec3Record> & {
          tolerance?: number;
      }

  nearestTo: Vec3

  within: GeometrySelector

  orderBy: 'area' | 'offsetAlong'

  along: Vec3

  pick: 'first' | 'last' | number

  allOf: BodyQuery[]

  anyOf: BodyQuery[]

  not: BodyQuery
