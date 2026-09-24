import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec';
import type { CacheValue, ContentDigest } from '@taucad/cache-core';
import type { RevisionId } from '@taucad/revisions/algorithms';
import type { Quantity } from '@taucad/units/quantity';
import { z } from 'zod';

import { cloneBoundedJson } from '@taucad/parameters/json';
import { admitConfigurationManifest, materializeConfigurationJsonSchema } from '#configuration/configuration.js';
import type { ConfigurationDefinition, ConfigurationManifestV1, JsonSchema } from '#configuration/index.js';
import { admitJsonSchema } from '@taucad/parameters/schema';
import { machineManifestSchema, parseMachineManifest } from '#machines/machine-manifest.js';
import type { MachineManifest } from '#machines/machine-manifest.js';
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
  /** Frozen model facts that drive scenes, settings, actions and freshness budgets. */
  manifest: MachineManifest;
  bindingConfiguration: ConfigurationManifestV1;
  submissionConfiguration: ConfigurationManifestV1;
  queries: Readonly<Record<QueryName, MachineQueryManifest>>;
}>;

/** Clock authority available to machine providers. @public */
export type MachineClock = Readonly<{ now(): string }>;

/** Redacted provider log entry. @public */
export type MachineLogEntry = Readonly<{
  level: 'debug' | 'error' | 'info' | 'warning';
  message: string;
}>;

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

/** Host-owned authenticated network-video request that returns one bounded JPEG. @public */
export type MachineNetworkStillInput = Readonly<{
  endpoint: Readonly<{ address: string; port: number }>;
  trust: MachineTransportTrust;
  secretRef: string;
  username: string;
  path: string;
  /** Milliseconds. */
  connectTimeout: number;
  maximumBytes: number;
  signal: AbortSignal;
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
  peer: Readonly<{ address: string; interface: string; port: number }>;
}>;

/** Authority-qualified immutable revision identity consumed by machine operations. @public */
export type MachineRevisionReference = Readonly<{
  authorityId: string;
  workspaceId: string;
  revisionId: RevisionId;
  treeDigest: ContentDigest;
}>;

/** Explicit native-unit declaration carried by a physical preparation profile. @public */
export type MachineQuantityDeclaration = Readonly<{
  value: number;
  unit: string;
  kind: string;
  space: 'difference' | 'linear' | 'point';
}>;

/** Qualified immutable prepared-artifact identity. @public */
export type MachineArtifactReference = Readonly<{
  revision: MachineRevisionReference;
  path: string;
  digest: ContentDigest;
  length: number;
  mediaType: string;
  contract: Readonly<{ id: string; version: number }>;
  selectedMember: string;
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
  captureNetworkStill?(input: MachineNetworkStillInput): Promise<MachineStill>;
  uploadFile?(input: MachineFileUploadInput): Promise<MachineFileUploadReceipt>;
}>;

/** Host-owned, bounded implicit-FTPS upload request. @public */
export type MachineFileUploadInput = Readonly<{
  endpoint: Readonly<{ address: string; port: number }>;
  trust: MachineTransportTrust;
  secretRef: string;
  username: string;
  remoteName: string;
  bytes: Uint8Array<ArrayBuffer>;
  connectTimeout: number;
  signal: AbortSignal;
}>;

/** Verified host transfer byte count. @public */
export type MachineFileUploadReceipt = Readonly<{ bytesWritten: number }>;

/** Transient endpoint evidence reported by bounded provider discovery. @public */
export type MachineCandidateEndpoint = Readonly<{
  address: string;
  interface: string;
}>;

/** Untrusted provider-reported identity evidence, not a physical identity key. @public */
export type MachineClaimedIdentity = Readonly<{
  serial?: string;
  model?: string;
}>;

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

/** Non-secret outcome of starting a host-local binding ceremony. @public */
export type MachineBindingOutcome =
  | Readonly<{ status: 'bound'; machineId: string }>
  | Readonly<{ status: 'operator-action-required'; ceremonyId: string }>;

/** Named discovery operation input. @public */
export type MachineDiscoveryInput<Configuration> = Readonly<{
  configuration: Configuration;
  signal: AbortSignal;
}>;

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
export type MachineEnvelope = Readonly<{
  width: number;
  depth: number;
  height: number;
  unit: 'm';
}>;

/** Tool fact needed for machine/profile compatibility. Nozzle diameter is a positive executable length quantity. @public */
export type MachineToolCapability = Readonly<{
  id: string;
  kind: string;
  nozzleDiameter?: Quantity;
}>;

/** Stable material-system capacity. @public */
export type MachineMaterialSystem = Readonly<{
  kind: string;
  slotCount: number;
}>;

/** One observed material slot with explicit occupancy. @public */
export type MachineObservedMaterial = Readonly<{
  slot: number;
  state: 'empty' | 'loaded' | 'unknown';
  materialId?: string;
  brand?: string;
  color?: string;
  remainingPercent?: number;
}>;

/** Currently observed tool/material/bed setup. @public */
export type MachineObservedSetup = Readonly<{
  toolId?: string;
  bedType?: string;
  materials: readonly MachineObservedMaterial[];
}>;

/** Normalized active-run facts; provider values outside this set map to `unknown`. @public */
export type MachineRunSnapshot = Readonly<{
  state: 'failed' | 'finishing' | 'idle' | 'paused' | 'preparing' | 'printing' | 'succeeded' | 'unknown';
  progress?: number;
  remainingSeconds?: number;
  name?: string;
  file?: string;
  currentLayer?: number;
  totalLayers?: number;
  stage?: string;
  printType?: string;
  speedProfile?: 'silent' | 'standard' | 'sport' | 'ludicrous' | 'unknown';
  speedPercent?: number;
}>;

/** Native affine temperature points observed from the machine. @public */
export type MachineTemperatureSnapshot = Readonly<{
  nozzle?: Quantity;
  nozzleTarget?: Quantity;
  bed?: Quantity;
  bedTarget?: Quantity;
  chamber?: Quantity;
}>;

/** Normalized fan speeds as percentages of their provider-declared full scale. @public */
export type MachineFanSnapshot = Readonly<{
  part?: number;
  auxiliary?: number;
  chamber?: number;
}>;

/** One observed material-system unit. @public */
export type MachineMaterialUnitSnapshot = Readonly<{
  unit: number;
  humidityIndex?: number;
  temperature?: Quantity;
}>;

/** Live material-system routing and environment facts. @public */
export type MachineMaterialSystemSnapshot = Readonly<{
  currentSlot?: number;
  targetSlot?: number;
  units: readonly MachineMaterialUnitSnapshot[];
}>;

/** Live network quality facts that contain no endpoint or credential material. @public */
export type MachineNetworkSnapshot = Readonly<{ wifiSignalDbm?: number }>;

/** Live machine light state. @public */
export type MachineLightSnapshot = Readonly<{
  chamber?: 'off' | 'on' | 'unknown';
}>;

/** One normalized active diagnostic without provider payload detail. @public */
export type MachineAlertSnapshot = Readonly<{ code: string }>;

/** Current connection and readiness snapshot. @public */
export type MachineSnapshot = Readonly<{
  connection: 'connected' | 'disconnected' | 'unreachable';
  readiness: 'busy' | 'idle' | 'not-ready' | 'unknown';
  activeRunId?: string;
  observedAt: string;
  setup: MachineObservedSetup;
  run?: MachineRunSnapshot;
  temperatures?: MachineTemperatureSnapshot;
  fans?: MachineFanSnapshot;
  materialSystem?: MachineMaterialSystemSnapshot;
  network?: MachineNetworkSnapshot;
  lights?: MachineLightSnapshot;
  removableStorage?: 'absent' | 'present';
  alerts?: readonly MachineAlertSnapshot[];
}>;

/** Pull-stream observation emitted by one live session. @public */
export type MachineObservation = Readonly<{
  type: 'snapshot';
  snapshot: MachineSnapshot;
}>;

/** Named descriptor operation input. @public */
export type MachineGetDescriptorInput = Readonly<{ signal: AbortSignal }>;

/** Named snapshot operation input. @public */
export type MachineGetSnapshotInput = Readonly<{ signal: AbortSignal }>;

/** Named observation operation input. @public */
export type MachineObserveInput = Readonly<{ signal: AbortSignal }>;

/** Named physical start input for one exact, already transferred artifact. @public */
export type MachineSubmitInput<Configuration> = Readonly<{
  operationId: string;
  expectedMachineId: string;
  artifact: MachineArtifactReference;
  remoteName: string;
  /** Provider transfer evidence returned by the accepted upload. */
  transferId: string;
  providerData: CacheValue;
  configuration: Configuration;
  signal: AbortSignal;
}>;

/** Provider-local lookup for a late semantic command reply. @public */
export type MachineReconcileInput = Readonly<{
  operationId: string;
  command: 'cancel' | 'pause' | 'project_file' | 'resume' | 'stop' | 'upload';
  signal: AbortSignal;
}>;

/** Provider-host read-only preflight input; it validates the artifact and setup and never transfers or starts. @public */
export type MachineProviderPreparePrintInput<Configuration> = Readonly<{
  operationId: string;
  expectedMachineId: string;
  artifact: MachineArtifactReference;
  configuration: Configuration;
  signal: AbortSignal;
}>;

/** Provider proof that an immutable artifact and the observed setup are ready for one transfer. @public */
export type MachinePreparationReceipt =
  | Readonly<{
      status: 'ready';
      remoteName: string;
      digest: ContentDigest;
      length: number;
      parser: Readonly<{ id: string; version: string }>;
      providerData: CacheValue;
      observedAt: string;
    }>
  | Readonly<{
      status: 'rejected';
      code: string;
      message: string;
      observedAt: string;
    }>;

/** Provider-host transfer input for one exact prepared artifact; it never starts a run. @public */
export type MachineProviderUploadInput<Configuration> = Readonly<{
  operationId: string;
  expectedMachineId: string;
  artifact: MachineArtifactReference;
  remoteName: string;
  providerData: CacheValue;
  configuration: Configuration;
  signal: AbortSignal;
}>;

/** Provider result for one physical transfer attempt. @public */
export type MachineTransferReceipt =
  | Readonly<{
      status: 'transferred';
      transferId: string;
      digest: ContentDigest;
      length: number;
      observedAt: string;
    }>
  | Readonly<{
      status: 'rejected';
      code: string;
      message: string;
      observedAt: string;
    }>
  | Readonly<{
      status: 'unknown';
      reason: string;
      observedAt: string;
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
  | Readonly<{
      status: 'rejected';
      code: string;
      message: string;
      observedAt: string;
    }>
  | Readonly<{
      status: 'unknown';
      reason: string;
      providerRunId?: string;
      observedAt: string;
    }>;

/** Provider result for one run-control attempt. @public */
export type MachineCommandReceipt = MachineSubmissionReceipt;

/** Named still-capture operation input. @public */
export type MachineCaptureStillInput = Readonly<{ signal: AbortSignal }>;

/** Bounded short-lived still image returned outside durable job/event storage. @public */
export type MachineStill = Readonly<{
  bytes: Uint8Array<ArrayBuffer>;
  mediaType: 'image/jpeg';
  capturedAt: string;
  expiresAt: string;
}>;

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
  preparePrint(input: MachineProviderPreparePrintInput<SubmissionConfiguration>): Promise<MachinePreparationReceipt>;
  uploadPrint(input: MachineProviderUploadInput<SubmissionConfiguration>): Promise<MachineTransferReceipt>;
  submit(input: MachineSubmitInput<SubmissionConfiguration>): Promise<MachineSubmissionReceipt>;
  control(input: MachineControlInput): Promise<MachineCommandReceipt>;
  reconcile(input: MachineReconcileInput): Promise<MachineCommandReceipt>;
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

type MachineQuerySchemas = Readonly<{
  inputSchema: ProviderSchema;
  resultSchema: ProviderSchema;
  query: unknown;
}>;
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
  manifest: MachineManifest;
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
  query: Readonly<{
    inputSchema: ProviderSchema;
    resultSchema: ProviderSchema;
  }>,
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
  readonly queries?: Readonly<Record<string, unknown>>;
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

const providerIdentitySchema = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value.isWellFormed());
const configurationManifestSchema = z.unknown().transform((value, context) => {
  try {
    return admitConfigurationManifest(value).manifest;
  } catch {
    context.addIssue({
      code: 'custom',
      message: 'Invalid configuration manifest.',
    });
    return z.NEVER;
  }
});
const acceptedContainerSchema = z.strictObject({
  contract: z.strictObject({
    id: providerIdentitySchema,
    version: z.number().int().min(1),
  }),
  mediaType: providerIdentitySchema,
  requiredMembers: z.array(z.string().min(1).max(512)).max(128),
  payloadSelection: z.enum(['plate', 'single']),
  technology: providerIdentitySchema,
});
const machineProviderSchema = z.strictObject({
  id: providerIdentitySchema,
  name: providerIdentitySchema,
  version: providerIdentitySchema,
  protocolVersion: z.literal(1),
  vendor: providerIdentitySchema,
  technologies: z.array(providerIdentitySchema).min(1).max(64),
  accepts: z.array(acceptedContainerSchema).min(1).max(128),
  manifest: machineManifestSchema,
  bindingConfiguration: configurationManifestSchema,
  submissionConfiguration: configurationManifestSchema,
  queries: z.record(providerIdentitySchema, z.strictObject({ inputSchema: z.unknown(), resultSchema: z.unknown() })),
});

const providerKeys = [
  'id',
  'name',
  'version',
  'protocolVersion',
  'vendor',
  'technologies',
  'accepts',
  'manifest',
  'bindingConfiguration',
  'submissionConfiguration',
  'queries',
] as const;

const providerWireValue = (value: unknown): Readonly<Record<string, unknown>> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('INVALID_MACHINE_PROVIDER_DESCRIPTOR');
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const unexpected = Object.keys(descriptors).find(
    (key) => !providerKeys.includes(key as (typeof providerKeys)[number]),
  );
  if (unexpected !== undefined) {
    throw new TypeError('INVALID_MACHINE_PROVIDER_DESCRIPTOR');
  }
  return Object.fromEntries(
    providerKeys.map((key) => {
      const descriptor = descriptors[key];
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
        throw new TypeError('INVALID_MACHINE_PROVIDER_DESCRIPTOR');
      }
      return [key, descriptor.value];
    }),
  );
};

/** Parse one bounded, serializable machine provider descriptor.
 * @param value - Untrusted provider metadata or one branded host-composed provider.
 * @returns Detached, frozen provider metadata.
 * @public
 */
export const parseMachineProvider = (value: unknown): MachineProvider => {
  const candidate = machineProviderSchema.parse(
    cloneBoundedJson(providerWireValue(value), {
      code: 'MACHINE_PROVIDER_DESCRIPTOR',
      maximumDepth: 32,
      maximumNodes: 16_384,
      maximumCharacters: 524_288,
    }),
  );
  assertDefinition(candidate);
  for (const query of Object.values(candidate.queries)) {
    // SAFETY: admitJsonSchema is the runtime proof for these unknown wire values.
    admitJsonSchema(query.inputSchema as JsonSchema);
    // SAFETY: admitJsonSchema is the runtime proof for these unknown wire values.
    admitJsonSchema(query.resultSchema as JsonSchema);
  }
  return freezeJson(candidate) as MachineProvider;
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
    manifest: parseMachineManifest(definition.manifest),
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
