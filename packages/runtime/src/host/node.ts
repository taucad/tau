import { canonicalizeCacheValue } from '@taucad/cache-core';
import type { CacheValue } from '@taucad/cache-core';
import { Topic } from '@taucad/events';
import { ResourceQueue } from '@taucad/filesystem';

import type {
  AdmittedHostRoute,
  HostActor,
  HostAdmissionAuthority,
  HostRouteGrant,
  HostSessionHandle,
} from '#host/host-admission.js';
import { createNodeMachineOperations } from '#host/node-machine-actions.js';
import type { NodeMachineOperations } from '#host/node-machine-actions.js';
import { createNodeMachineBindings } from '#host/node-machine-bindings.js';
import { identity } from '#host/node-machine-context.js';
import type {
  BoundMachine,
  CompleteNodeMachineBindingInput as ContextCompleteBindingInput,
  ExecutableMachineDefinition,
  NodeMachineHostContext,
  NodeMachineRuntime as ContextMachineRuntime,
  NodeMachineSupervisor,
  RemoveNodeMachineBindingInput as ContextRemoveBindingInput,
} from '#host/node-machine-context.js';
import type { MachineEventLog } from '#host/node-machine-event-log.js';
import { advanceJob, createNodeMachineJobs, terminalJobStates } from '#host/node-machine-jobs.js';
import {
  applyOperationResult,
  journalVersion,
  parseJournalEvent,
  replayJournal,
} from '#host/node-machine-operations.js';
import type { NodeMachineJournalEvent, NodeMachineOperationState } from '#host/node-machine-operations.js';
import { createNodeMachineSerial as createSerial } from '#host/node-machine-serial.js';
import type {
  NodeMachineSerialDriver as SerialDriver,
  NodeMachineSerialPortInfo as SerialPortInfo,
} from '#host/node-machine-serial.js';
import { openNodeMachineStore } from '#host/node-machine-store.js';
import type { MachineBindingRecord, MachinePreparationRecord } from '#host/node-machine-store.js';
import { createNodeMachineSupervision } from '#host/node-machine-supervision.js';
import {
  exposeMachineChannel,
  machineAdmissionScope,
  parseMachineOperationReceipt,
} from '#machines/machine-channel.js';
import type { MachineChannelEndpoint, MachineChannelHostOperations } from '#machines/machine-channel.js';
import type { MachineBindingRemoval } from '#machines/machine-client.js';
import { createMachineDirectory } from '#machines/machine-directory.js';
import { machineStartWaitMilliseconds } from '#machines/machine-jobs.js';
import type { MachineDirectory, MachineDirectoryEntry } from '#machines/machine-directory.js';
import type { MachineJob } from '#machines/machine-jobs.js';
import type { MachineAlert } from '#machines/machine-observation.js';
import { isSimulatedMachine } from '#machines/machine-manifest.js';
import { parseMachineProvider } from '#machines/machine.js';
import type {
  MachineCandidate,
  MachineBindingOutcome,
  MachineDescriptor,
  MachineProvider,
  MachineSession,
} from '#machines/machine.js';
import { resolveRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';
import type { RuntimePluginDefinitionCarrier } from '#plugins/plugin-runtime-definition.js';

/** Host-owned network and secret capabilities used by generated machine providers. @public */
export type NodeMachineRuntime = ContextMachineRuntime;
/** The native serial driver a host application supplies. @public */
export type NodeMachineSerialDriver = SerialDriver;
/** One serial port as a driver lists it. @public */
export type NodeMachineSerialPortInfo = SerialPortInfo;
/**
 * Serial access for providers over a host-supplied native driver: `listSerialPorts` for discovery and `openSerial`
 * for connections. @public
 */
// oxlint-disable-next-line unicorn-js/prefer-export-from -- The host/node entry keeps one value path; a barrel export is forbidden.
export const createNodeMachineSerial = createSerial;
/** Trusted native completion of a browser-initiated, non-secret binding ceremony. @public */
export type CompleteNodeMachineBindingInput = ContextCompleteBindingInput;
/** Trusted native removal of one committed binding, e.g. to roll back a binding whose credential could not be saved. @public */
export type RemoveNodeMachineBindingInput = ContextRemoveBindingInput;

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
  /**
   * Begin quiescing: from this call until the returned `resume` is called (or the host closes), approving a job and
   * the start of any job, stored or streamed, are refused `MACHINE_HOST_CLOSING`; a job refused at its start fails
   * with that code and is requested again. Reads, stops, holds and actions carry on, and a run already started keeps
   * running. The promise settles once every start already past its check has settled, so its run, if any, is on its
   * job (and, for a streamed start, in the machine's report). A launcher awaits this before it checks whether a
   * streamed run is feeding a machine and then closes, so none begins in between; when it keeps running after all, it
   * calls `resume`.
   * @param input - `startTimeout`: how long to wait for starts in flight, in milliseconds (default
   * `machineStartWaitMilliseconds`).
   * @returns `resume`: admit starts again. Calling it more than once does nothing.
   * @throws {@link MachineHostStartInFlightError} when a start is still in flight after `startTimeout`. The gate stays
   * up: a launcher that closes anyway just closes, and one that calls its close off calls the error's `resume`.
   */
  quiesce(input?: Readonly<{ /** Milliseconds. */ startTimeout?: number }>): Promise<() => void>;
  close(): Promise<void>;
}>;

/**
 * `quiesce()` waited `startTimeout` and a start was still in flight, so the launcher cannot know whether a run is
 * beginning. Starts stay refused until `resume` is called.
 * @public
 */
export class MachineHostStartInFlightError extends Error {
  /** Admit starts again, for a launcher that calls its close off. Calling it more than once does nothing. */
  public readonly resume: () => void;

  public constructor(resume: () => void) {
    super('MACHINE_HOST_START_IN_FLIGHT');
    this.name = 'MachineHostStartInFlightError';
    this.resume = resume;
  }

  /**
   * The failure code, beside the message.
   * @returns `MACHINE_HOST_START_IN_FLIGHT`.
   */
  public get code(): 'MACHINE_HOST_START_IN_FLIGHT' {
    return 'MACHINE_HOST_START_IN_FLIGHT';
  }
}

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

/** Why a host without serial access lists a serial provider unavailable. */
const serialUnavailable = Object.freeze({
  reason: 'This Tau cannot reach serial ports yet, so it cannot find or connect a machine on one.',
});

/**
 * What a binding whose provider this host lists unavailable is listed with; it is neither connected nor retried.
 * ponytail: serial access is the only unavailability this host derives, so the remedy names it; a second kind would
 * carry its own remedy beside its reason.
 * @param reason - The host's reason the provider is unavailable.
 * @returns The alert.
 */
const providerUnavailableAlert = (reason: string): MachineAlert => ({
  code: 'MACHINE_PROVIDER_UNAVAILABLE',
  severity: 'serious',
  message: reason,
  blocks: 'everything',
  remedies: [
    {
      type: 'person',
      instruction: 'Open this machine in a Tau with serial support installed and enabled, or remove it here.',
    },
  ],
});

/** What a binding whose provider this host does not serve is listed with: nothing works until a person acts. */
const providerUnservedAlert: MachineAlert = {
  code: 'MACHINE_PROVIDER_UNAVAILABLE',
  severity: 'serious',
  message: 'This Tau does not serve the provider this machine was bound with.',
  blocks: 'everything',
  remedies: [{ type: 'person', instruction: 'Update Tau, or remove this machine and bind it again.' }],
};

// Two descriptors name the same installation when they differ only in incarnation.
const sameDescriptor = (left: MachineDescriptor, right: MachineDescriptor): boolean => {
  const comparable = (descriptor: MachineDescriptor): string =>
    // SAFETY: descriptors are strictly parsed bounded JSON.
    canonicalizeCacheValue({
      value: { ...descriptor, capabilities: { ...descriptor.capabilities, incarnation: '' } } as unknown as CacheValue,
    });
  return comparable(left) === comparable(right);
};

/**
 * What a binding whose machine has never reported is listed with (one migrated without a usable last-known entry, or
 * whose cache an older host wrote in another shape), so it can be seen and removed: its own identity, the provider's
 * manifest as the installed capabilities, and no observations, stale until the machine connects.
 *
 * @param record - The binding.
 * @param provider - The binding's provider, when this host serves it.
 * @returns A placeholder descriptor and snapshot.
 */
const unreportedIdentity = (
  record: MachineBindingRecord,
  provider: MachineProvider | undefined,
): Pick<MachineDirectoryEntry, 'descriptor' | 'snapshot'> => {
  const manifest = provider?.manifest;
  return {
    descriptor: {
      id: record.physicalId,
      name: record.candidate.name,
      vendor: provider?.vendor ?? record.providerId,
      model: record.candidate.claimedIdentity.model ?? 'unknown',
      firmware: 'unknown',
      capabilities: {
        connection: manifest?.connection ?? {
          transport: 'network',
          exclusive: false,
          opening: 'nothing',
          identity: 'authenticated',
        },
        axes: manifest?.axes ?? [],
        components: manifest?.components ?? [{ id: 'controller', label: 'Controller', kind: 'controller' }],
        processes: manifest?.processes ?? [],
        actions: manifest?.actions ?? [],
        holds: manifest?.holds ?? [],
        jobs: manifest?.jobs ?? { type: 'unsupported' },
        stop: manifest?.stop ?? {
          motion: 'halts',
          spindle: 'none',
          heaters: 'none',
          position: 'may-be-lost',
          recovery: [],
        },
        revision: 'unreported',
        incarnation: 'unreported',
        qualifications: manifest?.qualifications ?? [],
      },
    },
    snapshot: {
      connection: 'disconnected',
      observedAt: record.boundAt,
      state: { status: 'unknown' },
      components: [],
      activities: [],
      checks: [],
      availability: [],
      alerts: [],
      operations: [],
    },
  };
};

/**
 * Open the machine store and serve its machine directory.
 *
 * Recovery follows the store's order: take the lock, migrate a legacy journal once, load every `machine.json` and
 * unexpired preparation, replay each machine's journal and record every possible send as unknown (`confirming`),
 * settle the jobs, list each machine stale from its last-known identity (a placeholder for one that never reported),
 * then reconnect. A machine whose journal is unreadable, or cannot take its recovery record, stays listed but
 * unavailable; every other machine works.
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
  if (new Set(input.providers.map((provider) => provider.id)).size !== input.providers.length) {
    throw new TypeError('NODE_MACHINE_HOST_DUPLICATE_PROVIDER');
  }
  // One provider this host cannot read (a newer manifest or protocol version) is refused alone: its bindings are
  // listed stale with a remedy, and every other provider is served.
  // A serial provider needs the host's serial access, unless it only simulates its machine; a host given custom
  // operations owns that decision itself.
  const unreachable = (manifest: MachineProvider['manifest']): boolean =>
    input.runtime !== undefined &&
    input.runtime.discovery.listSerialPorts === undefined &&
    manifest.connection.transport === 'serial' &&
    !isSimulatedMachine(manifest);
  const providers: readonly MachineProvider[] = Object.freeze(
    input.providers.flatMap((provider): MachineProvider[] => {
      try {
        // `unavailable` is the host's to say; a provider that claims it is reported and not believed.
        const { unavailable: claimed, ...parsed } = parseMachineProvider(provider);
        if (claimed !== undefined) {
          report(Object.assign(new Error('MACHINE_PROVIDER_UNAVAILABLE_CLAIMED'), { providerId: parsed.id }));
        }
        return [Object.freeze(unreachable(parsed.manifest) ? { ...parsed, unavailable: serialUnavailable } : parsed)];
      } catch (error) {
        report(
          Object.assign(new Error('MACHINE_PROVIDER_REFUSED', { cause: error }), { providerId: String(provider.id) }),
        );
        return [];
      }
    }),
  );
  const providerSources = new Map(
    input.providers
      .filter((provider) => providers.some((served) => served.id === provider.id))
      .map((provider) => [provider.id, provider]),
  );
  const definitions = new Map<string, Promise<ExecutableMachineDefinition>>();
  const resolveDefinition = async (
    source: MachineProvider & RuntimePluginDefinitionCarrier<unknown>,
  ): Promise<ExecutableMachineDefinition> => {
    const candidate = await resolveRuntimePluginDefinition('machine', source);
    const hasSchema = (key: string, optional = false): boolean => {
      const value: unknown =
        candidate !== null && typeof candidate === 'object' ? Reflect.get(candidate, key) : undefined;
      return (optional && value === undefined) || (value !== null && typeof value === 'object' && 'schema' in value);
    };
    const fields: Readonly<Record<string, unknown>> =
      candidate !== null && typeof candidate === 'object' ? (candidate as Readonly<Record<string, unknown>>) : {};
    const manifest: unknown = Reflect.get(fields, 'manifest');
    if (
      !hasSchema('bindingConfiguration') ||
      !hasSchema('submissionConfiguration') ||
      !hasSchema('settingsConfiguration', true) ||
      manifest === null ||
      typeof manifest !== 'object' ||
      !Array.isArray(Reflect.get(manifest, 'actions')) ||
      !Array.isArray(Reflect.get(manifest, 'holds')) ||
      typeof Reflect.get(fields, 'discover') !== 'function' ||
      typeof Reflect.get(fields, 'connect') !== 'function'
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
  // A binding stored before endpoints named their transport reads as a network one (the store cannot know); for a
  // provider that connects over serial it was a device path. Written in the new shape the next time it is written.
  const storedTransport = (record: MachineBindingRecord): MachineBindingRecord => {
    const { endpoint } = record.candidate;
    const transport = providers.find(({ id }) => id === record.providerId)?.manifest.connection.transport;
    return endpoint.transport === 'network' && transport === 'serial'
      ? { ...record, candidate: { ...record.candidate, endpoint: { transport: 'serial', path: endpoint.address } } }
      : record;
  };
  const store = await openNodeMachineStore<NodeMachineJournalEvent>({
    storeRoot: input.storeRoot,
    legacyStoreRoots: input.legacyStoreRoots ?? [],
    parseOperation: parseJournalEvent,
    now,
    onError: report,
  });
  /** Every bound machine, by machine id. */
  const machines = new Map<string, BoundMachine>();
  const preparations = new Map<string, MachinePreparationRecord>();
  /** Every recorded operation of a machine with a readable journal, by operation id. */
  const operations = new Map<string, NodeMachineOperationState>();
  /** Every job of a bound machine, by job id. */
  const jobs = new Map<string, MachineJob>();
  const stillCaptureTimes = new Map<string, number>();
  const effectQueue = new ResourceQueue();
  const connectedSessions = new Map<string, MachineSession>();
  /** One reconnect loop per supervised machine; aborting `stop` ends it. */
  const supervisors = new Map<string, NodeMachineSupervisor>();
  let closed = false;
  /** Quiescers that have not resumed; any one of them refuses starts. */
  let quiescers = 0;
  const startsInFlight = new Set<Promise<unknown>>();
  let directory: MachineDirectory | undefined;
  const commits = new Topic<void>({ name: 'node-machine-directory-commits', onError });
  const jobCommits = new Topic<MachineJob>({ name: 'node-machine-jobs', onError });
  const sessionLost = new Topic<string>({ name: 'node-machine-session-lost', onError });
  // The machine an operation is recorded against, refusing an unbound machine with `missing` and an unreadable journal.
  const usableMachine = (
    machineId: string,
    missing: string,
  ): Readonly<{ record: MachineBindingRecord; log: MachineEventLog<NodeMachineJournalEvent> }> => {
    const machine = machines.get(machineId);
    if (!machine) {
      throw new Error(missing);
    }
    if (machine.operations.status !== 'open') {
      throw new Error('MACHINE_OPERATIONS_LOG_CORRUPT', { cause: machine.operations.error });
    }
    return { record: machine.record, log: machine.operations.log };
  };
  const commitJob = async (job: MachineJob): Promise<MachineJob> => {
    const committed = await store.writeJob({ ...job, updatedAt: now() });
    jobs.set(committed.jobId, committed);
    jobCommits.emit(committed);
    return committed;
  };
  // Take one machine out of service for this run: its journal cannot be trusted or written, so none of its operations
  // is sent or settled again. Every other machine is untouched.
  const markCorrupt = (machineId: string, cause: unknown): void => {
    const error = new Error('MACHINE_OPERATIONS_LOG_CORRUPT', { cause });
    const machine = machines.get(machineId);
    if (machine) {
      machine.operations = { status: 'corrupt', error };
    }
    for (const [operationId, operation] of operations) {
      if (operation.planned.machineId === machineId) {
        operations.delete(operationId);
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
  // Settle at restart: a possible send is unknown, a held control ended with the host.
  const recover = async (operation: NodeMachineOperationState): Promise<void> => {
    const { planned } = operation;
    const { log } = usableMachine(planned.machineId, 'MACHINE_UNAVAILABLE');
    const base = {
      operationId: planned.operationId,
      machineId: planned.machineId,
      kind: planned.kind,
      observedAt: now(),
    };
    const held = planned.kind === 'hold';
    const event = parseJournalEvent({
      version: journalVersion,
      type: 'machine-operation-result',
      operationId: planned.operationId,
      source: 'recovery',
      state: held ? 'rejected' : 'confirming',
      receipt: parseMachineOperationReceipt(
        held
          ? {
              ...base,
              status: 'rejected',
              code: 'MACHINE_HOLD_ENDED',
              message: 'Tau restarted while the control was held; the machine stops by itself within its bound.',
            }
          : { ...base, status: 'unknown', reason: 'Tau restarted after the command may have been sent.' },
      ),
      observedAt: now(),
    });
    if (event.type !== 'machine-operation-result') {
      return;
    }
    const next = { ...operation };
    applyOperationResult(next, event);
    await log.append(event);
    Object.assign(operation, next);
  };
  try {
    for (const loaded of store.machines) {
      machines.set(loaded.record.id, { record: storedTransport(loaded.record), operations: loaded.operations });
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
        // oxlint-disable-next-line eslint/no-await-in-loop -- each machine's journal folds before the next.
        const replayed = await replayJournal(machineId, machine.operations.log);
        if ([...replayed.keys()].some((operationId) => operations.has(operationId))) {
          throw new Error('NODE_MACHINE_OPERATION_DUPLICATE');
        }
        for (const [operationId, operation] of replayed) {
          operations.set(operationId, operation);
        }
      } catch (error) {
        markCorrupt(machineId, error);
      }
    }
    for (const operation of operations.values()) {
      if (operation.state !== 'sending') {
        continue;
      }
      try {
        // oxlint-disable-next-line eslint/no-await-in-loop -- recovery must durably classify each possible send.
        await recover(operation);
      } catch (error) {
        // A journal that cannot take the durable record (a full disk, a failing disk) takes only its machine down.
        markCorrupt(operation.planned.machineId, error);
      }
    }
    for (const loaded of store.machines) {
      for (const job of loaded.jobs) {
        jobs.set(job.jobId, job);
      }
    }
    // Whether a job's pending transfer or start was ever sent; one still `planned` (or never journaled) was not.
    const wasSent = (job: MachineJob): boolean => {
      const operationId = job.state === 'transferring' ? job.transferOperationId : job.startOperationId;
      const operation = operationId === undefined ? undefined : operations.get(operationId);
      return operation !== undefined && operation.state !== 'planned';
    };
    for (const job of jobs.values()) {
      const machine = machines.get(job.machineId);
      const delivery = machine?.record.last?.descriptor.capabilities.jobs;
      let next: MachineJob | undefined;
      if (
        job.state === 'preparing' ||
        job.state === 'approved' ||
        ((job.state === 'transferring' || job.state === 'starting') &&
          machine?.operations.status === 'open' &&
          !wasSent(job))
      ) {
        next = {
          ...job,
          state: 'failed',
          failure: { code: 'HOST_RESTARTED', message: 'Tau restarted before this job reached the machine.' },
        };
      } else if (
        job.state === 'started' &&
        job.run?.outcome === 'running' &&
        delivery?.type === 'supported' &&
        delivery.delivery === 'streamed'
      ) {
        // A streamed run needs this host feeding it; a restart lost it, and the next start needs a person.
        next = { ...job, run: { ...job.run, outcome: 'interrupted', endedAt: now() } };
      } else if (!terminalJobStates.has(job.state) && machine?.operations.status === 'open') {
        // A job of a machine whose journal is unreadable keeps its state: its receipts cannot be read.
        next = advanceJob(job, operations);
      }
      if (next) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- recovered jobs settle one at a time.
        await commitJob(next);
      }
    }
    directory = createMachineDirectory({
      hostId,
      authorityId,
      // Every binding is listed, stale until its machine reports; one that never has shows a placeholder.
      recovered: [...machines.values()].map(({ record }): MachineDirectoryEntry => {
        const provider = providers.find((candidate) => candidate.id === record.providerId);
        const { descriptor, snapshot } = record.last ?? unreportedIdentity(record, provider);
        return {
          machineId: record.id,
          name: record.name,
          providerId: record.providerId,
          // Qualifications are the served provider's, never a stored copy's.
          descriptor: {
            ...descriptor,
            capabilities: { ...descriptor.capabilities, qualifications: provider?.manifest.qualifications ?? [] },
          },
          snapshot: {
            ...snapshot,
            operations: [],
            ...(provider === undefined
              ? { alerts: [...snapshot.alerts, providerUnservedAlert] }
              : provider.unavailable
                ? { alerts: [...snapshot.alerts, providerUnavailableAlert(provider.unavailable.reason)] }
                : {}),
          },
          freshness: 'stale',
          ...(record.testing === true ? { testing: true } : {}),
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
          jobCommits.dispose();
          sessionLost.dispose();
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
    unavailableProviders: new Set(providers.filter(({ unavailable }) => unavailable).map(({ id }) => id)),
    store,
    directory: ownedDirectory,
    effectQueue,
    machines,
    preparations,
    operations,
    jobs,
    jobCommits,
    commits,
    sessionLost,
    stillCaptureTimes,
    connectedSessions,
    supervisors,
    isClosed: () => closed,
    isQuiescing: () => closed || quiescers > 0,
    startsInFlight,
    now,
    report,
    definitionOf,
    usableMachine,
    async currentEntry(machineId) {
      const listed = await ownedDirectory.snapshot();
      const entry = listed.entries.find((candidate) => candidate.machineId === machineId);
      return entry?.freshness === 'current' ? entry : undefined;
    },
    commitJob,
  };
  // The journal tells the ledger about every transfer and start result; the ledger is built after the journal.
  const built: { ledger?: ReturnType<typeof createNodeMachineJobs> } = {};
  const journal: NodeMachineOperations = createNodeMachineOperations(context, async (operation) =>
    built.ledger?.sync(operation),
  );
  const ledger = createNodeMachineJobs(context, journal);
  built.ledger = ledger;
  await Promise.all([...machines.keys()].map(async (machineId) => journal.publish(machineId)));
  // Every report may show a job's run; observations already settle operations through the same topic. One pass at a
  // time, and reports that arrive during it fold into one more pass, so a slow pass never queues one per report.
  let isObserving = false;
  let isObserveWanted = false;
  let observing = Promise.resolve();
  const stopObservingRuns = commits.subscribe(() => {
    isObserveWanted = true;
    if (isObserving) {
      return;
    }
    isObserving = true;
    observing = (async (): Promise<void> => {
      while (isObserveWanted) {
        isObserveWanted = false;
        try {
          // oxlint-disable-next-line eslint/no-await-in-loop -- one pass at a time, over the latest reports.
          await ledger.observe();
        } catch (error) {
          report(error);
        }
      }
      isObserving = false;
    })();
  });
  // A lost session ends what only it could carry: every hold on the machine, and every streamed run it was feeding.
  let losing = Promise.resolve();
  const stopLossHandling = sessionLost.subscribe((machineId) => {
    const previous = losing;
    losing = (async (): Promise<void> => {
      await previous;
      try {
        await journal.releaseHolds(machineId);
        await ledger.interrupt(machineId);
      } catch (error) {
        report(error);
      }
    })();
  });
  const supervision = createNodeMachineSupervision(context);
  const bindings = createNodeMachineBindings(context, supervision.supervise);
  await supervision.resume();
  const captureStill: MachineChannelHostOperations['captureStill'] = async (operationInput) => {
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
  };
  const hostOperations: MachineChannelHostOperations =
    input.operations ??
    Object.freeze({
      ...bindings.operations,
      ...journal.operations,
      ...ledger.operations,
      captureStill,
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
    async quiesce({ startTimeout = machineStartWaitMilliseconds } = {}) {
      quiescers += 1;
      let resumed = false;
      const resume = (): void => {
        if (!resumed) {
          resumed = true;
          quiescers -= 1;
        }
      };
      // A start registered after the gate went up is refused by it; only those already past it are waited for.
      const inFlight = Promise.allSettled(startsInFlight);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timedOut = new Promise<boolean>((resolve) => {
        timer = setTimeout(resolve, startTimeout, true);
      });
      try {
        if (await Promise.race([inFlight.then(() => false), timedOut])) {
          throw new MachineHostStartInFlightError(resume);
        }
      } finally {
        clearTimeout(timer);
      }
      return resume;
    },
    async close() {
      if (closing) {
        return closing;
      }
      closed = true;
      stopObservingRuns();
      stopLossHandling();
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
        async () => journal.releaseHolds(),
        () => {
          journal.close();
        },
        async () => {
          await Promise.allSettled(supervised.map(async ({ done }) => done));
        },
        async () => effectQueue.whenDrained(),
        async () => observing,
        async () => losing,
        async () => ownedDirectory.close(),
        () => {
          connectedSessions.clear();
          bindings.clear();
        },
        () => {
          commits.dispose();
          jobCommits.dispose();
          sessionLost.dispose();
        },
        async () => store.close(),
      ]);
      return closing;
    },
  });
};
