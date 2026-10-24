import type { MessagePortLike } from '@taucad/rpc';
import type { ExportFile } from '@taucad/types';
import type { CapabilitiesManifest } from '#types/runtime.types.js';

/** Binary bytes travel inline or through transport-owned shared memory. @public */
export type BinaryContentDelivery =
  | { readonly delivery: 'inline'; readonly bytes: Uint8Array<ArrayBuffer> }
  | { readonly delivery: 'pooled'; readonly key: string };

/** Transport-owned zero-copy binary pool. @public */
export type GeometryPoolHandle = SharedArrayBuffer;

/** Transport-owned cooperative-abort signal buffer. @public */
export type SignalBufferHandle = SharedArrayBuffer;

/** Host-compiled WASM module shared with a runtime worker by structured clone. @public */
export type CompiledWasmModuleHandle = {
  readonly url: string;
  readonly module: WebAssembly.Module;
};

/** Opaque transport bootstrap resources supplied with initialize. @public */
export type InitializeMemoryHandle = {
  signalBuffer?: SignalBufferHandle;
  geometryPoolBuffer?: GeometryPoolHandle;
  fileSystemPort?: MessagePortLike;
  computeStorePort?: MessagePortLike;
  computeBindingMode?: 'off' | 'memory' | 'durable';
  /** The binding's `memoryConstrained`: size the worker's compute caches for a phone-class device. */
  computeMemoryConstrained?: boolean;
  devtoolsTelemetry?: boolean;
  compiledWasmModules?: readonly CompiledWasmModuleHandle[];
};

/** Identity of the producer that emitted a telemetry batch. @public */
export type TelemetryOrigin = {
  label: string;
  instance: string;
};

/** Completed worker telemetry span. @public */
export type TelemetryEntry = {
  name: string;
  startTime: number;
  duration: number;
  detail?: Record<string, unknown>;
  workerTimeOrigin: number;
};

/** Spans with a producer and absolute clock anchor. @public */
export type TelemetryBatch = {
  readonly entries: readonly TelemetryEntry[];
  readonly origin: TelemetryOrigin;
  readonly epoch: number;
  /**
   * Spans the producer lost since its previous batch: its bounded queue was full, or a span ended
   * after the producer was recycled. Absent from an older producer, which means unknown, not zero.
   */
  readonly dropped?: number;
  /**
   * Operation roots among the lost spans, as span id → `operation.id`, so the surviving children of a
   * lost root can still be placed in the trace of their operation.
   */
  readonly droppedRoots?: Readonly<Record<string, string>>;
};

/** One retained span with its producer and clock anchor. @public */
export type TelemetrySpanRecord = TelemetryEntry & {
  readonly origin: TelemetryOrigin;
  readonly epoch: number;
};

/** Numeric reasons shared by worker and transport abort channels. @internal */
export const abortReason = {
  none: 0,
  superseded: 1,
  timeout: 2,
} as const;

/** Runtime worker initialize request. @public */
export type RuntimeInitializeArgs = {
  config?: unknown;
  memoryHandle?: InitializeMemoryHandle;
  sessionId?: string;
  resumeToken?: string;
  /** The client's id for this attempt; the worker's `kernel.bootstrap` root carries it as `operation.id`. */
  operationId?: string;
};

/** Runtime worker initialize result. @public */
export type RuntimeInitializeResult = { capabilities: CapabilitiesManifest };

/** Versioned runtime server hello. @public */
export type RuntimeHelloPayload = {
  readonly server: 'kernel-runtime-worker';
  readonly runtimeVersion: string;
  readonly protocolVersion: number;
  readonly sessionId?: string;
  readonly resumeToken?: string;
};

/** Direct transcoder request over caller-owned input files. @public */
export type RuntimeTranscodeArgs = {
  readonly from: string;
  readonly to: string;
  readonly files: ExportFile[];
  readonly options: Record<string, unknown>;
  /** The client's id for this attempt; the worker's operation root carries it as `operation.id`. */
  readonly operationId?: string;
};

/** Request-scoped source-closure collection without evaluation. @public */
export type RuntimeSourceSnapshotArgs = {
  readonly stage?: Record<string, Uint8Array<ArrayBuffer>>;
  readonly file: { readonly path: string; readonly filename: string };
  readonly additionalPaths?: ReadonlyArray<{ readonly path: string; readonly required: boolean }>;
};
