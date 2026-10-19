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
   * optionally prefixed `sha256:`). The load records it as the subject's source revision.
   */
  readonly consumedSources?: ReadonlyArray<{ readonly path: string; readonly sha256: string }>;
};

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
  /** Releases what the exporter holds; called by whoever constructed it, never by the loader. */
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
  /**
   * Model exporters for source-kind files, consulted when no runtime is configured; the first whose
   * `extensions` claim the file exports it.
   */
  exporters?: readonly GeoSpecModelExporter[];
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
