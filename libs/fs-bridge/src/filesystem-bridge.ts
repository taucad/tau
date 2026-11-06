/**
 * Filesystem bridge: worker-side ({@link exposeFileSystem}) and client-side ({@link createFileSystemBridge}).
 */

import {
  getEventOrigin,
  isEventGloballyVisible,
  isWorkspaceMutationError,
  policyAtRoot,
  RootedFileSystemError,
} from '@taucad/filesystem';
import { Topic } from '@taucad/events';
import { safeDispose } from '@taucad/utils/dispose';
import { wrapMessagePort } from '@taucad/rpc';
import type { MessagePortLike } from '@taucad/rpc';
import type { ChangeEvent, PathChangeEvent } from '@taucad/types';
import type { ComposedViewConsumer } from '@taucad/filesystem/composed-view';
import type {
  ChangeSet,
  ChangeSetWatchRequest,
  FileStat,
  CheckedFileWrite,
  CheckedFileWriteResult,
  MkdirOptions,
  PathPolicy,
  ProviderCapabilities,
  WatchEvent,
  WatchRequest,
  WorkspaceFileService,
  WorkspaceMutationContext,
  WorkspaceMutationError,
  WorkspaceMutationErrorCode,
  ChangesetReceipt,
} from '@taucad/filesystem';
import type { BridgeCallTimeout, BridgeServerHandle, Port, StringKeyedObject } from '@taucad/rpc/bridge';
import { catchMessages, createBridgeCall, createBridgePort, createBridgeServer } from '@taucad/rpc/bridge';
import { z } from 'zod';
import {
  createFileSystemBridgeHello,
  fileSystemBridgeProtocolVersion,
  fileSystemBridgeSchemas,
  FileSystemBridgeProtocolVersionError,
} from '#filesystem-bridge-protocol.js';
import type {
  FileSystemBridgeEvent,
  FileSystemBridgeHello,
  FileSystemBridgeRuntimeService,
  LongCall,
  ReadManyResult,
  ReadManyWireRows,
  FactsWireRows,
  FileSystemBridgeWatchFrame,
  FileSystemBridgeWatchRequest,
  FileSystemBridgeService,
  FileSystemBridgeUnrootedCalls,
  FileSystemBridgeWorkspaceService,
} from '#filesystem-bridge-protocol.js';
import { nextFileSystemBridgeConnectionId, timeFileSystemBridgeCall } from '#filesystem-bridge-slow-calls.js';
import { bindFileSystemLongCall, withHostContentCalls } from '#filesystem-bridge-host-calls.js';
import type { HostContentCallOptions } from '#filesystem-bridge-host-calls.js';
import type { ComputeEventSource } from '#filesystem-bridge-compute-events.js';
import { recordFileSystemBridgeCrossing } from '#filesystem-bridge-crossings.js';
import { prepareApplyCall, rangeStream, receiptFromWire } from '#filesystem-bridge-client-calls.js';
import type { ReadStreamOptions } from '#filesystem-bridge-client-calls.js';

/** @public */
export const filesystemBridgeConnectMessageType = 'tau:filesystem-bridge:connect';

/** @public */
export const filesystemBridgeReadyMessageType = 'tau:filesystem-bridge:ready';

/** @public */
export const workerReadyMessageType = filesystemBridgeReadyMessageType;

/**
 * Handle returned by {@link createFileSystemBridge}: same-isolate {@link Port} for bridge clients.
 *
 * @public
 */
export type FileSystemBridge = {
  /** Wire-agnostic port for RPC clients in this isolate. */
  port: Port<unknown>;
  dispose(): void;
};

/**
 * Raw transferable filesystem bridge connection for consumers that need to
 * pass the bridge through another worker boundary.
 *
 * @public
 */
export type FileSystemBridgeConnection = {
  port: FileSystemBridgePort;
  dispose(): void;
};

declare const fileSystemBridgePortBrand: unique symbol;

/** Transferable port carrying only the filesystem bridge protocol. @public */
export type FileSystemBridgePort = MessagePort & { readonly [fileSystemBridgePortBrand]: true };

/**
 * Lifecycle and transport members every bridge proxy carries, rooted or not.
 *
 * @public
 */
// oxlint-disable-next-line @typescript-eslint/no-restricted-types -- proxy target types may be class/interface services without string index signatures.
export type FileSystemBridgeProxyTransport = {
  readonly ready: Promise<void>;
  /**
   * Settles when this connection's channel closes — including when the peer's
   * port dies with it. A host that dies after `ready` leaves this proxy's calls
   * with nowhere to go, and this is the only signal that says so (G2c-2).
   */
  readonly closed: Promise<void>;
  readonly hello: { readonly payload: FileSystemBridgeHello };
  dispose(): void;
  listen(event: string, handler: (data: unknown) => void): () => void;
  watch(request: WatchRequest, handler: (event: WatchEvent) => void): () => void;
  watchReady(
    request: WatchRequest,
    handler: (event: WatchEvent) => void,
  ): { unsubscribe: () => void; ready: Promise<void>; closed: Promise<void> };
  /**
   * The change-set form of a watch (charter D6): one {@link ChangeSet} per
   * committed changeset that reaches the request, as one wire frame. Served by a
   * rooted connection over the authority; `ready` rejects with `ENOTSUP` where
   * the connection offers only the per-path form. When the connection is lost
   * (`authority-lost`), every live watch hears one reset with reason
   * `observer-uncertain` at its last generation, so a tree re-reads instead of
   * trusting a stream that may have gaps.
   */
  watchChangeSets(
    request: ChangeSetWatchRequest,
    handler: (set: ChangeSet) => void,
  ): { unsubscribe: () => void; ready: Promise<void>; closed: Promise<void> };
  /**
   * The connection's event channel (charter D14): every change set of the
   * root as this connection's view sees it, `compute-restarted` when the
   * authority's compute worker was replaced, and `authority-lost` once when
   * the connection closes under its subscribers or a call finds the authority
   * unresponsive (`PEER_UNRESPONSIVE`). However many subscribe, the
   * connection holds one channel on the wire. The connection's own writes are
   * not echoed back (each has its receipt). A rooted connection over the
   * authority serves it; elsewhere `ready` rejects with `ENOTSUP`.
   */
  events(handler: (event: FileSystemBridgeEvent) => void): FileSystemBridgeEventSubscription;
};

/**
 * A proxy over an **unrooted** connection: the authority's own surface.
 *
 * Split from the rooted half at W12(d) (gate G-A F9, G-B G5): the workspace
 * connection used to promise `search`, `statTree`, `copyTree`, `duplicate`,
 * `archive`, `contents`, `provenance` and `readdirWithStats`, none of which the
 * authority serves. A caller that annotates its variable with this type can no
 * longer take one by accident.
 *
 * @public
 */
export type FileSystemBridgeWorkspaceProxy = FileSystemBridgeUnrootedCalls & FileSystemBridgeProxyTransport;

/**
 * A proxy over a **rooted** connection: content, the root's index and the
 * mutating porcelain, all in the root's own namespace.
 *
 * @public
 */
export type FileSystemBridgeRootedProxy = FileSystemBridgeService &
  FileSystemBridgeProxyTransport & {
    /**
     * A file as a stream of `readRange` pages, pulled one page per read
     * (charter D14). Pages are read as they are pulled, so the chunks are not
     * a snapshot of one version of the file.
     */
    readStream(path: string, options?: ReadStreamOptions): ReadableStream<Uint8Array<ArrayBuffer>>;
  };

/**
 * Typed filesystem bridge proxy preserving class/interface-shaped service surfaces.
 *
 * The union of both halves, because one factory builds either and the
 * connection's root is not in its type. Annotate the variable with
 * {@link FileSystemBridgeWorkspaceProxy} or {@link FileSystemBridgeRootedProxy}
 * to hold only what that connection serves.
 *
 * @public
 */
export type FileSystemBridgeProxy = FileSystemBridgeRootedProxy;

/**
 * What a host tells the bridge about itself beyond its handlers.
 *
 * @public
 */
export type FileSystemBridgeHostOptions = HostContentCallOptions & {
  /**
   * The authority's compute news: a `computeEventRelay()`'s `source`, fed
   * by the compute worker's supervisor. Every rooted connection's event channel
   * carries its `compute-restarted` frames.
   */
  readonly computeEvents?: ComputeEventSource;
};

/**
 * A subscription to a connection's event channel.
 *
 * @public
 */
export type FileSystemBridgeEventSubscription = {
  /** Settles when the authority has registered the channel. */
  readonly ready: Promise<void>;
  /** Settles when the channel closes. */
  readonly closed: Promise<void>;
  unsubscribe(): void;
};

const isFileSystemBridgeConnection = (
  bridge: FileSystemBridge | FileSystemBridgeConnection,
): bridge is FileSystemBridgeConnection => !('onMessage' in bridge.port);
/** Milliseconds. */
const defaultUiCoalescingWindow = 500;

/**
 * The long calls (charter D14, Rule 32): calls whose work grows with their
 * input — files, bytes, entries — and so have no honest wall-clock deadline.
 * Each runs under the `'liveness'` policy: it lives while the authority sends
 * heartbeats or progress for it and fails `PEER_UNRESPONSIVE` only after a
 * whole liveness window of silence, so a transport deadline never classifies
 * a mutation as failed while the authority is still applying it (I10).
 *
 * The value is the index of the call's options argument that carries the
 * caller's {@link LongCall} controls, or `undefined` for a call whose signature
 * has no slot for them (it still gets the liveness policy). A pending-project
 * commit is one: it waits for a cross-tab lock, removes a half-written target,
 * then writes every file and the manifest, so it used to need its own
 * five-minute deadline.
 */
const longCalls: Readonly<Record<string, number | undefined>> = {
  readMany: 1,
  hashFiles: 1,
  statTree: 1,
  search: 1,
  archive: 1,
  contents: 1,
  copyTree: 2,
  duplicate: 2,
  glob: 1,
  grep: 1,
  indexStats: 1,
  facts: 1,
  changedSince: 1,
  /* Its controls ride `ApplyOptions` and the changeset's own signal;
   * `prepareApplyCall` takes them out. */
  apply: undefined,
  writeFiles: undefined,
  bulkMove: undefined,
  commitPendingProjectDirectory: undefined,
  listProjectManifests: undefined,
  getScopedZippedDirectory: undefined,
};

/**
 * Take a long call's {@link LongCall} controls out of its options argument:
 * an `AbortSignal` and a function cannot cross the wire, and the bridge
 * carries both itself. Arguments of every other call pass through unchanged.
 */
const splitLongCall = (method: string, args: readonly unknown[]): { args: unknown[]; longCall?: LongCall } => {
  const slot = longCalls[method];
  const bag = slot === undefined ? undefined : args[slot];
  if (slot === undefined || bag === null || typeof bag !== 'object') {
    return { args: [...args] };
  }
  /* Stripped even when absent: a call's options may be nothing but its
   * controls, and an empty bag is not a wire argument the schema admits. */
  const { signal, onProgress, ...rest } = bag as LongCall & Record<string, unknown>;
  const wireArgs = [...args];
  wireArgs[slot] = Reflect.ownKeys(rest).length === 0 ? undefined : rest;
  while (wireArgs.length > 0 && wireArgs.at(-1) === undefined) {
    wireArgs.pop();
  }
  return {
    args: wireArgs,
    longCall: { ...(signal === undefined ? {} : { signal }), ...(onProgress === undefined ? {} : { onProgress }) },
  };
};

/**
 * One call's client deadline: none for checked writes, liveness for long calls,
 * the ordinary deadline for the rest (Rule 32).
 */
const fileSystemCallTimeout = (method: string): BridgeCallTimeout | undefined =>
  /* Checked writes are compare-and-swap: a late original and a replacement
   * can never both apply, so they wait for the authority's terminal answer
   * rather than report a timeout while it may still write (Rule 32).
   * Connection loss still settles them as potentially applied. */
  method === 'writeFileChecked' || method === 'deleteFileChecked'
    ? 'none'
    : Object.hasOwn(longCalls, method)
      ? 'liveness'
      : undefined;

/** `readMany`'s wire rows as the map its callers hold. */
const readManyResult = (rows: ReadManyWireRows): ReadManyResult => new Map(rows);

/** One authority path in a scoped port's own namespace, or `undefined` when it is outside that root. */
const relativeToRoot = (root: string, path: string): string | undefined => {
  if (root === '/') {
    return path === '/' ? '' : path.startsWith('/') ? path.slice(1) : undefined;
  }
  if (path === root) {
    return '';
  }
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : undefined;
};

/**
 * One authority path as a scoped port's own view spells it, or `undefined` when
 * that view does not serve it.
 *
 * A path the view hides is as absent from it as one outside the root, which is
 * what makes the degradations below the view's own answer rather than a second
 * policy: hidden is inherited, so a hidden ancestor hides its descendants (PP2).
 */
const visibleRelativeToRoot = (
  root: string,
  path: string,
  hidden?: (relativePath: string) => boolean,
): string | undefined => {
  const relative = relativeToRoot(root, path);
  return relative === undefined || hidden?.(relative) === true ? undefined : relative;
};

/**
 * One change event as a scoped port sees it, or `undefined` when nothing in it
 * touches that port's root.
 *
 * A move with one end outside the root — or hidden from it — is not a move to
 * that port: it is a disappearance or an arrival, exactly as a rooted view's own
 * watch reports it (`WorkspaceFileService.createRootedFileSystem`).
 */
const scopeEventToRoot = (
  event: PathChangeEvent,
  root: string,
  hidden?: (relativePath: string) => boolean,
): PathChangeEvent | undefined => {
  if (event.type === 'backendChanged') {
    return event;
  }
  if ('path' in event) {
    const path = visibleRelativeToRoot(root, event.path, hidden);
    return path === undefined ? undefined : { ...event, path };
  }
  const directory = event.type === 'directoryRenamed' || event.type === 'directoryCopied';
  const [fromPath, toPath] =
    'oldPath' in event ? ([event.oldPath, event.newPath] as const) : ([event.sourcePath, event.targetPath] as const);
  const from = visibleRelativeToRoot(root, fromPath, hidden);
  const to = visibleRelativeToRoot(root, toPath, hidden);
  if (from !== undefined && to !== undefined) {
    return 'oldPath' in event
      ? { ...event, oldPath: from, newPath: to }
      : { ...event, sourcePath: from, targetPath: to };
  }
  if (to !== undefined) {
    return directory
      ? {
          type: 'directoryCreated',
          path: to,
          backend: event.backend,
          ...(event.target ? { target: event.target } : {}),
        }
      : { type: 'fileWritten', path: to, backend: event.backend, ...(event.target ? { target: event.target } : {}) };
  }
  if (from !== undefined && 'oldPath' in event) {
    return directory
      ? { type: 'directoryDeleted', path: from, backend: event.backend }
      : { type: 'fileDeleted', path: from, backend: event.backend };
  }
  /* A copy whose target left the root changed nothing inside it. */
  return undefined;
};

const asFileSystemBridgePort = (port: MessagePort): FileSystemBridgePort => port as FileSystemBridgePort;

const wrapFileSystemBridgePort = (port: MessagePortLike, label: string): Port<unknown> => {
  const wrapped = wrapMessagePort<unknown>(port, { label });
  if (wrapped.start !== undefined) {
    wrapped.start();
  }
  return wrapped;
};

/**
 * Marks a write payload whose bytes the caller hands over.
 *
 * A write is copied before it crosses the port, because the caller keeps its own
 * buffers and a transfer would detach them. An import or a pending commit does
 * not keep them: mark its argument and the bridge transfers the caller's own
 * bytes instead of copying every one of them. Nothing else changes — the mark is
 * a symbol, so it reaches neither the wire nor the service.
 *
 * Set it only where the caller never reads those bytes again.
 *
 * @public
 *
 * @example <caption>Handing an imported tree to the worker</caption>
 * ```typescript
 * import { consumableBytes } from '@taucad/fs-bridge';
 * import type { FileSystemBridgeRootedProxy } from '@taucad/fs-bridge';
 *
 * export async function exampleImport(
 *   client: FileSystemBridgeRootedProxy,
 *   imported: Record<string, { content: Uint8Array<ArrayBuffer> }>,
 * ): Promise<void> {
 *   await client.writeFiles(Object.assign(imported, { [consumableBytes]: true }));
 * }
 * ```
 */
export const consumableBytes: unique symbol = Symbol('tau.fs-bridge.consumableBytes');

/** Whether any argument carries the {@link consumableBytes} mark. */
const handsOverBytes = (args: readonly unknown[]): boolean =>
  args.some(
    (argument) =>
      argument !== null &&
      typeof argument === 'object' &&
      (argument as Record<symbol, unknown>)[consumableBytes] === true,
  );

const cloneWritePayloadForTransfer = (value: unknown): unknown => {
  if (value instanceof Uint8Array) {
    return new Uint8Array(value);
  }
  if (value instanceof ArrayBuffer) {
    const copy = new Uint8Array(value.byteLength);
    copy.set(new Uint8Array(value));
    return copy.buffer;
  }
  return value;
};

const cloneFileMapForTransfer = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([path, descriptor]) => {
      if (descriptor === null || typeof descriptor !== 'object' || !('content' in descriptor)) {
        return [path, descriptor];
      }
      const entry = descriptor as Record<string, unknown>;
      return [path, { ...entry, content: cloneWritePayloadForTransfer(entry['content']) }];
    }),
  );
};

/** The bytes one write call carries, by path, for the I2 crossings ledger. Strings are not counted. */
const writePayloads = (method: string, args: readonly unknown[]): Array<[string, number]> => {
  const sized = (path: unknown, payload: unknown): Array<[string, number]> =>
    typeof path === 'string' && (payload instanceof Uint8Array || payload instanceof ArrayBuffer)
      ? [[path, payload.byteLength]]
      : [];
  const first = args[0];
  if (method === 'writeFile' || method === 'appendFile' || method === 'appendFileFenced') {
    return sized(first, args[1]);
  }
  if (method === 'writeFileChecked' && first !== null && typeof first === 'object') {
    const input = first as { path?: unknown; data?: unknown };
    return sized(input.path, input.data);
  }
  const files =
    method === 'writeFiles'
      ? first
      : method === 'commitPendingProjectDirectory' && first !== null && typeof first === 'object'
        ? (first as { files?: unknown }).files
        : undefined;
  if (files === null || typeof files !== 'object') {
    return [];
  }
  return Object.entries(files).flatMap(([path, descriptor]) =>
    descriptor !== null && typeof descriptor === 'object' && 'content' in descriptor
      ? sized(path, (descriptor as { content: unknown }).content)
      : [],
  );
};

/** Record each path a write carries as one I2 crossing: a transfer when handed over, else a copy. */
const recordWriteCrossings = (method: string, args: readonly unknown[], handedOver: boolean): void => {
  const kind = handedOver ? 'transfer' : 'copy';
  for (const [path, bytes] of writePayloads(method, args)) {
    recordFileSystemBridgeCrossing(path, kind, bytes);
  }
};

const cloneWriteArgsForTransfer = (method: string, args: unknown[]): unknown[] => {
  const handedOver = handsOverBytes(args);
  recordWriteCrossings(method, args, handedOver);
  if (handedOver) {
    /* The caller's own buffers ride the transfer list `wrapAsTransferables`
     * builds from these arguments, and are detached by the postMessage. */
    return args;
  }
  if (
    (method === 'writeFileChecked' || method === 'deleteFileChecked') &&
    args[0] !== null &&
    typeof args[0] === 'object'
  ) {
    const input = args[0] as CheckedFileWrite;
    return [
      {
        path: input.path,
        ...(method === 'writeFileChecked' ? { data: cloneWritePayloadForTransfer(input.data) } : {}),
        preconditions: input.preconditions.map((precondition) => ({
          path: precondition.path,
          expected: precondition.expected === null ? null : cloneWritePayloadForTransfer(precondition.expected),
        })),
      },
    ];
  }
  if ((method === 'writeFile' || method === 'appendFile' || method === 'appendFileFenced') && args.length >= 2) {
    return [args[0], cloneWritePayloadForTransfer(args[1]), ...args.slice(2)];
  }

  if (
    method === 'commitPendingProjectDirectory' &&
    args.length > 0 &&
    args[0] !== null &&
    typeof args[0] === 'object'
  ) {
    const input = args[0] as Record<string, unknown>;
    return [
      {
        ...input,
        files: cloneFileMapForTransfer(input['files']),
        manifest: cloneWritePayloadForTransfer(input['manifest']),
      },
      ...args.slice(1),
    ];
  }

  if (method !== 'writeFiles' || args.length === 0 || args[0] === null || typeof args[0] !== 'object') {
    return args;
  }

  return [cloneFileMapForTransfer(args[0]), ...args.slice(1)];
};

/**
 * Worker-side filesystem methods that receive a
 * {@link WorkspaceMutationContext} for change-bus echo suppression.
 *
 * Hand-written union; see {@link MutationOverrideMap} below for the
 * companion shape that pairs each name with the live service signature.
 * The compile-time test in `filesystem-bridge.test-d.ts` asserts these
 * two stay in lockstep.
 */
type MutationMethodName =
  | 'writeFile'
  | 'writeFileChecked'
  | 'deleteFileChecked'
  | 'appendFile'
  | 'writeFiles'
  | 'mkdir'
  | 'move'
  | 'bulkMove'
  | 'unlink'
  | 'rmdir'
  | 'commitPendingProjectDirectory';

/**
 * Mutating-method projection of {@link WorkspaceFileService}. Derived via
 * `Pick` so any signature drift on the live service surfaces as a TS
 * error on the override-map row below — no hand-written mirror type to
 * fall out of sync.
 */
type MutatingMethods = Pick<WorkspaceFileService, MutationMethodName>;

/**
 * Override-map type: each row must match the live service signature
 * exactly. {@link bindMutationContextForPort} consumes this shape via
 * `Partial<MutationOverrideMap>` so partial handlers (which don't
 * implement every mutating method) remain valid call-sites of
 * {@link exposeFileSystem}.
 */
type MutationOverrideMap = {
  [K in MutationMethodName]: MutatingMethods[K];
};

type WriteFileParameters = Parameters<MutatingMethods['writeFile']>;
type WriteFileCheckedParameters = Parameters<MutatingMethods['writeFileChecked']>;
type DeleteFileCheckedParameters = Parameters<MutatingMethods['deleteFileChecked']>;
type AppendFileParameters = Parameters<MutatingMethods['appendFile']>;
type WriteFilesParameters = Parameters<MutatingMethods['writeFiles']>;
type CommitPendingProjectDirectoryParameters = Parameters<MutatingMethods['commitPendingProjectDirectory']>;
type BulkMoveEdit = Readonly<{ source: string; target: string }>;
type BulkMoveResult = {
  moved: ReadonlyArray<{ edit: { source: string; target: string }; stat: FileStat }>;
  failed: ReadonlyArray<{ edit: { source: string; target: string }; error: WorkspaceMutationError }>;
};
type PreflightMethodName = 'canMove' | 'canRename' | 'canCreate' | 'canDelete';
type PreflightMethods = Pick<WorkspaceFileService, PreflightMethodName>;
type SerializedWorkspaceMutationError = Readonly<{
  __workspaceMutationError__: true;
  name: 'WorkspaceMutationError';
  code: WorkspaceMutationErrorCode;
  path: string;
  target?: string;
  message: string;
}>;
type PreflightOverrideMap = {
  [K in PreflightMethodName]: PreflightMethods[K];
};
const workspaceMutationErrorMarker = '__workspaceMutationError__';
type CheckedWriteApplicationState = 'known-not-applied' | 'potentially-applied';

const checkedWriteApplicationState = (value: unknown): CheckedWriteApplicationState | undefined => {
  const state = (value as { applicationState?: unknown } | undefined)?.applicationState;
  return state === 'known-not-applied' || state === 'potentially-applied' ? state : undefined;
};

const preserveCheckedWriteApplicationState = (error: unknown): Error => {
  const applicationState = checkedWriteApplicationState(error);
  const result = error instanceof Error ? error : new Error(String(error));
  if (applicationState === undefined) {
    return result;
  }
  const candidateMetadata = (result as { metadata?: unknown }).metadata;
  const metadata =
    candidateMetadata !== null && typeof candidateMetadata === 'object' && !Array.isArray(candidateMetadata)
      ? candidateMetadata
      : {};
  return Object.assign(result, { metadata: { ...metadata, applicationState } });
};

const restoreCheckedWriteApplicationState = (error: unknown): void => {
  const metadata = (error as { metadata?: unknown } | undefined)?.metadata;
  if (metadata !== null && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const applicationState = checkedWriteApplicationState(metadata);
    if (applicationState !== undefined) {
      Object.assign(error as Record<string, unknown>, { applicationState });
    }
  }
};

const withCheckedWriteApplicationState = (error: unknown, applicationState: CheckedWriteApplicationState): Error => {
  const result = error instanceof Error ? error : new Error(String(error));
  const candidateMetadata = (result as { metadata?: unknown }).metadata;
  const metadata =
    candidateMetadata !== null && typeof candidateMetadata === 'object' && !Array.isArray(candidateMetadata)
      ? candidateMetadata
      : {};
  return Object.assign(result, {
    applicationState,
    metadata: { ...metadata, applicationState },
  });
};

const checkedWritePreDeliveryError = (
  method: 'writeFileChecked' | 'deleteFileChecked',
  args: unknown[],
): Error | undefined => {
  const validation = fileSystemBridgeSchemas.calls[method].args.safeParse(args);
  if (validation.success) {
    return undefined;
  }
  return withCheckedWriteApplicationState(
    new TypeError(`Invalid ${method} arguments: ${validation.error.message}`),
    'known-not-applied',
  );
};

/**
 * The bridge calls that mutate the root without a precondition: a failure the
 * caller cannot place before or after the authority began says so, as a
 * checked write's does.
 */
const mutatingCalls: ReadonlySet<string> = new Set([
  'apply',
  'writeFiles',
  'bulkMove',
  'commitPendingProjectDirectory',
  'copyTree',
  'duplicate',
]);

/** Codes that end a call the authority may already be applying. */
const lostCallCodes: ReadonlySet<unknown> = new Set(['PEER_UNRESPONSIVE', 'PEER_GONE']);

/**
 * A mutating call's failure with what is known about its effect (I10).
 *
 * The caller's abort after the call was sent, and a connection that stopped
 * answering or died under it, all leave the authority possibly mid-way: some
 * phases or files may have landed. They are `potentially-applied`, like a
 * checked write's, so the caller re-reads before it retries. An abort before
 * the call was sent is `known-not-applied`. Every other failure is the
 * authority's own answer and passes through.
 *
 * @param error - The rejection.
 * @param sent - Whether the call reached the wire.
 * @returns The error, carrying `applicationState` where the effect is unknown.
 */
const classifyMutationFailure = (error: unknown, sent: boolean): unknown => {
  if (checkedWriteApplicationState(error) !== undefined) {
    return error;
  }
  const { name, code } = (error ?? {}) as { name?: unknown; code?: unknown };
  if (name === 'AbortError') {
    return withCheckedWriteApplicationState(error, sent ? 'potentially-applied' : 'known-not-applied');
  }
  return lostCallCodes.has(code) ? withCheckedWriteApplicationState(error, 'potentially-applied') : error;
};

const classifyCheckedWriteFailure = (error: unknown): Error => {
  restoreCheckedWriteApplicationState(error);
  if (checkedWriteApplicationState(error) !== undefined) {
    return error as Error;
  }
  return withCheckedWriteApplicationState(error, 'potentially-applied');
};

const serializeWorkspaceMutationError = (error: WorkspaceMutationError): WorkspaceMutationError => {
  const serialized: SerializedWorkspaceMutationError = {
    [workspaceMutationErrorMarker]: true,
    name: 'WorkspaceMutationError',
    code: error.code,
    path: error.path,
    message: error.message,
    ...(error.target === undefined ? {} : { target: error.target }),
  };
  return serialized as WorkspaceMutationError;
};

const serializeMutationResult = (result: true | WorkspaceMutationError): true | WorkspaceMutationError =>
  isWorkspaceMutationError(result) ? serializeWorkspaceMutationError(result) : result;

/**
 * Wire-shape the porcelain results a rooted connection now answers with.
 *
 * {@link bindMutationContextForPort} does this for the workspace port, but a
 * rooted port must not have a mutation context appended to its calls: the
 * origin is baked into the view when it is captured. Only the serialization is
 * shared, so only the serialization is applied here.
 *
 * @param handlers - The rooted handler object the host composed.
 * @returns The same handlers, with any preflight or bulk-move result serialized.
 */
const serializeRootedResults = (handlers: StringKeyedObject): StringKeyedObject => {
  const served = handlers as Record<string, unknown>;
  const overrides: Record<string, unknown> = {};
  for (const name of ['canMove', 'canRename', 'canCreate', 'canDelete']) {
    const preflight = served[name];
    if (typeof preflight === 'function') {
      overrides[name] = async (...args: readonly unknown[]): Promise<true | WorkspaceMutationError> =>
        serializeMutationResult(
          await (preflight as (...callArgs: readonly unknown[]) => Promise<true | WorkspaceMutationError>)(...args),
        );
    }
  }
  if (typeof served['bulkMove'] === 'function') {
    const bulkMove = served['bulkMove'] as (...callArgs: readonly unknown[]) => Promise<BulkMoveResult>;
    overrides['bulkMove'] = async (...args: readonly unknown[]): Promise<BulkMoveResult> =>
      serializeBulkMoveResult(await bulkMove(...args));
  }
  return Object.keys(overrides).length === 0 ? handlers : { ...handlers, ...overrides };
};

/**
 * Serve a watch request's change-set form (charter D6) beside its per-path form.
 *
 * A request with `form: 'change-sets'` subscribes the handler set's own
 * `watchChangeSets`, and each committed changeset that reaches it crosses the
 * wire as one frame. A handler set without one refuses the form with `ENOTSUP`
 * rather than inventing kinds the per-path stream does not carry, so the
 * client knows to keep the per-path form. Any other request is the handler
 * set's own `watch`.
 *
 * A request with `form: 'events'` is the connection's event channel (charter
 * D14): every change set of the whole root, as its view sees it, plus the
 * authority's compute news from `options.computeEvents`, on one stream.
 *
 * @param handlers - The handlers one connection is served.
 * @param options - Where the authority's compute events come from, if it has any.
 * @returns The same handlers, answering the change-set form when they can.
 */
const withChangeSetWatch = <Handlers extends StringKeyedObject>(
  handlers: Handlers,
  options?: Pick<FileSystemBridgeHostOptions, 'computeEvents'>,
): Handlers => {
  const { watch, watchChangeSets } = handlers as Partial<Record<string, unknown>>;
  if (typeof watch !== 'function' && typeof watchChangeSets !== 'function') {
    return handlers;
  }
  const perPath = watch as
    | ((request: WatchRequest, handler: (event: WatchEvent) => void) => (() => void) | Promise<() => void>)
    | undefined;
  const changeSets = watchChangeSets as
    | ((request: ChangeSetWatchRequest, handler: (set: ChangeSet) => void) => () => void)
    | undefined;
  const served = (
    request: FileSystemBridgeWatchRequest,
    handler: (frame: FileSystemBridgeWatchFrame) => void,
  ): (() => void) | Promise<() => void> => {
    const { form, coalesce, ...rest } = request;
    if (form === 'events') {
      if (changeSets === undefined) {
        throw Object.assign(new Error('This connection serves no event channel.'), { code: 'ENOTSUP' });
      }
      const unsubscribeSets = changeSets.call(
        handlers,
        { paths: [''], recursive: true, ...(coalesce === undefined ? {} : { coalesce }) },
        (set) => {
          handler({ kind: 'changeSet', set });
        },
      );
      const unsubscribeCompute = options?.computeEvents?.subscribe((event) => {
        handler(event);
      });
      return () => {
        unsubscribeSets();
        unsubscribeCompute?.();
      };
    }
    if (form === 'change-sets') {
      if (changeSets === undefined) {
        throw Object.assign(new Error('This connection serves no change-set watch.'), { code: 'ENOTSUP' });
      }
      return changeSets.call(handlers, { ...rest, ...(coalesce === undefined ? {} : { coalesce }) }, handler);
    }
    if (perPath === undefined) {
      throw new Error('Bridge handlers do not implement watch()');
    }
    return perPath.call(handlers, rest, handler);
  };
  return new Proxy(handlers, {
    get(target, property) {
      if (property === 'watch') {
        return served;
      }
      /* Bound to the real handler set, so a class's private state survives the proxy. */
      const value: unknown = Reflect.get(target, property, target);
      const descriptor = Reflect.getOwnPropertyDescriptor(target, property);
      /* A frozen member must be returned as itself (proxy invariant). */
      return typeof value === 'function' && !(descriptor?.configurable === false && descriptor.writable === false)
        ? (value as (...callArgs: unknown[]) => unknown).bind(target)
        : value;
    },
  });
};

/** Whether a handler set answers `hashFiles`, which its hello then advertises. */
const answersHashFiles = (handlers: StringKeyedObject): boolean =>
  typeof (handlers as { hashFiles?: unknown }).hashFiles === 'function';

const serializeBulkMoveResult = (result: BulkMoveResult): BulkMoveResult => ({
  moved: result.moved,
  failed: result.failed.map(({ edit, error }) => ({
    edit,
    error: serializeWorkspaceMutationError(error),
  })),
});

/**
 * Wrap `service` with a per-port mutation-context closure. Each mutating
 * method on the resulting proxy injects `context` as the trailing
 * argument on the way through to the underlying service; every other
 * property — methods and data — passes through unchanged with
 * prototype-resident functions bound to the real target so `this`
 * never escapes to the proxy.
 *
 * Why per-port instead of per-call: `originClientId` is a property of
 * the bridge connection, not of any individual RPC call. Binding it
 * once at port-connect time eliminates the entire class of "where does
 * the context argument live" questions that a per-call positional
 * injection mechanism would force on every handler signature.
 *
 * Generic over `T extends StringKeyedObject` (not the mutating subset)
 * so partial handler shapes — e.g. `{ readFile: vi.fn() }` from tests
 * or `@taucad/runtime`'s `RuntimeFileSystemBase`
 * from kernel bridges — remain compatible. The proxy only intercepts a
 * mutating method name when that method actually exists on `target`.
 *
 * @param service - The underlying handler object. Mutating methods are
 *                  intercepted; other properties pass through.
 * @param context - The mutation context to inject on every mutating
 *                  call. Typically `{ originClientId: portId }` for the
 *                  filesystem bridge.
 * @returns A proxy with the same structural type as `service`.
 * @public
 */
export function bindMutationContextForPort<T extends StringKeyedObject>(
  service: T,
  context: WorkspaceMutationContext,
): T {
  // Annotated as the *full* `MutationOverrideMap` (not `Partial`) so
  // missing-method drift fails the build at this row. Each value's
  // type is `WorkspaceFileService[Method]` — any signature change on
  // the live service surfaces here. The `as MutatingMethods` cast is
  // safe at runtime because the proxy `get` trap below only returns
  // an override when the method actually exists on `target`.
  const mutatingService = service as unknown as MutatingMethods;
  const preflightService = service as unknown as PreflightMethods;
  const overrides: MutationOverrideMap = {
    writeFile: async (path: WriteFileParameters[0], data: WriteFileParameters[1]): Promise<void> =>
      mutatingService.writeFile(path, data, context),
    writeFileChecked: async (input: WriteFileCheckedParameters[0]): Promise<CheckedFileWriteResult> => {
      try {
        return await mutatingService.writeFileChecked(input, context);
      } catch (error) {
        throw preserveCheckedWriteApplicationState(error);
      }
    },
    deleteFileChecked: async (input: DeleteFileCheckedParameters[0]): Promise<CheckedFileWriteResult> => {
      try {
        return await mutatingService.deleteFileChecked(input, context);
      } catch (error) {
        throw preserveCheckedWriteApplicationState(error);
      }
    },
    appendFile: async (path: AppendFileParameters[0], data: AppendFileParameters[1]): Promise<void> =>
      mutatingService.appendFile(path, data, context),
    writeFiles: async (files: WriteFilesParameters[0]): Promise<void> => mutatingService.writeFiles(files, context),
    mkdir: async (path: string, options?: MkdirOptions): Promise<void> => mutatingService.mkdir(path, options, context),
    move: async (source: string, target: string): Promise<FileStat> => mutatingService.move(source, target, context),
    bulkMove: async (edits: readonly BulkMoveEdit[]): Promise<BulkMoveResult> =>
      serializeBulkMoveResult(await mutatingService.bulkMove(edits, context)),
    unlink: async (path: string): Promise<void> => mutatingService.unlink(path, context),
    rmdir: async (path: string, options?: { recursive?: boolean }): Promise<void> =>
      mutatingService.rmdir(path, options, context),
    commitPendingProjectDirectory: async (input: CommitPendingProjectDirectoryParameters[0]) =>
      mutatingService.commitPendingProjectDirectory(input, context),
  };
  const preflightOverrides: PreflightOverrideMap = {
    canMove: async (source: string, target: string): Promise<true | WorkspaceMutationError> =>
      serializeMutationResult(await preflightService.canMove(source, target)),
    canRename: async (source: string, newName: string): Promise<true | WorkspaceMutationError> =>
      serializeMutationResult(await preflightService.canRename(source, newName)),
    canCreate: async (path: string, kind: 'file' | 'directory'): Promise<true | WorkspaceMutationError> =>
      serializeMutationResult(await preflightService.canCreate(path, kind)),
    canDelete: async (path: string): Promise<true | WorkspaceMutationError> =>
      serializeMutationResult(await preflightService.canDelete(path)),
  };

  return new Proxy(service, {
    get(target, property, _receiver) {
      if (typeof property === 'string' && property in preflightOverrides && property in target) {
        return (preflightOverrides as Record<string, unknown>)[property];
      }
      if (typeof property === 'string' && property in overrides && property in target) {
        return (overrides as Record<string, unknown>)[property];
      }
      const value = Reflect.get(target, property, target);
      // Bind functions to the real target, never the proxy. Critical
      // if the service ever moves to JS `#private` fields (which throw
      // on access via a proxy receiver) and necessary today because
      // `createBridgeServer` invokes the resolved function with
      // `this = handlers` — i.e. `this = proxy` without this `bind`.
      if (typeof value === 'function') {
        return (value as (...callArgs: unknown[]) => unknown).bind(target);
      }
      return value;
    },
  });
}

/**
 * Re-exported solely so the type test in `filesystem-bridge.test-d.ts`
 * can pin the override-map shape against {@link WorkspaceFileService}.
 *
 * @internal
 * @public
 */
export type MutationOverrideMapInternal = MutationOverrideMap;

/**
 * Re-exported solely so the type test in `filesystem-bridge.test-d.ts`
 * can assert exhaustive coverage of mutating methods.
 *
 * @internal
 * @public
 */
export type MutationMethodNameInternal = MutationMethodName;

/**
 * Minimal interface for an event coalescer that batches ChangeEvents
 * before delivering them. The bridge needs only enqueue and disposal;
 * reset ordering remains internal to the filesystem watch registry.
 * @public
 */
export type ChangeEventCoalescer = {
  push(event: PathChangeEvent): void;
  dispose(): void;
};

/**
 * Factory that creates a {@link ChangeEventCoalescer}.
 *
 * Called by {@link exposeFileSystem} with the delivery callback (broadcasts
 * to all connected bridge ports) and the configured coalescing window.
 * @public
 */
export type CoalescerFactory = (
  deliver: (events: PathChangeEvent[]) => void,
  /** Coalescing window. Milliseconds. */
  coalescingWindow: number,
  /** Report discarded events so the bridge can replace them with loss signals. */
  onOverflow: (events: readonly PathChangeEvent[]) => void,
) => ChangeEventCoalescer;

/**
 * Which surface a rooted bridge connection asks for, named on every rooted
 * connect envelope (invariant CI2).
 *
 * `'user'` and `'agent'` are masked by `composeView`; `'working-copy'` is the
 * checkout's raw rooted filesystem, which the host's own capture, apply and
 * language planes read because they must not see the overlays composed above
 * it (architecture V6). An absent or unknown value is refused — no code path
 * treats absence as a value.
 *
 * `'agent'` means the agent's tools **and any executor of the code the agent
 * writes**: a kernel runtime, the GeoSpec runner and Quick Look's runtime client
 * all name it, so agent-authored project code can neither read the control plane
 * nor rewrite the records Tau keeps itself (invariant CI1, W14).
 * @public
 */
export type RootedBridgeConsumer = ComposedViewConsumer | 'working-copy';

/**
 * Options for configuring the filesystem bridge message type.
 * @public
 */
export type FileSystemBridgeOptions = {
  messageType?: string;
  /** Coalescing window for UI-bound fileChanged events (default: 500). Milliseconds. */
  uiCoalescingWindow?: number;
  /**
   * Factory for creating a change event coalescer. When provided, events
   * from `changeEventBus` are batched before broadcasting to bridge clients.
   * When omitted, events pass through without batching.
   */
  createCoalescer?: CoalescerFactory;
} & (
  | {
      /** The workspace surface: no root, and therefore no view to name. */
      root?: undefined;
      consumer?: undefined;
    }
  | {
      /**
       * Project mount to expose as `/` for this connection. The root is consumed
       * by the filesystem server when the connection is accepted; it is never
       * forwarded to runtime calls.
       */
      root: string;
      /** Which surface this rooted connection reads; required beside a root (CI2). */
      consumer: RootedBridgeConsumer;
    }
);

/**
 * Minimal event bus interface for broadcasting file change events
 * to all connected bridge clients via `server.emit('fileChanged', event)`.
 * @public
 */
export type BridgeChangeEventBus = {
  subscribe(handler: (event: unknown) => void): () => void;
};

/**
 * Handle returned by {@link exposeFileSystem} for managing bridge connections and cleanup.
 * @public
 */
export type ExposeFileSystemHandle = {
  cleanup: () => void;
  activePorts: Set<MessagePort>;
  serverHandles: Map<MessagePort, BridgeServerHandle>;
};

/**
 * Creates the filesystem handler captured by one rooted bridge connection.
 * @public
 */
// oxlint-disable-next-line max-params -- the connection's four facts, each already named on the wire.
export type RootedFileSystemHandlerFactory = (
  root: string,
  context: WorkspaceMutationContext,
  /** The surface the connection named; an unrecognised one never reaches here. */
  consumer: RootedBridgeConsumer,
  /**
   * The server's own policy rebased on this root — the same object the change
   * stream is masked with, so a host cannot mask its view with one layout and
   * its stream with another (G0b-6).
   */
  policy: PathPolicy,
) => FileSystemBridgeRuntimeService | undefined;

type FileSystemBridgeConnectEnvelope = {
  readonly v: typeof fileSystemBridgeProtocolVersion;
  readonly type: string;
  readonly port: MessagePort;
  readonly root?: unknown;
};

const fileSystemBridgeConnectEnvelopeSchema = (messageType: string): z.ZodType<FileSystemBridgeConnectEnvelope> =>
  z.looseObject({
    v: z.literal(fileSystemBridgeProtocolVersion),
    type: z.literal(messageType),
    port: z.instanceof(MessagePort),
    root: z.unknown().optional(),
  });

/**
 * The rooted half of a connect envelope: a root always names the surface it
 * serves. Parsed separately from the envelope above so an envelope that names
 * no recognised consumer is answered with a typed `ROOT_UNAVAILABLE` (CI2)
 * instead of failing validation and dropping the port without a word.
 */
const rootedConnectSchema: z.ZodType<{ readonly root: string; readonly consumer: RootedBridgeConsumer }> =
  z.looseObject({
    root: z.string(),
    consumer: z.enum(['user', 'agent', 'working-copy']),
  });

const fileSystemBridgePeerEnvelopeSchema = (messageType: string) =>
  z.looseObject({ v: z.unknown(), type: z.literal(messageType), port: z.instanceof(MessagePort) });

const createUnavailableHandlers = (error: unknown): StringKeyedObject =>
  new Proxy(
    {},
    {
      get(_target, property) {
        if (typeof property === 'symbol') {
          return undefined;
        }
        return (): never => {
          throw error;
        };
      },
    },
  );

/**
 * Expose a filesystem to incoming bridge connections.
 *
 * Listens on the worker's global scope for messages with the specified type
 * and a transferred MessagePort. For each received port, buffers any incoming
 * messages via `catchMessages`, sets up a `createBridgeServer`, then replays
 * the buffered messages.
 *
 * Returns a handle with:
 * - `cleanup`: removes the listener
 * - `activePorts`: set of currently connected ports
 * - `serverHandles`: map from port to BridgeServerHandle (with emit())
 *
 * @param handlers - Filesystem handler methods to expose
 * @param options - Optional message type, rooted-handler factory, and change bus
 * @returns Handle with cleanup, activePorts, and serverHandles
 * @public
 */
type InternalExposeFileSystemOptions = FileSystemBridgeOptions &
  FileSystemBridgeHostOptions & {
    // oxlint-disable-next-line max-params -- mirrors RootedFileSystemHandlerFactory.
    handlerForRoot?: (
      root: string,
      context: WorkspaceMutationContext,
      consumer: RootedBridgeConsumer,
      policy: PathPolicy,
    ) => StringKeyedObject | undefined;
    policy: PathPolicy;
    changeEventBus?: BridgeChangeEventBus;
    /* Inline `Pick`, no named alias.
     * ponytail: one more port-like type declaration is exactly the failure mode
     * this batch guards against — six already exist in the tree. */
    messageSource?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
  };

function exposeFileSystemHandlers(
  handlers: StringKeyedObject,
  options?: InternalExposeFileSystemOptions,
): ExposeFileSystemHandle {
  const messageType = options?.messageType ?? filesystemBridgeConnectMessageType;
  const connectEnvelopeSchema = fileSystemBridgeConnectEnvelopeSchema(messageType);
  const peerEnvelopeSchema = fileSystemBridgePeerEnvelopeSchema(messageType);
  const activePorts = new Set<MessagePort>();
  const serverHandles = new Map<MessagePort, BridgeServerHandle>();
  const portIds = new Map<MessagePort, string>();
  /** Every served scoped port, with the authority root and the surface it asked for. */
  const scopedPorts = new Map<MessagePort, { readonly root: string; readonly consumer: RootedBridgeConsumer }>();

  /* `policy` is required beside `handlerForRoot`; a host that passes no options
   * at all serves no rooted connection, so nothing below ever asks for it. */
  const policy = options?.policy;
  /** The server's layout rebased on one root, once per root: the handler a
   * connection is served composes its view with the same object this masks the
   * stream with (G0b-6). */
  const policyByRoot = new Map<string, PathPolicy>();
  const policyForRoot = (root: string): PathPolicy => {
    const rootPolicy = policyByRoot.get(root) ?? policyAtRoot(policy!, root);
    policyByRoot.set(root, rootPolicy);
    return rootPolicy;
  };
  /**
   * Whether a root-relative path is hidden, answered once per spelling per
   * dispatch rather than once per handle: delivery is a hot path (event-fanout
   * policy) and ports on one root all ask the same question.
   */
  const hiddenByPath = new Map<string, boolean>();
  const hidden = (root: string, relativePath: string): boolean => {
    const key = `${root}\0${relativePath}`;
    const memoized = hiddenByPath.get(key);
    if (memoized !== undefined) {
      return memoized;
    }
    const answer = policyForRoot(root).classify(relativePath).agentAccess === 'hidden';
    hiddenByPath.set(key, answer);
    return answer;
  };

  /*
   * Events ride the view (architecture L4, A11). A scoped port is one consumer
   * of one checkout, so it receives exactly the events whose authority path
   * lies inside its root *and* inside the surface it asked for, spelled in its
   * own root-relative namespace — and never its own writes, which it already
   * knows about.
   */
  /**
   * One scoped event per root and mask kind, for the length of one event's
   * dispatch: a scoped port's spelling is a function of the event, its root and
   * whether the mask applies, so K ports on one root derive it once between them
   * instead of K times (event-fanout policy).
   */
  const scopedByRoot = new Map<string, PathChangeEvent | undefined>();
  /*
   * One message per port per delivery (charter D6): every fact a port may see
   * from one changeset (or one coalescing window) travels together, as the
   * fact itself when there is one and as a `changeSet` envelope otherwise, so
   * a peer does one unit of work per changeset instead of one per path.
   */
  const deliverToHandles = (events: PathChangeEvent[]): void => {
    const perPort = new Map<MessagePort, PathChangeEvent[]>();
    const factsFor = (port: MessagePort): PathChangeEvent[] => {
      let facts = perPort.get(port);
      if (facts === undefined) {
        facts = [];
        perPort.set(port, facts);
      }
      return facts;
    };
    for (const event of events) {
      const originClientId = getEventOrigin(event);
      hiddenByPath.clear();
      scopedByRoot.clear();
      for (const recipientPort of serverHandles.keys()) {
        const recipientPortId = portIds.get(recipientPort);
        if (originClientId !== undefined && recipientPortId !== undefined && originClientId === recipientPortId) {
          continue;
        }
        const scope = scopedPorts.get(recipientPort);
        if (scope === undefined) {
          factsFor(recipientPort).push(event);
          continue;
        }
        const masked = scope.consumer !== 'working-copy';
        const memoKey = `${masked ? 'masked' : 'whole'}\0${scope.root}`;
        if (!scopedByRoot.has(memoKey)) {
          scopedByRoot.set(
            memoKey,
            scopeEventToRoot(
              event,
              scope.root,
              masked ? (relativePath) => hidden(scope.root, relativePath) : undefined,
            ),
          );
        }
        const scoped = scopedByRoot.get(memoKey);
        if (scoped !== undefined) {
          factsFor(recipientPort).push(scoped);
        }
      }
    }
    for (const [recipientPort, facts] of perPort) {
      const message: ChangeEvent = facts.length === 1 ? facts[0]! : { type: 'changeSet', entries: facts };
      serverHandles.get(recipientPort)?.emit('fileChanged', message);
    }
  };

  let coalescer: ChangeEventCoalescer | undefined;
  if (options?.createCoalescer) {
    coalescer = options.createCoalescer(
      deliverToHandles,
      options.uiCoalescingWindow ?? defaultUiCoalescingWindow,
      (discarded) => {
        const affectedBackends = new Set(discarded.map((event) => event.backend));
        deliverToHandles(
          [...affectedBackends].map((backend) => ({
            type: 'backendChanged',
            backend,
          })),
        );
      },
    );
  }

  /* One bus event per changeset (D2): a change set's facts are tagged one by
   * one, so each is filtered and scoped by itself, and a port receives the
   * survivors together as one message (D6). */
  const unsubscribeEventBus = options?.changeEventBus?.subscribe((event) => {
    const changeEvent = event as ChangeEvent;
    const facts = (changeEvent.type === 'changeSet' ? changeEvent.entries : [changeEvent]).filter((fact) =>
      isEventGloballyVisible(fact),
    );
    if (facts.length === 0) {
      return;
    }
    if (coalescer) {
      for (const fact of facts) {
        coalescer.push(fact);
      }
    } else {
      deliverToHandles(facts);
    }
  });

  /**
   * What one rooted connection is served, and the delivery scope it earns.
   *
   * A refused connection earns none: it is answered `ROOT_UNAVAILABLE` and never
   * joins `scopedPorts`, so it is not a recipient of the change stream for the
   * root it was denied.
   */
  const serveRootedPort = (
    port: MessagePort,
    envelope: unknown,
    context: WorkspaceMutationContext,
  ): { readonly portHandlers: StringKeyedObject; readonly unavailableError?: RootedFileSystemError } => {
    /* Fail closed (CI2): only an envelope that names its consumer reaches the
     * handler, so no surface is served to a connection that did not ask for it
     * by name. Absent and unknown are the same refusal. */
    const rooted = rootedConnectSchema.safeParse(envelope);
    try {
      const rootedHandlers = rooted.success
        ? options?.handlerForRoot?.(rooted.data.root, context, rooted.data.consumer, policyForRoot(rooted.data.root))
        : undefined;
      if (!rooted.success || rootedHandlers === undefined) {
        const unavailableError = new RootedFileSystemError('ROOT_UNAVAILABLE');
        return { portHandlers: createUnavailableHandlers(unavailableError), unavailableError };
      }
      scopedPorts.set(port, { root: rooted.data.root, consumer: rooted.data.consumer });
      return {
        portHandlers: withChangeSetWatch(
          withHostContentCalls(serializeRootedResults(rootedHandlers), options),
          options,
        ),
      };
    } catch (error) {
      /* The refusal the hello states is the refusal the caller gets: a
       * `VirtualPathError` from a non-canonical root used to reach the client as
       * itself while the hello said `ROOT_UNAVAILABLE`. */
      const unavailableError =
        error instanceof RootedFileSystemError ? error : new RootedFileSystemError('ROOT_UNAVAILABLE');
      return { portHandlers: createUnavailableHandlers(unavailableError), unavailableError };
    }
  };

  const handler = (event: MessageEvent<unknown>): void => {
    const parsedEnvelope = connectEnvelopeSchema.safeParse(event.data);
    if (!parsedEnvelope.success) {
      const peerEnvelope = peerEnvelopeSchema.safeParse(event.data);
      if (peerEnvelope.success && peerEnvelope.data.v !== fileSystemBridgeProtocolVersion) {
        const { port, v } = peerEnvelope.data;
        const error = new FileSystemBridgeProtocolVersionError(v);
        port.postMessage({
          // The RPC frame version, not the filesystem bridge protocol version.
          v: 1,
          k: 'lh',
          o: 0,
          e: { m: error.message, c: error.code, ...(error.stack === undefined ? {} : { s: error.stack }) },
        });
        port.close();
      }
      return;
    }
    const { port } = parsedEnvelope.data;
    const stopAndReplayMessages = catchMessages(port);
    const portId = `port_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    activePorts.add(port);
    portIds.set(port, portId);

    let disconnected = false;
    /* Held here rather than read back from `serverHandles`, which a refused
     * connection is deliberately absent from. */
    let serverHandle: BridgeServerHandle | undefined = undefined;
    const disconnectPort = (): void => {
      if (disconnected) {
        return;
      }
      disconnected = true;
      port.removeEventListener('close', disconnectPort);
      activePorts.delete(port);
      portIds.delete(port);
      scopedPorts.delete(port);
      serverHandles.delete(port);
      safeDispose(() => serverHandle?.dispose());
      safeDispose(() => {
        port.close();
      });
    };
    port.addEventListener('close', disconnectPort);

    const wrappedPort = wrapFileSystemBridgePort(port, 'expose-fs-bridge');
    const requestedRoot = typeof parsedEnvelope.data.root === 'string' ? parsedEnvelope.data.root : undefined;
    const mutationContext = { originClientId: portId };
    const { portHandlers, unavailableError } =
      requestedRoot === undefined
        ? {
            portHandlers: withChangeSetWatch(bindMutationContextForPort(handlers, mutationContext)),
            unavailableError: undefined,
          }
        : serveRootedPort(port, event.data, mutationContext);
    const handlersAvailable = unavailableError === undefined;

    const handlerRecord = portHandlers as { capabilities?: ProviderCapabilities; watch?: unknown };

    const hello =
      requestedRoot === undefined
        ? handlerRecord.capabilities === undefined
          ? createFileSystemBridgeHello({
              state: 'workspace',
              watchable: typeof handlerRecord.watch === 'function',
            })
          : createFileSystemBridgeHello({
              state: 'ready',
              capabilities: handlerRecord.capabilities,
              watchable: typeof handlerRecord.watch === 'function',
            })
        : handlersAvailable
          ? createFileSystemBridgeHello({
              state: 'ready',
              capabilities: handlerRecord.capabilities!,
              watchable: typeof handlerRecord.watch === 'function',
              hashable: answersHashFiles(portHandlers),
            })
          : createFileSystemBridgeHello({
              state: 'unavailable',
              error: {
                code: 'ROOT_UNAVAILABLE',
                message: unavailableError.message,
              },
            });

    serverHandle = createBridgeServer<
      StringKeyedObject,
      FileSystemBridgeWatchRequest,
      FileSystemBridgeWatchFrame,
      FileSystemBridgeHello
    >(portHandlers, wrappedPort, {
      hello,
      protocolSchemas: fileSystemBridgeSchemas,
      bindLongCall: bindFileSystemLongCall,
      onDisconnect() {
        disconnectPort();
      },
    });
    /* A refused connection gets its `unavailable` hello and its throwing
     * handlers, and nothing else: a port answered `ROOT_UNAVAILABLE` is not a
     * recipient of the change stream for the root it was denied. */
    if (handlersAvailable) {
      serverHandles.set(port, serverHandle);
    }

    stopAndReplayMessages();
  };

  // Use addEventListener (not onmessage) so multiple listeners can coexist on
  // the injected message source — the worker global by default. Unlike
  // MessagePort, the worker global scope does not require onmessage for
  // implicit start(); addEventListener works identically, and a Node
  // `worker_threads` MessagePort auto-starts on it. Using onmessage would be
  // overwritten by other code (e.g. Vite HMR client) and silently break
  // bridge connections.
  // oxlint-disable-next-line unicorn/prefer-global-this -- `self` is the worker global and the historical default; `globalThis` is not an EventTarget in Node, where the injected source is used instead
  const messageSource: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> = options?.messageSource ?? self;
  messageSource.addEventListener('message', handler as EventListener);

  return {
    cleanup() {
      coalescer?.dispose();
      unsubscribeEventBus?.();
      messageSource.removeEventListener('message', handler as EventListener);
      for (const port of activePorts) {
        safeDispose(() => {
          port.close();
        });
      }
      for (const handle of serverHandles.values()) {
        safeDispose(() => {
          handle.dispose();
        });
      }
      activePorts.clear();
      portIds.clear();
      scopedPorts.clear();
      serverHandles.clear();
    },
    activePorts,
    serverHandles,
  };
}

/**
 * Which authority member answers each call the authority's wire carries (W11).
 *
 * The three scoped reads are the `/files` browser's (charter D5) and are the
 * only content on it; they are spelled `…Scoped…` so the routed-path read this
 * package removed has no name here to creep back into.
 */
const workspaceWireMembers = {
  mount: 'mount',
  unmount: 'unmount',
  configureProjectRoots: 'configureProjectRoots',
  listProjectManifests: 'listProjectManifests',
  commitPendingProjectDirectory: 'commitPendingProjectDirectory',
  adoptProjectDirectory: 'adoptProjectDirectory',
  permanentlyDeleteProjectDirectory: 'permanentlyDeleteProjectDirectory',
  disposeStorageRoot: 'disposeStorageRoot',
  pollExternalChanges: 'pollExternalChanges',
  watch: 'watch',
  readScopedFile: 'readFile',
  readScopedShallowDirectory: 'readShallowDirectory',
  getScopedZippedDirectory: 'getZippedDirectory',
} as const satisfies Readonly<Record<string, keyof WorkspaceFileService>>;

/**
 * The authority as its own wire serves it: topology, `watch`, and the `/files`
 * browser's scoped reads (charter deviation H3 closed, W11/EQ3).
 *
 * A host passes this, never the service, so an unrooted connection has no
 * per-path content **method** — not merely no type for one. The authority keeps
 * every removed member as an in-process member, because the mutation pipeline
 * and the rooted views call them; what a caller off the authority's own isolate
 * cannot do any more is read or write a project tree without naming the root and
 * the consumer that owns it (CI1, CI2).
 *
 * @param service - The authority this bridge fronts.
 * @returns Its wire surface, one forwarding member per call the wire carries.
 * @public
 *
 * @example <caption>Expose the authority from a worker</caption>
 * ```typescript
 * import type { WorkspaceFileService } from '@taucad/filesystem';
 * import { exposeFileSystem, workspaceBridgeService } from '@taucad/fs-bridge';
 *
 * export function exampleExpose(service: WorkspaceFileService): void {
 *   exposeFileSystem(workspaceBridgeService(service));
 * }
 * ```
 */
export function workspaceBridgeService(service: WorkspaceFileService): FileSystemBridgeWorkspaceService {
  const source = service as unknown as Record<string, (...args: readonly unknown[]) => unknown>;
  const served: Record<string, (...args: readonly unknown[]) => unknown> = {};
  for (const [wireName, member] of Object.entries(workspaceWireMembers)) {
    served[wireName] = (...args: readonly unknown[]): unknown => source[member]!(...args);
  }
  return served as unknown as FileSystemBridgeWorkspaceService;
}

/** Expose the complete workspace filesystem service over validated bridge connections. @public */
export function exposeFileSystem(
  handlers: FileSystemBridgeWorkspaceService | FileSystemBridgeRuntimeService,
  options?: FileSystemBridgeOptions &
    FileSystemBridgeHostOptions & {
      handlerForRoot?: RootedFileSystemHandlerFactory;
      /**
       * The reserved layout this server enforces on the change stream (D6).
       *
       * A masked rooted connection (`'user'`, `'agent'`) is never told about a path
       * its own view hides, so an agent cannot learn the names or the timing of
       * control-plane writes it may not read (CI1). Any host that serves a masked
       * consumer passes its policy here; a `'working-copy'` connection receives the
       * stream whole either way. It is also what {@link RootedFileSystemHandlerFactory}
       * is handed, rebased on the connection's root.
       */
      policy: PathPolicy;
      changeEventBus?: BridgeChangeEventBus;
      /**
       * Where to listen for connect envelopes. Defaults to the worker global,
       * exactly as before. A `node:worker_threads` `MessagePort` satisfies this
       * directly (it *is* an `EventTarget`), which is what lets the authority
       * run in a plain Node process, an Electron utility, or a daemon.
       */
      messageSource?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
    },
): ExposeFileSystemHandle {
  return exposeFileSystemHandlers(handlers, options);
}

/** Partial-handler seam for low-level bridge tests; not exported from the package barrel. @internal */
export function exposeFileSystemForTesting(
  handlers: StringKeyedObject,
  options?: InternalExposeFileSystemOptions,
): ExposeFileSystemHandle {
  return exposeFileSystemHandlers(handlers, options);
}

/**
 * Wait for a worker to signal that its initialization is complete.
 *
 * Workers post `{ type: workerReadyMessageType }` after `exposeFileSystem`
 * has registered its listener. Callers should await this before sending
 * bridge `connect` messages to avoid the race where the message is dropped.
 *
 * @param worker - Worker to wait for
 * @param signal - Optional AbortSignal to cancel the wait
 * @returns Resolves when the worker posts the ready message
 * @public
 */
export async function waitForWorkerReady(worker: Worker | EventTarget, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onMessage = (event: Event): void => {
      if ((event as MessageEvent).data?.type === workerReadyMessageType) {
        cleanup();
        resolve();
      }
    };

    const toError = (reason: unknown): Error =>
      reason instanceof Error ? reason : new Error('The operation was aborted.');

    const onAbort = (): void => {
      cleanup();
      reject(toError(signal?.reason));
    };

    const cleanup = (): void => {
      worker.removeEventListener('message', onMessage);
      signal?.removeEventListener('abort', onAbort);
    };

    if (signal?.aborted) {
      reject(toError(signal.reason));
      return;
    }

    worker.addEventListener('message', onMessage);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Open a raw filesystem bridge connection to a `postMessage`-capable target.
 *
 * The returned raw `MessagePort` is intended for transfer to another worker,
 * such as the runtime worker. Same-isolate clients should use
 * {@link createFileSystemBridge}.
 *
 * @param worker - Target that receives the bridge port. A browser `Worker`,
 * or any `postMessage`-capable target — a `node:worker_threads` `Worker` or
 * `MessagePort` is first-class, which is how the authority is reached when it
 * is hosted outside a browser worker.
 * @param options - Optional message type configuration.
 * @returns Bridge connection with raw port and disposal.
 * @public
 */
export function openFileSystemBridge(
  worker: Pick<Worker, 'postMessage'>,
  options?: FileSystemBridgeOptions,
): FileSystemBridgeConnection {
  const messageType = options?.messageType ?? filesystemBridgeConnectMessageType;
  const channel = new MessageChannel();
  const envelope = {
    v: fileSystemBridgeProtocolVersion,
    type: messageType,
    port: channel.port1,
    ...(options?.root === undefined ? {} : { root: options.root, consumer: options.consumer }),
  };
  worker.postMessage(envelope, [channel.port1]);
  const rawPort = asFileSystemBridgePort(channel.port2);
  return {
    port: rawPort,
    dispose() {
      safeDispose(() => {
        rawPort.close();
      });
    },
  };
}

const runtimeFileSystemBridgeOptions = (handlers: FileSystemBridgeRuntimeService) => ({
  hello: createFileSystemBridgeHello({
    state: 'ready',
    capabilities: handlers.capabilities,
    watchable: typeof handlers.watch === 'function',
    hashable: answersHashFiles(handlers),
  }),
  protocolSchemas: fileSystemBridgeSchemas,
  bindLongCall: bindFileSystemLongCall,
});

/**
 * Serve a runtime filesystem over an already-established RPC port.
 *
 * @param handlers - Rooted filesystem authority exposed to the peer.
 * @param port - Existing RPC port, including a wrapped transferred channel.
 * @param options - What the host tells the derived calls about its platform.
 * @returns Server handle whose disposal closes the bridge lifecycle.
 * @public
 */
export function serveFileSystemBridgePort(
  handlers: FileSystemBridgeRuntimeService,
  port: Port<unknown>,
  options?: FileSystemBridgeHostOptions,
): BridgeServerHandle {
  const served = withChangeSetWatch(withHostContentCalls(handlers, options), options);
  return createBridgeServer(served, port, runtimeFileSystemBridgeOptions(served));
}

/**
 * Create a validated filesystem bridge port for an in-isolate runtime filesystem.
 * The hello and every wire validator are installed here, so callers cannot
 * construct protocol metadata independently.
 *
 * @public
 */
export function createFileSystemBridgePort(
  handlers: FileSystemBridgeRuntimeService,
  options?: FileSystemBridgeHostOptions,
): FileSystemBridgeConnection {
  const served = withChangeSetWatch(withHostContentCalls(handlers, options), options);
  const bridge = createBridgePort(served, runtimeFileSystemBridgeOptions(served));
  return {
    port: asFileSystemBridgePort(bridge.port),
    dispose: bridge.dispose,
  };
}

/**
 * Create a filesystem bridge to a worker.
 *
 * The returned `Port` adapter from {@link wrapMessagePort} is intended for same-isolate RPC clients.
 *
 * @param worker - Target that receives the bridge port; any
 * `postMessage`-capable target, see {@link openFileSystemBridge}
 * @param options - Optional message type configuration
 * @returns Bridge handle with wrapped port and dispose
 * @public
 */
export function createFileSystemBridge(
  worker: Pick<Worker, 'postMessage'>,
  options?: FileSystemBridgeOptions,
): FileSystemBridge {
  const connection = openFileSystemBridge(worker, options);
  const rawPort = connection.port;
  const wrappedPort = wrapFileSystemBridgePort(rawPort, 'fs-bridge-client');

  return {
    port: wrappedPort,
    dispose() {
      connection.dispose();
    },
  };
}

/**
 * One connection's event channel, fanned out: the first subscriber opens it
 * on the wire, the last one to leave closes it, and every subscriber hears
 * `authority-lost` once per loss while the proxy is live: when the connection
 * closes under it, or when a call finds the authority unresponsive
 * (`PEER_UNRESPONSIVE`: no heartbeat, progress or answer within its liveness
 * window) while the port stays open. Whichever comes first is the loss; the
 * other says nothing more. A loss clears once a call is answered again, so the
 * next one is announced too.
 *
 * On a loss, `onLost` runs as well: the proxy resets every change-set watch it
 * holds, so a tree re-reads instead of trusting a stream that may have gaps.
 */
const eventChannel = ({
  watchReady,
  closed,
  isDisposed,
  onLost,
}: {
  readonly watchReady: ReturnType<
    typeof createBridgeCall<FileSystemBridgeWatchRequest, FileSystemBridgeWatchFrame, FileSystemBridgeHello>
  >['watchReady'];
  readonly closed: Promise<void>;
  readonly isDisposed: () => boolean;
  readonly onLost: () => void;
}): {
  readonly subscribe: (handler: (event: FileSystemBridgeEvent) => void) => FileSystemBridgeEventSubscription;
  readonly announceLost: () => void;
  readonly answered: () => void;
} => {
  const topic = new Topic<FileSystemBridgeEvent>({ name: 'FileSystemBridge.events' });
  let wire: ReturnType<typeof watchReady> | undefined;
  let lost = false;
  const announceLost = (): void => {
    if (lost || isDisposed()) {
      return;
    }
    lost = true;
    onLost();
    topic.emit({ kind: 'authority-lost' });
  };
  const answered = (): void => {
    lost = false;
  };
  const announceOnClose = async (): Promise<void> => {
    await closed;
    announceLost();
  };
  // async-iife: bootstrap -- `closed` only resolves; the announcement is the outcome.
  void announceOnClose();
  const subscribe = (handler: (event: FileSystemBridgeEvent) => void): FileSystemBridgeEventSubscription => {
    const leave = topic.subscribe(handler);
    let subscribed = true;
    if (lost) {
      queueMicrotask(() => {
        handler({ kind: 'authority-lost' });
      });
    }
    wire ??= watchReady({ paths: [''], recursive: true, form: 'events' }, (frame) => {
      topic.emit(frame as FileSystemBridgeEvent);
    });
    const opened = wire;
    return {
      unsubscribe() {
        if (!subscribed) {
          return;
        }
        subscribed = false;
        leave();
        if (topic.size > 0 || wire !== opened) {
          return;
        }
        wire = undefined;
        opened.unsubscribe();
      },
      ready: opened.ready,
      closed: opened.closed,
    };
  };
  return { subscribe, announceLost, answered };
};

/**
 * The reset a change-set watch hears when its connection is lost (D6): every
 * path it watches must be re-read, since frames may have been missed. It keeps
 * the last generation the watch saw, because nothing new was committed.
 */
const lostConnectionReset = (generation: number): ChangeSet => ({
  generation,
  entries: [],
  touchedDirectories: [],
  reset: { prefix: '', reason: 'observer-uncertain' },
});

/**
 * Create a typed proxy over a filesystem bridge.
 *
 * @param bridge - Bridge returned from {@link createFileSystemBridge} or raw connection from {@link openFileSystemBridge}.
 * @returns Typed proxy for bridge method calls.
 * @public
 */
export function createFileSystemBridgeProxy(
  bridge: FileSystemBridge | FileSystemBridgeConnection,
): FileSystemBridgeProxy {
  const resolvedBridge: FileSystemBridge = isFileSystemBridgeConnection(bridge)
    ? {
        port: wrapFileSystemBridgePort(bridge.port, 'fs-bridge-proxy'),
        dispose: bridge.dispose,
      }
    : bridge;
  if (resolvedBridge.port.start !== undefined) {
    resolvedBridge.port.start();
  }

  const { call, listen, watch, watchReady, ready, closed, hello, dispose } = createBridgeCall<
    FileSystemBridgeWatchRequest,
    FileSystemBridgeWatchFrame,
    FileSystemBridgeHello
  >(resolvedBridge.port, {
    prepareCallArgs: cloneWriteArgsForTransfer,
    resolveCallTimeout: fileSystemCallTimeout,
    protocolSchemas: fileSystemBridgeSchemas,
  });
  const connectionId = nextFileSystemBridgeConnectionId();
  let isDisposed = false;
  /* Every live change-set watch subscribes here for the reset it hears when the connection is lost. */
  const connectionLost = new Topic<undefined>({ name: 'FileSystemBridge.connectionLost' });
  const events = eventChannel({
    watchReady,
    closed,
    isDisposed: () => isDisposed,
    onLost() {
      connectionLost.emit(undefined);
    },
  });

  return new Proxy({} as FileSystemBridgeProxy, {
    get(_target, property, receiver: FileSystemBridgeRootedProxy): unknown {
      if (property === 'dispose') {
        return (): void => {
          if (isDisposed) {
            return;
          }
          isDisposed = true;
          safeDispose(() => {
            dispose();
          });
          safeDispose(() => {
            resolvedBridge.dispose();
          });
        };
      }
      if (property === 'listen') {
        return listen;
      }
      if (property === 'watch') {
        return watch;
      }
      if (property === 'watchReady') {
        return watchReady;
      }
      if (property === 'events') {
        return events.subscribe;
      }
      if (property === 'watchChangeSets') {
        return (
          request: ChangeSetWatchRequest,
          handler: (set: ChangeSet) => void,
        ): ReturnType<FileSystemBridgeProxyTransport['watchChangeSets']> => {
          let generation = 0;
          const registration = watchReady({ ...request, form: 'change-sets' }, (frame) => {
            const set = frame as ChangeSet;
            generation = set.generation;
            handler(set);
          });
          const leaveLost = connectionLost.subscribe(() => {
            handler(lostConnectionReset(generation));
          });
          // A refused registration hears no reset; its caller handles `ready`.
          const forgetIfRefused = async (): Promise<void> => {
            try {
              await registration.ready;
            } catch {
              leaveLost();
            }
          };
          void forgetIfRefused();
          return {
            ...registration,
            unsubscribe() {
              leaveLost();
              registration.unsubscribe();
            },
          };
        };
      }
      if (property === 'ready') {
        return ready;
      }
      if (property === 'closed') {
        return closed;
      }
      if (property === 'hello') {
        return hello;
      }
      if (property === 'readStream') {
        return (path: string, options?: ReadStreamOptions): ReadableStream<Uint8Array<ArrayBuffer>> =>
          rangeStream(async (offset, length) => receiver.readRange(path, offset, length), options);
      }
      /* `$$typeof` is React's element probe, read off props by its development render log. */
      if (property === 'then' || property === 'toJSON' || property === '$$typeof' || typeof property === 'symbol') {
        return undefined;
      }
      if (isDisposed && property !== 'writeFileChecked' && property !== 'deleteFileChecked') {
        throw new Error(`Filesystem bridge proxy has been disposed — cannot call '${property}'`);
      }
      return async (...args: unknown[]) => {
        if (property === 'writeFileChecked' || property === 'deleteFileChecked') {
          const preDeliveryError = checkedWritePreDeliveryError(property, args);
          if (preDeliveryError !== undefined) {
            throw preDeliveryError;
          }
          if (isDisposed) {
            throw withCheckedWriteApplicationState(
              new Error(`Filesystem bridge proxy has been disposed — cannot call '${property}'`),
              'known-not-applied',
            );
          }
        }
        /* Whether the call reached the wire: an abort before it never did. */
        let sent = false;
        try {
          const split = property === 'apply' ? await prepareApplyCall(args) : splitLongCall(property, args);
          const result = await timeFileSystemBridgeCall(connectionId, property, async () => {
            sent = split.longCall?.signal?.aborted !== true;
            return call(property, split.args, split.longCall);
          });
          events.answered();
          if (property === 'readMany') {
            return readManyResult(result as ReadManyWireRows);
          }
          if (property === 'facts') {
            return new Map(result as FactsWireRows);
          }
          if (property === 'apply') {
            return receiptFromWire(result as ChangesetReceipt);
          }
          return result;
        } catch (error) {
          if ((error as { code?: unknown } | undefined)?.code === 'PEER_UNRESPONSIVE') {
            events.announceLost();
          }
          if (property === 'writeFileChecked' || property === 'deleteFileChecked') {
            throw classifyCheckedWriteFailure(error);
          }
          if (mutatingCalls.has(property)) {
            throw classifyMutationFailure(error, sent);
          }
          throw error;
        }
      };
    },
  });
}

/**
 * Adopt a raw port received through structured clone and validate it as a
 * filesystem bridge before queued calls can dispatch.
 *
 * @public
 */
export function createTransferredFileSystemBridgeProxy(port: MessagePortLike): FileSystemBridgeProxy {
  /* Wrap here rather than branding the port, so the parameter can be any
   * `MessagePortLike`.
   * ponytail: `createFileSystemBridgeProxy`'s connection arm performs exactly
   * this wrap with the same label, so behaviour is unchanged. */
  return createFileSystemBridgeProxy({
    port: wrapFileSystemBridgePort(port, 'fs-bridge-proxy'),
    dispose() {
      port.close();
    },
  });
}
