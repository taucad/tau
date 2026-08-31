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

import type { ExportFile, FileExtension, LogEntry } from '@taucad/types';
import { idPrefix, logLevels } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
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
import { RuntimeWorkerClient, RenderTimeoutError, assertValidRenderTimeout } from '#framework/runtime-worker-client.js';
import type { RuntimeTransportClient, TransportPlugin } from '#transport/runtime-transport.types.js';
import type { TransportDescriptor } from '#transport/runtime-transport-descriptor.types.js';
import type { RuntimeFromTransport } from '#transport/transport-projections.js';
import type {
  KernelPlugin,
  MiddlewarePlugin,
  TranscoderPlugin,
  CollectKernelIds,
  CollectRenderOptions,
  ExportContentFor,
  ExportFormatsFor,
  ExportOptionsFor,
  KnownTargetFormats,
  RenderContentFor,
} from '#plugins/plugin-types.js';
import type {
  AnyRuntimeDefinition,
  RuntimeConfigInput,
  RuntimeConfigProvider,
  RuntimeKernels,
  RuntimeMiddleware,
  RuntimeTranscoders,
} from '#worker/runtime-definition.js';
import type { ContentRequestFor, RuntimeContentInput } from '#types/runtime-content.types.js';
import type { RuntimeFileLocator } from '#types/runtime-file.types.js';
import type { RuntimeSourceSnapshotResult } from '#types/runtime-source-snapshot.types.js';
import { assertRootedPath } from '@taucad/utils/path';

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
        /** Key in `source.files` that starts evaluation. Required at runtime when an unknown file map has multiple entries. */
        readonly entry?: string;
      }
    : true extends IsUnion<KnownSourceKeys<Files>>
      ? {
          /** Key in `source.files` that starts evaluation. Required for multi-file source maps. */
          readonly entry: KnownSourceKeys<Files>;
        }
      : {
          /** Key in `source.files` that starts evaluation. Optional for single-file source maps. */
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
  /** Canonical root-relative path within the runtime filesystem. */
  readonly path: string;
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

/** Extra project-relative file considered alongside the execution source closure. @public */
export type RuntimeSourceSnapshotAdditionalPath = {
  readonly path: string;
  readonly required: boolean;
};

/** Input for collecting a source closure without computing geometry. @public */
export type RuntimeSourceSnapshotInput<Files extends RuntimeSourceFiles = RuntimeSourceFiles> = {
  readonly source: RuntimeSource<Files>;
  readonly additionalPaths?: readonly RuntimeSourceSnapshotAdditionalPath[];
  readonly signal?: AbortSignal;
};

export type {
  RuntimeSourceSnapshotData,
  RuntimeSourceSnapshotFile,
  RuntimeSourceSnapshotFileRole,
  RuntimeSourceSnapshotResult,
} from '#types/runtime-source-snapshot.types.js';

/**
 * Autonomous render input.
 * @public
 */
export type RuntimeRenderInput<
  Kernels extends readonly KernelPlugin[],
  Middleware extends readonly MiddlewarePlugin[],
  Files extends RuntimeSourceFiles = RuntimeSourceFiles,
> = {
  readonly source: RuntimeSource<Files>;
  readonly parameters?: Record<string, unknown>;
  readonly renderOptions?: CollectRenderOptions<Kernels>;
} & ContentRequestFor<RenderContentFor<Kernels, Middleware>>;

type RuntimeExportSourceInput<Files extends RuntimeSourceFiles = RuntimeSourceFiles> =
  | {
      readonly source: RuntimeSource<Files>;
      readonly parameters?: Record<string, unknown>;
    }
  | {
      readonly source?: undefined;
      readonly parameters?: never;
    };

type RuntimeTranscodeInput<Transcoders extends readonly TranscoderPlugin[]> = {
  [Index in keyof Transcoders]: Transcoders[Index] extends TranscoderPlugin<infer EdgeMap, infer From>
    ? {
        [To in Extract<keyof EdgeMap, FileExtension>]: {
          readonly from: Extract<From, FileExtension>;
          readonly to: To;
          readonly files: ExportFile[];
          readonly options: EdgeMap[To];
          readonly signal?: AbortSignal;
        };
      }[Extract<keyof EdgeMap, FileExtension>]
    : never;
}[number];

/**
 * Export input. Runtime-owned request fields live at the top level; plugin
 * export options live under `exportOptions`.
 * @public
 */
export type RuntimeExportOptions<
  Kernels extends readonly KernelPlugin[],
  Middleware extends readonly MiddlewarePlugin[],
  Transcoders extends readonly TranscoderPlugin[],
  Format extends ExportFormatsFor<Kernels, Transcoders>,
  Files extends RuntimeSourceFiles = RuntimeSourceFiles,
> = RuntimeExportSourceInput<Files> & {
  readonly exportOptions?: ExportOptionsFor<Kernels, Transcoders, Format>;
} & ContentRequestFor<ExportContentFor<Kernels, Middleware, Transcoders, Format>> & {
    /**
     * Per-call cancellation. Aborting rejects the export with a `DOMException`
     * named `AbortError` and cancels the in-flight worker operation at its
     * existing abort checkpoints. `render` has no equivalent: it cancels by
     * supersession, so an in-flight render is invalidated by the next render
     * rather than by a signal.
     */
    readonly signal?: AbortSignal;
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
 * render, or `superseded: true` when a newer selected preview wins before this
 * one settles. The successor may come from another public preview command or
 * an autonomous watched-filesystem rerender; its geometry is published through
 * the `geometry` event. Supersession is a normal lifecycle transition — the
 * only failure cases are typed errors (`RenderTimeoutError`, `RuntimeTerminatedError`).
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
 * - `'transport-closed'` — the transport closed unexpectedly (e.g. worker
 *   crashed, websocket dropped).
 * - `'render-timeout'` — timeout cancellation was not acknowledged during
 *   bounded recovery, so the isolated runtime host was terminated. Construct
 *   a new client before issuing more work.
 *
 * @public
 */
export type RuntimeTerminatedCause = 'explicit' | 'transport-closed' | 'render-timeout';

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
    super(
      causeKind === 'render-timeout'
        ? 'The isolated runtime host did not recover from a render timeout and was terminated. Create a new RuntimeClient before issuing more work.'
        : 'RuntimeClient has been terminated.',
    );
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
 * Split a canonical runtime entry path into its worker-protocol locator.
 *
 * - `'main.ts'` --> `{ path: '', filename: 'main.ts' }`
 * - `'src/model.ts'` --> `{ path: 'src', filename: 'model.ts' }`
 * - `'examples/bench.ts'` --> `{ path: 'examples', filename: 'bench.ts' }`
 *
 * @param file - file path string to resolve
 * @returns geometry file with separated path and filename
 */
function resolveFileString(file: string): RuntimeFileLocator {
  const lastSlash = file.lastIndexOf('/');
  if (lastSlash === -1) {
    return { path: '', filename: file };
  }

  const path = file.slice(0, lastSlash);
  return {
    path,
    filename: file.slice(lastSlash + 1),
  };
}

const assertRuntimeFilePath = (path: string): string => {
  const canonical = assertRootedPath(path);
  if (canonical === '') {
    throw new TypeError(`Runtime source path must identify a file: ${JSON.stringify(path)}`);
  }
  return canonical;
};

type NormalizedRuntimeSource = {
  readonly stage?: Record<string, Uint8Array<ArrayBuffer>>;
  readonly file: RuntimeFileLocator;
};

const exportInputKeys = new Set(['source', 'parameters', 'exportOptions', 'content', 'signal']);

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
    const stage: Record<string, Uint8Array<ArrayBuffer>> = {};
    const rawPathByCanonical = new Map<string, string>();
    for (const [filename, content] of entries) {
      const canonicalPath = assertRuntimeFilePath(filename);
      const collision = rawPathByCanonical.get(canonicalPath);
      if (collision !== undefined) {
        throw new TypeError(
          `Runtime source files ${JSON.stringify(collision)} and ${JSON.stringify(filename)} resolve to ${canonicalPath}.`,
        );
      }
      rawPathByCanonical.set(canonicalPath, filename);
      stage[canonicalPath] = toStagedBytes(filename, content);
    }
    const canonicalEntry = assertRuntimeFilePath(entry);
    if (!rawPathByCanonical.has(canonicalEntry)) {
      throw new TypeError(`Runtime source entry "${entry}" must resolve to one of the files keys.`);
    }
    return { stage, file: resolveFileString(canonicalEntry) };
  }
  if ('path' in source) {
    const { path } = source;
    if (typeof path === 'string') {
      return { file: resolveFileString(assertRuntimeFilePath(path)) };
    }
    throw new TypeError('Runtime source `path` must be a string.');
  }
  throw new TypeError('Runtime source must include either `files` or `path`.');
};

const normalizeSnapshotAdditionalPaths = (
  value: readonly RuntimeSourceSnapshotAdditionalPath[] | undefined,
): readonly RuntimeSourceSnapshotAdditionalPath[] | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new TypeError('RuntimeClient.snapshotSource additionalPaths must be an array.');
  }
  const byPath = new Map<string, boolean>();
  for (const additional of value) {
    if (
      !isRecord(additional) ||
      typeof additional['path'] !== 'string' ||
      typeof additional['required'] !== 'boolean'
    ) {
      throw new TypeError('RuntimeClient.snapshotSource additionalPaths entries require path and required fields.');
    }
    const path = assertRuntimeFilePath(additional['path']);
    byPath.set(path, additional['required'] || byPath.get(path) === true);
  }
  return [...byPath]
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([path, required]) => ({
      path,
      required,
    }));
};

const assertExportInputShape = (input: Record<string, unknown>): void => {
  for (const key of Object.keys(input)) {
    if (!exportInputKeys.has(key)) {
      throw new TypeError(
        `RuntimeClient.export options support only source, parameters, exportOptions, content, and signal; received "${key}".`,
      );
    }
  }
  if ('parameters' in input && input['source'] === undefined) {
    throw new TypeError('RuntimeClient.export parameters require a source.');
  }
};

/** Reject a non-record command input before it reaches admission and dies at silent wire validation. */
const assertRecordInput = (operation: string, field: string, value: unknown): void => {
  if (value !== undefined && !isRecord(value)) {
    throw new TypeError(`RuntimeClient.${operation} ${field} must be an object.`);
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
   * Wall-clock deadline applied independently to each preview. Milliseconds.
   * Zero disables timeout enforcement.
   *
   * Enforced client-side per preview. The affected promise rejects with
   * {@link RenderTimeoutError} at the deadline; isolated transports then
   * target that preview for cooperative cancellation and terminate an
   * unresponsive host after the recovery grace period.
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
 ** @public*/
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

type ClientMiddleware<Runtime> = Runtime extends AnyRuntimeDefinition
  ? RuntimeMiddleware<Runtime> extends ReadonlyArray<MiddlewarePlugin<any, any, any>>
    ? RuntimeMiddleware<Runtime>
    : Array<MiddlewarePlugin<any, any, any>>
  : Array<MiddlewarePlugin<any, any, any>>;

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
type RuntimeClientProjection<
  Kernels extends ReadonlyArray<KernelPlugin<any, any, any>> = KernelPlugin[],
  Middleware extends ReadonlyArray<MiddlewarePlugin<any, any, any>> = MiddlewarePlugin[],
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
  readonly capabilities: RuntimeCapabilities<Kernels, Middleware, Transcoders> | undefined;

  /** Active kernel ID from the worker, available after the first render selects a kernel. */
  readonly activeKernelId: CollectKernelIds<Kernels> | undefined;

  /**
   * Current lifecycle state of the client.
   *
   * Advances through `unconnected` → `connecting` → `connected` →
   * `terminated`. The only backwards transition is a failed connection
   * attempt, which demotes `connecting` back to `unconnected` so a retry can
   * start a fresh attempt; `terminated` is irreversible. Consumers can poll
   * this getter for defensive UI gating; command APIs throw
   * {@link RuntimeNotConnectedError}
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
  routesFor<const Format extends KnownTargetFormats<Kernels, Transcoders>>(
    format: Format,
  ): ReadonlyArray<ExportRoute<Kernels, Middleware, Transcoders, Format>>;

  /**
   * Selects the best {@link ExportRoute} for `format` using the framework
   * tiebreak rules:
   *
   * 1. When `kernelId` is supplied, retain only routes for that kernel.
   * 2. Prefer `brep` fidelity over `mesh` fidelity.
   * 3. Prefer direct routes (`transcoderId === undefined`) over transcoded
   *    routes.
   * 4. Otherwise return the first manifest-order match.
   *
   * Returns `undefined` when no route matches the requested format, kernel,
   * and content requirements, or when the manifest has not yet been received.
   */
  bestRouteFor<
    const Format extends KnownTargetFormats<Kernels, Transcoders> & string,
    const Kernel extends CollectKernelIds<Kernels> | undefined = undefined,
  >(
    format: Format,
    options?: {
      readonly kernelId?: Kernel;
    } & ContentRequestFor<
      ExportContentFor<
        Kernels,
        Middleware,
        Transcoders,
        Format,
        Kernel extends string ? Kernel : CollectKernelIds<Kernels>
      >
    >,
  ):
    | ExportRoute<Kernels, Middleware, Transcoders, Format, Kernel extends string ? Kernel : CollectKernelIds<Kernels>>
    | undefined;

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
   * Export geometry in the specified format.
   *
   * With no `source`, re-exports the geometry produced by the most recent
   * `render`, `updateParameters`, or `setOptions` call and throws
   * {@link NoRenderOutcomeError} when no prior render has settled. With
   * `options.source`, performs a request-scoped render and export without
   * replacing the active preview source. Request-scoped `parameters` require
   * that same call to provide `source`.
   *
   * When `Kernels`/`Transcoders` carry type information (from typed plugins),
   * the options are type-checked against the declared per-format schemas
   * through the nested `exportOptions` field.
   *
   * @param format - Export format identifier (e.g., 'stl', 'step', '3mf')
   * @param options - Optional request-scoped source, parameters, content, cancellation `signal`, and format-specific export options
   * @returns Export result with an ordered, non-empty ExportFile array
   * @public
   */
  export<
    const F extends ExportFormatsFor<Kernels, Transcoders>,
    const Files extends RuntimeSourceFiles = RuntimeSourceFiles,
  >(
    format: F,
    options?: RuntimeExportOptions<Kernels, Middleware, Transcoders, F, Files>,
  ): Promise<ExportResult>;

  /** Transcode caller-owned artifacts without rendering a kernel source. */
  transcode(input: RuntimeTranscodeInput<Transcoders>): Promise<ExportResult>;

  /**
   * Collect the selected source closure and approved additional files without computing geometry.
   *
   * @param input - Runtime source, approved additional paths, and cancellation signal.
   * @returns Coherent selected source bytes, hashes, roles, and unresolved diagnostics.
   * @public
   */
  snapshotSource<const Files extends RuntimeSourceFiles = RuntimeSourceFiles>(
    input: RuntimeSourceSnapshotInput<Files>,
  ): Promise<RuntimeSourceSnapshotResult>;

  /**
   * Render a source through the autonomous render loop.
   *
   * Resolves with `{ superseded: false, geometry }` when the render this call
   * triggered settles, or with `{ superseded: true }` when a newer public
   * preview command or autonomous watched-filesystem rerender wins before
   * settlement. Successor geometry is published through the `geometry` event.
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
    input: RuntimeRenderInput<Kernels, Middleware, Files>,
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
   * from the call are dropped. Awaits the next render's settlement.
   *
   * @param options - Replacement kernel-specific render options
   * @returns Promise that settles with a {@link RenderOutcome}
   * @public
   */
  setOptions(options: CollectRenderOptions<Kernels>): Promise<RenderOutcome>;

  /**
   * Set the wall-clock timeout used by subsequent renders on this connected client.
   * The update is synchronous and does not affect an in-flight render.
   *
   * @param renderTimeout - Milliseconds. Zero disables timeout enforcement.
   * @returns Nothing.
   * @public
   */
  setRenderTimeout(renderTimeout: number): void;

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
    handler: (manifest: CapabilitiesManifest<Kernels, Middleware, Transcoders>) => void,
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

/** High-level client projected from one complete runtime definition. @public */
export type RuntimeClient<
  Runtime extends AnyRuntimeDefinition = AnyRuntimeDefinition,
  Transport extends AnyTransportPlugin = AnyTransportPlugin,
> = RuntimeClientProjection<ClientKernels<Runtime>, ClientMiddleware<Runtime>, ClientTranscoders<Runtime>, Transport>;

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
 *     createWorker: () => new Worker(new URL('./runtime.worker.ts', import.meta.url), { type: 'module' }),
 *     fileSystem: fromMemoryFs(),
 *   }),
 * });
 * ```
 */
// oxlint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-restricted-types -- variance + empty-tuple default
export function createRuntimeClient<
  const Runtime extends AnyRuntimeDefinition | undefined = undefined,
  const Transport extends AnyTransportPlugin = AnyTransportPlugin,
>(
  options: RuntimeClientOptionsWithTransport<Runtime, Transport>,
): RuntimeClient<
  RuntimeForClient<Runtime, Transport> extends AnyRuntimeDefinition
    ? RuntimeForClient<Runtime, Transport>
    : AnyRuntimeDefinition,
  Transport
>;
// oxlint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-restricted-types
// The implementation signature returns the wide internal projection because the worker
// physically emits a wide `CapabilitiesManifest` over `postMessage` — no
// generic information survives the wire. The public overload narrows the
// return to `RuntimeClient<typeof runtimeDefinition, Transport>`. This is a *witness*
// narrowing, not a structural lie: every concrete value the worker emits is
// already a member of the narrower carrier, so the seam is sound by
// construction. Compile-time proof lives in `define-plugin.test-d.ts`.
// oxlint-disable-next-line tau-lint/require-public-export-jsdoc -- false positive
export function createRuntimeClient(
  options: RuntimeClientOptionsWithTransport<AnyRuntimeDefinition>,
): RuntimeClientProjection {
  const transportPlugin = (options as { readonly transport?: AnyTransportPlugin }).transport;
  if (!transportPlugin) {
    throw new Error(
      'createRuntimeClient: `transport` is required. Pass `inProcessTransport({ runtime })` for same-isolate usage.',
    );
  }
  const transport: RuntimeTransportClient = transportPlugin.materialize();
  const configProvider = options.config;

  let workerClient: RuntimeWorkerClient | undefined;
  let workerClientWired = false;
  let activeRenderTimeout = options.renderTimeout ?? 0;
  assertValidRenderTimeout(activeRenderTimeout);
  if (activeRenderTimeout > 0 && transport.renderTimeoutRecovery.kind === 'unsupported') {
    throw new TypeError(
      'renderTimeout must be 0 because this transport cannot enforce a wall-clock render deadline. Use a worker-backed transport with terminable timeout recovery.',
    );
  }
  let terminalCause: RuntimeTerminatedCause | undefined;
  let lifecycleState: RuntimeLifecycleState = 'unconnected';
  let intentAdmissionOpen = true;
  let gracefulShutdownPromise: Promise<void> | undefined;
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
    assertIntentAdmissionOpen();
    if (lifecycleState === 'terminated') {
      throw new RuntimeTerminatedError(terminalCause);
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
    assertIntentAdmissionOpen();
    if (lifecycleState === 'terminated') {
      throw new RuntimeTerminatedError(terminalCause);
    }
  }

  function assertIntentAdmissionOpen(): void {
    if (!intentAdmissionOpen) {
      throw new RuntimeTerminatedError(terminalCause);
    }
  }

  let _capabilities: CapabilitiesManifest | undefined;
  let _activeKernelId: string | undefined;

  /**
   * Tracks only the latest public preview Promise. A newer selected preview —
   * including an autonomous watched-filesystem rerender — resolves a different
   * pending Promise as `{ superseded: true }`. Selection and stale-frame
   * filtering are owned by RuntimeWorkerClient.
   */
  type PendingRender = {
    readonly renderId: string;
    resolve: (outcome: RenderOutcome) => void;
    reject: (error: Error) => void;
    renderTimeout: number;
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
   */
  type ConnectionAttempt = {
    readonly promise: Promise<RuntimeWorkerClient>;
    readonly reject: (error: Error) => void;
  };
  let connectionAttempt: ConnectionAttempt | undefined;

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

  function resolvePendingRender(geometry: HashedGeometryResult, renderId: string): void {
    const prior = pendingRender;
    if (prior?.renderId === renderId) {
      pendingRender = undefined;
      prior.resolve({ superseded: false, geometry });
    }
  }

  /** Render-scoped only: an absent `renderId` must never match, so it cannot be passed. */
  function rejectPendingRender(issues: KernelIssue[], renderId: string): void {
    const prior = pendingRender;
    if (prior?.renderId !== renderId) {
      return;
    }
    pendingRender = undefined;
    if (issues.some((issue) => issue.code === 'RENDER_TIMEOUT')) {
      prior.reject(new RenderTimeoutError(prior.renderTimeout));
      return;
    }
    const message = issues.map((issue) => issue.message).join('; ');
    prior.reject(new Error(message));
  }

  // oxlint-disable-next-line @typescript-eslint/promise-function-async -- Promise.withResolvers captures the slot for later settlement by superseding intents
  function trackPendingRender(renderId: string): Promise<RenderOutcome> {
    supersedePendingRender();
    const slot = Promise.withResolvers<RenderOutcome>();
    pendingRender = { renderId, resolve: slot.resolve, reject: slot.reject, renderTimeout: activeRenderTimeout };
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

  function getWorkerClient(): RuntimeWorkerClient {
    if (!workerClient) {
      workerClient = new RuntimeWorkerClient({ transport });
      /* Admission is synchronous and intentionally precedes lazy connection.
       * Seed the configured deadline before the first admission so its captured
       * timeout cannot default to zero while initialize() is still pending. */
      workerClient.setRenderTimeout(activeRenderTimeout);
    }
    if (workerClientWired) {
      return workerClient;
    }
    workerClientWired = true;

    workerClient.onLog((entry) => {
      handlers.log.emit(entry);
    });
    workerClient.onTelemetry((entries) => {
      handlers.telemetry.emit([...entries]);
    });
    workerClient.onState(({ renderId, state, detail, geometryObserved }) => {
      if (
        (state === 'buffering' || state === 'rendering') &&
        pendingRender !== undefined &&
        pendingRender.renderId !== renderId
      ) {
        supersedePendingRender();
      }
      latestWorkerState = state;
      if (state === 'buffering' || state === 'rendering') {
        hasRenderFailure = false;
      }
      if (state === 'error') {
        hasRenderCommandInFlight = false;
        rejectPendingRender(
          [
            {
              message: detail ?? 'Runtime render failed',
              code: 'RUNTIME',
              type: 'runtime',
              severity: 'error',
            },
          ],
          renderId,
        );
      }
      /* A selected preview that reaches terminal `idle` without ever emitting
       * geometry produced nothing for its public promise — the stale-SAB
       * command whose autonomous successor already completed. Settle it as
       * superseded instead of leaving it hanging with a cleared deadline. */
      if (state === 'idle' && !geometryObserved && pendingRender?.renderId === renderId) {
        hasRenderCommandInFlight = false;
        supersedePendingRender();
      }
      handlers.state.emit({ state, detail });
      publishRenderStatus();
    });
    workerClient.onGeometry((resolved, renderId) => {
      hasRenderCommandInFlight = false;
      if (resolved.success) {
        hasSettledRender = true;
        hasRenderFailure = false;
      } else {
        hasRenderFailure = true;
      }
      resolvePendingRender(resolved, renderId);
      emitGeometry(resolved);
      publishRenderStatus();
    });
    workerClient.onParametersResolved(({ result }) => {
      handlers.parametersResolved.emit(result);
    });
    workerClient.onProgress(({ phase, detail }) => {
      handlers.progress.emit({ phase, detail });
    });
    workerClient.onError((issues, renderId) => {
      const mutableIssues: KernelIssue[] = [...issues];
      hasRenderFailure = true;
      hasRenderCommandInFlight = false;
      /* A connection-scoped error carries no `renderId`; it is diagnostics
       * only and must never settle a render-scoped promise. */
      if (renderId !== undefined) {
        rejectPendingRender(mutableIssues, renderId);
      }
      handlers.error.emit(mutableIssues);
      publishRenderStatus();
    });
    workerClient.onLocalTimeout(({ renderId, renderTimeout, issues }) => {
      const prior = pendingRender;
      if (prior && prior.renderId !== renderId) {
        return;
      }
      if (prior?.renderId === renderId) {
        pendingRender = undefined;
        prior.reject(new RenderTimeoutError(renderTimeout));
      }
      hasRenderFailure = true;
      hasRenderCommandInFlight = false;
      handlers.error.emit([...issues]);
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
    return workerClient;
  }

  function terminateFromTransport(causeKind: RuntimeTerminatedCause): void {
    if (lifecycleState === 'terminated') {
      return;
    }
    terminalCause = causeKind;
    intentAdmissionOpen = false;
    const error = new RuntimeTerminatedError(causeKind);
    connectionAttempt?.reject(error);
    connectionAttempt = undefined;
    pendingRender?.reject(error);
    pendingRender = undefined;
    for (const slot of pendingExports) {
      slot.reject(error);
    }
    pendingExports.clear();
    workerClient?.terminate();
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
  }

  const observeTransportClosure = async (): Promise<void> => {
    const result = await transport.closed;
    if (result.cause === 'requested') {
      terminateFromTransport(terminalCause ?? 'explicit');
      return;
    }
    if (result.cause === 'host-exit' || result.cause === 'wire-failure') {
      /* `terminateFromTransport` disposes every topic, so the one detail a
       * consumer cannot otherwise recover — the host's exit code, or the wire
       * error — has to ride the log topic before that happens.
       * ponytail: the exit code reaches consumers as a log entry, not a typed
       * field; promote it when a consumer needs to branch on it. */
      handlers.log.emit({
        id: generatePrefixedId(idPrefix.log),
        timestamp: Date.now(),
        level: logLevels.warn,
        message:
          result.cause === 'host-exit'
            ? `Runtime host exited (exit code ${result.exitCode ?? 'unknown'}); the client is terminating.`
            : `Runtime transport failed (${result.error.message}); the client is terminating.`,
        origin: { component: 'RuntimeClient', operation: 'observeTransportClosure' },
      });
    }
    terminateFromTransport(result.cause === 'render-timeout' ? 'render-timeout' : 'transport-closed');
  };
  void observeTransportClosure();

  // oxlint-disable-next-line promise-function-async -- all callers must receive the shared single-flight promise by identity.
  function ensureConnected(): Promise<RuntimeWorkerClient> {
    if (lifecycleState === 'terminated') {
      return Promise.reject(new RuntimeTerminatedError(terminalCause));
    }
    if (workerClient && lifecycleState === 'connected') {
      return Promise.resolve(workerClient);
    }
    if (connectionAttempt) {
      return connectionAttempt.promise;
    }

    setLifecycleState('connecting');
    const connectedWorkerClient = getWorkerClient();
    const slot = Promise.withResolvers<RuntimeWorkerClient>();
    const attempt: ConnectionAttempt = { promise: slot.promise, reject: slot.reject };
    connectionAttempt = attempt;

    const resolveConnectionAttempt = async (): Promise<void> => {
      let resolvingConfig = true;
      try {
        const config = await resolveRuntimeClientConfig(configProvider);
        resolvingConfig = false;
        await connectedWorkerClient.initialize({ config });
        if (readLifecycleState() === 'terminated') {
          throw new RuntimeTerminatedError(terminalCause);
        }
        _capabilities = connectedWorkerClient.capabilities;
        if (_capabilities) {
          handlers.capabilities.emit(_capabilities);
        }
        connectedWorkerClient.setRenderTimeout(activeRenderTimeout);
        setLifecycleState('connected');
        slot.resolve(connectedWorkerClient);
      } catch (error) {
        if (readLifecycleState() !== 'terminated') {
          /* Discard the half-wired client: it may already hold channel
           * subscriptions, so a retry must build a fresh, singly-wired one. */
          connectedWorkerClient.terminate();
          if (workerClient === connectedWorkerClient) {
            workerClient = undefined;
            workerClientWired = false;
          }
          hasRenderFailure = true;
          setLifecycleState('unconnected');
        }
        if (error instanceof RuntimeTerminatedError || error instanceof RuntimeConnectionError) {
          slot.reject(error);
          return;
        }
        const message = error instanceof Error ? error.message : 'Failed to initialise kernel runtime';
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
        slot.reject(new RuntimeConnectionError(message, causeKind, error));
      } finally {
        if (connectionAttempt === attempt) {
          connectionAttempt = undefined;
        }
      }
    };
    void resolveConnectionAttempt();
    return attempt.promise;
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

    // oxlint-disable-next-line promise-function-async -- preserves the shared connection promise rather than wrapping it.
    connect(): Promise<void> {
      assertIntentAdmissionOpen();
      if (lifecycleState === 'terminated') {
        return Promise.reject(new RuntimeTerminatedError(terminalCause));
      }
      if (lifecycleState === 'connected') {
        return Promise.resolve();
      }
      const settleConnection = async (): Promise<void> => {
        await ensureConnected();
      };
      return trackInFlight(settleConnection());
    },

    async export(format: FileExtension, inputOrOptions?: Record<string, unknown>): Promise<ExportResult> {
      assertIntentAdmissionOpen();
      let requestScopedExport: RuntimeExportModelArgs | undefined;
      let resolvedExportOptions: Record<string, unknown> | undefined;

      if (inputOrOptions !== undefined) {
        if (!isRecord(inputOrOptions)) {
          throw new TypeError('RuntimeClient.export options must be an object.');
        }
        assertExportInputShape(inputOrOptions);
      }

      const exportSignal = inputOrOptions?.['signal'] as AbortSignal | undefined;

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
          ...(inputOrOptions['content'] === undefined
            ? {}
            : { content: inputOrOptions['content'] as RuntimeContentInput }),
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
              client.exportModel(request, exportSignal).then(resolve).catch(reject);
            }),
          );
        } else {
          internalResult = await trackInFlight(
            new Promise<Awaited<ReturnType<typeof client.exportGeometry>>>((resolve, reject) => {
              exportReject = reject;
              client
                .exportGeometry(
                  format,
                  resolvedExportOptions,
                  inputOrOptions?.['content'] as RuntimeContentInput,
                  exportSignal,
                )
                .then(resolve)
                .catch(reject);
            }),
          );
        }
        return internalResult;
      } finally {
        pendingExports.delete(exportSlot);
      }
    },

    async transcode(input: {
      readonly from: FileExtension;
      readonly to: FileExtension;
      readonly files: ExportFile[];
      readonly options: Record<string, unknown>;
      readonly signal?: AbortSignal;
    }): Promise<ExportResult> {
      assertIntentAdmissionOpen();
      const client = await ensureConnected();
      const { signal, ...request } = input;
      return trackInFlight(client.transcode(request, signal));
    },

    async snapshotSource<const Files extends RuntimeSourceFiles = RuntimeSourceFiles>(
      input: RuntimeSourceSnapshotInput<Files>,
    ): Promise<RuntimeSourceSnapshotResult> {
      assertIntentAdmissionOpen();
      if (!isRecord(input)) {
        throw new TypeError('RuntimeClient.snapshotSource input must be an object.');
      }
      const normalized = normalizeRuntimeSource(input.source);
      const additionalPaths = normalizeSnapshotAdditionalPaths(input.additionalPaths);
      const client = await ensureConnected();
      return trackInFlight(
        client.snapshotSource(
          {
            ...(normalized.stage === undefined ? {} : { stage: normalized.stage }),
            file: normalized.file,
            ...(additionalPaths === undefined ? {} : { additionalPaths }),
          },
          input.signal,
        ),
      );
    },

    async render<const Files extends RuntimeSourceFiles = RuntimeSourceFiles>(
      input: RuntimeRenderInput<KernelPlugin[], MiddlewarePlugin[], Files>,
    ): Promise<RenderOutcome> {
      // Both inline and filesystem source forms route through the supplied transport,
      // which owns the host-side filesystem. Lazy auto-connect is therefore
      // safe in either branch — the transport handles missing-FS errors at
      // its own boundary if the consumer forgot to wire one.
      assertNotTerminated();
      assertRecordInput('render', 'parameters', input.parameters);
      assertRecordInput('render', 'renderOptions', input.renderOptions);
      assertRecordInput('render', 'content', input.content);
      const normalized = normalizeRuntimeSource(input.source);
      const parameters = input.parameters ?? {};
      const { renderOptions, content } = input;
      const admissionClient = getWorkerClient();
      const admission = admissionClient.admitPreview();
      beginRenderCommand({ publish: lifecycleState === 'connected' });
      const settlement = trackInFlight(trackPendingRender(admission.renderId));

      try {
        const client = await ensureConnected();
        if (normalized.stage) {
          client.stageAndOpenFile(
            {
              stage: normalized.stage,
              file: normalized.file,
              parameters,
              options: renderOptions,
              content,
            },
            admission,
          );
        } else {
          client.openFile(normalized.file, { parameters, options: renderOptions, content }, admission);
        }
      } catch (error) {
        admissionClient.settleSelectedPreview(admission.renderId);
        const prior = pendingRender;
        if (prior?.renderId === admission.renderId) {
          pendingRender = undefined;
          hasRenderFailure = true;
          hasRenderCommandInFlight = false;
          publishRenderStatus();
          prior.reject(error instanceof Error ? error : new Error(String(error)));
        }
      }

      return settlement;
    },

    async updateParameters(parameters: Record<string, unknown>): Promise<RenderOutcome> {
      // `updateParameters` always requires an active render context, which
      // implies a prior `connect()` — the strict gate is appropriate.
      assertActive('updateParameters');
      if (!isRecord(parameters)) {
        throw new TypeError('RuntimeClient.updateParameters parameters must be an object.');
      }
      const admissionClient = getWorkerClient();
      const admission = admissionClient.admitPreview();
      beginRenderCommand();
      const settlement = trackInFlight(trackPendingRender(admission.renderId));
      try {
        const client = await ensureConnected();
        client.updateParameters(parameters, admission);
      } catch (error) {
        admissionClient.settleSelectedPreview(admission.renderId);
        const prior = pendingRender;
        if (prior?.renderId === admission.renderId) {
          pendingRender = undefined;
          hasRenderFailure = true;
          hasRenderCommandInFlight = false;
          publishRenderStatus();
          prior.reject(error instanceof Error ? error : new Error(String(error)));
        }
      }
      return settlement;
    },

    async setOptions(updatedOptions: CollectRenderOptions<KernelPlugin[]>): Promise<RenderOutcome> {
      assertActive('setOptions');
      assertRecordInput('setOptions', 'options', updatedOptions);
      const admissionClient = getWorkerClient();
      const admission = admissionClient.admitPreview();
      beginRenderCommand();
      const settlement = trackInFlight(trackPendingRender(admission.renderId));
      try {
        const client = await ensureConnected();
        client.setOptions(updatedOptions, admission);
      } catch (error) {
        admissionClient.settleSelectedPreview(admission.renderId);
        const prior = pendingRender;
        if (prior?.renderId === admission.renderId) {
          pendingRender = undefined;
          hasRenderFailure = true;
          hasRenderCommandInFlight = false;
          publishRenderStatus();
          prior.reject(error instanceof Error ? error : new Error(String(error)));
        }
      }
      return settlement;
    },

    setRenderTimeout(renderTimeout: number): void {
      assertActive('setRenderTimeout');
      assertValidRenderTimeout(renderTimeout);
      if (renderTimeout > 0 && transport.renderTimeoutRecovery.kind === 'unsupported') {
        throw new TypeError(
          'renderTimeout must be 0 because this transport cannot enforce a wall-clock render deadline. Use a worker-backed transport with terminable timeout recovery.',
        );
      }
      workerClient!.setRenderTimeout(renderTimeout);
      activeRenderTimeout = renderTimeout;
    },

    on(event: string, handler: (...args: never[]) => void, options?: RuntimeSubscribeOptions): () => void {
      // Synchronous throw after terminate so a post-terminate
      // `client.on('geometry', ...)` is loud rather than silently subscribing
      // to a dead handler set that will never fire.
      if (lifecycleState === 'terminated') {
        throw new RuntimeTerminatedError(terminalCause);
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

    routesFor<const Format extends FileExtension>(
      format: Format,
    ): ReadonlyArray<ExportRoute<KernelPlugin[], MiddlewarePlugin[], TranscoderPlugin[], Format>> {
      if (!_capabilities) {
        return [];
      }
      // SAFETY: the runtime predicate below narrows the route target to the
      // exact literal Format; TypeScript cannot express that refinement over
      // the generic ExportRoute conditional type.
      return _capabilities.routes.filter((route) => route.targetFormat === format) as unknown as ReadonlyArray<
        ExportRoute<KernelPlugin[], MiddlewarePlugin[], TranscoderPlugin[], Format>
      >;
    },

    bestRouteFor<const Format extends FileExtension, const Kernel extends string | undefined = undefined>(
      format: Format,
      options?: { readonly kernelId?: Kernel; readonly content?: RuntimeContentInput },
    ):
      | ExportRoute<
          KernelPlugin[],
          MiddlewarePlugin[],
          TranscoderPlugin[],
          Format,
          Kernel extends string ? Kernel : string
        >
      | undefined {
      if (!_capabilities) {
        return undefined;
      }
      const requestedContent = Object.keys(options?.content ?? {});
      const matches = _capabilities.routes.filter((route) => {
        if (route.targetFormat !== format) {
          return false;
        }
        const supportedContent = route.content?.schema.properties ?? {};
        return requestedContent.every((key) => key in supportedContent);
      });
      if (matches.length === 0) {
        return undefined;
      }

      const candidates = options?.kernelId ? matches.filter((route) => route.kernelId === options.kernelId) : matches;
      if (candidates.length === 0) {
        return undefined;
      }

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

      return indexed[0]?.route as
        | ExportRoute<
            KernelPlugin[],
            MiddlewarePlugin[],
            TranscoderPlugin[],
            Format,
            Kernel extends string ? Kernel : string
          >
        | undefined;
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

      if (options?.drain === true) {
        if (!gracefulShutdownPromise) {
          intentAdmissionOpen = false;
          const admitted = [...inFlightIntents];
          gracefulShutdownPromise = (async () => {
            await Promise.allSettled(admitted);
            if ((lifecycleState as RuntimeLifecycleState) === 'terminated') {
              return;
            }
            const gracefulWorker = workerClient;
            await gracefulWorker?.cleanup();
            if ((lifecycleState as RuntimeLifecycleState) === 'terminated') {
              return;
            }
            gracefulWorker?.terminate();
            terminalCause = 'explicit';
            await transport.close();
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
          })();
        }
        return gracefulShutdownPromise;
      }

      intentAdmissionOpen = false;
      this.terminate();
      await transport.close();
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
      intentAdmissionOpen = false;
      terminalCause = 'explicit';

      const priorConnect = connectionAttempt;
      const priorRender = pendingRender;
      const priorExports = [...pendingExports];

      connectionAttempt = undefined;
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

      workerClient?.terminate();

      void transport.close();

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
