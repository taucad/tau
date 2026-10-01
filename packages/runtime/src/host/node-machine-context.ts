/**
 * What the parts of one Node machine host share: the id and digest schemas its records use, and the state
 * `createNodeMachineHost` builds once its store is open and its directory recovered. Discovery and binding, reconnect
 * supervision and the print-request ledger read and write these same maps; none of them keeps a copy.
 *
 * @module
 */

import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { ContentDigest } from '@taucad/cache-core';
import type { Topic } from '@taucad/events';
import type { ResourceQueue } from '@taucad/filesystem';
import { z } from 'zod';

import type { MachineEventLog } from '#host/node-machine-event-log.js';
import type { NodeMachineEffectEvent, NodeMachineEffectState } from '#host/node-machine-operations.js';
import type {
  MachineBindingRecord,
  MachineOperationsState,
  MachinePreparationRecord,
  NodeMachineStore,
} from '#host/node-machine-store.js';
import type { NodeMachineRuntime } from '#host/node.js';
import type { MachineDirectory } from '#machines/machine-directory.js';
import type {
  MachineConnectInput,
  MachineConnectionRuntime,
  MachineDiscoveryEvent,
  MachineDiscoveryInput,
  MachineDiscoveryRuntime,
  MachineProvider,
  MachineSession,
} from '#machines/machine.js';
import type { PrintRequest } from '#machines/print-request.js';
import type { RuntimePluginDefinitionCarrier } from '#plugins/plugin-runtime-definition.js';

/** A well-formed string of 1–256 characters: every id, name and code the host records. @internal */
export const identity = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value.isWellFormed());

/** A `sha256:` content digest. @internal */
export const digest = z.custom<ContentDigest>(
  (value) => typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value),
);

/** The readable message a refusal carries. @internal */
export const receiptMessage = z
  .string()
  .min(1)
  .max(1024)
  .refine((value) => value.isWellFormed());

/** The executable half of a provider: its configuration schemas, discovery and connection. @internal */
export type ExecutableMachineDefinition = Readonly<{
  bindingConfiguration: Readonly<{ schema: StandardSchemaV1 }>;
  submissionConfiguration: Readonly<{ schema: StandardSchemaV1 }>;
  settingsConfiguration?: Readonly<{ schema: StandardSchemaV1 }>;
  discover(
    input: MachineDiscoveryInput<unknown>,
    runtime: MachineDiscoveryRuntime,
  ): AsyncIterable<MachineDiscoveryEvent>;
  connect(input: MachineConnectInput<unknown>, runtime: MachineConnectionRuntime): Promise<MachineSession>;
}>;

/** One bound machine: its latest `machine.json` and its operations log, which may have been found unreadable. @internal */
export type BoundMachine = {
  record: MachineBindingRecord;
  operations: MachineOperationsState<NodeMachineEffectEvent>;
};

/** One supervised machine's reconnect loop: aborting `stop` ends it, and `done` settles once it has. @internal */
export type NodeMachineSupervisor = Readonly<{ stop: AbortController; done: Promise<void> }>;

/** The state one Node machine host's parts share, built once by `createNodeMachineHost`. @internal */
export type NodeMachineHostContext = Readonly<{
  /** The host's provider runtime; a host without one serves only the operations it was given. */
  runtime: NodeMachineRuntime | undefined;
  /** Each provider the host serves, by id, carrying its executable definition. */
  providerSources: ReadonlyMap<string, MachineProvider & RuntimePluginDefinitionCarrier<unknown>>;
  store: NodeMachineStore<NodeMachineEffectEvent>;
  directory: MachineDirectory;
  /** Serializes the host's work by key: `machine:<id>`, `effect:<id>`, `request:<id>` and `bindings`. */
  effectQueue: ResourceQueue;
  /** Every bound machine, by machine id. */
  machines: Map<string, BoundMachine>;
  /** Every unexpired preparation, by prepared id. */
  preparations: Map<string, MachinePreparationRecord>;
  /** Every recorded effect of a machine with a readable log, by operation id. */
  effects: Map<string, NodeMachineEffectState>;
  /** Every print request of a bound machine, by request id. */
  requests: Map<string, PrintRequest>;
  /** Emits each request as it is committed. */
  requestCommits: Topic<PrintRequest>;
  /** When each machine's last still was requested, in epoch milliseconds. */
  stillCaptureTimes: Map<string, number>;
  /** The live session of each connected machine, by machine id. */
  connectedSessions: Map<string, MachineSession>;
  /** One reconnect loop per supervised machine, by machine id. */
  supervisors: Map<string, NodeMachineSupervisor>;
  /** Whether the host has begun closing; a call, since it changes after the context is built. */
  isClosed(): boolean;
  now(): string;
  report(error: unknown): void;
  /** Resolve a provider's executable definition once, and the same promise after that. */
  definitionOf(providerId: string): Promise<ExecutableMachineDefinition>;
  /** The machine an effect is recorded against, refusing an unbound machine with `missing` and an unreadable log. */
  usableMachine(
    machineId: string,
    missing: string,
  ): Readonly<{ record: MachineBindingRecord; log: MachineEventLog<NodeMachineEffectEvent> }>;
  /** Write one whole request, then publish it. */
  commitRequest(record: PrintRequest): Promise<PrintRequest>;
}>;
