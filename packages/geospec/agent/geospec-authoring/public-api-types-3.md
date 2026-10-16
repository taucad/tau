# geospec — Types (3)

10 top-level symbols. Signatures are verbatim typescript.

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

// Installed Vitest matcher map and lifecycle settlement hook
GeoSpecVitestAdapter: {
    readonly matchers: GeoSpecVitestMatcherMap;
    flush(): Promise<void>;
}

  readonly matchers: GeoSpecVitestMatcherMap

  // GeoSpecVitestAdapter.flush (method)
  flush(): Promise<void>;

// Input for exporting one validated Tau project descriptor
ExportTauProjectArtifactOptions: {
    readonly descriptor: GeoSpecTauProjectDescriptor;
    /** Called twice so source discovery and export use separate runtime lifetimes. */
    readonly createRuntime: () => GeoSpecTauProjectRuntime | Promise<GeoSpecTauProjectRuntime>;
    readonly signal?: AbortSignal;
}

  readonly descriptor: GeoSpecTauProjectDescriptor

  // Called twice so source discovery and export use separate runtime lifetimes
  readonly createRuntime: () => GeoSpecTauProjectRuntime | Promise<GeoSpecTauProjectRuntime>

  readonly signal?: AbortSignal

// Finalized geometry bytes and the exact source/export metadata that produced them
GeoSpecTauProjectArtifact: {
    readonly format: 'step' | 'glb';
    readonly name: string;
    readonly mimeType: string;
    readonly bytes: Uint8Array<ArrayBuffer>;
    readonly frame: {
        readonly coordinateSystem: 'z-up';
        readonly lengthUnit: 'millimeter';
        readonly sourceUnit: 'mm';
    };
    readonly source: {
        readonly manifestPath: string;
        readonly manifestBytes: Uint8Array<ArrayBuffer>;
        readonly manifest: ProjectManifest;
        readonly projectEntryPath: string;
        readonly entryPath: string;
        readonly kernelId: string;
        readonly files: readonly RuntimeSourceSnapshotFile[];
    };
    readonly export: {
        readonly options: Readonly<Record<string, unknown>>;
        readonly route: NonNullable<GeometryExportIntent['route']>;
    };
}

  readonly format: 'step' | 'glb'

  readonly name: string

  readonly mimeType: string

  readonly bytes: Uint8Array<ArrayBuffer>

  readonly frame: {
          readonly coordinateSystem: 'z-up';
          readonly lengthUnit: 'millimeter';
          readonly sourceUnit: 'mm';
      }

  readonly source: {
          readonly manifestPath: string;
          readonly manifestBytes: Uint8Array<ArrayBuffer>;
          readonly manifest: ProjectManifest;
          readonly projectEntryPath: string;
          readonly entryPath: string;
          readonly kernelId: string;
          readonly files: readonly RuntimeSourceSnapshotFile[];
      }

  readonly export: {
          readonly options: Readonly<Record<string, unknown>>;
          readonly route: NonNullable<GeometryExportIntent['route']>;
      }

// Runtime surface required to snapshot and export one Tau project
GeoSpecTauProjectRuntime: RuntimeClientWithRoutes & Pick<RuntimeClient, 'shutdown' | 'snapshotSource'>

  open: (input: Pick<Parameters<RuntimeClient['open']>[0], 'source' | 'parameters' | 'stage' | 'watch' | 'signal'>) => Pick<ReturnType<RuntimeClient['open']>, 'export' | 'close'>

  // GeoSpecTauProjectRuntime.on (method)
  on?(event: 'telemetry', handler: (batch: {
          readonly entries: ReadonlyArray<{
              name: string;
              duration: number;
              startTime: number;
              workerTimeOrigin: number;
          }>;
      }) => void): () => void;

  // GeoSpecTauProjectRuntime.bestRouteFor (method)
  bestRouteFor(format: string, options?: {
          readonly kernelId?: string;
      }): GeoSpecExportRoute | undefined;

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
