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

/**
 * File and project path identifying the active document for parameter extraction.
 * @public
 */
export type GetParametersInput = {
  /** Absolute path to the active file */
  filePath: string;
  /** Absolute path to the project root directory */
  basePath: string;
};

/**
 * File path, parameters, and kernel-specific options for geometry evaluation.
 *
 * When `RenderSchema` is a concrete Zod type (inferred from `renderSchema`),
 * `options` is typed via `z.infer<RenderSchema>`. When no schema is declared
 * (default), `options` is `Record<string, unknown>`. Always required — the
 * framework populates defaults via Zod `safeParse({})`.
 *
 * @template RenderSchema - Zod schema type for render options, inferred from KernelDefinition
 * @public
 */
export type CreateGeometryInput<RenderSchema extends z.ZodType = z.ZodType> = {
  /** Absolute path to the active file */
  filePath: string;
  /** Absolute path to the project root directory */
  basePath: string;
  /** User-provided parameters */
  parameters: Record<string, unknown>;
  /** Kernel-specific options (Zod-validated when schema declared, untyped fallback otherwise). */
  options: z.ZodType extends RenderSchema ? Record<string, unknown> : z.infer<RenderSchema>;
};

/**
 * File and project path identifying the active document for dependency resolution.
 * @public
 */
export type GetDependenciesInput = {
  /** Absolute path to the active file */
  filePath: string;
  /** Absolute path to the project root directory */
  basePath: string;
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
  ExportSchemas extends Record<string, z.ZodType> = {},
> = [keyof ExportSchemas] extends [never]
  ? {
      format: FileExtension;
      /** Export options (untyped fallback). */
      options: Record<string, unknown>;
    }
  : {
      [K in Extract<keyof ExportSchemas, string>]: {
        format: K;
        /** Per-format export options (Zod-validated, defaults applied by framework). */
        options: z.infer<ExportSchemas[K]>;
      };
    }[Extract<keyof ExportSchemas, string>];

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
  // oxlint-disable-next-line @typescript-eslint/no-empty-object-type -- empty default signals "no schemas declared"
  ExportSchemas extends Record<string, z.ZodType> = {},
> = ExportGeometryRequest<ExportSchemas> & {
  nativeHandle: NativeHandle;
};

/**
 * Backwards-compatible alias for kernel export implementations.
 *
 * Middleware authors should use {@link ExportGeometryRequest}; kernel authors
 * continue to receive the native-handle-bearing input.
 *
 * @template NativeHandle - Kernel-specific native geometry representation, injected by the framework
 * @template ExportSchemas - Map of format string to Zod schema for per-format option typing
 * @public
 */
export type ExportGeometryInput<
  NativeHandle = unknown,
  // oxlint-disable-next-line @typescript-eslint/no-empty-object-type -- empty default signals "no schemas declared"
  ExportSchemas extends Record<string, z.ZodType> = {},
> = KernelExportGeometryInput<NativeHandle, ExportSchemas>;

// =============================================================================
// defineKernel API Types
// =============================================================================

/**
 * Tessellated geometry and opaque native handle produced by a kernel evaluation.
 * The singular geometry is transferred to the main thread for rendering, while
 * the native handle is retained in the worker for subsequent export operations.
 *
 * @template NativeHandle - Kernel-specific type for the native geometry representation
 * @public
 */
export type CreateGeometryOutput<NativeHandle = unknown> = {
  geometry: GeometryResponse;
  nativeHandle: NativeHandle;
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
 * - ExportSchemas from exportSchemas (when provided)
 * - RenderSchema from renderSchema (when provided)
 *
 * @template Context - Kernel-specific context type, inferred from initialize() return
 * @template NativeHandle - Kernel-specific native geometry representation, inferred from createGeometry() return
 * @template SerializedNativeHandle - Durable cacheable snapshot of NativeHandle, inferred from serializeNativeHandle() return
 * @template Options - Validated options type, inferred from optionsSchema when provided
 * @template ExportSchemas - Map of format to Zod schema, inferred from exportSchemas when provided
 * @template RenderSchema - Zod schema for render options, inferred from renderSchema when provided
 * @public
 */
export type KernelDefinition<
  Context = unknown,
  NativeHandle = unknown,
  SerializedNativeHandle = unknown,
  Options extends Record<string, unknown> = Record<string, unknown>,
  // oxlint-disable-next-line @typescript-eslint/no-empty-object-type -- empty default signals "no schemas declared"
  ExportSchemas extends Record<string, z.ZodType> = {},
  RenderSchema extends z.ZodType = z.ZodType,
> = {
  /** Human-readable kernel name, used in logs and error messages */
  name: string;
  /** Semantic version string for cache-key computation and diagnostics */
  version: string;

  /** Zod schema for validating and typing kernel options. Options type is inferred from this schema. */
  optionsSchema?: z.ZodType<Options>;

  /** Zod schema for kernel-specific render options. Type is inferred and threaded to createGeometry input. */
  renderSchema?: RenderSchema;

  /** Zod schemas for per-format export options. Keys define supported formats; provides type-safe narrowing in exportGeometry. */
  exportSchemas?: ExportSchemas;

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
  /** Evaluate the active file and produce tessellated geometry plus a native handle for export. */
  createGeometry(
    input: CreateGeometryInput<RenderSchema>,
    runtime: KernelRuntime,
    context: Context,
  ): Promise<CreateGeometryOutput<NativeHandle>>;
  /** Convert a previously created native geometry handle into one or more export file blobs. */
  exportGeometry(
    input: ExportGeometryInput<NativeHandle, ExportSchemas>,
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
  ExportSchemas extends Record<string, z.ZodType>,
  RenderSchema extends z.ZodType,
> = KernelPluginMetadata<Id> & {
  /** Human-readable kernel name, used in logs and error messages */
  name: string;
  /** Semantic version string for cache-key computation and diagnostics */
  version: string;
  /** Zod schema for kernel-specific render options. Type is inferred and threaded to createGeometry input. */
  renderSchema?: RenderSchema;
  /** Zod schemas for per-format export options. Keys define supported formats; provides type-safe narrowing in exportGeometry. */
  exportSchemas?: ExportSchemas;
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
  /** Evaluate the active file and produce tessellated geometry plus a native handle for export. */
  createGeometry(
    input: CreateGeometryInput<RenderSchema>,
    runtime: KernelRuntime,
    context: Context,
  ): Promise<CreateGeometryOutput<NativeHandle>>;
  /** Convert a previously created native geometry handle into one or more export file blobs. */
  exportGeometry(
    input: ExportGeometryInput<NativeHandle, ExportSchemas>,
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
type ResolveKernelRenderOptions<RenderSchema extends z.ZodType> = z.ZodType extends RenderSchema
  ? Record<string, unknown>
  : z.input<RenderSchema>;

type InferKernelFormatMap<ExportSchemas extends Record<string, z.ZodType>> = {
  [K in keyof ExportSchemas]: z.input<ExportSchemas[K]>;
};

/**
 * Widened KernelDefinition that accepts any concrete kernel regardless of
 * its specific generic type parameters. Use in test utilities, framework
 * internals, and helper functions that operate on kernels generically.
 * @public
 */
// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Intentional widening for generic kernel acceptance
export type AnyKernelDefinition = KernelDefinition<any, any, any, any, any, any>;

// oxlint-disable @typescript-eslint/no-empty-object-type -- intentional: no exportSchemas means no concrete format map
type ResolveKernelFormatMap<ExportSchemas extends Record<string, z.ZodType>> = {} extends ExportSchemas
  ? {}
  : InferKernelFormatMap<ExportSchemas>;
// oxlint-enable @typescript-eslint/no-empty-object-type

export type KernelPluginFactory<
  Id extends string,
  FormatMap extends Record<string, unknown>,
  RenderOptions,
  Options = undefined,
  Definition extends AnyKernelDefinition = AnyKernelDefinition,
> = Options extends undefined
  ? () => KernelPlugin<FormatMap, RenderOptions, Id> & RuntimePluginDefinitionCarrier<Definition>
  : Partial<Options> extends Options
    ? (options?: Options) => KernelPlugin<FormatMap, RenderOptions, Id> & RuntimePluginDefinitionCarrier<Definition>
    : (options: Options) => KernelPlugin<FormatMap, RenderOptions, Id> & RuntimePluginDefinitionCarrier<Definition>;

/**
 * Define a kernel module with full type inference.
 * All type parameters are inferred automatically -- no explicit type arguments needed:
 * - Context from initialize() return type
 * - NativeHandle from createGeometry() return type (nativeHandle field)
 * - SerializedNativeHandle from serializeNativeHandle() return type (when the paired snapshot hooks are provided)
 * - Options from optionsSchema (when provided)
 * - ExportSchemas from exportSchemas (when provided)
 * - RenderSchema from renderSchema (when provided)
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
 *   async initialize(options, runtime) {
 *     return { myContext: true };
 *   },
 *   async getDependencies(input, runtime, context) {
 *     return { resolved: [input.filePath], unresolved: [] };
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
  // oxlint-disable-next-line @typescript-eslint/no-empty-object-type -- empty default signals "no schemas declared"
  ExportSchemas extends Record<string, z.ZodType> = {},
  RenderSchema extends z.ZodType = z.ZodType,
>(
  definition: KernelDefinitionConfig<
    Id,
    Context,
    NativeHandle,
    SerializedNativeHandle,
    z.output<OptionsSchema> & Record<string, unknown>,
    ExportSchemas,
    RenderSchema
  > & { optionsSchema: OptionsSchema },
): KernelPluginFactory<
  Id,
  ResolveKernelFormatMap<ExportSchemas>,
  ResolveKernelRenderOptions<RenderSchema>,
  z.input<OptionsSchema>,
  KernelDefinition<
    Context,
    NativeHandle,
    SerializedNativeHandle,
    z.output<OptionsSchema> & Record<string, unknown>,
    ExportSchemas,
    RenderSchema
  >
>;
export function defineKernel<
  const Id extends string,
  Context,
  NativeHandle,
  SerializedNativeHandle = unknown,
  // oxlint-disable-next-line @typescript-eslint/no-empty-object-type -- empty default signals "no schemas declared"
  ExportSchemas extends Record<string, z.ZodType> = {},
  RenderSchema extends z.ZodType = z.ZodType,
>(
  definition: KernelDefinitionConfig<
    Id,
    Context,
    NativeHandle,
    SerializedNativeHandle,
    Record<string, unknown>,
    ExportSchemas,
    RenderSchema
  > & { optionsSchema?: undefined },
): KernelPluginFactory<
  Id,
  ResolveKernelFormatMap<ExportSchemas>,
  ResolveKernelRenderOptions<RenderSchema>,
  undefined,
  KernelDefinition<Context, NativeHandle, SerializedNativeHandle, Record<string, unknown>, ExportSchemas, RenderSchema>
>;
export function defineKernel(
  definition: KernelDefinitionConfig<
    string,
    unknown,
    unknown,
    unknown,
    Record<string, unknown>,
    Record<string, z.ZodType>,
    z.ZodType
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
