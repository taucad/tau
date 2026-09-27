import { randomUUID } from 'node:crypto';

import { canonicalizeCacheValue, digestContent } from '@taucad/cache-core';
import type { ContentDigest } from '@taucad/cache-core';
import { Topic } from '@taucad/events';
import { ResourceQueue } from '@taucad/filesystem';

import { cloneBoundedJson } from '@taucad/parameters/json';
import type {
  AdmittedHostOperation,
  AdmittedHostRoute,
  HostActor,
  HostAdmissionAuthority,
  HostRouteGrant,
  HostSessionHandle,
} from '#host/host-admission.js';
import { createNodeMachineBindings } from '#host/node-machine-bindings.js';
import { identity } from '#host/node-machine-context.js';
import type {
  BoundMachine,
  ExecutableMachineDefinition,
  NodeMachineHostContext,
  NodeMachineSupervisor,
} from '#host/node-machine-context.js';
import type { MachineEventLog } from '#host/node-machine-event-log.js';
import {
  effectIntentSchema,
  effectResultSchema,
  effectSnapshot,
  parseOperationEvent,
  publicOperationReceipt,
  replayOperations,
} from '#host/node-machine-operations.js';
import type {
  NodeMachineEffectEvent,
  NodeMachineEffectIntentEvent,
  NodeMachineEffectResultEvent,
  NodeMachineEffectState,
} from '#host/node-machine-operations.js';
import {
  advancePrintRequest,
  createNodeMachinePrintRequestOperations,
  terminalRequestStates,
} from '#host/node-machine-print-requests.js';
import { openNodeMachineStore } from '#host/node-machine-store.js';
import type { MachineBindingRecord, MachinePreparationRecord } from '#host/node-machine-store.js';
import { createNodeMachineSupervision } from '#host/node-machine-supervision.js';
import { exposeMachineChannel, machineAdmissionScope } from '#machines/machine-channel.js';
import type { MachineChannelEndpoint, MachineChannelHostOperations } from '#machines/machine-channel.js';
import type { MachineBindingRemoval, MachineOperationReceipt, MachinePreparedPrint } from '#machines/machine-client.js';
import type { PrintRequest } from '#machines/print-request.js';
import { createMachineDirectory } from '#machines/machine-directory.js';
import type { MachineDirectory, MachineDirectoryEntry } from '#machines/machine-directory.js';
import { parseMachineProvider } from '#machines/machine.js';
import type {
  MachineCandidate,
  MachineBindingOutcome,
  MachineConnectionContext,
  MachineConnectionRuntime,
  MachineDescriptor,
  MachineDiscoveryRuntime,
  MachineProvider,
  MachineSession,
  MachineSubmissionReceipt,
  MachineTransferReceipt,
} from '#machines/machine.js';
import { resolveRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';
import type { RuntimePluginDefinitionCarrier } from '#plugins/plugin-runtime-definition.js';

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
  const supervisors = new Map<string, NodeMachineSupervisor>();
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
  const syncRequests = async (operationId: string): Promise<void> => {
    for (const request of requests.values()) {
      if (request.uploadOperationId !== operationId && request.startOperationId !== operationId) {
        continue;
      }
      const next = advancePrintRequest(request, effects);
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
  // Remember a new or changed machine identity in its `machine.json`, so a restart lists it with that identity. A
  // binding already wrote the one it connected with, so a first report of it writes nothing.
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
            ? advancePrintRequest(request, effects)
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
  const context: NodeMachineHostContext = {
    runtime: input.runtime,
    providerSources,
    store,
    directory: ownedDirectory,
    effectQueue,
    machines,
    preparations,
    effects,
    requests,
    requestCommits,
    stillCaptureTimes,
    connectedSessions,
    supervisors,
    isClosed: () => closed,
    now,
    report,
    definitionOf,
    usableMachine,
    commitRequest,
  };
  const supervision = createNodeMachineSupervision(context);
  const bindings = createNodeMachineBindings(context, supervision.supervise);
  await supervision.resume();
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
  const deviceOperations: Pick<
    MachineChannelHostOperations,
    'preparePrint' | 'uploadPrint' | 'startPrint' | 'controlRun' | 'captureStill' | 'reconcileOperation'
  > = {
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
  };
  const hostOperations: MachineChannelHostOperations =
    input.operations ??
    Object.freeze({
      ...bindings.operations,
      ...deviceOperations,
      ...createNodeMachinePrintRequestOperations(context, deviceOperations),
    });
  const channels = new Set<NodeMachineChannelHandle>();
  let closing: Promise<void> | undefined;
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
    completeBinding: bindings.completeBinding,
    describeBinding: bindings.describeBinding,
    removeBinding: bindings.removeBinding,
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
          bindings.clear();
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
