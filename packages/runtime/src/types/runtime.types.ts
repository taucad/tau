/**
 * Runtime Types
 *
 * Shared types for runtime operations used across the codebase.
 * Includes error types, result types, and provider types.
 *
 * For worker-specific types (dependencies, runtime, input types, middleware),
 * see runtime-kernel.types.ts.
 */

import type { backendProviders, kernelProviders } from '@taucad/types/constants';
import type { ExportFidelity, ExportFile, Geometry, GeometryResponse } from '@taucad/types';
import type { JSONSchema7 } from '@taucad/json-schema';
import type {
  CollectFormatMap,
  CollectKernelIds,
  KernelPlugin,
  KnownSourceFormats,
  KnownTargetFormats,
  KnownTranscoderIds,
  MergeExportMap,
  RenderOptionsFor,
  TranscoderPlugin,
} from '#plugins/plugin-types.js';
import type { TransportDescriptor } from '#transport/runtime-transport.types.js';
import type { KernelIssueCode } from '#types/kernel-issue-codes.js';

// =============================================================================
// Error Types
// =============================================================================

/**
 * Classification for stack frame origin.
 * - `user` -- the developer's project code. Visible by default. Used for Monaco error markers.
 * - `library` -- third-party CAD libraries the user imported (replicad, @jscad/modeling). Visible by default.
 * - `framework` -- runtime worker infrastructure (Proxy traps, bundler, esbuild). Hidden by default.
 * - `runtime` -- V8/Emscripten/WASM boundary frames, `node:` internals, native code. Hidden by default.
 * @public
 */
export type FrameContext = 'user' | 'library' | 'framework' | 'runtime';

/**
 * Stack frame captured during a kernel error, enriched with source mapping and visibility context for error reporting UI.
 * @public
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
 * Source location for an error (file, line, column range) used for editor markers and navigation.
 * @public
 */
export type ErrorLocation = {
  fileName: string;
  startLineNumber: number;
  startColumn: number;
  endLineNumber?: number;
  endColumn?: number;
};

/**
 * Classification of the origin or cause of a kernel issue for filtering and display.
 * @public
 */
export type KernelIssueType = 'compilation' | 'runtime' | 'kernel' | 'connection' | 'unknown';

/**
 * Severity level for kernel issues, used for prioritization and UI presentation.
 * @public
 */
export type IssueSeverity = 'error' | 'warning' | 'info';

/**
 * Diagnostic produced by a kernel operation — displayed in the editor's
 * problem panel and used for error markers. The `code` discriminator is
 * the canonical classification surface; consumers must never inspect
 * `message` to decide how to handle an issue.
 *
 * @public
 */
export type KernelIssue = {
  message: string;
  /**
   * Typed discriminator used by every consumer — `RuntimeClient`, the UI,
   * telemetry — to classify the issue. Replaces all
   * `issue.message.startsWith(...)` patterns.
   */
  code: KernelIssueCode;
  location?: ErrorLocation;
  stack?: string;
  stackFrames?: KernelStackFrame[];
  details?: unknown;
  type?: KernelIssueType;
  severity: IssueSeverity;
};

// =============================================================================
// Result Types
// =============================================================================

/**
 * Successful kernel operation outcome. Non-fatal warnings are preserved in `issues` alongside the operation data.
 * @public
 */
export type KernelSuccessResult<T> = {
  success: true;
  data: T;
  issues: KernelIssue[];
  serializedNativeHandle?: unknown;
};

/**
 * Failed kernel operation outcome. Inspect `issues` for error messages, source locations, and stack traces.
 * @public
 */
export type KernelErrorResult = {
  success: false;
  issues: KernelIssue[];
};

/**
 * Discriminated union returned by all kernel operations. Branch on `success` to access data or error diagnostics.
 * @public
 */
export type KernelResult<T> = KernelSuccessResult<T> | KernelErrorResult;

// =============================================================================
// Provider Types
// =============================================================================

/**
 * Identifier for a first-party CAD kernel shipped alongside `@taucad/runtime` (replicad, jscad, manifold, zoo, plus the GPL-isolated `@taucad/openscad`).
 * @public
 */
export type KernelProvider = (typeof kernelProviders)[number];
/**
 * Backend provider identifier for geometry export and processing pipelines.
 * @public
 */
export type BackendProvider = (typeof backendProviders)[number];

/**
 * All first-party kernel IDs including internal-only kernels.
 * @public
 */
export type KnownKernelProvider = KernelProvider | 'tau';

/**
 * Kernel provider identifier.
 * Provides intellisense for first-party kernels while accepting arbitrary
 * third-party IDs (e.g. `'manifold'`, `'cadquery'`) without type errors.
 * @public
 */
export type KernelProviderId = KnownKernelProvider | (string & {});

/**
 * A single runtime worker registration.
 * Bundles the kernel module URL and initialization options together.
 * Array position in `KernelModules` determines selection priority.
 * @public
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
 * Ordered array of runtime worker registrations.
 * Position determines selection priority (first match wins).
 * @public
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
 * @public
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
 * @public
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
 * @public
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
 * @public
 */
export type BundlerRegistrations = BundlerRegistration[];

// =============================================================================
// Operation Result Types
// =============================================================================

/**
 * Result type for createGeometry.
 * Used by kernel workers and middleware - geometry doesn't have hash yet.
 * The hash is added by kernel-worker.ts after the middleware chain.
 * @public
 */
export type CreateGeometryResult = KernelResult<GeometryResponse>;

/**
 * Completed result type for createGeometry.
 * Returned to consumers - geometry has hash for React keys and caching.
 * @public
 */
export type HashedGeometryResult = KernelResult<Geometry>;

/**
 * Outcome of extracting customizer parameters from a CAD script, used to render the parameter editor UI.
 * @public
 */
export type GetParametersResult = KernelResult<{
  defaultParameters: Record<string, unknown>;
  jsonSchema: JSONSchema7;
}>;

/**
 * Outcome of inferring a human-readable name from a CAD script, used as the default project title.
 * @public
 */
export type ExtractNameResult = KernelResult<string | undefined>;

/**
 * Outcome of exporting CAD geometry to a downloadable file format (STL, STEP, glTF, etc.).
 * @public
 */
export type ExportGeometryResult = KernelResult<ExportFile[]>;

// =============================================================================
// Capabilities Manifest Types
// =============================================================================

/**
 * A single export route exposed by the worker. Represents either a direct
 * kernel export (when {@link ExportRoute.transcoderId} is `undefined` and
 * `sourceFormat === targetFormat`) or a single-hop transcoder-routed export.
 *
 * Routes are ordered in {@link CapabilitiesManifest.routes} by manifest preference:
 * the framework selects the first matching route for a target format, optionally
 * narrowed by a kernel hint via {@link RuntimeClient.bestRouteFor}.
 *
 * The `Kernels` and `Transcoders` generics flow as a top-level type bag through
 * {@link RuntimeClient}, allowing each leaf field (`targetFormat`, `kernelId`,
 * `sourceFormat`, `transcoderId`, `defaults`) to project narrowly via the
 * `Known*` helper types in `@taucad/runtime`. Wide defaults preserve today's
 * `FileExtension`/`string`/`Record<string, unknown>` shape so the on-wire
 * manifest type emitted by the worker stays unchanged.
 *
 * @template Kernels - Tuple of registered `KernelPlugin`s (carries `FormatMap`/`Id`)
 * @template Transcoders - Tuple of registered `TranscoderPlugin`s (carries `EdgeMap`/`Id`)
 * @template Format - Specific target format (defaults to the union of all known targets)
 * @template Kernel - Specific kernel id (defaults to the union of all known kernel ids)
 * @public
 */
// oxlint-disable @typescript-eslint/no-explicit-any -- variance: bag projection over heterogeneous tuples
export type ExportRoute<
  Kernels extends ReadonlyArray<KernelPlugin<any, any, any>> = KernelPlugin[],
  Transcoders extends ReadonlyArray<TranscoderPlugin<any, any, any>> = TranscoderPlugin[],
  Format extends KnownTargetFormats<Kernels, Transcoders> = KnownTargetFormats<Kernels, Transcoders>,
  Kernel extends CollectKernelIds<Kernels> = CollectKernelIds<Kernels>,
> = {
  targetFormat: Format;
  kernelId: Kernel;
  sourceFormat: KnownSourceFormats<Kernels>;
  transcoderId?: KnownTranscoderIds<Transcoders>;
  fidelity: ExportFidelity;
  schema: JSONSchema7;
  defaults: Format extends keyof MergeExportMap<CollectFormatMap<Kernels>, Transcoders>
    ? MergeExportMap<CollectFormatMap<Kernels>, Transcoders>[Format]
    : Record<string, unknown>;
};
// oxlint-enable @typescript-eslint/no-explicit-any

/**
 * Pre-computed JSON Schema and defaults for a kernel's render options.
 * Indexed by kernel id in {@link CapabilitiesManifest.renderSchemas} for O(1)
 * lookup of the active kernel's render-option form.
 *
 * The `Kernel` generic narrows `defaults` to the specific render options
 * inferred from the registered kernel's `renderSchema` via
 * {@link RenderOptionsFor}.
 *
 * @template Kernels - Tuple of registered `KernelPlugin`s
 * @template Kernel - Specific kernel id (defaults to the union of all known kernel ids)
 * @public
 */
// oxlint-disable @typescript-eslint/no-explicit-any -- variance: bag projection over heterogeneous tuples
export type KernelRenderSchema<
  Kernels extends ReadonlyArray<KernelPlugin<any, any, any>> = KernelPlugin[],
  Kernel extends CollectKernelIds<Kernels> = CollectKernelIds<Kernels>,
> = {
  schema: JSONSchema7;
  defaults: RenderOptionsFor<Kernels, Kernel>;
};
// oxlint-enable @typescript-eslint/no-explicit-any

/**
 * Complete capabilities manifest emitted by the worker during initialization
 * and re-emitted whenever the runtime's resolved capabilities change.
 *
 * Consumers are encouraged to access this manifest only through the helpers
 * exposed on {@link RuntimeClient} (`routesFor`, `bestRouteFor`) so framework
 * tiebreak rules stay encapsulated.
 *
 * The `Kernels` and `Transcoders` generics flow from {@link RuntimeClient} so
 * route fields and per-kernel render schemas narrow to exactly the registered
 * plugins. Wide defaults reproduce the on-wire manifest shape emitted by the
 * worker.
 *
 * @template Kernels - Tuple of registered `KernelPlugin`s
 * @template Transcoders - Tuple of registered `TranscoderPlugin`s
 * @public
 */
// oxlint-disable @typescript-eslint/no-explicit-any -- variance: bag projection over heterogeneous tuples
export type CapabilitiesManifest<
  Kernels extends ReadonlyArray<KernelPlugin<any, any, any>> = KernelPlugin[],
  Transcoders extends ReadonlyArray<TranscoderPlugin<any, any, any>> = TranscoderPlugin[],
> = {
  routes: ReadonlyArray<ExportRoute<Kernels, Transcoders>>;
  // Inline the per-kernel schema shape (rather than referencing
  // `KernelRenderSchema<Kernels, K>`) so the mapped-type expansion does not
  // bind the named generic invariantly. This preserves narrow → wide
  // assignability at the structural level: every narrow
  // `{ <id>?: { schema; defaults } }` collapses cleanly into the wide
  // index signature `{ [x: string]?: { schema; defaults } }`.
  renderSchemas: {
    [K in CollectKernelIds<Kernels>]?: {
      schema: JSONSchema7;
      defaults: RenderOptionsFor<Kernels, K>;
    };
  };
};
// oxlint-enable @typescript-eslint/no-explicit-any

/**
 * Transport-side capabilities surfaced under
 * {@link RuntimeCapabilities.transport}. Carries the diagnostic descriptor
 * the transport publishes through `client.describe()`. Diagnostic overlays
 * read this without branching on transport identity.
 *
 * @public
 */
export type TransportCapabilities = {
  readonly descriptor: TransportDescriptor;
};

/**
 * The single rolled-up capabilities surface exposed at
 * {@link RuntimeClient.capabilities}. Layers kernel-derived information
 * (every field of {@link CapabilitiesManifest}) under the same object as
 * transport-derived information (`autonomousRenderLoop`, `transport.*`)
 * so consumers reach for one property instead of branching between
 * `capabilities` and a separate `transportCapabilities`.
 *
 * - `autonomousRenderLoop` reflects whether the active transport drives
 *   its own render loop. `false` on no-worker hostings (browser main
 *   thread, edge worker) where consumers must call `client.render(...)`
 *   explicitly; `true` for in-process and worker transports.
 * - `transport.descriptor` is diagnostic only — `RuntimeClient` does not
 *   branch on transport identity.
 *
 * Both `Kernels` and `Transcoders` flow through from
 * {@link CapabilitiesManifest} so route narrowing carries over to the
 * rolled-up surface.
 *
 * @template Kernels - Tuple of registered `KernelPlugin`s
 * @template Transcoders - Tuple of registered `TranscoderPlugin`s
 * @public
 */
// oxlint-disable @typescript-eslint/no-explicit-any -- variance: bag projection over heterogeneous tuples
export type RuntimeCapabilities<
  Kernels extends ReadonlyArray<KernelPlugin<any, any, any>> = KernelPlugin[],
  Transcoders extends ReadonlyArray<TranscoderPlugin<any, any, any>> = TranscoderPlugin[],
> = CapabilitiesManifest<Kernels, Transcoders> & {
  readonly autonomousRenderLoop: boolean;
  readonly transport: TransportCapabilities;
};
// oxlint-enable @typescript-eslint/no-explicit-any
