import { createChannelServer } from '@taucad/rpc';
import type { ChannelServer, ChannelServerHandle, Port, WithTransferables } from '@taucad/rpc';
import type { ExportFile, LogEntry, OnWorkerLog } from '@taucad/types';
import { idPrefix } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import type { KernelWorker } from '#framework/kernel-worker.js';
import { logFlushDebounce } from '#framework/runtime-framework.constants.js';
import { createErrorTrap } from '#framework/worker-error-trap.js';
import { createTelemetryOrigin, telemetryEpoch } from '#framework/worker-telemetry.js';
import { packageVersion } from '#utils/package-info.js';
import { protocolVersion } from '#types/protocol-header.types.js';
import type {
  RuntimeDocumentProtocol,
  WireExportFile,
  WireExportResult,
  WireRendering,
} from '#types/runtime-document-protocol.types.js';
import { runtimeDocumentProtocolSchemas } from '#types/runtime-document-protocol.schemas.js';
import type { RuntimeObservationMode } from '#types/runtime-observation.types.js';
import { RuntimeAlreadyInitializedError } from '#transport/runtime-transport.types.js';
import { createComputeStoreChannelClient } from '#transport/_internal/compute-store-channel.js';
import { runtimeChannelSessionKey } from '#transport/_internal/runtime-channel-bindings.js';
import type { BinaryEncoder, DocumentWorkerDispatcherOptions } from '#transport/_internal/runtime-channel-bindings.js';

/** Operation ids remembered while their terminal reply and their settlement meet; older ids are forgotten. */
const pendingReplyLimit = 64;

/** The observation modes this worker supports, advertised in its `initialize` result. */
const observationModes: readonly RuntimeObservationMode[] = ['facts'];

const inlineBinary: BinaryEncoder = (_key, source) => {
  const bytes = new Uint8Array(source);
  return { value: { delivery: 'inline', bytes }, transferables: [bytes.buffer], tier: 'transfer' };
};

/** Dispatch the document protocol through a transport-owned channel. @internal */
export function createDocumentWorkerDispatcher(
  worker: KernelWorker,
  port: Port<unknown>,
  options?: DocumentWorkerDispatcherOptions,
): ChannelServerHandle<RuntimeDocumentProtocol> {
  // oxlint-disable-next-line eslint/prefer-const -- callbacks capture the server before its channel construction below.
  let server: ChannelServerHandle<RuntimeDocumentProtocol> | undefined;
  let binaryEncoder = options?.encodeBinary ?? inlineBinary;
  let acknowledgeBinary = options?.acknowledgeBinary ?? (() => undefined);
  let initialized = false;
  let initializing = false;
  let publicationId = 0;
  let computeStore: ReturnType<typeof createComputeStoreChannelClient> | undefined;
  const pendingLogs: LogEntry[] = [];
  let logTimer: ReturnType<typeof setTimeout> | undefined;
  const notify: ChannelServerHandle<RuntimeDocumentProtocol>['notify'] = (name, args) => {
    server?.notify(name, args);
  };
  const flushLogs = (): void => {
    if (logTimer) {
      clearTimeout(logTimer);
    }
    if (pendingLogs.length > 0) {
      notify('logBatch', { entries: pendingLogs.splice(0) });
    }
    logTimer = undefined;
  };
  const onLog: OnWorkerLog = (entry) => {
    pendingLogs.push({
      id: generatePrefixedId(idPrefix.log),
      timestamp: Date.now(),
      level: entry.level,
      message: entry.message,
      origin: entry.origin,
      data: entry.data,
    });
    logTimer ??= setTimeout(flushLogs, logFlushDebounce);
  };
  const telemetryOrigin = createTelemetryOrigin();
  worker.setTelemetrySend(({ entries, dropped, droppedRoots }) => {
    notify('telemetry', {
      entries,
      origin: telemetryOrigin,
      epoch: telemetryEpoch(),
      dropped,
      ...(droppedRoots === undefined ? {} : { droppedRoots }),
    });
  });
  /* An operation's spans leave after its terminal reply, never before it and never with the next
   * operation: notify replies (evaluated, rendered) usually post before the operation settles, call
   * replies (initialize, describe, export, transcode) are posted by the channel after it settles,
   * and a reply for a thrown evaluation or render is published after it settles. */
  const repliedBeforeSettle = new Set<string>();
  const settledBeforeReply = new Set<string>();
  const afterCallReply = new WeakMap<WeakKey, () => void>();
  const remember = (ids: Set<string>, operationId: string): void => {
    ids.add(operationId);
    if (ids.size > pendingReplyLimit) {
      ids.delete(ids.values().next().value!);
    }
  };
  /* The after-reply step: the operation's facts (only while a client observes), then its spans. */
  const afterTerminalReply = (operationId: string | undefined): void => {
    try {
      worker.afterTerminalReply(operationId);
    } catch {
      // Telemetry is observational and must not change runtime outcomes.
    }
  };
  worker.onOperationFacts = (facts) => {
    notify('operationFacts', facts);
  };
  if (options?.realm !== undefined) {
    worker.setRealm(options.realm);
  }
  const notifyReplied = (operationId: string): void => {
    if (settledBeforeReply.delete(operationId)) {
      afterTerminalReply(operationId);
    } else {
      remember(repliedBeforeSettle, operationId);
    }
  };
  worker.onOperationSettled = (settled) => {
    if (settled.operation !== 'evaluate' && settled.operation !== 'render') {
      return; // A call's reply is posted by the channel after this returns; see `replyThen`.
    }
    if (
      repliedBeforeSettle.delete(settled.operationId) ||
      settled.outcome === 'cancelled' ||
      settled.outcome === 'timed-out'
    ) {
      afterTerminalReply(settled.operationId); // Replied already, or no reply will come.
      return;
    }
    remember(settledBeforeReply, settled.operationId);
  };
  /**
   * Run the after-reply step once the channel has posted this call's result.
   *
   * @param value - The exact object the call returns as its result payload.
   * @param operationId - The call's operation id, when the client sent one.
   * @returns The same value.
   */
  const replyThen = <T extends WeakKey>(value: T, operationId: string | undefined): T => {
    afterCallReply.set(value, () => {
      afterTerminalReply(operationId);
    });
    return value;
  };
  worker.onDescribed = (event) => {
    notify('described', event);
  };
  worker.onEvaluating = (event) => {
    notify('evaluating', event);
  };
  worker.onEvaluated = (event) => {
    flushLogs();
    notify('evaluated', event);
    worker.permitComputePublication();
    notifyReplied(`evaluate:${event.documentId}:${event.id}`);
  };
  worker.onRendering = (event) => {
    notify('rendering', event);
  };
  worker.onDocumentProgressUpdate = (event) => {
    notify('progress', event);
  };
  worker.onDocumentError = (event) => {
    notify('errorEvent', event);
  };
  worker.onDocumentStateChanged = (event) => {
    notify('stateChanged', event);
  };
  worker.onCapabilitiesUpdated = (capabilities) => {
    notify('capabilitiesUpdated', { capabilities });
  };
  worker.onRendered = (event) => {
    const transferables: Transferable[] = [];
    const operationId = `render:${event.subscriptionId}:${event.evaluationId}:${event.requestId}`;
    if (!event.success) {
      flushLogs();
      notify('rendered', event);
      worker.permitComputePublication();
      notifyReplied(operationId);
      return;
    }
    const { content } = event.artifact;
    let wireContent: string | ReturnType<BinaryEncoder>['value'];
    if (content instanceof Uint8Array) {
      const delivery = binaryEncoder(`render:${event.subscriptionId}:${event.requestId}:${++publicationId}`, content);
      transferables.push(...delivery.transferables);
      wireContent = delivery.value;
    } else {
      wireContent = content;
    }
    const value: WireRendering & { readonly subscriptionId: string; readonly intent: number } = {
      ...event,
      artifact: { ...event.artifact, content: wireContent },
    };
    const envelope: WithTransferables<typeof value> = { value, transferables };
    flushLogs();
    notify('rendered', envelope);
    worker.permitComputePublication();
    notifyReplied(operationId);
  };
  const initialize = async (
    args: RuntimeDocumentProtocol['calls']['initialize']['args'],
  ): Promise<RuntimeDocumentProtocol['calls']['initialize']['result']> => {
    if (initializing || initialized) {
      throw new RuntimeAlreadyInitializedError();
    }
    initializing = true;
    const { promise: trap, cleanup } = createErrorTrap();
    try {
      const { memoryHandle } = args;
      worker.setObservation(args.observation ?? 'off');
      worker.setDevtoolsTelemetryEnabled(memoryHandle?.devtoolsTelemetry === true);
      worker.setCompiledWasmModules(memoryHandle?.compiledWasmModules ?? []);
      if (memoryHandle?.signalBuffer) {
        worker.setSignalBuffer(memoryHandle.signalBuffer);
      }
      const computeStorePort = options?.computeStorePort ?? memoryHandle?.computeStorePort;
      const sizing = memoryHandle?.computeMemoryConstrained === true ? { memoryConstrained: true } : {};
      if (computeStorePort) {
        computeStore = createComputeStoreChannelClient(computeStorePort);
        worker.setComputeBinding({ mode: 'durable', store: computeStore.store, ...sizing });
      } else if ((options?.computeBindingMode ?? memoryHandle?.computeBindingMode) === 'off') {
        worker.setComputeBinding({ mode: 'off' });
      } else if (
        options?.computeBindingMode === 'memory' ||
        memoryHandle?.computeBindingMode === 'memory' ||
        memoryHandle?.computeBindingMode === 'durable'
      ) {
        worker.setComputeBinding({ mode: 'memory', ...sizing });
      }
      if (options?.bindingsFactory && memoryHandle) {
        const bindings = options.bindingsFactory(memoryHandle);
        binaryEncoder = bindings.binaryDelivery.publishBytes;
        acknowledgeBinary = bindings.binaryDelivery.acknowledge;
      }
      await Promise.race([
        worker.initialize({
          callbacks: { onLog },
          transferables: {
            fileSystemPort: memoryHandle?.fileSystemPort,
            inlineFileSystem: options?.inlineFileSystem,
          },
          config: args.config,
          ...(args.operationId === undefined ? {} : { operationId: args.operationId }),
        }),
        trap,
      ]);
      initialized = true;
      return replyThen({ capabilities: worker.capabilitiesManifest, observation: observationModes }, args.operationId);
    } catch (error) {
      computeStore?.dispose();
      computeStore = undefined;
      afterTerminalReply(args.operationId);
      throw error;
    } finally {
      initializing = false;
      cleanup();
    }
  };
  const encodeExport = (
    files: readonly ExportFile[],
  ): {
    readonly files: readonly [WireExportFile, ...WireExportFile[]];
    readonly transferables: Transferable[];
  } => {
    const transferables: Transferable[] = [];
    const encoded = files.map((file, index) => {
      const delivery = binaryEncoder(`export:${++publicationId}:${index}`, file.bytes);
      transferables.push(...delivery.transferables);
      return { ...file, bytes: delivery.value };
    });
    if (encoded.length === 0) {
      throw new Error('Successful document exports require at least one file.');
    }
    return { files: encoded as [WireExportFile, ...WireExportFile[]], transferables };
  };
  /**
   * Run a call, flushing its spans when it throws: the error reply needs no after-reply step.
   *
   * @param run - The call.
   * @param operationId - The call's operation id, when the client sent one.
   * @returns The call's result.
   */
  const afterThrow = async <T>(run: () => Promise<T>, operationId: string | undefined): Promise<T> => {
    try {
      return await run();
    } catch (error) {
      afterTerminalReply(operationId);
      throw error;
    }
  };
  type CallResult = RuntimeDocumentProtocol['calls'][keyof RuntimeDocumentProtocol['calls']]['result'];
  // The RPC callback is generic over the call name. The switch checks each
  // branch against its schema result, but TypeScript cannot correlate N after
  // narrowing a generic name; keep that assertion at this single boundary.
  // oxlint-disable-next-line typescript/consistent-type-assertions -- generic RPC call names cannot correlate across a switch.
  const impl = {
    // oxlint-disable-next-line max-params -- fixed RPC server signature.
    async call(_context, name, args, signal) {
      switch (name) {
        case 'initialize': {
          return (await initialize(args as RuntimeDocumentProtocol['calls']['initialize']['args'])) as CallResult;
        }
        case 'describe': {
          const describeArgs = args as RuntimeDocumentProtocol['calls']['describe']['args'];
          return replyThen(
            await afterThrow(async () => worker.describe(describeArgs, signal), describeArgs.operationId),
            describeArgs.operationId,
          ) as CallResult;
        }
        case 'export': {
          const exportArgs = args as RuntimeDocumentProtocol['calls']['export']['args'];
          let result: Awaited<ReturnType<typeof worker.exportDocument>>;
          try {
            result = await afterThrow(async () => worker.exportDocument(exportArgs, signal), exportArgs.operationId);
          } finally {
            flushLogs();
          }
          if (!result.success) {
            return replyThen(result, exportArgs.operationId) as CallResult;
          }
          const { files, transferables } = encodeExport(result.files);
          const wire: WireExportResult = replyThen({ ...result, files }, exportArgs.operationId);
          const response: WithTransferables<RuntimeDocumentProtocol['calls']['export']['result']> = {
            value: wire,
            transferables,
          };
          return response;
        }
        case 'snapshotSource': {
          const result = await worker.snapshotSource(
            args as RuntimeDocumentProtocol['calls']['snapshotSource']['args'],
            signal,
          );
          if (!result.success) {
            return result as CallResult;
          }
          const transferables: Transferable[] = [];
          const files = result.data.files.map((file) => {
            const content = new Uint8Array(file.content);
            transferables.push(content.buffer);
            return { ...file, content };
          });
          const response: WithTransferables<RuntimeDocumentProtocol['calls']['snapshotSource']['result']> = {
            value: { ...result, data: { ...result.data, files } },
            transferables,
          };
          return response;
        }
        case 'transcode': {
          const transcodeArgs = args as RuntimeDocumentProtocol['calls']['transcode']['args'];
          const result = await afterThrow(
            async () => worker.transcode(transcodeArgs, signal),
            transcodeArgs.operationId,
          );
          if (!result.success) {
            return replyThen(result, transcodeArgs.operationId) as CallResult;
          }
          const transferables: Transferable[] = [];
          const data = result.data.map((file, index) => {
            const delivery = binaryEncoder(`transcode:${++publicationId}:${index}`, file.bytes);
            transferables.push(...delivery.transferables);
            return { ...file, bytes: delivery.value };
          });
          const response: WithTransferables<RuntimeDocumentProtocol['calls']['transcode']['result']> = {
            value: replyThen({ ...result, data }, transcodeArgs.operationId),
            transferables,
          };
          return response;
        }
        case 'dispose': {
          if (logTimer) {
            clearTimeout(logTimer);
          }
          flushLogs();
          await worker.cleanup();
          computeStore?.dispose();
          computeStore = undefined;
          return null as CallResult;
        }
      }
    },
    notify(_context, name, args) {
      switch (name) {
        case 'open': {
          worker.handleOpenDocument(args as RuntimeDocumentProtocol['notifies']['open']['args']);
          break;
        }
        case 'update': {
          worker.handleUpdateDocument(args as RuntimeDocumentProtocol['notifies']['update']['args']);
          break;
        }
        case 'close': {
          worker.handleCloseDocument(args as RuntimeDocumentProtocol['notifies']['close']['args']);
          break;
        }
        case 'openView': {
          worker.handleOpenView(args as RuntimeDocumentProtocol['notifies']['openView']['args']);
          break;
        }
        case 'updateView': {
          worker.handleUpdateView(args as RuntimeDocumentProtocol['notifies']['updateView']['args']);
          break;
        }
        case 'closeView': {
          worker.handleCloseView(args as RuntimeDocumentProtocol['notifies']['closeView']['args']);
          break;
        }
        case 'abort': {
          worker.handleOperationAbort(args as RuntimeDocumentProtocol['notifies']['abort']['args']);
          break;
        }
        case 'binaryMaterialised': {
          acknowledgeBinary((args as RuntimeDocumentProtocol['notifies']['binaryMaterialised']['args']).key);
          break;
        }
        case 'observe': {
          worker.setObservation((args as RuntimeDocumentProtocol['notifies']['observe']['args']).mode);
          break;
        }
      }
    },

    async *listen(): AsyncGenerator<never> {
      yield* [] as never[];
      throw new Error('The document protocol declares no listen streams.');
    },
  } as ChannelServer<RuntimeDocumentProtocol>;
  const deliveryPort: Port<unknown> = {
    ...port,
    postMessage(message, transferables) {
      port.postMessage(message, transferables);
      if (typeof message === 'object' && message !== null && 'k' in message && message.k === 'rs') {
        worker.permitComputePublication();
        const payload = 'd' in message ? message.d : undefined;
        if (typeof payload === 'object' && payload !== null) {
          const after = afterCallReply.get(payload);
          if (after) {
            afterCallReply.delete(payload);
            after();
          }
        }
      }
    },
  };
  server = createChannelServer<RuntimeDocumentProtocol>({
    port: deliveryPort,
    sessionKey: runtimeChannelSessionKey,
    impl,
    hello: { server: 'kernel-runtime-worker', runtimeVersion: packageVersion, protocolVersion },
    protocolSchemas: runtimeDocumentProtocolSchemas,
  });
  return server;
}
