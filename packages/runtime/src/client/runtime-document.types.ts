import type { JSONSchema7 } from '@taucad/json-schema';
import type { ParameterManifest } from '@taucad/parameters';
import type {
  CollectTranscodeRoutes,
  KernelPlugin,
  MiddlewarePlugin,
  TranscoderPlugin,
} from '#plugins/plugin-types.js';
import type { RuntimeSource, RuntimeSourceFiles } from '#client/runtime-document-source.js';
import type { Artifact, ExportFile, ViewInstance } from '#types/runtime-kernel-v2.types.js';
import type { KernelIssue, SourceRevision } from '#types/runtime.types.js';
import type {
  RuntimeContentInput,
  RuntimeContentKey,
  ContentKeysOf,
  ContentRequestFor,
} from '#types/runtime-content.types.js';
import type { z } from 'zod';

/** An offered view with serializable option metadata. @public */
export type ViewOffer<Id extends string = string> = Readonly<{
  id: Id;
  title: string;
  mimeType: string;
  instances?: readonly ViewInstance[];
  options?: Readonly<{ schema: JSONSchema7; defaults: Readonly<Record<string, unknown>> }>;
}>;

/** An offered export with serializable option metadata. @public */
export type ExportOffer<Id extends string = string> = Readonly<{
  id: Id;
  title: string;
  mimeType: string;
  extension: string;
  options?: Readonly<{ schema: JSONSchema7; defaults: Readonly<Record<string, unknown>> }>;
}>;

/** One admitted evaluation; a failed evaluation never silently retains an older export source. @public */
export type Evaluation<ViewId extends string = string, ExportId extends string = string> = Readonly<
  (
    | { success: true; views: ReadonlyArray<ViewOffer<ViewId>>; exports: ReadonlyArray<ExportOffer<ExportId>> }
    | { success: false }
  ) & {
    id: string;
    transient: boolean;
    issues: readonly KernelIssue[];
    sourceRevision?: SourceRevision;
  }
>;

/** Kernel and parameter metadata found without evaluating. @public */
export type Description = Readonly<
  ({ success: true; parameters: ParameterManifest } | { success: false }) & {
    kernelId: string | undefined;
    issues: readonly KernelIssue[];
  }
>;

/** One view projection, correlated to both its request and evaluation. @public */
export type Rendering<ViewId extends string = string> = Readonly<
  ({ success: true; view: ViewId; artifact: Artifact; hash: string } | { success: false; view?: ViewId }) & {
    requestId: string;
    evaluationId: string;
    instance?: string;
    transient: boolean;
    issues: readonly KernelIssue[];
    sourceRevision?: SourceRevision;
  }
>;

/** An export from the pinned committed evaluation. @public */
export type ExportResult<ExportId extends string = string> = Readonly<
  (
    | { success: true; exportId: ExportId; evaluationId: string; files: readonly [ExportFile, ...ExportFile[]] }
    | { success: false }
  ) & {
    issues: readonly KernelIssue[];
    sourceRevision?: SourceRevision;
  }
>;

/** Input to a document update; transient changes never replace committed source. @public */
export type DocumentUpdate = Readonly<
  {
    parameters?: Readonly<Record<string, unknown>>;
    evaluateOptions?: Readonly<Record<string, unknown>>;
  } & (
    | { transient: true; stage?: never }
    | { transient?: false; stage?: Readonly<Record<string, Uint8Array<ArrayBuffer> | string>> }
  )
>;

/** Supersession is an ordinary result, while cancellation and timeout reject. @public */
export type UpdateOutcome<E = Evaluation> = Readonly<{ superseded: false; evaluation: E } | { superseded: true }>;
/** Result of changing one view request. @public */
export type ViewUpdateOutcome<Id extends string = string> = Readonly<
  { superseded: false; rendering: Rendering<Id> } | { superseded: true }
>;
/** Current document activity. @public */
export type DocumentStatus = 'evaluating' | 'ready' | 'error' | 'closed';
/** Current view activity. @public */
export type ViewStatus = 'rendering' | 'ready' | 'error' | 'closed';

/** A live view that follows each evaluation until closed. @public */
export type ViewSubscription<Id extends string = string, Request = WideViewRequest> = Readonly<{
  view: Id | undefined;
  request: Request;
  on(event: 'rendered', handler: (rendering: Rendering<Id>) => void, options?: { signal?: AbortSignal }): () => void;
  on(event: 'status', handler: (status: ViewStatus) => void, options?: { signal?: AbortSignal }): () => void;
  rendering(options?: { signal?: AbortSignal }): Promise<ViewUpdateOutcome<Id>>;
  update(request: Partial<Request>): Promise<ViewUpdateOutcome<Id>>;
  close(): void;
}>;

/** Dynamic plugin requests are checked by the worker. @public */
// oxlint-disable @typescript-eslint/no-restricted-types -- null explicitly resets an instance to the first offered instance.
export type WideViewRequest = Readonly<{
  options?: Readonly<Record<string, unknown>>;
  instance?: string | null;
  content?: RuntimeContentInput;
}>;
/** Dynamic export requests are checked by the worker. @public */
export type WideExportRequest = Readonly<{
  options?: Readonly<Record<string, unknown>>;
  content?: RuntimeContentInput;
  signal?: AbortSignal;
}>;

// oxlint-disable @typescript-eslint/no-explicit-any -- infer requires existential plugin slots; unknown loses the concrete carrier.
type KernelViews<K> =
  K extends KernelPlugin<any, any, any, any, any, any, any, infer Views>
    ? unknown extends Views
      ? Record<string, unknown>
      : Views
    : never;
type KernelExports<K> =
  K extends KernelPlugin<any, any, any, any, any, any, any, any, infer Exports>
    ? unknown extends Exports
      ? Record<string, unknown>
      : Exports
    : never;
// oxlint-enable @typescript-eslint/no-explicit-any
type KernelViewIds<K> = K extends unknown ? Extract<keyof KernelViews<K>, string> : never;
type KernelExportIds<K> = K extends unknown ? Extract<keyof KernelExports<K>, string> : never;
type ViewIds<Kernels extends readonly KernelPlugin[]> = KernelViewIds<Kernels[number]>;
type ExportIds<Kernels extends readonly KernelPlugin[]> = KernelExportIds<Kernels[number]>;
type ViewDeclarationFor<K, Id extends string> = K extends unknown
  ? Id extends keyof KernelViews<K>
    ? KernelViews<K>[Id]
    : never
  : never;
type ExportDeclarationFor<K, Id extends string> = K extends unknown
  ? Id extends keyof KernelExports<K>
    ? KernelExports<K>[Id]
    : never
  : never;
type SchemaInput<D> = D extends { readonly optionsSchema: infer Schema extends z.ZodType } ? z.input<Schema> : never;
type OptionField<D> = [SchemaInput<D>] extends [never]
  ? { readonly options?: never }
  : Readonly<Record<never, never>> extends SchemaInput<D>
    ? { readonly options?: SchemaInput<D> }
    : { readonly options: SchemaInput<D> };
type ContentKeys<D> = D extends { readonly content: infer C } ? ContentKeysOf<C> : never;
type MiddlewareViewKeys<
  Middleware extends readonly MiddlewarePlugin[],
  Media extends string,
> = Middleware[number] extends infer M
  ? M extends MiddlewarePlugin<string, RuntimeContentKey, Record<string, RuntimeContentKey>, infer Views>
    ? Media extends keyof Views
      ? Views[Media]
      : never
    : never
  : never;
type MiddlewareExportKeys<
  Middleware extends readonly MiddlewarePlugin[],
  Extension extends string,
> = Middleware[number] extends infer M
  ? M extends MiddlewarePlugin<string, RuntimeContentKey, infer Exports>
    ? Extension extends keyof Exports
      ? Exports[Extension]
      : never
    : never
  : never;
type MediaOf<D> = D extends { readonly mimeType: infer Media extends string } ? Media : never;
type ExtensionOf<D> = D extends { readonly extension: infer Extension extends string } ? Extension : never;
type ViewRequestFor<K, Middleware extends readonly MiddlewarePlugin[], Id extends string> =
  ViewDeclarationFor<K, Id> extends infer D
    ? D extends unknown
      ? Readonly<
          OptionField<D> &
            (D extends { readonly instances: true } ? { instance?: string | null } : { instance?: never }) &
            ContentRequestFor<Extract<ContentKeys<D> | MiddlewareViewKeys<Middleware, MediaOf<D>>, RuntimeContentKey>>
        >
      : never
    : never;
type ExportRequestFor<K, Middleware extends readonly MiddlewarePlugin[], Id extends string> =
  ExportDeclarationFor<K, Id> extends infer D
    ? D extends unknown
      ? Readonly<
          OptionField<D> &
            ContentRequestFor<
              Extract<ContentKeys<D> | MiddlewareExportKeys<Middleware, ExtensionOf<D>>, RuntimeContentKey>
            > & { signal?: AbortSignal }
        >
      : never
    : never;
// oxlint-enable @typescript-eslint/no-restricted-types
type ViewRequestOf<
  Kernels extends readonly KernelPlugin[],
  Middleware extends readonly MiddlewarePlugin[],
  Id extends string,
> =
  string extends ViewIds<Kernels>
    ? WideViewRequest
    : Kernels[number] extends infer K
      ? K extends KernelPlugin
        ? ViewRequestFor<K, Middleware, Id>
        : never
      : never;
type ExportRequestOf<
  Kernels extends readonly KernelPlugin[],
  Middleware extends readonly MiddlewarePlugin[],
  Id extends string,
> =
  string extends ExportIds<Kernels>
    ? WideExportRequest
    : Kernels[number] extends infer K
      ? K extends KernelPlugin
        ? ExportRequestFor<K, Middleware, Id>
        : never
      : never;
/** View request inferred from the document's registered kernels. @public */
export type DocumentViewRequest<
  Kernels extends readonly KernelPlugin[],
  Middleware extends readonly MiddlewarePlugin[],
  Id extends string,
> = ViewRequestOf<Kernels, Middleware, Id>;
/** Direct export request inferred from the document's registered kernels. @public */
export type DocumentExportRequest<
  Kernels extends readonly KernelPlugin[],
  Middleware extends readonly MiddlewarePlugin[],
  Id extends string,
> = ExportRequestOf<Kernels, Middleware, Id>;
type KernelExportExtensions<K> = KernelExports<K>[keyof KernelExports<K>] extends infer D
  ? D extends { readonly extension: infer Extension extends string }
    ? Extension
    : never
  : never;
type ExportExtensions<Kernels extends readonly KernelPlugin[]> = Kernels[number] extends infer K
  ? K extends KernelPlugin
    ? KernelExportExtensions<K>
    : never
  : never;
type ExportDeclarationByExtension<K, Extension extends string> = K extends unknown
  ? KernelExports<K>[keyof KernelExports<K>] extends infer D
    ? D extends { readonly extension: Extension }
      ? D
      : never
    : never
  : never;
type ExportRequestByExtension<K, Middleware extends readonly MiddlewarePlugin[], Extension extends string> =
  ExportDeclarationByExtension<K, Extension> extends infer D
    ? D extends unknown
      ? Readonly<
          OptionField<D> &
            ContentRequestFor<
              Extract<ContentKeys<D> | MiddlewareExportKeys<Middleware, Extension>, RuntimeContentKey>
            > & { signal?: AbortSignal }
        >
      : never
    : never;
type RoutesOfPlugin<Plugin> =
  Plugin extends TranscoderPlugin<infer _Edges, infer _From, infer _Id, infer Content, infer Pinned>
    ? CollectTranscodeRoutes<readonly [Plugin]> extends infer Route
      ? Route extends { readonly to: infer To }
        ? Route & {
            readonly content: To extends keyof Content ? Content[To] : never;
            readonly pinned: To extends keyof Pinned ? Pinned[To] : never;
          }
        : never
      : never
    : never;
type UnseenRoute<Route, Seen> = Route extends { readonly from: infer From; readonly to: infer To }
  ? Extract<Seen, { readonly from: From; readonly to: To }> extends never
    ? Route
    : never
  : never;
type TranscodeRoutes<
  Transcoders extends readonly TranscoderPlugin[],
  Seen = never,
> = number extends Transcoders['length']
  ? RoutesOfPlugin<Transcoders[number]>
  : Transcoders extends readonly [
        infer First extends TranscoderPlugin,
        ...infer Rest extends readonly TranscoderPlugin[],
      ]
    ? UnseenRoute<RoutesOfPlugin<First>, Seen> | TranscodeRoutes<Rest, Seen | RoutesOfPlugin<First>>
    : never;
type ReachableTarget<Kernels extends readonly KernelPlugin[], Transcoders extends readonly TranscoderPlugin[]> =
  TranscodeRoutes<Transcoders> extends infer Route
    ? Route extends { readonly from: infer From extends string; readonly to: infer Target extends string }
      ? Extract<ExportExtensions<Kernels>, From> extends never
        ? never
        : Target
      : never
    : never;
type OptionFieldFromInput<Input> =
  Readonly<Record<never, never>> extends Input ? { readonly options?: Input } : { readonly options: Input };
type SourceOptions<D> = [SchemaInput<D>] extends [never] ? Readonly<Record<never, never>> : SchemaInput<D>;
type RoutedOptions<Source, Edge, Pinned extends PropertyKey> = Source extends unknown
  ? Edge extends unknown
    ? Omit<Source, Pinned> & Omit<Edge, keyof Source>
    : never
  : never;
type RoutedRequest<K, Middleware extends readonly MiddlewarePlugin[], Route> = Route extends {
  readonly from: infer From extends string;
  readonly options: infer EdgeOptions;
  readonly content: infer RouteContent;
  readonly pinned: infer Pinned;
}
  ? ExportDeclarationByExtension<K, From> extends infer D
    ? D extends unknown
      ? Readonly<
          OptionFieldFromInput<RoutedOptions<SourceOptions<D>, EdgeOptions, Extract<Pinned, PropertyKey>>> &
            ContentRequestFor<
              Extract<ContentKeys<D> | MiddlewareExportKeys<Middleware, From>, Extract<RouteContent, RuntimeContentKey>>
            > & { signal?: AbortSignal }
        >
      : never
    : never
  : never;
type PerKernelExportRequest<
  K,
  Middleware extends readonly MiddlewarePlugin[],
  Transcoders extends readonly TranscoderPlugin[],
  Target extends string,
> =
  Target extends KernelExportIds<K>
    ? ExportRequestFor<K, Middleware, Target>
    : Target extends KernelExportExtensions<K>
      ? ExportRequestByExtension<K, Middleware, Target>
      : TranscodeRoutes<Transcoders> extends infer Route
        ? Route extends { readonly to: Target }
          ? RoutedRequest<K, Middleware, Route>
          : never
        : never;
type ExportIdsByExtension<K, Extension extends string> = {
  [Id in keyof KernelExports<K>]: KernelExports<K>[Id] extends { readonly extension: Extension } ? Id : never;
}[keyof KernelExports<K>];
type PerKernelResolvedExportId<K, Transcoders extends readonly TranscoderPlugin[], Target extends string> =
  Target extends KernelExportIds<K>
    ? Target
    : Target extends KernelExportExtensions<K>
      ? ExportIdsByExtension<K, Target>
      : TranscodeRoutes<Transcoders> extends infer Route
        ? Route extends { readonly to: Target; readonly from: infer From extends string }
          ? ExportIdsByExtension<K, From>
          : never
        : never;
type ResolvedExportId<
  Kernels extends readonly KernelPlugin[],
  Transcoders extends readonly TranscoderPlugin[],
  Target extends string,
> =
  string extends ExportIds<Kernels>
    ? string
    : Kernels[number] extends infer K
      ? K extends KernelPlugin
        ? Extract<PerKernelResolvedExportId<K, Transcoders, Target>, string>
        : never
      : never;
type ExportRequestForTarget<
  Kernels extends readonly KernelPlugin[],
  Middleware extends readonly MiddlewarePlugin[],
  Transcoders extends readonly TranscoderPlugin[],
  Target extends string,
> =
  string extends ExportIds<Kernels>
    ? WideExportRequest
    : Kernels[number] extends infer K
      ? K extends KernelPlugin
        ? PerKernelExportRequest<K, Middleware, Transcoders, Target>
        : never
      : never;
type RequestArguments<Request> =
  Readonly<Record<never, never>> extends Request ? [request?: Request] : [request: Request];

/** A document owns evaluation, view subscriptions and exports. @public */
export type RuntimeDocument<
  Kernels extends readonly KernelPlugin[] = readonly KernelPlugin[],
  Middleware extends readonly MiddlewarePlugin[] = readonly MiddlewarePlugin[],
  Transcoders extends readonly TranscoderPlugin[] = readonly TranscoderPlugin[],
> = Readonly<{
  id: string;
  view(): ViewSubscription<ViewIds<Kernels>, Readonly<{ options?: never; instance?: never; content?: never }>>;
  view<const Id extends ViewIds<Kernels>>(
    id: Id,
    ...request: RequestArguments<ViewRequestOf<Kernels, Middleware, NoInfer<Id>>>
  ): ViewSubscription<Id, ViewRequestOf<Kernels, Middleware, Id>>;
  export<const Target extends ExportIds<Kernels> | ExportExtensions<Kernels> | ReachableTarget<Kernels, Transcoders>>(
    target: Target,
    ...request: RequestArguments<ExportRequestForTarget<Kernels, Middleware, Transcoders, NoInfer<Target>>>
  ): Promise<ExportResult<ResolvedExportId<Kernels, Transcoders, Target>>>;
  evaluation(options?: {
    signal?: AbortSignal;
  }): Promise<UpdateOutcome<Evaluation<ViewIds<Kernels>, ExportIds<Kernels>>>>;
  update(
    update: DocumentUpdate & EvaluateOptionsUpdateField<Kernels>,
  ): Promise<UpdateOutcome<Evaluation<ViewIds<Kernels>, ExportIds<Kernels>>>>;
  on(event: 'described', handler: (description: Description) => void, options?: { signal?: AbortSignal }): () => void;
  on(
    event: 'evaluated',
    handler: (evaluation: Evaluation<ViewIds<Kernels>, ExportIds<Kernels>>) => void,
    options?: { signal?: AbortSignal },
  ): () => void;
  on(
    event: 'progress',
    handler: (progress: { phase: string; detail?: Record<string, unknown> }) => void,
    options?: { signal?: AbortSignal },
  ): () => void;
  on(event: 'status', handler: (status: DocumentStatus) => void, options?: { signal?: AbortSignal }): () => void;
  close(): void;
}>;

type KernelEvaluateOptions<K> =
  K extends KernelPlugin<
    infer _Format,
    infer _Render,
    infer _Id,
    infer _RenderContent,
    infer _ExportContent,
    infer _Extensions,
    infer Schema
  >
    ? Schema extends z.ZodType
      ? z.input<Schema>
      : never
    : never;
type EvaluateOptionsField<Kernels extends readonly KernelPlugin[]> = number extends Kernels['length']
  ? { readonly evaluateOptions?: Readonly<Record<string, unknown>> }
  : Kernels[number] extends infer K
    ? K extends KernelPlugin
      ? [KernelEvaluateOptions<K>] extends [never]
        ? { readonly evaluateOptions?: never }
        : Readonly<Record<never, never>> extends KernelEvaluateOptions<K>
          ? { readonly evaluateOptions?: KernelEvaluateOptions<K> }
          : { readonly evaluateOptions: KernelEvaluateOptions<K> }
      : never
    : never;
type EvaluateOptionsUpdateField<Kernels extends readonly KernelPlugin[]> = number extends Kernels['length']
  ? { readonly evaluateOptions?: Readonly<Record<string, unknown>> }
  : Kernels[number] extends infer K
    ? K extends KernelPlugin
      ? { readonly evaluateOptions?: KernelEvaluateOptions<K> }
      : never
    : never;

/** Opening a source also starts its first evaluation. @public */
export type OpenInput<
  Files extends RuntimeSourceFiles = RuntimeSourceFiles,
  Kernels extends readonly KernelPlugin[] = readonly KernelPlugin[],
> = Readonly<
  {
    source: RuntimeSource<Files>;
    parameters?: Readonly<Record<string, unknown>>;
    stage?: Readonly<Record<string, Uint8Array<ArrayBuffer> | string>>;
    watch?: boolean;
    signal?: AbortSignal;
  } & EvaluateOptionsField<Kernels>
>;
