/**
 * Kernel Bundler Types
 *
 * Types for the bundler subsystem: esbuild-wasm integration, module resolution,
 * and the defineBundler() plugin API for kernel framework extensibility.
 */

import type { z } from 'zod';
import type { KernelIssue } from '#types/runtime.types.js';
import type { KernelFileSystem, GetDependenciesResult } from '#types/runtime-kernel.types.js';
import type { BundlerPlugin } from '#plugins/plugin-types.js';
import { attachRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';

// =============================================================================
// Bundler Result Types
// =============================================================================

/**
 * Result of bundling a file and its dependencies via esbuild.
 * Used by JS/TS kernels through runtime.bundler.
 * @public
 */
export type BundleResult = {
  /** The bundled code as a string */
  code: string;
  /** Source map (if enabled) */
  sourceMap?: string;
  /** Compilation issues (errors, warnings) */
  issues: KernelIssue[];
  /** Whether bundling succeeded */
  success: boolean;
  /** Paths within the runtime filesystem resolved during bundling, including transitive dependencies. */
  dependencies: string[];
  /** Paths within the runtime filesystem that could not be resolved — used for watch-set expansion. */
  unresolvedPaths: string[];
};

/**
 * Result of executing bundled code via dynamic import.
 * Used by JS/TS kernels through runtime.execute().
 * @public
 */
export type ExecuteResult<T = unknown> =
  | { success: true; value: T; entryUrl?: string }
  | { success: false; issues: KernelIssue[] };

/**
 * A built-in module registered on the bundler for pre-loaded libraries.
 * These modules are served directly from memory without filesystem I/O.
 * @public
 */
export type BuiltinModule = {
  /** Pre-bundled ESM code string */
  code: string;
  /** Package version */
  version: string;
  /** Optional CommonJS global variable name for banner injection */
  globalName?: string;
};

/**
 * Bundler service provided to kernel modules via KernelRuntime.
 * Wraps esbuild-wasm with virtual filesystem integration and CDN module resolution.
 * Created lazily on first access -- non-JS kernels incur zero cost.
 * @public
 */
export type KernelBundler = {
  /** Bundle the runtime entry at `entryPath` and all its transitive dependencies. The normalized path begins with `/`. */
  bundle(entryPath: string): Promise<BundleResult>;
  /**
   * Resolve all transitive dependencies without generating output code.
   * `entryPath` is a normalized path within the runtime filesystem and begins with `/`.
   * Returns both resolved dependencies and unresolved import paths in that filesystem.
   */
  resolveDependencies(entryPath: string): Promise<GetDependenciesResult>;
  /**
   * Register a built-in module that will be served from memory during bundling.
   * Used by JS/TS kernels to register WASM-loaded libraries (replicad, @jscad/modeling).
   * Must be called before the first bundle() call.
   */
  registerModule(name: string, entry: BuiltinModule): void;
};

// =============================================================================
// defineBundler API Types
// =============================================================================

/**
 * Runtime filesystem context for bundler initialization. Runtime `/` is the
 * supplied filesystem root, not the host operating system root.
 * @public
 */
export type BundlerInitOptions = {
  /** Filesystem interface for reading files by runtime path. */
  filesystem: KernelFileSystem;
};

/**
 * Entry path for bundler operations (detectImports, bundle, resolveDependencies).
 * @public
 */
export type BundleInput = {
  /** Path of the entry within the runtime filesystem. The normalized path begins with `/`. */
  entryPath: string;
};

/**
 * Result of detectImports() -- a lightweight pass that discovers which
 * external modules are imported transitively without resolving them.
 * @public
 */
export type DetectImportsResult = {
  /** Bare specifiers imported transitively (e.g., 'replicad', '@jscad/modeling') */
  detectedModules: string[];
  /** Runtime paths discovered during detection (reusable by getDependencies). */
  dependencies: string[];
};

/**
 * Definition for a bundler module loaded via defineBundler().
 * Bundler modules are ES modules dynamically imported by the worker runtime.
 * The bundler owns both bundling AND execution because the execution model
 * is inherently tied to the bundler's output format.
 *
 * Detection (detectImports) and production (bundle) are separate operations:
 * - detectImports: discovers what bare specifiers are used (no modules needed)
 * - bundle: produces runnable code (modules must be registered first)
 *
 * This separation eliminates the chicken-and-egg problem: detection runs
 * without modules registered, then the framework selects and initializes
 * the kernel (which registers real modules), then bundle() produces code.
 *
 * Type parameters are inferred automatically:
 * - Context from initialize() return type
 * - Options from optionsSchema (when provided)
 *
 * @template Context - Bundler-specific context type, inferred from initialize() return
 * @template Options - Validated options type, inferred from optionsSchema when provided
 * @public
 */
export type BundlerDefinition<Context = unknown, Options extends Record<string, unknown> = Record<string, unknown>> = {
  /** Human-readable bundler name, used in logs and error messages */
  name: string;
  /** Semantic version string for cache-key computation and diagnostics */
  version: string;
  /** File extensions this bundler handles (e.g., ['ts', 'js', 'tsx', 'jsx']). */
  extensions: string[];

  /** Zod schema for validating and typing bundler options. Options type is inferred from this schema. */
  optionsSchema?: z.ZodType<Options>;

  /** Initialize the bundler. Receives framework init options plus user-provided options. */
  initialize(initOptions: BundlerInitOptions, options: Options): Promise<Context>;

  /**
   * Detect which bare-specifier modules are imported transitively.
   * Resolves relative imports normally but marks bare specifiers as external.
   * Returns detected modules and project dependencies without producing runnable code.
   * This is the primary mechanism for kernel selection -- no module stubs required.
   */
  detectImports(input: BundleInput, context: Context): Promise<DetectImportsResult>;

  /**
   * Produce runnable code with all registered modules resolved.
   * Called AFTER kernel selection and initialization (modules are registered).
   */
  bundle(input: BundleInput, context: Context): Promise<BundleResult>;

  /** Execute bundled code (tied to this bundler's output format). */
  execute(code: string, context: Context): Promise<ExecuteResult>;

  /** Register a builtin module for resolution during bundle(). */
  registerModule(name: string, builtinModule: BuiltinModule, context: Context): void;

  /**
   * Optional fast-path dependency resolution without full bundling.
   * Falls back to bundle().dependencies when not implemented.
   */
  resolveDependencies?(input: BundleInput, context: Context): Promise<GetDependenciesResult>;

  /** Clean up bundler resources (e.g., esbuild.stop()). */
  cleanup?(context: Context): Promise<void>;
};

type BundlerExtensions<Options> = string[] | ((options: Options | undefined) => string[]);

type BundlerDefinitionConfig<Id extends string, Context, Options extends Record<string, unknown>> = {
  /** Unique identifier for this bundler plugin. */
  id: Id;
  /** Human-readable bundler name, used in logs and error messages */
  name: string;
  /** Semantic version string for cache-key computation and diagnostics */
  version: string;
  /** File extensions handled by this bundler, static or derived from plugin options. */
  extensions: BundlerExtensions<Options>;
  /** Initialize the bundler. Receives framework init options plus user-provided options. */
  initialize(initOptions: BundlerInitOptions, options: Options): Promise<Context>;
  /** Detect which bare-specifier modules are imported transitively. */
  detectImports(input: BundleInput, context: Context): Promise<DetectImportsResult>;
  /** Produce runnable code with all registered modules resolved. */
  bundle(input: BundleInput, context: Context): Promise<BundleResult>;
  /** Execute bundled code (tied to this bundler's output format). */
  execute(code: string, context: Context): Promise<ExecuteResult>;
  /** Register a builtin module for resolution during bundle(). */
  registerModule(name: string, builtinModule: BuiltinModule, context: Context): void;
  /** Optional fast-path dependency resolution without full bundling. */
  resolveDependencies?(input: BundleInput, context: Context): Promise<GetDependenciesResult>;
  /** Clean up bundler resources (e.g., esbuild.stop()). */
  cleanup?(context: Context): Promise<void>;
};

export type BundlerPluginFactory<Id extends string, Options = undefined> = Options extends undefined
  ? () => BundlerPlugin<Id>
  : Partial<Options> extends Options
    ? (options?: Options) => BundlerPlugin<Id>
    : (options: Options) => BundlerPlugin<Id>;

/**
 * Define a bundler module with full type inference.
 * Context is inferred from initialize() return type; Options from optionsSchema.
 *
 * @param definition - The bundler definition object implementing all required lifecycle methods
 * @returns The same definition, typed as {@link BundlerDefinition}
 *
 * @public
 *
 * @example <caption>Custom bundler with import detection</caption>
 * ```typescript
 * import { defineBundler } from '@taucad/runtime/bundler';
 *
 * export const myBundler = defineBundler({
 *   id: 'my-bundler',
 *   name: 'MyBundler',
 *   version: '1.0.0',
 *   extensions: ['ts', 'js'],
 *   async initialize({ filesystem }) {
 *     return { filesystem };
 *   },
 *   async detectImports({ entryPath }, context) {
 *     return { detectedModules: [], dependencies: [entryPath] };
 *   },
 *   async bundle({ entryPath }, context) {
 *     return { code: '', sourceMap: undefined, issues: [], success: true, dependencies: [], unresolvedPaths: [] };
 *   },
 *   async execute(code, context) {
 *     return { success: true, value: undefined };
 *   },
 *   registerModule(name, builtinModule, context) {},
 * });
 * ```
 */
export function defineBundler<const Id extends string, Context, OptionsSchema extends z.ZodType = z.ZodType>(
  definition: BundlerDefinitionConfig<Id, Context, z.output<OptionsSchema> & Record<string, unknown>> & {
    optionsSchema: OptionsSchema;
  },
): BundlerPluginFactory<Id, z.input<OptionsSchema>>;
export function defineBundler<const Id extends string, Context>(
  definition: BundlerDefinitionConfig<Id, Context, Record<string, unknown>> & { optionsSchema?: undefined },
): BundlerPluginFactory<Id>;
export function defineBundler(
  definition: BundlerDefinitionConfig<string, unknown, Record<string, unknown>>,
): BundlerPluginFactory<string, Record<string, unknown>> {
  const { id, extensions, ...bundlerDefinition } = definition;
  const factory = ((options?: Record<string, unknown>) => {
    const resolvedExtensions = typeof extensions === 'function' ? extensions(options) : extensions;
    return attachRuntimePluginDefinition({ id, extensions: resolvedExtensions, options }, () => ({
      ...bundlerDefinition,
      extensions: resolvedExtensions,
    }));
  }) as BundlerPluginFactory<string, Record<string, unknown>>;
  return factory;
}
