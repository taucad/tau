# geospec — Types (4)

3 top-level symbols. Signatures are verbatim typescript.

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
