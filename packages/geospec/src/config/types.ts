import type { GeoSpecModelExporter } from '#model/types.js';

/**
 * Trusted project configuration using existing discovery and runner options.
 *
 * Omitted values keep their existing owner's defaults. Defined overrides
 * replace whole fields, including empty arrays and false.
 * Existing discovery currently treats an absent or empty include array as its
 * default pattern. Preserving [] here does not change that consumer behavior.
 * This is configuration data, not a canonical engine plan or a geometry result.
 * @public
 */
export type GeoSpecConfig = {
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
};

/** The config's data fields: everything a host that holds its own exporters reads. @public */
export type GeoSpecConfigData = Omit<GeoSpecConfig, 'exporters'>;

/** Options for one trusted Node configuration load. @public */
export type LoadGeoSpecConfigOptions = {
  readonly projectPath: string;
  /** Explicit file, resolved relative to the project unless absolute. */
  readonly configPath?: string;
  /** Own defined fields override configuration without deep merging. */
  readonly overrides?: GeoSpecConfig;
};

/** Resolved file identity and validated configuration data. @public */
export type LoadedGeoSpecConfig = {
  readonly configPath?: string;
  readonly options: GeoSpecConfig;
};
