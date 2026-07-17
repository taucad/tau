import deepmerge from 'deepmerge';
import { logLevels, lookupExportFidelity } from '@taucad/types/constants';
import { joinPath, parentDirectory } from '@taucad/utils/path';
import { named, preserveMethodNames } from '#framework/named.js';
import type { FileExtension, GeometryFile, OnWorkerLog } from '@taucad/types';
import type { JSONSchema7 } from '@taucad/json-schema';
import { SharedPool } from '@taucad/memory';
import type {
  HashedGeometryResult,
  CreateGeometryResult,
  ExportGeometryResult,
  GetParametersResult,
  KernelIssue,
  CapabilitiesManifest,
  ExportRoute,
} from '#types/runtime.types.js';
import type {
  KernelFileSystem,
  RuntimeFileSystemBase,
  KernelRuntime,
  RuntimeLogger,
  InitializeInput,
  GetParametersInput,
  CreateGeometryInput,
  GetDependenciesInput,
  GetDependenciesResult,
  ExportGeometryInput,
  ExportGeometryRequest,
  KernelExportGeometryInput,
} from '#types/runtime-kernel.types.js';
import type {
  KernelMiddlewareRuntime,
  CreateGeometryHandler,
  ExportGeometryHandler,
  GetParametersHandler,
} from '#types/runtime-middleware.types.js';
import type {
  KernelBundler,
  BuiltinModule,
  BundleResult,
  ExecuteResult,
  BundlerDefinition,
} from '#types/runtime-bundler.types.js';
import type {
  Dependency,
  FileDependency,
  MiddlewareDependency,
  FrameworkDependency,
  OptionDependency,
  ParameterDependency,
  RenderOptionsDependency,
  KernelDependency,
  ExportDependency,
  AssetDependency,
} from '#types/runtime-dependency.types.js';
import type {
  TelemetryEntry,
  RenderPhase,
  RuntimeExportModelArgs,
  WorkerState,
} from '#types/runtime-protocol.types.js';
import { signalSlot, abortReason as abortReasonEnum } from '#types/runtime-protocol.types.js';
import type { TranscoderDefinition, TranscoderEdge, TranscoderRuntime } from '#types/runtime-transcoder.types.js';
import { isRenderAbortedError, RenderAbortedError } from '#framework/runtime-worker-client.js';
import { setAbortContext, clearAbortContext } from '#framework/cooperative-abort.js';
import { createRuntimeFileSystem } from '#filesystem/create-runtime-filesystem.js';
import { toJSONSchema } from 'zod';
import type { z } from 'zod';
import { createKernelError } from '#kernels/kernel-helpers.js';
import { cooperativeYield } from '#framework/async-polyfills.js';
import { parameterDebounce, fileChangeDebounce } from '#framework/runtime-framework.constants.js';
import { hashBytes, hashString } from '@taucad/utils/hash';
import { RuntimeTracer } from '#framework/runtime-tracer.js';
import { WorkerTelemetryCollector } from '#framework/worker-telemetry.js';
import type { KernelMiddleware } from '#middleware/runtime-middleware.js';
import { createMiddlewareRuntime } from '#middleware/runtime-middleware.js';
import { clearExecuteCache } from '#bundler/esbuild-core.js';
import type { BundlerPlugin, MiddlewarePlugin, TranscoderPlugin } from '#plugins/plugin-types.js';
import { resolveRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';
import type { RuntimePluginDefinitionCarrier } from '#plugins/plugin-runtime-definition.js';
import { createWorkerFileSystemProxy } from '#transport/_internal/worker-filesystem-proxy.js';
import type { WorkerFileSystemProxy } from '#transport/_internal/worker-filesystem-proxy.js';
import type { WatchEvent } from '@taucad/filesystem';
import type {
  DependencyResolutionContext,
  KernelBinding,
  MaterializedRender,
  NativeHandleSlot,
  OperationOwner,
  RenderIdentity,
  SerializedNativeHandleSlot,
} from '#framework/render-artifact.js';
import { createRenderIdentityKey } from '#framework/render-artifact.js';
import { finalizeExportArtifactSet } from '#framework/export-artifact-finalizer.js';
const tauVersion = '0.1.0';

type FileSystemProxy = WorkerFileSystemProxy;

type TranscoderPluginEntry = TranscoderPlugin<Record<string, unknown>> &
  RuntimePluginDefinitionCarrier<TranscoderDefinition>;

export type KernelWorkerOptions = {
  readonly middleware?: readonly MiddlewarePlugin[];
  readonly bundlers?: readonly BundlerPlugin[];
  readonly transcoders?: readonly TranscoderPluginEntry[];
};

type LoadedTranscoder = {
  id: string;
  definition: TranscoderDefinition;
  context: unknown;
  edges: readonly TranscoderEdge[];
};

export type LastSettledRenderIdentity = RenderIdentity;

type OwnerBoundExportRoute =
  | {
      kind: 'direct';
      kernelId: string | undefined;
      targetFormat: FileExtension;
      options: Record<string, unknown>;
    }
  | {
      kind: 'transcoded';
      kernelId: string;
      sourceFormat: FileExtension;
      targetFormat: FileExtension;
      transcoderId: string;
      sourceOptions: Record<string, unknown>;
      edgeOptions: Record<string, unknown>;
    };

type OwnerBoundExportPlan =
  | {
      success: true;
      owner: OperationOwner;
      input: ExportGeometryRequest;
      route: OwnerBoundExportRoute;
      dependency: ExportDependency;
    }
  | {
      success: false;
      result: ExportGeometryResult;
    };

/* TR16 fast-path adapter — wraps an inline `RuntimeFileSystemBase` as a
 * `FileSystemProxy` so the kernel-worker boundary remains uniform whether
 * the FS arrives via a `MessagePort` bridge or in-process. The `dispose`
 * is a no-op (the inline FS owns its own lifecycle, managed by the runner
 * that supplied it). When the inline FS lacks `watch`, we surface a
 * subscription that returns an immediate unsubscribe — kernels that watch
 * dependencies still function, they just receive no events. */
function adaptInlineFileSystem(fs: RuntimeFileSystemBase): FileSystemProxy {
  /* `noop` covers the absent-watch fallback (returns an unsubscribe that
   * does nothing) and the FS-handle `dispose` (the inline FS owns its
   * own lifecycle, managed by whoever supplied it to the runner). */
  // oxlint-disable-next-line eslint/no-empty-function -- intentional no-op for inline-FS lifecycle bookkeeping
  const noop = (): void => {};
  return {
    id: fs.id,
    capabilities: fs.capabilities,
    readFile: fs.readFile.bind(fs),
    writeFile: fs.writeFile.bind(fs),
    mkdir: fs.mkdir.bind(fs),
    readdir: fs.readdir.bind(fs),
    unlink: fs.unlink.bind(fs),
    rmdir: fs.rmdir.bind(fs),
    rename: fs.rename.bind(fs),
    stat: fs.stat.bind(fs),
    lstat: fs.lstat.bind(fs),
    exists: fs.exists.bind(fs),
    watch: fs.watch ? fs.watch.bind(fs) : () => noop,
    dispose: noop,
  };
}

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const item of a) {
    if (!b.has(item)) {
      return false;
    }
  }
  return true;
}
/**
 * A resolved middleware instance paired with its parsed options.
 * @public
 */
export type ResolvedMiddleware = {
  middleware: KernelMiddleware;
  options: Record<string, unknown>;
  id: string;
  enabled: boolean;
};

/**
 * Base class for kernel workers providing lifecycle, middleware, bundler, and caching infrastructure.
 * @public
 */
export abstract class KernelWorker<Options extends Record<string, unknown> = Record<string, unknown>> {
  /**
   * The supported export formats for the worker.
   * @deprecated Will be replaced by capabilities manifest discovery.
   */
  protected static readonly supportedExportFormats: string[] = [];

  /**
   * Extract the file extension from a filename.
   * Returns the extension without the leading dot, or empty string if no extension.
   *
   * @param filename - The filename to extract the extension from.
   * @returns The file extension (e.g., 'ts', 'scad', 'kcl') or empty string.
   */
  protected static getFileExtension(filename: string): string {
    const lastDotIndex = filename.lastIndexOf('.');
    if (lastDotIndex === -1 || lastDotIndex === filename.length - 1) {
      return '';
    }

    return filename.slice(lastDotIndex + 1).toLowerCase();
  }

  /**
   * Extract the basename (filename without directory path) from a full path.
   *
   * @param filename - The full filename path (e.g., 'public/kcl-samples/bottle/main.kcl')
   * @returns Just the basename (e.g., 'main.kcl')
   */
  protected static getBasename(filename: string): string {
    const lastSlashIndex = filename.lastIndexOf('/');
    return lastSlashIndex === -1 ? filename : filename.slice(lastSlashIndex + 1);
  }

  /**
   * Convert an absolute path to a path relative to the project root.
   *
   * @param absolutePath - The full absolute path (e.g., '/projects/myproject/src/main.scad')
   * @param basePath - The project root path (e.g., '/projects/myproject')
   * @returns The relative path (e.g., 'src/main.scad')
   */
  protected static resolveToRelative(absolutePath: string, basePath: string): string {
    // Ensure basePath ends without a trailing slash for consistent behavior
    const normalizedBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;

    if (absolutePath.startsWith(`${normalizedBase}/`)) {
      return absolutePath.slice(normalizedBase.length + 1);
    }

    // If the path doesn't start with the base, return as-is
    return absolutePath;
  }

  /**
   * Resolve a path relative to the project root to an absolute path.
   *
   * @param relativePath - Path relative to project root
   * @param basePath - The project root path
   * @returns Absolute path
   */
  protected static resolveFromRoot(relativePath: string, basePath: string): string {
    return joinPath(basePath, relativePath);
  }

  /** Callback for pushing state changes to the dispatcher (postMessage fallback). */
  public onStateChanged?: (state: WorkerState, detail?: string) => void;

  /**
   * Callback for pushing geometry results to the dispatcher. The `rgen`
   * argument is the autonomous render generation that produced the
   * result; downstream consumers gate frame application on `rgen >=
   * lastApplied` to ignore frames from superseded renders.
   */
  public onGeometryComputed?: (result: HashedGeometryResult, rgen: number) => void;

  /**
   * Callback for pushing parameter results to the dispatcher. The
   * `rgen` argument correlates the resolved schema with the originating
   * render generation so the consumer can pair early-arriving parameter
   * frames with the eventual `geometryComputed` for the same `rgen`.
   */
  public onParametersResolved?: (result: GetParametersResult, rgen: number) => void;

  /**
   * Callback for pushing progress updates to the dispatcher. The
   * `rgen` argument lets the consumer discard progress frames from
   * superseded renders.
   */
  public onProgressUpdate?: (phase: RenderPhase, rgen: number, detail?: Record<string, unknown>) => void;

  /**
   * Callback for pushing errors to the dispatcher. `rgen` is supplied
   * for render-scoped failures and omitted for connection-scoped
   * issues (e.g. handshake failure, transcoder load).
   */
  public onError?: (issues: KernelIssue[], rgen?: number) => void;

  /** Callback for pushing active kernel changes to the dispatcher. */
  public onActiveKernelChanged?: (kernelId: string | undefined) => void;

  /** Callback for pushing updated capabilities manifest to the dispatcher. */
  public onCapabilitiesUpdated?: (capabilities: CapabilitiesManifest) => void;

  /** Raw Zod schemas for runtime validation, keyed by kernel ID → format. Populated from kernel definitions. */
  protected readonly kernelExportZodSchemasMap = new Map<string, Partial<Record<FileExtension, z.ZodType>>>();

  /** Raw Zod schema for render option validation, keyed by kernel ID. Populated from kernel definitions. */
  protected readonly kernelRenderZodSchemaMap = new Map<string, z.ZodType>();

  /**
   * Framework-managed native geometry handle currently loaded in memory.
   * The handle is opaque to the framework; exports may use it only when the
   * identity-bound nativeHandleSlot proves it belongs to the requested render.
   */
  protected nativeHandle: unknown;

  /**
   * Compatibility mirror for tests/subclasses that directly clear the old field.
   * Export code resolves durable snapshots through serializedNativeHandleSlot.
   */
  protected lastSerializedNativeHandle: unknown;

  protected pendingNativeHandle: unknown;
  protected nativeHandleSlot: NativeHandleSlot | undefined;
  protected serializedNativeHandleSlot: SerializedNativeHandleSlot | undefined;

  /** Fully initialized bundlers keyed by file extension. Shared context across extensions of the same bundler. */
  protected loadedBundlers = new Map<string, { definition: BundlerDefinition; ctx: unknown }>();

  /** Worker-owned runtime middleware plugins. */
  protected middlewarePlugins: readonly MiddlewarePlugin[];

  /** Worker-owned runtime bundler plugins. */
  protected bundlerPlugins: readonly BundlerPlugin[];

  /** Worker-owned runtime transcoder plugins. */
  protected transcoderPlugins: readonly TranscoderPluginEntry[];

  /**
   * Human-readable identifier for this worker, used in log output and error diagnostics
   * (e.g., `'ReplicadWorker'`, `'TauWorker'`, `'ZooWorker'`).
   */
  protected abstract readonly name: string;

  /**
   * Pending bundler definitions awaiting context initialization, keyed by extension.
   * Definitions are loaded eagerly (during ensureLoadedBundler) but context creation
   * is deferred until first use, when the project path is known (after setBasePath).
   */
  private readonly pendingBundlerInits = new Map<
    string,
    {
      definition: BundlerDefinition;
      extensions: string[];
      options?: Record<string, unknown>;
    }
  >();

  /**
   * The options passed to the worker. These are specific to the kernel provider.
   * Private - concrete kernels receive options via initialize() input parameter.
   */
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- Ensuring options is always available, useful for testing.
  private options: Options = {} as Options;

  /**
   * The function to call when a log is emitted.
   */
  private onLog: OnWorkerLog;

  /**
   * The base path for relative file operations.
   * Set via setBasePath() before performing operations that need relative path resolution.
   */
  private basePath = '';

  /**
   * The full relative path of the active file being processed.
   * Used for error locations to ensure FileLink can navigate correctly.
   * Set via setBasePath() from the original file.filename.
   */
  private activeFilePath = '';

  /**
   * The file manager instance.
   * Initialized via initialize() during worker setup.
   * Backed by a MessagePort bridge to the file-manager worker.
   * Private - use the filesystem property for all filesystem operations.
   */
  private fileSystem: FileSystemProxy | undefined;

  /**
   * Internal filesystem instance.
   * Initialized via initialize() when fileSystemPort is provided.
   */
  private _filesystem: KernelFileSystem | undefined;

  /**
   * Internal logger instance.
   * Initialized via initialize() after onLog is set.
   */
  private _logger: RuntimeLogger | undefined;

  /**
   * Cache for asset content hashes to avoid repeated fetches.
   * Maps asset URL to its SHA-256 content hash.
   */
  private readonly assetHashCache = new Map<string, string>();

  private readonly fileHashCache = new Map<string, string>();
  private readonly fileContentCache = new Map<string, Uint8Array<ArrayBuffer> | string>();

  /**
   * Dynamically loaded middleware instances with their resolved configs.
   * Populated during initialize() from the worker-owned runtime definition.
   */
  private resolvedMiddleware: ResolvedMiddleware[] = [];

  /**
   * Cache of already-imported middleware modules keyed by plugin id.
   * Prevents duplicate resolution across setup paths and test helpers.
   */
  private readonly middlewareModuleCache = new Map<string, KernelMiddleware>();

  /**
   * Cached middleware loggers, keyed by middleware name.
   * Loggers are stateless closures -- safe to reuse across operations.
   */
  private readonly middlewareLoggerCache = new Map<string, RuntimeLogger>();

  /** Cached KernelRuntime instance -- invalidated on setBasePath */
  private cachedRuntime: KernelRuntime | undefined;

  /** Cached project root path -- invalidated on setBasePath */
  private cachedProjectRoot: string | undefined;

  /** Cached log origin object -- recreated only when activeFilePath changes */
  private cachedLogOrigin: { component: string; file: string } | undefined;
  private cachedLogOriginFile = '';

  /** Telemetry collector instance -- created on first use when setTelemetrySend is called */
  private telemetryCollector?: WorkerTelemetryCollector;

  /** Span tracer for hierarchical telemetry with explicit parent-child IDs */
  private readonly tracer = new RuntimeTracer();

  /** Progress callback set during render, used by entry methods to emit phase transitions */
  private onProgress?: (phase: RenderPhase) => void;

  /** Bundle result cache keyed by entry path. Selectively invalidated when dependencies change; fully cleared on reset/overflow events. */
  private readonly bundleResultCache = new Map<string, BundleResult>();

  /** Unresolved import paths from the most recent getDependencies call, merged into the watch set. */
  private unresolvedDependencyPaths = new Set<string>();

  /** Middleware-registered watch paths with custom debounce tiers (path → debounce in ms). */
  private readonly middlewareWatchPaths = new Map<string, number>();

  /** Currently watched dependency paths. Used for incremental watch-set diffing. */
  private watchedPaths = new Set<string>();

  /** Unsubscribe function for the current watch subscription. */
  private watchUnsubscribe?: () => void;

  /** SharedArrayBuffer signal channel for bidirectional abort/state signaling. */
  private signalView: Int32Array | undefined;

  private _geometryPoolBuffer: SharedArrayBuffer | undefined;
  private _filePoolBuffer: SharedArrayBuffer | undefined;
  private _geometryPool: SharedPool | undefined;
  private _filePool: SharedPool | undefined;

  /** Shared memory pool for zero-IPC geometry data exchange. */
  public get geometryPool(): SharedPool | undefined {
    return this._geometryPool;
  }

  /** Shared memory pool for zero-IPC file content caching. */
  public get filePool(): SharedPool | undefined {
    return this._filePool;
  }

  /** Loaded transcoder instances keyed by plugin id. */
  private readonly loadedTranscoders = new Map<string, LoadedTranscoder>();

  /** Capabilities manifest computed during initialization. */
  private _capabilitiesManifest: CapabilitiesManifest = {
    routes: [],
    renderSchemas: {},
  };

  /**
   * The capabilities manifest discovered during worker initialization.
   * Contains kernel export formats, transcoder edges, and precomputed export routes.
   */
  public get capabilitiesManifest(): CapabilitiesManifest {
    return this._capabilitiesManifest;
  }

  /** Current render generation for abort detection. */
  private renderGeneration = 0;

  /** Current file for autonomous render loop. */
  private currentFile: GeometryFile | undefined;

  /** Current parameters for autonomous render loop. */
  private currentParameters: Record<string, unknown> = {};

  /** Exact artifact identity for the currently published preview render. */
  private currentPublishedRender: MaterializedRender | undefined;

  /** Current render options for autonomous render loop. */
  private currentRenderOptions: Record<string, unknown> | undefined;

  /** Debounce timer for parameter change re-renders. */
  private paramDebounceTimer: ReturnType<typeof setTimeout> | undefined;

  /** Last state pushed via `pushState`, used to deduplicate repeated emissions. */
  private lastPushedState?: WorkerState;

  /**
   * Whether a render is currently in progress. Exposed for export-during-render decisions.
   *
   * @returns True if a render is in progress, false otherwise.
   */
  public get isRendering(): boolean {
    return this._renderInProgress;
  }
  private _renderInProgress = false;

  /** Cached KernelBundler facade exposed via KernelRuntime */
  private cachedBundlerFacade: KernelBundler | undefined;

  /** Pending module registrations queued before the bundler is loaded */
  private readonly pendingModuleRegistrations = new Map<string, BuiltinModule>();

  /** In-flight bundler initializations to coalesce concurrent callers for the same extension */
  private readonly bundlerInitInProgress = new Map<string, Promise<{ definition: BundlerDefinition; ctx: unknown }>>();

  public constructor(options: KernelWorkerOptions = {}) {
    this.middlewarePlugins = options.middleware ?? [];
    this.bundlerPlugins = options.bundlers ?? [];
    this.transcoderPlugins = options.transcoders ?? [];
    this.onLog = () => {
      throw new Error('onLog must be initialized before use');
    };
  }

  /**
   * Unified filesystem interface for kernel workers.
   * Provides three path resolution contexts:
   * - Relative to basePath (current file's directory)
   * - Relative to project root (for dependency resolution)
   * - Absolute paths (for cache/middleware operations)
   *
   * @returns the kernel filesystem interface
   * @throws Error if accessed before initialize() completes with fileSystemPort
   */
  private get filesystem(): KernelFileSystem {
    if (!this._filesystem) {
      throw new Error('filesystem not available - initialize must complete first with fileSystemPort');
    }

    return this._filesystem;
  }

  /**
   * Entry point for initializing the worker. This is called once when the worker is created.
   * Handles common initialization logic and then calls the protected initialize method.
   *
   * @param input - Initialization input containing callbacks and transport-owned transferables
   * @param input.callbacks - Object containing callback functions (proxied)
   * @param input.callbacks.onLog - The function to call when a log is emitted
   * @param input.transferables - Object containing transferable resources like MessagePorts
   * @param input.transferables.fileSystemPort - Optional MessagePort for direct communication with file-manager worker
   */
  public async initialize(input: {
    callbacks: { onLog: OnWorkerLog };
    transferables: { fileSystemPort?: MessagePort; inlineFileSystem?: RuntimeFileSystemBase };
    options?: Options;
    config?: unknown;
  }): Promise<void> {
    this.onLog = input.callbacks.onLog;
    const defaultOptions: Record<string, unknown> = {};
    this.options = (input.options ?? defaultOptions) as Options;

    // Create logger (depends on onLog being set)
    this._logger = this.createLogger();

    if (this._geometryPoolBuffer) {
      this._geometryPool = new SharedPool(this._geometryPoolBuffer);
    }
    if (this._filePoolBuffer) {
      this._filePool = new SharedPool(this._filePoolBuffer);
    }

    /* Filesystem wiring — three precedence rules (TR16):
     * 1. `inlineFileSystem` takes precedence: same V8 cluster fast-path,
     *    no MessagePort serialization or bridge proxy.
     * 2. `fileSystemPort` falls back to the generic bridge proxy (worker /
     *    cross-process topologies).
     * 3. Neither: filesystem stays undefined; kernel runs without FS. */
    if (input.transferables.inlineFileSystem) {
      this.fileSystem = adaptInlineFileSystem(input.transferables.inlineFileSystem);
      this._filesystem = this.createFileSystem();
    } else if (input.transferables.fileSystemPort) {
      this.fileSystem = createWorkerFileSystemProxy(input.transferables.fileSystemPort, {
        filePool: this._filePool,
      });
      this._filesystem = this.createFileSystem();
    }

    const bootstrapSpan = this.tracer.startSpan('kernel.bootstrap');
    try {
      await this.loadBundlers(this.bundlerPlugins);
      await this.loadMiddleware(this.middlewarePlugins);
      await this.loadTranscoders(this.transcoderPlugins);

      const initSpan = this.tracer.startSpan('kernel.init', {
        kernel: this.constructor.name,
      });
      try {
        await this.onInitialize({ options: this.options }, this.createRuntime());
      } finally {
        initSpan.end();
      }

      this._capabilitiesManifest = this.buildCapabilitiesManifest();
    } finally {
      bootstrapSpan.end();
    }
  }

  /**
   * Set the telemetry send callback. Called by the dispatcher to wire up
   * telemetry before initialization. Creates the PerformanceObserver-based collector.
   *
   * @param send - callback that transmits collected performance entries to the main thread
   */
  public setTelemetrySend(send: (entries: TelemetryEntry[]) => void): void {
    this.telemetryCollector?.dispose();
    this.telemetryCollector = new WorkerTelemetryCollector(send);
  }

  /** Flush any buffered telemetry entries to the main thread. */
  public flushTelemetry(): void {
    this.telemetryCollector?.flush();
  }

  /**
   * Set the SharedArrayBuffer signal channel for bidirectional abort/state signaling.
   * Called by the dispatcher during initialization if the main thread provides a signal buffer.
   *
   * @param buffer - SharedArrayBuffer for the signal channel.
   */
  public setSignalBuffer(buffer: SharedArrayBuffer): void {
    this.signalView = new Int32Array(buffer);
  }

  /**
   * Wire-format cooperative abort entry-point used by SAB-less transports
   * (e.g. {@link createWebSocketTransport}). The dispatcher invokes this
   * for every `{ type: 'abort', reason }` message; we bump the local
   * `renderGeneration` exactly as we would from an `Atomics`-driven SAB
   * notification — and write the reason into the SAB when available so
   * downstream `isAborted()` checks classify the abort correctly.
   *
   * @param reason - Abort reason carried inline by the wire command.
   */
  public handleWireAbort(reason: number): void {
    if (this.signalView) {
      Atomics.store(this.signalView, signalSlot.abortReason, reason);
      this.renderGeneration = Atomics.add(this.signalView, signalSlot.abortGeneration, 1) + 1;
      Atomics.notify(this.signalView, signalSlot.abortGeneration);
    } else {
      this.renderGeneration++;
    }
  }

  /**
   * Set the SharedArrayBuffer for the geometry pool.
   * Called by the dispatcher during initialization.
   *
   * @param buffer - SharedArrayBuffer for the geometry pool.
   */
  public setGeometryPoolBuffer(buffer: SharedArrayBuffer): void {
    this._geometryPoolBuffer = buffer;
  }

  /**
   * Set the SharedArrayBuffer for the file pool.
   * Called by the dispatcher during initialization.
   *
   * @param buffer - SharedArrayBuffer for the file pool.
   */
  public setFilePoolBuffer(buffer: SharedArrayBuffer): void {
    this._filePoolBuffer = buffer;
  }

  /**
   * Handle a setFile command from the main thread.
   * Stores the file, parameters, render options, aborts any in-progress render,
   * and starts an immediate render (no debounce for initial file set).
   *
   * @param file - The geometry file to render.
   * @param parameters - Parameter overrides.
   * @param options - Optional kernel-specific render options.
   */
  /**
   * Stage byte payloads onto the worker-side {@link RuntimeFileSystem} and
   * then dispatch the supplied entry through the same autonomous render
   * flow as {@link KernelWorker.handleOpenFile}. Used by
   * `RuntimeClient.openFile({ code })` to ship inline source code through
   * the runtime without forcing consumers to wire up an inline-kind
   * filesystem handle (TR7).
   *
   * @param request - Stage map plus the entry to open after staging completes.
   */
  public async handleStageAndOpenFile(request: {
    stage: Record<string, Uint8Array<ArrayBuffer>>;
    file: GeometryFile;
    parameters?: Record<string, unknown>;
    options?: Record<string, unknown>;
  }): Promise<void> {
    if (Object.keys(request.stage).length > 0) {
      await this.writeFilesAndInvalidate(request.stage);
    }

    this.handleOpenFile(request.file, request.parameters, request.options);
  }

  /**
   *
   */
  public handleOpenFile(
    file: GeometryFile,
    parameters?: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): void {
    this.currentFile = file;
    this.currentParameters = parameters ?? {};
    this.currentRenderOptions = options;

    if (this.signalView) {
      this.renderGeneration = Atomics.add(this.signalView, signalSlot.abortGeneration, 1) + 1;
    } else {
      this.renderGeneration++;
    }

    clearTimeout(this.paramDebounceTimer);
    this.paramDebounceTimer = undefined;

    // Watch the entry file immediately so edits during a long-running
    // (or failing) first render are never missed.
    this.setBasePath(file);
    this.updateWatchSet([this.activeFileAbsolutePath]);

    void this.executeRender();
  }

  /**
   * Handle a setParameters command from the main thread.
   * Stores the parameters, aborts any in-progress render, and schedules a
   * render after the {@link parameterDebounce} window (configured in
   * `runtime-framework.constants`).
   *
   * @param parameters - Parameter overrides.
   */
  public handleUpdateParameters(parameters: Record<string, unknown>): void {
    this.currentParameters = parameters;

    if (this.signalView) {
      this.renderGeneration = Atomics.add(this.signalView, signalSlot.abortGeneration, 1) + 1;
    } else {
      this.renderGeneration++;
    }

    this.scheduleRender(parameterDebounce);
  }

  /**
   * Handle a setOptions command from the main thread.
   * Replaces the current per-render kernel options, aborts any in-progress
   * render, and schedules an immediate re-render against the active file
   * with the existing parameters.
   *
   * @param options - Replacement kernel-specific render options.
   */
  public handleSetOptions(options: Record<string, unknown>): void {
    this.currentRenderOptions = options;

    if (this.signalView) {
      this.renderGeneration = Atomics.add(this.signalView, signalSlot.abortGeneration, 1) + 1;
    } else {
      this.renderGeneration++;
    }

    clearTimeout(this.paramDebounceTimer);
    this.paramDebounceTimer = undefined;

    if (this.currentFile) {
      void this.executeRender();
    }
  }

  /** Clean up worker state, native handles, telemetry collector, and filesystem proxy. */
  public async cleanup(): Promise<void> {
    clearTimeout(this.paramDebounceTimer);
    this.paramDebounceTimer = undefined;
    this.watchUnsubscribe?.();
    this.watchUnsubscribe = undefined;
    this.assetHashCache.clear();
    this.middlewareWatchPaths.clear();
    this.nativeHandle = undefined;
    this.pendingNativeHandle = undefined;
    this.nativeHandleSlot = undefined;
    this.serializedNativeHandleSlot = undefined;
    this.lastSerializedNativeHandle = undefined;
    this.currentPublishedRender = undefined;
    this.currentFile = undefined;
    this.telemetryCollector?.dispose();
    this.telemetryCollector = undefined;
    this.fileSystem?.dispose();
    this.fileSystem = undefined;

    for (const transcoder of this.loadedTranscoders.values()) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- Sequential to preserve cleanup order
        await transcoder.definition.cleanup(transcoder.context);
      } catch {
        // Best-effort cleanup
      }
    }
    this.loadedTranscoders.clear();

    await this.onCleanup();
  }

  /**
   * Entry point for extracting parameters from a file.
   * Handles base path setup, timing, and middleware application using onion model.
   *
   * @param file - The geometry file to extract parameters from.
   * @returns The extracted parameters.
   */
  public async getParameters(
    file: GeometryFile,
    dependencyContext?: DependencyResolutionContext,
    owner?: OperationOwner,
  ): Promise<GetParametersResult> {
    this.setBasePath(file);
    const operationOwner = owner ?? (await this.createOperationOwner(file, 'request'));
    const start = performance.now();

    const input: GetParametersInput = {
      filePath: this.activeFileAbsolutePath,
      basePath: this.getProjectRootPath(),
    };

    const resolvedArray = this.getMiddleware();

    this.onProgress?.('resolvingDeps');
    const depsSpan = this.tracer.startSpan('kernel.resolve-deps', {
      phase: 'resolvingDeps',
    });
    const dependencies = await this.computeDependencies({
      resolvedMiddleware: resolvedArray,
      dependencyContext,
      owner: operationOwner,
    });
    const dependencyHash = this.computeDependencyHash(dependencies);
    depsSpan.end();

    const runtimes = new Map<string, KernelMiddlewareRuntime>();
    for (const { middleware, options: middlewareOptions, enabled } of resolvedArray) {
      if (enabled && middleware.wrapGetParameters) {
        runtimes.set(
          middleware.name,
          createMiddlewareRuntime({
            onLog: this.onLog,
            middlewareName: middleware.name,
            filesystem: this.filesystem,
            dependencies,
            dependencyHash,
            projectRootPath: this.getProjectRootPath(),
            basePath: this.getProjectRootPath(),
            stateSchema: middleware.stateSchema,
            options: middlewareOptions,
            logger: this.getMiddlewareLogger(middleware.name),
            registerWatchPath: this.handleRegisterWatchPath,
          }),
        );
      }
    }

    this.onProgress?.('extractingParams');
    const { tracer } = this;
    let chain: GetParametersHandler = named('kernelHandler', async (handlerInput: GetParametersInput) => {
      const parametersSpan = tracer.startSpan('kernel.extract-params', {
        phase: 'extractingParams',
      });
      const result = await this.onGetParametersForOwner(operationOwner, handlerInput, this.createRuntime());
      parametersSpan.end();
      return result;
    });

    for (let index = resolvedArray.length - 1; index >= 0; index--) {
      const { middleware, enabled } = resolvedArray[index]!;
      if (enabled && middleware.wrapGetParameters) {
        const inner = chain;
        const runtime = runtimes.get(middleware.name)!;
        const middlewareName = middleware.name;
        const wrapHook = middleware.wrapGetParameters;

        chain = named(`middleware(${middlewareName})`, async (handlerInput: GetParametersInput) => {
          const span = tracer.startSpan(`middleware.wrap(${middlewareName})`, {
            middleware: middlewareName,
          });
          try {
            const result = await wrapHook(handlerInput, inner, runtime);
            span.end();
            return result;
          } catch (error) {
            span.end();
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error('Middleware failed', {
              data: { name: middlewareName, error: errorMessage },
            });
            return createKernelError([
              {
                message: `Middleware error in ${middlewareName}: ${errorMessage}`,
                code: 'MIDDLEWARE_FAILED',
                type: 'kernel',
                severity: 'error',
              },
            ]);
          }
        });
      }
    }

    const result = await chain(input);

    this.logger.debug('getParameters completed', {
      data: { ms: performance.now() - start },
    });

    return result;
  }

  /**
   * Entry point for computing geometry from a file.
   * Handles base path setup, timing, and middleware application using onion model.
   *
   * Middleware wraps around each other (onion model), so:
   * - Code before handler() runs on the "request journey" (outside-in)
   * - Code after handler() runs on the "response journey" (inside-out)
   * - Short-circuited results still flow through upstream middleware post-processing
   *
   * @param entry - The geometry entry containing file, parameters, and optional render options
   * @param entry.file - The geometry file to compute geometry from
   * @param entry.parameters - The parameters to use when computing geometry
   * @param entry.options - Optional kernel-specific render options
   * @returns The computed geometry.
   */
  public async createGeometry(
    entry: {
      file: GeometryFile;
      parameters: Record<string, unknown>;
      options?: Record<string, unknown>;
    },
    dependencyContext?: DependencyResolutionContext,
    owner?: OperationOwner,
  ): Promise<HashedGeometryResult> {
    const { artifact } = await this.materializeRender(entry, {
      dependencyContext,
      owner,
      publish: true,
    });
    return artifact.result;
  }

  /**
   * Entry point for exporting geometry.
   * Handles timing and middleware application using onion model.
   *
   * Middleware wraps around each other (onion model), so:
   * - Code before handler() runs on the "request journey" (outside-in)
   * - Code after handler() runs on the "response journey" (inside-out)
   * - Short-circuited results still flow through upstream middleware post-processing
   *
   * @param format - The export format identifier (e.g. 'stl', 'step', 'glb').
   * @param options - Format-specific export options. Validated against Zod schema when available.
   * @returns The exported geometry.
   */
  public async exportGeometry(format: FileExtension, options?: Record<string, unknown>): Promise<ExportGeometryResult> {
    const exportSpan = this.tracer.startSpan('kernel.export', {
      format,
    });

    const currentRender = this.currentPublishedRender;
    if (!currentRender) {
      exportSpan.end();
      return this.createExportRenderIdentityMissingResult();
    }

    const plan = this.createExportRequestPlan(currentRender.owner, format, options);
    if (!plan.success) {
      exportSpan.end();
      return plan.result;
    }

    const resolvedArray = this.getMiddleware();
    const activeMiddleware = resolvedArray.filter(
      ({ middleware, enabled }) => enabled && middleware.wrapExportGeometry,
    );

    const result =
      activeMiddleware.length === 0
        ? await this.executeExportRequest(plan, currentRender)
        : await this.runExportMiddlewarePipeline({
            plan,
            renderIdentity: currentRender.identity,
            renderArtifact: currentRender,
            activeMiddleware,
          });

    exportSpan.end();

    return finalizeExportArtifactSet(result);
  }

  /**
   * Export an exact render request without publishing it to the autonomous preview loop.
   *
   * @param request - Request-scoped render/export input from the runtime protocol.
   * @returns Exported files or structured runtime issues.
   */
  public async exportModel(request: RuntimeExportModelArgs): Promise<ExportGeometryResult> {
    const exportSpan = this.tracer.startSpan('kernel.export-model', {
      format: request.format,
      file: request.file.filename,
    });

    try {
      const dependencyContext: DependencyResolutionContext = {};
      if (request.stage) {
        await this.writeFilesAndInvalidate(request.stage);
      }

      this.setBasePath(request.file);
      const owner = await this.createOperationOwner(request.file, 'request');

      const parametersResult = await this.getParameters(request.file, dependencyContext, owner);
      let mergedParameters = request.parameters;
      if (parametersResult.success) {
        const extracted = parametersResult.data as {
          defaultParameters?: Record<string, unknown>;
        };
        if (extracted.defaultParameters) {
          mergedParameters = deepmerge(extracted.defaultParameters, request.parameters);
        }
      }

      const renderOptionsResult = this.validateRenderOptions(request.options, owner);
      if (!renderOptionsResult.success) {
        return createKernelError(renderOptionsResult.issues);
      }

      const resolvedArray = this.getMiddleware();
      const dependencies = await this.computeDependencies({
        parameters: mergedParameters,
        renderOptions: renderOptionsResult.options,
        resolvedMiddleware: resolvedArray,
        dependencyContext,
        owner,
      });
      const renderIdentity = this.createRenderIdentity({
        file: request.file,
        parameters: mergedParameters,
        renderOptions: renderOptionsResult.options,
        dependencies,
        dependencyHash: this.computeDependencyHash(dependencies),
        owner,
      });

      const plan = this.createExportRequestPlan(owner, request.format, request.exportOptions);
      if (!plan.success) {
        return plan.result;
      }

      const activeMiddleware = resolvedArray.filter(
        ({ middleware, enabled }) => enabled && middleware.wrapExportGeometry,
      );
      const renderExactRequest = async (handlerInput: ExportGeometryRequest): Promise<ExportGeometryResult> => {
        let renderArtifact = this.getPublishedRenderForIdentity(renderIdentity);
        if (!renderArtifact) {
          const materialized = await this.materializeRender(
            {
              file: request.file,
              parameters: mergedParameters,
              options: renderOptionsResult.options,
            },
            {
              dependencyContext,
              owner,
              publish: false,
            },
          );
          renderArtifact = materialized.artifact;
          if (!renderArtifact.result.success) {
            return { success: false, issues: renderArtifact.result.issues };
          }
        }
        return this.executeExportRequest({ ...plan, input: handlerInput }, renderArtifact);
      };

      if (activeMiddleware.length === 0) {
        return finalizeExportArtifactSet(await renderExactRequest(plan.input));
      }

      return finalizeExportArtifactSet(
        await this.runExportMiddlewarePipeline({
          plan,
          renderIdentity,
          renderArtifact: this.getPublishedRenderForIdentity(renderIdentity),
          activeMiddleware,
          onCacheMiss: renderExactRequest,
        }),
      );
    } finally {
      this._updateWatchSetFromCaches();
      exportSpan.end();
    }
  }

  /**
   * Get the resolved middleware array for this worker.
   * Override in subclasses to customize middleware (e.g., for testing).
   *
   * @returns Array of resolved middleware with their configs
   */
  public getMiddleware(): ResolvedMiddleware[] {
    return this.resolvedMiddleware;
  }

  /**
   * Unified render entry point that combines parameter extraction and geometry computation
   * in a single call. Per-render callbacks were retired in favour of autonomous notifies:
   * `parametersResolved` and `progress` events fan out via the top-level
   * {@link KernelWorker.onParametersResolved} / {@link KernelWorker.onProgressUpdate}
   * fields wired by the dispatcher, threading the originating render generation (`rgen`)
   * for frame-level correlation. This method remains as a synchronous helper for
   * non-autonomous code paths (CLI, benchmarks) that drive a single render-and-await flow.
   *
   * @param input - Render input containing file, parameters, and options.
   * @returns The computed geometry.
   */
  public async render(input: {
    file: GeometryFile;
    parameters: Record<string, unknown>;
    options?: Record<string, unknown>;
  }): Promise<HashedGeometryResult> {
    this.tracer.reset();
    const renderSpan = this.tracer.startSpan('kernel.render', {
      file: input.file.filename,
    });
    const generation = ++this.renderGeneration;
    this.onProgress = (phase: RenderPhase) => {
      this.onProgressUpdate?.(phase, generation);
    };
    const dependencyContext: DependencyResolutionContext = {};
    this.setBasePath(input.file);
    const owner = await this.createOperationOwner(input.file, 'render-artifact');

    try {
      const parametersResult = await this.getParameters(input.file, dependencyContext, owner);
      this.onParametersResolved?.(parametersResult, generation);

      let mergedParameters = input.parameters;
      if (parametersResult.success) {
        const extracted = parametersResult.data as {
          defaultParameters?: Record<string, unknown>;
        };
        if (extracted.defaultParameters) {
          mergedParameters = deepmerge(extracted.defaultParameters, input.parameters);
        }
      }

      const result = await this.createGeometry(
        {
          file: input.file,
          parameters: mergedParameters,
          options: input.options,
        },
        dependencyContext,
        owner,
      );

      return result;
    } finally {
      this._updateWatchSetFromCaches();
      this.onProgress = undefined;
      renderSpan.end();
    }
  }

  /**
   * Selectively invalidate file caches for changed paths.
   * Called by the kernel machine before render operations when files have changed.
   *
   * @param changedPaths - Absolute paths of files that changed
   */
  public async notifyFileChanged(changedPaths: readonly string[]): Promise<void> {
    this._invalidateCachesForPaths(changedPaths);
    this.onFileChanged(changedPaths);
  }

  /**
   * Get the current set of watched file paths.
   * Primarily for test assertions — production code should not depend on this.
   * @returns A copy of the internal watched-path set.
   */
  public getWatchedPaths(): Set<string> {
    return new Set(this.watchedPaths);
  }

  /**
   * Get the current middleware-registered watch paths and their debounce tiers.
   * Primarily for test assertions.
   * @returns A copy of the internal middleware watch paths map.
   */
  public getMiddlewareWatchPaths(): Map<string, number> {
    return new Map(this.middlewareWatchPaths);
  }

  /**
   * Update filesystem watch subscriptions based on the current dependency set.
   * Diffs against the previous watch set to avoid full resubscribe churn.
   *
   * @param dependencies - absolute paths of current dependencies
   */
  public updateWatchSet(dependencies: string[]): void {
    if (!this.fileSystem?.watch) {
      return;
    }

    const newPaths = new Set(dependencies.filter((p) => !p.includes('.tau/cache/')));

    if (setsEqual(this.watchedPaths, newPaths)) {
      return;
    }

    this.watchUnsubscribe?.();

    if (newPaths.size === 0) {
      this.watchedPaths = newPaths;
      this.watchUnsubscribe = undefined;
      return;
    }

    this.watchUnsubscribe = this.fileSystem.watch(
      {
        paths: [...newPaths],
        recursive: false,
        excludes: ['.tau/cache/**'],
      },
      (event: WatchEvent) => {
        const changedPaths: string[] = [];
        if ('path' in event) {
          changedPaths.push(event.path);
        }
        if (event.type === 'rename' && 'oldPath' in event) {
          changedPaths.push(event.oldPath);
          if ('newPath' in event) {
            changedPaths.push(event.newPath);
          }
        }
        if (event.type === 'reset' || event.type === 'overflow') {
          this.fileHashCache.clear();
          this.fileContentCache.clear();
          this.bundleResultCache.clear();
          clearExecuteCache();
          this.onFileChanged([]);
          if (this.currentFile) {
            this.scheduleRender(fileChangeDebounce);
          }
          return;
        }
        if (changedPaths.length > 0) {
          this._invalidateCachesForPaths(changedPaths);
          this.onFileChanged(changedPaths);
          if (this.currentFile) {
            let watchDebounce = fileChangeDebounce;
            for (const p of changedPaths) {
              watchDebounce = Math.min(watchDebounce, this.middlewareWatchPaths.get(p) ?? fileChangeDebounce);
            }
            this.scheduleRender(watchDebounce);
          }
        }
      },
    );

    this.watchedPaths = newPaths;
  }

  /**
   * Load the bundler definition from its worker-owned plugin implementation.
   * Context initialization is deferred until first use via ensureBundlerContext(),
   * because the project path is not known until setBasePath() runs.
   *
   * @param bundlerEntry - Bundler registration with extensions and options
   * @param preloadedDefinition - Optional pre-loaded definition (bypasses dynamic import; used in tests)
   */
  public async ensureLoadedBundler(
    bundlerEntry: BundlerPlugin,
    preloadedDefinition?: BundlerDefinition,
  ): Promise<void> {
    const initSpan = this.tracer.startSpan('kernel.bundler-init');

    try {
      const definition = preloadedDefinition ?? (await resolveRuntimePluginDefinition('bundler', bundlerEntry));

      const { extensions } = bundlerEntry;
      for (const extension of extensions) {
        if (!this.loadedBundlers.has(extension) && !this.pendingBundlerInits.has(extension)) {
          this.pendingBundlerInits.set(extension, {
            definition,
            extensions,
            options: bundlerEntry.options,
          });
        }
      }
    } finally {
      initSpan.end();
    }
  }

  protected async materializeRender(
    entry: {
      file: GeometryFile;
      parameters: Record<string, unknown>;
      options?: Record<string, unknown>;
    },
    options: {
      dependencyContext?: DependencyResolutionContext;
      owner?: OperationOwner;
      publish: boolean;
    },
  ): Promise<{ artifact: MaterializedRender }> {
    this.setBasePath(entry.file);
    const owner =
      options.owner ?? (await this.createOperationOwner(entry.file, options.publish ? 'render-artifact' : 'request'));
    const start = performance.now();

    const renderOptionsResult = this.validateRenderOptions(entry.options, owner);
    if (!renderOptionsResult.success) {
      return {
        artifact: {
          identity: this.createRenderIdentity({
            file: entry.file,
            parameters: entry.parameters,
            renderOptions: entry.options ?? {},
            dependencies: [],
            dependencyHash: '',
            owner,
          }),
          owner,
          result: createKernelError(renderOptionsResult.issues),
        },
      };
    }

    const input: CreateGeometryInput = {
      filePath: this.activeFileAbsolutePath,
      basePath: this.getProjectRootPath(),
      parameters: entry.parameters,
      options: renderOptionsResult.options,
    };

    const resolvedArray = this.getMiddleware();

    const geoDepsSpan = this.tracer.startSpan('kernel.resolve-deps', {
      phase: 'resolvingDeps',
    });
    const dependencies = await this.computeDependencies({
      parameters: entry.parameters,
      renderOptions: renderOptionsResult.options,
      resolvedMiddleware: resolvedArray,
      dependencyContext: options.dependencyContext,
      owner,
    });
    const dependencyHash = this.computeDependencyHash(dependencies);
    const identity = this.createRenderIdentity({
      file: entry.file,
      parameters: entry.parameters,
      renderOptions: renderOptionsResult.options,
      dependencies,
      dependencyHash,
      owner,
    });
    geoDepsSpan.end();

    const runtimes = new Map<string, KernelMiddlewareRuntime>();
    for (const { middleware, options: middlewareOptions, enabled } of resolvedArray) {
      if (enabled && middleware.wrapCreateGeometry) {
        runtimes.set(
          middleware.name,
          createMiddlewareRuntime({
            onLog: this.onLog,
            middlewareName: middleware.name,
            filesystem: this.filesystem,
            dependencies,
            dependencyHash,
            projectRootPath: this.getProjectRootPath(),
            basePath: this.getProjectRootPath(),
            stateSchema: middleware.stateSchema,
            options: middlewareOptions,
            logger: this.getMiddlewareLogger(middleware.name),
            registerWatchPath: this.handleRegisterWatchPath,
          }),
        );
      }
    }

    this.onProgress?.('computingGeometry');
    const { tracer } = this;
    let chain: CreateGeometryHandler = named('kernelHandler', async (handlerInput: CreateGeometryInput) => {
      const computeSpan = tracer.startSpan('kernel.compute');
      const result = await this.onCreateGeometryForOwner(owner, handlerInput, this.createRuntime());
      computeSpan.end();
      return result;
    });

    for (let index = resolvedArray.length - 1; index >= 0; index--) {
      const { middleware, enabled } = resolvedArray[index]!;
      if (enabled && middleware.wrapCreateGeometry) {
        const inner = chain;
        const runtime = runtimes.get(middleware.name)!;
        const middlewareName = middleware.name;
        const wrapHook = middleware.wrapCreateGeometry;

        chain = named(`middleware(${middlewareName})`, async (handlerInput: CreateGeometryInput) => {
          const span = tracer.startSpan(`middleware.wrap(${middlewareName})`, {
            middleware: middlewareName,
          });
          try {
            const result = await wrapHook(handlerInput, inner, runtime);
            span.end();
            return result;
          } catch (error) {
            span.end();
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error('Middleware failed', {
              data: { name: middlewareName, error: errorMessage },
            });
            return createKernelError([
              {
                message: `Middleware error in ${middlewareName}: ${errorMessage}`,
                code: 'MIDDLEWARE_FAILED',
                type: 'kernel',
                severity: 'error',
              },
            ]);
          }
        });
      }
    }

    this.pendingNativeHandle = undefined;
    const internalResult = await chain(input);

    this.onProgress?.('postProcessing');
    // One render request produces one public geometry artifact.
    const result: HashedGeometryResult = internalResult.success
      ? {
          ...internalResult,
          data: {
            ...internalResult.data,
            hash: dependencyHash,
          },
        }
      : internalResult;

    const serializedNativeHandle = internalResult.success ? internalResult.serializedNativeHandle : undefined;
    const artifact = this.createMaterializedRender({
      owner,
      identity,
      result,
      serializedNativeHandle,
    });
    if (options.publish && result.success) {
      this.publishCurrentRender(artifact);
    }

    this.logger.debug('createGeometry completed', {
      data: {
        ms: performance.now() - start,
        publish: options.publish,
        dependencyHash,
      },
    });

    return { artifact };
  }

  protected captureNativeHandle(nativeHandle: unknown): void {
    this.nativeHandle = nativeHandle;
    this.pendingNativeHandle = nativeHandle;
  }

  protected createRenderIdentity(input: {
    file: GeometryFile;
    parameters: Record<string, unknown>;
    renderOptions: Record<string, unknown>;
    dependencies: Dependency[];
    dependencyHash: string;
    owner: OperationOwner;
  }): RenderIdentity {
    return {
      file: input.file,
      projectRootPath: input.owner.projectRootPath,
      selectedKernelId: input.owner.binding?.kernelId,
      selectedKernelVersion: input.owner.binding?.kernelVersion,
      parameters: input.parameters,
      renderOptions: input.renderOptions,
      dependencies: input.dependencies,
      dependencyHash: input.dependencyHash,
    };
  }

  protected createMaterializedRender(options: {
    owner: OperationOwner;
    identity: RenderIdentity;
    result: HashedGeometryResult;
    serializedNativeHandle: unknown;
  }): MaterializedRender {
    const { owner, identity, result, serializedNativeHandle } = options;
    const { liveNativeHandleSlot, serializedNativeHandleSlot } = this.bindNativeHandleSlots(
      identity,
      result.success,
      serializedNativeHandle,
    );

    return {
      identity,
      owner,
      result,
      liveNativeHandleSlot,
      serializedNativeHandleSlot,
    };
  }

  protected bindNativeHandleSlots(
    identity: RenderIdentity,
    success: boolean,
    serializedNativeHandle: unknown,
  ): {
    liveNativeHandleSlot?: NativeHandleSlot;
    serializedNativeHandleSlot?: SerializedNativeHandleSlot;
  } {
    const identityKey = createRenderIdentityKey(identity);
    const { pendingNativeHandle } = this;
    this.pendingNativeHandle = undefined;

    const liveNativeHandleSlot =
      success && pendingNativeHandle !== undefined && pendingNativeHandle !== null
        ? {
            identityKey,
            kernelId: identity.selectedKernelId,
            kernelVersion: identity.selectedKernelVersion,
            handle: pendingNativeHandle,
          }
        : undefined;

    if (liveNativeHandleSlot) {
      this.nativeHandleSlot = liveNativeHandleSlot;
      this.nativeHandle = pendingNativeHandle;
    }

    const serializedNativeHandleSlot =
      success && serializedNativeHandle !== undefined && serializedNativeHandle !== null
        ? {
            identityKey,
            kernelId: identity.selectedKernelId,
            kernelVersion: identity.selectedKernelVersion,
            serializedNativeHandle,
          }
        : undefined;

    if (serializedNativeHandleSlot) {
      this.serializedNativeHandleSlot = serializedNativeHandleSlot;
      this.lastSerializedNativeHandle = serializedNativeHandle;
    }

    return { liveNativeHandleSlot, serializedNativeHandleSlot };
  }

  protected publishCurrentRender(artifact: MaterializedRender): void {
    this.currentPublishedRender = artifact;
    this.publishOperationOwner(artifact.owner);
  }

  protected getPublishedRenderForIdentity(identity: RenderIdentity): MaterializedRender | undefined {
    const current = this.currentPublishedRender;
    if (!current) {
      return undefined;
    }
    return createRenderIdentityKey(current.identity) === createRenderIdentityKey(identity) ? current : undefined;
  }

  protected getNativeHandleSlotForIdentity(
    identity: RenderIdentity,
    artifact?: MaterializedRender,
  ): NativeHandleSlot | undefined {
    const identityKey = createRenderIdentityKey(identity);
    if (this.nativeHandleSlot?.identityKey === identityKey && this.nativeHandle === this.nativeHandleSlot.handle) {
      return this.nativeHandleSlot;
    }

    const artifactSlot = artifact?.liveNativeHandleSlot;
    if (artifactSlot?.identityKey === identityKey) {
      return artifactSlot;
    }
    return this.nativeHandleSlot?.identityKey === identityKey ? this.nativeHandleSlot : undefined;
  }

  protected getSerializedNativeHandleSlotForIdentity(
    identity: RenderIdentity,
    artifact?: MaterializedRender,
  ): SerializedNativeHandleSlot | undefined {
    const identityKey = createRenderIdentityKey(identity);
    const artifactSlot = artifact?.serializedNativeHandleSlot;
    if (artifactSlot?.identityKey === identityKey) {
      return artifactSlot;
    }
    return this.serializedNativeHandleSlot?.identityKey === identityKey ? this.serializedNativeHandleSlot : undefined;
  }

  protected useLiveNativeHandleSlot(identity: RenderIdentity, artifact?: MaterializedRender): boolean {
    const slot = this.getNativeHandleSlotForIdentity(identity, artifact);
    if (!slot || this.nativeHandle !== slot.handle) {
      return false;
    }
    this.nativeHandle = slot.handle;
    return true;
  }

  protected clearLiveNativeHandleSlot(slot?: NativeHandleSlot): void {
    if (slot && this.nativeHandleSlot?.identityKey !== slot.identityKey) {
      return;
    }
    this.nativeHandleSlot = undefined;
    this.nativeHandle = undefined;
  }

  protected clearSerializedNativeHandleSlot(slot?: SerializedNativeHandleSlot): void {
    if (slot && this.serializedNativeHandleSlot?.identityKey !== slot.identityKey) {
      return;
    }
    this.serializedNativeHandleSlot = undefined;
    this.lastSerializedNativeHandle = undefined;
  }

  protected configureRuntimePlugins(options: KernelWorkerOptions): void {
    this.middlewarePlugins = options.middleware ?? [];
    this.bundlerPlugins = options.bundlers ?? [];
    this.transcoderPlugins = options.transcoders ?? [];
  }

  /**
   * Logger interface for kernel workers.
   * Provides convenience methods that automatically inject the component name.
   *
   * @returns the kernel logger interface
   * @throws Error if accessed before initialize() completes
   */
  protected get logger(): RuntimeLogger {
    if (!this._logger) {
      throw new Error('logger not available - initialize must complete first');
    }

    return this._logger;
  }

  /**
   * Whether a bundler is available for the given file extension.
   * Used by subclasses to decide whether bundler-assisted detection is available.
   *
   * @param extension - file extension without dot (e.g. 'ts', 'js')
   * @returns `true` when a bundler is loaded or pending for the extension
   */
  protected hasBundlerForExtension(extension: string): boolean {
    return this.loadedBundlers.has(extension) || this.pendingBundlerInits.has(extension);
  }

  /**
   * Ensure nativeHandle is available before export.
   *
   * The geometry cache middleware may serve createGeometry results from disk,
   * bypassing the kernel entirely. In that case, the nativeHandle (set as a
   * side-effect of onCreateGeometry) is never populated.
   *
   * Resolution order:
   * 1. No-op if nativeHandle is already set
   * 2. Re-run createGeometry as a fallback to materialize the handle
   *
   * Subclasses may restore a declared durable native-handle snapshot before
   * falling back to this reheat path.
   */
  protected async ensureNativeHandle(
    runtime: KernelRuntime,
    renderIdentity?: LastSettledRenderIdentity,
    renderArtifact?: MaterializedRender,
  ): Promise<void> {
    const identity = renderIdentity ?? this.currentPublishedRender?.identity;
    if (!identity) {
      return;
    }

    if (this.useLiveNativeHandleSlot(identity, renderArtifact)) {
      return;
    }

    const { file } = identity;
    this.setBasePath(file);
    const reheatParameters = identity.parameters;
    this.logger.debug('Export reheat: re-running createGeometry to populate nativeHandle', {
      data: {
        filePath: this.activeFileAbsolutePath,
        basePath: this.getProjectRootPath(),
        parameterCount: Object.keys(reheatParameters).length,
      },
    });
    const reheatSpan = this.tracer.startSpan('kernel.export-reheat');
    try {
      this.pendingNativeHandle = undefined;
      const reheatResult = await this.onCreateGeometry(
        {
          filePath: this.activeFileAbsolutePath,
          basePath: this.getProjectRootPath(),
          parameters: reheatParameters,
          options: identity.renderOptions,
        },
        runtime,
      );
      this.bindNativeHandleSlots(
        identity,
        reheatResult.success,
        reheatResult.success ? reheatResult.serializedNativeHandle : undefined,
      );
      this.logger.debug('Export reheat completed', {
        data: {
          success: reheatResult.success,
          nativeHandleType: typeof this.nativeHandle,
          nativeHandleSet: this.nativeHandle !== undefined,
          issues: reheatResult.issues.map((i) => i.message),
        },
      });
    } catch (error) {
      this.logger.error('Export reheat threw', {
        data: { error: error instanceof Error ? error.message : String(error) },
      });
    }
    reheatSpan.end();
  }

  /**
   * Whether any bundler has been registered (loaded or pending).
   *
   * @returns true if at least one bundler is loaded or pending initialization
   */
  protected get hasBundlerAvailable(): boolean {
    return this.loadedBundlers.size > 0 || this.pendingBundlerInits.size > 0;
  }

  /**
   * Ensure the bundler for a specific file extension is fully initialized.
   * Call this before any operation that needs the bundler (bundle, execute, detectImports).
   * Must be called after setBasePath() so that getProjectRootPath() returns the correct value.
   *
   * Use this when the file extension is known and the correct bundler must be selected.
   * Use ensureBundlerContext() for extension-agnostic contexts where any bundler will do.
   *
   * @param extension - File extension without dot
   * @returns The loaded bundler for the extension
   */
  protected async ensureBundlerForExtension(
    extension: string,
  ): Promise<{ definition: BundlerDefinition; ctx: unknown }> {
    const existing = this.loadedBundlers.get(extension);
    if (existing) {
      return existing;
    }

    const inFlight = this.bundlerInitInProgress.get(extension);
    if (inFlight) {
      return inFlight;
    }

    const pending = this.pendingBundlerInits.get(extension);
    if (!pending) {
      throw new Error(`No bundler registered for .${extension} files`);
    }

    const promise = this.doInitializeBundler(pending);

    for (const extension of pending.extensions) {
      this.bundlerInitInProgress.set(extension, promise);
    }

    try {
      return await promise;
    } finally {
      for (const extension of pending.extensions) {
        this.bundlerInitInProgress.delete(extension);
      }
    }
  }

  /**
   * Ensure any bundler context is initialized (for extension-agnostic contexts where any bundler will do).
   * Initializes the first pending bundler found.
   *
   * Use this when the file extension is unknown (e.g., the execute() function in createRuntime()).
   * Use ensureBundlerForExtension() when the file extension is known and the correct bundler must be selected.
   */
  protected async ensureBundlerContext(): Promise<void> {
    if (this.loadedBundlers.size > 0) {
      return;
    }

    const firstEntry = this.pendingBundlerInits.entries().next();
    if (firstEntry.done) {
      throw new Error('No bundler loaded - call ensureLoadedBundler() first');
    }

    await this.ensureBundlerForExtension(firstEntry.value[0]);
  }

  /**
   * Hook called after file change notification.
   * Subclasses can override to perform additional invalidation (e.g., selection cache).
   *
   * @param _changedPaths - absolute paths of files that changed
   */
  protected onFileChanged(_changedPaths: readonly string[]): void {
    // Default: no-op. KernelRuntimeWorker overrides to clear selectionCache.
  }

  /**
   * Override to add kernel-specific initialization. Common framework
   * initialization runs separately.
   *
   * @param _input - Input containing worker options
   * @param _runtime - Runtime services (filesystem, logger)
   */
  protected async onInitialize(_input: InitializeInput<Options>, _runtime: KernelRuntime): Promise<void> {
    // Base implementation - can be overridden by subclasses
  }

  /**
   * Override to add kernel-specific cleanup (release memory, close connections,
   * etc.). Common framework cleanup runs separately.
   */
  protected async onCleanup(): Promise<void> {
    // Base implementation - can be overridden by subclasses
  }

  /**
   * Get bundled asset URLs (fonts, WASM, etc.) for cache key computation.
   * Override in kernels that use bundled assets.
   *
   * URLs from Vite ?url imports contain content hashes in production.
   * In development, the asset content is fetched and hashed directly.
   *
   * @returns Array of asset URLs to include in dependency hash
   */
  protected getAssetUrls(): string[] {
    return [];
  }

  /**
   * Get the project root path by stripping the subdirectory from basePath.
   * For basePath '/projects/test/site' with activeFilePath 'site/main.scad',
   * returns '/projects/test'.
   *
   * @returns absolute path to the project root, derived by stripping the active file's subdirectory from basePath
   */
  protected getProjectRootPath(): string {
    if (this.cachedProjectRoot !== undefined) {
      return this.cachedProjectRoot;
    }

    const lastSlash = this.activeFilePath.lastIndexOf('/');
    const subDirectory = lastSlash === -1 ? '' : this.activeFilePath.slice(0, lastSlash);

    this.cachedProjectRoot =
      subDirectory && this.basePath.endsWith(`/${subDirectory}`)
        ? this.basePath.slice(0, -(subDirectory.length + 1))
        : this.basePath;

    return this.cachedProjectRoot;
  }

  /**
   * Rebuild the capabilities manifest from current kernel/transcoder state and push
   * the update to the main thread via the `onCapabilitiesUpdated` callback.
   *
   * Called after each `loadKernelModule` to incrementally update the manifest as
   * new kernels become available.
   */
  protected rebuildAndPushCapabilities(): void {
    this._capabilitiesManifest = this.buildCapabilitiesManifest();
    this.onCapabilitiesUpdated?.(this._capabilitiesManifest);
  }

  protected async resolveKernelBinding(
    input: { filePath: string; basePath: string },
    _runtime: KernelRuntime,
  ): Promise<KernelBinding | undefined> {
    const kernelId = this.getActiveKernelId();
    const kernelVersion = this.getActiveKernelVersion();
    return kernelId && kernelVersion
      ? {
          kernelId,
          kernelVersion,
          filePath: input.filePath,
        }
      : undefined;
  }

  protected publishOperationOwner(_owner: OperationOwner): void {
    // Base workers do not maintain a separate active-kernel read model.
  }

  protected async onGetParametersForOwner(
    _owner: OperationOwner,
    input: GetParametersInput,
    runtime: KernelRuntime,
  ): Promise<GetParametersResult> {
    return this.onGetParameters(input, runtime);
  }

  protected async onGetDependenciesForOwner(
    _owner: OperationOwner,
    input: GetDependenciesInput,
    runtime: KernelRuntime,
  ): Promise<GetDependenciesResult> {
    return this.onGetDependencies(input, runtime);
  }

  protected async onCreateGeometryForOwner(
    _owner: OperationOwner,
    input: CreateGeometryInput,
    runtime: KernelRuntime,
  ): Promise<CreateGeometryResult> {
    return this.onCreateGeometry(input, runtime);
  }

  protected async onExportGeometryForOwner(
    _owner: OperationOwner,
    input: ExportGeometryInput,
    runtime: KernelRuntime,
  ): Promise<ExportGeometryResult> {
    return this.onExportGeometry(input, runtime);
  }

  protected async isNativeHandleValidForOwner(
    _owner: OperationOwner,
    _nativeHandle: unknown,
    _runtime: KernelRuntime,
  ): Promise<boolean | undefined> {
    return undefined;
  }

  protected async deserializeNativeHandleForOwner(
    _owner: OperationOwner,
    _serializedNativeHandle: unknown,
    _runtime: KernelRuntime,
  ): Promise<unknown | undefined> {
    return undefined;
  }

  /**
   * Extract parameters from a file.
   *
   * @param input - Input containing file path and project root
   * @param runtime - Runtime services (filesystem, logger)
   * @returns The extracted parameters.
   */
  protected abstract onGetParameters(input: GetParametersInput, runtime: KernelRuntime): Promise<GetParametersResult>;

  /**
   * Compute geometry from a file.
   *
   * @param input - Input containing file path, project root, parameters, and geometry ID
   * @param runtime - Runtime services (filesystem, logger)
   * @returns The computed geometry.
   */
  protected abstract onCreateGeometry(
    input: CreateGeometryInput,
    runtime: KernelRuntime,
  ): Promise<CreateGeometryResult>;

  /**
   * Export geometry using the framework-stored native handle from the last createGeometry call.
   *
   * @param input - Input containing file type and mesh config
   * @param runtime - Runtime services (filesystem, logger)
   * @param nativeHandle - Opaque native geometry data stored by the framework after createGeometry
   * @returns The exported geometry.
   */
  protected abstract onExportGeometry(
    input: ExportGeometryInput,
    runtime: KernelRuntime,
  ): Promise<ExportGeometryResult>;

  /**
   * Discover all file dependencies for the given entry file.
   * Used for cache key computation to include all imported/included files.
   *
   * @param input - Input containing file path and project root
   * @param runtime - Runtime services (filesystem, logger)
   * @returns Array of absolute file paths that are dependencies (including the entry file)
   */
  protected abstract onGetDependencies(
    input: GetDependenciesInput,
    runtime: KernelRuntime,
  ): Promise<GetDependenciesResult>;

  /**
   * Get the ID of the currently active kernel. Used by the route planner to filter
   * precomputed export routes to only those reachable by the active kernel.
   *
   * @returns The active kernel ID, or undefined if no kernel is selected
   */
  protected abstract getActiveKernelId(): string | undefined;

  /**
   * Get the version of the currently active kernel. Used in dependency hashes so
   * durable geometry/export cache entries are invalidated when kernel behavior changes.
   *
   * @returns The active kernel version, or undefined if no kernel is selected
   */
  protected abstract getActiveKernelVersion(): string | undefined;

  private async createOperationOwner(file: GeometryFile, kind: OperationOwner['kind']): Promise<OperationOwner> {
    this.setBasePath(file);
    const filePath = this.activeFileAbsolutePath;
    const projectRootPath = this.getProjectRootPath();
    const binding = await this.resolveKernelBinding({ filePath, basePath: projectRootPath }, this.createRuntime());
    return {
      kind,
      file,
      projectRootPath,
      binding,
    };
  }

  private async writeFilesAndInvalidate(stage: Record<string, Uint8Array<ArrayBuffer>>): Promise<void> {
    const changedPaths: string[] = [];
    const createdDirectories = new Set<string>();
    for (const [path, bytes] of Object.entries(stage)) {
      const absolutePath = path.startsWith('/') ? path : `/${path}`;
      const directory = parentDirectory(absolutePath);
      if (directory && directory !== '/' && !createdDirectories.has(directory)) {
        // oxlint-disable-next-line no-await-in-loop -- staging must preserve filesystem order for deterministic tests
        await this.filesystem.mkdir(directory, { recursive: true });
        createdDirectories.add(directory);
      }
      // oxlint-disable-next-line no-await-in-loop -- staging must complete before dependency resolution
      await this.filesystem.writeFile(absolutePath, bytes);
      changedPaths.push(absolutePath);
    }
    this._invalidateCachesForPaths(changedPaths);
    if (changedPaths.length > 0) {
      this.onFileChanged(changedPaths);
    }
  }

  private createExportRequestPlan(
    owner: OperationOwner,
    format: FileExtension,
    options?: Record<string, unknown>,
  ): OwnerBoundExportPlan {
    const rawOptions = options ?? {};
    const ownerKernelId = owner.binding?.kernelId;
    const zodSchemas = ownerKernelId ? this.kernelExportZodSchemasMap.get(ownerKernelId) : undefined;
    const formatZodSchema = zodSchemas?.[format];

    if (formatZodSchema) {
      const parseResult = formatZodSchema.safeParse(rawOptions);
      if (!parseResult.success) {
        return {
          success: false,
          result: {
            success: false,
            issues: parseResult.error.issues.map((issue) => ({
              message: `Export option validation failed: ${issue.path.join('.')} — ${issue.message}`,
              code: 'RUNTIME',
              type: 'runtime',
              severity: 'error',
            })),
          },
        };
      }
      const validatedOptions = parseResult.data as Record<string, unknown>;
      return {
        success: true,
        owner,
        input: { format, options: validatedOptions },
        route: {
          kind: 'direct',
          kernelId: ownerKernelId,
          targetFormat: format,
          options: validatedOptions,
        },
        dependency: {
          type: 'export',
          format,
          options: validatedOptions,
          route: {
            kind: 'direct',
            kernelId: ownerKernelId,
            targetFormat: format,
          },
        },
      };
    }

    const transcoderRoute = this._capabilitiesManifest.routes.find(
      (route) => route.targetFormat === format && route.transcoderId && route.kernelId === ownerKernelId,
    );
    if (!transcoderRoute) {
      const declared = zodSchemas ? Object.keys(zodSchemas).join(', ') : '';
      if (Object.keys(rawOptions).length > 0 && zodSchemas) {
        return {
          success: false,
          result: {
            success: false,
            issues: [
              {
                message: `No export schema for format "${format}" on kernel "${ownerKernelId}". Declared native formats: ${declared || 'none'}.`,
                code: 'KERNEL_CAPABILITY_MISSING',
                type: 'runtime',
                severity: 'error',
              },
            ],
          },
        };
      }

      return {
        success: false,
        result: {
          success: false,
          issues: [
            {
              message: ownerKernelId
                ? `No export route found for format "${format}" from kernel "${ownerKernelId}". Native formats: ${declared || 'none'}. Register a transcoder that supports this conversion.`
                : `No export route found for format "${format}" because the render artifact has no selected kernel owner.`,
              code: 'KERNEL_CAPABILITY_MISSING',
              type: 'runtime',
              severity: 'error',
            },
          ],
        },
      };
    }

    let sourceOptions = rawOptions;
    let edgeOptions = rawOptions;
    const sourceZodSchema = zodSchemas?.[transcoderRoute.sourceFormat];
    if (sourceZodSchema) {
      const parseResult = sourceZodSchema.safeParse(rawOptions);
      if (parseResult.success) {
        sourceOptions = parseResult.data as Record<string, unknown>;
      }
    }

    const transcoder = this.loadedTranscoders.get(transcoderRoute.transcoderId!);
    const matchingEdge = transcoder?.edges.find(
      (edge) => edge.from === transcoderRoute.sourceFormat && edge.to === format,
    );
    if (matchingEdge?.optionsSchema) {
      const edgeParseResult = matchingEdge.optionsSchema.safeParse(rawOptions);
      if (!edgeParseResult.success) {
        return {
          success: false,
          result: createKernelError(
            edgeParseResult.error.issues.map((issue) => ({
              message: `Transcoder edge option validation failed (${transcoderRoute.sourceFormat} → ${format}): ${issue.path.join('.')} — ${issue.message}`,
              code: 'RUNTIME',
              severity: 'error',
            })),
          ),
        };
      }
      edgeOptions = edgeParseResult.data as Record<string, unknown>;
    }

    return {
      success: true,
      owner,
      input: { format, options: rawOptions },
      route: {
        kind: 'transcoded',
        kernelId: transcoderRoute.kernelId,
        sourceFormat: transcoderRoute.sourceFormat,
        targetFormat: transcoderRoute.targetFormat,
        transcoderId: transcoderRoute.transcoderId!,
        sourceOptions,
        edgeOptions,
      },
      dependency: {
        type: 'export',
        format,
        options: rawOptions,
        route: {
          kind: 'transcoded',
          kernelId: transcoderRoute.kernelId,
          sourceFormat: transcoderRoute.sourceFormat,
          targetFormat: transcoderRoute.targetFormat,
          transcoderId: transcoderRoute.transcoderId,
          sourceOptions,
          edgeOptions,
        },
      },
    };
  }

  private async materializeNativeHandleForOwner(options: {
    owner: OperationOwner;
    renderIdentity: LastSettledRenderIdentity | undefined;
    runtime: KernelRuntime;
    renderArtifact?: MaterializedRender;
  }): Promise<{ success: true; handle: unknown } | { success: false; result: ExportGeometryResult }> {
    const { owner, renderIdentity, runtime, renderArtifact } = options;
    const identity = renderIdentity ?? renderArtifact?.identity;
    if (!identity) {
      return { success: false, result: this.createExportRenderIdentityMissingResult() };
    }

    const liveSlot = this.getNativeHandleSlotForIdentity(identity, renderArtifact);
    if (this.isLiveNativeHandleSlotUsableForOwner(liveSlot, owner)) {
      const validity = await this.validateNativeHandleSlot(owner, liveSlot, runtime);
      if (validity) {
        return { success: true, handle: liveSlot.handle };
      }
    }

    const serializedSlot = this.getSerializedNativeHandleSlotForIdentity(identity, renderArtifact);
    if (serializedSlot && this.serializedNativeHandleSlotMatchesOwner(serializedSlot, owner)) {
      const restored = await this.restoreSerializedNativeHandleSlot({
        owner,
        identity,
        slot: serializedSlot,
        runtime,
      });
      if (restored.success) {
        return { success: true, handle: restored.handle };
      }
    }

    await this.reheatNativeHandleForOwner(owner, identity, runtime);
    const reheatedSlot = this.getNativeHandleSlotForIdentity(identity, renderArtifact);
    if (this.isLiveNativeHandleSlotUsableForOwner(reheatedSlot, owner)) {
      return { success: true, handle: reheatedSlot.handle };
    }

    return {
      success: false,
      result: createKernelError([
        {
          message: 'Export could not materialize the kernel-native geometry handle for the requested render identity.',
          code: 'RUNTIME_EXPORT_NATIVE_HANDLE_MISSING',
          type: 'runtime',
          severity: 'error',
        },
      ]),
    };
  }

  private nativeHandleSlotMatchesOwner(slot: NativeHandleSlot, owner: OperationOwner): boolean {
    return slot.kernelId === owner.binding?.kernelId && slot.kernelVersion === owner.binding?.kernelVersion;
  }

  private serializedNativeHandleSlotMatchesOwner(slot: SerializedNativeHandleSlot, owner: OperationOwner): boolean {
    return slot.kernelId === owner.binding?.kernelId && slot.kernelVersion === owner.binding?.kernelVersion;
  }

  private isLiveNativeHandleSlotUsableForOwner(
    slot: NativeHandleSlot | undefined,
    owner: OperationOwner,
  ): slot is NativeHandleSlot {
    if (!slot) {
      return false;
    }
    return this.nativeHandle === slot.handle && this.nativeHandleSlotMatchesOwner(slot, owner);
  }

  private async validateNativeHandleSlot(
    owner: OperationOwner,
    slot: NativeHandleSlot,
    runtime: KernelRuntime,
  ): Promise<boolean> {
    try {
      const isValid = await this.isNativeHandleValidForOwner(owner, slot.handle, runtime);
      if (isValid === false) {
        this.clearLiveNativeHandleSlot(slot);
        this.logger.debug('Native handle is stale; export will reheat');
        return false;
      }
      return true;
    } catch (error) {
      this.clearLiveNativeHandleSlot(slot);
      this.logger.warn('Native-handle validity check failed; export will reheat', {
        data: { error: error instanceof Error ? error.message : String(error) },
      });
      return false;
    }
  }

  private async restoreSerializedNativeHandleSlot(options: {
    owner: OperationOwner;
    identity: RenderIdentity;
    slot: SerializedNativeHandleSlot;
    runtime: KernelRuntime;
  }): Promise<{ success: true; handle: unknown } | { success: false }> {
    const { owner, identity, slot, runtime } = options;
    try {
      const handle = await this.deserializeNativeHandleForOwner(owner, slot.serializedNativeHandle, runtime);
      if (handle === undefined || handle === null) {
        return { success: false };
      }
      this.logger.debug('Restoring nativeHandle via owner-bound deserializeNativeHandle');
      this.captureNativeHandle(handle);
      this.bindNativeHandleSlots(identity, true, slot.serializedNativeHandle);
      return { success: true, handle };
    } catch (error) {
      this.clearSerializedNativeHandleSlot(slot);
      this.logger.warn('Native-handle snapshot restore failed; export will reheat', {
        data: { error: error instanceof Error ? error.message : String(error) },
      });
      return { success: false };
    }
  }

  private async reheatNativeHandleForOwner(
    owner: OperationOwner,
    identity: RenderIdentity,
    runtime: KernelRuntime,
  ): Promise<void> {
    const { file } = identity;
    this.setBasePath(file);
    const reheatParameters = identity.parameters;
    this.logger.debug('Export reheat: re-running createGeometry to populate nativeHandle', {
      data: {
        filePath: this.activeFileAbsolutePath,
        basePath: this.getProjectRootPath(),
        parameterCount: Object.keys(reheatParameters).length,
      },
    });
    const reheatSpan = this.tracer.startSpan('kernel.export-reheat');
    try {
      this.pendingNativeHandle = undefined;
      const reheatResult = await this.onCreateGeometryForOwner(
        owner,
        {
          filePath: this.activeFileAbsolutePath,
          basePath: this.getProjectRootPath(),
          parameters: reheatParameters,
          options: identity.renderOptions,
        },
        runtime,
      );
      this.bindNativeHandleSlots(
        identity,
        reheatResult.success,
        reheatResult.success ? reheatResult.serializedNativeHandle : undefined,
      );
      this.logger.debug('Export reheat completed', {
        data: {
          success: reheatResult.success,
          nativeHandleType: typeof this.nativeHandle,
          nativeHandleSet: this.nativeHandle !== undefined,
          issues: reheatResult.issues.map((i) => i.message),
        },
      });
    } catch (error) {
      this.logger.error('Export reheat threw', {
        data: { error: error instanceof Error ? error.message : String(error) },
      });
    }
    reheatSpan.end();
  }

  private async runExportMiddlewarePipeline(options: {
    plan: Extract<OwnerBoundExportPlan, { success: true }>;
    renderIdentity: LastSettledRenderIdentity | undefined;
    renderArtifact?: MaterializedRender;
    activeMiddleware: ResolvedMiddleware[];
    onCacheMiss?: (input: ExportGeometryRequest) => Promise<ExportGeometryResult>;
  }): Promise<ExportGeometryResult> {
    if (!options.renderIdentity) {
      return this.createExportRenderIdentityMissingResult();
    }

    const depsSpan = this.tracer.startSpan('kernel.resolve-deps', {
      phase: 'resolvingDeps',
    });
    const dependencies: Dependency[] = [...options.renderIdentity.dependencies, options.plan.dependency];
    const dependencyHash = this.computeDependencyHash(dependencies);
    depsSpan.end();

    const runtimes = new Map<string, KernelMiddlewareRuntime>();
    for (const { middleware, options: middlewareOptions } of options.activeMiddleware) {
      runtimes.set(
        middleware.name,
        createMiddlewareRuntime({
          onLog: this.onLog,
          middlewareName: middleware.name,
          filesystem: this.filesystem,
          dependencies,
          dependencyHash,
          projectRootPath: options.renderIdentity.projectRootPath,
          basePath: options.renderIdentity.projectRootPath,
          stateSchema: middleware.stateSchema,
          options: middlewareOptions,
          logger: this.getMiddlewareLogger(middleware.name),
          registerWatchPath: this.handleRegisterWatchPath,
        }),
      );
    }

    const { onCacheMiss, renderArtifact } = options;
    const computeExport =
      onCacheMiss ??
      (async (handlerInput: ExportGeometryRequest): Promise<ExportGeometryResult> => {
        if (!renderArtifact) {
          return this.createExportRenderIdentityMissingResult();
        }
        return this.executeExportRequest({ ...options.plan, input: handlerInput }, renderArtifact);
      });

    const { tracer } = this;
    let chain: ExportGeometryHandler = named('kernelHandler', async (handlerInput: ExportGeometryRequest) => {
      const computeSpan = tracer.startSpan('kernel.export-compute');
      const exportResult = await computeExport(handlerInput);
      computeSpan.end();
      return exportResult;
    });

    for (let index = options.activeMiddleware.length - 1; index >= 0; index--) {
      const { middleware } = options.activeMiddleware[index]!;
      const inner = chain;
      const runtime = runtimes.get(middleware.name)!;
      const middlewareName = middleware.name;
      const wrapHook = middleware.wrapExportGeometry!;

      chain = named(`middleware(${middlewareName})`, async (handlerInput: ExportGeometryRequest) => {
        const span = tracer.startSpan(`middleware.wrap(${middlewareName})`, {
          middleware: middlewareName,
        });
        try {
          const chainResult = await wrapHook(handlerInput, inner, runtime);
          span.end();
          return chainResult;
        } catch (error) {
          span.end();
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error('Middleware failed', {
            data: { name: middlewareName, error: errorMessage },
          });
          return createKernelError([
            {
              message: `Middleware error in ${middlewareName}: ${errorMessage}`,
              code: 'MIDDLEWARE_FAILED',
              type: 'kernel',
              severity: 'error',
            },
          ]);
        }
      });
    }

    return chain(options.plan.input);
  }

  private async executeExportRequest(
    plan: Extract<OwnerBoundExportPlan, { success: true }>,
    renderArtifact: MaterializedRender,
  ): Promise<ExportGeometryResult> {
    const runtime = this.createRuntime();
    const nativeInput = await this.prepareNativeExportInput({
      plan,
      renderIdentity: renderArtifact.identity,
      runtime,
      renderArtifact,
    });
    if (!nativeInput.success) {
      return nativeInput.result;
    }

    const computeSpan = this.tracer.startSpan('kernel.export-compute');
    const result = await this.executeExportWithRoute(plan, nativeInput.input, runtime);
    computeSpan.end();
    return result;
  }

  private async prepareNativeExportInput(options: {
    plan: Extract<OwnerBoundExportPlan, { success: true }>;
    renderIdentity: LastSettledRenderIdentity | undefined;
    runtime: KernelRuntime;
    renderArtifact?: MaterializedRender;
  }): Promise<{ success: true; input: KernelExportGeometryInput } | { success: false; result: ExportGeometryResult }> {
    const { plan, renderIdentity, runtime, renderArtifact } = options;
    const nativeHandle = await this.materializeNativeHandleForOwner({
      owner: plan.owner,
      renderIdentity,
      runtime,
      renderArtifact,
    });
    if (!nativeHandle.success) {
      return nativeHandle;
    }

    return {
      success: true,
      input: {
        ...plan.input,
        nativeHandle: nativeHandle.handle,
      },
    };
  }

  private createExportRenderIdentityMissingResult(): ExportGeometryResult {
    return createKernelError([
      {
        message:
          'Export cache lookup requires a settled render identity. Render the model first or use request-scoped export with file and parameters.',
        code: 'RUNTIME_EXPORT_RENDER_IDENTITY_MISSING',
        type: 'runtime',
        severity: 'error',
      },
    ]);
  }

  /**
   * Get the absolute path of the active file.
   * Combines project root with activeFilePath.
   *
   * @returns the fully resolved absolute file path
   */
  private get activeFileAbsolutePath(): string {
    return KernelWorker.resolveFromRoot(this.activeFilePath, this.getProjectRootPath());
  }

  /**
   * Emit a worker state transition to the main thread via the single
   * ordered `postMessage` channel. Deduplicates repeated emissions so
   * consumers observe one event per logical transition.
   *
   * @param state - The worker state to emit.
   */
  private pushState(state: WorkerState): void {
    if (state === this.lastPushedState) {
      return;
    }
    this.lastPushedState = state;
    this.onStateChanged?.(state);
  }

  /**
   * Placeholder for percentage-based progress emissions. Progress events
   * fan out via `postMessage` driven by {@link KernelWorker.onProgressUpdate};
   * this hook keeps the percentage-based path structurally co-located with
   * the state-transition path for future use.
   *
   * @param _percent - The percentage of progress to emit.
   */
  private pushProgress(_percent: number): void {
    // Intentionally empty — see JSDoc.
  }

  /**
   * Check if the current render has been aborted by a newer generation.
   *
   * @param generation - The render generation to check.
   * @returns True if aborted, false otherwise.
   */
  private isAborted(generation: number): boolean {
    if (this.signalView) {
      return Atomics.load(this.signalView, signalSlot.abortGeneration) !== generation;
    }
    return generation !== this.renderGeneration;
  }

  /**
   * Schedule a render after a debounce delay. Clears any existing timer.
   *
   * @param renderDelay - Debounce delay before render fires. Milliseconds.
   */
  private scheduleRender(renderDelay: number): void {
    clearTimeout(this.paramDebounceTimer);
    this.pushState('buffering');
    this.paramDebounceTimer = setTimeout(() => {
      this.paramDebounceTimer = undefined;
      void this.executeRender();
    }, renderDelay);
  }

  /**
   * Execute an autonomous render cycle. Handles the full pipeline:
   * increment generation, bundle, execute, compute geometry, push results.
   * Checks abort at each async boundary.
   */
  private async executeRender(): Promise<void> {
    if (!this.currentFile) {
      return;
    }

    let generation: number;
    if (this.signalView) {
      generation = Atomics.add(this.signalView, signalSlot.abortGeneration, 1) + 1;
      this.renderGeneration = generation;
      Atomics.store(this.signalView, signalSlot.abortReason, abortReasonEnum.none);
      setAbortContext(this.signalView, generation);
    } else {
      generation = ++this.renderGeneration;
    }

    this.pushState('rendering');
    this.pushProgress(0);
    this._renderInProgress = true;

    try {
      this.tracer.reset();
      const renderSpan = this.tracer.startSpan('kernel.render', {
        file: this.currentFile.filename,
      });
      this.onProgress = (phase: RenderPhase) => {
        this.onProgressUpdate?.(phase, generation);
      };
      const dependencyContext: DependencyResolutionContext = {};
      this.setBasePath(this.currentFile);
      const owner = await this.createOperationOwner(this.currentFile, 'render-artifact');

      if (this.isAborted(generation)) {
        return;
      }

      const renderWork = async (): Promise<HashedGeometryResult> => {
        const parametersResult = await this.getParameters(this.currentFile!, dependencyContext, owner);
        if (this.isAborted(generation)) {
          throw new RenderAbortedError();
        }
        this.onParametersResolved?.(parametersResult, generation);

        let mergedParameters = this.currentParameters;
        if (parametersResult.success) {
          const extracted = parametersResult.data as {
            defaultParameters?: Record<string, unknown>;
          };
          if (extracted.defaultParameters) {
            mergedParameters = deepmerge(extracted.defaultParameters, this.currentParameters);
          }
        }

        await cooperativeYield();
        if (this.isAborted(generation)) {
          throw new RenderAbortedError();
        }

        this.pushProgress(30);

        const geometryResult = await this.createGeometry(
          {
            file: this.currentFile!,
            parameters: mergedParameters,
            options: this.currentRenderOptions,
          },
          dependencyContext,
          owner,
        );

        if (this.isAborted(generation)) {
          throw new RenderAbortedError();
        }

        return geometryResult;
      };

      const result = await renderWork();
      this.pushProgress(100);
      this.onProgress = undefined;
      renderSpan.end();

      this.flushTelemetry();
      this.onGeometryComputed?.(result, generation);
      this.pushState(this.paramDebounceTimer ? 'buffering' : 'idle');
    } catch (error) {
      this.onProgress = undefined;
      if (isRenderAbortedError(error) || this.isAborted(generation)) {
        const reason = this.signalView ? Atomics.load(this.signalView, signalSlot.abortReason) : abortReasonEnum.none;

        if (reason === abortReasonEnum.timeout) {
          const timeoutMessage =
            'Render timed out. Increase the timeout in viewer settings or simplify the model geometry.';
          this.onError?.(
            [{ message: timeoutMessage, code: 'RENDER_TIMEOUT', type: 'runtime', severity: 'error' }],
            generation,
          );
          this.pushState('error');
        } else {
          this.pushState(this.paramDebounceTimer ? 'buffering' : 'idle');
        }
        return;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      this.onError?.([{ message: errorMessage, code: 'RUNTIME', type: 'runtime', severity: 'error' }], generation);
      this.pushState('error');
    } finally {
      clearAbortContext();
      if (generation === this.renderGeneration) {
        this._renderInProgress = false;
      }
      this._updateWatchSetFromCaches();
    }
  }

  /**
   * Invalidate file-level caches for the given changed paths.
   * Shared by both `notifyFileChanged` (command-driven) and the watch handler (autonomous).
   * @param changedPaths - Absolute paths of files that changed.
   */
  private _invalidateCachesForPaths(changedPaths: readonly string[]): void {
    for (const path of changedPaths) {
      this.fileHashCache.delete(path);
      this.fileContentCache.delete(path);
      this.fileContentCache.delete(`utf8:${path}`);
    }
    for (const [entryPath, result] of this.bundleResultCache) {
      if (
        changedPaths.includes(entryPath) ||
        result.dependencies.some((dep) => changedPaths.includes(dep)) ||
        result.unresolvedPaths.some((dep) => changedPaths.includes(dep))
      ) {
        clearExecuteCache(result.code);
        this.bundleResultCache.delete(entryPath);
      }
    }

    if (
      this.currentPublishedRender &&
      this.identityDependsOnPaths(this.currentPublishedRender.identity, changedPaths)
    ) {
      this.currentPublishedRender = undefined;
    }
  }

  private identityDependsOnPaths(identity: RenderIdentity, changedPaths: readonly string[]): boolean {
    const changed = new Set(changedPaths);
    return identity.dependencies.some((dependency) => dependency.type === 'file' && changed.has(dependency.path));
  }

  /**
   * Derive the full set of watched dependencies from all active caches
   * and update the filesystem watch subscription.
   */
  private _updateWatchSetFromCaches(): void {
    const allDeps = new Set<string>();
    if (this.activeFilePath) {
      allDeps.add(this.activeFileAbsolutePath);
    }
    for (const result of this.bundleResultCache.values()) {
      for (const dep of result.dependencies) {
        allDeps.add(dep);
      }
      for (const path of result.unresolvedPaths) {
        allDeps.add(path);
      }
    }
    for (const path of this.fileHashCache.keys()) {
      allDeps.add(path);
    }
    for (const path of this.unresolvedDependencyPaths) {
      allDeps.add(path);
    }
    for (const path of this.middlewareWatchPaths.keys()) {
      allDeps.add(path);
    }
    this.updateWatchSet([...allDeps]);
  }

  /**
   * Perform the actual bundler context initialization.
   * Separated from ensureBundlerForExtension so concurrent callers coalesce on the same promise.
   *
   * @param pending - bundler registration with definition, supported extensions, and options
   * @returns the loaded bundler definition and initialized context
   */
  private async doInitializeBundler(pending: {
    definition: BundlerDefinition;
    extensions: string[];
    options?: Record<string, unknown>;
  }): Promise<{ definition: BundlerDefinition; ctx: unknown }> {
    const { definition, extensions, options: bundlerOptions } = pending;
    const projectPath = this.getProjectRootPath();
    const initSpan = this.tracer.startSpan('kernel.bundler-context-init');

    try {
      const rawOptions = bundlerOptions ?? {};
      const validatedOptions = definition.optionsSchema ? definition.optionsSchema.parse(rawOptions) : rawOptions;

      const context = await definition.initialize({ filesystem: this.filesystem, projectPath }, validatedOptions);
      const loaded = { definition, ctx: context };

      for (const extension of extensions) {
        this.loadedBundlers.set(extension, loaded);
        this.pendingBundlerInits.delete(extension);
      }

      for (const [name, entry] of this.pendingModuleRegistrations) {
        definition.registerModule(name, entry, context);
      }

      if (this.pendingBundlerInits.size === 0) {
        this.pendingModuleRegistrations.clear();
      }

      return loaded;
    } finally {
      initSpan.end();
    }
  }

  /**
   * Load middleware definitions from worker-owned plugin implementations and resolve their configs.
   *
   * @param middlewarePlugins - Ordered array of middleware plugins
   */
  private async loadMiddleware(middlewarePlugins: readonly MiddlewarePlugin[]): Promise<void> {
    const middlewareSpan = this.tracer.startSpan('kernel.load-middleware', {
      count: middlewarePlugins.length,
    });

    try {
      const resolved: ResolvedMiddleware[] = [];

      for (const entry of middlewarePlugins) {
        // oxlint-disable-next-line no-await-in-loop -- Middleware must be loaded sequentially to preserve order
        const middleware = await this.importMiddlewareModule(entry);

        const resolvedOptions = middleware.optionsSchema
          ? (middleware.optionsSchema.parse(entry.options ?? {}) as Record<string, unknown>)
          : {};

        const enabled = middleware.enabled ?? true;

        resolved.push({
          middleware,
          options: resolvedOptions,
          id: entry.id,
          enabled,
        });
      }

      this.resolvedMiddleware = resolved;
    } finally {
      middlewareSpan.end();
    }
  }

  /**
   * Load and initialize transcoders from worker-owned plugin implementations.
   *
   * @param entries - Transcoder plugins with id and options
   */
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- variance: accepts any transcoder plugin generic
  private async loadTranscoders(entries: readonly TranscoderPluginEntry[]): Promise<void> {
    const transcoderSpan = this.tracer.startSpan('kernel.load-transcoders', {
      count: entries.length,
    });

    try {
      const transcoderRuntime: TranscoderRuntime = {
        logger: this.logger,
        tracer: this.tracer,
      };

      for (const entry of entries) {
        const importSpan = this.tracer.startSpan('kernel.load-transcoder', {
          id: entry.id,
        });

        try {
          // oxlint-disable-next-line no-await-in-loop -- Sequential to preserve init order
          const definition = await resolveRuntimePluginDefinition('transcoder', entry);

          const rawOptions = entry.options ?? {};
          const validatedOptions = definition.optionsSchema ? definition.optionsSchema.parse(rawOptions) : rawOptions;

          // oxlint-disable-next-line no-await-in-loop -- Sequential to preserve init order
          const context = await definition.initialize(validatedOptions, transcoderRuntime);

          const { edges } = definition;

          this.loadedTranscoders.set(entry.id, {
            id: entry.id,
            definition,
            context,
            edges,
          });

          this.logger.debug(`Loaded transcoder: ${entry.id} with ${edges.length} edge(s)`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed to load transcoder ${entry.id}: ${errorMessage}`);
        } finally {
          importSpan.end();
        }
      }
    } finally {
      transcoderSpan.end();
    }
  }

  /**
   * Derive JSON Schema and defaults from a Zod schema, returning empty objects on failure.
   */
  private deriveJsonSchema(
    zodSchema: z.ZodType,
    label: string,
  ): { schema: JSONSchema7; defaults: Record<string, unknown> } {
    try {
      const schema = toJSONSchema(zodSchema, { target: 'draft-7' }) as JSONSchema7 & { $schema?: unknown };
      delete schema.$schema;
      return {
        schema,
        defaults: (zodSchema.parse({}) ?? {}) as Record<string, unknown>,
      };
    } catch {
      this.logger.warn(`Failed to derive JSON Schema for ${label}`);
      const empty: JSONSchema7 = {};
      return { schema: empty, defaults: {} };
    }
  }

  /**
   * Build the capabilities manifest from loaded kernel metadata and transcoder edges.
   *
   * Routes are computed in a single pass per (kernel, declared-format) pair:
   * - one direct route per kernel export, with `sourceFormat === targetFormat`,
   * - one transcoded route per matching transcoder edge whose `from` equals the
   *   kernel-export format, with the merged option schema.
   *
   * Fidelity is looked up from `@taucad/types` rather than hard-coded so kernels
   * remain the source of truth for their declared formats and the fidelity table
   * stays a single, data-driven location.
   *
   * @returns The computed capabilities manifest
   */
  private buildCapabilitiesManifest(): CapabilitiesManifest {
    const routes: ExportRoute[] = [];
    type KernelExport = {
      kernelId: string;
      format: FileExtension;
      schema: JSONSchema7;
      defaults: Record<string, unknown>;
    };
    const kernelExports: KernelExport[] = [];

    for (const [kernelId, zodSchemas] of this.kernelExportZodSchemasMap) {
      const formats = Object.keys(zodSchemas) as FileExtension[];

      for (const format of formats) {
        const zodSchema = zodSchemas[format];
        const empty: { schema: JSONSchema7; defaults: Record<string, unknown> } = { schema: {}, defaults: {} };
        const { schema, defaults } = zodSchema ? this.deriveJsonSchema(zodSchema, `${kernelId}:${format}`) : empty;

        kernelExports.push({ kernelId, format, schema, defaults });

        routes.push({
          targetFormat: format,
          kernelId,
          sourceFormat: format,
          fidelity: lookupExportFidelity(format),
          schema,
          defaults,
        });
      }
    }

    const emptyEdgeSchemas: { schema: JSONSchema7; defaults: Record<string, unknown> } = { schema: {}, defaults: {} };
    for (const transcoder of this.loadedTranscoders.values()) {
      for (const edge of transcoder.edges) {
        const edgeSchemas = edge.optionsSchema
          ? this.deriveJsonSchema(edge.optionsSchema, `${transcoder.id} ${edge.from}->${edge.to}`)
          : emptyEdgeSchemas;

        for (const cap of kernelExports) {
          if (cap.format !== edge.from) {
            continue;
          }

          const { schema, defaults } = mergeJsonSchemas(cap, edgeSchemas);

          routes.push({
            targetFormat: edge.to,
            kernelId: cap.kernelId,
            sourceFormat: edge.from,
            transcoderId: transcoder.id,
            fidelity: edge.fidelity,
            schema,
            defaults,
          });
        }
      }
    }

    const renderSchemas: Record<string, { schema: JSONSchema7; defaults: Record<string, unknown> }> = {};
    for (const [kernelId, zodSchema] of this.kernelRenderZodSchemaMap) {
      renderSchemas[kernelId] = this.deriveJsonSchema(zodSchema, `render:${kernelId}`);
    }

    return { routes, renderSchemas };
  }

  /**
   * Execute an export operation using the route planner algorithm:
   * 1. If the active kernel natively supports the format, export directly.
   * 2. Otherwise, filter precomputed manifest routes by active kernelId + targetFormat
   *    and execute the first viable route via the matching transcoder.
   * 3. Return an actionable error if no route succeeds.
   *
   * @param plan - Owner-bound export plan selected for this render artifact.
   * @param input - The export geometry input
   * @param runtime - The kernel runtime services
   * @returns The export result
   */
  // oxlint-disable-next-line complexity -- Multi-step route planner with fallback
  private async executeExportWithRoute(
    plan: Extract<OwnerBoundExportPlan, { success: true }>,
    input: KernelExportGeometryInput,
    runtime: KernelRuntime,
  ): Promise<ExportGeometryResult> {
    if (plan.route.kind === 'direct') {
      return this.onExportGeometryForOwner(
        plan.owner,
        {
          ...input,
          format: plan.route.targetFormat,
          options: plan.route.options,
        },
        runtime,
      );
    }

    const transcoderRuntime: TranscoderRuntime = {
      logger: this.logger,
      tracer: this.tracer,
    };

    const { route } = plan;
    const transcoder = this.loadedTranscoders.get(route.transcoderId);
    if (!transcoder) {
      return createKernelError([
        {
          message: `No loaded transcoder "${route.transcoderId}" for route ${route.sourceFormat} → ${route.targetFormat}.`,
          code: 'KERNEL_CAPABILITY_MISSING',
          type: 'runtime',
          severity: 'error',
        },
      ]);
    }

    const sourceInput: KernelExportGeometryInput = {
      ...input,
      format: route.sourceFormat,
      options: route.sourceOptions,
    };
    const kernelResult = await this.onExportGeometryForOwner(plan.owner, sourceInput, runtime);
    if (!kernelResult.success) {
      return kernelResult;
    }

    return transcoder.definition.transcode(
      {
        from: route.sourceFormat,
        to: route.targetFormat,
        files: kernelResult.data,
        options: route.edgeOptions,
      },
      transcoderRuntime,
      transcoder.context,
    );
  }

  /**
   * Import a middleware module, using the cache to avoid redundant imports.
   *
   * @param entries - registered bundler entries
   * @returns The middleware instance
   */
  private async loadBundlers(entries: readonly BundlerPlugin[]): Promise<void> {
    for (const entry of entries) {
      // oxlint-disable-next-line no-await-in-loop -- Bundler registration order should remain deterministic
      await this.ensureLoadedBundler(entry);
    }
  }

  private async importMiddlewareModule(entry: MiddlewarePlugin): Promise<KernelMiddleware> {
    const cached = this.middlewareModuleCache.get(entry.id);
    if (cached) {
      return cached;
    }

    const middleware = await resolveRuntimePluginDefinition('middleware', entry);

    this.middlewareModuleCache.set(entry.id, middleware);
    return middleware;
  }

  /**
   * Create the unified filesystem interface.
   * Called during initialize() after fileSystem is set up.
   * Wraps the raw proxy with tracing, then enhances with helper methods
   * via `createRuntimeFileSystem`.
   *
   * @returns KernelFileSystem with 11 base primitives + enhanced helper methods
   */
  private createFileSystem(): KernelFileSystem {
    const fileSystem = this.fileSystem!;
    const { tracer } = this;

    function readFile(path: string, encoding: 'utf8'): Promise<string>;
    function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
    async function readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
      const span = tracer.startSpan('fs.read', { path });
      const data = encoding ? await fileSystem.readFile(path, encoding) : await fileSystem.readFile(path);
      span.end();
      return data;
    }

    return createRuntimeFileSystem({
      id: 'runtime:kernel-worker-bridge',
      capabilities: { persistent: true, writable: true, quotaBased: false, caseSensitive: true },
      // oxlint-disable-next-line eslint/no-empty-function -- Underlying FS owns its lifecycle; the bridge is a stateless decorator with nothing to release.
      dispose() {},
      readFile,

      async exists(path: string): Promise<boolean> {
        const span = tracer.startSpan('fs.exists', { path });
        const fileExists = await fileSystem.exists(path);
        span.end();
        return fileExists;
      },

      async readdir(path: string): Promise<string[]> {
        const span = tracer.startSpan('fs.readdir', { path });
        const entries = await fileSystem.readdir(path);
        span.end();
        return entries;
      },

      writeFile: async (path: string, data: Uint8Array<ArrayBuffer> | string) => fileSystem.writeFile(path, data),
      mkdir: async (path: string, options?: { recursive?: boolean }) => fileSystem.mkdir(path, options),
      unlink: async (path: string) => fileSystem.unlink(path),
      rmdir: async (path: string) => fileSystem.rmdir(path),
      rename: async (oldPath: string, newPath: string) => fileSystem.rename(oldPath, newPath),
      stat: async (path: string) => fileSystem.stat(path),
      lstat: async (path: string) => fileSystem.lstat(path),
    });
  }

  /**
   * Compute all dependencies for cache key computation.
   * Gathers file dependencies, middleware signatures, framework version, kernel options,
   * parameters (for geometry computation), and bundled assets.
   *
   * @param input - Input containing optional parameters and resolved middleware for dependency computation
   * @param input.parameters - Optional parameters (included for geometry computation, omitted for parameter extraction)
   * @param input.resolvedMiddleware - Resolved middleware array for dependency signatures
   * @returns Array of all dependencies
   */
  private async computeDependencies(input: {
    parameters?: Record<string, unknown>;
    renderOptions?: Record<string, unknown>;
    resolvedMiddleware?: ResolvedMiddleware[];
    dependencyContext?: DependencyResolutionContext;
    owner: OperationOwner;
  }): Promise<Dependency[]> {
    let baseDeps = input.dependencyContext?.baseDependencies;
    if (!baseDeps) {
      baseDeps = await this.computeBaseDependencies(input.owner, input.resolvedMiddleware);
      if (input.dependencyContext) {
        input.dependencyContext.baseDependencies = baseDeps;
      }
    }

    const runtimeDeps: Dependency[] = [...baseDeps];

    if (input.parameters !== undefined) {
      const parameterDep: ParameterDependency = {
        type: 'parameter',
        parameters: input.parameters,
      };
      runtimeDeps.push(parameterDep);
    }

    if (input.renderOptions !== undefined) {
      const renderOptionsDep: RenderOptionsDependency = {
        type: 'render-options',
        options: input.renderOptions,
      };
      runtimeDeps.push(renderOptionsDep);
    }

    return runtimeDeps;
  }

  /**
   * Compute all non-parameter dependencies. Factored out so the result
   * can be cached for the duration of a render cycle (shared between
   * getParameters and createGeometry).
   *
   * @param owner - Kernel/file owner for this dependency-resolution operation
   * @param resolvedMiddleware - optional resolved middleware entries to include as dependencies
   * @returns array of file and asset dependencies with content hashes
   */
  private async computeBaseDependencies(
    owner: OperationOwner,
    resolvedMiddleware?: ResolvedMiddleware[],
  ): Promise<Dependency[]> {
    this.setBasePath(owner.file);
    const ownerFilePath = KernelWorker.resolveFromRoot(owner.file.filename, owner.projectRootPath);

    // 1. Discover file dependencies from kernel module
    const discoverSpan = this.tracer.startSpan('deps.discover');
    const discoverInput: GetDependenciesInput = {
      filePath: ownerFilePath,
      basePath: owner.projectRootPath,
    };
    const depsResult = await this.onGetDependenciesForOwner(owner, discoverInput, this.createRuntime());
    this.unresolvedDependencyPaths = new Set(depsResult.unresolved);
    const absolutePaths = depsResult.resolved;
    discoverSpan.end();

    // 2. Read uncached files
    const uncachedPaths = absolutePaths.filter((p) => !this.fileHashCache.has(p));
    if (uncachedPaths.length > 0) {
      const readSpan = this.tracer.startSpan('deps.read', {
        fileCount: uncachedPaths.length,
      });
      const contentMap: Record<string, Uint8Array<ArrayBuffer>> = await this.filesystem.readFiles(uncachedPaths);
      readSpan.end();

      const hashSpan = this.tracer.startSpan('deps.hash', {
        fileCount: uncachedPaths.length,
      });
      for (const path of Object.keys(contentMap)) {
        const content = contentMap[path];
        if (content === undefined) {
          continue;
        }
        this.fileHashCache.set(path, this.hashContent(content));
        this.fileContentCache.set(path, content);
      }

      hashSpan.end();
    }

    // Contract: getDependencies() must return paths in deterministic order.
    const fileDeps: FileDependency[] = absolutePaths.map((absolutePath) => ({
      type: 'file',
      path: absolutePath,
      contentHash: this.fileHashCache.get(absolutePath)!,
    }));

    // 2. Middleware file dependencies (from getDependencies hooks)
    const middleware = resolvedMiddleware ?? this.getMiddleware();
    const middlewareFilePaths: string[] = [];
    for (const { middleware: mw, options: mwOptions, enabled } of middleware) {
      if (enabled && mw.getDependencies) {
        const getDeps = mw.getDependencies as (
          input: GetDependenciesInput,
          options: Record<string, unknown>,
        ) => string[] | Promise<string[]>;
        // oxlint-disable-next-line no-await-in-loop -- Sequential to preserve deterministic ordering
        const paths = await getDeps(discoverInput, mwOptions);
        middlewareFilePaths.push(...paths);
      }
    }

    if (middlewareFilePaths.length > 0) {
      for (const filePath of middlewareFilePaths) {
        if (!this.fileHashCache.has(filePath)) {
          try {
            // oxlint-disable-next-line no-await-in-loop -- Individual reads to handle missing files gracefully
            const content = await this.filesystem.readFile(filePath);
            this.fileHashCache.set(filePath, this.hashContent(content));
          } catch {
            this.fileHashCache.set(filePath, 'missing');
          }
        }
        fileDeps.push({
          type: 'file',
          path: filePath,
          contentHash: this.fileHashCache.get(filePath)!,
        });
      }
    }

    // 3. Middleware signature dependencies (only enabled, index preserves chain order)
    const middlewareDeps: MiddlewareDependency[] = middleware
      .filter(({ enabled }) => enabled)
      .map(({ middleware: mw, options: mwOptions }, index) => ({
        type: 'middleware',
        name: mw.name,
        version: mw.version ?? '1',
        index,
        options: mwOptions,
      }));

    // 4. Framework dependency
    const frameworkDep: FrameworkDependency = {
      type: 'framework',
      name: 'tau',
      version: tauVersion,
    };

    const activeKernelId = owner.binding?.kernelId;
    const activeKernelVersion = owner.binding?.kernelVersion;
    const kernelDeps: KernelDependency[] =
      activeKernelId && activeKernelVersion
        ? [{ type: 'kernel', id: activeKernelId, version: activeKernelVersion }]
        : [];

    // 5. Options dependencies (options are stable between renders, no sort needed)
    const optionDeps: OptionDependency[] = Object.entries(this.options).map(([key, value]) => ({
      type: 'option',
      key,
      value,
    }));

    // 6. Asset dependencies (fonts, WASM, etc.)
    const assetUrls = this.getAssetUrls();
    const assetDeps: AssetDependency[] = assetUrls.map((urlOrVersion, index) => ({
      type: 'asset',
      name: `asset-${index}`,
      contentHash: this.hashAssetUrl(urlOrVersion),
    }));

    return [...fileDeps, ...middlewareDeps, ...kernelDeps, frameworkDep, ...optionDeps, ...assetDeps];
  }

  /**
   * Create a RuntimeLogger for use in kernel methods.
   * The logger automatically injects the kernel name as the component.
   *
   * @returns RuntimeLogger instance
   */
  private getLogOrigin(): { component: string; file: string } {
    if (!this.cachedLogOrigin || this.cachedLogOriginFile !== this.activeFilePath) {
      this.cachedLogOriginFile = this.activeFilePath;
      this.cachedLogOrigin = {
        component: this.name,
        file: this.activeFilePath,
      };
    }

    return this.cachedLogOrigin;
  }

  private createLogger(): RuntimeLogger {
    return {
      log: (message, options) => {
        this.onLog({
          level: logLevels.info,
          message,
          origin: this.getLogOrigin(),
          data: options?.data,
        });
      },
      debug: (message, options) => {
        this.onLog({
          level: logLevels.debug,
          message,
          origin: this.getLogOrigin(),
          data: options?.data,
        });
      },
      trace: (message, options) => {
        this.onLog({
          level: logLevels.trace,
          message,
          origin: this.getLogOrigin(),
          data: options?.data,
        });
      },
      warn: (message, options) => {
        this.onLog({
          level: logLevels.warn,
          message,
          origin: this.getLogOrigin(),
          data: options?.data,
        });
      },
      error: (message, options) => {
        this.onLog({
          level: logLevels.error,
          message,
          origin: this.getLogOrigin(),
          data: options?.data,
        });
      },
      custom: (level, message, options) => {
        this.onLog({
          level,
          message,
          origin: this.getLogOrigin(),
          data: options?.data,
        });
      },
    };
  }

  /**
   * Create a KernelBundler facade that routes operations to the correct bundler by extension.
   *
   * @returns a bundler interface that delegates to extension-specific bundler implementations
   */
  private createBundlerFacade(): KernelBundler {
    if (this.cachedBundlerFacade) {
      return this.cachedBundlerFacade;
    }

    this.cachedBundlerFacade = {
      bundle: async (entryPath: string): Promise<BundleResult> => {
        const cached = this.bundleResultCache.get(entryPath);
        if (cached) {
          return cached;
        }

        this.onProgress?.('bundling');
        const bundleSpan = this.tracer.startSpan('kernel.bundle', {
          entryPath,
          phase: 'bundling',
        });
        const extension = KernelWorker.getFileExtension(entryPath);
        const bundler = await this.ensureBundlerForExtension(extension);

        const bundleResult = await bundler.definition.bundle({ entryPath }, bundler.ctx);
        bundleSpan.end();
        this.bundleResultCache.set(entryPath, bundleResult);
        return bundleResult;
      },
      resolveDependencies: async (entryPath: string): Promise<GetDependenciesResult> => {
        const cached = this.bundleResultCache.get(entryPath);
        if (cached) {
          return { resolved: cached.dependencies, unresolved: cached.unresolvedPaths };
        }

        const result = await this.createBundlerFacade().bundle(entryPath);
        return { resolved: result.dependencies, unresolved: result.unresolvedPaths };
      },
      registerModule: (name: string, entry: BuiltinModule): void => {
        if (this.loadedBundlers.size > 0) {
          for (const bundler of new Set(this.loadedBundlers.values())) {
            bundler.definition.registerModule(name, entry, bundler.ctx);
          }
        } else {
          this.pendingModuleRegistrations.set(name, entry);
        }
      },
    };

    return this.cachedBundlerFacade;
  }

  /**
   * Create a KernelRuntime for use in kernel methods.
   * Provides filesystem, logger, bundler, and execute services.
   * The bundler is lazily initialised -- kernels that never call it pay zero cost.
   *
   * @returns KernelRuntime instance
   */
  private createRuntime(): KernelRuntime {
    this.cachedRuntime ??= {
      filesystem: this.filesystem,
      logger: this.logger,
      fileContentCache: this.fileContentCache,
      bundler: this.createBundlerFacade(),
      execute: async (code: string): Promise<ExecuteResult> => {
        await this.ensureBundlerContext();

        const executeSpan = this.tracer.startSpan('kernel.execute', {
          phase: 'computingGeometry',
        });
        const firstBundler = this.loadedBundlers.values().next().value!;
        const result = await firstBundler.definition.execute(code, firstBundler.ctx);
        executeSpan.end();
        return result;
      },
      tracer: this.tracer,
    };

    return this.cachedRuntime;
  }

  /**
   * Get or create a cached logger for a middleware by name.
   *
   * @param middlewareName - the middleware component name used as the log origin
   * @returns a logger scoped to the given middleware
   */
  private getMiddlewareLogger(middlewareName: string): RuntimeLogger {
    let logger = this.middlewareLoggerCache.get(middlewareName);
    if (!logger) {
      logger = {
        log: (message, options) => {
          this.onLog({
            level: logLevels.info,
            message,
            origin: { component: middlewareName },
            data: options?.data,
          });
        },
        debug: (message, options) => {
          this.onLog({
            level: logLevels.debug,
            message,
            origin: { component: middlewareName },
            data: options?.data,
          });
        },
        trace: (message, options) => {
          this.onLog({
            level: logLevels.trace,
            message,
            origin: { component: middlewareName },
            data: options?.data,
          });
        },
        warn: (message, options) => {
          this.onLog({
            level: logLevels.warn,
            message,
            origin: { component: middlewareName },
            data: options?.data,
          });
        },
        error: (message, options) => {
          this.onLog({
            level: logLevels.error,
            message,
            origin: { component: middlewareName },
            data: options?.data,
          });
        },
        custom: (level, message, options) => {
          this.onLog({
            level,
            message,
            origin: { component: middlewareName },
            data: options?.data,
          });
        },
      };
      this.middlewareLoggerCache.set(middlewareName, logger);
    }

    return logger;
  }

  private hashContent(content: Uint8Array<ArrayBuffer>): string {
    return hashBytes(content);
  }

  private hashAssetUrl(url: string): string {
    const cached = this.assetHashCache.get(url);
    if (cached) {
      return cached;
    }

    // Vite ?url imports include a content hash in the URL (production) or a
    // cache-busted path (dev). Hashing the URL string itself is sufficient for
    // cache invalidation and avoids fetching multi-MB WASM/font binaries.
    const hash = hashString(url);
    this.assetHashCache.set(url, hash);
    return hash;
  }

  /**
   * Set the base path for relative file operations based on a GeometryFile.
   * Extracts the directory from the filename and combines it with the path.
   *
   * @param file - The geometry file being processed
   */
  private setBasePath(file: GeometryFile): void {
    if (this.basePath === file.path && this.activeFilePath === file.filename) {
      return;
    }

    this.activeFilePath = file.filename;

    const lastSlashIndex = file.filename.lastIndexOf('/');
    const directory = lastSlashIndex === -1 ? '' : file.filename.slice(0, lastSlashIndex);

    this.basePath = directory ? joinPath(file.path, directory) : file.path;

    this.cachedRuntime = undefined;
    this.cachedProjectRoot = undefined;
    this.cachedBundlerFacade = undefined;
  }

  /**
   * Register a middleware watch path with an optional custom debounce tier.
   * Called by middleware via `runtime.registerWatchPath()`.
   * Idempotent — re-registering the same path updates the debounce value.
   *
   * @param absolutePath - The absolute path to register.
   * @param options - The options for the watch path.
   */
  private readonly handleRegisterWatchPath = (absolutePath: string, options?: { watchDebounce?: number }): void => {
    this.middlewareWatchPaths.set(absolutePath, options?.watchDebounce ?? fileChangeDebounce);
  };

  /**
   * Validate render options against the active kernel's render Zod schema.
   * Always returns a populated object — when a schema exists, applies defaults
   * via `safeParse(renderOptions ?? {})`. When no schema exists, returns `renderOptions ?? {}`.
   */
  private validateRenderOptions(
    renderOptions: Record<string, unknown> | undefined,
    owner: OperationOwner,
  ): { success: true; options: Record<string, unknown> } | { success: false; issues: KernelIssue[] } {
    const activeKernelId = owner.binding?.kernelId;
    const zodSchema = activeKernelId ? this.kernelRenderZodSchemaMap.get(activeKernelId) : undefined;
    if (!zodSchema) {
      return { success: true, options: renderOptions ?? {} };
    }
    const parseResult = zodSchema.safeParse(renderOptions ?? {});
    if (parseResult.success) {
      return { success: true, options: parseResult.data as Record<string, unknown> };
    }
    return {
      success: false,
      issues: parseResult.error.issues.map((issue) => ({
        message: `Render option validation failed: ${issue.path.join('.')} — ${issue.message}`,
        code: 'RUNTIME',
        severity: 'error',
      })),
    };
  }

  private computeDependencyHash(dependencies: readonly Dependency[]): string {
    const contentHashSpan = this.tracer.startSpan('deps.content-hash');
    const hex = hashString(JSON.stringify(dependencies));
    contentHashSpan.end();
    return hex;
  }
}

preserveMethodNames(KernelWorker, ['render', 'createGeometry', 'exportGeometry', 'getParameters']);

/**
 * Merge two pre-resolved JSON Schema objects by combining their `properties`,
 * `required` arrays, and defaults. Used to build transcoded export route schemas
 * from pre-resolved kernel and edge JSON Schemas.
 *
 * @param a - First schema entry (kernel)
 * @param b - Second schema entry (transcoder edge)
 * @returns Merged JSON Schema and defaults
 */
function mergeJsonSchemas(
  a: { schema: JSONSchema7; defaults: Record<string, unknown> },
  b: { schema: JSONSchema7; defaults: Record<string, unknown> },
): { schema: JSONSchema7; defaults: Record<string, unknown> } {
  const aEmpty = Object.keys(a.schema).length === 0;
  const bEmpty = Object.keys(b.schema).length === 0;

  if (aEmpty && bEmpty) {
    return { schema: {}, defaults: {} };
  }
  if (bEmpty) {
    return { schema: a.schema, defaults: a.defaults };
  }
  if (aEmpty) {
    return { schema: b.schema, defaults: b.defaults };
  }

  const aProps = a.schema.properties ?? {};
  const bProps = b.schema.properties ?? {};
  const aRequired = a.schema.required ?? [];
  const bRequired = b.schema.required ?? [];
  const mergedRequired = [...new Set([...aRequired, ...bRequired])];

  return {
    schema: {
      ...a.schema,
      properties: { ...aProps, ...bProps },
      ...(mergedRequired.length > 0 ? { required: mergedRequired } : {}),
    },
    defaults: { ...a.defaults, ...b.defaults },
  };
}
