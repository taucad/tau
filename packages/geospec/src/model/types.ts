import type { GeometrySubject, GeoSpecUnit, MeshFileFormat } from '#mesh/types.js';
import type { MeshSource } from '#mesh/load-mesh.js';
import type { GeoSpecOpenCascadeStepModule, StepSource, StepStreamingMode } from '#step/types.js';

/**
 * Geometry formats accepted by {@link import('./load-model.js').loadModel}.
 *
 * @public
 */
export type GeoSpecModelFormat = MeshFileFormat | 'step' | 'stp';

/**
 * Minimal runtime client shape consumed by `geospec/model`.
 *
 * @public
 */
export type GeoSpecRuntimeClient = {
  /**
   * Connect the runtime and populate capabilities before route metadata is read.
   *
   * Custom runtime clients may omit this when they already return canonical
   * Z-up millimeter geometry bytes from `export`.
   */
  connect?(): Promise<void>;
  /**
   * Export a rendered model to geometry bytes.
   *
   * @param format - Output geometry format such as `glb`.
   * @param input - Runtime model export input.
   * @returns Runtime export result with geometry bytes on success.
   */
  export(
    format: string,
    input: unknown,
  ): Promise<{
    success: boolean;
    data?: {
      bytes: Uint8Array<ArrayBuffer>;
      name?: string;
      mimeType?: string;
    };
    issues?: unknown[];
  }>;
  /**
   * Release runtime resources when this loader owns the runtime client.
   */
  terminate?(): void;
};

/**
 * Stored parameter-file shape consumed by GeoSpec parameter helpers.
 *
 * @public
 */
export type GeoSpecParameterFileEntry = {
  /** Name of the active parameter group. */
  activeGroup: string;
  /** Stored parameter groups keyed by group name. */
  groups: Record<string, { values: Record<string, unknown> }>;
  /** Optional display/run order for parameter groups. */
  order?: string[];
};

/**
 * One resolved parameter case for a model test.
 *
 * @public
 */
export type GeoSpecParameterGroup<Values extends Record<string, unknown> = Record<string, unknown>> = {
  /** Stored group name. */
  name: string;
  /** True when this is the file's active group. */
  active: boolean;
  /** Defaults merged with this group's stored overrides. */
  values: Values;
  /** Stored overrides before defaults were merged. */
  overrides: Record<string, unknown>;
  /** Provenance used in test diagnostics. */
  provenance: {
    parameterFile?: string;
    activeGroup: string;
    groupName: string;
  };
};

/**
 * Resolved parameter file with active and ordered groups.
 *
 * @public
 */
export type GeoSpecParameters<Values extends Record<string, unknown> = Record<string, unknown>> = {
  /** Active parameter group. */
  active: GeoSpecParameterGroup<Values>;
  /** All parameter groups in stored order. */
  groups: Array<GeoSpecParameterGroup<Values>>;
  /** Defaults used while resolving groups. */
  defaults: Values;
};

/**
 * Options for resolving parameter-file groups.
 *
 * @public
 */
export type GeoSpecParameterOptions<Defaults extends Record<string, unknown> = Record<string, unknown>> = {
  /** Source-code defaults merged beneath stored group overrides. */
  defaults?: Defaults;
  /** Optional parameter-file path recorded in provenance. */
  parameterFile?: string;
};

/**
 * Direct geometry-source model load options.
 *
 * @public
 */
export type LoadModelSourceOptions = {
  /** Geometry bytes, path, browser file/blob, or in-memory mesh buffer. */
  source: MeshSource | StepSource;
  /** Source geometry format. Defaults to `glb`. */
  format?: GeoSpecModelFormat;
  /** Source path recorded in provenance. */
  path?: string;
  /** Human-readable source name recorded in provenance. */
  name?: string;
  /** Geometry units. */
  unit?: GeoSpecUnit;
  /** Explicit parameters recorded in provenance. */
  parameters?: Record<string, unknown>;
  /** Parameter group provenance used when `parameters` is omitted. */
  parameterSource?: GeoSpecParameterGroup;
  /** OpenCascade.js module or factory used when loading STEP/BRep evidence. */
  openCascade?: GeoSpecOpenCascadeStepModule | (() => Promise<GeoSpecOpenCascadeStepModule>);
  /** STEP reader strategy used for STEP sources. */
  stepStreaming?: StepStreamingMode;
  /** Whether STEP loading should also produce mesh evidence. Defaults to true. */
  mesh?: boolean;
  /** Linear tolerance used while meshing exact BRep evidence. */
  meshLinearTolerance?: number;
  /** Angular tolerance in degrees used while meshing exact BRep evidence. */
  meshAngularToleranceDegrees?: number;
};

/**
 * Inline code-CAD model load options.
 *
 * @public
 */
export type LoadModelCodeOptions<Code extends Record<string, string> = Record<string, string>> = {
  /** Source files keyed by project-relative path. */
  code: Code;
  /** Entry file to render from {@link code}. */
  file: keyof Code & string;
  /** CAD kernel hint used by runtime integrations that support explicit kernel selection. */
  kernel?: 'replicad' | 'opencascade' | 'jscad' | 'manifold' | 'openscad' | 'kcl' | 'auto' | (string & {});
  /** Geometry format to export. Defaults to `glb`. */
  format?: GeoSpecModelFormat;
  /** Explicit parameters passed to the runtime. */
  parameters?: Record<string, unknown>;
  /** Parameter group provenance used when `parameters` is omitted. */
  parameterSource?: GeoSpecParameterGroup;
  /** Runtime client or lazy runtime factory. */
  runtime?: GeoSpecRuntimeClient | (() => Promise<GeoSpecRuntimeClient>);
  /** Project root used by runtime integrations. */
  projectPath?: string;
  /** OpenCascade.js module or factory used when loading STEP/BRep evidence. */
  openCascade?: GeoSpecOpenCascadeStepModule | (() => Promise<GeoSpecOpenCascadeStepModule>);
  /** STEP reader strategy used for STEP exports. */
  stepStreaming?: StepStreamingMode;
  /** Whether STEP loading should also produce mesh evidence. Defaults to true. */
  mesh?: boolean;
  /** Linear tolerance used while meshing exact BRep evidence. */
  meshLinearTolerance?: number;
  /** Angular tolerance in degrees used while meshing exact BRep evidence. */
  meshAngularToleranceDegrees?: number;
};

/**
 * Filesystem-backed model load options.
 *
 * @public
 */
export type LoadModelFileOptions = {
  /** Project-relative model file to render. */
  file: string;
  /** Project root used by runtime integrations. */
  projectPath?: string;
  /** Geometry format to export. Defaults to `glb`. */
  format?: GeoSpecModelFormat;
  /** Explicit parameters passed to the runtime. */
  parameters?: Record<string, unknown>;
  /** Parameter group provenance used when `parameters` is omitted. */
  parameterSource?: GeoSpecParameterGroup;
  /** Runtime client or lazy runtime factory. */
  runtime?: GeoSpecRuntimeClient | (() => Promise<GeoSpecRuntimeClient>);
  /** OpenCascade.js module or factory used when loading STEP/BRep evidence. */
  openCascade?: GeoSpecOpenCascadeStepModule | (() => Promise<GeoSpecOpenCascadeStepModule>);
  /** STEP reader strategy used for STEP exports. */
  stepStreaming?: StepStreamingMode;
  /** Whether STEP loading should also produce mesh evidence. Defaults to true. */
  mesh?: boolean;
  /** Linear tolerance used while meshing exact BRep evidence. */
  meshLinearTolerance?: number;
  /** Angular tolerance in degrees used while meshing exact BRep evidence. */
  meshAngularToleranceDegrees?: number;
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
) => Promise<GeometrySubject>;

/**
 * Defaults accepted by {@link import('./load-model.js').createModelLoader}.
 *
 * @public
 */
export type CreateModelLoaderOptions = {
  /** Geometry format to export when an individual call does not specify one. */
  format?: GeoSpecModelFormat;
  /** Runtime client or lazy runtime factory. */
  runtime?: GeoSpecRuntimeClient | (() => Promise<GeoSpecRuntimeClient>);
  /** Project root used by runtime integrations. */
  projectPath?: string;
  /** OpenCascade.js module or factory used when loading STEP/BRep evidence. */
  openCascade?: GeoSpecOpenCascadeStepModule | (() => Promise<GeoSpecOpenCascadeStepModule>);
  /** STEP reader strategy used for STEP sources or exports. */
  stepStreaming?: StepStreamingMode;
  /** Whether STEP loading should also produce mesh evidence. Defaults to true. */
  mesh?: boolean;
  /** Linear tolerance used while meshing exact BRep evidence. */
  meshLinearTolerance?: number;
  /** Angular tolerance in degrees used while meshing exact BRep evidence. */
  meshAngularToleranceDegrees?: number;
};
