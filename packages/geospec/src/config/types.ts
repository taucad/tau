import type { JSONValue } from '@taucad/runtime/types';

/**
 * Imported Tau project data for later host resolution.
 *
 * This descriptor does not validate the original manifest bytes or its schema,
 * admit an asset, export geometry, or establish finalized-artifact provenance.
 * @public
 */
export type GeoSpecTauProjectDescriptor = {
  readonly kind: 'tau-project';
  /** Normalized project-relative POSIX path identifying the imported manifest. */
  readonly manifestPath: string;
  readonly manifest: Readonly<Record<string, JSONValue>>;
  readonly format: 'step' | 'glb';
  readonly parameters?: Readonly<Record<string, JSONValue>>;
};

/**
 * Trusted project configuration using existing discovery and runner options.
 *
 * Omitted values keep their existing owner's defaults. Defined overrides
 * replace whole fields, including empty arrays, false and the subjects map.
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
  /** Positive finite milliseconds; does not define a geometry verdict. */
  matcherWallBackstop?: number;
  bail?: boolean;
  forensic?: boolean;
  cache?: boolean;
  /** Requested cache location only; loading configuration creates no store. */
  cacheDirectory?: string;
  subjects?: Readonly<Record<string, GeoSpecTauProjectDescriptor>>;
};

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
