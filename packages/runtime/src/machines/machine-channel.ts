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
import { z } from 'zod';

import { cloneBoundedJson } from '#configuration/bounded-json.js';
import type {
  AdmittedHostOperation,
  HostAdmissionAuthority,
  HostAdmissionOperation,
  HostSessionHandle,
} from '#host/host-admission.js';
import type {
  MachineBeginBindingInput,
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
  MachineStartPrintInput,
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
import type {
  MachineArtifactReference,
  MachineBindingOutcome,
  MachineProvider,
  MachineStill,
} from '#machines/machine.js';

type EmptyInput = Readonly<Record<string, never>>;
type DiscoverInput = Omit<MachineDiscoverInput, 'signal'>;
type BeginBindingInput = Omit<MachineBeginBindingInput, 'signal'>;
type PreparePrintInput = Omit<MachinePreparePrintInput, 'signal'>;
type StartPrintInput = Omit<MachineStartPrintInput, 'signal'>;
type ReconcileOperationInput = Omit<MachineReconcileOperationInput, 'signal'>;
type ControlRunInput = Omit<MachineControlRunInput, 'signal'>;
type CaptureStillInput = Omit<MachineCaptureStillClientInput, 'signal'>;
type GetInput = Readonly<{ machineId: string }>;
type WatchInput = Readonly<{ cursor?: MachineDirectoryCursor }>;

type MachineChannelProtocol = {
  readonly hello: Readonly<{ server: 'machines'; protocolVersion: 1 }>;
  readonly calls: {
    readonly listProviders: { readonly args: EmptyInput; readonly result: readonly MachineProvider[] };
    readonly beginBinding: { readonly args: BeginBindingInput; readonly result: MachineBindingOutcome };
    readonly preparePrint: { readonly args: PreparePrintInput; readonly result: MachinePreparedPrint };
    readonly startPrint: { readonly args: StartPrintInput; readonly result: MachineOperationReceipt };
    readonly reconcileOperation: { readonly args: ReconcileOperationInput; readonly result: MachineOperationSnapshot };
    readonly controlRun: { readonly args: ControlRunInput; readonly result: MachineOperationReceipt };
    readonly captureStill: { readonly args: CaptureStillInput; readonly result: MachineStill };
    readonly list: { readonly args: EmptyInput; readonly result: MachineDirectorySnapshot };
    readonly get: { readonly args: GetInput; readonly result: MachineDirectoryEntry };
  };
  readonly notifies: Readonly<Record<never, never>>;
  readonly listens: {
    readonly discover: { readonly args: DiscoverInput; readonly event: MachineDiscoveryFrame };
    readonly watch: { readonly args: WatchInput; readonly event: MachineDirectoryFrame };
  };
};

/** Host-owned discovery and binding work invoked only after route admission. @public */
export type MachineChannelHostOperations = Readonly<{
  discover(
    input: DiscoverInput & Readonly<{ admitted: AdmittedHostOperation; signal: AbortSignal }>,
  ): AsyncIterable<MachineDiscoveryFrame>;
  beginBinding(
    input: BeginBindingInput & Readonly<{ admitted: AdmittedHostOperation; signal: AbortSignal }>,
  ): Promise<MachineBindingOutcome>;
  preparePrint?(
    input: PreparePrintInput & Readonly<{ admitted: AdmittedHostOperation; signal: AbortSignal }>,
  ): Promise<MachinePreparedPrint>;
  startPrint?(
    input: StartPrintInput & Readonly<{ admitted: AdmittedHostOperation; signal: AbortSignal }>,
  ): Promise<MachineOperationReceipt>;
  reconcileOperation?(
    input: ReconcileOperationInput & Readonly<{ admitted: AdmittedHostOperation; signal: AbortSignal }>,
  ): Promise<MachineOperationSnapshot>;
  controlRun?(
    input: ControlRunInput & Readonly<{ admitted: AdmittedHostOperation; signal: AbortSignal }>,
  ): Promise<MachineOperationReceipt>;
  captureStill?(
    input: CaptureStillInput & Readonly<{ admitted: AdmittedHostOperation; signal: AbortSignal }>,
  ): Promise<MachineStill>;
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
const timestampSchema = z.iso.datetime({ offset: true });
const candidateSchema = z.strictObject({
  id: identitySchema,
  name: identitySchema,
  endpoint: z.strictObject({ address: identitySchema, interface: identitySchema }),
  claimedIdentity: z.strictObject({ serial: identitySchema.optional(), model: identitySchema.optional() }),
  observedAt: timestampSchema,
  expiresAt: timestampSchema,
});
const discoveryFrameSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.enum(['found', 'updated']), candidate: candidateSchema }),
  z.strictObject({ type: z.literal('lost'), candidateId: identitySchema, observedAt: timestampSchema }),
]);
const bindingOutcomeSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('bound'), machineId: identitySchema }),
  z.strictObject({ status: z.literal('operator-action-required'), ceremonyId: identitySchema }),
]);
const digestSchema = z.custom<ContentDigest>(
  (value) => typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value),
);
const revisionIdSchema = z.custom<MachineArtifactReference['revision']['revisionId']>(
  (value) => typeof value === 'string' && value.length > 0 && value.length <= 256 && value.isWellFormed(),
);
const artifactSchema = z.strictObject({
  revision: z.strictObject({
    authorityId: identitySchema,
    workspaceId: identitySchema,
    revisionId: revisionIdSchema,
    treeDigest: digestSchema,
  }),
  path: identitySchema,
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
const operationKindSchema = z.enum(['cancel', 'pause', 'resume', 'start', 'urgent-stop']);
const operationBaseSchema = {
  operationId: identitySchema,
  machineId: identitySchema,
  kind: operationKindSchema,
  observedAt: timestampSchema,
};
const operationReceiptSchema = z.discriminatedUnion('status', [
  z.strictObject({ ...operationBaseSchema, status: z.literal('accepted'), providerRunId: identitySchema.optional() }),
  z.strictObject({
    ...operationBaseSchema,
    status: z.literal('rejected'),
    code: identitySchema,
    message: z
      .string()
      .min(1)
      .max(1024)
      .refine((value) => value.isWellFormed()),
  }),
  z.strictObject({
    ...operationBaseSchema,
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

const freeze = <Value>(value: Value): Value => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      freeze(child);
    }
    Object.freeze(value);
  }
  return value;
};

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
    preparePrint: {
      args: z.strictObject({ machineId: identitySchema, artifact: artifactSchema, configuration: configurationSchema }),
      result: preparedPrintSchema,
    },
    startPrint: {
      args: z.strictObject({
        machineId: identitySchema,
        preparedId: identitySchema,
        preparedDigest: digestSchema,
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
 * @param input - Trusted channel, admission, scope, directory, providers, discovery and binding operations.
 * @returns The channel lifecycle handle; disposal never closes host-owned services.
 * @public
 */
export const exposeMachineChannel = (input: {
  readonly port: MachineChannelEndpoint;
  readonly admission: HostAdmissionAuthority;
  readonly session: HostSessionHandle;
  readonly authorityId: string;
  readonly workspaceId: string;
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
      workspaceId: input.workspaceId,
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
        if (name === 'beginBinding') {
          const result = await abortable(
            input.operations.beginBinding({ ...(args as BeginBindingInput), admitted, signal: combined }),
            combined,
          );
          combined.throwIfAborted();
          admitted.assertCurrent();
          return bindingOutcomeSchema.parse(result);
        }
        if (name === 'preparePrint') {
          if (!input.operations.preparePrint) {
            throw new Error('MACHINE_PREPARATION_UNAVAILABLE');
          }
          const result = await abortable(
            input.operations.preparePrint({ ...(args as PreparePrintInput), admitted, signal: combined }),
            combined,
          );
          combined.throwIfAborted();
          admitted.assertCurrent();
          return preparedPrintSchema.parse(result);
        }
        if (name === 'startPrint') {
          if (!input.operations.startPrint) {
            throw new Error('MACHINE_START_UNAVAILABLE');
          }
          const result = await abortable(
            input.operations.startPrint({ ...(args as StartPrintInput), admitted, signal: combined }),
            combined,
          );
          combined.throwIfAborted();
          admitted.assertCurrent();
          return operationReceiptSchema.parse(result);
        }
        if (name === 'reconcileOperation') {
          if (!input.operations.reconcileOperation) {
            throw new Error('MACHINE_RECONCILIATION_UNAVAILABLE');
          }
          const result = await abortable(
            input.operations.reconcileOperation({ ...(args as ReconcileOperationInput), admitted, signal: combined }),
            combined,
          );
          combined.throwIfAborted();
          admitted.assertCurrent();
          return operationSnapshotSchema.parse(result);
        }
        if (name === 'controlRun') {
          if (!input.operations.controlRun) {
            throw new Error('MACHINE_CONTROL_UNAVAILABLE');
          }
          const result = await abortable(
            input.operations.controlRun({ ...(args as ControlRunInput), admitted, signal: combined }),
            combined,
          );
          combined.throwIfAborted();
          admitted.assertCurrent();
          return operationReceiptSchema.parse(result);
        }
        if (name === 'captureStill') {
          if (!input.operations.captureStill) {
            throw new Error('MACHINE_STILL_UNAVAILABLE');
          }
          const result = await abortable(
            input.operations.captureStill({ ...(args as CaptureStillInput), admitted, signal: combined }),
            combined,
          );
          combined.throwIfAborted();
          admitted.assertCurrent();
          return stillSchema.parse(result);
        }
        const directory = await abortable(input.directory.snapshot({ workspaceId: admitted.workspaceId }), combined);
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
        yield* relay(
          input.directory.watch({
            workspaceId: admitted.workspaceId,
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
    preparePrint: async ({ signal, ...input }) => channel.call('preparePrint', input, signal),
    startPrint: async ({ signal, ...input }) => channel.call('startPrint', input, signal),
    reconcileOperation: async ({ signal, ...input }) => channel.call('reconcileOperation', input, signal),
    controlRun: async ({ signal, ...input }) => channel.call('controlRun', input, signal),
    captureStill: async ({ signal, ...input }) => channel.call('captureStill', input, signal),
    list: async ({ signal }) => channel.call('list', {}, signal),
    get: async ({ signal, machineId }) => channel.call('get', { machineId }, signal),
    watch: ({ signal, cursor }) => channel.listen('watch', cursor ? { cursor } : {}, signal),
    close: () => {
      channel.close();
    },
  };
};
