import { createChannelClient, createChannelServer, wrapMessagePort, wrapWebSocket } from '@taucad/rpc';
import type {
  ChannelServerHandle,
  MessagePortLike,
  Port,
  WebSocketLike,
  WireProtocolSchemas,
  WireValidator,
} from '@taucad/rpc';
import { msgpackCodec } from '@taucad/rpc/codec/msgpack';
import type { ContentDigest } from '@taucad/cache-core';
import { assertRootedPath } from '@taucad/utils/path';
import { z } from 'zod';

import { machineSettingsProvenanceSchema } from '#machines/settings.js';

import { cloneBoundedJson } from '@taucad/parameters/json';
import type {
  AdmittedHostOperation,
  HostAdmissionAuthority,
  HostAdmissionOperation,
  HostSessionHandle,
} from '#host/host-admission.js';
import { isMachineJobFailureCode, machineFailureCodes } from '#machines/machine-actions.js';
import type { MachineFailure } from '#machines/machine-actions.js';
import type {
  MachineActionApproval,
  MachineApplyActionInput,
  MachineApproveActionInput,
  MachineBeginBindingInput,
  MachineBeginHoldInput,
  MachineBindingRemoval,
  MachineCaptureStillClientInput,
  MachineClient,
  MachineDiscoverInput,
  MachineDiscoveryFrame,
  MachineHold,
  MachineReconcileOperationInput,
  MachineRemoveBindingInput,
  MachineSetTestingInput,
  MachineStopInput,
} from '#machines/machine-client.js';
import {
  parseMachineDirectoryCursor,
  parseMachineDirectoryEntry,
  parseMachineDirectoryFrame,
  parseMachineDirectorySnapshot,
} from '#machines/machine-directory.js';
import type {
  MachineDirectory,
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
  MachineOperationReceipt,
  MachinePreparedJob,
  MachineProgramSummary,
  MachineReceipt,
  MachineRequestJobInput,
  MachineResolveJobInput,
  MachineWithdrawJobInput,
} from '#machines/machine-jobs.js';
import {
  machineOperationReceiptSchema as receiptSchema,
  machineOperationSchema as operationSchema,
  machineRequesterSchema as requesterSchema,
} from '#machines/machine-jobs.js';
import { machineCheckSchema } from '#machines/machine-observation.js';
import { parseMachineProvider } from '#machines/machine.js';
import type { MachineBindingOutcome, MachineProvider, MachineStill } from '#machines/machine.js';

type EmptyInput = Readonly<Record<string, never>>;
type Args<Input> = Omit<Input, 'signal'>;
type DiscoverInput = Args<MachineDiscoverInput>;
type BeginBindingInput = Args<MachineBeginBindingInput>;
type RemoveBindingInput = Args<MachineRemoveBindingInput>;
type CaptureStillInput = Args<MachineCaptureStillClientInput>;
type CheckJobInput = Args<MachineCheckJobInput>;
type RequestJobInput = Args<MachineRequestJobInput>;
type ListJobsInput = Args<MachineListJobsInput>;
type ResolveJobInput = Args<MachineResolveJobInput>;
type WithdrawJobInput = Args<MachineWithdrawJobInput>;
type ApplyActionInput = Args<MachineApplyActionInput>;
type ApproveActionInput = Args<MachineApproveActionInput>;
type StopInput = Args<MachineStopInput>;
type BeginHoldInput = Args<MachineBeginHoldInput>;
type HoldInput = Readonly<{ holdId: string }>;
type ReconcileOperationInput = Args<MachineReconcileOperationInput>;
type SetTestingInput = Args<MachineSetTestingInput>;
type GetInput = Readonly<{ machineId: string }>;
type WatchInput = Readonly<{ cursor?: MachineDirectoryCursor }>;
type HoldBegun = MachineHold | (Readonly<{ status: 'rejected' }> & MachineFailure);
type HoldRenewed = Readonly<{ status: 'held' | 'ended' }>;

type MachineChannelProtocol = {
  readonly hello: Readonly<{ server: 'machines'; protocolVersion: 2 }>;
  readonly calls: {
    readonly listProviders: { readonly args: EmptyInput; readonly result: readonly MachineProvider[] };
    readonly beginBinding: { readonly args: BeginBindingInput; readonly result: MachineBindingOutcome };
    readonly removeBinding: { readonly args: RemoveBindingInput; readonly result: MachineBindingRemoval };
    readonly captureStill: { readonly args: CaptureStillInput; readonly result: MachineStill };
    readonly list: { readonly args: EmptyInput; readonly result: MachineDirectorySnapshot };
    readonly get: { readonly args: GetInput; readonly result: MachineDirectoryEntry };
    readonly checkJob: { readonly args: CheckJobInput; readonly result: MachineJobCheck };
    readonly requestJob: { readonly args: RequestJobInput; readonly result: MachineJob };
    readonly listJobs: { readonly args: ListJobsInput; readonly result: readonly MachineJob[] };
    readonly resolveJob: { readonly args: ResolveJobInput; readonly result: MachineJob };
    readonly withdrawJob: { readonly args: WithdrawJobInput; readonly result: MachineJob };
    readonly applyAction: { readonly args: ApplyActionInput; readonly result: MachineReceipt<'action'> };
    readonly approveAction: { readonly args: ApproveActionInput; readonly result: MachineActionApproval };
    readonly stop: { readonly args: StopInput; readonly result: MachineReceipt<'stop'> };
    readonly beginHold: { readonly args: BeginHoldInput; readonly result: HoldBegun };
    readonly renewHold: { readonly args: HoldInput; readonly result: HoldRenewed };
    readonly endHold: { readonly args: HoldInput; readonly result: MachineReceipt<'hold'> };
    readonly reconcileOperation: { readonly args: ReconcileOperationInput; readonly result: MachineOperation };
    readonly setTesting: { readonly args: SetTestingInput; readonly result: MachineDirectoryEntry };
  };
  readonly notifies: Readonly<Record<never, never>>;
  readonly listens: {
    readonly discover: { readonly args: DiscoverInput; readonly event: MachineDiscoveryFrame };
    readonly watch: { readonly args: WatchInput; readonly event: MachineDirectoryFrame };
    readonly watchJobs: { readonly args: ListJobsInput; readonly event: MachineJob };
  };
};

type Admitted = Readonly<{ admitted: AdmittedHostOperation; signal: AbortSignal }>;
type HostCalls = Omit<MachineChannelProtocol['calls'], 'listProviders' | 'list' | 'get'>;

/**
 * Host-owned machine work invoked only after route admission. Every operation is required; a host that cannot serve
 * one throws `MACHINE_OPERATION_UNAVAILABLE`. `admitted.actor` is who the session belongs to: an agent session is an
 * agent whatever its request says.
 * @public
 */
export type MachineChannelHostOperations = Readonly<
  {
    [Name in keyof HostCalls]: (input: HostCalls[Name]['args'] & Admitted) => Promise<HostCalls[Name]['result']>;
  } & {
    discover(input: DiscoverInput & Admitted): AsyncIterable<MachineDiscoveryFrame>;
    watchJobs(input: ListJobsInput & Admitted): AsyncIterable<MachineJob>;
  }
>;

/**
 * Direct machines channel plus its explicit wire lifecycle. `ready` rejects with code
 * `MACHINE_CHANNEL_VERSION_MISMATCH` when the host speaks another protocol version: the person updates Tau.
 * @public
 */
export type MachineChannelClient = MachineClient & Readonly<{ ready: Promise<void>; close(): void }>;

/** Supported structured and byte-framed transports for one machine channel. @public */
export type MachineChannelEndpoint = Port<unknown> | MessagePortLike | WebSocketLike;

const sessionKey = 'machines-v2';
const streamFlowControl = { initialCredits: 1, maxFrameBytes: 4_194_304, maxOwnedBytes: 4_194_304 } as const;
const limits = { code: 'MACHINE_CHANNEL', maximumDepth: 32, maximumNodes: 16_384, maximumCharacters: 524_288 };
const emptySchema = z.strictObject({});
const identitySchema = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value.isWellFormed());
const textSchema = z
  .string()
  .min(1)
  .max(1024)
  .refine((value) => value.isWellFormed());
const timestampSchema = z.iso.datetime({ offset: true });
const candidateSchema = z.strictObject({
  id: identitySchema,
  name: identitySchema,
  endpoint: z.strictObject({ address: identitySchema, interface: identitySchema }),
  claimedIdentity: z.strictObject({ serial: identitySchema.optional(), model: identitySchema.optional() }),
  observedAt: timestampSchema,
  expiresAt: timestampSchema,
  credential: z.literal('saved').optional(),
});
const discoveryFrameSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.enum(['found', 'updated']), candidate: candidateSchema }),
  z.strictObject({ type: z.literal('lost'), candidateId: identitySchema, observedAt: timestampSchema }),
]);
const bindingOutcomeSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('bound'), machineId: identitySchema }),
  z.strictObject({ status: z.literal('operator-action-required'), ceremonyId: identitySchema }),
]);
const bindingRemovalSchema = z.strictObject({ status: z.literal('removed'), machineId: identitySchema });
const digestSchema = z.custom<ContentDigest>(
  (value) => typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value),
);
const projectIdSchema = z.string().regex(/^proj_[\dA-Za-z]{21}$/u);
const isProjectRelativePath = (value: string): boolean => {
  try {
    return value.isWellFormed() && assertRootedPath(value) === value;
  } catch {
    return false;
  }
};
const artifactSchema = z.strictObject({
  projectId: projectIdSchema,
  path: z.string().min(1).max(512).refine(isProjectRelativePath, 'Expected a normalized project-relative path.'),
  digest: digestSchema,
  length: z
    .number()
    .int()
    .positive()
    .max(512 * 1024 * 1024),
  mediaType: identitySchema,
  contract: z.strictObject({ id: identitySchema, version: z.number().int().positive() }),
  selectedMember: identitySchema,
});
const preparedJobSchema = z.strictObject({
  preparedId: identitySchema,
  preparedDigest: digestSchema,
  configurationDigest: digestSchema,
  providerDataDigest: digestSchema,
  setupDigest: digestSchema,
  machineId: identitySchema,
  physicalMachineId: identitySchema,
  artifact: artifactSchema,
  remoteName: identitySchema.optional(),
  parser: z.strictObject({ id: identitySchema, version: identitySchema }),
  preparedAt: timestampSchema,
  expiresAt: timestampSchema,
});
const failureShape = {
  code: z.enum(machineFailureCodes),
  message: textSchema,
  issues: z
    .array(z.strictObject({ path: z.string().max(256), message: textSchema }))
    .max(32)
    .optional(),
};
const configurationSchema = z.unknown().transform((value) => cloneBoundedJson(value, limits));
const jobFailureCodeSchema = z.string().refine(isMachineJobFailureCode, 'Expected a machine job failure code.');
const range = z.strictObject({ min: z.number(), max: z.number() });
const programSchema = z.strictObject({
  name: identitySchema,
  estimatedDuration: z.number().nonnegative().optional(),
  producer: z.strictObject({ name: identitySchema, version: identitySchema.optional() }).optional(),
  preferences: machineSettingsProvenanceSchema.optional(),
  facts: z.union([
    z.strictObject({
      process: z.literal('fff'),
      layers: z.number().int().nonnegative().optional(),
      filamentLength: z.number().nonnegative().optional(),
      filaments: z
        .array(
          z.strictObject({
            index: z.number().int().nonnegative(),
            materialType: identitySchema,
            color: z.string().regex(/^#[0-9A-F]{8}$/u),
          }),
        )
        .max(32)
        .optional(),
    }),
    z.strictObject({
      process: z.literal('milling'),
      lines: z.number().int().nonnegative(),
      extents: z.record(z.string().max(8), range),
      tools: z
        .array(
          z.strictObject({
            number: z.number().int().nonnegative(),
            description: z.string().max(256).optional(),
            diameter: z.number().positive().optional(),
          }),
        )
        .max(256),
      spindleSpeed: range.optional(),
      maximumFeed: z.number().nonnegative().optional(),
      workOffsets: z.array(z.string().min(1).max(16)).max(32),
      uses: z.array(z.enum(['tool-change', 'coolant', 'probing', 'program-stop', 'inverse-time-feed'])).max(8),
    }),
    z.strictObject({ process: z.literal('other') }),
    z.strictObject({
      process: z
        .templateLiteral([z.string(), '.', z.string()])
        .refine((process) => process.length <= 64 && /^[a-z0-9-]+\.[a-z0-9.-]+$/u.test(process)),
      version: z.number().int().min(1),
      data: configurationSchema,
    }),
  ]),
});
const progressSchema = z.strictObject({
  basis: z.enum(['executed', 'queued', 'estimated']),
  fraction: z.number().min(0).max(1).optional(),
  elapsed: z.number().min(0).optional(),
  remaining: z.number().min(0).optional(),
  counters: z
    .array(
      z.strictObject({
        id: identitySchema,
        label: textSchema,
        current: z.number().min(0),
        total: z.number().min(0).optional(),
      }),
    )
    .max(8),
});
const jobSchema: z.ZodType<MachineJob> = z.strictObject({
  version: z.literal(1),
  jobId: identitySchema,
  machineId: identitySchema,
  artifact: artifactSchema,
  configuration: configurationSchema,
  requestedBy: requesterSchema,
  state: z.enum([
    'preparing',
    'awaiting-approval',
    'approved',
    'transferring',
    'starting',
    'awaiting-start',
    'confirming',
    'started',
    'denied',
    'withdrawn',
    'rejected',
    'unknown',
    'failed',
  ]),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  program: programSchema,
  checks: z.array(machineCheckSchema).max(64),
  prepared: preparedJobSchema.optional(),
  attestations: z
    .array(z.strictObject({ id: identitySchema, by: requesterSchema, at: timestampSchema }))
    .max(16)
    .optional(),
  attended: z.boolean().optional(),
  transferOperationId: identitySchema.optional(),
  startOperationId: identitySchema.optional(),
  transferId: identitySchema.optional(),
  receipt: receiptSchema.optional(),
  failure: z.strictObject({ code: jobFailureCodeSchema, message: textSchema }).optional(),
  resolvedBy: requesterSchema.optional(),
  run: z
    .strictObject({
      runId: identitySchema,
      outcome: z.enum(['running', 'completed', 'cancelled', 'failed', 'interrupted', 'unknown']),
      endedAt: timestampSchema.optional(),
      progress: progressSchema.optional(),
    })
    .optional(),
});
const jobCheckSchema = z.union([
  z.strictObject({
    status: z.enum(['ready', 'blocked']),
    program: programSchema,
    checks: z.array(machineCheckSchema).max(64),
    configuration: configurationSchema,
  }),
  z.strictObject({ status: z.literal('refused'), code: jobFailureCodeSchema, message: textSchema }),
]);
const stillSchema = z.strictObject({
  bytes: z
    .instanceof(Uint8Array)
    .refine(
      (bytes) =>
        bytes.byteLength >= 4 &&
        bytes.byteLength <= 4 * 1024 * 1024 &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes.at(-2) === 0xff &&
        bytes.at(-1) === 0xd9,
    )
    .transform((bytes) => Uint8Array.from(bytes)),
  mediaType: z.literal('image/jpeg'),
  capturedAt: timestampSchema,
  expiresAt: timestampSchema,
});
const jobScopeSchema = z.strictObject({
  machineId: identitySchema.optional(),
  projectId: projectIdSchema.optional(),
});
const holdBegunSchema = z.union([
  z.strictObject({ status: z.literal('held'), holdId: identitySchema, lease: z.number().int().positive() }),
  z.strictObject({ status: z.literal('rejected'), ...failureShape }),
]);

/**
 * The one admission scope every machines session is issued and admitted under. Machines belong to the store, not to
 * a workspace or project, so no machine API names it.
 * @internal
 */
export const machineAdmissionScope = 'tau:machines';

const freeze = <Value>(value: Value): Value => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      freeze(child);
    }
    Object.freeze(value);
  }
  return value;
};

/** Admit one bounded job record for the wire or the machine store. @internal
 * @param value - Untrusted record value.
 * @returns Detached, frozen record.
 */
export const parseMachineJob = (value: unknown): MachineJob => freeze(jobSchema.parse(value));

/** Admit one bounded prepared-job record for the wire or the machine store. @internal
 * @param value - Untrusted record value.
 * @returns Detached, frozen record.
 */
export const parseMachinePreparedJob = (value: unknown): MachinePreparedJob => freeze(preparedJobSchema.parse(value));

/** Admit one operation receipt. @internal
 * @param value - Untrusted receipt.
 * @returns Detached, frozen receipt.
 */
export const parseMachineOperationReceipt = (value: unknown): MachineOperationReceipt =>
  freeze(receiptSchema.parse(value));

/** Admit one operation record. @internal
 * @param value - Untrusted operation.
 * @returns Detached, frozen operation.
 */
export const parseMachineOperation = (value: unknown): MachineOperation => freeze(operationSchema.parse(value));

/** Admit one program summary, whole or partial. @internal
 * @param value - Untrusted summary.
 * @returns Detached, frozen summary.
 */
export const parseMachineProgramSummary = (value: unknown): MachineProgramSummary => freeze(programSchema.parse(value));

const validator = <Value>(parse: (value: unknown) => Value): WireValidator<Value> => ({
  safeParse(value) {
    try {
      return { success: true, data: parse(value) };
    } catch (error) {
      return {
        success: false,
        error: { issues: [{ path: [], message: error instanceof Error ? error.message : 'Invalid value.' }] },
      };
    }
  },
});
// SAFETY: each schema below is the runtime proof of the protocol type it is cast to.
const typed = <Value>(schema: z.ZodType): WireValidator<Value> =>
  validator((value) => freeze(schema.parse(value) as Value));

const providerListSchema = z
  .array(z.unknown())
  .max(128)
  .transform((providers) => providers.map((provider) => parseMachineProvider(provider)));
const cursorSchema = z.unknown().transform((value, context) => {
  try {
    return parseMachineDirectoryCursor(value);
  } catch {
    context.addIssue({ code: 'custom', message: 'Invalid machine directory cursor.' });
    return z.NEVER;
  }
});
const protocolSchemas: WireProtocolSchemas<MachineChannelProtocol> = {
  hello: z.strictObject({ server: z.literal('machines'), protocolVersion: z.literal(2) }),
  calls: {
    listProviders: { args: emptySchema, result: providerListSchema },
    beginBinding: {
      args: z.strictObject({ candidate: candidateSchema, name: identitySchema }),
      result: bindingOutcomeSchema,
    },
    removeBinding: { args: z.strictObject({ machineId: identitySchema }), result: bindingRemovalSchema },
    captureStill: { args: z.strictObject({ machineId: identitySchema }), result: stillSchema },
    list: { args: emptySchema, result: validator(parseMachineDirectorySnapshot) },
    get: { args: z.strictObject({ machineId: identitySchema }), result: validator(parseMachineDirectoryEntry) },
    checkJob: {
      args: z.strictObject({ machineId: identitySchema, artifact: artifactSchema, configuration: configurationSchema }),
      result: typed(jobCheckSchema),
    },
    requestJob: {
      args: typed(
        z.strictObject({
          jobId: identitySchema,
          machineId: identitySchema,
          artifact: artifactSchema,
          configuration: configurationSchema,
          requestedBy: requesterSchema,
          program: programSchema.partial().optional(),
        }),
      ),
      result: validator(parseMachineJob),
    },
    listJobs: {
      args: jobScopeSchema,
      result: validator((value) =>
        z
          .array(z.unknown())
          .max(1024)
          .parse(value)
          .map((job) => parseMachineJob(job)),
      ),
    },
    resolveJob: {
      args: z.strictObject({
        jobId: identitySchema,
        decision: z.enum(['approve', 'deny']),
        resolvedBy: requesterSchema,
        attestations: z.array(identitySchema).max(16).optional(),
        attended: z.boolean().optional(),
        transferOperationId: identitySchema.optional(),
        startOperationId: identitySchema.optional(),
      }),
      result: validator(parseMachineJob),
    },
    withdrawJob: {
      args: z.strictObject({ jobId: identitySchema, resolvedBy: requesterSchema }),
      result: validator(parseMachineJob),
    },
    applyAction: {
      args: z.strictObject({
        machineId: identitySchema,
        componentId: identitySchema,
        capabilityRevision: identitySchema,
        operationId: identitySchema,
        action: identitySchema,
        version: z.number().int().min(1).max(1000),
        expectedRunId: identitySchema.nullable(),
        parameters: configurationSchema,
        requestedBy: requesterSchema,
        attended: z.boolean().optional(),
      }),
      result: typed(receiptSchema),
    },
    approveAction: {
      args: z.strictObject({
        machineId: identitySchema,
        operationId: identitySchema,
        intent: z.strictObject({
          componentId: identitySchema,
          action: identitySchema,
          version: z.number().int().min(1).max(1000),
          expectedRunId: identitySchema.nullable(),
          parameters: configurationSchema,
        }),
        decision: z.enum(['approve', 'deny']),
        approvedBy: requesterSchema,
      }),
      result: typed(
        z.union([
          z.strictObject({ status: z.literal('approved'), operationId: identitySchema, expiresAt: timestampSchema }),
          z.strictObject({ status: z.literal('denied'), operationId: identitySchema }),
          z.strictObject({ status: z.literal('refused'), ...failureShape }),
        ]),
      ),
    },
    stop: {
      args: z.strictObject({
        machineId: identitySchema,
        operationId: identitySchema.optional(),
        requestedBy: requesterSchema,
      }),
      result: typed(receiptSchema),
    },
    beginHold: {
      args: typed(
        z.strictObject({
          machineId: identitySchema,
          componentId: identitySchema,
          capabilityRevision: identitySchema,
          operationId: identitySchema,
          hold: z.literal('motion.jog'),
          version: z.literal(1),
          parameters: configurationSchema,
          requestedBy: requesterSchema,
          attended: z.literal(true),
        }),
      ),
      result: typed(holdBegunSchema),
    },
    renewHold: {
      args: z.strictObject({ holdId: identitySchema }),
      result: z.strictObject({ status: z.enum(['held', 'ended']) }),
    },
    endHold: { args: z.strictObject({ holdId: identitySchema }), result: typed(receiptSchema) },
    reconcileOperation: {
      args: z.strictObject({ machineId: identitySchema, operationId: identitySchema }),
      result: validator(parseMachineOperation),
    },
    setTesting: {
      args: z.strictObject({ machineId: identitySchema, enabled: z.boolean(), requestedBy: requesterSchema }),
      result: validator(parseMachineDirectoryEntry),
    },
  },
  notifies: {},
  listens: {
    discover: {
      args: z.strictObject({ providerId: identitySchema, configuration: configurationSchema }),
      event: discoveryFrameSchema.transform(freeze),
    },
    watch: { args: z.strictObject({ cursor: cursorSchema.optional() }), event: validator(parseMachineDirectoryFrame) },
    watchJobs: { args: jobScopeSchema, event: validator(parseMachineJob) },
  },
};

const asPort = (endpoint: MachineChannelEndpoint): Port<unknown> => {
  if ('onMessage' in endpoint) {
    return endpoint;
  }
  return 'send' in endpoint ? wrapWebSocket(endpoint, msgpackCodec) : wrapMessagePort(endpoint);
};

const abortable = async <Value>(operation: Promise<Value>, signal: AbortSignal): Promise<Value> => {
  const aborted = Promise.withResolvers<never>();
  const onAbort = (): void => {
    aborted.reject(signal.reason instanceof Error ? signal.reason : new Error('Operation aborted.'));
  };
  signal.addEventListener('abort', onAbort, { once: true });
  if (signal.aborted) {
    onAbort();
  }
  try {
    return await Promise.race([operation, aborted.promise]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
};

const closeIterator = async (iterator: AsyncIterator<unknown>): Promise<void> => {
  try {
    await iterator.return?.();
  } catch {
    /* Per-client iterator cleanup cannot own host diagnostics. */
  }
};

const relay = async function* <Value>(
  iterable: AsyncIterable<Value>,
  admitted: AdmittedHostOperation,
  signal: AbortSignal,
): AsyncIterable<Value> {
  const iterator = iterable[Symbol.asyncIterator]();
  try {
    for (;;) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Pull one flow-controlled frame at a time.
      const next = await abortable(iterator.next(), signal);
      if (next.done) {
        return;
      }
      signal.throwIfAborted();
      admitted.assertCurrent();
      yield next.value;
    }
  } finally {
    // async-iife: cleanup is request-local and must not delay cancellation on a non-cooperative iterator.
    void closeIterator(iterator);
  }
};

const parseResult = <Value>(schema: WireValidator<Value>, value: unknown): Value => {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error('MACHINE_CHANNEL_INVALID_RESULT');
  }
  return result.data;
};

/** Serve one trusted session's typed machines route.
 * @param input - Trusted channel, admission, authority, directory, providers and host operations.
 * @returns The channel lifecycle handle; disposal never closes host-owned services.
 * @public
 */
export const exposeMachineChannel = (input: {
  readonly port: MachineChannelEndpoint;
  readonly admission: HostAdmissionAuthority;
  readonly session: HostSessionHandle;
  readonly authorityId: string;
  readonly directory: MachineDirectory;
  readonly providers: readonly MachineProvider[];
  readonly operations: MachineChannelHostOperations;
}): ChannelServerHandle<MachineChannelProtocol> => {
  const providers = providerListSchema.parse(input.providers);
  let revocationSignal: AbortSignal | undefined;
  const closeRevokedChannel = (): void => {
    server.dispose('Host session revoked.');
  };
  const admit = (operation: HostAdmissionOperation): AdmittedHostOperation => {
    const admitted = input.admission.admit({
      session: input.session,
      authorityId: input.authorityId,
      workspaceId: machineAdmissionScope,
      route: 'machines',
      operation,
    });
    if (!revocationSignal) {
      revocationSignal = admitted.signal;
      revocationSignal.addEventListener('abort', closeRevokedChannel, { once: true });
    }
    return admitted;
  };
  const server = createChannelServer<MachineChannelProtocol>({
    port: asPort(input.port),
    sessionKey,
    hello: { server: 'machines', protocolVersion: 2 },
    protocolSchemas,
    streamFlowControl,
    impl: {
      // oxlint-disable-next-line eslint/max-params -- Typed ChannelServer call signature is fixed.
      async call(_context, name, args, signal) {
        const admitted = admit(`machines.${name}`);
        const combined = AbortSignal.any([signal, admitted.signal]);
        combined.throwIfAborted();
        if (name === 'listProviders') {
          admitted.assertCurrent();
          return providers;
        }
        if (name === 'list' || name === 'get') {
          const directory = await abortable(input.directory.snapshot(), combined);
          combined.throwIfAborted();
          admitted.assertCurrent();
          if (name === 'list') {
            return directory;
          }
          const { machineId } = args as GetInput;
          const entry = directory.entries.find((candidate) => candidate.machineId === machineId);
          if (!entry) {
            throw new Error('MACHINE_DIRECTORY_UNKNOWN_MACHINE');
          }
          return entry;
        }
        // SAFETY: `name` is one of the host calls, and the channel validated `args` for it.
        // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- tsc cannot index the operations by the generic name.
        const operation = input.operations[name as keyof HostCalls] as (operationInput: unknown) => Promise<unknown>;
        const result = await abortable(operation({ ...args, admitted, signal: combined }), combined);
        combined.throwIfAborted();
        admitted.assertCurrent();
        // SAFETY: the protocol's own result validator for `name` proves the value.
        return parseResult(
          protocolSchemas.calls[name].result,
          result,
        ) as unknown as MachineChannelProtocol['calls'][typeof name]['result'];
      },
      // oxlint-disable-next-line eslint/max-params -- Typed ChannelServer listen signature is fixed.
      async *listen(_context, name, args, signal) {
        const admitted = admit(`machines.${name}`);
        const combined = AbortSignal.any([signal, admitted.signal]);
        if (name === 'discover') {
          yield* relay(
            input.operations.discover({ ...(args as DiscoverInput), admitted, signal: combined }),
            admitted,
            combined,
          );
          return;
        }
        if (name === 'watchJobs') {
          yield* relay(
            input.operations.watchJobs({ ...(args as ListJobsInput), admitted, signal: combined }),
            admitted,
            combined,
          );
          return;
        }
        yield* relay(
          input.directory.watch({ cursor: (args as WatchInput).cursor, signal: combined }),
          admitted,
          combined,
        );
      },
    },
  });
  server.onClose(() => {
    revocationSignal?.removeEventListener('abort', closeRevokedChannel);
  });
  return server;
};

/** Connect the typed machines facet to an authenticated host port.
 * @param port - Host-minted port for one authenticated machine session.
 * @returns The machine client and its channel lifecycle.
 * @public
 */
export const connectMachineChannel = (port: MachineChannelEndpoint): MachineChannelClient => {
  const channel = createChannelClient<MachineChannelProtocol>({
    port: asPort(port),
    sessionKey,
    protocolSchemas,
    streamFlowControl,
  });
  return {
    // The only frame validated before `ready` is the host's hello: one this client refuses is another version.
    ready: (async (): Promise<void> => {
      try {
        await channel.ready;
      } catch (error) {
        if (error !== null && typeof error === 'object' && 'code' in error && error.code === 'WIRE_VALIDATION_FAILED') {
          throw Object.assign(
            new Error('This Tau and the machines host it reached are different versions. Update Tau.', {
              cause: error,
            }),
            { code: 'MACHINE_CHANNEL_VERSION_MISMATCH' },
          );
        }
        throw error;
      }
    })(),
    listProviders: async ({ signal }) => channel.call('listProviders', {}, signal),
    discover: ({ signal, ...input }) => channel.listen('discover', input, signal),
    beginBinding: async ({ signal, ...input }) => channel.call('beginBinding', input, signal),
    removeBinding: async ({ signal, ...input }) => channel.call('removeBinding', input, signal),
    list: async ({ signal }) => channel.call('list', {}, signal),
    get: async ({ signal, machineId }) => channel.call('get', { machineId }, signal),
    watch: ({ signal, cursor }) => channel.listen('watch', cursor ? { cursor } : {}, signal),
    captureStill: async ({ signal, ...input }) => channel.call('captureStill', input, signal),
    checkJob: async ({ signal, ...input }) => channel.call('checkJob', input, signal),
    requestJob: async ({ signal, ...input }) => channel.call('requestJob', input, signal),
    listJobs: async ({ signal, ...input }) => channel.call('listJobs', input, signal),
    watchJobs: ({ signal, ...input }) => channel.listen('watchJobs', input, signal),
    resolveJob: async ({ signal, ...input }) => channel.call('resolveJob', input, signal),
    withdrawJob: async ({ signal, ...input }) => channel.call('withdrawJob', input, signal),
    applyAction: async ({ signal, ...input }) => channel.call('applyAction', input, signal),
    approveAction: async ({ signal, ...input }) => channel.call('approveAction', input, signal),
    stop: async ({ signal, ...input }) => channel.call('stop', input, signal),
    beginHold: async ({ signal, ...input }) => channel.call('beginHold', input, signal),
    renewHold: async (input) => channel.call('renewHold', input),
    endHold: async (input) => channel.call('endHold', input),
    reconcileOperation: async ({ signal, ...input }) => channel.call('reconcileOperation', input, signal),
    setTesting: async ({ signal, ...input }) => channel.call('setTesting', input, signal),
    close: () => {
      channel.close();
    },
  };
};
