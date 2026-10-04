/**
 * Operations and jobs: the durable record of every physical effect, and the one record every program start passes
 * through.
 *
 * A job is requested by a person, a Tau-hosted agent or an external agent over MCP; only an explicit approval moves
 * it past `awaiting-approval`, and the host performs the transfer and start with caller-retained operation ids, so a
 * lost reply is reconciled, never resent. Every effect — an action, a stop, a hold, a transfer, a start — is one
 * operation with one state.
 *
 * @module
 */

import type { CacheValue, ContentDigest } from '@taucad/cache-core';

import type { MachineFailure } from '#machines/machine-actions.js';
import type { MachineArtifactReference } from '#machines/machine.js';
import type { MachineCheck, MachineRunProgress } from '#machines/machine-observation.js';
import type { MachineSettingsProvenance } from '#machines/settings.js';

/** Who asked; recorded durably so a reload can still name them. @public */
export type MachineRequester = Readonly<{
  kind: 'user' | 'agent';
  id: string;
  label: string;
}>;

/** Every journaled physical effect. @public */
export type MachineOperationKind = 'action' | 'stop' | 'hold' | 'transfer' | 'start';

type ReceiptOf<Kind extends MachineOperationKind, Accepted> = Readonly<{
  operationId: string;
  machineId: string;
  kind: Kind;
  observedAt: string;
}> &
  (
    | (Readonly<{ status: 'accepted' }> & Accepted)
    | (Readonly<{ status: 'rejected' }> & MachineFailure)
    | Readonly<{ status: 'unknown'; reason: string }>
  );

/**
 * What came back from one effect that may have been sent. `accepted` means the machine took the command, not that
 * the physical result has happened; `unknown` is never retried.
 * @public
 */
export type MachineOperationReceipt =
  | ReceiptOf<'action', Readonly<{ activityId?: string }>>
  | ReceiptOf<'stop', Readonly<Record<never, never>>>
  | ReceiptOf<'hold', Readonly<Record<never, never>>>
  | ReceiptOf<'transfer', Readonly<{ transferId: string }>>
  | ReceiptOf<'start', Readonly<{ runId?: string }>>;

/** The receipt of one kind of effect. @public */
export type MachineReceipt<Kind extends MachineOperationKind> = Extract<MachineOperationReceipt, { kind: Kind }>;

/**
 * The durable record of one effect, with one state. `confirming`: sent, no proof yet, the host is watching the
 * machine's own reports. `attention`: 180 seconds passed without proof, so a person should look; later proof still
 * settles it. Nothing is ever resent.
 * @public
 */
export type MachineOperation = Readonly<{
  operationId: string;
  machineId: string;
  kind: MachineOperationKind;
  inputDigest: ContentDigest;
  state: 'planned' | 'sending' | 'accepted' | 'rejected' | 'confirming' | 'attention';
  updatedAt: string;
  receipt?: MachineOperationReceipt;
  /** The first unknown receipt, kept once. */
  confirmingSince?: string;
  /** Who caused it, and whether they said they were at the machine. */
  requestedBy?: MachineRequester;
  attended?: boolean;
  /** For an action: which one, its label, and the activity it started when the machine reports one. */
  action?: Readonly<{ componentId: string; id: string; label: string; activityId?: string }>;
}>;

/** What a program needs and will do, read from the artifact before anyone approves it. @public */
export type MachineProgramSummary = Readonly<{
  name: string;
  /** How long the run is expected to take. Milliseconds. */
  estimatedDuration?: number;
  producer?: Readonly<{ name: string; version?: string }>;
  /** Saved preferences captured when this job was prepared. */
  preferences?: MachineSettingsProvenance;
  facts:
    | Readonly<{
        process: 'fff';
        layers?: number;
        /** Millimetres of filament. */
        filamentLength?: number;
      }>
    | Readonly<{
        process: 'milling';
        lines: number;
        /** The program's reach in work coordinates, per axis id. */
        extents: Readonly<Record<string, Readonly<{ min: number; max: number }>>>;
        tools: ReadonlyArray<Readonly<{ number: number; description?: string; diameter?: number }>>;
        /** Revolutions per minute the program asks for. */
        spindleSpeed?: Readonly<{ min: number; max: number }>;
        /** Millimetres per minute. */
        maximumFeed?: number;
        workOffsets: readonly string[];
        uses: ReadonlyArray<'tool-change' | 'coolant' | 'probing' | 'program-stop' | 'inverse-time-feed'>;
      }>
    | Readonly<{ process: 'other' }>;
}>;

/**
 * Every state a job can be observed in. `awaiting-start`: the program is loaded and a person must press the
 * machine's own start. `confirming`: the start was sent and the machine has not yet shown it took it.
 * @public
 */
export type MachineJobState =
  | 'preparing'
  | 'awaiting-approval'
  | 'approved'
  | 'transferring'
  | 'starting'
  | 'awaiting-start'
  | 'confirming'
  | 'started'
  | 'denied'
  | 'withdrawn'
  | 'rejected'
  | 'unknown'
  | 'failed';

/** Durable preparation identity bound to one machine, artifact and setup. @public */
export type MachinePreparedJob = Readonly<{
  preparedId: string;
  preparedDigest: ContentDigest;
  configurationDigest: ContentDigest;
  providerDataDigest: ContentDigest;
  setupDigest: ContentDigest;
  machineId: string;
  physicalMachineId: string;
  artifact: MachineArtifactReference;
  /** The name the program will have on the machine, for a stored delivery. */
  remoteName: string;
  parser: Readonly<{ id: string; version: string }>;
  preparedAt: string;
  expiresAt: string;
}>;

/** One durable job: the request, what was vouched for, and what became of its run. @public */
export type MachineJob = Readonly<{
  version: 1;
  jobId: string;
  machineId: string;
  artifact: MachineArtifactReference;
  configuration: CacheValue;
  requestedBy: MachineRequester;
  state: MachineJobState;
  createdAt: string;
  updatedAt: string;
  program: MachineProgramSummary;
  /** Facts this start depends on; all must pass before approval. */
  checks: readonly MachineCheck[];
  prepared?: MachinePreparedJob;
  attestations?: ReadonlyArray<Readonly<{ id: string; by: MachineRequester; at: string }>>;
  attended?: boolean;
  transferOperationId?: string;
  startOperationId?: string;
  transferId?: string;
  receipt?: MachineOperationReceipt;
  failure?: Readonly<{ code: string; message: string }>;
  resolvedBy?: MachineRequester;
  /** What became of the run, kept after the machine has forgotten it. */
  run?: Readonly<{
    runId: string;
    outcome: 'running' | 'completed' | 'cancelled' | 'failed' | 'interrupted' | 'unknown';
    endedAt?: string;
    progress?: MachineRunProgress;
  }>;
}>;

/** A read-only preflight: what the program is and whether this machine is ready for it. @public */
export type MachineJobCheck =
  | Readonly<{ status: 'ready' | 'blocked'; program: MachineProgramSummary; checks: readonly MachineCheck[] }>
  | (Readonly<{ status: 'refused' }> & Readonly<{ code: string; message: string }>);

/** Ask for one job. The same `jobId` returns the existing job. @public */
export type MachineRequestJobInput = Readonly<{
  machineId: string;
  artifact: MachineArtifactReference;
  configuration: CacheValue;
  requestedBy: MachineRequester;
  /** Facts the caller already knows about the program; the host's own parse wins where both exist. */
  program?: Partial<MachineProgramSummary>;
  /** Caller-retained idempotency key; the same key returns the existing job. */
  jobId: string;
  signal?: AbortSignal;
}>;

/** Preflight one program without recording anything. @public */
export type MachineCheckJobInput = Readonly<{
  machineId: string;
  artifact: MachineArtifactReference;
  configuration: CacheValue;
  signal?: AbortSignal;
}>;

/** Read jobs, newest first, optionally for one machine and one project. @public */
export type MachineListJobsInput = Readonly<{ machineId?: string; projectId?: string; signal?: AbortSignal }>;

/** Approve or deny one job. Approval carries what the person vouched for and the ids the host will use. @public */
export type MachineResolveJobInput = Readonly<{
  jobId: string;
  decision: 'approve' | 'deny';
  resolvedBy: MachineRequester;
  /** Ids of the attestations the person made, from `capabilities.jobs.attestations`. */
  attestations?: readonly string[];
  /** The person states they are at the machine. Refused from an agent. */
  attended?: boolean;
  transferOperationId?: string;
  startOperationId?: string;
  signal?: AbortSignal;
}>;

/** Withdraw a job that has not started. @public */
export type MachineWithdrawJobInput = Readonly<{ jobId: string; resolvedBy: MachineRequester; signal?: AbortSignal }>;
