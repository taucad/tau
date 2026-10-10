/**
 * The machines facet a workbench, the agent tools and external agents share.
 *
 * Four ways cause an effect: `applyAction` (a declared action), the three hold operations (a control held down),
 * `stop`, and a job's approval (`resolveJob`, the only way a program is transferred or started). Everything else
 * reads.
 *
 * @module
 */

import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { CacheValue } from '@taucad/cache-core';

import type {
  MachineBindingOutcome,
  MachineCandidate,
  MachineDiscoveryEvent,
  MachineEndpoint,
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

/**
 * Start one bounded, user-initiated provider discovery operation. With `endpoint`, discovery is addressed: the provider
 * looks only where a person said the machine is (a network address, or a serial path), in the transport its
 * `manifest.connection.transport` names; any other transport is refused `MACHINE_DISCOVERY_ENDPOINT_INVALID`.
 * `configuration` holds only the provider's own binding fields, never where the machine is.
 * @public
 */
export type MachineDiscoverInput = Readonly<{
  providerId: string;
  configuration: CacheValue;
  endpoint?: MachineEndpoint;
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
 * A provider's own actions by id, each with the schema its parameters take, for a caller that types its requests to
 * one provider: `MachineClient<{ 'acme.spool.read-tag': typeof readTagSchema }>`.
 * @public
 */
export type MachineActionExtensions = Readonly<Record<string, StandardSchemaV1>>;

/**
 * The parameters one action takes: its schema's input for a declared extension, otherwise `unknown` (the host
 * validates every request against the installed descriptor either way).
 * @public
 */
export type MachineActionParameters<
  Extensions extends MachineActionExtensions,
  Action extends string,
> = Action extends keyof Extensions ? StandardSchemaV1.InferInput<Extensions[Action]> : unknown;

/**
 * One retained intent. Keep `operationId` across reconnects and reloads; the same id never applies twice. With
 * `Extensions`, the parameters of a provider's own action are typed by its schema.
 * @public
 */
export type MachineApplyActionInput<
  Extensions extends MachineActionExtensions = Record<never, never>,
  Action extends string = string,
> = Readonly<{
  machineId: string;
  componentId: string;
  /** The capability revision the caller was shown; a changed one refuses the request. */
  capabilityRevision: string;
  operationId: string;
  action: Action;
  version: number;
  /** The run the caller saw; `null` for an action that needs no run. */
  // oxlint-disable-next-line typescript/no-restricted-types -- null is the caller's statement that it saw no run; absent would be no statement.
  expectedRunId: string | null;
  parameters: MachineActionParameters<Extensions, Action>;
  /** Who is asking: the label to show. The host takes the kind and id from the session; an agent never states attendance. */
  requestedBy: MachineRequester;
  /** The person states they are at the machine. Refused from an agent. */
  attended?: boolean;
  signal?: AbortSignal;
}>;

/**
 * A person's answer to an agent's request that needs approval, recorded by the host against this operation id and
 * intent. The agent then sends the same intent with the same `operationId`; the host admits it once while the
 * approval is fresh and its intent, run included, matches. Only a person's session may approve, and only a request
 * an agent may send once approved. A denial is recorded whatever the machine is doing (it admits nothing), so a
 * person can always decline. The host holds the decision in memory for 10 minutes; a host restart drops it, and the
 * person approves again.
 * @public
 */
export type MachineApproveActionInput = Readonly<{
  machineId: string;
  /** The agent's caller-retained operation id. */
  operationId: string;
  /**
   * Exactly what the person saw and approves, as the agent will send it: `expectedRunId` is the run the person was
   * shown (`null` for an action that needs no run), so the approval never admits the action against another run.
   */
  intent: Readonly<{
    componentId: string;
    action: string;
    version: number;
    // oxlint-disable-next-line typescript/no-restricted-types -- null is the statement that the person saw no run.
    expectedRunId: string | null;
    parameters: unknown;
  }>;
  decision: 'approve' | 'deny';
  /** The label to show for the person; the host takes who they are from the session. */
  approvedBy: MachineRequester;
  signal?: AbortSignal;
}>;

/**
 * What the host recorded for one approval. `refused`: nothing was recorded (an agent's session, or an approval of an
 * unknown action or one an agent could never send now). An approval expires at `expiresAt` and does not survive a host restart.
 * @public
 */
export type MachineActionApproval =
  | Readonly<{ status: 'approved'; operationId: string; expiresAt: string }>
  | Readonly<{ status: 'denied'; operationId: string }>
  | (Readonly<{ status: 'refused' }> & MachineFailure);

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

/**
 * Browser-safe machines facet shared by the workbench and agent tools. `Extensions` types the parameters of one
 * provider's own actions in `applyAction`; without it every action's parameters are `unknown`.
 * @public
 */
export type MachineClient<Extensions extends MachineActionExtensions = Record<never, never>> = Readonly<{
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
  /**
   * Every later change to the listed jobs. Completion (a host restart, a transport resync) means resync: list again,
   * then watch again. There is no cursor; a change between the two arrives in the new list.
   */
  watchJobs(input: MachineListJobsInput): AsyncIterable<MachineJob>;
  /** The only way a program is transferred or started. */
  resolveJob(input: MachineResolveJobInput): Promise<MachineJob>;
  withdrawJob(input: MachineWithdrawJobInput): Promise<MachineJob>;

  /** Apply one declared action once. Returns the latest receipt for this operation id; never repeats a send. */
  applyAction<Action extends string>(
    input: MachineApplyActionInput<Extensions, Action>,
  ): Promise<MachineReceipt<'action'>>;
  /** A person approves or denies an agent's pending action. Person sessions only. */
  approveAction(input: MachineApproveActionInput): Promise<MachineActionApproval>;
  /** Stop the machine now. */
  stop(input: MachineStopInput): Promise<MachineReceipt<'stop'>>;
  beginHold(input: MachineBeginHoldInput): Promise<MachineHold | (Readonly<{ status: 'rejected' }> & MachineFailure)>;
  /** Renew within the lease. `ended` means the machine has already been told to stop. */
  renewHold(input: Readonly<{ holdId: string }>): Promise<Readonly<{ status: 'held' | 'ended' }>>;
  endHold(input: Readonly<{ holdId: string }>): Promise<MachineReceipt<'hold'>>;

  reconcileOperation(input: MachineReconcileOperationInput): Promise<MachineOperation>;
  setTesting(input: MachineSetTestingInput): Promise<MachineDirectoryEntry>;
}>;
