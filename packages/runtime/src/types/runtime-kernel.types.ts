/**
 * Runtime Worker Types
 *
 * Core types for the kernel definition API (defineKernel), runtime services,
 * filesystem, logging, and method input/output shapes.
 *
 * For bundler types, see runtime-bundler.types.ts.
 * For dependency types, see runtime-dependency.types.ts.
 * For middleware types, see runtime-middleware.types.ts.
 * For tracer types, see runtime-tracer.types.ts.
 * For shared result/error types used across the codebase, see kernel.types.ts.
 */

import type { z } from 'zod';
import type { FileExtension, LogLevel, GeometryResponse, FileStatEntry } from '@taucad/types';
import type { FileSystemProvider, WatchEvent, WatchEventFilter, WatchRequest } from '@taucad/filesystem';
import type { ExportGeometryResult, GetParametersResult, KernelIssue } from '#types/runtime.types.js';
import type { RuntimeSpanTracer } from '#types/runtime-tracer.types.js';
import type { ExecuteResult, KernelBundler } from '#types/runtime-bundler.types.js';
import type { KernelPlugin } from '#plugins/plugin-types.js';
import { attachRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';
import type { RuntimePluginDefinitionCarrier } from '#plugins/plugin-runtime-definition.js';
import type {
  ContentInputFor,
  ContentKeysOf,
  RuntimeContentDeclaration,
  RuntimeContentKey,
} from '#types/runtime-content.types.js';

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
   * Useful for kernels like OpenSCAD that determine log level at runtime.
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
 * implement this shape; the runtime upgrades it into a {@link RuntimeFileSystem}
 * at the worker boundary via {@link createRuntimeFileSystem}.
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

/** Filter for selecting filesystem event types. @public */
export type RuntimeWatchEventFilter = WatchEventFilter;

/** Filesystem watch event emitted by runtime filesystem subscriptions. @public */
export type RuntimeWatchEvent = WatchEvent;

/**
 * Enhanced filesystem interface seen inside kernel/bundler/middleware code.
 * Extends the base primitives with higher-level helper methods that have
 * default implementations built from the primitives (via `createRuntimeFileSystem`).
 * Backends may supply optimized overrides for any of the enhanced methods.
 *
 * Distinct from the consumer-facing opaque `RuntimeFileSystem` value
 * (`#filesystem/runtime-filesystem.js`) produced by `from*` factories and
 * handed to a transport plugin's `client({ fileSystem })`; the transport
 * unwraps the opaque value and upgrades the backing `RuntimeFileSystemBase`
 * via `createRuntimeFileSystem` inside the runtime worker.
 *
 * Renamed from `RuntimeFileSystem` (R14) to disambiguate from the
 * consumer-facing opaque brand. The `KernelFileSystem` name is exported
 * only from the kernel-author subpath `@taucad/runtime/kernel`; the
 * consumer barrel reserves `RuntimeFileSystem` for the opaque value.
 *
 * @public
 */
export type KernelFileSystem = RuntimeFileSystemBase & {
  /** Batch-read multiple files as binary. Default: `Promise.all(paths.map(readFile))`. */
  readFiles(paths: string[]): Promise<Record<string, Uint8Array<ArrayBuffer>>>;
  /** Read all file contents in a directory (skips subdirectories). */
  readdirContents(directoryPath: string): Promise<Record<string, Uint8Array<ArrayBuffer>>>;
  /** Get stat information for all entries in a directory. */
  readdirStat(directoryPath: string): Promise<FileStatEntry[]>;
  /** Ensure a directory exists, creating parents as needed. Default: `mkdir(path, { recursive: true })`. */
  ensureDir(path: string): Promise<void>;
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
  /** Filesystem interface (all paths are absolute) */
  filesystem: KernelFileSystem;
  /** Logger with kernel name pre-configured */
  logger: RuntimeLogger;
  /** Read-only view of cached file contents (absolute paths), populated during dependency computation */
  fileContentCache: ReadonlyMap<string, Uint8Array<ArrayBuffer> | string>;
  /** Esbuild bundler for JS/TS kernels. Lazily initialised on first access. */
  bundler: KernelBundler;
  /** Span tracer for kernel-authored performance instrumentation */
  tracer: RuntimeSpanTracer;
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
  /** Absolute path to the active entry */
  entryPath: string;
};

/**
 * File path, parameters, and kernel-specific options for geometry evaluation.
 *
 * When `RenderSchema` is a concrete Zod type (inferred from `render.optionsSchema`),
 * `options` is typed via `z.infer<RenderSchema>`. When no schema is declared
 * (default), `options` is `Record<string, unknown>`. Always required — the
 * framework populates defaults via Zod `safeParse({})`.
 *
 * @template RenderSchema - Zod schema type for render options, inferred from KernelDefinition
 * @public
 */
export type KernelRenderDefinition<
  Schema extends z.ZodType | undefined = z.ZodType | undefined,
  Content extends RuntimeContentDeclaration = RuntimeContentDeclaration,
> = {
  /** Kernel-owned render options. */
  readonly optionsSchema?: Schema;
  /** Framework content properties fulfilled natively by this render route. */
  readonly content: Content;
};

/** One native export format declared by a kernel author. @public */
export type KernelExportFormatDefinition<
  Schema extends z.ZodType = z.ZodType,
  Content extends RuntimeContentDeclaration = RuntimeContentDeclaration,
> = {
  /** Kernel-owned export options for this format. */
  readonly optionsSchema: Schema;
  /** Framework content properties fulfilled natively by this format. */
  readonly content: Content;
};

/** Native export formats keyed by file extension. @public */
export type KernelExportFormats = Record<string, KernelExportFormatDefinition>;

type RenderSchemaOf<Render extends KernelRenderDefinition> = Render['optionsSchema'];
type RenderOptionsOutput<Render extends KernelRenderDefinition> =
  RenderSchemaOf<Render> extends z.ZodType ? z.output<RenderSchemaOf<Render>> : Record<string, unknown>;
type RenderOptionsInput<Render extends KernelRenderDefinition> =
  RenderSchemaOf<Render> extends z.ZodType ? z.input<RenderSchemaOf<Render>> : Record<string, unknown>;

export type CreateGeometryInput<Render extends KernelRenderDefinition = KernelRenderDefinition> = {
  /** Absolute path to the active entry */
  entryPath: string;
  /** User-provided parameters */
  parameters: Record<string, unknown>;
  /** Kernel-specific options (Zod-validated when schema declared, untyped fallback otherwise). */
  options: RenderOptionsOutput<Render>;
} & ContentInputFor<ContentKeysOf<Render['content']>>;

/**
 * File path identifying the active document for dependency resolution.
 * @public
 */
export type GetDependenciesInput = {
  /** Absolute path to the active entry */
  entryPath: string;
};

/**
 * Structured result from dependency resolution, separating successfully
 * resolved files from unresolvable import paths.
 *
 * Unresolved paths are added to the watch set so that creating the missing
 * files later triggers a re-render automatically.
 * @public
 */
export type GetDependenciesResult = {
  /** Absolute paths of files that were successfully resolved and read. */
  resolved: string[];
  /** Absolute paths of imports that could not be resolved — used for watch-set expansion. */
  unresolved: string[];
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
      format: FileExtension;
      /** Export options (untyped fallback). */
      options: Record<string, unknown>;
      /** Framework-owned route content. */
      content?: Record<string, boolean>;
    }
  : {
      [K in Extract<keyof ExportFormats, string>]: {
        format: K;
        /** Per-format export options (Zod-validated, defaults applied by framework). */
        options: z.output<ExportFormats[K]['optionsSchema']>;
      } & ContentInputFor<ContentKeysOf<ExportFormats[K]['content']>>;
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

// =============================================================================
// defineKernel API Types
// =============================================================================

/**
 * Opaque native handle plus optional inline display geometry produced by a kernel evaluation.
 *
 * The native handle is retained in the worker for subsequent mesh/export operations and
 * must carry **all export-facing evidence** (shapes, names, resolved interfaces, datums) —
 * after the mesh/build/export split, `meshGeometry` may never run before an export.
 *
 * `geometry` is the inline display artifact for kernels whose create result is already the
 * display artifact (manifold, tau). Kernels with separately reusable native evidence — BRep
 * kernels and JSCAD's normalized part list — omit it and implement
 * {@link KernelDefinition.meshGeometry}, so exports never pay for discarded display packing.
 *
 * Contract invariant: a kernel must provide a display path — either `createGeometry`
 * returns `geometry`, or the kernel implements `meshGeometry`. The orchestrator rejects
 * display renders when neither exists.
 *
 * @template NativeHandle - Kernel-specific type for the native geometry representation
 * @public
 */
export type CreateGeometryOutput<NativeHandle = unknown> = {
  geometry?: GeometryResponse;
  nativeHandle: NativeHandle;
  issues?: KernelIssue[];
};

/**
 * Native handle plus render options passed to the optional `meshGeometry` phase.
 *
 * Mirrors {@link CreateGeometryInput} option typing: when `RenderSchema` is a concrete
 * Zod type, `options` is `z.infer<RenderSchema>`; otherwise an untyped record.
 *
 * @template NativeHandle - Kernel-specific native geometry representation
 * @template RenderSchema - Zod schema type for render options
 * @public
 */
export type MeshGeometryInput<
  NativeHandle = unknown,
  Render extends KernelRenderDefinition = KernelRenderDefinition,
> = {
  /** Kernel-native geometry handle produced by createGeometry (live or deserialized). */
  nativeHandle: NativeHandle;
  /** Kernel-specific render options (preview tessellation etc.), validated like createGeometry options. */
  options: RenderOptionsOutput<Render>;
} & ContentInputFor<ContentKeysOf<Render['content']>>;

/**
 * Display artifact produced by the `meshGeometry` phase for the live viewer.
 * @public
 */
export type MeshGeometryOutput = {
  geometry: GeometryResponse;
  issues?: KernelIssue[];
};

/** Input passed to a kernel when persisting a durable native-handle snapshot. @public */
export type SerializeNativeHandleInput<NativeHandle = unknown> = {
  nativeHandle: NativeHandle;
};

/** Input passed to a kernel when restoring a durable native-handle snapshot. @public */
export type DeserializeNativeHandleInput<SerializedNativeHandle = unknown> = {
  serializedNativeHandle: SerializedNativeHandle;
};

/** Input passed to a kernel when checking a live native handle before export. @public */
export type ValidateNativeHandleInput<NativeHandle = unknown> = {
  nativeHandle: NativeHandle;
};

type NativeHandleSnapshotHooks<Context, NativeHandle, SerializedNativeHandle> =
  | {
      /** Serialize a durable, export-native geometry handle snapshot. */
      serializeNativeHandle(
        input: SerializeNativeHandleInput<NativeHandle>,
        runtime: KernelRuntime,
        context: Context,
      ): SerializedNativeHandle;
      /** Restore a durable, export-native geometry handle snapshot. */
      deserializeNativeHandle(
        input: DeserializeNativeHandleInput<SerializedNativeHandle>,
        runtime: KernelRuntime,
        context: Context,
      ): NativeHandle;
    }
  | {
      /** Omit both snapshot hooks for live-only native handles. */
      serializeNativeHandle?: never;
      /** Omit both snapshot hooks for live-only native handles. */
      deserializeNativeHandle?: never;
    };

/**
 * Definition for a kernel module loaded via defineKernel().
 * Kernel modules are ES modules dynamically imported by the worker runtime.
 * The API is designed to be simple (no class inheritance, no `this` binding)
 * with all state managed through the typed context returned by initialize().
 *
 * All six type parameters are inferred automatically:
 * - Context from the return type of initialize()
 * - NativeHandle from the nativeHandle field of createGeometry()'s return
 * - SerializedNativeHandle from the return type of serializeNativeHandle() (when the paired snapshot hooks are provided)
 * - Options from optionsSchema (when provided)
 * - ExportFormats from exportFormats (when provided)
 * - Render options from render.optionsSchema (when provided)
 *
 * @template Context - Kernel-specific context type, inferred from initialize() return
 * @template NativeHandle - Kernel-specific native geometry representation, inferred from createGeometry() return
 * @template SerializedNativeHandle - Durable cacheable snapshot of NativeHandle, inferred from serializeNativeHandle() return
 * @template Options - Validated options type, inferred from optionsSchema when provided
 * @template ExportSchemas - Map of format definitions, inferred from exportFormats when provided
 * @template RenderSchema - Zod schema for render options, inferred from render.optionsSchema when provided
 * @public
 */
export type KernelDefinition<
  Context = unknown,
  NativeHandle = unknown,
  SerializedNativeHandle = unknown,
  Options extends Record<string, unknown> = Record<string, unknown>,
  // oxlint-disable-next-line @typescript-eslint/no-empty-object-type -- empty default signals "no formats declared"
  ExportFormats extends KernelExportFormats = {},
  Render extends KernelRenderDefinition = KernelRenderDefinition,
> = {
  /** Human-readable kernel name, used in logs and error messages */
  name: string;
  /** Semantic version string for cache-key computation and diagnostics */
  version: string;

  /** Zod schema for validating and typing kernel options. Options type is inferred from this schema. */
  optionsSchema?: z.ZodType<Options>;

  /** Render options and natively fulfilled framework content. */
  render: Render;

  /** Native export formats, their options, and natively fulfilled framework content. */
  exportFormats: ExportFormats;

  /** Native-handle reuse scope. The cache-safe default is `operation`. */
  nativeHandleScope?: 'source' | 'operation';

  /** Selected implementation assets whose declared digests participate in artifact identity. */
  implementationAssets?: readonly RuntimeImplementationAsset[];

  /** Initialize kernel with typed options. Options type is inferred from optionsSchema. */
  initialize(options: Options, runtime: KernelRuntime): Promise<Context>;

  /** Return resolved and unresolved dependency paths for change-detection, cache invalidation, and watch-set expansion. */
  getDependencies(
    input: GetDependenciesInput,
    runtime: KernelRuntime,
    context: Context,
  ): Promise<GetDependenciesResult>;
  /** Extract user-facing parameters (and their JSON Schema) from the active file. */
  getParameters(input: GetParametersInput, runtime: KernelRuntime, context: Context): Promise<GetParametersResult>;
  /** Evaluate the active file and produce a native handle for mesh/export, plus optional inline display geometry. */
  createGeometry(
    input: CreateGeometryInput<NoInfer<Render>>,
    runtime: KernelRuntime,
    context: Context,
  ): Promise<CreateGeometryOutput<NativeHandle>>;
  /**
   * Produce the display artifact (native → mesh/SVG/stream) for the live viewer.
   *
   * Runs only on the display path, at the kernel boundary (like exportGeometry) — an
   * export-only request never calls it. Implement it when `createGeometry` omits inline
   * `geometry`; kernels whose create result is already display-ready keep returning it inline.
   */
  meshGeometry?(
    input: MeshGeometryInput<NativeHandle, NoInfer<Render>>,
    runtime: KernelRuntime,
    context: Context,
  ): Promise<MeshGeometryOutput>;
  /** Convert a previously created native geometry handle into one or more export file blobs. */
  exportGeometry(
    input: ExportGeometryInput<NativeHandle, NoInfer<ExportFormats>>,
    runtime: KernelRuntime,
    context: Context,
  ): Promise<ExportGeometryResult>;
  /**
   * Check whether a warm live native handle is still export-ready.
   *
   * Kernels with volatile remote/session state can return false to make export
   * re-run createGeometry before calling exportGeometry.
   */
  isNativeHandleValid?(
    input: ValidateNativeHandleInput<NativeHandle>,
    runtime: KernelRuntime,
    context: Context,
  ): boolean | Promise<boolean>;

  /** Tear down kernel resources (WASM instances, temp files, etc.) when the worker is disposed. */
  cleanup?(context: Context): Promise<void>;
} & NativeHandleSnapshotHooks<Context, NativeHandle, SerializedNativeHandle>;

type KernelPluginMetadata<Id extends string> = {
  /** Unique identifier for this kernel. */
  id: Id;
  /** File extensions this kernel handles (e.g. ['scad'], ['ts', 'js']). '*' is a catch-all. */
  extensions: string[];
  /** Regex to match against file content for kernel selection. */
  detectImport?: RegExp;
  /** Bare-specifier module names this kernel provides for bundler-assisted detection. */
  builtinModuleNames?: string[];
};

type KernelDefinitionConfig<
  Id extends string,
  Context,
  NativeHandle,
  SerializedNativeHandle,
  Options extends Record<string, unknown>,
  ExportFormats extends KernelExportFormats,
  Render extends KernelRenderDefinition,
> = KernelPluginMetadata<Id> & {
  /** Human-readable kernel name, used in logs and error messages */
  name: string;
  /** Semantic version string for cache-key computation and diagnostics */
  version: string;
  /** Render options and natively fulfilled framework content. */
  render: Render;
  /** Native export formats and natively fulfilled framework content. */
  exportFormats: ExportFormats;
  /** Native-handle reuse scope. */
  nativeHandleScope?: 'source' | 'operation';
  /** Selected implementation assets. */
  implementationAssets?: readonly RuntimeImplementationAsset[];
  /** Initialize kernel with typed options. Options type is inferred from optionsSchema. */
  initialize(options: Options, runtime: KernelRuntime): Promise<Context>;
  /** Return resolved and unresolved dependency paths for change-detection, cache invalidation, and watch-set expansion. */
  getDependencies(
    input: GetDependenciesInput,
    runtime: KernelRuntime,
    context: Context,
  ): Promise<GetDependenciesResult>;
  /** Extract user-facing parameters (and their JSON Schema) from the active file. */
  getParameters(input: GetParametersInput, runtime: KernelRuntime, context: Context): Promise<GetParametersResult>;
  /** Evaluate the active file and produce a native handle for mesh/export, plus optional inline display geometry. */
  createGeometry(
    input: CreateGeometryInput<Render>,
    runtime: KernelRuntime,
    context: Context,
  ): Promise<CreateGeometryOutput<NativeHandle>>;
  /** Produce the display artifact from a native handle for the live viewer (display path only). */
  meshGeometry?(
    input: MeshGeometryInput<NativeHandle, Render>,
    runtime: KernelRuntime,
    context: Context,
  ): Promise<MeshGeometryOutput>;
  /** Convert a previously created native geometry handle into one or more export file blobs. */
  exportGeometry(
    input: ExportGeometryInput<NativeHandle, ExportFormats>,
    runtime: KernelRuntime,
    context: Context,
  ): Promise<ExportGeometryResult>;
  /**
   * Check whether a warm live native handle is still export-ready.
   *
   * Kernels with volatile remote/session state can return false to make export
   * re-run createGeometry before calling exportGeometry.
   */
  isNativeHandleValid?(
    input: ValidateNativeHandleInput<NativeHandle>,
    runtime: KernelRuntime,
    context: Context,
  ): boolean | Promise<boolean>;
  /** Tear down kernel resources (WASM instances, temp files, etc.) when the worker is disposed. */
  cleanup?(context: Context): Promise<void>;
} & NativeHandleSnapshotHooks<Context, NativeHandle, SerializedNativeHandle>;

/** Resolve render options from a concrete Zod schema, preserving input-side defaults. */
type ResolveKernelRenderOptions<Render extends KernelRenderDefinition> = RenderOptionsInput<Render>;

type InferKernelFormatMap<ExportFormats extends KernelExportFormats> = {
  [K in keyof ExportFormats]: z.input<ExportFormats[K]['optionsSchema']>;
};

type InferKernelExportContentMap<ExportFormats extends KernelExportFormats> = {
  [K in keyof ExportFormats]: ContentKeysOf<ExportFormats[K]['content']>;
};

/**
 * Widened KernelDefinition that accepts any concrete kernel regardless of
 * its specific generic type parameters. Use in test utilities, framework
 * internals, and helper functions that operate on kernels generically.
 * @public
 */
// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Intentional widening for generic kernel acceptance
export type AnyKernelDefinition = KernelDefinition<any, any, any, any, any, any>;

// oxlint-disable @typescript-eslint/no-empty-object-type -- intentional: no export formats means no concrete format map
type ResolveKernelFormatMap<ExportFormats extends KernelExportFormats> = {} extends ExportFormats
  ? {}
  : InferKernelFormatMap<ExportFormats>;
// oxlint-enable @typescript-eslint/no-empty-object-type

export type KernelPluginFactory<
  Id extends string,
  FormatMap extends Record<string, unknown>,
  RenderOptions,
  Options = undefined,
  Definition extends AnyKernelDefinition = AnyKernelDefinition,
  RenderContent extends RuntimeContentKey = RuntimeContentKey,
  ExportContent extends Record<string, RuntimeContentKey> = Record<string, RuntimeContentKey>,
> = Options extends undefined
  ? () => KernelPlugin<FormatMap, RenderOptions, Id, RenderContent, ExportContent> &
      RuntimePluginDefinitionCarrier<Definition>
  : Partial<Options> extends Options
    ? (
        options?: Options,
      ) => KernelPlugin<FormatMap, RenderOptions, Id, RenderContent, ExportContent> &
        RuntimePluginDefinitionCarrier<Definition>
    : (
        options: Options,
      ) => KernelPlugin<FormatMap, RenderOptions, Id, RenderContent, ExportContent> &
        RuntimePluginDefinitionCarrier<Definition>;

/**
 * Define a kernel module with full type inference.
 * All type parameters are inferred automatically -- no explicit type arguments needed:
 * - Context from initialize() return type
 * - NativeHandle from createGeometry() return type (nativeHandle field)
 * - SerializedNativeHandle from serializeNativeHandle() return type (when the paired snapshot hooks are provided)
 * - Options from optionsSchema (when provided)
 * - ExportFormats from exportFormats (when provided)
 * - Render options from render.optionsSchema (when provided)
 *
 * @param definition - The kernel definition object implementing all required lifecycle methods
 * @returns The same definition, typed as {@link KernelDefinition}
 *
 * @public
 *
 * @example <caption>Registering a custom kernel</caption>
 * ```typescript
 * import { defineKernel } from '@taucad/runtime';
 *
 * export const myKernel = defineKernel({
 *   id: 'my-kernel',
 *   extensions: ['myext'],
 *   name: 'MyKernel',
 *   version: '1.0.0',
 *   render: { content: [] },
 *   exportFormats: {},
 *   async initialize(options, runtime) {
 *     return { myContext: true };
 *   },
 *   async getDependencies(input, runtime, context) {
 *     return { resolved: [input.entryPath], unresolved: [] };
 *   },
 *   async getParameters(input, runtime, context) {
 *     return { success: true, data: { defaultParameters: {}, jsonSchema: {} }, issues: [] };
 *   },
 *   async createGeometry(input, runtime, context) {
 *     const bytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);
 *     return { geometry: { format: 'gltf', content: bytes }, nativeHandle: {} };
 *   },
 *   async exportGeometry(input, runtime, context) {
 *     return { success: true, data: [], issues: [] };
 *   },
 * });
 * ```
 */
export function defineKernel<
  const Id extends string,
  Context,
  NativeHandle,
  SerializedNativeHandle = unknown,
  OptionsSchema extends z.ZodType = z.ZodType,
  // oxlint-disable-next-line @typescript-eslint/no-empty-object-type -- empty default signals "no formats declared"
  const ExportFormats extends KernelExportFormats = {},
  const Render extends KernelRenderDefinition = KernelRenderDefinition,
>(
  definition: KernelDefinitionConfig<
    Id,
    Context,
    NativeHandle,
    SerializedNativeHandle,
    z.output<OptionsSchema> & Record<string, unknown>,
    ExportFormats,
    Render
  > & { optionsSchema: OptionsSchema },
): KernelPluginFactory<
  Id,
  ResolveKernelFormatMap<ExportFormats>,
  ResolveKernelRenderOptions<Render>,
  z.input<OptionsSchema>,
  KernelDefinition<
    Context,
    NativeHandle,
    SerializedNativeHandle,
    z.output<OptionsSchema> & Record<string, unknown>,
    ExportFormats,
    Render
  >,
  ContentKeysOf<Render['content']>,
  InferKernelExportContentMap<ExportFormats>
>;
export function defineKernel<
  const Id extends string,
  Context,
  NativeHandle,
  SerializedNativeHandle = unknown,
  // oxlint-disable-next-line @typescript-eslint/no-empty-object-type -- empty default signals "no formats declared"
  const ExportFormats extends KernelExportFormats = {},
  const Render extends KernelRenderDefinition = KernelRenderDefinition,
>(
  definition: KernelDefinitionConfig<
    Id,
    Context,
    NativeHandle,
    SerializedNativeHandle,
    Record<string, unknown>,
    ExportFormats,
    Render
  > & { optionsSchema?: undefined },
): KernelPluginFactory<
  Id,
  ResolveKernelFormatMap<ExportFormats>,
  ResolveKernelRenderOptions<Render>,
  undefined,
  KernelDefinition<Context, NativeHandle, SerializedNativeHandle, Record<string, unknown>, ExportFormats, Render>,
  ContentKeysOf<Render['content']>,
  InferKernelExportContentMap<ExportFormats>
>;
export function defineKernel(
  definition: KernelDefinitionConfig<
    string,
    unknown,
    unknown,
    unknown,
    Record<string, unknown>,
    KernelExportFormats,
    KernelRenderDefinition
  >,
): KernelPluginFactory<string, Record<string, unknown>, unknown, unknown> {
  const { id, extensions, detectImport, builtinModuleNames, ...kernelDefinition } = definition;
  const hasNativeHandleSerializer = typeof kernelDefinition.serializeNativeHandle === 'function';
  const hasNativeHandleDeserializer = typeof kernelDefinition.deserializeNativeHandle === 'function';
  if (hasNativeHandleSerializer !== hasNativeHandleDeserializer) {
    throw new Error('Kernel native-handle snapshots require both serializeNativeHandle and deserializeNativeHandle.');
  }

  const factory = ((options?: unknown) =>
    attachRuntimePluginDefinition(
      {
        id,
        extensions,
        ...(detectImport ? { detectImport } : {}),
        ...(builtinModuleNames ? { builtinModuleNames } : {}),
        options: options as Record<string, unknown>,
      },
      () => kernelDefinition,
    )) as KernelPluginFactory<string, Record<string, unknown>, unknown, unknown>;
  return factory;
}
