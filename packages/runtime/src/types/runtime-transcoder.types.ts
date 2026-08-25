/**
 * Transcoder Types
 *
 * Types for the transcoder plugin API (defineTranscoder), supporting types for
 * bytes-to-bytes format conversion, statically declared edges, and the transcoder runtime.
 *
 * For kernel types, see runtime-kernel.types.ts.
 * For middleware types, see runtime-middleware.types.ts.
 */

import type { z } from 'zod';
import type { ExportFidelity, ExportFile, FileExtension } from '@taucad/types';
import type { KernelResult } from '#types/runtime.types.js';
import type { RuntimeImplementationAsset, RuntimeLogger } from '#types/runtime-kernel.types.js';
import type { RuntimeSpanTracer } from '#types/runtime-tracer.types.js';
import type { RuntimePluginDeclaration, TranscoderPlugin } from '#plugins/plugin-types.js';
import {
  attachRuntimePluginDefinition,
  attachRuntimePluginFactoryOptions,
} from '#plugins/plugin-runtime-definition.js';
import type { RuntimePluginDefinitionCarrier } from '#plugins/plugin-runtime-definition.js';
import type { ContentKeysOf, RuntimeContentDeclaration, RuntimeContentKey } from '#types/runtime-content.types.js';
import { validateRuntimeContentDeclarations } from '#types/runtime-content.types.js';

// =============================================================================
// Transcoder Edge and Input Types
// =============================================================================

/**
 * A single format conversion capability declared statically by a transcoder.
 *
 * `from`, `to`, and `optionsSchema` are parameterised so that an array of edges
 * declared with `as const` preserves literal types end-to-end. The literal `from`/`to`
 * values flow into {@link TranscodeInput} via the `Edges` generic on
 * {@link TranscoderDefinition}, eliminating the need for `as` casts inside `transcode`.
 *
 * @template From - Source format identifier (literal when declared with `as const`)
 * @template To - Target format identifier (literal when declared with `as const`)
 * @template Schema - Zod schema for per-edge options, or `undefined` when no options are accepted
 * @public
 */
export type TranscoderEdge<
  From extends FileExtension = FileExtension,
  To extends FileExtension = FileExtension,
  Schema extends z.ZodType | undefined = z.ZodType | undefined,
> = {
  from: From;
  to: To;
  fidelity: ExportFidelity;
  optionsSchema?: Schema;
  /** Final content properties this edge preserves or consumes. */
  content?: RuntimeContentDeclaration;
  /** Source-format options pinned by the edge and removed from consumer options. */
  sourceOptions?: Record<string, unknown>;
};

/**
 * Input for a transcoder conversion operation.
 *
 * When `Edges` is a concrete tuple of {@link TranscoderEdge}, `TranscodeInput<Edges>`
 * becomes a discriminated union: narrowing on `input.to` narrows `input.from` to the
 * matching edge's source format and narrows `input.options` to `z.input` of that
 * edge's `optionsSchema` (or `Record<string, unknown>` when no schema is declared).
 *
 * @template Edges - Tuple of declared edges, typically inferred from `as const` literal
 * @public
 */
export type TranscodeInput<Edges extends readonly TranscoderEdge[] = readonly TranscoderEdge[]> = {
  [I in keyof Edges]: Edges[I] extends { from: infer From; to: infer To }
    ? {
        from: From;
        to: To;
        files: ExportFile[];
        options: ResolveEdgeOptions<Edges[I]>;
      }
    : never;
}[number];

/** Resolve the per-edge `options` type from its declared `optionsSchema`, falling back to `Record<string, unknown>`. */
type ResolveEdgeOptions<Edge> = Edge extends { optionsSchema: infer Schema }
  ? [Schema] extends [z.ZodType]
    ? z.input<Schema>
    : Record<string, unknown>
  : Record<string, unknown>;

/**
 * Result of a transcoder conversion operation.
 * @public
 */
export type TranscodeResult = KernelResult<ExportFile[]>;

// =============================================================================
// Transcoder Runtime
// =============================================================================

/**
 * Focused runtime services provided to transcoder methods.
 * Transcoders do not need filesystem access, bundler, or kernel lifecycle services.
 * @public
 */
export type TranscoderRuntime = {
  logger: RuntimeLogger;
  tracer: RuntimeSpanTracer;
  /** Cancellation signal owned by the active export operation. */
  signal: AbortSignal;
};

// =============================================================================
// defineTranscoder API Types
// =============================================================================

/**
 * Definition for a transcoder module loaded via {@link defineTranscoder}.
 *
 * Edges are declared statically via the `edges` property; the framework's route
 * planner consumes them directly (no runtime discovery, no `canTranscode` guard).
 * All type parameters are inferred automatically from `initialize()`, `optionsSchema`,
 * and the literal `edges` array.
 *
 * @template Context - Transcoder-specific context type, inferred from initialize() return
 * @template Options - Validated options type, inferred from optionsSchema when provided
 * @template Edges - Tuple of declared edges, inferred from the `edges` literal
 * @public
 */
export type TranscoderDefinition<
  Context = unknown,
  Options extends Record<string, unknown> = Record<string, unknown>,
  Edges extends readonly TranscoderEdge[] = readonly TranscoderEdge[],
> = {
  /** Human-readable transcoder name, used in logs and error messages */
  name: string;
  /** Semantic version string for diagnostics */
  version: string;

  /** Selected implementation assets whose verified digests participate in artifact identity. */
  implementationAssets?: readonly RuntimeImplementationAsset[];

  /** Zod schema for validating and typing transcoder options */
  optionsSchema?: z.ZodType<Options>;

  /**
   * Statically declared format conversion edges. Declare with `as const` so the
   * compiler preserves literal `from`/`to` values for use in `transcode`.
   */
  edges: Edges;

  /** Initialize transcoder with typed options */
  initialize(options: Options, runtime: Omit<TranscoderRuntime, 'signal'>): Promise<Context>;

  /** Execute the format conversion */
  transcode(input: TranscodeInput<Edges>, runtime: TranscoderRuntime, context: Context): Promise<TranscodeResult>;

  /** Tear down transcoder resources */
  cleanup?(context: Context): Promise<void>;
};

type TranscoderDefinitionConfig<
  Id extends string,
  Context,
  Options extends Record<string, unknown>,
  Edges extends readonly TranscoderEdge[],
> = RuntimePluginDeclaration & {
  /** Unique identifier for this transcoder plugin. */
  id: Id;
  /** Human-readable transcoder name, used in logs and error messages */
  name: string;
  /** Semantic version string for diagnostics */
  version: string;
  /** Selected implementation assets. */
  implementationAssets?: readonly RuntimeImplementationAsset[];
  /** Statically declared format conversion edges. */
  edges: Edges;
  /** Initialize transcoder with typed options */
  initialize(options: Options, runtime: Omit<TranscoderRuntime, 'signal'>): Promise<Context>;
  /** Execute the format conversion */
  transcode(input: TranscodeInput<Edges>, runtime: TranscoderRuntime, context: Context): Promise<TranscodeResult>;
  /** Tear down transcoder resources */
  cleanup?(context: Context): Promise<void>;
};

type EdgeOptionMap<Edges extends readonly TranscoderEdge[]> = {
  [Edge in Edges[number] as Edge['to'] & string]: ResolveEdgeOptions<Edge>;
};

type SourceFormat<Edges extends readonly TranscoderEdge[]> = Edges[number]['from'] & string;

type EdgeContentMap<Edges extends readonly TranscoderEdge[]> = {
  [Edge in Edges[number] as Edge['to'] & string]: Edge extends { content: infer Content }
    ? ContentKeysOf<Content>
    : never;
};

type EdgePinnedSourceOptionsMap<Edges extends readonly TranscoderEdge[]> = {
  [Edge in Edges[number] as Edge['to'] & string]: Edge extends { sourceOptions: infer SourceOptions }
    ? keyof SourceOptions
    : never;
};

/* oxlint-disable typescript/prefer-function-type, typescript/consistent-type-definitions, typescript/no-restricted-types -- Named callable type keeps private unique-symbol carriers nameable in emitted declarations; [] is the exact no-options tuple. */
/** @public */
export interface TranscoderPluginFactory<
  Id extends string,
  EdgeMap extends Record<string, unknown>,
  From extends string,
  Options = undefined,
  ContentMap extends Record<string, RuntimeContentKey> = Record<string, RuntimeContentKey>,
  PinnedSourceOptionsMap extends Record<string, PropertyKey> = Record<string, PropertyKey>,
> {
  (
    ...options: Options extends undefined
      ? []
      : Partial<Options> extends Options
        ? [options?: Options]
        : [options: Options]
  ): TranscoderPlugin<EdgeMap, From, Id, ContentMap, PinnedSourceOptionsMap> &
    RuntimePluginDefinitionCarrier<TranscoderDefinition>;
}
/* oxlint-enable typescript/prefer-function-type, typescript/consistent-type-definitions, typescript/no-restricted-types */

/**
 * Define a transcoder module with full type inference.
 * All type parameters are inferred automatically -- no explicit type arguments needed.
 *
 * Declare `edges` with `as const` to preserve literal `from`/`to` values; the framework
 * builds its capabilities manifest directly from this static array.
 *
 * @param definition - The transcoder definition object implementing all required lifecycle methods
 * @returns The same definition, typed as {@link TranscoderDefinition}
 *
 * @public
 *
 * @example <caption>Defining a format converter transcoder</caption>
 * ```typescript
 * import { defineTranscoder } from '@taucad/runtime';
 *
 * export const myTranscoder = defineTranscoder({
 *   id: 'my-transcoder',
 *   name: 'MyTranscoder',
 *   version: '1.0.0',
 *   edges: [
 *     { from: 'glb', to: 'usdz', fidelity: 'mesh' },
 *     { from: 'glb', to: 'stl', fidelity: 'mesh' },
 *   ] as const,
 *   async initialize(options, runtime) {
 *     return {};
 *   },
 *   async transcode(input, runtime, context) {
 *     // input.from is 'glb', input.to is 'usdz' | 'stl' (literal narrowing)
 *     return { success: true, data: input.files, issues: [] };
 *   },
 *   async cleanup(context) {},
 * });
 * ```
 */
export function defineTranscoder<
  const Id extends string,
  Context,
  OptionsSchema extends z.ZodType = z.ZodType,
  const Edges extends readonly TranscoderEdge[] = readonly TranscoderEdge[],
>(
  definition: TranscoderDefinitionConfig<Id, Context, z.output<OptionsSchema> & Record<string, unknown>, Edges> & {
    optionsSchema: OptionsSchema;
  },
): TranscoderPluginFactory<
  Id,
  EdgeOptionMap<Edges>,
  SourceFormat<Edges>,
  z.input<OptionsSchema>,
  EdgeContentMap<Edges>,
  EdgePinnedSourceOptionsMap<Edges>
>;
export function defineTranscoder<
  const Id extends string,
  Context,
  const Edges extends readonly TranscoderEdge[] = readonly TranscoderEdge[],
>(
  definition: TranscoderDefinitionConfig<Id, Context, Record<string, unknown>, Edges> & {
    optionsSchema?: undefined;
  },
): TranscoderPluginFactory<
  Id,
  EdgeOptionMap<Edges>,
  SourceFormat<Edges>,
  undefined,
  EdgeContentMap<Edges>,
  EdgePinnedSourceOptionsMap<Edges>
>;
/** @public */
export function defineTranscoder(
  definition: TranscoderDefinitionConfig<string, unknown, Record<string, unknown>, readonly TranscoderEdge[]>,
): TranscoderPluginFactory<string, Record<string, unknown>, string, Record<string, unknown>> {
  const acceptsOptions =
    Object.hasOwn(definition, 'optionsSchema') && Reflect.get(definition, 'optionsSchema') !== undefined;
  const { id, permissions, ...transcoderDefinition } = definition;
  validateRuntimeContentDeclarations(
    id,
    transcoderDefinition.edges.map((edge, index) => [`edges.${index}.content`, edge.content] as const),
  );
  const factory = ((options?: Record<string, unknown>) => {
    if (options !== undefined && !acceptsOptions) {
      throw new TypeError(`Transcoder "${id}" does not accept options.`);
    }
    return attachRuntimePluginDefinition(
      {
        id,
        edges: transcoderDefinition.edges.map(({ from, to }) => ({ from, to })),
        ...(permissions === undefined ? {} : { permissions }),
        options,
      },
      () => transcoderDefinition,
    );
  }) as TranscoderPluginFactory<string, Record<string, unknown>, string, Record<string, unknown>>;
  return attachRuntimePluginFactoryOptions(factory, acceptsOptions);
}
