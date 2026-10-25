# geospec — Types (3)

9 top-level symbols. Signatures are verbatim typescript.

// Installed Vitest matcher map and lifecycle settlement hook
GeoSpecVitestAdapter: {
    readonly matchers: GeoSpecVitestMatcherMap;
    flush(): Promise<void>;
}

  readonly matchers: GeoSpecVitestMatcherMap

  // GeoSpecVitestAdapter.flush (method)
  flush(): Promise<void>;

// The installed matchers plus the project's model loader
GeoSpecVitestProject: GeoSpecVitestAdapter & {
    /** Load a model through the config's exporters; its subjects are released after the file. */
    readonly loadModel: (options: LoadModelOptions) => Promise<GeoSpecSubject>;
    /** The config file that was read, when the project has one. */
    readonly configPath: string | undefined;
    /** The build the created engine runs on; absent for a caller-owned engine. */
    readonly binding: GeoSpecEngineBinding | undefined;
}

  readonly matchers: GeoSpecVitestMatcherMap

  // GeoSpecVitestProject.flush (method)
  flush(): Promise<void>;

  // Load a model through the config's exporters
  readonly loadModel: (options: LoadModelOptions) => Promise<GeoSpecSubject>

  // The config file that was read, when the project has one
  readonly configPath: string | undefined

  // The build the created engine runs on
  readonly binding: GeoSpecEngineBinding | undefined

// Options for {@link setupGeoSpecVitestProject}
SetupGeoSpecVitestProjectOptions: Omit<GeoSpecAssertionClientOptions, 'engine' | 'maximumWorkUnitLimit'> & {
    /** Absolute project root: `loadModel({ file })` resolves against it and its `geospec.config.*` is read. */
    readonly projectPath: string;
    /** Explicit config file, resolved relative to the project unless absolute. */
    readonly configPath?: string;
    /** Fields that replace the config's whole, as a CLI flag does: `exporters` and `testTimeout` apply here. */
    readonly overrides?: Pick<GeoSpecConfig, 'exporters' | 'testTimeout'>;
    /**
     * A caller-owned engine, kept open after the file. Omitted creates this process's engine (the native addon, else
     * the WASM build) and closes it after the file.
     */
    readonly engine?: GeoSpecNativeModelEngine;
}

  readonly claimId?: (matcher: GeoSpecMatcherName, sequence: number) => string

  // Success-evidence profile of every claim and query
  readonly evidenceProfile?: GeoSpecNativeEvidenceProfile

  readonly subjectSlot?: string

  readonly workUnitLimit?: number

  // Absolute project root
  readonly projectPath: string

  // Explicit config file, resolved relative to the project unless absolute
  readonly configPath?: string

  // Fields that replace the config's whole, as a CLI flag does
  readonly overrides?: Pick<GeoSpecConfig, 'exporters' | 'testTimeout'>

  // A caller-owned engine, kept open after the file
  readonly engine?: GeoSpecNativeModelEngine

// Options for {@link readGeoSpecConfig}
ReadGeoSpecConfigOptions: {
    /** The project filesystem; paths are rooted, as the spec VM reads them. */
    readonly filesystem: VmFileSystem;
    /** Rooted directory holding the config, in the filesystem's spelling: `''` for its root, else `'sub/dir'`. */
    readonly projectPath: string;
}

  // The project filesystem
  readonly filesystem: VmFileSystem

  // Rooted directory holding the config, in the filesystem's spelling
  readonly projectPath: string

// Outcome of {@link readGeoSpecConfig}
ReadGeoSpecConfigResult: {
    readonly status: 'absent';
} | {
    readonly status: 'applied';
    readonly configPath: string;
    readonly options: GeoSpecConfigData;
} | {
    readonly status: 'not-applied';
    readonly configPath: string;
    /**
     * `unresolved-import`: the config imports a package other than `geospec/config`, which only a
     * native run can provide. `invalid`: it does not bundle, throws, or is not a valid config.
     */
    readonly reason: 'unresolved-import' | 'invalid';
    readonly message: string;
}

  readonly status: 'absent'

// Trusted project configuration using existing discovery and runner options
// Remarks: Omitted values keep their existing owner's defaults. Defined overrides replace whole fields, including empty arrays and false. Existing discovery currently treats an absent or empty include array as its default pattern. Preserving [] here does not change that consumer behavior. This is configuration data, not a canonical engine plan or a geometry result.
GeoSpecConfig: {
    include?: readonly string[];
    exclude?: readonly string[];
    testNamePattern?: string;
    /** Positive finite milliseconds; the runner owns its default. */
    testTimeout?: number;
    bail?: boolean;
    /**
     * Model exporters for `loadModel({ file })`: the first whose `extensions` claims the file exports
     * it, so order is the override. STEP and GLB sources need none. Only a runner that executes the
     * config natively reads them; a host that holds its own exporters reads the data fields only.
     */
    exporters?: readonly GeoSpecModelExporter[];
}

  include?: readonly string[]

  exclude?: readonly string[]

  testNamePattern?: string

  // Positive finite milliseconds
  testTimeout?: number

  bail?: boolean

  // Model exporters for `loadModel({ file })`
  exporters?: readonly GeoSpecModelExporter[]

// The config's data fields
GeoSpecConfigData: Omit<GeoSpecConfig, 'exporters'>

  include?: readonly string[]

  exclude?: readonly string[]

  testNamePattern?: string

  // Positive finite milliseconds
  testTimeout?: number

  bail?: boolean

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
