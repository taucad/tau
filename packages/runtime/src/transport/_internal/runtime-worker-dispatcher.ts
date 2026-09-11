/**
 * Worker-side Channel Server (transport-internal).
 *
 * Bridges a {@link KernelWorker} to a `@taucad/rpc` `ChannelServer`
 * speaking the typed {@link RuntimeProtocol}. Calls (`initialize`,
 * `export`) are settled via `impl.call`; production drives renders
 * autonomously via the `openFile` notify and consumes `geometryComputed`
 * notifies correlated by opaque `renderId` (mirrors LSP `didOpen` + diagnostics).
 *
 * Client → worker commands (`openFile`, `updateParameters`,
 * `setOptions`, `abort`, `stage-and-render`) ride the bidirectional `nt`
 * notify channel (`cleanup` is an acknowledged `call`, not a notify);
 * autonomous worker events (`progress`, `geometryComputed`,
 * `parametersResolved`, `errorEvent`, `stateChanged`,
 * `activeKernelChanged`, `capabilitiesUpdated`, `log`, `logBatch`,
 * `telemetry`) fan out via `serverHandle.notify(...)`. Six events carry
 * render identity: `parametersResolved`, `geometryComputed`, `errorEvent`,
 * `progress`, `activeKernelChanged`, and `stateChanged`; the two optional
 * sites also cover connection-scoped work.
 *
 * Binary delivery for `export` results and `geometryComputed` notify
 * args hoists via {@link WithTransferables}; the transport encodes each
 * payload through its `pool → transfer → copy` ladder
 * (`encodeGeometry`) — the dispatcher itself never reads
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
import type { ChannelServer, ChannelServerHandle, MessagePortLike, Port, WithTransferables } from '@taucad/rpc';
import { runtimeProtocolSchemas } from '#types/runtime-protocol.schemas.js';
import type { KernelIssueCode } from '#types/kernel-issue-codes.js';
import { isKernelIssueCode } from '#types/kernel-issue-codes.js';
import type { HashedGeometryResult, ExportGeometryResult } from '#types/runtime.types.js';
import type { RuntimeSourceSnapshotResult } from '#types/runtime-source-snapshot.types.js';
import type {
  GeometryTransport,
  HashedGeometryResultTransport,
  ProgressiveSceneUpdateTransport,
  ResolvedSceneAssetTransport,
  ResolvedSceneSnapshotTransport,
  RuntimeHelloPayload,
  RuntimeProtocol,
  RuntimeGeometryComputedArgs,
  TelemetryEntry,
} from '#types/runtime-protocol.types.js';
import type { ProgressiveSceneUpdate, ResolvedSceneAsset, ResolvedSceneSnapshot } from '#types/runtime-scene.types.js';
import type { RuntimeFileSystemBase } from '#types/runtime-kernel.types.js';
import type { KernelWorker } from '#framework/kernel-worker.js';
import { logFlushDebounce } from '#framework/runtime-framework.constants.js';
import { createErrorTrap } from '#framework/worker-error-trap.js';
import { packageVersion } from '#utils/package-info.js';
import { protocolVersion } from '#types/protocol-header.types.js';
import type {
  EncodedBinary,
  EncodedGeometry,
  HostInitializeBindings,
  RuntimeInitializeMemoryHandle,
} from '#transport/runtime-transport.types.js';
import { RuntimeAlreadyInitializedError } from '#transport/runtime-transport.types.js';
import { createComputeStoreChannelClient } from '#transport/_internal/compute-store-channel.js';

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
/** Encode one owned binary payload for its selected delivery tier. @public */
export type BinaryEncoder = (key: string, bytes: Uint8Array<ArrayBuffer>) => EncodedBinary;

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

const issueSeverities = new Set(['error', 'warning', 'info']);

/**
 * Make one issue row acceptable to the runtime protocol's `kernelIssueSchema`.
 *
 * A row the schema rejects is not a degraded frame — the receiving channel
 * drops the whole notify silently, so a kernel's issues, a render's failure or
 * an export's diagnosis vanish entirely (`libs/rpc/src/channel.ts`,
 * `handleNotifyFrame`). `severity` is repaired for the same reason `code` is:
 * these rows cross the boundary from arbitrary kernel and middleware code, and
 * the wire is the last place that can still see them.
 *
 * @param issue - Candidate issue row from kernel, middleware or framework code.
 * @returns The row with a protocol-valid `code` and `severity`.
 */
function normaliseIssueForWire<T extends { code?: unknown; severity?: unknown }>(
  issue: T,
): T & { code: KernelIssueCode; severity: 'error' | 'warning' | 'info' } {
  const code = isKernelIssueCode(issue.code) ? issue.code : 'UNKNOWN';
  const severity =
    typeof issue.severity === 'string' && issueSeverities.has(issue.severity)
      ? (issue.severity as 'error' | 'warning' | 'info')
      : 'error';
  return { ...issue, code, severity };
}

function prepareExportTransfer(
  result: ExportGeometryResult,
  options: { encode: BinaryEncoder; publicationId: number; transferables: Transferable[] },
): unknown {
  const issues = result.issues.map(normaliseIssueForWire);
  if (!result.success) {
    return { ...result, issues };
  }

  const data = result.data.map((file, index) => {
    const encoded = options.encode(`export:${options.publicationId}:${index}`, file.bytes);
    options.transferables.push(...encoded.transferables);
    return { ...file, bytes: encoded.value };
  });
  return { ...result, data, issues };
}

function prepareSourceSnapshotTransfer(
  result: RuntimeSourceSnapshotResult,
  transferables: Transferable[],
): RuntimeSourceSnapshotResult {
  const issues = result.issues.map(normaliseIssueForWire);
  if (!result.success) {
    return { ...result, issues };
  }
  const files = result.data.files.map((file) => {
    const content = new Uint8Array(file.content);
    transferables.push(content.buffer);
    return { ...file, content };
  });
  return { ...result, data: { ...result.data, files }, issues };
}

function prepareSceneAssetTransfer(
  asset: ResolvedSceneAsset,
  context: {
    readonly encode: GeometryEncoder;
    readonly transferables: Transferable[];
    readonly sentContentDigests?: Set<ResolvedSceneAsset['contentDigest']>;
  },
): ResolvedSceneAssetTransport {
  if (context.sentContentDigests?.has(asset.contentDigest)) {
    return {
      delivery: 'reference',
      contentDigest: asset.contentDigest,
      mediaType: asset.mediaType,
      byteLength: asset.byteLength,
    };
  }
  const geometry = applyGeometryEncoder(
    { ...asset.geometry, hash: asset.contentDigest },
    context.encode,
    context.transferables,
  );
  context.sentContentDigests?.add(asset.contentDigest);
  return { ...asset, delivery: 'inline', geometry };
}

function prepareSceneSnapshotTransfer(
  snapshot: ResolvedSceneSnapshot,
  context: Parameters<typeof prepareSceneAssetTransfer>[1],
): ResolvedSceneSnapshotTransport {
  return {
    manifest: snapshot.manifest,
    assets: snapshot.assets.map((asset) => prepareSceneAssetTransfer(asset, context)),
  };
}

function prepareSceneUpdateTransfer(
  update: ProgressiveSceneUpdate,
  context: Parameters<typeof prepareSceneAssetTransfer>[1],
): ProgressiveSceneUpdateTransport {
  switch (update.type) {
    case 'reset': {
      return {
        ...update,
        snapshot: prepareSceneSnapshotTransfer(update.snapshot, context),
      };
    }
    case 'delta': {
      return {
        ...update,
        assets: update.assets.map((asset) => prepareSceneAssetTransfer(asset, context)),
      };
    }
    case 'refinement': {
      return {
        ...update,
        replacements: update.replacements.map((replacement) => ({
          ...replacement,
          replacement: prepareSceneAssetTransfer(replacement.replacement, context),
        })),
      };
    }
    case 'bookmark': {
      return update;
    }
  }
}

const sceneQueueClosed = Symbol('sceneQueueClosed');

/** One-slot rendezvous: the kernel cannot outrun a paused RPC consumer. */
class SceneUpdateQueue {
  private pending:
    | { readonly update: ProgressiveSceneUpdate; readonly consumed: ReturnType<typeof Promise.withResolvers<void>> }
    | undefined;
  private waiter:
    | ReturnType<typeof Promise.withResolvers<ProgressiveSceneUpdate | typeof sceneQueueClosed>>
    | undefined;
  private closed = false;

  public async push(update: ProgressiveSceneUpdate): Promise<void> {
    if (this.closed) {
      return;
    }
    if (this.waiter) {
      const { waiter } = this;
      this.waiter = undefined;
      waiter.resolve(update);
      return;
    }
    if (this.pending) {
      await this.pending.consumed.promise;
      return this.push(update);
    }
    const consumed = Promise.withResolvers<void>();
    this.pending = { update, consumed };
    await consumed.promise;
  }

  public async shift(signal: AbortSignal): Promise<ProgressiveSceneUpdate | typeof sceneQueueClosed> {
    if (this.pending) {
      const { pending } = this;
      this.pending = undefined;
      pending.consumed.resolve();
      return pending.update;
    }
    if (this.closed || signal.aborted) {
      return sceneQueueClosed;
    }
    const waiter = Promise.withResolvers<ProgressiveSceneUpdate | typeof sceneQueueClosed>();
    this.waiter = waiter;
    const abort = (): void => {
      waiter.resolve(sceneQueueClosed);
    };
    signal.addEventListener('abort', abort, { once: true });
    try {
      return await waiter.promise;
    } finally {
      signal.removeEventListener('abort', abort);
      if (this.waiter === waiter) {
        this.waiter = undefined;
      }
    }
  }

  public close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.pending?.consumed.resolve();
    this.pending = undefined;
    this.waiter?.resolve(sceneQueueClosed);
    this.waiter = undefined;
  }
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
 * The geometry encoder is produced by the
 * transport host's `adoptInitialize(...)` bindings. The dispatcher
 * uses them verbatim so the wire-tier decision (pool/transfer/copy)
 * stays inside the transport plugin and the dispatcher never reads
 * `port.capabilities`.
 *
 * @public
 */
export type WorkerDispatcherOptions = {
  readonly inlineFileSystem?: RuntimeFileSystemBase;
  /** Trusted host-side compute authority; takes precedence over client initialize fields. */
  readonly computeStorePort?: MessagePortLike | Port<unknown>;
  /** Trusted host-side mode when no durable authority is present. */
  readonly computeBindingMode?: 'off' | 'memory';
  /**
   * Transport-supplied geometry encoder (typically
   * `bindings.geometryDelivery.publish`). When omitted the dispatcher
   * falls back to inline / copy delivery (no transferables, no pool).
   */
  readonly encodeGeometry?: GeometryEncoder;
  /** Transport-supplied pooled/transfer encoder for export file bytes. */
  readonly encodeBinary?: BinaryEncoder;
  /** Transport-owned pooled-delivery acknowledgement handler. */
  readonly acknowledgeBinary?: (key: string) => void;
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

const inlineBinaryEncoder: BinaryEncoder = (_key, source) => {
  const bytes = new Uint8Array(source);
  return { value: { delivery: 'inline', bytes }, transferables: [bytes.buffer], tier: 'transfer' };
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

  /* Transport host injects its geometry encoder via
   * `dispatcherOptions`. When omitted (smoke tests, in-isolate hosts)
   * the dispatcher falls back to an inline-only encoder. When the
   * caller supplies `bindingsFactory`, the encoders are swapped to
   * the bindings' SAB-aware variants the moment `initialize` lands.
   * The dispatcher never reads `port.capabilities` directly. */
  let encodeGeometry: GeometryEncoder = dispatcherOptions?.encodeGeometry ?? inlineGeometryEncoder;
  let encodeBinary: BinaryEncoder = dispatcherOptions?.encodeBinary ?? inlineBinaryEncoder;
  let acknowledgeBinary = dispatcherOptions?.acknowledgeBinary ?? (() => undefined);
  let exportPublicationId = 0;
  const sceneSubscribers = new Set<SceneUpdateQueue>();

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

    worker.onStateChanged = (event) => {
      notify('stateChanged', event);
    };

    worker.onGeometryComputed = ({ result, renderId }) => {
      flushLogs();
      worker.flushTelemetry();
      const transferables: Transferable[] = [];
      const transport = toTransportResult(result, encodeGeometry, transferables);
      const args: WithTransferables<RuntimeGeometryComputedArgs> = {
        value: { result: transport, renderId },
        transferables,
      };
      notify('geometryComputed', args);
    };

    worker.onSceneUpdate = async (event) => {
      await Promise.all(
        [...sceneSubscribers].map(async (subscriber) => {
          await subscriber.push(event);
        }),
      );
    };

    worker.onParametersResolved = (event) => {
      notify('parametersResolved', event);
    };

    worker.onProgressUpdate = (event) => {
      notify('progress', event);
    };

    worker.onError = ({ issues, renderId }) => {
      notify('errorEvent', {
        issues: issues.map((issue) => normaliseIssueForWire(issue)),
        ...(renderId === undefined ? {} : { renderId }),
      });
    };

    worker.onActiveKernelChanged = ({ kernelId, renderId }) => {
      notify('activeKernelChanged', { kernelId, ...(renderId === undefined ? {} : { renderId }) });
    };

    worker.onCapabilitiesUpdated = (capabilities) => {
      notify('capabilitiesUpdated', { capabilities });
    };

    worker.onKernelEvent = (event) => {
      notify('kernelEvent', event);
    };
  };

  let initializing = false;
  let initialized = false;
  let computeStoreClient: ReturnType<typeof createComputeStoreChannelClient> | undefined;
  const handleInitialize: (
    args: RuntimeProtocol['calls']['initialize']['args'],
  ) => Promise<RuntimeProtocol['calls']['initialize']['result']> = async (args) => {
    if (initializing || initialized) {
      throw new RuntimeAlreadyInitializedError();
    }
    initializing = true;
    const { promise: trapPromise, cleanup: cleanupTrap } = createErrorTrap();
    try {
      wireWorkerCallbacks();

      const { memoryHandle } = args;
      worker.setDevtoolsTelemetryEnabled(memoryHandle?.devtoolsTelemetry === true);
      worker.setCompiledWasmModules(memoryHandle?.compiledWasmModules ?? []);
      if (memoryHandle?.signalBuffer) {
        worker.setSignalBuffer(memoryHandle.signalBuffer);
      }
      const computeStorePort = dispatcherOptions?.computeStorePort ?? memoryHandle?.computeStorePort;
      if (computeStorePort) {
        computeStoreClient = createComputeStoreChannelClient(computeStorePort);
        worker.setComputeBinding({ mode: 'durable', store: computeStoreClient.store });
      } else if ((dispatcherOptions?.computeBindingMode ?? memoryHandle?.computeBindingMode) === 'off') {
        worker.setComputeBinding({ mode: 'off' });
      } else if (
        dispatcherOptions?.computeBindingMode === 'memory' ||
        memoryHandle?.computeBindingMode === 'memory' ||
        memoryHandle?.computeBindingMode === 'durable'
      ) {
        worker.setComputeBinding({ mode: 'memory' });
      }
      /* Late-bind the host bindings now that we have the inbound
       * `memoryHandle`. The bindings' geometry encoder wins
       * over the early-bound encoders supplied at dispatcher
       * construction time, so the same dispatcher transparently
       * upgrades from `transfer` to `pool` tier when the client
       * allocates SABs at runtime. */
      if (dispatcherOptions?.bindingsFactory && memoryHandle) {
        const bindings = dispatcherOptions.bindingsFactory(memoryHandle);
        encodeGeometry = bindings.geometryDelivery.publish;
        encodeBinary = bindings.geometryDelivery.publishBytes;
        acknowledgeBinary = bindings.geometryDelivery.acknowledge;
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

      initialized = true;
      return { capabilities: worker.capabilitiesManifest };
    } catch (error) {
      computeStoreClient?.dispose();
      computeStoreClient = undefined;
      throw error;
    } finally {
      initializing = false;
      cleanupTrap();
    }
  };

  const handleExport: (
    args: RuntimeProtocol['calls']['export']['args'],
    signal?: AbortSignal,
  ) => Promise<ExportGeometryResult> = async (args, signal) => {
    const { promise: trapPromise, cleanup: cleanupTrap } = createErrorTrap();
    try {
      return await Promise.race([worker.exportGeometry(args.format, args.options, args.content, signal), trapPromise]);
    } finally {
      worker.flushTelemetry();
      cleanupTrap();
    }
  };

  const handleExportModel: (
    args: RuntimeProtocol['calls']['exportModel']['args'],
    signal?: AbortSignal,
  ) => Promise<ExportGeometryResult> = async (args, signal) => {
    const { promise: trapPromise, cleanup: cleanupTrap } = createErrorTrap();
    try {
      return await Promise.race([worker.exportModel(args, signal), trapPromise]);
    } finally {
      worker.flushTelemetry();
      cleanupTrap();
    }
  };

  const handleEvaluateModel: (
    args: RuntimeProtocol['calls']['evaluateModel']['args'],
    signal?: AbortSignal,
  ) => Promise<HashedGeometryResult> = async (args, signal) => {
    const { promise: trapPromise, cleanup: cleanupTrap } = createErrorTrap();
    try {
      return await Promise.race([worker.evaluateModel(args, signal), trapPromise]);
    } finally {
      worker.flushTelemetry();
      cleanupTrap();
    }
  };

  const handleTranscode: (
    args: RuntimeProtocol['calls']['transcode']['args'],
    signal?: AbortSignal,
  ) => Promise<ExportGeometryResult> = async (args, signal) => {
    const { promise: trapPromise, cleanup: cleanupTrap } = createErrorTrap();
    try {
      return await Promise.race([worker.transcode(args, signal), trapPromise]);
    } finally {
      worker.flushTelemetry();
      cleanupTrap();
    }
  };

  const handleSourceSnapshot: (
    args: RuntimeProtocol['calls']['snapshotSource']['args'],
    signal?: AbortSignal,
  ) => Promise<RuntimeSourceSnapshotResult> = async (args, signal) => {
    const { promise: trapPromise, cleanup: cleanupTrap } = createErrorTrap();
    try {
      return await Promise.race([worker.snapshotSource(args, signal), trapPromise]);
    } finally {
      worker.flushTelemetry();
      cleanupTrap();
    }
  };

  type CallResult = Awaited<ReturnType<ChannelServer<RuntimeProtocol>['call']>>;

  const impl: ChannelServer<RuntimeProtocol> = {
    // oxlint-disable-next-line max-params -- ChannelServer.call signature is fixed (ctx, name, args, signal); parameter count is enforced by the protocol contract.
    async call(_context, name, args, signal) {
      switch (name) {
        case 'initialize': {
          const result = await handleInitialize(args as RuntimeProtocol['calls']['initialize']['args']);
          return result as unknown as CallResult;
        }
        case 'export': {
          const result = await handleExport(args as RuntimeProtocol['calls']['export']['args'], signal);
          const transferables: Transferable[] = [];
          const value = prepareExportTransfer(result, {
            encode: encodeBinary,
            publicationId: ++exportPublicationId,
            transferables,
          });
          const envelope: WithTransferables<unknown> = {
            value,
            transferables,
          };
          return envelope as unknown as CallResult;
        }
        case 'exportModel': {
          const result = await handleExportModel(args as RuntimeProtocol['calls']['exportModel']['args'], signal);
          const transferables: Transferable[] = [];
          const value = prepareExportTransfer(result, {
            encode: encodeBinary,
            publicationId: ++exportPublicationId,
            transferables,
          });
          const envelope: WithTransferables<unknown> = {
            value,
            transferables,
          };
          return envelope as unknown as CallResult;
        }
        case 'evaluateModel': {
          const result = await handleEvaluateModel(args as RuntimeProtocol['calls']['evaluateModel']['args'], signal);
          const transferables: Transferable[] = [];
          const value = toTransportResult(result, encodeGeometry, transferables);
          return { value, transferables } as unknown as CallResult;
        }
        case 'snapshotSource': {
          const result = await handleSourceSnapshot(args as RuntimeProtocol['calls']['snapshotSource']['args'], signal);
          const transferables: Transferable[] = [];
          const value = prepareSourceSnapshotTransfer(result, transferables);
          return { value, transferables } as unknown as CallResult;
        }
        case 'readSceneSnapshot': {
          const result = await worker.readSceneSnapshot(
            args as RuntimeProtocol['calls']['readSceneSnapshot']['args'],
            signal,
          );
          if (result.type === 'missing') {
            return result as unknown as CallResult;
          }
          const transferables: Transferable[] = [];
          const value = {
            type: 'found',
            snapshot: prepareSceneSnapshotTransfer(result.snapshot, { encode: encodeGeometry, transferables }),
          } as const;
          return { value, transferables } as unknown as CallResult;
        }
        case 'listSceneBookmarks': {
          return worker.listSceneBookmarks(
            args as RuntimeProtocol['calls']['listSceneBookmarks']['args'],
          ) as unknown as CallResult;
        }
        case 'transcode': {
          const result = await handleTranscode(args as RuntimeProtocol['calls']['transcode']['args'], signal);
          const transferables: Transferable[] = [];
          const value = prepareExportTransfer(result, {
            encode: encodeBinary,
            publicationId: ++exportPublicationId,
            transferables,
          });
          return { value, transferables } as unknown as CallResult;
        }
        case 'cleanup': {
          if (logFlushTimer) {
            clearTimeout(logFlushTimer);
            logFlushTimer = undefined;
          }
          flushLogs();
          await worker.cleanup();
          computeStoreClient?.dispose();
          computeStoreClient = undefined;
          return null as unknown as CallResult;
        }
      }
    },

    notify(_context, name, args) {
      const runPreviewCommand = (renderId: string, command: () => unknown): void => {
        const report = (error: unknown): void => {
          notify('errorEvent', { issues: errorToIssues(error), renderId });
        };
        try {
          const result = command();
          if (result instanceof Promise) {
            // oxlint-disable-next-line promise/prefer-await-to-then, tau-lint/no-async-iife -- RPC notifies are fire-and-forget; this boundary reports returned rejections.
            void result.catch(report);
          }
        } catch (error) {
          report(error);
        }
      };
      switch (name) {
        case 'openFile': {
          const a = args as RuntimeProtocol['notifies']['openFile']['args'];
          runPreviewCommand(a.renderId, () => {
            worker.handleOpenFile(a);
          });
          break;
        }
        case 'stage-and-render': {
          const a = args as RuntimeProtocol['notifies']['stage-and-render']['args'];
          runPreviewCommand(a.renderId, async () => {
            await worker.handleStageAndOpenFile(a);
          });
          break;
        }
        case 'updateParameters': {
          const a = args as RuntimeProtocol['notifies']['updateParameters']['args'];
          runPreviewCommand(a.renderId, () => {
            worker.handleUpdateParameters(a);
          });
          break;
        }
        case 'setOptions': {
          const a = args as RuntimeProtocol['notifies']['setOptions']['args'];
          runPreviewCommand(a.renderId, () => {
            worker.handleSetOptions(a);
          });
          break;
        }
        case 'abort': {
          const a = args as RuntimeProtocol['notifies']['abort']['args'];
          worker.handleWireAbort(a);
          break;
        }
        case 'binaryMaterialised': {
          const a = args as RuntimeProtocol['notifies']['binaryMaterialised']['args'];
          acknowledgeBinary(a.key);
          break;
        }
        case 'kernelCommand': {
          // Reserved for kernel-owned command routing in a later protocol revision.
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
        case 'capabilitiesUpdated':
        case 'kernelEvent': {
          // No-op: server never receives these.
          break;
        }
      }
    },

    // eslint-disable-next-line max-params -- typed RPC listener signature is fixed by ChannelServer.
    async *listen(_context, _event, args, signal) {
      const queue = new SceneUpdateQueue();
      const sentContentDigests = new Set<ResolvedSceneAsset['contentDigest']>();
      const afterSequence = args.afterSequence ?? -1;
      sceneSubscribers.add(queue);
      worker.setProgressiveSceneRequested(true);
      try {
        while (!signal.aborted) {
          // eslint-disable-next-line no-await-in-loop -- each item is delivered only after downstream demand.
          const update = await queue.shift(signal);
          if (update === sceneQueueClosed) {
            return;
          }
          if (update.sequence <= afterSequence) {
            continue;
          }
          if (update.type === 'reset' && update.skippedBefore > 0) {
            sentContentDigests.clear();
          }
          const transferables: Transferable[] = [];
          const value = prepareSceneUpdateTransfer(update, {
            encode: encodeGeometry,
            transferables,
            sentContentDigests,
          });
          yield { value, transferables } as unknown as WithTransferables<ProgressiveSceneUpdate>;
        }
      } finally {
        queue.close();
        sceneSubscribers.delete(queue);
        worker.setProgressiveSceneRequested(sceneSubscribers.size > 0);
      }
    },
  };

  const helloPayload: RuntimeHelloPayload = {
    server: 'kernel-runtime-worker',
    runtimeVersion: packageVersion,
    protocolVersion,
  };

  const deliveryPort: Port<unknown> = {
    ...port,
    postMessage(message, transferables) {
      port.postMessage(message, transferables);
      if (typeof message === 'object' && message !== null && 'k' in message && message.k === 'rs') {
        worker.permitComputePublication();
      }
    },
  };
  serverHandle = createChannelServer<RuntimeProtocol>({
    port: deliveryPort,
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
