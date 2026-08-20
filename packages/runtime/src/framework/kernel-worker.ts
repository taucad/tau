/* eslint-disable @typescript-eslint/member-ordering -- operation entrypoints stay adjacent to their private lane implementations in this stateful worker. */
/* oxlint-disable unicorn/prefer-math-trunc, no-bitwise -- cancellation generations require ECMAScript ToUint32 wrap semantics. */
import deepmerge from 'deepmerge';
import { logLevels, lookupExportFidelity } from '@taucad/types/constants';
import { randomUuid } from '@taucad/utils/id';
import { joinPath, parentDirectory, resolveVirtualPath } from '@taucad/utils/path';
import { named, preserveMethodNames } from '#framework/named.js';
import { getIsolationStatus } from '#cross-origin-isolation/headers.js';
import type { FileExtension, OnWorkerLog } from '@taucad/types';
import type { JSONSchema7 } from '@taucad/json-schema';
import type { MessagePortLike } from '@taucad/rpc';
import { SharedPool } from '@taucad/memory';
import type {
  HashedGeometryResult,
  CreateGeometryResult,
  MeshGeometryResult,
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
  GetDependenciesInput,
  ExportGeometryInput,
  KernelExportGeometryInput,
  RuntimeImplementationAsset,
} from '#types/runtime-kernel.types.js';
import type { RuntimeFileLocator } from '#types/runtime-file.types.js';
import type {
  KernelMiddlewareRuntime,
  CreateGeometryHandler,
  MiddlewareCreateGeometryRequest,
  MeshGeometryHandler,
  MeshGeometryRequest,
  ExportGeometryHandler,
  MiddlewareExportGeometryRequest,
  GetParametersHandler,
  MiddlewareDependencyDeclaration,
  MiddlewareDependencyRuntime,
} from '#types/runtime-middleware.types.js';
import type { BundlerDefinition } from '#types/runtime-bundler.types.js';
import type {
  KernelBundler,
  BuiltinModule,
  BundleResult,
  ExecuteResult,
} from '#types/runtime-bundler-service.types.js';
import type {
  Dependency,
  FileDependency,
  MiddlewareDependency,
  FrameworkDependency,
  OptionDependency,
  ParameterDependency,
  RenderOptionsDependency,
  ContentDependency,
  KernelDependency,
  ExportDependency,
  AssetDependency,
  GetDependenciesResult,
} from '#types/runtime-dependency.types.js';
import type {
  TelemetryEntry,
  RenderPhase,
  RuntimeExportModelArgs,
  RuntimePreviewIdentity,
  RuntimeOpenFileArgs,
  RuntimeStageAndRenderArgs,
  RuntimeUpdateParametersArgs,
  RuntimeSetOptionsArgs,
  RuntimeStateChangedArgs,
  RuntimeProgressArgs,
  RuntimeParametersResolvedArgs,
  RuntimeErrorEventArgs,
  RuntimeProtocol,
  WireAbortReasonCode,
  WorkerState,
} from '#types/runtime-protocol.types.js';
import { signalSlot, abortReason as abortReasonEnum } from '#types/runtime-protocol.types.js';
import type { TranscoderDefinition, TranscoderEdge, TranscoderRuntime } from '#types/runtime-transcoder.types.js';
import { isRenderAbortedError, renderTimeoutIssue, RenderAbortedError } from '#framework/runtime-worker-client.js';
import { setAbortContext, clearAbortContext } from '#framework/cooperative-abort.js';
import { createRuntimeFileSystem } from '#filesystem/create-runtime-filesystem.js';
import { toJSONSchema } from 'zod';
import type { z } from 'zod';
import { createKernelError } from '#kernels/kernel-helpers.js';
import { cooperativeYield } from '#framework/async-polyfills.js';
import { parameterDebounce, fileChangeDebounce } from '#framework/runtime-framework.constants.js';
import { canonicalJson, sha256Bytes, sha256String } from '@taucad/utils/hash';
import { RuntimeTracer } from '#framework/runtime-tracer.js';
import { WorkerTelemetryCollector } from '#framework/worker-telemetry.js';
import { createMiddlewareRuntime } from '#middleware/runtime-middleware.js';
import type { KernelMiddleware } from '#middleware/runtime-middleware.js';
import { clearExecuteCache } from '#bundler/esbuild-core.js';
import type {
  BundlerPlugin,
  KernelPlugin,
  MiddlewarePlugin,
  RuntimePluginDeclaration,
  RuntimePluginVersionMismatchDiagnostic,
  TranscoderPlugin,
} from '#plugins/plugin-types.js';
import { resolveRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';
import type { RuntimePluginDefinitionCarrier } from '#plugins/plugin-runtime-definition.js';
import { createWorkerFileSystemProxy } from '#transport/_internal/worker-filesystem-proxy.js';
import type { WorkerFileSystemProxy } from '#transport/_internal/worker-filesystem-proxy.js';
import type { WatchEvent } from '@taucad/filesystem';
import {
  contentDefault,
  normalizeRuntimeContent,
  RuntimeContentUnsupportedError,
} from '#types/runtime-content.types.js';
import type { RuntimeContentInput, RuntimeContentKey } from '#types/runtime-content.types.js';
import { packageVersion } from '#utils/package-info.js';
import type {
  DependencyResolutionContext,
  KernelBinding,
  MaterializedRender,
  MaterializedRenderResult,
  NativeHandleSlot,
  NativeBuildInput,
  NativeBuildInputCarrier,
  OperationOwner,
  RenderIdentity,
  SerializedNativeHandleSlot,
} from '#framework/render-artifact.js';
import {
  createNativeHandleIdentityKey,
  createRenderIdentityKey,
  nativeBuildInputSymbol,
} from '#framework/render-artifact.js';
import { finalizeExportArtifactSet } from '#framework/export-artifact-finalizer.js';
import { isNotFoundError } from '#filesystem/filesystem-errors.js';

type FileSystemProxy = WorkerFileSystemProxy;

type ObservedFileRevision = {
  readonly hash: string;
  readonly content?: Uint8Array<ArrayBuffer>;
  readonly expectedPrior?: Readonly<{ hash: string | undefined }>;
};

type RenderCancellationRecord = {
  readonly renderId: string;
  readonly generation: number;
  readonly controller: AbortController;
  reason?: 'superseded' | 'timeout';
  executing: boolean;
};

const neverAbortedSignal = new AbortController().signal;

type TranscoderPluginEntry = TranscoderPlugin<Record<string, unknown>> &
  RuntimePluginDefinitionCarrier<TranscoderDefinition>;

export type KernelWorkerOptions = {
  readonly kernels?: ReadonlyArray<KernelPlugin<Record<string, unknown>, unknown>>;
  readonly middleware?: readonly MiddlewarePlugin[];
  readonly bundlers?: readonly BundlerPlugin[];
  readonly transcoders?: readonly TranscoderPluginEntry[];
};

type LoadedTranscoder = {
  id: string;
  definition: TranscoderDefinition;
  context: unknown;
  edges: readonly TranscoderEdge[];
  options: Record<string, unknown>;
  implementationAssets: readonly RuntimeImplementationAsset[];
};

export type LastSettledRenderIdentity = RenderIdentity;

type OwnerBoundExportRoute =
  | {
      kind: 'direct';
      kernelId: string | undefined;
      targetFormat: FileExtension;
      options: Record<string, unknown>;
      content: RuntimeContentInput;
    }
  | {
      kind: 'transcoded';
      kernelId: string;
      sourceFormat: FileExtension;
      targetFormat: FileExtension;
      transcoderId: string;
      sourceOptions: Record<string, unknown>;
      edgeOptions: Record<string, unknown>;
      content: RuntimeContentInput;
    };

type OwnerBoundExportPlan =
  | {
      success: true;
      owner: OperationOwner;
      input: MiddlewareExportGeometryRequest;
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
 * that supplied it). Watch absence is preserved so explicit operations can
 * use the watcherless freshness path. */
function adaptInlineFileSystem(fs: RuntimeFileSystemBase): FileSystemProxy {
  // oxlint-disable-next-line eslint/no-empty-function -- intentional no-op for inline-FS lifecycle bookkeeping
  const noop = (): void => {};
  const fileSystem: FileSystemProxy = {
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
    dispose: noop,
  };
  if (fs.watch) {
    fileSystem.watch = fs.watch.bind(fs);
    /* A bridged inline filesystem registers its watch over a round trip and
     * carries its own `watchReady`; only a same-isolate `fs.watch` (armed
     * synchronously) may have its readiness synthesised. */
    const suppliedWatchReady = (fs as Pick<Partial<FileSystemProxy>, 'watchReady'>).watchReady;
    fileSystem.watchReady =
      typeof suppliedWatchReady === 'function'
        ? suppliedWatchReady.bind(fs)
        : (request, handler) => {
            let resolveClosed!: () => void;
            const closed = new Promise<void>((resolve) => {
              resolveClosed = resolve;
            });
            const unsubscribe = fs.watch!(request, handler);
            return {
              unsubscribe: () => {
                unsubscribe();
                resolveClosed();
              },
              ready: Promise.resolve(),
              closed,
            };
          };
  }
  return fileSystem;
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

  /** Callback for pushing one fully identified state change to the dispatcher. */
  public onStateChanged?: (event: RuntimeStateChangedArgs) => void;

  /**
   * Callback for pushing geometry results to the dispatcher. The internal
   * generation supports cooperative SAB polling; `renderId` is the opaque
   * preview identity used for downstream frame correlation.
   */
  public onGeometryComputed?: (event: { readonly result: HashedGeometryResult; readonly renderId: string }) => void;

  /**
   * Callback for pushing parameter results to the dispatcher. `renderId`
   * correlates the schema with its preview; generation remains internal
   * cooperative-cancellation state.
   */
  public onParametersResolved?: (event: RuntimeParametersResolvedArgs) => void;

  /**
   * Callback for pushing progress updates to the dispatcher. The admission
   * lets the consumer discard frames from superseded renders.
   */
  public onProgressUpdate?: (event: RuntimeProgressArgs) => void;

  /**
   * Callback for pushing errors to the dispatcher. `renderId` is supplied
   * for render-scoped failures and omitted for connection-scoped
   * issues (e.g. handshake failure, transcoder load).
   */
  public onError?: (event: RuntimeErrorEventArgs) => void;

  /** Callback for pushing active kernel changes to the dispatcher. */
  public onActiveKernelChanged?: (event: RuntimeProtocol['notifies']['activeKernelChanged']['args']) => void;

  /** Callback for pushing updated capabilities manifest to the dispatcher. */
  public onCapabilitiesUpdated?: (capabilities: CapabilitiesManifest) => void;

  /** Callback for pushing kernel-authored events to the dispatcher. */
  public onKernelEvent?: (event: RuntimeProtocol['notifies']['kernelEvent']['args']) => void;

  /** Raw Zod schemas for runtime validation, keyed by kernel ID → format. Populated from kernel definitions. */
  protected readonly kernelExportZodSchemasMap = new Map<string, Partial<Record<FileExtension, z.ZodType>>>();

  /** Raw Zod schema for render option validation, keyed by kernel ID. Populated from kernel definitions. */
  protected readonly kernelRenderZodSchemaMap = new Map<string, z.ZodType>();

  /** Exact construction-option schemas keyed by kernel ID. */
  protected readonly kernelCreateOptionsZodSchemaMap = new Map<string, z.ZodObject<z.ZodRawShape>>();

  /** Native content declarations keyed by kernel ID and export format. */
  protected readonly kernelExportContentMap = new Map<
    string,
    Partial<Record<FileExtension, readonly RuntimeContentKey[]>>
  >();

  /** Native render content declarations keyed by kernel ID. */
  protected readonly kernelRenderContentMap = new Map<string, readonly RuntimeContentKey[]>();

  /** Validated init options and verified assets for selected-participant identity. */
  protected readonly kernelInitOptionsMap = new Map<string, Record<string, unknown>>();
  protected readonly kernelImplementationAssetsMap = new Map<string, readonly RuntimeImplementationAsset[]>();

  protected pendingNativeHandle: unknown;

  /**
   * Live native handles this worker owns, mapped to the owner that can release
   * them. A handle enters on creation (`createGeometry`, snapshot restore) and
   * leaves when no worker field references it any more — see
   * {@link disposeUnreachableNativeHandles}.
   */
  private readonly ownedNativeHandles = new Map<unknown, OperationOwner>();

  /** Fully initialized bundlers keyed by file extension. Shared context across extensions of the same bundler. */
  protected loadedBundlers = new Map<string, { definition: BundlerDefinition; ctx: unknown }>();

  /** Worker-owned runtime middleware plugins. */
  protected middlewarePlugins: readonly MiddlewarePlugin[];

  /** Worker-owned runtime bundler plugins. */
  protected bundlerPlugins: readonly BundlerPlugin[];

  /** Worker-owned runtime transcoder plugins. */
  protected transcoderPlugins: readonly TranscoderPluginEntry[];

  /** Plugin declarations surfaced in the capabilities manifest. */
  private manifestKernelPlugins: ReadonlyArray<RuntimePluginDeclaration & { readonly id: string }>;

  /**
   * Human-readable identifier for this worker, used in log output and error diagnostics
   * (e.g., `'ReplicadWorker'`, `'TauWorker'`, `'ZooWorker'`).
   */
  protected abstract readonly name: string;

  /**
   * Pending bundler definitions awaiting context initialization, keyed by extension.
   * Definitions are loaded eagerly (during ensureLoadedBundler) but context creation
   * is deferred until first use, after the active file has been selected.
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
   * The full relative path of the active file being processed.
   * Used for error locations to ensure FileLink can navigate correctly.
   * Set via setActiveFile() from the local RuntimeFileLocator path.
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

  /** Cached log origin object -- recreated only when activeFilePath changes */
  private cachedLogOrigin: { component: string; file: string } | undefined;
  private cachedLogOriginFile = '';

  /** Telemetry collector instance -- created on first use when setTelemetrySend is called */
  private telemetryCollector?: WorkerTelemetryCollector;

  /** Span tracer for hierarchical telemetry with explicit parent-child IDs */
  private readonly tracer = new RuntimeTracer();

  /** Progress callback set during render, used by entry methods to emit phase transitions */
  private onProgress?: (phase: RenderPhase) => void;

  /** Bundle result cache keyed by entry path. Selectively invalidated when dependencies change; fully cleared on reset. */
  private readonly bundleResultCache = new Map<string, BundleResult>();

  /** Paths which may schedule the current autonomous preview. */
  private currentPreviewWatchPaths = new Map<string, number>();

  /** Middleware declarations owned by the current preview, retained for diagnostics/tests. */
  private currentPreviewMiddlewarePaths = new Map<string, number>();

  /** Generation-local preview dependency candidate assembled during discovery. */
  private previewWatchCandidate:
    | {
        readonly generation: number;
        readonly paths: Map<string, number>;
        readonly middlewarePaths: Map<string, number>;
        coherent: boolean;
        watchCommitRejected?: boolean;
      }
    | undefined;

  /** Currently watched dependency paths. Used for incremental watch-set diffing. */
  private watchedPaths = new Set<string>();

  /** Unsubscribe function for the current watch subscription. */
  private watchUnsubscribe?: () => void;

  /** One serialized lane for kernel/cache/watch/native state. */
  private operationTail: Promise<void> = Promise.resolve();
  /** Serializes authoritative watch rereads before they enter the operation lane. */
  private watchReconciliationTail: Promise<void> = Promise.resolve();
  /** Holds same-path watch echoes until staged bytes and their cache revision publish together. */
  private stagedWritePublication:
    | {
        readonly paths: ReadonlySet<string>;
        readonly promise: Promise<void>;
        readonly resolve: () => void;
      }
    | undefined;
  private operationAdmissionOpen = true;
  private cleanupPromise: Promise<void> | undefined;

  private readonly renderCancellationRecords = new Map<string, RenderCancellationRecord>();
  private activeRenderRecord: RenderCancellationRecord | undefined;
  private operationSignal: AbortSignal | undefined;

  /** SharedArrayBuffer signal channel for bidirectional abort/state signaling. */
  private signalView: Int32Array | undefined;

  private _geometryPoolBuffer: SharedArrayBuffer | undefined;
  private _geometryPool: SharedPool | undefined;

  /** Shared memory pool for zero-IPC geometry data exchange. */
  public get geometryPool(): SharedPool | undefined {
    return this._geometryPool;
  }

  /** Loaded transcoder instances keyed by plugin id. */
  private readonly loadedTranscoders = new Map<string, LoadedTranscoder>();

  /** Capabilities manifest computed during initialization. */
  private _capabilitiesManifest: CapabilitiesManifest = {
    plugins: [],
    routes: [],
    renderCapabilities: {},
  };

  /**
   * The capabilities manifest discovered during worker initialization.
   * Contains kernel export formats, transcoder edges, and precomputed export routes.
   */
  public get capabilitiesManifest(): CapabilitiesManifest {
    return this._capabilitiesManifest;
  }

  /** Render identity currently owning preview publication. */
  protected get activeRenderId(): string | undefined {
    return this.activeRenderRecord?.renderId;
  }

  /** Current render generation for abort detection. */
  private renderGeneration = 0;

  /** Current file for autonomous render loop. */
  private currentFile: RuntimeFileLocator | undefined;

  /** Current parameters for autonomous render loop. */
  private currentParameters: Record<string, unknown> = {};

  /** Exact artifact identity for the currently published preview render. */
  private currentPublishedRender: MaterializedRender | undefined;

  /** Current render options for autonomous render loop. */
  private currentRenderOptions: Record<string, unknown> | undefined;

  /** Framework-owned content requirements retained across autonomous rerenders. */
  private currentRenderContent: RuntimeContentInput | undefined;

  /** Debounce timer for parameter change re-renders. */
  private paramDebounceTimer: ReturnType<typeof setTimeout> | undefined;

  /** Last state pushed via `pushState`, used to deduplicate repeated emissions. */
  private lastPushedState?: { readonly renderId: string; readonly state: WorkerState; readonly detail?: string };

  /**
   * Whether a render is currently in progress. Exposed for export-during-render decisions.
   *
   * @returns True if a render is in progress, false otherwise.
   */
  public get isRendering(): boolean {
    return [...this.renderCancellationRecords.values()].some((record) => record.executing);
  }

  /** Pending module registrations queued before the bundler is loaded */
  private readonly pendingModuleRegistrations = new Map<string, BuiltinModule>();

  /** In-flight bundler initializations to coalesce concurrent callers for the same extension */
  private readonly bundlerInitInProgress = new Map<string, Promise<{ definition: BundlerDefinition; ctx: unknown }>>();

  public constructor(options: KernelWorkerOptions = {}) {
    this.manifestKernelPlugins = options.kernels ?? [];
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
   * - Relative to the current file's project-local directory
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
   * @param input.transferables.fileSystemPort - Optional port for direct communication with the
   * file-manager worker. Typed structurally ({@link MessagePortLike}) so in-process and
   * `node:worker_threads` hosts can supply their own port; worker transports transfer a `MessagePort`.
   */
  public async initialize(input: {
    callbacks: { onLog: OnWorkerLog };
    transferables: { fileSystemPort?: MessagePortLike; inlineFileSystem?: RuntimeFileSystemBase };
    options?: Options;
    config?: unknown;
  }): Promise<void> {
    this.onLog = input.callbacks.onLog;
    const defaultOptions: Record<string, unknown> = {};
    this.options = (input.options ?? defaultOptions) as Options;

    // Create logger (depends on onLog being set)
    this._logger = this.createLogger();

    /* One warn per initialize when this realm cannot host SharedArrayBuffer.
     * Degradation is otherwise silent at every consumer. Structurally silent in
     * the Electron utility topology — a Node process is never gated — so this
     * is the browser web-worker signal; Electron's header defect is caught by
     * the `installElectronRuntimeHeaders` regression test instead. */
    const isolation = getIsolationStatus();
    if (!isolation.crossOriginIsolated) {
      this._logger.warn(
        `Cross-origin isolation degraded (${isolation.reason}): geometry pool falls back to copy delivery, render abort to wire-notify, auto-selected OCCT kernels to single-threaded`,
      );
    }

    if (this._geometryPoolBuffer) {
      this._geometryPool = new SharedPool(this._geometryPoolBuffer);
    }
    /* Filesystem wiring — three precedence rules (TR16):
     * 1. `inlineFileSystem` takes precedence: same V8 cluster fast-path,
     *    no MessagePort serialization or bridge proxy.
     * 2. `fileSystemPort` falls back to the generic bridge proxy (worker /
     *    cross-process topologies).
     * 3. Neither: filesystem stays undefined; kernel runs without FS. */
    if (input.transferables.inlineFileSystem) {
      input.transferables.fileSystemPort?.close();
      this.fileSystem = adaptInlineFileSystem(input.transferables.inlineFileSystem);
      this._filesystem = this.createFileSystem();
    } else if (input.transferables.fileSystemPort) {
      this.fileSystem = await createWorkerFileSystemProxy(input.transferables.fileSystemPort);
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
   * Targeted wire timeout entry point used by every isolated transport.
   * Supersession is represented by admitting a newer preview, not by this
   * command. Unknown and inactive targets are ignored.
   *
   * @param input - Opaque preview target and the only valid wire reason.
   */
  public handleWireAbort(input: { readonly renderId: string; readonly reason: WireAbortReasonCode }): void {
    const record = this.renderCancellationRecords.get(input.renderId);
    if (!record || record !== this.activeRenderRecord) {
      return;
    }
    this.abortRenderRecord(record, 'timeout');
    if (!this.signalView) {
      this.renderGeneration = (this.renderGeneration + 1) >>> 0;
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
   * Stage byte payloads onto the worker-side {@link RuntimeFileSystem} and
   * render the supplied entry under the transported preview admission.
   *
   * @param request - Stage map plus the entry to open after staging completes.
   */
  public async handleStageAndOpenFile(request: RuntimeStageAndRenderArgs): Promise<void> {
    const file = this.canonicalGeometryFile(request.file);
    const stage = this.canonicalStage(request.stage);
    const record = this.admitTransportPreview(request);
    if (!record) {
      return;
    }
    await this.runQueuedCommand(record, async () => {
      if (Object.keys(stage).length > 0) {
        await this.writeFilesAndInvalidate(stage);
      }
      await this.applyOpenFileIntent({
        record,
        file,
        parameters: request.parameters,
        operation: { options: request.options, content: request.content },
      });
    });
  }

  public handleOpenFile(request: RuntimeOpenFileArgs): void {
    const file = this.canonicalGeometryFile(request.file);
    const record = this.admitTransportPreview(request);
    if (!record) {
      return;
    }
    void this.runQueuedCommand(record, async () =>
      this.applyOpenFileIntent({
        record,
        file,
        parameters: request.parameters,
        operation: { options: request.options, content: request.content },
      }),
    );
  }

  /**
   * Handle a setParameters command from the main thread.
   * Stores the parameters, aborts any in-progress render, and schedules a
   * render after the {@link parameterDebounce} window (configured in
   * `runtime-framework.constants`).
   *
   * @param request - Identified parameter update.
   */
  public handleUpdateParameters(request: RuntimeUpdateParametersArgs): void {
    const record = this.admitTransportPreview(request);
    if (!record) {
      return;
    }
    void this.runQueuedCommand(record, async () => {
      if (!this.currentFile) {
        this.failUnscheduledPreview(record, 'Cannot update parameters before opening a runtime file');
        return;
      }
      this.currentParameters = request.parameters;
      this.scheduleRender(parameterDebounce, record);
    });
  }

  /**
   * Handle a setOptions command from the main thread.
   * Replaces the current per-render kernel options, aborts any in-progress
   * render, and schedules an immediate re-render against the active file
   * with the existing parameters.
   *
   * @param request - Identified replacement render options.
   */
  public handleSetOptions(request: RuntimeSetOptionsArgs): void {
    const record = this.admitTransportPreview(request);
    if (!record) {
      return;
    }
    void this.runQueuedCommand(record, async () => {
      if (!this.currentFile) {
        this.failUnscheduledPreview(record, 'Cannot set render options before opening a runtime file');
        return;
      }
      this.currentRenderOptions = request.options;
      clearTimeout(this.paramDebounceTimer);
      this.paramDebounceTimer = undefined;
      await this.executeRender(record);
    });
  }

  private async applyOpenFileIntent(input: {
    readonly record: RenderCancellationRecord;
    readonly file: RuntimeFileLocator;
    readonly parameters?: Record<string, unknown>;
    readonly operation?: { readonly options?: Record<string, unknown>; readonly content?: RuntimeContentInput };
  }): Promise<void> {
    const { record, file, parameters, operation } = input;
    if (record !== this.activeRenderRecord || record.controller.signal.aborted) {
      return;
    }
    const canonicalFile = this.canonicalGeometryFile(file);
    this.currentFile = canonicalFile;
    this.currentParameters = parameters ?? {};
    this.currentRenderOptions = operation?.options;
    this.currentRenderContent = operation?.content;
    clearTimeout(this.paramDebounceTimer);
    this.paramDebounceTimer = undefined;

    this.setActiveFile(canonicalFile);
    const entryCandidate = {
      generation: record.generation,
      paths: new Map([[this.activeFileAbsolutePath, fileChangeDebounce]]),
      middlewarePaths: new Map<string, number>(),
      coherent: true,
    };
    await this.reconcileObservedPaths(entryCandidate);
    if (record === this.activeRenderRecord) {
      // An abandoned reservation is terminalized by the render's own entry guard rather
      // than dropped here, which would leave the record without a terminal state.
      await this.executeRender(record);
    }
  }

  private canonicalGeometryFile(file: RuntimeFileLocator): RuntimeFileLocator {
    if (
      !file.path.startsWith('/') ||
      file.filename.length === 0 ||
      file.filename.includes('/') ||
      file.filename.includes('\\')
    ) {
      throw new TypeError('Runtime geometry files require an absolute path and basename filename');
    }
    const filePath = resolveVirtualPath(joinPath(file.path, file.filename));
    return { path: parentDirectory(filePath), filename: KernelWorker.getBasename(filePath) };
  }

  private canonicalStage(stage: Record<string, Uint8Array<ArrayBuffer>>): Record<string, Uint8Array<ArrayBuffer>> {
    const canonical: Record<string, Uint8Array<ArrayBuffer>> = {};
    for (const [path, bytes] of Object.entries(stage)) {
      const resolved = resolveVirtualPath(path);
      if (resolved in canonical) {
        throw new TypeError('Staged runtime paths must be unique after canonicalization');
      }
      canonical[resolved] = bytes;
    }
    return canonical;
  }

  private admitTransportPreview(identity: RuntimePreviewIdentity): RenderCancellationRecord | undefined {
    if (this.renderCancellationRecords.has(identity.renderId)) {
      throw new TypeError(`Duplicate live preview renderId: ${identity.renderId}`);
    }
    let generation: number;
    if (this.signalView) {
      if (identity.abortGeneration === undefined) {
        throw new TypeError('SAB-backed preview commands require abortGeneration');
      }
      generation = identity.abortGeneration >>> 0;
      const current = Atomics.load(this.signalView, signalSlot.abortGeneration) >>> 0;
      if (generation !== current) {
        const activeRecord = this.activeRenderRecord;
        const activeState = this.lastPushedState;
        if (activeState?.renderId === identity.renderId) {
          this.lastPushedState = undefined;
        }
        this.pushState('idle', {
          renderId: identity.renderId,
          generation,
          controller: new AbortController(),
          executing: false,
          reason: 'superseded',
        });
        // Only a genuinely active phase is adoptable by a client whose selection the
        // stale terminal just settled. Replaying a terminal state of a completed but
        // unreleased successor publishes a frame nobody can adopt.
        if (
          activeRecord &&
          activeRecord === this.activeRenderRecord &&
          activeState?.renderId === activeRecord.renderId &&
          (activeState.state === 'buffering' || activeState.state === 'rendering')
        ) {
          this.pushState(activeState.state, activeRecord, activeState.detail);
        }
        return undefined;
      }
    } else {
      if (identity.abortGeneration !== undefined) {
        throw new TypeError('Wire-only preview commands must omit abortGeneration');
      }
      generation = (this.renderGeneration + 1) >>> 0;
    }
    this.renderGeneration = generation;
    return this.createRenderRecord(identity.renderId, generation);
  }

  private createAutonomousPreviewRecord(): RenderCancellationRecord {
    const generation = this.reserveGeneration();
    return this.createRenderRecord(randomUuid(), generation);
  }

  private reserveGeneration(): number {
    if (this.signalView) {
      this.renderGeneration = (Atomics.add(this.signalView, signalSlot.abortGeneration, 1) + 1) >>> 0;
      Atomics.notify(this.signalView, signalSlot.abortGeneration);
    } else {
      this.renderGeneration = (this.renderGeneration + 1) >>> 0;
    }
    return this.renderGeneration;
  }

  private createRenderRecord(renderId: string, generation: number): RenderCancellationRecord {
    if (this.renderCancellationRecords.has(renderId)) {
      throw new TypeError(`Duplicate live preview renderId: ${renderId}`);
    }
    if (this.activeRenderRecord) {
      this.abortRenderRecord(this.activeRenderRecord, 'superseded');
    }
    if (this.lastPushedState?.renderId === renderId) {
      this.lastPushedState = undefined;
    }
    const record = {
      renderId,
      generation,
      controller: new AbortController(),
      executing: false,
    } satisfies RenderCancellationRecord;
    this.renderCancellationRecords.set(renderId, record);
    this.activeRenderRecord = record;
    return record;
  }

  private abortRenderRecord(record: RenderCancellationRecord, reason: 'superseded' | 'timeout'): void {
    if (record.reason) {
      return;
    }
    record.reason = reason;
    record.controller.abort(new RenderAbortedError());
    if (record.executing) {
      return;
    }

    if (reason === 'timeout') {
      this.onError?.({ issues: [renderTimeoutIssue()], renderId: record.renderId });
      this.pushState('error', record);
    } else {
      this.pushState('idle', record);
    }
    this.releaseRenderRecord(record);
  }

  private releaseRenderRecord(record: RenderCancellationRecord): void {
    this.renderCancellationRecords.delete(record.renderId);
    if (this.activeRenderRecord === record) {
      this.activeRenderRecord = undefined;
    }
  }

  private async enqueueOperation<T>(operation: () => Promise<T>, signal = neverAbortedSignal): Promise<T> {
    if (!this.operationAdmissionOpen) {
      throw new Error('Runtime worker is closing');
    }
    const previous = this.operationTail;
    const next = Promise.withResolvers<void>();
    this.operationTail = next.promise;
    await previous;
    this.operationSignal = signal;
    try {
      return await operation();
    } finally {
      this.operationSignal = undefined;
      this.pendingNativeHandle = undefined;
      // Operations are serialized, so an operation boundary is the one point
      // where every surviving reference to a native handle lives in a worker
      // field. Anything else the operation created is garbage.
      this.disposeUnreachableNativeHandles();
      next.resolve();
    }
  }

  private async runQueuedCommand(record: RenderCancellationRecord, operation: () => Promise<void>): Promise<void> {
    try {
      await this.enqueueOperation(async () => {
        if (record.controller.signal.aborted || !this.renderCancellationRecords.has(record.renderId)) {
          return;
        }
        await operation();
      }, record.controller.signal);
    } catch (error) {
      if (!this.operationAdmissionOpen || record.controller.signal.aborted || isRenderAbortedError(error)) {
        return;
      }
      this.onError?.({ issues: this.errorToRuntimeIssues(error), renderId: record.renderId });
      this.pushState('error', record);
      this.releaseRenderRecord(record);
    }
  }

  private failUnscheduledPreview(record: RenderCancellationRecord, message: string): void {
    this.onError?.({
      renderId: record.renderId,
      issues: [{ message, code: 'RUNTIME', type: 'runtime', severity: 'error' }],
    });
    this.pushState('error', record);
    this.releaseRenderRecord(record);
  }

  private errorToRuntimeIssues(error: unknown): KernelIssue[] {
    if (
      error !== null &&
      typeof error === 'object' &&
      'issues' in error &&
      Array.isArray((error as { readonly issues?: unknown }).issues)
    ) {
      return (error as { readonly issues: KernelIssue[] }).issues;
    }
    return [
      {
        message: error instanceof Error ? error.message : String(error),
        code: 'RUNTIME',
        type: 'runtime',
        severity: 'error',
      },
    ];
  }

  private prepareUnobservedFileSystem(invalidatePublishedArtifact: boolean): void {
    if (this.fileSystem?.watch) {
      return;
    }
    this.clearVolatileFileCaches();
    if (invalidatePublishedArtifact) {
      this.invalidatePublishedArtifactState();
    }
  }

  private clearVolatileFileCaches(): void {
    this.fileHashCache.clear();
    this.fileContentCache.clear();
    this.bundleResultCache.clear();
    clearExecuteCache();
    this.onVolatileFileCachesCleared();
  }

  private invalidatePublishedArtifactState(): void {
    this.currentPublishedRender = undefined;
    this.pendingNativeHandle = undefined;
    this.onPublishedArtifactInvalidated();
  }

  /** Stop admission, drain accepted work, and clean up exactly once. */
  // oxlint-disable-next-line promise-function-async -- repeated cleanup calls must receive the same drain promise by identity.
  public cleanup(): Promise<void> {
    if (this.cleanupPromise) {
      return this.cleanupPromise;
    }
    this.operationAdmissionOpen = false;
    if (this.activeRenderRecord) {
      this.abortRenderRecord(this.activeRenderRecord, 'superseded');
    }
    clearTimeout(this.paramDebounceTimer);
    this.paramDebounceTimer = undefined;
    this.cleanupPromise = this.drainAndCleanup();
    return this.cleanupPromise;
  }

  private async drainAndCleanup(): Promise<void> {
    await this.watchReconciliationTail;
    await this.operationTail;
    await this.performCleanup();
  }

  /** Clean up worker state, native handles, telemetry collector, and filesystem proxy. */
  private async performCleanup(): Promise<void> {
    this.watchUnsubscribe?.();
    this.watchUnsubscribe = undefined;
    this.assetHashCache.clear();
    this.currentPreviewWatchPaths.clear();
    this.currentPreviewMiddlewarePaths.clear();
    this.watchedPaths.clear();
    this.pendingNativeHandle = undefined;
    this.currentPublishedRender = undefined;
    this.currentFile = undefined;
    // Nothing references the handles now — release them before onCleanup tears
    // down the kernel that owns their memory.
    this.disposeUnreachableNativeHandles();
    this.telemetryCollector?.dispose();
    this.telemetryCollector = undefined;
    this.fileSystem?.dispose();
    this.fileSystem = undefined;

    for (const transcoder of this.loadedTranscoders.values()) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- Sequential to preserve cleanup order
        await transcoder.definition.cleanup?.(transcoder.context);
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
  public async getParameters(file: RuntimeFileLocator): Promise<GetParametersResult> {
    return this.enqueueOperation(async () => {
      this.prepareUnobservedFileSystem(false);
      return this.getParametersInLane(file);
    });
  }

  private async getParametersInLane(
    file: RuntimeFileLocator,
    dependencyContext?: DependencyResolutionContext,
    owner?: OperationOwner,
  ): Promise<GetParametersResult> {
    const operationOwner = owner ?? (await this.createOperationOwner(file, 'request'));
    const entryPath = resolveVirtualPath(joinPath(operationOwner.file.path, operationOwner.file.filename));
    const start = performance.now();

    const input: GetParametersInput = {
      entryPath,
    };

    const resolvedArray = this.getMiddleware().filter(
      ({ enabled, middleware }) =>
        enabled && (Boolean(middleware.wrapGetParameters) || this.middlewareOnlyDeclaresDependencies(middleware)),
    );

    this.onProgress?.('resolvingDeps');
    const depsSpan = this.tracer.startSpan('kernel.resolve-deps', {
      phase: 'resolvingDeps',
    });
    const dependencies = await this.computeDependencies({
      resolvedMiddleware: resolvedArray,
      dependencyContext,
      owner: operationOwner,
    });
    const dependencyHash = await this.computeDependencyHash(dependencies);
    depsSpan.end();

    const runtimes = new Map<string, KernelMiddlewareRuntime>();
    for (const { middleware, options: middlewareOptions, enabled, id } of resolvedArray) {
      if (enabled && middleware.wrapGetParameters) {
        runtimes.set(
          id,
          createMiddlewareRuntime({
            signal: this.operationSignal ?? neverAbortedSignal,
            onLog: this.onLog,
            middlewareName: middleware.name,
            filesystem: this.filesystem,
            dependencies,
            dependencyHash,
            stateSchema: middleware.stateSchema,
            options: middlewareOptions,
            logger: this.getMiddlewareLogger(id, middleware.name),
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
      const { middleware, enabled, id } = resolvedArray[index]!;
      if (enabled && middleware.wrapGetParameters) {
        const inner = chain;
        const runtime = runtimes.get(id)!;
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
  public async createGeometry(entry: {
    file: RuntimeFileLocator;
    parameters: Record<string, unknown>;
    options?: Record<string, unknown>;
    content?: RuntimeContentInput;
  }): Promise<HashedGeometryResult> {
    return this.enqueueOperation(async () => {
      this.prepareUnobservedFileSystem(true);
      return this.createGeometryInLane(entry);
    });
  }

  private async createGeometryInLane(
    entry: {
      file: RuntimeFileLocator;
      parameters: Record<string, unknown>;
      options?: Record<string, unknown>;
      content?: RuntimeContentInput;
    },
    dependencyContext?: DependencyResolutionContext,
    owner?: OperationOwner,
  ): Promise<HashedGeometryResult> {
    const { artifact } = await this.materializeRender(entry, {
      dependencyContext,
      owner,
      publish: true,
    });
    const { result } = artifact;
    if (!result.success) {
      return result;
    }
    if (result.data === undefined) {
      // Display-path invariant: a publish materialization either fills data via
      // the mesh phase or fails inside it — this branch is defensive.
      return createKernelError([
        {
          message: 'Kernel produced no display artifact for a publish render.',
          code: 'KERNEL_CAPABILITY_MISSING',
          type: 'kernel',
          severity: 'error',
        },
      ]);
    }
    return { ...result, data: result.data };
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
   * @param content - Optional request-scoped content input.
   * @param signal - Per-call cancellation, observed at the operation's existing abort checkpoints.
   * @returns The exported geometry.
   */
  // oxlint-disable-next-line max-params -- mirrors the fixed `export` protocol call shape (format, options, content, signal).
  public async exportGeometry(
    format: FileExtension,
    options?: Record<string, unknown>,
    content?: RuntimeContentInput,
    signal?: AbortSignal,
  ): Promise<ExportGeometryResult> {
    return this.enqueueOperation(async () => this.exportGeometryInLane(format, options, content), signal);
  }

  private async exportGeometryInLane(
    format: FileExtension,
    options?: Record<string, unknown>,
    content?: RuntimeContentInput,
  ): Promise<ExportGeometryResult> {
    const exportSpan = this.tracer.startSpan('kernel.export', {
      format,
    });

    const currentRender = this.currentPublishedRender;
    if (!currentRender) {
      exportSpan.end();
      return this.createExportRenderIdentityMissingResult();
    }

    const plan = this.createExportRequestPlan(currentRender.owner, { format, options, content });
    if (!plan.success) {
      exportSpan.end();
      return plan.result;
    }

    const activeMiddleware = this.getOuterExportExecutionList(plan);

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
   * @param signal - Per-call cancellation, observed at the operation's existing abort checkpoints.
   * @returns Exported files or structured runtime issues.
   */
  public async exportModel(request: RuntimeExportModelArgs, signal?: AbortSignal): Promise<ExportGeometryResult> {
    return this.enqueueOperation(async () => this.exportModelInLane(request), signal);
  }

  private async exportModelInLane(request: RuntimeExportModelArgs): Promise<ExportGeometryResult> {
    this.prepareUnobservedFileSystem(false);
    const exportSpan = this.tracer.startSpan('kernel.export-model', {
      format: request.format,
      file: request.file.filename,
    });

    try {
      return finalizeExportArtifactSet(
        await (async (): Promise<ExportGeometryResult> => {
          const dependencyContext: DependencyResolutionContext = {};
          if (request.stage) {
            await this.writeFilesAndInvalidate(request.stage);
          }

          const owner = await this.createOperationOwner(request.file, 'request');

          const plan = this.createExportRequestPlan(owner, {
            format: request.format,
            options: request.exportOptions,
            content: request.content,
          });
          if (!plan.success) {
            return plan.result;
          }

          const parametersResult = await this.getParametersInLane(request.file, dependencyContext, owner);
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
          const sourceExport =
            plan.route.kind === 'direct'
              ? { format: plan.route.targetFormat, options: plan.route.options }
              : { format: plan.route.sourceFormat, options: plan.route.sourceOptions };
          const createOptionsResult = this.resolveCreateOptions(
            renderOptionsResult.options,
            sourceExport.options,
            owner,
          );
          if (!createOptionsResult.success) {
            return createKernelError(createOptionsResult.issues);
          }
          const resolvedArray = this.getExportExecutionList(plan);
          const dependencies = await this.computeDependencies({
            parameters: mergedParameters,
            renderOptions: renderOptionsResult.options,
            content: plan.route.content,
            exportDependency: plan.dependency,
            resolvedMiddleware: resolvedArray,
            dependencyContext,
            owner,
          });
          const renderIdentity = this.createRenderIdentity({
            file: request.file,
            parameters: mergedParameters,
            renderOptions: renderOptionsResult.options,
            content: plan.route.content,
            dependencies,
            dependencyHash: await this.computeDependencyHash(dependencies),
            owner,
          });

          const activeMiddleware = this.getOuterExportExecutionList(plan);
          const renderExactRequest = async (
            handlerInput: MiddlewareExportGeometryRequest,
          ): Promise<ExportGeometryResult> => {
            let renderArtifact = this.getPublishedRenderForIdentity(renderIdentity);
            if (!renderArtifact) {
              const materialized = await this.materializeRender(
                {
                  file: request.file,
                  parameters: mergedParameters,
                  options: renderOptionsResult.options,
                  content: plan.route.content,
                  export: {
                    ...sourceExport,
                    dependency: plan.dependency,
                  },
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
            return renderExactRequest(plan.input);
          }

          return this.runExportMiddlewarePipeline({
            plan,
            renderIdentity,
            renderArtifact: this.getPublishedRenderForIdentity(renderIdentity),
            activeMiddleware,
            onCacheMiss: renderExactRequest,
          });
        })(),
      );
    } finally {
      await this.reconcileObservedPaths();
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
   * fields wired by the dispatcher, threading the opaque preview identity for
   * frame-level correlation. This method remains a request-scoped helper for
   * non-autonomous code paths (CLI, benchmarks) that drive a single render-and-await flow:
   * like {@link KernelWorker.exportModel} it admits no preview, publishes no lifecycle,
   * and never touches the active preview record or its watch candidate.
   *
   * @param input - Render input containing file, parameters, and options.
   * @returns The computed geometry.
   */
  public async render(input: {
    file: RuntimeFileLocator;
    parameters: Record<string, unknown>;
    options?: Record<string, unknown>;
  }): Promise<HashedGeometryResult> {
    const file = this.canonicalGeometryFile(input.file);
    return this.enqueueOperation(async () => this.renderInLane({ ...input, file }));
  }

  private async renderInLane(input: {
    file: RuntimeFileLocator;
    parameters: Record<string, unknown>;
    options?: Record<string, unknown>;
  }): Promise<HashedGeometryResult> {
    this.prepareUnobservedFileSystem(true);
    this.tracer.reset();
    const renderSpan = this.tracer.startSpan('kernel.render', {
      file: input.file.filename,
    });
    const dependencyContext: DependencyResolutionContext = {};
    const file = this.canonicalGeometryFile(input.file);
    this.setActiveFile(file);
    const owner = await this.createOperationOwner(file, 'render-artifact');

    try {
      const parametersResult = await this.getParametersInLane(file, dependencyContext, owner);

      let mergedParameters = input.parameters;
      if (parametersResult.success) {
        const extracted = parametersResult.data as {
          defaultParameters?: Record<string, unknown>;
        };
        if (extracted.defaultParameters) {
          mergedParameters = deepmerge(extracted.defaultParameters, input.parameters);
        }
      }

      const result = await this.createGeometryInLane(
        {
          file,
          parameters: mergedParameters,
          options: input.options,
        },
        dependencyContext,
        owner,
      );

      return result;
    } finally {
      await this.reconcileObservedPaths();
      renderSpan.end();
    }
  }

  /**
   * Selectively invalidate file caches for changed paths.
   * Called by the kernel machine before render operations when files have changed.
   *
   * @param changedPaths - Paths within the runtime filesystem that changed.
   */
  public async notifyFileChanged(changedPaths: readonly string[]): Promise<void> {
    const paths = [...new Set(changedPaths.map((path) => resolveVirtualPath(path)))];
    const record = this.shouldScheduleExactPreview(paths) ? this.createAutonomousPreviewRecord() : undefined;
    try {
      await this.enqueueOperation(async () => this.routeExactChangedPaths(paths, record), record?.controller.signal);
    } catch (error) {
      // Admission can close between the record and the lane it never reached.
      if (record) {
        this.abortRenderRecord(record, 'superseded');
      }
      throw error;
    }
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
    return new Map(this.currentPreviewMiddlewarePaths);
  }

  private async reconcileWatchSet(
    desiredPaths: Map<string, number>,
    candidate?: typeof this.previewWatchCandidate,
  ): Promise<boolean> {
    const desired = new Map(
      [...desiredPaths].filter(([path]) => path !== '/.tau/cache' && !path.startsWith('/.tau/cache/')),
    );
    const desiredSet = new Set(desired.keys());
    if (setsEqual(this.watchedPaths, desiredSet)) {
      if (candidate && candidate.generation === this.currentRenderGeneration()) {
        this.currentPreviewWatchPaths = new Map(candidate.paths);
        this.currentPreviewMiddlewarePaths = new Map(candidate.middlewarePaths);
      }
      return true;
    }

    if (!this.fileSystem?.watch || desired.size === 0) {
      const previous = this.watchUnsubscribe;
      this.watchedPaths = desiredSet;
      this.watchUnsubscribe = undefined;
      if (candidate && candidate.generation === this.currentRenderGeneration()) {
        this.currentPreviewWatchPaths = new Map(candidate.paths);
        this.currentPreviewMiddlewarePaths = new Map(candidate.middlewarePaths);
      }
      previous?.();
      return true;
    }

    const oldPaths = this.watchedPaths;
    const addedPaths = [...desiredSet].filter((path) => !oldPaths.has(path));
    const addedSet = new Set(addedPaths);
    let dirty = false;
    const handler = (event: WatchEvent): void => {
      if (event.type === 'reset') {
        dirty = true;
      } else if (this.exactWatchEventPaths(event).some((path) => addedSet.has(path))) {
        dirty = true;
      }
      void this.routeWatchEvent(event);
    };
    const replacement = this.fileSystem.watchReady
      ? this.fileSystem.watchReady({ paths: [...desiredSet], recursive: false, excludes: ['/.tau/cache/**'] }, handler)
      : {
          unsubscribe: this.fileSystem.watch(
            { paths: [...desiredSet], recursive: false, excludes: ['/.tau/cache/**'] },
            handler,
          ),
          ready: Promise.resolve(),
        };

    try {
      await replacement.ready;
      const validations = await Promise.all(
        addedPaths.map(async (path) => {
          const expected = this.fileHashCache.get(path);
          if (expected === undefined) {
            return true;
          }
          try {
            const bytes = await this.filesystem.readFile(path);
            return expected !== 'missing' && (await this.hashContent(bytes)) === expected;
          } catch (error) {
            if (!isNotFoundError(error)) {
              throw error;
            }
            return expected === 'missing';
          }
        }),
      );
      dirty ||= validations.some((valid) => !valid);
      if (candidate && candidate.generation !== this.currentRenderGeneration()) {
        replacement.unsubscribe();
        return false;
      }
      if (dirty) {
        replacement.unsubscribe();
        return false;
      }

      const previous = this.watchUnsubscribe;
      this.watchUnsubscribe = replacement.unsubscribe;
      this.watchedPaths = desiredSet;
      if (candidate) {
        this.currentPreviewWatchPaths = new Map(candidate.paths);
        this.currentPreviewMiddlewarePaths = new Map(candidate.middlewarePaths);
      }
      previous?.();
      return true;
    } catch (error) {
      replacement.unsubscribe();
      throw error;
    }
  }

  /**
   * Load the bundler definition from its worker-owned plugin implementation.
   * Context initialization is deferred until first use via ensureBundlerContext(),
   * because the active entry is not known until setActiveFile() runs.
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
      this.warnOnRuntimeVersionMismatch('bundler', bundlerEntry);
      const definition =
        preloadedDefinition ?? (await resolveRuntimePluginDefinition<BundlerDefinition>('bundler', bundlerEntry));

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
      file: RuntimeFileLocator;
      parameters: Record<string, unknown>;
      options?: Record<string, unknown>;
      content?: RuntimeContentInput;
      export?: {
        format: FileExtension;
        options: Record<string, unknown>;
        dependency: ExportDependency;
      };
    },
    options: {
      dependencyContext?: DependencyResolutionContext;
      owner?: OperationOwner;
      publish: boolean;
    },
  ): Promise<{ artifact: MaterializedRender }> {
    const owner =
      options.owner ?? (await this.createOperationOwner(entry.file, options.publish ? 'render-artifact' : 'request'));
    if (options.publish) {
      this.setActiveFile(owner.file);
    }
    const ownerFilePath = resolveVirtualPath(joinPath(owner.file.path, owner.file.filename));
    const start = performance.now();

    const renderOptionsResult = this.validateRenderOptions(entry.options, owner);
    if (!renderOptionsResult.success) {
      return {
        artifact: {
          identity: this.createRenderIdentity({
            file: entry.file,
            parameters: entry.parameters,
            renderOptions: entry.options ?? {},
            content: {},
            dependencies: [],
            dependencyHash: '',
            owner,
          }),
          owner,
          result: createKernelError(renderOptionsResult.issues),
        },
      };
    }

    const createOptionsResult = this.resolveCreateOptions(renderOptionsResult.options, entry.export?.options, owner);
    if (!createOptionsResult.success) {
      return {
        artifact: {
          identity: this.createRenderIdentity({
            file: entry.file,
            parameters: entry.parameters,
            renderOptions: renderOptionsResult.options,
            content: {},
            dependencies: [],
            dependencyHash: '',
            owner,
          }),
          owner,
          result: createKernelError(createOptionsResult.issues),
        },
      };
    }

    const renderContentResult:
      | { success: true; content: RuntimeContentInput }
      | { success: false; issues: KernelIssue[] } = entry.export
      ? { success: true, content: entry.content ?? {} }
      : this.validateRuntimeContent('render', this.getRenderContentKeys(owner), entry.content);
    if (!renderContentResult.success) {
      return {
        artifact: {
          identity: this.createRenderIdentity({
            file: entry.file,
            parameters: entry.parameters,
            renderOptions: renderOptionsResult.options,
            content: {},
            dependencies: [],
            dependencyHash: '',
            owner,
          }),
          owner,
          result: createKernelError(renderContentResult.issues),
        },
      };
    }

    const input: NativeBuildInput = {
      entryPath: ownerFilePath,
      parameters: entry.parameters,
      ...createOptionsResult.input,
    };

    const createMiddleware = this.getCreateExecutionList(owner, renderContentResult.content, Boolean(entry.export));
    const meshMiddleware =
      options.publish && this.kernelHasMeshPhaseForOwner(owner)
        ? this.getMeshExecutionList(owner, renderContentResult.content)
        : [];
    const resolvedArray = this.mergeExecutionLists(createMiddleware, meshMiddleware);

    const geoDepsSpan = this.tracer.startSpan('kernel.resolve-deps', {
      phase: 'resolvingDeps',
    });
    const dependencies = await this.computeDependencies({
      parameters: entry.parameters,
      renderOptions: renderOptionsResult.options,
      content: renderContentResult.content,
      exportDependency: entry.export?.dependency,
      resolvedMiddleware: resolvedArray,
      dependencyContext: options.dependencyContext,
      owner,
    });
    const dependencyHash = await this.computeDependencyHash(dependencies);
    const nativeHandleDependencies = await this.computeDependencies({
      parameters: entry.parameters,
      resolvedMiddleware: createMiddleware,
      dependencyContext: options.dependencyContext,
      owner,
    });
    if ('options' in createOptionsResult.input) {
      nativeHandleDependencies.push({
        type: 'option',
        key: 'native-build-options',
        value: createOptionsResult.input.options,
      });
    }
    const nativeHandleKey = await this.computeDependencyHash(nativeHandleDependencies);
    geoDepsSpan.end();

    const runtimes = new Map<string, KernelMiddlewareRuntime>();
    for (const { middleware, options: middlewareOptions, enabled, id } of createMiddleware) {
      if (enabled && middleware.wrapCreateGeometry) {
        runtimes.set(
          id,
          createMiddlewareRuntime({
            signal: this.operationSignal ?? neverAbortedSignal,
            onLog: this.onLog,
            middlewareName: middleware.name,
            filesystem: this.filesystem,
            dependencies: nativeHandleDependencies,
            dependencyHash: nativeHandleKey,
            stateSchema: middleware.stateSchema,
            options: middlewareOptions,
            logger: this.getMiddlewareLogger(id, middleware.name),
          }),
        );
      }
    }

    this.onProgress?.('computingGeometry');
    const { tracer } = this;
    let chain: CreateGeometryHandler = named('kernelHandler', async (handlerInput: MiddlewareCreateGeometryRequest) => {
      const computeSpan = tracer.startSpan('kernel.compute');
      const createSchema = owner.binding?.kernelId
        ? this.kernelCreateOptionsZodSchemaMap.get(owner.binding.kernelId)
        : undefined;
      const kernelInput: NativeBuildInput = {
        entryPath: handlerInput.entryPath,
        parameters: handlerInput.parameters,
        ...(createSchema
          ? {
              options:
                handlerInput.options ??
                ('options' in createOptionsResult.input ? createOptionsResult.input.options : {}),
            }
          : {}),
      };
      const result = await this.onCreateGeometryForOwner(owner, kernelInput, this.createRuntime());
      computeSpan.end();
      return { ...result, [nativeBuildInputSymbol]: kernelInput };
    });

    for (let index = createMiddleware.length - 1; index >= 0; index--) {
      const { middleware, enabled, id } = createMiddleware[index]!;
      if (enabled && middleware.wrapCreateGeometry) {
        const inner = chain;
        const runtime = runtimes.get(id)!;
        const middlewareName = middleware.name;
        const wrapHook = middleware.wrapCreateGeometry;

        chain = named(`middleware(${middlewareName})`, async (handlerInput: MiddlewareCreateGeometryRequest) => {
          const span = tracer.startSpan(`middleware.wrap(${middlewareName})`, {
            middleware: middlewareName,
          });
          try {
            const result = await wrapHook(
              this.withProviderRuntimeContent(
                handlerInput,
                renderContentResult.content,
                middleware.content?.render ?? [],
              ),
              inner,
              runtime,
            );
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
    const nativeBuildInput = (internalResult as CreateGeometryResult & NativeBuildInputCarrier)[nativeBuildInputSymbol];
    const identity = this.createRenderIdentity({
      file: entry.file,
      parameters: entry.parameters,
      renderOptions: renderOptionsResult.options,
      content: renderContentResult.content,
      dependencies,
      dependencyHash,
      nativeHandleKey,
      ...(nativeBuildInput ? { nativeBuildInput } : {}),
      owner,
    });

    // Dependency discovery defines the filesystem snapshot represented by a
    // preview. Observe and revalidate every newly-added path before binding or
    // publishing its native/display state. A dirty or superseded replacement
    // leaves the previous complete watch live and forces the queued change to
    // produce a fresh render instead of briefly publishing stale geometry.
    const previewCandidate = this.previewWatchCandidate;
    if (options.publish && previewCandidate?.coherent) {
      const committed = await this.reconcileObservedPaths(previewCandidate);
      if (!committed) {
        previewCandidate.watchCommitRejected = true;
        throw new RenderAbortedError();
      }
    }

    // Bind native-handle slots before the mesh phase so the mesh boundary can
    // materialize the handle through the same live/serialized/reheat machinery
    // exports use.
    const serializedNativeHandle = internalResult.success ? internalResult.serializedNativeHandle : undefined;
    const { liveNativeHandleSlot, serializedNativeHandleSlot } = this.bindNativeHandleSlots({
      identity,
      success: internalResult.success,
      serializedNativeHandle,
    });

    // Mesh phase — display path only. Kernels that defer their display artifact
    // (BRep kernels) return no geometry from createGeometry; export-scoped
    // materializations (publish: false) skip tessellation entirely.
    let displayResult = internalResult;
    if (options.publish && internalResult.success && internalResult.data === undefined) {
      displayResult = await this.runMeshPhase({
        owner,
        identity,
        renderOptions: renderOptionsResult.options,
        content: renderContentResult.content,
        resolvedMiddleware: resolvedArray,
        createResult: internalResult,
        renderArtifact: {
          identity,
          owner,
          result: {
            success: true,
            data: undefined,
            issues: internalResult.issues,
            serializedNativeHandle: internalResult.serializedNativeHandle,
          },
          liveNativeHandleSlot,
          serializedNativeHandleSlot,
        },
      });
    }

    this.onProgress?.('postProcessing');
    const { [nativeBuildInputSymbol]: _nativeBuildInput, ...publicDisplayResult } =
      displayResult as CreateGeometryResult & NativeBuildInputCarrier;
    // One render request produces one public geometry artifact.
    const result: MaterializedRenderResult = publicDisplayResult.success
      ? {
          ...publicDisplayResult,
          data:
            publicDisplayResult.data === undefined
              ? undefined
              : {
                  ...publicDisplayResult.data,
                  hash: dependencyHash,
                },
        }
      : publicDisplayResult;

    const artifact: MaterializedRender = {
      identity,
      owner,
      result,
      liveNativeHandleSlot,
      serializedNativeHandleSlot,
    };
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

  /**
   * Take ownership of the handle `createGeometry` just produced.
   *
   * Ownership is what makes the release deterministic: the worker frees the
   * handle once no field references it, instead of dropping the reference and
   * waiting for a finalizer the kernel may not have. Pass `owner` for kernels
   * that implement `disposeNativeHandle` — an unowned handle is never released.
   *
   * @param nativeHandle - Opaque handle returned by the kernel.
   * @param owner - Owner whose kernel binding can release the handle.
   */
  protected captureNativeHandle(nativeHandle: unknown, owner?: OperationOwner): void {
    this.pendingNativeHandle = nativeHandle;
    this.ownNativeHandle(nativeHandle, owner);
  }

  private ownNativeHandle(nativeHandle: unknown, owner: OperationOwner | undefined): void {
    if (owner === undefined || nativeHandle === undefined || nativeHandle === null) {
      return;
    }

    this.ownedNativeHandles.set(nativeHandle, owner);
  }

  /**
   * Release every owned native handle no worker field still references.
   *
   * A rebuild replaces the published handle with a new one; without this the
   * replaced geometry stays allocated for the life of the worker, and a WASM
   * heap never shrinks, so an agentic rebuild loop ratchets toward OOM. Handles
   * are compared by identity, so a handle reused across builds (same object
   * still published) is retained, and each replaced handle is released once.
   */
  private disposeUnreachableNativeHandles(): void {
    if (this.ownedNativeHandles.size === 0) {
      return;
    }

    const retained = new Set<unknown>([
      this.pendingNativeHandle,
      this.currentPublishedRender?.liveNativeHandleSlot?.handle,
    ]);

    // Built on first release only: most operation boundaries drop nothing.
    let runtime: KernelRuntime | undefined;
    for (const [handle, owner] of this.ownedNativeHandles) {
      if (retained.has(handle)) {
        continue;
      }

      this.ownedNativeHandles.delete(handle);
      try {
        runtime ??= this.createRuntime();
        this.disposeNativeHandleForOwner(owner, handle, runtime);
      } catch (error) {
        this.logger.warn('Native-handle disposal failed', {
          data: { error: error instanceof Error ? error.message : String(error) },
        });
      }
    }
  }

  protected createRenderIdentity(input: {
    file: RuntimeFileLocator;
    parameters: Record<string, unknown>;
    renderOptions: Record<string, unknown>;
    content: RuntimeContentInput;
    nativeBuildInput?: NativeBuildInput;
    dependencies: Dependency[];
    dependencyHash: string;
    nativeHandleKey?: string;
    owner: OperationOwner;
  }): RenderIdentity {
    return {
      file: input.file,
      selectedKernelId: input.owner.binding?.kernelId,
      selectedKernelVersion: input.owner.binding?.kernelVersion,
      parameters: input.parameters,
      renderOptions: input.renderOptions,
      content: input.content,
      ...(input.nativeBuildInput ? { nativeBuildInput: input.nativeBuildInput } : {}),
      dependencies: input.dependencies,
      dependencyHash: input.dependencyHash,
      nativeHandleKey: input.nativeHandleKey ?? input.dependencyHash,
    };
  }

  protected bindNativeHandleSlots(input: {
    readonly identity: RenderIdentity;
    readonly success: boolean;
    readonly serializedNativeHandle: unknown;
  }): {
    liveNativeHandleSlot?: NativeHandleSlot;
    serializedNativeHandleSlot?: SerializedNativeHandleSlot;
  } {
    const { identity, success, serializedNativeHandle } = input;
    const identityKey = createNativeHandleIdentityKey(identity);
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

    const serializedNativeHandleSlot =
      success && serializedNativeHandle !== undefined && serializedNativeHandle !== null
        ? {
            identityKey,
            kernelId: identity.selectedKernelId,
            kernelVersion: identity.selectedKernelVersion,
            serializedNativeHandle,
          }
        : undefined;

    return { liveNativeHandleSlot, serializedNativeHandleSlot };
  }

  protected publishCurrentRender(artifact: MaterializedRender): void {
    const candidate = this.previewWatchCandidate;
    if (candidate && candidate.generation !== this.renderGeneration) {
      return;
    }
    if (this.currentFile) {
      const currentPath = resolveVirtualPath(joinPath(this.currentFile.path, this.currentFile.filename));
      const artifactPath = resolveVirtualPath(joinPath(artifact.identity.file.path, artifact.identity.file.filename));
      if (currentPath !== artifactPath) {
        return;
      }
    }
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
    artifact: MaterializedRender,
  ): NativeHandleSlot | undefined {
    const identityKey = createNativeHandleIdentityKey(identity);
    const artifactSlot = artifact.liveNativeHandleSlot;
    if (artifactSlot?.identityKey === identityKey) {
      return artifactSlot;
    }
    return undefined;
  }

  protected getSerializedNativeHandleSlotForIdentity(
    identity: RenderIdentity,
    artifact: MaterializedRender,
  ): SerializedNativeHandleSlot | undefined {
    const identityKey = createNativeHandleIdentityKey(identity);
    const artifactSlot = artifact.serializedNativeHandleSlot;
    if (artifactSlot?.identityKey === identityKey) {
      return artifactSlot;
    }
    return undefined;
  }

  protected clearLiveNativeHandleSlot(artifact: MaterializedRender, slot: NativeHandleSlot): void {
    if (artifact.liveNativeHandleSlot === slot) {
      artifact.liveNativeHandleSlot = undefined;
    }
  }

  protected clearSerializedNativeHandleSlot(artifact: MaterializedRender, slot: SerializedNativeHandleSlot): void {
    if (artifact.serializedNativeHandleSlot === slot) {
      artifact.serializedNativeHandleSlot = undefined;
    }
  }

  protected configureRuntimePlugins(options: KernelWorkerOptions): void {
    this.assertUniquePluginIds('middleware', options.middleware ?? []);
    this.assertUniquePluginIds('bundler', options.bundlers ?? []);
    this.assertUniquePluginIds('transcoder', options.transcoders ?? []);
    this.manifestKernelPlugins = options.kernels ?? [];
    this.middlewarePlugins = options.middleware ?? [];
    this.bundlerPlugins = options.bundlers ?? [];
    this.transcoderPlugins = options.transcoders ?? [];
  }

  protected warnOnRuntimeVersionMismatch(
    kind: 'kernel' | 'middleware' | 'bundler' | 'transcoder',
    plugin: RuntimePluginDeclaration & { readonly id: string },
  ): void {
    if (!plugin.peerRuntimeVersion || plugin.peerRuntimeVersion === packageVersion) {
      return;
    }
    const diagnostic: RuntimePluginVersionMismatchDiagnostic = {
      code: 'RUNTIME_PLUGIN_VERSION_MISMATCH',
      kind,
      pluginId: plugin.id,
      peerRuntimeVersion: plugin.peerRuntimeVersion,
      runtimeVersion: packageVersion,
    };
    this.logger.warn(
      `${kind} plugin "${plugin.id}" declares runtime ${plugin.peerRuntimeVersion}; current runtime is ${packageVersion}.`,
      { data: diagnostic },
    );
  }

  protected assertUniquePluginIds(category: string, entries: ReadonlyArray<{ readonly id: string }>): void {
    const ids = new Set<string>();
    for (const entry of entries) {
      if (ids.has(entry.id)) {
        throw new Error(`Duplicate ${category} id: ${entry.id}`);
      }
      ids.add(entry.id);
    }
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
   * @param _changedPaths - Paths within the runtime filesystem that changed.
   */
  protected onFileChanged(_changedPaths: readonly string[]): void {
    // Default: no-op. KernelRuntimeWorker overrides to clear selectionCache.
  }

  /** Clear subclass caches whose values derive from project file bytes. */
  protected onVolatileFileCachesCleared(): void {
    // Default: no-op. KernelRuntimeWorker clears kernel-selection caches.
  }

  /** Clear subclass state that identifies the currently published artifact. */
  protected onPublishedArtifactInvalidated(): void {
    // Default: no-op. KernelRuntimeWorker clears the visible active kernel.
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
    input: { entryPath: string },
    _runtime: KernelRuntime,
  ): Promise<KernelBinding | undefined> {
    const kernelId = this.getActiveKernelId();
    const kernelVersion = this.getActiveKernelVersion();
    return kernelId && kernelVersion
      ? {
          kernelId,
          kernelVersion,
          entryPath: input.entryPath,
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
    input: NativeBuildInput,
    runtime: KernelRuntime,
  ): Promise<CreateGeometryResult> {
    return this.onCreateGeometry(input, runtime);
  }

  /**
   * Whether the owner's kernel implements the optional `meshGeometry` display phase.
   * Base workers have no kernel registry, so the display path must come from
   * inline `createGeometry` geometry.
   */
  protected kernelHasMeshPhaseForOwner(_owner: OperationOwner): boolean {
    return false;
  }

  /**
   * Run the owner's kernel `meshGeometry` phase. Only called on the display path,
   * after {@link kernelHasMeshPhaseForOwner} returned true.
   */
  protected async onMeshGeometryForOwner(
    _owner: OperationOwner,
    _input: { nativeHandle: unknown; options: Record<string, unknown>; content?: RuntimeContentInput },
    _runtime: KernelRuntime,
  ): Promise<MeshGeometryResult> {
    return createKernelError([
      {
        message: 'meshGeometry is not supported by this worker.',
        code: 'KERNEL_CAPABILITY_MISSING',
        type: 'kernel',
        severity: 'error',
      },
    ]);
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

  /** Release a dropped native handle through the kernel that created it. */
  protected disposeNativeHandleForOwner(_owner: OperationOwner, _nativeHandle: unknown, _runtime: KernelRuntime): void {
    // Workers without kernel-managed native memory have nothing to release.
  }

  /**
   * Verify the declared implementation assets before loading a plugin.
   *
   * @param pluginId - Stable plugin identifier used in diagnostics.
   * @param assets - Declared assets and their expected SHA-256 digests.
   */
  protected async verifyImplementationAssets(
    pluginId: string,
    assets: readonly RuntimeImplementationAsset[],
  ): Promise<void> {
    const ids = new Set<string>();
    for (const asset of assets) {
      if (ids.has(asset.id)) {
        throw new Error(`Duplicate implementation asset id for ${pluginId}: ${asset.id}`);
      }
      ids.add(asset.id);
      if (!/^[0-9a-f]{64}$/u.test(asset.sha256)) {
        throw new Error(`Invalid SHA-256 digest for ${pluginId}:${asset.id}`);
      }
    }

    for (const asset of assets) {
      const cached = this.assetHashCache.get(asset.url);
      if (cached === asset.sha256) {
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- verification errors must identify the exact declared asset
      const response = await fetch(asset.url);
      if (!response.ok) {
        throw new Error(`Failed to fetch implementation asset ${pluginId}:${asset.id} (${response.status})`);
      }
      // oxlint-disable-next-line no-await-in-loop -- verification errors must identify the exact declared asset
      const actual = await sha256Bytes(new Uint8Array(await response.arrayBuffer()));
      if (actual !== asset.sha256) {
        throw new Error(`Implementation asset digest mismatch for ${pluginId}:${asset.id}`);
      }
      this.assetHashCache.set(asset.url, actual);
    }
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
  protected abstract onCreateGeometry(input: NativeBuildInput, runtime: KernelRuntime): Promise<CreateGeometryResult>;

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
   * Discover all file dependencies for the given entry path.
   * Used for cache key computation to include all imported/included files.
   *
   * @param input - Input containing file path and project root
   * @param runtime - Runtime services (filesystem, logger)
   * @returns Array of absolute file paths that are dependencies (including the entry path)
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

  /**
   * Display-path mesh phase: produce the viewer artifact from the native handle
   * when `createGeometry` deferred it. Runs the `wrapMeshGeometry` middleware
   * pipeline (display-mesh cache) around the kernel boundary; the native handle
   * is materialized lazily inside the innermost handler, so a mesh-cache hit
   * costs no kernel work and no handle deserialization.
   */
  private async runMeshPhase(options: {
    owner: OperationOwner;
    identity: RenderIdentity;
    renderOptions: Record<string, unknown>;
    content: RuntimeContentInput;
    resolvedMiddleware: ResolvedMiddleware[];
    createResult: Extract<CreateGeometryResult, { success: true }>;
    renderArtifact: MaterializedRender;
  }): Promise<MeshGeometryResult> {
    const { owner, identity, renderOptions, content, resolvedMiddleware, createResult, renderArtifact } = options;

    if (!this.kernelHasMeshPhaseForOwner(owner)) {
      return createKernelError([
        {
          message:
            'Kernel has no display path: createGeometry returned no geometry and the kernel does not implement meshGeometry.',
          code: 'KERNEL_CAPABILITY_MISSING',
          type: 'kernel',
          severity: 'error',
        },
      ]);
    }

    const meshSpan = this.tracer.startSpan('kernel.mesh', { phase: 'computingGeometry' });
    try {
      const runtime = this.createRuntime();
      const computeMesh = async (handlerInput: MeshGeometryRequest): Promise<MeshGeometryResult> => {
        const handle = await this.materializeNativeHandleForOwner({
          owner,
          runtime,
          renderArtifact,
        });
        if (!handle.success) {
          return handle.result.success
            ? { success: false, issues: [] }
            : { success: false, issues: handle.result.issues };
        }
        return this.onMeshGeometryForOwner(
          owner,
          this.withProviderRuntimeContent(
            { nativeHandle: handle.handle, options: handlerInput.options },
            content,
            this.getNativeRenderContentKeys(owner),
          ),
          runtime,
        );
      };

      const activeMiddleware = resolvedMiddleware.filter(
        ({ middleware, enabled }) => enabled && middleware.wrapMeshGeometry,
      );

      const { tracer } = this;
      let chain: MeshGeometryHandler = named('kernelHandler', async (handlerInput: MeshGeometryRequest) => {
        const computeSpan = tracer.startSpan('kernel.mesh-compute');
        const meshResult = await computeMesh(handlerInput);
        computeSpan.end();
        return meshResult;
      });

      if (activeMiddleware.length > 0) {
        const runtimes = new Map<string, KernelMiddlewareRuntime>();
        for (const { middleware, options: middlewareOptions, id } of activeMiddleware) {
          runtimes.set(
            id,
            createMiddlewareRuntime({
              signal: this.operationSignal ?? neverAbortedSignal,
              onLog: this.onLog,
              middlewareName: middleware.name,
              filesystem: this.filesystem,
              dependencies: identity.dependencies,
              dependencyHash: identity.dependencyHash,
              stateSchema: middleware.stateSchema,
              options: middlewareOptions,
              logger: this.getMiddlewareLogger(id, middleware.name),
            }),
          );
        }

        for (let index = activeMiddleware.length - 1; index >= 0; index--) {
          const { middleware, id } = activeMiddleware[index]!;
          const inner = chain;
          const middlewareRuntime = runtimes.get(id)!;
          const middlewareName = middleware.name;
          const wrapHook = middleware.wrapMeshGeometry!;

          chain = named(`middleware(${middlewareName})`, async (handlerInput: MeshGeometryRequest) => {
            const span = tracer.startSpan(`middleware.wrap(${middlewareName})`, {
              middleware: middlewareName,
            });
            try {
              const chainResult = await wrapHook(
                this.withProviderRuntimeContent(handlerInput, content, middleware.content?.render ?? []),
                inner,
                middlewareRuntime,
              );
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
      }

      const meshResult = await chain({ options: renderOptions });
      if (!meshResult.success) {
        return meshResult;
      }

      // Compose the display result: mesh-phase artifact, create-phase warnings
      // preserved, durable handle snapshot carried through unchanged.
      return {
        success: true,
        data: meshResult.data,
        issues: [...createResult.issues, ...meshResult.issues],
        serializedNativeHandle: createResult.serializedNativeHandle,
      };
    } finally {
      meshSpan.end();
    }
  }

  private async createOperationOwner(file: RuntimeFileLocator, kind: OperationOwner['kind']): Promise<OperationOwner> {
    const canonicalFile = this.canonicalGeometryFile(file);
    const entryPath = resolveVirtualPath(joinPath(canonicalFile.path, canonicalFile.filename));
    const binding = await this.resolveKernelBinding({ entryPath }, this.createRuntime());
    return {
      kind,
      file: canonicalFile,
      binding,
    };
  }

  private async writeFilesAndInvalidate(stage: Record<string, Uint8Array<ArrayBuffer>>): Promise<void> {
    const entries = Object.entries(stage).map(([path, bytes]) => [resolveVirtualPath(path), bytes] as const);
    if (new Set(entries.map(([path]) => path)).size !== entries.length) {
      throw new TypeError('Staged runtime paths must be unique after canonicalization');
    }
    const publicationSlot = Promise.withResolvers<void>();
    const publication = {
      paths: new Set(entries.map(([path]) => path)),
      promise: publicationSlot.promise,
      resolve: publicationSlot.resolve,
    };
    this.stagedWritePublication = publication;
    const changedPaths: string[] = [];
    const revisions = new Map<string, ObservedFileRevision>();
    const createdDirectories = new Set<string>();
    try {
      for (const [absolutePath, bytes] of entries) {
        const directory = parentDirectory(absolutePath);
        if (directory && directory !== '/' && !createdDirectories.has(directory)) {
          // oxlint-disable-next-line no-await-in-loop -- staging must preserve filesystem order for deterministic tests
          await this.filesystem.mkdir(directory, { recursive: true });
          createdDirectories.add(directory);
        }
        // oxlint-disable-next-line no-await-in-loop -- staging must complete before dependency resolution
        await this.filesystem.writeFile(absolutePath, bytes);
        changedPaths.push(absolutePath);
        if (this.fileHashCache.has(absolutePath) || this.watchedPaths.has(absolutePath)) {
          // oxlint-disable-next-line no-await-in-loop -- staging order and cache publication stay deterministic
          revisions.set(absolutePath, { hash: await this.hashContent(bytes), content: bytes });
        }
      }
      if (changedPaths.length > 0) {
        this._applyObservedRevisions(changedPaths, revisions);
        this.onFileChanged(changedPaths);
      }
    } finally {
      publication.resolve();
      if (this.stagedWritePublication === publication) {
        this.stagedWritePublication = undefined;
      }
    }
  }

  private createExportRequestPlan(
    owner: OperationOwner,
    request: {
      readonly format: FileExtension;
      readonly options?: Record<string, unknown>;
      readonly content?: RuntimeContentInput;
    },
  ): OwnerBoundExportPlan {
    const { format, options, content } = request;
    const rawOptions = options ?? {};
    const ownerKernelId = owner.binding?.kernelId;
    const zodSchemas = ownerKernelId ? this.kernelExportZodSchemasMap.get(ownerKernelId) : undefined;
    const formatZodSchema = zodSchemas?.[format];

    if (formatZodSchema) {
      const directRoute = this._capabilitiesManifest.routes.find(
        (route) => route.kernelId === ownerKernelId && route.targetFormat === format && !route.transcoderId,
      );
      const allowedOptionKeys = new Set(
        Object.keys(collectJsonSchemaProperties(directRoute?.exportOptions.schema ?? {})),
      );
      const unsupportedOptionKey = Object.keys(rawOptions).find((key) => !allowedOptionKeys.has(key));
      if (unsupportedOptionKey) {
        return {
          success: false,
          result: createKernelError([
            {
              message: `Export option "${unsupportedOptionKey}" is not supported by direct kernel route ${ownerKernelId} → ${format}.`,
              code: 'RUNTIME',
              type: 'runtime',
              severity: 'error',
            },
          ]),
        };
      }
      const contentResult = this.validateRuntimeContent('export', this.getExportContentKeys(owner, format), content);
      if (!contentResult.success) {
        return { success: false, result: createKernelError(contentResult.issues) };
      }
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
      const contentContributors = this.describeContentContributors(owner, format, contentResult.content);
      return {
        success: true,
        owner,
        input: { format, options: validatedOptions, content: contentResult.content },
        route: {
          kind: 'direct',
          kernelId: ownerKernelId,
          targetFormat: format,
          options: validatedOptions,
          content: contentResult.content,
        },
        dependency: {
          type: 'export',
          format,
          options: validatedOptions,
          content: contentResult.content as Record<string, boolean>,
          route: {
            kind: 'direct',
            kernelId: ownerKernelId,
            targetFormat: format,
            contentContributors,
          },
        },
      };
    }

    const transcoderRoutes = this._capabilitiesManifest.routes.filter(
      (route) => route.targetFormat === format && route.transcoderId && route.kernelId === ownerKernelId,
    );
    const requestedContentKeys = Object.keys(content ?? {});
    const transcoderRoute = transcoderRoutes.find((route) => {
      const supported = route.content?.schema.properties ?? {};
      return requestedContentKeys.every((key) => key in supported);
    });
    if (!transcoderRoute) {
      const availableRoute = transcoderRoutes[0];
      if (availableRoute) {
        const contentResult = this.validateRuntimeContent(
          'export',
          Object.keys(availableRoute.content?.schema.properties ?? {}) as RuntimeContentKey[],
          content,
        );
        if (!contentResult.success) {
          return { success: false, result: createKernelError(contentResult.issues) };
        }
      }
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

    const allowedOptionKeys = new Set(Object.keys(collectJsonSchemaProperties(transcoderRoute.exportOptions.schema)));
    const unsupportedOptionKey = Object.keys(rawOptions).find((key) => !allowedOptionKeys.has(key));
    if (unsupportedOptionKey) {
      return {
        success: false,
        result: createKernelError([
          {
            message: `Export option "${unsupportedOptionKey}" is not supported by route ${transcoderRoute.sourceFormat} → ${format}.`,
            code: 'RUNTIME',
            type: 'runtime',
            severity: 'error',
          },
        ]),
      };
    }

    let sourceOptions: Record<string, unknown> = {};
    let edgeOptions: Record<string, unknown> = {};
    const sourceZodSchema = zodSchemas?.[transcoderRoute.sourceFormat];
    const transcoder = this.loadedTranscoders.get(transcoderRoute.transcoderId!);
    const matchingEdge = transcoder?.edges.find(
      (edge) => edge.from === transcoderRoute.sourceFormat && edge.to === format,
    );
    const sourceRoute = this._capabilitiesManifest.routes.find(
      (route) =>
        route.kernelId === ownerKernelId &&
        route.targetFormat === transcoderRoute.sourceFormat &&
        route.transcoderId === undefined,
    );
    const pinnedSourceKeys = Object.keys(matchingEdge?.sourceOptions ?? {});
    const sourceOptionKeys = Object.keys(sourceRoute?.exportOptions.schema.properties ?? {}).filter(
      (key) => !pinnedSourceKeys.includes(key),
    );
    const edgeOptionKeys = [...allowedOptionKeys].filter((key) => !sourceOptionKeys.includes(key));
    if (sourceZodSchema) {
      const parseResult = sourceZodSchema.safeParse({
        ...pickRecordProperties(rawOptions, sourceOptionKeys),
        ...matchingEdge?.sourceOptions,
      });
      if (parseResult.success) {
        sourceOptions = parseResult.data as Record<string, unknown>;
      } else {
        return {
          success: false,
          result: createKernelError(
            parseResult.error.issues.map((issue) => ({
              message: `Source export option validation failed (${transcoderRoute.sourceFormat}): ${issue.path.join('.')} — ${issue.message}`,
              code: 'RUNTIME',
              type: 'runtime',
              severity: 'error',
            })),
          ),
        };
      }
    }

    const sourceContentKeys = this.getExportContentKeys(owner, transcoderRoute.sourceFormat);
    const edgeContentKeys = new Set(matchingEdge?.content ?? []);
    const routeContentKeys = sourceContentKeys.filter((key) => edgeContentKeys.has(key));
    const contentResult = this.validateRuntimeContent('export', routeContentKeys, content);
    if (!contentResult.success) {
      return { success: false, result: createKernelError(contentResult.issues) };
    }
    if (matchingEdge?.optionsSchema) {
      const edgeParseResult = matchingEdge.optionsSchema.safeParse(pickRecordProperties(rawOptions, edgeOptionKeys));
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
    sourceOptions = { ...sourceOptions, ...matchingEdge?.sourceOptions };
    const contentContributors = this.describeContentContributors(
      owner,
      transcoderRoute.sourceFormat,
      contentResult.content,
    );

    return {
      success: true,
      owner,
      input: { format, options: rawOptions, content: contentResult.content },
      route: {
        kind: 'transcoded',
        kernelId: transcoderRoute.kernelId,
        sourceFormat: transcoderRoute.sourceFormat,
        targetFormat: transcoderRoute.targetFormat,
        transcoderId: transcoderRoute.transcoderId!,
        sourceOptions,
        edgeOptions,
        content: contentResult.content,
      },
      dependency: {
        type: 'export',
        format,
        options: rawOptions,
        content: contentResult.content as Record<string, boolean>,
        route: {
          kind: 'transcoded',
          kernelId: transcoderRoute.kernelId,
          sourceFormat: transcoderRoute.sourceFormat,
          targetFormat: transcoderRoute.targetFormat,
          transcoderId: transcoderRoute.transcoderId,
          transcoderVersion: transcoder?.definition.version,
          transcoderOptions: transcoder?.options,
          transcoderAssets: transcoder?.implementationAssets.map(({ id, sha256 }) => ({ id, sha256 })),
          contentContributors,
          sourceOptions,
          edgeOptions,
        },
      },
    };
  }

  private async materializeNativeHandleForOwner(options: {
    owner: OperationOwner;
    runtime: KernelRuntime;
    renderArtifact: MaterializedRender;
  }): Promise<{ success: true; handle: unknown } | { success: false; result: ExportGeometryResult }> {
    const { owner, runtime, renderArtifact } = options;
    const { identity } = renderArtifact;

    const liveSlot = this.getNativeHandleSlotForIdentity(identity, renderArtifact);
    if (this.isLiveNativeHandleSlotUsableForOwner(liveSlot, owner)) {
      const validity = await this.validateNativeHandleSlot({ owner, renderArtifact, slot: liveSlot, runtime });
      if (validity) {
        return { success: true, handle: liveSlot.handle };
      }
    }

    const serializedSlot = this.getSerializedNativeHandleSlotForIdentity(identity, renderArtifact);
    if (serializedSlot && this.serializedSlotMatchesOwner(serializedSlot, owner)) {
      const restored = await this.restoreSerializedNativeHandleSlot({
        owner,
        identity,
        renderArtifact,
        slot: serializedSlot,
        runtime,
      });
      if (restored.success) {
        return { success: true, handle: restored.handle };
      }
    }

    const reheatedSlot = await this.reheatNativeHandleForOwner(owner, renderArtifact, runtime);
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

  private liveSlotMatchesOwner(slot: NativeHandleSlot, owner: OperationOwner): boolean {
    return slot.kernelId === owner.binding?.kernelId && slot.kernelVersion === owner.binding?.kernelVersion;
  }

  private serializedSlotMatchesOwner(slot: SerializedNativeHandleSlot, owner: OperationOwner): boolean {
    return slot.kernelId === owner.binding?.kernelId && slot.kernelVersion === owner.binding?.kernelVersion;
  }

  private isLiveNativeHandleSlotUsableForOwner(
    slot: NativeHandleSlot | undefined,
    owner: OperationOwner,
  ): slot is NativeHandleSlot {
    return Boolean(slot && this.liveSlotMatchesOwner(slot, owner));
  }

  private async validateNativeHandleSlot(input: {
    owner: OperationOwner;
    renderArtifact: MaterializedRender;
    slot: NativeHandleSlot;
    runtime: KernelRuntime;
  }): Promise<boolean> {
    const { owner, renderArtifact, slot, runtime } = input;
    try {
      const isValid = await this.isNativeHandleValidForOwner(owner, slot.handle, runtime);
      if (isValid === false) {
        this.clearLiveNativeHandleSlot(renderArtifact, slot);
        this.logger.debug('Native handle is stale; export will reheat');
        return false;
      }
      return true;
    } catch (error) {
      this.clearLiveNativeHandleSlot(renderArtifact, slot);
      this.logger.warn('Native-handle validity check failed; export will reheat', {
        data: { error: error instanceof Error ? error.message : String(error) },
      });
      return false;
    }
  }

  private async restoreSerializedNativeHandleSlot(options: {
    owner: OperationOwner;
    identity: RenderIdentity;
    renderArtifact: MaterializedRender;
    slot: SerializedNativeHandleSlot;
    runtime: KernelRuntime;
  }): Promise<{ success: true; handle: unknown } | { success: false }> {
    const { owner, identity, renderArtifact, slot, runtime } = options;
    try {
      const handle = await this.deserializeNativeHandleForOwner(owner, slot.serializedNativeHandle, runtime);
      if (handle === undefined || handle === null) {
        this.clearSerializedNativeHandleSlot(renderArtifact, slot);
        return { success: false };
      }
      this.logger.debug('Restoring nativeHandle via owner-bound deserializeNativeHandle');
      this.ownNativeHandle(handle, owner);
      renderArtifact.liveNativeHandleSlot = {
        identityKey: createNativeHandleIdentityKey(identity),
        kernelId: identity.selectedKernelId,
        kernelVersion: identity.selectedKernelVersion,
        handle,
      };
      return { success: true, handle };
    } catch (error) {
      this.clearSerializedNativeHandleSlot(renderArtifact, slot);
      this.logger.warn('Native-handle snapshot restore failed; export will reheat', {
        data: { error: error instanceof Error ? error.message : String(error) },
      });
      return { success: false };
    }
  }

  private async reheatNativeHandleForOwner(
    owner: OperationOwner,
    renderArtifact: MaterializedRender,
    runtime: KernelRuntime,
  ): Promise<NativeHandleSlot | undefined> {
    const { identity } = renderArtifact;
    const reheatInput = identity.nativeBuildInput;
    if (!reheatInput) {
      return undefined;
    }
    this.logger.debug('Export reheat: re-running createGeometry to populate nativeHandle', {
      data: {
        entryPath: reheatInput.entryPath,
        parameterCount: Object.keys(reheatInput.parameters).length,
      },
    });
    const reheatSpan = this.tracer.startSpan('kernel.export-reheat');
    try {
      this.pendingNativeHandle = undefined;
      const reheatResult = await this.onCreateGeometryForOwner(owner, reheatInput, runtime);
      const slots = this.bindNativeHandleSlots({
        identity,
        success: reheatResult.success,
        serializedNativeHandle: reheatResult.success ? reheatResult.serializedNativeHandle : undefined,
      });
      renderArtifact.liveNativeHandleSlot = slots.liveNativeHandleSlot;
      renderArtifact.serializedNativeHandleSlot = slots.serializedNativeHandleSlot;
      this.logger.debug('Export reheat completed', {
        data: {
          success: reheatResult.success,
          nativeHandleType: typeof slots.liveNativeHandleSlot?.handle,
          nativeHandleSet: slots.liveNativeHandleSlot !== undefined,
          issues: reheatResult.issues.map((i) => i.message),
        },
      });
      return slots.liveNativeHandleSlot;
    } catch (error) {
      this.logger.error('Export reheat threw', {
        data: { error: error instanceof Error ? error.message : String(error) },
      });
      return undefined;
    } finally {
      reheatSpan.end();
    }
  }

  private async runExportMiddlewarePipeline(options: {
    plan: Extract<OwnerBoundExportPlan, { success: true }>;
    renderIdentity: LastSettledRenderIdentity | undefined;
    renderArtifact?: MaterializedRender;
    activeMiddleware: ResolvedMiddleware[];
    onCacheMiss?: (input: MiddlewareExportGeometryRequest) => Promise<ExportGeometryResult>;
  }): Promise<ExportGeometryResult> {
    if (!options.renderIdentity) {
      return this.createExportRenderIdentityMissingResult();
    }

    const depsSpan = this.tracer.startSpan('kernel.resolve-deps', {
      phase: 'resolvingDeps',
    });
    const dependencies = await this.computeDependencies({
      parameters: options.renderIdentity.parameters,
      renderOptions: options.renderIdentity.renderOptions,
      content: options.plan.route.content,
      exportDependency: options.plan.dependency,
      resolvedMiddleware: this.getExportExecutionList(options.plan),
      owner: options.plan.owner,
    });
    const dependencyHash = await this.computeDependencyHash(dependencies);
    depsSpan.end();

    const runtimes = new Map<string, KernelMiddlewareRuntime>();
    for (const { middleware, options: middlewareOptions, id } of options.activeMiddleware) {
      runtimes.set(
        id,
        createMiddlewareRuntime({
          signal: this.operationSignal ?? neverAbortedSignal,
          onLog: this.onLog,
          middlewareName: middleware.name,
          filesystem: this.filesystem,
          dependencies,
          dependencyHash,
          stateSchema: middleware.stateSchema,
          options: middlewareOptions,
          logger: this.getMiddlewareLogger(id, middleware.name),
        }),
      );
    }

    const { onCacheMiss, renderArtifact } = options;
    const computeExport =
      onCacheMiss ??
      (async (handlerInput: MiddlewareExportGeometryRequest): Promise<ExportGeometryResult> => {
        if (!renderArtifact) {
          return this.createExportRenderIdentityMissingResult();
        }
        return this.executeExportRequest({ ...options.plan, input: handlerInput }, renderArtifact);
      });

    const { tracer } = this;
    let chain: ExportGeometryHandler = named('kernelHandler', async (handlerInput: MiddlewareExportGeometryRequest) => {
      const computeSpan = tracer.startSpan('kernel.export-compute');
      const exportResult = await computeExport(this.withoutRuntimeContent(handlerInput));
      computeSpan.end();
      return exportResult;
    });

    for (let index = options.activeMiddleware.length - 1; index >= 0; index--) {
      const { middleware, id } = options.activeMiddleware[index]!;
      const inner = chain;
      const runtime = runtimes.get(id)!;
      const middlewareName = middleware.name;
      const wrapHook = middleware.wrapExportGeometry!;

      chain = named(`middleware(${middlewareName})`, async (handlerInput: MiddlewareExportGeometryRequest) => {
        const span = tracer.startSpan(`middleware.wrap(${middlewareName})`, {
          middleware: middlewareName,
        });
        try {
          const chainResult = await wrapHook(
            this.withProviderRuntimeContent(
              handlerInput,
              options.plan.route.content,
              middleware.content?.exportFormats?.[options.plan.route.targetFormat] ?? [],
            ),
            inner,
            runtime,
          );
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
    const exportMaterialization =
      plan.route.kind === 'direct'
        ? { format: plan.route.targetFormat, options: plan.route.options }
        : { format: plan.route.sourceFormat, options: plan.route.sourceOptions };
    const desiredNativeHandleKey = await this.computeNativeHandleKey({
      owner: plan.owner,
      parameters: renderArtifact.identity.parameters,
      renderOptions: renderArtifact.identity.renderOptions,
      exportOptions: exportMaterialization.options,
      content: plan.route.content,
    });
    if (!desiredNativeHandleKey.success) {
      return createKernelError(desiredNativeHandleKey.issues);
    }
    if (!this.artifactMatchesNativeBuild(renderArtifact, plan.owner, desiredNativeHandleKey.key)) {
      const materialized = await this.materializeRender(
        {
          file: renderArtifact.identity.file,
          parameters: renderArtifact.identity.parameters,
          options: renderArtifact.identity.renderOptions,
          content: plan.route.content,
          export: { ...exportMaterialization, dependency: plan.dependency },
        },
        { owner: plan.owner, publish: false },
      );
      if (!materialized.artifact.result.success) {
        return createKernelError(materialized.artifact.result.issues);
      }
      renderArtifact = materialized.artifact;
    }

    const runtime = this.createRuntime();
    const nativeInput = await this.prepareNativeExportInput({
      plan,
      runtime,
      renderArtifact,
    });
    if (!nativeInput.success) {
      return nativeInput.result;
    }

    const computeSpan = this.tracer.startSpan('kernel.export-compute');
    const result = await this.executeExportWithRoute(plan, {
      input: nativeInput.input,
      runtime,
      renderIdentity: renderArtifact.identity,
    });
    computeSpan.end();
    return result;
  }

  private async prepareNativeExportInput(options: {
    plan: Extract<OwnerBoundExportPlan, { success: true }>;
    runtime: KernelRuntime;
    renderArtifact: MaterializedRender;
  }): Promise<{ success: true; input: KernelExportGeometryInput } | { success: false; result: ExportGeometryResult }> {
    const { plan, runtime, renderArtifact } = options;
    const nativeHandle = await this.materializeNativeHandleForOwner({
      owner: plan.owner,
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
    return this.activeFilePath;
  }

  /**
   * Emit a worker state transition to the main thread via the single
   * ordered `postMessage` channel. Deduplicates repeated emissions so
   * consumers observe one event per logical transition.
   *
   * @param state - The worker state to emit.
   */
  private pushState(state: WorkerState, record: RenderCancellationRecord, detail?: string): void {
    if (
      this.lastPushedState !== undefined &&
      this.lastPushedState.renderId === record.renderId &&
      this.lastPushedState.state === state &&
      this.lastPushedState.detail === detail
    ) {
      return;
    }
    this.lastPushedState = { renderId: record.renderId, state, ...(detail === undefined ? {} : { detail }) };
    this.onStateChanged?.({
      renderId: record.renderId,
      abortGeneration: record.generation,
      state,
      ...(detail === undefined ? {} : { detail }),
    });
  }

  /**
   * Check if the current render has been aborted by a newer generation.
   *
   * @param record - The admitted render record to check.
   * @returns True if aborted, false otherwise.
   */
  private isAborted(record: RenderCancellationRecord): boolean {
    return record.controller.signal.aborted || record.generation !== this.currentRenderGeneration();
  }

  /**
   * The transport-authoritative render generation: the shared atomic when the client can
   * reserve generations itself, the local mirror otherwise. `renderGeneration` alone is
   * stale under SAB, where client reservations never reach it.
   *
   * @returns The current generation every render-currency check must compare against.
   */
  private currentRenderGeneration(): number {
    return this.signalView ? Atomics.load(this.signalView, signalSlot.abortGeneration) >>> 0 : this.renderGeneration;
  }

  /**
   * Schedule a render after a debounce delay. Clears any existing timer.
   *
   * @param renderDelay - Debounce delay before render fires. Milliseconds.
   */
  private scheduleRender(renderDelay: number, record: RenderCancellationRecord): void {
    clearTimeout(this.paramDebounceTimer);
    this.pushState('buffering', record);
    this.paramDebounceTimer = setTimeout(() => {
      this.paramDebounceTimer = undefined;
      if (!this.operationAdmissionOpen) {
        return;
      }
      void this.runQueuedCommand(record, async () => this.executeRender(record));
    }, renderDelay);
  }

  /**
   * Execute an autonomous render cycle. Handles the full pipeline:
   * increment generation, bundle, execute, compute geometry, push results.
   * Checks abort at each async boundary.
   */
  private async executeRender(record: RenderCancellationRecord): Promise<void> {
    if (!this.currentFile || record !== this.activeRenderRecord || this.isAborted(record)) {
      // A record that lost ownership was terminalized by whatever replaced it; one that
      // still owns the lane (an abandoned client reservation, a file-less schedule) has
      // no other terminal boundary and would otherwise leak.
      if (record === this.activeRenderRecord) {
        this.abortRenderRecord(record, 'superseded');
      }
      return;
    }
    const { generation } = record;
    record.executing = true;

    this.prepareUnobservedFileSystem(true);

    setAbortContext({
      signal: record.controller.signal,
      ...(this.signalView === undefined ? {} : { signalView: this.signalView }),
      generation,
      onSharedAbort: (reason) => {
        this.abortRenderRecord(record, reason === abortReasonEnum.timeout ? 'timeout' : 'superseded');
      },
    });

    this.pushState('rendering', record);
    this.tracer.reset();
    const renderSpan = this.tracer.startSpan('kernel.render', {
      file: this.currentFile.filename,
    });

    try {
      this.onProgress = (phase: RenderPhase) => {
        this.onProgressUpdate?.({ phase, renderId: record.renderId });
      };
      const dependencyContext: DependencyResolutionContext = {};
      this.setActiveFile(this.currentFile);
      this.previewWatchCandidate = {
        generation,
        paths: new Map(this.currentPreviewWatchPaths),
        middlewarePaths: new Map(this.currentPreviewMiddlewarePaths),
        coherent: false,
      };
      this.previewWatchCandidate.paths.set(this.activeFileAbsolutePath, fileChangeDebounce);
      const owner = await this.createOperationOwner(this.currentFile, 'render-artifact');

      if (this.isAborted(record)) {
        throw new RenderAbortedError();
      }

      const contentResult = this.validateRuntimeContent(
        'render',
        this.getRenderContentKeys(owner),
        this.currentRenderContent,
      );
      if (!contentResult.success) {
        const result = createKernelError(contentResult.issues);
        this.onGeometryComputed?.({ result, renderId: record.renderId });
        this.onError?.({ issues: contentResult.issues, renderId: record.renderId });
        this.pushState('error', record);
        return;
      }

      const renderWork = async (): Promise<HashedGeometryResult> => {
        const parametersResult = await this.getParametersInLane(this.currentFile!, dependencyContext, owner);
        if (this.isAborted(record)) {
          throw new RenderAbortedError();
        }
        this.onParametersResolved?.({ result: parametersResult, renderId: record.renderId });

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
        if (this.isAborted(record)) {
          throw new RenderAbortedError();
        }

        const geometryResult = await this.createGeometryInLane(
          {
            file: this.currentFile!,
            parameters: mergedParameters,
            options: this.currentRenderOptions,
            content: contentResult.content,
          },
          dependencyContext,
          owner,
        );

        if (this.isAborted(record)) {
          throw new RenderAbortedError();
        }

        return geometryResult;
      };

      const result = await renderWork();
      this.onProgress = undefined;

      this.flushTelemetry();
      this.onGeometryComputed?.({ result, renderId: record.renderId });
      this.pushState('idle', record);
    } catch (error) {
      this.onProgress = undefined;
      if (isRenderAbortedError(error) || this.isAborted(record)) {
        const { reason } = record;

        if (reason === 'timeout') {
          this.onError?.({ issues: [renderTimeoutIssue()], renderId: record.renderId });
          this.pushState('error', record);
        } else {
          this.pushState('idle', record);
        }
        return;
      }

      this.onError?.({ issues: this.errorToRuntimeIssues(error), renderId: record.renderId });
      this.pushState('error', record);
    } finally {
      clearAbortContext();
      record.executing = false;
      const candidate = this.previewWatchCandidate;
      if (candidate?.generation === generation && candidate.coherent && generation === this.currentRenderGeneration()) {
        await this.reconcileObservedPaths(candidate);
      } else if (!candidate?.watchCommitRejected) {
        await this.reconcileObservedPaths();
      }
      if (this.previewWatchCandidate?.generation === generation) {
        this.previewWatchCandidate = undefined;
      }
      this.releaseRenderRecord(record);
      renderSpan.end();
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
    }
    this._invalidateBundleCachesForPaths(changedPaths);
  }

  private _applyObservedRevisions(
    changedPaths: readonly string[],
    revisions: ReadonlyMap<string, ObservedFileRevision | undefined>,
  ): void {
    for (const path of changedPaths) {
      const revision = revisions.get(path);
      if (revision === undefined) {
        this.fileHashCache.delete(path);
        this.fileContentCache.delete(path);
        continue;
      }
      if (revision.expectedPrior !== undefined && this.fileHashCache.get(path) !== revision.expectedPrior.hash) {
        this.fileHashCache.delete(path);
        this.fileContentCache.delete(path);
        continue;
      }
      this.fileHashCache.set(path, revision.hash);
      if (revision.content === undefined) {
        this.fileContentCache.delete(path);
      } else {
        this.fileContentCache.set(path, revision.content);
      }
    }
    this._invalidateBundleCachesForPaths(changedPaths);
  }

  private _invalidateBundleCachesForPaths(changedPaths: readonly string[]): void {
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
  }

  private exactWatchEventPaths(event: Exclude<WatchEvent, { type: 'reset' }>): string[] {
    const paths: string[] = [];
    if ('path' in event) {
      paths.push(resolveVirtualPath(event.path));
    }
    if (event.type === 'rename') {
      paths.push(resolveVirtualPath(event.oldPath), resolveVirtualPath(event.newPath));
    }
    return [...new Set(paths)];
  }

  private async routeWatchEvent(event: WatchEvent): Promise<void> {
    if (!this.operationAdmissionOpen) {
      return;
    }
    let record: RenderCancellationRecord | undefined;
    try {
      await this.enqueueWatchReconciliation(async () => {
        const paths = event.type === 'reset' ? [...this.watchedPaths] : this.exactWatchEventPaths(event);
        // The barrier has to be observed again after the read: a staged write that began
        // while this reconciliation was reading would otherwise be judged against the
        // pre-write revision and supersede its own admitted record.
        const awaitStagedWrite = async (): Promise<boolean> => {
          const stagedWrite = this.stagedWritePublication;
          if (!stagedWrite || !paths.some((path) => stagedWrite.paths.has(path))) {
            return false;
          }
          await stagedWrite.promise;
          return true;
        };
        await awaitStagedWrite();
        let revisions = await this.readChangedObservedRevisions(paths);
        if (await awaitStagedWrite()) {
          revisions = await this.readChangedObservedRevisions(paths);
        }
        if (revisions.size === 0 || !this.operationAdmissionOpen) {
          return;
        }
        const changedPaths = [...revisions.keys()];
        record = this.shouldScheduleExactPreview(changedPaths) ? this.createAutonomousPreviewRecord() : undefined;
        await this.enqueueOperation(async () => this.routeExactChangedPaths(changedPaths, record, revisions));
      });
    } catch (error) {
      this.reportWatchRoutingError(error, record);
    }
  }

  private async enqueueWatchReconciliation(operation: () => Promise<void>): Promise<void> {
    const previous = this.watchReconciliationTail;
    const next = Promise.withResolvers<void>();
    this.watchReconciliationTail = next.promise;
    await previous;
    try {
      await operation();
    } finally {
      next.resolve();
    }
  }

  private async readChangedObservedRevisions(
    paths: readonly string[],
  ): Promise<Map<string, ObservedFileRevision | undefined>> {
    const changed = new Map<string, ObservedFileRevision | undefined>();
    const { fileSystem } = this;
    if (!fileSystem) {
      return changed;
    }
    for (const path of paths) {
      const expectedPrior = { hash: this.fileHashCache.get(path) };
      let revision: ObservedFileRevision | undefined;
      let readFailed = false;
      try {
        // oxlint-disable-next-line no-await-in-loop -- serialized reads preserve the observer's revision order
        const content = await fileSystem.readFile(path);
        // oxlint-disable-next-line no-await-in-loop -- serialized hashes preserve the observer's revision order
        revision = { hash: await this.hashContent(content), content, expectedPrior };
      } catch (error) {
        if (isNotFoundError(error)) {
          revision = { hash: 'missing', expectedPrior };
        } else {
          readFailed = true;
        }
      }
      const known = this.fileHashCache.get(path);
      if (!readFailed && known === undefined && revision) {
        /* No prior revision means the render that armed this watch has not read
         * the path yet — every path a render *has* observed carries a hash (or
         * `'missing'`) by the time it enters the watch set. So this read is the
         * path's baseline, not evidence of a change: an OS that replays the
         * write predating the arm (macOS does, milliseconds later) would
         * otherwise schedule an autonomous re-render that aborts the very
         * render doing the arming, which then settles as `{ superseded: true }`. */
        this.fileHashCache.set(path, revision.hash);
        if (revision.content !== undefined) {
          this.fileContentCache.set(path, revision.content);
        }
        continue;
      }
      if (readFailed || revision?.hash !== known) {
        changed.set(path, revision);
      }
    }
    return changed;
  }

  private reportWatchRoutingError(error: unknown, record: RenderCancellationRecord | undefined): void {
    if (this.operationAdmissionOpen) {
      const issues = this.errorToRuntimeIssues(error);
      this.onError?.({ issues, ...(record === undefined ? {} : { renderId: record.renderId }) });
    }
    // A closing worker still owes every admitted record its terminal state and release.
    if (record) {
      this.pushState('error', record);
      this.releaseRenderRecord(record);
    }
  }

  private shouldScheduleExactPreview(paths: readonly string[]): boolean {
    const candidate = this.previewWatchCandidate;
    const previewPaths =
      candidate?.generation === this.currentRenderGeneration() ? candidate.paths : this.currentPreviewWatchPaths;
    return Boolean(this.currentFile && paths.some((path) => previewPaths.has(path)));
  }

  private async routeExactChangedPaths(
    paths: readonly string[],
    record?: RenderCancellationRecord,
    revisions?: ReadonlyMap<string, ObservedFileRevision | undefined>,
  ): Promise<void> {
    if (revisions) {
      this._applyObservedRevisions(paths, revisions);
    } else {
      this._invalidateCachesForPaths(paths);
    }
    this.onFileChanged(paths);
    if (record === undefined || record !== this.activeRenderRecord || !this.currentFile) {
      return;
    }
    this.invalidatePublishedArtifactState();
    let renderDebounce = fileChangeDebounce;
    for (const path of paths) {
      renderDebounce = Math.min(renderDebounce, this.currentPreviewWatchPaths.get(path) ?? fileChangeDebounce);
    }
    this.scheduleRender(renderDebounce, record);
  }

  /**
   * Derive the full set of watched dependencies from all active caches
   * and update the filesystem watch subscription.
   */
  private async reconcileObservedPaths(candidate?: typeof this.previewWatchCandidate): Promise<boolean> {
    const previewPaths = candidate?.paths ?? this.currentPreviewWatchPaths;
    const allDeps = new Map(previewPaths);
    for (const result of this.bundleResultCache.values()) {
      for (const dep of result.dependencies) {
        allDeps.set(resolveVirtualPath(dep), fileChangeDebounce);
      }
      for (const path of result.unresolvedPaths) {
        allDeps.set(resolveVirtualPath(path), fileChangeDebounce);
      }
    }
    for (const path of this.fileHashCache.keys()) {
      allDeps.set(resolveVirtualPath(path), previewPaths.get(path) ?? fileChangeDebounce);
    }
    return this.reconcileWatchSet(allDeps, candidate);
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
    const initSpan = this.tracer.startSpan('kernel.bundler-context-init');

    try {
      const rawOptions = bundlerOptions ?? {};
      const validatedOptions = definition.optionsSchema ? definition.optionsSchema.parse(rawOptions) : rawOptions;

      const context = await definition.initialize(validatedOptions, { filesystem: this.filesystem });
      const loaded = { definition, ctx: context };

      for (const extension of extensions) {
        this.loadedBundlers.set(extension, loaded);
        this.pendingBundlerInits.delete(extension);
      }

      for (const [name, entry] of this.pendingModuleRegistrations) {
        definition.registerModule({ name, module: entry }, context);
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
      const ids = new Set<string>();

      for (const entry of middlewarePlugins) {
        if (ids.has(entry.id)) {
          throw new Error(`Duplicate middleware id: ${entry.id}`);
        }
        ids.add(entry.id);
        this.warnOnRuntimeVersionMismatch('middleware', entry);
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
      const transcoderRuntime: Omit<TranscoderRuntime, 'signal'> = {
        logger: this.logger,
        tracer: this.tracer,
      };

      for (const entry of entries) {
        const importSpan = this.tracer.startSpan('kernel.load-transcoder', {
          id: entry.id,
        });

        try {
          this.warnOnRuntimeVersionMismatch('transcoder', entry);
          // oxlint-disable-next-line no-await-in-loop -- Sequential to preserve init order
          const definition = await resolveRuntimePluginDefinition<TranscoderDefinition>('transcoder', entry);

          const rawOptions = entry.options ?? {};
          const validatedOptions = definition.optionsSchema ? definition.optionsSchema.parse(rawOptions) : rawOptions;

          // oxlint-disable-next-line no-await-in-loop -- Sequential to preserve init order
          const implementationAssets = definition.implementationAssets ?? [];
          // oxlint-disable-next-line no-await-in-loop -- Sequential to preserve transcoder verification/init order.
          await this.verifyImplementationAssets(entry.id, implementationAssets);
          // oxlint-disable-next-line no-await-in-loop -- Sequential to preserve transcoder verification/init order.
          const context = await definition.initialize(validatedOptions, transcoderRuntime);

          const { edges } = definition;

          this.loadedTranscoders.set(entry.id, {
            id: entry.id,
            definition,
            context,
            edges,
            options: validatedOptions,
            implementationAssets,
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
    let schema: JSONSchema7;
    try {
      schema = toJSONSchema(zodSchema, { target: 'draft-7' }) as JSONSchema7 & { $schema?: unknown };
      delete schema.$schema;
    } catch {
      this.logger.warn(`Failed to derive JSON Schema for ${label}`);
      schema = {};
    }

    const defaults = zodSchema.safeParse({});
    return {
      schema,
      defaults: defaults.success ? (defaults.data as Record<string, unknown>) : {},
    };
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
      contentKeys: readonly RuntimeContentKey[];
    };
    const kernelExports: KernelExport[] = [];

    for (const [kernelId, zodSchemas] of this.kernelExportZodSchemasMap) {
      const formats = Object.keys(zodSchemas) as FileExtension[];

      for (const format of formats) {
        const zodSchema = zodSchemas[format];
        const empty: { schema: JSONSchema7; defaults: Record<string, unknown> } = { schema: {}, defaults: {} };
        const { schema, defaults } = zodSchema ? this.deriveJsonSchema(zodSchema, `${kernelId}:${format}`) : empty;

        const contentKeys = new Set(this.kernelExportContentMap.get(kernelId)?.[format] ?? []);
        for (const { enabled, middleware } of this.getMiddleware()) {
          if (enabled) {
            for (const key of middleware.content?.exportFormats?.[format] ?? []) {
              contentKeys.add(key);
            }
          }
        }
        const content = this.buildContentCapability('export', [...contentKeys]);

        kernelExports.push({ kernelId, format, schema, defaults, contentKeys: [...contentKeys] });

        routes.push({
          targetFormat: format,
          kernelId,
          sourceFormat: format,
          fidelity: lookupExportFidelity(format),
          exportOptions: { schema, defaults },
          ...(content ? { content } : {}),
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

          const sourceSchemas = omitJsonSchemaProperties(cap, Object.keys(edge.sourceOptions ?? {}));
          const { schema, defaults } = mergeJsonSchemas(sourceSchemas, edgeSchemas, {
            a: `${cap.kernelId}:${edge.from}`,
            b: `${transcoder.id}:${edge.from}->${edge.to}`,
          });
          const edgeKeys = new Set(edge.content ?? []);
          const content = this.buildContentCapability(
            'export',
            cap.contentKeys.filter((key) => edgeKeys.has(key)),
          );

          routes.push({
            targetFormat: edge.to,
            kernelId: cap.kernelId,
            sourceFormat: edge.from,
            transcoderId: transcoder.id,
            fidelity: edge.fidelity,
            exportOptions: { schema, defaults },
            ...(content ? { content } : {}),
          });
        }
      }
    }

    const renderCapabilities: Record<
      string,
      {
        renderOptions: { schema: JSONSchema7; defaults: Record<string, unknown> };
        content?: { schema: JSONSchema7; defaults: RuntimeContentInput };
      }
    > = {};
    for (const kernelId of this.kernelRenderContentMap.keys()) {
      const zodSchema = this.kernelRenderZodSchemaMap.get(kernelId);
      const renderOptions = zodSchema
        ? this.deriveJsonSchema(zodSchema, `render:${kernelId}`)
        : { schema: {}, defaults: {} };
      const keys = new Set(this.kernelRenderContentMap.get(kernelId) ?? []);
      for (const { enabled, middleware } of this.getMiddleware()) {
        if (enabled) {
          for (const key of middleware.content?.render ?? []) {
            keys.add(key);
          }
        }
      }
      const content = this.buildContentCapability('render', [...keys]);
      renderCapabilities[kernelId] = { renderOptions, ...(content ? { content } : {}) };
    }

    const plugins = (
      [
        ['kernel', this.manifestKernelPlugins],
        ['middleware', this.middlewarePlugins],
        ['bundler', this.bundlerPlugins],
        ['transcoder', this.transcoderPlugins],
      ] as const
    ).flatMap(([kind, entries]) =>
      entries.map(({ id, peerRuntimeVersion, permissions }) => ({
        kind,
        id,
        ...(peerRuntimeVersion === undefined ? {} : { peerRuntimeVersion }),
        ...(permissions === undefined ? {} : { permissions }),
      })),
    );

    return { plugins, routes, renderCapabilities };
  }

  private buildContentCapability(
    operation: 'render' | 'export',
    keys: readonly RuntimeContentKey[],
  ): { schema: JSONSchema7; defaults: RuntimeContentInput } | undefined {
    if (keys.length === 0) {
      return undefined;
    }
    return {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: Object.fromEntries(
          keys.map((key) => [
            key,
            {
              type: 'boolean',
              description:
                key === 'includeEdges'
                  ? 'Include auxiliary visible edge overlays.'
                  : 'Include Tau CAD topology metadata.',
            },
          ]),
        ),
      },
      defaults: Object.fromEntries(keys.map((key) => [key, contentDefault(operation, key)])) as RuntimeContentInput,
    };
  }

  /**
   * Execute an export operation using the route planner algorithm:
   * 1. If the active kernel natively supports the format, export directly.
   * 2. Otherwise, filter precomputed manifest routes by active kernelId + targetFormat
   *    and execute the first viable route via the matching transcoder.
   * 3. Return an actionable error if no route succeeds.
   *
   * @param plan - Owner-bound export plan selected for this render artifact.
   * @param execution - Export input, runtime services, and settled render identity.
   * @returns The export result
   */
  // oxlint-disable-next-line complexity -- Multi-step route planner with fallback
  private async executeExportWithRoute(
    plan: Extract<OwnerBoundExportPlan, { success: true }>,
    execution: {
      readonly input: KernelExportGeometryInput;
      readonly runtime: KernelRuntime;
      readonly renderIdentity: RenderIdentity;
    },
  ): Promise<ExportGeometryResult> {
    const { input, runtime, renderIdentity } = execution;
    if (plan.route.kind === 'direct') {
      return this.onExportGeometryForOwner(
        plan.owner,
        this.withProviderRuntimeContent(
          { ...this.withoutRuntimeContent(input), format: plan.route.targetFormat, options: input.options },
          plan.route.content,
          this.getNativeExportContentKeys(plan.owner, plan.route.targetFormat),
        ),
        runtime,
      );
    }

    const transcoderRuntime: TranscoderRuntime = {
      logger: this.logger,
      tracer: this.tracer,
      signal: runtime.signal,
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
      ...this.withoutRuntimeContent(input),
      format: route.sourceFormat,
      options: route.sourceOptions,
    };
    const contributors = this.getSourceContentContributors(plan.owner, route);
    let sourceHandler: ExportGeometryHandler = async (handlerInput) =>
      this.onExportGeometryForOwner(
        plan.owner,
        this.withProviderRuntimeContent(
          { ...sourceInput, ...this.withoutRuntimeContent(handlerInput), options: handlerInput.options },
          route.content,
          this.getNativeExportContentKeys(plan.owner, route.sourceFormat),
        ),
        runtime,
      );
    if (contributors.length > 0) {
      const dependencies = [...renderIdentity.dependencies, plan.dependency];
      const dependencyHash = await this.computeDependencyHash(dependencies);
      for (let index = contributors.length - 1; index >= 0; index--) {
        const contributor = contributors[index]!;
        const inner = sourceHandler;
        const middlewareRuntime = createMiddlewareRuntime({
          signal: runtime.signal,
          onLog: this.onLog,
          middlewareName: contributor.middleware.name,
          filesystem: this.filesystem,
          dependencies,
          dependencyHash,
          stateSchema: contributor.middleware.stateSchema,
          options: contributor.options,
          logger: this.getMiddlewareLogger(contributor.id, contributor.middleware.name),
        });
        sourceHandler = async (handlerInput) => {
          try {
            return await contributor.middleware.wrapExportGeometry!(
              this.withProviderRuntimeContent(
                handlerInput,
                route.content,
                contributor.middleware.content?.exportFormats?.[route.sourceFormat] ?? [],
              ),
              inner,
              middlewareRuntime,
            );
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return createKernelError([
              {
                message: `Middleware error in ${contributor.middleware.name}: ${message}`,
                code: 'MIDDLEWARE_FAILED',
                type: 'kernel',
                severity: 'error',
              },
            ]);
          }
        };
      }
    }
    const kernelResult = await sourceHandler({
      format: route.sourceFormat,
      options: route.sourceOptions,
    });
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

    const middleware = await resolveRuntimePluginDefinition<KernelMiddleware>('middleware', entry);

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
    const checkOperationAbort = (): void => {
      (this.operationSignal ?? neverAbortedSignal).throwIfAborted();
    };

    function readFile(path: string, encoding: 'utf8'): Promise<string>;
    function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
    async function readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
      checkOperationAbort();
      const span = tracer.startSpan('fs.read', { path });
      try {
        const data = encoding ? await fileSystem.readFile(path, encoding) : await fileSystem.readFile(path);
        checkOperationAbort();
        return data;
      } finally {
        span.end();
      }
    }

    return createRuntimeFileSystem({
      id: 'runtime:kernel-worker-bridge',
      capabilities: fileSystem.capabilities,
      // oxlint-disable-next-line eslint/no-empty-function -- Underlying FS owns its lifecycle; the bridge is a stateless decorator with nothing to release.
      dispose() {},
      readFile,

      async exists(path: string): Promise<boolean> {
        checkOperationAbort();
        const span = tracer.startSpan('fs.exists', { path });
        try {
          const fileExists = await fileSystem.exists(path);
          checkOperationAbort();
          return fileExists;
        } finally {
          span.end();
        }
      },

      async readdir(path: string): Promise<string[]> {
        checkOperationAbort();
        const span = tracer.startSpan('fs.readdir', { path });
        try {
          const entries = await fileSystem.readdir(path);
          checkOperationAbort();
          return entries;
        } finally {
          span.end();
        }
      },

      async writeFile(path: string, data: Uint8Array<ArrayBuffer> | string): Promise<void> {
        checkOperationAbort();
        await fileSystem.writeFile(path, data);
        checkOperationAbort();
      },
      async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
        checkOperationAbort();
        await fileSystem.mkdir(path, options);
        checkOperationAbort();
      },
      async unlink(path: string): Promise<void> {
        checkOperationAbort();
        await fileSystem.unlink(path);
        checkOperationAbort();
      },
      async rmdir(path: string): Promise<void> {
        checkOperationAbort();
        await fileSystem.rmdir(path);
        checkOperationAbort();
      },
      async rename(oldPath: string, newPath: string): Promise<void> {
        checkOperationAbort();
        await fileSystem.rename(oldPath, newPath);
        checkOperationAbort();
      },
      async stat(path: string) {
        checkOperationAbort();
        const result = await fileSystem.stat(path);
        checkOperationAbort();
        return result;
      },
      async lstat(path: string) {
        checkOperationAbort();
        const result = await fileSystem.lstat(path);
        checkOperationAbort();
        return result;
      },
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
    content?: RuntimeContentInput;
    exportDependency?: ExportDependency;
    resolvedMiddleware?: ResolvedMiddleware[];
    dependencyContext?: DependencyResolutionContext;
    owner: OperationOwner;
  }): Promise<Dependency[]> {
    const executionList = input.resolvedMiddleware ?? this.getMiddleware();
    const executionListKey = canonicalJson({
      file: input.owner.file.filename,
      kernelId: input.owner.binding?.kernelId,
      kernelVersion: input.owner.binding?.kernelVersion,
      middleware: executionList
        .filter(({ enabled }) => enabled)
        .map(({ id, middleware, options }) => ({ id, version: middleware.version ?? '1', options })),
    });
    let baseDeps = input.dependencyContext?.baseDependenciesByExecutionList?.get(executionListKey);
    if (!baseDeps) {
      baseDeps = await this.computeBaseDependencies(input.owner, executionList);
      if (input.dependencyContext) {
        input.dependencyContext.baseDependenciesByExecutionList ??= new Map();
        input.dependencyContext.baseDependenciesByExecutionList.set(executionListKey, baseDeps);
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

    if (input.content !== undefined) {
      const contentDep: ContentDependency = {
        type: 'content',
        content: input.content as Record<string, boolean>,
      };
      runtimeDeps.push(contentDep);
    }

    if (input.exportDependency !== undefined) {
      runtimeDeps.push(input.exportDependency);
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
    const ownerFilePath = resolveVirtualPath(joinPath(owner.file.path, owner.file.filename));

    // 1. Discover file dependencies from kernel module
    const discoverSpan = this.tracer.startSpan('deps.discover');
    const discoverInput: GetDependenciesInput = {
      entryPath: ownerFilePath,
    };
    const depsResult = await this.onGetDependenciesForOwner(owner, discoverInput, this.createRuntime());
    const unresolvedPaths = [...new Set(depsResult.unresolved.map((path) => resolveVirtualPath(path)))];
    const absolutePaths = [...new Set(depsResult.resolved.map((path) => resolveVirtualPath(path)))];
    const previewCandidate = owner.kind === 'render-artifact' ? this.previewWatchCandidate : undefined;
    // Every render observes the paths its entry needs, including the ones that are missing;
    // only an admitted preview also carries them in its watch candidate.
    if (owner.kind === 'render-artifact') {
      for (const path of absolutePaths) {
        previewCandidate?.paths.set(path, fileChangeDebounce);
      }
      for (const path of unresolvedPaths) {
        previewCandidate?.paths.set(path, fileChangeDebounce);
        this.fileHashCache.set(path, 'missing');
      }
    }
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
        // oxlint-disable-next-line no-await-in-loop -- hashes are retained in deterministic dependency order
        this.fileHashCache.set(path, await this.hashContent(content));
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
    const middlewareDeclarations: MiddlewareDependencyDeclaration[] = [];
    for (const { middleware: mw, options: mwOptions, enabled, id } of middleware) {
      if (enabled && mw.getDependencies) {
        const getDeps = mw.getDependencies as unknown as (
          input: GetDependenciesInput,
          runtime: MiddlewareDependencyRuntime<Record<string, unknown>>,
        ) => MiddlewareDependencyDeclaration[] | Promise<MiddlewareDependencyDeclaration[]>;
        try {
          // oxlint-disable-next-line no-await-in-loop -- Sequential to preserve deterministic ordering
          const declarations = await getDeps(discoverInput, {
            signal: this.operationSignal ?? neverAbortedSignal,
            logger: this.getMiddlewareLogger(id, mw.name),
            filesystem: this.filesystem,
            options: mwOptions,
          });
          middlewareDeclarations.push(
            ...declarations.map((declaration) => ({
              ...declaration,
              path: resolveVirtualPath(declaration.path),
            })),
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw Object.assign(new Error(`Middleware dependency error in ${mw.name}: ${message}`), {
            issues: [
              {
                message: `Middleware dependency error in ${mw.name}: ${message}`,
                code: 'MIDDLEWARE_FAILED',
                type: 'kernel',
                severity: 'error',
              } satisfies KernelIssue,
            ],
          });
        }
      }
    }

    if (middlewareDeclarations.length > 0) {
      for (const declaration of middlewareDeclarations) {
        const filePath = resolveVirtualPath(declaration.path);
        const watchDebounce = declaration.watchDebounce ?? fileChangeDebounce;
        if (previewCandidate) {
          previewCandidate.paths.set(filePath, watchDebounce);
          previewCandidate.middlewarePaths.set(filePath, watchDebounce);
        }
        if (!this.fileHashCache.has(filePath)) {
          try {
            // oxlint-disable-next-line no-await-in-loop -- Individual reads to handle missing files gracefully
            const content = await this.filesystem.readFile(filePath);
            // oxlint-disable-next-line no-await-in-loop -- Individual hashes preserve deterministic dependency order.
            this.fileHashCache.set(filePath, await this.hashContent(content));
          } catch (error) {
            if (!isNotFoundError(error)) {
              throw error;
            }
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
      .filter(({ middleware: mw, enabled }) => enabled && mw.mutates !== false)
      .map(({ middleware: mw, options: mwOptions, id }, index) => ({
        type: 'middleware',
        id,
        version: mw.version ?? '1',
        index,
        options: mwOptions,
      }));

    // 4. Framework dependency
    const frameworkDep: FrameworkDependency = {
      type: 'framework',
      name: 'tau',
      version: packageVersion,
    };

    const activeKernelId = owner.binding?.kernelId;
    const activeKernelVersion = owner.binding?.kernelVersion;
    const kernelDeps: KernelDependency[] =
      activeKernelId && activeKernelVersion
        ? [{ type: 'kernel', id: activeKernelId, version: activeKernelVersion }]
        : [];

    // 5. Options dependencies (options are stable between renders, no sort needed)
    const selectedKernelOptions = activeKernelId ? (this.kernelInitOptionsMap.get(activeKernelId) ?? {}) : {};
    const optionDeps: OptionDependency[] = Object.entries(selectedKernelOptions).map(([key, value]) => ({
      type: 'option',
      key,
      value,
    }));

    // 6. Asset dependencies (fonts, WASM, etc.)
    const implementationAssets = activeKernelId ? (this.kernelImplementationAssetsMap.get(activeKernelId) ?? []) : [];
    const assetDeps: AssetDependency[] = implementationAssets.map((asset) => ({
      type: 'asset',
      name: `${activeKernelId}:${asset.id}`,
      contentHash: asset.sha256,
    }));

    if (previewCandidate) {
      previewCandidate.coherent = true;
    }

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
  private createBundlerFacade(signal: AbortSignal): KernelBundler {
    const facade: KernelBundler = {
      bundle: async (entryPath: string): Promise<BundleResult> => {
        signal.throwIfAborted();
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

        const bundleResult = await bundler.definition.bundle({ entryPath }, { signal }, bundler.ctx);
        signal.throwIfAborted();
        bundleSpan.end();
        this.bundleResultCache.set(entryPath, bundleResult);
        return bundleResult;
      },
      resolveDependencies: async (entryPath: string): Promise<GetDependenciesResult> => {
        const cached = this.bundleResultCache.get(entryPath);
        if (cached) {
          return { resolved: cached.dependencies, unresolved: cached.unresolvedPaths };
        }

        const result = await facade.bundle(entryPath);
        return { resolved: result.dependencies, unresolved: result.unresolvedPaths };
      },
      registerModule: (name: string, entry: BuiltinModule): void => {
        if (this.loadedBundlers.size > 0) {
          for (const bundler of new Set(this.loadedBundlers.values())) {
            bundler.definition.registerModule({ name, module: entry }, bundler.ctx);
          }
        } else {
          this.pendingModuleRegistrations.set(name, entry);
        }
      },
    };

    return facade;
  }

  /**
   * Create a KernelRuntime for use in kernel methods.
   * Provides filesystem, logger, bundler, and execute services.
   * The bundler is lazily initialised -- kernels that never call it pay zero cost.
   *
   * @returns KernelRuntime instance
   */
  private createRuntime(signal = this.operationSignal ?? neverAbortedSignal): KernelRuntime {
    return {
      signal,
      filesystem: this.filesystem,
      logger: this.logger,
      fileContentCache: this.fileContentCache,
      bundler: this.createBundlerFacade(signal),
      execute: async (code: string): Promise<ExecuteResult> => {
        signal.throwIfAborted();
        await this.ensureBundlerContext();

        const executeSpan = this.tracer.startSpan('kernel.execute', {
          phase: 'computingGeometry',
        });
        const firstBundler = this.loadedBundlers.values().next().value!;
        const result = await firstBundler.definition.execute({ code }, { signal }, firstBundler.ctx);
        signal.throwIfAborted();
        executeSpan.end();
        return result;
      },
      tracer: this.tracer,
      emitEvent: () => {
        throw new Error('Kernel events require a selected kernel runtime.');
      },
    };
  }

  /**
   * Get or create a cached logger for a middleware by stable plugin id.
   *
   * @param middlewareId - stable cache key for the middleware plugin
   * @param middlewareName - display name used as the log origin
   * @returns a logger scoped to the given middleware
   */
  private getMiddlewareLogger(middlewareId: string, middlewareName: string): RuntimeLogger {
    let logger = this.middlewareLoggerCache.get(middlewareId);
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
      this.middlewareLoggerCache.set(middlewareId, logger);
    }

    return logger;
  }

  private async hashContent(content: Uint8Array<ArrayBuffer>): Promise<string> {
    return sha256Bytes(content);
  }

  /**
   * Select the active file and express it relative to the virtual root.
   *
   * @param file - The geometry file being processed
   */
  private setActiveFile(file: RuntimeFileLocator): void {
    const localFilePath = resolveVirtualPath(joinPath(file.path, file.filename));
    if (this.activeFilePath === localFilePath) {
      return;
    }

    this.activeFilePath = localFilePath;
  }

  /**
   * Overlay validated source-export construction values onto render defaults.
   *
   * Only fields declared by the render schema cross the create boundary.
   *
   * @param renderOptions - Validated render defaults for this request.
   * @param exportOptions - Validated selected source-format options, when exporting.
   * @param owner - Kernel owner used to resolve and validate the render schema.
   * @returns Resolved construction values or structured validation issues.
   */
  private resolveCreateOptions(
    renderOptions: Record<string, unknown>,
    exportOptions: Record<string, unknown> | undefined,
    owner: OperationOwner,
  ):
    | { success: true; input: Pick<NativeBuildInput, 'options'> | Record<never, never> }
    | { success: false; issues: KernelIssue[] } {
    const kernelId = owner.binding?.kernelId;
    const createSchema = kernelId ? this.kernelCreateOptionsZodSchemaMap.get(kernelId) : undefined;
    if (!createSchema) {
      return { success: true, input: {} };
    }

    const createKeys = Object.keys(createSchema.shape);
    const candidate = deepmerge(
      pickRecordProperties(renderOptions, createKeys),
      pickRecordProperties(exportOptions ?? {}, createKeys),
      {
        arrayMerge: (_target: unknown[], source: unknown[]) => source,
      },
    );
    const parseResult = createSchema.safeParse(candidate);
    if (parseResult.success) {
      return { success: true, input: { options: parseResult.data } };
    }
    return {
      success: false,
      issues: parseResult.error.issues.map((issue) => ({
        message: `Create option validation failed: ${issue.path.join('.')} — ${issue.message}`,
        code: 'RUNTIME',
        severity: 'error',
      })),
    };
  }

  private async computeNativeHandleKey(input: {
    owner: OperationOwner;
    parameters: Record<string, unknown>;
    renderOptions: Record<string, unknown>;
    exportOptions?: Record<string, unknown>;
    content: RuntimeContentInput;
  }): Promise<{ success: true; key: string } | { success: false; issues: KernelIssue[] }> {
    const createOptions = this.resolveCreateOptions(input.renderOptions, input.exportOptions, input.owner);
    if (!createOptions.success) {
      return createOptions;
    }
    const dependencies = await this.computeDependencies({
      parameters: input.parameters,
      resolvedMiddleware: this.getCreateExecutionList(input.owner, input.content, input.exportOptions !== undefined),
      owner: input.owner,
    });
    if ('options' in createOptions.input) {
      dependencies.push({ type: 'option', key: 'native-build-options', value: createOptions.input.options });
    }
    return { success: true, key: await this.computeDependencyHash(dependencies) };
  }

  private artifactMatchesNativeBuild(
    artifact: MaterializedRender,
    owner: OperationOwner,
    nativeHandleKey: string,
  ): boolean {
    return (
      artifact.identity.nativeHandleKey === nativeHandleKey &&
      artifact.identity.selectedKernelId === owner.binding?.kernelId &&
      artifact.identity.selectedKernelVersion === owner.binding?.kernelVersion
    );
  }

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

  private getNativeRenderContentKeys(owner: OperationOwner): readonly RuntimeContentKey[] {
    return owner.binding?.kernelId ? (this.kernelRenderContentMap.get(owner.binding.kernelId) ?? []) : [];
  }

  private getRenderContentKeys(owner: OperationOwner): readonly RuntimeContentKey[] {
    const keys = new Set(this.getNativeRenderContentKeys(owner));
    for (const { enabled, middleware } of this.getMiddleware()) {
      if (enabled) {
        for (const key of middleware.content?.render ?? []) {
          keys.add(key);
        }
      }
    }
    return [...keys];
  }

  private getNativeExportContentKeys(owner: OperationOwner, format: FileExtension): readonly RuntimeContentKey[] {
    return owner.binding?.kernelId ? (this.kernelExportContentMap.get(owner.binding.kernelId)?.[format] ?? []) : [];
  }

  private getExportContentKeys(owner: OperationOwner, format: FileExtension): readonly RuntimeContentKey[] {
    const keys = new Set(this.getNativeExportContentKeys(owner, format));
    for (const { enabled, middleware } of this.getMiddleware()) {
      if (enabled) {
        for (const key of middleware.content?.exportFormats?.[format] ?? []) {
          keys.add(key);
        }
      }
    }
    return [...keys];
  }

  private validateRuntimeContent(
    operation: 'render' | 'export',
    supported: readonly RuntimeContentKey[],
    content: RuntimeContentInput | undefined,
  ): { success: true; content: RuntimeContentInput } | { success: false; issues: KernelIssue[] } {
    try {
      return { success: true, content: normalizeRuntimeContent(operation, supported, content) };
    } catch (error) {
      if (!(error instanceof RuntimeContentUnsupportedError)) {
        throw error;
      }
      return {
        success: false,
        issues: [
          {
            message: error.message,
            code: error.code,
            type: 'runtime',
            severity: 'error',
          },
        ],
      };
    }
  }

  private projectRuntimeContent(
    content: RuntimeContentInput | undefined,
    keys: readonly RuntimeContentKey[],
  ): RuntimeContentInput {
    return Object.fromEntries(keys.map((key) => [key, content?.[key] ?? false])) as RuntimeContentInput;
  }

  private withoutRuntimeContent<Input extends Record<PropertyKey, unknown>>(input: Input): Omit<Input, 'content'> {
    const { content: _content, ...rest } = input as Input & { readonly content?: RuntimeContentInput };
    return rest;
  }

  private withProviderRuntimeContent<Input extends Record<PropertyKey, unknown>>(
    input: Input,
    canonicalContent: RuntimeContentInput,
    keys: readonly RuntimeContentKey[],
  ): Omit<Input, 'content'> & { readonly content?: RuntimeContentInput } {
    const rest = this.withoutRuntimeContent(input);
    return keys.length === 0 ? rest : { ...rest, content: this.projectRuntimeContent(canonicalContent, keys) };
  }

  private getCreateExecutionList(
    owner: OperationOwner,
    content: RuntimeContentInput,
    exportOperation: boolean,
  ): ResolvedMiddleware[] {
    return this.getMiddleware().filter((resolved) => {
      if (
        !resolved.enabled ||
        (!resolved.middleware.wrapCreateGeometry && !this.middlewareOnlyDeclaresDependencies(resolved.middleware))
      ) {
        return false;
      }
      if (exportOperation) {
        return resolved.middleware.content === undefined;
      }
      if (
        this.kernelHasMeshPhaseForOwner(owner) &&
        resolved.middleware.content?.render &&
        resolved.middleware.wrapMeshGeometry
      ) {
        return false;
      }
      return this.middlewareRunsForRender(resolved, owner, content);
    });
  }

  private middlewareOnlyDeclaresDependencies(middleware: KernelMiddleware): boolean {
    return (
      Boolean(middleware.getDependencies) &&
      !middleware.wrapGetParameters &&
      !middleware.wrapCreateGeometry &&
      !middleware.wrapMeshGeometry &&
      !middleware.wrapExportGeometry
    );
  }

  private getMeshExecutionList(owner: OperationOwner, content: RuntimeContentInput): ResolvedMiddleware[] {
    return this.getMiddleware().filter(
      (resolved) =>
        resolved.enabled &&
        Boolean(resolved.middleware.wrapMeshGeometry) &&
        this.middlewareRunsForRender(resolved, owner, content),
    );
  }

  private getOuterExportExecutionList(plan: Extract<OwnerBoundExportPlan, { success: true }>): ResolvedMiddleware[] {
    return this.getMiddleware().filter(
      (resolved) =>
        resolved.enabled &&
        Boolean(resolved.middleware.wrapExportGeometry) &&
        this.middlewareRunsInOuterExport(resolved, plan),
    );
  }

  private getExportExecutionList(plan: Extract<OwnerBoundExportPlan, { success: true }>): ResolvedMiddleware[] {
    const create = this.getCreateExecutionList(plan.owner, plan.route.content, true);
    const sourceContributors =
      plan.route.kind === 'transcoded' ? this.getSourceContentContributors(plan.owner, plan.route) : [];
    return this.mergeExecutionLists(create, sourceContributors, this.getOuterExportExecutionList(plan));
  }

  private mergeExecutionLists(...lists: readonly ResolvedMiddleware[][]): ResolvedMiddleware[] {
    const ids = new Set(lists.flatMap((list) => list.map(({ id }) => id)));
    return this.getMiddleware().filter(({ id }) => ids.has(id));
  }

  private middlewareRunsForRender(
    resolved: ResolvedMiddleware,
    owner: OperationOwner,
    content: RuntimeContentInput,
  ): boolean {
    const declared = resolved.middleware.content?.render;
    if (!declared) {
      return true;
    }
    const native = new Set(this.getNativeRenderContentKeys(owner));
    return declared.some((key) => content[key] === true && !native.has(key));
  }

  private middlewareRunsInOuterExport(
    resolved: ResolvedMiddleware,
    plan: Extract<OwnerBoundExportPlan, { success: true }>,
  ): boolean {
    const declarations = resolved.middleware.content?.exportFormats;
    if (!declarations) {
      return true;
    }
    if (plan.route.kind === 'transcoded') {
      return false;
    }
    const declared = declarations[plan.route.targetFormat] ?? [];
    const native = new Set(this.getNativeExportContentKeys(plan.owner, plan.route.targetFormat));
    return declared.some((key) => plan.route.content[key] === true && !native.has(key));
  }

  private getSourceContentContributors(
    owner: OperationOwner,
    route: Extract<OwnerBoundExportRoute, { kind: 'transcoded' }>,
  ): ResolvedMiddleware[] {
    return this.getContentContributors(owner, route.sourceFormat, route.content);
  }

  private getContentContributors(
    owner: OperationOwner,
    format: FileExtension,
    content: RuntimeContentInput,
  ): ResolvedMiddleware[] {
    const native = new Set(this.getNativeExportContentKeys(owner, format));
    return this.getMiddleware().filter(({ enabled, middleware }) => {
      if (!enabled || !middleware.wrapExportGeometry) {
        return false;
      }
      return (middleware.content?.exportFormats?.[format] ?? []).some(
        (key) => content[key] === true && !native.has(key),
      );
    });
  }

  private describeContentContributors(
    owner: OperationOwner,
    format: FileExtension,
    content: RuntimeContentInput,
  ): NonNullable<NonNullable<ExportDependency['route']>['contentContributors']> {
    const allMiddleware = this.getMiddleware();
    return this.getContentContributors(owner, format, content).map((resolved) => ({
      id: resolved.id,
      version: resolved.middleware.version ?? '1',
      index: allMiddleware.indexOf(resolved),
      options: resolved.options,
    }));
  }

  private async computeDependencyHash(dependencies: readonly Dependency[]): Promise<string> {
    const contentHashSpan = this.tracer.startSpan('deps.content-hash');
    const hex = await sha256String(canonicalJson(dependencies));
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
  owners?: { readonly a: string; readonly b: string },
): { schema: JSONSchema7; defaults: Record<string, unknown> } {
  const resolvedOwners = owners ?? { a: 'source schema', b: 'target schema' };
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

  const bUnionKey = b.schema.anyOf ? 'anyOf' : b.schema.oneOf ? 'oneOf' : undefined;
  if (bUnionKey) {
    const branches = b.schema[bUnionKey] ?? [];
    return {
      schema: {
        ...b.schema,
        [bUnionKey]: branches.map((branch) => {
          if (typeof branch !== 'object') {
            throw new TypeError(`Cannot merge ${resolvedOwners.a} into a boolean ${resolvedOwners.b} branch.`);
          }
          return mergeJsonSchemas(a, { schema: branch, defaults: b.defaults }, resolvedOwners).schema;
        }),
      },
      defaults: { ...a.defaults, ...b.defaults },
    };
  }

  const aProps = a.schema.properties ?? {};
  const bProps = b.schema.properties ?? {};
  const collisions = Object.keys(aProps).filter((key) => key in bProps);
  if (collisions.length > 0) {
    throw new Error(
      `Export option schema collision between ${resolvedOwners.a} and ${resolvedOwners.b}: ${collisions.join(', ')}. ` +
        "Rename one owner's option or pin the source option on the transcoder edge.",
    );
  }
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

function collectJsonSchemaProperties(schema: JSONSchema7): Record<string, unknown> {
  const properties: Record<string, unknown> = { ...schema.properties };
  for (const branch of [...(schema.anyOf ?? []), ...(schema.oneOf ?? [])]) {
    if (typeof branch === 'object') {
      Object.assign(properties, collectJsonSchemaProperties(branch));
    }
  }
  return properties;
}

function omitJsonSchemaProperties(
  input: { schema: JSONSchema7; defaults: Record<string, unknown> },
  keys: readonly string[],
): { schema: JSONSchema7; defaults: Record<string, unknown> } {
  if (keys.length === 0) {
    return input;
  }
  const omitted = new Set(keys);
  const properties = Object.fromEntries(
    Object.entries(input.schema.properties ?? {}).filter(([key]) => !omitted.has(key)),
  );
  const required = (input.schema.required ?? []).filter((key) => !omitted.has(key));
  const defaults = Object.fromEntries(Object.entries(input.defaults).filter(([key]) => !omitted.has(key)));
  return {
    schema: {
      ...input.schema,
      properties,
      ...(required.length > 0 ? { required } : { required: undefined }),
    },
    defaults,
  };
}

function pickRecordProperties(input: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const selected = new Set(keys);
  return Object.fromEntries(Object.entries(input).filter(([key]) => selected.has(key)));
}
