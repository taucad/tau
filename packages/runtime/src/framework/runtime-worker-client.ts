/**
 * Main-thread orchestrator for the typed
 * `Channel<RuntimeProtocol>` (v6 transport architecture).
 *
 * The worker client is now a thin orchestrator over a
 * {@link RuntimeTransportClient}. The transport owns every wire-level
 * concern — channel construction, SAB allocation, abort signalling,
 * geometry pool resolution, and FS bridging — so this class only:
 *
 * 1. Forwards typed RPC calls (`initialize`, `export`) and notifies
 *    (`openFile`, `updateParameters`, `setOptions`, `fileChanged`,
 *    `configureMiddleware`, `cleanup`, `abort`,
 *    `stage-and-render`) onto the transport's channel.
 * 2. Wires `on*` notify subscriptions onto the channel.
 * 3. Enforces the wall-clock render timeout (cooperative abort
 *    triggered via `transport.abort('timeout')`).
 * 4. Caches the latest {@link CapabilitiesManifest} from
 *    `initialize` and `capabilitiesUpdated`.
 *
 * Subsumed responsibilities (no longer here):
 * - SAB allocation (signal/geometry pool/file pool) → transport.client.
 * - `MessagePort` plumbing & `fileSystemPort` forwarding → transport.client.
 * - Wire-format `'abort'` notify → `transport.abort(reason)`.
 * - Geometry materialisation → `transport.resolveGeometry(payload)`.
 */

import type { FileExtension, Geometry, GeometryFile, LogEntry } from '@taucad/types';
import type { Channel } from '@taucad/rpc';
import type {
  ExportGeometryResult,
  GetParametersResult,
  HashedGeometryResult,
  KernelIssue,
  MiddlewareRegistrations,
  BundlerRegistrations,
  CapabilitiesManifest,
} from '#types/runtime.types.js';
import type {
  AbortReason,
  GeometryTransport,
  HashedGeometryResultTransport,
  RenderPhase,
  RuntimeProtocol,
  TelemetryEntry,
  TranscoderModuleEntry,
  WorkerState,
} from '#types/runtime-protocol.types.js';
import type { RuntimeTransportClient } from '#transport/runtime-transport.types.js';
import { subscribeMaterialisedGeometry } from '#transport/_internal/geometry-materialiser.js';

/** Unsubscribe handle for {@link RuntimeWorkerClient} subscription helpers. */
export type Unsubscribe = () => void;

/**
 * Error thrown when a render is aborted via the cooperative-abort
 * generation channel.
 *
 * The kernel's OC Proxy polls the SAB (or wire-format `'abort'` notify
 * for SAB-less ports) before every WASM call and throws this when a
 * newer `openFile` / `updateParameters` / `setOptions` (or a
 * render-timeout) has bumped the generation.
 *
 * Internal cooperative-abort plumbing; never surfaces on the public
 * `RuntimeClient` surface. Supersession is observed via
 * `RenderOutcome.superseded`.
 *
 * @internal
 */
export class RenderAbortedError extends Error {
  public constructor() {
    super('Render aborted by a newer openFile/updateParameters call');
    this.name = 'RenderAbortedError';
  }

  /**
   * The code for the error.
   * @returns The code for the error.
   */
  public get code(): 'RUNTIME_RENDER_ABORTED' {
    return 'RUNTIME_RENDER_ABORTED';
  }
}

/**
 * Realm-safe type guard -- checks `error.name` instead of prototype chain.
 *
 * @internal
 * @param error - the value to test
 * @returns `true` when the error is a {@link RenderAbortedError}
 */
export function isRenderAbortedError(error: unknown): error is RenderAbortedError {
  return error instanceof Error && error.name === 'RenderAbortedError';
}

/**
 * Error thrown when a render exceeds the configured wall-clock timeout.
 * @public
 */
export class RenderTimeoutError extends Error {
  /**
   * @param renderTimeout - Configured wall-clock timeout that was exceeded. Milliseconds.
   */
  public constructor(renderTimeout: number) {
    super(
      `Render timed out after ${renderTimeout / 1000} seconds. ` +
        'Increase the timeout in viewer settings or simplify the model geometry.',
    );
    this.name = 'RenderTimeoutError';
  }

  /**
   * The code for the error.
   * @returns The code for the error.
   */
  public get code(): 'RUNTIME_RENDER_TIMEOUT' {
    return 'RUNTIME_RENDER_TIMEOUT';
  }
}

/**
 * Realm-safe type guard -- checks `error.name` instead of prototype chain.
 *
 * @param error - the value to test
 * @returns `true` when the error is a {@link RenderTimeoutError}
 * @public
 */
export function isRenderTimeoutError(error: unknown): error is RenderTimeoutError {
  return error instanceof Error && error.name === 'RenderTimeoutError';
}

/**
 * Construction options for {@link RuntimeWorkerClient}.
 *
 * @public
 */
export type RuntimeWorkerClientOptions = {
  /**
   * V6 transport client handle returned by {@link TransportPlugin.materialize}.
   * Owns the wire, SAB allocation, abort plane, and geometry
   * resolution. The worker client never inspects the transport's
   * descriptor or wire fields directly.
   */
  transport: RuntimeTransportClient;
};

/**
 * Main-thread orchestrator over a {@link RuntimeTransportClient}.
 *
 * Owns:
 *
 * 1. **RPC settlement** — `initialize()` and `exportGeometry()` resolve
 *    via the transport's channel.
 * 2. **Cooperative abort dispatch** — every public `notify` (openFile /
 *    updateParameters / setOptions) calls `transport.abort('superseded')`
 *    so the SAB / wire-notify plane stays coherent without the worker
 *    client knowing which is in use.
 * 3. **Render timeout** — start a wall-clock timer when the worker
 *    transitions to `'rendering'` and clear it on `'idle'`/`'error'`;
 *    on expiry call `transport.abort('timeout')`.
 * 4. **Geometry materialisation** — defers to
 *    `transport.resolveGeometry()` so pool/transfer/copy decoding stays
 *    wire-agnostic.
 * 5. **Capabilities cache** — captures the manifest from the
 *    `initialize` call result and the `capabilitiesUpdated` notify.
 *
 * @public
 */
export class RuntimeWorkerClient {
  private readonly transport: RuntimeTransportClient;
  private channel: Channel<RuntimeProtocol> | undefined;
  private readonly pendingSubscriptions: Array<(channel: Channel<RuntimeProtocol>) => void> = [];

  private localAbortGeneration = 0;
  private lastReportedState: WorkerState | undefined;
  /** Wall-clock render timeout enforced via `setTimeout`. Milliseconds. */
  private renderTimeout = 0;
  private renderTimeoutTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly disposers: Unsubscribe[] = [];
  private _capabilities: CapabilitiesManifest | undefined;
  private terminated = false;

  /**
   * Construct a worker client wrapping a v6 transport handle. The
   * channel is lazily acquired in {@link initialize}.
   */
  public constructor(options: RuntimeWorkerClientOptions) {
    this.transport = options.transport;
  }

  /**
   * Open the transport and send the `initialize` RPC. The transport's
   * own `client(opts)` factory pre-allocated every SAB; we forward the
   * caller's plugin / module config verbatim.
   */
  public async initialize(input: {
    options: Record<string, unknown>;
    middlewareEntries: MiddlewareRegistrations;
    bundlerEntries?: BundlerRegistrations;
    transcoderModules?: TranscoderModuleEntry[];
  }): Promise<void> {
    this.ensureNotTerminated();
    const { channel } = await this.transport.open();
    this.channel = channel;
    this.disposers.push(
      this.channel.onNotify('stateChanged', ({ state, detail }) => {
        this.handleStateChange(state, detail);
      }),
      this.channel.onNotify('capabilitiesUpdated', ({ capabilities }) => {
        this._capabilities = capabilities;
      }),
    );
    /* Flush any subscriptions registered before initialize() so
     * consumers can attach handlers eagerly without missing the first
     * frame. */
    this.flushPendingSubscriptions();
    const result = await this.transport.initialize({
      options: input.options,
      middlewareEntries: input.middlewareEntries,
      bundlerEntries: input.bundlerEntries,
      transcoderModules: input.transcoderModules,
    });
    this._capabilities = result.capabilities;
  }

  /**
   * Cooperative-abort hook. Delegates to the transport's abort plane
   * which writes the SAB (when present) and unconditionally fires the
   * wire-format `'abort'` notify. Returns the post-increment local
   * generation counter.
   */
  public incrementAbortGeneration(reason: AbortReason = 'superseded'): number {
    if (this.channel) {
      this.transport.abort(reason);
    }
    this.localAbortGeneration += 1;
    return this.localAbortGeneration;
  }

  /** Send `openFile` to the autonomous render loop and bump the abort generation. */
  public openFile(file: GeometryFile, parameters?: Record<string, unknown>, options?: Record<string, unknown>): void {
    this.ensureNotTerminated();
    this.ensureChannel();
    this.incrementAbortGeneration('superseded');
    this.channel!.notify('openFile', {
      file,
      parameters: parameters ?? {},
      ...(options === undefined ? {} : { options }),
    });
  }

  /**
   * Stage byte payloads onto the worker's filesystem and open the
   * supplied entry in a single envelope.
   */
  public stageAndOpenFile(request: {
    stage: Record<string, Uint8Array<ArrayBuffer>>;
    file: GeometryFile;
    parameters?: Record<string, unknown>;
    options?: Record<string, unknown>;
  }): void {
    this.ensureNotTerminated();
    this.ensureChannel();
    this.incrementAbortGeneration('superseded');
    this.channel!.notify('stage-and-render', {
      stage: request.stage,
      file: request.file,
      parameters: request.parameters ?? {},
      ...(request.options === undefined ? {} : { options: request.options }),
    });
  }

  /** Update parameters for the autonomous render loop. */
  public updateParameters(parameters: Record<string, unknown>): void {
    this.ensureNotTerminated();
    this.ensureChannel();
    this.incrementAbortGeneration('superseded');
    this.channel!.notify('updateParameters', { parameters });
  }

  /**
   * Replace the active per-render kernel options and trigger a re-render.
   * `setOptions` is a full replace, not a patch-merge.
   *
   * The wall-clock `renderTimeout` is unpacked main-thread-side; only
   * the remaining keys are forwarded to the worker as kernel-specific
   * options. A timeout-only update never preempts an in-flight render.
   */
  public setOptions(options: Record<string, unknown> & { renderTimeout?: number }): void {
    this.ensureNotTerminated();
    this.ensureChannel();
    const { renderTimeout, ...kernelOptions } = options;
    if (typeof renderTimeout === 'number') {
      this.renderTimeout = renderTimeout;
    }
    if (Object.keys(kernelOptions).length > 0) {
      this.incrementAbortGeneration('superseded');
    }
    this.channel!.notify('setOptions', { options: kernelOptions });
  }

  /** Notify the worker that files have changed for cache invalidation. */
  public notifyFileChanged(paths: readonly string[]): void {
    this.ensureNotTerminated();
    this.ensureChannel();
    this.channel!.notify('fileChanged', { paths });
  }

  /** Reconfigure middleware on the worker. */
  public configureMiddleware(entries: MiddlewareRegistrations): void {
    this.ensureNotTerminated();
    this.ensureChannel();
    this.channel!.notify('configureMiddleware', { entries });
  }

  /**
   * Send the `export` RPC and return the result.
   *
   * @param format - export file format identifier (e.g. `'stl'`, `'glb'`).
   * @param options - format-specific export options (may include `tessellation`).
   */
  public async exportGeometry(format: FileExtension, options?: Record<string, unknown>): Promise<ExportGeometryResult> {
    this.ensureNotTerminated();
    this.ensureChannel();
    return this.channel!.call('export', {
      format,
      ...(options === undefined ? {} : { options }),
    });
  }

  /** Cleanup any worker-side state without tearing down the channel. */
  public cleanup(): void {
    if (this.terminated || !this.channel) {
      return;
    }
    this.channel.notify('cleanup');
  }

  /** Resolve a wire-level {@link GeometryTransport} into a fully-materialised {@link Geometry}. */
  public async resolveGeometry(payload: GeometryTransport): Promise<Geometry> {
    return this.transport.resolveGeometry(payload);
  }

  /**
   * Resolve a worker-side {@link HashedGeometryResultTransport} into the
   * fully-materialised consumer-facing {@link HashedGeometryResult}.
   */
  public async resolveResult(result: HashedGeometryResultTransport): Promise<HashedGeometryResult> {
    if (!result.success) {
      return result;
    }
    const data = await Promise.all(result.data.map(async (g) => this.transport.resolveGeometry(g)));
    return { ...result, data };
  }

  /** Subscribe to autonomous worker state transitions. */
  public onState(handler: (args: { state: WorkerState; detail?: string }) => void): Unsubscribe {
    return this.deferNotify('stateChanged', handler);
  }

  /** Subscribe to autonomous render-progress events. */
  public onProgress(
    handler: (args: { phase: RenderPhase; rgen: number; detail?: Record<string, unknown> }) => void,
  ): Unsubscribe {
    return this.deferNotify('progress', handler);
  }

  /** Subscribe to autonomous parameter resolution events. */
  public onParametersResolved(handler: (args: { result: GetParametersResult; rgen: number }) => void): Unsubscribe {
    return this.deferNotify('parametersResolved', handler);
  }

  /**
   * Subscribe to autonomous geometry events. Payloads are pre-resolved
   * (pooled/inline) before the handler fires so consumers never see
   * wire-level `HashedGeometryResultTransport`.
   *
   * Hash de-duplication is intentionally DISABLED here. This handler is
   * the render-settlement signal — every completed render (including one
   * that produces byte-identical geometry, e.g. a repeated identical
   * `export`) must reach the consumer so an awaited render Promise can
   * settle deterministically. Suppressing back-to-back identical
   * emissions at this layer would conflate a UI re-render optimisation
   * with the lifecycle settlement contract and deadlock callers awaiting
   * the next geometry event. Redundant-emission suppression for UI
   * subscribers is applied downstream at the `geometry` Topic emission
   * boundary in `runtime-client`.
   */
  public onGeometry(handler: (result: HashedGeometryResult, rgen: number) => void): Unsubscribe {
    /* Routes pooled-resolution through the transport via a custom
     * resolver so the pool view never leaks out of the transport
     * plugin. */
    /* `deferNotify`'s default-handler arg expects a typed callback; the
     * subscription path replaces it with `subscribeMaterialisedGeometry`,
     * so the noop fallback never executes. Cast as unknown via the
     * handler signature rather than `as never`. */
    type GeometrySink = Parameters<typeof this.deferNotify<'geometryComputed'>>[1];
    return this.deferNotify('geometryComputed', ((): void => undefined) as unknown as GeometrySink, (channel) =>
      subscribeMaterialisedGeometry(channel, handler, {
        resolveGeometry: async (g) => this.transport.resolveGeometry(g),
        dedupeByHash: false,
      }),
    );
  }

  /** Subscribe to autonomous error events (kernel issues). `rgen` is present for render-scoped failures. */
  public onError(handler: (issues: readonly KernelIssue[], rgen?: number) => void): Unsubscribe {
    return this.deferNotify('errorEvent', ({ issues, rgen }) => {
      handler(issues, rgen);
    });
  }

  /** Subscribe to single log entries. */
  public onLog(handler: (entry: LogEntry) => void): Unsubscribe {
    const offSingle = this.deferNotify('log', ({ entry }) => {
      handler(entry);
    });
    const offBatch = this.deferNotify('logBatch', ({ entries }) => {
      for (const entry of entries) {
        handler(entry);
      }
    });
    return () => {
      offSingle();
      offBatch();
    };
  }

  /** Subscribe to telemetry batches. */
  public onTelemetry(handler: (entries: readonly TelemetryEntry[]) => void): Unsubscribe {
    return this.deferNotify('telemetry', ({ entries }) => {
      handler(entries);
    });
  }

  /** Subscribe to active-kernel-changed events. */
  public onKernelChange(handler: (kernelId: string | undefined) => void): Unsubscribe {
    return this.deferNotify('activeKernelChanged', ({ kernelId }) => {
      handler(kernelId);
    });
  }

  /** Subscribe to capabilities-updated events. */
  public onCapabilities(handler: (capabilities: CapabilitiesManifest) => void): Unsubscribe {
    return this.deferNotify('capabilitiesUpdated', ({ capabilities }) => {
      handler(capabilities);
    });
  }

  /** Capabilities manifest from the worker, available after initialization. */
  public get capabilities(): CapabilitiesManifest | undefined {
    return this._capabilities;
  }

  /** Current cooperative-abort generation. */
  public abortGeneration(): number {
    return this.localAbortGeneration;
  }

  /**
   * Channel-ready promise. Resolves once the underlying transport's
   * channel hello frame has been observed; rejects if `initialize()`
   * was not called yet.
   */
  public get ready(): Promise<void> {
    if (!this.channel) {
      return Promise.reject(new Error('RuntimeWorkerClient.ready: call initialize() first'));
    }
    return this.channel.ready;
  }

  /**
   * Tear down client-side subscriptions and timers. Does **not** invoke
   * {@link RuntimeTransportClient.close}; {@link RuntimeClient} owns the
   * underlying transport handle and closes it after teardown here completes.
   *
   * Idempotent.
   */
  public terminate(): void {
    if (this.terminated) {
      return;
    }
    this.terminated = true;
    this.clearRenderTimeout();
    for (const off of this.disposers) {
      off();
    }
    this.disposers.length = 0;
  }

  /**
   * Wire a notify subscription onto the channel. When the channel is
   * not yet open (subscription requested before `initialize()`),
   * defers attachment to the next `initialize()` call.
   *
   * @param name - The name of the notify to subscribe to.
   * @param handler - The handler function to call when the notify is received.
   * @param customWire - An optional custom wire function to use instead of the default channel.onNotify.
   * @returns A function to unsubscribe from the notify.
   */
  private deferNotify<K extends keyof RuntimeProtocol['notifies']>(
    name: K,
    handler: (args: RuntimeProtocol['notifies'][K]['args']) => void,
    customWire?: (channel: Channel<RuntimeProtocol>) => Unsubscribe,
  ): Unsubscribe {
    if (this.channel) {
      const off = customWire ? customWire(this.channel) : this.channel.onNotify(name, handler);
      this.disposers.push(off);
      return off;
    }
    /* Subscribed before initialize(): record a pending wiring.
     * `initialize()` flushes the queue once the channel is live. */
    let wired: Unsubscribe | undefined;
    const pending = (channel: Channel<RuntimeProtocol>): void => {
      wired = customWire ? customWire(channel) : channel.onNotify(name, handler);
      this.disposers.push(wired);
    };
    this.pendingSubscriptions.push(pending);
    return () => {
      wired?.();
      const index = this.pendingSubscriptions.indexOf(pending);
      if (index !== -1) {
        this.pendingSubscriptions.splice(index, 1);
      }
    };
  }

  private flushPendingSubscriptions(): void {
    if (!this.channel) {
      return;
    }
    for (const pending of this.pendingSubscriptions) {
      pending(this.channel);
    }
    this.pendingSubscriptions.length = 0;
  }

  private ensureChannel(): void {
    if (!this.channel) {
      throw new Error('RuntimeWorkerClient: initialize() must be awaited before issuing wire commands');
    }
  }

  private ensureNotTerminated(): void {
    if (this.terminated) {
      throw new Error('Runtime client terminated');
    }
  }

  private startRenderTimeout(): void {
    this.clearRenderTimeout();
    if (this.renderTimeout <= 0) {
      return;
    }
    this.renderTimeoutTimer = setTimeout(() => {
      this.transport.abort('timeout');
      this.localAbortGeneration += 1;
    }, this.renderTimeout);
  }

  private clearRenderTimeout(): void {
    if (this.renderTimeoutTimer !== undefined) {
      clearTimeout(this.renderTimeoutTimer);
      this.renderTimeoutTimer = undefined;
    }
  }

  private handleStateChange(state: WorkerState, detail?: string): void {
    if (state === this.lastReportedState && !detail) {
      return;
    }
    this.lastReportedState = state;
    if (state === 'rendering') {
      this.startRenderTimeout();
    } else if (state === 'idle' || state === 'error') {
      this.clearRenderTimeout();
    }
  }
}
