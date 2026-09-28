# geospec — Functions

73 top-level symbols. Signatures are verbatim typescript.

// Create a GeoSpec instance
export declare function createGeoSpec(): GeoSpec;

// GeoSpec suite helper used inside VM-executed test modules
(name: string, function_: GeoSpecTestCallback): void;

// Start a geometry assertion chain
export declare function expectGeo(subject: unknown): GeoSpecMatcher;
//   subject: geometry subject under test

// Start a native geometry assertion chain through an explicitly native collector
export declare function expectNativeGeo(subject: GeoSpecNativeAuthoringSubject): GeoSpecNativeRunnerMatcher;
//   subject: Content-addressed native subject under test

// GeoSpec test helper used inside VM-executed test modules
(name: string, function_: GeoSpecTestCallback): void;

// Alias for {@link it}
(name: string, function_: GeoSpecTestCallback): void;

// Read BRep evidence from a loaded GeoSpec subject
(options: AnalyzeBrepOptions) => AnalyzeBrepResult
//   options: BRep subject to inspect

// Derive the `expected` value an assertion records from the call arguments
(shape: GeoSpecMatcherExpectedShape, callArguments: readonly unknown[]) => unknown
//   shape: Normalization shape from the matcher's registry entry
//   callArguments: Arguments the spec author passed, in order

// Reject a non-wire value rather than letting JSON.stringify erase it
(value: unknown) => asserts value is JSONValue

// Parse and validate canonical bytes without re-canonicalizing them
(bytes: Uint8Array<ArrayBuffer>) => JSONValue

// Encode client-owned canonical claim bytes
(value: JSONValue) => Uint8Array<ArrayBuffer>

// Runtime JSON-value guard used at every protocol trust boundary
(value: unknown, ancestors?: Set<object>) => value is JSONValue

// Convert an authoring value to protocol JSON, including the two explicit bindings the TypeScript client needs
(value: unknown, ancestors?: Set<object>) => JSONValue

// Remove the registered engine
() => void

// Describe the registered engine and its advertised capabilities
() => GeoSpecEngineDescriptor | undefined

(capability: string) => GeometryDiagnostic

// The registered engine, if any
() => GeoSpecEngineImplementation | undefined

// Look up one engine export
<Name extends keyof GeoSpecEngineHostBindings>(capability: Name) => GeoSpecEngineHostBindings[Name] | undefined
//   capability: Export name

// The registered Contract-B binding, if any
() => GeoSpecEngineProtocol | undefined

// Register the engine that executes GeoSpec claims
(implementation: GeoSpecEngineImplementation) => void
//   implementation: The engine's protocol implementation

// Look up one engine export or fail with the engine-unavailable error
<Name extends keyof GeoSpecEngineHostBindings>(capability: Name) => GeoSpecEngineHostBindings[Name]
//   capability: Export name

// Resolve selectors against a subject and report the matched entities
(options: InspectGeometryOptions) => InspectGeometryResult
//   options: Subject, selectors, and requested evidence kinds

// Find positive-volume intersections between a subject's components
(options: AnalyzeMeshOverlapOptions) => Promise<AnalyzeMeshOverlapResult>
//   options: Subject, tolerance, and optional pair selectors

// Return a detached full-statistics snapshot
(options: AnalyzeMeshOptions) => Promise<AnalyzeMeshResult>
//   options: Mesh source, format, and unit handling

// Load mesh evidence into a GeoSpec geometry subject
(options: LoadMeshOptions) => Promise<LoadMeshResult>
//   options: Mesh source, format, and unit handling

// Create a {@link loadModel} function with shared defaults
(defaults?: CreateModelLoaderOptions) => ManagedGeoSpecModelLoader
//   defaults: Model loading defaults

// Load a CAD model into GeoSpec evidence
export declare function loadModel<Code extends Record<string, string> = Record<string, string>>(options: LoadModelOptions<Code>): Promise<GeometrySubject>;
//   options: Source, code, or file model load options

(options: {
    runtime: GeoSpecRuntimeClient;
    format: RuntimeBackedModelFormat;
    meshLinearTolerance?: number;
    meshAngularToleranceDegrees?: number;
}) => RuntimeExportIntent | RuntimeExportIntentFailure

() => void

export declare function createCollector(options: GeoSpecCollectorOptions & {
    nativeAssertions: GeoSpecAssertionClientOptions;
}): GeoSpecNativeCollector;
export declare function createCollector(options?: GeoSpecCollectorOptions & {
    nativeAssertions?: undefined;
}): GeoSpecCollector;
export declare function createCollector(options?: GeoSpecCollectorOptions): GeoSpecCollector | GeoSpecNativeCollector;

(collector: GeoSpecCollector | GeoSpecNativeCollector) => void

(units: number) => void

() => void

// Compile a Vitest-style test-name pattern once for a GeoSpec run
(testNamePattern: string | RegExp | undefined) => {
    success: true;
    pattern?: GeoSpecTestNamePattern;
} | {
    success: false;
    issue: VmIssue;
}
//   testNamePattern: Optional regex source or precompiled expression

// Filter collected GeoSpec tests by compiled test-name pattern
(tests: readonly GeoSpecTestCase[], testNamePattern: GeoSpecTestNamePattern | undefined) => GeoSpecTestCase[]
//   tests: collected tests
//   testNamePattern: optional compiled regex

// Return true when a collected GeoSpec test matches the supplied compiled Vitest-style test-name pattern
(test: Pick<GeoSpecTestCase, "suite" | "name">, testNamePattern: GeoSpecTestNamePattern | undefined) => boolean
//   test: collected test metadata
//   testNamePattern: optional compiled regex

// Discover GeoSpec test files from exact files or directory roots
(options: DiscoverGeoSpecFilesOptions) => Promise<GeoSpecDiscoveryResult>
//   options: Discovery options containing a filesystem adapter and project roots

// Return true when a project-relative path names a GeoSpec test file
(path: string) => boolean
//   path: Project-relative path to inspect

// Execute an ESM GeoSpec module using the shared Tau VM substrate
export declare function runGeoSpecModule(options: RunGeoSpecModuleOptions): Promise<GeoSpecRunResult>;
//   options: filesystem and test entry path

// Create an opt-in native runner using the SDK's existing serial lifecycle
(options: GeoSpecNativeRunnerOptions) => GeoSpecRunner
//   options: VM filesystem, native engine/client options and model defaults

// Assign a bounded CPU budget across already-selected worker isolates
(options: {
    workers: number;
    budget?: number;
    hostCap: number;
}) => readonly number[]
//   options: Worker count, optional total budget, and host CPU cap

// Create a native model loader that admits actual STEP/GLB bytes and retains generation-checked handles until the owning runner finishes
(defaults: CreateGeoSpecNativeModelLoaderOptions) => ManagedGeoSpecNativeModelLoader
//   defaults: Native engine, Runtime defaults, and optional source reader

// Load a model through the active native runner VM binding
export declare function loadNativeModel<Code extends Record<string, string> = Record<string, string>>(_options: GeoSpecNativeLoadModelOptions<Code>): Promise<GeoSpecNativeModelSubject>;
//   _options: Native source or Runtime export request

// Create a GeoSpec runner for Node.js and CLI environments
(options: GeoSpecNodeRunnerOptions) => GeoSpecRunner
//   options: Filesystem, project root, loaders, and cache controls

// Create a worker-pool GeoSpec runner for Node.js
(options: GeoSpecNodePoolRunnerOptions) => GeoSpecRunner
//   options: Project root, worker count, watchdog, and cache controls

// Create a Node `VmFileSystem` rooted at `root`
(root: string) => VmFileSystem
//   root: Absolute project root path

// Create a GeoSpec runner for browser environments
(options: GeoSpecWebRunnerOptions) => GeoSpecRunner
//   options: Filesystem, project root, loaders, and lifecycle event hook

// Create a worker-pool GeoSpec runner for browser environments
(options: GeoSpecWebPoolRunnerOptions) => GeoSpecRunner
//   options: Worker factory, worker count, and lifecycle event hook

// Create a run-level issue when filters select no tests
() => VmIssue

// Start serving shards
(options: GeoSpecPoolWorkerHostOptions) => void
//   options: Worker filesystem, loaders, and message plumbing

// Compose a full selector name from an occurrence path and a part-relative interface name
(occurrencePath: string, interfaceName: string) => string
//   occurrencePath: Dot-joined instance path from the root (root omitted)
//   interfaceName: Part-relative interface name

// Validate a stored (artifact-side) interface or occurrence name against the profile grammar
(name: string) => boolean
//   name: Candidate stored name

// Parse a selector-side dotted path into segments
(path: string) => SelectorPathSegment[] | undefined
//   path: Dotted selector path such as `headL.boltHole[*]`

// Resolve effective tolerances from optional overrides
(overrides?: Partial<SelectorTolerances>) => SelectorTolerances
//   overrides: Partial tolerance overrides

// Reconstruct a selector from its JSON-safe serialized form
(serialized: unknown) => GeometrySelector
//   serialized: Value produced by {@link serializeSelector} (possibly round-tripped through JSON)

// Serialize a selector to a JSON-safe value (RegExp as `{ pattern, flags }`) so diagnostics, agents, and tooling can exchange selectors
(selector: GeometrySelector) => unknown
//   selector: Selector to serialize

// Build the per-subject selector index from an SB1 XDE read result and its per-occurrence face facts
(options: BuildSelectorIndexOptions) => SelectorIndex
//   options: XDE structure plus subject-frame face facts per occurrence

// Resolve a geometry selector against a per-subject selector index
(selector: GeometrySelector, index: SelectorIndex) => GeometrySelection
//   selector: Typed selector or string shorthand (authored path or `#o…` snapshot topology ref)
//   index: Selector index built by {@link import ('./index-builder.js').buildSelectorIndex}

// Build a `GEOSPEC_SELECTOR_AMBIGUOUS` diagnostic
(options: SelectorDiagnosticOptions) => GeometryDiagnostic
//   options: Selector context and ranked candidates with facts

// Build a `GEOSPEC_SELECTOR_UNMATCHED` diagnostic
(options: SelectorDiagnosticOptions) => GeometryDiagnostic
//   options: Selector context, near-misses, and repair suggestion

// Build a `GEOSPEC_SELECTOR_UNSUPPORTED_EVIDENCE` diagnostic
(options: SelectorDiagnosticOptions) => GeometryDiagnostic
//   options: Selector context and fallback suggestion

// Create a {@link loadStep} function with shared defaults
(defaults?: CreateStepLoaderOptions) => GeoSpecStepLoader
//   defaults: STEP loading defaults

// Load STEP/XDE/BRep evidence into a GeoSpec geometry subject
(options: LoadStepOptions) => Promise<GeometrySubject>
//   options: STEP source, units, streaming mode, and mesh settings

// Parse the native reader's JSON payload into a structured XDE read result
(json: string) => XdeReadResult
//   json: JSON emitted by the engine's XDE reader

// Create a standalone native GeoSpec assertion client
(options: GeoSpecAssertionClientOptions) => GeoSpecAssertionClient
//   options: Engine, deterministic work limit and optional logical-ID controls

// Create the one registry-derived matcher surface used by every JavaScript host
<Result>(options: {
    readonly invoke: (invocation: GeoSpecAuthoringInvocation) => Result;
    readonly polarity: GeoSpecClaimPolarity;
    readonly subject: unknown;
}) => GeoSpecMatcherMethods<Result>
//   options: Subject, polarity and host invocation function

// Create the native matcher surface from the legacy methods plus its fixed-contract extensions
<Result>(options: {
    readonly invoke: (invocation: GeoSpecNativeAuthoringInvocation) => Result;
    readonly polarity: GeoSpecClaimPolarity;
    readonly subject: unknown;
}) => GeoSpecNativeMatcherMethods<Result>
//   options: Subject, polarity and native invocation function

// Submit an ancillary query with positive polarity through the native core
(options: GeoSpecNativeQueryOptions) => GeoSpecCanonicalClaimReport
//   options: Query identity, subject and authored payload

// Create Vitest matchers over an existing runner-independent client
(client: GeoSpecAssertionClient) => GeoSpecVitestAdapter
//   client: Native GeoSpec assertion client shared with standalone use

// Register GeoSpec matchers and their settlement hook in the active Vitest file
(client: GeoSpecAssertionClient) => GeoSpecVitestAdapter
//   client: Native client shared with standalone assertion calls

// Create a native client and register it with the active Vitest file
(options: GeoSpecAssertionClientOptions) => GeoSpecVitestAdapter
//   options: Flat native assertion-client options

// Export one Tau project from Runtime's coherent source snapshot
(options: ExportTauProjectArtifactOptions) => Promise<KernelResult<GeoSpecTauProjectArtifact>>
//   options: Descriptor, fresh-runtime factory, and optional cancellation signal

// Load one trusted project config using Node's native module loader
(options: LoadGeoSpecConfigOptions) => Promise<LoadedGeoSpecConfig>
//   options: Project, optional explicit config and defined option overrides
