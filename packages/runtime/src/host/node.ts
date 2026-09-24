import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';

import type { StandardSchemaV1 } from '@standard-schema/spec';
import { canonicalizeCacheValue, digestContent } from '@taucad/cache-core';
import type { CacheValue, ContentDigest } from '@taucad/cache-core';
import { Topic } from '@taucad/events';
import { ResourceQueue } from '@taucad/filesystem';
import { acquireNodeAuthorityWriter } from '@taucad/filesystem/backend/node';
import { z } from 'zod';

import { cloneBoundedJson } from '@taucad/parameters/json';
import type {
  AdmittedHostOperation,
  AdmittedHostRoute,
  HostAdmissionAuthority,
  HostSessionHandle,
} from '#host/host-admission.js';
import { exposeMachineChannel, parsePrintRequest } from '#machines/machine-channel.js';
import type { MachineChannelEndpoint, MachineChannelHostOperations } from '#machines/machine-channel.js';
import type {
  MachineOperationReceipt,
  MachineOperationSnapshot,
  MachinePreparedPrint,
} from '#machines/machine-client.js';
import type { PrintRequest } from '#machines/print-request.js';
import { createMachineDirectory, parseMachineDirectoryEvent } from '#machines/machine-directory.js';
import type { MachineDirectory, MachineDirectoryEvent, MachineDirectoryEntry } from '#machines/machine-directory.js';
import { parseMachineProvider } from '#machines/machine.js';
import type {
  MachineCandidate,
  MachineArtifactReference,
  MachineBindingOutcome,
  MachineConnectInput,
  MachineConnectionContext,
  MachineConnectionRuntime,
  MachineDiscoveryEvent,
  MachineDiscoveryInput,
  MachineDiscoveryRuntime,
  MachineProvider,
  MachineSession,
  MachineSubmissionReceipt,
  MachineTransferReceipt,
} from '#machines/machine.js';
import { createNodeMachineEventLog } from '#host/node-machine-event-log.js';
import type { MachineEventLog } from '#host/node-machine-event-log.js';
import { resolveRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';
import type { RuntimePluginDefinitionCarrier } from '#plugins/plugin-runtime-definition.js';

const identity = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value.isWellFormed());
const authorityIdentitySchema = z.strictObject({
  type: z.literal('host-authority-initialized'),
  hostId: identity,
  authorityId: identity,
  generation: identity,
});
const candidateSchema = z.strictObject({
  id: identity,
  name: identity,
  endpoint: z.strictObject({ address: identity, interface: identity }),
  claimedIdentity: z.strictObject({ serial: identity.optional(), model: identity.optional() }),
  observedAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }),
});
const digest = z.custom<ContentDigest>((value) => typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value));
const trustSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('system') }),
  z.strictObject({ type: z.literal('pinned'), digest }),
]);
const bindingEventSchema = z.strictObject({
  type: z.literal('machine-binding-committed'),
  workspaceId: identity,
  machineId: identity,
  providerId: identity,
  physicalId: identity,
  candidate: candidateSchema,
  configuration: z.unknown().transform((value) =>
    cloneBoundedJson(value, {
      code: 'NODE_MACHINE_BINDING_CONFIGURATION',
      maximumDepth: 20,
      maximumNodes: 2048,
      maximumCharacters: 65_536,
    }),
  ),
  connection: z.strictObject({
    secretRef: identity,
    serviceTrust: z.record(identity, trustSchema).refine((value) => Object.keys(value).length <= 8),
  }),
});
const artifactSchema = z.strictObject({
  revision: z.strictObject({
    authorityId: identity,
    workspaceId: identity,
    revisionId: z.custom<MachineArtifactReference['revision']['revisionId']>(
      (value) => typeof value === 'string' && value.length > 0 && value.length <= 256 && value.isWellFormed(),
    ),
    treeDigest: digest,
  }),
  path: identity,
  digest,
  length: z
    .number()
    .int()
    .positive()
    .max(512 * 1024 * 1024),
  mediaType: identity,
  contract: z.strictObject({ id: identity, version: z.number().int().positive() }),
  selectedMember: identity,
});
const preparedPrintSchema = z.strictObject({
  preparedId: identity,
  preparedDigest: digest,
  configurationDigest: digest,
  providerDataDigest: digest,
  setupDigest: digest,
  machineId: identity,
  physicalMachineId: identity,
  artifact: artifactSchema,
  remoteName: identity,
  parser: z.strictObject({ id: identity, version: identity }),
  preparedAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }),
});
const preparedEventSchema = z.strictObject({
  type: z.literal('machine-print-prepared'),
  workspaceId: identity,
  providerId: identity,
  configuration: z.unknown().transform((value) =>
    cloneBoundedJson(value, {
      code: 'NODE_MACHINE_PREPARATION_CONFIGURATION',
      maximumDepth: 20,
      maximumNodes: 2048,
      maximumCharacters: 65_536,
    }),
  ),
  providerData: z.unknown().transform((value) =>
    cloneBoundedJson(value, {
      code: 'NODE_MACHINE_PROVIDER_PREPARATION',
      maximumDepth: 12,
      maximumNodes: 1024,
      maximumCharacters: 65_536,
    }),
  ),
  prepared: preparedPrintSchema,
});
const runEffectKindSchema = z.enum(['cancel', 'pause', 'resume', 'start', 'urgent-stop']);
const effectKindSchema = z.enum(['cancel', 'pause', 'resume', 'start', 'upload', 'urgent-stop']);
const effectIntentSchema = z.strictObject({
  type: z.literal('machine-effect-intent'),
  workspaceId: identity,
  machineId: identity,
  providerId: identity,
  physicalMachineId: identity,
  operationId: identity,
  inputDigest: digest,
  intent: z.discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('upload'),
      preparedId: identity,
      preparedDigest: digest,
    }),
    z.strictObject({
      kind: z.literal('start'),
      preparedId: identity,
      preparedDigest: digest,
      transferId: identity,
      expectedSetupDigest: digest,
    }),
    z.strictObject({
      kind: z.enum(['cancel', 'pause', 'resume', 'urgent-stop']),
      expectedProviderRunId: identity,
    }),
  ]),
  plannedAt: z.iso.datetime({ offset: true }),
});
const effectSendingSchema = z.strictObject({
  type: z.literal('machine-effect-sending'),
  operationId: identity,
  observedAt: z.iso.datetime({ offset: true }),
});
const receiptMessage = z
  .string()
  .min(1)
  .max(1024)
  .refine((value) => value.isWellFormed());
const operationReceiptSchema = z.union([
  z.strictObject({
    operationId: identity,
    machineId: identity,
    kind: z.literal('upload'),
    status: z.literal('accepted'),
    evidence: z.strictObject({ transferId: identity }),
    observedAt: z.iso.datetime({ offset: true }),
  }),
  z.strictObject({
    operationId: identity,
    machineId: identity,
    kind: runEffectKindSchema,
    status: z.literal('accepted'),
    providerRunId: identity.optional(),
    observedAt: z.iso.datetime({ offset: true }),
  }),
  z.strictObject({
    operationId: identity,
    machineId: identity,
    kind: effectKindSchema,
    status: z.literal('rejected'),
    code: identity,
    message: receiptMessage,
    observedAt: z.iso.datetime({ offset: true }),
  }),
  z.strictObject({
    operationId: identity,
    machineId: identity,
    kind: effectKindSchema,
    status: z.literal('unknown'),
    reason: identity,
    providerRunId: identity.optional(),
    observedAt: z.iso.datetime({ offset: true }),
  }),
]);
const printRequestEventSchema = z.strictObject({
  type: z.literal('machine-print-request'),
  workspaceId: identity,
  request: z.unknown().transform((value) => parsePrintRequest(value)),
});
const effectResultSchema = z.strictObject({
  type: z.literal('machine-effect-result'),
  operationId: identity,
  source: z.enum(['attempt', 'reconciliation', 'recovery']),
  receipt: operationReceiptSchema,
});
const providerReceiptSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('accepted'),
    providerRunId: identity.optional(),
    observedAt: z.iso.datetime({ offset: true }),
  }),
  z.strictObject({
    status: z.literal('rejected'),
    code: identity,
    message: receiptMessage,
    observedAt: z.iso.datetime({ offset: true }),
  }),
  z.strictObject({
    status: z.literal('unknown'),
    reason: identity,
    providerRunId: identity.optional(),
    observedAt: z.iso.datetime({ offset: true }),
  }),
]);
const transferReceiptSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('transferred'),
    transferId: identity,
    digest,
    length: z.number().int().positive(),
    observedAt: z.iso.datetime({ offset: true }),
  }),
  z.strictObject({
    status: z.literal('rejected'),
    code: identity,
    message: receiptMessage,
    observedAt: z.iso.datetime({ offset: true }),
  }),
  z.strictObject({
    status: z.literal('unknown'),
    reason: identity,
    observedAt: z.iso.datetime({ offset: true }),
  }),
]);
const discoveryEventSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.enum(['found', 'updated']), candidate: candidateSchema }),
  z.strictObject({ type: z.literal('lost'), candidateId: identity, observedAt: z.iso.datetime({ offset: true }) }),
]);
const authorityIdentityLimits = {
  code: 'NODE_MACHINE_HOST_IDENTITY',
  maximumDepth: 2,
  maximumNodes: 8,
  maximumCharacters: 1024,
};
const discoveryLimits = {
  code: 'NODE_MACHINE_DISCOVERY',
  maximumDepth: 8,
  maximumNodes: 1024,
  maximumCharacters: 32_768,
};
const encoder = new TextEncoder();

const digestMachineSetup = async (entry: MachineDirectoryEntry): Promise<ContentDigest> =>
  digestContent({
    bytes: encoder.encode(
      canonicalizeCacheValue({
        value: cloneBoundedJson(
          {
            descriptor: {
              firmware: entry.descriptor.firmware,
              id: entry.descriptor.id,
              model: entry.descriptor.model,
            },
            setup: entry.snapshot.setup,
          },
          {
            code: 'NODE_MACHINE_PREPARATION_SETUP',
            maximumDepth: 12,
            maximumNodes: 1024,
            maximumCharacters: 65_536,
          },
        ),
      }),
    ),
  });

const publicOperationReceipt = (
  input: Readonly<{
    operationId: string;
    machineId: string;
    kind: MachineOperationReceipt['kind'];
    receipt: MachineSubmissionReceipt | MachineTransferReceipt;
  }>,
): MachineOperationReceipt => {
  const base = { operationId: input.operationId, machineId: input.machineId, kind: input.kind };
  if (input.kind !== 'upload') {
    return operationReceiptSchema.parse({ ...base, ...providerReceiptSchema.parse(input.receipt) });
  }
  const transfer = transferReceiptSchema.parse(input.receipt);
  return operationReceiptSchema.parse(
    transfer.status === 'transferred'
      ? { ...base, status: 'accepted', evidence: { transferId: transfer.transferId }, observedAt: transfer.observedAt }
      : { ...base, ...transfer },
  );
};
const requestFailure = (error: unknown): NonNullable<PrintRequest['failure']> => {
  const cause = error instanceof Error ? error.cause : undefined;
  if (
    cause !== null &&
    typeof cause === 'object' &&
    'code' in cause &&
    typeof cause.code === 'string' &&
    'message' in cause &&
    typeof cause.message === 'string'
  ) {
    return { code: identity.parse(cause.code), message: receiptMessage.parse(cause.message) };
  }
  const message = error instanceof Error ? error.message : 'MACHINE_PREPARATION_FAILED';
  return {
    code: /^[A-Z][A-Z0-9_]{0,255}$/u.test(message) ? message : 'MACHINE_PREPARATION_FAILED',
    message: receiptMessage.parse(message.slice(0, 1024) || 'MACHINE_PREPARATION_FAILED'),
  };
};
type HostAuthorityIdentityEvent = Readonly<z.infer<typeof authorityIdentitySchema>>;
type NodeMachineBindingEvent = Readonly<z.infer<typeof bindingEventSchema>>;
type NodeMachinePreparedEvent = Readonly<z.infer<typeof preparedEventSchema>>;
type NodeMachineEffectIntentEvent = Readonly<z.infer<typeof effectIntentSchema>>;
type NodeMachineEffectSendingEvent = Readonly<z.infer<typeof effectSendingSchema>>;
type NodeMachineEffectResultEvent = Readonly<z.infer<typeof effectResultSchema>>;
type NodeMachinePrintRequestEvent = Readonly<z.infer<typeof printRequestEventSchema>>;
type NodeMachineEffectEvent =
  | NodeMachineEffectIntentEvent
  | NodeMachineEffectSendingEvent
  | NodeMachineEffectResultEvent;
type HostAuthorityEvent =
  | HostAuthorityIdentityEvent
  | MachineDirectoryEvent
  | NodeMachineBindingEvent
  | NodeMachinePreparedEvent
  | NodeMachineEffectEvent
  | NodeMachinePrintRequestEvent;
type OwnedPrintRequest = Readonly<{ workspaceId: string; request: PrintRequest }>;

type NodeMachineEffectState = {
  intent: NodeMachineEffectIntentEvent;
  status: MachineOperationSnapshot['status'];
  updatedAt: string;
  receipt?: MachineOperationReceipt;
};

type ExecutableMachineDefinition = Readonly<{
  bindingConfiguration: Readonly<{ schema: StandardSchemaV1 }>;
  submissionConfiguration: Readonly<{ schema: StandardSchemaV1 }>;
  discover(
    input: MachineDiscoveryInput<unknown>,
    runtime: MachineDiscoveryRuntime,
  ): AsyncIterable<MachineDiscoveryEvent>;
  connect(input: MachineConnectInput<unknown>, runtime: MachineConnectionRuntime): Promise<MachineSession>;
}>;

/** Host-owned network and secret capabilities used by generated machine providers. @public */
export type NodeMachineRuntime = Readonly<{
  discovery: MachineDiscoveryRuntime;
  connection(workspaceId: string): MachineConnectionRuntime;
}>;

/** Trusted native completion of a browser-initiated, non-secret binding ceremony. @public */
export type CompleteNodeMachineBindingInput = Readonly<{
  ceremonyId: string;
  secretRef: string;
  serviceTrust: MachineConnectionContext['serviceTrust'];
}>;

/** One explicitly trusted, already-connected machine attachment. @public */
export type NodeMachineHostAttachment = Readonly<{
  workspaceId: string;
  machineId: string;
  providerId: string;
  session: Pick<MachineSession, 'getDescriptor' | 'getSnapshot' | 'observe' | 'close'>;
}>;

/** Input for one Node-owned machine-directory authority. @public */
export type CreateNodeMachineHostInput = Readonly<{
  /** Existing protected host-state directory that owns the authority journal. */
  authorityRoot: string;
  hostId: string;
  authorityId: string;
  /** Executable-owned admission authority bound to this host instance. */
  admission: HostAdmissionAuthority;
  /** Stable identity of this journal history, retained across restarts. */
  generation: string;
  providers: ReadonlyArray<MachineProvider & RuntimePluginDefinitionCarrier<unknown>>;
  /** Host-owned provider runtime. Supply this for built-in discovery and binding ceremonies. */
  runtime?: NodeMachineRuntime;
  /** Custom admitted operations for hosts that own an equivalent binding implementation. */
  operations?: MachineChannelHostOperations;
  /** Trusted sessions already resolved by the executable host; this function never discovers credentials. */
  attachments?: readonly NodeMachineHostAttachment[];
  onError(error: unknown): void;
}>;

/** Trusted channel attachment supplied by the authenticated host listener. @public */
export type ServeNodeMachineChannelInput = Readonly<{
  port: MachineChannelEndpoint;
  session: HostSessionHandle;
  workspaceId: string;
}>;

/** Lifecycle subset required by a host socket owner. @public */
export type NodeMachineChannelHandle = Readonly<{
  closed: Promise<void>;
  dispose(reason?: string): void;
  onClose(handler: () => void): () => void;
}>;

/** One exclusively owned Node machine-directory service. @public */
export type NodeMachineHost = Readonly<{
  admitRoute(input: Omit<ServeNodeMachineChannelInput, 'port'>): AdmittedHostRoute;
  serve(input: ServeNodeMachineChannelInput): NodeMachineChannelHandle;
  completeBinding(input: CompleteNodeMachineBindingInput): Promise<MachineBindingOutcome>;
  close(): Promise<void>;
}>;

const closeOwned = async (operations: ReadonlyArray<() => void | Promise<void>>): Promise<void> => {
  const errors: unknown[] = [];
  for (const operation of operations) {
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop -- ownership order is deliberate.
      await operation();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length === 1) {
    throw errors[0];
  }
  if (errors.length > 1) {
    throw new AggregateError(errors, 'Node machine host cleanup failed.');
  }
};

const parseAuthorityEvent = (candidate: unknown): HostAuthorityEvent => {
  if (
    candidate !== null &&
    typeof candidate === 'object' &&
    !Array.isArray(candidate) &&
    'type' in candidate &&
    candidate['type'] === 'host-authority-initialized'
  ) {
    return Object.freeze(authorityIdentitySchema.parse(cloneBoundedJson(candidate, authorityIdentityLimits)));
  }
  if (
    candidate !== null &&
    typeof candidate === 'object' &&
    !Array.isArray(candidate) &&
    'type' in candidate &&
    candidate['type'] === 'machine-binding-committed'
  ) {
    return Object.freeze(bindingEventSchema.parse(candidate));
  }
  if (
    candidate !== null &&
    typeof candidate === 'object' &&
    !Array.isArray(candidate) &&
    'type' in candidate &&
    candidate['type'] === 'machine-print-prepared'
  ) {
    return Object.freeze(preparedEventSchema.parse(candidate));
  }
  if (
    candidate !== null &&
    typeof candidate === 'object' &&
    !Array.isArray(candidate) &&
    'type' in candidate &&
    candidate['type'] === 'machine-effect-intent'
  ) {
    return Object.freeze(effectIntentSchema.parse(candidate));
  }
  if (
    candidate !== null &&
    typeof candidate === 'object' &&
    !Array.isArray(candidate) &&
    'type' in candidate &&
    candidate['type'] === 'machine-effect-sending'
  ) {
    return Object.freeze(effectSendingSchema.parse(candidate));
  }
  if (
    candidate !== null &&
    typeof candidate === 'object' &&
    !Array.isArray(candidate) &&
    'type' in candidate &&
    candidate['type'] === 'machine-effect-result'
  ) {
    return Object.freeze(effectResultSchema.parse(candidate));
  }
  if (
    candidate !== null &&
    typeof candidate === 'object' &&
    !Array.isArray(candidate) &&
    'type' in candidate &&
    candidate['type'] === 'machine-print-request'
  ) {
    return Object.freeze(printRequestEventSchema.parse(candidate));
  }
  return parseMachineDirectoryEvent(candidate);
};

const initializeAuthorityIdentity = async (
  journal: MachineEventLog<HostAuthorityEvent>,
  expected: Omit<HostAuthorityIdentityEvent, 'type'>,
): Promise<void> => {
  let cursor = 0;
  let endCursor: number | undefined;
  let found = false;
  do {
    // oxlint-disable-next-line eslint/no-await-in-loop -- identity admission scans the stable journal in order.
    const page = await journal.replay({ cursor, limit: 128 });
    endCursor ??= page.endCursor;
    for (const record of page.records) {
      if (record.event.type !== 'host-authority-initialized') {
        continue;
      }
      if (found || record.sequence !== 0) {
        throw new Error('NODE_MACHINE_HOST_DUPLICATE_IDENTITY');
      }
      found = true;
      if (
        record.event.hostId !== expected.hostId ||
        record.event.authorityId !== expected.authorityId ||
        record.event.generation !== expected.generation
      ) {
        throw new Error('NODE_MACHINE_HOST_IDENTITY_MISMATCH');
      }
    }
    cursor = page.nextCursor;
    if (cursor < endCursor && page.records.length === 0) {
      throw new Error('NODE_MACHINE_HOST_JOURNAL_GAP');
    }
  } while (cursor < endCursor);
  if (found) {
    return;
  }
  if (endCursor !== 0) {
    throw new Error('NODE_MACHINE_HOST_IDENTITY_MISSING');
  }
  await journal.append({ type: 'host-authority-initialized', ...expected });
};

const readAuthorityState = async (
  journal: MachineEventLog<HostAuthorityEvent>,
): Promise<
  Readonly<{
    bindings: NodeMachineBindingEvent[];
    preparations: NodeMachinePreparedEvent[];
    effects: NodeMachineEffectEvent[];
    requests: OwnedPrintRequest[];
  }>
> => {
  const bindings = new Map<string, NodeMachineBindingEvent>();
  const preparations = new Map<string, NodeMachinePreparedEvent>();
  const effects: NodeMachineEffectEvent[] = [];
  const requests = new Map<string, OwnedPrintRequest>();
  let cursor = 0;
  let endCursor: number | undefined;
  do {
    // oxlint-disable-next-line eslint/no-await-in-loop -- protected authority history folds in sequence.
    const page = await journal.replay({ cursor, limit: 128 });
    endCursor ??= page.endCursor;
    for (const record of page.records) {
      switch (record.event.type) {
        case 'machine-binding-committed': {
          bindings.set(JSON.stringify([record.event.workspaceId, record.event.machineId]), record.event);
          break;
        }
        case 'machine-print-prepared': {
          preparations.set(record.event.prepared.preparedId, record.event);
          break;
        }
        case 'machine-effect-intent':
        case 'machine-effect-result':
        case 'machine-effect-sending': {
          effects.push(record.event);
          break;
        }
        case 'machine-print-request': {
          requests.set(JSON.stringify([record.event.workspaceId, record.event.request.requestId]), {
            workspaceId: record.event.workspaceId,
            request: record.event.request,
          });
          break;
        }
        default: {
          break;
        }
      }
    }
    cursor = page.nextCursor;
    if (cursor < endCursor && page.records.length === 0) {
      throw new Error('NODE_MACHINE_HOST_JOURNAL_GAP');
    }
  } while (cursor < endCursor);
  return Object.freeze({
    bindings: [...bindings.values()],
    preparations: [...preparations.values()],
    effects,
    requests: [...requests.values()],
  });
};

const terminalRequestStates: ReadonlySet<PrintRequest['state']> = new Set([
  'denied',
  'failed',
  'rejected',
  'started',
  'withdrawn',
]);

const connectionContextSchema = z.strictObject({
  secretRef: identity,
  serviceTrust: z.record(identity, trustSchema).refine((value) => Object.keys(value).length <= 8),
});

/**
 * Open one protected Node authority journal and its machine directory.
 *
 * Unknown committed record kinds fail closed. Future machine effect records extend
 * this same private authority parser and share this host's writer and commit topic.
 *
 * @param input - Trusted host identity, storage root, providers and connected sessions.
 * @returns The owning host service and authenticated channel attachment point.
 * @public
 */
export const createNodeMachineHost = async (input: CreateNodeMachineHostInput): Promise<NodeMachineHost> => {
  const { admission, authorityId, authorityRoot, generation, hostId, onError } = input;
  const report = (error: unknown): void => {
    try {
      onError(error);
    } catch {
      /* Diagnostics cannot own machine cleanup. */
    }
  };
  if ((input.runtime === undefined) === (input.operations === undefined)) {
    throw new TypeError('NODE_MACHINE_HOST_REQUIRES_ONE_OPERATION_OWNER');
  }
  const providerSources = new Map(input.providers.map((provider) => [provider.id, provider]));
  if (providerSources.size !== input.providers.length) {
    throw new TypeError('NODE_MACHINE_HOST_DUPLICATE_PROVIDER');
  }
  const providers = Object.freeze(input.providers.map(parseMachineProvider));
  const definitions = new Map<string, Promise<ExecutableMachineDefinition>>();
  const resolveDefinition = async (
    source: MachineProvider & RuntimePluginDefinitionCarrier<unknown>,
  ): Promise<ExecutableMachineDefinition> => {
    const candidate = await resolveRuntimePluginDefinition('machine', source);
    if (
      candidate === null ||
      typeof candidate !== 'object' ||
      !('bindingConfiguration' in candidate) ||
      candidate.bindingConfiguration === null ||
      typeof candidate.bindingConfiguration !== 'object' ||
      !('schema' in candidate.bindingConfiguration) ||
      !('submissionConfiguration' in candidate) ||
      candidate.submissionConfiguration === null ||
      typeof candidate.submissionConfiguration !== 'object' ||
      !('schema' in candidate.submissionConfiguration) ||
      typeof Reflect.get(candidate, 'discover') !== 'function' ||
      typeof Reflect.get(candidate, 'connect') !== 'function'
    ) {
      throw new Error('MACHINE_PROVIDER_DEFINITION_INVALID');
    }
    // oxlint-disable-next-line typescript-eslint/consistent-type-assertions -- the host-selected definition was shape-checked above.
    return candidate as ExecutableMachineDefinition;
  };
  const definitionOf = async (providerId: string): Promise<ExecutableMachineDefinition> => {
    const source = providerSources.get(providerId);
    if (!source) {
      throw new Error('MACHINE_PROVIDER_UNAVAILABLE');
    }
    let pending = definitions.get(providerId);
    if (!pending) {
      pending = resolveDefinition(source);
      definitions.set(providerId, pending);
    }
    return pending;
  };
  const attachments = Object.freeze(
    (input.attachments ?? []).map(({ machineId, providerId, session, workspaceId }) =>
      Object.freeze({ machineId, providerId, session, workspaceId }),
    ),
  );
  const owner = await acquireNodeAuthorityWriter({ authorityRoot });
  const canonicalRoot = dirname(owner.lockPath);
  const committedBindings = new Map<string, NodeMachineBindingEvent>();
  const preparations = new Map<string, NodeMachinePreparedEvent>();
  const effects = new Map<string, NodeMachineEffectState>();
  const requests = new Map<string, OwnedPrintRequest>();
  const stillCaptureTimes = new Map<string, number>();
  const effectQueue = new ResourceQueue();
  const connectedSessions = new Map<string, MachineSession>();
  let journal: MachineEventLog<HostAuthorityEvent> | undefined;
  let directory: MachineDirectory | undefined;
  const commits = new Topic<void>({ name: 'node-machine-authority-commits', onError });
  const requestCommits = new Topic<OwnedPrintRequest>({ name: 'node-machine-print-requests', onError });
  const now = (): string => input.runtime?.discovery.clock.now() ?? new Date().toISOString();
  const requestKey = (workspaceId: string, requestId: string): string => JSON.stringify([workspaceId, requestId]);
  const commitRequest = async (workspaceId: string, record: PrintRequest): Promise<PrintRequest> => {
    if (!journal) {
      throw new Error('NODE_MACHINE_HOST_CLOSED');
    }
    const event = Object.freeze(
      printRequestEventSchema.parse({
        type: 'machine-print-request',
        workspaceId,
        request: { ...record, updatedAt: now() },
      }),
    );
    await journal.append(event);
    const owned: OwnedPrintRequest = Object.freeze({ workspaceId, request: event.request });
    requests.set(requestKey(workspaceId, event.request.requestId), owned);
    requestCommits.emit(owned);
    commits.emit();
    return event.request;
  };
  /** Fold the durable effect ledger into one in-flight request; `undefined` means nothing settled yet. */
  const advanceRequest = (record: PrintRequest): PrintRequest | undefined => {
    const phase =
      record.state === 'uploading' || (record.state === 'unknown' && record.transferId === undefined)
        ? 'upload'
        : record.state === 'starting' || record.state === 'unknown'
          ? 'start'
          : undefined;
    if (!phase) {
      return undefined;
    }
    const operationId = phase === 'upload' ? record.uploadOperationId : record.startOperationId;
    const receipt = operationId === undefined ? undefined : effects.get(operationId)?.receipt;
    if (!receipt || (record.state === 'unknown' && receipt.status === 'unknown')) {
      return undefined;
    }
    if (receipt.status === 'rejected') {
      return {
        ...record,
        state: phase === 'upload' ? 'failed' : 'rejected',
        receipt,
        failure: { code: receipt.code, message: receipt.message },
      };
    }
    if (receipt.status === 'unknown') {
      return { ...record, state: 'unknown', receipt };
    }
    return receipt.kind === 'upload'
      ? { ...record, state: 'starting', transferId: receipt.evidence.transferId, receipt }
      : { ...record, state: 'started', receipt };
  };
  const syncRequests = async (operationId: string): Promise<void> => {
    for (const owned of requests.values()) {
      if (owned.request.uploadOperationId !== operationId && owned.request.startOperationId !== operationId) {
        continue;
      }
      const next = advanceRequest(owned.request);
      if (next) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- request transitions journal in ledger order.
        await commitRequest(owned.workspaceId, next);
      }
    }
  };
  try {
    journal = await createNodeMachineEventLog({ authorityRoot: canonicalRoot, owner, parse: parseAuthorityEvent });
    await initializeAuthorityIdentity(journal, {
      hostId,
      authorityId,
      generation,
    });
    const recovered = await readAuthorityState(journal);
    for (const binding of recovered.bindings) {
      committedBindings.set(JSON.stringify([binding.workspaceId, binding.machineId]), binding);
    }
    for (const preparation of recovered.preparations) {
      preparations.set(preparation.prepared.preparedId, preparation);
    }
    for (const event of recovered.effects) {
      if (event.type === 'machine-effect-intent') {
        if (effects.has(event.operationId)) {
          throw new Error('NODE_MACHINE_EFFECT_DUPLICATE_INTENT');
        }
        effects.set(event.operationId, {
          intent: event,
          status: 'planned',
          updatedAt: event.plannedAt,
        });
        continue;
      }
      const state = effects.get(event.operationId);
      if (!state) {
        throw new Error('NODE_MACHINE_EFFECT_ORPHAN_TRANSITION');
      }
      if (event.type === 'machine-effect-sending') {
        if (state.status !== 'planned') {
          throw new Error('NODE_MACHINE_EFFECT_INVALID_SENDING');
        }
        state.status = 'sending';
        state.updatedAt = event.observedAt;
        continue;
      }
      if (
        event.receipt.operationId !== state.intent.operationId ||
        event.receipt.machineId !== state.intent.machineId ||
        event.receipt.kind !== state.intent.intent.kind ||
        (state.status !== 'sending' && state.status !== 'unknown')
      ) {
        throw new Error('NODE_MACHINE_EFFECT_INVALID_RESULT');
      }
      state.status = event.receipt.status;
      state.updatedAt = event.receipt.observedAt;
      state.receipt = event.receipt;
    }
    for (const state of effects.values()) {
      if (state.status !== 'sending') {
        continue;
      }
      const receipt: MachineOperationReceipt = {
        operationId: state.intent.operationId,
        machineId: state.intent.machineId,
        kind: state.intent.intent.kind,
        status: 'unknown',
        reason: 'host-restarted-after-possible-send',
        observedAt: input.runtime?.discovery.clock.now() ?? new Date().toISOString(),
      };
      const event = Object.freeze(
        effectResultSchema.parse({
          type: 'machine-effect-result',
          operationId: state.intent.operationId,
          source: 'recovery',
          receipt,
        }),
      );
      // oxlint-disable-next-line eslint/no-await-in-loop -- recovery must durably classify each possible send.
      await journal.append(event);
      state.status = 'unknown';
      state.updatedAt = receipt.observedAt;
      state.receipt = receipt;
    }
    for (const owned of recovered.requests) {
      requests.set(requestKey(owned.workspaceId, owned.request.requestId), owned);
    }
    for (const owned of recovered.requests) {
      if (terminalRequestStates.has(owned.request.state)) {
        continue;
      }
      const next: PrintRequest | undefined =
        owned.request.state === 'preparing'
          ? {
              ...owned.request,
              state: 'failed',
              failure: { code: 'HOST_RESTARTED', message: 'The host restarted before preparation completed.' },
            }
          : advanceRequest(owned.request);
      if (next) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- recovered requests settle in journal order.
        await commitRequest(owned.workspaceId, next);
      }
    }
    directory = await createMachineDirectory({
      hostId,
      authorityId,
      generation,
      journal,
      commits,
      onError,
    });
    for (const attachment of attachments) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- trusted session ownership transfers in caller order.
      await directory.attach(attachment);
    }
    if (input.runtime) {
      for (const binding of committedBindings.values()) {
        try {
          // oxlint-disable-next-line eslint/no-await-in-loop -- one controller per binding reconnects in journal order.
          const definition = await definitionOf(binding.providerId);
          const abort = new AbortController();
          // oxlint-disable-next-line eslint/no-await-in-loop -- provider connection must settle before directory ownership transfers.
          const session = await definition.connect(
            {
              candidate: binding.candidate,
              configuration: binding.configuration,
              connection: binding.connection,
              signal: abort.signal,
            },
            input.runtime.connection(binding.workspaceId),
          );
          // oxlint-disable-next-line eslint/no-await-in-loop -- recovered identity must be re-qualified before attachment.
          const descriptor = await session.getDescriptor({ signal: abort.signal });
          if (descriptor.id !== binding.physicalId) {
            // oxlint-disable-next-line eslint/no-await-in-loop -- rejected recovered ownership closes before continuing.
            await session.close();
            throw new Error('NODE_MACHINE_HOST_PHYSICAL_IDENTITY_CHANGED');
          }
          // oxlint-disable-next-line eslint/no-await-in-loop -- attachment serializes the recovered controller.
          await directory.attach({
            workspaceId: binding.workspaceId,
            machineId: binding.machineId,
            providerId: binding.providerId,
            session,
          });
          connectedSessions.set(JSON.stringify([binding.workspaceId, binding.machineId]), session);
        } catch (error) {
          report(error);
        }
      }
    }
  } catch (error) {
    const initializationError = error;
    const failedDirectory = directory;
    const failedJournal = journal;
    try {
      await closeOwned([
        ...(failedDirectory ? [async () => failedDirectory.close()] : []),
        ...(failedJournal ? [async () => failedJournal.close()] : []),
        () => {
          commits.dispose();
        },
        async () => owner.release(),
      ]);
    } catch (cleanupError) {
      throw new AggregateError(
        [initializationError, cleanupError],
        'Node machine host initialization and cleanup both failed.',
      );
    }
    throw initializationError;
  }
  const ownedDirectory = directory;
  const ownedJournal = journal;
  type DiscoveredCandidate = Readonly<{
    workspaceId: string;
    providerId: string;
    configuration: CacheValue;
    candidate: MachineCandidate;
  }>;
  type PendingCeremony = DiscoveredCandidate & Readonly<{ machineId: string }>;
  const discovered = new Map<string, DiscoveredCandidate>();
  const ceremonies = new Map<string, PendingCeremony>();
  const scopedKey = (workspaceId: string, identity_: string): string => JSON.stringify([workspaceId, identity_]);
  const effectSnapshot = (state: NodeMachineEffectState): MachineOperationSnapshot =>
    Object.freeze({
      operationId: state.intent.operationId,
      machineId: state.intent.machineId,
      kind: state.intent.intent.kind,
      inputDigest: state.intent.inputDigest,
      status: state.status,
      updatedAt: state.updatedAt,
      ...(state.receipt ? { receipt: state.receipt } : {}),
    });
  const appendEffectResult = async (
    state: NodeMachineEffectState,
    receipt: MachineOperationReceipt,
    source: NodeMachineEffectResultEvent['source'],
  ): Promise<void> => {
    const event = Object.freeze(
      effectResultSchema.parse({
        type: 'machine-effect-result',
        operationId: state.intent.operationId,
        source,
        receipt,
      }),
    );
    await ownedJournal.append(event);
    state.status = receipt.status;
    state.updatedAt = receipt.observedAt;
    state.receipt = receipt;
    commits.emit();
    await syncRequests(state.intent.operationId);
  };
  const executeEffect = async (
    effectInput: Readonly<{
      admitted: AdmittedHostOperation;
      signal: AbortSignal;
      operationId: string;
      machineId: string;
      providerId: string;
      physicalMachineId: string;
      intent: NodeMachineEffectIntentEvent['intent'];
      preflight(): Promise<void>;
      send(): Promise<MachineSubmissionReceipt | MachineTransferReceipt>;
    }>,
  ): Promise<MachineOperationReceipt> => {
    const { runtime } = input;
    if (!runtime) {
      throw new Error('MACHINE_OPERATION_UNAVAILABLE');
    }
    const operationId = identity.parse(effectInput.operationId);
    const inputDigest = await digestContent({
      bytes: encoder.encode(
        canonicalizeCacheValue({
          value: cloneBoundedJson(
            {
              machineId: effectInput.machineId,
              physicalMachineId: effectInput.physicalMachineId,
              providerId: effectInput.providerId,
              intent: effectInput.intent,
            },
            {
              code: 'NODE_MACHINE_EFFECT_INPUT',
              maximumDepth: 12,
              maximumNodes: 1024,
              maximumCharacters: 65_536,
            },
          ),
        }),
      ),
    });
    let state = effects.get(operationId);
    if (state) {
      if (
        state.intent.inputDigest !== inputDigest ||
        state.intent.workspaceId !== effectInput.admitted.workspaceId ||
        state.intent.machineId !== effectInput.machineId
      ) {
        throw new Error('MACHINE_OPERATION_ID_CONFLICT');
      }
      if (state.receipt) {
        return state.receipt;
      }
      if (state.status !== 'planned') {
        throw new Error('MACHINE_OPERATION_UNRESOLVED');
      }
    } else {
      const plannedAt = runtime.discovery.clock.now();
      const intent = Object.freeze(
        effectIntentSchema.parse({
          type: 'machine-effect-intent',
          workspaceId: effectInput.admitted.workspaceId,
          machineId: effectInput.machineId,
          providerId: effectInput.providerId,
          physicalMachineId: effectInput.physicalMachineId,
          operationId,
          inputDigest,
          intent: effectInput.intent,
          plannedAt,
        }),
      );
      await ownedJournal.append(intent);
      state = { intent, status: 'planned', updatedAt: plannedAt };
      effects.set(operationId, state);
      commits.emit();
    }
    effectInput.signal.throwIfAborted();
    effectInput.admitted.assertCurrent();
    await effectInput.preflight();
    effectInput.signal.throwIfAborted();
    effectInput.admitted.assertCurrent();
    const sendingAt = runtime.discovery.clock.now();
    await ownedJournal.append({ type: 'machine-effect-sending', operationId, observedAt: sendingAt });
    state.status = 'sending';
    state.updatedAt = sendingAt;
    commits.emit();
    let receipt: MachineOperationReceipt;
    try {
      receipt = publicOperationReceipt({
        operationId,
        machineId: effectInput.machineId,
        kind: effectInput.intent.kind,
        receipt: await effectInput.send(),
      });
    } catch {
      receipt = {
        operationId,
        machineId: effectInput.machineId,
        kind: effectInput.intent.kind,
        status: 'unknown',
        reason: 'provider-result-unavailable-after-possible-send',
        observedAt: runtime.discovery.clock.now(),
      };
    }
    await appendEffectResult(state, receipt, 'attempt');
    return receipt;
  };
  const hostOperations: MachineChannelHostOperations =
    input.operations ??
    Object.freeze({
      async *discover(operationInput) {
        const source = providerSources.get(operationInput.providerId);
        if (!source || !input.runtime) {
          throw new Error('MACHINE_PROVIDER_UNAVAILABLE');
        }
        const definition = await definitionOf(source.id);
        const result = await definition.bindingConfiguration.schema['~standard'].validate(operationInput.configuration);
        if (result.issues) {
          throw new Error('MACHINE_BINDING_CONFIGURATION_INVALID');
        }
        const configuration = cloneBoundedJson(result.value, {
          code: 'NODE_MACHINE_BINDING_CONFIGURATION',
          maximumDepth: 20,
          maximumNodes: 2048,
          maximumCharacters: 65_536,
        });
        for await (const raw of definition.discover(
          { configuration, signal: operationInput.signal },
          input.runtime.discovery,
        )) {
          operationInput.signal.throwIfAborted();
          operationInput.admitted.assertCurrent();
          const event = Object.freeze(discoveryEventSchema.parse(cloneBoundedJson(raw, discoveryLimits)));
          const key = scopedKey(
            operationInput.admitted.workspaceId,
            event.type === 'lost' ? event.candidateId : event.candidate.id,
          );
          if (event.type === 'lost') {
            discovered.delete(key);
          } else {
            if (!discovered.has(key) && discovered.size >= 256) {
              throw new Error('MACHINE_DISCOVERY_CANDIDATE_LIMIT');
            }
            discovered.set(
              key,
              Object.freeze({
                workspaceId: operationInput.admitted.workspaceId,
                providerId: source.id,
                configuration,
                candidate: event.candidate,
              }),
            );
          }
          yield event;
        }
      },
      async beginBinding(operationInput) {
        if (!input.runtime) {
          throw new Error('MACHINE_OPERATION_UNAVAILABLE');
        }
        const machineId = identity.parse(operationInput.name);
        const key = scopedKey(operationInput.admitted.workspaceId, operationInput.candidate.id);
        const selected = discovered.get(key);
        if (
          !selected ||
          Date.parse(selected.candidate.expiresAt) <= Date.parse(input.runtime.discovery.clock.now()) ||
          JSON.stringify(selected.candidate) !== JSON.stringify(operationInput.candidate)
        ) {
          throw new Error('MACHINE_BINDING_CANDIDATE_EXPIRED');
        }
        const existing = [...committedBindings.values()].find(
          (binding) =>
            binding.workspaceId === selected.workspaceId &&
            binding.providerId === selected.providerId &&
            binding.candidate.id === selected.candidate.id,
        );
        if (existing) {
          return Object.freeze({ status: 'bound', machineId: existing.machineId });
        }
        if (ceremonies.size >= 64) {
          throw new Error('MACHINE_BINDING_CEREMONY_LIMIT');
        }
        const ceremonyId = randomUUID();
        ceremonies.set(ceremonyId, Object.freeze({ ...selected, machineId }));
        return Object.freeze({ status: 'operator-action-required', ceremonyId });
      },
      async preparePrint(operationInput) {
        if (!input.runtime) {
          throw new Error('MACHINE_OPERATION_UNAVAILABLE');
        }
        const machineId = identity.parse(operationInput.machineId);
        if (
          operationInput.artifact.revision.authorityId !== operationInput.admitted.authorityId ||
          operationInput.artifact.revision.workspaceId !== operationInput.admitted.workspaceId
        ) {
          throw new Error('MACHINE_ARTIFACT_SCOPE_MISMATCH');
        }
        const machineKey = scopedKey(operationInput.admitted.workspaceId, machineId);
        const binding = committedBindings.get(machineKey);
        const session = connectedSessions.get(machineKey);
        if (!binding || !session) {
          throw new Error('MACHINE_PREPARATION_UNAVAILABLE');
        }
        const directory = await ownedDirectory.snapshot({ workspaceId: operationInput.admitted.workspaceId });
        const entry = directory.entries.find((candidate) => candidate.machineId === machineId);
        if (entry?.freshness !== 'current' || entry.snapshot.connection !== 'connected') {
          throw new Error('MACHINE_PREPARATION_STALE_MACHINE');
        }
        if (entry.snapshot.readiness !== 'idle') {
          throw new Error('MACHINE_PREPARATION_MACHINE_NOT_IDLE');
        }
        const acceptsArtifact = entry.descriptor.accepts.some(
          (accepted) =>
            accepted.contract.id === operationInput.artifact.contract.id &&
            accepted.contract.version === operationInput.artifact.contract.version &&
            accepted.mediaType === operationInput.artifact.mediaType &&
            accepted.requiredMembers.includes(operationInput.artifact.selectedMember),
        );
        if (!acceptsArtifact) {
          throw new Error('MACHINE_ARTIFACT_INCOMPATIBLE');
        }
        const definition = await definitionOf(binding.providerId);
        const validated = await definition.submissionConfiguration.schema['~standard'].validate(
          operationInput.configuration,
        );
        if (validated.issues) {
          throw new Error('MACHINE_SUBMISSION_CONFIGURATION_INVALID');
        }
        const configuration = cloneBoundedJson(validated.value, {
          code: 'NODE_MACHINE_PREPARATION_CONFIGURATION',
          maximumDepth: 20,
          maximumNodes: 2048,
          maximumCharacters: 65_536,
        });
        const configurationDigest = await digestContent({
          bytes: encoder.encode(canonicalizeCacheValue({ value: configuration })),
        });
        const setupDigest = await digestMachineSetup(entry);
        const preparedId = randomUUID();
        let receipt;
        try {
          receipt = await session.preparePrint({
            operationId: preparedId,
            expectedMachineId: binding.physicalId,
            artifact: operationInput.artifact,
            configuration: validated.value,
            signal: operationInput.signal,
          });
        } catch {
          throw new Error('MACHINE_PREPARATION_FAILED');
        }
        if (receipt.status === 'rejected') {
          throw new Error('MACHINE_PREPARATION_REJECTED', { cause: receipt });
        }
        if (receipt.digest !== operationInput.artifact.digest || receipt.length !== operationInput.artifact.length) {
          throw new Error('MACHINE_ARTIFACT_MISMATCH');
        }
        const preparedAt = input.runtime.discovery.clock.now();
        const providerData = cloneBoundedJson(receipt.providerData, {
          code: 'NODE_MACHINE_PROVIDER_PREPARATION',
          maximumDepth: 12,
          maximumNodes: 1024,
          maximumCharacters: 65_536,
        });
        const providerDataDigest = await digestContent({
          bytes: encoder.encode(canonicalizeCacheValue({ value: providerData })),
        });
        const body = Object.freeze({
          preparedId,
          machineId,
          physicalMachineId: binding.physicalId,
          artifact: operationInput.artifact,
          remoteName: identity.parse(receipt.remoteName),
          parser: receipt.parser,
          configurationDigest,
          providerDataDigest,
          setupDigest,
          preparedAt,
          expiresAt: new Date(Date.parse(preparedAt) + 10 * 60_000).toISOString(),
        });
        const preparedDigest = await digestContent({
          bytes: encoder.encode(
            canonicalizeCacheValue({
              value: cloneBoundedJson(body, {
                code: 'NODE_MACHINE_PREPARED_PRINT',
                maximumDepth: 20,
                maximumNodes: 2048,
                maximumCharacters: 131_072,
              }),
            }),
          ),
        });
        const prepared: MachinePreparedPrint = Object.freeze({ ...body, preparedDigest });
        const event = Object.freeze(
          preparedEventSchema.parse({
            type: 'machine-print-prepared',
            workspaceId: operationInput.admitted.workspaceId,
            providerId: binding.providerId,
            configuration,
            providerData,
            prepared,
          }),
        );
        await ownedJournal.append(event);
        preparations.set(preparedId, event);
        commits.emit();
        return prepared;
      },
      async uploadPrint(operationInput) {
        const { runtime } = input;
        if (!runtime) {
          throw new Error('MACHINE_OPERATION_UNAVAILABLE');
        }
        const machineId = identity.parse(operationInput.machineId);
        const operationId = identity.parse(operationInput.operationId);
        return effectQueue.queueForMany(
          [`effect:${operationId}`, `machine:${operationInput.admitted.workspaceId}:${machineId}`],
          async () => {
            operationInput.signal.throwIfAborted();
            operationInput.admitted.assertCurrent();
            const preparation = preparations.get(identity.parse(operationInput.preparedId));
            if (
              !preparation ||
              preparation.workspaceId !== operationInput.admitted.workspaceId ||
              preparation.prepared.machineId !== machineId ||
              preparation.prepared.preparedDigest !== operationInput.preparedDigest
            ) {
              throw new Error('MACHINE_PREPARATION_MISMATCH');
            }
            const machineKey = scopedKey(operationInput.admitted.workspaceId, machineId);
            const binding = committedBindings.get(machineKey);
            if (!binding) {
              throw new Error('MACHINE_OPERATION_UNAVAILABLE');
            }
            return executeEffect({
              admitted: operationInput.admitted,
              signal: operationInput.signal,
              operationId,
              machineId,
              providerId: binding.providerId,
              physicalMachineId: binding.physicalId,
              intent: {
                kind: 'upload',
                preparedId: preparation.prepared.preparedId,
                preparedDigest: preparation.prepared.preparedDigest,
              },
              async preflight() {
                if (Date.parse(preparation.prepared.expiresAt) <= Date.parse(runtime.discovery.clock.now())) {
                  throw new Error('MACHINE_PREPARATION_EXPIRED');
                }
                const directory = await ownedDirectory.snapshot({ workspaceId: operationInput.admitted.workspaceId });
                const entry = directory.entries.find((candidate) => candidate.machineId === machineId);
                if (entry?.freshness !== 'current' || entry.snapshot.connection !== 'connected') {
                  throw new Error('MACHINE_UPLOAD_STALE_MACHINE');
                }
                if (!connectedSessions.has(machineKey)) {
                  throw new Error('MACHINE_OPERATION_UNAVAILABLE');
                }
              },
              async send() {
                const session = connectedSessions.get(machineKey);
                if (!session) {
                  throw new Error('MACHINE_OPERATION_UNAVAILABLE');
                }
                const transfer = await session.uploadPrint({
                  operationId,
                  expectedMachineId: binding.physicalId,
                  artifact: preparation.prepared.artifact,
                  remoteName: preparation.prepared.remoteName,
                  providerData: preparation.providerData,
                  configuration: preparation.configuration,
                  signal: operationInput.signal,
                });
                if (
                  transfer.status === 'transferred' &&
                  (transfer.digest !== preparation.prepared.artifact.digest ||
                    transfer.length !== preparation.prepared.artifact.length)
                ) {
                  return {
                    status: 'rejected',
                    code: 'TRANSFER_MISMATCH',
                    message: 'The transferred object does not match the prepared artifact.',
                    observedAt: transfer.observedAt,
                  };
                }
                return transfer;
              },
            });
          },
        );
      },
      async startPrint(operationInput) {
        const { runtime } = input;
        if (!runtime) {
          throw new Error('MACHINE_OPERATION_UNAVAILABLE');
        }
        const machineId = identity.parse(operationInput.machineId);
        const operationId = identity.parse(operationInput.operationId);
        const transferId = identity.parse(operationInput.transferId);
        return effectQueue.queueForMany(
          [`effect:${operationId}`, `machine:${operationInput.admitted.workspaceId}:${machineId}`],
          async () => {
            operationInput.signal.throwIfAborted();
            operationInput.admitted.assertCurrent();
            const preparation = preparations.get(identity.parse(operationInput.preparedId));
            if (
              !preparation ||
              preparation.workspaceId !== operationInput.admitted.workspaceId ||
              preparation.prepared.machineId !== machineId ||
              preparation.prepared.preparedDigest !== operationInput.preparedDigest ||
              preparation.prepared.setupDigest !== operationInput.expectedSetupDigest
            ) {
              throw new Error('MACHINE_PREPARATION_MISMATCH');
            }
            const transferred = [...effects.values()].some(
              (state) =>
                state.intent.intent.kind === 'upload' &&
                state.intent.intent.preparedId === preparation.prepared.preparedId &&
                state.receipt?.status === 'accepted' &&
                state.receipt.kind === 'upload' &&
                state.receipt.evidence.transferId === transferId,
            );
            if (!transferred) {
              throw new Error('MACHINE_TRANSFER_MISMATCH');
            }
            const machineKey = scopedKey(operationInput.admitted.workspaceId, machineId);
            const binding = committedBindings.get(machineKey);
            if (!binding) {
              throw new Error('MACHINE_OPERATION_UNAVAILABLE');
            }
            return executeEffect({
              admitted: operationInput.admitted,
              signal: operationInput.signal,
              operationId,
              machineId,
              providerId: binding.providerId,
              physicalMachineId: binding.physicalId,
              intent: {
                kind: 'start',
                preparedId: preparation.prepared.preparedId,
                preparedDigest: preparation.prepared.preparedDigest,
                transferId,
                expectedSetupDigest: operationInput.expectedSetupDigest,
              },
              async preflight() {
                if (Date.parse(preparation.prepared.expiresAt) <= Date.parse(runtime.discovery.clock.now())) {
                  throw new Error('MACHINE_PREPARATION_EXPIRED');
                }
                const directory = await ownedDirectory.snapshot({ workspaceId: operationInput.admitted.workspaceId });
                const entry = directory.entries.find((candidate) => candidate.machineId === machineId);
                if (
                  entry?.freshness !== 'current' ||
                  entry.snapshot.connection !== 'connected' ||
                  entry.snapshot.readiness !== 'idle' ||
                  entry.snapshot.activeRunId !== undefined
                ) {
                  throw new Error('MACHINE_START_STALE_OR_BUSY');
                }
                if ((await digestMachineSetup(entry)) !== preparation.prepared.setupDigest) {
                  throw new Error('MACHINE_START_SETUP_CHANGED');
                }
                if (!connectedSessions.has(machineKey)) {
                  throw new Error('MACHINE_START_UNAVAILABLE');
                }
              },
              async send() {
                const session = connectedSessions.get(machineKey);
                if (!session) {
                  throw new Error('MACHINE_START_UNAVAILABLE');
                }
                return session.submit({
                  operationId,
                  expectedMachineId: binding.physicalId,
                  artifact: preparation.prepared.artifact,
                  remoteName: preparation.prepared.remoteName,
                  transferId,
                  providerData: preparation.providerData,
                  configuration: preparation.configuration,
                  signal: operationInput.signal,
                });
              },
            });
          },
        );
      },
      async controlRun(operationInput) {
        if (!input.runtime) {
          throw new Error('MACHINE_OPERATION_UNAVAILABLE');
        }
        const machineId = identity.parse(operationInput.machineId);
        const operationId = identity.parse(operationInput.operationId);
        return effectQueue.queueForMany(
          [`effect:${operationId}`, `machine:${operationInput.admitted.workspaceId}:${machineId}`],
          async () => {
            operationInput.signal.throwIfAborted();
            operationInput.admitted.assertCurrent();
            const machineKey = scopedKey(operationInput.admitted.workspaceId, machineId);
            const binding = committedBindings.get(machineKey);
            if (!binding) {
              throw new Error('MACHINE_CONTROL_UNAVAILABLE');
            }
            return executeEffect({
              admitted: operationInput.admitted,
              signal: operationInput.signal,
              operationId,
              machineId,
              providerId: binding.providerId,
              physicalMachineId: binding.physicalId,
              intent: {
                kind: operationInput.command,
                expectedProviderRunId: operationInput.expectedProviderRunId,
              },
              async preflight() {
                const directory = await ownedDirectory.snapshot({ workspaceId: operationInput.admitted.workspaceId });
                const entry = directory.entries.find((candidate) => candidate.machineId === machineId);
                if (
                  entry?.freshness !== 'current' ||
                  entry.snapshot.connection !== 'connected' ||
                  entry.snapshot.activeRunId !== operationInput.expectedProviderRunId
                ) {
                  throw new Error('MACHINE_CONTROL_STALE_RUN');
                }
                if (!connectedSessions.has(machineKey)) {
                  throw new Error('MACHINE_CONTROL_UNAVAILABLE');
                }
              },
              async send() {
                const session = connectedSessions.get(machineKey);
                if (!session) {
                  throw new Error('MACHINE_CONTROL_UNAVAILABLE');
                }
                return session.control({
                  command: operationInput.command,
                  operationId,
                  expectedProviderRunId: operationInput.expectedProviderRunId,
                  signal: operationInput.signal,
                });
              },
            });
          },
        );
      },
      async captureStill(operationInput) {
        const { runtime } = input;
        if (!runtime) {
          throw new Error('MACHINE_OPERATION_UNAVAILABLE');
        }
        const machineId = identity.parse(operationInput.machineId);
        const machineKey = scopedKey(operationInput.admitted.workspaceId, machineId);
        const binding = committedBindings.get(machineKey);
        const session = connectedSessions.get(machineKey);
        if (!binding || session?.stillCapture.type !== 'supported') {
          throw new Error('MACHINE_STILL_UNAVAILABLE');
        }
        const requestedAt = Date.parse(runtime.discovery.clock.now());
        if (!Number.isFinite(requestedAt)) {
          throw new TypeError('MACHINE_CLOCK_INVALID');
        }
        const previous = stillCaptureTimes.get(machineKey);
        if (previous !== undefined && requestedAt - previous < 5000) {
          throw new Error('MACHINE_STILL_RATE_LIMITED');
        }
        operationInput.signal.throwIfAborted();
        operationInput.admitted.assertCurrent();
        stillCaptureTimes.set(machineKey, requestedAt);
        const still = await session.stillCapture.capture({ signal: operationInput.signal });
        operationInput.signal.throwIfAborted();
        operationInput.admitted.assertCurrent();
        const capturedAt = Date.parse(still.capturedAt);
        const expiresAt = Date.parse(still.expiresAt);
        const observedAt = Date.parse(runtime.discovery.clock.now());
        const mediaType: unknown = still.mediaType;
        if (
          !(still.bytes instanceof Uint8Array) ||
          still.bytes.byteLength < 4 ||
          still.bytes.byteLength > 4 * 1024 * 1024 ||
          still.bytes[0] !== 0xff ||
          still.bytes[1] !== 0xd8 ||
          still.bytes.at(-2) !== 0xff ||
          still.bytes.at(-1) !== 0xd9 ||
          mediaType !== 'image/jpeg' ||
          !Number.isFinite(capturedAt) ||
          !Number.isFinite(expiresAt) ||
          !Number.isFinite(observedAt) ||
          capturedAt > observedAt + 5000 ||
          expiresAt <= capturedAt ||
          expiresAt <= observedAt ||
          expiresAt - capturedAt > 30_000
        ) {
          throw new Error('MACHINE_STILL_INVALID');
        }
        return Object.freeze({ ...still, bytes: Uint8Array.from(still.bytes) });
      },
      async reconcileOperation(operationInput) {
        if (!input.runtime) {
          throw new Error('MACHINE_OPERATION_UNAVAILABLE');
        }
        const machineId = identity.parse(operationInput.machineId);
        const operationId = identity.parse(operationInput.operationId);
        return effectQueue.queueFor(`effect:${operationId}`, async () => {
          operationInput.signal.throwIfAborted();
          operationInput.admitted.assertCurrent();
          const state = effects.get(operationId);
          if (
            !state ||
            state.intent.workspaceId !== operationInput.admitted.workspaceId ||
            state.intent.machineId !== machineId
          ) {
            throw new Error('MACHINE_OPERATION_UNKNOWN');
          }
          if (state.status !== 'unknown') {
            return effectSnapshot(state);
          }
          const session = connectedSessions.get(scopedKey(operationInput.admitted.workspaceId, machineId));
          if (!session) {
            return effectSnapshot(state);
          }
          const command =
            state.intent.intent.kind === 'start'
              ? 'project_file'
              : state.intent.intent.kind === 'cancel' || state.intent.intent.kind === 'urgent-stop'
                ? 'stop'
                : state.intent.intent.kind;
          let providerReceipt: MachineSubmissionReceipt;
          try {
            providerReceipt = await session.reconcile({ operationId, command, signal: operationInput.signal });
          } catch {
            return effectSnapshot(state);
          }
          if (providerReceipt.status === 'unknown') {
            return effectSnapshot(state);
          }
          let receipt: MachineOperationReceipt;
          try {
            receipt = publicOperationReceipt({
              operationId,
              machineId,
              kind: state.intent.intent.kind,
              receipt: providerReceipt,
            });
          } catch {
            return effectSnapshot(state);
          }
          await appendEffectResult(state, receipt, 'reconciliation');
          return effectSnapshot(state);
        });
      },
      async requestPrint(operationInput) {
        if (!input.runtime) {
          throw new Error('MACHINE_OPERATION_UNAVAILABLE');
        }
        const requestId = identity.parse(operationInput.requestId);
        const machineId = identity.parse(operationInput.machineId);
        const { workspaceId } = operationInput.admitted;
        const key = requestKey(workspaceId, requestId);
        return effectQueue.queueFor(`request:${key}`, async () => {
          operationInput.signal.throwIfAborted();
          operationInput.admitted.assertCurrent();
          const configuration = cloneBoundedJson(operationInput.configuration, {
            code: 'NODE_MACHINE_PREPARATION_CONFIGURATION',
            maximumDepth: 20,
            maximumNodes: 2048,
            maximumCharacters: 65_536,
          });
          const existing = requests.get(key)?.request;
          if (existing) {
            if (
              existing.machineId !== machineId ||
              canonicalizeCacheValue({ value: existing.artifact }) !==
                canonicalizeCacheValue({ value: operationInput.artifact }) ||
              canonicalizeCacheValue({ value: existing.configuration }) !==
                canonicalizeCacheValue({ value: configuration })
            ) {
              throw new Error('MACHINE_PRINT_REQUEST_ID_CONFLICT');
            }
            return existing;
          }
          const createdAt = now();
          let record = await commitRequest(workspaceId, {
            requestId,
            machineId,
            artifact: operationInput.artifact,
            configuration,
            requestedBy: operationInput.requestedBy,
            summary: operationInput.summary ?? { fileName: operationInput.artifact.path.split('/').at(-1) ?? 'print' },
            state: 'preparing',
            createdAt,
            updatedAt: createdAt,
          });
          try {
            const prepared = await hostOperations.preparePrint({
              admitted: operationInput.admitted,
              signal: operationInput.signal,
              machineId,
              artifact: operationInput.artifact,
              configuration,
            });
            record = await commitRequest(workspaceId, { ...record, state: 'awaiting-approval', prepared });
          } catch (error) {
            record = await commitRequest(workspaceId, { ...record, state: 'failed', failure: requestFailure(error) });
          }
          return record;
        });
      },
      async listPrintRequests(operationInput) {
        const machineId = operationInput.machineId === undefined ? undefined : identity.parse(operationInput.machineId);
        return listRequests(operationInput.admitted.workspaceId, machineId);
      },
      async *watchPrintRequests(operationInput) {
        const { signal } = operationInput;
        const { workspaceId } = operationInput.admitted;
        const machineId = operationInput.machineId === undefined ? undefined : identity.parse(operationInput.machineId);
        // Ponytail: every frame is a whole record, so pending updates coalesce by request id and never need a cursor.
        const pending = new Map<string, PrintRequest>();
        let wake = Promise.withResolvers<void>();
        const off = requestCommits.subscribe(
          (owned) => {
            if (
              owned.workspaceId === workspaceId &&
              (machineId === undefined || owned.request.machineId === machineId)
            ) {
              pending.set(owned.request.requestId, owned.request);
              wake.resolve();
            }
          },
          { signal },
        );
        const onAbort = (): void => {
          wake.resolve();
        };
        signal.addEventListener('abort', onAbort, { once: true });
        try {
          for (const request of listRequests(workspaceId, machineId)) {
            signal.throwIfAborted();
            yield pending.get(request.requestId) ?? request;
          }
          while (!signal.aborted) {
            if (pending.size === 0) {
              // oxlint-disable-next-line eslint/no-await-in-loop -- one wake per committed transition.
              await wake.promise;
              wake = Promise.withResolvers<void>();
              continue;
            }
            const batch = [...pending.values()];
            pending.clear();
            for (const request of batch) {
              signal.throwIfAborted();
              yield request;
            }
          }
        } finally {
          off();
          signal.removeEventListener('abort', onAbort);
        }
      },
      async resolvePrintRequest(operationInput) {
        if (!input.runtime) {
          throw new Error('MACHINE_OPERATION_UNAVAILABLE');
        }
        const requestId = identity.parse(operationInput.requestId);
        const { admitted } = operationInput;
        const { workspaceId } = admitted;
        const key = requestKey(workspaceId, requestId);
        return effectQueue.queueFor(`request:${key}`, async () => {
          operationInput.signal.throwIfAborted();
          admitted.assertCurrent();
          const record = requests.get(key)?.request;
          if (!record) {
            throw new Error('MACHINE_PRINT_REQUEST_UNKNOWN');
          }
          if (operationInput.decision === 'deny') {
            if (record.state !== 'awaiting-approval') {
              throw new Error('MACHINE_PRINT_REQUEST_NOT_AWAITING');
            }
            return commitRequest(workspaceId, { ...record, state: 'denied', resolvedBy: operationInput.resolvedBy });
          }
          let current = record;
          if (current.state === 'awaiting-approval') {
            current = await commitRequest(workspaceId, {
              ...current,
              state: 'approved',
              resolvedBy: operationInput.resolvedBy,
              uploadOperationId: identity.parse(operationInput.uploadOperationId ?? randomUUID()),
              startOperationId: identity.parse(operationInput.startOperationId ?? randomUUID()),
            });
          } else if (current.state === 'approved' || current.state === 'uploading' || current.state === 'starting') {
            if (
              (operationInput.uploadOperationId !== undefined &&
                operationInput.uploadOperationId !== current.uploadOperationId) ||
              (operationInput.startOperationId !== undefined &&
                operationInput.startOperationId !== current.startOperationId)
            ) {
              throw new Error('MACHINE_PRINT_REQUEST_ID_CONFLICT');
            }
          } else {
            throw new Error('MACHINE_PRINT_REQUEST_NOT_AWAITING');
          }
          const { prepared, uploadOperationId, startOperationId } = current;
          if (!prepared || uploadOperationId === undefined || startOperationId === undefined) {
            throw new Error('NODE_MACHINE_PRINT_REQUEST_INVALID');
          }
          const latest = (): PrintRequest => requests.get(key)?.request ?? current;
          try {
            if (current.state === 'approved') {
              current = await commitRequest(workspaceId, { ...current, state: 'uploading' });
            }
            if (current.state === 'uploading') {
              // The approval is durable: the transfer answers to the host, not to the caller's wait.
              await hostOperations.uploadPrint({
                admitted,
                signal: admitted.signal,
                machineId: current.machineId,
                preparedId: prepared.preparedId,
                preparedDigest: prepared.preparedDigest,
                operationId: uploadOperationId,
              });
              current = latest();
            }
            if (current.state === 'starting' && current.transferId !== undefined) {
              await hostOperations.startPrint({
                admitted,
                signal: admitted.signal,
                machineId: current.machineId,
                preparedId: prepared.preparedId,
                preparedDigest: prepared.preparedDigest,
                transferId: current.transferId,
                expectedSetupDigest: prepared.setupDigest,
                operationId: startOperationId,
              });
              current = latest();
            }
          } catch (error) {
            current = latest();
            if (!terminalRequestStates.has(current.state)) {
              current = await commitRequest(workspaceId, {
                ...current,
                state: 'failed',
                failure: requestFailure(error),
              });
            }
          }
          return current;
        });
      },
      async withdrawPrintRequest(operationInput) {
        const requestId = identity.parse(operationInput.requestId);
        const { workspaceId } = operationInput.admitted;
        const key = requestKey(workspaceId, requestId);
        return effectQueue.queueFor(`request:${key}`, async () => {
          operationInput.signal.throwIfAborted();
          operationInput.admitted.assertCurrent();
          const record = requests.get(key)?.request;
          if (!record) {
            throw new Error('MACHINE_PRINT_REQUEST_UNKNOWN');
          }
          if (record.state !== 'awaiting-approval') {
            throw new Error('MACHINE_PRINT_REQUEST_NOT_AWAITING');
          }
          return commitRequest(workspaceId, { ...record, state: 'withdrawn', resolvedBy: operationInput.resolvedBy });
        });
      },
    });
  const listRequests = (workspaceId: string, machineId: string | undefined): readonly PrintRequest[] =>
    [...requests.values()]
      .filter(
        (owned) =>
          owned.workspaceId === workspaceId && (machineId === undefined || owned.request.machineId === machineId),
      )
      .map((owned) => owned.request)
      .sort(
        (left, right) => right.createdAt.localeCompare(left.createdAt) || right.requestId.localeCompare(left.requestId),
      )
      .slice(0, 1024);
  const channels = new Set<NodeMachineChannelHandle>();
  let closing: Promise<void> | undefined;
  let closed = false;
  const completeBinding = async (bindingInput: CompleteNodeMachineBindingInput): Promise<MachineBindingOutcome> => {
    if (closed || !input.runtime) {
      throw new Error('MACHINE_BINDING_UNAVAILABLE');
    }
    const ceremonyId = identity.parse(bindingInput.ceremonyId);
    const pending = ceremonies.get(ceremonyId);
    if (!pending) {
      throw new Error('MACHINE_BINDING_UNKNOWN_CEREMONY');
    }
    const connection = Object.freeze(
      connectionContextSchema.parse({ secretRef: bindingInput.secretRef, serviceTrust: bindingInput.serviceTrust }),
    );
    const machineKey = scopedKey(pending.workspaceId, pending.machineId);
    const previous = committedBindings.get(machineKey);
    if (previous && (previous.providerId !== pending.providerId || previous.candidate.id !== pending.candidate.id)) {
      throw new Error('MACHINE_BINDING_LOGICAL_ID_CONFLICT');
    }
    const definition = await definitionOf(pending.providerId);
    const abort = new AbortController();
    const session = await definition.connect(
      {
        candidate: pending.candidate,
        configuration: pending.configuration,
        connection,
        signal: abort.signal,
      },
      input.runtime.connection(pending.workspaceId),
    );
    try {
      const descriptor = await session.getDescriptor({ signal: abort.signal });
      if (pending.candidate.claimedIdentity.serial && pending.candidate.claimedIdentity.serial !== descriptor.id) {
        throw new Error('NODE_MACHINE_HOST_PHYSICAL_IDENTITY_CHANGED');
      }
      const duplicate = [...committedBindings.values()].find(
        (binding) =>
          binding.providerId === pending.providerId &&
          binding.physicalId === descriptor.id &&
          (binding.workspaceId !== pending.workspaceId || binding.machineId !== pending.machineId),
      );
      if (duplicate) {
        throw new Error('NODE_MACHINE_HOST_PHYSICAL_IDENTITY_CONFLICT');
      }
      await ownedDirectory.attach({
        workspaceId: pending.workspaceId,
        machineId: pending.machineId,
        providerId: pending.providerId,
        session,
      });
      const event = Object.freeze(
        bindingEventSchema.parse({
          type: 'machine-binding-committed',
          workspaceId: pending.workspaceId,
          machineId: pending.machineId,
          providerId: pending.providerId,
          physicalId: descriptor.id,
          candidate: pending.candidate,
          configuration: pending.configuration,
          connection,
        }),
      );
      try {
        await ownedJournal.append(event);
      } catch (error) {
        await ownedDirectory.remove({ workspaceId: pending.workspaceId, machineId: pending.machineId });
        throw error;
      }
      committedBindings.set(machineKey, event);
      connectedSessions.set(machineKey, session);
      ceremonies.delete(ceremonyId);
      commits.emit();
      return Object.freeze({ status: 'bound', machineId: pending.machineId });
    } catch (error) {
      if (connectedSessions.get(machineKey) !== session) {
        await session.close().catch(() => undefined);
      }
      throw error;
    }
  };

  return Object.freeze({
    admitRoute(routeInput) {
      if (closed) {
        throw new Error('NODE_MACHINE_HOST_CLOSED');
      }
      if (admission.hostId !== hostId) {
        throw new Error('NODE_MACHINE_HOST_WRONG_ADMISSION');
      }
      return admission.admitRoute({
        session: routeInput.session,
        authorityId,
        workspaceId: routeInput.workspaceId,
        route: 'machines',
      });
    },
    serve(channelInput) {
      if (closed) {
        throw new Error('NODE_MACHINE_HOST_CLOSED');
      }
      const admitted = admission.admitRoute({
        session: channelInput.session,
        authorityId,
        workspaceId: channelInput.workspaceId,
        route: 'machines',
      });
      const channel = exposeMachineChannel({
        ...channelInput,
        admission,
        authorityId,
        directory: ownedDirectory,
        providers,
        operations: hostOperations,
      });
      channels.add(channel);
      const revoke = (): void => {
        channel.dispose('machine route admission revoked');
      };
      admitted.signal.addEventListener('abort', revoke, { once: true });
      channel.onClose(() => {
        channels.delete(channel);
        admitted.signal.removeEventListener('abort', revoke);
      });
      if (admitted.signal.aborted) {
        revoke();
      }
      return channel;
    },
    completeBinding,
    async close() {
      if (closing) {
        return closing;
      }
      closed = true;
      closing = closeOwned([
        async () => {
          const active = [...channels];
          for (const channel of active) {
            channel.dispose('node machine host closed');
          }
          await Promise.allSettled(active.map(async (channel) => channel.closed));
          channels.clear();
        },
        async () => effectQueue.whenDrained(),
        async () => ownedDirectory.close(),
        () => {
          connectedSessions.clear();
          discovered.clear();
          ceremonies.clear();
        },
        async () => ownedJournal.close(),
        () => {
          commits.dispose();
          requestCommits.dispose();
        },
        async () => owner.release(),
      ]);
      return closing;
    },
  });
};
