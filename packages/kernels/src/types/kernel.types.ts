/**
 * Kernel Types
 *
 * Shared types for kernel operations used across the codebase.
 * Includes error types, result types, and provider types.
 *
 * For worker-specific types (dependencies, runtime, input types, middleware),
 * see kernel-worker.types.ts.
 */

import type { backendProviders, kernelProviders } from '@taucad/types/constants';
import type { ExportFile, Geometry, GeometryResponse } from '@taucad/types';

// =============================================================================
// Error Types
// =============================================================================

/**
 * Classification for stack frame origin.
 * - `user` -- the developer's project code. Visible by default. Used for Monaco error markers.
 * - `library` -- third-party CAD libraries the user imported (replicad, @jscad/modeling). Visible by default.
 * - `framework` -- kernel worker infrastructure (Proxy traps, bundler, esbuild). Hidden by default.
 * - `runtime` -- V8/Emscripten/WASM boundary frames, `node:` internals, native code. Hidden by default.
 */
export type FrameContext = 'user' | 'library' | 'framework' | 'runtime';

/**
 *
 */
export type KernelStackFrame = {
  fileName?: string;
  functionName?: string;
  lineNumber?: number;
  columnNumber?: number;
  source?: string;
  /** Classification of the frame's origin for visibility and error location purposes */
  context?: FrameContext;
};

/**
 *
 */
export type ErrorLocation = {
  fileName: string;
  startLineNumber: number;
  startColumn: number;
  endLineNumber?: number;
  endColumn?: number;
};

/**
 *
 */
export type KernelIssueType = 'compilation' | 'runtime' | 'kernel' | 'connection' | 'unknown';

/**
 *
 */
export type IssueSeverity = 'error' | 'warning' | 'info';

/**
 *
 */
export type KernelIssue = {
  message: string;
  location?: ErrorLocation;
  stack?: string;
  stackFrames?: KernelStackFrame[];
  type?: KernelIssueType;
  severity: IssueSeverity;
};

// =============================================================================
// Result Types
// =============================================================================

/**
 *
 */
export type KernelSuccessResult<T> = {
  success: true;
  data: T;
  issues: KernelIssue[];
};

/**
 *
 */
export type KernelErrorResult = {
  success: false;
  issues: KernelIssue[];
};

/**
 *
 */
export type KernelResult<T> = KernelSuccessResult<T> | KernelErrorResult;

// =============================================================================
// Provider Types
// =============================================================================

/**
 *
 */
export type KernelProvider = (typeof kernelProviders)[number];
/**
 *
 */
export type BackendProvider = (typeof backendProviders)[number];

/** All first-party kernel IDs including internal-only kernels. */
export type KnownKernelProvider = KernelProvider | 'tau';

/**
 * Kernel provider identifier.
 * Provides intellisense for first-party kernels while accepting arbitrary
 * third-party IDs (e.g. `'manifold'`, `'cadquery'`) without type errors.
 */
export type KernelProviderId = KnownKernelProvider | (string & {});

/**
 * A single kernel worker registration.
 * Bundles the kernel module URL and initialization options together.
 * Array position in `KernelModules` determines `canHandle` priority.
 */
export type KernelRegistration = {
  id: KernelProviderId;
  options?: Record<string, unknown>;
  /** File extensions this kernel handles (e.g. ['scad'], ['ts', 'js']). '*' is a catch-all. */
  extensions?: string[];
  /** For JS/TS kernels: regex to match against file content to determine if this kernel handles it. */
  detectImport?: RegExp;
  /**
   * Bare-specifier module names this kernel provides (e.g. ['replicad'], ['@jscad/modeling']).
   * Used by the framework for bundle-based transitive detection: the bundler's detectImports()
   * reports which modules are imported, and the framework matches them against these names
   * to select the correct kernel.
   */
  builtinModuleNames?: string[];
  /**
   * URL of the defineKernel module for this kernel (e.g. replicad.kernel.js).
   * The runtime worker dynamically imports this module to load the kernel.
   */
  kernelModuleUrl: string;
};

/**
 * Ordered array of kernel worker registrations.
 * Position determines `canHandle` priority (first match wins).
 *
 * @example First-party defaults
 * ```ts
 * const modules: KernelModules = [
 *   { id: 'openscad', extensions: ['scad'], kernelModuleUrl: openscadKernelModuleUrl },
 *   { id: 'replicad', extensions: ['ts', 'js'], kernelModuleUrl: replicadKernelModuleUrl, options: { withBrepEdges: true } },
 * ];
 * ```
 *
 * @example Adding a third-party kernel
 * ```ts
 * const modules: KernelModules = [
 *   ...defaultKernelModules,
 *   { id: 'manifold', extensions: ['*'], kernelModuleUrl: manifoldKernelModuleUrl },
 * ];
 * ```
 */
export type KernelModules = KernelRegistration[];

// =============================================================================
// Middleware Options Types
// =============================================================================

/**
 * A single middleware registration.
 * The worker dynamically imports the module at `url` and resolves it
 * as a KernelMiddleware. Options are validated against the middleware's
 * optionsSchema, with the schema providing defaults for missing fields.
 *
 * @example
 * ```ts
 * { url: edgeDetectionUrl, options: { thresholdDegrees: 45 } }
 * ```
 */
export type MiddlewareRegistration = {
  /** URL of the middleware module (obtained via `?url` import at build time) */
  url: string;
  /** Whether this middleware is active. Defaults to `true`. */
  enabled?: boolean;
  /** Options validated against the middleware's optionsSchema */
  options?: Record<string, unknown>;
};

/**
 * Ordered array of middleware registrations.
 * Position determines onion-model wrapping order (first = outermost).
 *
 * @example
 * ```ts
 * const middleware: MiddlewareRegistrations = [
 *   { url: parameterCacheUrl },
 *   { url: geometryCacheUrl },
 *   { url: edgeDetectionUrl, options: { thresholdDegrees: 45 } },
 * ];
 * ```
 */
export type MiddlewareRegistrations = MiddlewareRegistration[];

// =============================================================================
// Bundler Options Types
// =============================================================================

/**
 * A single bundler registration.
 * The worker dynamically imports the module at `bundlerModuleUrl` and resolves it
 * as a BundlerDefinition. The `extensions` field declares which file types this
 * bundler handles; the framework routes detectImports/bundle calls accordingly.
 *
 * @example
 * ```ts
 * { bundlerModuleUrl: esbuildBundlerUrl, extensions: ['ts', 'js', 'tsx', 'jsx'] }
 * ```
 */
export type BundlerRegistration = {
  /** URL of the bundler module (obtained via `?url` import at build time) */
  bundlerModuleUrl: string;
  /** File extensions this bundler handles */
  extensions: string[];
  /** Bundler-specific options passed to initialize() */
  options?: Record<string, unknown>;
};

/**
 * Array of bundler registrations.
 * The framework selects the appropriate bundler by matching file extension.
 *
 * @example
 * ```ts
 * const bundlers: BundlerRegistrations = [
 *   { bundlerModuleUrl: esbuildBundlerUrl, extensions: ['ts', 'js', 'tsx', 'jsx'] },
 * ];
 * ```
 */
export type BundlerRegistrations = BundlerRegistration[];

// =============================================================================
// Operation Result Types
// =============================================================================

/**
 * Result type for createGeometry.
 * Used by kernel workers and middleware - geometries don't have hash yet.
 * The hash is added by kernel-worker.ts after the middleware chain.
 */
export type CreateGeometryResult = KernelResult<GeometryResponse[]>;

/**
 * Completed result type for createGeometry.
 * Returned to consumers - geometries have hash for React keys and caching.
 */
export type HashedGeometryResult = KernelResult<Geometry[]>;

/**
 *
 */
export type GetParametersResult = KernelResult<{
  defaultParameters: Record<string, unknown>;
  jsonSchema: unknown;
}>;

/**
 *
 */
export type ExtractNameResult = KernelResult<string | undefined>;

/**
 *
 */
export type ExportGeometryResult = KernelResult<ExportFile[]>;
