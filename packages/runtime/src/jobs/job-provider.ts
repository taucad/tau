import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec';
import type { RootedFileSystem } from '@taucad/filesystem';
import type { ContentDigest } from '@taucad/cache-core';

import { materializeConfigurationJsonSchema } from '#configuration/configuration.js';
import { admitJsonSchema } from '@taucad/parameters/schema';
import type { ConfigurationDefinition, ConfigurationManifestV1, JsonSchema } from '#configuration/index.js';
import { cloneBoundedJson } from '@taucad/parameters/json';
import type { HostCapabilityRequirement } from '#host/capability-matching.js';
import {
  attachRuntimePluginDefinition,
  attachRuntimePluginFactoryOptions,
} from '#plugins/plugin-runtime-definition.js';
import type { RuntimePluginDefinitionCarrier } from '#plugins/plugin-runtime-definition.js';

import type { JobInput, JobReference, JobRevision } from '#jobs/job-contract.js';

/** Bounded family of artifacts a provider may publish. @public */
export type JobArtifactDeclaration = Readonly<{
  role: string;
  mediaTypes: readonly string[];
  minimum: number;
  maximum: number;
}>;

/** Honest recovery behavior declared by a provider. @public */
export type JobRecoveryDescriptor =
  | Readonly<{ type: 'restart-from-input' }>
  | Readonly<{ type: 'checkpoint'; format: string; formatVersion: number; metadataSchema: JsonSchema }>
  | Readonly<{ type: 'reconcile-external-effect' }>;

/** Serializable schema descriptor for a provider-owned extension. @public */
export type JobExtensionDescriptor<Name extends string = string> = Readonly<{
  name: Name;
  inputSchema: JsonSchema;
  resultSchema: JsonSchema;
}>;

/** Delivery semantics required for a declared stateful command. @public */
export type JobCommandReplayPolicy = 'replay-safe' | 'reconcile-required' | 'non-replayable';

/** Serializable command descriptor including crash-boundary semantics. @public */
export type JobCommandDescriptor<Name extends string = string> = JobExtensionDescriptor<Name> &
  Readonly<{ replayPolicy: JobCommandReplayPolicy }>;

/** Complete JSON-safe provider descriptor used for discovery and admission. @public */
export type JobProviderDescriptor<
  Id extends string = string,
  Kind extends string = string,
  QueryName extends string = string,
  CommandName extends string = string,
> = Readonly<{
  id: Id;
  kind: Kind;
  version: string;
  kindVersion: number;
  configuration: ConfigurationManifestV1;
  resultSchema: JsonSchema;
  recovery: JobRecoveryDescriptor;
  requirements: readonly HostCapabilityRequirement[];
  artifacts: readonly JobArtifactDeclaration[];
  queries: ReadonlyArray<JobExtensionDescriptor<QueryName>>;
  commands: ReadonlyArray<JobCommandDescriptor<CommandName>>;
}>;

/** Plain provider selection metadata safe to serialize across runtime boundaries. @public */
export type JobProviderRegistration<Id extends string = string, Kind extends string = string> = JobProviderDescriptor<
  Id,
  Kind
>;

/** Bounded progress sample; an absent total means the provider does not know it. @public */
export type JobProgressUpdate = Readonly<{
  phase: string;
  completed?: number;
  total?: number;
  message?: string;
}>;

/** Bounded structured provider log entry. @public */
export type JobLogEntry = Readonly<{
  level: 'debug' | 'info' | 'warning' | 'error';
  message: string;
}>;

/** Immutable artifact reference returned after host-authoritative publication. @public */
export type JobPublishedArtifact = Readonly<{
  id: string;
  role: string;
  path: string;
  mediaType: string;
  length: number;
  digest: ContentDigest;
}>;

/** Typed checkpoint publication input for providers that declare checkpoint recovery. @public */
export type JobCheckpointPublication<Metadata> = Readonly<{
  paths: readonly string[];
  metadata: Metadata;
  parent?: JobRevision;
}>;

/** Canonical host-owned services available to one fenced attempt. @public */
export type JobProviderAttemptServices<CheckpointMetadata = never> = Readonly<{
  job: JobReference;
  attemptId: string;
  signal: AbortSignal;
  workspace: RootedFileSystem;
  publishCheckpoint: [CheckpointMetadata] extends [never]
    ? undefined
    : (input: JobCheckpointPublication<CheckpointMetadata>) => Promise<JobRevision>;
  reportProgress(update: JobProgressUpdate): Promise<void>;
  writeLog(entry: JobLogEntry): Promise<void>;
  publishArtifact(input: Readonly<{ role: string; path: string; mediaType: string }>): Promise<JobPublishedArtifact>;
}>;

/** One schema-declared read-only provider query. @public */
export type JobQueryDefinition<
  Name extends string,
  InputSchema extends StandardJSONSchemaV1 & StandardSchemaV1,
  ResultSchema extends StandardJSONSchemaV1 & StandardSchemaV1,
> = Readonly<{
  name: Name;
  inputSchema: InputSchema;
  resultSchema: ResultSchema;
  query(input: StandardSchemaV1.InferOutput<InputSchema>): Promise<StandardSchemaV1.InferInput<ResultSchema>>;
}>;

/** One schema-declared stateful command with explicit replay semantics. @public */
export type JobCommandDefinition<
  Name extends string,
  InputSchema extends StandardJSONSchemaV1 & StandardSchemaV1,
  ResultSchema extends StandardJSONSchemaV1 & StandardSchemaV1,
> = Readonly<{
  name: Name;
  inputSchema: InputSchema;
  resultSchema: ResultSchema;
  replayPolicy: JobCommandReplayPolicy;
  command(
    input: Readonly<{
      commandId: string;
      expectedRevision: number;
      value: StandardSchemaV1.InferOutput<InputSchema>;
    }>,
    services: JobProviderAttemptServices,
  ): Promise<StandardSchemaV1.InferInput<ResultSchema>>;
}>;

/** Preserve one query's name and schema-correlated handler types for a provider tuple.
 * @param definition - One schema-bearing query and its handler.
 * @returns The unchanged typed query definition.
 * @public
 */
export const defineJobQuery = <
  const Name extends string,
  InputSchema extends ProviderSchema,
  ResultSchema extends ProviderSchema,
>(
  definition: JobQueryDefinition<Name, InputSchema, ResultSchema>,
): JobQueryDefinition<Name, InputSchema, ResultSchema> => definition;

/** Preserve one command's name and schema-correlated handler types for a provider tuple.
 * @param definition - One schema-bearing command and its handler.
 * @returns The unchanged typed command definition.
 * @public
 */
export const defineJobCommand = <
  const Name extends string,
  InputSchema extends ProviderSchema,
  ResultSchema extends ProviderSchema,
>(
  definition: JobCommandDefinition<Name, InputSchema, ResultSchema>,
): JobCommandDefinition<Name, InputSchema, ResultSchema> => definition;

/** Input passed to one trusted provider implementation after authoritative admission. @public */
export type JobProviderExecuteInput<Configuration> = Readonly<{
  input: JobInput;
  configuration: Configuration;
}>;

/** Admitted checkpoint context supplied only to checkpoint-capable providers. @public */
export type JobProviderResumeContext<Metadata> = Readonly<{
  revision: JobRevision;
  metadata: Metadata;
}>;

type ProviderSchema = StandardJSONSchemaV1 & StandardSchemaV1;
type JobQuerySchemas = Readonly<{
  name: string;
  inputSchema: ProviderSchema;
  resultSchema: ProviderSchema;
  query: unknown;
}>;
type JobCommandSchemas = Readonly<{
  name: string;
  inputSchema: ProviderSchema;
  resultSchema: ProviderSchema;
  replayPolicy: JobCommandReplayPolicy;
  command: unknown;
}>;
type JobQueryDefinitionFor<Value> =
  Value extends Readonly<{
    name: infer Name extends string;
    inputSchema: infer InputSchema extends ProviderSchema;
    resultSchema: infer ResultSchema extends ProviderSchema;
  }>
    ? JobQueryDefinition<Name, InputSchema, ResultSchema>
    : never;

type JobCommandDefinitionFor<Value> =
  Value extends Readonly<{
    name: infer Name extends string;
    inputSchema: infer InputSchema extends ProviderSchema;
    resultSchema: infer ResultSchema extends ProviderSchema;
  }>
    ? JobCommandDefinition<Name, InputSchema, ResultSchema>
    : never;

type JobQueryDefinitions<Queries extends readonly JobQuerySchemas[]> = Readonly<{
  [Index in keyof Queries]: JobQueryDefinitionFor<Queries[Index]>;
}>;

type JobCommandDefinitions<Commands extends readonly JobCommandSchemas[]> = Readonly<{
  [Index in keyof Commands]: JobCommandDefinitionFor<Commands[Index]>;
}>;

type ExtensionName<Extensions extends ReadonlyArray<{ readonly name: string }>> =
  Extensions[number] extends Readonly<{
    name: infer Name extends string;
  }>
    ? Name
    : never;

/** Trusted schema-bearing provider definition retained inside the runtime host. @public */
export type JobProviderDefinition<
  Id extends string,
  Kind extends string,
  ConfigurationSchema extends StandardSchemaV1,
  ResultSchema extends ProviderSchema,
  CheckpointSchema extends ProviderSchema | undefined = undefined,
  Queries extends readonly JobQuerySchemas[] = readonly never[],
  Commands extends readonly JobCommandSchemas[] = readonly never[],
> = Readonly<{
  id: Id;
  kind: Kind;
  version: string;
  kindVersion: number;
  configuration: ConfigurationDefinition<ConfigurationSchema>;
  resultSchema: ResultSchema;
  recovery:
    | Readonly<{ type: 'restart-from-input' }>
    | Readonly<{
        type: 'checkpoint';
        format: string;
        formatVersion: number;
        metadataSchema: Exclude<CheckpointSchema, undefined>;
        compatible(metadata: StandardSchemaV1.InferOutput<Exclude<CheckpointSchema, undefined>>): boolean;
      }>
    | Readonly<{ type: 'reconcile-external-effect' }>;
  requirements?: readonly HostCapabilityRequirement[];
  artifacts?: readonly JobArtifactDeclaration[];
  queries?: Queries & JobQueryDefinitions<Queries>;
  commands?: Commands & JobCommandDefinitions<Commands>;
  execute(
    input: JobProviderExecuteInput<StandardSchemaV1.InferOutput<ConfigurationSchema>> &
      (CheckpointSchema extends ProviderSchema
        ? Readonly<{ resume?: JobProviderResumeContext<StandardSchemaV1.InferOutput<CheckpointSchema>> }>
        : Readonly<Record<never, never>>),
    services: JobProviderAttemptServices<
      CheckpointSchema extends ProviderSchema ? StandardSchemaV1.InferInput<CheckpointSchema> : never
    >,
  ): Promise<StandardSchemaV1.InferInput<ResultSchema>>;
}>;

/* oxlint-disable typescript/prefer-function-type, typescript/consistent-type-definitions -- Named callable type keeps the shared private-symbol carrier nameable in emitted declarations. */
/** Callable provider capability factory using the shared runtime plugin ABI. @public */
export interface JobProviderFactory<
  Id extends string,
  Kind extends string,
  Definition,
  QueryName extends string = never,
  CommandName extends string = never,
> {
  (): JobProviderDescriptor<Id, Kind, QueryName, CommandName> & RuntimePluginDefinitionCarrier<Definition>;
}
/* oxlint-enable typescript/prefer-function-type, typescript/consistent-type-definitions */

const assertIdentity = (value: string, field: string): void => {
  if (value.length === 0 || value.length > 256 || !value.isWellFormed()) {
    throw new TypeError(`defineJobProvider: ${field} is invalid.`);
  }
};

const freezeJson = <Value>(value: Value): Value => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      freezeJson(child);
    }
    Object.freeze(value);
  }
  return value;
};

const schemaInput = (schema: ProviderSchema): JsonSchema => {
  const candidate = materializeConfigurationJsonSchema(schema['~standard'].jsonSchema.input({ target: 'draft-07' }));
  admitJsonSchema(candidate);
  return candidate;
};

const schemaOutput = (schema: ProviderSchema): JsonSchema => {
  const candidate = materializeConfigurationJsonSchema(schema['~standard'].jsonSchema.output({ target: 'draft-07' }));
  admitJsonSchema(candidate);
  return candidate;
};

const extensionDescriptor = <Name extends string>(
  definition: Readonly<{ name: Name; inputSchema: ProviderSchema; resultSchema: ProviderSchema }>,
): JobExtensionDescriptor<Name> => ({
  name: definition.name,
  inputSchema: schemaInput(definition.inputSchema),
  resultSchema: schemaOutput(definition.resultSchema),
});

const isCapabilityScalar = (value: unknown): value is boolean | number | string =>
  typeof value === 'boolean' || typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const assertRecovery = (recovery: unknown): void => {
  if (!isRecord(recovery) || !Object.hasOwn(recovery, 'type')) {
    throw new TypeError('defineJobProvider: recovery declaration is invalid.');
  }
  const { type } = recovery;
  if (type === 'restart-from-input' || type === 'reconcile-external-effect') {
    return;
  }
  if (type !== 'checkpoint') {
    throw new TypeError('defineJobProvider: recovery type is invalid.');
  }
  const { compatible, format, formatVersion } = recovery;
  if (
    typeof format !== 'string' ||
    format.length === 0 ||
    format.length > 256 ||
    typeof formatVersion !== 'number' ||
    !Number.isSafeInteger(formatVersion) ||
    formatVersion < 1 ||
    typeof compatible !== 'function'
  ) {
    throw new TypeError('defineJobProvider: checkpoint recovery declaration is invalid.');
  }
};

const assertRequirement = (requirement: unknown): void => {
  if (!isRecord(requirement)) {
    throw new TypeError('defineJobProvider: requirement is invalid.');
  }
  const { condition, key, value, values } = requirement;
  if (typeof key !== 'string' || key.length === 0 || key.length > 256) {
    throw new TypeError('defineJobProvider: requirement key is invalid.');
  }
  if (condition === 'equals') {
    if (!isCapabilityScalar(value)) {
      throw new TypeError('defineJobProvider: requirement values must be finite JSON scalars.');
    }
    return;
  }
  if (condition === 'one-of') {
    if (!Array.isArray(values) || values.length === 0 || values.some((value) => !isCapabilityScalar(value))) {
      throw new TypeError('defineJobProvider: one-of requirements need non-empty finite JSON scalars.');
    }
    return;
  }
  if (condition !== 'at-least' || typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError('defineJobProvider: requirement condition or value is invalid.');
  }
};

// oxlint-disable-next-line eslint/complexity -- One definition pass enforces the closed descriptor limits.
const assertDeclarations = (definition: {
  readonly queries?: ReadonlyArray<JobQueryDefinition<string, ProviderSchema, ProviderSchema>>;
  readonly commands?: ReadonlyArray<JobCommandDefinition<string, ProviderSchema, ProviderSchema>>;
  readonly artifacts?: readonly JobArtifactDeclaration[];
  readonly requirements?: readonly HostCapabilityRequirement[];
}): void => {
  const names = [...(definition.queries ?? []), ...(definition.commands ?? [])].map(({ name }) => name);
  if (
    names.length > 128 ||
    names.some((name) => typeof name !== 'string' || name.length === 0 || name.length > 256) ||
    new Set(names).size !== names.length
  ) {
    throw new TypeError('defineJobProvider: extension names must be non-empty and unique.');
  }
  for (const artifact of definition.artifacts ?? []) {
    if (
      typeof artifact.role !== 'string' ||
      artifact.role.length === 0 ||
      artifact.role.length > 256 ||
      artifact.mediaTypes.length === 0 ||
      artifact.mediaTypes.length > 64 ||
      artifact.mediaTypes.some(
        (mediaType) => typeof mediaType !== 'string' || mediaType.length === 0 || mediaType.length > 256,
      ) ||
      new Set(artifact.mediaTypes).size !== artifact.mediaTypes.length ||
      artifact.minimum < 0 ||
      artifact.maximum < artifact.minimum ||
      !Number.isSafeInteger(artifact.minimum) ||
      !Number.isSafeInteger(artifact.maximum)
    ) {
      throw new TypeError('defineJobProvider: artifact declarations must be bounded and non-empty.');
    }
  }
  for (const command of definition.commands ?? []) {
    if (!['replay-safe', 'reconcile-required', 'non-replayable'].includes(command.replayPolicy)) {
      throw new TypeError('defineJobProvider: command replay policy is invalid.');
    }
  }
  if ((definition.artifacts?.length ?? 0) > 128 || (definition.requirements?.length ?? 0) > 128) {
    throw new TypeError('defineJobProvider: declaration count exceeds the provider limit.');
  }
  for (const requirement of definition.requirements ?? []) {
    assertRequirement(requirement);
  }
};

/**
 * Define one schema-bearing job provider as a runtime capability factory.
 *
 * The invoked factory exposes only provider-selection metadata. Trusted schemas
 * and executable functions remain behind the runtime's shared non-enumerable
 * definition loader and are resolved only by the host.
 *
 * @param definition - Provider identity, semantic kind, schemas, and implementation.
 * @returns A zero-argument provider capability factory.
 * @public
 */
export const defineJobProvider = <
  const Id extends string,
  const Kind extends string,
  ConfigurationSchema extends StandardSchemaV1,
  ResultSchema extends ProviderSchema,
  CheckpointSchema extends ProviderSchema | undefined = undefined,
  const Queries extends readonly JobQuerySchemas[] = readonly never[],
  const Commands extends readonly JobCommandSchemas[] = readonly never[],
>(
  definition: JobProviderDefinition<Id, Kind, ConfigurationSchema, ResultSchema, CheckpointSchema, Queries, Commands>,
): JobProviderFactory<Id, Kind, typeof definition, ExtensionName<Queries>, ExtensionName<Commands>> => {
  assertIdentity(definition.id, 'id');
  assertIdentity(definition.kind, 'kind');
  assertIdentity(definition.version, 'version');
  if (!Number.isSafeInteger(definition.kindVersion) || definition.kindVersion < 1) {
    throw new TypeError('defineJobProvider: kindVersion must be a positive safe integer.');
  }
  assertRecovery(definition.recovery);
  assertDeclarations(definition);

  const recovery: JobRecoveryDescriptor =
    definition.recovery.type === 'checkpoint'
      ? {
          type: 'checkpoint',
          format: definition.recovery.format,
          formatVersion: definition.recovery.formatVersion,
          metadataSchema: schemaOutput(definition.recovery.metadataSchema),
        }
      : { type: definition.recovery.type };
  const descriptor = {
    id: definition.id,
    kind: definition.kind,
    version: definition.version,
    kindVersion: definition.kindVersion,
    configuration: definition.configuration.manifest,
    resultSchema: schemaOutput(definition.resultSchema),
    recovery,
    requirements: definition.requirements ?? [],
    artifacts: definition.artifacts ?? [],
    queries: (definition.queries ?? []).map((query) => extensionDescriptor(query)),
    commands: (definition.commands ?? []).map((command) => ({
      ...extensionDescriptor(command),
      replayPolicy: command.replayPolicy,
    })),
  };

  const owned = cloneBoundedJson(descriptor, {
    code: 'JOB_PROVIDER_DESCRIPTOR',
    maximumDepth: 32,
    maximumNodes: 16_384,
    maximumCharacters: 524_288,
  }) as JobProviderDescriptor<Id, Kind, ExtensionName<Queries>, ExtensionName<Commands>>;
  const factory = () => freezeJson(attachRuntimePluginDefinition(structuredClone(owned), () => definition));
  return attachRuntimePluginFactoryOptions(factory, false);
};
