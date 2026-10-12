# geospec — Functions

8 top-level symbols. Signatures are verbatim typescript.

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
