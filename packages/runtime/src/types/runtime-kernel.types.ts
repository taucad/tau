/**
 * Runtime Worker Types
 *
 * Shared runtime services, filesystem, logging, and lower worker input shapes.
 *
 * For bundler types, see runtime-bundler.types.ts.
 * For dependency types, see runtime-dependency.types.ts.
 * For middleware types, see runtime-middleware.types.ts.
 * For tracer types, see runtime-tracer.types.ts.
 * For shared result/error types used across the codebase, see kernel.types.ts.
 */

import type { z } from 'zod';
import type { LogLevel, FileStatEntry } from '@taucad/types';
import type { FileSystemProvider, WatchEvent, WatchRequest } from '@taucad/filesystem';
import type { KernelComputeCapability } from '#types/runtime-compute.types.js';
import type { ParameterResolutionOptions } from '@taucad/parameters';
import type { RuntimeSpanTracer } from '#types/runtime-tracer.types.js';
import type { ExecuteResult, KernelBundler } from '#types/runtime-bundler-service.types.js';
import type { ContentHookInputFor, ContentKeysOf, RuntimeContentDeclaration } from '#types/runtime-content.types.js';

/** Exact content-free input passed to the terminal kernel create hook. @public */
export type NativeBuildInput = {
  readonly entryPath: string;
  readonly parameters: Record<string, unknown>;
} & ({ readonly options: Record<string, unknown> } | { readonly options?: never });

/** Replay identity shared with middleware cache implementations. @public */
export const nativeBuildInputSymbol: unique symbol = Symbol('nativeBuildInput');

/** The replay carrier; its symbol property is runtime-owned. @public */
export type NativeBuildInputCarrier = {
  /** @internal */
  readonly [nativeBuildInputSymbol]?: NativeBuildInput;
};

// =============================================================================
// Kernel Logging
// =============================================================================

/**
 * Logger options for kernel and middleware logging methods.
 * @public
 */
export type RuntimeLogOptions = {
  /** Additional data to include in the log */
  data?: unknown;
};

/**
 * Logger interface for kernel methods and middleware.
 * Provides convenience methods that automatically inject the component name.
 * @public
 */
export type RuntimeLogger = {
  /** Log an info-level message */
  log: (message: string, options?: RuntimeLogOptions) => void;
  /** Log a debug-level message */
  debug: (message: string, options?: RuntimeLogOptions) => void;
  /** Log a trace-level message */
  trace: (message: string, options?: RuntimeLogOptions) => void;
  /** Log a warning-level message */
  warn: (message: string, options?: RuntimeLogOptions) => void;
  /** Log an error-level message */
  error: (message: string, options?: RuntimeLogOptions) => void;
  /**
   * Log a message with a dynamic log level.
   * Useful for kernels like OpenRSCAD that determine log level at runtime.
   */
  custom: (level: LogLevel, message: string, options?: RuntimeLogOptions) => void;
};

// =============================================================================
// Kernel Filesystem
// =============================================================================

/**
 * Base filesystem interface for runtime backends.
 *
 * Aliases the canonical {@link FileSystemProvider} from `@taucad/filesystem`
 * augmented with an optional `watch` subscription. Filesystem backends
 * authored for the runtime (e.g. `fromFsLike`, `fromMemoryFs`, `fromNodeFs`)
 * implement this shape; the runtime upgrades it into a {@link KernelFileSystem}
 * at the worker boundary via the runtime's internal decorator.
 * Paths are canonical and root-relative within the supplied runtime filesystem;
 * `''` refers to that filesystem's root.
 *
 * @public
 */
export type RuntimeFileSystemBase = FileSystemProvider & {
  /**
   * Subscribe to filesystem change events for the given paths.
   * Returns an unsubscribe function. Events are filtered server-side.
   */
  watch?(request: RuntimeWatchRequest, handler: (event: RuntimeWatchEvent) => void): () => void;
};

/** Watch request for runtime filesystem subscriptions. @public */
export type RuntimeWatchRequest = WatchRequest;

/** Filesystem watch event emitted by runtime filesystem subscriptions. @public */
export type RuntimeWatchEvent = WatchEvent;

/**
 * Enhanced filesystem interface seen inside kernel/bundler/middleware code.
 * Extends the base primitives with higher-level helper methods built from the
 * primitives by the runtime's internal decorator. Provider watch stays on the
 * transport boundary and is not exposed through this kernel-facing facade.
 *
 * Distinct from the consumer-facing opaque `RuntimeFileSystem` value
 * (`#filesystem/runtime-filesystem.js`) produced by `from*` factories and
 * handed to a transport plugin's `client({ fileSystem })`; the transport
 * unwraps the opaque value and upgrades the backing `RuntimeFileSystemBase`
 * inside the runtime worker.
 *
 * Renamed from `RuntimeFileSystem` (R14) to disambiguate from the
 * consumer-facing opaque brand. The `KernelFileSystem` name is exported
 * only from the kernel-author subpath `@taucad/runtime/kernel`; the
 * consumer barrel reserves `RuntimeFileSystem` for the opaque value.
 * All methods operate on paths within the supplied runtime filesystem.
 *
 * @public
 */
export type KernelFileSystem = Omit<RuntimeFileSystemBase, 'watch'> & {
  /** Batch-read multiple files as binary. Default: `Promise.all(paths.map(readFile))`. */
  readFiles(paths: string[]): Promise<Record<string, Uint8Array<ArrayBuffer>>>;
  /** Read all file contents in a directory (skips subdirectories). */
  readdirContents(directoryPath: string): Promise<Record<string, Uint8Array<ArrayBuffer>>>;
  /** Get stat information for all entries in a directory. */
  readdirStat(directoryPath: string): Promise<FileStatEntry[]>;
  /** Ensure a directory exists, creating parents as needed. Default: `mkdir(path, { recursive: true })`. */
  ensureDir(path: string): Promise<void>;
};

/**
 * One holder's share of a realm-shared resource.
 * @public
 */
export type RealmHold<Value> = {
  /** The realm's single instance, shared with every other holder. */
  readonly value: Value;
  /** Give up this share; idempotent. The last release disposes the instance. */
  release(): void;
};

/**
 * Slot holding a realm group's live instance. Keyed with `Symbol.for` so duplicate runtime copies in one realm
 * read the same slot; its shape is part of the same-realm plugin ABI (`runtimePluginAbiVersion`).
 * @internal
 */
export const realmGroupState: unique symbol = Symbol.for('@taucad/runtime/realm-group');

/**
 * Live state of one realm group, carried by its token.
 * @internal
 */
export type RealmGroupState<Value> = {
  /** `runtimePluginAbiVersion` of the runtime copy that made the token. */
  readonly abi: number;
  /** The realm's instance of this group while it has holders or a pending creation. */
  entry:
    | {
        readonly key: string;
        readonly value: Promise<Value>;
        readonly dispose: ((value: Value) => void) | undefined;
        holders: number;
      }
    | undefined;
};

/**
 * A backend that every kernel in a JavaScript realm must share, such as a library's module-scope WASM instance.
 *
 * Create it once, at module scope, with `createRealmGroup`; hold it through `services.realm`. The token carries
 * the realm's one instance, so a hold returns exactly what this token's `create` made.
 * @public
 */
export type RealmGroup<Value> = {
  /** Realm-wide name, e.g. `'replicad-occt'`. A second token with a held name is refused. */
  readonly name: string;
  /** @internal */
  readonly [realmGroupState]: RealmGroupState<Value>;
};

/**
 * Input of `services.realm.hold`.
 * @public
 */
export type RealmHoldInput<Value> = {
  /** The backend to hold; its token fixes `Value`. */
  readonly group: RealmGroup<Value>;
  /** Build identity of the instance, e.g. `'single:<wasmUrl>'`. Another key for a held group is refused. */
  readonly key: string;
  /** Creates the instance once for every holder. */
  readonly create: () => Promise<Value>;
  /** Frees the instance after its last holder released it. */
  readonly dispose?: (value: Value) => void;
};

/**
 * Realm-shared resources: at most one live instance per group in a JavaScript realm.
 *
 * For a library that binds its backend at module scope (replicad's OpenCASCADE), every kernel in
 * the realm must use the same instance. Hold it from `initialize` and release it from `onDispose`.
 * @public
 */
export type RealmResources = {
  /**
   * Hold the realm's single instance of `group`; `key` identifies its build.
   *
   * Concurrent and later holders of the same group and key share one `create` call. A rejected
   * `create` is retried by the next holder. The hold rejects with an error whose `issues` carry
   * `KERNEL_REALM_CONFLICT` when the realm holds another `key` of the group (`details.reason: 'build'`),
   * another token holds the group's name (`'declaration'`), or the token or the realm's shared state
   * comes from a runtime copy with another plugin ABI (`'runtime'`).
   *
   * @param input - Group token, build key, creator and optional disposer.
   * @returns This holder's share of the instance.
   */
  hold<Value>(input: RealmHoldInput<Value>): Promise<RealmHold<Value>>;
};

// =============================================================================
// Kernel Runtime
// =============================================================================

/**
 * Runtime services provided to kernel methods.
 * The bundler and execute services are lazily initialised -- kernels that
 * never call them (OpenSCAD, Tau) pay zero cost.
 * @public
 */
export type KernelRuntime = {
  /**
   * Operation-scoped cancellation signal. Fresh for each operation; pass it
   * to cancellable platform APIs and do not retain it for later work.
   */
  readonly signal: AbortSignal;
  /**
   * Identity of the runtime operation this call belongs to. Every kernel call inside one
   * operation — a render's dependency, parameter and geometry calls — shares it, and the runtime
   * treats the workspace as unchanged for that operation's duration; any other call carries a
   * different value. Key per-operation reuse of workspace reads on it. Hosts that do not scope
   * calls into operations, such as test doubles, omit it, and nothing should then be reused.
   */
  readonly operationId?: number;
  /** Rooted filesystem capability; all paths are canonical and relative to its root. */
  filesystem: KernelFileSystem;
  /** Logger with kernel name pre-configured */
  logger: RuntimeLogger;
  /** Read-only view of file contents cached by normalized runtime path during dependency computation. */
  fileContentCache: ReadonlyMap<string, Uint8Array<ArrayBuffer> | string>;
  /** Esbuild bundler for JS/TS kernels. Lazily initialised on first access. */
  bundler: KernelBundler;
  /** Span tracer for kernel-authored performance instrumentation */
  tracer: RuntimeSpanTracer;
  /** Compute reuse facet for the active operation. `off` carries no operations at all. */
  readonly compute: KernelComputeCapability;
  /** Resources shared by every kernel in this JavaScript realm. */
  readonly realm: RealmResources;
  /** Resolve a host-compiled WASM module by its absolute asset URL. */
  getCompiledWasmModule(url: string): WebAssembly.Module | undefined;
  /**
   * Execute bundled JS/TS code via dynamic import and return the module exports.
   * Browser uses Blob URL, Node.js uses data URL.
   */
  execute(code: string): Promise<ExecuteResult>;
};

// =============================================================================
// Kernel Method Input Types
// =============================================================================

/** Host URL plus stable digest identity for a selected plugin implementation asset. @public */
export type RuntimeImplementationAsset = {
  readonly id: string;
  readonly url: string;
  readonly sha256: string;
};

/**
 * File path identifying the active document for parameter extraction.
 * @public
 */
export type GetParametersInput = {
  /** Canonical root-relative path of the active entry within the runtime filesystem. */
  entryPath: string;
  /** Semantic profile inputs that participate in parameter cache identity. */
  resolution?: ParameterResolutionOptions;
};

/** One native export format declared by a kernel author. @public */
export type KernelExportFormatDefinition<
  Schema extends z.ZodType = z.ZodType,
  Content extends RuntimeContentDeclaration | undefined = RuntimeContentDeclaration | undefined,
> = {
  /** Kernel-owned export options for this format. */
  readonly optionsSchema: Schema;
  /** Framework content properties fulfilled natively by this format. */
  readonly content?: Content;
};

/** Native export formats keyed by file extension. @public */
export type KernelExportFormats = Record<string, KernelExportFormatDefinition>;

/**
 * File path identifying the active document for dependency resolution.
 * @public
 */
export type GetDependenciesInput = {
  /** Canonical root-relative path of the active entry within the runtime filesystem. */
  entryPath: string;
};

/**
 * Validated options passed to a kernel during worker initialization.
 * @public
 */
export type InitializeInput<Options = Record<string, unknown>> = {
  /** Worker options */
  options: Options;
};

/**
 * Export format and options for request-scoped export operations.
 *
 * When `ExportSchemas` has entries, the input becomes a discriminated union keyed
 * on `format`. Narrowing `input.format` in a switch/if narrows `input.options`
 * to the corresponding schema's inferred type. When no schemas are declared,
 * falls back to `format: string` with untyped options.
 *
 * Tessellation and coordinate system are carried inside `options` via per-format
 * Zod schema composition (e.g., `tessellationSchema.extend(coordinateSystemSchema.shape)`).
 *
 * @template ExportSchemas - Map of format string to Zod schema for per-format option typing
 * @public
 */
export type ExportGeometryRequest<
  // oxlint-disable-next-line @typescript-eslint/no-empty-object-type -- empty default signals "no schemas declared"
  ExportFormats extends KernelExportFormats = {},
> = [keyof ExportFormats] extends [never]
  ? {
      format: string;
      /** Export options (untyped fallback). */
      options: Record<string, unknown>;
    }
  : {
      [K in Extract<keyof ExportFormats, string>]: {
        format: K;
        /** Per-format export options (Zod-validated, defaults applied by framework). */
        options: z.output<ExportFormats[K]['optionsSchema']>;
      } & ContentHookInputFor<ContentKeysOf<ExportFormats[K]['content']>>;
    }[Extract<keyof ExportFormats, string>];

/**
 * Export request plus the kernel-native geometry handle.
 *
 * Middleware sees {@link ExportGeometryRequest}; the framework appends the
 * `nativeHandle` only at the internal kernel execution boundary.
 *
 * @template NativeHandle - Kernel-specific native geometry representation, injected by the framework
 * @template ExportSchemas - Map of format string to Zod schema for per-format option typing
 * @public
 */
export type KernelExportGeometryInput<
  NativeHandle = unknown,
  // oxlint-disable-next-line @typescript-eslint/no-empty-object-type -- empty default signals "no formats declared"
  ExportFormats extends KernelExportFormats = {},
> = ExportGeometryRequest<ExportFormats> & {
  nativeHandle: NativeHandle;
};

/**
 * Middleware authors should use {@link ExportGeometryRequest}; kernel authors
 * continue to receive the native-handle-bearing input.
 *
 * @template NativeHandle - Kernel-specific native geometry representation, injected by the framework
 * @template ExportSchemas - Map of format string to Zod schema for per-format option typing
 * @public
 */
export type ExportGeometryInput<
  NativeHandle = unknown,
  // oxlint-disable-next-line @typescript-eslint/no-empty-object-type -- empty default signals "no formats declared"
  ExportFormats extends KernelExportFormats = {},
> = KernelExportGeometryInput<NativeHandle, ExportFormats>;
