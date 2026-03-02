/**
 * Plugin registration types returned by consumer-facing factory functions.
 * These are plain objects -- no class instances, no hidden state.
 */

/**
 * Registration object for a kernel plugin. Returned by factory functions like `replicad()`.
 *
 * @example
 * ```typescript
 * const plugin: KernelPlugin = replicad({ withBrepEdges: true });
 * ```
 */
export type KernelPlugin = {
  /** Unique identifier for this kernel */
  id: string;
  /** URL of the kernel module (resolved via import.meta.url) */
  moduleUrl: string;
  /** File extensions this kernel handles (e.g., ['scad'], ['ts', 'js']). '*' is a catch-all. */
  extensions: string[];
  /** Regex to match against file content for kernel selection */
  detectImport?: RegExp;
  /** Bare-specifier module names this kernel provides for bundler-assisted detection */
  builtinModuleNames?: string[];
  /** Kernel-specific options passed to initialize() */
  options?: Record<string, unknown>;
};

/**
 * Registration object for a middleware plugin. Returned by factory functions like `parameterCache()`.
 *
 * @example
 * ```typescript
 * const plugin: MiddlewarePlugin = parameterCache();
 * ```
 */
export type MiddlewarePlugin = {
  /** Unique identifier for this middleware */
  id: string;
  /** URL of the middleware module */
  moduleUrl: string;
  /** Middleware-specific options */
  options?: Record<string, unknown>;
};

/**
 * Registration object for a bundler plugin. Returned by factory functions like `esbuild()`.
 *
 * @example
 * ```typescript
 * const plugin: BundlerPlugin = esbuild({ extensions: ['ts', 'tsx'] });
 * ```
 */
export type BundlerPlugin = {
  /** Unique identifier for this bundler */
  id: string;
  /** URL of the bundler module */
  moduleUrl: string;
  /** File extensions this bundler handles */
  extensions: string[];
  /** Bundler-specific options */
  options?: Record<string, unknown>;
};
