# geospec — Functions

34 top-level symbols. Signatures are verbatim typescript.

// GeoSpec suite helper used inside VM-executed test modules
// describe (function)
(name: string, function_: GeoSpecTestCallback): void;

  // describe.skip (method)
  skip(name: string, function_?: GeoSpecTestCallback): void;

// Start a geometry assertion chain
// expectGeo (function)
export declare function expectGeo(subject: GeoSpecSubject): GeoSpecMatcher;
//   subject: geometry subject under test

// GeoSpec test helper used inside VM-executed test modules
// it (function)
(name: string, function_: GeoSpecTestCallback): void;

  // it.skip (method)
  skip(name: string, function_?: GeoSpecTestCallback): void;

// Alias for {@link it}
// test (function)
(name: string, function_: GeoSpecTestCallback): void;

  // test.skip (method)
  skip(name: string, function_?: GeoSpecTestCallback): void;

// Derive the `expected` value an assertion records from the call arguments
// normalizeGeoSpecExpected (function)
(shape: GeoSpecMatcherExpectedShape, callArguments: readonly unknown[]) => unknown
//   shape: Normalization shape from the matcher's registry entry
//   callArguments: Arguments the spec author passed, in order

// Reject a non-wire value rather than letting JSON.stringify erase it
// assertGeoSpecJsonValue (function)
(value: unknown) => asserts value is JSONValue

// Parse and validate canonical bytes without re-canonicalizing them
// decodeGeoSpecCanonicalJson (function)
(bytes: Uint8Array<ArrayBuffer>) => JSONValue

// Encode client-owned canonical claim bytes
// encodeGeoSpecCanonicalJson (function)
(value: JSONValue) => Uint8Array<ArrayBuffer>

// Runtime JSON-value guard used at every protocol trust boundary
// isGeoSpecJsonValue (function)
(value: unknown, ancestors?: Set<object>) => value is JSONValue

// Convert an authoring value to protocol JSON, including the two explicit bindings the TypeScript client needs
// toGeoSpecProtocolJson (function)
(value: unknown, ancestors?: Set<object>) => JSONValue

// Create a {@link loadModel} function over a host-supplied compiled engine
// createModelLoader (function)
(defaults: CreateModelLoaderOptions) => ManagedGeoSpecModelLoader
//   defaults: The compiled engine plus model loading defaults

// Load a CAD model into GeoSpec evidence
// Remarks: This is the authoring declaration: a GeoSpec runner replaces it with the host's native model loader. Called outside a runner it always throws.
// Throws: {@link GeoSpecModelLoadError} with `GEOSPEC_MODEL_LOADER_UNAVAILABLE` when no runner is active.
// loadModel (function)
export declare function loadModel<Code extends Record<string, string> = Record<string, string>>(_options: LoadModelOptions<Code>): Promise<GeoSpecSubject>;
//   _options: Source, code, or file model load options

// resolveRuntimeExportIntent (function)
(options: {
    runtime: GeoSpecRuntimeClient;
    format: RuntimeBackedModelFormat;
    meshLinearTolerance?: number;
    meshAngularToleranceDegrees?: number;
}) => RuntimeExportIntent | RuntimeExportIntentFailure

// clearCollectorGlobals (function)
() => void

// Create the collector used by the embedded GeoSpec runner
// createCollector (function)
export declare function createCollector(options: GeoSpecCollectorOptions): GeoSpecCollector;
//   options: The native assertion client configuration for this module

// installCollector (function)
(collector: GeoSpecCollector) => void

// Compile a Vitest-style test-name pattern once for a GeoSpec run
// Remarks: String inputs are JavaScript regular expression sources matched against the full `suite > test` name. `RegExp` inputs are used as-is.
// compileGeoSpecTestNamePattern (function)
(testNamePattern: string | RegExp | undefined) => {
    success: true;
    pattern?: GeoSpecTestNamePattern;
} | {
    success: false;
    issue: VmIssue;
}
//   testNamePattern: Optional regex source or precompiled expression

// Filter collected GeoSpec tests by compiled test-name pattern
// filterGeoSpecTests (function)
(tests: readonly GeoSpecTestCase[], testNamePattern: GeoSpecTestNamePattern | undefined) => GeoSpecTestCase[]
//   tests: collected tests
//   testNamePattern: optional compiled regex

// Return true when a collected GeoSpec test matches the supplied compiled Vitest-style test-name pattern
// matchesGeoSpecTestName (function)
(test: Pick<GeoSpecTestCase, "suite" | "name">, testNamePattern: GeoSpecTestNamePattern | undefined) => boolean
//   test: collected test metadata
//   testNamePattern: optional compiled regex

// Discover GeoSpec test files from exact files or directory roots
// Remarks: The returned `files` are project-relative paths suitable for `runGeoSpecModule` and runner factory APIs.
// discoverGeoSpecFiles (function)
(options: DiscoverGeoSpecFilesOptions) => Promise<GeoSpecDiscoveryResult>
//   options: Discovery options containing a filesystem adapter and project roots

// Return true when a project-relative path names a GeoSpec test file
// isGeoSpecTestFile (function)
(path: string) => boolean
//   path: Project-relative path to inspect

// Execute an ESM GeoSpec module using the shared Tau VM substrate
// runGeoSpecModule (function)
export declare function runGeoSpecModule(options: RunGeoSpecModuleOptions): Promise<GeoSpecRunResult>;
//   options: filesystem and test entry path

// Compose compiled assertion and model bindings with the SDK's serial lifecycle
// createNativeGeoSpecRunner (function)
(options: GeoSpecNativeRunnerOptions) => GeoSpecRunner
//   options: VM filesystem, native engine/client options and model defaults

// Assign a bounded CPU budget across already-selected worker isolates
// allocateNativePoolGrants (function)
(options: {
    workers: number;
    budget?: number;
    hostCap: number;
}) => readonly number[]
//   options: Worker count, optional total budget, and host CPU cap

// Create a native model loader that admits actual STEP/GLB bytes and retains generation-checked handles until the owning runner finishes
// createGeoSpecNativeModelLoader (function)
(defaults: CreateGeoSpecNativeModelLoaderOptions) => ManagedGeoSpecNativeModelLoader
//   defaults: Native engine, Runtime defaults, and optional source reader

// Create a run-level issue when filters select no tests
// createNoMatchingGeoSpecTestsIssue (function)
() => VmIssue

// Create a standalone native GeoSpec assertion client
// createGeoSpecAssertionClient (function)
(options: GeoSpecAssertionClientOptions) => GeoSpecAssertionClient
//   options: Engine, deterministic work limit and optional logical-ID controls

// Create the one registry-derived matcher surface used by every JavaScript host
// createGeoSpecMatcherMethods (function)
<Result>(options: {
    readonly invoke: (invocation: GeoSpecAuthoringInvocation) => Result;
    readonly polarity: GeoSpecClaimPolarity;
    readonly subject: unknown;
}) => GeoSpecMatcherMethods<Result>
//   options: Subject, polarity and host invocation function

// Submit an ancillary query with positive polarity through the native core
// Remarks: Queries return full reports even when failed or refused. Protocol errors propagate unchanged. Rust owns defaults, validation and canonical encoding.
// evaluateGeoSpecNativeQuery (function)
(options: GeoSpecNativeQueryOptions) => GeoSpecCanonicalClaimReport
//   options: Query identity, subject and authored payload

// Create Vitest matchers over an existing runner-independent client
// createGeoSpecVitestAdapter (function)
(client: GeoSpecAssertionClient) => GeoSpecVitestAdapter
//   client: Native GeoSpec assertion client shared with standalone use

// Register GeoSpec matchers and their settlement hook in the active Vitest file
// installGeoSpecVitest (function)
(client: GeoSpecAssertionClient) => GeoSpecVitestAdapter
//   client: Native client shared with standalone assertion calls

// Create a native client and register it with the active Vitest file
// setupGeoSpecVitest (function)
(options: GeoSpecAssertionClientOptions) => GeoSpecVitestAdapter
//   options: Flat native assertion-client options

// Export one Tau project from Runtime's coherent source snapshot
// Remarks: This helper preserves finalized bytes and provenance metadata. It does not certify mathematical geometry or grant the runtime trusted-evaluator authority.
// exportTauProjectArtifact (function)
(options: ExportTauProjectArtifactOptions) => Promise<KernelResult<GeoSpecTauProjectArtifact>>
//   options: Descriptor, fresh-runtime factory, and optional cancellation signal

// Load one trusted project config using Node's native module loader
// Remarks: Explicit selection or exactly one geospec.config.js/.mjs/.ts/.mts is allowed. TypeScript must use erasable syntax; JSON imports use standard attributes. Executable config/imports are trusted developer code, not sandboxed code. Node's same-process module cache is unchanged: load once per run and use a fresh process when fresh executable imports are required. No reload guarantee or transitive-source identity is supplied here.
// loadGeoSpecConfig (function)
(options: LoadGeoSpecConfigOptions) => Promise<LoadedGeoSpecConfig>
//   options: Project, optional explicit config and defined option overrides
