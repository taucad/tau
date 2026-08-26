import type { GeoSpecUnit } from '#geometry-unit.js';
import type { GeometrySubject, MeshFileFormat } from '#mesh/types.js';
import type { MeshSource } from '#mesh/load-mesh.js';
import type { StepSource, StepStreamingMode } from '#step/types.js';
import type {
  ExportFormatsFor,
  ExportResult,
  KernelPlugin,
  RuntimeSource,
  RuntimeSourceFiles,
  TranscoderPlugin,
} from '@taucad/runtime';

/**
 * Geometry formats accepted by {@link import('./load-model.js').loadModel}.
 *
 * @public
 */
export type GeoSpecModelFormat = MeshFileFormat | 'step' | 'stp';

/**
 * Runtime client surface consumed by `geospec/model`.
 *
 * GeoSpec accepts concrete Tau runtime clients from multiple call sites but
 * only needs connection lifecycle and request-scoped export. Keep this shape
 * small so typed runtime clients do not have to widen their full generic
 * method surface to GeoSpec's testing DSL.
 *
 * @public
 */
type GeoSpecRuntimeExportFormat = ExportFormatsFor<readonly KernelPlugin[], readonly TranscoderPlugin[]>;

/**
 *
 *
 * @public
 */
export type GeoSpecRuntimeClient = {
  connect(): Promise<void>;
  terminate(): void;
  on?(
    event: 'telemetry',
    handler: (entries: Array<{ name: string; duration: number; startTime: number; workerTimeOrigin: number }>) => void,
  ): () => void;
  export<const Format extends GeoSpecRuntimeExportFormat, const Files extends RuntimeSourceFiles = RuntimeSourceFiles>(
    format: Format,
    options?: {
      readonly source?: RuntimeSource<Files>;
      readonly parameters?: Record<string, unknown>;
      readonly exportOptions?: Record<string, unknown>;
    },
  ): Promise<ExportResult>;
};

/**
 * Lazy runtime factory consumed by `geospec/model`.
 *
 * @public
 */
export type GeoSpecRuntimeClientFactory = () => Promise<GeoSpecRuntimeClient>;

/**
 * Explicit source adapter for formats whose runtime setup is not part of the
 * generic Tau runtime preset.
 *
 * @public
 */
export type GeoSpecRuntimeSourceAdapter = {
  id: string;
  extensions: readonly string[];
  createRuntime(options: { projectPath?: string; file?: string }): Promise<GeoSpecRuntimeClient>;
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
  /** Geometry format to export. Defaults to `glb`. */
  format?: GeoSpecModelFormat;
  /** Explicit parameters passed to the runtime. */
  parameters?: Record<string, unknown>;
  /** Runtime client or lazy runtime factory. */
  runtime?: GeoSpecRuntimeClient | GeoSpecRuntimeClientFactory;
  /** Source-specific runtime adapters, e.g. host-provided GPL-isolated kernels. */
  sourceAdapters?: readonly GeoSpecRuntimeSourceAdapter[];
  /** Project root used by runtime integrations. */
  projectPath?: string;
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
  /** Runtime client or lazy runtime factory. */
  runtime?: GeoSpecRuntimeClient | GeoSpecRuntimeClientFactory;
  /** Source-specific runtime adapters, e.g. host-provided GPL-isolated kernels. */
  sourceAdapters?: readonly GeoSpecRuntimeSourceAdapter[];
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
  runtime?: GeoSpecRuntimeClient | GeoSpecRuntimeClientFactory;
  /** Source-specific runtime adapters, e.g. host-provided GPL-isolated kernels. */
  sourceAdapters?: readonly GeoSpecRuntimeSourceAdapter[];
  /** Project root used by runtime integrations. */
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
