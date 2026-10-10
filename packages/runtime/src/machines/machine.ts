import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { SettingsSchema, SettingsDefinition } from '#machines/settings.js';
import type { CacheValue, ContentDigest } from '@taucad/cache-core';
import { z } from 'zod';

import { cloneBoundedJson } from '@taucad/parameters/json';
import { admitConfigurationManifest } from '#configuration/configuration.js';
import type { ConfigurationDefinition, ConfigurationManifestV1 } from '#configuration/index.js';
import { machineManifestSchema, parseMachineManifest } from '#machines/machine-manifest.js';
import type { MachineManifest } from '#machines/machine-manifest.js';
import { machineActionDescriptorOf } from '#machines/machine-actions.js';
import type {
  MachineActionDefinition,
  MachineFailure,
  MachineHoldDefinition,
  MachineJobFailureCode,
} from '#machines/machine-actions.js';
import type { MachineProgramSummary, MachineRequester } from '#machines/machine-jobs.js';
import type { MachineCheck, MachineObservation, MachineReport } from '#machines/machine-observation.js';
import {
  attachRuntimePluginDefinition,
  attachRuntimePluginFactoryOptions,
} from '#plugins/plugin-runtime-definition.js';
import type { RuntimePluginDefinitionCarrier } from '#plugins/plugin-runtime-definition.js';

/** Semantic container contract accepted by a machine provider. @public */
export type MachineAcceptedContainer = Readonly<{
  contract: Readonly<{ id: string; version: number }>;
  mediaType: string;
  requiredMembers: readonly string[];
  payloadSelection: 'plate' | 'single';
  technology: string;
  /**
   * File-name extensions a program of this container may have, lower case with the leading dot (`.gcode`, `.nc`),
   * so a consumer offers the right files without its own table. Absent: the media type alone says.
   */
  extensions?: readonly string[];
}>;

/** Frozen serializable machine-provider registration metadata. @public */
export type MachineProvider<Id extends string = string> = Readonly<{
  id: Id;
  name: string;
  version: string;
  protocolVersion: 2;
  vendor: string;
  /** Frozen model facts: hardware, processes, declared actions, jobs, stop and freshness budgets. */
  manifest: MachineManifest;
  bindingConfiguration: ConfigurationManifestV1;
  /** Optional sparse preferences; observations and approvals never belong here. */
  settingsConfiguration?: ConfigurationManifestV1;
  /**
   * Set by the host, never by a provider: this host cannot serve the provider now (e.g. a serial provider on a host
   * without serial access), and why, in a sentence a person reads. Consumers offer it disabled with the reason.
   */
  unavailable?: Readonly<{ reason: string }>;
}>;

/** Clock authority available to machine providers. @public */
export type MachineClock = Readonly<{ now(): string }>;

/** Redacted provider log entry. @public */
export type MachineLogEntry = Readonly<{
  level: 'debug' | 'error' | 'info' | 'warning';
  message: string;
}>;

/** Host-approved certificate trust for one machine service. @public */
export type MachineTransportTrust = Readonly<{ type: 'system' }> | Readonly<{ type: 'pinned'; digest: ContentDigest }>;

/** Bounded transport request delegated to a host-owned network adapter. @public */
export type MachineNetworkRequest = Readonly<{
  endpoint: Readonly<{ address: string; port: number }>;
  transport: 'tcp' | 'tls';
  trust: MachineTransportTrust;
  /** Milliseconds. */
  connectTimeout: number;
  /** Milliseconds. */
  idleTimeout: number;
  maximumReadBytes: number;
  maximumWriteBytes: number;
  signal: AbortSignal;
}>;

/** Host-owned bounded byte stream; protocol framing remains provider-owned. @public */
export type MachineNetworkStream = Readonly<{
  readable: AsyncIterable<Uint8Array<ArrayBuffer>>;
  write(chunk: Uint8Array<ArrayBuffer>): Promise<void>;
  close(): Promise<void>;
}>;

/**
 * One JPEG still from an RTSP camera over TLS (RTSPS), a host service any provider may use. The host opens the TLS
 * connection itself and checks it against `trust`, answers the camera's Basic or Digest challenge with `username` and
 * the secret `secretRef` names (the decoder never sees either), plays `path`, and returns the first complete frame.
 * Every endpoint detail comes from the provider; the host assumes no port, path or account.
 * @public
 */
export type MachineNetworkStillInput = Readonly<{
  endpoint: Readonly<{ address: string; port: number }>;
  trust: MachineTransportTrust;
  /** The credential the camera's challenge is answered with. */
  secretRef: string;
  username: string;
  /** The stream's absolute path, e.g. `/live/1`. */
  path: string;
  /** Milliseconds. */
  connectTimeout: number;
  maximumBytes: number;
  signal: AbortSignal;
}>;

/** User-initiated bounded datagram-listener request. @public */
export type MachineDatagramListenInput = Readonly<{
  port: number;
  durationMs: number;
  maximumDatagrams: number;
  maximumDatagramBytes: number;
  signal: AbortSignal;
}>;

/** One untrusted datagram delivered with its observed peer. @public */
export type MachineDatagram = Readonly<{
  bytes: Uint8Array<ArrayBuffer>;
  peer: Readonly<{ address: string; interface: string; port: number }>;
}>;

/**
 * A project artifact a job names. The host finds the project by `projectId`, reads `path` from it and
 * re-verifies `length` and `digest` on every use, so the reference is never a copy of the bytes.
 * @public
 */
export type MachineArtifactReference = Readonly<{
  /** The project's `tau.json` id, `proj_` and 21 letters or digits. */
  projectId: string;
  /** Normalized project-relative path, without `.`, `..` or empty segments. */
  path: string;
  digest: ContentDigest;
  length: number;
  mediaType: string;
  contract: Readonly<{ id: string; version: number }>;
  selectedMember: string;
}>;

/** Host-owned bounded artifact streaming request. @public */
export type MachineArtifactReadInput = Readonly<{
  artifact: MachineArtifactReference;
  maximumBytes: number;
  signal: AbortSignal;
}>;

/** One serial port the host can see. @public */
export type MachineSerialPort = Readonly<{
  path: string;
  /** USB vendor and product ids, as four lower-case hex digits each, when the port reports them. */
  vendorId?: string;
  productId?: string;
  manufacturer?: string;
  serialNumber?: string;
}>;

/** Host-opened serial stream request. Opening a port may reset the controller behind it. @public */
export type MachineSerialRequest = Readonly<{
  path: string;
  baudRate: number;
  maximumReadBytes: number;
  maximumWriteBytes: number;
  signal: AbortSignal;
}>;

/** Least-privilege services available during discovery. @public */
export type MachineDiscoveryRuntime = Readonly<{
  clock: MachineClock;
  listenDatagrams(input: MachineDatagramListenInput): AsyncIterable<MachineDatagram>;
  /** The serial ports the host can see; absent on a host without serial access. */
  listSerialPorts?(input: Readonly<{ signal: AbortSignal }>): Promise<readonly MachineSerialPort[]>;
}>;

/** Host-owned services available only while establishing a trusted connection. @public */
export type MachineConnectionRuntime = Readonly<{
  clock: MachineClock;
  log(entry: MachineLogEntry): Promise<void>;
  connectStream(input: MachineNetworkRequest): Promise<MachineNetworkStream>;
  /** Open a serial port; absent on a host without serial access. */
  openSerial?(input: MachineSerialRequest): Promise<MachineNetworkStream>;
  readArtifact(input: MachineArtifactReadInput): AsyncIterable<Uint8Array<ArrayBuffer>>;
  resolveSecret(input: Readonly<{ reference: string; signal: AbortSignal }>): Promise<string>;
  /**
   * RTSPS still capture: a standard-protocol host service any provider may use without declaring it in its manifest
   * (`connection.services` lists only what binding pins). Every endpoint and trust detail comes from the call; the
   * host checks the connection against the `trust` given. Absent on a host that offers none.
   */
  captureNetworkStill?(input: MachineNetworkStillInput): Promise<MachineStill>;
  /**
   * Implicit-FTPS upload: a standard-protocol host service any provider may use without declaring it in its manifest
   * (`connection.services` lists only what binding pins). Every endpoint, account and trust detail comes from the call;
   * the host checks the connection against the `trust` given. Absent on a host that offers none.
   */
  uploadFile?(input: MachineFileUploadInput): Promise<MachineFileUploadReceipt>;
}>;

/**
 * One file uploaded to a machine's own storage over implicit FTPS (TLS from the first byte, TLS 1.2 or later), a host
 * service any provider may use. The host checks the control and data connections against `trust`, logs in as
 * `username` with the secret `secretRef` names, stores `bytes` under `remoteName` in binary passive mode, and then asks
 * the server for the stored size: anything but `bytes.byteLength` rejects `MACHINE_UPLOAD_TRANSFER_MISMATCH`. A
 * permanent (5xx) reply to the store rejects `MACHINE_UPLOAD_REFUSED`, with the server's reply as `cause`. The
 * bytes are written in 64 KiB pieces, so a transfer watchdog that measures queued bytes sees steady progress on a
 * slow server. At most 512 MiB. Every endpoint detail comes from the provider; the host assumes no port or account.
 * @public
 */
export type MachineFileUploadInput = Readonly<{
  endpoint: Readonly<{ address: string; port: number }>;
  trust: MachineTransportTrust;
  /** The password the login uses. */
  secretRef: string;
  username: string;
  /** The stored file's name, in the login's working directory. */
  remoteName: string;
  bytes: Uint8Array<ArrayBuffer>;
  /** Milliseconds: each connection, and each stretch of the transfer without progress. */
  connectTimeout: number;
  signal: AbortSignal;
}>;

/** Verified host transfer byte count. @public */
export type MachineFileUploadReceipt = Readonly<{ bytesWritten: number }>;

/**
 * Where a machine is reached, in the kind its provider's `manifest.connection.transport` names: a network address
 * (host name or IP, with an optional port when the provider's default does not apply) or a serial device path. A
 * person's manual entry and a discovered candidate both carry one; binding configuration never does.
 * @public
 */
export type MachineEndpoint =
  | Readonly<{ transport: 'network'; address: string; port?: number }>
  | Readonly<{ transport: 'serial'; path: string }>;

/**
 * Where a discovered candidate answered: a {@link MachineEndpoint}, plus the local interface a network candidate was
 * seen on (`en0`, `udp4`, `manual`) when the provider knows it.
 * @public
 */
export type MachineCandidateEndpoint =
  | Readonly<{ transport: 'network'; address: string; port?: number; interface?: string }>
  | Readonly<{ transport: 'serial'; path: string }>;

const endpointText = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value.isWellFormed());
const networkEndpointFields = { address: endpointText, port: z.number().int().min(1).max(65_535).optional() };
const serialEndpointSchema = z.strictObject({ transport: z.literal('serial'), path: endpointText });

/** The wire form of a {@link MachineEndpoint}. @internal */
export const machineEndpointSchema = z.discriminatedUnion('transport', [
  z.strictObject({ transport: z.literal('network'), ...networkEndpointFields }),
  serialEndpointSchema,
]);

/** The wire form of a {@link MachineCandidateEndpoint}. @internal */
export const machineCandidateEndpointSchema = z.discriminatedUnion('transport', [
  z.strictObject({ transport: z.literal('network'), ...networkEndpointFields, interface: endpointText.optional() }),
  serialEndpointSchema,
]);

/**
 * A candidate endpoint, also reading the shape written before endpoints named their transport (`{ address,
 * interface }`) as a network one: bindings stored by an earlier Tau keep it.
 * @internal
 */
export const storedCandidateEndpointSchema = z.union([
  machineCandidateEndpointSchema,
  z
    .strictObject({ address: endpointText, interface: endpointText })
    .transform((legacy): MachineCandidateEndpoint => ({ transport: 'network', ...legacy })),
]);

/** Untrusted provider-reported identity evidence, not a physical identity key. @public */
export type MachineClaimedIdentity = Readonly<{
  serial?: string;
  model?: string;
}>;

/** Candidate reported by bounded provider discovery. @public */
export type MachineCandidate = Readonly<{
  id: string;
  name: string;
  endpoint: MachineCandidateEndpoint;
  claimedIdentity: MachineClaimedIdentity;
  observedAt: string;
  expiresAt: string;
  /** Host-set on discovery frames when a credential is saved for the claimed identity; never the secret, never set by a provider. */
  credential?: 'saved';
}>;

/** One discovery stream event. @public */
export type MachineDiscoveryEvent =
  | Readonly<{ type: 'found' | 'updated'; candidate: MachineCandidate }>
  | Readonly<{ type: 'lost'; candidateId: string; observedAt: string }>;

/** Non-secret outcome of starting a host-local binding ceremony. @public */
export type MachineBindingOutcome =
  | Readonly<{ status: 'bound'; machineId: string }>
  | Readonly<{ status: 'operator-action-required'; ceremonyId: string }>;

/** Named discovery operation input. @public */
export type MachineDiscoveryInput<Configuration> = Readonly<{
  configuration: Configuration;
  /**
   * Addressed discovery: look for the machine only here, as a person entered it. Its `transport` is always the
   * provider's `manifest.connection.transport` (the host refuses any other). Absent: scan as the provider does.
   */
  endpoint?: MachineEndpoint;
  signal: AbortSignal;
}>;

/** Host-local credential reference and approved per-service trust, never portable binding data. @public */
export type MachineConnectionContext = Readonly<{
  secretRef: string;
  serviceTrust: Readonly<Record<string, MachineTransportTrust | undefined>>;
}>;

/** Named connection operation input. @public */
export type MachineConnectInput<Configuration> = Readonly<{
  candidate: MachineCandidate;
  configuration: Configuration;
  connection: MachineConnectionContext;
  /**
   * `bind`: a person's binding ceremony, the first connect to this endpoint, where a provider may insist on proof that
   * the endpoint is the machine it claims. `reconnect`: the host keeping a binding connected; the endpoint was proven
   * at bind, so silence or a busy answer is the machine being away or held, not a wrong address.
   */
  purpose: 'bind' | 'reconnect';
  signal: AbortSignal;
}>;

/** What is installed on this machine now, as the provider reports it after connecting. @public */
export type MachineInstalledCapabilities = Pick<
  MachineManifest,
  'connection' | 'axes' | 'components' | 'processes' | 'actions' | 'holds' | 'jobs' | 'stop'
>;

/**
 * What is installed on this machine now, as the host serves it. A changed `revision` invalidates every form shown
 * before it; `incarnation` changes with every connection. `qualifications` are the provider manifest's, stamped by the
 * host (a session never reports them), so `isSimulatedMachine(entry.descriptor.capabilities)` tells a simulator from a
 * machine; they are not part of `revision`, which covers what the provider reports installed.
 * @public
 */
export type MachineCapabilities = MachineInstalledCapabilities &
  Readonly<{ revision: string; incarnation: string; qualifications: MachineManifest['qualifications'] }>;

/** A connected machine's identity and what it can do. @public */
export type MachineDescriptor = Readonly<{
  id: string;
  name: string;
  vendor: string;
  model: string;
  firmware: string;
  capabilities: MachineCapabilities;
}>;

/** The descriptor a provider session reports; the host adds the capability revision, incarnation and qualifications. @public */
export type MachineProviderDescriptor = Omit<MachineDescriptor, 'capabilities'> &
  Readonly<{ capabilities: MachineInstalledCapabilities }>;

/** Named descriptor operation input. @public */
export type MachineGetDescriptorInput = Readonly<{ signal: AbortSignal }>;

/** Named snapshot operation input. @public */
export type MachineGetSnapshotInput = Readonly<{ signal: AbortSignal }>;

/** Named observation operation input. @public */
export type MachineObserveInput = Readonly<{ signal: AbortSignal }>;

/**
 * Provider result for one physical command. `accepted` means the machine took it, not that the physical result has
 * happened; `unknown` is never retried.
 * @public
 */
export type MachineCommandReceipt =
  | Readonly<{
      status: 'accepted';
      observedAt: string;
      /** The run a start created. */
      runId?: string;
      /** The activity an action started, when the machine reports one. */
      activityId?: string;
      /** The transfer a stored delivery made. */
      transferId?: string;
    }>
  | Readonly<{ status: 'rejected'; code: string; message: string; observedAt: string }>
  | Readonly<{ status: 'unknown'; reason: string; runId?: string; observedAt: string }>;

/** One admitted intent as the provider receives it: parameters already validated by the host. @public */
export type MachineProviderActionInput = Readonly<{
  operationId: string;
  componentId: string;
  action: string;
  version: number;
  /** The run the caller saw, or null for an idle action. */
  // oxlint-disable-next-line typescript/no-restricted-types -- null is the caller's statement that it saw no run; absent would be no statement.
  expectedRunId: string | null;
  parameters: unknown;
  /**
   * Who asked, as the host admitted the session: never taken from the request. An agent's pause reports
   * `paused.by: 'agent'`.
   */
  requestedBy: Readonly<{ kind: MachineRequester['kind'] }>;
  signal: AbortSignal;
}>;

/** Whether the machine's own reports now show an action's effect. @public */
export type MachineActionConfirmation =
  | Readonly<{ status: 'confirmed' }>
  | Readonly<{ status: 'pending' }>
  | Readonly<{ status: 'refuted'; code: string; message: string }>;

/** Required facet: apply declared actions. @public */
export type MachineActionCapability =
  | Readonly<{ type: 'unsupported' }>
  | Readonly<{
      type: 'supported';
      /** Send once; check run, prompt and interlocks again at the moment of sending. */
      apply(input: MachineProviderActionInput): Promise<MachineCommandReceipt>;
      /**
       * For an action whose descriptor confirms by `observation`: whether the latest report shows the effect. Reads
       * only; never sends. The host asks after every observation until the answer is no longer `pending`. For an
       * operation this session never sent (a host restarted, a session replaced), the answer is `pending`: the host
       * escalates it to attention and a person reconciles it; it is never `confirmed` or `refuted` by default.
       */
      confirm(input: Omit<MachineProviderActionInput, 'signal' | 'requestedBy'>): MachineActionConfirmation;
    }>;

/** A hold as the provider runs it. @public */
export type MachineProviderHold = Readonly<{
  /** Send at most one segment that ends by itself within the declared bound. Called while the lease is fresh. */
  extend(): Promise<void>;
  /** Stop now and discard what is queued. */
  release(): Promise<MachineCommandReceipt>;
}>;

/** One admitted hold as the provider receives it. @public */
export type MachineProviderHoldInput = Readonly<{
  operationId: string;
  componentId: string;
  hold: string;
  parameters: unknown;
  /** Who asked, as the host admitted the session. A hold is a person's, so this is always `user`. */
  requestedBy: Readonly<{ kind: MachineRequester['kind'] }>;
  signal: AbortSignal;
}>;

/** Required facet: held controls. @public */
export type MachineHoldCapability =
  | Readonly<{ type: 'unsupported' }>
  | Readonly<{
      type: 'supported';
      begin(input: MachineProviderHoldInput): Promise<MachineProviderHold | MachineFailure>;
    }>;

/** What a provider's read-only preflight returns. @public */
export type MachinePreparation =
  | Readonly<{
      status: 'ready' | 'blocked';
      program: MachineProgramSummary;
      checks: readonly MachineCheck[];
      /** The facts of the setup this job relies on; the host fences the start with their digest. */
      setup: CacheValue;
      /** The name the program will have on the machine; only a stored delivery has one. */
      remoteName?: string;
      parser: Readonly<{ id: string; version: string }>;
      providerData: CacheValue;
      observedAt: string;
    }>
  | Readonly<{ status: 'refused'; code: MachineJobFailureCode; message: string; observedAt: string }>;

/** One job step as the provider receives it. @public */
export type MachineProviderJobInput<Configuration> = Readonly<{
  operationId: string;
  expectedMachineId: string;
  artifact: MachineArtifactReference;
  configuration: Configuration;
  signal: AbortSignal;
}>;

/** A start as the provider receives it: the job step, its prepared data and the transfer it follows. @public */
export type MachineProviderStartInput<Configuration> = MachineProviderJobInput<Configuration> &
  Readonly<{ providerData: CacheValue; transferId?: string }>;

/** What a start form's partial values are completed against: the program and what the person chose so far. @public */
export type MachineCompleteConfigurationInput = Readonly<{
  expectedMachineId: string;
  artifact: MachineArtifactReference;
  /** Partial start-form values; what is absent the provider fills from the machine's current setup. */
  configuration: CacheValue;
  signal: AbortSignal;
}>;

/**
 * Required facet: run programs. A stored machine receives the file and then one start command; a streamed machine
 * has no transfer, and `start` returns once the controller has taken the first block while the session keeps
 * feeding the rest. An `at-machine` start loads the program and returns `accepted` once the machine waits for its
 * own start button. Only a stored delivery names a file on the machine (`remoteName`).
 * @public
 */
export type MachineJobCapability<Configuration> =
  | Readonly<{ type: 'unsupported' }>
  | (Readonly<{
      type: 'supported';
      /**
       * Read-only: complete a partial start form from what the machine reports (trays, plate, loaded material), in
       * the provider's own submission keys, so no consumer writes vendor keys. The host validates the result
       * before `prepare`. Absent, the host uses the values as given.
       */
      completeConfiguration?(input: MachineCompleteConfigurationInput): Promise<CacheValue>;
      /** Read-only: parse the program and check it against the setup. */
      prepare(input: MachineProviderJobInput<Configuration>): Promise<MachinePreparation>;
    }> &
      (
        | Readonly<{
            delivery: 'streamed';
            /**
             * Resolve `accepted` only once the run is in the session's report, and name it (`runId`): the host
             * records that run on the job from this receipt, and a launcher deciding whether quitting would cut a
             * stream reads both.
             */
            start(input: MachineProviderStartInput<Configuration>): Promise<MachineCommandReceipt>;
          }>
        | Readonly<{
            delivery: 'stored';
            transfer(
              input: MachineProviderJobInput<Configuration> &
                Readonly<{ remoteName: string; providerData: CacheValue }>,
            ): Promise<MachineCommandReceipt>;
            start(
              input: MachineProviderStartInput<Configuration> & Readonly<{ remoteName: string }>,
            ): Promise<MachineCommandReceipt>;
          }>
      ));

/** Provider-local lookup for a late reply to a stop, a transfer or a start; never sends. @public */
export type MachineReconcileInput = Readonly<{
  operationId: string;
  kind: 'stop' | 'transfer' | 'start' | 'action';
  /** For a start, the transfer it sent, which a provider may name the run after. */
  transferId?: string;
  signal: AbortSignal;
}>;

/** Named still-capture operation input. @public */
export type MachineCaptureStillInput = Readonly<{ signal: AbortSignal }>;

/** Bounded short-lived still image returned outside durable job/event storage. @public */
export type MachineStill = Readonly<{
  bytes: Uint8Array<ArrayBuffer>;
  mediaType: 'image/jpeg';
  capturedAt: string;
  expiresAt: string;
}>;

/** Required discriminated still-capture facet. @public */
export type MachineStillCaptureCapability =
  | Readonly<{ type: 'unsupported' }>
  | Readonly<{
      type: 'supported';
      capture(input: MachineCaptureStillInput): Promise<MachineStill>;
    }>;

/** One connected provider session (ABI version 2). `stop` is not a facet: every provider has it. @public */
export type MachineSession<SubmissionConfiguration = unknown> = Readonly<{
  actions: MachineActionCapability;
  holds: MachineHoldCapability;
  jobs: MachineJobCapability<SubmissionConfiguration>;
  stillCapture: MachineStillCaptureCapability;
  getDescriptor(input: MachineGetDescriptorInput): Promise<MachineProviderDescriptor>;
  getSnapshot(input: MachineGetSnapshotInput): Promise<MachineReport>;
  /**
   * Live reports. The first observation every subscriber receives is a `snapshot`; `changed` deltas follow only
   * after it. Aborting the signal ends the iteration by returning, never by throwing.
   */
  observe(input: MachineObserveInput): AsyncIterable<MachineObservation>;
  /** Stop now, ahead of anything queued. */
  stop(input: Readonly<{ operationId: string; signal: AbortSignal }>): Promise<MachineCommandReceipt>;
  /** Read proof of a stop, a transfer or a start; never sends. */
  reconcile(input: MachineReconcileInput): Promise<MachineCommandReceipt>;
  close(): Promise<void>;
  dispose(): Promise<void>;
}>;

/**
 * The manifest a provider authors: actions and holds carry their trusted schemas, and the jobs facts take their
 * start form from the definition's `submissionConfiguration`.
 * @public
 */
export type MachineManifestDefinition = Omit<MachineManifest, 'actions' | 'holds' | 'jobs'> &
  Readonly<{
    actions: readonly MachineActionDefinition[];
    holds: readonly MachineHoldDefinition[];
    jobs:
      | Readonly<{ type: 'unsupported' }>
      | Omit<Extract<MachineManifest['jobs'], { type: 'supported' }>, 'submission'>;
  }>;

/** Trusted machine definition retained behind the shared runtime ABI loader. @public */
export type MachineProviderDefinition<
  Id extends string,
  BindingSchema extends StandardSchemaV1,
  SubmissionSchema extends StandardSchemaV1,
  Settings extends SettingsSchema = SettingsSchema,
> = Readonly<{
  id: Id;
  name: string;
  version: string;
  protocolVersion: 2;
  vendor: string;
  manifest: MachineManifestDefinition;
  bindingConfiguration: ConfigurationDefinition<BindingSchema>;
  submissionConfiguration: ConfigurationDefinition<SubmissionSchema>;
  settingsConfiguration?: SettingsDefinition<Settings>;
  discover(
    input: MachineDiscoveryInput<StandardSchemaV1.InferOutput<BindingSchema>>,
    runtime: MachineDiscoveryRuntime,
  ): AsyncIterable<MachineDiscoveryEvent>;
  connect(
    input: MachineConnectInput<StandardSchemaV1.InferOutput<BindingSchema>>,
    runtime: MachineConnectionRuntime,
  ): Promise<MachineSession<StandardSchemaV1.InferOutput<SubmissionSchema>>>;
}>;

/** Callable machine capability factory using the shared toolkit ABI. @public */
export type MachineProviderFactory<Id extends string, Definition> = () => MachineProvider<Id> &
  RuntimePluginDefinitionCarrier<Definition>;

const assertIdentity = (value: string, field: string): void => {
  if (value.length === 0 || value.length > 256 || !value.isWellFormed()) {
    throw new TypeError(`defineMachine: ${field} is invalid.`);
  }
};

const freezeJson = <Value>(value: Value): Value => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      freezeJson(child);
    }
    Object.freeze(value);
  }
  return value;
};

const isCanonicalArchiveMember = (member: string): boolean =>
  member.length > 0 &&
  member.length <= 512 &&
  member.normalize('NFC') === member &&
  !member.startsWith('/') &&
  !/^[A-Za-z]:/u.test(member) &&
  !member.includes('\\') &&
  member.split('/').every(
    (segment) =>
      segment !== '' &&
      segment !== '.' &&
      segment !== '..' &&
      [...segment].every((character) => {
        const code = character.codePointAt(0)!;
        return code > 31 && code !== 127;
      }),
  );

const assertAccepted = (accepts: readonly MachineAcceptedContainer[]): void => {
  if (accepts.length === 0 || accepts.length > 32) {
    throw new TypeError('defineMachine: a job-capable machine accepts at least one container.');
  }
  const contracts = new Set<string>();
  for (const accepted of accepts) {
    assertIdentity(accepted.contract.id, 'accepts.contract.id');
    assertIdentity(accepted.mediaType, 'accepts.mediaType');
    if (
      !Number.isSafeInteger(accepted.contract.version) ||
      accepted.contract.version < 1 ||
      accepted.requiredMembers.some((member) => !isCanonicalArchiveMember(member)) ||
      new Set(accepted.requiredMembers).size !== accepted.requiredMembers.length
    ) {
      throw new TypeError('defineMachine: accepted container is invalid.');
    }
    const identity = `${accepted.contract.id}@${accepted.contract.version}`;
    if (contracts.has(identity)) {
      throw new TypeError(`defineMachine: duplicate accepted contract ${identity}.`);
    }
    contracts.add(identity);
  }
};

const assertDefinition = (definition: {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly vendor: string;
  readonly protocolVersion: number;
}): void => {
  for (const [field, value] of [
    ['id', definition.id],
    ['name', definition.name],
    ['version', definition.version],
    ['vendor', definition.vendor],
  ] as const) {
    assertIdentity(value, field);
  }
  if (definition.protocolVersion !== 2) {
    throw new TypeError('defineMachine: protocolVersion must be 2.');
  }
};

const providerIdentitySchema = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value.isWellFormed());
const configurationManifestSchema = z.unknown().transform((value, context) => {
  try {
    return admitConfigurationManifest(value).manifest;
  } catch {
    context.addIssue({
      code: 'custom',
      message: 'Invalid configuration manifest.',
    });
    return z.NEVER;
  }
});
const machineProviderSchema = z.strictObject({
  id: providerIdentitySchema,
  name: providerIdentitySchema,
  version: providerIdentitySchema,
  protocolVersion: z.literal(2),
  vendor: providerIdentitySchema,
  manifest: machineManifestSchema,
  bindingConfiguration: configurationManifestSchema,
  settingsConfiguration: configurationManifestSchema.optional(),
  unavailable: z.strictObject({ reason: providerIdentitySchema }).optional(),
});

const providerKeys = [
  'id',
  'name',
  'version',
  'protocolVersion',
  'vendor',
  'manifest',
  'bindingConfiguration',
  'settingsConfiguration',
  'unavailable',
] as const;
const optionalProviderKeys: ReadonlySet<string> = new Set(['settingsConfiguration', 'unavailable']);

const providerLimits = {
  code: 'MACHINE_PROVIDER_DESCRIPTOR',
  maximumDepth: 48,
  maximumNodes: 262_144,
  maximumCharacters: 4_194_304,
};

const providerWireValue = (value: unknown): Readonly<Record<string, unknown>> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('INVALID_MACHINE_PROVIDER_DESCRIPTOR');
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const unexpected = Object.keys(descriptors).find(
    (key) => !providerKeys.includes(key as (typeof providerKeys)[number]),
  );
  if (unexpected !== undefined) {
    throw new TypeError('INVALID_MACHINE_PROVIDER_DESCRIPTOR');
  }
  return Object.fromEntries(
    providerKeys
      .filter((key) => !optionalProviderKeys.has(key) || descriptors[key] !== undefined)
      .map((key) => {
        const descriptor = descriptors[key];
        if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
          throw new TypeError('INVALID_MACHINE_PROVIDER_DESCRIPTOR');
        }
        return [key, descriptor.value];
      }),
  );
};

/** Parse one bounded, serializable machine provider descriptor.
 * @param value - Untrusted provider metadata or one branded host-composed provider.
 * @returns Detached, frozen provider metadata.
 * @public
 */
export const parseMachineProvider = (value: unknown): MachineProvider => {
  const candidate = machineProviderSchema.parse(cloneBoundedJson(providerWireValue(value), providerLimits));
  assertDefinition(candidate);
  parseMachineManifest(candidate.manifest);
  return freezeJson(candidate) as MachineProvider;
};

/**
 * The serializable manifest of a definition: descriptors without their schemas, and the start form filled in.
 * @param manifest - The authored manifest.
 * @param submission - The definition's start form.
 * @returns The manifest every surface reads.
 * @public
 */
export const machineManifestOf = (
  manifest: MachineManifestDefinition,
  submission: ConfigurationManifestV1,
): MachineManifest =>
  parseMachineManifest({
    ...manifest,
    actions: manifest.actions.map((action) => machineActionDescriptorOf(action)),
    holds: manifest.holds.map((hold) => machineActionDescriptorOf(hold)),
    jobs: manifest.jobs.type === 'unsupported' ? manifest.jobs : { ...manifest.jobs, submission },
  });

/**
 * The trusted schema of one installed action or hold, for host-side validation.
 * @param manifest - The authored manifest.
 * @param input - The component, the action or hold id and which kind.
 * @returns The definition, or undefined when the provider does not declare it.
 * @public
 */
export const machineActionDefinitionOf = (
  manifest: MachineManifestDefinition,
  input: Readonly<{ componentId: string; id: string; kind: 'action' | 'hold' }>,
): MachineActionDefinition | MachineHoldDefinition | undefined =>
  (input.kind === 'action' ? manifest.actions : manifest.holds).find(
    (definition) => definition.componentId === input.componentId && definition.id === input.id,
  );

/**
 * Define one lazy schema-bearing physical-machine provider.
 * @param definition - Flat provider metadata, configuration, discovery, and connection operations.
 * @returns A zero-argument toolkit capability factory.
 * @public
 */
export const defineMachine = <
  const Id extends string,
  BindingSchema extends StandardSchemaV1,
  SubmissionSchema extends StandardSchemaV1,
  Settings extends SettingsSchema = SettingsSchema,
>(
  definition: MachineProviderDefinition<Id, BindingSchema, SubmissionSchema, Settings>,
): MachineProviderFactory<Id, typeof definition> => {
  assertDefinition(definition);
  if (definition.manifest.jobs.type === 'supported') {
    assertAccepted(definition.manifest.jobs.accepts);
  }
  const descriptor: MachineProvider<Id> = {
    id: definition.id,
    name: definition.name,
    version: definition.version,
    protocolVersion: 2,
    vendor: definition.vendor,
    manifest: machineManifestOf(definition.manifest, definition.submissionConfiguration.manifest),
    bindingConfiguration: definition.bindingConfiguration.manifest,
    ...(definition.settingsConfiguration ? { settingsConfiguration: definition.settingsConfiguration.manifest } : {}),
  };
  const owned = cloneBoundedJson(descriptor, providerLimits) as MachineProvider<Id>;
  const factory = () => freezeJson(attachRuntimePluginDefinition(structuredClone(owned), () => definition));
  return attachRuntimePluginFactoryOptions(factory, false);
};
