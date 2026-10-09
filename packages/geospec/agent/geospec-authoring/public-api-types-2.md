# geospec — Types (2)

72 top-level symbols. Signatures are verbatim typescript.

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

// Per-module collector configuration
GeoSpecCollectorOptions: {
    matcherWallBackstop?: number;
    forensic?: boolean;
    nativeAssertions: GeoSpecAssertionClientOptions;
}

  matcherWallBackstop: number

  forensic: boolean

  nativeAssertions: GeoSpecAssertionClientOptions

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
    nativeAssertions: GeoSpecAssertionClientOptions;
    /** Host-composed identity loader; authored tests use the canonical `geospec/model` API. */
    nativeModelLoader?: (options: Parameters<GeoSpecNativeModelLoader>[0]) => Promise<GeoSpecNativeSubject & {
        readonly load?: GeoSpecModelLoadEvidence;
    }>;
    /** Additional in-memory modules made available to the VM. */
    builtinModules?: Record<string, BuiltinModule>;
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

  // Additional in-memory modules made available to the VM
  builtinModules: Record<string, BuiltinModule>

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
GeoSpecNativeRunnerOptions: Omit<GeoSpecRunnerOptions, 'nativeAssertions' | 'nativeModelLoader'> & {
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
// Remarks: The freshness unit is one load: every call reads its source again (the source reader or a Runtime export) and the engine digests those exact bytes. Nothing is deduplicated per run or per scope; bytes equal to an admitted subject's reuse that subject by digest, length and descriptor, and edited bytes admit a new subject. Only concurrent identical inline-code Runtime loads share one in-flight export.
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

GeoSpecPoolHostMessage: {
    type: 'initialize';
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

// Shared options for GeoSpec runner factories
GeoSpecRunnerOptions: {
    /** Filesystem containing the project and test modules. */
    filesystem: VmFileSystem;
    /** Protocol-3 assertion client shared by every authored assertion and model admission. */
    nativeAssertions: RunGeoSpecModuleOptions['nativeAssertions'];
    /** Managed native model loader released after each settled run. */
    nativeModelLoader?: ManagedGeoSpecNativeModelLoader;
    /** Additional in-memory modules made available to the VM. */
    builtinModules?: RunGeoSpecModuleOptions['builtinModules'];
}

  // Filesystem containing the project and test modules
  filesystem: VmFileSystem

  // Protocol-3 assertion client shared by every authored assertion and model admission
  nativeAssertions: RunGeoSpecModuleOptions['nativeAssertions']

  // Managed native model loader released after each settled run
  nativeModelLoader: ManagedGeoSpecNativeModelLoader

  // Additional in-memory modules made available to the VM
  builtinModules: RunGeoSpecModuleOptions['builtinModules']

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

// Runner-independent native assertion client
GeoSpecAssertionClient: {
    expectGeo(subject: GeoSpecNativeSubject | GeoSpecSubject): GeoSpecAssertionMatchers;
    query(options: MinimumDistanceQuery): Promise<MinimumDistanceResult>;
    query(options: GeoSpecQueryOptions): Promise<GeoSpecCanonicalClaimReport>;
}

  // GeoSpecAssertionClient.expectGeo (method)
  expectGeo(subject: GeoSpecNativeSubject | GeoSpecSubject): GeoSpecAssertionMatchers;

  // GeoSpecAssertionClient.query (method)
  query(options: MinimumDistanceQuery): Promise<MinimumDistanceResult>;
  query(options: GeoSpecQueryOptions): Promise<GeoSpecCanonicalClaimReport>;

// Flat construction options for a runner-independent native assertion client
GeoSpecAssertionClientOptions: {
    readonly claimId?: (matcher: GeoSpecMatcherName, sequence: number) => string;
    readonly engine: GeoSpecNativeEngine;
    /** Success-evidence profile of every claim and query; omitted means `complete`. */
    readonly evidenceProfile?: GeoSpecNativeEvidenceProfile;
    readonly subjectSlot?: string;
    readonly workUnitLimit?: number;
}

  claimId: (matcher: GeoSpecMatcherName, sequence: number) => string

  engine: GeoSpecNativeEngine

  // Success-evidence profile of every claim and query
  evidenceProfile: GeoSpecNativeEvidenceProfile

  subjectSlot: string

  workUnitLimit: number

// Standalone native matcher chain, including core-owned negation
GeoSpecAssertionMatchers: GeoSpecMatcherMethods<GeoSpecCanonicalClaimReport> & {
    readonly not: GeoSpecMatcherMethods<GeoSpecCanonicalClaimReport>;
}

  not: GeoSpecMatcherMethods<GeoSpecCanonicalClaimReport>

// One authored call shared by the collector and native assertion client
GeoSpecAuthoringInvocation: {
    readonly arguments: readonly unknown[];
    readonly expected: unknown;
    readonly kind: GeoSpecAssertion['kind'];
    readonly matcher: GeoSpecMatcherName;
    readonly polarity: GeoSpecClaimPolarity;
    readonly subject: unknown;
}

  arguments: readonly unknown[]

  expected: unknown

  kind: GeoSpecAssertion['kind']

  matcher: GeoSpecMatcherName

  polarity: GeoSpecClaimPolarity

  subject: unknown

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

  capability: GeoSpecQueryCapability

  claimId: string

  payload: unknown

  subject: GeoSpecNativeSubject

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

  source: 'ap242'

  assurance: 'exact-brep'

  unit: 'mm'

  coordinateSystem: 'z-up'

  subjectHash: string

  algorithmProfile: 'geospec-minimum-distance-v1'

  occurrences: readonly [string, string]

  distance: number

  points: readonly [readonly [number, number, number], readonly [number, number, number]]

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

  capability: 'minimumDistance'

  subject: GeoSpecNativeSubject

  payload: {
          readonly pair: readonly [{
              readonly occurrencePath: string;
          }, {
              readonly occurrencePath: string;
          }];
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

  status: 'complete'

// Flat native query transport options
GeoSpecNativeQueryOptions: Omit<GeoSpecNativeClaimOptions, 'arguments' | 'capability' | 'kind' | 'polarity'> & {
    readonly capability: GeoSpecQueryCapability | 'minimumDistance';
    readonly payload?: unknown;
}

  engine: GeoSpecNativeEngine

  claimId: string

  evidenceProfile: GeoSpecNativeEvidenceProfile

  subjectSlot: string

  workUnitLimit: number

  subject: GeoSpecNativeSubject

  capability: GeoSpecQueryCapability | 'minimumDistance'

  payload: unknown

// Existing positive-only ancillary operations owned by the native core
GeoSpecQueryCapability: Exclude<(typeof geoSpecQueryCapabilities)[number], 'minimumDistance'>

// Explicit support state for one source-attributed inventory field
GeoSpecPmiField: {
    readonly status: 'supported' | 'missing' | 'invalid' | 'ambiguous' | 'unsupported';
    readonly value: Value | null;
    readonly reason: string | null;
}

  status: 'supported' | 'missing' | 'invalid' | 'ambiguous' | 'unsupported'

  value: Value | null

  reason: string | null

// Original Part21 entity ID and exact source argument tokens
GeoSpecPmiRawEntity: {
    readonly sourceId: number;
    readonly kind: string;
    readonly arguments: readonly string[];
}

  sourceId: number

  kind: string

  arguments: readonly string[]

// Source-authored scalar and Rust-normalized reduced rational millimetres
GeoSpecPmiNumber: {
    readonly sourceId: number;
    readonly authoredText: string;
    readonly unitId: number;
    readonly unitRecords: readonly GeoSpecPmiRawEntity[];
    readonly millimetres: string;
    readonly name: string;
}

  sourceId: number

  authoredText: string

  unitId: number

  unitRecords: readonly GeoSpecPmiRawEntity[]

  millimetres: string

  name: string

// A uniquely forward-transferred face
GeoSpecPmiFaceAssociation: {
    readonly sourceFaceId: number;
    readonly occurrenceRoute: readonly number[];
    readonly occurrence: number | null;
    readonly publicFaceOrdinal: number;
}

  sourceFaceId: number

  occurrenceRoute: readonly number[]

  occurrence: number | null

  publicFaceOrdinal: number

// One ordered role reference, including incomplete source/transfer evidence
GeoSpecPmiShapeReference: {
    readonly sourceAspectId: number | null;
    readonly sourceUsageIds: readonly number[];
    readonly sourceItemIds: readonly number[];
    readonly requestedRoute: GeoSpecPmiField<readonly number[]>;
    readonly associations: GeoSpecPmiField<readonly GeoSpecPmiFaceAssociation[]>;
}

  sourceAspectId: number | null

  sourceUsageIds: readonly number[]

  sourceItemIds: readonly number[]

  requestedRoute: GeoSpecPmiField<readonly number[]>

  associations: GeoSpecPmiField<readonly GeoSpecPmiFaceAssociation[]>

// Normalized authored limits
GeoSpecPmiLimits: {
    readonly lowerMillimetres: string;
    readonly upperMillimetres: string;
    readonly basis: 'authored-limits' | 'nominal-plus-minus';
}

  lowerMillimetres: string

  upperMillimetres: string

  basis: 'authored-limits' | 'nominal-plus-minus'

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

  sourceId: number

  family: 'dimension' | 'datum' | 'tolerance' | 'presentation'

  channel: 'semantic' | 'presentation'

  kind: string

  name: GeoSpecPmiField<string>

  first: readonly GeoSpecPmiShapeReference[]

  second: readonly GeoSpecPmiShapeReference[]

  numbers: GeoSpecPmiField<readonly GeoSpecPmiNumber[]>

  limits: GeoSpecPmiField<GeoSpecPmiLimits>

  interpretation: GeoSpecPmiField<string>

  raw: readonly GeoSpecPmiRawEntity[]

// Positive-only inventory value inside the ordinary canonical query report
GeoSpecPmiInventory: {
    readonly contract: 'geospec.pmi.inventory/v1';
    readonly status: 'semantic' | 'graphical-only' | 'empty';
    readonly fileSchema: string;
    readonly editionValidation: 'not-validated';
    readonly records: readonly GeoSpecPmiRecord[];
}

  contract: 'geospec.pmi.inventory/v1'

  status: 'semantic' | 'graphical-only' | 'empty'

  fileSchema: string

  editionValidation: 'not-validated'

  records: readonly GeoSpecPmiRecord[]

// Strict inventory output limits
GeoSpecPmiQueryPayload: {
    readonly maxRecords?: number;
    readonly maxOutputBytes?: number;
}

  maxRecords: number

  maxOutputBytes: number

// Complete inventory value
GeoSpecPmiQueryValue: {
    readonly inventory: GeoSpecPmiInventory;
    readonly subjectHash: string;
    readonly provenance: Readonly<Record<string, unknown>>;
}

  inventory: GeoSpecPmiInventory

  subjectHash: string

  provenance: Readonly<Record<string, unknown>>

// Full native assertion result with the exact core-owned bytes retained
GeoSpecCanonicalClaimReport: {
    readonly canonicalClaim: Uint8Array<ArrayBuffer>;
    readonly canonicalPlan: Uint8Array<ArrayBuffer>;
    readonly canonicalResult: Uint8Array<ArrayBuffer>;
    readonly claim: Readonly<Record<string, JSONValue>>;
    readonly claimId: string;
    readonly diagnostics: readonly JSONValue[];
    readonly evidence?: JSONValue;
    readonly polarity: GeoSpecClaimPolarity;
    readonly result: Readonly<Record<string, JSONValue>>;
    readonly status: GeoSpecCanonicalClaimStatus;
}

  canonicalClaim: Uint8Array<ArrayBuffer>

  canonicalPlan: Uint8Array<ArrayBuffer>

  canonicalResult: Uint8Array<ArrayBuffer>

  claim: Readonly<Record<string, JSONValue>>

  claimId: string

  diagnostics: readonly JSONValue[]

  evidence: JSONValue

  polarity: GeoSpecClaimPolarity

  result: Readonly<Record<string, JSONValue>>

  status: GeoSpecCanonicalClaimStatus

// Exact core bytes of one claim evaluated in one engine call
GeoSpecNativeClaimEvaluation: {
    readonly canonicalClaim: Uint8Array<ArrayBuffer>;
    readonly canonicalPlan: Uint8Array<ArrayBuffer>;
    readonly canonicalResult: Uint8Array<ArrayBuffer>;
}

  canonicalClaim: Uint8Array<ArrayBuffer>

  canonicalPlan: Uint8Array<ArrayBuffer>

  canonicalResult: Uint8Array<ArrayBuffer>

// Byte-only engine surface consumed by the runner-independent assertion client
GeoSpecNativeEngine: {
    evaluateClaim(request: Uint8Array<ArrayBuffer>): GeoSpecNativeClaimEvaluation;
    processRequest(request: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>;
}

  // GeoSpecNativeEngine.evaluateClaim (method)
  evaluateClaim(request: Uint8Array<ArrayBuffer>): GeoSpecNativeClaimEvaluation;

  // GeoSpecNativeEngine.processRequest (method)
  processRequest(request: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>;

// Success-evidence profile a product selects for its plans (PERF-OUTPUT-01)
GeoSpecNativeEvidenceProfile: 'bounded' | 'complete'

// Content-addressed subject accepted by a protocol-3 assertion plan
GeoSpecNativeSubject: {
    readonly contentHash?: string;
    readonly subjectHash?: string;
}

  contentHash: string

  subjectHash: string

// A canonical fixed-contract matcher
GeoSpecFixedMatcherDescriptor: {
    readonly contract: 'geospec.plate-two-windows/v1' | 'geospec.pmi.parallel-plane-distance/v1';
    readonly expected: 'true';
    readonly mode: 'sync';
}

  contract: 'geospec.plate-two-windows/v1' | 'geospec.pmi.parallel-plane-distance/v1'

  expected: 'true'

  mode: 'sync'

// Installed Vitest matcher map and lifecycle settlement hook
GeoSpecVitestAdapter: {
    readonly matchers: GeoSpecVitestMatcherMap;
    flush(): Promise<void>;
}

  matchers: GeoSpecVitestMatcherMap

  // GeoSpecVitestAdapter.flush (method)
  flush(): Promise<void>;

// Input for exporting one validated Tau project descriptor
ExportTauProjectArtifactOptions: {
    readonly descriptor: GeoSpecTauProjectDescriptor;
    /** Called twice so source discovery and export use separate runtime lifetimes. */
    readonly createRuntime: () => GeoSpecTauProjectRuntime | Promise<GeoSpecTauProjectRuntime>;
    readonly signal?: AbortSignal;
}

  descriptor: GeoSpecTauProjectDescriptor

  // Called twice so source discovery and export use separate runtime lifetimes
  createRuntime: () => GeoSpecTauProjectRuntime | Promise<GeoSpecTauProjectRuntime>

  signal: AbortSignal

// Finalized geometry bytes and the exact source/export metadata that produced them
GeoSpecTauProjectArtifact: {
    readonly format: 'step' | 'glb';
    readonly name: string;
    readonly mimeType: string;
    readonly bytes: Uint8Array<ArrayBuffer>;
    readonly frame: {
        readonly coordinateSystem: 'z-up';
        readonly lengthUnit: 'millimeter';
        readonly sourceUnit: 'mm';
    };
    readonly source: {
        readonly manifestPath: string;
        readonly manifestBytes: Uint8Array<ArrayBuffer>;
        readonly manifest: ProjectManifest;
        readonly projectEntryPath: string;
        readonly entryPath: string;
        readonly kernelId: string;
        readonly files: readonly RuntimeSourceSnapshotFile[];
    };
    readonly export: {
        readonly options: Readonly<Record<string, unknown>>;
        readonly route: NonNullable<GeometryExportIntent['route']>;
    };
}

  format: 'step' | 'glb'

  name: string

  mimeType: string

  bytes: Uint8Array<ArrayBuffer>

  frame: {
          readonly coordinateSystem: 'z-up';
          readonly lengthUnit: 'millimeter';
          readonly sourceUnit: 'mm';
      }

  source: {
          readonly manifestPath: string;
          readonly manifestBytes: Uint8Array<ArrayBuffer>;
          readonly manifest: ProjectManifest;
          readonly projectEntryPath: string;
          readonly entryPath: string;
          readonly kernelId: string;
          readonly files: readonly RuntimeSourceSnapshotFile[];
      }

  export: {
          readonly options: Readonly<Record<string, unknown>>;
          readonly route: NonNullable<GeometryExportIntent['route']>;
      }

// Runtime surface required to snapshot and export one Tau project
GeoSpecTauProjectRuntime: RuntimeClientWithRoutes & Pick<RuntimeClient, 'shutdown' | 'snapshotSource'>

  open: (input: Pick<Parameters<RuntimeClient['open']>[0], 'source' | 'parameters' | 'stage' | 'watch' | 'signal'>) => Pick<ReturnType<RuntimeClient['open']>, 'export' | 'close'>

  // GeoSpecTauProjectRuntime.on (method)
  on?(event: 'telemetry', handler: (batch: {
          readonly entries: ReadonlyArray<{
              name: string;
              duration: number;
              startTime: number;
              workerTimeOrigin: number;
          }>;
      }) => void): () => void;

  // GeoSpecTauProjectRuntime.bestRouteFor (method)
  bestRouteFor(format: string, options?: {
          readonly kernelId?: string;
      }): GeoSpecExportRoute | undefined;

// Trusted project configuration using existing discovery and runner options
// Remarks: Omitted values keep their existing owner's defaults. Defined overrides replace whole fields, including empty arrays, false and the subjects map. Existing discovery currently treats an absent or empty include array as its default pattern. Preserving [] here does not change that consumer behavior. This is configuration data, not a canonical engine plan or a geometry result.
GeoSpecConfig: {
    include?: readonly string[];
    exclude?: readonly string[];
    testNamePattern?: string;
    /** Positive finite milliseconds; the runner owns its default. */
    testTimeout?: number;
    /** Positive finite milliseconds; does not define a geometry verdict. */
    matcherWallBackstop?: number;
    bail?: boolean;
    forensic?: boolean;
    cache?: boolean;
    /** Requested cache location only; loading configuration creates no store. */
    cacheDirectory?: string;
    subjects?: Readonly<Record<string, GeoSpecTauProjectDescriptor>>;
}

  include: readonly string[]

  exclude: readonly string[]

  testNamePattern: string

  // Positive finite milliseconds
  testTimeout: number

  // Positive finite milliseconds
  matcherWallBackstop: number

  bail: boolean

  forensic: boolean

  cache: boolean

  // Requested cache location only
  cacheDirectory: string

  subjects: Readonly<Record<string, GeoSpecTauProjectDescriptor>>

// Imported Tau project data for later host resolution
// Remarks: This descriptor does not validate the original manifest bytes or its schema, admit an asset, export geometry, or establish finalized-artifact provenance.
GeoSpecTauProjectDescriptor: {
    readonly kind: 'tau-project';
    /** Normalized project-relative POSIX path identifying the imported manifest. */
    readonly manifestPath: string;
    readonly manifest: Readonly<Record<string, JSONValue>>;
    readonly format: 'step' | 'glb';
    readonly parameters?: Readonly<Record<string, JSONValue>>;
}

  kind: 'tau-project'

  // Normalized project-relative POSIX path identifying the imported manifest
  manifestPath: string

  manifest: Readonly<Record<string, JSONValue>>

  format: 'step' | 'glb'

  parameters: Readonly<Record<string, JSONValue>>

// Resolved file identity and validated configuration data
LoadedGeoSpecConfig: {
    readonly configPath?: string;
    readonly options: GeoSpecConfig;
}

  configPath: string

  options: GeoSpecConfig

// Options for one trusted Node configuration load
LoadGeoSpecConfigOptions: {
    readonly projectPath: string;
    /** Explicit file, resolved relative to the project unless absolute. */
    readonly configPath?: string;
    /** Own defined fields override configuration without deep merging. */
    readonly overrides?: GeoSpecConfig;
}

  projectPath: string

  // Explicit file, resolved relative to the project unless absolute
  configPath: string

  // Own defined fields override configuration without deep merging
  overrides: GeoSpecConfig
