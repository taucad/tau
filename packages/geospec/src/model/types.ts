import type { GeoSpecUnit } from '#geometry-unit.js';
import type { GeometryDiagnostic, MeshFileFormat } from '#mesh/types.js';
import type { GeoSpecSubject } from '#model/subject.js';
import type { GeoSpecNativeModelEngine, GeoSpecNativeSourceReader } from '#model/native-model-loader.js';
import type { StepSource, StepStreamingMode } from '#step/types.js';

/**
 * In-memory triangle mesh source.
 *
 * @public
 */
export type MeshBufferSource = {
  format: 'mesh-buffer';
  positions: Float32Array<ArrayBuffer> | number[];
  indices?: Uint32Array<ArrayBuffer> | Uint16Array<ArrayBuffer> | number[];
  name?: string;
};

/**
 * Mesh source forms accepted by {@link import('./load-model.js').loadModel}.
 *
 * @public
 */
export type MeshSource = Uint8Array<ArrayBuffer> | ArrayBuffer | Blob | File | URL | string | MeshBufferSource;

/**
 * Geometry formats accepted by {@link import('./load-model.js').loadModel}.
 *
 * @public
 */
export type GeoSpecModelFormat = MeshFileFormat | 'step' | 'stp';

/**
 * Formats a {@link GeoSpecModelExporter} may produce from a source-kind file.
 *
 * @public
 */
export type GeoSpecExportFormat = Extract<GeoSpecModelFormat, 'glb' | 'step'>;

/**
 * What a {@link GeoSpecModelExporter} declares it can do. The loader refuses a load the exporter
 * cannot serve with `GEOSPEC_EXPORTER_UNSUPPORTED` before it calls `export`.
 *
 * @public
 */
export type GeoSpecExporterCapabilities = {
  /** The formats `export` produces; at least one. A GLB-only exporter refuses STEP loads up front. */
  readonly formats: readonly GeoSpecExportFormat[];
  /** Accepts `parameters`. Without it, a load that passes parameters refuses. */
  readonly parameters?: boolean;
  /** Crops to `region` (an axis-aligned millimetre box) before export. Without it, a region load refuses. */
  readonly region?: boolean;
  /** Accepts `inline` sources, which back `loadModel({ code })`. Without it, an inline load refuses. */
  readonly inlineSources?: boolean;
};

/**
 * One export request. Every field but `inline` and `signal` maps onto subprocess protocol 1, so the
 * same request crosses a process boundary unchanged.
 *
 * @public
 */
export type GeoSpecModelExportRequest = {
  /** Entry file, as a path from the project root. */
  readonly file: string;
  /** Absolute project root the exporter resolves `file` and its imports against, when the host has one. */
  readonly projectPath?: string;
  readonly format: GeoSpecExportFormat;
  /** JSON-serialisable parameter values; present only when the exporter declares `parameters`. */
  readonly parameters?: Readonly<Record<string, unknown>>;
  /** Tessellation tolerances for a mesh export. */
  readonly mesh?: { readonly linearTolerance?: number; readonly angularToleranceDegrees?: number };
  /** Millimetre crop box; present only when the exporter declares `region`. */
  readonly region?: GeoSpecLoadRegion;
  /** Source text keyed by project-relative path; present only when the exporter declares `inlineSources`. */
  readonly inline?: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
};

/**
 * The bytes an exporter returns, in the canonical Z-up millimetre frame.
 *
 * @public
 */
export type GeoSpecModelArtifact = {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly format: GeoSpecExportFormat;
  /** Unit of raw GLB coordinates; defaults to `'mm'`. STEP carries its own unit. */
  readonly sourceUnit?: GeoSpecUnit;
  /** External resources the primary bytes reference, by name. */
  readonly resources?: ReadonlyArray<{ readonly name: string; readonly bytes: Uint8Array<ArrayBuffer> }>;
  /**
   * Every source file the export read, as a path from the project root with its SHA-256 (64 hex digits,
   * optionally prefixed `sha256:`), or `'missing'` for a file the export looked for and did not find. The
   * load records it as the subject's source revision.
   */
  readonly consumedSources?: GeoSpecConsumedSources;
  /** Notices from a successful export, admitted with the subject so its evidence keeps them. */
  readonly diagnostics?: readonly GeometryDiagnostic[];
  /** The export options the exporter applied, recorded in the load evidence beside the exporter id. */
  readonly exportOptions?: Readonly<Record<string, unknown>>;
};

/**
 * The source files one export read, each with its SHA-256 or `'missing'`.
 *
 * @public
 */
export type GeoSpecConsumedSources = ReadonlyArray<{ readonly path: string; readonly sha256: string }>;

/**
 * Turns a source-kind model file into GLB or STEP bytes for GeoSpec. Hosts pass exporters to the
 * model loader; the first whose `extensions` claim a file exports it. `extensions` have no leading dot,
 * and `'*'` claims every file. `export` may be called concurrently; the exporter owns its caching.
 *
 * @public
 */
export type GeoSpecModelExporter = {
  readonly id: string;
  readonly extensions: readonly string[];
  readonly capabilities: GeoSpecExporterCapabilities;
  export(request: GeoSpecModelExportRequest): Promise<GeoSpecModelArtifact>;
  /**
   * The sources an export of `file` would read now, without exporting. With it, the loader reuses an
   * earlier identical load in the same scope when every digest still matches; without it, every file
   * load exports afresh.
   */
  revision?(
    request: Pick<GeoSpecModelExportRequest, 'file' | 'projectPath'>,
  ): Promise<GeoSpecConsumedSources | undefined>;
  /**
   * Releases what the exporter created for one scope. The loader calls it from `releaseAll` for every
   * exporter it exported through in that scope; the exporter stays usable for the next one.
   */
  close?(): Promise<void>;
};

/**
 * Axis-aligned crop box in canonical Z-up millimetres; every `min` axis is below its `max` axis.
 *
 * @public
 */
export type GeoSpecLoadRegion = {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
};

/**
 * Direct geometry-source model load options.
 *
 * @public
 */
export type LoadModelSourceOptions = {
  /** Geometry bytes, path, browser file/blob, or in-memory mesh buffer. */
  source: MeshSource | StepSource;
  /** Named external resources consumed alongside the direct geometry bytes. */
  resources?: ReadonlyArray<{ readonly name: string; readonly source: MeshSource | StepSource }>;
  /**
   * Project-relative folder a path `source` and each resource path resolve in. Omitted, they resolve against the
   * project root. Recorded in the load evidence.
   */
  rootDir?: string;
  /** Source geometry format. Defaults to `glb`. */
  format?: GeoSpecModelFormat;
  /** Source path recorded in provenance. */
  path?: string;
  /** Human-readable source name recorded in provenance. */
  name?: string;
  /** Coordinate unit of raw GLB/glTF or mesh-buffer data before canonical millimetre normalization. */
  sourceUnit?: GeoSpecUnit;
  /** Explicit parameters recorded in provenance. */
  parameters?: Record<string, unknown>;
  /** STEP reader strategy used for STEP sources. */
  stepStreaming?: StepStreamingMode;
  /** Whether STEP loading should also produce mesh evidence. Defaults to true. */
  mesh?: boolean;
  /** Linear tolerance used while meshing exact BRep evidence. */
  meshLinearTolerance?: number;
  /** Angular tolerance in degrees used while meshing exact BRep evidence. */
  meshAngularToleranceDegrees?: number;
  /**
   * Default work-unit budget for every claim on this subject: a positive integer no greater than
   * the host's maximum (default `geoSpecMaximumWorkUnitLimit`, 512 000 000). `expectGeo(subject, { workUnitLimit })` overrides
   * it per chain. Recorded in the load evidence; it never changes the exported or admitted bytes.
   */
  workUnitLimit?: number;
};

/**
 * Inline code-CAD model load options.
 *
 * @public
 */
export type LoadModelCodeOptions<Code extends Record<string, string> = Record<string, string>> = {
  /** Source files keyed by project-relative path. */
  code: Code;
  /** Entry path to render from {@link code}. */
  file: keyof Code & string;
  /** Not accepted: inline code has no project folder to resolve in, and a load naming one is refused. */
  rootDir?: never;
  /** Geometry format to export. Defaults to `glb`. */
  format?: GeoSpecModelFormat;
  /** Explicit parameters passed to the exporter. */
  parameters?: Record<string, unknown>;
  /** Absolute project root passed to the exporter. */
  projectPath?: string;
  /** STEP reader strategy used for STEP exports. */
  stepStreaming?: StepStreamingMode;
  /** Whether STEP loading should also produce mesh evidence. Defaults to true. */
  mesh?: boolean;
  /** Linear tolerance used while meshing exact BRep evidence. */
  meshLinearTolerance?: number;
  /** Angular tolerance in degrees used while meshing exact BRep evidence. */
  meshAngularToleranceDegrees?: number;
  /**
   * Default work-unit budget for every claim on this subject: a positive integer no greater than
   * the host's maximum (default `geoSpecMaximumWorkUnitLimit`, 512 000 000). `expectGeo(subject, { workUnitLimit })` overrides
   * it per chain. Recorded in the load evidence; it never changes the exported or admitted bytes.
   */
  workUnitLimit?: number;
  /**
   * Axis-aligned millimetre box the exporter crops the model to before export, so a large mesh model
   * can be checked region by region. Only an exporter that declares `region` honours it; any other
   * exporter, or a crop the exporter cannot make, refuses with a typed diagnostic instead of loading
   * the whole model. The cropped subject is a different subject: its load evidence records `region`,
   * so a claim on it never stands for the whole model.
   */
  region?: GeoSpecLoadRegion;
};

/**
 * Filesystem-backed model load options.
 *
 * @public
 */
export type LoadModelFileOptions = {
  /**
   * Model file to render, as a path from the project root: the same root every tool's `targetFile` resolves
   * against, which the result names as `projectRoot` where the host reports it, as `tau mcp` does.
   */
  file: string;
  /**
   * Project-relative folder `file` resolves in, for a suite that loads from somewhere other than the project root:
   * `loadModel({ file: 'main.ts', rootDir: 'parts/gear' })` loads `parts/gear/main.ts`. Recorded in the load
   * evidence.
   */
  rootDir?: string;
  /** Absolute project root passed to the exporter. */
  projectPath?: string;
  /** Geometry format to export. Defaults to `glb`. */
  format?: GeoSpecModelFormat;
  /** Explicit parameters passed to the exporter. */
  parameters?: Record<string, unknown>;
  /** STEP reader strategy used for STEP exports. */
  stepStreaming?: StepStreamingMode;
  /** Whether STEP loading should also produce mesh evidence. Defaults to true. */
  mesh?: boolean;
  /** Linear tolerance used while meshing exact BRep evidence. */
  meshLinearTolerance?: number;
  /** Angular tolerance in degrees used while meshing exact BRep evidence. */
  meshAngularToleranceDegrees?: number;
  /**
   * Default work-unit budget for every claim on this subject: a positive integer no greater than
   * the host's maximum (default `geoSpecMaximumWorkUnitLimit`, 512 000 000). `expectGeo(subject, { workUnitLimit })` overrides
   * it per chain. Recorded in the load evidence; it never changes the exported or admitted bytes.
   */
  workUnitLimit?: number;
  /**
   * Axis-aligned millimetre box the exporter crops the model to before export, so a large mesh model
   * can be checked region by region. Only an exporter that declares `region` honours it; any other
   * exporter, or a crop the exporter cannot make, refuses with a typed diagnostic instead of loading
   * the whole model. The cropped subject is a different subject: its load evidence records `region`,
   * so a claim on it never stands for the whole model.
   */
  region?: GeoSpecLoadRegion;
};

/**
 * Options accepted by {@link import('./load-model.js').loadModel}.
 *
 * @public
 */
export type LoadModelOptions<Code extends Record<string, string> = Record<string, string>> =
  | LoadModelSourceOptions
  | LoadModelCodeOptions<Code>
  | LoadModelFileOptions;

/**
 * Function shape used by GeoSpec runners to provide model loading inside VM
 * executed test files.
 *
 * @public
 */
export type GeoSpecModelLoader = <Code extends Record<string, string> = Record<string, string>>(
  options: LoadModelOptions<Code>,
) => Promise<GeoSpecSubject>;

/** A configured loader whose admissions can be released with its owner. @public */
export type ManagedGeoSpecModelLoader = GeoSpecModelLoader & {
  dispose(): Promise<void>;
};

/**
 * Defaults accepted by {@link import('./load-model.js').createModelLoader}.
 *
 * @public
 */
export type CreateModelLoaderOptions = {
  /** Initialized compiled engine supplied by the host, never selected by an authored spec. */
  engine: GeoSpecNativeModelEngine;
  /** Rooted host reader for direct filesystem or URL sources. */
  readSource?: GeoSpecNativeSourceReader;
  /** Geometry format to export when an individual call does not specify one. */
  format?: GeoSpecModelFormat;
  /** Model exporters for source-kind files; the first whose `extensions` claim the file exports it. */
  exporters?: readonly GeoSpecModelExporter[];
  /** Absolute project root passed to the exporter. */
  projectPath?: string;
  /** STEP reader strategy used for STEP sources or exports. */
  stepStreaming?: StepStreamingMode;
  /** Whether STEP loading should also produce mesh evidence. Defaults to true. */
  mesh?: boolean;
  /** Linear tolerance used while meshing exact BRep evidence. */
  meshLinearTolerance?: number;
  /** Angular tolerance in degrees used while meshing exact BRep evidence. */
  meshAngularToleranceDegrees?: number;
};
