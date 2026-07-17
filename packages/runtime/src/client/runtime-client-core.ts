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

/* oxlint-disable no-barrel-files/no-barrel-files -- public client entrypoint facade */

import type { FileExtension, GeometryFile, LogEntry } from '@taucad/types';
import { Topic } from '@taucad/events';
import type {
  HashedGeometryResult,
  GetParametersResult,
  ExportGeometryResult,
  KernelIssue,
  CapabilitiesManifest,
  ExportRoute,
  RuntimeCapabilities,
} from '#types/runtime.types.js';
import type { KernelIssueCode } from '#types/kernel-issue-codes.js';
import { isKernelIssueCode } from '#types/kernel-issue-codes.js';
import type {
  RuntimeExportModelArgs,
  TelemetryEntry,
  RenderPhase,
  WorkerState,
} from '#types/runtime-protocol.types.js';
import { RuntimeWorkerClient, RenderTimeoutError } from '#framework/runtime-worker-client.js';
import type {
  RuntimeTransportClient,
  TransportDescriptor,
  TransportPlugin,
} from '#transport/runtime-transport.types.js';
import type { RuntimeFromTransport } from '#transport/transport-projections.js';
import type {
  KernelPlugin,
  TranscoderPlugin,
  CollectKernelIds,
  CollectRenderOptions,
  ExportFormatsFor,
  ExportOptionsFor,
  KnownTargetFormats,
} from '#plugins/plugin-types.js';
import type {
  AnyRuntimeDefinition,
  RuntimeConfigInput,
  RuntimeConfigProvider,
  RuntimeKernels,
  RuntimeTranscoders,
} from '#worker/runtime-definition.js';
import type { Simplify } from 'type-fest';

export type { RuntimeConfigInput, RuntimeConfigOutput, RuntimeConfigProvider } from '#worker/runtime-definition.js';

/**
 * Extract the literal `Id` phantom from a wired {@link TransportPlugin}.
 */
// oxlint-disable @typescript-eslint/no-explicit-any -- variance: phantom slot projection
type AnyTransportPlugin = TransportPlugin<any, any, any, any>;
type TransportClientId<T> = T extends TransportPlugin<any, any, infer Id, any> ? Id : string;
// oxlint-enable @typescript-eslint/no-explicit-any

// =============================================================================
// RenderInput Types
// =============================================================================

/**
 * Detects whether a type is a union (more than one member).
 * Used internally to determine if a source object has multiple keys.
 */
type IsUnion<T, U = T> = T extends U ? ([U] extends [T] ? false : true) : never;

/**
 * Inline runtime source content.
 * @public
 */
export type RuntimeSourceContent = string | Uint8Array<ArrayBuffer>;

/**
 * Inline runtime source files keyed by path.
 * @public
 */
export type RuntimeSourceFiles = Readonly<Record<string, RuntimeSourceContent>>;

type KnownSourceKeys<Files extends RuntimeSourceFiles> = Extract<keyof Files, string>;

type RuntimeSourceEntryField<Files extends RuntimeSourceFiles> =
  string extends KnownSourceKeys<Files>
    ? {
        /** Entry point filename. Required when key count is unknown at compile time. */
        readonly entry: string;
      }
    : true extends IsUnion<KnownSourceKeys<Files>>
      ? {
          /** Entry point filename. Required for multi-file source maps. */
          readonly entry: KnownSourceKeys<Files>;
        }
      : {
          /** Entry point filename. Optional for single-file source maps. */
          readonly entry?: KnownSourceKeys<Files>;
        };

/**
 * Inline source input. The `files` property intentionally references `Files`
 * directly so TypeScript can infer literal keys before the empty-map gate.
 * @public
 */
export type InlineRuntimeSource<Files extends RuntimeSourceFiles = RuntimeSourceFiles> = {
  readonly files: Files;
  readonly path?: never;
} & RuntimeSourceEntryField<Files> &
  (keyof Files extends never ? never : unknown);

/**
 * Filesystem-backed source input.
 * @public
 */
export type FilesystemRuntimeSource = {
  readonly path: string | GeometryFile;
  readonly files?: never;
  readonly entry?: never;
};

/**
 * Runtime source input. Inline sources use `files`; filesystem sources use
 * `path`.
 * @public
 */
export type RuntimeSource<Files extends RuntimeSourceFiles = RuntimeSourceFiles> =
  | InlineRuntimeSource<Files>
  | FilesystemRuntimeSource;

/**
 * Autonomous render input.
 * @public
 */
export type RuntimeRenderInput<
  Kernels extends readonly KernelPlugin[],
  Files extends RuntimeSourceFiles = RuntimeSourceFiles,
> = {
  readonly source: RuntimeSource<Files>;
  readonly parameters?: Record<string, unknown>;
  readonly renderOptions?: CollectRenderOptions<Kernels>;
};

/**
 * Autonomous render option update input.
 * @public
 */
export type RuntimeSetOptionsInput<Kernels extends readonly KernelPlugin[]> =
  | {
      readonly renderOptions: CollectRenderOptions<Kernels>;
      readonly renderTimeout?: number;
    }
  | {
      readonly renderOptions?: undefined;
      readonly renderTimeout: number;
    };

type RuntimeExportSourceInput<Files extends RuntimeSourceFiles = RuntimeSourceFiles> =
  | {
      readonly source: RuntimeSource<Files>;
      readonly parameters?: Record<string, unknown>;
    }
  | {
      readonly source?: undefined;
      readonly parameters?: never;
    };

/**
 * Export input. Runtime-owned request fields live at the top level; plugin
 * export options live under `exportOptions`.
 * @public
 */
export type RuntimeExportOptions<
  Kernels extends readonly KernelPlugin[],
  Transcoders extends readonly TranscoderPlugin[],
  Format extends ExportFormatsFor<Kernels, Transcoders>,
  Files extends RuntimeSourceFiles = RuntimeSourceFiles,
> = RuntimeExportSourceInput<Files> & {
  readonly exportOptions?: ExportOptionsFor<Kernels, Transcoders, Format>;
};

/**
 * Consumer-facing complete ordered export artifact set.
 * @public
 */
export type ExportResult = ExportGeometryResult;

/**
 * Discriminated union returned by `render`/`updateParameters`/`setOptions`.
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
 * `render`/`updateParameters`/`setOptions` render has settled on this
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
      'client.export(format) requires a prior render/updateParameters/setOptions to settle. ' +
        'Pass source to client.export(format, { source }) to self-render in one call.',
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
 * - `connected` — ready for command APIs (`render`, `updateParameters`, `setOptions`, `export`).
 * - `terminated` — terminal state; all command APIs reject with {@link RuntimeTerminatedError}.
 *
 * @public
 */
export type RuntimeLifecycleState = 'unconnected' | 'connecting' | 'connected' | 'terminated';

/**
 * UI-ready render lifecycle derived by {@link RuntimeClient}.
 *
 * @public
 */
export type RenderStatus = 'idle' | 'connecting' | 'rendering' | 'ready' | 'error';

/**
 * Runtime client options for browser-safe entries where the caller must pick
 * a concrete transport topology explicitly.
 *
 * @public
 */
export type RuntimeClientOptionsWithTransport<
  Runtime extends AnyRuntimeDefinition | undefined = undefined,
  Transport extends AnyTransportPlugin = AnyTransportPlugin,
> = RuntimeClientOptions<Runtime, Transport> & {
  /**
   * Explicit transport topology. Browser-oriented entries do not fall back to
   * the in-process transport because that would make the import graph
   * framework-visible.
   */
  transport: Transport;
};

/**
 * Thrown when a command API (`render`, `updateParameters`, `setOptions`,
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
 * - `'runtime-config'` — runtime boot config was missing, invalid, or failed
 *   to load before worker runtime composition completed.
 * - `'kernel-binding'` — `kernelClass()` constructor threw inside the
 *   worker (e.g. WASM init failure).
 *
 * @public
 */
export type RuntimeConnectionCause = 'transport-open' | 'capabilities-resolution' | 'runtime-config' | 'kernel-binding';

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

function isRuntimeConfigLikeError(error: unknown, depth = 0): boolean {
  if (depth > 3 || typeof error !== 'object' || error === null) {
    return false;
  }

  const record = error as { readonly name?: unknown; readonly code?: unknown; readonly cause?: unknown };
  if (record.name === 'RuntimeConfigError' || record.code === 'RUNTIME_CONFIG_INVALID') {
    return true;
  }

  return isRuntimeConfigLikeError(record.cause, depth + 1);
}

async function resolveRuntimeClientConfig(config: unknown): Promise<unknown> {
  if (typeof config === 'function') {
    return (config as () => unknown | Promise<unknown>)();
  }

  return config;
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

type NormalizedRuntimeSource = {
  readonly stage?: Record<string, Uint8Array<ArrayBuffer>>;
  readonly file: GeometryFile;
};

const runtimeOperationKeys = new Set(['source', 'parameters', 'renderOptions', 'exportOptions']);
const legacyExportTopLevelKeys = new Set([
  'code',
  'file',
  'entry',
  'options',
  'renderOptions',
  'changedPaths',
  'binary',
  'tessellation',
  'coordinateSystem',
  'unit',
  'linearTolerance',
  'angularTolerance',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const toStagedBytes = (filename: string, content: unknown): Uint8Array<ArrayBuffer> => {
  if (typeof content === 'string') {
    return new TextEncoder().encode(content);
  }
  if (content instanceof Uint8Array) {
    return new Uint8Array(content);
  }
  throw new TypeError(`Runtime source file "${filename}" must be a string or Uint8Array.`);
};

const normalizeRuntimeSource = (source: RuntimeSource | unknown): NormalizedRuntimeSource => {
  if (!isRecord(source)) {
    throw new TypeError('Runtime source must be an object with either `files` or `path`.');
  }
  if ('files' in source && 'path' in source) {
    throw new TypeError('Runtime source must use either `files` or `path`, not both.');
  }
  if ('files' in source) {
    const { entry: rawEntry, files } = source;
    if (!isRecord(files)) {
      throw new TypeError('Runtime source `files` must be a non-empty file map.');
    }

    const entries = Object.entries(files);
    if (entries.length === 0) {
      throw new TypeError('Runtime source `files` must contain at least one file.');
    }

    const entry = typeof rawEntry === 'string' ? rawEntry : entries.length === 1 ? entries[0]![0] : undefined;
    if (!entry) {
      throw new TypeError('Runtime source `entry` is required when `files` contains multiple files.');
    }
    if (!Object.hasOwn(files, entry)) {
      throw new TypeError(`Runtime source entry "${entry}" must be one of the files keys.`);
    }

    const stage: Record<string, Uint8Array<ArrayBuffer>> = {};
    for (const [filename, content] of entries) {
      const absolutePath = filename.startsWith('/') ? filename : `/${filename}`;
      stage[absolutePath] = toStagedBytes(filename, content);
    }
    const absoluteEntry = entry.startsWith('/') ? entry : `/${entry}`;
    return { stage, file: resolveFileString(absoluteEntry) };
  }
  if ('path' in source) {
    const { path } = source;
    if (typeof path === 'string') {
      return { file: resolveFileString(path) };
    }
    if (isRecord(path) && typeof path['path'] === 'string' && typeof path['filename'] === 'string') {
      return { file: path as GeometryFile };
    }
    throw new TypeError('Runtime source `path` must be a string or GeometryFile.');
  }
  throw new TypeError('Runtime source must include either `files` or `path`.');
};

const assertNoLegacyExportShape = (input: Record<string, unknown>): void => {
  for (const key of Object.keys(input)) {
    if (!runtimeOperationKeys.has(key)) {
      throw new TypeError(
        `RuntimeClient.export options use top-level { source?, parameters?, exportOptions? }; move "${key}" into source or exportOptions.`,
      );
    }
    if (legacyExportTopLevelKeys.has(key)) {
      throw new TypeError(
        `RuntimeClient.export no longer accepts top-level "${key}"; use source and exportOptions instead.`,
      );
    }
  }
  if ('parameters' in input && !('source' in input)) {
    throw new TypeError('RuntimeClient.export parameters require a source.');
  }
};

const assertNoFlatSetOptions = (input: Record<string, unknown>): void => {
  const allowed = new Set(['renderOptions', 'renderTimeout']);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      throw new TypeError(
        `RuntimeClient.setOptions uses { renderOptions?, renderTimeout? }; move "${key}" into renderOptions.`,
      );
    }
  }
  if (!('renderOptions' in input) && !('renderTimeout' in input)) {
    throw new TypeError('RuntimeClient.setOptions requires renderOptions or renderTimeout.');
  }
};

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
type RuntimeClientBaseOptions<Transport extends AnyTransportPlugin> = {
  /**
   * Wired transport plugin (`webWorkerTransport({...})`, `inProcessTransport({...})`, …).
   * {@link createRuntimeClient} calls {@link TransportPlugin.materialize} once during
   * construction to obtain the fat {@link RuntimeTransportClient} handle.
   *
   * The selected transport is the runtime topology. Same-isolate transports
   * such as `inProcessTransport({ runtime })` carry the worker-owned runtime
   * through a type-only phantom; worker-backed transports pair with an
   * explicit `typeof runtime` client generic when compile-time narrowing is
   * needed.
   */
  transport: Transport;
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

type RuntimeClientConfigOption<Runtime> = [RuntimeConfigInput<Runtime>] extends [never]
  ? { readonly config?: never }
  : undefined extends RuntimeConfigInput<Runtime>
    ? { readonly config?: RuntimeConfigProvider<Runtime> }
    : { readonly config: RuntimeConfigProvider<Runtime> };

type RuntimeForClient<Runtime, Transport extends TransportPlugin> = Runtime extends AnyRuntimeDefinition
  ? Runtime
  : RuntimeFromTransport<Transport>;

/**
 *
 */
export type RuntimeClientOptions<
  Runtime extends AnyRuntimeDefinition | undefined = undefined,
  Transport extends AnyTransportPlugin = AnyTransportPlugin,
> = RuntimeClientBaseOptions<Transport> & RuntimeClientConfigOption<RuntimeForClient<Runtime, Transport>>;
// oxlint-enable @typescript-eslint/no-explicit-any

// oxlint-disable @typescript-eslint/no-explicit-any -- variance: projects type bags from worker-owned runtime definitions
type ClientKernels<Runtime> = Runtime extends AnyRuntimeDefinition
  ? RuntimeKernels<Runtime> extends ReadonlyArray<KernelPlugin<any, any, any>>
    ? RuntimeKernels<Runtime>
    : Array<KernelPlugin<any, any, any>>
  : Array<KernelPlugin<any, any, any>>;

type ClientTranscoders<Runtime> = Runtime extends AnyRuntimeDefinition
  ? RuntimeTranscoders<Runtime> extends ReadonlyArray<TranscoderPlugin<any, any, any>>
    ? RuntimeTranscoders<Runtime>
    : Array<TranscoderPlugin<any, any, any>>
  : Array<TranscoderPlugin<any, any, any>>;
// oxlint-enable @typescript-eslint/no-explicit-any

type EventHandlers = {
  log: Topic<LogEntry>;
  progress: Topic<{ phase: RenderPhase; detail?: Record<string, unknown> }>;
  telemetry: Topic<TelemetryEntry[]>;
  parametersResolved: Topic<GetParametersResult>;
  geometry: Topic<HashedGeometryResult>;
  state: Topic<{ state: WorkerState; detail?: string }>;
  renderStatus: Topic<RenderStatus>;
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
  Kernels extends ReadonlyArray<KernelPlugin<any, any, any>> = KernelPlugin[],
  Transcoders extends ReadonlyArray<TranscoderPlugin<any, any, any>> = TranscoderPlugin[],
  Transport extends AnyTransportPlugin = AnyTransportPlugin,
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
   * UI-ready render lifecycle derived from connection state, worker render
   * state, and render settlement.
   *
   * @public
   */
  readonly renderStatus: RenderStatus;

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
    format: Simplify<KnownTargetFormats<Kernels, Transcoders>>,
    kernelId?: CollectKernelIds<Kernels>,
  ): ExportRoute<Kernels, Transcoders> | undefined;

  /**
   * Open the transport and initialize the kernel runtime.
   *
   * Most consumers can skip this method entirely — every command API
   * (`render`, `updateParameters`, `setOptions`, `export`) auto-connects
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
   * Export geometry from the last render in the specified format.
   *
   * Re-exports the geometry produced by the most recent `render`,
   * `updateParameters`, or `setOptions` call. Throws
   * {@link NoRenderOutcomeError} when no prior render has settled — callers
   * without one should pass `source` to self-render before exporting.
   *
   * When `Kernels`/`Transcoders` carry type information (from typed plugins),
   * the options are type-checked against the declared per-format schemas
   * through the nested `exportOptions` field.
   *
   * @param format - Export format identifier (e.g., 'stl', 'step', '3mf')
   * @param options - Per-call source and format-specific export options
   * @returns Export result with an ordered, non-empty ExportFile array
   * @public
   */
  export<
    const F extends ExportFormatsFor<Kernels, Transcoders>,
    const Files extends RuntimeSourceFiles = RuntimeSourceFiles,
  >(
    format: F,
    options?: RuntimeExportOptions<Kernels, Transcoders, F, Files>,
  ): Promise<ExportResult>;

  /**
   * Render a source through the autonomous render loop.
   *
   * Resolves with `{ superseded: false, geometry }` when the render this call
   * triggered settles, or with `{ superseded: true }` when a newer
   * `render`/`updateParameters`/`setOptions` call wins before settlement.
   *
   * Inline `source.files` stages bytes onto the transport's filesystem via the
   * `stage-and-render` notify and auto-connects on first call. Filesystem
   * `source.path` requires the transport to have been constructed with a
   * filesystem.
   *
   * @param input - Source plus optional parameters/render options
   * @returns Promise that settles with a {@link RenderOutcome}
   * @public
   */
  render<const Files extends RuntimeSourceFiles = RuntimeSourceFiles>(
    input: RuntimeRenderInput<Kernels, Files>,
  ): Promise<RenderOutcome>;

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
  setOptions(options: RuntimeSetOptionsInput<Kernels>): Promise<RenderOutcome>;

  /**
   * Subscribe to client events. Returns an unsubscribe function.
   * Subscribable at any time during the client lifecycle.
   *
   * @param event - Event name
   * @param handler - Event handler
   * @returns Unsubscribe function
   */
  on(event: 'geometry', handler: (result: HashedGeometryResult) => void, options?: RuntimeSubscribeOptions): () => void;
  on(event: 'renderStatus', handler: (status: RenderStatus) => void, options?: RuntimeSubscribeOptions): () => void;
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
 * Create a high-level runtime client for an explicit transport.
 *
 * The client lazily opens the supplied transport on first `connect()` /
 * `render()` / `export()` call. Executable runtime composition lives in the
 * worker/host runtime definition. Browser apps can import `typeof runtime`
 * from their worker entry and pass it as this function's generic parameter to
 * retain compile-time narrowing without value-importing executable modules.
 *
 * @param options - Client configuration with optional transport and plugin selections
 * @returns RuntimeClient instance
 *
 * @public
 *
 * @example <caption>Browser worker transport</caption>
 * ```typescript
 * import { createRuntimeClient } from '@taucad/runtime/client';
 * import { fromMemoryFs } from '@taucad/runtime/filesystem';
 * import { webWorkerTransport } from '@taucad/runtime/transport/web';
 *
 * const client = createRuntimeClient({
 *   transport: webWorkerTransport({
 *     createWorker: () => new Worker(new URL('./runtime.worker.js', import.meta.url), { type: 'module' }),
 *     fileSystem: fromMemoryFs(),
 *   }),
 * });
 * ```
 */
// oxlint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-restricted-types -- variance + empty-tuple default
export function createRuntimeClientWithTransport<
  const Runtime extends AnyRuntimeDefinition | undefined = undefined,
  const Transport extends AnyTransportPlugin = AnyTransportPlugin,
>(
  options: RuntimeClientOptionsWithTransport<Runtime, Transport>,
): RuntimeClient<
  ClientKernels<RuntimeForClient<Runtime, Transport>>,
  ClientTranscoders<RuntimeForClient<Runtime, Transport>>,
  Transport
>;
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
export function createRuntimeClientWithTransport(
  options: RuntimeClientOptionsWithTransport<AnyRuntimeDefinition>,
): RuntimeClient {
  const transportPlugin = (options as { readonly transport?: AnyTransportPlugin }).transport;
  if (!transportPlugin) {
    throw new Error(
      'createRuntimeClient: `transport` is required. Pass `inProcessTransport({ runtime })` for same-isolate usage.',
    );
  }
  const transport: RuntimeTransportClient = transportPlugin.materialize();
  const configProvider = options.config;

  let workerClient: RuntimeWorkerClient | undefined;
  let lifecycleState: RuntimeLifecycleState = 'unconnected';
  let latestWorkerState: WorkerState = 'idle';
  let latestRenderStatus: RenderStatus = 'idle';
  let hasRenderFailure = false;
  let hasRenderCommandInFlight = false;

  // Defeats tsgo's conservative narrowing of `lifecycleState` after early
  // `if (lifecycleState === 'terminated') throw` checks across `await`s.
  const readLifecycleState = (): RuntimeLifecycleState => lifecycleState;

  function deriveRenderStatus(): RenderStatus {
    if (lifecycleState === 'terminated' || hasRenderFailure || latestWorkerState === 'error') {
      return 'error';
    }
    if (lifecycleState === 'connecting') {
      return 'connecting';
    }
    if (hasRenderCommandInFlight || latestWorkerState === 'buffering' || latestWorkerState === 'rendering') {
      return 'rendering';
    }
    return lifecycleState === 'connected' && hasSettledRender ? 'ready' : 'idle';
  }

  function publishRenderStatus(): void {
    const next = deriveRenderStatus();
    if (next === latestRenderStatus) {
      return;
    }
    latestRenderStatus = next;
    handlers.renderStatus.emit(next);
  }

  function setLifecycleState(next: RuntimeLifecycleState): void {
    lifecycleState = next;
    if (next === 'connecting') {
      hasRenderFailure = false;
    }
    publishRenderStatus();
  }

  function beginRenderCommand(options?: { publish?: boolean }): void {
    hasRenderFailure = false;
    hasRenderCommandInFlight = true;
    if (options?.publish !== false) {
      publishRenderStatus();
    }
  }

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
   * Tracks the latest in-flight render for render / updateParameters /
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
   * intent-issuing entry-point (`connect`, `render`, `updateParameters`,
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
    renderStatus: new Topic<RenderStatus>({ name: 'RuntimeClient.renderStatus' }),
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

    setLifecycleState('connecting');

    workerClient = new RuntimeWorkerClient({ transport });

    workerClient.onLog((entry) => {
      handlers.log.emit(entry);
    });
    workerClient.onTelemetry((entries) => {
      handlers.telemetry.emit([...entries]);
    });
    workerClient.onState(({ state, detail }) => {
      latestWorkerState = state;
      if (state === 'buffering' || state === 'rendering') {
        hasRenderFailure = false;
      } else if (state === 'error') {
        hasRenderCommandInFlight = false;
      }
      handlers.state.emit({ state, detail });
      publishRenderStatus();
    });
    workerClient.onGeometry((resolved) => {
      hasRenderCommandInFlight = false;
      if (resolved.success) {
        hasSettledRender = true;
        hasRenderFailure = false;
      } else {
        hasRenderFailure = true;
      }
      resolvePendingRender(resolved);
      emitGeometry(resolved);
      publishRenderStatus();
    });
    workerClient.onParametersResolved(({ result }) => {
      handlers.parametersResolved.emit(result);
    });
    workerClient.onProgress(({ phase, detail }) => {
      handlers.progress.emit({ phase, detail });
    });
    workerClient.onError((issues) => {
      const mutableIssues: KernelIssue[] = [...issues];
      hasRenderFailure = true;
      hasRenderCommandInFlight = false;
      rejectPendingRender(mutableIssues);
      handlers.error.emit(mutableIssues);
      publishRenderStatus();
    });
    workerClient.onKernelChange((kernelId) => {
      _activeKernelId = kernelId;
      handlers.activeKernelChanged.emit(kernelId);
    });
    workerClient.onCapabilities((capabilities) => {
      _capabilities = capabilities;
      handlers.capabilities.emit(capabilities);
    });

    let resolvingConfig = true;
    try {
      const config = await resolveRuntimeClientConfig(configProvider);
      resolvingConfig = false;
      await workerClient.initialize({ config });
    } catch (error) {
      if (readLifecycleState() !== 'terminated') {
        hasRenderFailure = true;
        setLifecycleState('unconnected');
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
                typeof issue === 'object' && issue !== null && 'code' in issue && isKernelIssueCode(issue.code),
            )
            .map((issue) => issue.code)
        : [];
      const causeKind: RuntimeConnectionCause =
        resolvingConfig || isRuntimeConfigLikeError(error)
          ? 'runtime-config'
          : issueCodes.includes('KERNEL_BINDING_FAILED')
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

    setLifecycleState('connected');
    return workerClient;
  }

  /**
   * Emit a resolved geometry result to the `geometry` Topic, suppressing
   * back-to-back emissions whose render hash is byte-identical to
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

    const hashKey = result.data.hash;
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

    get renderStatus(): RenderStatus {
      return latestRenderStatus;
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
          hasRenderFailure = true;
          setLifecycleState('unconnected');
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

    async export(format: FileExtension, inputOrOptions?: Record<string, unknown>): Promise<ExportResult> {
      let requestScopedExport: RuntimeExportModelArgs | undefined;
      let resolvedExportOptions: Record<string, unknown> | undefined;

      if (inputOrOptions !== undefined) {
        if (!isRecord(inputOrOptions)) {
          throw new TypeError('RuntimeClient.export options must be an object.');
        }
        assertNoLegacyExportShape(inputOrOptions);
      }

      if (inputOrOptions?.['source'] !== undefined) {
        const normalized = normalizeRuntimeSource(inputOrOptions['source']);
        requestScopedExport = {
          ...(normalized.stage === undefined ? {} : { stage: normalized.stage }),
          file: normalized.file,
          parameters: (inputOrOptions['parameters'] as Record<string, unknown> | undefined) ?? {},
          format,
          ...(inputOrOptions['exportOptions'] === undefined
            ? {}
            : { exportOptions: inputOrOptions['exportOptions'] as Record<string, unknown> }),
        };
      } else if (inputOrOptions?.['exportOptions'] !== undefined) {
        resolvedExportOptions = inputOrOptions['exportOptions'] as Record<string, unknown>;
      }

      // Single-arg `export(format)` reuses the most recently rendered native
      // handle; reject when no render has settled yet. The two-arg form uses
      // request-scoped worker RPC and bypasses this preview-state guard.
      if (!requestScopedExport && !hasSettledRender) {
        throw new NoRenderOutcomeError();
      }

      if (!requestScopedExport) {
        assertActive('export');
      }
      const client = await ensureConnected();

      // Track the in-flight export so terminate() can reject it on
      // the next microtask via the pendingExports set.
      let exportReject: ((error: Error) => void) | undefined;
      const exportSlot = {
        reject(error: Error): void {
          exportReject?.(error);
        },
      };
      pendingExports.add(exportSlot);

      try {
        let internalResult: Awaited<ReturnType<typeof client.exportModel>>;
        if (requestScopedExport) {
          const request = requestScopedExport;
          internalResult = await trackInFlight(
            new Promise<Awaited<ReturnType<typeof client.exportModel>>>((resolve, reject) => {
              exportReject = reject;
              client.exportModel(request).then(resolve).catch(reject);
            }),
          );
        } else {
          internalResult = await trackInFlight(
            new Promise<Awaited<ReturnType<typeof client.exportGeometry>>>((resolve, reject) => {
              exportReject = reject;
              client.exportGeometry(format, resolvedExportOptions).then(resolve).catch(reject);
            }),
          );
        }
        return internalResult;
      } finally {
        pendingExports.delete(exportSlot);
      }
    },

    async render<const Files extends RuntimeSourceFiles = RuntimeSourceFiles>(
      input: RuntimeRenderInput<KernelPlugin[], Files>,
    ): Promise<RenderOutcome> {
      // Both inline and filesystem source forms route through the supplied transport,
      // which owns the host-side filesystem. Lazy auto-connect is therefore
      // safe in either branch — the transport handles missing-FS errors at
      // its own boundary if the consumer forgot to wire one.
      assertNotTerminated();
      beginRenderCommand({ publish: lifecycleState === 'connected' });
      const settlement = trackInFlight(trackPendingRender());

      const parameters = input.parameters ?? {};
      const { renderOptions } = input;

      try {
        const normalized = normalizeRuntimeSource(input.source);
        const client = await ensureConnected();
        if (normalized.stage) {
          client.stageAndOpenFile({
            stage: normalized.stage,
            file: normalized.file,
            parameters,
            options: renderOptions,
          });
        } else {
          client.openFile(normalized.file, parameters, renderOptions);
        }
      } catch (error) {
        const prior = pendingRender;
        hasRenderFailure = true;
        hasRenderCommandInFlight = false;
        publishRenderStatus();
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
      beginRenderCommand();
      const settlement = trackInFlight(trackPendingRender());
      try {
        const client = await ensureConnected();
        client.updateParameters(parameters);
      } catch (error) {
        const prior = pendingRender;
        hasRenderFailure = true;
        hasRenderCommandInFlight = false;
        publishRenderStatus();
        if (prior) {
          pendingRender = undefined;
          prior.reject(error instanceof Error ? error : new Error(String(error)));
        }
      }
      return settlement;
    },

    async setOptions(updatedOptions: RuntimeSetOptionsInput<KernelPlugin[]>): Promise<RenderOutcome> {
      assertActive('setOptions');
      beginRenderCommand();
      const settlement = trackInFlight(trackPendingRender());
      try {
        assertNoFlatSetOptions(updatedOptions as Record<string, unknown>);
        const client = await ensureConnected();
        const renderOptions = updatedOptions.renderOptions ?? {};
        client.setOptions({
          ...renderOptions,
          ...(updatedOptions.renderTimeout === undefined ? {} : { renderTimeout: updatedOptions.renderTimeout }),
        });
      } catch (error) {
        const prior = pendingRender;
        hasRenderFailure = true;
        hasRenderCommandInFlight = false;
        publishRenderStatus();
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
          return handlers.progress.subscribe(({ phase, detail }) => {
            (handler as (phase: RenderPhase, detail?: Record<string, unknown>) => void)(phase, detail);
          }, options);
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
        case 'renderStatus': {
          return handlers.renderStatus.subscribe(handler as (status: RenderStatus) => void, options);
        }
        case 'state': {
          return handlers.state.subscribe(({ state, detail }) => {
            (handler as (state: WorkerState, detail?: string) => void)(state, detail);
          }, options);
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

      workerClient = undefined;
      setLifecycleState('terminated');
      hasSettledRender = false;
      latestWorkerState = 'idle';
      hasRenderFailure = false;
      hasRenderCommandInFlight = false;
      lastEmittedGeometryHashKey = undefined;

      for (const topic of Object.values(handlers)) {
        topic.dispose();
      }
    },
  };
}
