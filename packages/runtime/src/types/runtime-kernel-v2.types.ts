/**
 * The public view/export kernel authoring contract.
 */
import { toJSONSchema, z } from 'zod';
import type { JSONSchema7 } from '@taucad/json-schema';
import type { CadUnits, ExportFile as ExistingExportFile, MediaType as SharedMediaType } from '@taucad/types';
import type { ParameterDeclaration, ParameterResolutionOptions } from '@taucad/parameters';
import type { GetDependenciesResult } from '#types/runtime-dependency.types.js';
import type { KernelIssue, KernelErrorResult, KernelSuccessResult } from '#types/runtime.types.js';
import type {
  KernelRuntime,
  NativeBuildInputCarrier,
  RuntimeImplementationAsset,
} from '#types/runtime-kernel.types.js';
import type { KernelPlugin, RuntimePluginDeclaration } from '#plugins/plugin-types.js';
import {
  attachRuntimePluginDefinition,
  attachRuntimePluginFactoryOptions,
} from '#plugins/plugin-runtime-definition.js';
import type { RuntimePluginDefinitionCarrier } from '#plugins/plugin-runtime-definition.js';
import { toBuiltinModulePackage } from '#kernels/kernel-module-helpers.js';
import type { InstalledPackageManifest } from '#kernels/kernel-module-helpers.js';
import type { ContentHookInputFor, ContentKeysOf, RuntimeContentDeclaration } from '#types/runtime-content.types.js';
import { validateRuntimeContentDeclarations } from '#types/runtime-content.types.js';

/** Known media types complete in editors; other media types remain legal. @public */
export type MediaType = SharedMediaType;
/** A single rendered view with its declared media type and optional units. @public */
export type Artifact = Readonly<{
  mimeType: MediaType;
  content: Uint8Array<ArrayBuffer> | string;
  units?: Readonly<CadUnits>;
}>;
/** A named export file with an open media type. @public */
export type ExportFile = Omit<ExistingExportFile, 'mimeType'> & { readonly mimeType: MediaType };
/** One named instance of a declared view. @public */
export type ViewInstance = Readonly<{ id: string; title: string }>;
type ObjectOptionsSchema = z.ZodType<Readonly<Record<string, unknown>>, Readonly<Record<string, unknown>>>;

/** Static declaration and validation metadata for a view. @public */
export type ViewDeclaration = Readonly<{
  title: string;
  mimeType: MediaType;
  optionsSchema?: ObjectOptionsSchema;
  content?: RuntimeContentDeclaration;
  instances?: true;
}>;
/** Static declaration and validation metadata for an export. @public */
export type ExportDeclaration = Readonly<{
  title: string;
  mimeType: MediaType;
  extension: string;
  optionsSchema?: ObjectOptionsSchema;
  content?: RuntimeContentDeclaration;
}>;
/** Views offered by a kernel, keyed by stable view identifier. @public */
export type KernelViewDeclarations = Readonly<Record<string, ViewDeclaration>>;
/** Exports offered by a kernel, keyed by stable export identifier. @public */
export type KernelExportDeclarations = Readonly<Record<string, ExportDeclaration>>;

type CheckedDeclarations<Declarations extends Readonly<Record<string, unknown>>, Shape> = Declarations & {
  readonly [Id in keyof Declarations]: Readonly<Record<Exclude<keyof Declarations[Id], keyof Shape>, never>>;
};
type SchemaOf<Declaration> = Declaration extends { readonly optionsSchema: infer Schema extends z.ZodType }
  ? Schema
  : undefined;
type ParsedOptions<Schema> = Schema extends z.ZodType ? z.output<Schema> : Readonly<Record<never, never>>;
type InputOptions<Schema> = Schema extends z.ZodType ? z.input<Schema> : never;
type ExportOptions<Declaration> =
  SchemaOf<Declaration> extends z.ZodType ? InputOptions<SchemaOf<Declaration>> : Readonly<Record<string, never>>;
type ContentOf<Declaration> = Declaration extends { readonly content: infer Content } ? ContentKeysOf<Content> : never;
type InstanceFor<Declaration> = Declaration extends { readonly instances: true }
  ? { readonly instance: string | undefined }
  : { readonly instance?: never };

/** Operation-scoped services passed to kernel hooks. @public */
export type KernelServices = KernelRuntime;
/** File whose dependencies are being resolved. @public */
export type ResolveInput = Readonly<{ entryPath: string }>;
/** Resolved and unresolved source dependencies. @public */
export type ResolveOutput = GetDependenciesResult;
/** Input for parameter description. @public */
export type DescribeInput = Readonly<{ entryPath: string; resolution?: ParameterResolutionOptions }>;
/** Parameter description envelope returned by a kernel. @public */
export type DescribeResult<Parameters = ParameterDeclaration> =
  | (Omit<
      KernelSuccessResult<{ readonly parameters: Parameters }>,
      'serializedNativeHandle' | 'serializeNativeHandleSnapshot'
    > & {
      serializedHandle?: unknown;
      serializeHandleSnapshot?: () => unknown;
    })
  | KernelErrorResult;
/** Validated evaluation input. @public */
export type EvaluateInput<Schema> = Readonly<{
  entryPath: string;
  parameters: Readonly<Record<string, unknown>>;
  options: ParsedOptions<Schema>;
}>;
/** Kernel output before runtime admission and serialization. @public */
export type EvaluateOutput<Handle, Views, Exports> = Readonly<{
  handle: Handle;
  issues?: readonly KernelIssue[];
  views?: ReadonlyArray<Extract<keyof Views, string>>;
  exports?: ReadonlyArray<Extract<keyof Exports, string>>;
  instances?: {
    readonly [Id in keyof Views]?: Views[Id] extends { readonly instances: true } ? readonly ViewInstance[] : never;
  };
}>;
/** Per-view render input narrowed by the selected view identifier. @public */
export type RenderInput<Handle, Views> = {
  [Id in keyof Views]: Readonly<
    {
      handle: Handle;
      view: Id;
      options: ParsedOptions<SchemaOf<Views[Id]>>;
    } & InstanceFor<Views[Id]> &
      ContentHookInputFor<ContentOf<Views[Id]>>
  >;
}[keyof Views];
/** Rendered content before runtime attaches the declared media type. @public */
export type RenderOutput = Readonly<{
  content: Uint8Array<ArrayBuffer> | string;
  units?: Readonly<CadUnits>;
  issues?: readonly KernelIssue[];
  mimeType?: never;
}>;
/** Export input narrowed by the selected export identifier. @public */
export type ExportInput<Handle, Exports> = {
  [Id in keyof Exports]: Readonly<
    {
      handle: Handle;
      exportId: Id;
      options: ParsedOptions<SchemaOf<Exports[Id]>>;
    } & ContentHookInputFor<ContentOf<Exports[Id]>>
  >;
}[keyof Exports];
/** At least one output file from a successful export. @public */
export type NonemptyExportFiles = readonly [ExportFile, ...ExportFile[]];
/** Kernel export output before runtime admission. @public */
export type ExportOutput = Readonly<{ files: NonemptyExportFiles; issues?: readonly KernelIssue[] }>;
/**
 * Admit a dynamic exporter's files once, at the export artifact boundary.
 * @param files - Files to check.
 * @returns A nonempty tuple.
 * @public
 */
export const nonemptyExportFiles = (files: readonly ExportFile[]): NonemptyExportFiles => {
  const [first, ...rest] = files;
  if (first === undefined) {
    throw new Error('A successful export must contain at least one file.');
  }
  return [first, ...rest];
};
/** Serializable subset of declared views, exports and instances offered by an evaluation. @public */
export type KernelOffers = Readonly<{
  views?: readonly string[];
  exports?: readonly string[];
  instances?: Readonly<Record<string, readonly ViewInstance[]>>;
}>;
type PipelineResult<Data> =
  | (Omit<KernelSuccessResult<Data>, 'serializedNativeHandle' | 'serializeNativeHandleSnapshot'> & {
      serializedHandle?: unknown;
      serializeHandleSnapshot?: () => unknown;
    })
  | KernelErrorResult;
/** Admitted evaluation envelope and native replay carrier. @public */
export type EvaluateResult = PipelineResult<KernelOffers> & NativeBuildInputCarrier;
/** Admitted render artifact envelope. @public */
export type RenderResult = PipelineResult<Artifact>;
/** Admitted nonempty export envelope. @public */
export type KernelExportResult = PipelineResult<NonemptyExportFiles>;

type SnapshotHooks<Context, Handle, Serialized> =
  | {
      serializeHandle(input: Readonly<{ handle: Handle }>, services: KernelServices, context: Context): Serialized;
      deserializeHandle(
        input: Readonly<{ serialized: Serialized }>,
        services: KernelServices,
        context: Context,
      ): Handle;
    }
  | { serializeHandle?: never; deserializeHandle?: never };
type RenderRequirement<Views> = [keyof Views] extends [never] ? { render?: never } : { render: unknown };
type ExportRequirement<Exports> = [keyof Exports] extends [never] ? { export?: never } : { export: unknown };

/** Kernel authoring contract with exact per-view and per-export inference. @public */
export type KernelDefinitionV2<
  Id extends string,
  Extensions extends readonly string[],
  Context,
  Handle,
  Serialized,
  OptionsSchema extends z.ZodType | undefined,
  EvaluateSchema extends z.ZodObject<z.ZodRawShape> | undefined,
  Views extends KernelViewDeclarations,
  Exports extends KernelExportDeclarations,
> = RuntimePluginDeclaration & {
  readonly id: Id;
  readonly extensions: Extensions;
  readonly detectImport?: RegExp;
  readonly builtinModuleNames?: readonly string[];
  /**
   * The npm packages the builtin modules come from, keyed by the dependency name a model imports,
   * each as the installed package's own `package.json` names it (`name`, `version`). Import the
   * manifest where the package exports it; otherwise pin it with a test against the installed
   * manifest. Surfaced as {@link KernelPlugin.builtinDependencies}.
   */
  readonly builtinPackages?: Readonly<Record<string, InstalledPackageManifest>>;
  readonly name: string;
  readonly version: string;
  readonly implementationAssets?: readonly RuntimeImplementationAsset[];
  readonly optionsSchema?: OptionsSchema;
  readonly evaluateOptionsSchema?: EvaluateSchema;
  readonly cancellation?: 'cooperative';
  readonly views: CheckedDeclarations<Views, ViewDeclaration>;
  readonly exports: CheckedDeclarations<Exports, ExportDeclaration>;
  initialize(options: ParsedOptions<OptionsSchema>, services: KernelServices): Promise<Context>;
  resolve(input: ResolveInput, services: KernelServices, context: Context): Promise<ResolveOutput>;
  describe(input: DescribeInput, services: KernelServices, context: Context): Promise<DescribeResult>;
  evaluate(
    input: EvaluateInput<EvaluateSchema>,
    services: KernelServices,
    context: Context,
  ): Promise<EvaluateOutput<Handle, NoInfer<Views>, NoInfer<Exports>>>;
  render?(
    input: RenderInput<NoInfer<Handle>, NoInfer<Views>>,
    services: KernelServices,
    context: NoInfer<Context>,
  ): Promise<RenderOutput>;
  export?(
    input: ExportInput<NoInfer<Handle>, NoInfer<Exports>>,
    services: KernelServices,
    context: NoInfer<Context>,
  ): Promise<ExportOutput>;
  isHandleValid?(
    input: Readonly<{ handle: Handle }>,
    services: KernelServices,
    context: Context,
  ): boolean | Promise<boolean>;
  releaseHandle?(input: Readonly<{ handle: Handle }>, services: KernelServices, context: Context): void;
  onDispose?(context: Context): Promise<void>;
} & SnapshotHooks<Context, Handle, Serialized> &
  RenderRequirement<Views> &
  ExportRequirement<Exports>;

/** Runtime storage erases concrete hook generics once; authoring and factory results retain them. @internal */
// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- A single private existential boundary for heterogeneous kernel definitions.
export type AnyKernelDefinitionV2 = KernelDefinitionV2<any, any, any, any, any, any, any, any, any>;

/** Plain, serializable declaration metadata; executable schemas remain in the private definition slot. @public */
export type ViewMetadata<Mime extends MediaType = MediaType> = Readonly<{
  title: string;
  mimeType: Mime;
  optionsSchema?: JSONSchema7;
  content?: RuntimeContentDeclaration;
  instances?: true;
}>;
/** Serializable metadata for one export. @public */
export type ExportMetadata<Mime extends MediaType = MediaType, Extension extends string = string> = ViewMetadata<Mime> &
  Readonly<{ extension: Extension }>;
declare const kernelV2Types: unique symbol;
/** Public registration metadata with private author-inference carriers. @public */
export type KernelRegistrationV2<
  Id extends string,
  Extensions extends readonly string[],
  EvaluateSchema,
  Views extends KernelViewDeclarations,
  Exports extends KernelExportDeclarations,
> = KernelPlugin<
  { readonly [Key in keyof Exports as Exports[Key]['extension']]: ExportOptions<Exports[Key]> },
  Record<string, unknown>,
  Id,
  ContentOf<Views[keyof Views]>,
  { readonly [Key in keyof Exports as Exports[Key]['extension']]: ContentOf<Exports[Key]> },
  Extensions,
  EvaluateSchema,
  Views,
  Exports
> & {
  readonly id: Id;
  readonly extensions: Extensions;
  readonly views: { readonly [Key in keyof Views]: ViewMetadata<Views[Key]['mimeType']> };
  readonly exports: {
    readonly [Key in keyof Exports]: ExportMetadata<Exports[Key]['mimeType'], Exports[Key]['extension']>;
  };
  readonly detectImport?: Readonly<{ source: string; flags: string }>;
  readonly builtinModuleNames?: readonly string[];
  readonly options?: Readonly<Record<string, unknown>>;
  /** @internal */
  readonly [kernelV2Types]?: { readonly evaluate: EvaluateSchema; readonly views: Views; readonly exports: Exports };
};

/* oxlint-disable typescript/no-restricted-types -- Empty tuple is the exact no-options call signature. */
type FactoryArguments<Schema> = [Schema] extends [undefined]
  ? []
  : Readonly<Record<never, never>> extends InputOptions<Schema>
    ? [options?: InputOptions<Schema>]
    : [options: InputOptions<Schema>];
/* oxlint-enable typescript/no-restricted-types */
/* oxlint-disable typescript/prefer-function-type, typescript/consistent-type-definitions, typescript/no-restricted-types -- Named callable declaration preserves private carriers and the exact no-options tuple. */
/** Callable kernel factory with exact options and private executable definition. @public */
export interface KernelFactoryV2<
  Id extends string,
  Extensions extends readonly string[],
  OptionsSchema,
  EvaluateSchema,
  Views extends KernelViewDeclarations,
  Exports extends KernelExportDeclarations,
  Definition,
> {
  (
    ...args: FactoryArguments<OptionsSchema>
  ): KernelRegistrationV2<Id, Extensions, EvaluateSchema, Views, Exports> & RuntimePluginDefinitionCarrier<Definition>;
}
/* oxlint-enable typescript/prefer-function-type, typescript/consistent-type-definitions, typescript/no-restricted-types */

const schemaMetadata = (schema: z.ZodType | undefined, label: string): JSONSchema7 | undefined => {
  if (schema === undefined) {
    return undefined;
  }
  try {
    const { $schema: _dialect, ...metadata } = toJSONSchema(schema, { target: 'draft-7', io: 'input' }) as JSONSchema7;
    return metadata;
  } catch (error) {
    throw new Error(`Failed to derive JSON Schema for ${label}.`, { cause: error });
  }
};
// Undefined means the input can accept arbitrary keys, so overlap cannot be ruled out.
const inputOptionKeys = (schema: z.core.$ZodType): string[] | undefined => {
  if (schema instanceof z.ZodPipe) {
    return inputOptionKeys(schema.in);
  }
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable || schema instanceof z.ZodDefault) {
    return inputOptionKeys(schema.unwrap());
  }
  if (schema instanceof z.ZodUnion) {
    const branches = schema.options.map(inputOptionKeys);
    return branches.some((keys) => keys === undefined) ? undefined : branches.flatMap((keys) => keys ?? []);
  }
  if (schema instanceof z.ZodIntersection) {
    const left = inputOptionKeys(schema._zod.def.left);
    const right = inputOptionKeys(schema._zod.def.right);
    return left && right ? [...left, ...right] : undefined;
  }
  if (schema instanceof z.ZodRecord) {
    const { keyType } = schema;
    if (keyType instanceof z.ZodEnum) {
      return keyType.options.map(String);
    }
    if (keyType instanceof z.ZodLiteral) {
      return [...keyType.values].map(String);
    }
    return undefined;
  }
  if (schema instanceof z.ZodObject) {
    const { catchall } = schema._zod.def;
    return catchall && !(catchall instanceof z.ZodNever) ? undefined : Object.keys(schema.shape);
  }
  return undefined;
};
const declarationMetadata = <Declaration extends ViewDeclaration>(
  declaration: Declaration,
  label: string,
): ViewMetadata => ({
  title: declaration.title,
  mimeType: declaration.mimeType,
  ...(declaration.optionsSchema === undefined
    ? {}
    : { optionsSchema: schemaMetadata(declaration.optionsSchema, label) }),
  ...(declaration.content === undefined ? {} : { content: declaration.content }),
  ...(declaration.instances === undefined ? {} : { instances: declaration.instances }),
});

const assertDeclaration = (
  kernelId: string,
  location: Readonly<{ kind: 'view' | 'export'; id: string }>,
  declaration: ViewDeclaration | ExportDeclaration,
): void => {
  const { kind, id } = location;
  const allowed =
    kind === 'view'
      ? ['title', 'mimeType', 'optionsSchema', 'content', 'instances']
      : ['title', 'mimeType', 'extension', 'optionsSchema', 'content'];
  for (const key of Object.keys(declaration)) {
    if (!allowed.includes(key)) {
      throw new TypeError(`Kernel "${kernelId}" ${kind} "${id}" has unknown key "${key}".`);
    }
  }
  if (
    id === '' ||
    typeof declaration.title !== 'string' ||
    declaration.title === '' ||
    typeof declaration.mimeType !== 'string' ||
    declaration.mimeType === ''
  ) {
    throw new TypeError(`Kernel "${kernelId}" ${kind} "${id}" requires a nonempty id, title and mimeType.`);
  }
  if (
    kind === 'export' &&
    (!('extension' in declaration) || typeof declaration.extension !== 'string' || declaration.extension === '')
  ) {
    throw new TypeError(`Kernel "${kernelId}" export "${id}" requires an extension.`);
  }
  if (declaration.optionsSchema !== undefined && !(declaration.optionsSchema instanceof z.ZodType)) {
    throw new TypeError(`Kernel "${kernelId}" ${kind} "${id}" optionsSchema must be a Zod schema.`);
  }
  if (kind === 'view' && Object.hasOwn(declaration, 'instances') && Reflect.get(declaration, 'instances') !== true) {
    throw new TypeError(`Kernel "${kernelId}" view "${id}" instances must be true when declared.`);
  }
};

/**
 * Define a kernel with typed view and export declarations.
 * @param definition - Kernel lifecycle hooks and declarations.
 * @returns A branded factory exposing serializable registration metadata.
 * @public
 */
export function defineKernelV2<
  const Id extends string,
  const Extensions extends readonly string[],
  Context,
  Handle,
  Serialized = unknown,
  OptionsSchema extends z.ZodType | undefined = undefined,
  EvaluateSchema extends z.ZodObject<z.ZodRawShape> | undefined = undefined,
  const Views extends KernelViewDeclarations = Record<never, never>,
  const Exports extends KernelExportDeclarations = Record<never, never>,
>(
  definition: KernelDefinitionV2<
    Id,
    Extensions,
    Context,
    Handle,
    Serialized,
    OptionsSchema,
    EvaluateSchema,
    Views,
    Exports
  >,
): KernelFactoryV2<Id, Extensions, OptionsSchema, EvaluateSchema, Views, Exports, typeof definition> {
  const {
    id,
    extensions,
    detectImport,
    builtinModuleNames,
    builtinPackages,
    permissions,
    views,
    exports,
    ...implementation
  } = definition;
  for (const [viewId, view] of Object.entries(views)) {
    assertDeclaration(id, { kind: 'view', id: viewId }, view);
    const viewOptionsSchema = view.optionsSchema;
    if (definition.evaluateOptionsSchema && viewOptionsSchema) {
      const inputKeys = inputOptionKeys(viewOptionsSchema);
      const evaluateKeys = inputOptionKeys(definition.evaluateOptionsSchema);
      const overlap = evaluateKeys?.find((key) => inputKeys?.includes(key));
      if (overlap) {
        throw new TypeError(`Kernel "${id}" evaluate and view "${viewId}" both declare option "${overlap}".`);
      }
    }
    validateRuntimeContentDeclarations(id, [[`views.${viewId}.content`, view.content]]);
  }
  for (const [exportId, output] of Object.entries(exports)) {
    assertDeclaration(id, { kind: 'export', id: exportId }, output);
    validateRuntimeContentDeclarations(id, [[`exports.${exportId}.content`, output.content]]);
  }
  if (Object.keys(views).length > 0 !== (typeof definition.render === 'function')) {
    throw new TypeError(`Kernel "${id}" render hook must exist exactly when views are declared.`);
  }
  if (Object.keys(exports).length > 0 !== (typeof definition.export === 'function')) {
    throw new TypeError(`Kernel "${id}" export hook must exist exactly when exports are declared.`);
  }
  if ((typeof definition.serializeHandle === 'function') !== (typeof definition.deserializeHandle === 'function')) {
    throw new TypeError(`Kernel "${id}" handle snapshots require both serializeHandle and deserializeHandle.`);
  }
  const viewMetadata = Object.fromEntries(
    Object.entries(views).map(([viewId, view]) => [viewId, declarationMetadata(view, `${id} view ${viewId}`)]),
  ) as { readonly [Key in keyof Views]: ViewMetadata<Views[Key]['mimeType']> };
  const exportMetadata = Object.fromEntries(
    Object.entries(exports).map(([exportId, output]) => [
      exportId,
      { ...declarationMetadata(output, `${id} export ${exportId}`), extension: output.extension },
    ]),
  ) as { readonly [Key in keyof Exports]: ExportMetadata<Exports[Key]['mimeType'], Exports[Key]['extension']> };
  const acceptsOptions = definition.optionsSchema !== undefined;
  const factory = ((options?: Readonly<Record<string, unknown>>) => {
    if (options !== undefined && !acceptsOptions) {
      throw new TypeError(`Kernel "${id}" does not accept options.`);
    }
    return attachRuntimePluginDefinition(
      {
        id,
        extensions,
        ...(detectImport === undefined
          ? {}
          : { detectImport: { source: detectImport.source, flags: detectImport.flags } }),
        ...(builtinModuleNames === undefined ? {} : { builtinModuleNames }),
        ...(builtinPackages === undefined
          ? {}
          : {
              builtinDependencies: Object.fromEntries(
                Object.entries(builtinPackages).map(([name, installed]) => [
                  name,
                  toBuiltinModulePackage(name, installed).spec,
                ]),
              ),
            }),
        ...(permissions === undefined ? {} : { permissions }),
        views: viewMetadata,
        exports: exportMetadata,
        ...(options === undefined ? {} : { options }),
      },
      () => ({ ...implementation, views, exports }),
    );
  }) as unknown as KernelFactoryV2<Id, Extensions, OptionsSchema, EvaluateSchema, Views, Exports, typeof definition>;
  return attachRuntimePluginFactoryOptions(factory, acceptsOptions);
}
