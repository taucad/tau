/**
 * Host-owned print request lifecycle.
 *
 * A print request is the one record every physical start passes through
 * (blueprint D4, D5, D12). The person, a Tau-hosted agent and an external
 * agent over MCP all create the same record; only an explicit approval moves
 * it past `awaiting-approval`, and the host performs the upload and start with
 * caller-retained operation ids so a lost reply is reconciled, never resent.
 *
 * @module
 */

import type { CacheValue, ContentDigest } from '@taucad/cache-core';

import type { MachineSettingsProvenance } from '#machines/settings.js';

import type { MachineArtifactReference } from '#machines/machine.js';

/** Durable preparation identity bound to one machine, artifact, setup and the remote object one upload will create. @public */
export type MachinePreparedPrint = Readonly<{
  preparedId: string;
  preparedDigest: ContentDigest;
  configurationDigest: ContentDigest;
  providerDataDigest: ContentDigest;
  setupDigest: ContentDigest;
  machineId: string;
  physicalMachineId: string;
  artifact: MachineArtifactReference;
  remoteName: string;
  parser: Readonly<{ id: string; version: string }>;
  preparedAt: string;
  expiresAt: string;
}>;

/** Physical effects that address a run. @public */
export type MachineRunOperationKind = 'cancel' | 'pause' | 'resume' | 'start' | 'urgent-stop';

/** Every journaled physical effect kind. @public */
export type MachineOperationKind = MachineRunOperationKind | 'upload';

/** Terminal result returned after one physical effect may have been sent. @public */
export type MachineOperationReceipt =
  | Readonly<{
      operationId: string;
      machineId: string;
      kind: 'upload';
      status: 'accepted';
      evidence: Readonly<{ transferId: string }>;
      observedAt: string;
    }>
  | Readonly<{
      operationId: string;
      machineId: string;
      kind: MachineRunOperationKind;
      status: 'accepted';
      providerRunId?: string;
      observedAt: string;
    }>
  | Readonly<{
      operationId: string;
      machineId: string;
      kind: MachineOperationKind;
      status: 'rejected';
      code: string;
      message: string;
      observedAt: string;
    }>
  | Readonly<{
      operationId: string;
      machineId: string;
      kind: MachineOperationKind;
      status: 'unknown';
      reason: string;
      providerRunId?: string;
      observedAt: string;
    }>;

/** Durable physical-effect projection, including pre-send phases after recovery. @public */
export type MachineOperationSnapshot = Readonly<{
  operationId: string;
  machineId: string;
  kind: MachineOperationReceipt['kind'];
  inputDigest: ContentDigest;
  status: 'accepted' | 'planned' | 'rejected' | 'sending' | 'unknown';
  updatedAt: string;
  receipt?: MachineOperationReceipt;
}>;

/** Every state a print request can be observed in. @public */
export type PrintRequestState =
  | 'preparing'
  | 'awaiting-approval'
  | 'approved'
  | 'uploading'
  | 'starting'
  | 'started'
  | 'denied'
  | 'withdrawn'
  | 'rejected'
  | 'unknown'
  | 'failed';

/** Who asked for the print; recorded durably so a reload can still name them. @public */
export type PrintRequester = Readonly<{
  kind: 'user' | 'agent';
  id: string;
  label: string;
}>;

/** Summary facts a surface shows before approval; derived from the artifact, never authoritative. @public */
export type PrintRequestSummary = Readonly<{
  fileName: string;
  /** Saved preferences captured when this request was prepared. */
  preferences?: MachineSettingsProvenance;
  layers?: number;
  /** Seconds. */
  estimatedDuration?: number;
  /** Millimetres of filament. */
  filamentLength?: number;
  /** The slicer that produced the artifact, e.g. `{ name: 'Bambu Studio', version: '02.08.02.61' }`. */
  producer?: Readonly<{ name: string; version?: string }>;
}>;

/** One durable print request. @public */
export type PrintRequest = Readonly<{
  requestId: string;
  machineId: string;
  artifact: MachineArtifactReference;
  configuration: CacheValue;
  requestedBy: PrintRequester;
  summary: PrintRequestSummary;
  state: PrintRequestState;
  createdAt: string;
  updatedAt: string;
  prepared?: MachinePreparedPrint;
  /** Caller-retained identity of the one transfer this request may perform. */
  uploadOperationId?: string;
  /** Caller-retained identity of the one start this request may perform. */
  startOperationId?: string;
  transferId?: string;
  receipt?: MachineOperationReceipt;
  failure?: Readonly<{ code: string; message: string }>;
  resolvedBy?: PrintRequester;
}>;

/** Create one request; the host prepares and then waits for approval. @public */
export type MachineRequestPrintInput = Readonly<{
  machineId: string;
  artifact: MachineArtifactReference;
  configuration: CacheValue;
  requestedBy: PrintRequester;
  summary?: PrintRequestSummary;
  /** Caller-retained idempotency key; the same key returns the existing request. */
  requestId: string;
  signal?: AbortSignal;
}>;

/** Read requests, newest first, optionally for one machine and one project (`artifact.projectId`). @public */
export type MachineListPrintRequestsInput = Readonly<{
  machineId?: string;
  projectId?: string;
  signal?: AbortSignal;
}>;

/** Observe request transitions as they are recorded, optionally for one machine and one project. @public */
export type MachineWatchPrintRequestsInput = Readonly<{
  machineId?: string;
  projectId?: string;
  signal?: AbortSignal;
}>;

/** Approve or deny one awaiting request; approval carries the operation ids the host will use. @public */
export type MachineResolvePrintRequestInput = Readonly<{
  requestId: string;
  decision: 'approve' | 'deny';
  resolvedBy: PrintRequester;
  uploadOperationId?: string;
  startOperationId?: string;
  signal?: AbortSignal;
}>;

/** Withdraw a request that has not started; a started run is controlled through `controlRun`. @public */
export type MachineWithdrawPrintRequestInput = Readonly<{
  requestId: string;
  resolvedBy: PrintRequester;
  signal?: AbortSignal;
}>;

/** Print request operations every machines facet exposes. @public */
export type MachinePrintRequestClient = Readonly<{
  requestPrint(input: MachineRequestPrintInput): Promise<PrintRequest>;
  listPrintRequests(input: MachineListPrintRequestsInput): Promise<readonly PrintRequest[]>;
  watchPrintRequests(input: MachineWatchPrintRequestsInput): AsyncIterable<PrintRequest>;
  resolvePrintRequest(input: MachineResolvePrintRequestInput): Promise<PrintRequest>;
  withdrawPrintRequest(input: MachineWithdrawPrintRequestInput): Promise<PrintRequest>;
}>;
