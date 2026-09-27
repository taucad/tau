import { randomUUID } from 'node:crypto';

import type { StandardSchemaV1 } from '@standard-schema/spec';
import { canonicalizeCacheValue, digestContent } from '@taucad/cache-core';
import type { CacheValue, ContentDigest } from '@taucad/cache-core';
import { Topic } from '@taucad/events';
import { ResourceQueue } from '@taucad/filesystem';
import { z } from 'zod';

import { cloneBoundedJson } from '@taucad/parameters/json';
import type {
  AdmittedHostOperation,
  AdmittedHostRoute,
  HostActor,
  HostAdmissionAuthority,
  HostRouteGrant,
  HostSessionHandle,
} from '#host/host-admission.js';
import type { MachineEventLog } from '#host/node-machine-event-log.js';
import { machineDisplayName, openNodeMachineStore } from '#host/node-machine-store.js';
import type {
  MachineBindingRecord,
  MachineOperationsState,
  MachinePreparationRecord,
} from '#host/node-machine-store.js';
import { exposeMachineChannel, machineAdmissionScope } from '#machines/machine-channel.js';
import type { MachineChannelEndpoint, MachineChannelHostOperations } from '#machines/machine-channel.js';
import type {
  MachineBindingRemoval,
  MachineOperationReceipt,
  MachineOperationSnapshot,
  MachinePreparedPrint,
} from '#machines/machine-client.js';
import { machineCredentialReference } from '#machines/machine-credential.js';
import type { PrintRequest } from '#machines/print-request.js';
import { createMachineDirectory } from '#machines/machine-directory.js';
import type { MachineDirectory, MachineDirectoryEntry } from '#machines/machine-directory.js';
import { parseMachineProvider } from '#machines/machine.js';
import type {
  MachineCandidate,
  MachineBindingOutcome,
  MachineConnectInput,
  MachineConnectionContext,
  MachineConnectionRuntime,
  MachineDescriptor,
  MachineDiscoveryEvent,
  MachineDiscoveryInput,
  MachineDiscoveryRuntime,
  MachineProvider,
  MachineSession,
  MachineSubmissionReceipt,
  MachineTransferReceipt,
} from '#machines/machine.js';
import { resolveRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';
import type { RuntimePluginDefinitionCarrier } from '#plugins/plugin-runtime-definition.js';

const identity = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value.isWellFormed());
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
const runEffectKindSchema = z.enum(['cancel', 'pause', 'resume', 'start', 'urgent-stop']);
const effectKindSchema = z.enum(['cancel', 'pause', 'resume', 'start', 'upload', 'urgent-stop']);
const effectIntentSchema = z.strictObject({
  type: z.literal('machine-effect-intent'),
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
const effectResultSchema = z.strictObject({
  type: z.literal('machine-effect-result'),
  operationId: identity,
  source: z.enum(['attempt', 'reconciliation', 'recovery']),
  receipt: operationReceiptSchema,
});
/** Everything a machine's `operations.jsonl` holds: the write-ahead records of its device effects. */
const operationEventSchema = z.discriminatedUnion('type', [
  effectIntentSchema,
  effectSendingSchema,
  effectResultSchema,
]);
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
const discoveryLimits = {
  code: 'NODE_MACHINE_DISCOVERY',
  maximumDepth: 8,
  maximumNodes: 1024,
  maximumCharacters: 32_768,
};
const encoder = new TextEncoder();
/**
 * How long a binding without a live session waits before its next reconnect attempt: 2 s, 5 s, 10 s, 30 s, then
 * every 60 s.
 *
 * @param attempts - Attempts since the last good connect.
 * @returns Milliseconds.
 */
const reconnectDelay = (attempts: number): number => [2000, 5000, 10_000, 30_000][attempts] ?? 60_000;

/**
 * Whether a connect refusal needs a new binding rather than a retry: another printer answers at the bound address
 * (`*_IDENTITY_CHANGED`), or its certificate no longer matches the pinned one (`*_CERTIFICATE_CHANGED`,
 * `*_PIN_MISMATCH`).
 *
 * @param error - What the connect attempt threw.
 * @returns Whether retrying is pointless until the machine is bound again.
 */
const needsRebind = (error: unknown): boolean =>
  error instanceof Error && /_(?:IDENTITY_CHANGED|CERTIFICATE_CHANGED|PIN_MISMATCH)$/u.test(error.message);

/**
 * Settle after the delay, or as soon as `stopped` settles.
 *
 * @param retryDelay - Milliseconds.
 * @param stopped - Settles when the wait is no longer wanted.
 */
const pause = async (retryDelay: number, stopped: Promise<void>): Promise<void> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, retryDelay);
      }),
      stopped,
    ]);
  } finally {
    clearTimeout(timer);
  }
};

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
    intent: NodeMachineEffectIntentEvent['intent'];
    receipt: MachineSubmissionReceipt | MachineTransferReceipt;
  }>,
): MachineOperationReceipt => {
  const { intent } = input;
  const base = { operationId: input.operationId, machineId: input.machineId, kind: intent.kind };
  if (intent.kind !== 'upload') {
    const receipt = providerReceiptSchema.parse(input.receipt);
    // A control's preflight matched its run, so an accepted control names that run when the provider's reply does not.
    const addressed =
      'expectedProviderRunId' in intent && receipt.status === 'accepted' && receipt.providerRunId === undefined
        ? { providerRunId: intent.expectedProviderRunId }
        : {};
    return operationReceiptSchema.parse({ ...base, ...receipt, ...addressed });
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
type NodeMachineEffectIntentEvent = Readonly<z.infer<typeof effectIntentSchema>>;
type NodeMachineEffectResultEvent = Readonly<z.infer<typeof effectResultSchema>>;
type NodeMachineEffectEvent = Readonly<z.infer<typeof operationEventSchema>>;

type NodeMachineEffectState = {
  intent: NodeMachineEffectIntentEvent;
  status: MachineOperationSnapshot['status'];
  updatedAt: string;
  receipt?: MachineOperationReceipt;
};

/** One bound machine: its latest `machine.json` and its operations log, which may have been found unreadable. */
type BoundMachine = {
  record: MachineBindingRecord;
  operations: MachineOperationsState<NodeMachineEffectEvent>;
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
  /** Host credential custody: marks discovered candidates whose code is saved, and forgets a removed binding's code. */
  credentials?: Readonly<{
    has(reference: string): Promise<boolean>;
    forget(reference: string): Promise<void>;
  }>;
  connection(): MachineConnectionRuntime;
}>;

/** Trusted native completion of a browser-initiated, non-secret binding ceremony. @public */
export type CompleteNodeMachineBindingInput = Readonly<{
  ceremonyId: string;
  secretRef: string;
  serviceTrust: MachineConnectionContext['serviceTrust'];
}>;

/** Trusted native removal of one committed binding, e.g. to roll back a binding whose credential could not be saved. @public */
export type RemoveNodeMachineBindingInput = Readonly<{
  machineId: string;
}>;

/** Input for one Node-owned machine store and its machine directory. @public */
export type CreateNodeMachineHostInput = Readonly<{
  /**
   * The machine store root, created `0700` when missing. One host at a time owns it, through the writer lock at
   * `authority/authority.writer.lock`; a second gets `AUTHORITY_ALREADY_OWNED`.
   */
  storeRoot: string;
  /** Older store roots whose legacy `authority/machine-events.jsonl` the store's first open imports, read-only. */
  legacyStoreRoots?: readonly string[];
  hostId: string;
  authorityId: string;
  /** Executable-owned admission authority bound to this host instance. */
  admission: HostAdmissionAuthority;
  providers: ReadonlyArray<MachineProvider & RuntimePluginDefinitionCarrier<unknown>>;
  /** Host-owned provider runtime. Supply this for built-in discovery and binding ceremonies. */
  runtime?: NodeMachineRuntime;
  /** Custom admitted operations for hosts that own an equivalent binding implementation. */
  operations?: MachineChannelHostOperations;
  onError(error: unknown): void;
}>;

/** Trusted channel attachment supplied by the authenticated host listener. @public */
export type ServeNodeMachineChannelInput = Readonly<{
  port: MachineChannelEndpoint;
  session: HostSessionHandle;
}>;

/** Trusted issuance of one machines-route session; revoke it through the host's admission authority. @public */
export type IssueNodeMachineSessionInput = Readonly<{
  actor: HostActor;
  grants: readonly HostRouteGrant[];
}>;

/** Lifecycle subset required by a host socket owner. @public */
export type NodeMachineChannelHandle = Readonly<{
  closed: Promise<void>;
  dispose(reason?: string): void;
  onClose(handler: () => void): () => void;
}>;

/** One exclusively owned Node machine store and directory service. @public */
export type NodeMachineHost = Readonly<{
  /** A session this host's routes admit; machines belong to the store, so the session names no workspace. */
  issueSession(input: IssueNodeMachineSessionInput): HostSessionHandle;
  admitRoute(input: Omit<ServeNodeMachineChannelInput, 'port'>): AdmittedHostRoute;
  serve(input: ServeNodeMachineChannelInput): NodeMachineChannelHandle;
  completeBinding(input: CompleteNodeMachineBindingInput): Promise<MachineBindingOutcome>;
  /** The provider and candidate a pending ceremony will bind, or `undefined` for an unknown ceremony; never a secret. */
  describeBinding(ceremonyId: string): Readonly<{ providerId: string; candidate: MachineCandidate }> | undefined;
  removeBinding(input: RemoveNodeMachineBindingInput): Promise<MachineBindingRemoval>;
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

const parseOperationEvent = (candidate: unknown): NodeMachineEffectEvent =>
  Object.freeze(operationEventSchema.parse(candidate));

/**
 * Fold one machine's operations log under the replay rules. Any violation makes the whole log unusable, since an
 * effect whose history cannot be trusted must never be sent again.
 *
 * @param machineId - The machine whose directory holds the log.
 * @param log - Its recovered operations log.
 * @returns Each recorded effect's latest state, by operation id.
 */
const replayOperations = async (
  machineId: string,
  log: MachineEventLog<NodeMachineEffectEvent>,
): Promise<Map<string, NodeMachineEffectState>> => {
  const replayed = new Map<string, NodeMachineEffectState>();
  for (let cursor = 0; ; ) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- the log folds in sequence.
    const page = await log.replay({ cursor, limit: 128 });
    for (const { event } of page.records) {
      if (event.type === 'machine-effect-intent') {
        if (replayed.has(event.operationId)) {
          throw new Error('NODE_MACHINE_EFFECT_DUPLICATE_INTENT');
        }
        if (event.machineId !== machineId) {
          throw new Error('NODE_MACHINE_EFFECT_MACHINE_MISMATCH');
        }
        replayed.set(event.operationId, { intent: event, status: 'planned', updatedAt: event.plannedAt });
        continue;
      }
      const state = replayed.get(event.operationId);
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
    if (page.records.length === 0 || page.nextCursor >= page.endCursor) {
      return replayed;
    }
    cursor = page.nextCursor;
  }
};

const sameDescriptor = (left: MachineDescriptor, right: MachineDescriptor): boolean =>
  canonicalizeCacheValue({ value: left }) === canonicalizeCacheValue({ value: right });

// A placeholder has no envelope; the smallest positive one keeps any fit check refusing it.
const unreportedEnvelope: MachineDescriptor['ratedEnvelope'] = {
  width: Number.MIN_VALUE,
  depth: Number.MIN_VALUE,
  height: Number.MIN_VALUE,
  unit: 'm',
};

/**
 * What a binding whose printer has never reported is listed with (one migrated without a usable directory entry), so
 * it can be seen and removed: its own identity, unknown facts and no operations, stale until the printer connects.
 *
 * @param record - The binding.
 * @param vendor - The provider's vendor name.
 * @returns A placeholder descriptor and snapshot.
 */
const unreportedIdentity = (
  record: MachineBindingRecord,
  vendor: string,
): Pick<MachineDirectoryEntry, 'descriptor' | 'snapshot'> => ({
  descriptor: {
    id: record.physicalId,
    name: record.candidate.name,
    vendor,
    model: record.candidate.claimedIdentity.model ?? 'unknown',
    technology: 'unknown',
    firmware: 'unknown',
    accepts: [],
    operations: [],
    ratedEnvelope: unreportedEnvelope,
    printableEnvelope: unreportedEnvelope,
    tools: [],
    materialSystem: { kind: 'unknown', slotCount: 0 },
    bedTypes: [],
  },
  snapshot: { connection: 'disconnected', readiness: 'unknown', observedAt: record.boundAt, setup: { materials: [] } },
});

const terminalRequestStates: ReadonlySet<PrintRequest['state']> = new Set([
  'denied',
  'failed',
  'rejected',
  'started',
  'withdrawn',
]);

/** Request states whose host work still needs the binding; removal is refused until they settle. */
const bindingBusyStates: ReadonlySet<PrintRequest['state']> = new Set([
  'preparing',
  'awaiting-approval',
  'uploading',
  'starting',
]);

const connectionContextSchema = z.strictObject({
  secretRef: identity,
  serviceTrust: z.record(identity, trustSchema).refine((value) => Object.keys(value).length <= 8),
});

/**
 * Open the machine store and serve its machine directory.
 *
 * Recovery follows the store's order: take the lock, migrate a legacy journal once, load every `machine.json` and
 * unexpired preparation, replay each machine's operations log and record every possible send as `unknown`, settle
 * the print requests, list each machine stale from its last-known identity (a placeholder for one whose printer never
 * reported), then reconnect. A machine whose operations log is unreadable, or cannot take its recovery record, stays
 * listed but unavailable; every other machine works.
 *
 * @param input - Trusted host identity, store root, providers and operation owner.
 * @returns The owning host service and authenticated channel attachment point.
 * @public
 */
export const createNodeMachineHost = async (input: CreateNodeMachineHostInput): Promise<NodeMachineHost> => {
  const { admission, authorityId, hostId, onError } = input;
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
  const now = (): string => input.runtime?.discovery.clock.now() ?? new Date().toISOString();
  const store = await openNodeMachineStore<NodeMachineEffectEvent>({
    storeRoot: input.storeRoot,
    legacyStoreRoots: input.legacyStoreRoots ?? [],
    parseOperation: parseOperationEvent,
    now,
    onError: report,
  });
  /** Every bound machine, by machine id. */
  const machines = new Map<string, BoundMachine>();
  const preparations = new Map<string, MachinePreparationRecord>();
  /** Every recorded effect of a machine with a readable log, by operation id. */
  const effects = new Map<string, NodeMachineEffectState>();
  /** Every print request of a bound machine, by request id. */
  const requests = new Map<string, PrintRequest>();
  const stillCaptureTimes = new Map<string, number>();
  const effectQueue = new ResourceQueue();
  const connectedSessions = new Map<string, MachineSession>();
  /** One reconnect loop per supervised machine; aborting `stop` ends it. */
  const supervisors = new Map<string, Readonly<{ stop: AbortController; done: Promise<void> }>>();
  let closed = false;
  let directory: MachineDirectory | undefined;
  const commits = new Topic<void>({ name: 'node-machine-directory-commits', onError });
  const requestCommits = new Topic<PrintRequest>({ name: 'node-machine-print-requests', onError });
  // The machine an effect is recorded against, refusing an unbound machine with `missing` and an unreadable log.
  const usableMachine = (
    machineId: string,
    missing: string,
  ): Readonly<{ record: MachineBindingRecord; log: MachineEventLog<NodeMachineEffectEvent> }> => {
    const machine = machines.get(machineId);
    if (!machine) {
      throw new Error(missing);
    }
    if (machine.operations.status !== 'open') {
      throw new Error('MACHINE_OPERATIONS_LOG_CORRUPT', { cause: machine.operations.error });
    }
    return { record: machine.record, log: machine.operations.log };
  };
  const commitRequest = async (record: PrintRequest): Promise<PrintRequest> => {
    const committed = await store.writeRequest({ ...record, updatedAt: now() });
    requests.set(committed.requestId, committed);
    requestCommits.emit(committed);
    return committed;
  };
  /**
   * Fold the durable effect ledger into one in-flight request.
   *
   * @param record - The in-flight request.
   * @returns The next request state, or `undefined` while nothing has settled.
   */
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
    for (const request of requests.values()) {
      if (request.uploadOperationId !== operationId && request.startOperationId !== operationId) {
        continue;
      }
      const next = advanceRequest(request);
      if (next) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- request transitions follow the effect ledger in order.
        await commitRequest(next);
      }
    }
  };
  const recordEffectResult = async (
    state: NodeMachineEffectState,
    receipt: MachineOperationReceipt,
    source: NodeMachineEffectResultEvent['source'],
  ): Promise<void> => {
    const { log } = usableMachine(state.intent.machineId, 'MACHINE_OPERATION_UNAVAILABLE');
    await log.append(
      Object.freeze(
        effectResultSchema.parse({
          type: 'machine-effect-result',
          operationId: state.intent.operationId,
          source,
          receipt,
        }),
      ),
    );
    state.status = receipt.status;
    state.updatedAt = receipt.observedAt;
    state.receipt = receipt;
  };
  const appendEffectResult = async (
    state: NodeMachineEffectState,
    receipt: MachineOperationReceipt,
    source: NodeMachineEffectResultEvent['source'],
  ): Promise<void> => {
    await recordEffectResult(state, receipt, source);
    await syncRequests(state.intent.operationId);
  };
  // Remember a new or changed machine identity in its `machine.json`, so a restart lists it with that identity. A
  // binding already wrote the one it connected with, so a first report of it writes nothing.
  // Take one machine out of service for this run: its log cannot be trusted or written, so none of its effects is sent
  // or settled again. Every other machine is untouched.
  const markCorrupt = (machineId: string, cause: unknown): void => {
    const error = new Error('MACHINE_OPERATIONS_LOG_CORRUPT', { cause });
    const machine = machines.get(machineId);
    if (machine) {
      machine.operations = { status: 'corrupt', error };
    }
    for (const [operationId, state] of effects) {
      if (state.intent.machineId === machineId) {
        effects.delete(operationId);
      }
    }
    report(error);
  };
  const persistMachine = async (entry: MachineDirectoryEntry): Promise<void> => {
    const machine = machines.get(entry.machineId);
    if (!machine || (machine.record.last && sameDescriptor(machine.record.last.descriptor, entry.descriptor))) {
      return;
    }
    machine.record = await store.writeMachine({
      ...machine.record,
      last: { descriptor: entry.descriptor, snapshot: entry.snapshot, observedAt: now() },
    });
  };
  try {
    for (const loaded of store.machines) {
      machines.set(loaded.record.id, { record: loaded.record, operations: loaded.operations });
      for (const preparation of loaded.preparations) {
        preparations.set(preparation.prepared.preparedId, preparation);
      }
    }
    for (const [machineId, machine] of machines) {
      if (machine.operations.status !== 'open') {
        report(machine.operations.error);
        continue;
      }
      try {
        // oxlint-disable-next-line eslint/no-await-in-loop -- each machine's log folds before the next.
        const replayed = await replayOperations(machineId, machine.operations.log);
        if ([...replayed.keys()].some((operationId) => effects.has(operationId))) {
          throw new Error('NODE_MACHINE_EFFECT_DUPLICATE_INTENT');
        }
        for (const [operationId, state] of replayed) {
          effects.set(operationId, state);
        }
      } catch (error) {
        markCorrupt(machineId, error);
      }
    }
    for (const state of effects.values()) {
      if (state.status !== 'sending') {
        continue;
      }
      try {
        // oxlint-disable-next-line eslint/no-await-in-loop -- recovery must durably classify each possible send.
        await recordEffectResult(
          state,
          {
            operationId: state.intent.operationId,
            machineId: state.intent.machineId,
            kind: state.intent.intent.kind,
            status: 'unknown',
            reason: 'host-restarted-after-possible-send',
            observedAt: now(),
          },
          'recovery',
        );
      } catch (error) {
        // A log that cannot take the durable `unknown` (a full log, a failing disk) takes only its machine down.
        markCorrupt(state.intent.machineId, error);
      }
    }
    for (const loaded of store.machines) {
      for (const request of loaded.requests) {
        requests.set(request.requestId, request);
      }
    }
    for (const request of requests.values()) {
      if (terminalRequestStates.has(request.state)) {
        continue;
      }
      // A request of a machine whose log is unreadable keeps its state: its receipts cannot be read.
      const next: PrintRequest | undefined =
        request.state === 'preparing'
          ? {
              ...request,
              state: 'failed',
              failure: { code: 'HOST_RESTARTED', message: 'The host restarted before preparation completed.' },
            }
          : machines.get(request.machineId)?.operations.status === 'open'
            ? advanceRequest(request)
            : undefined;
      if (next) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- recovered requests settle one at a time.
        await commitRequest(next);
      }
    }
    directory = createMachineDirectory({
      hostId,
      authorityId,
      // Every binding is listed, stale until its printer reports; one that never has shows a placeholder.
      recovered: [...machines.values()].map(({ record }): MachineDirectoryEntry => {
        const { descriptor, snapshot } =
          record.last ??
          unreportedIdentity(
            record,
            providers.find((provider) => provider.id === record.providerId)?.vendor ?? record.providerId,
          );
        return {
          machineId: record.id,
          name: record.name,
          providerId: record.providerId,
          descriptor,
          snapshot,
          freshness: 'stale',
        };
      }),
      persist: persistMachine,
      commits,
      onError,
    });
  } catch (error) {
    const initializationError = error;
    const failedDirectory = directory;
    try {
      await closeOwned([
        ...(failedDirectory ? [async () => failedDirectory.close()] : []),
        () => {
          commits.dispose();
          requestCommits.dispose();
        },
        async () => store.close(),
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
  type DiscoveredCandidate = Readonly<{
    providerId: string;
    configuration: CacheValue;
    candidate: MachineCandidate;
  }>;
  type PendingCeremony = DiscoveredCandidate & Readonly<{ name: string }>;
  const discovered = new Map<string, DiscoveredCandidate>();
  const ceremonies = new Map<string, PendingCeremony>();
  // Mark a candidate whose claimed identity already has a saved credential; a failed lookup leaves it unmarked.
  const withCredentialFlag = async (providerId: string, candidate: MachineCandidate): Promise<MachineCandidate> => {
    const { serial } = candidate.claimedIdentity;
    const credentials = input.runtime?.credentials;
    if (serial === undefined || !credentials) {
      return candidate;
    }
    try {
      return (await credentials.has(machineCredentialReference(providerId, serial)))
        ? Object.freeze({ ...candidate, credential: 'saved' })
        : candidate;
    } catch (error) {
      report(error);
      return candidate;
    }
  };
  // Connect a bound machine, check that the same printer answers, and swap the session into the directory on the
  // machine's queue, so the session never changes under an in-flight upload, start or control. `lost` settles once
  // the new session stops being live.
  const connectBinding = async (
    record: MachineBindingRecord,
    signal: AbortSignal,
  ): Promise<Readonly<{ lost: Promise<void> }>> => {
    const { runtime } = input;
    if (!runtime) {
      throw new Error('MACHINE_OPERATION_UNAVAILABLE');
    }
    const definition = await definitionOf(record.providerId);
    const session = await definition.connect(
      { candidate: record.candidate, configuration: record.configuration, connection: record.connection, signal },
      runtime.connection(),
    );
    const lost = Promise.withResolvers<void>();
    try {
      const descriptor = await session.getDescriptor({ signal });
      if (descriptor.id !== record.physicalId) {
        throw new Error('NODE_MACHINE_HOST_PHYSICAL_IDENTITY_CHANGED');
      }
      await effectQueue.queueFor(`machine:${record.id}`, async () => {
        signal.throwIfAborted();
        await ownedDirectory.attach({
          machineId: record.id,
          name: record.name,
          providerId: record.providerId,
          session,
          onLost() {
            lost.resolve();
          },
        });
        connectedSessions.set(record.id, session);
      });
    } catch (error) {
      await session.close().catch(() => undefined);
      throw error;
    }
    return { lost: lost.promise };
  };
  // Keep one bound machine connected until it is removed, refused for good or the host closes. A live session is
  // waited out; attempts then follow the backoff, and a good connect starts it over. An attempt only replaces the
  // session, so an effect whose outcome was lost with the old one stays `unknown` until it is reconciled.
  const keepConnected = async (
    record: MachineBindingRecord,
    signal: AbortSignal,
    live: Promise<void> | undefined,
  ): Promise<void> => {
    const stopped = new Promise<void>((resolve) => {
      signal.addEventListener(
        'abort',
        () => {
          resolve();
        },
        { once: true },
      );
    });
    // A call, not a property read, so the loop re-checks after each await.
    const isAborted = (): boolean => signal.aborted;
    let lost = live;
    let attempts = 0;
    while (!isAborted()) {
      if (lost) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- a live session is waited out before any attempt.
        await Promise.race([lost, stopped]);
        // ponytail: a session lost right after connecting starts the backoff over, so a flapping printer is retried
        // every 2 s; hold the reset until a session has stayed up if that shows up on real hosts.
        attempts = 0;
      }
      // oxlint-disable-next-line eslint/no-await-in-loop -- attempts are spaced by the backoff.
      await pause(reconnectDelay(attempts), stopped);
      attempts += 1;
      if (isAborted()) {
        return;
      }
      try {
        // oxlint-disable-next-line eslint/no-await-in-loop -- one attempt at a time.
        ({ lost } = await connectBinding(record, signal));
      } catch (error) {
        lost = undefined;
        if (isAborted()) {
          return;
        }
        report(error);
        if (needsRebind(error)) {
          return;
        }
      }
    }
  };
  // Supervise a bound machine in the background, replacing any loop an earlier binding of the same id ran.
  const supervise = (record: MachineBindingRecord, live: Promise<void> | undefined): void => {
    if (closed) {
      return;
    }
    supervisors.get(record.id)?.stop.abort();
    const stop = new AbortController();
    supervisors.set(record.id, { stop, done: keepConnected(record, stop.signal, live) });
  };
  // Every machine with a readable log gets one attempt now, in id order, then supervision unless it was refused for
  // good or this host does not serve its provider.
  if (input.runtime) {
    for (const machine of machines.values()) {
      if (machine.operations.status !== 'open') {
        continue;
      }
      let live: Promise<void> | undefined;
      try {
        // oxlint-disable-next-line eslint/no-await-in-loop -- recovered machines connect in id order.
        ({ lost: live } = await connectBinding(machine.record, new AbortController().signal));
      } catch (error) {
        report(error);
        if (needsRebind(error) || !providerSources.has(machine.record.providerId)) {
          continue;
        }
      }
      supervise(machine.record, live);
    }
  }
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
    const { log } = usableMachine(effectInput.machineId, 'MACHINE_OPERATION_UNAVAILABLE');
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
      if (state.intent.inputDigest !== inputDigest || state.intent.machineId !== effectInput.machineId) {
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
          machineId: effectInput.machineId,
          providerId: effectInput.providerId,
          physicalMachineId: effectInput.physicalMachineId,
          operationId,
          inputDigest,
          intent: effectInput.intent,
          plannedAt,
        }),
      );
      await log.append(intent);
      state = { intent, status: 'planned', updatedAt: plannedAt };
      effects.set(operationId, state);
    }
    effectInput.signal.throwIfAborted();
    effectInput.admitted.assertCurrent();
    await effectInput.preflight();
    effectInput.signal.throwIfAborted();
    effectInput.admitted.assertCurrent();
    const sendingAt = runtime.discovery.clock.now();
    await log.append({ type: 'machine-effect-sending', operationId, observedAt: sendingAt });
    state.status = 'sending';
    state.updatedAt = sendingAt;
    let receipt: MachineOperationReceipt;
    try {
      receipt = publicOperationReceipt({
        operationId,
        machineId: effectInput.machineId,
        intent: effectInput.intent,
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
  const listRequests = (machineId: string | undefined, projectId: string | undefined): readonly PrintRequest[] =>
    [...requests.values()]
      .filter(
        (request) =>
          (machineId === undefined || request.machineId === machineId) &&
          (projectId === undefined || request.artifact.projectId === projectId),
      )
      .sort(
        (left, right) => right.createdAt.localeCompare(left.createdAt) || right.requestId.localeCompare(left.requestId),
      )
      .slice(0, 1024);
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
          const key = event.type === 'lost' ? event.candidateId : event.candidate.id;
          if (event.type === 'lost') {
            discovered.delete(key);
          } else {
            if (!discovered.has(key) && discovered.size >= 256) {
              throw new Error('MACHINE_DISCOVERY_CANDIDATE_LIMIT');
            }
            discovered.set(key, Object.freeze({ providerId: source.id, configuration, candidate: event.candidate }));
          }
          yield event.type === 'lost'
            ? event
            : Object.freeze({ ...event, candidate: await withCredentialFlag(source.id, event.candidate) });
        }
      },
      async beginBinding(operationInput) {
        if (!input.runtime) {
          throw new Error('MACHINE_OPERATION_UNAVAILABLE');
        }
        const name = machineDisplayName(operationInput.name);
        if (name.length === 0 || name !== operationInput.name.trim() || !name.isWellFormed()) {
          throw new Error('MACHINE_BINDING_NAME_INVALID');
        }
        const selected = discovered.get(operationInput.candidate.id);
        if (
          !selected ||
          Date.parse(selected.candidate.expiresAt) <= Date.parse(input.runtime.discovery.clock.now()) ||
          // The saved-credential flag is this host's projection, not part of what the provider reported.
          JSON.stringify(selected.candidate) !== JSON.stringify({ ...operationInput.candidate, credential: undefined })
        ) {
          throw new Error('MACHINE_BINDING_CANDIDATE_EXPIRED');
        }
        const existing = [...machines.values()].find(
          ({ record }) => record.providerId === selected.providerId && record.candidate.id === selected.candidate.id,
        );
        if (existing) {
          return Object.freeze({ status: 'bound', machineId: existing.record.id });
        }
        if (ceremonies.size >= 64) {
          throw new Error('MACHINE_BINDING_CEREMONY_LIMIT');
        }
        const ceremonyId = randomUUID();
        ceremonies.set(ceremonyId, Object.freeze({ ...selected, name }));
        return Object.freeze({ status: 'operator-action-required', ceremonyId });
      },
      async removeBinding(operationInput) {
        return removeBoundMachine({
          machineId: operationInput.machineId,
          assertCurrent() {
            operationInput.signal.throwIfAborted();
            operationInput.admitted.assertCurrent();
          },
        });
      },
      async preparePrint(operationInput) {
        if (!input.runtime) {
          throw new Error('MACHINE_OPERATION_UNAVAILABLE');
        }
        const machineId = identity.parse(operationInput.machineId);
        const { record } = usableMachine(machineId, 'MACHINE_PREPARATION_UNAVAILABLE');
        const session = connectedSessions.get(machineId);
        if (!session) {
          throw new Error('MACHINE_PREPARATION_UNAVAILABLE');
        }
        const listed = await ownedDirectory.snapshot();
        const entry = listed.entries.find((candidate) => candidate.machineId === machineId);
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
        const definition = await definitionOf(record.providerId);
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
            expectedMachineId: record.physicalId,
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
          physicalMachineId: record.physicalId,
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
        const preparation = await store.writePreparation({
          version: 1,
          prepared,
          providerId: record.providerId,
          configuration,
          providerData,
        });
        preparations.set(preparedId, preparation);
        return preparation.prepared;
      },
      async uploadPrint(operationInput) {
        const { runtime } = input;
        if (!runtime) {
          throw new Error('MACHINE_OPERATION_UNAVAILABLE');
        }
        const machineId = identity.parse(operationInput.machineId);
        const operationId = identity.parse(operationInput.operationId);
        return effectQueue.queueForMany([`effect:${operationId}`, `machine:${machineId}`], async () => {
          operationInput.signal.throwIfAborted();
          operationInput.admitted.assertCurrent();
          const preparation = preparations.get(identity.parse(operationInput.preparedId));
          if (
            !preparation ||
            preparation.prepared.machineId !== machineId ||
            preparation.prepared.preparedDigest !== operationInput.preparedDigest
          ) {
            throw new Error('MACHINE_PREPARATION_MISMATCH');
          }
          const { record } = usableMachine(machineId, 'MACHINE_OPERATION_UNAVAILABLE');
          return executeEffect({
            admitted: operationInput.admitted,
            signal: operationInput.signal,
            operationId,
            machineId,
            providerId: record.providerId,
            physicalMachineId: record.physicalId,
            intent: {
              kind: 'upload',
              preparedId: preparation.prepared.preparedId,
              preparedDigest: preparation.prepared.preparedDigest,
            },
            async preflight() {
              if (Date.parse(preparation.prepared.expiresAt) <= Date.parse(runtime.discovery.clock.now())) {
                throw new Error('MACHINE_PREPARATION_EXPIRED');
              }
              const listed = await ownedDirectory.snapshot();
              const entry = listed.entries.find((candidate) => candidate.machineId === machineId);
              if (entry?.freshness !== 'current' || entry.snapshot.connection !== 'connected') {
                throw new Error('MACHINE_UPLOAD_STALE_MACHINE');
              }
              if (!connectedSessions.has(machineId)) {
                throw new Error('MACHINE_OPERATION_UNAVAILABLE');
              }
            },
            async send() {
              const session = connectedSessions.get(machineId);
              if (!session) {
                throw new Error('MACHINE_OPERATION_UNAVAILABLE');
              }
              const transfer = await session.uploadPrint({
                operationId,
                expectedMachineId: record.physicalId,
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
        });
      },
      async startPrint(operationInput) {
        const { runtime } = input;
        if (!runtime) {
          throw new Error('MACHINE_OPERATION_UNAVAILABLE');
        }
        const machineId = identity.parse(operationInput.machineId);
        const operationId = identity.parse(operationInput.operationId);
        const transferId = identity.parse(operationInput.transferId);
        return effectQueue.queueForMany([`effect:${operationId}`, `machine:${machineId}`], async () => {
          operationInput.signal.throwIfAborted();
          operationInput.admitted.assertCurrent();
          const preparation = preparations.get(identity.parse(operationInput.preparedId));
          if (
            !preparation ||
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
          const { record } = usableMachine(machineId, 'MACHINE_OPERATION_UNAVAILABLE');
          return executeEffect({
            admitted: operationInput.admitted,
            signal: operationInput.signal,
            operationId,
            machineId,
            providerId: record.providerId,
            physicalMachineId: record.physicalId,
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
              const listed = await ownedDirectory.snapshot();
              const entry = listed.entries.find((candidate) => candidate.machineId === machineId);
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
              if (!connectedSessions.has(machineId)) {
                throw new Error('MACHINE_START_UNAVAILABLE');
              }
            },
            async send() {
              const session = connectedSessions.get(machineId);
              if (!session) {
                throw new Error('MACHINE_START_UNAVAILABLE');
              }
              return session.submit({
                operationId,
                expectedMachineId: record.physicalId,
                artifact: preparation.prepared.artifact,
                remoteName: preparation.prepared.remoteName,
                transferId,
                providerData: preparation.providerData,
                configuration: preparation.configuration,
                signal: operationInput.signal,
              });
            },
          });
        });
      },
      async controlRun(operationInput) {
        if (!input.runtime) {
          throw new Error('MACHINE_OPERATION_UNAVAILABLE');
        }
        const machineId = identity.parse(operationInput.machineId);
        const operationId = identity.parse(operationInput.operationId);
        return effectQueue.queueForMany([`effect:${operationId}`, `machine:${machineId}`], async () => {
          operationInput.signal.throwIfAborted();
          operationInput.admitted.assertCurrent();
          const { record } = usableMachine(machineId, 'MACHINE_CONTROL_UNAVAILABLE');
          return executeEffect({
            admitted: operationInput.admitted,
            signal: operationInput.signal,
            operationId,
            machineId,
            providerId: record.providerId,
            physicalMachineId: record.physicalId,
            intent: {
              kind: operationInput.command,
              expectedProviderRunId: operationInput.expectedProviderRunId,
            },
            async preflight() {
              const listed = await ownedDirectory.snapshot();
              const entry = listed.entries.find((candidate) => candidate.machineId === machineId);
              if (
                entry?.freshness !== 'current' ||
                entry.snapshot.connection !== 'connected' ||
                entry.snapshot.activeRunId !== operationInput.expectedProviderRunId
              ) {
                throw new Error('MACHINE_CONTROL_STALE_RUN');
              }
              if (!connectedSessions.has(machineId)) {
                throw new Error('MACHINE_CONTROL_UNAVAILABLE');
              }
            },
            async send() {
              const session = connectedSessions.get(machineId);
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
        });
      },
      async captureStill(operationInput) {
        const { runtime } = input;
        if (!runtime) {
          throw new Error('MACHINE_OPERATION_UNAVAILABLE');
        }
        const machineId = identity.parse(operationInput.machineId);
        const session = connectedSessions.get(machineId);
        if (!machines.has(machineId) || session?.stillCapture.type !== 'supported') {
          throw new Error('MACHINE_STILL_UNAVAILABLE');
        }
        const requestedAt = Date.parse(runtime.discovery.clock.now());
        if (!Number.isFinite(requestedAt)) {
          throw new TypeError('MACHINE_CLOCK_INVALID');
        }
        const previous = stillCaptureTimes.get(machineId);
        if (previous !== undefined && requestedAt - previous < 5000) {
          throw new Error('MACHINE_STILL_RATE_LIMITED');
        }
        operationInput.signal.throwIfAborted();
        operationInput.admitted.assertCurrent();
        stillCaptureTimes.set(machineId, requestedAt);
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
          const machine = machines.get(machineId);
          if (machine?.operations.status === 'corrupt') {
            throw new Error('MACHINE_OPERATIONS_LOG_CORRUPT', { cause: machine.operations.error });
          }
          const state = effects.get(operationId);
          if (state?.intent.machineId !== machineId) {
            throw new Error('MACHINE_OPERATION_UNKNOWN');
          }
          if (state.status !== 'unknown') {
            return effectSnapshot(state);
          }
          const session = connectedSessions.get(machineId);
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
            const { intent } = state.intent;
            providerReceipt = await session.reconcile({
              operationId,
              command,
              ...(intent.kind === 'start' ? { transferId: intent.transferId } : {}),
              signal: operationInput.signal,
            });
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
              intent: state.intent.intent,
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
        return effectQueue.queueFor(`request:${requestId}`, async () => {
          operationInput.signal.throwIfAborted();
          operationInput.admitted.assertCurrent();
          const configuration = cloneBoundedJson(operationInput.configuration, {
            code: 'NODE_MACHINE_PREPARATION_CONFIGURATION',
            maximumDepth: 20,
            maximumNodes: 2048,
            maximumCharacters: 65_536,
          });
          const existing = requests.get(requestId);
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
          // A request lives in its machine's directory, so an unbound machine gets none.
          usableMachine(machineId, 'MACHINE_PREPARATION_UNAVAILABLE');
          const createdAt = now();
          let record = await commitRequest({
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
            record = await commitRequest({ ...record, state: 'awaiting-approval', prepared });
          } catch (error) {
            record = await commitRequest({ ...record, state: 'failed', failure: requestFailure(error) });
          }
          return record;
        });
      },
      async listPrintRequests(operationInput) {
        const machineId = operationInput.machineId === undefined ? undefined : identity.parse(operationInput.machineId);
        return listRequests(machineId, operationInput.projectId);
      },
      async *watchPrintRequests(operationInput) {
        const { signal, projectId } = operationInput;
        const machineId = operationInput.machineId === undefined ? undefined : identity.parse(operationInput.machineId);
        // Ponytail: every frame is a whole record, so pending updates coalesce by request id and never need a cursor.
        const pending = new Map<string, PrintRequest>();
        let wake = Promise.withResolvers<void>();
        const off = requestCommits.subscribe(
          (request) => {
            if (
              (machineId === undefined || request.machineId === machineId) &&
              (projectId === undefined || request.artifact.projectId === projectId)
            ) {
              pending.set(request.requestId, request);
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
          for (const request of listRequests(machineId, projectId)) {
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
        return effectQueue.queueFor(`request:${requestId}`, async () => {
          operationInput.signal.throwIfAborted();
          admitted.assertCurrent();
          const record = requests.get(requestId);
          if (!record) {
            throw new Error('MACHINE_PRINT_REQUEST_UNKNOWN');
          }
          if (operationInput.decision === 'deny') {
            if (record.state !== 'awaiting-approval') {
              throw new Error('MACHINE_PRINT_REQUEST_NOT_AWAITING');
            }
            return commitRequest({ ...record, state: 'denied', resolvedBy: operationInput.resolvedBy });
          }
          // An approval moves toward the printer; a machine whose log is unreadable could not record it.
          usableMachine(record.machineId, 'MACHINE_OPERATION_UNAVAILABLE');
          let current = record;
          if (current.state === 'awaiting-approval') {
            current = await commitRequest({
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
          const latest = (): PrintRequest => requests.get(requestId) ?? current;
          try {
            if (current.state === 'approved') {
              current = await commitRequest({ ...current, state: 'uploading' });
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
              current = await commitRequest({
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
        return effectQueue.queueFor(`request:${requestId}`, async () => {
          operationInput.signal.throwIfAborted();
          operationInput.admitted.assertCurrent();
          const record = requests.get(requestId);
          if (!record) {
            throw new Error('MACHINE_PRINT_REQUEST_UNKNOWN');
          }
          if (record.state !== 'awaiting-approval') {
            throw new Error('MACHINE_PRINT_REQUEST_NOT_AWAITING');
          }
          return commitRequest({ ...record, state: 'withdrawn', resolvedBy: operationInput.resolvedBy });
        });
      },
    });
  const channels = new Set<NodeMachineChannelHandle>();
  let closing: Promise<void> | undefined;
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
    const definition = await definitionOf(pending.providerId);
    const abort = new AbortController();
    const session = await definition.connect(
      {
        candidate: pending.candidate,
        configuration: pending.configuration,
        connection,
        signal: abort.signal,
      },
      input.runtime.connection(),
    );
    const lost = Promise.withResolvers<void>();
    let bound: MachineBindingRecord | undefined;
    try {
      const descriptor = await session.getDescriptor({ signal: abort.signal });
      if (pending.candidate.claimedIdentity.serial && pending.candidate.claimedIdentity.serial !== descriptor.id) {
        throw new Error('NODE_MACHINE_HOST_PHYSICAL_IDENTITY_CHANGED');
      }
      const snapshot = await session.getSnapshot({ signal: abort.signal });
      // `machine.json` is written before the session attaches: a crash after this leaves a whole binding that
      // reconnects at the next start, never a live session the store does not know.
      bound = await effectQueue.queueFor('bindings', async () => {
        if (closed) {
          throw new Error('MACHINE_BINDING_UNAVAILABLE');
        }
        // Identity is `{ providerId, physicalId }` in each `machine.json`, never a directory name.
        if (
          [...machines.values()].some(
            ({ record }) => record.providerId === pending.providerId && record.physicalId === descriptor.id,
          )
        ) {
          throw new Error('NODE_MACHINE_HOST_PHYSICAL_IDENTITY_CONFLICT');
        }
        const created = await store.createMachine({
          name: pending.name,
          providerId: pending.providerId,
          physicalId: descriptor.id,
          candidate: pending.candidate,
          configuration: pending.configuration,
          connection,
          boundAt: now(),
          last: { descriptor, snapshot, observedAt: now() },
        });
        machines.set(created.record.id, { record: created.record, operations: { status: 'open', log: created.log } });
        return created.record;
      });
      try {
        await ownedDirectory.attach({
          machineId: bound.id,
          name: bound.name,
          providerId: bound.providerId,
          session,
          onLost() {
            lost.resolve();
          },
        });
      } catch (error) {
        machines.delete(bound.id);
        await store.discardMachine(bound.id).catch(report);
        throw error;
      }
      connectedSessions.set(bound.id, session);
      supervise(bound, lost.promise);
      ceremonies.delete(ceremonyId);
      return Object.freeze({ status: 'bound', machineId: bound.id });
    } catch (error) {
      if (bound === undefined || connectedSessions.get(bound.id) !== session) {
        await session.close().catch(() => undefined);
      }
      throw error;
    }
  };
  // Unbind one machine and forget its credential once no other binding uses it. The directory entry goes first
  // (removing it closes the session the directory owns), then the machine's directory is moved aside: a crash between
  // the two leaves a whole binding that reconnects, never a listed machine without one.
  const removeBoundMachine = async (
    removal: RemoveNodeMachineBindingInput & Readonly<{ assertCurrent?(): void }>,
  ): Promise<MachineBindingRemoval> => {
    const machineId = identity.parse(removal.machineId);
    // Queued behind this machine's in-flight upload, start or control.
    return effectQueue.queueFor(`machine:${machineId}`, async () => {
      if (closed) {
        throw new Error('MACHINE_BINDING_UNAVAILABLE');
      }
      removal.assertCurrent?.();
      const machine = machines.get(machineId);
      if (!machine) {
        throw new Error('MACHINE_DIRECTORY_UNKNOWN_MACHINE');
      }
      // A machine whose log is unreadable can never settle its requests, so they do not hold it.
      if (
        machine.operations.status === 'open' &&
        [...requests.values()].some(
          (request) => request.machineId === machineId && bindingBusyStates.has(request.state),
        )
      ) {
        throw new Error('MACHINE_BINDING_BUSY');
      }
      // Nothing reconnects a removed binding; an attempt in flight is abandoned.
      supervisors.get(machineId)?.stop.abort();
      supervisors.delete(machineId);
      // A retry after a refused move finds the directory entry already gone.
      const listed = await ownedDirectory.snapshot();
      if (listed.entries.some((entry) => entry.machineId === machineId)) {
        await ownedDirectory.remove({ machineId });
      }
      connectedSessions.delete(machineId);
      await store.removeMachine(machineId);
      machines.delete(machineId);
      stillCaptureTimes.delete(machineId);
      for (const [operationId, state] of effects) {
        if (state.intent.machineId === machineId) {
          effects.delete(operationId);
        }
      }
      for (const [preparedId, preparation] of preparations) {
        if (preparation.prepared.machineId === machineId) {
          preparations.delete(preparedId);
        }
      }
      for (const [requestId, request] of requests) {
        if (request.machineId === machineId) {
          requests.delete(requestId);
        }
      }
      const { secretRef } = machine.record.connection;
      if (
        secretRef !== 'none' &&
        ![...machines.values()].some(({ record }) => record.connection.secretRef === secretRef)
      ) {
        try {
          await input.runtime?.credentials?.forget(secretRef);
        } catch (error) {
          report(error);
        }
      }
      return Object.freeze({ status: 'removed', machineId });
    });
  };
  const assertServing = (): void => {
    if (closed) {
      throw new Error('NODE_MACHINE_HOST_CLOSED');
    }
    if (admission.hostId !== hostId) {
      throw new Error('NODE_MACHINE_HOST_WRONG_ADMISSION');
    }
  };

  return Object.freeze({
    issueSession(sessionInput) {
      assertServing();
      // Only this host's own route: holding the host never mints a session for another route.
      if (sessionInput.grants.some((grant) => grant.route !== 'machines')) {
        throw new TypeError('INVALID_HOST_GRANT');
      }
      return admission.issueTrustedSession({
        actor: sessionInput.actor,
        authorityId,
        workspaceId: machineAdmissionScope,
        grants: sessionInput.grants,
      });
    },
    admitRoute(routeInput) {
      assertServing();
      return admission.admitRoute({
        session: routeInput.session,
        authorityId,
        workspaceId: machineAdmissionScope,
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
        workspaceId: machineAdmissionScope,
        route: 'machines',
      });
      const channel = exposeMachineChannel({
        port: channelInput.port,
        session: channelInput.session,
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
    describeBinding(ceremonyId) {
      const pending = ceremonies.get(ceremonyId);
      return pending ? Object.freeze({ providerId: pending.providerId, candidate: pending.candidate }) : undefined;
    },
    removeBinding: removeBoundMachine,
    async close() {
      if (closing) {
        return closing;
      }
      closed = true;
      // No reconnect starts from here on: pending retries are cancelled and attempts in flight abandoned.
      const supervised = [...supervisors.values()];
      supervisors.clear();
      for (const { stop } of supervised) {
        stop.abort();
      }
      closing = closeOwned([
        async () => {
          const active = [...channels];
          for (const channel of active) {
            channel.dispose('node machine host closed');
          }
          await Promise.allSettled(active.map(async (channel) => channel.closed));
          channels.clear();
        },
        async () => {
          await Promise.allSettled(supervised.map(async ({ done }) => done));
        },
        async () => effectQueue.whenDrained(),
        async () => ownedDirectory.close(),
        () => {
          connectedSessions.clear();
          discovered.clear();
          ceremonies.clear();
        },
        () => {
          commits.dispose();
          requestCommits.dispose();
        },
        async () => store.close(),
      ]);
      return closing;
    },
  });
};
