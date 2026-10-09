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
import { z } from 'zod';

import { machineFailureCodes } from '#machines/machine-actions.js';
import type { MachineFailure, MachineJobFailureCode } from '#machines/machine-actions.js';
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
  /** Who caused it, and whether they said they were at the machine. The host takes the kind and id from the session. */
  requestedBy?: MachineRequester;
  /** The person whose approval admitted an agent's action. */
  approvedBy?: MachineRequester;
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
        /** The filaments the program uses, by its own index; `color` is `#RRGGBBAA`. */
        filaments?: ReadonlyArray<Readonly<{ index: number; materialType: string; color: string }>>;
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
        /** The machine or kinematic model the post-processor wrote the program for, in its own words. */
        postedFor?: string;
      }>
    /** Not read yet, or nothing known about the program. */
    | Readonly<{ process: 'other' }>
    /** Any other process (a laser, a resin printer): its namespaced id, the version of its facts, and the facts. */
    | Readonly<{ process: `${string}.${string}`; version: number; data: CacheValue }>;
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
  /** The name the program will have on the machine; only a stored delivery has one. */
  remoteName?: string;
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
  failure?: Readonly<{ code: MachineJobFailureCode; message: string }>;
  resolvedBy?: MachineRequester;
  /** What became of the run, kept after the machine has forgotten it. */
  run?: Readonly<{
    runId: string;
    outcome: 'running' | 'completed' | 'cancelled' | 'failed' | 'interrupted' | 'unknown';
    endedAt?: string;
    progress?: MachineRunProgress;
  }>;
}>;

/**
 * A read-only preflight: what the program is and whether this machine is ready for it. `configuration` is the start
 * form completed by the provider from what the machine reports; render the form from the schema with these values.
 * @public
 */
export type MachineJobCheck =
  | Readonly<{
      status: 'ready' | 'blocked';
      program: MachineProgramSummary;
      checks: readonly MachineCheck[];
      configuration: CacheValue;
    }>
  | Readonly<{ status: 'refused'; code: MachineJobFailureCode; message: string }>;

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
  /** Start-form values, possibly partial: the provider completes the rest from the machine's current setup. */
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

// ───────────────────────────── Schemas ─────────────────────────────

const identity = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value.isWellFormed());
const text = z
  .string()
  .min(1)
  .max(1024)
  .refine((value) => value.isWellFormed());
const instant = z.iso.datetime({ offset: true });
const digest = z.custom<ContentDigest>((value) => typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value));
const operationKind = z.enum(['action', 'stop', 'hold', 'transfer', 'start']);
const receiptBase = { operationId: identity, machineId: identity, observedAt: instant };

/**
 * How long a host's quiesce waits, by default, for job starts already past their checks before it gives up
 * (`MACHINE_HOST_START_IN_FLIGHT`). A launcher bounds its own quit wait above this, so the host's answer lands first.
 * @public
 */
export const machineStartWaitMilliseconds = 10_000;

/** Strict schema of one requester. @internal */
export const machineRequesterSchema = z.strictObject({
  kind: z.enum(['user', 'agent']),
  id: identity,
  label: identity,
});

/** Strict schema of one operation receipt. @internal */
export const machineOperationReceiptSchema: z.ZodType<MachineOperationReceipt> = z.union([
  z.strictObject({
    ...receiptBase,
    kind: z.literal('action'),
    status: z.literal('accepted'),
    activityId: identity.optional(),
  }),
  z.strictObject({ ...receiptBase, kind: z.enum(['stop', 'hold']), status: z.literal('accepted') }),
  z.strictObject({ ...receiptBase, kind: z.literal('transfer'), status: z.literal('accepted'), transferId: identity }),
  z.strictObject({
    ...receiptBase,
    kind: z.literal('start'),
    status: z.literal('accepted'),
    runId: identity.optional(),
  }),
  z.strictObject({
    ...receiptBase,
    kind: operationKind,
    status: z.literal('rejected'),
    code: z.enum(machineFailureCodes),
    message: text,
    issues: z
      .array(z.strictObject({ path: z.string().max(256), message: text }))
      .max(32)
      .optional(),
  }),
  z.strictObject({ ...receiptBase, kind: operationKind, status: z.literal('unknown'), reason: text }),
]);

/** Strict schema of one operation record. @internal */
export const machineOperationSchema: z.ZodType<MachineOperation> = z.strictObject({
  operationId: identity,
  machineId: identity,
  kind: operationKind,
  inputDigest: digest,
  state: z.enum(['planned', 'sending', 'accepted', 'rejected', 'confirming', 'attention']),
  updatedAt: instant,
  receipt: machineOperationReceiptSchema.optional(),
  confirmingSince: instant.optional(),
  requestedBy: machineRequesterSchema.optional(),
  approvedBy: machineRequesterSchema.optional(),
  attended: z.boolean().optional(),
  action: z
    .strictObject({ componentId: identity, id: identity, label: identity, activityId: identity.optional() })
    .optional(),
});
