# geospec — Functions

8 top-level symbols. Signatures are verbatim typescript.

// Create a GeoSpec instance
// createGeoSpec (function)
export declare function createGeoSpec(): GeoSpec;

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

// Create a {@link loadModel} function with shared defaults
// createModelLoader (function)
(defaults?: CreateModelLoaderOptions) => ManagedGeoSpecModelLoader
//   defaults: Model loading defaults

// Load a CAD model into GeoSpec evidence
// loadModel (function)
export declare function loadModel<Code extends Record<string, string> = Record<string, string>>(options: LoadModelOptions<Code>): Promise<GeoSpecSubject>;
//   options: Source, code, or file model load options

// resolveRuntimeExportIntent (function)
(options: {
    runtime: GeoSpecRuntimeClient;
    format: RuntimeBackedModelFormat;
    meshLinearTolerance?: number;
    meshAngularToleranceDegrees?: number;
}) => RuntimeExportIntent | RuntimeExportIntentFailure
