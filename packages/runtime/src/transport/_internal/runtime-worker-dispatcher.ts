/**
 * Worker-side Channel Server (transport-internal).
 *
 * Bridges a {@link KernelWorker} to a `@taucad/rpc` `ChannelServer`
 * speaking the typed {@link RuntimeProtocol}. Calls (`initialize`,
 * `export`) are settled via `impl.call`; production drives renders
 * autonomously via the `openFile` notify and consumes `geometryComputed`
 * notifies correlated by `rgen` (mirrors LSP `didOpen` + diagnostics).
 *
 * Client → worker commands (`openFile`, `updateParameters`,
 * `setOptions`, `fileChanged`, `cleanup`,
 * `abort`, `stage-and-render`) ride the bidirectional `nt` notify
 * channel; autonomous worker events (`progress`, `geometryComputed`,
 * `parametersResolved`, `errorEvent`, `stateChanged`,
 * `activeKernelChanged`, `capabilitiesUpdated`, `log`, `logBatch`,
 * `telemetry`) fan out via `serverHandle.notify(...)`. `progress`,
 * `geometryComputed`, and `errorEvent` carry the originating render
 * generation (`rgen`) so consumers can ignore frames from superseded
 * renders.
 *
 * Binary delivery for `export` results and `geometryComputed` notify
 * args hoists via {@link WithTransferables}; the transport encodes each
 * payload through its `pool → transfer → copy` ladder
 * (`encodeGeometry` / `encodeFile`) — the dispatcher itself never reads
 * a `Port` capability set, so wire facts stay private to the transport.
 *
 * An unhandled-rejection trap wraps every awaited operation so errors
 * thrown in fire-and-forget promises (e.g. Emscripten pthread init)
 * surface as structured channel errors instead of silent hangs.
 *
 * Lives under `transport/_internal/` because it value-imports
 * `createChannelServer` from `@taucad/rpc`. Exported (rather than
 * fully internalised) so transports and the worker bootstrap entry
 * (`framework/kernel-runtime-worker.ts`) can compose it.
 *
 * @internal
 */

import type { Geometry, OnWorkerLog, LogEntry } from '@taucad/types';
import { idPrefix } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import { createChannelServer } from '@taucad/rpc';
import type { ChannelServer, ChannelServerHandle, Port, WithTransferables } from '@taucad/rpc';
import { runtimeProtocolSchemas } from '#types/runtime-protocol.schemas.js';
import type { KernelIssueCode } from '#types/kernel-issue-codes.js';
import { isKernelIssueCode } from '#types/kernel-issue-codes.js';
import type { HashedGeometryResult, ExportGeometryResult } from '#types/runtime.types.js';
import type {
  GeometryTransport,
  HashedGeometryResultTransport,
  RuntimeHelloPayload,
  RuntimeProtocol,
  RuntimeGeometryComputedArgs,
  TelemetryEntry,
} from '#types/runtime-protocol.types.js';
import type { RuntimeFileSystemBase } from '#types/runtime-kernel.types.js';
import type { KernelWorker } from '#framework/kernel-worker.js';
import { logFlushDebounce } from '#framework/runtime-framework.constants.js';
import { createErrorTrap } from '#framework/worker-error-trap.js';
import { packageVersion } from '#utils/package-info.js';
import type {
  EncodedGeometry,
  EncodedFileBytes,
  HostInitializeBindings,
  RuntimeInitializeMemoryHandle,
} from '#transport/runtime-transport.types.js';

/** Stable session key for the runtime worker channel. */
export const runtimeChannelSessionKey = 'tau.runtime/v1';

/**
 * Geometry encoder injected by the transport host. The host owns
 * the `pool → transfer → copy` ladder choice and supplies a
 * `publish(geometry)` that returns the wire-ready
 * {@link EncodedGeometry} (value, transferables, tier). The
 * dispatcher merely forwards the descriptor and hoists the
 * transferables onto the channel notify.
 *
 * @public
 */
export type GeometryEncoder = (geometry: Geometry) => EncodedGeometry;

/**
 * File-bytes encoder injected by the transport host. Symmetric with
 * {@link GeometryEncoder}.
 *
 * @public
 */
export type FileBytesEncoder = (file: Uint8Array<ArrayBuffer>) => EncodedFileBytes;

function applyGeometryEncoder(
  geometry: Geometry,
  encode: GeometryEncoder,
  transferables: Transferable[],
): GeometryTransport {
  if (geometry.format !== 'gltf') {
    return geometry;
  }
  const encoded = encode(geometry);
  if (encoded.transferables.length > 0) {
    transferables.push(...encoded.transferables);
  }
  return encoded.value as GeometryTransport;
}

function toTransportResult(
  result: HashedGeometryResult,
  encode: GeometryEncoder,
  transferables: Transferable[],
): HashedGeometryResultTransport {
  if (!result.success) {
    return { ...result, issues: result.issues.map(normaliseIssueForWire) };
  }

  return {
    ...result,
    issues: result.issues.map(normaliseIssueForWire),
    data: applyGeometryEncoder(result.data, encode, transferables),
  };
}

function normaliseIssueForWire<T extends { code?: unknown }>(issue: T): T & { code: KernelIssueCode } {
  return isKernelIssueCode(issue.code) ? (issue as T & { code: KernelIssueCode }) : { ...issue, code: 'UNKNOWN' };
}

function extractExportTransferables(
  result: ExportGeometryResult,
  encodeFile: FileBytesEncoder | undefined,
  outTransferables: Transferable[],
): void {
  if (!result.success || !encodeFile) {
    return;
  }

  const seen = new Set<Transferable>();
  for (const file of result.data) {
    const encoded = encodeFile(file.bytes);
    for (const t of encoded.transferables) {
      seen.add(t);
    }
  }
  outTransferables.push(...seen);
}

/**
 * Options accepted by {@link createWorkerDispatcher}. The
 * `inlineFileSystem` field is the local-disk fast-path seam (TR16):
 * when the dispatcher and the kernel host live in the same V8 isolate,
 * an inline FS instance can be handed to the worker directly, avoiding
 * the `MessagePort` bridge roundtrip. Cross-process dispatchers
 * (worker, node-worker, host) leave this unset and continue to wire
 * the FS via `memoryHandle.fileSystemPort`.
 *
 * The `encodeGeometry` / `encodeFile` encoders are produced by the
 * transport host's `adoptInitialize(...)` bindings. The dispatcher
 * uses them verbatim so the wire-tier decision (pool/transfer/copy)
 * stays inside the transport plugin and the dispatcher never reads
 * `port.capabilities`.
 *
 * @public
 */
export type WorkerDispatcherOptions = {
  readonly inlineFileSystem?: RuntimeFileSystemBase;
  /**
   * Transport-supplied geometry encoder (typically
   * `bindings.geometryDelivery.publish`). When omitted the dispatcher
   * falls back to inline / copy delivery (no transferables, no pool).
   */
  readonly encodeGeometry?: GeometryEncoder;
  /**
   * Transport-supplied file-bytes encoder (typically
   * `bindings.fileDelivery.publish`). When omitted the dispatcher
   * falls back to inline / copy delivery for export results.
   */
  readonly encodeFile?: FileBytesEncoder;
  /**
   * Late-bound host bindings factory invoked when the dispatcher
   * receives the `initialize` RPC. The factory inspects the inbound
   * `memoryHandle` and returns the
   * {@link HostInitializeBindings} the dispatcher will use for
   * subsequent geometry / file emissions and for adopting the host's
   * abort signal. Worker-side bundles supply
   * `createWorkerHostBindings` from
   * `#transport/_internal/worker-host-bindings.js` so they pick up SAB
   * pools when the client allocated them.
   */
  readonly bindingsFactory?: (handle: RuntimeInitializeMemoryHandle) => HostInitializeBindings;
};

const inlineGeometryEncoder: GeometryEncoder = (geometry) => {
  if (geometry.format !== 'gltf') {
    return { value: geometry, transferables: [], tier: 'copy' };
  }
  return {
    value: {
      format: 'gltf',
      content: { delivery: 'inline', bytes: geometry.content },
      hash: geometry.hash,
    },
    transferables: [],
    tier: 'copy',
  };
};

/**
 * Spawn a `ChannelServer<RuntimeProtocol>` that routes typed RPC calls
 * and notifies into a {@link KernelWorker}.
 *
 * @param worker - The kernel worker to dispatch into.
 * @param port - The transport port (`Port<unknown>`) carrying the
 *   channel frames. Adapters for browser `MessagePort` / Node
 *   `worker_threads` are provided by `wrapMessagePort` in `@taucad/rpc`
 *   and the runtime `runtime-message-adapter` module.
 * @param dispatcherOptions - Optional dispatcher-time options (see
 *   {@link WorkerDispatcherOptions}).
 * @returns The {@link ChannelServerHandle} so callers can dispose the
 *   server explicitly. The dispatcher owns autonomous-event fan-out via
 *   the same handle for the lifetime of the worker.
 */
export function createWorkerDispatcher(
  worker: KernelWorker,
  port: Port<unknown>,
  dispatcherOptions?: WorkerDispatcherOptions,
): ChannelServerHandle<RuntimeProtocol> {
  // oxlint-disable-next-line prefer-const -- serverHandle is reassigned below after `impl` closes over `notify`.
  let serverHandle: ChannelServerHandle<RuntimeProtocol> | undefined;
  const notify: ChannelServerHandle<RuntimeProtocol>['notify'] = (name, args) => {
    serverHandle?.notify(name, args);
  };

  /* Transport host injects geometry / file encoders via
   * `dispatcherOptions`. When omitted (smoke tests, in-isolate hosts)
   * the dispatcher falls back to an inline-only encoder. When the
   * caller supplies `bindingsFactory`, the encoders are swapped to
   * the bindings' SAB-aware variants the moment `initialize` lands.
   * The dispatcher never reads `port.capabilities` directly. */
  let encodeGeometry: GeometryEncoder = dispatcherOptions?.encodeGeometry ?? inlineGeometryEncoder;
  let encodeFile: FileBytesEncoder | undefined = dispatcherOptions?.encodeFile;

  const pendingLogs: LogEntry[] = [];
  let logFlushTimer: ReturnType<typeof setTimeout> | undefined;

  const flushLogs = (): void => {
    if (pendingLogs.length === 0) {
      return;
    }

    notify('logBatch', { entries: pendingLogs.splice(0) });
    logFlushTimer = undefined;
  };

  const onLog: OnWorkerLog = (log) => {
    pendingLogs.push({
      id: generatePrefixedId(idPrefix.log),
      timestamp: Date.now(),
      level: log.level,
      message: log.message,
      origin: log.origin,
      data: log.data,
    });
    logFlushTimer ??= setTimeout(flushLogs, logFlushDebounce);
  };

  worker.setTelemetrySend((entries: TelemetryEntry[]) => {
    notify('telemetry', { entries });
  });

  let callbacksWired = false;
  const wireWorkerCallbacks = (): void => {
    if (callbacksWired) {
      return;
    }
    callbacksWired = true;

    worker.onStateChanged = (state, detail) => {
      notify('stateChanged', { state, ...(detail === undefined ? {} : { detail }) });
    };

    worker.onGeometryComputed = (result, rgen) => {
      flushLogs();
      worker.flushTelemetry();
      const transferables: Transferable[] = [];
      const transport = toTransportResult(result, encodeGeometry, transferables);
      const args: WithTransferables<RuntimeGeometryComputedArgs> = {
        value: { result: transport, rgen },
        transferables,
      };
      notify('geometryComputed', args);
    };

    worker.onParametersResolved = (result, rgen) => {
      notify('parametersResolved', { result, rgen });
    };

    worker.onProgressUpdate = (phase, rgen, detail) => {
      notify('progress', { phase, rgen, ...(detail === undefined ? {} : { detail }) });
    };

    worker.onError = (issues, rgen) => {
      notify('errorEvent', {
        issues: issues.map((issue) => normaliseIssueForWire(issue)),
        ...(rgen === undefined ? {} : { rgen }),
      });
    };

    worker.onActiveKernelChanged = (kernelId) => {
      notify('activeKernelChanged', { kernelId });
    };

    worker.onCapabilitiesUpdated = (capabilities) => {
      notify('capabilitiesUpdated', { capabilities });
    };
  };

  const handleInitialize: (
    args: RuntimeProtocol['calls']['initialize']['args'],
  ) => Promise<RuntimeProtocol['calls']['initialize']['result']> = async (args) => {
    const { promise: trapPromise, cleanup: cleanupTrap } = createErrorTrap();
    try {
      wireWorkerCallbacks();

      const { memoryHandle } = args;
      if (memoryHandle?.signalBuffer) {
        worker.setSignalBuffer(memoryHandle.signalBuffer);
      }
      if (memoryHandle?.geometryPoolBuffer) {
        worker.setGeometryPoolBuffer(memoryHandle.geometryPoolBuffer);
      }
      if (memoryHandle?.filePoolBuffer) {
        worker.setFilePoolBuffer(memoryHandle.filePoolBuffer);
      }

      /* Late-bind the host bindings now that we have the inbound
       * `memoryHandle`. The bindings' geometry / file encoders win
       * over the early-bound encoders supplied at dispatcher
       * construction time, so the same dispatcher transparently
       * upgrades from `transfer` to `pool` tier when the client
       * allocates SABs at runtime. */
      if (dispatcherOptions?.bindingsFactory && memoryHandle) {
        const bindings = dispatcherOptions.bindingsFactory(memoryHandle);
        encodeGeometry = bindings.geometryDelivery.publish;
        encodeFile = bindings.fileDelivery.publish;
      }

      await Promise.race([
        worker.initialize({
          callbacks: { onLog },
          transferables: {
            fileSystemPort: memoryHandle?.fileSystemPort,
            inlineFileSystem: dispatcherOptions?.inlineFileSystem,
          },
          config: args.config,
        }),
        trapPromise,
      ]);

      return { capabilities: worker.capabilitiesManifest };
    } finally {
      cleanupTrap();
    }
  };

  const handleExport: (args: RuntimeProtocol['calls']['export']['args']) => Promise<ExportGeometryResult> = async (
    args,
  ) => {
    const { promise: trapPromise, cleanup: cleanupTrap } = createErrorTrap();
    try {
      return await Promise.race([worker.exportGeometry(args.format, args.options), trapPromise]);
    } finally {
      worker.flushTelemetry();
      cleanupTrap();
    }
  };

  const handleExportModel: (
    args: RuntimeProtocol['calls']['exportModel']['args'],
  ) => Promise<ExportGeometryResult> = async (args) => {
    const { promise: trapPromise, cleanup: cleanupTrap } = createErrorTrap();
    try {
      return await Promise.race([worker.exportModel(args), trapPromise]);
    } finally {
      worker.flushTelemetry();
      cleanupTrap();
    }
  };

  type CallResult = Awaited<ReturnType<ChannelServer<RuntimeProtocol>['call']>>;

  const impl: ChannelServer<RuntimeProtocol> = {
    // oxlint-disable-next-line max-params -- ChannelServer.call signature is fixed (ctx, name, args, signal); parameter count is enforced by the protocol contract.
    async call(_context, name, args, _signal) {
      switch (name) {
        case 'initialize': {
          const result = await handleInitialize(args as RuntimeProtocol['calls']['initialize']['args']);
          return result as unknown as CallResult;
        }
        case 'export': {
          const result = await handleExport(args as RuntimeProtocol['calls']['export']['args']);
          const transferables: Transferable[] = [];
          extractExportTransferables(result, encodeFile, transferables);
          const envelope: WithTransferables<unknown> = {
            value: result,
            transferables,
          };
          return envelope as unknown as CallResult;
        }
        case 'exportModel': {
          const result = await handleExportModel(args as RuntimeProtocol['calls']['exportModel']['args']);
          const transferables: Transferable[] = [];
          extractExportTransferables(result, encodeFile, transferables);
          const envelope: WithTransferables<unknown> = {
            value: result,
            transferables,
          };
          return envelope as unknown as CallResult;
        }
      }
    },

    notify(_context, name, args) {
      switch (name) {
        case 'openFile': {
          const a = args as RuntimeProtocol['notifies']['openFile']['args'];
          worker.handleOpenFile(a.file, a.parameters, a.options);
          break;
        }
        case 'stage-and-render': {
          const a = args as RuntimeProtocol['notifies']['stage-and-render']['args'];
          /* Fire-and-forget: notify is synchronous, so rejection routing
           * happens via .catch — making the handler async would block the
           * dispatcher loop on every staged render. */
          const stagePromise = worker.handleStageAndOpenFile({
            stage: a.stage,
            file: a.file,
            parameters: a.parameters,
            options: a.options,
          });
          // oxlint-disable-next-line eslint-plugin-promise/prefer-await-to-then -- intentional fire-and-forget routing inside synchronous notify handler
          stagePromise.catch((error: unknown) => {
            notify('errorEvent', { issues: errorToIssues(error) });
          });
          break;
        }
        case 'updateParameters': {
          const a = args as RuntimeProtocol['notifies']['updateParameters']['args'];
          worker.handleUpdateParameters(a.parameters);
          break;
        }
        case 'setOptions': {
          const a = args as RuntimeProtocol['notifies']['setOptions']['args'];
          worker.handleSetOptions(a.options);
          break;
        }
        case 'fileChanged': {
          const a = args as RuntimeProtocol['notifies']['fileChanged']['args'];
          // oxlint-disable-next-line promise/prefer-await-to-then -- intentional fire-and-forget routing inside synchronous notify handler
          worker.notifyFileChanged(a.paths).catch((error: unknown) => {
            notify('errorEvent', { issues: errorToIssues(error) });
          });
          break;
        }
        case 'cleanup': {
          if (logFlushTimer) {
            clearTimeout(logFlushTimer);
            logFlushTimer = undefined;
          }
          flushLogs();
          // oxlint-disable-next-line promise/prefer-await-to-then -- intentional fire-and-forget routing inside synchronous notify handler
          worker.cleanup().catch((error: unknown) => {
            notify('errorEvent', { issues: errorToIssues(error) });
          });
          break;
        }
        case 'abort': {
          const a = args as RuntimeProtocol['notifies']['abort']['args'];
          worker.handleWireAbort(a.reason);
          break;
        }
        // Worker → client autonomous notifies are emitted via `serverHandle.notify`,
        // so receiving them here would indicate a misrouted frame from the client.
        case 'parametersResolved':
        case 'geometryComputed':
        case 'errorEvent':
        case 'progress':
        case 'activeKernelChanged':
        case 'stateChanged':
        case 'log':
        case 'logBatch':
        case 'telemetry':
        case 'capabilitiesUpdated': {
          // No-op: server never receives these.
          break;
        }
      }
    },

    async *listen() {
      // RuntimeProtocol does not declare any `listens` events; this branch
      // exists only to satisfy `ChannelServer<RuntimeProtocol>`.
    },
  };

  const helloPayload: RuntimeHelloPayload = {
    server: 'kernel-runtime-worker',
    runtimeVersion: packageVersion,
  };

  serverHandle = createChannelServer<RuntimeProtocol>({
    port,
    sessionKey: runtimeChannelSessionKey,
    impl,
    hello: helloPayload,
    protocolSchemas: runtimeProtocolSchemas,
  });

  return serverHandle;
}

function errorToIssues(error: unknown): Array<{
  message: string;
  code: 'RUNTIME';
  type: 'runtime';
  severity: 'error';
}> {
  const message = error instanceof Error ? error.message : String(error);
  return [{ message, code: 'RUNTIME', type: 'runtime', severity: 'error' }];
}
