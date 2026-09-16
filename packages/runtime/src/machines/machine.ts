import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec';
import type { ContentDigest } from '@taucad/cache-core';

import { cloneBoundedJson } from '@taucad/parameters/json';
import { materializeConfigurationJsonSchema } from '#configuration/configuration.js';
import type { ConfigurationDefinition, ConfigurationManifestV1, JsonSchema } from '#configuration/index.js';
import { admitJsonSchema } from '@taucad/parameters/schema';
import type { JobRevision } from '#jobs/job-contract.js';
import {
  attachRuntimePluginDefinition,
  attachRuntimePluginFactoryOptions,
} from '#plugins/plugin-runtime-definition.js';
import type { RuntimePluginDefinitionCarrier } from '#plugins/plugin-runtime-definition.js';

/** Semantic container contract accepted by a machine provider. @public */
export type MachineAcceptedContainer = Readonly<{
  contract: Readonly<{ id: string; version: number }>;
  mediaType: string;
  requiredMembers: readonly string[];
  payloadSelection: 'plate' | 'single';
  technology: string;
}>;

/** Serializable schema declaration for one provider-owned catalog query. @public */
export type MachineQueryManifest = Readonly<{
  inputSchema: JsonSchema;
  resultSchema: JsonSchema;
}>;

/** Frozen serializable machine-provider registration metadata. @public */
export type MachineProvider<Id extends string = string, QueryName extends string = string> = Readonly<{
  id: Id;
  name: string;
  version: string;
  protocolVersion: 1;
  vendor: string;
  technologies: readonly string[];
  accepts: readonly MachineAcceptedContainer[];
  bindingConfiguration: ConfigurationManifestV1;
  submissionConfiguration: ConfigurationManifestV1;
  queries: Readonly<Record<QueryName, MachineQueryManifest>>;
}>;

/** Clock authority available to machine providers. @public */
export type MachineClock = Readonly<{ now(): string }>;

/** Redacted provider log entry. @public */
export type MachineLogEntry = Readonly<{ level: 'debug' | 'error' | 'info' | 'warning'; message: string }>;

/** Host-approved certificate trust for one machine service. @public */
export type MachineTransportTrust = Readonly<{ type: 'system' }> | Readonly<{ type: 'pinned'; digest: ContentDigest }>;

/** Bounded transport request delegated to a host-owned network adapter. @public */
export type MachineNetworkRequest = Readonly<{
  endpoint: Readonly<{ address: string; port: number }>;
  transport: 'tcp' | 'tls';
  trust: MachineTransportTrust;
  /** Milliseconds. */
  connectTimeout: number;
  /** Milliseconds. */
  idleTimeout: number;
  maximumReadBytes: number;
  maximumWriteBytes: number;
  signal: AbortSignal;
}>;

/** Host-owned bounded byte stream; protocol framing remains provider-owned. @public */
export type MachineNetworkStream = Readonly<{
  readable: AsyncIterable<Uint8Array<ArrayBuffer>>;
  write(chunk: Uint8Array<ArrayBuffer>): Promise<void>;
  close(): Promise<void>;
}>;

/** User-initiated bounded datagram-listener request. @public */
export type MachineDatagramListenInput = Readonly<{
  port: number;
  durationMs: number;
  maximumDatagrams: number;
  maximumDatagramBytes: number;
  signal: AbortSignal;
}>;

/** One untrusted datagram delivered with its observed peer. @public */
export type MachineDatagram = Readonly<{
  bytes: Uint8Array<ArrayBuffer>;
  peer: Readonly<{ address: string; port: number }>;
}>;

/** Qualified immutable prepared-artifact identity. @public */
export type MachineArtifactReference = Readonly<{
  revision: JobRevision;
  path: string;
  digest: ContentDigest;
  length: number;
  mediaType: string;
  contract: Readonly<{ id: string; version: number }>;
}>;

/** Host-owned bounded artifact streaming request. @public */
export type MachineArtifactReadInput = Readonly<{
  artifact: MachineArtifactReference;
  maximumBytes: number;
  signal: AbortSignal;
}>;

/** Least-privilege services available during discovery. @public */
export type MachineDiscoveryRuntime = Readonly<{
  clock: MachineClock;
  listenDatagrams(input: MachineDatagramListenInput): AsyncIterable<MachineDatagram>;
}>;

/** Host-owned services available only while establishing a trusted connection. @public */
export type MachineConnectionRuntime = Readonly<{
  clock: MachineClock;
  log(entry: MachineLogEntry): Promise<void>;
  connectStream(input: MachineNetworkRequest): Promise<MachineNetworkStream>;
  readArtifact(input: MachineArtifactReadInput): AsyncIterable<Uint8Array<ArrayBuffer>>;
  resolveSecret(input: Readonly<{ reference: string; signal: AbortSignal }>): Promise<string>;
}>;

/** Transient endpoint evidence reported by bounded provider discovery. @public */
export type MachineCandidateEndpoint = Readonly<{ address: string; interface: string }>;

/** Untrusted provider-reported identity evidence, not a physical identity key. @public */
export type MachineClaimedIdentity = Readonly<{ serial?: string; model?: string }>;

/** Candidate reported by bounded provider discovery. @public */
export type MachineCandidate = Readonly<{
  id: string;
  name: string;
  endpoint: MachineCandidateEndpoint;
  claimedIdentity: MachineClaimedIdentity;
  observedAt: string;
  expiresAt: string;
}>;

/** One discovery stream event. @public */
export type MachineDiscoveryEvent =
  | Readonly<{ type: 'found' | 'updated'; candidate: MachineCandidate }>
  | Readonly<{ type: 'lost'; candidateId: string; observedAt: string }>;

/** Named discovery operation input. @public */
export type MachineDiscoveryInput<Configuration> = Readonly<{ configuration: Configuration; signal: AbortSignal }>;

/** Host-local credential reference and approved per-service trust, never portable binding data. @public */
export type MachineConnectionContext = Readonly<{
  secretRef: string;
  serviceTrust: Readonly<Record<string, MachineTransportTrust | undefined>>;
}>;

/** Named connection operation input. @public */
export type MachineConnectInput<Configuration> = Readonly<{
  candidate: MachineCandidate;
  configuration: Configuration;
  connection: MachineConnectionContext;
  signal: AbortSignal;
}>;

/** Stable authenticated machine descriptor. @public */
export type MachineDescriptor = Readonly<{
  id: string;
  name: string;
  vendor: string;
  model: string;
  technology: string;
  firmware: string;
  accepts: readonly MachineAcceptedContainer[];
  operations: readonly string[];
  ratedEnvelope: MachineEnvelope;
  printableEnvelope: MachineEnvelope;
  tools: readonly MachineToolCapability[];
  materialSystem: MachineMaterialSystem;
  bedTypes: readonly string[];
}>;

/** Axis-aligned machine envelope in canonical metres. @public */
export type MachineEnvelope = Readonly<{ width: number; depth: number; height: number; unit: 'm' }>;

/** Tool fact needed for machine/profile compatibility. @public */
export type MachineToolCapability = Readonly<{ id: string; kind: string; nozzleDiameter?: number }>;

/** Stable material-system capacity. @public */
export type MachineMaterialSystem = Readonly<{ kind: string; slotCount: number }>;

/** Currently observed tool/material/bed setup. @public */
export type MachineObservedSetup = Readonly<{
  toolId?: string;
  bedType?: string;
  materials: ReadonlyArray<Readonly<{ slot: number; materialId?: string }>>;
}>;

/** Current connection and readiness snapshot. @public */
export type MachineSnapshot = Readonly<{
  connection: 'connected' | 'disconnected' | 'unreachable';
  readiness: 'busy' | 'idle' | 'not-ready' | 'unknown';
  activeRunId?: string;
  observedAt: string;
  setup: MachineObservedSetup;
}>;

/** Pull-stream observation emitted by one live session. @public */
export type MachineObservation = Readonly<{ type: 'snapshot'; snapshot: MachineSnapshot }>;

/** Named descriptor operation input. @public */
export type MachineGetDescriptorInput = Readonly<{ signal: AbortSignal }>;

/** Named snapshot operation input. @public */
export type MachineGetSnapshotInput = Readonly<{ signal: AbortSignal }>;

/** Named observation operation input. @public */
export type MachineObserveInput = Readonly<{ signal: AbortSignal }>;

/** Named physical submission input. @public */
export type MachineSubmitInput<Configuration> = Readonly<{
  operationId: string;
  expectedMachineId: string;
  artifact: MachineArtifactReference;
  configuration: Configuration;
  signal: AbortSignal;
}>;

/** Named run-control input with stale-run preconditions. @public */
export type MachineControlInput =
  | Readonly<{
      command: 'cancel' | 'pause' | 'resume';
      operationId: string;
      expectedProviderRunId: string;
      signal: AbortSignal;
    }>
  | Readonly<{
      command: 'urgent-stop';
      operationId: string;
      expectedProviderRunId?: string;
      signal: AbortSignal;
    }>;

/** Provider result for one physical submission attempt. @public */
export type MachineSubmissionReceipt =
  | Readonly<{ status: 'accepted'; providerRunId?: string; observedAt: string }>
  | Readonly<{ status: 'rejected'; code: string; message: string; observedAt: string }>
  | Readonly<{ status: 'unknown'; reason: string; observedAt: string }>;

/** Provider result for one run-control attempt. @public */
export type MachineCommandReceipt = MachineSubmissionReceipt;

/** Named still-capture operation input. @public */
export type MachineCaptureStillInput = Readonly<{ signal: AbortSignal }>;

/** Bounded still image returned outside durable job/event storage. @public */
export type MachineStill = Readonly<{ bytes: Uint8Array<ArrayBuffer>; mediaType: string; capturedAt: string }>;

/** Required discriminated still-capture facet. @public */
export type MachineStillCaptureCapability =
  | Readonly<{ type: 'unsupported' }>
  | Readonly<{
      type: 'supported';
      capture(input: MachineCaptureStillInput): Promise<MachineStill>;
    }>;

/** One connected provider session and its explicit cleanup ownership. @public */
export type MachineSession<SubmissionConfiguration = unknown> = Readonly<{
  stillCapture: MachineStillCaptureCapability;
  getDescriptor(input: MachineGetDescriptorInput): Promise<MachineDescriptor>;
  getSnapshot(input: MachineGetSnapshotInput): Promise<MachineSnapshot>;
  observe(input: MachineObserveInput): AsyncIterable<MachineObservation>;
  submit(input: MachineSubmitInput<SubmissionConfiguration>): Promise<MachineSubmissionReceipt>;
  control(input: MachineControlInput): Promise<MachineCommandReceipt>;
  close(): Promise<void>;
  dispose(): Promise<void>;
}>;

type ProviderSchema = StandardJSONSchemaV1 & StandardSchemaV1;

/** One schema-declared provider catalog query. @public */
export type MachineDeclaredQuery<
  InputSchema extends ProviderSchema = ProviderSchema,
  ResultSchema extends ProviderSchema = ProviderSchema,
> = Readonly<{
  inputSchema: InputSchema;
  resultSchema: ResultSchema;
  query(
    input: StandardSchemaV1.InferOutput<InputSchema>,
    runtime: MachineDiscoveryRuntime,
  ): Promise<StandardSchemaV1.InferInput<ResultSchema>>;
}>;

/**
 * Preserve one query's correlated Standard Schema input and output types.
 * @param query - Schema-bearing catalog query and its implementation.
 * @returns The unchanged typed query.
 * @public
 */
export const defineMachineQuery = <InputSchema extends ProviderSchema, ResultSchema extends ProviderSchema>(
  query: MachineDeclaredQuery<InputSchema, ResultSchema>,
): MachineDeclaredQuery<InputSchema, ResultSchema> => query;

type MachineQuerySchemas = Readonly<{ inputSchema: ProviderSchema; resultSchema: ProviderSchema; query: unknown }>;
type QueryMap = Readonly<Record<string, MachineQuerySchemas>>;
type MachineQueryDefinitionFor<Value> =
  Value extends Readonly<{
    inputSchema: infer InputSchema extends ProviderSchema;
    resultSchema: infer ResultSchema extends ProviderSchema;
  }>
    ? MachineDeclaredQuery<InputSchema, ResultSchema>
    : never;
type MachineQueryDefinitions<Queries extends QueryMap> = Readonly<{
  [Name in keyof Queries]: MachineQueryDefinitionFor<Queries[Name]>;
}>;

/** Trusted machine definition retained behind the shared runtime ABI loader. @public */
export type MachineProviderDefinition<
  Id extends string,
  BindingSchema extends StandardSchemaV1,
  SubmissionSchema extends StandardSchemaV1,
  Queries extends QueryMap = Readonly<Record<never, never>>,
> = Readonly<{
  id: Id;
  name: string;
  version: string;
  protocolVersion: 1;
  vendor: string;
  technologies: readonly string[];
  accepts: readonly MachineAcceptedContainer[];
  bindingConfiguration: ConfigurationDefinition<BindingSchema>;
  submissionConfiguration: ConfigurationDefinition<SubmissionSchema>;
  queries?: Queries & MachineQueryDefinitions<Queries>;
  discover(
    input: MachineDiscoveryInput<StandardSchemaV1.InferOutput<BindingSchema>>,
    runtime: MachineDiscoveryRuntime,
  ): AsyncIterable<MachineDiscoveryEvent>;
  connect(
    input: MachineConnectInput<StandardSchemaV1.InferOutput<BindingSchema>>,
    runtime: MachineConnectionRuntime,
  ): Promise<MachineSession<StandardSchemaV1.InferOutput<SubmissionSchema>>>;
}>;

/** Callable machine capability factory using the shared toolkit ABI. @public */
export type MachineProviderFactory<Id extends string, QueryName extends string, Definition> = () => MachineProvider<
  Id,
  QueryName
> &
  RuntimePluginDefinitionCarrier<Definition>;

const assertIdentity = (value: string, field: string): void => {
  if (value.length === 0 || value.length > 256 || !value.isWellFormed()) {
    throw new TypeError(`defineMachine: ${field} is invalid.`);
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

const queryManifest = (
  query: Readonly<{ inputSchema: ProviderSchema; resultSchema: ProviderSchema }>,
): MachineQueryManifest => {
  const inputSchema = materializeConfigurationJsonSchema(
    query.inputSchema['~standard'].jsonSchema.input({ target: 'draft-07' }),
  );
  const resultSchema = materializeConfigurationJsonSchema(
    query.resultSchema['~standard'].jsonSchema.output({ target: 'draft-07' }),
  );
  admitJsonSchema(inputSchema);
  admitJsonSchema(resultSchema);
  return { inputSchema, resultSchema };
};

const isCanonicalArchiveMember = (member: string): boolean =>
  member.length > 0 &&
  member.length <= 512 &&
  member.normalize('NFC') === member &&
  !member.startsWith('/') &&
  !/^[A-Za-z]:/u.test(member) &&
  !member.includes('\\') &&
  member.split('/').every(
    (segment) =>
      segment !== '' &&
      segment !== '.' &&
      segment !== '..' &&
      [...segment].every((character) => {
        const code = character.codePointAt(0)!;
        return code > 31 && code !== 127;
      }),
  );

// oxlint-disable-next-line eslint/complexity -- One bounded pass validates the closed provider descriptor.
const assertDefinition = (definition: {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly vendor: string;
  readonly protocolVersion: number;
  readonly technologies: readonly string[];
  readonly accepts: readonly MachineAcceptedContainer[];
  readonly queries?: QueryMap;
}): void => {
  for (const [field, value] of [
    ['id', definition.id],
    ['name', definition.name],
    ['version', definition.version],
    ['vendor', definition.vendor],
  ] as const) {
    assertIdentity(value, field);
  }
  if (definition.protocolVersion !== 1) {
    throw new TypeError('defineMachine: protocolVersion must be 1.');
  }
  if (
    definition.technologies.length === 0 ||
    definition.technologies.length > 64 ||
    new Set(definition.technologies).size !== definition.technologies.length
  ) {
    throw new TypeError('defineMachine: technologies must be non-empty and unique.');
  }
  for (const technology of definition.technologies) {
    assertIdentity(technology, 'technology');
  }
  if (definition.accepts.length === 0 || definition.accepts.length > 128) {
    throw new TypeError('defineMachine: accepts must be non-empty and bounded.');
  }
  const contracts = new Set<string>();
  for (const accepted of definition.accepts) {
    assertIdentity(accepted.contract.id, 'accepts.contract.id');
    assertIdentity(accepted.mediaType, 'accepts.mediaType');
    if (
      !Number.isSafeInteger(accepted.contract.version) ||
      accepted.contract.version < 1 ||
      accepted.requiredMembers.length > 128 ||
      accepted.requiredMembers.some((member) => !isCanonicalArchiveMember(member)) ||
      new Set(accepted.requiredMembers).size !== accepted.requiredMembers.length
    ) {
      throw new TypeError('defineMachine: accepted container is invalid.');
    }
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- unchecked authoring values cross this runtime guard.
    if (accepted.payloadSelection !== 'plate' && accepted.payloadSelection !== 'single') {
      throw new TypeError('defineMachine: accepted payload selection is invalid.');
    }
    assertIdentity(accepted.technology, 'accepts.technology');
    const identity = `${accepted.contract.id}@${accepted.contract.version}`;
    if (contracts.has(identity)) {
      throw new TypeError(`defineMachine: duplicate accepted contract ${identity}.`);
    }
    contracts.add(identity);
  }
  const queryNames = Object.keys(definition.queries ?? {});
  if (queryNames.length > 128 || queryNames.some((name) => name.length === 0 || name.length > 256)) {
    throw new TypeError('defineMachine: query names are invalid.');
  }
};

/**
 * Define one lazy schema-bearing physical-machine provider.
 * @param definition - Flat provider metadata, configuration, queries, discovery, and connection operations.
 * @returns A zero-argument toolkit capability factory.
 * @public
 */
export const defineMachine = <
  const Id extends string,
  BindingSchema extends StandardSchemaV1,
  SubmissionSchema extends StandardSchemaV1,
  const Queries extends QueryMap = Readonly<Record<never, never>>,
>(
  definition: MachineProviderDefinition<Id, BindingSchema, SubmissionSchema, Queries>,
): MachineProviderFactory<Id, Extract<keyof Queries, string>, typeof definition> => {
  assertDefinition(definition);
  const queries = Object.fromEntries(
    Object.entries(definition.queries ?? {}).map(([name, query]) => [name, queryManifest(query)]),
  ) as Record<Extract<keyof Queries, string>, MachineQueryManifest>;
  const descriptor: MachineProvider<Id, Extract<keyof Queries, string>> = {
    id: definition.id,
    name: definition.name,
    version: definition.version,
    protocolVersion: 1,
    vendor: definition.vendor,
    technologies: definition.technologies,
    accepts: definition.accepts,
    bindingConfiguration: definition.bindingConfiguration.manifest,
    submissionConfiguration: definition.submissionConfiguration.manifest,
    queries,
  };
  const owned = cloneBoundedJson(descriptor, {
    code: 'MACHINE_PROVIDER_DESCRIPTOR',
    maximumDepth: 32,
    maximumNodes: 16_384,
    maximumCharacters: 524_288,
  }) as MachineProvider<Id, Extract<keyof Queries, string>>;
  const factory = () => freezeJson(attachRuntimePluginDefinition(structuredClone(owned), () => definition));
  return attachRuntimePluginFactoryOptions(factory, false);
};
