/**
 * Plugin registration types returned by consumer-facing factory functions.
 * These are plain objects -- no class instances, no hidden state.
 */

import type { FileExtension } from '@taucad/types';

/** Phantom type brand for carrying per-format export option type information. */
declare const __exportSchemas: unique symbol;

/** Phantom type brand for carrying kernel render option type information. */
declare const __renderSchema: unique symbol;

/** Phantom type brand for carrying the kernel's literal identifier. */
declare const __kernelId: unique symbol;

/**
 * Registration object for a kernel plugin. Returned by factory functions like `replicad()`.
 *
 * The `FormatMap` phantom type parameter carries compile-time type information
 * about the per-format export option schemas. The `RenderOptions` phantom carries
 * the kernel's render option types from its `renderSchema`. The `Id` phantom
 * carries the literal kernel identifier so consumers can derive
 * {@link CollectKernelIds} via {@link createRuntimeClient}'s plugin tuple,
 * keeping {@link RuntimeClient.bestRouteFor} type-safe end-to-end.
 *
 * None of the phantoms are stored at runtime.
 *
 * @template FormatMap - Mapping from format strings to their inferred option types
 * @template RenderOptions - Kernel render option types inferred from renderSchema
 * @template Id - Literal kernel identifier (e.g. `'replicad'`, `'jscad'`)
 * @public
 */
export type KernelPlugin<
  // oxlint-disable-next-line @typescript-eslint/no-empty-object-type -- intentional: matches ResolveFormatMap empty case
  FormatMap extends Record<string, unknown> = {},
  RenderOptions = Record<string, unknown>,
  Id extends string = string,
> = {
  /** Unique identifier for this kernel */
  id: Id;
  /** File extensions this kernel handles (e.g., ['scad'], ['ts', 'js']). '*' is a catch-all. */
  extensions: string[];
  /** Regex to match against file content for kernel selection */
  detectImport?: RegExp;
  /** Bare-specifier module names this kernel provides for bundler-assisted detection */
  builtinModuleNames?: string[];
  /** Kernel-specific options passed to initialize() */
  options?: Record<string, unknown>;
  /**
   * Phantom type brand — carries format-to-options type information at
   * compile time only. Marked `@internal` so doc generators filter it
   * before serialization (the symbol's TS-internal display name
   * contains literal `@` characters that break MDX/JSX parsers).
   *
   * @internal
   */
  readonly [__exportSchemas]?: FormatMap;
  /**
   * Phantom type brand — carries render option type information at
   * compile time only. See `[__exportSchemas]` for `@internal` rationale.
   *
   * @internal
   */
  readonly [__renderSchema]?: RenderOptions;
  /**
   * Phantom type brand — carries the kernel's literal identifier at
   * compile time only. See `[__exportSchemas]` for `@internal` rationale.
   *
   * @internal
   */
  readonly [__kernelId]?: Id;
};

/**
 * Registration object for a middleware plugin. Returned by factory functions like `parameterCache()`.
 * @public
 */
export type MiddlewarePlugin<Id extends string = string> = {
  /** Unique identifier for this middleware */
  id: Id;
  /** Middleware-specific options */
  options?: Record<string, unknown>;
};

/**
 * Registration object for a bundler plugin. Returned by factory functions like `esbuild()`.
 * @public
 */
export type BundlerPlugin<Id extends string = string> = {
  /** Unique identifier for this bundler */
  id: Id;
  /** File extensions this bundler handles */
  extensions: string[];
  /** Bundler-specific options */
  options?: Record<string, unknown>;
};

/** Phantom type brand for carrying transcoder edge option type information. */
declare const __transcodeEdges: unique symbol;

/** Phantom type brand for carrying the transcoder's source format. */
declare const __transcodeFrom: unique symbol;

/** Phantom type brand for carrying the transcoder's literal identifier. */
declare const __transcoderId: unique symbol;

/**
 * Registration object for a transcoder plugin. Returned by factory functions like `converterTranscoder()`.
 *
 * The `EdgeMap` phantom type parameter carries compile-time type information
 * about per-target-format option schemas from statically declared edges.
 * The `From` phantom carries the source format that this transcoder converts from,
 * enabling `MergeExportMap` to merge kernel source-format options into transcoded targets.
 * The `Id` phantom carries the transcoder's literal identifier so consumers can derive
 * {@link KnownTranscoderIds} via the {@link RuntimeClient}'s plugin tuple, keeping
 * {@link CapabilitiesManifest} routes type-safe end-to-end.
 *
 * Runtime edge declarations live on the loaded {@link TranscoderDefinition.edges} array.
 *
 * @template EdgeMap - Mapping from target format strings to their inferred edge option types
 * @template From - Source format string literal that this transcoder converts from
 * @template Id - Literal transcoder identifier (e.g. `'converter'`)
 * @public
 */
export type TranscoderPlugin<
  // oxlint-disable-next-line @typescript-eslint/no-empty-object-type -- default means "no edges declared"
  EdgeMap extends Record<string, unknown> = {},
  From extends string = string,
  Id extends string = string,
> = {
  /** Unique identifier for this transcoder */
  id: Id;
  /** Transcoder-specific options */
  options?: Record<string, unknown>;
  /**
   * Phantom type brand — carries edge option type information at
   * compile time only. Marked `@internal` so doc generators filter it
   * before serialization (the symbol's TS-internal display name
   * contains literal `@` characters that break MDX/JSX parsers).
   *
   * @internal
   */
  readonly [__transcodeEdges]?: EdgeMap;
  /**
   * Phantom type brand — carries source format at compile time only.
   * See `[__transcodeEdges]` for `@internal` rationale.
   *
   * @internal
   */
  readonly [__transcodeFrom]?: From;
  /**
   * Phantom type brand — carries the transcoder's literal identifier
   * at compile time only. See `[__transcodeEdges]` for `@internal`
   * rationale.
   *
   * @internal
   */
  readonly [__transcoderId]?: Id;
};

// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- type projections intentionally accept any plugin generic instantiation
type AnyKernelPlugin = KernelPlugin<any, any, any>;
// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- type projections intentionally accept any plugin generic instantiation
type AnyTranscoderPlugin = TranscoderPlugin<any, any, any>;
// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- conditional inference over arbitrary kernel plugin generics
type KernelFormatMapOf<P> = P extends KernelPlugin<infer FormatMap, any, any> ? FormatMap : never;
// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- conditional inference over arbitrary kernel plugin generics
type KernelRenderOptionsOf<P> = P extends KernelPlugin<any, infer RenderOptions, any> ? RenderOptions : never;
// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- conditional inference over arbitrary kernel plugin generics
type KernelIdOf<P> = P extends KernelPlugin<any, any, infer Id> ? Id : never;
// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- conditional inference over arbitrary transcoder plugin generics
type TranscoderEdgeMapOf<T> = T extends TranscoderPlugin<infer EdgeMap, any, any> ? EdgeMap : never;
// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- conditional inference over arbitrary transcoder plugin generics
type TranscoderFromOf<T> = T extends TranscoderPlugin<any, infer From, any> ? From : never;
// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- conditional inference over arbitrary transcoder plugin generics
type TranscoderIdOf<T> = T extends TranscoderPlugin<any, any, infer Id> ? Id : never;

/**
 * Collects the union of all export format string literals from an array of kernel plugins.
 * Derives formats from the phantom `FormatMap` type parameter. Falls back to `string` when
 * no kernel declares `exportSchemas`.
 *
 * @public
 *
 * @example <caption>Derive a format union from plugins</caption>
 * ```typescript
 * import type { CollectExportFormats, KernelPlugin } from '@taucad/runtime';
 *
 * declare const kernels: readonly [
 *   KernelPlugin<{ stl: unknown; step: unknown; glb: unknown; gltf: unknown }>,
 *   KernelPlugin<{ glb: unknown }>,
 * ];
 * type Formats = CollectExportFormats<typeof kernels>;
 * // 'stl' | 'step' | 'glb' | 'gltf'
 * ```
 */
export type CollectExportFormats<Plugins extends readonly AnyKernelPlugin[]> =
  keyof CollectFormatMap<Plugins> extends never ? FileExtension : FileExtension & keyof CollectFormatMap<Plugins>;

/**
 * Detects the exact `Record<string, never>` shape that Zod 4 infers from
 * `z.input<z.object({})>`. The `[T[string]] extends [never]` tuple wrap blocks
 * distributive conditional behavior so a union value type does not split
 * the test.
 *
 * @public
 */
type IsRecordStringNever<T> = string extends keyof T ? ([T[string]] extends [never] ? true : false) : false;

/**
 * Replaces the annihilator `Record<string, never>` with `never`. Inside a union
 * of contributor types, `never` is absorbed (`T | never ≡ T`), so concrete
 * schemas survive untouched. When every contributor is the placeholder, the
 * union collapses to `never` and `UnionToIntersection<never>` resolves to
 * `unknown` — the natural "no constraints declared" fallback. Every other
 * shape — concrete schemas, `Record<string, unknown>`, `{}`, indexed types —
 * is passed through untouched.
 *
 * @public
 */
type FilterEmpty<T> = IsRecordStringNever<T> extends true ? never : T;

/**
 * Per-plugin contribution for a single format key.
 *
 * Wraps the per-plugin extraction in a dedicated helper so the conditional
 * `P extends KernelPlugin<infer M, any>` operates on a naked type parameter
 * `P` and therefore distributes over union inputs. Without this wrapper the
 * indexed access `Plugins[number]` is not a naked parameter, so the
 * conditional matches the union as a whole and `M` is inferred to a union of
 * value types — defeating `FilterEmpty<T>`.
 *
 * Returns `never` when the plugin does not declare the key, or when its
 * options resolve to the `Record<string, never>` placeholder. `never` is
 * absorbed by the surrounding union and produces a clean intersection at the
 * `UnionToIntersection` step in `CollectFormatMap`.
 *
 * @internal
 */
type ContributorFor<P, K extends string> = K extends keyof KernelFormatMapOf<P>
  ? FilterEmpty<KernelFormatMapOf<P>[K]>
  : never;

/**
 * Collects the unified format-to-options map from an array of kernel plugins.
 *
 * For each format key, intersects the option types contributed by every kernel
 * that declares that format. Empty placeholders that resolve to
 * `Record<string, never>` (typically `z.object({})` in Zod 4) are filtered
 * out via `FilterEmpty<T>` before reaching the union — they would
 * otherwise annihilate concrete contributors at the intersection step. When
 * every contributor is the placeholder, the per-key union collapses to `never`
 * and `UnionToIntersection<never>` falls back to `unknown`.
 *
 * Works uniformly for tuple inputs (e.g. inline plugin arrays passed directly
 * to `createRuntimeClient`) and for general array inputs (e.g.
 * `presets.all().kernels` typed as `(PluginA | PluginB | …)[]`) because the
 * per-plugin filter is dispatched through `ContributorFor`, whose naked type
 * parameter forces the conditional to distribute over the union.
 *
 * @public
 */
export type CollectFormatMap<Plugins extends readonly AnyKernelPlugin[]> = {
  [K in keyof UnionToIntersection<KernelFormatMapOf<Plugins[number]>>]: UnionToIntersection<
    ContributorFor<Plugins[number], K & string>
  >;
};

/**
 * Drops the default `Record<string, unknown>` phantom from a render-options
 * union when it would otherwise swallow more specific contributors. Falls
 * back to `Record<string, unknown>` only when every contributor is the
 * default phantom (handled by `CollectRenderOptions`).
 *
 * @internal
 */
type FilterDefaultRender<T> = T extends Record<string, unknown> ? (Record<string, unknown> extends T ? never : T) : T;

/**
 * Collects the union of all kernel render option types from an array of kernel plugins.
 * Each kernel's `RenderOptions` phantom type is extracted and combined as a union,
 * so consumers can pass any registered kernel's render options.
 *
 * The default `Record<string, unknown>` phantom (kernels without `renderSchema`)
 * is filtered from the union via `FilterDefaultRender<T>` to prevent it from
 * swallowing concrete contributors via index-signature subsumption. When every
 * contributor is the default phantom, the result falls back to
 * `Record<string, unknown>` so no-renderSchema setups still typecheck.
 *
 * @public
 */
export type CollectRenderOptions<Plugins extends readonly AnyKernelPlugin[]> = [
  FilterDefaultRender<KernelRenderOptionsOf<Plugins[number]>>,
] extends [never]
  ? Record<string, unknown>
  : FilterDefaultRender<KernelRenderOptionsOf<Plugins[number]>>;

/**
 * Collects the union of all literal kernel ids declared by an array of kernel
 * plugins. Each `KernelPlugin` carries its identifier as a phantom `Id`
 * generic, so the returned union narrows downstream APIs (notably
 * {@link RuntimeClient.bestRouteFor}'s `kernelId` parameter) to exactly the
 * kernels the consumer registered.
 *
 * Falls back to `string` when the input contains plugins with their `Id`
 * generic erased to the default `string` (e.g. raw `KernelPlugin` references
 * without `as const`).
 *
 * @public
 *
 * @example <caption>Derive a kernel-id union from plugins</caption>
 * ```typescript
 * import type { CollectKernelIds, KernelPlugin } from '@taucad/runtime';
 *
 * declare const kernels: readonly [
 *   KernelPlugin<{}, Record<string, unknown>, 'replicad'>,
 *   KernelPlugin<{}, Record<string, unknown>, 'jscad'>,
 * ];
 * type Ids = CollectKernelIds<typeof kernels>;
 * // 'replicad' | 'jscad'
 * ```
 */
export type CollectKernelIds<Plugins extends readonly AnyKernelPlugin[]> = [
  FilterDefaultKernelId<KernelIdOf<Plugins[number]>>,
] extends [never]
  ? string
  : FilterDefaultKernelId<KernelIdOf<Plugins[number]>>;

/**
 * Collapses the default `string` `Id` generic to `never` so erased plugins do
 * not subsume concrete kernel-id literals at the union step. When every
 * contributor is the default, `CollectKernelIds` falls back to `string`.
 *
 * @internal
 */
type FilterDefaultKernelId<T> = string extends T ? never : T;

/**
 * Collects the unified edge-to-options map from an array of transcoder plugins.
 * Merges all phantom `EdgeMap` types into a single map via intersection then simplification.
 * Returns `{}` for empty tuples to avoid polluting the ExportMap.
 *
 * Note: this returns edge-only options per target format, without merging kernel source-format
 * options. Source-format merging is handled by `MergeExportMap`.
 *
 * @public
 */
export type CollectTranscodeMap<Transcoders extends readonly AnyTranscoderPlugin[]> = Transcoders['length'] extends 0
  ? Record<never, never>
  : CollectTranscodeMapInner<Transcoders>;

type CollectTranscodeMapInner<Transcoders extends readonly AnyTranscoderPlugin[]> = {
  [K in keyof UnionToIntersection<TranscoderEdgeMapOf<Transcoders[number]>>]: UnionToIntersection<
    TranscoderEdgeMapOf<Transcoders[number]>
  >[K];
};

/** Extract the `EdgeMap` phantom from a `TranscoderPlugin`. */
type ExtractEdgeMap<T extends AnyTranscoderPlugin> = TranscoderEdgeMapOf<T>;

/** Extract the `From` phantom from a `TranscoderPlugin`. */
type ExtractFrom<T extends AnyTranscoderPlugin> = TranscoderFromOf<T>;

/**
 * For a single transcoder, compute merged target options.
 * When `From` is a literal that matches a key in `FormatMap`, each target gets
 * `FormatMap[From] & EdgeOptions[Target]`. Source-format options already have
 * natural optionality from `z.input` (`.default()` fields are optional).
 * Otherwise, edge-only options.
 *
 * The compile-time intersection here pairs with `FilterEmpty<T>` upstream in
 * `CollectFormatMap`: empty kernel placeholders are dropped before reaching
 * this layer, so transcoded targets see a usable intersection rather than the
 * `Record<string, never>` annihilator.
 */
type MergedEdgesForTranscoder<FormatMap extends Record<string, unknown>, T extends AnyTranscoderPlugin> = {
  [Target in keyof ExtractEdgeMap<T>]: ExtractFrom<T> extends keyof FormatMap
    ? FormatMap[ExtractFrom<T>] & ExtractEdgeMap<T>[Target]
    : ExtractEdgeMap<T>[Target];
};

/**
 * Union-merge across all transcoders in a tuple, then simplify via intersection.
 * Uses a distributive conditional to handle each union member independently.
 */
type MergedTranscoderEdges<
  FormatMap extends Record<string, unknown>,
  Transcoders extends readonly AnyTranscoderPlugin[],
> = UnionToIntersection<
  Transcoders[number] extends infer T
    ? T extends AnyTranscoderPlugin
      ? MergedEdgesForTranscoder<FormatMap, T>
      : never
    : never
>;

/**
 * Merges kernel-native export map with source-aware transcoder edge options.
 * For transcoded formats, the options are the intersection of the kernel
 * source format options and the transcoder edge options. Empty kernel
 * placeholders have already been filtered upstream by `CollectFormatMap`'s
 * `FilterEmpty<T>` pass, so the intersection is well-formed here.
 * Returns just `FormatMap` for empty transcoder tuples.
 *
 * Note: this compile-time aggregation is per multi-kernel preset, while the
 * runtime `mergeJsonSchemas` in `kernel-worker.ts` runs per-route (one kernel ×
 * one source format × one transcoder edge). They model different layers of
 * the pipeline and are not expected to be byte-identical.
 *
 * @public
 */
export type MergeExportMap<
  FormatMap extends Record<string, unknown>,
  Transcoders extends readonly AnyTranscoderPlugin[],
> = Transcoders['length'] extends 0 ? FormatMap : FormatMap & MergedTranscoderEdges<FormatMap, Transcoders>;

type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never;

// =============================================================================
// On-demand projections from the (Kernels, Transcoders) type bag
// =============================================================================

/**
 * Collapses the default `string` `Id` generic to `never` so erased transcoder
 * plugins do not subsume concrete transcoder-id literals at the union step.
 *
 * @internal
 */
type FilterDefaultTranscoderId<T> = string extends T ? never : T;

/**
 * Collects the union of all literal transcoder ids declared by an array of
 * transcoder plugins. Each `TranscoderPlugin` carries its identifier as a
 * phantom `Id` generic, so the returned union narrows downstream APIs (notably
 * {@link ExportRoute.transcoderId}) to exactly the transcoders the consumer
 * registered.
 *
 * Falls back to `string` when the input contains plugins with their `Id`
 * generic erased to the default `string` (e.g. raw `TranscoderPlugin`
 * references without `as const`).
 *
 * @public
 *
 * @example <caption>Derive a transcoder-id union from plugins</caption>
 * ```typescript
 * import type { KnownTranscoderIds, TranscoderPlugin } from '@taucad/runtime';
 *
 * declare const transcoders: readonly [
 *   TranscoderPlugin<{ usdz: unknown }, 'glb', 'converter'>,
 * ];
 * type Ids = KnownTranscoderIds<typeof transcoders>;
 * // 'converter'
 * ```
 */
export type KnownTranscoderIds<Transcoders extends readonly AnyTranscoderPlugin[]> = [
  FilterDefaultTranscoderId<TranscoderIdOf<Transcoders[number]>>,
] extends [never]
  ? string
  : FilterDefaultTranscoderId<TranscoderIdOf<Transcoders[number]>>;

/**
 * Collects the union of all target formats declared by an array of transcoder
 * plugins. Each transcoder's phantom `EdgeMap` keys are unioned. Falls back
 * to `string` when no transcoder declares any edges.
 *
 * @public
 */
export type CollectTranscoderTargets<Transcoders extends readonly AnyTranscoderPlugin[]> =
  Transcoders['length'] extends 0
    ? never
    : keyof CollectTranscodeMap<Transcoders> extends never
      ? FileExtension
      : FileExtension & keyof CollectTranscodeMap<Transcoders>;

/**
 * Resolves to the union of every target format reachable from the given
 * `Kernels` and `Transcoders` bags — i.e. native kernel export formats plus
 * transcoder edge target formats. Falls back to `string` when both bags are
 * the wide-default form.
 *
 * @public
 */
export type KnownTargetFormats<
  Kernels extends readonly AnyKernelPlugin[],
  Transcoders extends readonly AnyTranscoderPlugin[],
> = CollectExportFormats<Kernels> | CollectTranscoderTargets<Transcoders>;

/**
 * Resolves to the union of every source format the registered kernels can
 * produce natively. Aliases {@link CollectExportFormats} so consumers reading
 * route signatures encounter a name that matches the manifest field
 * (`sourceFormat`).
 *
 * @public
 */
export type KnownSourceFormats<Kernels extends readonly AnyKernelPlugin[]> = CollectExportFormats<Kernels>;

/**
 * Projects the typed-options key union for {@link RuntimeClient.export}. When
 * `Kernels` and `Transcoders` carry concrete schemas, resolves to the literal
 * union of every reachable target format. When both bags are wide-default
 * (`KernelPlugin[]` / `TranscoderPlugin[]`) and yield no inferable formats,
 * falls back to {@link KnownTargetFormats} so the wide-default client still
 * accepts any `FileExtension` on `export`.
 *
 * @internal
 */
export type ExportFormatsFor<
  Kernels extends readonly AnyKernelPlugin[],
  Transcoders extends readonly AnyTranscoderPlugin[],
> = keyof MergeExportMap<CollectFormatMap<Kernels>, Transcoders> & string extends never
  ? KnownTargetFormats<Kernels, Transcoders>
  : keyof MergeExportMap<CollectFormatMap<Kernels>, Transcoders> & string;

/**
 * Projects the per-format options type for {@link RuntimeClient.export}. When
 * `F` is a known key of the merged export map, resolves to the schema-derived
 * options. Otherwise falls back to `Record<string, unknown> | undefined` so the
 * wide-default client still accepts arbitrary options.
 *
 * @internal
 */
export type ExportOptionsFor<
  Kernels extends readonly AnyKernelPlugin[],
  Transcoders extends readonly AnyTranscoderPlugin[],
  F,
> = F extends keyof MergeExportMap<CollectFormatMap<Kernels>, Transcoders>
  ? MergeExportMap<CollectFormatMap<Kernels>, Transcoders>[F]
  : Record<string, unknown> | undefined;

/**
 * Resolves the render-options input type for a specific kernel id within a
 * `Kernels` bag. Used by {@link KernelRenderSchema} to narrow `defaults` per
 * kernel rather than collapsing every kernel's render options into a single
 * union via {@link CollectRenderOptions}.
 *
 * Falls back to `Record<string, unknown>` when the kernel is not found in the
 * bag (e.g. wide-default `KernelPlugin[]`).
 *
 * @public
 */
export type RenderOptionsFor<Kernels extends readonly AnyKernelPlugin[], Kernel extends string> =
  Extract<Kernels[number], KernelPlugin<Record<string, unknown>, unknown, Kernel>> extends KernelPlugin<
    Record<string, unknown>,
    infer R,
    Kernel
  >
    ? R
    : Record<string, unknown>;
