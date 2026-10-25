# geospec — Types (3)

21 top-level symbols. Signatures are verbatim typescript.

// Source record preserving semantic/presentation separation and ordered roles
GeoSpecPmiRecord: {
    readonly sourceId: number;
    readonly family: 'dimension' | 'datum' | 'tolerance' | 'presentation';
    readonly channel: 'semantic' | 'presentation';
    readonly kind: string;
    readonly name: GeoSpecPmiField<string>;
    readonly first: readonly GeoSpecPmiShapeReference[];
    readonly second: readonly GeoSpecPmiShapeReference[];
    readonly numbers: GeoSpecPmiField<readonly GeoSpecPmiNumber[]>;
    readonly limits: GeoSpecPmiField<GeoSpecPmiLimits>;
    readonly interpretation: GeoSpecPmiField<string>;
    readonly raw: readonly GeoSpecPmiRawEntity[];
}

  readonly sourceId: number

  readonly family: 'dimension' | 'datum' | 'tolerance' | 'presentation'

  readonly channel: 'semantic' | 'presentation'

  readonly kind: string

  readonly name: GeoSpecPmiField<string>

  readonly first: readonly GeoSpecPmiShapeReference[]

  readonly second: readonly GeoSpecPmiShapeReference[]

  readonly numbers: GeoSpecPmiField<readonly GeoSpecPmiNumber[]>

  readonly limits: GeoSpecPmiField<GeoSpecPmiLimits>

  readonly interpretation: GeoSpecPmiField<string>

  readonly raw: readonly GeoSpecPmiRawEntity[]

// Positive-only inventory value inside the ordinary canonical query report
GeoSpecPmiInventory: {
    readonly contract: 'geospec.pmi.inventory/v1';
    readonly status: 'semantic' | 'graphical-only' | 'empty';
    readonly fileSchema: string;
    readonly editionValidation: 'not-validated';
    readonly records: readonly GeoSpecPmiRecord[];
}

  readonly contract: 'geospec.pmi.inventory/v1'

  readonly status: 'semantic' | 'graphical-only' | 'empty'

  readonly fileSchema: string

  readonly editionValidation: 'not-validated'

  readonly records: readonly GeoSpecPmiRecord[]

// Strict inventory output limits
GeoSpecPmiQueryPayload: {
    readonly maxRecords?: number;
    readonly maxOutputBytes?: number;
}

  readonly maxRecords?: number

  readonly maxOutputBytes?: number

// Complete inventory value
GeoSpecPmiQueryValue: {
    readonly inventory: GeoSpecPmiInventory;
    readonly subjectHash: string;
    readonly provenance: Readonly<Record<string, unknown>>;
}

  readonly inventory: GeoSpecPmiInventory

  readonly subjectHash: string

  readonly provenance: Readonly<Record<string, unknown>>

// Full native assertion result with the exact core-owned bytes retained
GeoSpecCanonicalClaimReport: {
    readonly canonicalClaim: Uint8Array<ArrayBuffer>;
    readonly canonicalPlan: Uint8Array<ArrayBuffer>;
    readonly canonicalResult: Uint8Array<ArrayBuffer>;
    readonly claim: Readonly<Record<string, JSONValue>>;
    readonly claimId: string;
    /** Engine diagnostics; a `MATCHER_TIMEOUT` row also carries `details.limit`, `details.used` and `details.maximumLimit`. */
    readonly diagnostics: readonly JSONValue[];
    readonly evidence?: JSONValue;
    readonly polarity: GeoSpecClaimPolarity;
    readonly result: Readonly<Record<string, JSONValue>>;
    readonly status: GeoSpecCanonicalClaimStatus;
}

  readonly canonicalClaim: Uint8Array<ArrayBuffer>

  readonly canonicalPlan: Uint8Array<ArrayBuffer>

  readonly canonicalResult: Uint8Array<ArrayBuffer>

  readonly claim: Readonly<Record<string, JSONValue>>

  readonly claimId: string

  // Engine diagnostics
  readonly diagnostics: readonly JSONValue[]

  readonly evidence?: JSONValue

  readonly polarity: GeoSpecClaimPolarity

  readonly result: Readonly<Record<string, JSONValue>>

  readonly status: GeoSpecCanonicalClaimStatus

// Exact core bytes of one claim evaluated in one engine call
GeoSpecNativeClaimEvaluation: {
    readonly canonicalClaim: Uint8Array<ArrayBuffer>;
    readonly canonicalPlan: Uint8Array<ArrayBuffer>;
    readonly canonicalResult: Uint8Array<ArrayBuffer>;
}

  readonly canonicalClaim: Uint8Array<ArrayBuffer>

  readonly canonicalPlan: Uint8Array<ArrayBuffer>

  readonly canonicalResult: Uint8Array<ArrayBuffer>

// Byte-only engine surface consumed by the runner-independent assertion client
GeoSpecNativeEngine: {
    evaluateClaim(request: Uint8Array<ArrayBuffer>): GeoSpecNativeClaimEvaluation;
    processRequest(request: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>;
}

  // GeoSpecNativeEngine.evaluateClaim (method)
  evaluateClaim(request: Uint8Array<ArrayBuffer>): GeoSpecNativeClaimEvaluation;

  // GeoSpecNativeEngine.processRequest (method)
  processRequest(request: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>;

// Success-evidence profile a product selects for its plans (PERF-OUTPUT-01)
GeoSpecNativeEvidenceProfile: 'bounded' | 'complete'

// Content-addressed subject accepted by a protocol-3 assertion plan
GeoSpecNativeSubject: {
    readonly contentHash?: string;
    readonly subjectHash?: string;
}

  readonly contentHash?: string

  readonly subjectHash?: string

// A canonical fixed-contract matcher
GeoSpecFixedMatcherDescriptor: {
    readonly contract: 'geospec.plate-two-windows/v1' | 'geospec.pmi.parallel-plane-distance/v1';
    readonly expected: 'true';
    readonly mode: 'sync';
}

  readonly contract: 'geospec.plate-two-windows/v1' | 'geospec.pmi.parallel-plane-distance/v1'

  readonly expected: 'true'

  readonly mode: 'sync'

// The platform the CLI runs against
GeoSpecCliHost: {
    /** Absolute project root for a relative `projectPath`. */
    cwd(): string;
    write(line: string): void;
    /** Recursive discovery filesystem. */
    discoveryFileSystem(projectPath: string): Parameters<typeof discoverGeoSpecFiles>[0]['filesystem'];
    /**
     * Import the project's `geospec.config.*`, or the explicit one, for its data fields.
     * @throws Error when the config is ambiguous, invalid or fails to import.
     */
    loadConfig(options: {
        projectPath: string;
        configPath: string | undefined;
    }): Promise<{
        readonly configPath?: string;
        readonly options: GeoSpecConfigData;
    }>;
    /** Build the runner the selected files execute on; its workers import the same config for its exporters. */
    createRunner(options: {
        projectPath: string;
        configPath: string | undefined;
        workers: number | undefined;
        shardTimeout: number | undefined;
        /** In-memory spec sources keyed by project-rooted path, served in place of the disk (`geospec check`). */
        sources?: Readonly<Record<string, string>>;
    }): GeoSpecRunner;
}

  // Absolute project root for a relative `projectPath`
  // GeoSpecCliHost.cwd (method)
  cwd(): string;

  // GeoSpecCliHost.write (method)
  write(line: string): void;

  // Recursive discovery filesystem
  // GeoSpecCliHost.discoveryFileSystem (method)
  discoveryFileSystem(projectPath: string): Parameters<typeof discoverGeoSpecFiles>[0]['filesystem'];

  // Import the project's `geospec.config.*`, or the explicit one, for its data fields
  // Throws: Error when the config is ambiguous, invalid or fails to import.
  // GeoSpecCliHost.loadConfig (method)
  loadConfig(options: {
          projectPath: string;
          configPath: string | undefined;
      }): Promise<{
          readonly configPath?: string;
          readonly options: GeoSpecConfigData;
      }>;

  // Build the runner the selected files execute on
  // GeoSpecCliHost.createRunner (method)
  createRunner(options: {
          projectPath: string;
          configPath: string | undefined;
          workers: number | undefined;
          shardTimeout: number | undefined;
          /** In-memory spec sources keyed by project-rooted path, served in place of the disk (`geospec check`). */
          sources?: Readonly<Record<string, string>>;
      }): GeoSpecRunner;

// Options for {@link createNodeGeoSpecCliHost}
NodeGeoSpecCliHostOptions: {
    /** Report sink used by embedding hosts and tests; defaults to stdout. */
    readonly reportStream?: (text: string) => void;
    /**
     * URLs of modules each pool worker imports for exporters that precede the config's, so a host such as `tau test`
     * can run a project with no `geospec.config.*` (see `GeoSpecExporterModule` in `geospec/runner/node`).
     */
    readonly exporterModules?: readonly string[];
    /** URL of a module each pool worker imports for its module VM (see `GeoSpecModuleVmModule` in `geospec/runner`). */
    readonly moduleVmModule?: string;
}

  // Report sink used by embedding hosts and tests
  readonly reportStream?: (text: string) => void

  // URLs of modules each pool worker imports for exporters that precede the config's, so a host such as `tau test` can run a project with no `geospec.config.*` (see `GeoSpecExporterModule` in `geospec/runner/node`)
  readonly exporterModules?: readonly string[]

  // URL of a module each pool worker imports for its module VM (see `GeoSpecModuleVmModule` in `geospec/runner`)
  readonly moduleVmModule?: string

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
    /**
     * Module VM factory; defaults to GeoSpec's plain VM (native esbuild on Node, refused elsewhere). A host that bundles
     * in a browser injects its own; Tau injects `createEsbuildModuleVm`.
     */
    readonly createModuleVm?: CreateModuleVm;
}

  // The project filesystem
  readonly filesystem: VmFileSystem

  // Rooted directory holding the config, in the filesystem's spelling
  readonly projectPath: string

  // Module VM factory
  readonly createModuleVm?: CreateModuleVm

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
