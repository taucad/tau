/**
 * RuntimeClient -- high-level, Promise-based facade for CAD kernel operations.
 *
 * Wraps a {@link RuntimeWorkerClient} (which in turn wraps a
 * {@link RuntimeTransportClient}) with lazy initialization, event
 * subscription, and plugin configuration. This is the primary API for
 * consumers.
 *
 * {@link TransportPlugin.materialize} runs during {@link createRuntimeClient}
 * construction to obtain the fat {@link RuntimeTransportClient} handle. The
 * handle's `open()` path (worker spawn / channel wiring) stays deferred until
 * the first `connect()` or auto-connect command.
 */

import type { FileExtension, GeometryFile, ExportFile, LogEntry } from '@taucad/types';
import { Topic } from '@taucad/events';
import type {
  HashedGeometryResult,
  GetParametersResult,
  KernelResult,
  KernelIssue,
  KernelIssueCode,
  CapabilitiesManifest,
  ExportRoute,
  RuntimeCapabilities,
} from '#types/runtime.types.js';
import type { TelemetryEntry, RenderPhase, WorkerState } from '#types/runtime-protocol.types.js';
import { RuntimeWorkerClient, RenderTimeoutError } from '#framework/runtime-worker-client.js';
import type {
  RuntimeTransportClient,
  TransportDescriptor,
  TransportPlugin,
} from '#transport/runtime-transport.types.js';
import { inProcessTransport } from '#transport/in-process-transport.js';
import type {
  KernelPlugin,
  MiddlewarePlugin,
  BundlerPlugin,
  TranscoderPlugin,
  CollectKernelIds,
  CollectRenderOptions,
  ExportFormatsFor,
  ExportOptionsFor,
  KnownTargetFormats,
} from '#plugins/plugin-types.js';

/**
 * Extract the literal `Id` phantom from a wired {@link TransportPlugin}.
 */
// oxlint-disable @typescript-eslint/no-explicit-any -- variance: phantom slot projection
type TransportClientId<T> = T extends TransportPlugin<any, any, infer Id> ? Id : string;
// oxlint-enable @typescript-eslint/no-explicit-any

// =============================================================================
// RenderInput Types
// =============================================================================

/**
 * Detects whether a type is a union (more than one member).
 * Used internally to determine if a code object has multiple keys.
 */
type IsUnion<T, U = T> = T extends U ? ([U] extends [T] ? false : true) : never;

/**
 * Inline code input for `openFile()` / `export()`.
 *
 * `code` is a filename-to-content map. When only a single key exists,
 * `file` is optional (the runtime picks the only key). When multiple keys
 * exist (or when `T` is a wide `Record<string, string>`), `file` is required
 * to specify the entry point.
 * @public
 */
export type CodeInput<T extends Record<string, string>> = {
  /** Inline source code as a filename-to-content map. */
  code: T;
  /** Parameters for the model's main function. @default \{\} */
  parameters?: Record<string, unknown>;
  /** Kernel-specific render options. */
  options?: Record<string, unknown>;
  /** Not applicable in inline mode (client auto-manages). @internal */
  changedPaths?: never;
} & (string extends keyof T
  ? {
      /** Entry point filename. Required when key count is unknown at compile time. */ file: string;
    }
  : true extends IsUnion<keyof T>
    ? {
        /** Entry point filename. Required for multi-file code. */ file: keyof T;
      }
    : {
        /** Entry point filename. Optional for single-file code (inferred from the only key). */ file?: keyof T;
      });

/**
 * Filesystem-based input for `openFile()` / `export()`.
 *
 * Renders from the filesystem owned by the supplied transport. `file`
 * can be a string shorthand (e.g., `'/src/main.ts'`) or a
 * {@link GeometryFile} object.
 * @public
 */
export type FileInput = {
  /** Prevents mixing code with file-mode rendering. @internal */
  code?: never;
  /** File to render from the transport's filesystem. */
  file: string | GeometryFile;
  /** Parameters for the model's main function. @default \{\} */
  parameters?: Record<string, unknown>;
  /** Kernel-specific render options. */
  options?: Record<string, unknown>;
};

/**
 * Consumer-facing export result with a single `ExportFile` (unwrapped).
 *
 * Internally, the kernel pipeline produces `ExportFile[]`, but every current
 * kernel produces exactly one file. The client unwraps the first element for
 * a cleaner consumer API: `result.data.bytes` instead of `result.data[0].bytes`.
 * @public
 */
export type ExportResult = KernelResult<ExportFile>;

/**
 * Discriminated union returned by `openFile`/`updateParameters`/`setOptions`.
 *
 * Resolves with `superseded: false` and the produced geometry on a settled
 * render, or `superseded: true` when a newer call wins before this one
 * settles. Supersession is a normal lifecycle transition — the only failure
 * cases are typed errors (`RenderTimeoutError`, `RuntimeTerminatedError`).
 *
 * @public
 */
export type RenderOutcome =
  | { readonly superseded: false; readonly geometry: HashedGeometryResult }
  | { readonly superseded: true };

/**
 * Thrown by `client.export(format)` (no options) when no successful
 * `openFile`/`updateParameters`/`setOptions` render has settled on this
 * client yet.
 *
 * The two-argument form `client.export(format, input)` self-renders and
 * therefore never raises this error.
 *
 * @public
 */
export class NoRenderOutcomeError extends Error {
  public constructor() {
    super(
      'client.export(format) requires a prior openFile/updateParameters/setOptions to settle. ' +
        'Use client.export(format, input) to self-render in one call.',
    );
    this.name = 'NoRenderOutcomeError';
  }

  /**
   * The literal discriminator code for this error type.
   *
   * @returns the literal discriminator code for this error type.
   *
   * @public
   */
  public get code(): 'RUNTIME_NO_RENDER_OUTCOME' {
    return 'RUNTIME_NO_RENDER_OUTCOME';
  }
}

/**
 * Realm-safe type guard for {@link NoRenderOutcomeError}.
 *
 * @param error - the value to test
 * @returns `true` when the error is a {@link NoRenderOutcomeError}
 * @public
 */
export function isNoRenderOutcomeError(error: unknown): error is NoRenderOutcomeError {
  return error instanceof Error && error.name === 'NoRenderOutcomeError';
}

/**
 * Lifecycle state of a {@link RuntimeClient}.
 *
 * - `unconnected` — fresh client; {@link RuntimeClient.connect} has not been called.
 * - `connecting` — connection in flight (transport open, dispatcher init, manifest exchange).
 * - `connected` — ready for command APIs (`openFile`, `updateParameters`, `setOptions`, `export`).
 * - `terminated` — terminal state; all command APIs reject with {@link RuntimeTerminatedError}.
 *
 * @public
 */
export type RuntimeLifecycleState = 'unconnected' | 'connecting' | 'connected' | 'terminated';

/**
 * Thrown when a command API (`openFile`, `updateParameters`, `setOptions`,
 * `export`) is invoked before {@link RuntimeClient.connect} has completed.
 *
 * @public
 */
export class RuntimeNotConnectedError extends Error {
  /**
   * The literal discriminator code for this error type.
   * @returns the literal discriminator code for this error type.
   * @public
   */
  public get code(): 'RUNTIME_NOT_CONNECTED' {
    return 'RUNTIME_NOT_CONNECTED';
  }

  /**
   * The constructor for the {@link RuntimeNotConnectedError} class.
   * @param operation - the public command name that was invoked before connect.
   * @public
   */
  public constructor(operation: string) {
    super(`RuntimeClient.${operation}() called before connect() completed.`);
    this.name = 'RuntimeNotConnectedError';
  }
}

/**
 * Realm-safe type guard for {@link RuntimeNotConnectedError}.
 *
 * @param error - candidate error to test.
 * @returns `true` when `error` is a `RuntimeNotConnectedError` instance.
 * @public
 */
export function isRuntimeNotConnectedError(error: unknown): error is RuntimeNotConnectedError {
  return error instanceof Error && error.name === 'RuntimeNotConnectedError';
}

/**
 * Typed discriminator for {@link RuntimeConnectionError.causeKind}.
 *
 * - `'transport-open'` — `transport.open()` threw while opening the wire
 *   (e.g. invalid worker URL, missing `Worker` global, IPC bridge failure).
 * - `'capabilities-resolution'` — kernel/transcoder module loads or
 *   capability publishing failed during `workerClient.initialize`.
 * - `'kernel-binding'` — `kernelClass()` constructor threw inside the
 *   worker (e.g. WASM init failure).
 *
 * @public
 */
export type RuntimeConnectionCause = 'transport-open' | 'capabilities-resolution' | 'kernel-binding';

/**
 * Thrown when {@link RuntimeClient.connect} fails. Wraps the underlying cause
 * (transport error, dispatcher init failure, etc.) for consumer telemetry.
 *
 * @public
 */
export class RuntimeConnectionError extends Error {
  public override readonly cause: unknown;
  public readonly causeKind: RuntimeConnectionCause;

  /**
   * The literal discriminator code for this error type.
   * @returns the literal discriminator code for this error type.
   * @public
   */
  public get code(): 'RUNTIME_CONNECTION_FAILED' {
    return 'RUNTIME_CONNECTION_FAILED';
  }

  /**
   * The constructor for the {@link RuntimeConnectionError} class.
   * @param message - human-readable description of the failure.
   * @param causeKind - typed discriminator identifying which connect phase failed.
   * @param cause - underlying error (transport, init, etc.).
   * @public
   */
  public constructor(message: string, causeKind: RuntimeConnectionCause, cause: unknown) {
    super(message);
    this.name = 'RuntimeConnectionError';
    this.causeKind = causeKind;
    this.cause = cause;
  }
}

/**
 * Realm-safe type guard for {@link RuntimeConnectionError}.
 *
 * @param error - candidate error to test.
 * @returns `true` when `error` is a `RuntimeConnectionError` instance.
 * @public
 */
export function isRuntimeConnectionError(error: unknown): error is RuntimeConnectionError {
  return error instanceof Error && error.name === 'RuntimeConnectionError';
}

/**
 * Typed discriminator for {@link RuntimeTerminatedError.causeKind}.
 *
 * - `'explicit'` — consumer called {@link RuntimeClient.terminate}.
 * - `'connection-failed'` — `connect()` threw and the client was demoted to
 *   the terminal state to prevent half-initialised use.
 * - `'transport-closed'` — the transport closed unexpectedly (e.g. worker
 *   crashed, websocket dropped).
 *
 * @public
 */
export type RuntimeTerminatedCause = 'explicit' | 'connection-failed' | 'transport-closed';

/**
 * Thrown by every command API after {@link RuntimeClient.terminate} has been
 * called. Terminal — there is no recovery path; instantiate a new client.
 *
 * @public
 */
export class RuntimeTerminatedError extends Error {
  public readonly causeKind: RuntimeTerminatedCause;

  /**
   * The literal discriminator code for this error type.
   * @returns the literal discriminator code for this error type.
   */
  public get code(): 'RUNTIME_TERMINATED' {
    return 'RUNTIME_TERMINATED';
  }

  /**
   * The constructor for the {@link RuntimeTerminatedError} class.
   * @param causeKind - typed discriminator identifying why the client is
   *   terminal. Defaults to `'explicit'` for the common terminate() path.
   * @public
   */
  public constructor(causeKind: RuntimeTerminatedCause = 'explicit') {
    super('RuntimeClient has been terminated.');
    this.name = 'RuntimeTerminatedError';
    this.causeKind = causeKind;
  }
}

/**
 * Realm-safe type guard for {@link RuntimeTerminatedError}.
 *
 * @param error - candidate error to test.
 * @returns `true` when `error` is a `RuntimeTerminatedError` instance.
 * @public
 */
export function isRuntimeTerminatedError(error: unknown): error is RuntimeTerminatedError {
  return error instanceof Error && error.name === 'RuntimeTerminatedError';
}

/**
 * Resolve a string file path into a `GeometryFile`.
 *
 * - `'main.ts'` --> `{ path: '/', filename: 'main.ts' }`
 * - `'/src/model.ts'` --> `{ path: '/src', filename: 'model.ts' }`
 * - `'/projects/test/bench.ts'` --> `{ path: '/projects/test', filename: 'bench.ts' }`
 *
 * @param file - file path string to resolve
 * @returns geometry file with separated path and filename
 */
function resolveFileString(file: string): GeometryFile {
  const lastSlash = file.lastIndexOf('/');
  if (lastSlash === -1) {
    return { path: '/', filename: file };
  }

  const path = file.slice(0, lastSlash) || '/';
  return {
    path: path.startsWith('/') ? path : `/${path}`,
    filename: file.slice(lastSlash + 1),
  };
}

/**
 * Rank export fidelity for tiebreak: lower wins. `brep` outranks `mesh`.
 * @param fidelity - Route fidelity classification
 * @returns 0 for brep, 1 for mesh
 */
function fidelityRank(fidelity: ExportRoute['fidelity']): number {
  return fidelity === 'brep' ? 0 : 1;
}

/**
 * Rank route directness for tiebreak: direct (no transcoder) outranks transcoded.
 * @param route - Candidate export route
 * @returns 0 for direct routes, 1 for transcoded routes
 */
function directnessRank(route: ExportRoute): number {
  return route.transcoderId === undefined ? 0 : 1;
}

/**
 * Options for creating a RuntimeClient.
 *
 * Generic over kernel, transcoder, and transport plugin types so that
 * literal IDs and per-transport phantoms flow through to the returned
 * {@link RuntimeClient}.
 *
 * @template Kernels - Kernel plugin tuple type (preserves FormatMap and RenderOptions phantoms)
 * @template Transcoders - Transcoder plugin tuple type (preserves EdgeMap phantoms)
 * @template Transport - Wired {@link TransportPlugin} (`webWorkerTransport({...})`, …).
 * @public
 */
// oxlint-disable @typescript-eslint/no-explicit-any -- variance: default accepts any plugin generic
export type RuntimeClientOptions<
  Kernels extends KernelPlugin<any, any, any>[] = KernelPlugin[],
  Transcoders extends TranscoderPlugin<any, any, any>[] = TranscoderPlugin[],
  Transport extends TransportPlugin = TransportPlugin,
> = {
  /**
   * Wired transport plugin (`webWorkerTransport({...})`, `inProcessTransport({...})`, …).
   * {@link createRuntimeClient} calls {@link TransportPlugin.materialize} once during
   * construction to obtain the fat {@link RuntimeTransportClient} handle.
   *
   * Optional. Defaults to `inProcessTransport({})` — kernels run in the same isolate
   * as the caller. Browser apps that should keep the main thread free opt into
   * `webWorkerTransport({ ... })`.
   */
  transport?: Transport;
  /** Kernel plugins to register (order determines selection priority). */
  kernels: [...Kernels];
  /** Middleware plugins (order determines onion-model wrapping). */
  middleware?: MiddlewarePlugin[];
  /** Bundler plugins (multiple supported, routed by file extension). */
  bundlers?: BundlerPlugin[];
  /** Transcoder plugins for bytes-to-bytes format conversion. */
  transcoders?: [...Transcoders];
  /**
   * Wall-clock render timeout in milliseconds. 0 disables the timeout.
   *
   * Enforced client-side per-`rgen` by {@link RuntimeWorkerClient} — the
   * client raises an `abort` notify (carrying the affected `rgen`) and
   * the worker-side kernel proxy throws the next time it polls. The
   * runtime client surfaces {@link RenderTimeoutError} via the pending
   * render settlement.
   */
  renderTimeout?: number;
};
// oxlint-enable @typescript-eslint/no-explicit-any

type EventHandlers = {
  log: Topic<LogEntry>;
  progress: Topic<{ phase: RenderPhase; detail?: Record<string, unknown> }>;
  telemetry: Topic<TelemetryEntry[]>;
  parametersResolved: Topic<GetParametersResult>;
  geometry: Topic<HashedGeometryResult>;
  state: Topic<{ state: WorkerState; detail?: string }>;
  error: Topic<KernelIssue[]>;
  capabilities: Topic<CapabilitiesManifest>;
  activeKernelChanged: Topic<string | undefined>;
};

type RuntimeSubscribeOptions = {
  readonly signal?: AbortSignal;
};

/**
 * High-level runtime client interface.
 * Lazy, Promise-based, event-subscribable.
 *
 * The `Kernels`, `Transcoders`, and `Transport` generics flow through as a
 * top-level type bag from {@link createRuntimeClient}. Each leaf method
 * (`routesFor`, `bestRouteFor`, `render`, `export`, `on('capabilities')`,
 * `on('activeKernelChanged')`) projects narrow types out of the bag via the
 * `Known*` / `CollectKernelIds` / `CollectRenderOptions` / `MergeExportMap`
 * helpers. Wide defaults preserve today's `FileExtension`/`Record<string,
 * unknown>`/`string` shape so consumers without typed plugins still
 * type-check.
 *
 * @template Kernels - Tuple of registered `KernelPlugin`s (carries `FormatMap`/`RenderOptions`/`Id`)
 * @template Transcoders - Tuple of registered `TranscoderPlugin`s (carries `EdgeMap`/`Id`)
 * @template Transport - Wired {@link TransportPlugin}; literal id projected via {@link TransportClientId}
 * @public
 */
// oxlint-disable @typescript-eslint/no-explicit-any -- variance: default accepts any plugin generic
export type RuntimeClient<
  Kernels extends readonly KernelPlugin<any, any, any>[] = KernelPlugin[],
  Transcoders extends readonly TranscoderPlugin<any, any, any>[] = TranscoderPlugin[],
  Transport extends TransportPlugin = TransportPlugin,
> = {
  /**
   * Active transport snapshot. Returns the literal transport `id`
   * and the diagnostic {@link TransportDescriptor} from the materialised client's
   * `describe()`. Available immediately on construction —
   * no `connect()` is required.
   */
  readonly transport: {
    readonly id: TransportClientId<Transport>;
    readonly descriptor: TransportDescriptor<TransportClientId<Transport>>;
  };

  /**
   * Rolled-up runtime capabilities: kernel-derived
   * {@link CapabilitiesManifest} fields (kernel routes, render schemas,
   * transcoder formats) layered with the transport-derived
   * `autonomousRenderLoop` flag and the active `transport.descriptor`
   * snapshot returned by `transport.describe()`.
   *
   * Available after the worker handshake completes (i.e. once the
   * `capabilitiesUpdated` event has fired). Returns `undefined` before then.
   */
  readonly capabilities: RuntimeCapabilities<Kernels, Transcoders> | undefined;

  /** Active kernel ID from the worker, available after the first render selects a kernel. */
  readonly activeKernelId: CollectKernelIds<Kernels> | undefined;

  /**
   * Current lifecycle state of the client.
   *
   * Transitions strictly forwards through `unconnected` → `connecting` →
   * `connected` → `terminated`. Consumers can poll this getter for
   * defensive UI gating; command APIs throw {@link RuntimeNotConnectedError}
   * or {@link RuntimeTerminatedError} for the off-path states.
   *
   * @public
   */
  readonly lifecycleState: RuntimeLifecycleState;

  /**
   * Returns every {@link ExportRoute} from the current capabilities manifest
   * whose `targetFormat` matches `format`, preserving manifest order.
   *
   * Returns an empty array when no manifest has been received yet or when no
   * route matches the requested format. Consumers building format pickers
   * should subscribe to `'capabilities'` to refresh derived UI state.
   */
  routesFor(format: KnownTargetFormats<Kernels, Transcoders>): ReadonlyArray<ExportRoute<Kernels, Transcoders>>;

  /**
   * Selects the best {@link ExportRoute} for `format` using the framework
   * tiebreak rules:
   *
   * 1. When `kernelId` is supplied, prefer routes for that kernel; fall back
   *    to the manifest-order routes when no candidate matches.
   * 2. Prefer `brep` fidelity over `mesh` fidelity.
   * 3. Prefer direct routes (`transcoderId === undefined`) over transcoded
   *    routes.
   * 4. Otherwise return the first manifest-order match.
   *
   * Returns `undefined` when no route matches the requested format or when
   * the manifest has not yet been received.
   */
  bestRouteFor(
    format: KnownTargetFormats<Kernels, Transcoders>,
    kernelId?: CollectKernelIds<Kernels>,
  ): ExportRoute<Kernels, Transcoders> | undefined;

  /**
   * Open the transport and initialize the kernel runtime.
   *
   * Most consumers can skip this method entirely — every command API
   * (`openFile`, `updateParameters`, `setOptions`, `export`) auto-connects
   * on first call. Call `connect()` explicitly only when you need to
   * surface connection failures up-front rather than entangling them with
   * the first render.
   *
   * Idempotent: subsequent calls after the initial successful connection
   * resolve immediately.
   *
   * @public
   */
  connect(): Promise<void>;

  /**
   * Export geometry from inline code (self-rendering, no prior `connect()` required).
   *
   * Internally renders the code first, then exports. Per-format export options
   * (e.g. `tessellation`, `binary`, `coordinateSystem`) may be passed at the
   * top level alongside `code`/`file`/`parameters`.
   *
   * Auto-connects the transport on first call when the client is still in
   * the `'unconnected'` lifecycle state — {@link RuntimeClient.connect}
   * does not need to be invoked separately.
   *
   * @public
   */
  export<T extends Record<string, string>, F extends ExportFormatsFor<Kernels, Transcoders>>(
    format: F,
    input: CodeInput<T> & Partial<ExportOptionsFor<Kernels, Transcoders, F>>,
  ): Promise<ExportResult>;

  /**
   * Export geometry from a file on the transport's filesystem (self-rendering).
   *
   * Internally renders the file first, then exports. Per-format export options
   * (e.g. `tessellation`, `binary`, `coordinateSystem`) may be passed at the
   * top level alongside `file`/`parameters`.
   *
   * Requires that the supplied transport was constructed with a
   * filesystem (e.g. `webWorkerTransport({ url, fileSystem: ... })`).
   * Inline-`code:` callers should use the {@link RuntimeClient.export}
   * `CodeInput` overload instead.
   *
   * @public
   */
  export<F extends ExportFormatsFor<Kernels, Transcoders>>(
    format: F,
    input: FileInput & Partial<ExportOptionsFor<Kernels, Transcoders, F>>,
  ): Promise<ExportResult>;

  /**
   * Export geometry from the last render in the specified format.
   *
   * Re-exports the geometry produced by the most recent `openFile`,
   * `updateParameters`, or `setOptions` call. Throws
   * {@link NoRenderOutcomeError} when no prior render has settled — callers
   * without one should use the inline-`code:` or `FileInput` overload which
   * self-renders before exporting.
   *
   * When `Kernels`/`Transcoders` carry type information (from typed plugins),
   * the options are type-checked against the declared per-format schemas
   * via {@link MergeExportMap}.
   *
   * @param format - Export format identifier (e.g., 'stl', 'step', '3mf')
   * @param options - Per-call format-specific options
   * @returns Export result with a single ExportFile
   * @public
   */
  export<F extends ExportFormatsFor<Kernels, Transcoders>>(
    format: F,
    options?: ExportOptionsFor<Kernels, Transcoders, F>,
  ): Promise<ExportResult>;

  /**
   * Open a file (or inline code) for autonomous rendering.
   *
   * Resolves with `{ superseded: false, geometry }` when the render this call
   * triggered settles, or with `{ superseded: true }` when a newer
   * `openFile`/`updateParameters`/`setOptions` call wins before settlement.
   *
   * When `input` carries an inline `code:` map, this method stages the bytes
   * onto the transport's filesystem via the `stage-and-render` notify and
   * auto-connects on first call. The `FileInput` overload requires the
   * transport to have been constructed with a filesystem.
   *
   * @param input - File or inline code, plus optional parameters / options
   * @returns Promise that settles with a {@link RenderOutcome}
   * @public
   */
  openFile<T extends Record<string, string>>(
    input: CodeInput<T> & { options?: CollectRenderOptions<Kernels> },
  ): Promise<RenderOutcome>;
  openFile(input: FileInput & { options?: CollectRenderOptions<Kernels> }): Promise<RenderOutcome>;

  /**
   * Update parameters for the active autonomous render and await its settlement.
   *
   * @param parameters - Updated parameters for the model
   * @returns Promise that settles with a {@link RenderOutcome}
   * @public
   */
  updateParameters(parameters: Record<string, unknown>): Promise<RenderOutcome>;

  /**
   * Replace the active per-render kernel options with the supplied bag.
   * `setOptions` is a full **replace**, not a patch-merge: keys absent
   * from the call are dropped. Use this for runtime updates such as
   * `renderTimeout`. Awaits the next render's settlement.
   *
   * @param options - Replacement kernel-specific render options
   * @returns Promise that settles with a {@link RenderOutcome}
   * @public
   */
  setOptions(options: CollectRenderOptions<Kernels> & { renderTimeout?: number }): Promise<RenderOutcome>;

  /**
   * Subscribe to client events. Returns an unsubscribe function.
   * Subscribable at any time during the client lifecycle.
   *
   * @param event - Event name
   * @param handler - Event handler
   * @returns Unsubscribe function
   */
  on(event: 'geometry', handler: (result: HashedGeometryResult) => void, options?: RuntimeSubscribeOptions): () => void;
  on(
    event: 'state',
    handler: (state: WorkerState, detail?: string) => void,
    options?: RuntimeSubscribeOptions,
  ): () => void;
  on(event: 'log', handler: (entry: LogEntry) => void, options?: RuntimeSubscribeOptions): () => void;
  on(
    event: 'progress',
    handler: (phase: RenderPhase, detail?: Record<string, unknown>) => void,
    options?: RuntimeSubscribeOptions,
  ): () => void;
  on(event: 'telemetry', handler: (entries: TelemetryEntry[]) => void, options?: RuntimeSubscribeOptions): () => void;
  on(
    event: 'parametersResolved',
    handler: (result: GetParametersResult) => void,
    options?: RuntimeSubscribeOptions,
  ): () => void;
  on(event: 'error', handler: (issues: KernelIssue[]) => void, options?: RuntimeSubscribeOptions): () => void;
  on(
    event: 'capabilities',
    handler: (manifest: CapabilitiesManifest<Kernels, Transcoders>) => void,
    options?: RuntimeSubscribeOptions,
  ): () => void;
  on(
    event: 'activeKernelChanged',
    handler: (kernelId: CollectKernelIds<Kernels> | undefined) => void,
    options?: RuntimeSubscribeOptions,
  ): () => void;

  /**
   * Terminate the worker and clean up all resources.
   *
   * Always invokes {@link RuntimeTransportClient.close} on the client's
   * materialised transport handle — each {@link RuntimeClient} owns exactly one
   * `materialize()` result. Supply a fresh wired plugin (`webWorkerTransport({...})`)
   * for each client when multiple lifetimes must not share pooled resources.
   *
   * Idempotent — calling `terminate()` more than once is a no-op. After
   * termination, every command API rejects with {@link RuntimeTerminatedError}
   * and {@link RuntimeClient.lifecycleState} is `'terminated'`.
   */
  terminate(): void;

  /**
   * Asynchronous counterpart to {@link RuntimeClient.terminate}.
   *
   * - `shutdown()` (or `shutdown({ drain: false })`) is structurally
   *   identical to `terminate()`: pending intents reject with
   *   {@link RuntimeTerminatedError}; the materialised transport always
   *   receives {@link RuntimeTransportClient.close}; the resolved promise
   *   simply marks completion of those steps.
   * - `shutdown({ drain: true })` waits for every in-flight intent
   *   (connect, render, exports) to settle on its own before tearing the
   *   transport down. Useful for graceful shutdown paths where the caller
   *   wants the last frame / export to complete cleanly.
   *
   * Calling `terminate()` while a draining `shutdown()` is in progress
   * cancels the drain: the pending intents reject with
   * {@link RuntimeTerminatedError} and the awaiting `shutdown()` promise
   * still resolves to `undefined` once teardown completes.
   *
   * Idempotent — calling `shutdown()` after termination resolves
   * immediately.
   */
  shutdown(options?: { drain?: boolean }): Promise<void>;
};
// oxlint-enable @typescript-eslint/no-explicit-any

/**
 * Create a high-level runtime client.
 *
 * The client lazily opens the supplied transport on first `connect()` /
 * `openFile()` / `export()` call. Plugin factory functions are used to
 * configure kernels, middleware, bundlers, and transcoders.
 *
 * `options.transport` is optional and defaults to `inProcessTransport({})`
 * — kernels run in the same isolate as the caller. Browser apps that need
 * to keep the main thread free should pass `webWorkerTransport({...})`
 * explicitly.
 *
 * @param options - Client configuration with optional transport and plugin selections
 * @returns RuntimeClient instance
 *
 * @public
 *
 * @example <caption>Default in-process transport (zero-config)</caption>
 * ```typescript
 * import { createRuntimeClient } from '@taucad/runtime';
 * import { replicad } from '@taucad/runtime/kernels';
 * import { esbuild } from '@taucad/runtime/bundler';
 *
 * const client = createRuntimeClient({
 *   kernels: [replicad()],
 *   bundlers: [esbuild()],
 * });
 * ```
 *
 * @example <caption>Browser worker transport</caption>
 * ```typescript
 * import { createRuntimeClient } from '@taucad/runtime';
 * import { webWorkerTransport } from '@taucad/runtime/transport/web';
 * import { replicad, jscad } from '@taucad/runtime/kernels';
 * import { geometryCache } from '@taucad/runtime/middleware';
 * import { esbuild } from '@taucad/runtime/bundler';
 *
 * const client = createRuntimeClient({
 *   transport: webWorkerTransport({}),
 *   kernels: [replicad(), jscad()],
 *   middleware: [geometryCache()],
 *   bundlers: [esbuild()],
 * });
 * ```
 *
 * @example <caption>Node.js: one-shot inline-code export (auto-connect)</caption>
 * ```typescript
 * import { createRuntimeClient } from '@taucad/runtime';
 * import { inProcessTransport } from '@taucad/runtime/transport/in-process';
 * import { fromMemoryFs } from '@taucad/runtime/filesystem';
 * import { replicad } from '@taucad/runtime/kernels';
 * import { esbuild } from '@taucad/runtime/bundler';
 *
 * const client = createRuntimeClient({
 *   transport: inProcessTransport({ fileSystem: fromMemoryFs({}) }),
 *   kernels: [replicad()],
 *   bundlers: [esbuild()],
 * });
 *
 * const result = await client.export('glb', {
 *   code: { '/main.ts': 'import { draw } from "replicad";\nexport default () => draw();' },
 *   file: '/main.ts',
 * });
 * ```
 */
// oxlint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-restricted-types -- variance + empty-tuple default
export function createRuntimeClient<
  const Kernels extends KernelPlugin<any, any, any>[],
  const Transcoders extends TranscoderPlugin<any, any, any>[] = [],
  const Transport extends TransportPlugin = TransportPlugin,
>(options: RuntimeClientOptions<Kernels, Transcoders, Transport>): RuntimeClient<Kernels, Transcoders, Transport>;
// oxlint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-restricted-types
// The implementation signature returns the wide-default `RuntimeClient`
// (= `RuntimeClient<KernelPlugin[], TranscoderPlugin[]>`) because the worker
// physically emits a wide `CapabilitiesManifest` over `postMessage` — no
// generic information survives the wire. The public overload narrows the
// return to `RuntimeClient<Kernels, Transcoders, Transport>`. This is a *witness*
// narrowing, not a structural lie: every concrete value the worker emits is
// already a member of the narrower carrier, so the seam is sound by
// construction. Compile-time proof lives in `define-plugin.test-d.ts`.
// oxlint-disable-next-line tau-lint/require-public-export-jsdoc -- false positive
export function createRuntimeClient(options: RuntimeClientOptions): RuntimeClient {
  const { kernels, middleware = [], bundlers = [], transcoders = [] } = options;
  const transportPlugin = options.transport ?? inProcessTransport({});
  const transport: RuntimeTransportClient = transportPlugin.materialize();

  let workerClient: RuntimeWorkerClient | undefined;
  let lifecycleState: RuntimeLifecycleState = 'unconnected';

  // Defeats tsgo's conservative narrowing of `lifecycleState` after early
  // `if (lifecycleState === 'terminated') throw` checks across `await`s.
  const readLifecycleState = (): RuntimeLifecycleState => lifecycleState;

  function assertActive(operation: string): void {
    if (lifecycleState === 'terminated') {
      throw new RuntimeTerminatedError();
    }
    if (lifecycleState !== 'connected') {
      throw new RuntimeNotConnectedError(operation);
    }
  }

  /**
   * Looser variant of {@link assertActive} for command methods that internally
   * delegate to {@link ensureConnected}. The strict gate is reserved for cases
   * where callers absolutely cannot lazily connect (e.g. `updateParameters`
   * or `setOptions` that depend on a settled prior render).
   *
   * The terminal state always throws -- termination is irreversible.
   */
  function assertNotTerminated(): void {
    if (lifecycleState === 'terminated') {
      throw new RuntimeTerminatedError();
    }
  }

  let _capabilities: CapabilitiesManifest | undefined;
  let _activeKernelId: string | undefined;

  /**
   * Tracks the latest in-flight render for openFile / updateParameters /
   * setOptions so a newer call can resolve the prior Promise as
   * `{ superseded: true }`. Settles on the next geometry (success) or
   * error (timeout / kernel failure) event.
   */
  type PendingRender = {
    resolve: (outcome: RenderOutcome) => void;
    reject: (error: Error) => void;
  };
  let pendingRender: PendingRender | undefined;
  let hasSettledRender = false;
  /**
   * Per-shape hash list of the last result emitted to the `geometry`
   * Topic. Drives redundant-emission suppression for UI subscribers
   * WITHOUT affecting render settlement — settlement happens in the
   * `onGeometry` callback before {@link emitGeometry} is consulted, so a
   * repeated identical render still settles its awaiting Promise even
   * when the byte-identical geometry is suppressed for UI consumers.
   */
  let lastEmittedGeometryHashKey: string | undefined;

  /**
   * Tracks an in-flight `connect()` so `terminate()` can reject it on the next
   * microtask with `RuntimeTerminatedError({ causeKind: 'explicit' })` rather
   * than leaving the awaiting caller hanging until `ensureConnected()` resolves
   * (or rejects with the wrong typed error).
   */
  type PendingConnect = {
    reject: (error: Error) => void;
  };
  let pendingConnect: PendingConnect | undefined;

  /**
   * Tracks every in-flight `export()` so `terminate()` can reject each one on
   * the next microtask. Entries are added when the export-Promise constructor
   * registers and removed in a `finally` block after the underlying
   * `client.exportGeometry()` settles.
   */
  const pendingExports = new Set<{ reject: (error: Error) => void }>();

  /**
   * Promise-side tracking for {@link RuntimeClient.shutdown} `drain`. Every
   * intent-issuing entry-point (`connect`, `openFile`, `updateParameters`,
   * `setOptions`, `export`) registers the consumer-facing promise here and
   * removes it via `.finally`. `shutdown({ drain: true })` snapshots the set
   * and `Promise.allSettled`s it so callers can wait for in-flight work to
   * settle on its own before teardown runs.
   */
  const inFlightIntents = new Set<Promise<unknown>>();
  const observeUntilSettled = async (promise: Promise<unknown>): Promise<void> => {
    try {
      await promise;
    } catch {
      /* Caller observes via the returned promise; observer swallows. */
    } finally {
      inFlightIntents.delete(promise);
    }
  };
  // oxlint-disable-next-line promise-function-async -- returns caller's promise verbatim; only attaches the side-channel observer for drain bookkeeping.
  const trackInFlight = <T>(promise: Promise<T>): Promise<T> => {
    inFlightIntents.add(promise);
    void observeUntilSettled(promise);
    return promise;
  };

  function supersedePendingRender(): void {
    const prior = pendingRender;
    if (prior) {
      pendingRender = undefined;
      prior.resolve({ superseded: true });
    }
  }

  function resolvePendingRender(geometry: HashedGeometryResult): void {
    const prior = pendingRender;
    if (prior) {
      pendingRender = undefined;
      prior.resolve({ superseded: false, geometry });
    }
  }

  function rejectPendingRender(issues: KernelIssue[]): void {
    const prior = pendingRender;
    if (!prior) {
      return;
    }
    pendingRender = undefined;
    if (issues.some((issue) => issue.code === 'RENDER_TIMEOUT')) {
      const renderTimeout = options.renderTimeout ?? 0;
      prior.reject(new RenderTimeoutError(renderTimeout));
      return;
    }
    const message = issues.map((issue) => issue.message).join('; ');
    prior.reject(new Error(message));
  }

  // oxlint-disable-next-line @typescript-eslint/promise-function-async -- Promise.withResolvers captures the slot for later settlement by superseding intents
  function trackPendingRender(): Promise<RenderOutcome> {
    supersedePendingRender();
    const slot = Promise.withResolvers<RenderOutcome>();
    pendingRender = { resolve: slot.resolve, reject: slot.reject };
    return slot.promise;
  }

  const handlers: EventHandlers = {
    log: new Topic<LogEntry>({ name: 'RuntimeClient.log' }),
    progress: new Topic<{ phase: RenderPhase; detail?: Record<string, unknown> }>({ name: 'RuntimeClient.progress' }),
    telemetry: new Topic<TelemetryEntry[]>({ name: 'RuntimeClient.telemetry' }),
    parametersResolved: new Topic<GetParametersResult>({ name: 'RuntimeClient.parametersResolved' }),
    geometry: new Topic<HashedGeometryResult>({ name: 'RuntimeClient.geometry' }),
    state: new Topic<{ state: WorkerState; detail?: string }>({ name: 'RuntimeClient.state' }),
    error: new Topic<KernelIssue[]>({ name: 'RuntimeClient.error' }),
    capabilities: new Topic<CapabilitiesManifest>({ name: 'RuntimeClient.capabilities' }),
    activeKernelChanged: new Topic<string | undefined>({ name: 'RuntimeClient.activeKernelChanged' }),
  };

  async function ensureConnected(): Promise<RuntimeWorkerClient> {
    if (lifecycleState === 'terminated') {
      throw new RuntimeTerminatedError();
    }
    if (workerClient && lifecycleState === 'connected') {
      return workerClient;
    }

    lifecycleState = 'connecting';

    workerClient = new RuntimeWorkerClient({ transport });

    workerClient.onLog((entry) => {
      handlers.log.emit(entry);
    });
    workerClient.onTelemetry((entries) => {
      handlers.telemetry.emit([...entries]);
    });
    workerClient.onState(({ state, detail }) => {
      handlers.state.emit({ state, detail });
    });
    workerClient.onGeometry((resolved) => {
      if (resolved.success) {
        hasSettledRender = true;
      }
      resolvePendingRender(resolved);
      emitGeometry(resolved);
    });
    workerClient.onParametersResolved(({ result }) => {
      handlers.parametersResolved.emit(result);
    });
    workerClient.onProgress(({ phase, detail }) => {
      handlers.progress.emit({ phase, detail });
    });
    workerClient.onError((issues) => {
      const mutableIssues: KernelIssue[] = [...issues];
      rejectPendingRender(mutableIssues);
      handlers.error.emit(mutableIssues);
    });
    workerClient.onKernelChange((kernelId) => {
      _activeKernelId = kernelId;
      handlers.activeKernelChanged.emit(kernelId);
    });
    workerClient.onCapabilities((capabilities) => {
      _capabilities = capabilities;
      handlers.capabilities.emit(capabilities);
    });

    const kernelModules = kernels.map((k) => ({
      id: k.id,
      moduleUrl: k.moduleUrl,
      extensions: k.extensions,
      detectImport: k.detectImport?.source,
      builtinModuleNames: k.builtinModuleNames,
      options: k.options,
    }));

    const middlewareEntries = middleware.map((m) => ({
      url: m.moduleUrl,
      options: m.options,
    }));

    const bundlerEntries = bundlers.map((b) => ({
      bundlerModuleUrl: b.moduleUrl,
      extensions: b.extensions,
      options: b.options,
    }));

    const transcoderModules = transcoders.map((t) => ({
      id: t.id,
      moduleUrl: t.moduleUrl,
      options: t.options,
    }));

    try {
      await workerClient.initialize({
        options: { kernelModules },
        middlewareEntries,
        bundlerEntries,
        transcoderModules: transcoderModules.length > 0 ? transcoderModules : undefined,
      });
    } catch (error) {
      if (readLifecycleState() !== 'terminated') {
        lifecycleState = 'unconnected';
      }
      const message = error instanceof Error ? error.message : 'Failed to initialise kernel runtime';
      // The worker dispatcher's `error` response carries `KernelIssue[]`
      // under `error.cause`. We classify the failure by inspecting the
      // typed `KernelIssue.code` discriminator — never the message string.
      const issues = (error as { cause?: unknown }).cause;
      const issueCodes: KernelIssueCode[] = Array.isArray(issues)
        ? issues
            .filter(
              (issue): issue is { code: KernelIssueCode } =>
                typeof issue === 'object' && issue !== null && 'code' in issue,
            )
            .map((issue) => issue.code)
        : [];
      const causeKind: RuntimeConnectionCause = issueCodes.includes('KERNEL_BINDING_FAILED')
        ? 'kernel-binding'
        : 'capabilities-resolution';
      throw new RuntimeConnectionError(message, causeKind, error);
    }

    _capabilities = workerClient.capabilities;
    if (_capabilities) {
      handlers.capabilities.emit(_capabilities);
    }

    if (options.renderTimeout !== undefined) {
      workerClient.setOptions({ renderTimeout: options.renderTimeout });
    }

    lifecycleState = 'connected';
    return workerClient;
  }

  /**
   * Emit a resolved geometry result to the `geometry` Topic, suppressing
   * back-to-back emissions whose per-shape hash list is byte-identical to
   * the previous successful emission. This is purely a UI re-render
   * optimisation — it runs AFTER render settlement (see the `onGeometry`
   * wiring) so deduping a redundant emission never blocks an awaited
   * render Promise. Failures always emit and reset the dedupe key so a
   * subsequent successful render is never swallowed.
   */
  function emitGeometry(result: HashedGeometryResult): void {
    if (!result.success) {
      lastEmittedGeometryHashKey = undefined;
      handlers.geometry.emit(result);
      return;
    }

    const hashKey = result.data.map((shape) => shape.hash).join('|');
    if (hashKey === lastEmittedGeometryHashKey) {
      return;
    }
    lastEmittedGeometryHashKey = hashKey;
    handlers.geometry.emit(result);
  }

  return {
    get lifecycleState(): RuntimeLifecycleState {
      return lifecycleState;
    },

    /**
     * V6 transport snapshot. Always present — derived from the wired
     * {@link TransportPlugin}'s materialized client `describe()` after
     * {@link TransportPlugin.materialize}.
     *
     * @returns the transport descriptor
     */
    get transport(): { readonly id: string; readonly descriptor: TransportDescriptor } {
      return {
        id: transport.id,
        descriptor: transport.describe(),
      };
    },

    async connect(): Promise<void> {
      if (lifecycleState === 'terminated') {
        throw new RuntimeTerminatedError();
      }
      if (lifecycleState === 'connected') {
        return;
      }
      // Deferred slot capture: terminate() needs a handle on this connect's
      // reject path before the awaited handshake settles, so the resolvers
      // are externalised via `Promise.withResolvers()` and stored in
      // `pendingConnect` for the lifecycle-cancellation path.
      const slot = Promise.withResolvers<void>();
      pendingConnect = { reject: slot.reject };
      void trackInFlight(slot.promise);

      try {
        await ensureConnected();
        // The optional chain is load-bearing: terminate() can clear
        // `pendingConnect` while the handshake awaits, so the field is not
        // statically guaranteed to still hold the freshly-assigned slot.
        // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- pendingConnect is mutated cross-await by terminate()
        if (pendingConnect?.reject === slot.reject) {
          pendingConnect = undefined;
        }
        slot.resolve();
      } catch (error) {
        // Same load-bearing optional chain — see resolve path above.
        // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- pendingConnect is mutated cross-await by terminate()
        if (pendingConnect?.reject !== slot.reject) {
          // The terminated lifecycle path already rejected this slot via the
          // `pendingConnect` handle; do not double-reject.
          return slot.promise;
        }
        pendingConnect = undefined;
        if (readLifecycleState() !== 'terminated') {
          lifecycleState = 'unconnected';
        }
        if (
          error instanceof RuntimeTerminatedError ||
          error instanceof RuntimeConnectionError ||
          error instanceof RuntimeNotConnectedError
        ) {
          slot.reject(error);
        } else {
          slot.reject(
            new RuntimeConnectionError(
              error instanceof Error ? error.message : 'RuntimeClient connection failed',
              'capabilities-resolution',
              error,
            ),
          );
        }
      }
      return slot.promise;
    },

    async export(
      format: FileExtension,
      inputOrOptions?: CodeInput<Record<string, string>> | FileInput | Record<string, unknown>,
    ): Promise<ExportResult> {
      let selfRendered = false;
      let exportOptions: Record<string, unknown> | undefined;

      // The two-arg self-rendering form drives the worker through the
      // autonomous {@link openFile} pipeline and awaits a render result
      // before invoking `exportGeometry`. Supersession is treated as a
      // benign no-op — the kernel's native handle reflects the latest
      // render either way, so the export still produces deterministic bytes.
      if (inputOrOptions && 'code' in inputOrOptions && inputOrOptions.code) {
        // Code form: `openFile()` will auto-connect via the supplied
        // transport, so we only guard against the terminal state here.
        if (lifecycleState === 'terminated') {
          throw new RuntimeTerminatedError();
        }
        const settlement = await this.openFile(inputOrOptions as CodeInput<Record<string, string>>);
        if (!settlement.superseded && !settlement.geometry.success) {
          return { success: false, issues: settlement.geometry.issues };
        }
        selfRendered = true;
        const {
          code: _code,
          file: _file,
          parameters: _parameters,
          options: _options,
          ...rest
        } = inputOrOptions as Record<string, unknown>;
        if (Object.keys(rest).length > 0) {
          exportOptions = rest;
        }
      } else if (inputOrOptions && 'file' in inputOrOptions && inputOrOptions.file) {
        // File form: lazy auto-connect is fine because the transport already
        // owns the FS — the worker resolves the path at render time.
        assertNotTerminated();
        const settlement = await this.openFile(inputOrOptions as FileInput);
        if (!settlement.superseded && !settlement.geometry.success) {
          return { success: false, issues: settlement.geometry.issues };
        }
        selfRendered = true;
        const {
          file: _file,
          parameters: _parameters,
          options: _options,
          ...rest
        } = inputOrOptions as Record<string, unknown>;
        if (Object.keys(rest).length > 0) {
          exportOptions = rest;
        }
      }

      const resolvedExportOptions = selfRendered
        ? exportOptions
        : (inputOrOptions as Record<string, unknown> | undefined);

      // Single-arg `export(format)` reuses the most recently rendered native
      // handle; reject when no render has settled yet. The two-arg form
      // self-renders above and bypasses this guard.
      if (!selfRendered && resolvedExportOptions === undefined && !hasSettledRender) {
        throw new NoRenderOutcomeError();
      }

      assertActive('export');
      const client = await ensureConnected();

      // Track the in-flight exportGeometry so terminate() can reject it on
      // the next microtask via the pendingExports set.
      let exportReject: ((error: Error) => void) | undefined;
      const exportSlot = {
        reject(error: Error): void {
          exportReject?.(error);
        },
      };
      pendingExports.add(exportSlot);

      try {
        const internalResult = await trackInFlight(
          new Promise<Awaited<ReturnType<typeof client.exportGeometry>>>((resolve, reject) => {
            exportReject = reject;
            client.exportGeometry(format, resolvedExportOptions).then(resolve).catch(reject);
          }),
        );
        if (internalResult.success) {
          return {
            success: true,
            data: internalResult.data[0]!,
            issues: internalResult.issues,
          };
        }
        return internalResult;
      } finally {
        pendingExports.delete(exportSlot);
      }
    },

    async openFile(input: CodeInput<Record<string, string>> | FileInput): Promise<RenderOutcome> {
      // Both `code:` and `file:` forms route through the supplied transport,
      // which owns the host-side filesystem. Lazy auto-connect is therefore
      // safe in either branch — the transport handles missing-FS errors at
      // its own boundary if the consumer forgot to wire one.
      assertNotTerminated();
      const settlement = trackInFlight(trackPendingRender());

      const parameters = input.parameters ?? {};
      const renderOptions = input.options;

      try {
        if (input.code) {
          const { code } = input;
          const keys = Object.keys(code);
          const entryFile = (input as { file?: string }).file ?? keys[0]!;

          const stage: Record<string, Uint8Array<ArrayBuffer>> = {};
          for (const [filename, content] of Object.entries(code)) {
            const absolutePath = filename.startsWith('/') ? filename : `/${filename}`;
            stage[absolutePath] =
              typeof content === 'string' ? new TextEncoder().encode(content) : (content as Uint8Array<ArrayBuffer>);
          }

          const client = await ensureConnected();

          const resolvedFile = resolveFileString(entryFile.startsWith('/') ? entryFile : `/${entryFile}`);
          client.stageAndOpenFile({
            stage,
            file: resolvedFile,
            parameters,
            options: renderOptions,
          });
        } else {
          const fileInput = input;
          const client = await ensureConnected();
          const resolvedFile = typeof fileInput.file === 'string' ? resolveFileString(fileInput.file) : fileInput.file;
          client.openFile(resolvedFile, parameters, renderOptions);
        }
      } catch (error) {
        const prior = pendingRender;
        if (prior) {
          pendingRender = undefined;
          prior.reject(error instanceof Error ? error : new Error(String(error)));
        }
      }

      return settlement;
    },

    async updateParameters(parameters: Record<string, unknown>): Promise<RenderOutcome> {
      // `updateParameters` always requires an active render context, which
      // implies a prior `connect()` — the strict gate is appropriate.
      assertActive('updateParameters');
      const settlement = trackInFlight(trackPendingRender());
      try {
        const client = await ensureConnected();
        client.updateParameters(parameters);
      } catch (error) {
        const prior = pendingRender;
        if (prior) {
          pendingRender = undefined;
          prior.reject(error instanceof Error ? error : new Error(String(error)));
        }
      }
      return settlement;
    },

    async setOptions(updatedOptions: Record<string, unknown> & { renderTimeout?: number }): Promise<RenderOutcome> {
      assertActive('setOptions');
      const settlement = trackInFlight(trackPendingRender());
      try {
        const client = await ensureConnected();
        // The worker-client `setOptions` API absorbs both kernel-specific
        // per-render options and the `renderTimeout` wall-clock control.
        // Forward the merged shape; the worker-client unpacks `renderTimeout`
        // internally and applies the remaining keys as kernel options.
        client.setOptions(updatedOptions);
      } catch (error) {
        const prior = pendingRender;
        if (prior) {
          pendingRender = undefined;
          prior.reject(error instanceof Error ? error : new Error(String(error)));
        }
      }
      return settlement;
    },

    on(event: string, handler: (...args: never[]) => void, options?: RuntimeSubscribeOptions): () => void {
      // Synchronous throw after terminate so a post-terminate
      // `client.on('geometry', ...)` is loud rather than silently subscribing
      // to a dead handler set that will never fire.
      if (lifecycleState === 'terminated') {
        throw new RuntimeTerminatedError();
      }

      switch (event) {
        case 'log': {
          return handlers.log.subscribe(handler as (entry: LogEntry) => void, options);
        }
        case 'progress': {
          return handlers.progress.subscribe(
            ({ phase, detail }) =>
              (handler as (phase: RenderPhase, detail?: Record<string, unknown>) => void)(phase, detail),
            options,
          );
        }
        case 'telemetry': {
          return handlers.telemetry.subscribe(handler as (entries: TelemetryEntry[]) => void, options);
        }
        case 'parametersResolved': {
          return handlers.parametersResolved.subscribe(handler as (result: GetParametersResult) => void, options);
        }
        case 'geometry': {
          return handlers.geometry.subscribe(handler as (result: HashedGeometryResult) => void, options);
        }
        case 'state': {
          return handlers.state.subscribe(
            ({ state, detail }) => (handler as (state: WorkerState, detail?: string) => void)(state, detail),
            options,
          );
        }
        case 'error': {
          return handlers.error.subscribe(handler as (issues: KernelIssue[]) => void, options);
        }
        case 'capabilities': {
          const unsubscribe = handlers.capabilities.subscribe(
            handler as (manifest: CapabilitiesManifest) => void,
            options,
          );
          if (_capabilities !== undefined) {
            (handler as (manifest: CapabilitiesManifest) => void)(_capabilities);
          }
          return unsubscribe;
        }
        case 'activeKernelChanged': {
          const unsubscribe = handlers.activeKernelChanged.subscribe(
            handler as (kernelId: string | undefined) => void,
            options,
          );
          if (_activeKernelId !== undefined) {
            (handler as (kernelId: string | undefined) => void)(_activeKernelId);
          }
          return unsubscribe;
        }
        default: {
          throw new Error(`Unknown event: ${event}`);
        }
      }
    },

    routesFor(format: FileExtension): readonly ExportRoute[] {
      if (!_capabilities) {
        return [];
      }
      return _capabilities.routes.filter((route) => route.targetFormat === format);
    },

    bestRouteFor(format: FileExtension, kernelId?: string): ExportRoute | undefined {
      if (!_capabilities) {
        return undefined;
      }
      const matches = _capabilities.routes.filter((route) => route.targetFormat === format);
      if (matches.length === 0) {
        return undefined;
      }

      const kernelMatches = kernelId ? matches.filter((route) => route.kernelId === kernelId) : matches;
      const candidates = kernelMatches.length > 0 ? kernelMatches : matches;

      const indexed = candidates.map((route, index) => ({ route, index }));
      indexed.sort((a, b) => {
        const fidelityDelta = fidelityRank(a.route.fidelity) - fidelityRank(b.route.fidelity);
        if (fidelityDelta !== 0) {
          return fidelityDelta;
        }
        const directnessDelta = directnessRank(a.route) - directnessRank(b.route);
        if (directnessDelta !== 0) {
          return directnessDelta;
        }
        return a.index - b.index;
      });

      return indexed[0]?.route;
    },

    /**
     * Rolled-up runtime capabilities. Layers the worker-emitted
     * {@link CapabilitiesManifest} (kernel routes, render schemas,
     * transcoder formats) under the same object as the active
     * transport's `autonomousRenderLoop` flag and the active
     * `transport.descriptor` snapshot.
     *
     * Returns `undefined` until the worker handshake completes (i.e. before
     * the first `capabilitiesUpdated` event). The transport descriptor is
     * projected from the `transport.describe()` snapshot.
     *
     * @returns Rolled-up `RuntimeCapabilities` or `undefined` before connect
     */
    get capabilities() {
      if (!_capabilities) {
        return undefined;
      }
      // `autonomousRenderLoop` is always `true` under v6 — the worker
      // drives renders on its own off `openFile`/`updateParameters`
      // notifies, no per-frame round-trip from the client.
      const rolledUp: RuntimeCapabilities = {
        ..._capabilities,
        autonomousRenderLoop: true,
        transport: {
          descriptor: transport.describe(),
        },
      };
      return rolledUp;
    },

    /** Active kernel ID from the worker, available after the first render selects a kernel.
     * @returns Active kernel ID or undefined if no kernel is selected
     */
    get activeKernelId() {
      return _activeKernelId;
    },

    async shutdown(options?: { drain?: boolean }): Promise<void> {
      // Async lifecycle counterpart to terminate(). Two flavours:
      //   - `drain: false` (default) — same observable behaviour as terminate(),
      //     but returns a Promise that resolves once teardown finishes. The
      //     async surface lets consumers `await client.shutdown()` in symmetric
      //     async setup/teardown sites without ceremony.
      //   - `drain: true` — wait for every in-flight intent (connect, render,
      //     exports) to settle on its own *before* tearing the transport down.
      //     The drain is cooperative: a concurrent terminate() cancels it,
      //     rejects the pending intents, and the awaiting shutdown() promise
      //     still resolves once teardown completes.
      if (lifecycleState === 'terminated') {
        return;
      }

      if (options?.drain === true && inFlightIntents.size > 0) {
        const drained = [...inFlightIntents].map(async (promise) => {
          try {
            await promise;
          } catch {
            /* Swallow so the drain only waits without surfacing intent failures. */
          }
        });
        await Promise.allSettled(drained);

        if ((lifecycleState as RuntimeLifecycleState) === 'terminated') {
          return;
        }
      }

      this.terminate();
    },

    terminate(): void {
      // Deterministic, idempotent terminate. Subsequent calls are no-ops —
      // the very first call:
      //   1. Rejects every in-flight intent (connect, render, exports) on the
      //      next microtask via `queueMicrotask`, so awaiting callers settle
      //      with `RuntimeTerminatedError({ causeKind: 'explicit' })` instead
      //      of hanging or surfacing a misleading downstream error.
      //   2. Tears down the worker client (subscriptions + timers only — transport
      //      teardown follows in step 3).
      //   3. Closes the materialised {@link RuntimeTransportClient} via {@link RuntimeTransportClient.close}.
      //   4. Flips `lifecycleState` to `'terminated'` so future `on(...)` /
      //      `connect(...)` calls throw synchronously.
      if (lifecycleState === 'terminated') {
        return;
      }

      const priorConnect = pendingConnect;
      const priorRender = pendingRender;
      const priorExports = [...pendingExports];

      pendingConnect = undefined;
      pendingRender = undefined;
      pendingExports.clear();

      queueMicrotask(() => {
        const error = new RuntimeTerminatedError('explicit');
        if (priorConnect) {
          priorConnect.reject(error);
        }
        if (priorRender) {
          priorRender.reject(error);
        }
        for (const slot of priorExports) {
          slot.reject(error);
        }
      });

      workerClient?.cleanup();
      workerClient?.terminate();

      void transport.close('Runtime client terminated');

      for (const topic of Object.values(handlers)) {
        topic.dispose();
      }

      workerClient = undefined;
      lifecycleState = 'terminated';
      hasSettledRender = false;
      lastEmittedGeometryHashKey = undefined;
    },
  };
}
