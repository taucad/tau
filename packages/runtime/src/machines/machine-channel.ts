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

import { cloneBoundedJson } from '@taucad/parameters/json';
import type {
  AdmittedHostOperation,
  HostAdmissionAuthority,
  HostAdmissionOperation,
  HostSessionHandle,
} from '#host/host-admission.js';
import type {
  MachineBeginBindingInput,
  MachineBindingRemoval,
  MachineCaptureStillClientInput,
  MachineClient,
  MachineDiscoverInput,
  MachineDiscoveryFrame,
  MachineControlRunInput,
  MachineOperationReceipt,
  MachineOperationSnapshot,
  MachinePreparePrintInput,
  MachinePreparedPrint,
  MachineReconcileOperationInput,
  MachineRemoveBindingInput,
  MachineStartPrintInput,
  MachineUploadPrintInput,
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
import { parseMachineProvider } from '#machines/machine.js';
import type { MachineBindingOutcome, MachineProvider, MachineStill } from '#machines/machine.js';
import type {
  MachineListPrintRequestsInput,
  MachineRequestPrintInput,
  MachineResolvePrintRequestInput,
  MachineWatchPrintRequestsInput,
  MachineWithdrawPrintRequestInput,
  PrintRequest,
} from '#machines/print-request.js';

type EmptyInput = Readonly<Record<string, never>>;
type DiscoverInput = Omit<MachineDiscoverInput, 'signal'>;
type BeginBindingInput = Omit<MachineBeginBindingInput, 'signal'>;
type RemoveBindingInput = Omit<MachineRemoveBindingInput, 'signal'>;
type PreparePrintInput = Omit<MachinePreparePrintInput, 'signal'>;
type UploadPrintInput = Omit<MachineUploadPrintInput, 'signal'>;
type StartPrintInput = Omit<MachineStartPrintInput, 'signal'>;
type ReconcileOperationInput = Omit<MachineReconcileOperationInput, 'signal'>;
type ControlRunInput = Omit<MachineControlRunInput, 'signal'>;
type CaptureStillInput = Omit<MachineCaptureStillClientInput, 'signal'>;
type RequestPrintInput = Omit<MachineRequestPrintInput, 'signal'>;
type ListPrintRequestsInput = Omit<MachineListPrintRequestsInput, 'signal'>;
type WatchPrintRequestsInput = Omit<MachineWatchPrintRequestsInput, 'signal'>;
type ResolvePrintRequestInput = Omit<MachineResolvePrintRequestInput, 'signal'>;
type WithdrawPrintRequestInput = Omit<MachineWithdrawPrintRequestInput, 'signal'>;
type GetInput = Readonly<{ machineId: string }>;
type WatchInput = Readonly<{ cursor?: MachineDirectoryCursor }>;

type MachineChannelProtocol = {
  readonly hello: Readonly<{ server: 'machines'; protocolVersion: 1 }>;
  readonly calls: {
    readonly listProviders: { readonly args: EmptyInput; readonly result: readonly MachineProvider[] };
    readonly beginBinding: { readonly args: BeginBindingInput; readonly result: MachineBindingOutcome };
    readonly removeBinding: { readonly args: RemoveBindingInput; readonly result: MachineBindingRemoval };
    readonly preparePrint: { readonly args: PreparePrintInput; readonly result: MachinePreparedPrint };
    readonly uploadPrint: { readonly args: UploadPrintInput; readonly result: MachineOperationReceipt };
    readonly startPrint: { readonly args: StartPrintInput; readonly result: MachineOperationReceipt };
    readonly reconcileOperation: { readonly args: ReconcileOperationInput; readonly result: MachineOperationSnapshot };
    readonly controlRun: { readonly args: ControlRunInput; readonly result: MachineOperationReceipt };
    readonly captureStill: { readonly args: CaptureStillInput; readonly result: MachineStill };
    readonly requestPrint: { readonly args: RequestPrintInput; readonly result: PrintRequest };
    readonly listPrintRequests: { readonly args: ListPrintRequestsInput; readonly result: readonly PrintRequest[] };
    readonly resolvePrintRequest: { readonly args: ResolvePrintRequestInput; readonly result: PrintRequest };
    readonly withdrawPrintRequest: { readonly args: WithdrawPrintRequestInput; readonly result: PrintRequest };
    readonly list: { readonly args: EmptyInput; readonly result: MachineDirectorySnapshot };
    readonly get: { readonly args: GetInput; readonly result: MachineDirectoryEntry };
  };
  readonly notifies: Readonly<Record<never, never>>;
  readonly listens: {
    readonly discover: { readonly args: DiscoverInput; readonly event: MachineDiscoveryFrame };
    readonly watch: { readonly args: WatchInput; readonly event: MachineDirectoryFrame };
    readonly watchPrintRequests: { readonly args: WatchPrintRequestsInput; readonly event: PrintRequest };
  };
};

type Admitted = Readonly<{ admitted: AdmittedHostOperation; signal: AbortSignal }>;

/**
 * Host-owned machine work invoked only after route admission. Every operation is
 * required; a host that cannot serve one throws `MACHINE_OPERATION_UNAVAILABLE`.
 * @public
 */
export type MachineChannelHostOperations = Readonly<{
  discover(input: DiscoverInput & Admitted): AsyncIterable<MachineDiscoveryFrame>;
  beginBinding(input: BeginBindingInput & Admitted): Promise<MachineBindingOutcome>;
  removeBinding(input: RemoveBindingInput & Admitted): Promise<MachineBindingRemoval>;
  preparePrint(input: PreparePrintInput & Admitted): Promise<MachinePreparedPrint>;
  uploadPrint(input: UploadPrintInput & Admitted): Promise<MachineOperationReceipt>;
  startPrint(input: StartPrintInput & Admitted): Promise<MachineOperationReceipt>;
  reconcileOperation(input: ReconcileOperationInput & Admitted): Promise<MachineOperationSnapshot>;
  controlRun(input: ControlRunInput & Admitted): Promise<MachineOperationReceipt>;
  captureStill(input: CaptureStillInput & Admitted): Promise<MachineStill>;
  requestPrint(input: RequestPrintInput & Admitted): Promise<PrintRequest>;
  listPrintRequests(input: ListPrintRequestsInput & Admitted): Promise<readonly PrintRequest[]>;
  watchPrintRequests(input: WatchPrintRequestsInput & Admitted): AsyncIterable<PrintRequest>;
  resolvePrintRequest(input: ResolvePrintRequestInput & Admitted): Promise<PrintRequest>;
  withdrawPrintRequest(input: WithdrawPrintRequestInput & Admitted): Promise<PrintRequest>;
}>;

/** Direct machines channel plus its explicit wire lifecycle. @public */
export type MachineChannelClient = MachineClient & Readonly<{ ready: Promise<void>; close(): void }>;

/** Supported structured and byte-framed transports for one machine channel. @public */
export type MachineChannelEndpoint = Port<unknown> | MessagePortLike | WebSocketLike;

const sessionKey = 'machines-v1';
const streamFlowControl = { initialCredits: 1, maxFrameBytes: 1_048_576, maxOwnedBytes: 1_048_576 } as const;
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
const preparedPrintSchema = z.strictObject({
  preparedId: identitySchema,
  preparedDigest: digestSchema,
  configurationDigest: digestSchema,
  providerDataDigest: digestSchema,
  setupDigest: digestSchema,
  machineId: identitySchema,
  physicalMachineId: identitySchema,
  artifact: artifactSchema,
  remoteName: identitySchema,
  parser: z.strictObject({ id: identitySchema, version: identitySchema }),
  preparedAt: timestampSchema,
  expiresAt: timestampSchema,
});
const runOperationKindSchema = z.enum(['cancel', 'pause', 'resume', 'start', 'urgent-stop']);
const operationKindSchema = z.enum(['cancel', 'pause', 'resume', 'start', 'urgent-stop', 'upload']);
const operationBaseSchema = {
  operationId: identitySchema,
  machineId: identitySchema,
  observedAt: timestampSchema,
};
const operationReceiptSchema = z.union([
  z.strictObject({
    ...operationBaseSchema,
    kind: z.literal('upload'),
    status: z.literal('accepted'),
    evidence: z.strictObject({ transferId: identitySchema }),
  }),
  z.strictObject({
    ...operationBaseSchema,
    kind: runOperationKindSchema,
    status: z.literal('accepted'),
    providerRunId: identitySchema.optional(),
  }),
  z.strictObject({
    ...operationBaseSchema,
    kind: operationKindSchema,
    status: z.literal('rejected'),
    code: identitySchema,
    message: textSchema,
  }),
  z.strictObject({
    ...operationBaseSchema,
    kind: operationKindSchema,
    status: z.literal('unknown'),
    reason: identitySchema,
    providerRunId: identitySchema.optional(),
  }),
]);
const operationSnapshotSchema = z.strictObject({
  operationId: identitySchema,
  machineId: identitySchema,
  kind: operationKindSchema,
  inputDigest: digestSchema,
  status: z.enum(['accepted', 'planned', 'rejected', 'sending', 'unknown']),
  updatedAt: timestampSchema,
  receipt: operationReceiptSchema.optional(),
});
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
const configurationSchema = z.unknown().transform((value) => cloneBoundedJson(value, limits));
const requesterSchema = z.strictObject({ kind: z.enum(['user', 'agent']), id: identitySchema, label: identitySchema });
const requestSummarySchema = z.strictObject({
  fileName: identitySchema,
  layers: z.number().int().nonnegative().optional(),
  estimatedDuration: z.number().nonnegative().optional(),
  filamentLength: z.number().nonnegative().optional(),
  producer: z.strictObject({ name: identitySchema, version: identitySchema.optional() }).optional(),
});
const printRequestSchema = z.strictObject({
  requestId: identitySchema,
  machineId: identitySchema,
  artifact: artifactSchema,
  configuration: configurationSchema,
  requestedBy: requesterSchema,
  summary: requestSummarySchema,
  state: z.enum([
    'preparing',
    'awaiting-approval',
    'approved',
    'uploading',
    'starting',
    'started',
    'denied',
    'withdrawn',
    'rejected',
    'unknown',
    'failed',
  ]),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  prepared: preparedPrintSchema.optional(),
  uploadOperationId: identitySchema.optional(),
  startOperationId: identitySchema.optional(),
  transferId: identitySchema.optional(),
  receipt: operationReceiptSchema.optional(),
  failure: z.strictObject({ code: identitySchema, message: textSchema }).optional(),
  resolvedBy: requesterSchema.optional(),
});
const requestScopeSchema = z.strictObject({
  machineId: identitySchema.optional(),
  projectId: projectIdSchema.optional(),
});

/**
 * The one admission scope every machines session is issued and admitted under. Printers belong to the store, not to
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

/** Admit one bounded print request record for the wire or the machine store. @internal
 * @param value - Untrusted record value.
 * @returns Detached, frozen record.
 */
export const parsePrintRequest = (value: unknown): PrintRequest => freeze(printRequestSchema.parse(value));

/** Admit one bounded prepared-print record for the wire or the machine store. @internal
 * @param value - Untrusted record value.
 * @returns Detached, frozen record.
 */
export const parseMachinePreparedPrint = (value: unknown): MachinePreparedPrint =>
  freeze(preparedPrintSchema.parse(value));

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
  hello: z.strictObject({ server: z.literal('machines'), protocolVersion: z.literal(1) }),
  calls: {
    listProviders: { args: emptySchema, result: providerListSchema },
    beginBinding: {
      args: z.strictObject({ candidate: candidateSchema, name: identitySchema }),
      result: bindingOutcomeSchema,
    },
    removeBinding: {
      args: z.strictObject({ machineId: identitySchema }),
      result: bindingRemovalSchema,
    },
    preparePrint: {
      args: z.strictObject({ machineId: identitySchema, artifact: artifactSchema, configuration: configurationSchema }),
      result: preparedPrintSchema,
    },
    uploadPrint: {
      args: z.strictObject({
        machineId: identitySchema,
        preparedId: identitySchema,
        preparedDigest: digestSchema,
        operationId: identitySchema,
      }),
      result: operationReceiptSchema,
    },
    startPrint: {
      args: z.strictObject({
        machineId: identitySchema,
        preparedId: identitySchema,
        preparedDigest: digestSchema,
        transferId: identitySchema,
        expectedSetupDigest: digestSchema,
        operationId: identitySchema,
      }),
      result: operationReceiptSchema,
    },
    reconcileOperation: {
      args: z.strictObject({ machineId: identitySchema, operationId: identitySchema }),
      result: operationSnapshotSchema,
    },
    controlRun: {
      args: z.strictObject({
        machineId: identitySchema,
        operationId: identitySchema,
        command: z.enum(['cancel', 'pause', 'resume', 'urgent-stop']),
        expectedProviderRunId: identitySchema,
      }),
      result: operationReceiptSchema,
    },
    captureStill: {
      args: z.strictObject({ machineId: identitySchema }),
      result: stillSchema,
    },
    requestPrint: {
      args: z.strictObject({
        requestId: identitySchema,
        machineId: identitySchema,
        artifact: artifactSchema,
        configuration: configurationSchema,
        requestedBy: requesterSchema,
        summary: requestSummarySchema.optional(),
      }),
      result: printRequestSchema,
    },
    listPrintRequests: {
      args: requestScopeSchema,
      result: z.array(printRequestSchema).max(1024),
    },
    resolvePrintRequest: {
      args: z.strictObject({
        requestId: identitySchema,
        decision: z.enum(['approve', 'deny']),
        resolvedBy: requesterSchema,
        uploadOperationId: identitySchema.optional(),
        startOperationId: identitySchema.optional(),
      }),
      result: printRequestSchema,
    },
    withdrawPrintRequest: {
      args: z.strictObject({ requestId: identitySchema, resolvedBy: requesterSchema }),
      result: printRequestSchema,
    },
    list: { args: emptySchema, result: validator(parseMachineDirectorySnapshot) },
    get: {
      args: z.strictObject({ machineId: identitySchema }),
      result: validator(parseMachineDirectoryEntry),
    },
  },
  notifies: {},
  listens: {
    discover: {
      args: z.strictObject({ providerId: identitySchema, configuration: configurationSchema }),
      event: discoveryFrameSchema.transform(freeze),
    },
    watch: {
      args: z.strictObject({ cursor: cursorSchema.optional() }),
      event: validator(parseMachineDirectoryFrame),
    },
    watchPrintRequests: {
      args: requestScopeSchema,
      event: printRequestSchema.transform(freeze),
    },
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
    hello: { server: 'machines', protocolVersion: 1 },
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
        const scope: Admitted = { admitted, signal: combined };
        const settle = async <Value>(pending: Promise<Value>, parse: (value: Value) => Value): Promise<Value> => {
          const result = await abortable(pending, combined);
          combined.throwIfAborted();
          admitted.assertCurrent();
          return parse(result);
        };
        const { operations } = input;
        switch (name) {
          case 'beginBinding': {
            return settle(operations.beginBinding({ ...(args as BeginBindingInput), ...scope }), (value) =>
              bindingOutcomeSchema.parse(value),
            );
          }
          case 'removeBinding': {
            return settle(operations.removeBinding({ ...(args as RemoveBindingInput), ...scope }), (value) =>
              bindingRemovalSchema.parse(value),
            );
          }
          case 'preparePrint': {
            return settle(operations.preparePrint({ ...(args as PreparePrintInput), ...scope }), (value) =>
              preparedPrintSchema.parse(value),
            );
          }
          case 'uploadPrint': {
            return settle(operations.uploadPrint({ ...(args as UploadPrintInput), ...scope }), (value) =>
              operationReceiptSchema.parse(value),
            );
          }
          case 'startPrint': {
            return settle(operations.startPrint({ ...(args as StartPrintInput), ...scope }), (value) =>
              operationReceiptSchema.parse(value),
            );
          }
          case 'reconcileOperation': {
            return settle(operations.reconcileOperation({ ...(args as ReconcileOperationInput), ...scope }), (value) =>
              operationSnapshotSchema.parse(value),
            );
          }
          case 'controlRun': {
            return settle(operations.controlRun({ ...(args as ControlRunInput), ...scope }), (value) =>
              operationReceiptSchema.parse(value),
            );
          }
          case 'captureStill': {
            return settle(operations.captureStill({ ...(args as CaptureStillInput), ...scope }), (value) =>
              stillSchema.parse(value),
            );
          }
          case 'requestPrint': {
            return settle(operations.requestPrint({ ...(args as RequestPrintInput), ...scope }), parsePrintRequest);
          }
          case 'listPrintRequests': {
            return settle(operations.listPrintRequests({ ...(args as ListPrintRequestsInput), ...scope }), (value) =>
              value.map((request) => parsePrintRequest(request)),
            );
          }
          case 'resolvePrintRequest': {
            return settle(
              operations.resolvePrintRequest({ ...(args as ResolvePrintRequestInput), ...scope }),
              parsePrintRequest,
            );
          }
          default: {
            return settle(
              operations.withdrawPrintRequest({ ...(args as WithdrawPrintRequestInput), ...scope }),
              parsePrintRequest,
            );
          }
        }
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
        if (name === 'watchPrintRequests') {
          yield* relay(
            input.operations.watchPrintRequests({ ...(args as WatchPrintRequestsInput), admitted, signal: combined }),
            admitted,
            combined,
          );
          return;
        }
        yield* relay(
          input.directory.watch({
            cursor: (args as WatchInput).cursor,
            signal: combined,
          }),
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
    ready: channel.ready,
    listProviders: async ({ signal }) => channel.call('listProviders', {}, signal),
    discover: ({ signal, ...input }) => channel.listen('discover', input, signal),
    beginBinding: async ({ signal, ...input }) => channel.call('beginBinding', input, signal),
    removeBinding: async ({ signal, ...input }) => channel.call('removeBinding', input, signal),
    preparePrint: async ({ signal, ...input }) => channel.call('preparePrint', input, signal),
    uploadPrint: async ({ signal, ...input }) => channel.call('uploadPrint', input, signal),
    startPrint: async ({ signal, ...input }) => channel.call('startPrint', input, signal),
    reconcileOperation: async ({ signal, ...input }) => channel.call('reconcileOperation', input, signal),
    controlRun: async ({ signal, ...input }) => channel.call('controlRun', input, signal),
    captureStill: async ({ signal, ...input }) => channel.call('captureStill', input, signal),
    requestPrint: async ({ signal, ...input }) => channel.call('requestPrint', input, signal),
    listPrintRequests: async ({ signal, ...input }) => channel.call('listPrintRequests', input, signal),
    watchPrintRequests: ({ signal, ...input }) => channel.listen('watchPrintRequests', input, signal),
    resolvePrintRequest: async ({ signal, ...input }) => channel.call('resolvePrintRequest', input, signal),
    withdrawPrintRequest: async ({ signal, ...input }) => channel.call('withdrawPrintRequest', input, signal),
    list: async ({ signal }) => channel.call('list', {}, signal),
    get: async ({ signal, machineId }) => channel.call('get', { machineId }, signal),
    watch: ({ signal, cursor }) => channel.listen('watch', cursor ? { cursor } : {}, signal),
    close: () => {
      channel.close();
    },
  };
};
