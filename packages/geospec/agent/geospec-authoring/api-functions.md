# geospec — Functions

33 top-level symbols. Signatures are verbatim typescript.

// Create a GeoSpec instance
export declare function createGeoSpec(): GeoSpec;

// GeoSpec suite helper used inside VM-executed test modules
(name: string, function_: GeoSpecTestCallback): void;

// Start a geometry assertion chain
export declare function expectGeo(subject: unknown): GeoSpecMatcher;
//   subject: geometry subject under test

// GeoSpec test helper used inside VM-executed test modules
(name: string, function_: GeoSpecTestCallback): void;

// Alias for {@link it}
(name: string, function_: GeoSpecTestCallback): void;

// Read BRep evidence from a loaded GeoSpec subject
(options: AnalyzeBrepOptions) => AnalyzeBrepResult
//   options: BRep subject to inspect

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

(options?: {
    matcherWallBackstop?: number;
    forensic?: boolean;
}) => GeoSpecCollector

(collector: GeoSpecCollector) => void

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

// Create a {@link loadStep} function with shared defaults
(defaults?: CreateStepLoaderOptions) => GeoSpecStepLoader
//   defaults: STEP loading defaults

// Load STEP/XDE/BRep evidence into a GeoSpec geometry subject
(options: LoadStepOptions) => Promise<GeometrySubject>
//   options: STEP source, units, streaming mode, and mesh settings

// Parse the native reader's JSON payload into a structured XDE read result
(json: string) => XdeReadResult
//   json: JSON emitted by the engine's XDE reader
