# geospec — Functions

70 top-level symbols. Signatures are verbatim typescript.

// Create a GeoSpec instance
// Remarks: The root factory stays lazy: mesh parsing code is loaded only when a mesh method is called.
// createGeoSpec (function)
export declare function createGeoSpec(): GeoSpec;

// GeoSpec suite helper used inside VM-executed test modules
// describe (function)
export declare function describe(name: string, function_: GeoSpecTestCallback): void;

  // describe.skip (method)
  skip(name: string, function_?: GeoSpecTestCallback): void;

// Start a geometry assertion chain
// expectGeo (function)
export declare function expectGeo(subject: GeoSpecSubject): GeoSpecMatcher;
//   subject: geometry subject under test

// GeoSpec test helper used inside VM-executed test modules
// it (function)
export declare function it(name: string, function_: GeoSpecTestCallback): void;

  // it.skip (method)
  skip(name: string, function_?: GeoSpecTestCallback): void;

// Alias for {@link it}
// test (function)
export declare function test(name: string, function_: GeoSpecTestCallback): void;

  // test.skip (method)
  skip(name: string, function_?: GeoSpecTestCallback): void;

// Read BRep evidence from a loaded GeoSpec subject
// analyzeBrep (function)
export declare function analyzeBrep(options: AnalyzeBrepOptions): AnalyzeBrepResult;
//   options: BRep subject to inspect

// Derive the `expected` value an assertion records from the call arguments
// normalizeGeoSpecExpected (function)
export declare function normalizeGeoSpecExpected(shape: GeoSpecMatcherExpectedShape, callArguments: readonly unknown[]): unknown;
//   shape: Normalization shape from the matcher's registry entry
//   callArguments: Arguments the spec author passed, in order

// Reject a non-wire value rather than letting JSON.stringify erase it
// assertGeoSpecJsonValue (function)
export declare function assertGeoSpecJsonValue(value: unknown): asserts value is JSONValue;

// Parse and validate canonical bytes without re-canonicalizing them
// decodeGeoSpecCanonicalJson (function)
export declare function decodeGeoSpecCanonicalJson(bytes: Uint8Array<ArrayBuffer>): JSONValue;

// Encode client-owned canonical claim bytes
// encodeGeoSpecCanonicalJson (function)
export declare function encodeGeoSpecCanonicalJson(value: JSONValue): Uint8Array<ArrayBuffer>;

// Runtime JSON-value guard used at every protocol trust boundary
// isGeoSpecJsonValue (function)
export declare function isGeoSpecJsonValue(value: unknown, ancestors?: Set<object>): value is JSONValue;

// Convert an authoring value to protocol JSON, including the two explicit bindings the TypeScript client needs
// toGeoSpecProtocolJson (function)
export declare function toGeoSpecProtocolJson(value: unknown, ancestors?: Set<object>): JSONValue;

// Remove the registered engine
// clearGeoSpecEngine (function)
export declare function clearGeoSpecEngine(): void;

// Describe the registered engine and its advertised capabilities
// describeGeoSpecEngine (function)
export declare function describeGeoSpecEngine(): GeoSpecEngineDescriptor | undefined;

// geoSpecEngineUnavailableDiagnostic (function)
export declare function geoSpecEngineUnavailableDiagnostic(capability: string): GeometryDiagnostic;

// The registered engine, if any
// getGeoSpecEngine (function)
export declare function getGeoSpecEngine(): GeoSpecEngineImplementation | undefined;

// Look up one engine export
// getGeoSpecEngineHostBinding (function)
export declare function getGeoSpecEngineHostBinding<Name extends keyof GeoSpecEngineHostBindings>(capability: Name): GeoSpecEngineHostBindings[Name] | undefined;
//   capability: Export name

// The registered Contract-B binding, if any
// getGeoSpecEngineProtocol (function)
export declare function getGeoSpecEngineProtocol(): GeoSpecEngineProtocol | undefined;

// Register the engine that executes GeoSpec claims
// Throws: GeoSpecEngineUnavailableError when the engine speaks a different protocol version — an unusable engine must never register silently.
// registerGeoSpecEngine (function)
export declare function registerGeoSpecEngine(implementation: GeoSpecEngineImplementation): void;
//   implementation: The engine's protocol implementation

// Look up one engine export or fail with the engine-unavailable error
// Throws: GeoSpecEngineUnavailableError when no engine provides it.
// requireGeoSpecEngineHostBinding (function)
export declare function requireGeoSpecEngineHostBinding<Name extends keyof GeoSpecEngineHostBindings>(capability: Name): GeoSpecEngineHostBindings[Name];
//   capability: Export name

// Resolve selectors against a subject and report the matched entities
// inspectGeometry (function)
export declare function inspectGeometry(options: InspectGeometryOptions): InspectGeometryResult;
//   options: Subject, selectors, and requested evidence kinds

// Find positive-volume intersections between a subject's components
// analyzeMeshOverlap (function)
export declare function analyzeMeshOverlap(options: AnalyzeMeshOverlapOptions): Promise<AnalyzeMeshOverlapResult>;
//   options: Subject, tolerance, and optional pair selectors

// Return a detached full-statistics snapshot
// analyzeMesh (function)
export declare function analyzeMesh(options: AnalyzeMeshOptions): Promise<AnalyzeMeshResult>;
//   options: Mesh source, format, and unit handling

// Load mesh evidence into a GeoSpec geometry subject
// loadMesh (function)
export declare function loadMesh(options: LoadMeshOptions): Promise<LoadMeshResult>;
//   options: Mesh source, format, and unit handling

// Create a {@link loadModel} function with shared defaults
// createModelLoader (function)
export declare function createModelLoader(defaults?: CreateModelLoaderOptions): ManagedGeoSpecModelLoader;
//   defaults: Model loading defaults

// Load a CAD model into GeoSpec evidence
// Remarks: Direct geometry sources are parsed immediately. Code and project files are exported through the required `@taucad/runtime` integration on this subpath.
// Throws: {@link GeoSpecModelLoadError} when the model cannot be exported or parsed, or when no GeoSpec engine is registered.
// loadModel (function)
export declare function loadModel<Code extends Record<string, string> = Record<string, string>>(options: LoadModelOptions<Code>): Promise<GeoSpecSubject>;
//   options: Source, code, or file model load options

// resolveRuntimeExportIntent (function)
export declare function resolveRuntimeExportIntent(options: {
    runtime: GeoSpecRuntimeClient;
    format: RuntimeBackedModelFormat;
    meshLinearTolerance?: number;
    meshAngularToleranceDegrees?: number;
}): RuntimeExportIntent | RuntimeExportIntentFailure;

// clearCollectorGlobals (function)
export declare function clearCollectorGlobals(): void;

// createCollector (function)
export declare function createCollector(options: GeoSpecCollectorOptions & {
    nativeAssertions: GeoSpecAssertionClientOptions;
}): GeoSpecNativeCollector;
export declare function createCollector(options?: GeoSpecCollectorOptions & {
    nativeAssertions?: undefined;
}): GeoSpecCollector;
export declare function createCollector(options?: GeoSpecCollectorOptions): GeoSpecCollector | GeoSpecNativeCollector;

// installCollector (function)
export declare function installCollector(collector: GeoSpecCollector | GeoSpecNativeCollector): void;

// chargeBudget (function)
export declare function chargeBudget(units: number): void;

// checkBudget (function)
export declare function checkBudget(): void;

// Compile a Vitest-style test-name pattern once for a GeoSpec run
// Remarks: String inputs are JavaScript regular expression sources matched against the full `suite > test` name. `RegExp` inputs are used as-is.
// compileGeoSpecTestNamePattern (function)
export declare function compileGeoSpecTestNamePattern(testNamePattern: string | RegExp | undefined): {
    success: true;
    pattern?: GeoSpecTestNamePattern;
} | {
    success: false;
    issue: VmIssue;
};
//   testNamePattern: Optional regex source or precompiled expression

// Filter collected GeoSpec tests by compiled test-name pattern
// filterGeoSpecTests (function)
export declare function filterGeoSpecTests(tests: readonly GeoSpecTestCase[], testNamePattern: GeoSpecTestNamePattern | undefined): GeoSpecTestCase[];
//   tests: collected tests
//   testNamePattern: optional compiled regex

// Return true when a collected GeoSpec test matches the supplied compiled Vitest-style test-name pattern
// matchesGeoSpecTestName (function)
export declare function matchesGeoSpecTestName(test: Pick<GeoSpecTestCase, "suite" | "name">, testNamePattern: GeoSpecTestNamePattern | undefined): boolean;
//   test: collected test metadata
//   testNamePattern: optional compiled regex

// Discover GeoSpec test files from exact files or directory roots
// Remarks: The returned `files` are project-relative paths suitable for `runGeoSpecModule` and runner factory APIs.
// discoverGeoSpecFiles (function)
export declare function discoverGeoSpecFiles(options: DiscoverGeoSpecFilesOptions): Promise<GeoSpecDiscoveryResult>;
//   options: Discovery options containing a filesystem adapter and project roots

// Return true when a project-relative path names a GeoSpec test file
// isGeoSpecTestFile (function)
export declare function isGeoSpecTestFile(path: string): boolean;
//   path: Project-relative path to inspect

// Execute an ESM GeoSpec module using the shared Tau VM substrate
// runGeoSpecModule (function)
export declare function runGeoSpecModule(options: RunGeoSpecModuleOptions): Promise<GeoSpecRunResult>;
//   options: filesystem and test entry path

// Compose compiled assertion and model bindings with the SDK's serial lifecycle
// createNativeGeoSpecRunner (function)
export declare function createNativeGeoSpecRunner(options: GeoSpecNativeRunnerOptions): GeoSpecRunner;
//   options: VM filesystem, native engine/client options and model defaults

// Assign a bounded CPU budget across already-selected worker isolates
// allocateNativePoolGrants (function)
export declare function allocateNativePoolGrants(options: {
    workers: number;
    budget?: number;
    hostCap: number;
}): readonly number[];
//   options: Worker count, optional total budget, and host CPU cap

// Create a native model loader that admits actual STEP/GLB bytes and retains generation-checked handles until the owning runner finishes
// createGeoSpecNativeModelLoader (function)
export declare function createGeoSpecNativeModelLoader(defaults: CreateGeoSpecNativeModelLoaderOptions): ManagedGeoSpecNativeModelLoader;
//   defaults: Native engine, Runtime defaults, and optional source reader

// Create a GeoSpec runner for Node.js and CLI environments
// createGeoSpecNodeRunner (function)
export declare function createGeoSpecNodeRunner(options: GeoSpecNodeRunnerOptions): GeoSpecRunner;
//   options: Filesystem, project root, loaders, and cache controls

// Create a worker-pool GeoSpec runner for Node.js
// createGeoSpecNodePoolRunner (function)
export declare function createGeoSpecNodePoolRunner(options: GeoSpecNodePoolRunnerOptions): GeoSpecRunner;
//   options: Project root, worker count, watchdog, and cache controls

// Create a Node `VmFileSystem` rooted at `root`
// createNodeVmFileSystem (function)
export declare function createNodeVmFileSystem(root: string): VmFileSystem;
//   root: Absolute project root path

// Create a GeoSpec runner for browser environments
// Remarks: The public surface intentionally hides worker and MessagePort primitives. Applications provide filesystem and loader capabilities, and the runner returns compact results suitable for UI and agent RPC consumption.
// createGeoSpecWebRunner (function)
export declare function createGeoSpecWebRunner(options: GeoSpecWebRunnerOptions): GeoSpecRunner;
//   options: Filesystem, project root, loaders, and lifecycle event hook

// Create a worker-pool GeoSpec runner for browser environments
// createGeoSpecWebPoolRunner (function)
export declare function createGeoSpecWebPoolRunner(options: GeoSpecWebPoolRunnerOptions): GeoSpecRunner;
//   options: Worker factory, worker count, and lifecycle event hook

// Create a run-level issue when filters select no tests
// createNoMatchingGeoSpecTestsIssue (function)
export declare function createNoMatchingGeoSpecTestsIssue(): VmIssue;

// Start serving shards
// startGeoSpecPoolWorkerHost (function)
export declare function startGeoSpecPoolWorkerHost(options: GeoSpecPoolWorkerHostOptions): void;
//   options: Worker filesystem, loaders, and message plumbing

// Compose a full selector name from an occurrence path and a part-relative interface name
// composeFullName (function)
export declare function composeFullName(occurrencePath: string, interfaceName: string): string;
//   occurrencePath: Dot-joined instance path from the root (root omitted)
//   interfaceName: Part-relative interface name

// Validate a stored (artifact-side) interface or occurrence name against the profile grammar
// isValidStoredName (function)
export declare function isValidStoredName(name: string): boolean;
//   name: Candidate stored name

// Parse a selector-side dotted path into segments
// parseSelectorPath (function)
export declare function parseSelectorPath(path: string): SelectorPathSegment[] | undefined;
//   path: Dotted selector path such as `headL.boltHole[*]`

// Resolve effective tolerances from optional overrides
// resolveTolerances (function)
export declare function resolveTolerances(overrides?: Partial<SelectorTolerances>): SelectorTolerances;
//   overrides: Partial tolerance overrides

// Reconstruct a selector from its JSON-safe serialized form
// deserializeSelector (function)
export declare function deserializeSelector(serialized: unknown): GeometrySelector;
//   serialized: Value produced by {@link serializeSelector} (possibly round-tripped through JSON)

// Serialize a selector to a JSON-safe value (RegExp as `{ pattern, flags }`) so diagnostics, agents, and tooling can exchange selectors
// serializeSelector (function)
export declare function serializeSelector(selector: GeometrySelector): unknown;
//   selector: Selector to serialize

// Build the per-subject selector index from an SB1 XDE read result and its per-occurrence face facts
// buildSelectorIndex (function)
export declare function buildSelectorIndex(options: BuildSelectorIndexOptions): SelectorIndex;
//   options: XDE structure plus subject-frame face facts per occurrence

// Resolve a geometry selector against a per-subject selector index
// Remarks: Pure and deterministic (D1): identical selector and index produce a deeply equal {@link GeometrySelection}; no fallback across evidence classes.
// resolve (function)
export declare function resolve(selector: GeometrySelector, index: SelectorIndex): GeometrySelection;
//   selector: Typed selector or string shorthand (authored path or `#o…` snapshot topology ref)
//   index: Selector index built by {@link import ('./index-builder.js').buildSelectorIndex}

// Build a `GEOSPEC_SELECTOR_AMBIGUOUS` diagnostic
// ambiguousDiagnostic (function)
export declare function ambiguousDiagnostic(options: SelectorDiagnosticOptions): GeometryDiagnostic;
//   options: Selector context and ranked candidates with facts

// Build a `GEOSPEC_SELECTOR_UNMATCHED` diagnostic
// unmatchedDiagnostic (function)
export declare function unmatchedDiagnostic(options: SelectorDiagnosticOptions): GeometryDiagnostic;
//   options: Selector context, near-misses, and repair suggestion

// Build a `GEOSPEC_SELECTOR_UNSUPPORTED_EVIDENCE` diagnostic
// unsupportedEvidenceDiagnostic (function)
export declare function unsupportedEvidenceDiagnostic(options: SelectorDiagnosticOptions): GeometryDiagnostic;
//   options: Selector context and fallback suggestion

// Create a {@link loadStep} function with shared defaults
// createStepLoader (function)
export declare function createStepLoader(defaults?: CreateStepLoaderOptions): GeoSpecStepLoader;
//   defaults: STEP loading defaults

// Load STEP/XDE/BRep evidence into a GeoSpec geometry subject
// loadStep (function)
export declare function loadStep(options: LoadStepOptions): Promise<GeometrySubject>;
//   options: STEP source, units, streaming mode, and mesh settings

// Parse the native reader's JSON payload into a structured XDE read result
// parseXdeReadResultJson (function)
export declare function parseXdeReadResultJson(json: string): XdeReadResult;
//   json: JSON emitted by the engine's XDE reader

// Create a standalone native GeoSpec assertion client
// createGeoSpecAssertionClient (function)
export declare function createGeoSpecAssertionClient(options: GeoSpecAssertionClientOptions): GeoSpecAssertionClient;
//   options: Engine, deterministic work limit and optional logical-ID controls

// Create the one registry-derived matcher surface used by every JavaScript host
// createGeoSpecMatcherMethods (function)
export declare function createGeoSpecMatcherMethods<Result>(options: {
    readonly invoke: (invocation: GeoSpecAuthoringInvocation) => Result;
    readonly polarity: GeoSpecClaimPolarity;
    readonly subject: unknown;
}): GeoSpecMatcherMethods<Result>;
//   options: Subject, polarity and host invocation function

// Submit an ancillary query with positive polarity through the native core
// Remarks: Queries return full reports even when failed or refused. Protocol errors propagate unchanged. Rust owns defaults, validation and canonical encoding.
// evaluateGeoSpecNativeQuery (function)
export declare function evaluateGeoSpecNativeQuery(options: GeoSpecNativeQueryOptions): GeoSpecCanonicalClaimReport;
//   options: Query identity, subject and authored payload

// Create Vitest matchers over an existing runner-independent client
// createGeoSpecVitestAdapter (function)
export declare function createGeoSpecVitestAdapter(client: GeoSpecAssertionClient): GeoSpecVitestAdapter;
//   client: Native GeoSpec assertion client shared with standalone use

// Register GeoSpec matchers and their settlement hook in the active Vitest file
// installGeoSpecVitest (function)
export declare function installGeoSpecVitest(client: GeoSpecAssertionClient): GeoSpecVitestAdapter;
//   client: Native client shared with standalone assertion calls

// Create a native client and register it with the active Vitest file
// setupGeoSpecVitest (function)
export declare function setupGeoSpecVitest(options: GeoSpecAssertionClientOptions): GeoSpecVitestAdapter;
//   options: Flat native assertion-client options

// Export one Tau project from Runtime's coherent source snapshot
// Remarks: This helper preserves finalized bytes and provenance metadata. It does not certify mathematical geometry or grant the runtime trusted-evaluator authority.
// exportTauProjectArtifact (function)
export declare function exportTauProjectArtifact(options: ExportTauProjectArtifactOptions): Promise<KernelResult<GeoSpecTauProjectArtifact>>;
//   options: Descriptor, fresh-runtime factory, and optional cancellation signal

// Load one trusted project config using Node's native module loader
// Remarks: Explicit selection or exactly one geospec.config.js/.mjs/.ts/.mts is allowed. TypeScript must use erasable syntax; JSON imports use standard attributes. Executable config/imports are trusted developer code, not sandboxed code. Node's same-process module cache is unchanged: load once per run and use a fresh process when fresh executable imports are required. No reload guarantee or transitive-source identity is supplied here.
// loadGeoSpecConfig (function)
export declare function loadGeoSpecConfig(options: LoadGeoSpecConfigOptions): Promise<LoadedGeoSpecConfig>;
//   options: Project, optional explicit config and defined option overrides
