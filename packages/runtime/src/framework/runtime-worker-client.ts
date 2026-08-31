/**
 * Main-thread orchestrator for the typed
 * `Channel<RuntimeProtocol>` (v6 transport architecture).
 *
 * The worker client is now a thin orchestrator over a
 * {@link RuntimeTransportClient}. The transport owns every wire-level
 * concern — channel construction, SAB allocation, abort signalling,
 * geometry pool resolution, and FS bridging — so this class only:
 *
 * 1. Forwards typed RPC calls (`initialize`, `export`) and preview commands
 *    (`openFile`, `updateParameters`, `setOptions`, `stage-and-render`) onto
 *    the transport's channel.
 * 2. Wires `on*` notify subscriptions onto the channel.
 * 3. Enforces the wall-clock render timeout and coordinates bounded,
 *    exact-host recovery through the transport.
 * 4. Caches the latest {@link CapabilitiesManifest} from
 *    `initialize` and `capabilitiesUpdated`.
 *
 * Subsumed responsibilities (no longer here):
 * - SAB allocation (signal/geometry pool) → transport.client.
 * - `MessagePort` plumbing & `fileSystemPort` forwarding → transport.client.
 * - SAB reservation and targeted timeout signalling → transport.
 * - Geometry materialisation → `transport.resolveGeometry(payload)`.
 */

import type { FileExtension, LogEntry } from '@taucad/types';
import { randomUuid } from '@taucad/utils/id';
import type { Channel } from '@taucad/rpc';
import { Topic } from '@taucad/events';
import type {
  ExportGeometryResult,
  GetParametersResult,
  HashedGeometryResult,
  KernelIssue,
  CapabilitiesManifest,
} from '#types/runtime.types.js';
import type { RuntimeFileLocator } from '#types/runtime-file.types.js';
import type {
  HashedGeometryResultTransport,
  RuntimeExportModelArgs,
  RuntimeSourceSnapshotArgs,
  RuntimeTranscodeArgs,
  RuntimeExportResultTransport,
  RuntimePreviewIdentity,
  RenderPhase,
  RuntimeProtocol,
  RuntimeStateChangedArgs,
  TelemetryEntry,
} from '#types/runtime-protocol.types.js';
import type { RuntimeSourceSnapshotResult } from '#types/runtime-source-snapshot.types.js';
import type { RuntimeContentInput } from '#types/runtime-content.types.js';
import type { RuntimeTransportClient, RuntimeTransportTimeoutRecovery } from '#transport/runtime-transport.types.js';
import { renderTimeoutRecoveryGrace } from '#framework/runtime-framework.constants.js';
import { validateProtocolHeader } from '#types/protocol-header.types.js';

/** Unsubscribe handle for {@link RuntimeWorkerClient} subscription helpers. */
export type Unsubscribe = () => void;

/**
 * Error thrown when a render is aborted via the cooperative-abort
 * generation channel.
 *
 * The kernel's OC Proxy polls the SAB (or wire-format `'abort'` notify
 * for SAB-less ports) before every WASM call and throws this when a
 * newer selected preview — including an autonomous watched-filesystem
 * rerender — or a render timeout has bumped the generation.
 *
 * Internal cooperative-abort plumbing; never surfaces on the public
 * `RuntimeClient` surface. Supersession is observed via
 * `RenderOutcome.superseded`.
 *
 * @public
 */
export class RenderAbortedError extends Error {
  public constructor() {
    super('Render aborted by a newer selected preview');
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
 * @public
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
        'Inspect recent model changes, kernel diagnostics, and parameter values; fix the render blocker or increase the render timeout for legitimately long operations.',
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
 */
export type RuntimeWorkerClientInitializeOptions = {
  readonly config?: unknown;
};

/** Identity and captured deadline for one preview admission. @internal */
type SelectedPreview = RuntimePreviewIdentity & {
  readonly renderTimeout: number;
};

type ActivePreviewAdmission = SelectedPreview & {
  timer?: ReturnType<typeof setTimeout>;
  timedOut: boolean;
  settled: boolean;
  /**
   * Set at synchronous `geometryComputed` receipt, before geometry
   * materialisation is awaited. Geometry strictly precedes the terminal
   * `idle` frame on the ordered channel in every worker completion path, so a
   * selected preview that reaches `idle` without this flag produced nothing —
   * the client settles its public promise as superseded rather than hanging.
   */
  geometryObserved: boolean;
};

type QueuedPreview = {
  readonly admission: RuntimePreviewIdentity;
  readonly send: () => void;
};

/**
 * Create the fact-only issue emitted when a preview deadline expires.
 *
 * @param renderTimeout - Milliseconds.
 * @returns The timeout issue for the worker or client deadline.
 */
export const renderTimeoutIssue = (renderTimeout?: number): KernelIssue => ({
  message: renderTimeout === undefined ? 'Render timed out.' : `Render timed out after ${renderTimeout} ms.`,
  code: 'RENDER_TIMEOUT',
  type: 'runtime',
  severity: 'error',
});

export const assertValidRenderTimeout = (renderTimeout: number): void => {
  if (!Number.isFinite(renderTimeout) || renderTimeout < 0) {
    throw new TypeError('renderTimeout must be a finite, non-negative number of milliseconds.');
  }
};

/**
 * Main-thread orchestrator over a {@link RuntimeTransportClient}.
 *
 * Owns:
 *
 * 1. **RPC settlement** — `initialize()` and `exportGeometry()` resolve
 *    via the transport's channel.
 * 2. **Atomic preview admission** — reserves transport cancellation state and
 *    an opaque render identity before connection or command awaits.
 * 3. **Selected-preview publication** — adopts autonomous successors only
 *    after a terminal handoff and filters every render-scoped frame at this
 *    single boundary.
 * 4. **Render timeout** — starts a render-scoped wall-clock timer when the
 *    preview command is dispatched, settles locally at the deadline, and
 *    terminates an unresponsive isolated host after bounded recovery.
 * 5. **Geometry materialisation** — defers to
 *    `transport.resolveGeometry()` so pool/transfer/copy decoding stays
 *    wire-agnostic.
 * 6. **Capabilities cache** — captures the manifest from the
 *    `initialize` call result and the `capabilitiesUpdated` notify.
 *
 * @public
 */
export class RuntimeWorkerClient {
  private readonly transport: RuntimeTransportClient;
  private channel: Channel<RuntimeProtocol> | undefined;
  private readonly pendingSubscriptions = new Topic<Channel<RuntimeProtocol>>({
    name: 'runtime-worker-client.pending-subscriptions',
  });

  /** Wall-clock render timeout enforced via `setTimeout`. Milliseconds. */
  private renderTimeout = 0;
  private selectedPreview: ActivePreviewAdmission | undefined;
  private recoveringRenderId: string | undefined;
  private recoveryTimer: ReturnType<typeof setTimeout> | undefined;
  private queuedPreview: QueuedPreview | undefined;
  private readonly localTimeouts = new Topic<{
    readonly renderId: string;
    readonly renderTimeout: number;
    readonly issues: readonly KernelIssue[];
  }>({ name: 'runtime-worker-client.local-timeouts' });
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
   * own `client(opts)` factory pre-allocated every SAB; runtime composition
   * lives entirely inside the worker/host runtime definition.
   */
  public async initialize(options: RuntimeWorkerClientInitializeOptions = {}): Promise<void> {
    this.ensureNotTerminated();
    const { channel } = await this.transport.open();
    await channel.ready;
    const hello = channel.hello.payload;
    validateProtocolHeader({ v: hello.protocolVersion });
    this.ensureNotTerminated();
    this.channel = channel;
    this.disposers.push(
      this.channel.onNotify('stateChanged', ({ renderId, abortGeneration, state, detail }) => {
        this.handleStateChange({ renderId, abortGeneration, state, detail });
      }),
      this.channel.onNotify('capabilitiesUpdated', ({ capabilities }) => {
        this._capabilities = capabilities;
      }),
    );
    /* Flush any subscriptions registered before initialize() so
     * consumers can attach handlers eagerly without missing the first
     * frame. */
    this.flushPendingSubscriptions();
    const result = await this.transport.initialize(options.config === undefined ? {} : { config: options.config });
    this.ensureNotTerminated();
    this._capabilities = result.capabilities;
  }

  /** Select a preview synchronously before connection or command awaits. */
  public admitPreview(): RuntimePreviewIdentity {
    this.ensureNotTerminated();
    const renderId = randomUuid();
    const reservation = this.transport.reservePreview();
    const identity: RuntimePreviewIdentity = { renderId, ...reservation };
    this.clearPreviewTimer(this.selectedPreview);
    const selected: ActivePreviewAdmission = {
      ...identity,
      renderTimeout: this.renderTimeout,
      timedOut: false,
      settled: false,
      geometryObserved: false,
    };
    this.selectedPreview = selected;
    return identity;
  }

  /** Send `openFile` with its already-reserved preview admission. */
  public openFile(
    file: RuntimeFileLocator,
    input: {
      readonly parameters?: Record<string, unknown>;
      readonly options?: Record<string, unknown>;
      readonly content?: RuntimeContentInput;
    },
    admission: RuntimePreviewIdentity,
  ): void {
    this.ensureNotTerminated();
    this.ensureChannel();
    this.dispatchPreview(admission, () => {
      this.channel!.notify('openFile', {
        renderId: admission.renderId,
        ...(admission.abortGeneration === undefined ? {} : { abortGeneration: admission.abortGeneration }),
        file,
        parameters: input.parameters ?? {},
        ...(input.options === undefined ? {} : { options: input.options }),
        ...(input.content === undefined ? {} : { content: input.content }),
      });
    });
  }

  /**
   * Stage byte payloads onto the worker's filesystem and open the
   * supplied entry in a single envelope.
   */
  public stageAndOpenFile(
    request: {
      stage: Record<string, Uint8Array<ArrayBuffer>>;
      file: RuntimeFileLocator;
      parameters?: Record<string, unknown>;
      options?: Record<string, unknown>;
      content?: RuntimeContentInput;
    },
    admission: RuntimePreviewIdentity,
  ): void {
    this.ensureNotTerminated();
    this.ensureChannel();
    this.dispatchPreview(admission, () => {
      this.channel!.notify('stage-and-render', {
        renderId: admission.renderId,
        ...(admission.abortGeneration === undefined ? {} : { abortGeneration: admission.abortGeneration }),
        stage: request.stage,
        file: request.file,
        parameters: request.parameters ?? {},
        ...(request.options === undefined ? {} : { options: request.options }),
        ...(request.content === undefined ? {} : { content: request.content }),
      });
    });
  }

  /** Update parameters for the autonomous render loop. */
  public updateParameters(parameters: Record<string, unknown>, admission: RuntimePreviewIdentity): void {
    this.ensureNotTerminated();
    this.ensureChannel();
    this.dispatchPreview(admission, () => {
      this.channel!.notify('updateParameters', {
        renderId: admission.renderId,
        ...(admission.abortGeneration === undefined ? {} : { abortGeneration: admission.abortGeneration }),
        parameters,
      });
    });
  }

  /**
   * Replace the active per-render kernel options and trigger a re-render.
   * `setOptions` is a full replace, not a patch-merge.
   */
  public setOptions(options: Record<string, unknown>, admission: RuntimePreviewIdentity): void {
    this.ensureNotTerminated();
    this.ensureChannel();
    this.dispatchPreview(admission, () => {
      this.channel!.notify('setOptions', {
        renderId: admission.renderId,
        ...(admission.abortGeneration === undefined ? {} : { abortGeneration: admission.abortGeneration }),
        options,
      });
    });
  }

  /** Set local wall-clock timeout state for subsequent renders without notifying the worker. */
  public setRenderTimeout(renderTimeout: number): void {
    this.ensureNotTerminated();
    assertValidRenderTimeout(renderTimeout);
    this.renderTimeout = renderTimeout;
  }

  /**
   * Send the `export` RPC and return the result.
   *
   * @param format - export file format identifier (e.g. `'stl'`, `'glb'`).
   * @param options - format-specific export options (may include `tessellation`).
   * @param content - request-scoped content input.
   * @param signal - per-call cancellation; the channel carries it as an `rc` frame.
   */
  // oxlint-disable-next-line max-params -- mirrors the fixed `export` protocol call shape (format, options, content, signal).
  public async exportGeometry(
    format: FileExtension,
    options?: Record<string, unknown>,
    content?: RuntimeContentInput,
    signal?: AbortSignal,
  ): Promise<ExportGeometryResult> {
    this.ensureNotTerminated();
    this.ensureChannel();
    const result = await this.channel!.call(
      'export',
      {
        format,
        ...(options === undefined ? {} : { options }),
        ...(content === undefined ? {} : { content }),
      },
      signal,
    );
    return this.transport.resolveExport
      ? this.transport.resolveExport(result as unknown as RuntimeExportResultTransport)
      : result;
  }

  /**
   * Export geometry for an exact request without mutating the autonomous preview render state.
   *
   * @param request - source file, parameters, render options, export format, and optional staged source bytes
   * @param signal - per-call cancellation; the channel carries it as an `rc` frame.
   */
  public async exportModel(request: RuntimeExportModelArgs, signal?: AbortSignal): Promise<ExportGeometryResult> {
    this.ensureNotTerminated();
    this.ensureChannel();
    const result = await this.channel!.call('exportModel', request, signal);
    return this.transport.resolveExport
      ? this.transport.resolveExport(result as unknown as RuntimeExportResultTransport)
      : result;
  }

  /** Collect a request-scoped source closure without rendering geometry. */
  public async snapshotSource(
    request: RuntimeSourceSnapshotArgs,
    signal?: AbortSignal,
  ): Promise<RuntimeSourceSnapshotResult> {
    this.ensureNotTerminated();
    this.ensureChannel();
    return this.channel!.call('snapshotSource', request, signal);
  }

  /** Send a direct transcoder RPC over caller-owned artifacts. */
  public async transcode(request: RuntimeTranscodeArgs, signal?: AbortSignal): Promise<ExportGeometryResult> {
    this.ensureNotTerminated();
    this.ensureChannel();
    const result = await this.channel!.call('transcode', request, signal);
    return this.transport.resolveExport
      ? this.transport.resolveExport(result as unknown as RuntimeExportResultTransport)
      : result;
  }

  /** Cleanup any worker-side state without tearing down the channel. */
  public async cleanup(): Promise<void> {
    if (this.terminated || !this.channel) {
      return;
    }
    await this.channel.call('cleanup', undefined);
  }

  /**
   * Subscribe to autonomous worker state transitions. `geometryObserved`
   * reports whether the selected preview has already received a geometry
   * frame, so the owner of the public promise can settle a terminal `idle`
   * that produced nothing.
   */
  public onState(
    handler: (args: RuntimeStateChangedArgs & { readonly geometryObserved: boolean }) => void,
  ): Unsubscribe {
    return this.deferNotify('stateChanged', (args) => {
      if (this.isSelectedPreviewPublishable(args.renderId)) {
        handler({ ...args, geometryObserved: this.selectedPreview?.geometryObserved === true });
      }
    });
  }

  /** Subscribe to autonomous render-progress events. */
  public onProgress(
    handler: (args: { phase: RenderPhase; renderId: string; detail?: Record<string, unknown> }) => void,
  ): Unsubscribe {
    return this.deferNotify('progress', (args) => {
      if (this.isSelectedPreviewPublishable(args.renderId)) {
        handler(args);
      }
    });
  }

  /** Subscribe to autonomous parameter resolution events. */
  public onParametersResolved(handler: (args: { result: GetParametersResult; renderId: string }) => void): Unsubscribe {
    return this.deferNotify('parametersResolved', (args) => {
      if (this.isSelectedPreviewPublishable(args.renderId)) {
        handler(args);
      }
    });
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
  public onGeometry(handler: (result: HashedGeometryResult, renderId: string) => void): Unsubscribe {
    return this.deferNotify('geometryComputed', ({ result, renderId }) => {
      if (!this.isSelectedPreviewPublishable(renderId)) {
        return;
      }
      this.selectedPreview!.geometryObserved = true;
      void this.resolveGeometryNotification(result, renderId, handler);
    });
  }

  /** Subscribe to autonomous error events. `renderId` is absent only for connection-scoped failures. */
  public onError(handler: (issues: readonly KernelIssue[], renderId?: string) => void): Unsubscribe {
    return this.deferNotify('errorEvent', ({ issues, renderId }) => {
      if (renderId === undefined) {
        handler(issues);
        return;
      }
      if (!this.isSelectedPreviewPublishable(renderId)) {
        return;
      }
      this.settleSelectedPreview(renderId);
      handler(issues, renderId);
    });
  }

  /** Subscribe to authoritative local render deadline settlement. @internal */
  public onLocalTimeout(
    handler: (event: { renderId: string; renderTimeout: number; issues: readonly KernelIssue[] }) => void,
  ): Unsubscribe {
    return this.localTimeouts.subscribe(handler);
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
  public onKernelChange(handler: (kernelId: string | undefined, renderId?: string) => void): Unsubscribe {
    return this.deferNotify('activeKernelChanged', ({ kernelId, renderId }) => {
      if (renderId === undefined || this.isSelectedPreviewPublishable(renderId)) {
        handler(kernelId, renderId);
      }
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
    this.clearPreviewTimer(this.selectedPreview);
    this.selectedPreview = undefined;
    this.queuedPreview = undefined;
    this.recoveringRenderId = undefined;
    if (this.recoveryTimer !== undefined) {
      clearTimeout(this.recoveryTimer);
      this.recoveryTimer = undefined;
    }
    this.localTimeouts.dispose();
    for (const off of this.disposers) {
      off();
    }
    this.disposers.length = 0;
  }

  /**
   * Settle a selected preview without a terminal frame. Called by the owner of
   * the public promise when a command fails after admission, so the failed
   * admission can never fence autonomous adoption. Idempotent; a no-op for any
   * identity that is not the current selection.
   *
   * @internal
   */
  public settleSelectedPreview(renderId: string): void {
    const selected = this.selectedPreview;
    if (selected?.renderId !== renderId || selected.settled) {
      return;
    }
    this.clearPreviewTimer(selected);
    selected.settled = true;
  }

  /**
   * Wire a notify subscription onto the channel. When the channel is
   * not yet open (subscription requested before `initialize()`),
   * defers attachment to the next `initialize()` call.
   *
   * @param name - The name of the notify to subscribe to.
   * @param handler - The handler function to call when the notify is received.
   * @returns A function to unsubscribe from the notify.
   */
  private deferNotify<K extends keyof RuntimeProtocol['notifies']>(
    name: K,
    handler: (args: RuntimeProtocol['notifies'][K]['args']) => void,
  ): Unsubscribe {
    if (this.channel) {
      const off = this.channel.onNotify(name, handler);
      this.disposers.push(off);
      return off;
    }
    /* Subscribed before initialize(): record a pending wiring.
     * `initialize()` flushes the queue once the channel is live. */
    let wired: Unsubscribe | undefined;
    const unsubscribePending = this.pendingSubscriptions.subscribe((channel) => {
      wired = channel.onNotify(name, handler);
      this.disposers.push(wired);
    });
    return () => {
      wired?.();
      unsubscribePending();
    };
  }

  private flushPendingSubscriptions(): void {
    if (!this.channel) {
      return;
    }
    this.pendingSubscriptions.emit(this.channel);
    this.pendingSubscriptions.dispose();
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

  private isSelectedPreviewPublishable(renderId: string): boolean {
    return this.selectedPreview?.renderId === renderId && !this.selectedPreview.timedOut;
  }

  private dispatchPreview(admission: RuntimePreviewIdentity, send: () => void): void {
    if (this.selectedPreview?.renderId !== admission.renderId) {
      return;
    }
    if (this.recoveringRenderId) {
      this.queuedPreview = { admission, send };
      return;
    }
    this.sendPreview(admission, send);
  }

  private sendPreview(admission: RuntimePreviewIdentity, send: () => void): void {
    const selected = this.selectedPreview;
    if (selected?.renderId !== admission.renderId) {
      return;
    }
    send();
    this.startRenderTimeout(selected);
  }

  private startRenderTimeout(admission: ActivePreviewAdmission): void {
    this.clearPreviewTimer(admission);
    if (admission.renderTimeout <= 0) {
      return;
    }
    admission.timer = setTimeout(() => {
      this.handleRenderTimeout(admission);
    }, admission.renderTimeout);
  }

  private clearPreviewTimer(admission: ActivePreviewAdmission | undefined): void {
    if (admission?.timer === undefined) {
      return;
    }
    clearTimeout(admission.timer);
    admission.timer = undefined;
  }

  private handleRenderTimeout(admission: ActivePreviewAdmission): void {
    if (admission.settled || admission.timedOut || this.selectedPreview?.renderId !== admission.renderId) {
      return;
    }
    admission.timedOut = true;
    admission.timer = undefined;
    this.localTimeouts.emit({
      renderId: admission.renderId,
      renderTimeout: admission.renderTimeout,
      issues: [renderTimeoutIssue(admission.renderTimeout)],
    });
    const recovery = this.transport.renderTimeoutRecovery;
    if (recovery.kind !== 'terminable') {
      return;
    }
    this.recoveringRenderId = admission.renderId;
    /* Arm the escalation before signalling: a transport whose abort plane is
     * already broken is exactly the host that must still be terminated. */
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = undefined;
      void this.terminateTimedOutHost(recovery);
    }, renderTimeoutRecoveryGrace);
    try {
      recovery.abortRender({
        renderId: admission.renderId,
        ...(admission.abortGeneration === undefined ? {} : { abortGeneration: admission.abortGeneration }),
      });
    } catch {
      // Cooperative cancellation is best-effort; the armed timer is authoritative.
    }
  }

  private async terminateTimedOutHost(
    recovery: Extract<RuntimeTransportTimeoutRecovery, { readonly kind: 'terminable' }>,
  ): Promise<void> {
    try {
      await recovery.terminate();
    } catch {
      // The transport's typed `closed` result remains the authoritative terminal signal.
    }
  }

  private async resolveGeometryNotification(
    result: HashedGeometryResultTransport,
    renderId: string,
    handler: (result: HashedGeometryResult, renderId: string) => void,
  ): Promise<void> {
    let resolved: HashedGeometryResult;
    try {
      resolved = result.success ? { ...result, data: await this.transport.resolveGeometry(result.data) } : result;
    } catch (error) {
      resolved = {
        success: false,
        issues: [
          {
            message: error instanceof Error ? error.message : String(error),
            code: 'RUNTIME',
            type: 'runtime',
            severity: 'error',
          },
        ],
      };
    }
    if (this.isSelectedPreviewPublishable(renderId)) {
      handler(resolved, renderId);
    }
  }

  private handleStateChange(args: RuntimeStateChangedArgs): void {
    if (this.recoveringRenderId === args.renderId && (args.state === 'idle' || args.state === 'error')) {
      this.recoveringRenderId = undefined;
      if (this.recoveryTimer !== undefined) {
        clearTimeout(this.recoveryTimer);
      }
      this.recoveryTimer = undefined;
      const queued = this.queuedPreview;
      this.queuedPreview = undefined;
      if (queued) {
        this.sendPreview(queued.admission, queued.send);
      }
    }

    let selected = this.selectedPreview;
    if (
      (!selected || selected.renderId !== args.renderId) &&
      (!selected || selected.settled) &&
      (args.state === 'buffering' || args.state === 'rendering')
    ) {
      selected = {
        renderId: args.renderId,
        abortGeneration: args.abortGeneration,
        renderTimeout: this.renderTimeout,
        timedOut: false,
        settled: false,
        geometryObserved: false,
      };
      this.selectedPreview = selected;
    }
    if (selected?.renderId === args.renderId) {
      if (
        (args.state === 'buffering' || args.state === 'rendering') &&
        selected.timer === undefined &&
        !selected.timedOut &&
        !selected.settled
      ) {
        this.startRenderTimeout(selected);
      }
      if (args.state === 'idle' || args.state === 'error') {
        this.settleSelectedPreview(args.renderId);
      }
    }
  }
}
