import type { z } from 'zod';
import type { MiddlewarePlugin, RuntimePluginDeclaration } from '#plugins/plugin-types.js';
import {
  attachRuntimePluginDefinition,
  attachRuntimePluginFactoryOptions,
} from '#plugins/plugin-runtime-definition.js';
import type { RuntimePluginDefinitionCarrier } from '#plugins/plugin-runtime-definition.js';
import { validateRuntimeContentDeclarations } from '#types/runtime-content.types.js';
import type {
  ExportContentMap,
  KernelMiddlewareV2,
  MiddlewareContent,
  ViewContentKeys,
  ViewContentMap,
} from '#types/runtime-middleware-v2.types.js';

// oxlint-disable-next-line @typescript-eslint/no-empty-object-type -- Empty Zod object is the no-state/no-options default.
type EmptyObjectSchema = z.ZodObject<{}>;

type DefinitionConfig<
  Id extends string,
  StateSchema extends z.ZodObject<z.ZodRawShape>,
  OptionsSchema extends z.ZodObject<z.ZodRawShape>,
  Content extends MiddlewareContent | undefined,
> = Omit<KernelMiddlewareV2<StateSchema, OptionsSchema, Content>, 'version' | 'optionsSchema'> &
  RuntimePluginDeclaration & {
    readonly id: Id;
    readonly version?: string;
    readonly optionsSchema?: OptionsSchema;
  };

/* oxlint-disable typescript/no-restricted-types -- Empty tuple models a zero-argument factory. */
type FactoryArgs<Options> = [Options] extends [undefined]
  ? []
  : Readonly<Record<never, never>> extends Options
    ? [options?: Options]
    : [options: Options];
/* oxlint-enable typescript/no-restricted-types */

/* oxlint-disable typescript/prefer-function-type, typescript/consistent-type-definitions, typescript/no-restricted-types -- Named callable preserves a typed private definition carrier and exact option tuple. */
/** Callable middleware factory with options and a private implementation slot. @public */
export interface MiddlewarePluginFactoryV2<
  Id extends string,
  Options,
  StateSchema extends z.ZodObject<z.ZodRawShape>,
  OptionsSchema extends z.ZodObject<z.ZodRawShape>,
  Content extends MiddlewareContent | undefined,
> {
  (
    ...args: FactoryArgs<Options>
  ): MiddlewarePlugin<Id, ViewContentKeys<Content>, ExportContentMap<Content>, ViewContentMap<Content>> &
    RuntimePluginDefinitionCarrier<KernelMiddlewareV2<StateSchema, OptionsSchema, Content>>;
}
/* oxlint-enable typescript/prefer-function-type, typescript/consistent-type-definitions, typescript/no-restricted-types */

/**
 * Middleware authoring factory for the describe/evaluate/render/write contract.
 * @param definition - Typed middleware hooks and declaration metadata.
 * @returns A branded factory with private executable hooks.
 * @public
 */
export function defineMiddlewareV2<
  const Id extends string,
  StateSchema extends z.ZodObject<z.ZodRawShape> = EmptyObjectSchema,
  const Content extends MiddlewareContent | undefined = undefined,
>(
  definition: DefinitionConfig<Id, StateSchema, EmptyObjectSchema, Content> & {
    readonly optionsSchema?: undefined;
    readonly content?: Content;
  },
): MiddlewarePluginFactoryV2<Id, undefined, StateSchema, EmptyObjectSchema, Content>;
export function defineMiddlewareV2<
  const Id extends string,
  StateSchema extends z.ZodObject<z.ZodRawShape> = EmptyObjectSchema,
  OptionsSchema extends z.ZodObject<z.ZodRawShape> = EmptyObjectSchema,
  const Content extends MiddlewareContent | undefined = undefined,
>(
  definition: DefinitionConfig<Id, StateSchema, OptionsSchema, Content> & {
    readonly optionsSchema: OptionsSchema;
    readonly content?: Content;
  },
): MiddlewarePluginFactoryV2<Id, z.input<OptionsSchema>, StateSchema, OptionsSchema, Content>;
/**
 * Build the runtime registration from a validated middleware definition.
 * @param definition - Middleware authoring definition.
 * @returns A branded middleware factory.
 * @public
 */
export function defineMiddlewareV2(definition: unknown): unknown {
  const { id, permissions, ...implementation } = definition as DefinitionConfig<
    string,
    z.ZodObject<z.ZodRawShape>,
    z.ZodObject<z.ZodRawShape>,
    MiddlewareContent | undefined
  >;
  validateRuntimeContentDeclarations(id, [
    ...Object.entries(implementation.content?.views ?? {}).map(
      ([mediaType, declaration]) => [`content.views.${mediaType}`, declaration] as const,
    ),
    ...Object.entries(implementation.content?.exports ?? {}).map(
      ([extension, declaration]) => [`content.exports.${extension}`, declaration] as const,
    ),
  ]);
  if (implementation.mutates === false && implementation.resolve) {
    throw new Error(`Middleware "${id}" cannot declare resolve when mutates is false.`);
  }
  const factory = ((options?: Record<string, unknown>) => {
    if (options !== undefined && implementation.optionsSchema === undefined) {
      throw new TypeError(`Middleware "${id}" does not accept options.`);
    }
    return attachRuntimePluginDefinition(
      { id, ...(permissions === undefined ? {} : { permissions }), ...(options === undefined ? {} : { options }) },
      () => ({ ...implementation, version: implementation.version ?? '1' }),
    );
  }) as MiddlewarePluginFactoryV2<
    string,
    unknown,
    z.ZodObject<z.ZodRawShape>,
    z.ZodObject<z.ZodRawShape>,
    MiddlewareContent | undefined
  >;
  return attachRuntimePluginFactoryOptions(factory, implementation.optionsSchema !== undefined);
}
