import type { CacheValue, ContentDigest } from '@taucad/cache-core';

import type {
  MachineArtifactReference,
  MachineBindingOutcome,
  MachineCandidate,
  MachineDiscoveryEvent,
  MachineProvider,
  MachineStill,
} from '#machines/machine.js';
import type {
  MachineDirectoryCursor,
  MachineDirectoryEntry,
  MachineDirectoryFrame,
  MachineDirectorySnapshot,
} from '#machines/machine-directory.js';
import type { MachinePrintRequestClient } from '#machines/print-request.js';

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
 * Unbind one machine and forget its saved credential. Refused with `MACHINE_BINDING_BUSY` while one of its
 * print requests is preparing, awaiting approval, uploading or starting; a running print keeps running.
 * @public
 */
export type MachineRemoveBindingInput = Readonly<{
  machineId: string;
  signal?: AbortSignal;
}>;

/** Non-secret outcome of removing one binding. @public */
export type MachineBindingRemoval = Readonly<{ status: 'removed'; machineId: string }>;

/** Preflight one immutable machine artifact against the observed setup without transferring or starting anything. @public */
export type MachinePreparePrintInput = Readonly<{
  machineId: string;
  artifact: MachineArtifactReference;
  configuration: CacheValue;
  signal?: AbortSignal;
}>;

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

/** Transfer an exact prepared artifact to the machine with one caller-retained idempotency key; never starts. @public */
export type MachineUploadPrintInput = Readonly<{
  machineId: string;
  preparedId: string;
  preparedDigest: ContentDigest;
  operationId: string;
  signal?: AbortSignal;
}>;

/** Start an exact prepared, transferred artifact with one caller-retained idempotency key. @public */
export type MachineStartPrintInput = Readonly<{
  machineId: string;
  preparedId: string;
  preparedDigest: ContentDigest;
  /** Evidence from the accepted upload receipt (`evidence.transferId`). */
  transferId: string;
  expectedSetupDigest: ContentDigest;
  operationId: string;
  signal?: AbortSignal;
}>;

/** Issue one run command against the exact currently observed provider run. @public */
export type MachineControlRunInput = Readonly<{
  machineId: string;
  operationId: string;
  command: 'cancel' | 'pause' | 'resume' | 'urgent-stop';
  expectedProviderRunId: string;
  signal?: AbortSignal;
}>;

/** Read and explicitly reconcile one durable physical-operation state. @public */
export type MachineReconcileOperationInput = Readonly<{
  machineId: string;
  operationId: string;
  signal?: AbortSignal;
}>;

/** Capture one short-lived bounded still from an exact logical machine. @public */
export type MachineCaptureStillClientInput = Readonly<{
  machineId: string;
  signal?: AbortSignal;
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

/** Read the machine directory: every printer bound on this computer. @public */
export type MachineListInput = Readonly<{ signal?: AbortSignal }>;

/** Read one logical machine from the machine directory. @public */
export type MachineGetInput = Readonly<{ machineId: string; signal?: AbortSignal }>;

/** Watch the machine directory from an optional cursor. @public */
export type MachineWatchInput = Readonly<{ cursor?: MachineDirectoryCursor; signal?: AbortSignal }>;

/** Browser-safe machines facet shared by the workbench and agent tools. @public */
export type MachineClient = MachinePrintRequestClient &
  Readonly<{
    listProviders(input: MachineListProvidersInput): Promise<readonly MachineProvider[]>;
    discover(input: MachineDiscoverInput): AsyncIterable<MachineDiscoveryFrame>;
    beginBinding(input: MachineBeginBindingInput): Promise<MachineBindingOutcome>;
    removeBinding(input: MachineRemoveBindingInput): Promise<MachineBindingRemoval>;
    preparePrint(input: MachinePreparePrintInput): Promise<MachinePreparedPrint>;
    uploadPrint(input: MachineUploadPrintInput): Promise<MachineOperationReceipt>;
    startPrint(input: MachineStartPrintInput): Promise<MachineOperationReceipt>;
    reconcileOperation(input: MachineReconcileOperationInput): Promise<MachineOperationSnapshot>;
    controlRun(input: MachineControlRunInput): Promise<MachineOperationReceipt>;
    captureStill(input: MachineCaptureStillClientInput): Promise<MachineStill>;
    list(input: MachineListInput): Promise<MachineDirectorySnapshot>;
    get(input: MachineGetInput): Promise<MachineDirectoryEntry>;
    watch(input: MachineWatchInput): AsyncIterable<MachineDirectoryFrame>;
  }>;
