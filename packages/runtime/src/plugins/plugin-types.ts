/**
 * Plugin registration types returned by consumer-facing factory functions.
 * These are plain objects -- no class instances, no hidden state.
 */

import type { FileExtension } from '@taucad/types';
import type { RuntimeContentKey } from '#types/runtime-content.types.js';

/** Capability discriminants used by the runtime manifest. @public */
export const runtimeCapabilityKinds = ['kernel', 'middleware', 'bundler', 'transcoder'] as const;

/** Capability discriminant used by runtime registrations. @public */
export type RuntimePluginKind = (typeof runtimeCapabilityKinds)[number];

declare const __exportFormats: unique symbol;
declare const __renderOptions: unique symbol;
declare const __kernelId: unique symbol;
declare const __renderContent: unique symbol;
declare const __exportContent: unique symbol;
declare const __middlewareRenderContent: unique symbol;
declare const __middlewareExportContent: unique symbol;
declare const __transcodeEdges: unique symbol;
declare const __transcodeFrom: unique symbol;
declare const __transcoderId: unique symbol;
declare const __transcodeContent: unique symbol;
declare const __transcodePinnedSourceOptions: unique symbol;

/**
 * Permissions declared by a runtime plugin for store and host review.
 * This metadata is declarative only; the runtime does not enforce it.
 * @public
 */
export type RuntimePluginPermissions = {
  readonly network?: readonly string[];
  readonly filesystemWrite?: boolean;
};

/** Shared declaration metadata carried by every runtime plugin registration. @public */
export type RuntimePluginDeclaration = {
  /** Declarative review metadata; runtime execution does not enforce these permissions. */
  readonly permissions?: RuntimePluginPermissions;
};

/**
 * Registration object for a kernel plugin. Returned by the package-named alias such as `replicad` from
 * `@taucad/replicad`, bound to the canonical `plugin` export.
 *
 * The `FormatMap` phantom type parameter carries compile-time type information
 * about the per-format export option schemas. The `RenderOptions` phantom carries
 * the kernel's render option types from its `render.optionsSchema`. The `Id` phantom
 * carries the literal kernel identifier so consumers can derive
 * {@link CollectKernelIds} via {@link createRuntimeClient}'s plugin tuple,
 * keeping {@link RuntimeClient.bestRouteFor} type-safe end-to-end.
 *
 * None of the phantoms are stored at runtime.
 *
 * @template FormatMap - Mapping from format strings to their inferred option types
 * @template RenderOptions - Kernel render option types inferred from render.optionsSchema
 * @template Id - Literal kernel identifier (e.g. `'replicad'`, `'jscad'`)
 * @template Extensions - Literal source-extension tuple declared by the kernel
 * @public
 */
export type KernelPlugin<
  // oxlint-disable-next-line @typescript-eslint/no-empty-object-type -- intentional: matches ResolveFormatMap empty case
  FormatMap extends Record<string, unknown> = {},
  RenderOptions = Record<string, unknown>,
  Id extends string = string,
  RenderContent extends RuntimeContentKey = RuntimeContentKey,
  ExportContent extends Record<string, RuntimeContentKey> = Record<string, RuntimeContentKey>,
  Extensions extends readonly string[] = readonly string[],
> = RuntimePluginDeclaration & {
  /** Unique identifier for this kernel */
  id: Id;
  /** File extensions this kernel handles (e.g., ['scad'], ['ts', 'js']). '*' is a catch-all. */
  extensions: Extensions;
  /** Export formats declared by the kernel definition. */
  exportFormats?: readonly string[];
  /** Regex to match against file content for kernel selection */
  detectImport?: RegExp;
  /** Bare-specifier module names this kernel provides for bundler-assisted detection */
  builtinModuleNames?: string[];
  /** Kernel-specific options passed to initialize() */
  options?: Record<string, unknown>;
  /**
   * Phantom type brand — carries format-to-options type information at
   * compile time only. Marked `@internal` so doc generators filter it
   * before serialization.
   *
   * @internal
   */
  readonly [__exportFormats]?: FormatMap;
  /**
   * Phantom type brand — carries render option type information at
   * compile time only. See `[__exportFormats]` for `@internal` rationale.
   *
   * @internal
   */
  readonly [__renderOptions]?: RenderOptions;
  /**
   * Phantom type brand — carries the kernel's literal identifier at
   * compile time only. See `[__exportFormats]` for `@internal` rationale.
   *
   * @internal
   */
  readonly [__kernelId]?: Id;
  /** @internal */
  readonly [__renderContent]?: { readonly keys: RenderContent };
  /** @internal */
  readonly [__exportContent]?: ExportContent;
};

/**
 * Registration object for a middleware plugin. Returned by factory functions like `parameterCache()`.
 * @public
 */
export type MiddlewarePlugin<
  Id extends string = string,
  RenderContent extends RuntimeContentKey = RuntimeContentKey,
  ExportContent extends Record<string, RuntimeContentKey> = Record<string, RuntimeContentKey>,
> = RuntimePluginDeclaration & {
  /** Unique identifier for this middleware */
  id: Id;
  /** Middleware-specific options */
  options?: Record<string, unknown>;
  /** @internal */
  readonly [__middlewareRenderContent]?: { readonly keys: RenderContent };
  /** @internal */
  readonly [__middlewareExportContent]?: ExportContent;
};

/**
 * Registration object for a bundler plugin. Returned by the package-named alias such as `esbuild` from
 * `@taucad/esbuild`, bound to the canonical `plugin` export.
 * @public
 */
export type BundlerPlugin<Id extends string = string> = RuntimePluginDeclaration & {
  /** Unique identifier for this bundler */
  id: Id;
  /** File extensions this bundler handles */
  extensions: readonly string[];
  /** Bundler-specific options */
  options?: Record<string, unknown>;
};

/**
 * Registration object for a transcoder plugin. Returned by `defineTranscoder(...)` factories.
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
  EdgeContent extends Record<string, RuntimeContentKey> = Record<string, RuntimeContentKey>,
  PinnedSourceOptions extends Record<string, PropertyKey> = Record<string, PropertyKey>,
> = RuntimePluginDeclaration & {
  /** Unique identifier for this transcoder */
  id: Id;
  /** Single-hop format edges declared by the transcoder definition. */
  edges?: ReadonlyArray<{ readonly from: string; readonly to: string }>;
  /** Transcoder-specific options */
  options?: Record<string, unknown>;
  /**
   * Phantom type brand — carries edge option type information at
   * compile time only. Marked `@internal` so doc generators filter it
   * before serialization.
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
  /** @internal */
  readonly [__transcodeContent]?: EdgeContent;
  /** @internal */
  readonly [__transcodePinnedSourceOptions]?: PinnedSourceOptions;
};

// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- type projections intentionally accept any plugin generic instantiation
type AnyKernelPlugin = KernelPlugin<any, any, any, any, any, any>;
// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- type projections intentionally accept any plugin generic instantiation
type AnyTranscoderPlugin = TranscoderPlugin<any, any, any, any, any>;
// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- type projections intentionally accept any plugin generic instantiation
type AnyMiddlewarePlugin = MiddlewarePlugin<any, any, any>;
// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- conditional inference over arbitrary kernel plugin generics
type KernelFormatMapOf<P> = P extends KernelPlugin<infer FormatMap, any, any, any, any> ? FormatMap : never;
// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- conditional inference over arbitrary kernel plugin generics
type KernelRenderOptionsOf<P> = P extends KernelPlugin<any, infer RenderOptions, any, any, any> ? RenderOptions : never;
// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- conditional inference over arbitrary kernel plugin generics
type KernelIdOf<P> = P extends KernelPlugin<any, any, infer Id, any, any> ? Id : never;
// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- conditional inference over arbitrary kernel plugin generics
type KernelExtensionsOf<P> = P extends KernelPlugin<any, any, any, any, any, infer Extensions> ? Extensions : never;
type KernelRenderContentOf<P> = P extends {
  readonly [__renderContent]?: { readonly keys: infer Content };
}
  ? Extract<Content, RuntimeContentKey>
  : never;
// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- conditional inference over arbitrary kernel plugin generics
type KernelExportContentMapOf<P> = P extends KernelPlugin<any, any, any, any, infer Content> ? Content : never;
type MiddlewareRenderContentOf<P> = P extends {
  readonly [__middlewareRenderContent]?: { readonly keys: infer Content };
}
  ? Extract<Content, RuntimeContentKey>
  : never;
// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- conditional inference over arbitrary middleware plugin generics
type MiddlewareExportContentMapOf<P> = P extends MiddlewarePlugin<any, any, infer Content> ? Content : never;
// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- conditional inference over arbitrary transcoder plugin generics
type TranscoderEdgeMapOf<T> = T extends TranscoderPlugin<infer EdgeMap, any, any, any, any> ? EdgeMap : never;
// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- conditional inference over arbitrary transcoder plugin generics
type TranscoderFromOf<T> = T extends TranscoderPlugin<any, infer From, any, any, any> ? From : never;
// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- conditional inference over arbitrary transcoder plugin generics
type TranscoderIdOf<T> = T extends TranscoderPlugin<any, any, infer Id, any, any> ? Id : never;
// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- conditional inference over arbitrary transcoder plugin generics
type TranscoderContentMapOf<T> = T extends TranscoderPlugin<any, any, any, infer Content, any> ? Content : never;
type TranscoderPinnedSourceOptionsMapOf<T> =
  T extends TranscoderPlugin<
    // oxlint-disable-next-line typescript/no-explicit-any -- Conditional inference over arbitrary transcoder plugin generics.
    any,
    // oxlint-disable-next-line typescript/no-explicit-any -- Conditional inference over arbitrary transcoder plugin generics.
    any,
    // oxlint-disable-next-line typescript/no-explicit-any -- Conditional inference over arbitrary transcoder plugin generics.
    any,
    // oxlint-disable-next-line typescript/no-explicit-any -- Conditional inference over arbitrary transcoder plugin generics.
    any,
    infer Pinned
  >
    ? Pinned
    : never;

/**
 * Collects the union of all export format string literals from an array of kernel plugins.
 * Derives formats from the phantom `FormatMap` type parameter. Falls back to `string` when
 * no kernel declares `exportFormats`.
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
 * For each format key, unions the option types contributed by every kernel
 * that declares that format. A client call does not statically identify the
 * active kernel, so requiring the intersection would incorrectly require one
 * bag to satisfy every kernel route at once. Empty placeholders that resolve to
 * `Record<string, never>` (typically `z.object({})` in Zod 4) are filtered
 * out via `FilterEmpty<T>` before reaching the union — they would
 * otherwise annihilate concrete contributors at the intersection step. When
 * every contributor is the placeholder, the per-key union collapses to `never`
 * and `UnionToIntersection<never>` falls back to `unknown`.
 *
 * Works uniformly for tuple inputs and for widened application-owned plugin
 * arrays typed as `(PluginA | PluginB | …)[]` because the
 * per-plugin filter is dispatched through `ContributorFor`, whose naked type
 * parameter forces the conditional to distribute over the union.
 *
 * @public
 */
export type CollectFormatMap<Plugins extends readonly AnyKernelPlugin[]> = {
  [K in keyof UnionToIntersection<KernelFormatMapOf<Plugins[number]>>]: ContributorFor<Plugins[number], K & string>;
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
 * The default `Record<string, unknown>` phantom (kernels without `render.optionsSchema`)
 * is filtered from the union via `FilterDefaultRender<T>` to prevent it from
 * swallowing concrete contributors via index-signature subsumption. When every
 * contributor is the default phantom, the result falls back to
 * `Record<string, unknown>` so no-render-options-schema setups still typecheck.
 *
 * @public
 */
type CollectSingletonRenderOptions<Plugins extends readonly AnyKernelPlugin[]> = [
  FilterDefaultRender<KernelRenderOptionsOf<Plugins[number]>>,
] extends [never]
  ? Record<string, unknown>
  : FilterDefaultRender<KernelRenderOptionsOf<Plugins[number]>>;

/** @public */
export type CollectRenderOptions<Plugins extends readonly AnyKernelPlugin[]> = Plugins extends readonly [
  AnyKernelPlugin,
]
  ? CollectSingletonRenderOptions<Plugins>
  : Record<string, unknown>;

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

/** Collects the source-extension literals declared by a kernel tuple. @public */
export type CollectKernelExtensions<Plugins extends readonly AnyKernelPlugin[]> = KernelExtensionsOf<
  Plugins[number]
>[number];

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
type PinnedSourceOptionKeys<
  T extends AnyTranscoderPlugin,
  Target,
> = Target extends keyof TranscoderPinnedSourceOptionsMapOf<T>
  ? Extract<TranscoderPinnedSourceOptionsMapOf<T>[Target], PropertyKey>
  : never;

type OmitPinnedSourceOptions<Source, Keys extends PropertyKey> = Source extends unknown ? Omit<Source, Keys> : never;

type MergedEdgesForTranscoder<FormatMap extends Record<string, unknown>, T extends AnyTranscoderPlugin> = {
  [Target in keyof ExtractEdgeMap<T>]: ExtractFrom<T> extends keyof FormatMap
    ? OmitPinnedSourceOptions<FormatMap[ExtractFrom<T>], PinnedSourceOptionKeys<T, Target>> & ExtractEdgeMap<T>[Target]
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
 * @public
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
 * @public
 */
export type ExportOptionsFor<
  Kernels extends readonly AnyKernelPlugin[],
  Transcoders extends readonly AnyTranscoderPlugin[],
  F,
> = Kernels extends readonly [AnyKernelPlugin]
  ? F extends keyof MergeExportMap<CollectFormatMap<Kernels>, Transcoders>
    ? MergeExportMap<CollectFormatMap<Kernels>, Transcoders>[F]
    : Record<string, unknown> | undefined
  : Record<string, unknown>;

/**
 * Resolves the render-options input type for a specific kernel id within a
 * `Kernels` bag. Used by {@link RenderCapability} to narrow `defaults` per
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

/* oxlint-disable typescript/no-explicit-any -- Conditional extraction needs wildcard instantiations of the public plugin phantom types. */
/** Content keys contributed by one concrete kernel render route. @public */
export type KernelRenderContentFor<Kernels extends readonly AnyKernelPlugin[], Kernel extends string> =
  Extract<Kernels[number], KernelPlugin<any, any, Kernel, any, any>> extends infer Plugin
    ? Plugin extends AnyKernelPlugin
      ? KernelRenderContentOf<Plugin>
      : never
    : never;

/** Content keys contributed by enabled middleware to every render route. @public */
export type MiddlewareRenderContentFor<Middleware extends readonly AnyMiddlewarePlugin[]> = MiddlewareRenderContentOf<
  Middleware[number]
>;

/** Content keys supported by one composed render route. @public */
export type RenderContentFor<
  Kernels extends readonly AnyKernelPlugin[],
  Middleware extends readonly AnyMiddlewarePlugin[],
  Kernel extends string = CollectKernelIds<Kernels>,
> = string extends Kernel
  ? RuntimeContentKey
  : KernelRenderContentFor<Kernels, Kernel> | MiddlewareRenderContentFor<Middleware>;

type NativeExportContentForPlugin<Plugin, Format extends string> = Plugin extends AnyKernelPlugin
  ? Format extends keyof KernelFormatMapOf<Plugin>
    ? Format extends keyof KernelExportContentMapOf<Plugin>
      ? Extract<KernelExportContentMapOf<Plugin>[Format], RuntimeContentKey>
      : never
    : never
  : never;

/** Content keys contributed by native kernel exports for a source format. @public */
export type KernelExportContentFor<
  Kernels extends readonly AnyKernelPlugin[],
  Format extends string,
  Kernel extends string = CollectKernelIds<Kernels>,
> = NativeExportContentForPlugin<Extract<Kernels[number], KernelPlugin<any, any, Kernel, any, any>>, Format>;
/* oxlint-enable typescript/no-explicit-any -- End wildcard phantom-type extraction. */

type MiddlewareExportContentForPlugin<Plugin, Format extends string> = Plugin extends AnyMiddlewarePlugin
  ? Format extends keyof MiddlewareExportContentMapOf<Plugin>
    ? Extract<MiddlewareExportContentMapOf<Plugin>[Format], RuntimeContentKey>
    : never
  : never;

/** Content keys contributed by middleware to a source export format. @public */
export type MiddlewareExportContentFor<
  Middleware extends readonly AnyMiddlewarePlugin[],
  Format extends string,
> = MiddlewareExportContentForPlugin<Middleware[number], Format>;

/** Content keys available after producing one source-format artifact. @public */
export type SourceContentFor<
  Kernels extends readonly AnyKernelPlugin[],
  Middleware extends readonly AnyMiddlewarePlugin[],
  Format extends string,
  Kernel extends string = CollectKernelIds<Kernels>,
> = KernelExportContentFor<Kernels, Format, Kernel> | MiddlewareExportContentFor<Middleware, Format>;

type DirectContentFor<
  Kernels extends readonly AnyKernelPlugin[],
  Middleware extends readonly AnyMiddlewarePlugin[],
  Target extends string,
  Kernel extends string,
> = Target extends keyof CollectFormatMap<Kernels> ? SourceContentFor<Kernels, Middleware, Target, Kernel> : never;

type TranscodedContentForPlugin<
  Kernels extends readonly AnyKernelPlugin[],
  Middleware extends readonly AnyMiddlewarePlugin[],
  Plugin,
  Target extends string,
  Kernel extends string,
> = Plugin extends AnyTranscoderPlugin
  ? Target extends keyof TranscoderEdgeMapOf<Plugin>
    ? Extract<
        SourceContentFor<Kernels, Middleware, ExtractFrom<Plugin>, Kernel>,
        Target extends keyof TranscoderContentMapOf<Plugin>
          ? Extract<TranscoderContentMapOf<Plugin>[Target], RuntimeContentKey>
          : never
      >
    : never
  : never;

/**
 * Content keys supported by at least one concrete route to a target format.
 * Runtime selection still validates the requested subset against the chosen
 * concrete route before any parameter extraction or geometry work.
 * @public
 */
export type ExportContentFor<
  Kernels extends readonly AnyKernelPlugin[],
  Middleware extends readonly AnyMiddlewarePlugin[],
  Transcoders extends readonly AnyTranscoderPlugin[],
  Target extends string,
  Kernel extends string = CollectKernelIds<Kernels>,
> = string extends Kernel
  ? RuntimeContentKey
  :
      | DirectContentFor<Kernels, Middleware, Target, Kernel>
      | TranscodedContentForPlugin<Kernels, Middleware, Transcoders[number], Target, Kernel>;
