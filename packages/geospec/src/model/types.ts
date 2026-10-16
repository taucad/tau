import type { GeoSpecUnit } from '#geometry-unit.js';
import type { MeshFileFormat } from '#mesh/types.js';
import type { GeoSpecSubject } from '#model/subject.js';
import type { GeoSpecNativeModelEngine, GeoSpecNativeSourceReader } from '#model/native-model-loader.js';
import type { StepSource, StepStreamingMode } from '#step/types.js';
import type { RuntimeClient } from '@taucad/runtime';

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
 * Runtime client surface consumed by `geospec/model`.
 *
 * GeoSpec accepts concrete Tau runtime clients from multiple call sites but
 * only needs connection lifecycle and request-scoped documents. Keep this shape
 * small so typed runtime clients do not have to widen their full generic
 * method surface to GeoSpec's testing DSL. A client with `shutdown` is awaited
 * through it when GeoSpec releases an owned runtime, so its host resources are
 * closed before the caller (for example a worker thread) exits. A client with
 * `snapshotSource` lets one run reuse an identical file load after confirming
 * that the source closure it exported is unchanged.
 *
 * @public
 */
export type GeoSpecRuntimeClient = Pick<RuntimeClient, 'connect' | 'terminate'> &
  Partial<Pick<RuntimeClient, 'shutdown' | 'snapshotSource' | 'describe'>> & {
    open: (
      input: Pick<Parameters<RuntimeClient['open']>[0], 'source' | 'parameters' | 'stage' | 'watch' | 'signal'>,
    ) => Pick<ReturnType<RuntimeClient['open']>, 'export' | 'close'>;
    on?(
      event: 'telemetry',
      handler: (batch: {
        readonly entries: ReadonlyArray<{
          name: string;
          duration: number;
          startTime: number;
          workerTimeOrigin: number;
        }>;
      }) => void,
    ): () => void;
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
  /**
   * Default work-unit budget for every claim on this subject: a positive integer no greater than
   * the host's maximum (default `geoSpecMaximumWorkUnitLimit`, 512 000 000). `expectGeo(subject, { workUnitLimit })` overrides
   * it per chain. Recorded in the load evidence; it never changes the exported or admitted bytes.
   */
  workUnitLimit?: number;
  /**
   * Axis-aligned millimetre box the kernel crops the model to before export, so a large mesh model
   * can be checked region by region. Only kernels whose direct GLB export declares a `region` option
   * honor it; any other kernel, a STEP load or a crop the kernel does not confirm refuses with a typed
   * diagnostic instead of loading the whole model. The cropped subject is a different subject: its
   * admission carries the kernel's crop notice and its load evidence records `region`, so a claim on
   * it never stands for the whole model.
   */
  region?: GeoSpecLoadRegion;
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
  /**
   * Default work-unit budget for every claim on this subject: a positive integer no greater than
   * the host's maximum (default `geoSpecMaximumWorkUnitLimit`, 512 000 000). `expectGeo(subject, { workUnitLimit })` overrides
   * it per chain. Recorded in the load evidence; it never changes the exported or admitted bytes.
   */
  workUnitLimit?: number;
  /**
   * Axis-aligned millimetre box the kernel crops the model to before export, so a large mesh model
   * can be checked region by region. Only kernels whose direct GLB export declares a `region` option
   * honor it; any other kernel, a STEP load or a crop the kernel does not confirm refuses with a typed
   * diagnostic instead of loading the whole model. The cropped subject is a different subject: its
   * admission carries the kernel's crop notice and its load evidence records `region`, so a claim on
   * it never stands for the whole model.
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

/** A configured loader whose shared runtime can be released with its owner. @public */
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
