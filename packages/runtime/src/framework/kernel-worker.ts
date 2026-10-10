/* eslint-disable @typescript-eslint/member-ordering -- operation entrypoints stay adjacent to their private lane implementations in this stateful worker. */
/* oxlint-disable unicorn/prefer-math-trunc, no-bitwise -- cancellation generations require ECMAScript ToUint32 wrap semantics. */
import deepmerge from 'deepmerge';
import { logLevels, lookupExportFidelity } from '@taucad/types/constants';
import { randomUuid } from '@taucad/utils/id';
import { assertRootedPath, joinRelativePath } from '@taucad/utils/path';
import { named, preserveMethodNames } from '#framework/named.js';
import { admitKernelOptions } from '#framework/kernel-option-admission.js';
import { getIsolationStatus } from '#cross-origin-isolation/headers.js';
import type { FileExtension, FileStat, MediaType, OnWorkerLog } from '@taucad/types';
import type { JSONSchema7, JSONSchema7Definition } from '@taucad/json-schema';
import type { MessagePortLike } from '@taucad/rpc';
import type {
  CreateGeometryResult,
  ExportGeometryResult,
  GetParameterDeclarationsResult,
  GetParametersResult,
  KernelIssue,
  CapabilitiesManifest,
  ExportRoute,
  RuntimeCapabilityRegistration,
  SourceRevision,
} from '#types/runtime.types.js';
import type { ComputeBinding, KernelComputeCapability } from '#types/runtime-compute.types.js';
import type {
  KernelFileSystem,
  RuntimeFileSystemBase,
  KernelRuntime,
  RuntimeLogger,
  InitializeInput,
  GetParametersInput,
  GetDependenciesInput,
  ExportGeometryInput,
  ExportGeometryRequest,
  KernelExportGeometryInput,
  RuntimeImplementationAsset,
} from '#types/runtime-kernel.types.js';
import type { RuntimeFileLocator } from '#types/runtime-file.types.js';
import type { RuntimeDocumentProtocol } from '#types/runtime-document-protocol.types.js';
import type {
  Description,
  Evaluation,
  ExportOffer,
  ExportResult,
  Rendering,
  ViewOffer,
} from '#client/runtime-document.types.js';
import type { KernelMiddlewareRuntime } from '#types/runtime-middleware.types.js';
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
import type { TelemetryEntry, RuntimeSourceSnapshotArgs, RuntimeTranscodeArgs } from '#types/runtime-wire.types.js';
import type {
  RuntimeSourceSnapshotFileRole,
  RuntimeSourceSnapshotResult,
} from '#types/runtime-source-snapshot.types.js';
import { abortReason as abortReasonEnum } from '#types/runtime-wire.types.js';
import type {
  TranscodeResult,
  TranscoderDefinition,
  TranscoderEdge,
  TranscoderRuntime,
} from '#types/runtime-transcoder.types.js';
import { setAbortContext, clearAbortContext } from '#framework/cooperative-abort.js';
import {
  beginDocumentAbort,
  documentAbortGeneration,
  documentAbortView,
  endDocumentAbort,
  nextDocumentAbortSequence,
} from '#framework/document-abort-state.js';
import { createRuntimeFileSystem } from '#filesystem/create-runtime-filesystem.js';
import { createComputeCapabilityHost } from '#cache/kernel-compute-runtime.js';
import type { ComputeCapabilityHost } from '#cache/kernel-compute-runtime.js';
import { toJSONSchema, z } from 'zod';
import { createKernelError } from '#kernels/kernel-helpers.js';
import { fileChangeDebounce } from '#framework/runtime-framework.constants.js';
import { canonicalJson, sha256Bytes, sha256String } from '@taucad/utils/hash';
import { contentDigest } from '@taucad/cache-core';
import type { ContentDigest } from '@taucad/cache-core';
import { RuntimeTracer } from '#framework/runtime-tracer.js';
import { WorkerTelemetryCollector } from '#framework/worker-telemetry.js';
import { createMiddlewareRuntime } from '#middleware/runtime-middleware.js';
import type {
  EvaluateRequest,
  KernelMiddlewareV2,
  MiddlewareContent,
  MiddlewareDependency as MiddlewareFileDependency,
  RenderRequest,
  ExportRequest,
} from '#types/runtime-middleware-v2.types.js';
import { nonemptyExportFiles } from '#types/runtime-kernel-v2.types.js';
import { asKnownArtifact } from '#types/runtime-artifact.js';
import type {
  DescribeInput,
  DescribeResult,
  EvaluateResult,
  KernelOffers,
  RenderResult,
  KernelExportResult,
} from '#types/runtime-kernel-v2.types.js';
import type { BundlerPlugin, KernelPlugin, MiddlewarePlugin, TranscoderPlugin } from '#plugins/plugin-types.js';
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
import {
  admitParameterManifest,
  compileParameterManifest,
  ParameterAdmissionError,
  resolveParameterBinding,
  resolveParameterInputValues,
} from '@taucad/parameters';
import type {
  ParameterAdmissionExpectation,
  ParameterDeclaration,
  ParameterManifest,
  ParameterResolutionOptions,
} from '@taucad/parameters';
import { validateJsonSchemaValue } from '@taucad/parameters/schema';
import type {
  DependencyResolutionContext,
  EvaluationSlot,
  CommonDependencySet,
  MiddlewareDependencySet,
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
import { createNativeHandleIdentityKey, nativeBuildInputSymbol } from '#framework/render-artifact.js';
import { finalizeExportArtifactSet } from '#framework/export-artifact-finalizer.js';
import { isNotFoundError } from '#filesystem/filesystem-errors.js';
import { loadWasmBinary } from '#framework/wasm-loader.js';

type FileSystemProxy = WorkerFileSystemProxy;

type ObservedFileRevision = {
  readonly hash: string;
  readonly content?: Uint8Array<ArrayBuffer>;
  readonly expectedPrior?: Readonly<{ hash: string | undefined }>;
};

/** The paths one settled dependency set was resolved from, and whether they feed parameter extraction. */
type DependencyPaths = {
  readonly paths: ReadonlySet<string>;
  readonly affectsParameters: boolean;
};

type DocumentInput = RuntimeDocumentProtocol['notifies']['open']['args'];
type DocumentUpdateInput = RuntimeDocumentProtocol['notifies']['update']['args'];
type ViewOpenInput = RuntimeDocumentProtocol['notifies']['openView']['args'];
type ViewUpdateInput = RuntimeDocumentProtocol['notifies']['updateView']['args'];
type DocumentRecord = {
  readonly id: string;
  file: RuntimeFileLocator;
  intent: number;
  parameters: Record<string, unknown>;
  evaluateOptions: Record<string, unknown>;
  committedParameters: Record<string, unknown>;
  committedEvaluateOptions: Record<string, unknown>;
  watch: boolean;
  closed: boolean;
  current?: DocumentEvaluation;
  committed?: DocumentEvaluation;
  pendingCommitted?: CommittedAdmission;
  evaluationController?: AbortController;
  readonly views: Map<string, ViewRecord>;
  readonly operations: Set<AbortController>;
  watchPaths: Set<string>;
};
type CommittedAdmission = {
  readonly intent: number;
  readonly completion: PromiseWithResolvers<DocumentEvaluation>;
  pins: number;
  evaluation?: DocumentEvaluation;
};
type DocumentEvaluation = {
  readonly id: string;
  readonly intent: number;
  readonly transient: boolean;
  readonly result: Evaluation;
  readonly artifact?: MaterializedRender;
  projections?: Map<string, RenderResult>;
};
type ViewRecord = {
  readonly document: DocumentRecord;
  readonly id: string;
  requestId: string;
  view?: string;
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- Null explicitly clears an instance on view update.
  instance?: string | null;
  options: Record<string, unknown>;
  content?: RuntimeContentInput;
  readonly operations: Set<AbortController>;
};

/** Preserve a missing optional dependency as a wire revision token. @internal */
export const sourceRevisionFileDigest = (contentHash: string, path: string): ContentDigest | 'missing' =>
  contentHash === 'missing'
    ? 'missing'
    : contentDigest({
        value: `sha256:${contentHash}`,
        name: `document evaluation ${path}`,
      });

const sourceRevisionForArtifact = (artifact: MaterializedRender, fallback?: SourceRevision): SourceRevision => {
  const entry = assertRootedPath(joinRelativePath(artifact.identity.file.path, artifact.identity.file.filename));
  const files = Object.fromEntries<ContentDigest | 'missing'>([
    ...Object.entries(fallback?.files ?? {}),
    ...artifact.identity.dependencies.flatMap((dependency) =>
      dependency.type === 'file'
        ? [[dependency.path, sourceRevisionFileDigest(dependency.contentHash, dependency.path)] as const]
        : [],
    ),
  ]);
  return { entry, files };
};

const neverAbortedSignal = new AbortController().signal;
/**
 * The minimum a row must satisfy to survive the runtime protocol's own
 * `kernelIssueSchema`. `code` is deliberately absent: the transport repairs an
 * unknown code, but nothing downstream can invent a `severity`, and a row
 * without one is dropped by the receiving channel rather than reported.
 * `looseObject` keeps `location`, `stack` and `details` intact. `min(1)`
 * because an empty `issues` array explains nothing: the error's own message is
 * strictly more informative than no issue at all.
 */
const kernelIssuesSchema = z
  .array(
    z.looseObject({
      message: z.string(),
      severity: z.enum(['error', 'warning', 'info']),
    }),
  )
  .min(1);

/** Joined issue messages for a terminal state's `detail`, or nothing to say. */
const issueDetail = (issues: readonly KernelIssue[]): string | undefined =>
  issues.map((issue) => issue.message).join('; ') || undefined;

const mergeParameterDefaults = (
  defaults: Record<string, unknown>,
  parameters: Record<string, unknown>,
  schema?: JSONSchema7,
): Record<string, unknown> =>
  deepmerge(
    defaults,
    // Admission drops an empty `properties` map and refuses `patternProperties`, so a closed schema without
    // `properties` declares no keys at all.
    schema?.additionalProperties === false
      ? Object.fromEntries(Object.entries(parameters).filter(([key]) => Object.hasOwn(schema.properties ?? {}, key)))
      : parameters,
    {
      arrayMerge: (_target: unknown[], source: unknown[]) => source,
    },
  );

const unitBearingTextPattern = /^\s*[+-]?(?:(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|\d+\s*\/\s*\d+)\s*[^\d\s.,].*$/u;

const schemaObject = (definition: JSONSchema7Definition | undefined): JSONSchema7 | undefined =>
  typeof definition === 'object' ? definition : undefined;

const schemaIsNumeric = (schema: JSONSchema7 | undefined): boolean => {
  if (!schema) {
    return false;
  }
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  return (
    types.includes('number') ||
    types.includes('integer') ||
    [...(schema.allOf ?? []), ...(schema.anyOf ?? []), ...(schema.oneOf ?? [])].some((branch) =>
      schemaIsNumeric(schemaObject(branch)),
    )
  );
};

const childSchema = (schema: JSONSchema7 | undefined, key: string, arrayItem: boolean): JSONSchema7 | undefined => {
  if (!schema) {
    return undefined;
  }
  const direct = arrayItem
    ? Array.isArray(schema.items)
      ? schemaObject(schema.items[Number(key)])
      : schemaObject(schema.items)
    : schemaObject(schema.properties?.[key]);
  if (direct) {
    return direct;
  }
  for (const branch of [...(schema.allOf ?? []), ...(schema.anyOf ?? []), ...(schema.oneOf ?? [])]) {
    const child = childSchema(schemaObject(branch), key, arrayItem);
    if (child) {
      return child;
    }
  }
  return undefined;
};

const unitlessTextParameter = (
  manifest: ParameterManifest,
  schema: JSONSchema7,
  values: Readonly<Record<string, unknown>>,
): { pointer: string; text: string } | undefined => {
  const visit = (
    value: unknown,
    node: JSONSchema7 | undefined,
    pointer: string,
  ): { pointer: string; text: string } | undefined => {
    if (typeof value === 'string') {
      if (node && validateJsonSchemaValue(node, value)) {
        return undefined;
      }
      return schemaIsNumeric(node) &&
        resolveParameterBinding(manifest, pointer)?.unit === undefined &&
        unitBearingTextPattern.test(value)
        ? { pointer, text: value }
        : undefined;
    }
    if (typeof value !== 'object' || value === null) {
      return undefined;
    }
    const arrayItem = Array.isArray(value);
    for (const [key, child] of Object.entries(value)) {
      const escaped = key.replaceAll('~', '~0').replaceAll('/', '~1');
      const found = visit(child, childSchema(node, key, arrayItem), `${pointer}/${escaped}`);
      if (found) {
        return found;
      }
    }
    return undefined;
  };
  return visit(values, schema, '');
};

type TranscoderPluginEntry = TranscoderPlugin<Record<string, unknown>> &
  RuntimePluginDefinitionCarrier<TranscoderDefinition>;

/** Runtime plugins and host services available to one worker. */
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
  initialized: boolean;
  initialization?: Promise<unknown>;
  edges: readonly TranscoderEdge[];
  options: Record<string, unknown>;
  implementationAssets: readonly RuntimeImplementationAsset[];
};

/** Identity retained for the last settled render. */
export type LastSettledRenderIdentity = RenderIdentity;

type OwnerBoundExportRoute =
  | {
      kind: 'direct';
      kernelId: string | undefined;
      targetFormat: string;
      exportId?: string;
      options: Record<string, unknown>;
      content: RuntimeContentInput;
    }
  | {
      kind: 'transcoded';
      kernelId: string;
      sourceFormat: string;
      targetFormat: string;
      exportId?: string;
      transcoderId: string;
      sourceOptions: Record<string, unknown>;
      edgeOptions: Record<string, unknown>;
      content: RuntimeContentInput;
    };

type OwnerBoundExportPlan =
  | {
      success: true;
      owner: OperationOwner;
      input: ExportPipelineRequest;
      route: OwnerBoundExportRoute;
      dependency: ExportDependency;
    }
  | {
      success: false;
      result: ExportGeometryResult;
    };

type ExportPipelineRequest = ExportGeometryRequest & { readonly content?: RuntimeContentInput };

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
type RuntimeMiddlewareDefinition = KernelMiddlewareV2<
  z.ZodObject<z.ZodRawShape>,
  z.ZodObject<z.ZodRawShape>,
  MiddlewareContent | undefined
>;

/** A middleware definition paired with its admitted runtime options. */
export type ResolvedMiddleware = {
  middleware: RuntimeMiddlewareDefinition;
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

  /** Callback for pushing updated capabilities manifest to the dispatcher. */
  public onCapabilitiesUpdated?: (capabilities: CapabilitiesManifest) => void;

  /** Document notifications are public values; the dispatcher owns binary encoding. */
  public onDescribed?: (event: RuntimeDocumentProtocol['notifies']['described']['args']) => void;
  public onEvaluating?: (event: RuntimeDocumentProtocol['notifies']['evaluating']['args']) => void;
  public onEvaluated?: (event: RuntimeDocumentProtocol['notifies']['evaluated']['args']) => void;
  public onRendering?: (event: RuntimeDocumentProtocol['notifies']['rendering']['args']) => void;
  public onRendered?: (
    event: {
      readonly subscriptionId: string;
      readonly intent: number;
    } & Rendering,
  ) => void;
  public onDocumentProgressUpdate?: (event: RuntimeDocumentProtocol['notifies']['progress']['args']) => void;
  public onDocumentError?: (event: RuntimeDocumentProtocol['notifies']['errorEvent']['args']) => void;
  public onDocumentStateChanged?: (event: RuntimeDocumentProtocol['notifies']['stateChanged']['args']) => void;

  /** Raw Zod schemas for runtime validation, keyed by kernel ID → format. Populated from kernel definitions. */
  protected readonly kernelExportZodSchemasMap = new Map<string, Partial<Record<string, z.ZodType>>>();
  protected readonly kernelAmbiguousExportFormatsMap = new Map<string, Set<string>>();

  /** Raw Zod schema for render option validation, keyed by kernel ID. Populated from kernel definitions. */
  protected readonly kernelRenderZodSchemaMap = new Map<string, z.ZodType>();
  protected get deferRenderOptionAdmission(): boolean {
    return false;
  }

  /** Exact construction-option schemas keyed by kernel ID. */
  protected readonly kernelCreateOptionsZodSchemaMap = new Map<string, z.ZodObject<z.ZodRawShape>>();

  /** Native content declarations keyed by kernel ID and export format. */
  protected readonly kernelExportContentMap = new Map<string, Partial<Record<string, readonly RuntimeContentKey[]>>>();
  /** Export IDs and media types selected by the current client's extension route. */
  protected readonly kernelExportMetadataMap = new Map<
    string,
    Readonly<Record<string, { id: string; mimeType: MediaType }>>
  >();

  /** Native render content declarations keyed by kernel ID. */
  protected readonly kernelRenderContentMap = new Map<string, readonly RuntimeContentKey[]>();
  /** Admission union before evaluation chooses the offered default view. */
  protected readonly kernelAllViewContentMap = new Map<string, readonly RuntimeContentKey[]>();
  /** Current client's selected default view media type for keyed middleware admission. */
  protected readonly kernelRenderMimeTypeMap = new Map<string, MediaType>();
  /** Cooperative cancellation support by kernel ID. */
  protected readonly kernelCancellationMap = new Map<string, 'cooperative'>();

  /** Validated init options and verified assets for selected-participant identity. */
  protected readonly kernelInitOptionsMap = new Map<string, Record<string, unknown>>();
  protected readonly kernelImplementationAssetsMap = new Map<string, readonly RuntimeImplementationAsset[]>();

  protected pendingNativeHandle: unknown;

  /** The evaluation currently entering its terminal kernel hook. */
  private activeEvaluationSlot: EvaluationSlot | undefined;
  private nextEvaluationId = 0;
  /** Latest admitted evaluation, whether or not its display projection succeeded. */
  private retainedEvaluation: EvaluationSlot | undefined;

  /**
   * Live native handles this worker owns, mapped to the owner that can release
   * them. A handle enters on creation (`createGeometry`, snapshot restore) and
   * leaves when no worker field references it any more — see
   * {@link disposeUnreachableNativeHandles}.
   */
  private readonly ownedNativeHandles = new Map<number, { slot: EvaluationSlot; handle: unknown }>();

  /** Fully initialized bundlers keyed by file extension. Shared context across extensions of the same bundler. */
  protected loadedBundlers = new Map<string, { definition: BundlerDefinition; ctx: unknown }>();

  /** Worker-owned runtime middleware plugins. */
  protected middlewarePlugins: readonly MiddlewarePlugin[];

  /** Worker-owned runtime bundler plugins. */
  protected bundlerPlugins: readonly BundlerPlugin[];

  /** Worker-owned runtime transcoder plugins. */
  protected transcoderPlugins: readonly TranscoderPluginEntry[];

  /** Plugin declarations surfaced in the capabilities manifest. */
  private manifestKernelPlugins: ReadonlyArray<KernelPlugin<Record<string, unknown>, unknown>>;

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
      extensions: readonly string[];
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
  private computeHost: ComputeCapabilityHost | undefined;
  /** Compute facet bound beside the filesystem; the library default is memory (EQ13). */
  private computeBinding: ComputeBinding = { mode: 'memory' };

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
   * Existence and stat answers for the current operation, for the bundler's view only.
   *
   * `detect` and `bundle` are two full traversals of the same import graph, and inside each one a
   * module is probed once per edge that names it: a module imported by ten others was probed
   * thirty times per cold open. Cleared at every operation boundary.
   */
  private readonly fileExistsCache = new Map<string, boolean>();
  private readonly fileStatCache = new Map<string, FileStat>();
  private bundlerFilesystemView: KernelFileSystem | undefined;
  private readonly compiledWasmModules = new Map<string, WebAssembly.Module>();
  private parameterResultCache:
    | {
        readonly key: string;
        readonly result: Extract<GetParametersResult, { success: true }>;
      }
    | undefined;
  /** The last effective manifest this worker admitted, keyed by its revision and trusted execution context. */
  private admittedManifest: { readonly key: string; readonly manifest: ParameterManifest } | undefined;
  private readonly commonDependencyCache = new Map<string, Promise<CommonDependencySet>>();
  private readonly middlewareDependencyCache = new Map<string, Promise<MiddlewareDependencySet>>();
  /** Paths each settled dependency set above was resolved from; a cached set absent here is still pending. */
  private readonly settledDependencyPaths = new WeakMap<Promise<unknown>, DependencyPaths>();

  /**
   * Dynamically loaded middleware instances with their resolved configs.
   * Populated during initialize() from the worker-owned runtime definition.
   */
  private resolvedMiddleware: ResolvedMiddleware[] = [];

  /**
   * Cache of already-imported middleware modules keyed by plugin id.
   * Prevents duplicate resolution across setup paths and test helpers.
   */
  private readonly middlewareModuleCache = new Map<string, RuntimeMiddlewareDefinition>();

  /**
   * Cached middleware loggers, keyed by middleware name.
   * Loggers are stateless closures -- safe to reuse across operations.
   */
  private readonly middlewareLoggerCache = new Map<string, RuntimeLogger>();

  /** Cached log origin object -- recreated only when activeFilePath changes */
  private cachedLogOrigin: { component: string; file: string } | undefined;
  private cachedLogOriginFile = '';

  /** Telemetry batcher instance -- created on first use when setTelemetrySend is called */
  private telemetryCollector?: WorkerTelemetryCollector;

  /** Span tracer for hierarchical telemetry with explicit parent-child IDs */
  private readonly tracer = new RuntimeTracer();

  /** Progress callback set during render, used by entry methods to emit phase transitions */
  private onProgress?: (phase: string, detail?: Readonly<Record<string, unknown>>) => void;

  /** Bundle result cache keyed by entry path. Selectively invalidated when dependencies change; fully cleared on reset. */
  private readonly bundleResultCache = new Map<string, BundleResult>();

  /** Currently watched dependency paths. Used for incremental watch-set diffing. */
  private watchedPaths = new Set<string>();

  /** Unsubscribe function for the current watch subscription. */
  private watchUnsubscribe?: () => void;

  /** One serialized lane for kernel/cache/watch/native state. */
  private operationTail: Promise<void> = Promise.resolve();
  private readonly documentTasks = new Set<Promise<void>>();
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

  private readonly documents = new Map<string, DocumentRecord>();
  private readonly documentViews = new Map<string, ViewRecord>();
  private readonly documentOperations = new Map<string, AbortController>();
  private readonly committedAdmissions = new Set<CommittedAdmission>();
  private readonly pinnedDocumentEvaluations = new Map<DocumentEvaluation, number>();
  private documentEvaluationSequence = 0;
  private operationSignal: AbortSignal | undefined;
  private activeDocumentEvaluationController: AbortController | undefined;
  private activeDocumentEvaluationSequence = 0;
  private activeDocumentNativeOperation:
    | {
        controller: AbortController;
        progress: (phase: 'render' | 'export', sequence: number, generation?: number) => void;
      }
    | undefined;

  /** SharedArrayBuffer signal channel for document cancellation. */
  private documentSignalView: BigInt64Array | undefined;

  /** Loaded transcoder instances keyed by plugin id. */
  private readonly loadedTranscoders = new Map<string, LoadedTranscoder>();

  /** Capabilities manifest computed during initialization. */
  private _capabilitiesManifest: CapabilitiesManifest = {
    registrations: [],
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

  /** Last issued `KernelRuntime.operationId`. */
  private operationSequence = 0;

  /** `KernelRuntime.operationId` shared by every kernel call inside the running operation. */
  private currentOperationId: number | undefined;

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
   * - Canonical rooted paths (for cache/middleware operations)
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
    transferables: {
      fileSystemPort?: MessagePortLike;
      inlineFileSystem?: RuntimeFileSystemBase;
    };
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
   * telemetry before initialization.
   *
   * @param send - callback that transmits collected performance entries to the main thread
   */
  public setTelemetrySend(send: (entries: TelemetryEntry[]) => void): void {
    this.telemetryCollector?.dispose();
    this.telemetryCollector = new WorkerTelemetryCollector(send);
    this.tracer.setEntrySink((entry) => this.telemetryCollector?.collect(entry));
  }

  /** Enable the opt-in Performance Timeline mirror used by Chrome DevTools. */
  public setDevtoolsTelemetryEnabled(enabled: boolean): void {
    this.tracer.setDevtoolsTimelineEnabled(enabled);
  }

  /** Install host-compiled modules before kernel initialization. */
  public setCompiledWasmModules(
    modules: ReadonlyArray<{
      readonly url: string;
      readonly module: WebAssembly.Module;
    }>,
  ): void {
    this.compiledWasmModules.clear();
    for (const entry of modules) {
      this.compiledWasmModules.set(entry.url, entry.module);
    }
  }

  /**
   * Resolve a host-compiled module, and say so when a supplied set misses (D20).
   *
   * A host and a kernel derive the same asset's URL through different bundles. When they disagree
   * the supply silently does nothing — the kernel compiles its own copy and the host's is dead
   * weight — so a miss against a non-empty set is reported with both sides of the disagreement.
   *
   * @param url - The asset URL the kernel resolved.
   * @returns The host-compiled module, or undefined when the kernel must compile its own.
   */
  private getCompiledWasmModule(url: string): WebAssembly.Module | undefined {
    const module = this.compiledWasmModules.get(url);
    if (module === undefined && this.compiledWasmModules.size > 0) {
      this.logger.warn(`No host-compiled WebAssembly module matches '${url}'; the kernel will compile its own.`, {
        data: {
          requested: url,
          supplied: [...this.compiledWasmModules.keys()],
        },
      });
    }
    return module;
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
    this.documentSignalView = documentAbortView(buffer);
  }

  /** Admit one live document and start its first evaluation. */
  public handleOpenDocument(input: DocumentInput): void {
    if (this.documents.has(input.documentId)) {
      throw new Error(`Document ${input.documentId} is already open.`);
    }
    const file = this.canonicalGeometryFile(input.file);
    const record: DocumentRecord = {
      id: input.documentId,
      file,
      intent: input.intent,
      parameters: { ...input.parameters },
      evaluateOptions: { ...input.evaluateOptions },
      committedParameters: { ...input.parameters },
      committedEvaluateOptions: { ...input.evaluateOptions },
      watch: input.watch,
      closed: false,
      views: new Map(),
      operations: new Set(),
      watchPaths: new Set([assertRootedPath(joinRelativePath(file.path, file.filename))]),
    };
    this.documents.set(record.id, record);
    this.scheduleDocumentEvaluation(record, input.intent, false, input.stage);
  }

  /** Update document inputs without changing any view request. */
  public handleUpdateDocument(input: DocumentUpdateInput): void {
    const record = this.documents.get(input.documentId);
    if (!record || record.closed) {
      return;
    }
    if (input.intent <= record.intent) {
      return;
    }
    record.intent = input.intent;
    const baseParameters = input.transient ? record.parameters : record.committedParameters;
    const baseEvaluateOptions = input.transient ? record.evaluateOptions : record.committedEvaluateOptions;
    record.parameters = { ...(input.parameters ?? baseParameters) };
    record.evaluateOptions = {
      ...(input.evaluateOptions ?? baseEvaluateOptions),
    };
    if (!input.transient) {
      record.committedParameters = { ...record.parameters };
      record.committedEvaluateOptions = { ...record.evaluateOptions };
    }
    this.scheduleDocumentEvaluation(record, input.intent, input.transient ?? false, input.stage);
  }

  /** Close one document and its subscriptions before any queued result can publish. */
  public handleCloseDocument(input: { readonly documentId: string }): void {
    const record = this.documents.get(input.documentId);
    if (!record) {
      return;
    }
    record.closed = true;
    this.documents.delete(record.id);
    for (const view of record.views.values()) {
      this.documentViews.delete(view.id);
    }
    record.views.clear();
    record.watchPaths.clear();
    for (const controller of record.operations) {
      controller.abort();
    }
    record.pendingCommitted?.completion.reject(new Error(`Document ${record.id} closed.`));
    const pending = this.enqueueOperation(async () => {
      await this.reconcileObservedPaths();
      const closedSlotId =
        record.current?.artifact?.evaluationSlot?.id ?? record.committed?.artifact?.evaluationSlot?.id;
      if (
        closedSlotId !== undefined &&
        ![...this.documents.values()].some(
          (live) =>
            live.current?.artifact?.evaluationSlot?.id === closedSlotId ||
            live.committed?.artifact?.evaluationSlot?.id === closedSlotId,
        ) &&
        ![...this.pinnedDocumentEvaluations.keys()].some(
          (evaluation) => evaluation.artifact?.evaluationSlot?.id === closedSlotId,
        ) &&
        this.retainedEvaluation?.id === closedSlotId
      ) {
        this.retainedEvaluation = undefined;
      }
      this.disposeUnreachableNativeHandles();
    });
    this.trackDocumentTask(pending, (error: unknown) => {
      this.logger.warn('Failed to reconcile watched paths after document close', {
        data: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
    });
  }

  /** Subscribe one view to the document's current and future evaluations. */
  public handleOpenView(input: ViewOpenInput): void {
    const document = this.documents.get(input.documentId);
    if (!document || document.closed || this.documentViews.has(input.subscriptionId)) {
      return;
    }
    const view: ViewRecord = {
      document,
      id: input.subscriptionId,
      requestId: input.requestId,
      view: input.view,
      instance: input.instance,
      options: { ...input.options },
      content: input.content,
      operations: new Set(),
    };
    document.views.set(view.id, view);
    this.documentViews.set(view.id, view);
    if (document.current) {
      this.scheduleDocumentView(view, document.current);
    }
  }

  /** Replace one view request without evaluating its document again. */
  public handleUpdateView(input: ViewUpdateInput): void {
    const view = this.documentViews.get(input.subscriptionId);
    if (!view) {
      return;
    }
    view.requestId = input.requestId;
    if (input.instance !== undefined) {
      view.instance = input.instance;
    }
    if (input.options !== undefined) {
      view.options = { ...input.options };
    }
    if (input.content !== undefined) {
      view.content = input.content;
    }
    if (view.document.current) {
      this.scheduleDocumentView(view, view.document.current);
    }
  }

  /** Stop one view's projections while leaving the document live. */
  public handleCloseView(input: { readonly subscriptionId: string }): void {
    const view = this.documentViews.get(input.subscriptionId);
    if (!view) {
      return;
    }
    this.documentViews.delete(view.id);
    view.document.views.delete(view.id);
    for (const controller of view.operations) {
      controller.abort();
    }
  }

  /** Abort one request-owned waiter or queued operation. */
  public handleOperationAbort(input: { readonly operationId: string; readonly reason: number }): void {
    this.documentOperations.get(input.operationId)?.abort(input.reason);
  }

  /** Describe a source without creating or retargeting a document. */
  public async describe(
    input: RuntimeDocumentProtocol['calls']['describe']['args'],
    signal?: AbortSignal,
  ): Promise<Description> {
    return this.enqueueOperation(async () => {
      signal?.throwIfAborted();
      if (input.stage) {
        await this.writeFilesAndInvalidate(input.stage);
      }
      signal?.throwIfAborted();
      await this.revalidateRetainedFiles();
      const owner = await this.createOperationOwner(input.file, 'request');
      const result = await this.getParametersInLane(input.file, {
        owner,
        resolution: input.resolution,
      });
      await this.reconcileObservedPaths();
      return result.success
        ? {
            success: true,
            kernelId: owner.binding?.kernelId,
            parameters: result.data,
            issues: result.issues,
          }
        : {
            success: false,
            kernelId: owner.binding?.kernelId,
            issues: result.issues,
          };
    }, signal);
  }

  /** Export from the committed evaluation selected when the request arrived. */
  public async exportDocument(
    input: RuntimeDocumentProtocol['calls']['export']['args'],
    signal?: AbortSignal,
  ): Promise<ExportResult> {
    const document = this.documents.get(input.documentId);
    if (!document || document.closed) {
      throw new Error(`Document ${input.documentId} is closed.`);
    }
    const pending = document.pendingCommitted;
    if (pending) {
      pending.pins++;
    }
    const committedAtAdmission = document.committed;
    const pinned = pending?.completion.promise ?? Promise.resolve(committedAtAdmission);
    if (!pending && committedAtAdmission) {
      this.pinnedDocumentEvaluations.set(
        committedAtAdmission,
        (this.pinnedDocumentEvaluations.get(committedAtAdmission) ?? 0) + 1,
      );
    }
    const controller = new AbortController();
    const abortFromCall = (): void => {
      controller.abort(signal?.reason);
    };
    signal?.addEventListener('abort', abortFromCall, { once: true });
    if (signal?.aborted) {
      abortFromCall();
    }
    document.operations.add(controller);
    this.documentOperations.set(input.operationId, controller);
    try {
      return await this.enqueueOperation(async () => {
        controller.signal.throwIfAborted();
        const evaluation = await pinned;
        controller.signal.throwIfAborted();
        if (!evaluation) {
          return {
            success: false,
            issues: [
              {
                code: 'HANDLE_MISSING',
                message: 'Document has no committed evaluation.',
                severity: 'error',
                type: 'runtime',
              },
            ],
          };
        }
        if (!evaluation.result.success || !evaluation.artifact) {
          return {
            success: false,
            issues: evaluation.result.issues,
            ...(evaluation.result.sourceRevision ? { sourceRevision: evaluation.result.sourceRevision } : {}),
          };
        }
        const { artifact } = evaluation;
        const target = this.resolveDocumentExportTarget(artifact.owner, artifact.evaluationSlot?.offers, input.target);
        if (!target.success) {
          return {
            success: false,
            issues: target.issues,
            ...(evaluation.result.sourceRevision ? { sourceRevision: evaluation.result.sourceRevision } : {}),
          };
        }
        const plan = this.createExportRequestPlan(artifact.owner, {
          format: target.format,
          options: input.options,
          content: input.content,
          exportId: target.exportId,
        });
        if (!plan.success) {
          return {
            success: false,
            issues: plan.result.issues,
            ...(evaluation.result.sourceRevision ? { sourceRevision: evaluation.result.sourceRevision } : {}),
          };
        }
        // A pinned evaluation stays fixed, while export-only dependencies must use bytes current at this export.
        await this.revalidateRetainedFiles();
        controller.signal.throwIfAborted();
        this.onDocumentProgressUpdate?.({
          documentId: document.id,
          intent: evaluation.intent,
          evaluationId: evaluation.id,
          operationId: input.operationId,
          phase: 'exporting',
        });
        const activeMiddleware = this.getOuterExportExecutionList(plan);
        this.activeDocumentNativeOperation = {
          controller,
          progress: (phase, sequence, generation) => {
            this.onDocumentProgressUpdate?.({
              documentId: document.id,
              intent: evaluation.intent,
              evaluationId: evaluation.id,
              operationId: input.operationId,
              phase,
              detail: {
                abortSequence: sequence,
                ...(generation === undefined ? {} : { abortGeneration: generation }),
              },
            });
          },
        };
        let result: ExportGeometryResult;
        try {
          result = finalizeExportArtifactSet(
            activeMiddleware.length === 0
              ? await this.executeExportRequest(plan, artifact, evaluation.result.sourceRevision)
              : await this.runExportMiddlewarePipeline({
                  plan,
                  renderIdentity: artifact.identity,
                  renderArtifact: artifact,
                  activeMiddleware,
                  pinnedSourceRevision: evaluation.result.sourceRevision,
                }),
          );
        } finally {
          this.activeDocumentNativeOperation = undefined;
        }
        controller.signal.throwIfAborted();
        if (!result.success) {
          return {
            success: false,
            issues: result.issues,
            ...(evaluation.result.sourceRevision ? { sourceRevision: evaluation.result.sourceRevision } : {}),
          };
        }
        const files = nonemptyExportFiles(result.data);
        return {
          success: true,
          exportId: target.exportId,
          evaluationId: evaluation.id,
          files,
          issues: result.issues,
          ...(evaluation.result.sourceRevision ? { sourceRevision: evaluation.result.sourceRevision } : {}),
        };
      }, controller.signal);
    } catch (error) {
      if (controller.signal.aborted && controller.signal.reason === abortReasonEnum.timeout) {
        this.onDocumentError?.({
          scope: 'operation',
          documentId: document.id,
          intent: document.intent,
          operationId: input.operationId,
          code: 'OPERATION_TIMEOUT',
          phase: 'export',
          message: 'Document export timed out.',
        });
      }
      throw error;
    } finally {
      signal?.removeEventListener('abort', abortFromCall);
      if (pending) {
        pending.pins--;
      }
      if (pending?.pins === 0) {
        this.committedAdmissions.delete(pending);
      }
      if (!pending && committedAtAdmission) {
        const remaining = (this.pinnedDocumentEvaluations.get(committedAtAdmission) ?? 1) - 1;
        if (remaining > 0) {
          this.pinnedDocumentEvaluations.set(committedAtAdmission, remaining);
        } else {
          this.pinnedDocumentEvaluations.delete(committedAtAdmission);
        }
      }
      document.operations.delete(controller);
      if (this.documentOperations.get(input.operationId) === controller) {
        this.documentOperations.delete(input.operationId);
      }
    }
  }

  /** Resolve an export ID before direct extension before transcode route. */
  protected resolveDocumentExportTarget(
    _owner: OperationOwner,
    _offers: KernelOffers | undefined,
    target: string,
  ): { success: true; format: string; exportId: string } | { success: false; issues: KernelIssue[] } {
    return { success: true, format: target, exportId: target };
  }

  /** Return the exact declaration for an explicitly selected export ID. */
  protected getDocumentExportDeclaration(
    _owner: OperationOwner,
    _exportId: string,
  ):
    | {
        extension: string;
        mimeType: string;
        schema?: z.ZodType;
        content: readonly RuntimeContentKey[];
      }
    | undefined {
    return undefined;
  }

  private async pinnedSourceStillMatches(revision: SourceRevision): Promise<boolean> {
    for (const [path, expected] of Object.entries(revision.files)) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- one committed source closure is checked in path order.
        const bytes = await this.filesystem.readFile(path);
        // oxlint-disable-next-line no-await-in-loop -- hash each path before making a source-correct write.
        if (`sha256:${await this.hashContent(bytes)}` !== expected) {
          return false;
        }
      } catch (error) {
        if (expected !== 'missing' || !isNotFoundError(error)) {
          return false;
        }
      }
    }
    return true;
  }

  private sourceSnapshotChangedResult(): ExportGeometryResult {
    return createKernelError([
      {
        code: 'SOURCE_SNAPSHOT_CHANGED',
        message: 'The committed source changed before its native export handle could be rebuilt.',
        type: 'runtime',
        severity: 'error',
      },
    ]);
  }

  // oxlint-disable-next-line max-params -- A document admission carries its intent, transient flag and optional staged files.
  private scheduleDocumentEvaluation(
    document: DocumentRecord,
    intent: number,
    transient: boolean,
    stage?: Readonly<Record<string, Uint8Array<ArrayBuffer>>>,
  ): void {
    // Preserve an export-pinned committed admission, but stop any superseded
    // unpinned native build before the next evaluation enters the serial lane.
    if (document.pendingCommitted?.pins === 0 || document.pendingCommitted === undefined) {
      document.evaluationController?.abort(abortReasonEnum.superseded);
    }
    this.documentEvaluationSequence = nextDocumentAbortSequence(this.documentEvaluationSequence);
    const evaluationId = String(this.documentEvaluationSequence);
    const operationId = `evaluate:${document.id}:${evaluationId}`;
    const admissionAlias = `${document.id}:${intent}`;
    const controller = new AbortController();
    document.evaluationController = controller;
    this.documentOperations.set(operationId, controller);
    this.documentOperations.set(admissionAlias, controller);
    document.operations.add(controller);
    const pendingCommitted: CommittedAdmission | undefined = transient
      ? undefined
      : {
          intent,
          completion: Promise.withResolvers<DocumentEvaluation>(),
          pins: 0,
        };
    // Observe a committed admission even if no export pins it before supersession.
    if (pendingCommitted) {
      this.trackDocumentTask(pendingCommitted.completion.promise, () => undefined);
    }
    if (pendingCommitted) {
      document.pendingCommitted = pendingCommitted;
      this.committedAdmissions.add(pendingCommitted);
    }
    const parameters = { ...document.parameters };
    const evaluateOptions = { ...document.evaluateOptions };
    const { file } = document;
    this.onEvaluating?.({
      documentId: document.id,
      intent,
      evaluationId,
      transient,
    });
    this.onDocumentProgressUpdate?.({
      documentId: document.id,
      intent,
      evaluationId,
      operationId,
      phase: 'queued',
    });
    this.onDocumentStateChanged?.({ state: 'busy' });
    let initialWatchRefusal: { error: unknown } | undefined;
    const pending = this.enqueueOperation(async () => {
      const previousProgress = this.onProgress;
      this.activeDocumentEvaluationController = controller;
      this.activeDocumentEvaluationSequence = Number(evaluationId) >>> 0;
      this.onProgress = (phase, detail) => {
        this.onDocumentProgressUpdate?.({
          documentId: document.id,
          intent,
          evaluationId,
          operationId,
          phase,
          ...(detail ? { detail } : {}),
        });
      };
      try {
        if (!this.shouldContinueDocumentEvaluation(document, controller, intent, pendingCommitted)) {
          this.abandonDocumentEvaluation(pendingCommitted);
          return;
        }
        if (stage) {
          await this.writeFilesAndInvalidate(stage, document.id);
        }
        await this.revalidateRetainedFiles();
        if (document.watch) {
          try {
            if (!(await this.reconcileObservedPaths())) {
              this.abandonDocumentEvaluation(pendingCommitted);
              if (this.shouldPublishDocumentEvaluation(document, controller, intent)) {
                this.scheduleDocumentEvaluation(document, intent, transient);
              }
              return;
            }
          } catch (error) {
            initialWatchRefusal = { error };
          }
        }
        const dependencyContext: DependencyResolutionContext = {};
        const owner = await this.createOperationOwner(file, 'request');
        const described = await this.getParametersInLane(file, {
          dependencyContext,
          owner,
        });
        const description: Description = described.success
          ? {
              success: true,
              kernelId: owner.binding?.kernelId,
              parameters: described.data,
              issues: described.issues,
            }
          : {
              success: false,
              kernelId: owner.binding?.kernelId,
              issues: described.issues,
            };
        if (!this.shouldContinueDocumentEvaluation(document, controller, intent, pendingCommitted)) {
          this.abandonDocumentEvaluation(pendingCommitted);
          return;
        }
        this.onDescribed?.({
          documentId: document.id,
          intent,
          evaluationId,
          ...description,
        });
        let evaluation: DocumentEvaluation;
        const legacyProjection = described.success ? described.data.legacyProjection : undefined;
        if (!described.success || legacyProjection?.status !== 'usable') {
          const issues = described.success
            ? ([
                {
                  code: 'RUNTIME',
                  message: 'Parameter schema cannot be represented by the active Draft-7 execution path',
                  type: 'kernel',
                  severity: 'error',
                },
              ] as KernelIssue[])
            : described.issues;
          evaluation = {
            id: evaluationId,
            intent,
            transient,
            result: {
              success: false,
              id: evaluationId,
              transient,
              issues,
              sourceRevision: described.sourceRevision,
            },
          };
        } else {
          const manifest = described.data;
          const parametersWithDefaults = mergeParameterDefaults({}, parameters, legacyProjection.schema);
          const { artifact } = await this.materializeRender(
            {
              file,
              parameters: parametersWithDefaults,
              parameterDefaults: manifest.defaults,
              parameterManifest: manifest,
              parameterSchema: legacyProjection.schema,
              options: evaluateOptions,
            },
            { dependencyContext, owner },
          );
          const { result } = artifact;
          evaluation = result.success
            ? {
                id: evaluationId,
                intent,
                transient,
                artifact,
                result: {
                  success: true,
                  id: evaluationId,
                  transient,
                  views: this.getDocumentViewOffers(owner, artifact.evaluationSlot?.offers),
                  exports: this.getDocumentExportOffers(owner, artifact.evaluationSlot?.offers),
                  issues: result.issues,
                  sourceRevision: sourceRevisionForArtifact(artifact, described.sourceRevision),
                },
              }
            : {
                id: evaluationId,
                intent,
                transient,
                result: {
                  success: false,
                  id: evaluationId,
                  transient,
                  issues: result.issues,
                  sourceRevision: sourceRevisionForArtifact(artifact, described.sourceRevision),
                },
              };
        }
        if (initialWatchRefusal && evaluation.result.success) {
          throw initialWatchRefusal.error;
        }
        if (document.watch && initialWatchRefusal === undefined) {
          for (const [path, digest] of Object.entries(evaluation.result.sourceRevision?.files ?? {})) {
            if (!this.fileHashCache.has(path)) {
              this.fileHashCache.set(path, digest === 'missing' ? digest : digest.slice('sha256:'.length));
            }
          }
          document.watchPaths = new Set([
            assertRootedPath(joinRelativePath(document.file.path, document.file.filename)),
            ...Object.keys(evaluation.result.sourceRevision?.files ?? {}),
            ...(evaluation.artifact?.identity.dependencies.flatMap((dependency) =>
              dependency.type === 'file' ? [dependency.path] : [],
            ) ?? []),
          ]);
          if (!(await this.reconcileObservedPaths())) {
            this.abandonDocumentEvaluation(pendingCommitted);
            if (this.shouldPublishDocumentEvaluation(document, controller, intent)) {
              this.scheduleDocumentEvaluation(document, intent, transient);
            }
            return;
          }
        }
        if (pendingCommitted) {
          pendingCommitted.evaluation = evaluation;
          pendingCommitted.completion.resolve(evaluation);
          if (pendingCommitted.pins === 0) {
            this.committedAdmissions.delete(pendingCommitted);
          }
        }
        if (!this.shouldPublishDocumentEvaluation(document, controller, intent)) {
          return;
        }
        document.current = evaluation;
        if (!transient) {
          document.committed = evaluation;
          if (document.pendingCommitted === pendingCommitted) {
            document.pendingCommitted = undefined;
          }
        }
        this.onEvaluated?.({
          documentId: document.id,
          intent,
          ...evaluation.result,
        });
        this.onDocumentStateChanged?.({
          state: evaluation.result.success ? 'idle' : 'error',
        });
        for (const view of document.views.values()) {
          this.scheduleDocumentView(view, evaluation);
        }
        if (!document.watch) {
          await this.reconcileObservedPaths();
        }
      } finally {
        this.activeDocumentEvaluationController = undefined;
        this.activeDocumentEvaluationSequence = 0;
        this.onProgress = previousProgress;
      }
    }, controller.signal);
    this.trackDocumentTask(
      pending,
      async (error: unknown) => {
        if (controller.signal.aborted && controller.signal.reason === abortReasonEnum.timeout) {
          this.onDocumentError?.({
            scope: 'operation',
            documentId: document.id,
            intent,
            evaluationId,
            operationId,
            code: 'OPERATION_TIMEOUT',
            phase: 'evaluate',
            message: 'Document evaluation timed out.',
          });
        }
        const issues = this.errorToRuntimeIssues(error);
        const result: Evaluation = {
          success: false,
          id: evaluationId,
          transient,
          issues,
        };
        const evaluation: DocumentEvaluation = {
          id: evaluationId,
          intent,
          transient,
          result,
        };
        if (
          document.watch &&
          initialWatchRefusal === undefined &&
          !controller.signal.aborted &&
          !document.closed &&
          document.intent === intent
        ) {
          document.watchPaths.add(assertRootedPath(joinRelativePath(document.file.path, document.file.filename)));
          try {
            await this.reconcileObservedPaths();
          } catch (watchError) {
            /* A dead filesystem bridge can reject the replacement watch after
             * the evaluation itself failed. Its rearm error must not suppress
             * the original evaluated and rendered failure notifications. */
            this.logger.warn('Failed to reconcile watched paths after document evaluation error', {
              data: { error: watchError instanceof Error ? watchError.message : String(watchError) },
            });
          }
        }
        if (pendingCommitted) {
          if (controller.signal.aborted || document.closed) {
            pendingCommitted.completion.reject(error);
          } else {
            pendingCommitted.evaluation = evaluation;
            pendingCommitted.completion.resolve(evaluation);
          }
          if (pendingCommitted.pins === 0) {
            this.committedAdmissions.delete(pendingCommitted);
          }
        }
        if (!controller.signal.aborted && !document.closed && document.intent === intent) {
          document.current = evaluation;
          if (!transient) {
            document.committed = evaluation;
          }
          this.onEvaluated?.({ documentId: document.id, intent, ...result });
          this.onDocumentStateChanged?.({
            state: 'error',
            detail: issueDetail(issues),
          });
          for (const view of document.views.values()) {
            this.scheduleDocumentView(view, evaluation);
          }
        }
      },
      () => {
        if (document.evaluationController === controller) {
          document.evaluationController = undefined;
        }
        if (this.documentOperations.get(operationId) === controller) {
          this.documentOperations.delete(operationId);
        }
        if (this.documentOperations.get(admissionAlias) === controller) {
          this.documentOperations.delete(admissionAlias);
        }
        document.operations.delete(controller);
      },
    );
  }

  /** Metadata for the selected kernel's offered views. */
  protected getDocumentViewOffers(_owner: OperationOwner, _offers?: KernelOffers): readonly ViewOffer[] {
    return [];
  }

  /** Metadata for the selected kernel's offered exports. */
  protected getDocumentExportOffers(_owner: OperationOwner, _offers?: KernelOffers): readonly ExportOffer[] {
    return [];
  }

  /** Select and validate an offered view, including its media type and instance. */
  // oxlint-disable-next-line max-params -- The subclass hook selects an owner-bound offered view and optional instance.
  protected selectDocumentView(
    _owner: OperationOwner,
    _offers: KernelOffers | undefined,
    _view: string | undefined,
    // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- The wire uses null to clear a selected instance.
    _instance: string | null | undefined,
  ):
    | {
        success: true;
        selection: { view: string; mimeType: MediaType; instance?: string };
      }
    | { success: false; issues: KernelIssue[] } {
    return createKernelError([
      {
        code: 'VIEW_UNAVAILABLE',
        message: 'No view is available.',
        type: 'kernel',
        severity: 'error',
      },
    ]);
  }

  private scheduleDocumentView(view: ViewRecord, evaluation: DocumentEvaluation): void {
    const { document } = view;
    const { requestId } = view;
    const operationId = `render:${view.id}:${evaluation.id}:${requestId}`;
    const controller = new AbortController();
    this.documentOperations.set(operationId, controller);
    this.documentOperations.set(requestId, controller);
    document.operations.add(controller);
    view.operations.add(controller);
    this.onRendering?.({
      subscriptionId: view.id,
      requestId,
      evaluationId: evaluation.id,
      intent: evaluation.intent,
    });
    this.onDocumentProgressUpdate?.({
      documentId: document.id,
      intent: evaluation.intent,
      evaluationId: evaluation.id,
      operationId,
      requestId,
      phase: 'queued',
    });
    const pending = this.enqueueOperation(async () => {
      if (
        controller.signal.aborted ||
        document.closed ||
        document.current !== evaluation ||
        view.requestId !== requestId
      ) {
        return;
      }
      const { artifact } = evaluation;
      let result: Rendering;
      if (!artifact || !evaluation.result.success) {
        result = {
          success: false,
          requestId,
          evaluationId: evaluation.id,
          transient: evaluation.transient,
          issues: [...evaluation.result.issues],
          ...(evaluation.result.sourceRevision ? { sourceRevision: evaluation.result.sourceRevision } : {}),
        };
      } else {
        const selected = this.selectDocumentView(
          artifact.owner,
          artifact.evaluationSlot?.offers,
          view.view,
          view.instance,
        );
        if (selected.success) {
          const { selection } = selected;
          const key = canonicalJson([selection, view.options, view.content]);
          const meshMiddleware = this.getMeshExecutionList(artifact.owner, view.content ?? {});
          const dependencies = await this.computeDependencies({
            operations: ['evaluate', 'render'],
            parameters: artifact.identity.parameters,
            renderOptions: view.options,
            content: view.content ?? {},
            resolvedMiddleware: this.mergeExecutionLists(
              this.getCreateExecutionList(artifact.owner, artifact.identity.content, false),
              meshMiddleware,
            ),
            owner: artifact.owner,
          });
          if (document.watch) {
            const watched = new Set(document.watchPaths);
            for (const dependency of dependencies) {
              if (dependency.type === 'file') {
                watched.add(dependency.path);
              }
            }
            if (watched.size !== document.watchPaths.size) {
              document.watchPaths = watched;
              if (!(await this.reconcileObservedPaths())) {
                this.scheduleDocumentEvaluation(document, document.intent, evaluation.transient);
                return;
              }
            }
          }
          const projectionHash = await sha256String(
            canonicalJson([await this.computeDependencyHash(dependencies), key]),
          );
          evaluation.projections ??= new Map();
          let projected = evaluation.projections.get(projectionHash);
          if (!projected) {
            this.onDocumentProgressUpdate?.({
              documentId: document.id,
              intent: evaluation.intent,
              evaluationId: evaluation.id,
              operationId,
              requestId,
              phase: 'computingGeometry',
            });
            const identity = {
              ...artifact.identity,
              dependencies,
              dependencyHash: projectionHash,
            };
            this.activeDocumentNativeOperation = {
              controller,
              progress: (phase, sequence, generation) => {
                this.onDocumentProgressUpdate?.({
                  documentId: document.id,
                  intent: evaluation.intent,
                  evaluationId: evaluation.id,
                  operationId,
                  requestId,
                  phase,
                  detail: {
                    abortSequence: sequence,
                    ...(generation === undefined ? {} : { abortGeneration: generation }),
                  },
                });
              },
            };
            try {
              projected = await this.runMeshPhase({
                owner: artifact.owner,
                identity,
                selection,
                renderOptions: view.options,
                requestedContent: view.content,
                resolvedMiddleware: meshMiddleware,
                createResult: {
                  success: true,
                  data: undefined,
                  issues: [...evaluation.result.issues],
                },
                renderArtifact: artifact,
              });
            } finally {
              this.activeDocumentNativeOperation = undefined;
            }
            // Never cache what an aborted render made of its abort: the same options must render again.
            controller.signal.throwIfAborted();
            if (projected.success) {
              try {
                projected = {
                  ...projected,
                  data: asKnownArtifact(projected.data) ?? projected.data,
                };
              } catch (error) {
                projected = createKernelError([
                  {
                    code: selection.mimeType === 'image/svg+xml' ? 'SVG_DOCUMENT_INVALID' : 'GLTF_BYTES_INVALID',
                    message: error instanceof Error ? error.message : String(error),
                    type: 'runtime',
                    severity: 'error',
                  },
                ]);
              }
            }
            evaluation.projections.set(projectionHash, projected);
          }
          result = projected.success
            ? {
                success: true,
                view: selection.view,
                artifact: projected.data,
                hash: projectionHash,
                requestId,
                evaluationId: evaluation.id,
                ...(selection.instance === undefined ? {} : { instance: selection.instance }),
                transient: evaluation.transient,
                issues: projected.issues,
                ...(evaluation.result.sourceRevision ? { sourceRevision: evaluation.result.sourceRevision } : {}),
              }
            : {
                success: false,
                view: selection.view,
                requestId,
                evaluationId: evaluation.id,
                ...(selection.instance === undefined ? {} : { instance: selection.instance }),
                transient: evaluation.transient,
                issues: projected.issues,
                ...(evaluation.result.sourceRevision ? { sourceRevision: evaluation.result.sourceRevision } : {}),
              };
        } else {
          result = {
            success: false,
            view: view.view,
            requestId,
            evaluationId: evaluation.id,
            transient: evaluation.transient,
            issues: selected.issues,
            ...(evaluation.result.sourceRevision ? { sourceRevision: evaluation.result.sourceRevision } : {}),
          };
        }
      }
      if (this.isCurrentViewRequest(view, evaluation, requestId, controller)) {
        this.onRendered?.({
          subscriptionId: view.id,
          intent: evaluation.intent,
          ...result,
        });
      }
    }, controller.signal);
    this.trackDocumentTask(
      pending,
      (error: unknown) => {
        if (controller.signal.aborted && controller.signal.reason === abortReasonEnum.timeout) {
          this.onDocumentError?.({
            scope: 'operation',
            documentId: document.id,
            intent: evaluation.intent,
            evaluationId: evaluation.id,
            subscriptionId: view.id,
            requestId,
            operationId,
            code: 'OPERATION_TIMEOUT',
            phase: 'render',
            message: 'View rendering timed out.',
          });
        }
        if (
          !controller.signal.aborted &&
          !document.closed &&
          document.current === evaluation &&
          view.requestId === requestId
        ) {
          const result: Rendering = {
            success: false,
            view: view.view,
            requestId,
            evaluationId: evaluation.id,
            transient: evaluation.transient,
            issues: this.errorToRuntimeIssues(error),
            ...(evaluation.result.sourceRevision ? { sourceRevision: evaluation.result.sourceRevision } : {}),
          };
          this.onRendered?.({
            subscriptionId: view.id,
            intent: evaluation.intent,
            ...result,
          });
        }
      },
      () => {
        if (this.documentOperations.get(operationId) === controller) {
          this.documentOperations.delete(operationId);
        }
        if (this.documentOperations.get(requestId) === controller) {
          this.documentOperations.delete(requestId);
        }
        document.operations.delete(controller);
        view.operations.delete(controller);
      },
    );
  }

  // oxlint-disable-next-line max-params -- The current controller, intent and export pin are checked together.
  private shouldContinueDocumentEvaluation(
    document: DocumentRecord,
    controller: AbortController,
    intent: number,
    pendingCommitted?: CommittedAdmission,
  ): boolean {
    return (
      !controller.signal.aborted && !document.closed && (document.intent === intent || Boolean(pendingCommitted?.pins))
    );
  }

  private abandonDocumentEvaluation(pendingCommitted?: CommittedAdmission): void {
    if (!pendingCommitted) {
      return;
    }
    pendingCommitted.completion.reject(new Error('Document evaluation was superseded or closed.'));
    if (pendingCommitted.pins === 0) {
      this.committedAdmissions.delete(pendingCommitted);
    }
  }

  private shouldPublishDocumentEvaluation(
    document: DocumentRecord,
    controller: AbortController,
    intent: number,
  ): boolean {
    return !controller.signal.aborted && !document.closed && document.intent === intent;
  }

  // oxlint-disable-next-line max-params -- The four request identities must be compared atomically before publication.
  private isCurrentViewRequest(
    view: ViewRecord,
    evaluation: DocumentEvaluation,
    requestId: string,
    controller: AbortController,
  ): boolean {
    return (
      !controller.signal.aborted &&
      !view.document.closed &&
      view.document.views.get(view.id) === view &&
      view.document.current === evaluation &&
      view.requestId === requestId
    );
  }

  private canonicalGeometryFile(file: RuntimeFileLocator): RuntimeFileLocator {
    assertRootedPath(file.path);
    if (file.filename.length === 0 || file.filename.includes('/') || file.filename.includes('\\')) {
      throw new TypeError('Runtime geometry files require a rooted directory path and basename filename');
    }
    const filePath = assertRootedPath(joinRelativePath(file.path, file.filename));
    const separator = filePath.lastIndexOf('/');
    return {
      path: separator === -1 ? '' : filePath.slice(0, separator),
      filename: KernelWorker.getBasename(filePath),
    };
  }

  private async enqueueOperation<T>(operation: () => Promise<T>, signal = neverAbortedSignal): Promise<T> {
    if (!this.operationAdmissionOpen) {
      throw new Error('Runtime worker is closing');
    }
    const previous = this.operationTail;
    const next = Promise.withResolvers<void>();
    this.operationTail = next.promise;
    await previous;
    try {
      this.operationSignal = signal;
      this.currentOperationId = ++this.operationSequence;
      // One probe per path per operation (W22/D15): an operation is the coherence window the
      // rest of the render already assumes, so a file appearing mid-operation is unobserved
      // either way.
      this.fileExistsCache.clear();
      this.fileStatCache.clear();
      return await operation();
    } finally {
      this.operationSignal = undefined;
      this.currentOperationId = undefined;
      this.pendingNativeHandle = undefined;
      // Operations are serialized, so an operation boundary is the one point
      // where every surviving reference to a native handle lives in a worker
      // field. Anything else the operation created is garbage.
      this.disposeUnreachableNativeHandles();
      next.resolve();
    }
  }

  /** Retain notification continuations until the serialized worker has drained. */
  private trackDocumentTask(
    pending: Promise<unknown>,
    onError: (error: unknown) => void | Promise<void>,
    onFinally?: () => void,
  ): void {
    const observe = async (): Promise<void> => {
      try {
        await pending;
      } catch (error) {
        try {
          await onError(error);
        } catch (reportingError) {
          this.logger.warn('Failed to report a document operation error', {
            data: {
              error: reportingError instanceof Error ? reportingError.message : String(reportingError),
            },
          });
        }
      } finally {
        try {
          onFinally?.();
        } catch (cleanupError) {
          this.logger.warn('Failed to release a document operation', {
            data: {
              error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
            },
          });
        } finally {
          this.documentTasks.delete(observed);
        }
      }
    };
    const observed = observe();
    this.documentTasks.add(observed);
  }

  /**
   * Normalise a thrown value into issues this runtime's own protocol accepts.
   *
   * A kernel that rejects with a `KernelError` carries its issues on `.issues`
   * and they travel verbatim. Every *other* `.issues` bearer — `ZodError`,
   * `WireValidationError` — carries rows of a different shape, and passing
   * those through unvalidated produced an `errorEvent` that failed
   * `kernelIssueSchema` at the receiving channel and was dropped silently,
   * leaving the render to be settled by a detail-free `error` state (the live
   * daemon's `'Runtime render failed'`, see
   * `docs/research/agent-host-transports-and-offline.md` § "Addendum:
   * FIX-DAEMON-RENDER"). Foreign rows now fold into the error's own message,
   * which is the reason a reader actually needs.
   *
   * @param error - Whatever was thrown.
   * @returns Issues that satisfy the runtime protocol.
   */
  private errorToRuntimeIssues(error: unknown): KernelIssue[] {
    const carried = error !== null && typeof error === 'object' && 'issues' in error ? error.issues : undefined;
    const parsed = kernelIssuesSchema.safeParse(carried);
    if (parsed.success) {
      return parsed.data as KernelIssue[];
    }
    return [
      {
        message: error instanceof Error ? error.message : String(error),
        code: 'RUNTIME',
        type: 'runtime',
        severity: 'error',
        ...(error instanceof Error && error.stack !== undefined ? { stack: error.stack } : {}),
      },
    ];
  }

  private createExportRenderIdentityMissingResult(): ExportGeometryResult {
    return createKernelError([
      {
        message:
          'Export cache lookup requires a settled render identity. Render the model first or use request-scoped export with file and parameters.',
        code: 'HANDLE_MISSING',
        type: 'runtime',
        severity: 'error',
      },
    ]);
  }

  /**
   * Every path a volatile cache is currently standing behind.
   *
   * The union with bundle results includes paths that have not yet entered
   * `fileHashCache`; `revalidateRetainedFiles` skips those unobserved paths.
   *
   * @returns Retained rooted paths, deduplicated.
   */
  private retainedObservedPaths(): string[] {
    const paths = new Set<string>(this.fileHashCache.keys());
    for (const result of this.bundleResultCache.values()) {
      for (const dependency of result.dependencies) {
        paths.add(assertRootedPath(dependency));
      }
      for (const dependency of result.unresolvedPaths) {
        paths.add(assertRootedPath(dependency));
      }
    }
    return [...paths];
  }

  /**
   * The retained paths whose bytes no longer hash to what was retained for them.
   *
   * Absence is an observation like any other: a path retained as `'missing'` diverges by
   * appearing, and a retained hash diverges by the file vanishing.
   *
   * @param paths - Paths to compare against what is retained for them.
   * @returns The subset that no longer agrees with the filesystem.
   */
  private async findDivergentPaths(paths: readonly string[]): Promise<string[]> {
    const outcomes = await Promise.all(
      paths.map(async (path) => {
        const expected = this.fileHashCache.get(path);
        if (expected === undefined) {
          return undefined;
        }
        try {
          const bytes = await this.filesystem.readFile(path);
          return expected !== 'missing' && (await this.hashContent(bytes)) === expected ? undefined : path;
        } catch (error) {
          if (!isNotFoundError(error)) {
            throw error;
          }
          return expected === 'missing' ? undefined : path;
        }
      }),
    );
    return outcomes.filter((path): path is string => path !== undefined);
  }

  /**
   * Prove the retained closure is current, and invalidate whatever is not (I1/I3).
   *
   * This is the freshness evidence a request-scoped operation answers from, and it is the
   * same on every adapter (EQ7): a watch is an optimisation, never the
   * thing correctness rides on. Before this, evaluation, parameter resolution,
   * source snapshot and export kept whatever the first call read for as long as the
   * filesystem merely *could* watch, so the agent's kernel answered every later tool call
   * with the verdict for bytes the person had already replaced
   * (`docs/research/agent-stale-kernel-result-elimination-blueprint.md`).
   *
   * Absence counts: a path retained as `'missing'` diverges by appearing.
   *
   * ponytail: re-reads the whole retained closure once per request-scoped operation
   * instead of stat-and-rehash, and the cost is not one call. `readFiles` is
   * `Promise.all(readFile)` (`packages/runtime/src/filesystem/create-runtime-filesystem.ts`),
   * so over the daemon bridge a 300-file closure is 300 concurrent round trips carrying
   * every body, per operation — and `test_model` pays it once per model it loads. Nothing
   * caps the size of a retained entry either: `node_modules/` is excluded below, but a
   * middleware-declared binary asset enters `fileHashCache` at whatever size it is and is
   * re-read here every time.
   *
   * Residual, deliberately: the cheap version stamps `(size, mtimeMs)` beside each hash and
   * stats before reading, which lets mtime granularity decide correctness — a rewrite of
   * equal length inside one filesystem tick would read as unchanged, and answering for
   * replaced bytes is the exact defect this method exists to close. Bytes stay the
   * evidence. Bound the cost instead if it bites: batch the reads, or teach the filesystem
   * a real `hashFiles` the bridge can answer without shipping bodies.
   */
  private async revalidateRetainedFiles(): Promise<void> {
    /* CDN package artifacts are content-addressed and can be megabytes; `fileContentCache`
     * already draws this boundary for the same reason. */
    const retained = this.retainedObservedPaths().filter((path) => !path.startsWith('node_modules/'));
    const expectedPresent: string[] = [];
    const expectedMissing: string[] = [];
    for (const path of retained) {
      const expected = this.fileHashCache.get(path);
      if (expected === 'missing') {
        expectedMissing.push(path);
      } else if (expected !== undefined) {
        expectedPresent.push(path);
      }
    }
    /* The revision each divergent path moved to, not merely the fact that it moved: the
     * ledger has to keep saying which revision this worker last observed.
     * `readChangedObservedRevisions` reads a path with no retained hash as one no render has
     * looked at yet and records its event as a baseline, so dropping the entry here would
     * spend the preview's next change event re-establishing that baseline and lose the edit
     * behind it — this lane revalidates the whole retained closure, including paths it never
     * re-reads itself. Same reasoning as the refused-arm branch of `reconcileWatchSet`. */
    const revisions = new Map<string, ObservedFileRevision>();
    const noteIfMoved = (path: string, revision: ObservedFileRevision): void => {
      if (revision.hash !== this.fileHashCache.get(path)) {
        revisions.set(path, revision);
      }
    };
    if (expectedPresent.length > 0) {
      let contents: Record<string, Uint8Array<ArrayBuffer>> | undefined;
      try {
        contents = await this.filesystem.readFiles(expectedPresent);
      } catch (error) {
        if (!isNotFoundError(error)) {
          throw error;
        }
        /* One of them is gone, and the batch cannot say which. */
      }
      const current = contents;
      const observed = await Promise.all(
        expectedPresent.map(async (path): Promise<ObservedFileRevision> => {
          const bytes = current?.[path];
          return bytes === undefined
            ? this.readObservedRevision(path)
            : { hash: await this.hashContent(bytes), content: bytes };
        }),
      );
      for (const [index, path] of expectedPresent.entries()) {
        noteIfMoved(path, observed[index]!);
      }
    }
    if (expectedMissing.length > 0) {
      const present = await Promise.all(expectedMissing.map(async (path) => this.filesystem.exists(path)));
      const appeared = expectedMissing.filter((_, index) => present[index] === true);
      const observed = await Promise.all(appeared.map(async (path) => this.readObservedRevision(path)));
      for (const [index, path] of appeared.entries()) {
        noteIfMoved(path, observed[index]!);
      }
    }
    if (revisions.size === 0) {
      return;
    }
    /* Record the new hash so a watch echo for the same edit is deduplicated.
     * Explicit document operations and watched documents share this observer. */
    const divergent = [...revisions.keys()];
    this._applyObservedRevisions(divergent, revisions);
  }

  /**
   * What is at one path now, absence included.
   *
   * @param path - The rooted path to observe.
   * @returns The revision to record for it, `'missing'` when it is not there.
   */
  private async readObservedRevision(path: string): Promise<ObservedFileRevision> {
    try {
      const content = await this.filesystem.readFile(path);
      return { hash: await this.hashContent(content), content };
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
      return { hash: 'missing' };
    }
  }

  /** Stop admission, drain accepted work, and clean up exactly once. */
  // oxlint-disable-next-line typescript/promise-function-async -- cleanup is idempotent and returns one shared promise identity.
  public cleanup(): Promise<void> {
    if (this.cleanupPromise) {
      return this.cleanupPromise;
    }
    this.operationAdmissionOpen = false;
    for (const document of this.documents.values()) {
      document.closed = true;
      for (const controller of document.operations) {
        controller.abort();
      }
      document.pendingCommitted?.completion.reject(new Error(`Document ${document.id} closed.`));
    }
    this.cleanupPromise = this.drainAndCleanup();
    return this.cleanupPromise;
  }

  private async drainAndCleanup(): Promise<void> {
    await this.watchReconciliationTail;
    await this.operationTail;
    await Promise.allSettled(this.documentTasks);
    await this.performCleanup();
  }

  /** Clean up worker state, native handles, telemetry collector, and filesystem proxy. */
  private async performCleanup(): Promise<void> {
    this.documents.clear();
    this.documentViews.clear();
    this.documentOperations.clear();
    this.committedAdmissions.clear();
    this.pinnedDocumentEvaluations.clear();
    this.watchUnsubscribe?.();
    this.watchUnsubscribe = undefined;
    this.assetHashCache.clear();
    this.parameterResultCache = undefined;
    this.commonDependencyCache.clear();
    this.middlewareDependencyCache.clear();
    this.compiledWasmModules.clear();
    this.watchedPaths.clear();
    this.pendingNativeHandle = undefined;
    this.retainedEvaluation = undefined;
    // Nothing references the handles now — release them before onCleanup tears
    // down the kernel that owns their memory.
    this.disposeUnreachableNativeHandles();
    this.telemetryCollector?.dispose();
    this.telemetryCollector = undefined;
    this.tracer.setEntrySink(undefined);
    await this.computeHost?.dispose();
    this.computeHost = undefined;

    // Each extension may point at the same initialized bundler. Dispose that
    // context once, after accepted operations have drained.
    for (const bundler of new Set(this.loadedBundlers.values())) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- Release distinct bundlers in initialization order.
        await bundler.definition.onDispose?.(bundler.ctx);
      } catch (error) {
        this.logger.warn('Bundler disposal failed', {
          data: { error: String(error) },
        });
      }
    }
    this.loadedBundlers.clear();

    for (const transcoder of this.loadedTranscoders.values()) {
      if (!transcoder.initialized) {
        continue;
      }
      try {
        // oxlint-disable-next-line no-await-in-loop -- Sequential to preserve cleanup order
        await transcoder.definition.onDispose?.(transcoder.context);
      } catch (error) {
        this.logger.warn('Transcoder disposal failed', {
          data: { error: String(error) },
        });
      }
    }
    this.loadedTranscoders.clear();

    await this.onCleanup();
    this.fileSystem?.dispose();
    this.fileSystem = undefined;
  }

  /**
   * Entry point for extracting parameters from a file.
   * Handles base path setup, timing, and middleware application using onion model.
   *
   * @param file - The geometry file to extract parameters from.
   * @param resolution - Bounded manifest resolution settings.
   * @param operation - Optional request-owned staging and abort state.
   * @returns The extracted parameters.
   */
  public async getParameters(
    file: RuntimeFileLocator,
    resolution?: ParameterResolutionOptions,
    operation?: Readonly<{
      signal?: AbortSignal;
      stage?: Record<string, Uint8Array<ArrayBuffer>>;
    }>,
  ): Promise<GetParametersResult> {
    return this.enqueueOperation(async () => {
      this.operationSignal?.throwIfAborted();
      if (operation?.stage) {
        await this.writeFilesAndInvalidate(operation.stage);
        this.operationSignal?.throwIfAborted();
      }
      await this.revalidateRetainedFiles();
      const result = await this.getParametersInLane(file, { resolution });
      // I4: leave the watch covering whatever this operation retained.
      await this.reconcileObservedPaths();
      return result;
    }, operation?.signal);
  }

  private async getParametersInLane(
    file: RuntimeFileLocator,
    options: Readonly<{
      dependencyContext?: DependencyResolutionContext;
      owner?: OperationOwner;
      resolution?: ParameterResolutionOptions;
    }> = {},
  ): Promise<GetParametersResult> {
    const { dependencyContext, owner, resolution = {} } = options;
    const operationOwner = owner ?? (await this.createOperationOwner(file, 'request'));
    const entryPath = assertRootedPath(joinRelativePath(operationOwner.file.path, operationOwner.file.filename));
    const start = performance.now();

    const input: GetParametersInput = {
      entryPath,
      resolution,
    };

    const resolvedArray = this.getMiddleware().filter(
      ({ enabled, middleware }) => enabled && Boolean(middleware.wrapDescribe ?? middleware.resolve),
    );

    const depsSpan = this.tracer.startSpan('kernel.resolve-deps', {
      phase: 'resolvingDeps',
    });
    const dependencies = await this.computeDependencies({
      operations: ['describe'],
      resolvedMiddleware: resolvedArray,
      dependencyContext,
      owner: operationOwner,
    });
    const dependencyHash = await this.computeDependencyHash(dependencies);
    depsSpan.end();
    const parameterMiddlewareKey = canonicalJson(
      resolvedArray.map(({ id, middleware, options }) => ({
        id,
        version: middleware.version,
        options,
      })),
    );
    const kernelOptionsKey = canonicalJson(
      operationOwner.binding?.kernelId ? (this.kernelInitOptionsMap.get(operationOwner.binding.kernelId) ?? {}) : {},
    );
    const parameterCacheKey = [
      entryPath,
      operationOwner.binding?.kernelId ?? '<no-kernel>',
      operationOwner.binding?.kernelVersion ?? '<no-version>',
      kernelOptionsKey,
      parameterMiddlewareKey,
      dependencyHash,
      canonicalJson(resolution),
    ].join('|');
    const cached = this.parameterResultCache;
    if (cached?.key === parameterCacheKey) {
      // The manifest and source revision are frozen; only the issue list is the caller's to change.
      return { ...cached.result, issues: [...cached.result.issues] };
    }

    // The manifest identity is hashed only for a result that has to be computed.
    const parameterDependencyHash = await sha256String(canonicalJson({ dependencyHash, resolution }));
    const parameterScope = {
      kind: 'source',
      authority: this.filesystem.id,
      root: '',
      entry: entryPath,
    } as const;
    const parameterSource = {
      id: operationOwner.binding?.kernelId ?? 'unbound-kernel',
      version: operationOwner.binding?.kernelVersion ?? '0',
      revision: parameterDependencyHash,
      capability: 'json-structure',
    } as const;
    const parameterSourceFiles: ParameterManifest['identity']['sourceFiles'] = Object.fromEntries(
      dependencies.flatMap((dependency) =>
        dependency.type === 'file'
          ? ([
              [
                dependency.path,
                dependency.contentHash === 'missing'
                  ? 'missing'
                  : contentDigest({
                      value: `sha256:${dependency.contentHash}`,
                      name: `parameter source ${dependency.path}`,
                    }),
              ],
            ] as const)
          : [],
      ),
    );
    const parameterIdentity = {
      dependency: contentDigest({
        value: `sha256:${dependencyHash}`,
        name: 'parameter dependency hash',
      }),
      middleware: contentDigest({
        value: `sha256:${await sha256String(parameterMiddlewareKey)}`,
        name: 'parameter middleware identity',
      }),
      resolution,
      sourceFiles: parameterSourceFiles,
    } as const;
    const parameterSemanticHash = await sha256String(
      canonicalJson({
        dependency: parameterIdentity.dependency,
        middleware: parameterIdentity.middleware,
        resolution: parameterIdentity.resolution,
      }),
    );

    const runtimes = new Map<string, KernelMiddlewareRuntime>();
    for (const { middleware, options: middlewareOptions, enabled, id } of resolvedArray) {
      if (enabled && middleware.wrapDescribe) {
        runtimes.set(
          id,
          createMiddlewareRuntime({
            signal: this.operationSignal ?? neverAbortedSignal,
            tracer: this.tracer,
            onLog: this.onLog,
            middlewareName: middleware.name,
            filesystem: this.filesystem,
            compute: this.createComputeRuntime(this.operationSignal ?? neverAbortedSignal),
            dependencies,
            dependencyHash: parameterSemanticHash,
            stateSchema: middleware.stateSchema,
            options: middlewareOptions,
            logger: this.getMiddlewareLogger(id, middleware.name),
          }),
        );
      }
    }

    const { tracer } = this;
    let producerDeclaration: ParameterDeclaration | undefined;
    const kernelHandler = named(
      'kernelHandler',
      async (handlerInput: DescribeInput): Promise<DescribeResult<ParameterManifest>> => {
        const parametersSpan = tracer.startSpan('kernel.extract-params', {
          phase: 'extractingParams',
        });
        const result = await this.onGetParametersForOwner(operationOwner, handlerInput, this.createRuntime());
        parametersSpan.end();
        if (!result.success) {
          return result;
        }
        try {
          const manifest = await compileParameterManifest({
            declaration: result.data,
            scope: parameterScope,
            source: parameterSource,
            dependency: parameterIdentity.dependency,
            middleware: parameterIdentity.middleware,
            resolution: parameterIdentity.resolution,
            sourceFiles: parameterIdentity.sourceFiles,
          });
          producerDeclaration = {
            schema: manifest.schema,
            resources: manifest.resources,
            defaults: manifest.defaults,
            bindings: manifest.bindingDeclarations,
          };
          return { ...result, data: { parameters: manifest } };
        } catch (error) {
          return createKernelError([
            {
              message: error instanceof Error ? error.message : 'Parameter declaration admission failed',
              code: 'RUNTIME',
              type: 'kernel',
              severity: 'error',
              details: error instanceof ParameterAdmissionError ? error.diagnostics : undefined,
            },
          ]);
        }
      },
    );
    let chain = kernelHandler;

    for (let index = resolvedArray.length - 1; index >= 0; index--) {
      const { middleware, enabled, id } = resolvedArray[index]!;
      if (enabled && middleware.wrapDescribe) {
        const inner = chain;
        const runtime = runtimes.get(id)!;
        const middlewareName = middleware.name;
        const wrapHook = middleware.wrapDescribe;

        chain = named(`middleware(${middlewareName})`, async (handlerInput: DescribeInput) => {
          const span = tracer.startSpan(`middleware.wrap(${middlewareName})`, {
            middleware: middlewareName,
          });
          try {
            const result = await wrapHook(handlerInput, inner, runtime);
            span.end();
            return result;
          } catch (error) {
            span.end();
            // A superseded or closed operation is aborted, not failed: its caller drops it.
            if (runtime.signal.aborted) {
              throw error;
            }
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

    let chainedResult = await chain(input);
    if (chainedResult.success && producerDeclaration === undefined) {
      // A middleware cache hit bypasses the producer. Establish the current
      // trusted declaration through the same handler before admitting the
      // cached effective manifest; the cached manifest cannot be its own trust
      // baseline.
      const producerResult = await kernelHandler(input);
      if (!producerResult.success) {
        chainedResult = producerResult;
      }
    }
    let result: GetParametersResult = chainedResult.success
      ? { ...chainedResult, data: chainedResult.data.parameters }
      : chainedResult;
    if (chainedResult.success) {
      try {
        if (producerDeclaration === undefined) {
          throw new Error('Middleware returned parameters without invoking the producer declaration');
        }
        result = {
          ...chainedResult,
          data: await this.admitEffectiveManifest(chainedResult.data.parameters, {
            scope: parameterScope,
            source: parameterSource,
            identity: parameterIdentity,
            producerDeclaration,
          }),
        };
      } catch (error) {
        result = createKernelError([
          {
            message: error instanceof Error ? error.message : 'Effective parameter manifest admission failed',
            code: 'RUNTIME',
            type: 'kernel',
            severity: 'error',
            details: error instanceof ParameterAdmissionError ? error.diagnostics : undefined,
          },
        ]);
      }
    }
    /* Every computed description retains the source closure this lane already hashed,
     * including failures so watched documents can recover when a dependency changes.
     * Attach it before caching so a success replays the revision it was computed from. */
    result = {
      ...result,
      sourceRevision: Object.freeze({
        entry: entryPath,
        files: Object.freeze(parameterSourceFiles),
      }),
    };
    if (result.success) {
      this.parameterResultCache = {
        key: parameterCacheKey,
        result: { ...result, issues: [...result.issues] },
      };
    }

    this.logger.debug('getParameters completed', {
      data: { ms: performance.now() - start },
    });

    return result;
  }

  /**
   * Admit an effective manifest, reusing the last admission when the revision, context and
   * producer declaration all match it.
   *
   * The revision digests the manifest's whole semantic content, so a match with the same
   * trusted context and producer declaration is the manifest already admitted.
   *
   * @param candidate - Effective manifest returned through the middleware chain.
   * @param expectation - Trusted scope, source, identity and producer declaration.
   * @returns The admitted, deep-frozen manifest.
   */
  private async admitEffectiveManifest(
    candidate: ParameterManifest,
    expectation: ParameterAdmissionExpectation,
  ): Promise<ParameterManifest> {
    const key = canonicalJson({ revision: candidate.revision, expectation });
    if (this.admittedManifest?.key === key) {
      return this.admittedManifest.manifest;
    }
    const manifest = await admitParameterManifest(candidate, expectation);
    this.admittedManifest = { key, manifest };
    return manifest;
  }

  /**
   * Collect the selected entry's coherent source closure without evaluating geometry.
   *
   * @param request - Entry, optional staged files, and explicitly approved extra paths.
   * @param signal - Request-scoped cancellation signal.
   * @returns Source files, hashes, roles, unresolved diagnostics, and selected kernel id.
   */
  public async snapshotSource(
    request: RuntimeSourceSnapshotArgs,
    signal?: AbortSignal,
  ): Promise<RuntimeSourceSnapshotResult> {
    return this.enqueueOperation(async () => {
      const result = await this.snapshotSourceInLane(request);
      // I4: leave the watch covering whatever this operation retained.
      await this.reconcileObservedPaths();
      return result;
    }, signal);
  }

  private async snapshotSourceInLane(request: RuntimeSourceSnapshotArgs): Promise<RuntimeSourceSnapshotResult> {
    const signal = this.operationSignal ?? neverAbortedSignal;
    signal.throwIfAborted();
    if (request.stage) {
      await this.writeFilesAndInvalidate(request.stage);
    }
    await this.revalidateRetainedFiles();
    const owner = await this.createOperationOwner(request.file, 'request');
    const entryPath = assertRootedPath(joinRelativePath(owner.file.path, owner.file.filename));
    const discover = async (): Promise<{
      readonly kernelPaths: readonly string[];
      readonly unresolvedPaths: readonly string[];
      readonly middlewarePaths: readonly string[];
    }> => {
      const result = await this.onGetDependenciesForOwner(owner, { entryPath }, this.createRuntime());
      const kernelPaths = [...new Set([entryPath, ...result.resolved].map((path) => assertRootedPath(path)))].sort();
      const unresolvedPaths = [...new Set(result.unresolved.map((path) => assertRootedPath(path)))].sort();
      const middlewarePaths = await this.discoverSnapshotMiddlewarePaths(owner);
      return { kernelPaths, unresolvedPaths, middlewarePaths };
    };
    const initial = await discover();
    signal.throwIfAborted();
    const roles = new Map<string, RuntimeSourceSnapshotFileRole>();
    const rolePriority: Record<RuntimeSourceSnapshotFileRole, number> = {
      entry: 0,
      'kernel-dependency': 1,
      'middleware-dependency': 2,
      additional: 3,
    };
    const addRole = (path: string, role: RuntimeSourceSnapshotFileRole): void => {
      const canonical = assertRootedPath(path);
      const existing = roles.get(canonical);
      if (existing === undefined || rolePriority[role] < rolePriority[existing]) {
        roles.set(canonical, role);
      }
    };
    for (const path of initial.kernelPaths) {
      addRole(path, path === entryPath ? 'entry' : 'kernel-dependency');
    }
    for (const path of initial.middlewarePaths) {
      addRole(path, 'middleware-dependency');
    }
    const additionalRequired = new Set<string>();
    for (const additional of request.additionalPaths ?? []) {
      const path = assertRootedPath(additional.path);
      addRole(path, 'additional');
      if (additional.required) {
        additionalRequired.add(path);
      }
    }

    const selectedPaths = [...roles.keys()].sort();
    const exists = await Promise.all(
      selectedPaths.map(async (path) => [path, await this.filesystem.exists(path)] as const),
    );
    const missingPaths = exists.filter(([, present]) => !present).map(([path]) => path);
    const missingRequired = missingPaths.filter((path) => additionalRequired.has(path) || path === entryPath);
    if (missingRequired.length > 0) {
      return createKernelError([
        {
          code: 'SOURCE_SNAPSHOT_INVALID',
          message: 'A required source snapshot file is unavailable.',
          severity: 'error',
          type: 'runtime',
          details: { paths: missingRequired },
        },
      ]);
    }
    const readablePaths = exists.filter(([, present]) => present).map(([path]) => path);
    const contentByPath = await this.filesystem.readFiles(readablePaths);
    signal.throwIfAborted();
    const hashesByPath = new Map<string, string>();
    const files = [];
    for (const path of readablePaths) {
      const content = contentByPath[path];
      if (!content) {
        return createKernelError([
          {
            code: 'SOURCE_SNAPSHOT_INVALID',
            message: 'A selected source snapshot file could not be read.',
            severity: 'error',
            type: 'runtime',
            details: { path },
          },
        ]);
      }
      // oxlint-disable-next-line no-await-in-loop -- file order and hash publication remain deterministic.
      const sha256 = await this.hashContent(content);
      hashesByPath.set(path, sha256);
      files.push({
        path,
        content: new Uint8Array(content),
        sha256,
        role: roles.get(path)!,
      });
    }

    const revalidated = await discover();
    signal.throwIfAborted();
    const initialGraph = new Set([...initial.kernelPaths, ...initial.middlewarePaths, ...initial.unresolvedPaths]);
    const finalGraph = new Set([
      ...revalidated.kernelPaths,
      ...revalidated.middlewarePaths,
      ...revalidated.unresolvedPaths,
    ]);
    if (!setsEqual(initialGraph, finalGraph)) {
      return createKernelError([
        {
          code: 'SOURCE_SNAPSHOT_CHANGED',
          message: 'The source dependency graph changed while the snapshot was being collected.',
          severity: 'error',
          type: 'runtime',
        },
      ]);
    }

    const verifiedExists = await Promise.all(
      selectedPaths.map(async (path) => [path, await this.filesystem.exists(path)] as const),
    );
    if (verifiedExists.some(([path, present], index) => exists[index]![0] !== path || exists[index]![1] !== present)) {
      return createKernelError([
        {
          code: 'SOURCE_SNAPSHOT_CHANGED',
          message: 'The selected source files changed while the snapshot was being collected.',
          severity: 'error',
          type: 'runtime',
        },
      ]);
    }
    const verifiedContent = await this.filesystem.readFiles(readablePaths);
    signal.throwIfAborted();
    const changedPaths = await Promise.all(
      readablePaths.map(async (path) => {
        const content = verifiedContent[path];
        return !content || (await this.hashContent(content)) !== hashesByPath.get(path) ? path : undefined;
      }),
    );
    const changedPath = changedPaths.find((path) => path !== undefined);
    if (changedPath) {
      return createKernelError([
        {
          code: 'SOURCE_SNAPSHOT_CHANGED',
          message: 'The selected source files changed while the snapshot was being collected.',
          severity: 'error',
          type: 'runtime',
          details: { path: changedPath },
        },
      ]);
    }

    // Middleware dependencies may be absent (the normal compute path hashes them as 'missing').
    // Keep them selected for existence/coherence checks; kernel dependencies still require bytes.
    const missingDependencies = missingPaths.filter((path) => roles.get(path) === 'kernel-dependency');
    const unresolvedPaths = [...new Set([...initial.unresolvedPaths, ...missingDependencies])].sort();
    const issues: KernelIssue[] =
      unresolvedPaths.length === 0
        ? []
        : [
            {
              code: 'SOURCE_SNAPSHOT_INVALID',
              message: 'Some source dependencies are unresolved.',
              severity: 'warning',
              type: 'runtime',
              details: { paths: unresolvedPaths },
            },
          ];
    return {
      success: true,
      data: {
        entryPath,
        files,
        unresolvedPaths,
        kernelId: owner.binding?.kernelId ?? 'unknown',
      },
      issues,
      /* R4/I5: this lane hashed the closure itself, so the revision is those hashes, in the same
       * digest vocabulary the parameter manifest and the write tools use. */
      sourceRevision: {
        entry: entryPath,
        files: Object.fromEntries<ContentDigest | 'missing'>([
          ...[...hashesByPath].map(
            ([path, sha256]) =>
              [
                path,
                contentDigest({
                  value: `sha256:${sha256}`,
                  name: `source snapshot ${path}`,
                }),
              ] as const,
          ),
          ...unresolvedPaths.map((path) => [path, 'missing'] as const),
        ]),
      },
    };
  }

  private async discoverSnapshotMiddlewarePaths(owner: OperationOwner): Promise<readonly string[]> {
    const input: GetDependenciesInput = {
      entryPath: assertRootedPath(joinRelativePath(owner.file.path, owner.file.filename)),
    };
    const paths: string[] = [];
    for (const { middleware, options, enabled, id } of this.getMiddleware()) {
      if (!enabled || !middleware.resolve) {
        continue;
      }
      try {
        // oxlint-disable-next-line no-await-in-loop -- middleware declaration order is part of runtime semantics.
        const declarations = await middleware.resolve(input, {
          signal: this.operationSignal ?? neverAbortedSignal,
          logger: this.getMiddlewareLogger(id, middleware.name),
          filesystem: this.filesystem,
          options,
        });
        paths.push(...declarations.map(({ path }) => assertRootedPath(path)));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw Object.assign(new Error(`Middleware dependency error in ${middleware.name}: ${message}`), {
          issues: [
            {
              message: `Middleware dependency error in ${middleware.name}: ${message}`,
              code: 'MIDDLEWARE_FAILED',
              type: 'kernel',
              severity: 'error',
            } satisfies KernelIssue,
          ],
        });
      }
    }
    return [...new Set(paths)].sort();
  }

  /** Runs a registered transcoder directly, without a kernel render or filesystem. */
  public async transcode(request: RuntimeTranscodeArgs, signal?: AbortSignal): Promise<TranscodeResult> {
    return this.enqueueOperation(async () => {
      signal?.throwIfAborted();
      return this.transcodeInLane(request);
    }, signal);
  }

  private async transcodeInLane(request: RuntimeTranscodeArgs): Promise<TranscodeResult> {
    const transcoder = [...this.loadedTranscoders.values()].find(({ edges }) =>
      edges.some(({ from, to }) => from === request.from && to === request.to),
    );
    const edge = transcoder?.edges.find(({ from, to }) => from === request.from && to === request.to);
    if (!transcoder || !edge) {
      return createKernelError([
        {
          message: `No loaded transcoder for ${request.from} → ${request.to}.`,
          code: 'TRANSCODER_CAPABILITY_MISSING',
          type: 'runtime',
          severity: 'error',
        },
      ]);
    }

    const span = this.tracer.startSpan('kernel.transcode', {
      from: request.from,
      to: request.to,
      transcoder: transcoder.id,
    });

    const admittedOptions = admitKernelOptions(
      edge.optionsSchema,
      request.options,
      `Transcoder ${request.from} → ${request.to}`,
      'TRANSCODER_OPTIONS_INVALID',
    );
    if (!admittedOptions.success) {
      span.end({ success: false });
      return createKernelError(admittedOptions.issues);
    }
    const { options } = admittedOptions;

    let context: unknown;
    try {
      context = await this.initializeTranscoder(transcoder);
      this.operationSignal?.throwIfAborted();
    } catch (error) {
      span.end({ success: false });
      this.operationSignal?.throwIfAborted();
      return createKernelError([
        {
          message: `Transcoder "${transcoder.id}" initialization failed: ${error instanceof Error ? error.message : String(error)}`,
          code: 'TRANSCODER_INITIALIZATION_FAILED',
          type: 'runtime',
          severity: 'error',
        },
      ]);
    }

    try {
      const result = await transcoder.definition.transcode(
        { ...request, options },
        {
          logger: this.logger,
          tracer: this.tracer,
          signal: this.operationSignal ?? neverAbortedSignal,
        },
        context,
      );
      this.operationSignal?.throwIfAborted();
      const finalized = finalizeExportArtifactSet(result);
      span.end({ success: finalized.success });
      return finalized;
    } catch (error) {
      span.end({ success: false });
      this.operationSignal?.throwIfAborted();
      return createKernelError([
        {
          message: `Transcoder "${transcoder.id}" failed: ${error instanceof Error ? error.message : String(error)}`,
          code: 'TRANSCODER_EXECUTION_FAILED',
          type: 'runtime',
          severity: 'error',
        },
      ]);
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
   * Selectively invalidate file caches for changed paths.
   * Called by the kernel machine before render operations when files have changed.
   *
   * @param changedPaths - Paths within the runtime filesystem that changed.
   */
  public async notifyFileChanged(changedPaths: readonly string[]): Promise<void> {
    const paths = [...new Set(changedPaths.map((path) => assertRootedPath(path)))];
    await this.enqueueOperation(async () => this.routeExactChangedPaths(paths));
  }

  /**
   * Get the current set of watched file paths.
   * Primarily for test assertions — production code should not depend on this.
   * @returns A copy of the internal watched-path set.
   */
  public getWatchedPaths(): Set<string> {
    return new Set(this.watchedPaths);
  }

  private async reconcileWatchSet(desiredPaths: Map<string, number>): Promise<boolean> {
    const desired = new Map(
      [...desiredPaths].filter(([path]) => path !== '.tau/cache' && !path.startsWith('.tau/cache/')),
    );
    const desiredSet = new Set(desired.keys());
    if (setsEqual(this.watchedPaths, desiredSet)) {
      return true;
    }

    if (!this.fileSystem?.watch || desired.size === 0) {
      const previous = this.watchUnsubscribe;
      this.watchedPaths = desiredSet;
      this.watchUnsubscribe = undefined;
      previous?.();
      return true;
    }

    const oldPaths = this.watchedPaths;
    const addedPaths = [...desiredSet].filter((path) => !oldPaths.has(path));
    const unknownPaths = addedPaths.filter((path) => !this.fileHashCache.has(path));
    if (unknownPaths.length > 0) {
      const evaluationSequence = this.documentEvaluationSequence;
      const stagedWrite = this.stagedWritePublication;
      if (stagedWrite && unknownPaths.some((path) => stagedWrite.paths.has(path))) {
        return false;
      }
      // Establish the entry's revision before a kernel can retain an operation-local mirror.
      // A later watch echo is harmless only if it agrees with these already-observed bytes.
      const baselines = await Promise.all(
        unknownPaths.map(async (path) => ({ path, revision: await this.readObservedRevision(path) })),
      );
      if (
        !this.operationAdmissionOpen ||
        this.documentEvaluationSequence !== evaluationSequence ||
        this.stagedWritePublication !== stagedWrite ||
        unknownPaths.some((path) => this.fileHashCache.has(path))
      ) {
        return false;
      }
      for (const { path, revision } of baselines) {
        this.fileHashCache.set(path, revision.hash);
        if (revision.content === undefined) {
          this.fileContentCache.delete(path);
        } else {
          this.fileContentCache.set(path, revision.content);
        }
      }
    }
    const addedSet = new Set(addedPaths);
    const armingEvents = { resetObserved: false, addedPathRevision: 0 };
    const handler = (event: WatchEvent): void => {
      if (event.type === 'reset') {
        armingEvents.resetObserved = true;
      } else if (this.exactWatchEventPaths(event).some((path) => addedSet.has(path))) {
        armingEvents.addedPathRevision++;
      }
      void this.routeWatchEvent(event);
    };
    const replacement = this.fileSystem.watchReady
      ? this.fileSystem.watchReady(
          {
            paths: [...desiredSet],
            recursive: false,
            excludes: ['.tau/cache/**'],
          },
          handler,
        )
      : {
          unsubscribe: this.fileSystem.watch(
            {
              paths: [...desiredSet],
              recursive: false,
              excludes: ['.tau/cache/**'],
            },
            handler,
          ),
          ready: Promise.resolve(),
        };

    try {
      await replacement.ready;
      let validationRevision: number;
      do {
        validationRevision = armingEvents.addedPathRevision;
        // oxlint-disable-next-line no-await-in-loop -- an event during validation requires a fresh coherent snapshot
        const divergent = await this.findDivergentPaths(addedPaths);
        /* R2/I3: nothing resolved from a path the arm just contradicted may stay reusable.
         * Exactly the divergent paths and their dependents go, so whatever did not move is
         * still there for the render the queued change event is about to drive.
         *
         * Their `fileHashCache` entries deliberately stay, holding the revision this worker
         * last *observed* rather than the one this comparison just read:
         * `readChangedObservedRevisions` treats a path with no retained hash as never
         * observed and swallows its event as a baseline read, so deleting the hash here
         * would drop the very change event that refused this arm. The next reader — that event, or
         * `revalidateRetainedFiles` — compares against the stale hash, finds the same
         * divergence, and records the new revision then. */
        if (divergent.length > 0) {
          this.commonDependencyCache.clear();
          this.middlewareDependencyCache.clear();
          this.parameterResultCache = undefined;
          for (const path of divergent) {
            this.fileContentCache.delete(path);
          }
          this._invalidateBundleCachesForPaths(divergent);
        }
        if (!this.operationAdmissionOpen || armingEvents.resetObserved || divergent.length > 0) {
          replacement.unsubscribe();
          return false;
        }
      } while (validationRevision !== armingEvents.addedPathRevision);

      const previous = this.watchUnsubscribe;
      this.watchUnsubscribe = replacement.unsubscribe;
      this.watchedPaths = desiredSet;
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
      parameterDefaults: Record<string, unknown>;
      parameterManifest: ParameterManifest;
      parameterSchema: JSONSchema7;
      options?: Record<string, unknown>;
      content?: RuntimeContentInput;
      export?: {
        format: string;
        options: Record<string, unknown>;
        dependency: ExportDependency;
      };
    },
    options: {
      dependencyContext?: DependencyResolutionContext;
      owner?: OperationOwner;
    },
  ): Promise<{ artifact: MaterializedRender }> {
    const owner = options.owner ?? (await this.createOperationOwner(entry.file, 'request'));
    const ownerFilePath = assertRootedPath(joinRelativePath(owner.file.path, owner.file.filename));
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
    const resolvedArray = createMiddleware;

    const geoDepsSpan = this.tracer.startSpan('kernel.resolve-deps', {
      phase: 'resolvingDeps',
    });
    const dependencies = await this.computeDependencies({
      operations: ['evaluate', ...(entry.export ? (['export'] as const) : [])],
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
      operations: ['evaluate'],
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
    const evaluationIdentityKey = createNativeHandleIdentityKey({
      file: entry.file,
      selectedKernelId: owner.binding?.kernelId,
      selectedKernelVersion: owner.binding?.kernelVersion,
      nativeHandleKey,
    });
    let evaluationSlot = this.createEvaluationSlot(owner, evaluationIdentityKey);

    const runtimes = new Map<string, KernelMiddlewareRuntime>();
    for (const { middleware, options: middlewareOptions, enabled, id } of createMiddleware) {
      if (enabled && middleware.wrapEvaluate) {
        runtimes.set(
          id,
          createMiddlewareRuntime({
            signal: this.operationSignal ?? neverAbortedSignal,
            tracer: this.tracer,
            onLog: this.onLog,
            middlewareName: middleware.name,
            filesystem: this.filesystem,
            compute: this.createComputeRuntime(this.operationSignal ?? neverAbortedSignal),
            dependencies: nativeHandleDependencies,
            dependencyHash: nativeHandleKey,
            stateSchema: middleware.stateSchema,
            options: middlewareOptions,
            logger: this.getMiddlewareLogger(id, middleware.name),
          }),
        );
      }
    }

    const { tracer } = this;
    let chain: (input: EvaluateRequest) => Promise<EvaluateResult> = named(
      'kernelHandler',
      async (handlerInput: EvaluateRequest) => {
        const computeSpan = tracer.startSpan('kernel.compute');
        const createSchema = owner.binding?.kernelId
          ? this.kernelCreateOptionsZodSchemaMap.get(owner.binding.kernelId)
          : undefined;
        const chainParameters = mergeParameterDefaults({}, handlerInput.parameters, entry.parameterSchema);
        const unitlessText = unitlessTextParameter(entry.parameterManifest, entry.parameterSchema, chainParameters);
        if (unitlessText) {
          computeSpan.end();
          return createKernelError([
            {
              message: `Parameter ${unitlessText.pointer} received unit-bearing text "${unitlessText.text}", but the field declares no unit. Send a number in the field's declared scale or add a unit declaration.`,
              code: 'SEMANTICS_UNRESOLVED',
              type: 'kernel',
              severity: 'error',
            },
          ]);
        }
        let resolvedParameters: Readonly<Record<string, unknown>>;
        try {
          resolvedParameters = resolveParameterInputValues(entry.parameterManifest, chainParameters);
        } catch (error) {
          computeSpan.end();
          const diagnostic = error instanceof ParameterAdmissionError ? error.diagnostics[0] : undefined;
          return createKernelError([
            {
              message: error instanceof Error ? error.message : String(error),
              code: diagnostic?.code ?? 'INVALID_SCHEMA',
              type: 'kernel',
              severity: 'error',
              ...(diagnostic ? { details: diagnostic } : {}),
            },
          ]);
        }
        const parameters = mergeParameterDefaults(
          entry.parameterDefaults,
          { ...resolvedParameters },
          entry.parameterSchema,
        );
        if (!validateJsonSchemaValue(entry.parameterSchema, parameters)) {
          computeSpan.end();
          return createKernelError([
            {
              message: 'Parameters do not satisfy the admitted execution schema',
              code: 'RUNTIME',
              type: 'kernel',
              severity: 'error',
            },
          ]);
        }
        const kernelInput: NativeBuildInput = {
          entryPath: handlerInput.entryPath,
          // Persisted-parameter middleware may reintroduce values removed from the source schema.
          parameters,
          ...(createSchema
            ? {
                options:
                  handlerInput.options ??
                  ('options' in createOptionsResult.input ? createOptionsResult.input.options : {}),
              }
            : {}),
        };
        const retained = this.retainedEvaluation;
        const sameBuild =
          retained?.identityKey === evaluationIdentityKey &&
          retained.nativeBuildInput !== undefined &&
          canonicalJson(retained.nativeBuildInput) === canonicalJson(kernelInput);
        if (sameBuild && retained.hasHandle) {
          try {
            if ((await this.isNativeHandleValidForOwner(owner, retained.handle, this.createRuntime())) === false) {
              this.dropEvaluationHandle(retained);
            }
          } catch {
            this.dropEvaluationHandle(retained);
          }
        }
        if (sameBuild && (retained.hasHandle || retained.serializedNativeHandleSlot)) {
          evaluationSlot = retained;
          this.activeEvaluationSlot = retained;
          computeSpan.end();
          return {
            success: true,
            data: retained.terminalOffers ?? {},
            issues: retained.terminalIssues ?? [],
            [nativeBuildInputSymbol]: retained.nativeBuildInput,
          };
        }
        evaluationSlot.nativeBuildInput = kernelInput;
        const documentController = this.activeDocumentEvaluationController;
        const documentSignalView = documentController ? this.documentSignalView : undefined;
        const sequence = this.activeDocumentEvaluationSequence;
        const documentState = documentSignalView ? beginDocumentAbort(documentSignalView, sequence) : undefined;
        if (documentController) {
          setAbortContext({
            signal: documentController.signal,
            ...(documentSignalView && documentState !== undefined
              ? { documentSignalView, documentSignalState: documentState }
              : {}),
            onSharedAbort: (reason) => {
              documentController.abort(reason);
            },
          });
          this.onProgress?.(
            'evaluate',
            documentState === undefined ? undefined : { abortGeneration: documentAbortGeneration(documentState) },
          );
        }
        let result: EvaluateResult;
        try {
          result = await this.onEvaluateForOwner(owner, kernelInput, this.createRuntime(), evaluationSlot);
          if (result.success) {
            evaluationSlot.terminalOffers = result.data;
            evaluationSlot.terminalIssues = [...result.issues];
          }
        } finally {
          if (documentController) {
            clearAbortContext();
          }
          if (documentSignalView) {
            endDocumentAbort(documentSignalView, sequence);
          }
        }
        computeSpan.end();
        return { ...result, [nativeBuildInputSymbol]: kernelInput };
      },
    );

    for (let index = createMiddleware.length - 1; index >= 0; index--) {
      const { middleware, enabled, id } = createMiddleware[index]!;
      if (enabled && middleware.wrapEvaluate) {
        const inner = chain;
        const runtime = runtimes.get(id)!;
        const middlewareName = middleware.name;
        const wrapHook = middleware.wrapEvaluate;

        chain = named(`middleware(${middlewareName})`, async (handlerInput: EvaluateRequest) => {
          const span = tracer.startSpan(`middleware.wrap(${middlewareName})`, {
            middleware: middlewareName,
          });
          try {
            const result = await wrapHook(handlerInput, inner, runtime);
            span.end();
            return result;
          } catch (error) {
            span.end();
            // A superseded or closed operation is aborted, not failed: its caller drops it.
            if (runtime.signal.aborted) {
              throw error;
            }
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
    this.activeEvaluationSlot = evaluationSlot;
    let evaluated: EvaluateResult;
    try {
      evaluated = await chain(input);
    } finally {
      this.activeEvaluationSlot = undefined;
    }
    evaluationSlot.offers = evaluated.success ? evaluated.data : undefined;
    if (evaluated.success) {
      evaluationSlot.issues = evaluated.issues;
    }
    if (evaluated.success && evaluationSlot.hasHandle && evaluationSlot.nativeBuildInput) {
      // A finished evaluation remains reusable even if its view was superseded before projection.
      this.retainedEvaluation = evaluationSlot;
    }
    this.operationSignal?.throwIfAborted();
    if (evaluated.success && evaluationSlot.hasHandle) {
      evaluationSlot.nativeBuildInput ??= evaluated[nativeBuildInputSymbol];
    }
    const internalResult: CreateGeometryResult & NativeBuildInputCarrier = evaluated.success
      ? {
          success: true,
          data: undefined,
          issues: evaluated.issues,
          ...(evaluated.serializedHandle === undefined ? {} : { serializedNativeHandle: evaluated.serializedHandle }),
          ...(evaluated.serializeHandleSnapshot === undefined
            ? {}
            : {
                serializeNativeHandleSnapshot: evaluated.serializeHandleSnapshot,
              }),
          [nativeBuildInputSymbol]: evaluated[nativeBuildInputSymbol],
        }
      : evaluated;
    const nativeBuildInput = evaluated[nativeBuildInputSymbol];
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

    // Bind native-handle slots before the mesh phase so the mesh boundary can
    // materialize the handle through the same live/serialized/reheat machinery
    // exports use.
    const serializedNativeHandle = internalResult.success ? internalResult.serializedNativeHandle : undefined;
    const { liveNativeHandleSlot, serializedNativeHandleSlot } = this.bindNativeHandleSlots({
      identity,
      slot: evaluationSlot,
      success: internalResult.success,
      serializedNativeHandle,
      serializeNativeHandleSnapshot: internalResult.success ? internalResult.serializeNativeHandleSnapshot : undefined,
    });

    // Evaluation retains the native handle and its snapshot for views and exports.
    // Public view artifacts are produced by the separate render operation.
    const result: MaterializedRenderResult = internalResult.success
      ? { success: true, data: undefined, issues: internalResult.issues }
      : internalResult;

    const artifact: MaterializedRender = {
      identity,
      owner,
      result,
      evaluationSlot,
      liveNativeHandleSlot,
      serializedNativeHandleSlot,
    };
    this.logger.debug('Document evaluation completed', {
      data: {
        ms: performance.now() - start,
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
  protected captureNativeHandle(nativeHandle: unknown, owner?: OperationOwner, evaluationSlot?: EvaluationSlot): void {
    this.pendingNativeHandle = nativeHandle;
    const slot = evaluationSlot ?? this.activeEvaluationSlot;
    if (slot) {
      slot.hasHandle = true;
      slot.handle = nativeHandle;
      this.ownNativeHandle(slot, owner);
    }
  }

  /**
   * Whether a native handle is still owned, and therefore still safe to read.
   *
   * `disposeUnreachableNativeHandles` deletes from the ownership registry before it disposes, so
   * this is the precise liveness answer a deferred snapshot needs.
   *
   * @param nativeHandle - The handle to check.
   * @returns True while the worker still owns it.
   */
  protected isNativeHandleLive(nativeHandle: unknown): boolean {
    return [...this.ownedNativeHandles.values()].some((owned) => owned.handle === nativeHandle);
  }

  private ownNativeHandle(slot: EvaluationSlot, owner: OperationOwner | undefined): void {
    if (owner === undefined || !slot.hasHandle) {
      return;
    }
    const previous = this.ownedNativeHandles.get(slot.id);
    if (previous && previous.handle !== slot.handle) {
      this.releaseOwnedNativeHandle(previous);
    }
    this.ownedNativeHandles.set(slot.id, { slot, handle: slot.handle });
  }

  private releaseOwnedNativeHandle(owned: { slot: EvaluationSlot; handle: unknown }): void {
    const sharedObject =
      (typeof owned.handle === 'object' && owned.handle !== null) || typeof owned.handle === 'function';
    if (
      sharedObject &&
      [...this.ownedNativeHandles.values()].some((other) => other !== owned && other.handle === owned.handle)
    ) {
      return;
    }
    try {
      this.disposeNativeHandleForOwner(owned.slot.owner, owned.handle, this.createRuntime(), owned.slot);
    } catch (error) {
      this.logger.warn('Native-handle disposal failed', {
        data: { error: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  private dropEvaluationHandle(slot: EvaluationSlot): void {
    slot.liveNativeHandleSlot = undefined;
    slot.hasHandle = false;
    slot.handle = undefined;
    const owned = this.ownedNativeHandles.get(slot.id);
    if (owned) {
      this.ownedNativeHandles.delete(slot.id);
      this.releaseOwnedNativeHandle(owned);
    }
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

    const retained = new Set<number>(
      [
        this.activeEvaluationSlot?.id,
        this.retainedEvaluation?.id,
        ...[...this.documents.values()].flatMap((document) => [
          document.current?.artifact?.evaluationSlot?.id,
          document.committed?.artifact?.evaluationSlot?.id,
        ]),
        ...[...this.committedAdmissions].map((admission) => admission.evaluation?.artifact?.evaluationSlot?.id),
        ...[...this.pinnedDocumentEvaluations.keys()].map((evaluation) => evaluation.artifact?.evaluationSlot?.id),
      ].filter((id): id is number => id !== undefined),
    );

    // Built on first release only: most operation boundaries drop nothing.
    for (const [id, owned] of this.ownedNativeHandles) {
      if (retained.has(id)) {
        continue;
      }

      this.ownedNativeHandles.delete(id);
      this.releaseOwnedNativeHandle(owned);
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
    readonly slot: EvaluationSlot;
    readonly success: boolean;
    /** A snapshot already in hand — a cache hit decodes one. */
    readonly serializedNativeHandle: unknown;
    /** Or the means to make one on first read (D12). */
    readonly serializeNativeHandleSnapshot?: (() => unknown) | undefined;
  }): {
    liveNativeHandleSlot?: NativeHandleSlot;
    serializedNativeHandleSlot?: SerializedNativeHandleSlot;
  } {
    const { identity, slot, success, serializedNativeHandle, serializeNativeHandleSnapshot } = input;
    const identityKey = createNativeHandleIdentityKey(identity);
    this.pendingNativeHandle = undefined;

    const liveNativeHandleSlot =
      success && slot.hasHandle
        ? {
            evaluationId: slot.id,
            identityKey,
            kernelId: identity.selectedKernelId,
            kernelVersion: identity.selectedKernelVersion,
            handle: slot.handle,
          }
        : undefined;
    slot.liveNativeHandleSlot = liveNativeHandleSlot;

    const hasSnapshot = serializedNativeHandle !== undefined && serializedNativeHandle !== null;
    if (!success || (!hasSnapshot && serializeNativeHandleSnapshot === undefined)) {
      return {
        liveNativeHandleSlot,
        serializedNativeHandleSlot: slot.serializedNativeHandleSlot,
      };
    }

    const serializedNativeHandleSlot: SerializedNativeHandleSlot = {
      evaluationId: slot.id,
      identityKey,
      kernelId: identity.selectedKernelId,
      kernelVersion: identity.selectedKernelVersion,
      serializedNativeHandle,
    };
    if (hasSnapshot) {
      slot.serializedNativeHandleSlot = serializedNativeHandleSlot;
      return { liveNativeHandleSlot, serializedNativeHandleSlot };
    }
    /* Resolved on the first read and remembered, so an export and the reheat that follows it do not
     * serialise the same shape twice — and so nothing pays on the display path that never reads. */
    let resolved: { value: unknown } | undefined;
    Object.defineProperty(serializedNativeHandleSlot, 'serializedNativeHandle', {
      configurable: true,
      enumerable: true,
      get: () => {
        resolved ??= {
          value: this.isEvaluationSlotLive(slot) ? serializeNativeHandleSnapshot!() : undefined,
        };
        return resolved.value;
      },
      set: (value: unknown) => {
        resolved = { value };
      },
    });

    slot.serializedNativeHandleSlot = serializedNativeHandleSlot;
    return { liveNativeHandleSlot, serializedNativeHandleSlot };
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
    const evaluation = artifact.evaluationSlot;
    if (evaluation?.liveNativeHandleSlot === slot) {
      this.dropEvaluationHandle(evaluation);
    }
  }

  protected clearSerializedNativeHandleSlot(artifact: MaterializedRender, slot: SerializedNativeHandleSlot): void {
    if (artifact.serializedNativeHandleSlot === slot) {
      artifact.serializedNativeHandleSlot = undefined;
    }
    if (artifact.evaluationSlot?.serializedNativeHandleSlot === slot) {
      artifact.evaluationSlot.serializedNativeHandleSlot = undefined;
    }
  }

  protected configureRuntimePlugins(options: KernelWorkerOptions): void {
    this.assertUniquePluginIds('middleware', options.middleware ?? []);
    this.assertUniquePluginIds('bundler', options.bundlers ?? []);
    this.assertUniquePluginIds('transcoder', options.transcoders ?? []);
    this.assertUniqueTranscoderEdges(options.transcoders ?? []);
    this.manifestKernelPlugins = options.kernels ?? [];
    this.middlewarePlugins = options.middleware ?? [];
    this.bundlerPlugins = options.bundlers ?? [];
    this.transcoderPlugins = options.transcoders ?? [];
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

  private assertUniqueTranscoderEdges(entries: readonly TranscoderPluginEntry[]): void {
    // Cross-plugin duplicates are legitimate (assimp shadows the dedicated
    // gltf transcoder's gltf → glb, for example): the FIRST registration wins,
    // matching the deterministic composition order the caller wrote and the
    // insertion-order lookup the direct transcode RPC performs. A shadowed
    // edge is surfaced as a warning; only a plugin duplicating its OWN edge is
    // a hard authoring error.
    const owners = new Map<string, string>();
    for (const entry of entries) {
      for (const edge of entry.edges ?? []) {
        const key = `${edge.from}\0${edge.to}`;
        const owner = owners.get(key);
        if (owner === entry.id) {
          throw new Error(`Duplicate transcoder edge ${edge.from} → ${edge.to} registered twice by "${entry.id}".`);
        }
        if (owner !== undefined) {
          console.warn(
            `[kernel-worker] transcoder edge ${edge.from} → ${edge.to} from "${entry.id}" is shadowed by "${owner}" (first registration wins).`,
          );
          continue;
        }
        owners.set(key, entry.id);
      }
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
   * Hook called when a file change may alter what was derived from source files. A change only a
   * geometry-stage middleware depends on does not call it.
   * Subclasses can override to perform additional invalidation (e.g., selection cache).
   *
   * @param _changedPaths - Paths within the runtime filesystem that changed.
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
  ): Promise<GetParameterDeclarationsResult> {
    return this.onGetParameters(input, runtime);
  }

  protected async onGetDependenciesForOwner(
    _owner: OperationOwner,
    input: GetDependenciesInput,
    runtime: KernelRuntime,
  ): Promise<GetDependenciesResult> {
    return this.onGetDependencies(input, runtime);
  }

  // oxlint-disable-next-line max-params -- Owner-bound hook also carries the evaluation slot.
  protected async onCreateGeometryForOwner(
    _owner: OperationOwner,
    input: NativeBuildInput,
    runtime: KernelRuntime,
    _slot: EvaluationSlot,
  ): Promise<CreateGeometryResult> {
    return this.onCreateGeometry(input, runtime);
  }

  /** Evaluate the selected kernel before the current-client display bridge. */
  // oxlint-disable-next-line max-params -- Owner-bound hook also carries the evaluation slot.
  protected abstract onEvaluateForOwner(
    owner: OperationOwner,
    input: NativeBuildInput,
    runtime: KernelRuntime,
    slot: EvaluationSlot,
  ): Promise<EvaluateResult>;

  /** Expose an exact native render/export token only while its hook is running. */
  private async withDocumentNativeAbort<Result>(
    phase: 'render' | 'export',
    hook: () => Promise<Result>,
  ): Promise<Result> {
    const active = this.activeDocumentNativeOperation;
    if (!active) {
      return hook();
    }
    this.documentEvaluationSequence = nextDocumentAbortSequence(this.documentEvaluationSequence);
    const sequence = this.documentEvaluationSequence;
    const view = this.documentSignalView;
    const state = view ? beginDocumentAbort(view, sequence) : undefined;
    setAbortContext({
      signal: active.controller.signal,
      ...(view && state !== undefined ? { documentSignalView: view, documentSignalState: state } : {}),
      onSharedAbort: (reason) => {
        active.controller.abort(reason);
      },
    });
    active.progress(phase, sequence, state === undefined ? undefined : documentAbortGeneration(state));
    try {
      return await hook();
    } finally {
      clearAbortContext();
      if (view) {
        endDocumentAbort(view, sequence);
      }
    }
  }

  /** Allocate an identity before entering the terminal evaluate hook. */
  protected createEvaluationSlot(owner: OperationOwner, identityKey: string): EvaluationSlot {
    return {
      id: ++this.nextEvaluationId,
      identityKey,
      owner,
      hasHandle: false,
      handle: undefined,
    };
  }

  /** A deferred snapshot may read the payload only while its evaluation is retained. */
  protected isEvaluationSlotLive(slot: EvaluationSlot): boolean {
    return this.ownedNativeHandles.get(slot.id)?.slot === slot;
  }

  /**
   * Whether the owner's kernel implements the optional `meshGeometry` display phase.
   * Base workers have no kernel registry, so the display path must come from
   * inline `createGeometry` geometry.
   */
  protected kernelHasMeshPhaseForOwner(_owner: OperationOwner): boolean {
    return false;
  }

  /** Select the current client's default view from one evaluation's serializable offers. */
  protected abstract selectDefaultViewForOwner(
    owner: OperationOwner,
    offers: KernelOffers,
  ): { view: string; mimeType: MediaType; instance?: string } | undefined;

  /** Render a selected view before current-client artifact conversion. */
  // oxlint-disable-next-line max-params -- Owner-bound hook also carries the evaluation slot.
  protected abstract onRenderForOwner(
    owner: OperationOwner,
    input: RenderRequest & { nativeHandle: unknown },
    runtime: KernelRuntime,
    slot: EvaluationSlot,
  ): Promise<RenderResult>;

  // oxlint-disable-next-line max-params -- Owner-bound hook also carries the evaluation slot.
  protected async onExportGeometryForOwner(
    _owner: OperationOwner,
    input: ExportGeometryInput,
    runtime: KernelRuntime,
    _slot?: EvaluationSlot,
  ): Promise<ExportGeometryResult> {
    return this.onExportGeometry(input, runtime);
  }

  /**
   * Extra detail for an owner whose entry matched no kernel. Base workers have no kernel
   * registry; the runtime worker names the entry extension and the registered ones.
   *
   * @param _owner - Owner whose binding carries no kernel.
   * @returns A diagnostic sentence, or undefined when the worker cannot describe the miss.
   */
  protected describeUnselectedKernel(_owner: OperationOwner): string | undefined {
    return undefined;
  }

  protected async isNativeHandleValidForOwner(
    _owner: OperationOwner,
    _nativeHandle: unknown,
    _runtime: KernelRuntime,
  ): Promise<boolean | undefined> {
    return undefined;
  }

  // oxlint-disable-next-line max-params -- Owner-bound hook also carries the evaluation slot.
  protected async deserializeNativeHandleForOwner(
    _owner: OperationOwner,
    _serializedNativeHandle: unknown,
    _runtime: KernelRuntime,
    _slot: EvaluationSlot,
  ): Promise<unknown | undefined> {
    return undefined;
  }

  /** Release a dropped native handle through the kernel that created it. */
  // oxlint-disable-next-line max-params -- Owner-bound hook also carries the evaluation slot.
  protected disposeNativeHandleForOwner(
    _owner: OperationOwner,
    _nativeHandle: unknown,
    _runtime: KernelRuntime,
    _slot?: EvaluationSlot,
  ): void {
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
      let bytes: ArrayBuffer;
      try {
        // oxlint-disable-next-line no-await-in-loop -- verification errors must identify the exact declared asset
        bytes = await loadWasmBinary(asset.url);
      } catch (error) {
        throw new Error(
          `Failed to load implementation asset ${pluginId}:${asset.id}: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
      // oxlint-disable-next-line no-await-in-loop -- verification errors must identify the exact declared asset
      const actual = await sha256Bytes(new Uint8Array(bytes));
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
  protected abstract onGetParameters(
    input: GetParametersInput,
    runtime: KernelRuntime,
  ): Promise<GetParameterDeclarationsResult>;

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
   * @returns Root-relative dependencies, including the entry path.
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
   * when `createGeometry` deferred it. Runs the `wrapRender` middleware
   * pipeline (display-mesh cache) around the kernel boundary; the native handle
   * is materialized lazily inside the innermost handler, so a mesh-cache hit
   * costs no kernel work and no handle deserialization.
   */
  private async runMeshPhase(options: {
    owner: OperationOwner;
    identity: RenderIdentity;
    selection: { view: string; mimeType: MediaType; instance?: string } | undefined;
    renderOptions: Record<string, unknown>;
    requestedContent?: RuntimeContentInput;
    resolvedMiddleware: ResolvedMiddleware[];
    createResult: Extract<CreateGeometryResult, { success: true }>;
    renderArtifact: MaterializedRender;
  }): Promise<RenderResult> {
    const {
      owner,
      identity,
      selection,
      renderOptions,
      requestedContent,
      resolvedMiddleware,
      createResult,
      renderArtifact,
    } = options;

    if (!this.kernelHasMeshPhaseForOwner(owner) || !selection) {
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

    const selectedKeys = new Set(this.getNativeRenderContentKeys(owner, selection.view));
    for (const { enabled, middleware } of resolvedMiddleware) {
      if (enabled) {
        for (const key of middleware.content?.views?.[selection.mimeType] ?? []) {
          selectedKeys.add(key);
        }
      }
    }
    const selectedContentResult = this.validateRuntimeContent('render', [...selectedKeys], requestedContent);
    if (!selectedContentResult.success) {
      return createKernelError(selectedContentResult.issues);
    }
    const selectedContent = selectedContentResult.content;

    const meshSpan = this.tracer.startSpan('kernel.mesh', {
      phase: 'computingGeometry',
    });
    try {
      const runtime = this.createRuntime();
      const computeMesh = async (handlerInput: RenderRequest): Promise<RenderResult> => {
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
        return this.withDocumentNativeAbort('render', async () =>
          this.onRenderForOwner(
            owner,
            this.withProviderRuntimeContent(
              { ...handlerInput, nativeHandle: handle.handle },
              selectedContent,
              this.getNativeRenderContentKeys(owner, selection.view),
            ),
            runtime,
            renderArtifact.evaluationSlot ??
              this.createEvaluationSlot(owner, createNativeHandleIdentityKey(renderArtifact.identity)),
          ),
        );
      };

      const activeMiddleware = resolvedMiddleware.filter(
        (resolved) =>
          resolved.enabled &&
          resolved.middleware.wrapRender &&
          this.middlewareRunsForRender(resolved, owner, selection, selectedContent),
      );

      const { tracer } = this;
      let chain: (input: RenderRequest) => Promise<RenderResult> = named(
        'kernelHandler',
        async (handlerInput: RenderRequest) => {
          const computeSpan = tracer.startSpan('kernel.mesh-compute');
          const meshResult = await computeMesh(handlerInput);
          computeSpan.end();
          return meshResult;
        },
      );

      if (activeMiddleware.length > 0) {
        const runtimes = new Map<string, KernelMiddlewareRuntime>();
        for (const { middleware, options: middlewareOptions, id } of activeMiddleware) {
          runtimes.set(
            id,
            createMiddlewareRuntime({
              signal: this.operationSignal ?? neverAbortedSignal,
              tracer: this.tracer,
              onLog: this.onLog,
              middlewareName: middleware.name,
              filesystem: this.filesystem,
              compute: this.createComputeRuntime(this.operationSignal ?? neverAbortedSignal),
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
          const wrapHook = middleware.wrapRender!;

          chain = named(`middleware(${middlewareName})`, async (handlerInput: RenderRequest) => {
            const span = tracer.startSpan(`middleware.wrap(${middlewareName})`, {
              middleware: middlewareName,
            });
            try {
              const chainResult = await wrapHook(
                this.withProviderRuntimeContent(
                  handlerInput,
                  selectedContent,
                  middleware.content?.views?.[selection.mimeType] ?? [],
                ),
                inner,
                middlewareRuntime,
              );
              span.end();
              return chainResult;
            } catch (error) {
              span.end();
              // A superseded or closed operation is aborted, not failed: its caller drops it.
              if (middlewareRuntime.signal.aborted) {
                throw error;
              }
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

      // The current client supplies one bag for evaluate and its default view.
      const evaluateKeys = owner.binding?.kernelId
        ? Object.keys(this.kernelCreateOptionsZodSchemaMap.get(owner.binding.kernelId)?.shape ?? {})
        : [];
      const selectedOptions = Object.fromEntries(
        Object.entries(renderOptions).filter(([key]) => !evaluateKeys.includes(key)),
      );
      const meshResult = await chain({
        ...selection,
        options: selectedOptions,
      });
      if (!meshResult.success) {
        return meshResult;
      }

      // Compose the display result: mesh-phase artifact plus create-phase warnings.
      // The durable handle snapshot stays in `serializedNativeHandleSlot`, which the
      // export path reads; a display result never carries it.
      return {
        ...meshResult,
        issues: [...createResult.issues, ...meshResult.issues],
      };
    } finally {
      meshSpan.end();
    }
  }

  private async createOperationOwner(file: RuntimeFileLocator, kind: OperationOwner['kind']): Promise<OperationOwner> {
    const canonicalFile = this.canonicalGeometryFile(file);
    this.setActiveFile(canonicalFile);
    const entryPath = assertRootedPath(joinRelativePath(canonicalFile.path, canonicalFile.filename));
    const binding = await this.resolveKernelBinding({ entryPath }, this.createRuntime());
    return {
      kind,
      file: canonicalFile,
      binding,
    };
  }

  private async writeFilesAndInvalidate(
    stage: Record<string, Uint8Array<ArrayBuffer>>,
    sourceDocumentId?: string,
  ): Promise<void> {
    const entries = Object.entries(stage).map(([path, bytes]) => [assertRootedPath(path), bytes] as const);
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
      for (const [rootedPath, bytes] of entries) {
        /* A host usually stages bytes it has just persisted itself. Those are an observation:
         * writing them again would only repeat the write and its watch broadcast. */
        // oxlint-disable-next-line no-await-in-loop -- staging must complete before dependency resolution
        if (!(await this.holdsBytes(rootedPath, bytes))) {
          const separator = rootedPath.lastIndexOf('/');
          const directory = separator === -1 ? '' : rootedPath.slice(0, separator);
          if (directory && !createdDirectories.has(directory)) {
            // oxlint-disable-next-line no-await-in-loop -- staging must preserve filesystem order for deterministic tests
            await this.filesystem.mkdir(directory, { recursive: true });
            createdDirectories.add(directory);
          }
          // oxlint-disable-next-line no-await-in-loop -- staging must complete before dependency resolution
          await this.filesystem.writeFile(rootedPath, bytes);
        }
        changedPaths.push(rootedPath);
        if (this.fileHashCache.has(rootedPath) || this.watchedPaths.has(rootedPath)) {
          revisions.set(rootedPath, {
            // eslint-disable-next-line no-await-in-loop -- staging order and cache publication stay deterministic
            hash: await this.hashContent(bytes),
            content: bytes,
          });
        }
      }
      if (changedPaths.length > 0) {
        this._applyObservedRevisions(changedPaths, revisions);
        this.scheduleWatchedDocuments(changedPaths, sourceDocumentId);
      }
    } finally {
      publication.resolve();
      if (this.stagedWritePublication === publication) {
        this.stagedWritePublication = undefined;
      }
    }
  }

  /**
   * Whether the filesystem already holds exactly these bytes at a path.
   *
   * @param path - Rooted path to compare.
   * @param bytes - Bytes about to be staged there.
   * @returns False when the path is absent, unreadable or holds other bytes.
   */
  private async holdsBytes(path: string, bytes: Uint8Array<ArrayBuffer>): Promise<boolean> {
    let current: Uint8Array<ArrayBuffer>;
    try {
      current = await this.filesystem.readFile(path);
    } catch {
      // Unreadable is not evidence of the bytes; the write reports whatever is wrong.
      return false;
    }
    return current.byteLength === bytes.byteLength && current.every((value, index) => value === bytes[index]);
  }

  private createExportRequestPlan(
    owner: OperationOwner,
    request: {
      readonly format: string;
      readonly options?: Record<string, unknown>;
      readonly content?: RuntimeContentInput;
      readonly exportId?: string;
    },
  ): OwnerBoundExportPlan {
    const { format, options, content, exportId } = request;
    const rawOptions = options ?? {};
    const ownerKernelId = owner.binding?.kernelId;
    const zodSchemas = ownerKernelId ? this.kernelExportZodSchemasMap.get(ownerKernelId) : undefined;
    const selectedDeclaration = exportId ? this.getDocumentExportDeclaration(owner, exportId) : undefined;
    const directDeclaration = selectedDeclaration?.extension === format ? selectedDeclaration : undefined;
    const formatZodSchema = directDeclaration ? directDeclaration.schema : zodSchemas?.[format];
    if (!directDeclaration && ownerKernelId && this.kernelAmbiguousExportFormatsMap.get(ownerKernelId)?.has(format)) {
      return {
        success: false,
        result: createKernelError([
          {
            message: `Kernel ${ownerKernelId} has multiple exports for ${format}; select an export ID.`,
            code: 'EXPORT_AMBIGUOUS',
            type: 'kernel',
            severity: 'error',
          },
        ]),
      };
    }

    if (directDeclaration !== undefined || (zodSchemas !== undefined && Object.hasOwn(zodSchemas, format))) {
      const admitted = admitKernelOptions(
        formatZodSchema,
        rawOptions,
        `Kernel ${ownerKernelId} export ${format}`,
        'EXPORT_OPTIONS_INVALID',
      );
      if (!admitted.success) {
        return { success: false, result: createKernelError(admitted.issues) };
      }
      const contentResult = this.validateRuntimeContent(
        'export',
        this.getExportContentKeys(owner, format, exportId),
        content,
      );
      if (!contentResult.success) {
        return {
          success: false,
          result: createKernelError(contentResult.issues),
        };
      }
      const parsedOptions: unknown = admitted.options;
      if (typeof parsedOptions !== 'object' || parsedOptions === null || Array.isArray(parsedOptions)) {
        return {
          success: false,
          result: createKernelError([
            {
              message: `Export options for ${ownerKernelId} → ${format} must resolve to an object.`,
              code: 'RUNTIME',
              type: 'runtime',
              severity: 'error',
            },
          ]),
        };
      }
      const validatedOptions: Record<string, unknown> = { ...parsedOptions };
      const contentContributors = this.describeContentContributors(owner, format, contentResult.content, exportId);
      return {
        success: true,
        owner,
        input: {
          format,
          options: validatedOptions,
          content: contentResult.content,
        },
        route: {
          kind: 'direct',
          kernelId: ownerKernelId,
          targetFormat: format,
          ...(exportId ? { exportId } : {}),
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
            ...(exportId ? { exportId } : {}),
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
          return {
            success: false,
            result: createKernelError(contentResult.issues),
          };
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
                : `No export route found for format "${format}" because the render artifact has no selected kernel owner. ${this.describeUnselectedKernel(owner) ?? ''}`.trimEnd(),
              code: ownerKernelId ? 'TRANSCODER_CAPABILITY_MISSING' : 'KERNEL_CAPABILITY_MISSING',
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
            code: 'TRANSCODER_OPTIONS_INVALID',
            type: 'runtime',
            severity: 'error',
          },
        ]),
      };
    }

    let sourceOptions: Record<string, unknown> = {};
    let edgeOptions: Record<string, unknown> = {};
    const sourceZodSchema = selectedDeclaration
      ? selectedDeclaration.schema
      : zodSchemas?.[transcoderRoute.sourceFormat];
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
    const selectedSourceSchema = selectedDeclaration?.schema
      ? this.deriveJsonSchema(selectedDeclaration.schema, `export:${ownerKernelId}:${exportId}`).schema
      : undefined;
    const sourceOptionKeys = Object.keys(
      selectedDeclaration
        ? (selectedSourceSchema?.properties ?? {})
        : (sourceRoute?.exportOptions.schema.properties ?? {}),
    ).filter((key) => !pinnedSourceKeys.includes(key));
    const edgeOptionKeys = [...allowedOptionKeys].filter((key) => !sourceOptionKeys.includes(key));
    if (sourceZodSchema) {
      const admittedSource = admitKernelOptions(
        sourceZodSchema,
        {
          ...pickRecordProperties(rawOptions, sourceOptionKeys),
          ...matchingEdge?.sourceOptions,
        },
        `Kernel ${ownerKernelId} source export ${transcoderRoute.sourceFormat}`,
        'EXPORT_OPTIONS_INVALID',
      );
      if (!admittedSource.success) {
        return {
          success: false,
          result: createKernelError(admittedSource.issues),
        };
      }
      sourceOptions = admittedSource.options;
    }

    const sourceContentKeys = this.getExportContentKeys(owner, transcoderRoute.sourceFormat, exportId);
    const edgeContentKeys = new Set(matchingEdge?.content ?? []);
    const routeContentKeys = sourceContentKeys.filter((key) => edgeContentKeys.has(key));
    const contentResult = this.validateRuntimeContent('export', routeContentKeys, content);
    if (!contentResult.success) {
      return {
        success: false,
        result: createKernelError(contentResult.issues),
      };
    }
    const admittedEdge = admitKernelOptions(
      matchingEdge?.optionsSchema,
      pickRecordProperties(rawOptions, edgeOptionKeys),
      `Transcoder edge ${transcoderRoute.sourceFormat} → ${format}`,
      'TRANSCODER_OPTIONS_INVALID',
    );
    if (!admittedEdge.success) {
      return { success: false, result: createKernelError(admittedEdge.issues) };
    }
    edgeOptions = admittedEdge.options;
    sourceOptions = { ...sourceOptions, ...matchingEdge?.sourceOptions };
    const contentContributors = this.describeContentContributors(
      owner,
      transcoderRoute.sourceFormat,
      contentResult.content,
      exportId,
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
        ...(exportId ? { exportId } : {}),
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
          ...(exportId ? { exportId } : {}),
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
    pinnedSourceRevision?: SourceRevision;
  }): Promise<{ success: true; handle: unknown } | { success: false; result: ExportGeometryResult }> {
    const { owner, runtime, renderArtifact } = options;
    const { identity } = renderArtifact;

    const liveSlot = this.getNativeHandleSlotForIdentity(identity, renderArtifact);
    if (this.isLiveNativeHandleSlotUsableForOwner(liveSlot, owner)) {
      const validity = await this.validateNativeHandleSlot({
        owner,
        renderArtifact,
        slot: liveSlot,
        runtime,
      });
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

    if (options.pinnedSourceRevision && !(await this.pinnedSourceStillMatches(options.pinnedSourceRevision))) {
      return { success: false, result: this.sourceSnapshotChangedResult() };
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
          code: 'HANDLE_MISSING',
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
        data: {
          error: error instanceof Error ? error.message : String(error),
        },
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
      const { evaluationSlot } = renderArtifact;
      if (!evaluationSlot) {
        return { success: false };
      }
      const handle = await this.deserializeNativeHandleForOwner(
        owner,
        slot.serializedNativeHandle,
        runtime,
        evaluationSlot,
      );
      if (handle === undefined || handle === null) {
        this.clearSerializedNativeHandleSlot(renderArtifact, slot);
        return { success: false };
      }
      this.logger.debug('Restoring nativeHandle via owner-bound deserializeNativeHandle');
      evaluationSlot.hasHandle = true;
      evaluationSlot.handle = handle;
      this.ownNativeHandle(evaluationSlot, owner);
      renderArtifact.liveNativeHandleSlot = {
        evaluationId: evaluationSlot.id,
        identityKey: createNativeHandleIdentityKey(identity),
        kernelId: identity.selectedKernelId,
        kernelVersion: identity.selectedKernelVersion,
        handle,
      };
      evaluationSlot.liveNativeHandleSlot = renderArtifact.liveNativeHandleSlot;
      return { success: true, handle };
    } catch (error) {
      this.clearSerializedNativeHandleSlot(renderArtifact, slot);
      this.logger.warn('Native-handle snapshot restore failed; export will reheat', {
        data: {
          error: error instanceof Error ? error.message : String(error),
        },
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
      const evaluationSlot =
        renderArtifact.evaluationSlot ?? this.createEvaluationSlot(owner, createNativeHandleIdentityKey(identity));
      renderArtifact.evaluationSlot = evaluationSlot;
      evaluationSlot.nativeBuildInput = reheatInput;
      this.activeEvaluationSlot = evaluationSlot;
      let reheatResult: CreateGeometryResult;
      try {
        reheatResult = await this.onCreateGeometryForOwner(owner, reheatInput, runtime, evaluationSlot);
      } finally {
        this.activeEvaluationSlot = undefined;
      }
      const slots = this.bindNativeHandleSlots({
        identity,
        slot: evaluationSlot,
        success: reheatResult.success,
        serializedNativeHandle: reheatResult.success ? reheatResult.serializedNativeHandle : undefined,
        serializeNativeHandleSnapshot: reheatResult.success ? reheatResult.serializeNativeHandleSnapshot : undefined,
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
    onCacheMiss?: (input: ExportPipelineRequest) => Promise<ExportGeometryResult>;
    pinnedSourceRevision?: SourceRevision;
  }): Promise<ExportGeometryResult> {
    if (!options.renderIdentity) {
      return this.createExportRenderIdentityMissingResult();
    }

    const depsSpan = this.tracer.startSpan('kernel.resolve-deps', {
      phase: 'resolvingDeps',
    });
    // The document owns its evaluated source. Only the export leg observes
    // current files; otherwise old handles would be cached under new source hashes.
    let dependencies: Dependency[];
    if (options.pinnedSourceRevision && options.renderArtifact) {
      const exportDependencies = await this.computeMiddlewareDependencies(
        options.plan.owner,
        this.getExportExecutionList(options.plan),
        ['export'],
      );
      dependencies = [
        ...options.renderArtifact.identity.dependencies.filter(
          ({ type }) => type !== 'content' && type !== 'export' && type !== 'middleware',
        ),
        ...exportDependencies.dependencies,
        { type: 'content', content: options.plan.route.content as Record<string, boolean> },
        options.plan.dependency,
      ];
    } else {
      dependencies = await this.computeDependencies({
        operations: ['evaluate', 'export'],
        parameters: options.renderIdentity.parameters,
        renderOptions: options.renderIdentity.renderOptions,
        content: options.plan.route.content,
        exportDependency: options.plan.dependency,
        resolvedMiddleware: this.getExportExecutionList(options.plan),
        owner: options.plan.owner,
      });
    }
    const dependencyHash = await this.computeDependencyHash(dependencies);
    depsSpan.end();

    const runtimes = new Map<string, KernelMiddlewareRuntime>();
    for (const { middleware, options: middlewareOptions, id } of options.activeMiddleware) {
      runtimes.set(
        id,
        createMiddlewareRuntime({
          signal: this.operationSignal ?? neverAbortedSignal,
          tracer: this.tracer,
          onLog: this.onLog,
          middlewareName: middleware.name,
          filesystem: this.filesystem,
          compute: this.createComputeRuntime(this.operationSignal ?? neverAbortedSignal),
          dependencies,
          dependencyHash,
          stateSchema: middleware.stateSchema,
          options: middlewareOptions,
          logger: this.getMiddlewareLogger(id, middleware.name),
        }),
      );
    }

    const { onCacheMiss, renderArtifact } = options;
    const { targetFormat } = options.plan.route;
    const kernelId = options.plan.owner.binding?.kernelId;
    const declared =
      kernelId && options.plan.route.kind === 'direct'
        ? options.plan.route.exportId
          ? this.getDocumentExportDeclaration(options.plan.owner, options.plan.route.exportId)
          : this.kernelExportMetadataMap.get(kernelId)?.[targetFormat]
        : undefined;
    const exportRequest: ExportRequest = {
      exportId: options.plan.route.exportId ?? (declared && 'id' in declared ? declared.id : targetFormat),
      mimeType: declared?.mimeType ?? 'application/octet-stream',
      extension: targetFormat,
      options: options.plan.input.options,
    };
    const computeExport =
      onCacheMiss ??
      (async (handlerInput: ExportPipelineRequest): Promise<ExportGeometryResult> => {
        if (!renderArtifact) {
          return this.createExportRenderIdentityMissingResult();
        }
        return this.executeExportRequest(
          { ...options.plan, input: handlerInput },
          renderArtifact,
          options.pinnedSourceRevision,
        );
      });

    const { tracer } = this;
    let chain: (input: ExportRequest) => Promise<KernelExportResult> = named(
      'kernelHandler',
      async (handlerInput: ExportRequest) => {
        const computeSpan = tracer.startSpan('kernel.export-compute');
        if (
          handlerInput.exportId !== exportRequest.exportId ||
          handlerInput.mimeType !== exportRequest.mimeType ||
          handlerInput.extension !== exportRequest.extension
        ) {
          computeSpan.end();
          return createKernelError([
            {
              message: `Middleware changed the selected export ${exportRequest.exportId}.`,
              code: 'MIDDLEWARE_FAILED',
              type: 'kernel',
              severity: 'error',
            },
          ]);
        }
        const exportResult = await computeExport({
          format: targetFormat,
          options: handlerInput.options,
        });
        computeSpan.end();
        if (!exportResult.success) {
          return exportResult;
        }
        try {
          return {
            ...exportResult,
            data: nonemptyExportFiles(exportResult.data),
          };
        } catch (error) {
          return createKernelError([
            {
              message: error instanceof Error ? error.message : String(error),
              code: 'EXPORT_ARTIFACT_SET_INVALID',
              type: 'runtime',
              severity: 'error',
            },
          ]);
        }
      },
    );

    for (let index = options.activeMiddleware.length - 1; index >= 0; index--) {
      const { middleware, id } = options.activeMiddleware[index]!;
      const inner = chain;
      const runtime = runtimes.get(id)!;
      const middlewareName = middleware.name;
      const wrapHook = middleware.wrapExport!;

      chain = named(`middleware(${middlewareName})`, async (handlerInput: ExportRequest) => {
        const span = tracer.startSpan(`middleware.wrap(${middlewareName})`, {
          middleware: middlewareName,
        });
        try {
          const chainResult = await wrapHook(
            this.withProviderRuntimeContent(
              handlerInput,
              options.plan.route.content,
              middleware.content?.exports?.[options.plan.route.targetFormat] ?? [],
            ),
            inner,
            runtime,
          );
          span.end();
          return chainResult;
        } catch (error) {
          span.end();
          // A superseded or closed operation is aborted, not failed: its caller drops it.
          if (runtime.signal.aborted) {
            throw error;
          }
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

    const result = await chain(exportRequest);
    return result.success ? { ...result, data: [...result.data] } : result;
  }

  private async executeExportRequest(
    plan: Extract<OwnerBoundExportPlan, { success: true }>,
    renderArtifact: MaterializedRender,
    pinnedSourceRevision?: SourceRevision,
  ): Promise<ExportGeometryResult> {
    const exportMaterialization =
      plan.route.kind === 'direct'
        ? { format: plan.route.targetFormat, options: plan.route.options }
        : {
            format: plan.route.sourceFormat,
            options: plan.route.sourceOptions,
          };
    const desiredNativeHandleKey = await this.computeNativeHandleKey({
      owner: plan.owner,
      parameters: renderArtifact.identity.parameters,
      renderOptions: renderArtifact.identity.renderOptions,
      exportOptions: exportMaterialization.options,
      content: plan.route.content,
      ...(pinnedSourceRevision ? { pinnedIdentity: renderArtifact.identity } : {}),
    });
    if (!desiredNativeHandleKey.success) {
      return createKernelError(desiredNativeHandleKey.issues);
    }
    if (!this.artifactMatchesNativeBuild(renderArtifact, plan.owner, desiredNativeHandleKey.key)) {
      if (pinnedSourceRevision && !(await this.pinnedSourceStillMatches(pinnedSourceRevision))) {
        return this.sourceSnapshotChangedResult();
      }
      const parametersResult = await this.getParametersInLane(renderArtifact.identity.file, { owner: plan.owner });
      if (!parametersResult.success) {
        return parametersResult;
      }
      const extracted = parametersResult.data;
      if (extracted.legacyProjection.status !== 'usable') {
        return createKernelError([
          {
            message: 'Parameter schema cannot be represented by the active Draft-7 execution path',
            code: 'RUNTIME',
            type: 'kernel',
            severity: 'error',
            details: extracted.legacyProjection.diagnostics,
          },
        ]);
      }
      const materialized = await this.materializeRender(
        {
          file: renderArtifact.identity.file,
          parameters: renderArtifact.identity.nativeBuildInput?.parameters ?? renderArtifact.identity.parameters,
          parameterDefaults: extracted.defaults,
          parameterManifest: extracted,
          parameterSchema: extracted.legacyProjection.schema,
          options: renderArtifact.identity.renderOptions,
          content: plan.route.content,
          export: { ...exportMaterialization, dependency: plan.dependency },
        },
        { owner: plan.owner },
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
      pinnedSourceRevision,
    });
    if (!nativeInput.success) {
      return nativeInput.result;
    }

    const computeSpan = this.tracer.startSpan('kernel.export-compute');
    const result = await this.executeExportWithRoute(plan, {
      input: nativeInput.input,
      runtime,
      renderIdentity: renderArtifact.identity,
      evaluationSlot: renderArtifact.evaluationSlot,
    });
    computeSpan.end();
    return result;
  }

  private async prepareNativeExportInput(options: {
    plan: Extract<OwnerBoundExportPlan, { success: true }>;
    runtime: KernelRuntime;
    renderArtifact: MaterializedRender;
    pinnedSourceRevision?: SourceRevision;
  }): Promise<{ success: true; input: KernelExportGeometryInput } | { success: false; result: ExportGeometryResult }> {
    const { plan, runtime, renderArtifact } = options;
    const nativeHandle = await this.materializeNativeHandleForOwner({
      owner: plan.owner,
      runtime,
      renderArtifact,
      pinnedSourceRevision: options.pinnedSourceRevision,
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

  /**
   * Drop what was derived from the changed paths' dependency graph.
   *
   * A path only a geometry-stage middleware declared (a parameter record, say) cannot change
   * dependency discovery, parameters or kernel selection, so only the middleware dependency
   * sets that name it go. Any other change, including a path no settled set names yet, clears
   * everything as before.
   *
   * ponytail: the narrowing is all-or-nothing per change, keyed on the geometry-only case the
   * edit path needs; a source edit still clears every entry's caches, not just its own.
   *
   * @param changedPaths - Rooted paths whose bytes changed.
   */
  private invalidateDependencyDerivedState(changedPaths: readonly string[]): void {
    const middlewareSets = [...this.middlewareDependencyCache].map(([key, pending]) => ({
      key,
      set: this.settledDependencyPaths.get(pending),
    }));
    const sets = [
      ...[...this.commonDependencyCache.values()].map((pending) => this.settledDependencyPaths.get(pending)),
      ...middlewareSets.map(({ set }) => set),
    ];
    const settled = sets.filter((set) => set !== undefined);
    const geometryOnly =
      changedPaths.length > 0 &&
      settled.length === sets.length &&
      changedPaths.every(
        (path) =>
          settled.some(({ paths }) => paths.has(path)) &&
          !settled.some(({ paths, affectsParameters }) => affectsParameters && paths.has(path)),
      );
    if (geometryOnly) {
      for (const { key, set } of middlewareSets) {
        if (set && changedPaths.some((path) => set.paths.has(path))) {
          this.middlewareDependencyCache.delete(key);
        }
      }
      return;
    }
    this.commonDependencyCache.clear();
    this.middlewareDependencyCache.clear();
    this.parameterResultCache = undefined;
    this.onFileChanged(changedPaths);
  }

  /**
   * Record the paths a dependency set was resolved from once it settles.
   *
   * @param pending - The dependency computation about to be cached.
   * @param describe - Reads the paths, and whether they feed parameters, from the settled set.
   * @returns The promise to cache in place of `pending`.
   */
  // oxlint-disable-next-line typescript/promise-function-async -- the record is keyed by the returned promise's own identity.
  private recordDependencyPaths<Value>(
    pending: Promise<Value>,
    describe: (value: Value) => DependencyPaths,
  ): Promise<Value> {
    // oxlint-disable-next-line promise/prefer-await-to-then -- an async body cannot name the promise it returns.
    const recorded: Promise<Value> = pending.then((value) => {
      this.settledDependencyPaths.set(recorded, describe(value));
      return value;
    });
    return recorded;
  }

  /**
   * Invalidate file-level caches for the given changed paths.
   * Shared by explicit `notifyFileChanged` calls and the watch handler.
   * @param changedPaths - Root-relative paths of files that changed.
   */
  private _invalidateCachesForPaths(changedPaths: readonly string[]): void {
    this.invalidateDependencyDerivedState(changedPaths);
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
    this.invalidateDependencyDerivedState(changedPaths);
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
        this.clearBundlerExecutionCaches(result.code);
        this.bundleResultCache.delete(entryPath);
      }
    }
  }

  private clearBundlerExecutionCaches(code?: string): void {
    for (const bundler of new Set(this.loadedBundlers.values())) {
      bundler.definition.clearExecutionCache?.(code, bundler.ctx);
    }
  }

  private exactWatchEventPaths(event: Exclude<WatchEvent, { type: 'reset' }>): string[] {
    const paths: string[] = [];
    if ('path' in event) {
      paths.push(assertRootedPath(event.path));
    }
    if (event.type === 'rename') {
      paths.push(assertRootedPath(event.oldPath), assertRootedPath(event.newPath));
    }
    return [...new Set(paths)];
  }

  private async routeWatchEvent(event: WatchEvent): Promise<void> {
    if (!this.operationAdmissionOpen) {
      return;
    }
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
        // Proven external changes must retire unpinned evaluations before FIFO invalidation.
        // A committed export keeps its admitted operation; unrelated documents stay live.
        for (const document of this.documents.values()) {
          if (
            document.watch &&
            !document.closed &&
            changedPaths.some((path) => document.watchPaths.has(path)) &&
            (document.pendingCommitted === undefined || document.pendingCommitted.pins === 0)
          ) {
            document.evaluationController?.abort(abortReasonEnum.superseded);
          }
        }
        await this.enqueueOperation(async () => this.routeExactChangedPaths(changedPaths, revisions));
      });
    } catch (error) {
      this.reportWatchRoutingError(error);
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
        revision = {
          // eslint-disable-next-line no-await-in-loop -- serialized hashes preserve the observer's revision order
          hash: await this.hashContent(content),
          content,
          expectedPrior,
        };
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
         * otherwise schedule an evaluation that supersedes the one arming the watch. */
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

  private reportWatchRoutingError(error: unknown): void {
    const issues = this.errorToRuntimeIssues(error);
    if (this.operationAdmissionOpen) {
      this.logger.warn('Failed to route a watched file change', {
        data: { issues },
      });
    }
  }

  private async routeExactChangedPaths(
    paths: readonly string[],
    revisions?: ReadonlyMap<string, ObservedFileRevision | undefined>,
  ): Promise<void> {
    if (revisions && [...revisions.values()].some((revision) => revision === undefined)) {
      // A failed observer read cannot prove the prior evaluation still matches.
      this.retainedEvaluation = undefined;
    }
    if (revisions) {
      this._applyObservedRevisions(paths, revisions);
    } else {
      this._invalidateCachesForPaths(paths);
    }
    this.scheduleWatchedDocuments(paths);
  }

  private scheduleWatchedDocuments(paths: readonly string[], sourceDocumentId?: string): void {
    for (const document of this.documents.values()) {
      if (
        document.id === sourceDocumentId ||
        !document.watch ||
        document.closed ||
        !paths.some((path) => document.watchPaths.has(path))
      ) {
        continue;
      }
      document.parameters = { ...document.committedParameters };
      document.evaluateOptions = { ...document.committedEvaluateOptions };
      this.scheduleDocumentEvaluation(document, document.intent, false);
    }
  }

  /**
   * Derive the full set of watched dependencies from all active caches
   * and update the filesystem watch subscription.
   */
  private async reconcileObservedPaths(): Promise<boolean> {
    const allDeps = new Map<string, number>();
    for (const document of this.documents.values()) {
      if (document.watch && !document.closed) {
        for (const path of document.watchPaths) {
          allDeps.set(path, fileChangeDebounce);
        }
      }
    }
    for (const result of this.bundleResultCache.values()) {
      for (const dep of result.dependencies) {
        allDeps.set(assertRootedPath(dep), fileChangeDebounce);
      }
      for (const path of result.unresolvedPaths) {
        allDeps.set(assertRootedPath(path), fileChangeDebounce);
      }
    }
    for (const path of this.fileHashCache.keys()) {
      allDeps.set(assertRootedPath(path), fileChangeDebounce);
    }
    return this.reconcileWatchSet(allDeps);
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
    extensions: readonly string[];
    options?: Record<string, unknown>;
  }): Promise<{ definition: BundlerDefinition; ctx: unknown }> {
    const { definition, extensions, options: bundlerOptions } = pending;
    const initSpan = this.tracer.startSpan('kernel.bundler-context-init');

    try {
      const rawOptions = bundlerOptions ?? {};
      const validatedOptions = definition.optionsSchema ? definition.optionsSchema.parse(rawOptions) : rawOptions;

      const context = await definition.initialize(validatedOptions, {
        filesystem: this.bundlerFilesystem,
      });
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
        // oxlint-disable-next-line no-await-in-loop -- Middleware must be loaded sequentially to preserve order
        const middleware = await this.importMiddlewareModule(entry);

        const resolvedOptions = middleware.optionsSchema ? middleware.optionsSchema.parse(entry.options ?? {}) : {};

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
   * Load transcoder descriptors from worker-owned plugin implementations.
   *
   * @param entries - Transcoder plugins with id and options
   */
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- variance: accepts any transcoder plugin generic
  private async loadTranscoders(entries: readonly TranscoderPluginEntry[]): Promise<void> {
    const transcoderSpan = this.tracer.startSpan('kernel.load-transcoders', {
      count: entries.length,
    });
    const registeredEdges = new Set<string>();

    try {
      for (const entry of entries) {
        const importSpan = this.tracer.startSpan('kernel.load-transcoder', {
          id: entry.id,
        });

        try {
          // oxlint-disable-next-line no-await-in-loop -- Sequential to preserve init order
          const definition = await resolveRuntimePluginDefinition<TranscoderDefinition>('transcoder', entry);

          const rawOptions = entry.options ?? {};
          const validatedOptions = definition.optionsSchema ? definition.optionsSchema.parse(rawOptions) : rawOptions;

          // oxlint-disable-next-line no-await-in-loop -- Sequential to preserve init order
          const implementationAssets = definition.implementationAssets ?? [];
          const edges = definition.edges.filter(({ from, to }) => {
            const key = `${from}\0${to}`;
            if (registeredEdges.has(key)) {
              return false;
            }
            registeredEdges.add(key);
            return true;
          });

          this.loadedTranscoders.set(entry.id, {
            id: entry.id,
            definition,
            context: undefined,
            initialized: false,
            edges,
            options: validatedOptions,
            implementationAssets,
          });

          this.logger.debug(`Registered transcoder: ${entry.id} with ${edges.length} edge(s)`);
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

  private async initializeTranscoder(transcoder: LoadedTranscoder): Promise<unknown> {
    if (transcoder.initialized) {
      return transcoder.context;
    }
    transcoder.initialization ??= (async () => {
      await this.verifyImplementationAssets(transcoder.id, transcoder.implementationAssets);
      const context = await transcoder.definition.initialize(transcoder.options, {
        logger: this.logger,
        tracer: this.tracer,
      });
      transcoder.context = context;
      transcoder.initialized = true;
      return context;
    })();
    const { initialization } = transcoder;
    try {
      return await initialization;
    } catch (error) {
      if (transcoder.initialization === initialization) {
        transcoder.initialization = undefined;
      }
      throw error;
    }
  }

  /** Derive JSON Schema and defaults from a Zod schema. */
  protected deriveJsonSchema(
    zodSchema: z.ZodType,
    label: string,
  ): { schema: JSONSchema7; defaults: Record<string, unknown> } {
    let schema: JSONSchema7;
    try {
      // Spreading drops Zod's non-enumerable `~standard` key: the manifest is wire data, so it is plain JSON here.
      const { $schema: _dialect, ...plain } = toJSONSchema(zodSchema, {
        target: 'draft-7',
        io: 'input',
      }) as JSONSchema7;
      schema = plain;
    } catch (error) {
      throw new Error(`Failed to derive JSON Schema for ${label}.`, {
        cause: error,
      });
    }

    const defaults = inputDefaults(schema);
    return {
      schema,
      defaults: zodSchema.safeParse(defaults).success ? defaults : {},
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
        const empty: {
          schema: JSONSchema7;
          defaults: Record<string, unknown>;
        } = { schema: {}, defaults: {} };
        const { schema, defaults } = zodSchema ? this.deriveJsonSchema(zodSchema, `${kernelId}:${format}`) : empty;

        const contentKeys = new Set(this.kernelExportContentMap.get(kernelId)?.[format] ?? []);
        for (const { enabled, middleware } of this.getMiddleware()) {
          if (enabled) {
            for (const key of middleware.content?.exports?.[format] ?? []) {
              contentKeys.add(key);
            }
          }
        }
        const content = this.buildContentCapability('export', [...contentKeys]);

        kernelExports.push({
          kernelId,
          format,
          schema,
          defaults,
          contentKeys: [...contentKeys],
        });

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

    const emptyEdgeSchemas: {
      schema: JSONSchema7;
      defaults: Record<string, unknown>;
    } = { schema: {}, defaults: {} };
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
          const sourceKeys = new Set(Object.keys(collectJsonSchemaProperties(sourceSchemas.schema)));
          const overlap = Object.keys(collectJsonSchemaProperties(edgeSchemas.schema)).filter((key) =>
            sourceKeys.has(key),
          );
          const unreachableRequired = overlap.filter((key) => edgeSchemas.schema.required?.includes(key));
          if (unreachableRequired.length > 0) {
            throw new Error(
              `Transcoder ${transcoder.id} requires source-owned export options ${unreachableRequired.join(', ')} on ${edge.from} → ${edge.to}.`,
            );
          }
          const publicEdgeSchemas = omitJsonSchemaProperties(edgeSchemas, overlap);
          const { schema, defaults } = mergeJsonSchemas(sourceSchemas, publicEdgeSchemas, {
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
        renderOptions: {
          schema: JSONSchema7;
          defaults: Record<string, unknown>;
        };
        content?: { schema: JSONSchema7; defaults: RuntimeContentInput };
        cancellation?: 'cooperative';
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
          for (const key of this.getMiddlewareRenderContentKeys(middleware, kernelId)) {
            keys.add(key);
          }
        }
      }
      const content = this.buildContentCapability('render', [...keys]);
      renderCapabilities[kernelId] = {
        renderOptions,
        ...(content ? { content } : {}),
        ...(this.kernelCancellationMap.get(kernelId) ? { cancellation: 'cooperative' } : {}),
      };
    }

    const registrations: CapabilitiesManifest['registrations'] = [
      ...this.manifestKernelPlugins.map<RuntimeCapabilityRegistration>(
        ({ id, extensions, permissions, builtinDependencies }) => ({
          kind: 'kernel',
          id,
          extensions,
          ...(permissions === undefined ? {} : { permissions }),
          ...(builtinDependencies === undefined ? {} : { builtinDependencies }),
        }),
      ),
      ...this.middlewarePlugins.map<RuntimeCapabilityRegistration>(({ id, permissions }) => ({
        kind: 'middleware',
        id,
        ...(permissions === undefined ? {} : { permissions }),
      })),
      ...this.bundlerPlugins.map<RuntimeCapabilityRegistration>(({ id, permissions }) => ({
        kind: 'bundler',
        id,
        ...(permissions === undefined ? {} : { permissions }),
      })),
      ...this.transcoderPlugins.map<RuntimeCapabilityRegistration>(({ id, permissions }) => ({
        kind: 'transcoder',
        id,
        ...(permissions === undefined ? {} : { permissions }),
      })),
    ];

    return { registrations, routes, renderCapabilities };
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
      readonly evaluationSlot?: EvaluationSlot;
    },
  ): Promise<ExportGeometryResult> {
    const { input, runtime, renderIdentity, evaluationSlot } = execution;
    if (plan.route.kind === 'direct') {
      return this.withDocumentNativeAbort('export', async () =>
        this.onExportGeometryForOwner(
          plan.owner,
          this.withProviderRuntimeContent(
            {
              ...this.withoutRuntimeContent(input),
              format: plan.route.targetFormat,
              options: input.options,
              ...(plan.route.exportId ? { exportId: plan.route.exportId } : {}),
            },
            plan.route.content,
            this.getNativeExportContentKeys(plan.owner, plan.route.targetFormat, plan.route.exportId),
          ),
          runtime,
          evaluationSlot,
        ),
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
          code: 'TRANSCODER_CAPABILITY_MISSING',
          type: 'runtime',
          severity: 'error',
        },
      ]);
    }

    const sourceInput: KernelExportGeometryInput & { exportId?: string } = {
      ...this.withoutRuntimeContent(input),
      format: route.sourceFormat,
      options: route.sourceOptions,
      ...(route.exportId ? { exportId: route.exportId } : {}),
    };
    const sourceMetadata = route.exportId
      ? this.getDocumentExportDeclaration(plan.owner, route.exportId)
      : this.kernelExportMetadataMap.get(route.kernelId)?.[route.sourceFormat];
    const sourceExportRequest: ExportRequest = {
      exportId: route.exportId ?? (sourceMetadata && 'id' in sourceMetadata ? sourceMetadata.id : route.sourceFormat),
      mimeType: sourceMetadata?.mimeType ?? 'application/octet-stream',
      extension: route.sourceFormat,
      options: route.sourceOptions,
    };
    const contributors = this.getSourceContentContributors(plan.owner, route);
    let sourceHandler: (input: ExportRequest) => Promise<KernelExportResult> = async (handlerInput) => {
      if (
        handlerInput.exportId !== sourceExportRequest.exportId ||
        handlerInput.mimeType !== sourceExportRequest.mimeType ||
        handlerInput.extension !== sourceExportRequest.extension
      ) {
        return createKernelError([
          {
            message: `Middleware changed the selected source export ${sourceExportRequest.exportId}.`,
            code: 'MIDDLEWARE_FAILED',
            type: 'kernel',
            severity: 'error',
          },
        ]);
      }
      const result = await this.withDocumentNativeAbort('export', async () =>
        this.onExportGeometryForOwner(
          plan.owner,
          this.withProviderRuntimeContent(
            { ...sourceInput, options: handlerInput.options },
            route.content,
            this.getNativeExportContentKeys(plan.owner, route.sourceFormat, route.exportId),
          ),
          runtime,
          evaluationSlot,
        ),
      );
      if (!result.success) {
        return result;
      }
      try {
        return { ...result, data: nonemptyExportFiles(result.data) };
      } catch (error) {
        return createKernelError([
          {
            message: error instanceof Error ? error.message : String(error),
            code: 'EXPORT_ARTIFACT_SET_INVALID',
            type: 'runtime',
            severity: 'error',
          },
        ]);
      }
    };
    if (contributors.length > 0) {
      const dependencies = [...renderIdentity.dependencies, plan.dependency];
      const dependencyHash = await this.computeDependencyHash(dependencies);
      for (let index = contributors.length - 1; index >= 0; index--) {
        const contributor = contributors[index]!;
        const inner = sourceHandler;
        const middlewareRuntime = createMiddlewareRuntime({
          signal: runtime.signal,
          tracer: runtime.tracer,
          onLog: this.onLog,
          middlewareName: contributor.middleware.name,
          filesystem: this.filesystem,
          compute: runtime.compute,
          dependencies,
          dependencyHash,
          stateSchema: contributor.middleware.stateSchema,
          options: contributor.options,
          logger: this.getMiddlewareLogger(contributor.id, contributor.middleware.name),
        });
        sourceHandler = async (handlerInput) => {
          try {
            return await contributor.middleware.wrapExport!(
              this.withProviderRuntimeContent(
                handlerInput,
                route.content,
                contributor.middleware.content?.exports?.[route.sourceFormat] ?? [],
              ),
              inner,
              middlewareRuntime,
            );
          } catch (error) {
            // A superseded or closed operation is aborted, not failed: its caller drops it.
            if (middlewareRuntime.signal.aborted) {
              throw error;
            }
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
    const sourceResult = await sourceHandler(sourceExportRequest);
    const kernelResult: ExportGeometryResult = sourceResult.success
      ? { ...sourceResult, data: [...sourceResult.data] }
      : sourceResult;
    if (!kernelResult.success) {
      return kernelResult;
    }

    let context: unknown;
    try {
      context = await this.initializeTranscoder(transcoder);
      runtime.signal.throwIfAborted();
    } catch (error) {
      runtime.signal.throwIfAborted();
      return createKernelError([
        {
          message: `Failed to initialize transcoder "${route.transcoderId}": ${error instanceof Error ? error.message : String(error)}`,
          code: 'TRANSCODER_INITIALIZATION_FAILED',
          type: 'runtime',
          severity: 'error',
        },
      ]);
    }

    try {
      const result = await transcoder.definition.transcode(
        {
          from: route.sourceFormat,
          to: route.targetFormat,
          files: kernelResult.data,
          options: route.edgeOptions,
        },
        transcoderRuntime,
        context,
      );
      runtime.signal.throwIfAborted();
      return result;
    } catch (error) {
      runtime.signal.throwIfAborted();
      return createKernelError([
        {
          message: `Transcoder "${route.transcoderId}" failed: ${error instanceof Error ? error.message : String(error)}`,
          code: 'TRANSCODER_EXECUTION_FAILED',
          type: 'runtime',
          severity: 'error',
        },
      ]);
    }
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

  private async importMiddlewareModule(entry: MiddlewarePlugin): Promise<RuntimeMiddlewareDefinition> {
    const cached = this.middlewareModuleCache.get(entry.id);
    if (cached) {
      return cached;
    }

    const middleware = await resolveRuntimePluginDefinition<RuntimeMiddlewareDefinition>('middleware', entry);

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
   * The filesystem the bundler reads through (D15).
   *
   * A cold open resolved the same graph twice and read the same bytes three times over: once per
   * bundler pass and once more for the dependency hashes. Contents come from `fileContentCache` —
   * the map `clearVolatileFileCaches` and the watch invalidator already keep honest — and
   * existence from the operation-scoped probe caches, so each module is probed and read once.
   *
   * @returns The kernel filesystem with reads and probes served from the caches.
   */
  private get bundlerFilesystem(): KernelFileSystem {
    const base = this.filesystem;
    this.bundlerFilesystemView ??= {
      ...base,
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- an overloaded method cannot be written as an arrow.
      readFile: (async (path: string, encoding?: 'utf8') => {
        let content = this.fileContentCache.get(path);
        if (content === undefined) {
          content = await base.readFile(path);
          // Project sources only: a CDN package artifact is read twice per cold open and can be
          // megabytes, and this cache lives as long as the watch does.
          if (!path.startsWith('node_modules/')) {
            this.fileContentCache.set(path, content);
          }
        }
        if (encoding !== 'utf8') {
          return typeof content === 'string' ? new TextEncoder().encode(content) : content;
        }
        return typeof content === 'string' ? content : new TextDecoder().decode(content);
      }) as KernelFileSystem['readFile'],
      exists: async (path: string) => {
        const cached = this.fileExistsCache.get(path);
        if (cached !== undefined) {
          return cached;
        }
        const answer = await base.exists(path);
        this.fileExistsCache.set(path, answer);
        return answer;
      },
      stat: async (path: string) => {
        const cached = this.fileStatCache.get(path);
        if (cached !== undefined) {
          return cached;
        }
        const entry = await base.stat(path);
        this.fileStatCache.set(path, entry);
        return entry;
      },
    };
    return this.bundlerFilesystemView;
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
    operations: ReadonlyArray<MiddlewareFileDependency['affects'][number]>;
    parameters?: Record<string, unknown>;
    renderOptions?: Record<string, unknown>;
    content?: RuntimeContentInput;
    exportDependency?: ExportDependency;
    resolvedMiddleware?: ResolvedMiddleware[];
    dependencyContext?: DependencyResolutionContext;
    owner: OperationOwner;
  }): Promise<Dependency[]> {
    const executionList = input.resolvedMiddleware ?? this.getMiddleware();
    const commonDependencyKey = canonicalJson({
      file: input.owner.file,
      kernelId: input.owner.binding?.kernelId,
      kernelVersion: input.owner.binding?.kernelVersion,
      options: input.owner.binding?.kernelId ? (this.kernelInitOptionsMap.get(input.owner.binding.kernelId) ?? {}) : {},
      assets: input.owner.binding?.kernelId
        ? (this.kernelImplementationAssetsMap.get(input.owner.binding.kernelId) ?? [])
        : [],
    });
    const executionListKey = canonicalJson({
      operations: input.operations,
      middleware: executionList
        .filter(({ enabled }) => enabled)
        .map(({ id, middleware, options }) => ({
          id,
          version: middleware.version,
          options,
        })),
    });
    let commonDependencies = input.dependencyContext?.commonDependencies;
    if (!commonDependencies) {
      commonDependencies = this.commonDependencyCache.get(commonDependencyKey);
      if (!commonDependencies) {
        const pending = this.recordDependencyPaths(this.computeCommonDependencies(input.owner), ({ paths }) => ({
          paths,
          affectsParameters: true,
        }));
        this.commonDependencyCache.set(commonDependencyKey, pending);
        commonDependencies = this.evictRejectedCacheEntry({
          cache: this.commonDependencyCache,
          key: commonDependencyKey,
          pending,
        });
      }
      if (input.dependencyContext) {
        input.dependencyContext.commonDependencies = commonDependencies;
      }
    }
    const common = await commonDependencies;

    let middlewareDependencies = input.dependencyContext?.middlewareDependenciesByExecutionList?.get(executionListKey);
    if (!middlewareDependencies) {
      const middlewareDependencyKey = `${commonDependencyKey}|${executionListKey}`;
      middlewareDependencies = this.middlewareDependencyCache.get(middlewareDependencyKey);
      if (!middlewareDependencies) {
        const pending = this.recordDependencyPaths(
          this.computeMiddlewareDependencies(input.owner, executionList, input.operations),
          ({ watchPaths }) => ({
            paths: new Set(watchPaths.keys()),
            affectsParameters: input.operations.includes('describe'),
          }),
        );
        this.middlewareDependencyCache.set(middlewareDependencyKey, pending);
        middlewareDependencies = this.evictRejectedCacheEntry({
          cache: this.middlewareDependencyCache,
          key: middlewareDependencyKey,
          pending,
        });
      }
      if (input.dependencyContext) {
        input.dependencyContext.middlewareDependenciesByExecutionList ??= new Map();
        input.dependencyContext.middlewareDependenciesByExecutionList.set(executionListKey, middlewareDependencies);
      }
    }

    const phase = await middlewareDependencies;
    /* The declarations are registered here rather than where they are discovered: discovery is
     * cached, and a render that answers from that cache still reads those paths and still has to
     * watch them. Registering only on a miss made a re-opened entry deaf to an external edit of
     * the paths its middleware declared. */
    const runtimeDeps: Dependency[] = [
      ...common.fileDependencies,
      ...phase.dependencies,
      ...common.trailingDependencies,
    ];

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

  private async evictRejectedCacheEntry<Value>(options: {
    cache: Map<string, Promise<Value>>;
    key: string;
    pending: Promise<Value>;
  }): Promise<Value> {
    try {
      return await options.pending;
    } catch (error) {
      if (options.cache.get(options.key) === options.pending) {
        options.cache.delete(options.key);
      }
      throw error;
    }
  }

  /**
   * Compute all non-parameter dependencies. Factored out so the result
   * can be cached for the duration of a render cycle (shared between
   * getParameters and createGeometry).
   *
   * @param owner - Kernel/file owner for this dependency-resolution operation
   * @returns Common file and trailing identity dependencies with content hashes.
   */
  private async computeCommonDependencies(owner: OperationOwner): Promise<CommonDependencySet> {
    const ownerFilePath = assertRootedPath(joinRelativePath(owner.file.path, owner.file.filename));

    // 1. Discover file dependencies from kernel module
    const discoverSpan = this.tracer.startSpan('deps.discover');
    const discoverInput: GetDependenciesInput = {
      entryPath: ownerFilePath,
    };
    const depsResult = await this.onGetDependenciesForOwner(owner, discoverInput, this.createRuntime());
    const unresolvedPaths = [...new Set(depsResult.unresolved.map((path) => assertRootedPath(path)))];
    const rootedPaths = [...new Set(depsResult.resolved.map((path) => assertRootedPath(path)))];
    /* Absence is an observation: a request-scoped operation that retained "this import does
     * not resolve" has to notice the file appearing. */
    for (const path of unresolvedPaths) {
      this.fileHashCache.set(path, 'missing');
    }
    discoverSpan.end();

    // 2. Read uncached files
    const uncachedPaths = rootedPaths.filter((p) => !this.fileHashCache.has(p));
    if (uncachedPaths.length > 0) {
      // The bundler just read these through `fileContentCache`; only what it did not touch is read
      // here (W22). A hash still needs the bytes, so a cached *string* is re-encoded, not re-read.
      const unreadPaths = uncachedPaths.filter((p) => !this.fileContentCache.has(p));
      const readSpan = this.tracer.startSpan('deps.read', {
        fileCount: unreadPaths.length,
      });
      const contentMap: Record<string, Uint8Array<ArrayBuffer>> = unreadPaths.length > 0
        ? await this.filesystem.readFiles(unreadPaths)
        : {};
      for (const path of uncachedPaths) {
        const cached = this.fileContentCache.get(path);
        if (cached !== undefined) {
          contentMap[path] = typeof cached === 'string' ? new TextEncoder().encode(cached) : cached;
        }
      }
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
    const fileDeps: FileDependency[] = rootedPaths.map((rootedPath) => ({
      type: 'file',
      path: rootedPath,
      contentHash: this.fileHashCache.get(rootedPath)!,
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

    return {
      fileDependencies: fileDeps,
      trailingDependencies: [...kernelDeps, frameworkDep, ...optionDeps, ...assetDeps],
      paths: new Set([...rootedPaths, ...unresolvedPaths]),
    };
  }

  /** Resolve only the dependencies declared by one middleware execution list. */
  private async computeMiddlewareDependencies(
    owner: OperationOwner,
    middleware: ResolvedMiddleware[],
    operations: ReadonlyArray<MiddlewareFileDependency['affects'][number]>,
  ): Promise<MiddlewareDependencySet> {
    const discoverInput: GetDependenciesInput = {
      entryPath: assertRootedPath(joinRelativePath(owner.file.path, owner.file.filename)),
    };
    const declarations: MiddlewareFileDependency[] = [];
    for (const { middleware: definition, options, enabled, id } of middleware) {
      if (!enabled || !definition.resolve) {
        continue;
      }
      try {
        // oxlint-disable-next-line no-await-in-loop -- Middleware declaration order is part of dependency identity.
        const resolved = await definition.resolve(discoverInput, {
          signal: this.operationSignal ?? neverAbortedSignal,
          logger: this.getMiddlewareLogger(id, definition.name),
          filesystem: this.filesystem,
          options,
        });
        declarations.push(
          ...resolved
            .filter((declaration) => declaration.affects.some((operation) => operations.includes(operation)))
            .map((declaration) => ({
              ...declaration,
              path: assertRootedPath(declaration.path),
            })),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw Object.assign(new Error(`Middleware dependency error in ${definition.name}: ${message}`), {
          issues: [
            {
              message: `Middleware dependency error in ${definition.name}: ${message}`,
              code: 'MIDDLEWARE_FAILED',
              type: 'kernel',
              severity: 'error',
            } satisfies KernelIssue,
          ],
        });
      }
    }

    const fileDependencies: FileDependency[] = [];
    const watchPaths = new Map<string, number>();
    for (const declaration of declarations) {
      watchPaths.set(declaration.path, declaration.watchDebounce ?? fileChangeDebounce);
      if (!this.fileHashCache.has(declaration.path)) {
        try {
          // oxlint-disable-next-line no-await-in-loop -- Individual reads preserve declaration order and missing-file semantics.
          const content = await this.filesystem.readFile(declaration.path);
          // oxlint-disable-next-line no-await-in-loop -- Hash publication must precede dependency construction.
          this.fileHashCache.set(declaration.path, await this.hashContent(content));
        } catch (error) {
          if (!isNotFoundError(error)) {
            throw error;
          }
          this.fileHashCache.set(declaration.path, 'missing');
        }
      }
      fileDependencies.push({
        type: 'file',
        path: declaration.path,
        contentHash: this.fileHashCache.get(declaration.path)!,
      });
    }

    const signatureDependencies: MiddlewareDependency[] = middleware
      .filter(({ middleware: definition, enabled }) => enabled && definition.mutates !== false)
      .map(({ middleware: definition, options, id }, index) => ({
        type: 'middleware',
        id,
        version: definition.version,
        index,
        options,
      }));
    return {
      dependencies: [...fileDependencies, ...signatureDependencies],
      watchPaths,
    };
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
          return {
            resolved: cached.dependencies,
            unresolved: cached.unresolvedPaths,
          };
        }

        const result = await facade.bundle(entryPath);
        return {
          resolved: result.dependencies,
          unresolved: result.unresolvedPaths,
        };
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

  private createComputeRuntime(signal: AbortSignal): KernelComputeCapability {
    this.computeHost ??= createComputeCapabilityHost({
      binding: this.computeBinding,
      workspace: 'worker',
      onDiagnostic: (message) => {
        this.logger.warn(message);
      },
      onScopeSettled: ({ operationId, generation, settlement }) => {
        this.tracer.startSpan('kernel.compute.reuse', { operationId }).end({
          generation,
          status: settlement.status,
          published: settlement.published.length,
          omitted: settlement.omitted.length,
          conflicts: settlement.conflicts.length,
          ...(settlement.reason === undefined ? {} : { reason: settlement.reason }),
        });
      },
    });
    const operationId = randomUuid();
    return this.computeHost.capability(signal, operationId);
  }

  /**
   * Bind the compute facet for this worker.
   * @param binding - Off, memory, or a host-minted durable store spec.
   */
  public setComputeBinding(binding: ComputeBinding): void {
    this.computeBinding = binding;
    this.computeHost = undefined;
  }

  /**
   * Permit the publication tail of every closed compute scope.
   *
   * Invoked only after a result has actually been delivered to the client, so
   * disposable export and encode work cannot precede or starve delivery. The
   * The document dispatcher calls it after result delivery and on the return
   * path of every `call`, so publication tails cannot starve (N6).
   */
  public permitComputePublication(): void {
    this.computeHost?.permitPublication();
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
      // A call outside any operation shares its identity with nothing.
      operationId: this.currentOperationId ?? ++this.operationSequence,
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
      compute: this.createComputeRuntime(signal),
      getCompiledWasmModule: (url) => this.getCompiledWasmModule(url),
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
    const localFilePath = assertRootedPath(joinRelativePath(file.path, file.filename));
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
    | {
        success: true;
        input: Pick<NativeBuildInput, 'options'> | Record<never, never>;
      }
    | { success: false; issues: KernelIssue[] } {
    const kernelId = owner.binding?.kernelId;
    const createSchema = kernelId ? this.kernelCreateOptionsZodSchemaMap.get(kernelId) : undefined;
    if (!createSchema) {
      return { success: true, input: {} };
    }

    const createKeys = Object.keys(createSchema.shape);
    const renderDefaults = kernelId ? this.kernelRenderZodSchemaMap.get(kernelId)?.safeParse({}) : undefined;
    const candidate = deepmerge(
      {
        ...(renderDefaults?.success
          ? pickRecordProperties(renderDefaults.data as Record<string, unknown>, createKeys)
          : {}),
        ...pickRecordProperties(renderOptions, createKeys),
      },
      pickRecordProperties(exportOptions ?? {}, createKeys),
      {
        arrayMerge: (_target: unknown[], source: unknown[]) => source,
      },
    );
    const admitted = admitKernelOptions(
      createSchema,
      candidate,
      `Kernel ${kernelId} evaluate`,
      'EVALUATE_OPTIONS_INVALID',
    );
    return admitted.success
      ? { success: true, input: { options: admitted.options } }
      : { success: false, issues: admitted.issues };
  }

  private async computeNativeHandleKey(input: {
    owner: OperationOwner;
    parameters: Record<string, unknown>;
    renderOptions: Record<string, unknown>;
    exportOptions?: Record<string, unknown>;
    content: RuntimeContentInput;
    pinnedIdentity?: RenderIdentity;
  }): Promise<{ success: true; key: string } | { success: false; issues: KernelIssue[] }> {
    const createOptions = this.resolveCreateOptions(input.renderOptions, input.exportOptions, input.owner);
    if (!createOptions.success) {
      return createOptions;
    }
    // Retain the admitted evaluation closure, but still compare parsed
    // construction options before attempting live/serialized handle reuse.
    const dependencies = input.pinnedIdentity
      ? input.pinnedIdentity.dependencies.filter(
          ({ type }) => type !== 'render-options' && type !== 'content' && type !== 'export',
        )
      : await this.computeDependencies({
          operations: ['evaluate'],
          parameters: input.parameters,
          resolvedMiddleware: this.getCreateExecutionList(
            input.owner,
            input.content,
            input.exportOptions !== undefined,
          ),
          owner: input.owner,
        });
    if ('options' in createOptions.input) {
      dependencies.push({
        type: 'option',
        key: 'native-build-options',
        value: createOptions.input.options,
      });
    }
    return {
      success: true,
      key: await this.computeDependencyHash(dependencies),
    };
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

  /** Preserve the current client's combined bag until evaluation chooses its offered view. */
  private validateRenderOptions(
    renderOptions: Record<string, unknown> | undefined,
    owner: OperationOwner,
  ): { success: true; options: Record<string, unknown> } | { success: false; issues: KernelIssue[] } {
    if (!this.deferRenderOptionAdmission) {
      const kernelId = owner.binding?.kernelId;
      const schema = kernelId ? this.kernelRenderZodSchemaMap.get(kernelId) : undefined;
      if (!schema) {
        return { success: true, options: renderOptions ?? {} };
      }
      return admitKernelOptions(
        schema,
        renderOptions ?? {},
        `Kernel ${kernelId ?? '<unknown>'} view`,
        'VIEW_OPTIONS_INVALID',
      );
    }
    return { success: true, options: renderOptions ?? {} };
  }

  protected getNativeRenderContentKeys(owner: OperationOwner, _view?: string): readonly RuntimeContentKey[] {
    return owner.binding?.kernelId ? (this.kernelRenderContentMap.get(owner.binding.kernelId) ?? []) : [];
  }

  private getMiddlewareRenderContentKeys(
    middleware: RuntimeMiddlewareDefinition,
    kernelId: string | undefined,
    selectedMimeType?: MediaType,
  ): readonly RuntimeContentKey[] {
    const mimeType = selectedMimeType ?? (kernelId ? this.kernelRenderMimeTypeMap.get(kernelId) : undefined);
    return mimeType ? (middleware.content?.views?.[mimeType] ?? []) : [];
  }

  private getRenderContentKeys(owner: OperationOwner): readonly RuntimeContentKey[] {
    const keys = new Set(
      owner.binding?.kernelId ? (this.kernelAllViewContentMap.get(owner.binding.kernelId) ?? []) : [],
    );
    for (const { enabled, middleware } of this.getMiddleware()) {
      if (enabled) {
        for (const declaration of Object.values(middleware.content?.views ?? {})) {
          for (const key of declaration ?? []) {
            keys.add(key);
          }
        }
      }
    }
    return [...keys];
  }

  private getNativeExportContentKeys(
    owner: OperationOwner,
    format: string,
    exportId?: string,
  ): readonly RuntimeContentKey[] {
    if (exportId) {
      return this.getDocumentExportDeclaration(owner, exportId)?.content ?? [];
    }
    return owner.binding?.kernelId ? (this.kernelExportContentMap.get(owner.binding.kernelId)?.[format] ?? []) : [];
  }

  private getExportContentKeys(owner: OperationOwner, format: string, exportId?: string): readonly RuntimeContentKey[] {
    const keys = new Set(this.getNativeExportContentKeys(owner, format, exportId));
    for (const { enabled, middleware } of this.getMiddleware()) {
      if (enabled) {
        for (const key of middleware.content?.exports?.[format] ?? []) {
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
      return {
        success: true,
        content: normalizeRuntimeContent(operation, supported, content),
      };
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
    const { content: _content, ...rest } = input as Input & {
      readonly content?: RuntimeContentInput;
    };
    return rest;
  }

  private withProviderRuntimeContent<Input extends Record<PropertyKey, unknown>>(
    input: Input,
    canonicalContent: RuntimeContentInput,
    keys: readonly RuntimeContentKey[],
  ): Omit<Input, 'content'> & { readonly content?: RuntimeContentInput } {
    const rest = this.withoutRuntimeContent(input);
    return keys.length === 0
      ? rest
      : {
          ...rest,
          content: this.projectRuntimeContent(canonicalContent, keys),
        };
  }

  private getCreateExecutionList(
    _owner: OperationOwner,
    _content: RuntimeContentInput,
    _exportOperation: boolean,
  ): ResolvedMiddleware[] {
    return this.getMiddleware().filter(
      ({ enabled, middleware }) => enabled && Boolean(middleware.wrapEvaluate ?? middleware.resolve),
    );
  }

  private getMeshExecutionList(_owner: OperationOwner, _content: RuntimeContentInput): ResolvedMiddleware[] {
    return this.getMiddleware().filter(({ enabled, middleware }) => enabled && Boolean(middleware.wrapRender));
  }

  private getOuterExportExecutionList(plan: Extract<OwnerBoundExportPlan, { success: true }>): ResolvedMiddleware[] {
    return this.getMiddleware().filter(
      (resolved) =>
        resolved.enabled && Boolean(resolved.middleware.wrapExport) && this.middlewareRunsInOuterExport(resolved, plan),
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

  // oxlint-disable-next-line max-params -- The selected view, owner and content jointly determine middleware ownership.
  private middlewareRunsForRender(
    resolved: ResolvedMiddleware,
    owner: OperationOwner,
    selection: { view: string; mimeType: MediaType },
    content: RuntimeContentInput,
  ): boolean {
    if (!resolved.middleware.content?.views) {
      return true;
    }
    const declared = this.getMiddlewareRenderContentKeys(
      resolved.middleware,
      owner.binding?.kernelId,
      selection.mimeType,
    );
    const native = new Set(this.getNativeRenderContentKeys(owner, selection.view));
    return declared.some((key) => content[key] === true && !native.has(key));
  }

  private middlewareRunsInOuterExport(
    resolved: ResolvedMiddleware,
    plan: Extract<OwnerBoundExportPlan, { success: true }>,
  ): boolean {
    const declarations = resolved.middleware.content?.exports;
    if (!declarations) {
      return true;
    }
    if (plan.route.kind === 'transcoded') {
      return false;
    }
    const declared = declarations[plan.route.targetFormat] ?? [];
    const native = new Set(this.getNativeExportContentKeys(plan.owner, plan.route.targetFormat, plan.route.exportId));
    return declared.some((key) => plan.route.content[key] === true && !native.has(key));
  }

  private getSourceContentContributors(
    owner: OperationOwner,
    route: Extract<OwnerBoundExportRoute, { kind: 'transcoded' }>,
  ): ResolvedMiddleware[] {
    return this.getContentContributors(owner, route.sourceFormat, route.content, route.exportId);
  }

  // oxlint-disable-next-line max-params -- The source export ID disambiguates same-extension content contributors.
  private getContentContributors(
    owner: OperationOwner,
    format: string,
    content: RuntimeContentInput,
    exportId?: string,
  ): ResolvedMiddleware[] {
    const native = new Set(this.getNativeExportContentKeys(owner, format, exportId));
    return this.getMiddleware().filter(({ enabled, middleware }) => {
      if (!enabled || !middleware.wrapExport) {
        return false;
      }
      return (middleware.content?.exports?.[format] ?? []).some((key) => content[key] === true && !native.has(key));
    });
  }

  // oxlint-disable-next-line max-params -- Mirrors contributor selection while retaining route provenance.
  private describeContentContributors(
    owner: OperationOwner,
    format: string,
    content: RuntimeContentInput,
    exportId?: string,
  ): NonNullable<NonNullable<ExportDependency['route']>['contentContributors']> {
    const allMiddleware = this.getMiddleware();
    return this.getContentContributors(owner, format, content, exportId).map((resolved) => ({
      id: resolved.id,
      version: resolved.middleware.version,
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

preserveMethodNames(KernelWorker, ['getParameters']);

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

function inputDefaults(schema: JSONSchema7): Record<string, unknown> {
  const firstBranch = (schema.anyOf ?? schema.oneOf)?.[0];
  const branchDefaults = typeof firstBranch === 'object' ? inputDefaults(firstBranch) : {};
  return {
    ...branchDefaults,
    ...Object.fromEntries(
      Object.entries(schema.properties ?? {}).flatMap(([key, property]) =>
        typeof property === 'object' && 'default' in property ? [[key, property.default]] : [],
      ),
    ),
  };
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
  const { required: sourceRequired = [], ...schema } = input.schema;
  const required = sourceRequired.filter((key) => !omitted.has(key));
  const defaults = Object.fromEntries(Object.entries(input.defaults).filter(([key]) => !omitted.has(key)));
  return {
    schema: {
      ...schema,
      properties,
      ...(required.length > 0 ? { required } : {}),
    },
    defaults,
  };
}

function pickRecordProperties(input: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const selected = new Set(keys);
  return Object.fromEntries(Object.entries(input).filter(([key]) => selected.has(key)));
}
