/**
 * Kernel Worker Protocol Types
 *
 * Defines the typed `@taucad/rpc` {@link RuntimeProtocol} contract
 * carried by every runtime transport. Calls (`initialize`, `export`,
 * `exportModel`, `cleanup`) are correlated by the channel envelope;
 * notifies cover the
 * autonomous client→worker commands and worker→client events.
 */

import type { WithTransferables } from '@taucad/rpc';
import type { FileExtension, GeometrySvg, GeometryWebRtc, LogEntry } from '@taucad/types';
import type {
  GetParametersResult,
  ExportGeometryResult,
  KernelIssue,
  KernelResult,
  CapabilitiesManifest,
} from '#types/runtime.types.js';
import type { RuntimeContentInput } from '#types/runtime-content.types.js';

// =============================================================================
// Two-Layer Geometry Transport Types
// =============================================================================

/**
 * Discriminated delivery descriptor for GLTF content in transit.
 *
 * `inline` carries the raw bytes in the message (traditional ArrayBuffer transfer).
 * `pooled` carries only the pool/key coordinates — the main thread resolves bytes
 * from SharedPool for zero-copy access.
 * @public
 */
export type GltfContentDelivery =
  | { readonly delivery: 'inline'; readonly bytes: Uint8Array<ArrayBuffer> }
  | { readonly delivery: 'pooled'; readonly key: string };

/**
 * GLTF geometry in transit — content delivered inline or via shared pool.
 * @public
 */
export type GeometryGltfTransport = {
  readonly format: 'gltf';
  readonly content: GltfContentDelivery;
};

/**
 * All geometry variants in transit.
 * SVG and WebRTC pass through unchanged — only GLTF uses the two-layer transport.
 * @public
 */
export type GeometryResponseTransport = GeometrySvg | GeometryGltfTransport | GeometryWebRtc;

/**
 * Hashed geometry in transit (wire format).
 * @public
 */
export type GeometryTransport = GeometryResponseTransport & { readonly hash: string };

/**
 * Full geometry result in transit (wire format).
 * Used on the MessagePort protocol; resolved to `HashedGeometryResult` by RuntimeClient.
 * @public
 */
export type HashedGeometryResultTransport = KernelResult<GeometryTransport>;

/**
 * Transport-owned `SharedArrayBuffer` that backs zero-copy geometry transfer
 * between the worker and the main thread. Consumers never see the bytes.
 * @public
 */
export type GeometryPoolHandle = SharedArrayBuffer;

/**
 * Transport-owned `SharedArrayBuffer` carrying the cooperative-abort
 * generation/reason slots ({@link signalSlot}). Allocated by SAB-capable transports;
 * `undefined` on runners that translate aborts to wire commands.
 * @public
 */
export type SignalBufferHandle = SharedArrayBuffer;

/**
 * Opaque payload assembled by the transport's `initialize` implementation so
 * the worker side can wire up signal/geometry pools without the runtime
 * client ever touching `SharedArrayBuffer`/`Atomics`/`signalSlot`.
 *
 * The shape is structural by design — every field is optional so SAB-less
 * transports can pass `{}` and the dispatcher's `case 'initialize':`
 * branch stays uniform.
 *
 * `fileSystemPort` is the bridge `MessagePort` constructed by the transport
 * plugin from the opaque `RuntimeFileSystem` value handed to its
 * `client({ fileSystem })` factory. The dispatcher reads it from this
 * handle to attach the FS bridge to the kernel worker.
 * @public
 */
export type InitializeMemoryHandle = {
  signalBuffer?: SignalBufferHandle;
  geometryPoolBuffer?: GeometryPoolHandle;
  fileSystemPort?: MessagePort;
};

/** Numeric timeout reason accepted by the targeted wire abort command. @public */
export type WireAbortReasonCode = typeof abortReason.timeout;

/** Opaque identity for one admitted preview render. @public */
export type RenderId = string;

/** Preview identity plus the transport-owned SAB generation, when available. @public */
export type RuntimePreviewIdentity = {
  readonly renderId: RenderId;
  readonly abortGeneration?: number;
};

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
 * @public
 */
export const signalSlot = {
  abortGeneration: 0,
  abortReason: 1,
} as const;

/**
 * Reason why the current render was aborted, written by the main thread
 * and read by the worker to decide how to handle the abort (error vs. silent discard).
 * @public
 */
export const abortReason = {
  none: 0,
  superseded: 1,
  timeout: 2,
} as const;

/**
 * Reason a render was aborted, threaded through the cooperative-abort
 * signalling slot. `'superseded'` indicates a newer selected preview, including
 * an autonomous watched-filesystem rerender, took ownership; `'timeout'`
 * indicates the wall-clock render timeout fired.
 *
 * Transports translate this to the correct {@link abortReason} numeric
 * encoding internally.
 * @public
 */
export type AbortReason = 'superseded' | 'timeout';

// =============================================================================
// RuntimeProtocol — typed `@taucad/rpc` contract
// =============================================================================

/**
 * Args for the `initialize` request. The `requestId` slot of the
 * pre-channel surface is gone — correlation is owned by `Channel.call`'s
 * wire envelope.
 * @public
 */
export type RuntimeInitializeArgs = {
  config?: unknown;
  memoryHandle?: InitializeMemoryHandle;
  sessionId?: string;
  resumeToken?: string;
};

/**
 * Result of the `initialize` request — capabilities snapshot.
 * @public
 */
export type RuntimeInitializeResult = { capabilities: CapabilitiesManifest };

/**
 * Server hello payload (`lh.d`) emitted by `createWorkerDispatcher` before
 * any other frame (R14). Identifies the kernel-runtime-worker server and
 * carries the runtime package version as handshake metadata. The full
 * {@link CapabilitiesManifest} is intentionally not included here — it is
 * resolved lazily and returned by the `initialize` call so kernel-module
 * loads can defer until the seam is open.
 * @public
 */
export type RuntimeHelloPayload = {
  readonly server: 'kernel-runtime-worker';
  readonly runtimeVersion: string;
  readonly protocolVersion: number;
  readonly sessionId?: string;
  readonly resumeToken?: string;
};

type RuntimeInitializeResultWire = { readonly capabilities: unknown };
type RuntimeExportFileWire = {
  readonly name: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly mimeType: string;
};
type RuntimeExportResultWire = KernelResult<RuntimeExportFileWire[]>;
type RuntimeGeometryComputedArgsWire = {
  readonly result: KernelResult<unknown>;
  readonly renderId: RenderId;
};
type RuntimeParametersResolvedArgsWire = {
  readonly result: KernelResult<{
    readonly defaultParameters: Record<string, unknown>;
    readonly jsonSchema: unknown;
  }>;
  readonly renderId: RenderId;
};
type RuntimeLogArgsWire = { readonly entry: unknown };
type RuntimeLogBatchArgsWire = { readonly entries: readonly unknown[] };
type RuntimeCapabilitiesUpdatedArgsWire = { readonly capabilities: unknown };

/**
 * Args for the `export` request.
 * @public
 */
export type RuntimeExportArgs = {
  readonly format: FileExtension;
  readonly options?: Record<string, unknown>;
  readonly content?: RuntimeContentInput;
};

/**
 * Args for the request-scoped `exportModel` request.
 *
 * Unlike `export`, this call owns its render input. It may stage inline
 * source files first, then exports the exact `file + parameters + options`
 * request without mutating the autonomous preview render state.
 *
 * @public
 */
export type RuntimeExportModelArgs = {
  readonly stage?: Record<string, Uint8Array<ArrayBuffer>>;
  readonly file: { readonly path: string; readonly filename: string };
  readonly parameters: Record<string, unknown>;
  readonly options?: Record<string, unknown>;
  readonly format: FileExtension;
  readonly exportOptions?: Record<string, unknown>;
  readonly content?: RuntimeContentInput;
};

/**
 * Args for the autonomous `openFile` notify.
 * @public
 */
export type RuntimeOpenFileArgs = RuntimePreviewIdentity & {
  readonly file: { readonly path: string; readonly filename: string };
  readonly parameters: Record<string, unknown>;
  readonly options?: Record<string, unknown>;
  readonly content?: RuntimeContentInput;
};

/**
 * Args for the autonomous `stage-and-render` notify (overlay-FS bytes
 * staged before opening the entry; replaces TR7's inline-FS handle).
 * @public
 */
export type RuntimeStageAndRenderArgs = RuntimePreviewIdentity & {
  readonly stage: Record<string, Uint8Array<ArrayBuffer>>;
  readonly file: { readonly path: string; readonly filename: string };
  readonly parameters: Record<string, unknown>;
  readonly options?: Record<string, unknown>;
  readonly content?: RuntimeContentInput;
};

/** Args for a render-scoped parameter update. @public */
export type RuntimeUpdateParametersArgs = RuntimePreviewIdentity & {
  readonly parameters: Record<string, unknown>;
};

/** Args for a render-scoped options update. @public */
export type RuntimeSetOptionsArgs = RuntimePreviewIdentity & {
  readonly options: Record<string, unknown>;
};

/**
 * Args for the autonomous `progress` notify. The opaque `renderId` gates
 * downstream consumers so frames from superseded renders can be discarded.
 * The legacy `requestId` correlation slot is gone —
 * progress is a global event in the channel model since at most one
 * render is in flight per worker at a time.
 * @public
 */
export type RuntimeProgressArgs = {
  readonly phase: RenderPhase;
  readonly renderId: RenderId;
  readonly detail?: Record<string, unknown>;
};

/**
 * Args for the autonomous `geometryComputed` notify. Render bytes hoist
 * via {@link WithTransferables} so the channel walker can choose the
 * fastest delivery tier (`pool → transfer → copy`). `renderId` correlates
 * the frame with the originating preview admission.
 * @public
 */
export type RuntimeGeometryComputedArgs = {
  readonly result: HashedGeometryResultTransport;
  readonly renderId: RenderId;
};

/**
 * Args for the autonomous `parametersResolved` notify. `renderId`
 * correlates the resolved parameter schema with the originating preview
 * so the consumer can pair early-arriving parameter frames with the
 * eventual `geometryComputed` for the same render.
 * @public
 */
export type RuntimeParametersResolvedArgs = {
  readonly result: GetParametersResult;
  readonly renderId: RenderId;
};

/**
 * Args for the autonomous `errorEvent` notify. `renderId` is present when
 * the issue is render-scoped and absent when the failure is
 * connection-scoped (e.g. handshake failure, transcoder load).
 * @public
 */
export type RuntimeErrorEventArgs = {
  readonly issues: readonly KernelIssue[];
  readonly renderId?: RenderId;
};

/**
 * Args for the autonomous `stateChanged` notify.
 * @public
 */
export type RuntimeStateChangedArgs = {
  readonly renderId: RenderId;
  readonly abortGeneration: number;
  readonly state: WorkerState;
  readonly detail?: string;
};

/** Reserved kernel-owned message envelope for bidirectional extension traffic. @public */
export type RuntimeKernelMessageArgs = {
  readonly kernelId: string;
  readonly type: string;
  readonly renderId?: RenderId;
  readonly payload: unknown;
};

/**
 * Client → worker fire-and-forget command names. These 6 command names
 * drive every C→W interaction in the kernel runtime protocol. A
 * companion type-level guard in `runtime-protocol.runtime.test.ts`
 * fails closed if a command is added/removed without updating both
 * surfaces.
 * @public
 */
export const runtimeProtocolClientNotifyNames = [
  'openFile',
  'stage-and-render',
  'updateParameters',
  'setOptions',
  'abort',
  'kernelCommand',
] as const;

/**
 * Worker → client autonomous event names. These 11 event names cover
 * every W→C notify path in the kernel runtime protocol.
 * `geometryComputed` carries transferables. Six events carry `renderId`:
 * `parametersResolved`, `geometryComputed`, `errorEvent`, `progress`,
 * `activeKernelChanged`, and `stateChanged`; the two optional sites also
 * cover connection-scoped work.
 * @public
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
  'kernelEvent',
] as const;

/**
 * Combined notify name inventory — exactly 17 keys (6 C→W + 11 W→C).
 * @public
 */
export const runtimeProtocolNotifyNames = [
  ...runtimeProtocolClientNotifyNames,
  ...runtimeProtocolWorkerNotifyNames,
] as const;

/**
 * Request/response call name inventory — exactly four calls
 * (`initialize`, `export`, `exportModel`, `cleanup`). The legacy `render` call is deleted; the
 * autonomous `openFile` notify + `geometryComputed` correlation by
 * `renderId` replaces it (R18, mirrors LSP `didOpen` + diagnostics).
 * @public
 */
export const runtimeProtocolCallNames = ['initialize', 'export', 'exportModel', 'cleanup'] as const;

/**
 * Typed `@taucad/rpc` protocol contract for the kernel runtime worker.
 *
 * - `calls`: request/response RPCs. `initialize` bootstraps the worker,
 *   `export` exports current settled geometry, `exportModel` exports
 *   an exact request-scoped model without mutating preview state, and `cleanup`
 *   acknowledges serialized worker cleanup. The legacy
 *   `render` call is gone — production
 *   drives renders autonomously via the `openFile` notify and consumes
 *   `geometryComputed` notifies correlated by `renderId` (R18, mirrors LSP
 *   `didOpen` + diagnostics).
 * - `notifies`: bidirectional fire-and-forget — exactly 17 keys total.
 *   6 client→worker commands (`openFile`, `stage-and-render`,
 *   `updateParameters`, `setOptions`, `abort`, `kernelCommand`)
 *   plus 11 worker→client
 *   autonomous events (`parametersResolved`, `geometryComputed`,
 *   `errorEvent`, `progress`, `activeKernelChanged`, `stateChanged`,
 *   `log`, `logBatch`, `telemetry`, `capabilitiesUpdated`, `kernelEvent`).
 * - `listens`: reserved for future consumer-pulled streams (e.g. file
 *   watch, log tail). Empty in v5 because every streaming flow lands as
 *   a notify.
 *
 * Binary delivery uses {@link WithTransferables} sidecars on the
 * `export` call result and the `geometryComputed` notify args. The
 * transport (not the dispatcher) selects the delivery tier
 * (`pool → transfer → copy`) via its `encodeGeometry`
 * encoders — wire facts stay private to the transport adapter.
 *
 * Conforms to `RpcProtocol` from `@taucad/rpc`. Use as
 * `Channel<RuntimeProtocol>` and `ChannelServer<RuntimeProtocol>`.
 *
 * @public
 */
export type RuntimeProtocol = {
  readonly hello: RuntimeHelloPayload;
  readonly calls: {
    readonly initialize: {
      readonly args: RuntimeInitializeArgs;
      readonly result: RuntimeInitializeResult;
      readonly wireResult: RuntimeInitializeResultWire;
    };
    readonly export: {
      readonly args: RuntimeExportArgs;
      readonly result: ExportGeometryResult;
      readonly wireResult: RuntimeExportResultWire;
    };
    readonly exportModel: {
      readonly args: RuntimeExportModelArgs;
      readonly result: ExportGeometryResult;
      readonly wireResult: RuntimeExportResultWire;
    };
    readonly cleanup: {
      // oxlint-disable-next-line typescript/no-restricted-types -- omitted call args normalize to null on the RPC wire.
      readonly args: null;
      // oxlint-disable-next-line typescript/no-restricted-types -- RPC wire responses encode an absent payload as null.
      readonly result: null;
    };
  };
  readonly notifies: {
    readonly openFile: { readonly args: RuntimeOpenFileArgs };
    readonly 'stage-and-render': { readonly args: RuntimeStageAndRenderArgs };
    readonly updateParameters: { readonly args: RuntimeUpdateParametersArgs };
    readonly setOptions: { readonly args: RuntimeSetOptionsArgs };
    readonly abort: {
      readonly args: { readonly renderId: RenderId; readonly reason: WireAbortReasonCode };
    };
    readonly kernelCommand: { readonly args: RuntimeKernelMessageArgs };

    readonly parametersResolved: {
      readonly args: RuntimeParametersResolvedArgs;
      readonly wireArgs: RuntimeParametersResolvedArgsWire;
    };
    readonly geometryComputed: {
      readonly args: RuntimeGeometryComputedArgs;
      readonly wireArgs: RuntimeGeometryComputedArgsWire;
    };
    readonly errorEvent: { readonly args: RuntimeErrorEventArgs };
    readonly progress: { readonly args: RuntimeProgressArgs };
    readonly activeKernelChanged: {
      readonly args: { readonly kernelId?: string; readonly renderId?: RenderId };
    };
    readonly stateChanged: { readonly args: RuntimeStateChangedArgs };
    readonly log: {
      readonly args: { readonly entry: LogEntry };
      readonly wireArgs: RuntimeLogArgsWire;
    };
    readonly logBatch: {
      readonly args: { readonly entries: readonly LogEntry[] };
      readonly wireArgs: RuntimeLogBatchArgsWire;
    };
    readonly telemetry: {
      readonly args: { readonly entries: readonly TelemetryEntry[] };
    };
    readonly capabilitiesUpdated: {
      readonly args: { readonly capabilities: CapabilitiesManifest };
      readonly wireArgs: RuntimeCapabilitiesUpdatedArgsWire;
    };
    readonly kernelEvent: { readonly args: RuntimeKernelMessageArgs };
  };
  readonly listens: Record<string, never>;
};
