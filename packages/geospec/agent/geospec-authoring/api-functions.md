# geospec — Functions

7 top-level symbols. Signatures are verbatim typescript.

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
