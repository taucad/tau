# geospec — Types (3)

31 top-level symbols. Signatures are verbatim typescript.

// One positive-only ancillary query
// Remarks: An explicit claimId leaves the automatic sequence unchanged. Queries return full reports without assertion errors. A query asserts nothing, so it never fails: one whose evidence is missing or cannot decide returns a refused report whose diagnostic names the reason, such as `GEOSPEC_UNSUPPORTED_EVIDENCE`.
GeoSpecQueryOptions: {
    readonly capability: GeoSpecQueryCapability;
    readonly claimId?: string;
    readonly payload?: unknown;
    readonly subject: GeoSpecNativeSubject;
}

  readonly capability: GeoSpecQueryCapability

  readonly claimId?: string

  readonly payload?: unknown

  readonly subject: GeoSpecNativeSubject

// Complete native minimum and ordered finite witnesses in canonical millimetres/Z-up
MinimumDistanceFact: {
    readonly source: 'ap242';
    readonly assurance: 'exact-brep';
    readonly unit: 'mm';
    readonly coordinateSystem: 'z-up';
    readonly subjectHash: string;
    readonly algorithmProfile: 'geospec-minimum-distance-v1';
    readonly occurrences: readonly [string, string];
    readonly distance: number;
    readonly points: readonly [readonly [number, number, number], readonly [number, number, number]];
}

  readonly source: 'ap242'

  readonly assurance: 'exact-brep'

  readonly unit: 'mm'

  readonly coordinateSystem: 'z-up'

  readonly subjectHash: string

  readonly algorithmProfile: 'geospec-minimum-distance-v1'

  readonly occurrences: readonly [string, string]

  readonly distance: number

  readonly points: readonly [readonly [number, number, number], readonly [number, number, number]]

// Complete AP242 minimum over two subject-bound occurrence paths
MinimumDistanceQuery: {
    readonly capability: 'minimumDistance';
    readonly subject: GeoSpecNativeSubject;
    readonly payload: {
        readonly pair: readonly [{
            readonly occurrencePath: string;
        }, {
            readonly occurrencePath: string;
        }];
    };
}

  readonly capability: 'minimumDistance'

  readonly subject: GeoSpecNativeSubject

  readonly payload: {
          readonly pair: readonly [{
              readonly occurrencePath: string;
          }, {
              readonly occurrencePath: string;
          }];
      }

// Geometry refusal and infrastructure interruption never masquerade as facts
MinimumDistanceResult: {
    readonly status: 'complete';
    readonly fact: MinimumDistanceFact;
} | {
    readonly status: 'refused';
    readonly code: 'unsupported-evidence' | 'invalid-selection' | 'work-limit' | 'analysis-limit' | 'resource-limit';
    readonly message: string;
} | {
    readonly status: 'interrupted';
    readonly code: 'cancelled' | 'executor-exited' | 'deadline' | 'engine-error';
    readonly message: string;
}

  readonly status: 'complete'

// Flat native query transport options
GeoSpecNativeQueryOptions: Omit<GeoSpecNativeClaimOptions, 'arguments' | 'capability' | 'kind' | 'polarity'> & {
    readonly capability: GeoSpecQueryCapability | 'minimumDistance';
    readonly payload?: unknown;
}

  readonly engine: GeoSpecNativeEngine

  readonly claimId: string

  readonly evidenceProfile?: GeoSpecNativeEvidenceProfile

  readonly subjectSlot: string

  readonly workUnitLimit: number

  // The host's largest authored budget, reported as `details.maximumLimit` on `MATCHER_TIMEOUT`
  readonly maximumWorkUnitLimit?: number

  readonly subject: GeoSpecNativeSubject

  readonly capability: GeoSpecQueryCapability | 'minimumDistance'

  readonly payload?: unknown

// Existing positive-only ancillary operations owned by the native core
GeoSpecQueryCapability: Exclude<(typeof geoSpecQueryCapabilities)[number], 'minimumDistance'>

// Explicit support state for one source-attributed inventory field
GeoSpecPmiField: {
    readonly status: 'supported' | 'missing' | 'invalid' | 'ambiguous' | 'unsupported';
    readonly value: Value | null;
    readonly reason: string | null;
}

  readonly status: 'supported' | 'missing' | 'invalid' | 'ambiguous' | 'unsupported'

  readonly value: Value | null

  readonly reason: string | null

// Original Part21 entity ID and exact source argument tokens
GeoSpecPmiRawEntity: {
    readonly sourceId: number;
    readonly kind: string;
    readonly arguments: readonly string[];
}

  readonly sourceId: number

  readonly kind: string

  readonly arguments: readonly string[]

// Source-authored scalar and Rust-normalized reduced rational millimetres
GeoSpecPmiNumber: {
    readonly sourceId: number;
    readonly authoredText: string;
    readonly unitId: number;
    readonly unitRecords: readonly GeoSpecPmiRawEntity[];
    readonly millimetres: string;
    readonly name: string;
}

  readonly sourceId: number

  readonly authoredText: string

  readonly unitId: number

  readonly unitRecords: readonly GeoSpecPmiRawEntity[]

  readonly millimetres: string

  readonly name: string

// A uniquely forward-transferred face
GeoSpecPmiFaceAssociation: {
    readonly sourceFaceId: number;
    readonly occurrenceRoute: readonly number[];
    readonly occurrence: number | null;
    readonly publicFaceOrdinal: number;
}

  readonly sourceFaceId: number

  readonly occurrenceRoute: readonly number[]

  readonly occurrence: number | null

  readonly publicFaceOrdinal: number

// One ordered role reference, including incomplete source/transfer evidence
GeoSpecPmiShapeReference: {
    readonly sourceAspectId: number | null;
    readonly sourceUsageIds: readonly number[];
    readonly sourceItemIds: readonly number[];
    readonly requestedRoute: GeoSpecPmiField<readonly number[]>;
    readonly associations: GeoSpecPmiField<readonly GeoSpecPmiFaceAssociation[]>;
}

  readonly sourceAspectId: number | null

  readonly sourceUsageIds: readonly number[]

  readonly sourceItemIds: readonly number[]

  readonly requestedRoute: GeoSpecPmiField<readonly number[]>

  readonly associations: GeoSpecPmiField<readonly GeoSpecPmiFaceAssociation[]>

// Normalized authored limits
GeoSpecPmiLimits: {
    readonly lowerMillimetres: string;
    readonly upperMillimetres: string;
    readonly basis: 'authored-limits' | 'nominal-plus-minus';
}

  readonly lowerMillimetres: string

  readonly upperMillimetres: string

  readonly basis: 'authored-limits' | 'nominal-plus-minus'

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
}

  // Report sink used by embedding hosts and tests
  readonly reportStream?: (text: string) => void

  // URLs of modules each pool worker imports for exporters that precede the config's, so a host such as `tau test` can run a project with no `geospec.config.*` (see `GeoSpecExporterModule` in `geospec/runner/node`)
  readonly exporterModules?: readonly string[]

// Installed Vitest matcher map and lifecycle settlement hook
GeoSpecVitestAdapter: {
    readonly matchers: GeoSpecVitestMatcherMap;
    flush(): Promise<void>;
}

  readonly matchers: GeoSpecVitestMatcherMap

  // GeoSpecVitestAdapter.flush (method)
  flush(): Promise<void>;

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
