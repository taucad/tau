# geospec — Types (4)

4 top-level symbols. Signatures are verbatim typescript.

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

  include?: readonly string[]

  exclude?: readonly string[]

  testNamePattern?: string

  // Positive finite milliseconds
  testTimeout?: number

  // Positive finite milliseconds
  matcherWallBackstop?: number

  bail?: boolean

  forensic?: boolean

  cache?: boolean

  // Requested cache location only
  cacheDirectory?: string

  subjects?: Readonly<Record<string, GeoSpecTauProjectDescriptor>>

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

  readonly kind: 'tau-project'

  // Normalized project-relative POSIX path identifying the imported manifest
  readonly manifestPath: string

  readonly manifest: Readonly<Record<string, JSONValue>>

  readonly format: 'step' | 'glb'

  readonly parameters?: Readonly<Record<string, JSONValue>>

// Resolved file identity and validated configuration data
LoadedGeoSpecConfig: {
    readonly configPath?: string;
    readonly options: GeoSpecConfig;
}

  readonly configPath?: string

  readonly options: GeoSpecConfig

// Options for one trusted Node configuration load
LoadGeoSpecConfigOptions: {
    readonly projectPath: string;
    /** Explicit file, resolved relative to the project unless absolute. */
    readonly configPath?: string;
    /** Own defined fields override configuration without deep merging. */
    readonly overrides?: GeoSpecConfig;
}

  readonly projectPath: string

  // Explicit file, resolved relative to the project unless absolute
  readonly configPath?: string

  // Own defined fields override configuration without deep merging
  readonly overrides?: GeoSpecConfig
