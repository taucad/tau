import type { z } from 'zod';
import type { MediaType } from '@taucad/types';
import type { ParameterManifest } from '@taucad/parameters';
import type {
  ContentHookInputFor,
  ContentKeysOf,
  RuntimeContentDeclaration,
  RuntimeContentKey,
} from '#types/runtime-content.types.js';
import type { Dependency } from '#types/runtime-dependency.types.js';
import type { KernelFileSystem, RuntimeLogger } from '#types/runtime-kernel.types.js';
import type { KernelComputeCapability } from '#types/runtime-compute.types.js';
import type { RuntimeSpanTracer } from '#types/runtime-tracer.types.js';
import type {
  DescribeInput,
  DescribeResult,
  EvaluateResult,
  RenderResult,
  ResolveInput,
  KernelExportResult,
} from '#types/runtime-kernel-v2.types.js';
import type { MiddlewareState as ExistingMiddlewareState } from '#types/runtime-middleware.types.js';

/** State retained for one middleware operation and validated on update. @public */
export type MiddlewareState<State extends Record<string, unknown>> = ExistingMiddlewareState<State>;

/** Framework content supplied by media type or export extension. @public */
export type MiddlewareContent = Readonly<{
  views?: Partial<Record<MediaType, RuntimeContentDeclaration>>;
  exports?: Readonly<Record<string, RuntimeContentDeclaration>>;
}>;
/** File whose changes affect selected middleware operations. @public */
export type MiddlewareDependency = Readonly<{
  path: string;
  affects: ReadonlyArray<'describe' | 'evaluate' | 'render' | 'export'>;
  watchDebounce?: number;
}>;
/** Services available during middleware dependency resolution. @public */
export type MiddlewareDependencyServices<Options extends Record<string, unknown> = Record<string, unknown>> = Readonly<{
  signal: AbortSignal;
  logger: RuntimeLogger;
  filesystem: KernelFileSystem;
  options: Options;
}>;
/** Declare files that affect middleware results. @public */
export type MiddlewareResolveHook<Options extends Record<string, unknown> = Record<string, unknown>> = (
  input: ResolveInput,
  services: MiddlewareDependencyServices<Options>,
) => MiddlewareDependency[] | Promise<MiddlewareDependency[]>;
/** Operation-scoped services and typed middleware state. @public */
export type KernelMiddlewareServices<
  State extends Record<string, unknown> = Record<string, unknown>,
  Options extends Record<string, unknown> = Record<string, unknown>,
> = Readonly<{
  signal: AbortSignal;
  tracer: RuntimeSpanTracer;
  logger: RuntimeLogger;
  filesystem: KernelFileSystem;
  compute: KernelComputeCapability;
  state: MiddlewareState<State>;
  options: Options;
  dependencies: readonly Dependency[];
  dependencyHash: string;
}>;

/** Evaluation request independent of any selected view. @public */
export type EvaluateRequest = Readonly<{
  entryPath: string;
  parameters: Record<string, unknown>;
  options?: Record<string, unknown>;
}>;
/** Request for one rendered view and its selected media type. @public */
export type RenderRequest<Content extends RuntimeContentKey = RuntimeContentKey> = Readonly<
  {
    view: string;
    mimeType: MediaType;
    instance?: string;
    options: Record<string, unknown>;
  } & ContentHookInputFor<Content>
>;
/** Request for one export and its selected extension and media type. @public */
export type ExportRequest<Content extends RuntimeContentKey = RuntimeContentKey> = Readonly<
  {
    exportId: string;
    mimeType: MediaType;
    extension: string;
    options: Record<string, unknown>;
  } & ContentHookInputFor<Content>
>;

/** Wrap parameter description without taking ownership of the kernel handle. @public */
export type WrapDescribeHook<State extends Record<string, unknown>, Options extends Record<string, unknown>> = (
  input: DescribeInput,
  next: (input: DescribeInput) => Promise<DescribeResult<ParameterManifest>>,
  services: KernelMiddlewareServices<State, Options>,
) => Promise<DescribeResult<ParameterManifest>>;
/** Wrap evaluation and its serializable offers. @public */
export type WrapEvaluateHook<State extends Record<string, unknown>, Options extends Record<string, unknown>> = (
  input: EvaluateRequest,
  next: (input: EvaluateRequest) => Promise<EvaluateResult>,
  services: KernelMiddlewareServices<State, Options>,
) => Promise<EvaluateResult>;
/** Wrap rendering for a selected view. @public */
export type WrapRenderHook<
  State extends Record<string, unknown>,
  Options extends Record<string, unknown>,
  Content extends RuntimeContentKey,
> = (
  input: RenderRequest<Content>,
  next: (input: RenderRequest<Content>) => Promise<RenderResult>,
  services: KernelMiddlewareServices<State, Options>,
) => Promise<RenderResult>;
/** Wrap a selected export. @public */
export type WrapExportHook<
  State extends Record<string, unknown>,
  Options extends Record<string, unknown>,
  Content extends RuntimeContentKey,
> = (
  input: ExportRequest<Content>,
  next: (input: ExportRequest<Content>) => Promise<KernelExportResult>,
  services: KernelMiddlewareServices<State, Options>,
) => Promise<KernelExportResult>;

type ContentKeys<Map> =
  Map extends Readonly<Record<string, RuntimeContentDeclaration>>
    ? { [Key in keyof Map]: ContentKeysOf<Map[Key]> }[keyof Map]
    : never;
/** Content keys supported by at least one declared media type. @public */
export type ViewContentKeys<Content> = Content extends { views: infer Views } ? ContentKeys<Views> : never;
/** Content keys supported by at least one declared export extension. @public */
export type ExportContentKeys<Content> = Content extends { exports: infer Exports } ? ContentKeys<Exports> : never;
/** Per-extension content keys carried through runtime plugin inference. @public */
export type ExportContentMap<Content> = Content extends {
  exports: infer Exports extends Readonly<Record<string, RuntimeContentDeclaration>>;
}
  ? { readonly [Extension in keyof Exports]: ContentKeysOf<Exports[Extension]> }
  : Record<never, never>;
/** MIME-keyed view content carried by the public middleware registration. @public */
export type ViewContentMap<Content> = Content extends {
  views: infer Views extends Readonly<Record<string, RuntimeContentDeclaration>>;
}
  ? { readonly [Media in keyof Views]: ContentKeysOf<Views[Media]> }
  : Record<never, never>;

/** Middleware lifecycle hooks and declaration maps for the v2 runtime. @public */
export type KernelMiddlewareV2<
  // oxlint-disable-next-line @typescript-eslint/no-empty-object-type -- Empty Zod object is the no-state default.
  StateSchema extends z.ZodObject<z.ZodRawShape> = z.ZodObject<{}>,
  // oxlint-disable-next-line @typescript-eslint/no-empty-object-type -- Empty Zod object is the no-options default.
  OptionsSchema extends z.ZodObject<z.ZodRawShape> = z.ZodObject<{}>,
  Content extends MiddlewareContent | undefined = undefined,
> = Readonly<{
  name: string;
  version: string;
  enabled?: boolean;
  mutates?: boolean;
  content?: Content;
  stateSchema?: StateSchema;
  optionsSchema?: OptionsSchema;
  resolve?: MiddlewareResolveHook<z.output<OptionsSchema>>;
  wrapDescribe?: WrapDescribeHook<z.output<StateSchema>, z.output<OptionsSchema>>;
  wrapEvaluate?: WrapEvaluateHook<z.output<StateSchema>, z.output<OptionsSchema>>;
  wrapRender?: WrapRenderHook<z.output<StateSchema>, z.output<OptionsSchema>, ViewContentKeys<Content>>;
  wrapExport?: WrapExportHook<z.output<StateSchema>, z.output<OptionsSchema>, ExportContentKeys<Content>>;
}>;
