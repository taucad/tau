/**
 * The machines facet a workbench, the agent tools and external agents share.
 *
 * Four ways cause an effect: `applyAction` (a declared action), the three hold operations (a control held down),
 * `stop`, and a job's approval (`resolveJob`, the only way a program is transferred or started). Everything else
 * reads.
 *
 * @module
 */

import type { CacheValue } from '@taucad/cache-core';

import type {
  MachineBindingOutcome,
  MachineCandidate,
  MachineDiscoveryEvent,
  MachineProvider,
  MachineStill,
} from '#machines/machine.js';
import type { MachineFailure, MachineJogHoldParameters } from '#machines/machine-actions.js';
import type {
  MachineDirectoryCursor,
  MachineDirectoryEntry,
  MachineDirectoryFrame,
  MachineDirectorySnapshot,
} from '#machines/machine-directory.js';
import type {
  MachineCheckJobInput,
  MachineJob,
  MachineJobCheck,
  MachineListJobsInput,
  MachineOperation,
  MachineReceipt,
  MachineRequestJobInput,
  MachineRequester,
  MachineResolveJobInput,
  MachineWithdrawJobInput,
} from '#machines/machine-jobs.js';

/** List the machine providers admitted by this host route. @public */
export type MachineListProvidersInput = Readonly<{ signal?: AbortSignal }>;

/** Start one bounded, user-initiated provider discovery operation. @public */
export type MachineDiscoverInput = Readonly<{
  providerId: string;
  configuration: CacheValue;
  signal?: AbortSignal;
}>;

/** One normalized discovery event. @public */
export type MachineDiscoveryFrame = MachineDiscoveryEvent;

/** Begin host-local binding without carrying credentials or certificate decisions. @public */
export type MachineBeginBindingInput = Readonly<{
  candidate: MachineCandidate;
  name: string;
  signal?: AbortSignal;
}>;

/**
 * Unbind one machine and forget its saved credential. Refused with `MACHINE_BINDING_BUSY` while one of its jobs is
 * preparing, awaiting approval, transferring or starting; a running job keeps running.
 * @public
 */
export type MachineRemoveBindingInput = Readonly<{
  machineId: string;
  signal?: AbortSignal;
}>;

/** Non-secret outcome of removing one binding. @public */
export type MachineBindingRemoval = Readonly<{
  status: 'removed';
  machineId: string;
}>;

/**
 * One retained intent. Keep `operationId` across reconnects and reloads; the same id never applies twice.
 * @public
 */
export type MachineApplyActionInput = Readonly<{
  machineId: string;
  componentId: string;
  /** The capability revision the caller was shown; a changed one refuses the request. */
  capabilityRevision: string;
  operationId: string;
  action: string;
  version: number;
  /** The run the caller saw; `null` for an action that needs no run. */
  expectedRunId: string | null;
  parameters: unknown;
  /** Who is asking. An agent never states attendance. */
  requestedBy: MachineRequester;
  /** The person states they are at the machine. Refused from an agent. */
  attended?: boolean;
  /**
   * For an agent's request that needs a person's approval: the approval the person gave for exactly this intent.
   * The host checks it names this operation id.
   */
  approval?: Readonly<{ approvedBy: MachineRequester; operationId: string }>;
  signal?: AbortSignal;
}>;

/** Stop the machine now. Anyone may call it; it needs neither a run nor a capability revision. @public */
export type MachineStopInput = Readonly<{
  machineId: string;
  operationId?: string;
  requestedBy: MachineRequester;
  signal?: AbortSignal;
}>;

/** Begin one hold: a control held down by a person at the machine. @public */
export type MachineBeginHoldInput = Readonly<{
  machineId: string;
  componentId: string;
  capabilityRevision: string;
  operationId: string;
  hold: 'motion.jog';
  version: 1;
  parameters: MachineJogHoldParameters;
  requestedBy: MachineRequester;
  attended: true;
  signal?: AbortSignal;
}>;

/** A hold in force. `lease` is how often to renew, at the longest. Milliseconds. @public */
export type MachineHold = Readonly<{ status: 'held'; holdId: string; lease: number }>;

/**
 * Let a person try controls not yet qualified on this machine, to qualify them. Recorded with the binding, never
 * open to an agent.
 * @public
 */
export type MachineSetTestingInput = Readonly<{
  machineId: string;
  enabled: boolean;
  requestedBy: MachineRequester;
  signal?: AbortSignal;
}>;

/** Capture one short-lived bounded still from an exact logical machine. @public */
export type MachineCaptureStillClientInput = Readonly<{
  machineId: string;
  signal?: AbortSignal;
}>;

/** Read the machine directory: every machine bound on this computer. @public */
export type MachineListInput = Readonly<{ signal?: AbortSignal }>;

/** Read one logical machine from the machine directory. @public */
export type MachineGetInput = Readonly<{
  machineId: string;
  signal?: AbortSignal;
}>;

/** Watch the machine directory from an optional cursor. @public */
export type MachineWatchInput = Readonly<{
  cursor?: MachineDirectoryCursor;
  signal?: AbortSignal;
}>;

/** Read and explicitly reconcile one durable operation. @public */
export type MachineReconcileOperationInput = Readonly<{
  machineId: string;
  operationId: string;
  signal?: AbortSignal;
}>;

/** Browser-safe machines facet shared by the workbench and agent tools. @public */
export type MachineClient = Readonly<{
  listProviders(input: MachineListProvidersInput): Promise<readonly MachineProvider[]>;
  discover(input: MachineDiscoverInput): AsyncIterable<MachineDiscoveryFrame>;
  beginBinding(input: MachineBeginBindingInput): Promise<MachineBindingOutcome>;
  removeBinding(input: MachineRemoveBindingInput): Promise<MachineBindingRemoval>;

  list(input: MachineListInput): Promise<MachineDirectorySnapshot>;
  get(input: MachineGetInput): Promise<MachineDirectoryEntry>;
  watch(input: MachineWatchInput): AsyncIterable<MachineDirectoryFrame>;
  captureStill(input: MachineCaptureStillClientInput): Promise<MachineStill>;

  /** Read-only: what the program is and whether the machine is ready for it. Sends nothing. */
  checkJob(input: MachineCheckJobInput): Promise<MachineJobCheck>;
  requestJob(input: MachineRequestJobInput): Promise<MachineJob>;
  listJobs(input: MachineListJobsInput): Promise<readonly MachineJob[]>;
  watchJobs(input: MachineListJobsInput): AsyncIterable<MachineJob>;
  /** The only way a program is transferred or started. */
  resolveJob(input: MachineResolveJobInput): Promise<MachineJob>;
  withdrawJob(input: MachineWithdrawJobInput): Promise<MachineJob>;

  /** Apply one declared action once. Returns the latest receipt for this operation id; never repeats a send. */
  applyAction(input: MachineApplyActionInput): Promise<MachineReceipt<'action'>>;
  /** Stop the machine now. */
  stop(input: MachineStopInput): Promise<MachineReceipt<'stop'>>;
  beginHold(input: MachineBeginHoldInput): Promise<MachineHold | (Readonly<{ status: 'rejected' }> & MachineFailure)>;
  /** Renew within the lease. `ended` means the machine has already been told to stop. */
  renewHold(input: Readonly<{ holdId: string }>): Promise<Readonly<{ status: 'held' | 'ended' }>>;
  endHold(input: Readonly<{ holdId: string }>): Promise<MachineReceipt<'hold'>>;

  reconcileOperation(input: MachineReconcileOperationInput): Promise<MachineOperation>;
  setTesting(input: MachineSetTestingInput): Promise<MachineDirectoryEntry>;
}>;
