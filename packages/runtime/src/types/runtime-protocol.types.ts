/**
 * Kernel Worker Protocol Types
 *
 * Defines the typed `@taucad/rpc` {@link RuntimeProtocol} contract
 * carried by every runtime transport. Calls (`initialize`, `export`,
 * `exportModel`)
 * are correlated by the channel envelope; notifies cover the
 * autonomous client→worker commands and worker→client events.
 */

import type { WithTransferables } from '@taucad/rpc';
import type { FileExtension, GeometryFile, GeometrySvg, GeometryWebRtc, LogEntry } from '@taucad/types';
import type {
  GetParametersResult,
  ExportGeometryResult,
  KernelIssue,
  KernelResult,
  CapabilitiesManifest,
} from '#types/runtime.types.js';

// =============================================================================
// Two-Layer Geometry Transport Types
// =============================================================================

/**
 * Discriminated delivery descriptor for GLTF content in transit.
 *
 * `inline` carries the raw bytes in the message (traditional ArrayBuffer transfer).
 * `pooled` carries only the pool/key coordinates — the main thread resolves bytes
 * from SharedPool for zero-copy access.
 * @internal
 */
export type GltfContentDelivery =
  | { readonly delivery: 'inline'; readonly bytes: Uint8Array<ArrayBuffer> }
  | { readonly delivery: 'pooled'; readonly key: string };

/**
 * GLTF geometry in transit — content delivered inline or via shared pool.
 * @internal
 */
export type GeometryGltfTransport = {
  readonly format: 'gltf';
  readonly content: GltfContentDelivery;
};

/**
 * All geometry variants in transit.
 * SVG and WebRTC pass through unchanged — only GLTF uses the two-layer transport.
 * @internal
 */
export type GeometryResponseTransport = GeometrySvg | GeometryGltfTransport | GeometryWebRtc;

/**
 * Hashed geometry in transit (wire format).
 * @internal
 */
export type GeometryTransport = GeometryResponseTransport & { readonly hash: string };

/**
 * Full geometry result in transit (wire format).
 * Used on the MessagePort protocol; resolved to `HashedGeometryResult` by RuntimeClient.
 * @internal
 */
export type HashedGeometryResultTransport = KernelResult<GeometryTransport>;

/**
 * Caller-owned `SharedArrayBuffer` that backs file-content caching across
 * the File Manager Worker and the Kernel Worker. The runtime never allocates
 * or owns this buffer — it is forwarded verbatim through the transport.
 * @internal
 */
export type FilePoolHandle = SharedArrayBuffer;

/**
 * Runtime-owned `SharedArrayBuffer` that backs zero-copy geometry transfer
 * between the worker and the main thread. Allocated inside
 * `RuntimeWorkerClient.configureMemory`; consumers never see the bytes.
 * @internal
 */
export type GeometryPoolHandle = SharedArrayBuffer;

/**
 * Runtime-owned `SharedArrayBuffer` carrying the cooperative-abort
 * generation/reason slots ({@link signalSlot}). Allocated inside
 * `RuntimeWorkerClient.configureMemory` on SAB-capable runners;
 * `undefined` on runners that translate aborts to wire commands.
 * @internal
 */
export type SignalBufferHandle = SharedArrayBuffer;

/**
 * Opaque payload returned by `RuntimeWorkerClient.configureMemory` and
 * forwarded verbatim by `RuntimeWorkerClient.initialize` so the worker side
 * can wire up signal/geometry/file pools without the runtime client ever
 * touching `SharedArrayBuffer`/`Atomics`/`signalSlot`.
 *
 * The shape is structural by design — every field is optional so SAB-less
 * transports can pass `{}` and the dispatcher's `case 'initialize':`
 * branch stays uniform.
 *
 * `fileSystemPort` is the bridge `MessagePort` constructed by the transport
 * plugin from the opaque `RuntimeFileSystem` value handed to its
 * `client({ fileSystem })` factory. The dispatcher reads it from this
 * handle to attach the FS bridge to the kernel worker.
 * @internal
 */
export type InitializeMemoryHandle = {
  signalBuffer?: SignalBufferHandle;
  geometryPoolBuffer?: GeometryPoolHandle;
  filePoolBuffer?: FilePoolHandle;
  fileSystemPort?: MessagePort;
};

/**
 * Numeric encoding of {@link abortReason} written into `signalSlot.abortReason`
 * (and carried inline by the wire-format `'abort'` notify on
 * {@link RuntimeProtocol}).
 * @internal
 */
export type AbortReasonCode = (typeof abortReason)[keyof typeof abortReason];

/**
 * Telemetry entry data collected via PerformanceObserver in the worker.
 * @public
 */
export type TelemetryEntry = {
  name: string;
  startTime: number;
  duration: number;
  detail?: Record<string, unknown>;
  workerTimeOrigin: number;
};

/**
 * Rendering phase identifier for progress tracking.
 * Framework-defined conventions: 'resolvingDeps', 'bundling', 'extractingParams',
 * 'computingGeometry', 'postProcessing'. Bundler and kernel modules may emit
 * custom phase strings for domain-specific progress tracking.
 * @public
 */
export type RenderPhase = string;

/**
 * Worker state reported via the single ordered `postMessage` channel.
 * Consumers observe transitions in the worker's emit order.
 * @public
 */
export type WorkerState = 'idle' | 'buffering' | 'rendering' | 'error';

/**
 * Int32Array index layout for the bidirectional GrowableSharedArrayBuffer signal channel.
 *
 * The SAB carries cooperative-abort signalling only; worker state, progress
 * percent, and render-phase identifiers all flow through the single ordered
 * `postMessage` channel.
 *
 * - Slot 0: abort generation (main -> worker, `Atomics.add` / `Atomics.load`).
 * - Slot 1: abort reason (main -> worker, `Atomics.store` / `Atomics.load`).
 * @internal
 */
export const signalSlot = {
  abortGeneration: 0,
  abortReason: 1,
} as const;

/**
 * Reason why the current render was aborted, written by the main thread
 * and read by the worker to decide how to handle the abort (error vs. silent discard).
 * @internal
 */
export const abortReason = {
  none: 0,
  superseded: 1,
  timeout: 2,
} as const;

/**
 * Reason a render was aborted, threaded through the cooperative-abort
 * signalling slot. `'superseded'` indicates a newer `openFile`/`updateParameters`/`setOptions`
 * call took ownership; `'timeout'` indicates the wall-clock render timeout fired.
 *
 * Transports translate this to the correct {@link abortReason} numeric
 * encoding internally.
 * @internal
 */
export type AbortReason = 'superseded' | 'timeout';

// =============================================================================
// RuntimeProtocol — typed `@taucad/rpc` contract
// =============================================================================

/**
 * Args for the `initialize` request. The `requestId` slot of the
 * pre-channel surface is gone — correlation is owned by `Channel.call`'s
 * wire envelope.
 * @internal
 */
export type RuntimeInitializeArgs = {
  config?: unknown;
  memoryHandle?: InitializeMemoryHandle;
};

/**
 * Result of the `initialize` request — capabilities snapshot.
 * @internal
 */
export type RuntimeInitializeResult = { capabilities: CapabilitiesManifest };

/**
 * Server hello payload (`lh.d`) emitted by `createWorkerDispatcher` before
 * any other frame (R14). Identifies the kernel-runtime-worker server and
 * carries the runtime package version so consumers can sanity-check the
 * remote build before issuing `initialize`. The full
 * {@link CapabilitiesManifest} is intentionally not included here — it is
 * resolved lazily and returned by the `initialize` call so kernel-module
 * loads can defer until the seam is open.
 * @internal
 */
export type RuntimeHelloPayload = {
  readonly server: 'kernel-runtime-worker';
  readonly runtimeVersion: string;
};

/**
 * Args for the `export` request.
 * @internal
 */
export type RuntimeExportArgs = {
  readonly format: FileExtension;
  readonly options?: Record<string, unknown>;
};

/**
 * Args for the request-scoped `exportModel` request.
 *
 * Unlike `export`, this call owns its render input. It may stage inline
 * source files first, then exports the exact `file + parameters + options`
 * request without mutating the autonomous preview render state.
 *
 * @internal
 */
export type RuntimeExportModelArgs = {
  readonly stage?: Record<string, Uint8Array<ArrayBuffer>>;
  readonly file: GeometryFile;
  readonly parameters: Record<string, unknown>;
  readonly options?: Record<string, unknown>;
  readonly format: FileExtension;
  readonly exportOptions?: Record<string, unknown>;
};

/**
 * Args for the autonomous `openFile` notify.
 * @internal
 */
export type RuntimeOpenFileArgs = {
  readonly file: GeometryFile;
  readonly parameters: Record<string, unknown>;
  readonly options?: Record<string, unknown>;
};

/**
 * Args for the autonomous `stage-and-render` notify (overlay-FS bytes
 * staged before opening the entry; replaces TR7's inline-FS handle).
 * @internal
 */
export type RuntimeStageAndRenderArgs = {
  readonly stage: Record<string, Uint8Array<ArrayBuffer>>;
  readonly file: GeometryFile;
  readonly parameters: Record<string, unknown>;
  readonly options?: Record<string, unknown>;
};

/**
 * Args for the autonomous `progress` notify. The render generation
 * (`rgen`) gates downstream consumers so frames from superseded renders
 * can be discarded. The legacy `requestId` correlation slot is gone —
 * progress is a global event in the channel model since at most one
 * render is in flight per worker at a time.
 * @internal
 */
export type RuntimeProgressArgs = {
  readonly phase: RenderPhase;
  readonly rgen: number;
  readonly detail?: Record<string, unknown>;
};

/**
 * Args for the autonomous `geometryComputed` notify. Render bytes hoist
 * via {@link WithTransferables} so the channel walker can choose the
 * fastest delivery tier (`pool → transfer → copy`). `rgen` correlates
 * the frame with the originating render generation.
 * @internal
 */
export type RuntimeGeometryComputedArgs = {
  readonly result: HashedGeometryResultTransport;
  readonly rgen: number;
};

/**
 * Args for the autonomous `parametersResolved` notify. `rgen`
 * correlates the resolved parameter schema with the originating render
 * generation so the consumer can pair early-arriving parameter frames
 * with the eventual `geometryComputed` for the same `rgen`.
 * @internal
 */
export type RuntimeParametersResolvedArgs = {
  readonly result: GetParametersResult;
  readonly rgen: number;
};

/**
 * Args for the autonomous `errorEvent` notify. `rgen` is present when
 * the issue is render-scoped and absent when the failure is
 * connection-scoped (e.g. handshake failure, transcoder load).
 * @internal
 */
export type RuntimeErrorEventArgs = {
  readonly issues: readonly KernelIssue[];
  readonly rgen?: number;
};

/**
 * Args for the autonomous `stateChanged` notify.
 * @internal
 */
export type RuntimeStateChangedArgs = {
  readonly state: WorkerState;
  readonly detail?: string;
};

/**
 * Client → worker fire-and-forget command names. These 7 command names
 * drive every C→W interaction in the kernel runtime protocol. A
 * companion type-level guard in `runtime-protocol.runtime.test.ts`
 * fails closed if a command is added/removed without updating both
 * surfaces.
 * @internal
 */
export const runtimeProtocolClientNotifyNames = [
  'openFile',
  'stage-and-render',
  'updateParameters',
  'setOptions',
  'fileChanged',
  'cleanup',
  'abort',
] as const;

/**
 * Worker → client autonomous event names. These 10 event names cover
 * every W→C notify path in the kernel runtime protocol.
 * `geometryComputed` carries transferables; `progress` and
 * `geometryComputed` carry `rgen` so consumers can ignore frames from
 * superseded renders.
 * @internal
 */
export const runtimeProtocolWorkerNotifyNames = [
  'parametersResolved',
  'geometryComputed',
  'errorEvent',
  'progress',
  'activeKernelChanged',
  'stateChanged',
  'log',
  'logBatch',
  'telemetry',
  'capabilitiesUpdated',
] as const;

/**
 * Combined notify name inventory — exactly 17 keys (7 C→W + 10 W→C).
 * @internal
 */
export const runtimeProtocolNotifyNames = [
  ...runtimeProtocolClientNotifyNames,
  ...runtimeProtocolWorkerNotifyNames,
] as const;

/**
 * Request/response call name inventory — exactly three calls
 * (`initialize`, `export`, `exportModel`). The legacy `render` call is deleted; the
 * autonomous `openFile` notify + `geometryComputed` correlation by
 * `rgen` replaces it (R18, mirrors LSP `didOpen` + diagnostics).
 * @internal
 */
export const runtimeProtocolCallNames = ['initialize', 'export', 'exportModel'] as const;

/**
 * Typed `@taucad/rpc` protocol contract for the kernel runtime worker.
 *
 * - `calls`: request/response RPCs. `initialize` bootstraps the worker,
 *   `export` exports current settled geometry, and `exportModel` exports
 *   an exact request-scoped model without mutating preview state. The legacy
 *   `render` call is gone — production
 *   drives renders autonomously via the `openFile` notify and consumes
 *   `geometryComputed` notifies correlated by `rgen` (R18, mirrors LSP
 *   `didOpen` + diagnostics).
 * - `notifies`: bidirectional fire-and-forget — exactly 17 keys total.
 *   7 client→worker commands (`openFile`, `stage-and-render`,
 *   `updateParameters`, `setOptions`, `fileChanged`, `cleanup`, `abort`)
 *   plus 10 worker→client
 *   autonomous events (`parametersResolved`, `geometryComputed`,
 *   `errorEvent`, `progress`, `activeKernelChanged`, `stateChanged`,
 *   `log`, `logBatch`, `telemetry`, `capabilitiesUpdated`).
 * - `listens`: reserved for future consumer-pulled streams (e.g. file
 *   watch, log tail). Empty in v5 because every streaming flow lands as
 *   a notify.
 *
 * Binary delivery uses {@link WithTransferables} sidecars on the
 * `export` call result and the `geometryComputed` notify args. The
 * transport (not the dispatcher) selects the delivery tier
 * (`pool → transfer → copy`) via its `encodeGeometry` / `encodeFile`
 * encoders — wire facts stay private to the transport adapter.
 *
 * Conforms to `RpcProtocol` from `@taucad/rpc`. Use as
 * `Channel<RuntimeProtocol>` and `ChannelServer<RuntimeProtocol>`.
 *
 * @internal
 */
export type RuntimeProtocol = {
  readonly calls: {
    readonly initialize: {
      readonly args: RuntimeInitializeArgs;
      readonly result: RuntimeInitializeResult;
    };
    readonly export: {
      readonly args: RuntimeExportArgs;
      readonly result: ExportGeometryResult;
    };
    readonly exportModel: {
      readonly args: RuntimeExportModelArgs;
      readonly result: ExportGeometryResult;
    };
  };
  readonly notifies: {
    readonly openFile: { readonly args: RuntimeOpenFileArgs };
    readonly 'stage-and-render': { readonly args: RuntimeStageAndRenderArgs };
    readonly updateParameters: {
      readonly args: { readonly parameters: Record<string, unknown> };
    };
    readonly setOptions: {
      readonly args: { readonly options: Record<string, unknown> };
    };
    readonly fileChanged: {
      readonly args: { readonly paths: readonly string[] };
    };
    readonly cleanup: { readonly args: undefined };
    readonly abort: { readonly args: { readonly reason: AbortReasonCode } };

    readonly parametersResolved: {
      readonly args: RuntimeParametersResolvedArgs;
    };
    readonly geometryComputed: {
      readonly args: RuntimeGeometryComputedArgs;
    };
    readonly errorEvent: { readonly args: RuntimeErrorEventArgs };
    readonly progress: { readonly args: RuntimeProgressArgs };
    readonly activeKernelChanged: {
      readonly args: { readonly kernelId: string | undefined };
    };
    readonly stateChanged: { readonly args: RuntimeStateChangedArgs };
    readonly log: { readonly args: { readonly entry: LogEntry } };
    readonly logBatch: {
      readonly args: { readonly entries: readonly LogEntry[] };
    };
    readonly telemetry: {
      readonly args: { readonly entries: readonly TelemetryEntry[] };
    };
    readonly capabilitiesUpdated: {
      readonly args: { readonly capabilities: CapabilitiesManifest };
    };
  };
  readonly listens: Record<string, never>;
};
