# geospec — Functions

6 top-level symbols. Signatures are verbatim typescript.

// GeoSpec suite helper used inside VM-executed test modules
// describe (function)
export declare function describe(name: string, function_: GeoSpecTestCallback): void;

  // describe.skip (method)
  skip(name: string, function_?: GeoSpecTestCallback): void;

// Start a geometry assertion chain
// expectGeo (function)
export declare function expectGeo(subject: GeoSpecSubject, options?: GeoSpecExpectOptions): GeoSpecMatcher;
//   subject: geometry subject under test
//   options: Optional chain options, such as a larger `workUnitLimit` for a claim that refused with `MATCHER_TIMEOUT`

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

// Create a {@link loadModel} function over a host-supplied compiled engine
// createModelLoader (function)
export declare function createModelLoader(defaults: CreateModelLoaderOptions): ManagedGeoSpecModelLoader;
//   defaults: The compiled engine plus model loading defaults

// Load a CAD model into GeoSpec evidence
// Remarks: This is the authoring declaration: a GeoSpec runner replaces it with the host's native model loader. Called outside a runner it always throws.
// Throws: {@link GeoSpecModelLoadError} with `GEOSPEC_MODEL_LOADER_UNAVAILABLE` when no runner is active.
// loadModel (function)
export declare function loadModel<Code extends Record<string, string> = Record<string, string>>(_options: LoadModelOptions<Code>): Promise<GeoSpecSubject>;
//   _options: Source, code, or file model load options
