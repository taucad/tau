/**
 * Filesystem bridge: worker-side ({@link exposeFileSystem}) and client-side ({@link createFileSystemBridge}).
 */

import { getEventOrigin } from '@taucad/filesystem';
import { safeDispose } from '@taucad/utils/dispose';
import { wrapMessagePort } from '@taucad/rpc';
import type { ChangeEvent } from '@taucad/types';
import type { WorkspaceFileService, WorkspaceMutationContext } from '@taucad/filesystem';
import type { StringKeyedObject } from '#types/bridge.types.js';
import type { BridgeServerHandle, FileSystemBridge } from '#transport/_internal/runtime-filesystem-bridge.js';
import type { RuntimeWatchRequest, RuntimeWatchEvent } from '#types/runtime-kernel.types.js';
import { createBridgeServer, catchMessages } from '#transport/_internal/runtime-filesystem-bridge.js';
import { filesystemBridgeConnectMessageType, workerReadyMessageType } from '#framework/runtime-framework.constants.js';
/** Milliseconds. */
const defaultUiCoalescingWindow = 500;

/**
 * The eight worker-side filesystem methods that receive a
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
  | 'rename'
  | 'move'
  | 'bulkMove'
  | 'unlink'
  | 'rmdir'
  | 'duplicateFile'
  | 'copyDirectory';

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
  const overrides: MutationOverrideMap = {
    writeFile: async (path, data) => (service as unknown as MutatingMethods).writeFile(path, data, context),
    writeFiles: async (files) => (service as unknown as MutatingMethods).writeFiles(files, context),
    mkdir: async (path, options) => (service as unknown as MutatingMethods).mkdir(path, options, context),
    rename: async (from, to) => (service as unknown as MutatingMethods).rename(from, to, context),
    move: async (source, target, options) =>
      (service as unknown as MutatingMethods).move(source, target, options, context),
    bulkMove: async (edits, options) => (service as unknown as MutatingMethods).bulkMove(edits, options, context),
    unlink: async (path, options) => (service as unknown as MutatingMethods).unlink(path, options, context),
    rmdir: async (path, options) => (service as unknown as MutatingMethods).rmdir(path, options, context),
    duplicateFile: async (sourcePath, destinationPath) =>
      (service as unknown as MutatingMethods).duplicateFile(sourcePath, destinationPath, context),
    copyDirectory: async (sourcePath, destinationPath) =>
      (service as unknown as MutatingMethods).copyDirectory(sourcePath, destinationPath, context),
  };

  return new Proxy(service, {
    get(target, property, _receiver) {
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
 * before delivering them. Matches the push/flush/dispose API surface
 * of `EventCoalescer` from `@taucad/filesystem`.
 * @public
 */
export type ChangeEventCoalescer = {
  push(event: ChangeEvent): void;
  flush(): void;
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
) => ChangeEventCoalescer;

/**
 * Minimal interface for a throttled worker that delivers events in chunks.
 * Matches the push/flush/dispose API surface of `ThrottledWorker` from
 * `@taucad/filesystem`.
 * @public
 */
export type ThrottledEventWorker = {
  push(items: ChangeEvent[]): void;
  flush(): void;
  dispose(): void;
};

/**
 * Factory that creates a {@link ThrottledEventWorker}.
 *
 * Called by {@link exposeFileSystem} with a handler that delivers chunks
 * to all connected bridge ports. The factory receives the handler and
 * should return a throttled worker wrapping it.
 * @public
 */
export type ThrottledWorkerFactory = (handler: (chunk: ChangeEvent[]) => void) => ThrottledEventWorker;

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
  /**
   * Factory for creating a throttled event worker. When provided alongside
   * `createCoalescer`, coalesced batches flow through the throttled worker
   * for chunked delivery to bridge clients.
   */
  createThrottledWorker?: ThrottledWorkerFactory;
};

/**
 * Optional watch handler for bridge servers.
 * When provided, enables watch/unwatch control messages over the bridge.
 * @public
 */
export type BridgeWatchHandler = {
  watch(request: RuntimeWatchRequest, handler: (event: RuntimeWatchEvent) => void, ownerId?: string): () => void;
  cleanupWatches(ownerId: string): void;
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
 * @param options - Optional message type and watch handler
 * @returns Handle with cleanup, activePorts, and serverHandles
 * @public
 */
export function exposeFileSystem<T extends StringKeyedObject>(
  handlers: T,
  options?: FileSystemBridgeOptions & { watchHandler?: BridgeWatchHandler; changeEventBus?: BridgeChangeEventBus },
): ExposeFileSystemHandle {
  const messageType = options?.messageType ?? filesystemBridgeConnectMessageType;
  const activePorts = new Set<MessagePort>();
  const serverHandles = new Map<MessagePort, BridgeServerHandle>();
  const portIds = new Map<MessagePort, string>();
  const portWatches = new Map<MessagePort, Map<string, () => void>>();

  const deliverToHandles = (events: ChangeEvent[]): void => {
    for (const event of events) {
      const originClientId = getEventOrigin(event);
      for (const [recipientPort, handle] of serverHandles) {
        const recipientPortId = portIds.get(recipientPort);
        if (originClientId !== undefined && recipientPortId !== undefined && originClientId === recipientPortId) {
          continue;
        }
        handle.emit('fileChanged', event);
      }
    }
  };

  const throttledWorker = options?.createThrottledWorker?.(deliverToHandles);

  const deliverFromCoalescer = throttledWorker
    ? (events: ChangeEvent[]): void => {
        throttledWorker.push(events);
      }
    : deliverToHandles;

  let coalescer: ChangeEventCoalescer | undefined;
  if (options?.createCoalescer) {
    coalescer = options.createCoalescer(deliverFromCoalescer, options.uiCoalescingWindow ?? defaultUiCoalescingWindow);
  }

  const unsubscribeEventBus = options?.changeEventBus?.subscribe((event) => {
    if (coalescer) {
      coalescer.push(event as ChangeEvent);
    } else {
      deliverToHandles([event as ChangeEvent]);
    }
  });

  const handler = (event: MessageEvent): void => {
    if (event.data?.type === messageType && event.data.port instanceof MessagePort) {
      const port = event.data.port as MessagePort;
      const stopAndReplayMessages = catchMessages(port);
      const portId = `port_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      activePorts.add(port);
      portIds.set(port, portId);
      portWatches.set(port, new Map());

      const wrappedPort = wrapMessagePort<unknown>(port, { label: 'expose-fs-bridge' });
      if (wrappedPort.start !== undefined) {
        wrappedPort.start();
      }

      const portBoundHandlers = bindMutationContextForPort(handlers, { originClientId: portId });
      const serverHandle = createBridgeServer(portBoundHandlers, wrappedPort, {
        onDisconnect() {
          const watches = portWatches.get(port);
          if (watches) {
            for (const unsubscribe of watches.values()) {
              unsubscribe();
            }
            portWatches.delete(port);
          }
          options?.watchHandler?.cleanupWatches(portId);
          activePorts.delete(port);
          portIds.delete(port);
          serverHandles.delete(port);
          safeDispose(() => {
            port.close();
          });
        },
        onWatch(watchId: string, request: RuntimeWatchRequest) {
          if (!options?.watchHandler) {
            return;
          }
          const unsubscribe = options.watchHandler.watch(
            request,
            (watchEvent: RuntimeWatchEvent) => {
              serverHandle.emit(`watch:${watchId}`, watchEvent);
            },
            portId,
          );
          portWatches.get(port)?.set(watchId, unsubscribe);
        },
        onUnwatch(watchId: string) {
          const watches = portWatches.get(port);
          const unsubscribe = watches?.get(watchId);
          if (unsubscribe) {
            unsubscribe();
            watches?.delete(watchId);
          }
        },
      });
      serverHandles.set(port, serverHandle);

      stopAndReplayMessages();
    }
  };

  // Use addEventListener (not self.onmessage) so multiple listeners can coexist
  // on the DedicatedWorkerGlobalScope. Unlike MessagePort, the worker global
  // scope does not require onmessage for implicit start() — addEventListener
  // works identically. Using onmessage would be overwritten by other code
  // (e.g. Vite HMR client) and silently break bridge connections.
  self.addEventListener('message', handler);

  return {
    cleanup() {
      coalescer?.dispose();
      throttledWorker?.dispose();
      unsubscribeEventBus?.();
      self.removeEventListener('message', handler);
      for (const port of activePorts) {
        safeDispose(() => {
          port.close();
        });
      }
      activePorts.clear();
      serverHandles.clear();
    },
    activePorts,
    serverHandles,
  };
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
 * Create a filesystem bridge to a worker.
 *
 * The returned `Port` adapter from {@link wrapMessagePort} is intended for same-isolate RPC clients
 * such as `createBridgeProxy`.
 *
 * @param worker - Target worker to receive the bridge port
 * @param options - Optional message type configuration
 * @returns Bridge handle with wrapped port and dispose
 * @public
 */
export function createFileSystemBridge(worker: Worker, options?: FileSystemBridgeOptions): FileSystemBridge {
  const messageType = options?.messageType ?? filesystemBridgeConnectMessageType;
  const channel = new MessageChannel();
  worker.postMessage({ type: messageType, port: channel.port1 }, [channel.port1]);
  const rawPort = channel.port2;
  const wrappedPort = wrapMessagePort<unknown>(rawPort, { label: 'fs-bridge-client' });
  if (wrappedPort.start !== undefined) {
    wrappedPort.start();
  }

  return {
    port: wrappedPort,
    dispose() {
      safeDispose(() => {
        rawPort.postMessage({ type: 'disconnect' });
      });
      safeDispose(() => {
        rawPort.close();
      });
    },
  };
}
