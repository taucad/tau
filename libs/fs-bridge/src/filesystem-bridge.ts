/**
 * Filesystem bridge: worker-side ({@link exposeFileSystem}) and client-side ({@link createFileSystemBridge}).
 */

import {
  getEventOrigin,
  isEventGloballyVisible,
  isWorkspaceMutationError,
  RootedFileSystemError,
} from '@taucad/filesystem';
import { safeDispose } from '@taucad/utils/dispose';
import { wrapMessagePort } from '@taucad/rpc';
import type { MessagePortLike } from '@taucad/rpc';
import type { ChangeEvent } from '@taucad/types';
import type {
  FileStat,
  MkdirOptions,
  ProviderCapabilities,
  WatchEvent,
  WatchRequest,
  WorkspaceFileService,
  WorkspaceMutationContext,
  WorkspaceMutationError,
  WorkspaceMutationErrorCode,
} from '@taucad/filesystem';
import type { BridgeServerHandle, Port, StringKeyedObject } from '@taucad/rpc/bridge';
import { catchMessages, createBridgeCall, createBridgePort, createBridgeServer } from '@taucad/rpc/bridge';
import { z } from 'zod';
import {
  createFileSystemBridgeHello,
  fileSystemBridgeProtocolVersion,
  fileSystemBridgeSchemas,
  FileSystemBridgeProtocolVersionError,
} from '#filesystem-bridge-protocol.js';
import type {
  FileSystemBridgeHello,
  FileSystemBridgeRuntimeService,
  FileSystemBridgeService,
  FileSystemBridgeWorkspaceService,
} from '#filesystem-bridge-protocol.js';

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
 * Typed filesystem bridge proxy preserving class/interface-shaped service surfaces.
 *
 * @public
 */
// oxlint-disable-next-line @typescript-eslint/no-restricted-types -- proxy target types may be class/interface services without string index signatures.
export type FileSystemBridgeProxy = FileSystemBridgeService & {
  readonly ready: Promise<void>;
  readonly hello: { readonly payload: FileSystemBridgeHello };
  dispose(): void;
  listen(event: string, handler: (data: unknown) => void): () => void;
  watch(request: WatchRequest, handler: (event: WatchEvent) => void): () => void;
  watchReady(
    request: WatchRequest,
    handler: (event: WatchEvent) => void,
  ): { unsubscribe: () => void; ready: Promise<void>; closed: Promise<void> };
};

const isFileSystemBridgeConnection = (
  bridge: FileSystemBridge | FileSystemBridgeConnection,
): bridge is FileSystemBridgeConnection => !('onMessage' in bridge.port);
/** Milliseconds. */
const defaultUiCoalescingWindow = 500;

const asFileSystemBridgePort = (port: MessagePort): FileSystemBridgePort => port as FileSystemBridgePort;

const wrapFileSystemBridgePort = (port: MessagePortLike, label: string): Port<unknown> => {
  const wrapped = wrapMessagePort<unknown>(port, { label });
  if (wrapped.start !== undefined) {
    wrapped.start();
  }
  return wrapped;
};

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

const cloneWriteArgsForTransfer = (method: string, args: unknown[]): unknown[] => {
  if (method === 'writeFile' && args.length >= 2) {
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
  | 'writeFiles'
  | 'mkdir'
  | 'move'
  | 'bulkMove'
  | 'unlink'
  | 'rmdir'
  | 'duplicateFile'
  | 'copyDirectory'
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
type WriteFilesParameters = Parameters<MutatingMethods['writeFiles']>;
type DuplicateFileParameters = Parameters<MutatingMethods['duplicateFile']>;
type CopyDirectoryParameters = Parameters<MutatingMethods['copyDirectory']>;
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
 * or {@link import('#types/runtime-kernel.types.js').RuntimeFileSystemBase}
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
    writeFiles: async (files: WriteFilesParameters[0]): Promise<void> => mutatingService.writeFiles(files, context),
    mkdir: async (path: string, options?: MkdirOptions): Promise<void> => mutatingService.mkdir(path, options, context),
    move: async (source: string, target: string): Promise<FileStat> => mutatingService.move(source, target, context),
    bulkMove: async (edits: readonly BulkMoveEdit[]): Promise<BulkMoveResult> =>
      serializeBulkMoveResult(await mutatingService.bulkMove(edits, context)),
    unlink: async (path: string): Promise<void> => mutatingService.unlink(path, context),
    rmdir: async (path: string, options?: { recursive?: boolean }): Promise<void> =>
      mutatingService.rmdir(path, options, context),
    duplicateFile: async (
      sourcePath: DuplicateFileParameters[0],
      destinationPath: DuplicateFileParameters[1],
    ): Promise<void> => mutatingService.duplicateFile(sourcePath, destinationPath, context),
    copyDirectory: async (
      sourcePath: CopyDirectoryParameters[0],
      destinationPath: CopyDirectoryParameters[1],
    ): Promise<void> => mutatingService.copyDirectory(sourcePath, destinationPath, context),
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
  push(event: ChangeEvent): void;
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
  deliver: (events: ChangeEvent[]) => void,
  /** Coalescing window. Milliseconds. */
  coalescingWindow: number,
  /** Report discarded events so the bridge can replace them with loss signals. */
  onOverflow: (events: readonly ChangeEvent[]) => void,
) => ChangeEventCoalescer;

/**
 * Options for configuring the filesystem bridge message type.
 * @public
 */
export type FileSystemBridgeOptions = {
  messageType?: string;
  /**
   * Project mount to expose as `/` for this connection. The root is consumed
   * by the filesystem server when the connection is accepted; it is never
   * forwarded to runtime calls.
   */
  root?: string;
  /** Coalescing window for UI-bound fileChanged events (default: 500). Milliseconds. */
  uiCoalescingWindow?: number;
  /**
   * Factory for creating a change event coalescer. When provided, events
   * from `changeEventBus` are batched before broadcasting to bridge clients.
   * When omitted, events pass through without batching.
   */
  createCoalescer?: CoalescerFactory;
};

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
export type RootedFileSystemHandlerFactory = (
  root: string,
  context: WorkspaceMutationContext,
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
type InternalExposeFileSystemOptions = FileSystemBridgeOptions & {
  handlerForRoot?: (root: string, context: WorkspaceMutationContext) => StringKeyedObject | undefined;
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
  const scopedPorts = new Set<MessagePort>();

  const deliverToHandles = (events: ChangeEvent[]): void => {
    for (const event of events) {
      const originClientId = getEventOrigin(event);
      for (const [recipientPort, handle] of serverHandles) {
        if (scopedPorts.has(recipientPort)) {
          continue;
        }
        const recipientPortId = portIds.get(recipientPort);
        if (originClientId !== undefined && recipientPortId !== undefined && originClientId === recipientPortId) {
          continue;
        }
        handle.emit('fileChanged', event);
      }
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

  const unsubscribeEventBus = options?.changeEventBus?.subscribe((event) => {
    const changeEvent = event as ChangeEvent;
    if (!isEventGloballyVisible(changeEvent)) {
      return;
    }
    if (coalescer) {
      coalescer.push(changeEvent);
    } else {
      deliverToHandles([changeEvent]);
    }
  });

  const handler = (event: MessageEvent<unknown>): void => {
    const parsedEnvelope = connectEnvelopeSchema.safeParse(event.data);
    if (!parsedEnvelope.success) {
      const peerEnvelope = peerEnvelopeSchema.safeParse(event.data);
      if (peerEnvelope.success && peerEnvelope.data.v !== fileSystemBridgeProtocolVersion) {
        const { port, v } = peerEnvelope.data;
        const error = new FileSystemBridgeProtocolVersionError(v);
        port.postMessage({
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
    const disconnectPort = (): void => {
      if (disconnected) {
        return;
      }
      disconnected = true;
      const handle = serverHandles.get(port);
      port.removeEventListener('close', disconnectPort);
      activePorts.delete(port);
      portIds.delete(port);
      scopedPorts.delete(port);
      serverHandles.delete(port);
      safeDispose(() => handle?.dispose());
      safeDispose(() => {
        port.close();
      });
    };
    port.addEventListener('close', disconnectPort);

    const wrappedPort = wrapFileSystemBridgePort(port, 'expose-fs-bridge');
    const requestedRoot = typeof parsedEnvelope.data.root === 'string' ? parsedEnvelope.data.root : undefined;
    const mutationContext = { originClientId: portId };
    let portHandlers: StringKeyedObject;
    let handlersAvailable = true;
    let unavailableError: RootedFileSystemError | undefined;
    if (requestedRoot === undefined) {
      portHandlers = bindMutationContextForPort(handlers, mutationContext);
    } else {
      scopedPorts.add(port);
      try {
        const rootedHandlers = options?.handlerForRoot?.(requestedRoot, mutationContext);
        handlersAvailable = rootedHandlers !== undefined;
        unavailableError = rootedHandlers === undefined ? new RootedFileSystemError('ROOT_UNAVAILABLE') : undefined;
        portHandlers = rootedHandlers ?? createUnavailableHandlers(unavailableError!);
      } catch (error) {
        handlersAvailable = false;
        unavailableError =
          error instanceof RootedFileSystemError ? error : new RootedFileSystemError('ROOT_UNAVAILABLE');
        portHandlers = createUnavailableHandlers(error);
      }
    }

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
            })
          : createFileSystemBridgeHello({
              state: 'unavailable',
              error: {
                code: 'ROOT_UNAVAILABLE',
                message: unavailableError?.message ?? 'The requested filesystem root is unavailable.',
              },
            });

    const serverHandle = createBridgeServer<StringKeyedObject, WatchRequest, WatchEvent, FileSystemBridgeHello>(
      portHandlers,
      wrappedPort,
      {
        hello,
        protocolSchemas: fileSystemBridgeSchemas,
        onDisconnect() {
          disconnectPort();
        },
      },
    );
    serverHandles.set(port, serverHandle);

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

/** Expose the complete workspace filesystem service over validated bridge connections. @public */
export function exposeFileSystem(
  handlers: FileSystemBridgeWorkspaceService | FileSystemBridgeRuntimeService,
  options?: FileSystemBridgeOptions & {
    handlerForRoot?: RootedFileSystemHandlerFactory;
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
  const envelope =
    options?.root === undefined
      ? { v: fileSystemBridgeProtocolVersion, type: messageType, port: channel.port1 }
      : { v: fileSystemBridgeProtocolVersion, type: messageType, port: channel.port1, root: options.root };
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

/**
 * Create a validated filesystem bridge port for an in-isolate runtime filesystem.
 * The hello and every wire validator are installed here, so callers cannot
 * construct protocol metadata independently.
 *
 * @public
 */
export function createFileSystemBridgePort(handlers: FileSystemBridgeRuntimeService): FileSystemBridgeConnection {
  const bridge = createBridgePort(handlers, {
    hello: createFileSystemBridgeHello({
      state: 'ready',
      capabilities: handlers.capabilities,
      watchable: typeof handlers.watch === 'function',
    }),
    protocolSchemas: fileSystemBridgeSchemas,
  });
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

  const { call, listen, watch, watchReady, ready, hello, dispose } = createBridgeCall<
    WatchRequest,
    WatchEvent,
    FileSystemBridgeHello
  >(resolvedBridge.port, {
    prepareCallArgs: cloneWriteArgsForTransfer,
    resolveCallTimeout: (method) => (method === 'commitPendingProjectDirectory' ? 'none' : undefined),
    protocolSchemas: fileSystemBridgeSchemas,
  });
  let isDisposed = false;

  return new Proxy({} as FileSystemBridgeProxy, {
    get(_target, property): unknown {
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
      if (property === 'ready') {
        return ready;
      }
      if (property === 'hello') {
        return hello;
      }
      if (property === 'then' || property === 'toJSON' || typeof property === 'symbol') {
        return undefined;
      }
      if (isDisposed) {
        throw new Error(`Filesystem bridge proxy has been disposed — cannot call '${property}'`);
      }
      return async (...args: unknown[]) => call(property, args);
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
