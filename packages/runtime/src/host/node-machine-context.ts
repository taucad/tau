/**
 * What the parts of one Node machine host share: the id and digest schemas its records use, and the state
 * `createNodeMachineHost` builds once its store is open and its directory recovered. Discovery and binding, reconnect
 * supervision, the operation journal and the jobs ledger read and write these same maps; none of them keeps a copy.
 *
 * @module
 */

import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { Topic } from '@taucad/events';
import type { ResourceQueue } from '@taucad/filesystem';

import type { MachineEventLog } from '#host/node-machine-event-log.js';
import {
  digest as operationDigest,
  identity as operationIdentity,
  receiptMessage as operationReceiptMessage,
} from '#host/node-machine-operations.js';
import type { NodeMachineJournalEvent, NodeMachineOperationState } from '#host/node-machine-operations.js';
import type {
  MachineBindingRecord,
  MachineOperationsState,
  MachinePreparationRecord,
  NodeMachineStore,
} from '#host/node-machine-store.js';
import type { MachineDirectory, MachineDirectoryEntry } from '#machines/machine-directory.js';
import type { MachineJob } from '#machines/machine-jobs.js';
import type {
  MachineConnectInput,
  MachineConnectionContext,
  MachineConnectionRuntime,
  MachineDiscoveryEvent,
  MachineDiscoveryInput,
  MachineDiscoveryRuntime,
  MachineManifestDefinition,
  MachineProvider,
  MachineSession,
} from '#machines/machine.js';
import type { RuntimePluginDefinitionCarrier } from '#plugins/plugin-runtime-definition.js';

/** A well-formed string of 1–256 characters: every id, name and code the host records. @internal */
// oxlint-disable-next-line unicorn-js/prefer-export-from -- This file retains its existing value path; a barrel export is forbidden.
export const identity = operationIdentity;
/** A `sha256:` content digest. @internal */
// oxlint-disable-next-line unicorn-js/prefer-export-from -- This file retains its existing value path; a barrel export is forbidden.
export const digest = operationDigest;
/** The readable message a refusal carries. @internal */
// oxlint-disable-next-line unicorn-js/prefer-export-from -- This file retains its existing value path; a barrel export is forbidden.
export const receiptMessage = operationReceiptMessage;

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

/** The executable half of a provider: its trusted schemas, discovery and connection. @internal */
export type ExecutableMachineDefinition = Readonly<{
  /** The authored manifest, whose actions and holds carry the schemas the host validates parameters with. */
  manifest: MachineManifestDefinition;
  bindingConfiguration: Readonly<{ schema: StandardSchemaV1 }>;
  submissionConfiguration: Readonly<{ schema: StandardSchemaV1 }>;
  settingsConfiguration?: Readonly<{ schema: StandardSchemaV1 }>;
  discover(
    input: MachineDiscoveryInput<unknown>,
    runtime: MachineDiscoveryRuntime,
  ): AsyncIterable<MachineDiscoveryEvent>;
  connect(input: MachineConnectInput<unknown>, runtime: MachineConnectionRuntime): Promise<MachineSession>;
}>;

/** One bound machine: its latest `machine.json` and its journal, which may have been found unreadable. @internal */
export type BoundMachine = {
  record: MachineBindingRecord;
  operations: MachineOperationsState<NodeMachineJournalEvent>;
};

/** One supervised machine's reconnect loop: aborting `stop` ends it, and `done` settles once it has. @internal */
export type NodeMachineSupervisor = Readonly<{
  stop: AbortController;
  done: Promise<void>;
}>;

/** The state one Node machine host's parts share, built once by `createNodeMachineHost`. @internal */
export type NodeMachineHostContext = Readonly<{
  /** The host's provider runtime; a host without one serves only the operations it was given. */
  runtime: NodeMachineRuntime | undefined;
  /** Each provider the host serves, by id, carrying its executable definition. */
  providerSources: ReadonlyMap<string, MachineProvider & RuntimePluginDefinitionCarrier<unknown>>;
  /** The served providers this host cannot reach machines for (`MachineProvider.unavailable`), by id. */
  unavailableProviders: ReadonlySet<string>;
  store: NodeMachineStore<NodeMachineJournalEvent>;
  directory: MachineDirectory;
  /** Serializes the host's work by key: `machine:<id>`, `operation:<id>`, `job:<id>` and `bindings`. */
  effectQueue: ResourceQueue;
  /** Every bound machine, by machine id. */
  machines: Map<string, BoundMachine>;
  /** Every unexpired preparation, by prepared id. */
  preparations: Map<string, MachinePreparationRecord>;
  /** Every recorded operation of a machine with a readable journal, by operation id. */
  operations: Map<string, NodeMachineOperationState>;
  /** Every job of a bound machine, by job id. */
  jobs: Map<string, MachineJob>;
  /** Emits each job as it is committed. */
  jobCommits: Topic<MachineJob>;
  /** Emits after every directory change, including every observation. */
  commits: Topic<void>;
  /** Emits a machine id each time its live session stops being live, before any reconnect; holds and streamed runs end on it. */
  sessionLost: Topic<string>;
  /** When each machine's last still was requested, in epoch milliseconds. */
  stillCaptureTimes: Map<string, number>;
  /** The live session of each connected machine, by machine id. */
  connectedSessions: Map<string, MachineSession>;
  /** One reconnect loop per supervised machine, by machine id. */
  supervisors: Map<string, NodeMachineSupervisor>;
  /** Every job start between its quiescing check and its settled receipt; quiescing waits for these. */
  startsInFlight: Set<Promise<unknown>>;
  /** Whether the host has begun closing; a call, since it changes after the context is built. */
  isClosed(): boolean;
  /** Whether the host is quiescing or closing: no job start or streamed run may begin (`MACHINE_HOST_CLOSING`). */
  isQuiescing(): boolean;
  now(): string;
  report(error: unknown): void;
  /** Resolve a provider's executable definition once, and the same promise after that. */
  definitionOf(providerId: string): Promise<ExecutableMachineDefinition>;
  /** The machine an operation is recorded against, refusing an unbound machine with `missing` and an unreadable log. */
  usableMachine(
    machineId: string,
    missing: string,
  ): Readonly<{
    record: MachineBindingRecord;
    log: MachineEventLog<NodeMachineJournalEvent>;
  }>;
  /** The machine's current entry, when its session is connected and has reported in this incarnation. */
  currentEntry(machineId: string): Promise<MachineDirectoryEntry | undefined>;
  /** Write one whole job, then publish it. */
  commitJob(job: MachineJob): Promise<MachineJob>;
}>;
