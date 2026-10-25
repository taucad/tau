# geospec — Types (2)

75 top-level symbols. Signatures are verbatim typescript.

// Per-module collector configuration
GeoSpecCollectorOptions: {
    nativeAssertions: GeoSpecAssertionClientOptions;
    /** Observes each selected test as it starts and settles, for host progress reporting. */
    onTestEvent?: (event: GeoSpecTestEvent) => void;
}

  nativeAssertions: GeoSpecAssertionClientOptions

  // Observes each selected test as it starts and settles, for host progress reporting
  onTestEvent?: (event: GeoSpecTestEvent) => void

// Compiled Vitest-style test-name pattern used by a GeoSpec run
GeoSpecTestNamePattern: RegExp

// One GeoSpec timeout code
GeoSpecTimeoutCode: (typeof geoSpecTimeoutCode)[keyof typeof geoSpecTimeoutCode]

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

// A selected test starting or settling inside a module run
GeoSpecTestEvent: {
    readonly type: 'test-start' | 'test-complete';
    readonly test: GeoSpecTestCase;
}

  readonly type: 'test-start' | 'test-complete'

  readonly test: GeoSpecTestCase

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
    /** Observes each selected test as it starts and settles, for host progress reporting. */
    onTestEvent?: (event: GeoSpecTestEvent) => void;
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
  testNamePattern?: string | RegExp

  // Timeout for async test callbacks, in milliseconds
  testTimeout?: number

  // Observes each selected test as it starts and settles, for host progress reporting
  onTestEvent?: (event: GeoSpecTestEvent) => void

  // Host-provided protocol-3 compiled assertion client
  nativeAssertions: GeoSpecAssertionClientOptions

  // Host-composed identity loader
  nativeModelLoader?: (options: Parameters<GeoSpecNativeModelLoader>[0]) => Promise<GeoSpecNativeSubject & {
          readonly load?: GeoSpecModelLoadEvidence;
      }>

  // Additional in-memory modules made available to the VM
  builtinModules?: Record<string, BuiltinModule>

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

  // The largest `workUnitLimit` a spec may author in `loadModel` or `expectGeo` options
  readonly maximumWorkUnitLimit?: number

  readonly engine: GeoSpecNativeModelEngine

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
  builtinModules?: RunGeoSpecModuleOptions['builtinModules']

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
    /** Model exporters for source-kind files; the first whose `extensions` claim the file exports it. */
    readonly exporters?: readonly GeoSpecModelExporter[];
    /**
     * Subject handles carried between the release scopes of loaders that share one engine, keyed by
     * subjectHash. With a carrier, `releaseAll` keeps this scope's subjects for the next scope and
     * releases only the previous scope's subjects this scope did not load again, so reloading
     * unchanged bytes in the next scope is digest-only. Share one carrier per engine and run its
     * scopes one at a time: a scope's release touches only subjects whose scope has settled.
     */
    readonly carried?: Map<string, unknown>;
    /**
     * The largest `loadModel` `workUnitLimit` a spec may author. Host policy: omitted uses
     * `geoSpecMaximumWorkUnitLimit`, and a host provisioned for larger claims raises it.
     */
    readonly maximumWorkUnitLimit?: number;
}

  readonly engine: GeoSpecNativeModelEngine

  readonly format?: Extract<GeoSpecModelFormat, 'glb' | 'step' | 'stp'>

  readonly projectPath?: string

  readonly readSource?: GeoSpecNativeSourceReader

  // Model exporters for source-kind files
  readonly exporters?: readonly GeoSpecModelExporter[]

  // Subject handles carried between the release scopes of loaders that share one engine, keyed by subjectHash
  readonly carried?: Map<string, unknown>

  // The largest `loadModel` `workUnitLimit` a spec may author
  readonly maximumWorkUnitLimit?: number

// Native additions accepted by the injected `geospec/runner/native` loader
GeoSpecNativeLoadModelOptions: LoadModelOptions<Code> & {
    /** Ordered external resource payloads declared to the native admission request. */
    readonly resources?: readonly GeoSpecNativeModelResource[];
    /** Format-specific native ingest options. */
    readonly ingestOptions?: Readonly<Record<string, unknown>>;
}

  // Project-relative folder `file` resolves in, for a suite that loads from somewhere other than the project root
  rootDir?: string

  // Geometry format to export
  format?: GeoSpecModelFormat

  // Explicit parameters passed to the exporter
  parameters?: Record<string, unknown>

  // STEP reader strategy used for STEP exports
  stepStreaming?: StepStreamingMode

  // Whether STEP loading should also produce mesh evidence
  mesh?: boolean

  // Linear tolerance used while meshing exact BRep evidence
  meshLinearTolerance?: number

  // Angular tolerance in degrees used while meshing exact BRep evidence
  meshAngularToleranceDegrees?: number

  // Default work-unit budget for every claim on this subject
  workUnitLimit?: number

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
// Remarks: Direct `source` loads read their source again on every call and the engine digests those exact bytes; bytes equal to an admitted subject's reuse that subject by digest, length and descriptor, and edited bytes admit a new subject. Exported loads are coalesced per release scope (one run): a load whose file, inline code, project path, parameters, format, tolerances, region and ingest options equal an earlier successful load's reuses that admission without exporting or ingesting again. A file load is reused only while the exporter's `revision` still matches the earlier load's complete source revision; otherwise, or when every owner of the earlier admission has released it, the load exports afresh. Failures are never reused.
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
     * subjects this scope did not load again), then close every exporter it exported through.
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

// Options for {@link createNodeGeoSpecEngine}
CreateNodeGeoSpecEngineOptions: {
    /** Caller-inclusive CPU permits for the native addon; the WASM build is single-threaded and ignores them. */
    readonly executionPermits?: number;
}

  // Caller-inclusive CPU permits for the native addon
  readonly executionPermits?: number

// Which build of `geospec-engine` a Node engine runs on
GeoSpecEngineBinding: 'napi' | 'wasm'

// An engine and the build it runs on
NodeGeoSpecEngine: {
    readonly engine: GeoSpecNativeModelEngine & {
        close(): void;
    };
    readonly binding: GeoSpecEngineBinding;
}

  readonly engine: GeoSpecNativeModelEngine & {
          close(): void;
      }

  readonly binding: GeoSpecEngineBinding

// Options for the Node pool
GeoSpecNodePoolOptions: {
    /** Absolute project root. */
    projectPath: string;
    /** The `geospec.config.*` each worker imports for its exporters; absent to discover one in `projectPath`. */
    configPath?: string;
    /**
     * URLs of modules each worker imports whose default export creates exporters that precede the config's (see
     * `GeoSpecExporterModule`). A host that composes its own exporters, such as `tau test`, passes them here.
     */
    exporterModules?: readonly string[];
    /** Number of outer worker isolates; defaults to one. */
    workers?: number;
    /**
     * Caller-inclusive total CPU budget; defaults to one per worker. Above one
     * permit per worker only with a single worker: every worker shares this
     * process's OCCT library, whose admission refuses any second engine beside
     * one holding two or more permits.
     */
    budget?: number;
    /** Non-verdict shard watchdog in milliseconds. */
    shardTimeout?: number;
    /**
     * Spec sources each worker serves from memory, keyed by project-rooted path, in place of the file on disk. A path
     * here is never read from or written to the project; `geospec check` runs its bundled spec this way.
     */
    sources?: Readonly<Record<string, string>>;
}

  // Absolute project root
  projectPath: string

  // The `geospec.config.*` each worker imports for its exporters
  configPath?: string

  // URLs of modules each worker imports whose default export creates exporters that precede the config's (see `GeoSpecExporterModule`)
  exporterModules?: readonly string[]

  // Number of outer worker isolates
  workers?: number

  // Caller-inclusive total CPU budget
  budget?: number

  // Non-verdict shard watchdog in milliseconds
  shardTimeout?: number

  // Spec sources each worker serves from memory, keyed by project-rooted path, in place of the file on disk
  sources?: Readonly<Record<string, string>>

// The slice of `node:worker_threads`' `Worker` the pool drives
// Remarks: Declared structurally so the adapter can be exercised against a stub as well as against a real thread (D-8: vitest cannot host a TypeScript worker).
NodeWorkerLike: {
    postMessage(value: unknown): void;
    on(event: 'message', listener: (value: GeoSpecPoolWorkerMessage) => void): void;
    on(event: 'exit', listener: (code: number) => void): void;
    on(event: 'error', listener: (error: Error) => void): void;
    terminate(): Promise<number> | number;
}

  // NodeWorkerLike.postMessage (method)
  postMessage(value: unknown): void;

  // NodeWorkerLike.on (method)
  on(event: 'message', listener: (value: GeoSpecPoolWorkerMessage) => void): void;
  on(event: 'exit', listener: (code: number) => void): void;
  on(event: 'error', listener: (error: Error) => void): void;

  // NodeWorkerLike.terminate (method)
  terminate(): Promise<number> | number;

// A module whose default export creates exporters for one worker
GeoSpecExporterModule: {
    default: (context: {
        readonly projectPath: string;
    }) => Promise<readonly GeoSpecModelExporter[]>;
}

  default: (context: {
          readonly projectPath: string;
      }) => Promise<readonly GeoSpecModelExporter[]>

GeoSpecPoolHostMessage: {
    type: 'initialize';
} | {
    type: 'run-shard';
    shard: GeoSpecPoolShard;
    testNamePattern?: string;
    testTimeout?: number;
} | {
    /** List-only collection pass: register tests, run no bodies (R3 splitting). */
    type: 'list-tests';
    shardId: number;
    file: string;
    testTimeout?: number;
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
    /** The failure's error code, such as `ERR_MODULE_NOT_FOUND` for an absent engine. */
    code?: string;
} | {
    type: 'file-start';
    shardId: number;
    file: string;
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
    type: 'test-start';
    file: string;
    test: GeoSpecRunnerTestRef;
} | {
    type: 'test-complete';
    file: string;
    test: GeoSpecTestCase;
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
} | {
    type: 'abort';
    reason?: string;
} | {
    type: 'close';
}

  type: 'run-start'

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
  durationMs?: number

  // First deterministic model-load cache key observed in this file (R9 affinity telemetry)
  primaryLoadKey?: string

  // Executing worker's isolate-resident memory at file completion, in bytes (R15 memory-class telemetry)
  workerMemoryBytes?: number

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
  nativeModelLoader?: ManagedGeoSpecNativeModelLoader

  // Additional in-memory modules made available to the VM
  builtinModules?: RunGeoSpecModuleOptions['builtinModules']

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
  issues?: VmIssue[]

  // Wall-clock cost of the whole run, in milliseconds (R1)
  durationMs?: number

  // Complete requested-file accounting
  accounting?: GeoSpecRunnerAccounting

  // Coherence of the consumed source graphs, not a geometry verdict
  lineageStatus?: 'complete' | 'unavailable' | 'mixed'

// Options accepted by a GeoSpec worker-style runner run
GeoSpecRunnerRunOptions: {
    /** GeoSpec test files to execute. Files run serially by default. */
    files: readonly string[];
    /** JavaScript regular expression matched against full `suite > test` names. */
    testNamePattern?: string | RegExp;
    /** Timeout for each async test callback, in milliseconds. */
    testTimeout?: number;
    /**
     * Engine work-unit budget for this run's claims, replacing the runner's
     * `nativeAssertions.workUnitLimit`. A `loadModel` or `expectGeo` budget still
     * wins for its own claims.
     */
    workUnitLimit?: number;
    /**
     * Stop after the first failing file (R1). Interactive fail-fast only —
     * never the default for reward runs, which want the complete red set.
     */
    bail?: boolean;
}

  // GeoSpec test files to execute
  files: readonly string[]

  // JavaScript regular expression matched against full `suite > test` names
  testNamePattern?: string | RegExp

  // Timeout for each async test callback, in milliseconds
  testTimeout?: number

  // Engine work-unit budget for this run's claims, replacing the runner's `nativeAssertions.workUnitLimit`
  workUnitLimit?: number

  // Stop after the first failing file (R1)
  bail?: boolean

// Everything the pool needs that differs between Node and the browser
GeoSpecPoolOptions: {
    /** Spawn one worker running `startGeoSpecPoolWorkerHost`. */
    createWorker: () => GeoSpecPoolWorkerHandle | Promise<GeoSpecPoolWorkerHandle>;
    /** Optional one-time worker initialization performed after its ready signal. */
    initializeWorker?: (worker: GeoSpecPoolWorkerHandle) => Promise<void> | void;
    /** Wait for each native worker's cleanup acknowledgement before terminating it. */
    gracefulShutdown?: boolean;
    /** Worker count. Omit to let the caller's host auto-size before calling. */
    workers: number;
    /** Optional scheduling telemetry. Absent = declared order, no memory class. */
    timings?: ShardTimings;
    /** Per-shard non-verdict watchdog, milliseconds (R11). */
    shardTimeout?: number;
    /** Split files whose recorded duration exceeds this. Milliseconds. */
    splitThreshold?: number;
}

  // Spawn one worker running `startGeoSpecPoolWorkerHost`
  createWorker: () => GeoSpecPoolWorkerHandle | Promise<GeoSpecPoolWorkerHandle>

  // Optional one-time worker initialization performed after its ready signal
  initializeWorker?: (worker: GeoSpecPoolWorkerHandle) => Promise<void> | void

  // Wait for each native worker's cleanup acknowledgement before terminating it
  gracefulShutdown?: boolean

  // Worker count
  workers: number

  // Optional scheduling telemetry
  timings?: ShardTimings

  // Per-shard non-verdict watchdog, milliseconds (R11)
  shardTimeout?: number

  // Split files whose recorded duration exceeds this
  splitThreshold?: number

// One shard's recorded cost
ShardTiming: {
    /** Wall duration of the last recorded run, in milliseconds. */
    durationMs: number;
    /** Highest RSS observed for this shard, in bytes. Monotonic. */
    peakRssBytes: number;
}

  // Wall duration of the last recorded run, in milliseconds
  durationMs: number

  // Highest RSS observed for this shard, in bytes
  peakRssBytes: number

// A mutable timings table
ShardTimings: {
    /** Merge one observation. Peak RSS only ever grows. */
    record(shard: string, timing: ShardTiming): void;
    /** The hint for one shard, or `undefined` when unknown. */
    read(shard: string): ShardTiming | undefined;
    /** Every recorded shard, sorted by descending duration (longest-first). */
    longestFirst(): string[];
    /** Persist the table. Failure is silent: telemetry never fails a run. */
    save(): void;
}

  // Merge one observation
  // ShardTimings.record (method)
  record(shard: string, timing: ShardTiming): void;

  // The hint for one shard, or `undefined` when unknown
  // ShardTimings.read (method)
  read(shard: string): ShardTiming | undefined;

  // Every recorded shard, sorted by descending duration (longest-first)
  // ShardTimings.longestFirst (method)
  longestFirst(): string[];

  // Persist the table
  // ShardTimings.save (method)
  save(): void;

// Options accepted by {@link startGeoSpecPoolWorkerHost}
GeoSpecPoolWorkerHostOptions: {
    /** Filesystem containing the project and test modules. */
    filesystem: GeoSpecRunnerOptions['filesystem'];
    /** Native assertion client shared with this worker's model admissions. */
    nativeAssertions: GeoSpecRunnerOptions['nativeAssertions'];
    /** Managed native admissions, released after every shard and collection pass and before shutdown. */
    nativeModelLoader: ManagedGeoSpecNativeModelLoader;
    /** Additional in-memory modules made available to the VM. */
    builtinModules?: GeoSpecRunnerOptions['builtinModules'];
    /** Post a message to the pool host. */
    postMessage: (message: GeoSpecPoolWorkerMessage) => void;
    /** Subscribe to pool-host messages. */
    onHostMessage: (listener: (message: GeoSpecPoolHostMessage) => void) => void;
    /** Sample this worker's resident memory in bytes (R15 telemetry); optional. */
    measureMemoryBytes?: () => number | undefined;
    /** Release platform resources on shutdown, after the native subjects are released. */
    onShutdown?: () => Promise<void> | void;
}

  // Filesystem containing the project and test modules
  filesystem: GeoSpecRunnerOptions['filesystem']

  // Native assertion client shared with this worker's model admissions
  nativeAssertions: GeoSpecRunnerOptions['nativeAssertions']

  // Managed native admissions, released after every shard and collection pass and before shutdown
  nativeModelLoader: ManagedGeoSpecNativeModelLoader

  // Additional in-memory modules made available to the VM
  builtinModules?: GeoSpecRunnerOptions['builtinModules']

  // Post a message to the pool host
  postMessage: (message: GeoSpecPoolWorkerMessage) => void

  // Subscribe to pool-host messages
  onHostMessage: (listener: (message: GeoSpecPoolHostMessage) => void) => void

  // Sample this worker's resident memory in bytes (R15 telemetry)
  measureMemoryBytes?: () => number | undefined

  // Release platform resources on shutdown, after the native subjects are released
  onShutdown?: () => Promise<void> | void

// Runner-independent native assertion client
GeoSpecAssertionClient: {
    /**
     * Start a chain; `options.workUnitLimit` overrides the client budget for its claims.
     * Without one, a loaded subject's `loadModel` budget applies, then the client's.
     */
    expectGeo(subject: GeoSpecNativeSubject | GeoSpecSubject, options?: GeoSpecExpectOptions): GeoSpecAssertionMatchers;
    query(options: MinimumDistanceQuery): Promise<MinimumDistanceResult>;
    query(options: GeoSpecQueryOptions): Promise<GeoSpecCanonicalClaimReport>;
}

  // Start a chain
  // GeoSpecAssertionClient.expectGeo (method)
  expectGeo(subject: GeoSpecNativeSubject | GeoSpecSubject, options?: GeoSpecExpectOptions): GeoSpecAssertionMatchers;

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
    /**
     * The largest `workUnitLimit` a spec may author in `loadModel` or `expectGeo` options. Host
     * policy: omitted uses `geoSpecMaximumWorkUnitLimit`, and a host provisioned for larger claims
     * raises it. Must be a positive safe integer.
     */
    readonly maximumWorkUnitLimit?: number;
}

  readonly claimId?: (matcher: GeoSpecMatcherName, sequence: number) => string

  readonly engine: GeoSpecNativeEngine

  // Success-evidence profile of every claim and query
  readonly evidenceProfile?: GeoSpecNativeEvidenceProfile

  readonly subjectSlot?: string

  readonly workUnitLimit?: number

  // The largest `workUnitLimit` a spec may author in `loadModel` or `expectGeo` options
  readonly maximumWorkUnitLimit?: number

// Standalone native matcher chain, including core-owned negation
GeoSpecAssertionMatchers: GeoSpecMatcherMethods<GeoSpecCanonicalClaimReport> & {
    readonly not: GeoSpecMatcherMethods<GeoSpecCanonicalClaimReport>;
}

  readonly not: GeoSpecMatcherMethods<GeoSpecCanonicalClaimReport>

// One authored call shared by the collector and native assertion client
GeoSpecAuthoringInvocation: {
    readonly arguments: readonly unknown[];
    readonly expected: unknown;
    readonly kind: GeoSpecAssertion['kind'];
    readonly matcher: GeoSpecMatcherName;
    readonly polarity: GeoSpecClaimPolarity;
    readonly subject: unknown;
}

  readonly arguments: readonly unknown[]

  readonly expected: unknown

  readonly kind: GeoSpecAssertion['kind']

  readonly matcher: GeoSpecMatcherName

  readonly polarity: GeoSpecClaimPolarity

  readonly subject: unknown

// Matcher methods derived mechanically from the existing GeoSpec registry
GeoSpecMatcherMethods: {
    [Name in GeoSpecMatcherName]: (...arguments_: Parameters<GeoSpecMatcher[Name]>) => Result;
}

// One positive-only ancillary query
// Remarks: An explicit claimId leaves the automatic sequence unchanged. Queries return full reports without assertion errors. A query asserts nothing, so it never fails: one whose evidence is missing or cannot decide returns a refused report whose diagnostic names the reason, such as `GEOSPEC_UNSUPPORTED_EVIDENCE`.
GeoSpecQueryOptions: {
    readonly capability: GeoSpecQueryCapability;
    readonly claimId?: string;
    readonly payload?: unknown;
    readonly subject: GeoSpecNativeSubject;
}

  readonly capability: GeoSpecQueryCapability

  readonly claimId?: string

  readonly payload?: unknown

  readonly subject: GeoSpecNativeSubject

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

  readonly source: 'ap242'

  readonly assurance: 'exact-brep'

  readonly unit: 'mm'

  readonly coordinateSystem: 'z-up'

  readonly subjectHash: string

  readonly algorithmProfile: 'geospec-minimum-distance-v1'

  readonly occurrences: readonly [string, string]

  readonly distance: number

  readonly points: readonly [readonly [number, number, number], readonly [number, number, number]]

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

  readonly capability: 'minimumDistance'

  readonly subject: GeoSpecNativeSubject

  readonly payload: {
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
    readonly code: 'unsupported-evidence' | 'invalid-selection' | 'work-limit' | 'analysis-limit' | 'resource-limit';
    readonly message: string;
} | {
    readonly status: 'interrupted';
    readonly code: 'cancelled' | 'executor-exited' | 'deadline' | 'engine-error';
    readonly message: string;
}

  readonly status: 'complete'

// Flat native query transport options
GeoSpecNativeQueryOptions: Omit<GeoSpecNativeClaimOptions, 'arguments' | 'capability' | 'kind' | 'polarity'> & {
    readonly capability: GeoSpecQueryCapability | 'minimumDistance';
    readonly payload?: unknown;
}

  readonly engine: GeoSpecNativeEngine

  readonly claimId: string

  readonly evidenceProfile?: GeoSpecNativeEvidenceProfile

  readonly subjectSlot: string

  readonly workUnitLimit: number

  // The host's largest authored budget, reported as `details.maximumLimit` on `MATCHER_TIMEOUT`
  readonly maximumWorkUnitLimit?: number

  readonly subject: GeoSpecNativeSubject

  readonly capability: GeoSpecQueryCapability | 'minimumDistance'

  readonly payload?: unknown

// Existing positive-only ancillary operations owned by the native core
GeoSpecQueryCapability: Exclude<(typeof geoSpecQueryCapabilities)[number], 'minimumDistance'>

// Explicit support state for one source-attributed inventory field
GeoSpecPmiField: {
    readonly status: 'supported' | 'missing' | 'invalid' | 'ambiguous' | 'unsupported';
    readonly value: Value | null;
    readonly reason: string | null;
}

  readonly status: 'supported' | 'missing' | 'invalid' | 'ambiguous' | 'unsupported'

  readonly value: Value | null

  readonly reason: string | null

// Original Part21 entity ID and exact source argument tokens
GeoSpecPmiRawEntity: {
    readonly sourceId: number;
    readonly kind: string;
    readonly arguments: readonly string[];
}

  readonly sourceId: number

  readonly kind: string

  readonly arguments: readonly string[]

// Source-authored scalar and Rust-normalized reduced rational millimetres
GeoSpecPmiNumber: {
    readonly sourceId: number;
    readonly authoredText: string;
    readonly unitId: number;
    readonly unitRecords: readonly GeoSpecPmiRawEntity[];
    readonly millimetres: string;
    readonly name: string;
}

  readonly sourceId: number

  readonly authoredText: string

  readonly unitId: number

  readonly unitRecords: readonly GeoSpecPmiRawEntity[]

  readonly millimetres: string

  readonly name: string

// A uniquely forward-transferred face
GeoSpecPmiFaceAssociation: {
    readonly sourceFaceId: number;
    readonly occurrenceRoute: readonly number[];
    readonly occurrence: number | null;
    readonly publicFaceOrdinal: number;
}

  readonly sourceFaceId: number

  readonly occurrenceRoute: readonly number[]

  readonly occurrence: number | null

  readonly publicFaceOrdinal: number

// One ordered role reference, including incomplete source/transfer evidence
GeoSpecPmiShapeReference: {
    readonly sourceAspectId: number | null;
    readonly sourceUsageIds: readonly number[];
    readonly sourceItemIds: readonly number[];
    readonly requestedRoute: GeoSpecPmiField<readonly number[]>;
    readonly associations: GeoSpecPmiField<readonly GeoSpecPmiFaceAssociation[]>;
}

  readonly sourceAspectId: number | null

  readonly sourceUsageIds: readonly number[]

  readonly sourceItemIds: readonly number[]

  readonly requestedRoute: GeoSpecPmiField<readonly number[]>

  readonly associations: GeoSpecPmiField<readonly GeoSpecPmiFaceAssociation[]>

// Normalized authored limits
GeoSpecPmiLimits: {
    readonly lowerMillimetres: string;
    readonly upperMillimetres: string;
    readonly basis: 'authored-limits' | 'nominal-plus-minus';
}

  readonly lowerMillimetres: string

  readonly upperMillimetres: string

  readonly basis: 'authored-limits' | 'nominal-plus-minus'

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

  readonly sourceId: number

  readonly family: 'dimension' | 'datum' | 'tolerance' | 'presentation'

  readonly channel: 'semantic' | 'presentation'

  readonly kind: string

  readonly name: GeoSpecPmiField<string>

  readonly first: readonly GeoSpecPmiShapeReference[]

  readonly second: readonly GeoSpecPmiShapeReference[]

  readonly numbers: GeoSpecPmiField<readonly GeoSpecPmiNumber[]>

  readonly limits: GeoSpecPmiField<GeoSpecPmiLimits>

  readonly interpretation: GeoSpecPmiField<string>

  readonly raw: readonly GeoSpecPmiRawEntity[]

// Positive-only inventory value inside the ordinary canonical query report
GeoSpecPmiInventory: {
    readonly contract: 'geospec.pmi.inventory/v1';
    readonly status: 'semantic' | 'graphical-only' | 'empty';
    readonly fileSchema: string;
    readonly editionValidation: 'not-validated';
    readonly records: readonly GeoSpecPmiRecord[];
}

  readonly contract: 'geospec.pmi.inventory/v1'

  readonly status: 'semantic' | 'graphical-only' | 'empty'

  readonly fileSchema: string

  readonly editionValidation: 'not-validated'

  readonly records: readonly GeoSpecPmiRecord[]

// Strict inventory output limits
GeoSpecPmiQueryPayload: {
    readonly maxRecords?: number;
    readonly maxOutputBytes?: number;
}

  readonly maxRecords?: number

  readonly maxOutputBytes?: number

// Complete inventory value
GeoSpecPmiQueryValue: {
    readonly inventory: GeoSpecPmiInventory;
    readonly subjectHash: string;
    readonly provenance: Readonly<Record<string, unknown>>;
}

  readonly inventory: GeoSpecPmiInventory

  readonly subjectHash: string

  readonly provenance: Readonly<Record<string, unknown>>

// Full native assertion result with the exact core-owned bytes retained
GeoSpecCanonicalClaimReport: {
    readonly canonicalClaim: Uint8Array<ArrayBuffer>;
    readonly canonicalPlan: Uint8Array<ArrayBuffer>;
    readonly canonicalResult: Uint8Array<ArrayBuffer>;
    readonly claim: Readonly<Record<string, JSONValue>>;
    readonly claimId: string;
    /** Engine diagnostics; a `MATCHER_TIMEOUT` row also carries `details.limit`, `details.used` and `details.maximumLimit`. */
    readonly diagnostics: readonly JSONValue[];
    readonly evidence?: JSONValue;
    readonly polarity: GeoSpecClaimPolarity;
    readonly result: Readonly<Record<string, JSONValue>>;
    readonly status: GeoSpecCanonicalClaimStatus;
}

  readonly canonicalClaim: Uint8Array<ArrayBuffer>

  readonly canonicalPlan: Uint8Array<ArrayBuffer>

  readonly canonicalResult: Uint8Array<ArrayBuffer>

  readonly claim: Readonly<Record<string, JSONValue>>

  readonly claimId: string

  // Engine diagnostics
  readonly diagnostics: readonly JSONValue[]

  readonly evidence?: JSONValue

  readonly polarity: GeoSpecClaimPolarity

  readonly result: Readonly<Record<string, JSONValue>>

  readonly status: GeoSpecCanonicalClaimStatus

// Exact core bytes of one claim evaluated in one engine call
GeoSpecNativeClaimEvaluation: {
    readonly canonicalClaim: Uint8Array<ArrayBuffer>;
    readonly canonicalPlan: Uint8Array<ArrayBuffer>;
    readonly canonicalResult: Uint8Array<ArrayBuffer>;
}

  readonly canonicalClaim: Uint8Array<ArrayBuffer>

  readonly canonicalPlan: Uint8Array<ArrayBuffer>

  readonly canonicalResult: Uint8Array<ArrayBuffer>

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

  readonly contentHash?: string

  readonly subjectHash?: string

// A canonical fixed-contract matcher
GeoSpecFixedMatcherDescriptor: {
    readonly contract: 'geospec.plate-two-windows/v1' | 'geospec.pmi.parallel-plane-distance/v1';
    readonly expected: 'true';
    readonly mode: 'sync';
}

  readonly contract: 'geospec.plate-two-windows/v1' | 'geospec.pmi.parallel-plane-distance/v1'

  readonly expected: 'true'

  readonly mode: 'sync'

// The platform the CLI runs against
GeoSpecCliHost: {
    /** Absolute project root for a relative `projectPath`. */
    cwd(): string;
    write(line: string): void;
    /** Recursive discovery filesystem. */
    discoveryFileSystem(projectPath: string): Parameters<typeof discoverGeoSpecFiles>[0]['filesystem'];
    /**
     * Import the project's `geospec.config.*`, or the explicit one, for its data fields.
     * @throws Error when the config is ambiguous, invalid or fails to import.
     */
    loadConfig(options: {
        projectPath: string;
        configPath: string | undefined;
    }): Promise<{
        readonly configPath?: string;
        readonly options: GeoSpecConfigData;
    }>;
    /** Build the runner the selected files execute on; its workers import the same config for its exporters. */
    createRunner(options: {
        projectPath: string;
        configPath: string | undefined;
        workers: number | undefined;
        shardTimeout: number | undefined;
        /** In-memory spec sources keyed by project-rooted path, served in place of the disk (`geospec check`). */
        sources?: Readonly<Record<string, string>>;
    }): GeoSpecRunner;
}

  // Absolute project root for a relative `projectPath`
  // GeoSpecCliHost.cwd (method)
  cwd(): string;

  // GeoSpecCliHost.write (method)
  write(line: string): void;

  // Recursive discovery filesystem
  // GeoSpecCliHost.discoveryFileSystem (method)
  discoveryFileSystem(projectPath: string): Parameters<typeof discoverGeoSpecFiles>[0]['filesystem'];

  // Import the project's `geospec.config.*`, or the explicit one, for its data fields
  // Throws: Error when the config is ambiguous, invalid or fails to import.
  // GeoSpecCliHost.loadConfig (method)
  loadConfig(options: {
          projectPath: string;
          configPath: string | undefined;
      }): Promise<{
          readonly configPath?: string;
          readonly options: GeoSpecConfigData;
      }>;

  // Build the runner the selected files execute on
  // GeoSpecCliHost.createRunner (method)
  createRunner(options: {
          projectPath: string;
          configPath: string | undefined;
          workers: number | undefined;
          shardTimeout: number | undefined;
          /** In-memory spec sources keyed by project-rooted path, served in place of the disk (`geospec check`). */
          sources?: Readonly<Record<string, string>>;
      }): GeoSpecRunner;

// Options for {@link createNodeGeoSpecCliHost}
NodeGeoSpecCliHostOptions: {
    /** Report sink used by embedding hosts and tests; defaults to stdout. */
    readonly reportStream?: (text: string) => void;
    /**
     * URLs of modules each pool worker imports for exporters that precede the config's, so a host such as `tau test`
     * can run a project with no `geospec.config.*` (see `GeoSpecExporterModule` in `geospec/runner/node`).
     */
    readonly exporterModules?: readonly string[];
}

  // Report sink used by embedding hosts and tests
  readonly reportStream?: (text: string) => void

  // URLs of modules each pool worker imports for exporters that precede the config's, so a host such as `tau test` can run a project with no `geospec.config.*` (see `GeoSpecExporterModule` in `geospec/runner/node`)
  readonly exporterModules?: readonly string[]
