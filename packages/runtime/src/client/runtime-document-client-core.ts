/** Document-first runtime client. The transport owns the worker, filesystem, and binary delivery. */
import type { ParameterResolutionOptions } from '@taucad/parameters';
import { Topic } from '@taucad/events';
import type { ExportFile, LogEntry } from '@taucad/types';
import { randomUuid } from '@taucad/utils/id';
import type { MachineClient } from '#machines/machine-client.js';
import type {
  CollectTranscodeRoutes,
  KernelPlugin,
  MiddlewarePlugin,
  TranscoderPlugin,
  KnownTargetFormats,
} from '#plugins/plugin-types.js';
import type {
  RuntimeTransportClient,
  RuntimeTransportFacet,
  TransportPlugin,
} from '#transport/runtime-transport.types.js';
import type { TransportDescriptor } from '#transport/runtime-transport-descriptor.types.js';
import type { RuntimeFromTransport } from '#transport/transport-projections.js';
import type {
  AnyRuntimeDefinition,
  ConfiguredRuntimeDefinition,
  RuntimeConfigInput,
  RuntimeConfigProvider,
  RuntimeKernels,
  RuntimeMiddleware,
  RuntimeTranscoders,
} from '#worker/runtime-definition.js';
import type { OpenInput, RuntimeDocument, Description } from '#client/runtime-document.types.js';
import type { RuntimeSource, RuntimeSourceFiles } from '#client/runtime-document-source.js';
import { normalizeRuntimeSource, withStagedFiles } from '#client/runtime-document-source.js';
import { RuntimeDocumentSessionClient } from '#client/runtime-document-session.js';
import { RuntimeTerminatedError } from '#client/runtime-terminated-error.js';
import { openDeferredDocument } from '#client/runtime-document-deferred.js';
import type { RuntimeDocumentProtocol } from '#types/runtime-document-protocol.types.js';
import { validateProtocolHeader } from '#types/protocol-header.types.js';
import type {
  CapabilitiesManifest,
  ExportRoute,
  KernelIssue,
  RuntimeCapabilities,
  ExportGeometryResult,
} from '#types/runtime.types.js';
import type { RuntimeContentInput } from '#types/runtime-content.types.js';
import type { RuntimeSourceSnapshotResult } from '#types/runtime-source-snapshot.types.js';
import type { RuntimeTranscodeArgs, TelemetryBatch } from '#types/runtime-protocol.types.js';
import { OperationAbortedError, OperationTimeoutError } from '#framework/runtime-operation-errors.js';
import { renderTimeoutRecoveryGrace } from '#framework/runtime-framework.constants.js';

// oxlint-disable @typescript-eslint/no-explicit-any -- Transport and plugin existential carriers retain concrete tuples at the public overload.
type AnyTransportPlugin = TransportPlugin<RuntimeDocumentProtocol, any, any, any>;
type TransportId<T> = T extends TransportPlugin<any, any, infer Id, any> ? Id : string;
type ClientKernels<R> = [AnyRuntimeDefinition] extends [R]
  ? readonly KernelPlugin[]
  : RuntimeKernels<R> extends readonly KernelPlugin[]
    ? RuntimeKernels<R>
    : readonly KernelPlugin[];
type ClientMiddleware<R> = [AnyRuntimeDefinition] extends [R]
  ? readonly MiddlewarePlugin[]
  : RuntimeMiddleware<R> extends readonly MiddlewarePlugin[]
    ? RuntimeMiddleware<R>
    : readonly MiddlewarePlugin[];
type ClientTranscoders<R> = [AnyRuntimeDefinition] extends [R]
  ? readonly TranscoderPlugin[]
  : RuntimeTranscoders<R> extends readonly TranscoderPlugin[]
    ? RuntimeTranscoders<R>
    : readonly TranscoderPlugin[];
type RuntimeTranscodeInput<Transcoders extends readonly TranscoderPlugin[]> =
  CollectTranscodeRoutes<Transcoders> extends infer Route
    ? Route extends { readonly from: infer From; readonly to: infer To; readonly options: infer Options }
      ? {
          readonly from: Extract<From, string>;
          readonly to: Extract<To, string>;
          readonly files: ExportFile[];
          readonly options: Options;
          readonly signal?: AbortSignal;
        }
      : never
    : never;
// oxlint-enable @typescript-eslint/no-explicit-any

type RuntimeForClient<Runtime, Transport extends AnyTransportPlugin> = Runtime extends AnyRuntimeDefinition
  ? Runtime
  : RuntimeFromTransport<Transport>;
const consumeRejection = async (promise: Promise<unknown>): Promise<void> => {
  try {
    await promise;
  } catch {
    /* The public waiter owns this rejection. */
  }
};
// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- existential configured-runtime test retains generic wrapper assignability.
type RuntimeConfigOption<R> = [R] extends [ConfiguredRuntimeDefinition<any, any>]
  ? undefined extends RuntimeConfigInput<R>
    ? { readonly config?: RuntimeConfigProvider<R> }
    : { readonly config: RuntimeConfigProvider<R> }
  : { readonly config?: never };
type ClientEventHandlers<
  Kernels extends readonly KernelPlugin[],
  Middleware extends readonly MiddlewarePlugin[],
  Transcoders extends readonly TranscoderPlugin[],
> = {
  capabilities: (manifest: CapabilitiesManifest<Kernels, Middleware, Transcoders>) => void;
  state: (state: 'idle' | 'busy' | 'error', detail?: string) => void;
  log: (entry: LogEntry) => void;
  telemetry: (batch: TelemetryBatch) => void;
  error: (issues: readonly KernelIssue[]) => void;
};

/** Options for one document client. @public */
export type RuntimeClientOptionsWithTransport<
  Runtime extends AnyRuntimeDefinition | undefined = undefined,
  Transport extends AnyTransportPlugin = AnyTransportPlugin,
> = { readonly transport: Transport; readonly operationTimeout?: number } & RuntimeConfigOption<
  RuntimeForClient<Runtime, Transport>
>;
/** Runtime client options, including the selected transport. @public */
export type RuntimeClientOptions<
  Runtime extends AnyRuntimeDefinition | undefined = undefined,
  Transport extends AnyTransportPlugin = AnyTransportPlugin,
> = RuntimeClientOptionsWithTransport<Runtime, Transport>;
/** A runtime client lifecycle state. @public */
export type RuntimeLifecycleState = 'unconnected' | 'connecting' | 'connected' | 'terminated';

const waitWithAbort = async <T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> => {
  if (!signal) {
    return promise;
  }
  if (signal.aborted) {
    throw new OperationAbortedError();
  }
  const aborted = Promise.withResolvers<never>();
  const onAbort = (): void => {
    aborted.reject(new OperationAbortedError());
  };
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    return await Promise.race([promise, aborted.promise]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
};

/** Public document client; each open document owns its view subscriptions and export pin. @public */
export type RuntimeClient<
  Runtime extends AnyRuntimeDefinition = AnyRuntimeDefinition,
  Transport extends AnyTransportPlugin = AnyTransportPlugin,
> = Readonly<{
  machines: RuntimeTransportFacet<MachineClient>;
  jobs: RuntimeTransportFacet<never>;
  transport: { id: TransportId<Transport>; descriptor: TransportDescriptor<TransportId<Transport>> };
  capabilities:
    | RuntimeCapabilities<ClientKernels<Runtime>, ClientMiddleware<Runtime>, ClientTranscoders<Runtime>>
    | undefined;
  lifecycleState: RuntimeLifecycleState;
  connect(): Promise<void>;
  open<const Files extends RuntimeSourceFiles = RuntimeSourceFiles>(
    input: OpenInput<Files, ClientKernels<Runtime>>,
  ): RuntimeDocument<ClientKernels<Runtime>, ClientMiddleware<Runtime>, ClientTranscoders<Runtime>>;
  describe<const Files extends RuntimeSourceFiles = RuntimeSourceFiles>(input: {
    source: RuntimeSource<Files>;
    resolution?: ParameterResolutionOptions;
    signal?: AbortSignal;
  }): Promise<Description>;
  setOperationTimeout(milliseconds: number): void;
  setTranscodeTimeout(milliseconds: number): void;
  routesFor<const Format extends string>(
    format: Format,
  ): ReadonlyArray<
    ExportRoute<
      ClientKernels<Runtime>,
      ClientMiddleware<Runtime>,
      ClientTranscoders<Runtime>,
      Format & KnownTargetFormats<ClientKernels<Runtime>, ClientTranscoders<Runtime>>
    >
  >;
  bestRouteFor<const Format extends string>(
    format: Format,
    options?: { kernelId?: string; content?: RuntimeContentInput },
  ):
    | ExportRoute<
        ClientKernels<Runtime>,
        ClientMiddleware<Runtime>,
        ClientTranscoders<Runtime>,
        Format & KnownTargetFormats<ClientKernels<Runtime>, ClientTranscoders<Runtime>>
      >
    | undefined;
  snapshotSource<const Files extends RuntimeSourceFiles = RuntimeSourceFiles>(input: {
    source: RuntimeSource<Files>;
    additionalPaths?: ReadonlyArray<{ path: string; required: boolean }>;
    signal?: AbortSignal;
  }): Promise<RuntimeSourceSnapshotResult>;
  transcode(input: RuntimeTranscodeInput<ClientTranscoders<Runtime>>): Promise<ExportGeometryResult>;
  on<
    const Event extends keyof ClientEventHandlers<
      ClientKernels<Runtime>,
      ClientMiddleware<Runtime>,
      ClientTranscoders<Runtime>
    >,
  >(
    event: Event,
    handler: ClientEventHandlers<ClientKernels<Runtime>, ClientMiddleware<Runtime>, ClientTranscoders<Runtime>>[Event],
    options?: { signal?: AbortSignal },
  ): () => void;
  terminate(): void;
  shutdown(): Promise<void>;
}>;

/** Construct a typed client from a worker-owning or remote transport. @public */
export function createRuntimeClient<
  const Runtime extends AnyRuntimeDefinition | undefined = undefined,
  const Transport extends AnyTransportPlugin = AnyTransportPlugin,
>(
  options: RuntimeClientOptionsWithTransport<Runtime, Transport>,
): RuntimeClient<
  RuntimeForClient<Runtime, Transport> extends AnyRuntimeDefinition
    ? RuntimeForClient<Runtime, Transport>
    : AnyRuntimeDefinition,
  Transport
>;
/** Construct a document client from a typed transport.
 * @param options - Transport and optional runtime configuration.
 * @returns A document client whose types follow the transport's runtime.
 * @public
 */
export function createRuntimeClient(options: {
  readonly transport: AnyTransportPlugin;
  readonly operationTimeout?: number;
  readonly config?: unknown;
}): RuntimeClient {
  if (!Object.hasOwn(options, 'transport')) {
    throw new TypeError('createRuntimeClient: `transport` is required.');
  }
  const transport: RuntimeTransportClient = options.transport.materialize();
  const machines: RuntimeTransportFacet<MachineClient> = transport.machines ?? {
    available: false,
    reason: 'unsupported',
  };
  const jobs: RuntimeTransportFacet<never> = { available: false, reason: 'unsupported' };
  const topics = {
    capabilities: new Topic<CapabilitiesManifest>(),
    state: new Topic<{ state: 'idle' | 'busy' | 'error'; detail?: string }>(),
    log: new Topic<LogEntry>(),
    telemetry: new Topic<TelemetryBatch>(),
    error: new Topic<readonly KernelIssue[]>(),
  };
  let capabilities: CapabilitiesManifest | undefined;
  let lifecycleState: RuntimeLifecycleState = 'unconnected';
  let connectPromise: Promise<void> | undefined;
  const terminated = Promise.withResolvers<never>();
  void consumeRejection(terminated.promise);
  let session: RuntimeDocumentSessionClient | undefined;
  let activeTimeout = options.operationTimeout ?? 0;
  let transcodeTimeout = 60_000;
  const recoveryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const clearRecovery = (operationId?: string): void => {
    if (operationId !== undefined) {
      const timer = recoveryTimers.get(operationId);
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      recoveryTimers.delete(operationId);
      return;
    }
    for (const timer of recoveryTimers.values()) {
      clearTimeout(timer);
    }
    recoveryTimers.clear();
  };
  const clearRecoveryWhenSettled = async (promise: Promise<unknown>, operationId: string): Promise<void> => {
    try {
      await promise;
    } catch {
      /* The public call observes the rejection. */
    } finally {
      clearRecovery(operationId);
    }
  };
  const onTimeout = (operationId: string): void => {
    const recovery = transport.renderTimeoutRecovery;
    if (recovery.kind !== 'terminable' || recoveryTimers.has(operationId)) {
      return;
    }
    const timer = setTimeout(() => {
      recoveryTimers.delete(operationId);
      void recovery.terminate();
    }, renderTimeoutRecoveryGrace);
    recoveryTimers.set(operationId, timer);
  };
  const currentLifecycle = (): RuntimeLifecycleState => lifecycleState;
  const validateTimeout = (milliseconds: number): void => {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) {
      throw new TypeError('Operation timeout must be a finite nonnegative number.');
    }
    if (milliseconds > 0 && transport.renderTimeoutRecovery.kind === 'unsupported') {
      throw new TypeError('This transport cannot enforce a wall-clock operation deadline.');
    }
  };
  validateTimeout(activeTimeout);
  const connect = async (): Promise<void> => {
    if (lifecycleState === 'terminated') {
      throw new RuntimeTerminatedError();
    }
    if (lifecycleState === 'connected') {
      return;
    }
    if (connectPromise) {
      return Promise.race([connectPromise, terminated.promise]);
    }
    lifecycleState = 'connecting';
    connectPromise = (async () => {
      const config = typeof options.config === 'function' ? await (options.config as () => unknown)() : options.config;
      if (currentLifecycle() === 'terminated') {
        throw new RuntimeTerminatedError();
      }
      const { channel } = await transport.open();
      await channel.ready;
      validateProtocolHeader({ v: channel.hello.payload.protocolVersion });
      if (currentLifecycle() === 'terminated') {
        throw new RuntimeTerminatedError();
      }
      const initialized = await transport.initialize(config === undefined ? {} : { config });
      if (currentLifecycle() === 'terminated') {
        throw new RuntimeTerminatedError();
      }
      capabilities = initialized.capabilities;
      topics.capabilities.emit(capabilities);
      channel.onNotify('stateChanged', ({ state }) => {
        topics.state.emit({ state });
      });
      channel.onNotify('errorEvent', (event) => {
        if (event.scope === 'operation') {
          clearRecovery(event.operationId);
        }
      });
      channel.onNotify('capabilitiesUpdated', ({ capabilities: next }) => {
        capabilities = next;
        topics.capabilities.emit(next);
      });
      channel.onNotify('log', ({ entry }) => {
        topics.log.emit(entry);
      });
      channel.onNotify('logBatch', ({ entries }) => {
        for (const entry of entries) {
          topics.log.emit(entry);
        }
      });
      channel.onNotify('telemetry', ({ entries, origin, epoch }) => {
        topics.telemetry.emit({ entries, origin, epoch });
      });
      channel.onNotify('errorEvent', (event) => {
        if (event.scope === 'connection') {
          topics.error.emit(event.error.issues);
        }
      });
      session = new RuntimeDocumentSessionClient(channel, transport.resolveBinary, {
        operationTimeout: () => activeTimeout,
        onTimeout,
        onTerminal: clearRecovery,
        signalAbort: (evaluationId, generation, reason) =>
          transport.signalDocumentAbort(evaluationId, generation, reason),
      });
      lifecycleState = 'connected';
    })();
    try {
      await Promise.race([connectPromise, terminated.promise]);
    } catch (error) {
      if (currentLifecycle() !== 'terminated') {
        lifecycleState = 'unconnected';
      }
      connectPromise = undefined;
      throw error;
    }
  };
  const connectedSession = async (): Promise<RuntimeDocumentSessionClient> => {
    await connect();
    if (!session) {
      throw new RuntimeTerminatedError();
    }
    return session;
  };
  const observeTransportClosed = async (): Promise<void> => {
    await transport.closed;
    lifecycleState = 'terminated';
    const failure = new RuntimeTerminatedError();
    terminated.reject(failure);
    clearRecovery();
    session?.terminate(failure);
    for (const topic of Object.values(topics)) {
      topic.dispose();
    }
  };
  void observeTransportClosed();
  const shutdown = async (): Promise<void> => {
    if (lifecycleState === 'terminated') {
      return;
    }
    lifecycleState = 'terminated';
    const failure = new RuntimeTerminatedError();
    terminated.reject(failure);
    clearRecovery();
    session?.terminate(failure);
    for (const topic of Object.values(topics)) {
      topic.dispose();
    }
    await transport.close();
  };
  return {
    machines,
    jobs,
    transport: { id: transport.id, descriptor: transport.describe() },
    get capabilities() {
      if (!capabilities) {
        return undefined;
      }
      return {
        ...capabilities,
        autonomousRenderLoop: true,
        transport: { descriptor: transport.describe() },
      };
    },
    get lifecycleState() {
      return lifecycleState;
    },
    connect,
    open(input) {
      if (lifecycleState === 'terminated') {
        throw new RuntimeTerminatedError();
      }
      const normalized = withStagedFiles(normalizeRuntimeSource(input.source), input.stage);
      const document = openDeferredDocument(
        {
          file: normalized.file,
          parameters: input.parameters ?? {},
          ...(input.evaluateOptions === undefined ? {} : { evaluateOptions: input.evaluateOptions }),
          ...(normalized.stage === undefined ? {} : { stage: normalized.stage }),
          watch: input.watch ?? true,
        },
        connectedSession,
        input.signal,
      );
      return document as RuntimeDocument;
    },
    async describe(input): Promise<Description> {
      const normalized = normalizeRuntimeSource(input.source);
      await waitWithAbort(connect(), input.signal);
      const { channel } = await transport.open();
      if (input.signal?.aborted) {
        throw new OperationAbortedError();
      }
      const controller = new AbortController();
      const timed = Promise.withResolvers<never>();
      const operationId = `describe:${randomUuid()}`;
      const onAbort = (): void => {
        controller.abort();
      };
      input.signal?.addEventListener('abort', onAbort, { once: true });
      const timer =
        activeTimeout > 0
          ? setTimeout(() => {
              timed.reject(new OperationTimeoutError('describe', 'Document description timed out.'));
              onTimeout(operationId);
            }, activeTimeout)
          : undefined;
      const request = channel.call(
        'describe',
        {
          file: normalized.file,
          ...(input.resolution === undefined ? {} : { resolution: input.resolution }),
          ...(normalized.stage === undefined ? {} : { stage: normalized.stage }),
        },
        controller.signal,
      );
      void clearRecoveryWhenSettled(request, operationId);
      try {
        return await waitWithAbort(Promise.race([request, timed.promise, terminated.promise]), input.signal);
      } finally {
        if (timer !== undefined) {
          clearTimeout(timer);
        }
        input.signal?.removeEventListener('abort', onAbort);
      }
    },
    setOperationTimeout(milliseconds): void {
      validateTimeout(milliseconds);
      activeTimeout = milliseconds;
      void activeTimeout;
    },
    setTranscodeTimeout(milliseconds): void {
      if (!Number.isFinite(milliseconds) || milliseconds < 0) {
        throw new TypeError('Transcode timeout must be a finite nonnegative number.');
      }
      if (milliseconds > 0 && transport.renderTimeoutRecovery.kind === 'unsupported') {
        throw new TypeError('This transport cannot enforce a wall-clock transcode deadline.');
      }
      transcodeTimeout = milliseconds;
    },
    routesFor(format) {
      // The runtime predicate narrows the target literal; the serialized manifest cannot carry that generic proof.
      return (capabilities?.routes.filter((route) => route.targetFormat === format) ?? []) as unknown as ReadonlyArray<
        ExportRoute<KernelPlugin[], MiddlewarePlugin[], TranscoderPlugin[], typeof format>
      >;
    },
    bestRouteFor(format, request) {
      const keys = Object.keys(request?.content ?? {});
      const matches =
        capabilities?.routes.filter(
          (route) =>
            route.targetFormat === format &&
            (request?.kernelId === undefined || route.kernelId === request.kernelId) &&
            keys.every((key) => key in (route.content?.schema.properties ?? {})),
        ) ?? [];
      return [...matches].sort((left, right) => {
        const fidelity = (left.fidelity === 'brep' ? 0 : 1) - (right.fidelity === 'brep' ? 0 : 1);
        if (fidelity !== 0) {
          return fidelity;
        }
        return Number(left.transcoderId !== undefined) - Number(right.transcoderId !== undefined);
      })[0] as ExportRoute<KernelPlugin[], MiddlewarePlugin[], TranscoderPlugin[], typeof format> | undefined;
    },
    async snapshotSource(input) {
      const normalized = normalizeRuntimeSource(input.source);
      await waitWithAbort(connect(), input.signal);
      const { channel } = await transport.open();
      return waitWithAbort(
        channel.call(
          'snapshotSource',
          {
            file: normalized.file,
            ...(normalized.stage === undefined ? {} : { stage: normalized.stage }),
            ...(input.additionalPaths === undefined ? {} : { additionalPaths: input.additionalPaths }),
          },
          input.signal,
        ),
        input.signal,
      );
    },
    async transcode(input) {
      await waitWithAbort(connect(), input.signal);
      const { channel } = await transport.open();
      const { signal, ...request } = input;
      const controller = new AbortController();
      const timed = Promise.withResolvers<never>();
      const operationId = `transcode:${randomUuid()}`;
      let workerReplied = false;
      const onAbort = (): void => {
        controller.abort();
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      const timer =
        transcodeTimeout > 0
          ? setTimeout(() => {
              timed.reject(new OperationTimeoutError('transcode', 'Transcode timed out.'));
              if (!workerReplied) {
                onTimeout(operationId);
              }
            }, transcodeTimeout)
          : undefined;
      try {
        // The public route projection validates concrete options; wire admission validates the object again.
        const call = channel.call('transcode', request as RuntimeTranscodeArgs, controller.signal);
        void clearRecoveryWhenSettled(call, operationId);
        const wire = await waitWithAbort(Promise.race([call, timed.promise, terminated.promise]), signal);
        workerReplied = true;
        if (!wire.success) {
          return wire;
        }
        const materialized = Promise.all(
          wire.data.map(async (file) => ({
            ...file,
            bytes: await transport.resolveBinary(file.bytes),
          })),
        );
        void clearRecoveryWhenSettled(materialized, operationId);
        const data = await waitWithAbort(Promise.race([materialized, timed.promise, terminated.promise]), signal);
        return { ...wire, data };
      } finally {
        if (timer !== undefined) {
          clearTimeout(timer);
        }
        signal?.removeEventListener('abort', onAbort);
      }
    },
    on(event, handler, settings) {
      if (lifecycleState === 'terminated') {
        throw new RuntimeTerminatedError();
      }
      switch (event) {
        case 'capabilities': {
          return topics.capabilities.subscribe(
            handler as ClientEventHandlers<KernelPlugin[], MiddlewarePlugin[], TranscoderPlugin[]>['capabilities'],
            settings,
          );
        }
        case 'state': {
          return topics.state.subscribe(({ state, detail }) => {
            (handler as ClientEventHandlers<KernelPlugin[], MiddlewarePlugin[], TranscoderPlugin[]>['state'])(
              state,
              detail,
            );
          }, settings);
        }
        case 'log': {
          return topics.log.subscribe(
            handler as ClientEventHandlers<KernelPlugin[], MiddlewarePlugin[], TranscoderPlugin[]>['log'],
            settings,
          );
        }
        case 'telemetry': {
          return topics.telemetry.subscribe(
            handler as ClientEventHandlers<KernelPlugin[], MiddlewarePlugin[], TranscoderPlugin[]>['telemetry'],
            settings,
          );
        }
        case 'error': {
          return topics.error.subscribe(
            handler as ClientEventHandlers<KernelPlugin[], MiddlewarePlugin[], TranscoderPlugin[]>['error'],
            settings,
          );
        }
      }
    },
    terminate(): void {
      void shutdown();
    },
    shutdown,
  };
}
