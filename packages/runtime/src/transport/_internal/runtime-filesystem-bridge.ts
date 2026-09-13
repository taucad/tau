/**
 * FileSystem MessagePort Bridge (transport-internal).
 *
 * Implements the bridge API (`createBridgeServer`, `createBridgeCall`,
 * `createBridgePort`, `createBridgeProxy`) on top of `@taucad/rpc`'s
 * `Channel`/`ChannelServer` primitives. Used by transports to project a
 * consumer-supplied `RuntimeFileSystem` into the worker side of the wire,
 * and by the worker side to consume it. Callers MUST pass wire-agnostic
 * {@link Port} instances (typically via {@link wrapMessagePort}); the bridge
 * does not implicitly wrap bare `MessagePort`s. The wire format is
 * `{ v: 1, k: 'c'|'r'|'l'|'p'|… }` envelopes; each port is a single
 * channel — multiplex is intentionally NOT used because its JSON-string
 * chunker corrupts `Uint8Array` payloads.
 *
 * Transferables travel via `WithTransferables<T>`: `readFile` results, watch
 * events with binary payloads, and any `writeFile`-style argument that wraps
 * its bytes in `WithTransferables` are hoisted onto the second argument of
 * `port.postMessage` automatically by the Channel layer.
 *
 * Lives under `transport/_internal/` because it value-imports `@taucad/rpc`
 * (`createChannelClient`, `createChannelServer`, `wrapMessagePort`) and
 * therefore violates the C4 layering rule for `framework/`. It is private to
 * runtime; consumers receive the bridge surface via the typed
 * {@link RuntimeFileSystem} brand and the `from*` factory helpers, not by
 * importing from here directly.
 *
 * @internal
 */

import { safeDispose } from '@taucad/utils/dispose';
import { createChannelClient, createChannelServer, wrapMessagePort } from '@taucad/rpc';
import type { Port, WithTransferables } from '@taucad/rpc';
import type { RuntimeFileSystemBase, RuntimeWatchRequest, RuntimeWatchEvent } from '#types/runtime-kernel.types.js';
import type { StringKeyedObject } from '#types/bridge.types.js';
import { messagePortCallTimeout } from '#framework/runtime-framework.constants.js';
/**
 * Minimal interface for a shared file pool used by the bridge for
 * zero-IPC cached reads. Structurally compatible with `SharedPool`
 * from `@taucad/memory` and with the read+store subset of
 * `FileContentCache` from `#cache/file-content-cache.js`.
 *
 * @public
 */
export type FilePool = {
  store(path: string, data: Uint8Array<ArrayBuffer>): boolean | void;
  resolveCopy(path: string): Uint8Array<ArrayBuffer> | undefined;
  invalidate?(path: string): void;
};

/**
 * Walk an arbitrarily nested value and collect every unique `ArrayBuffer`
 * that backs a typed array, plus standalone `ArrayBuffer` instances.
 *
 * @param value - Arbitrarily nested value to scan for ArrayBuffers.
 * @returns De-duplicated list of transferable ArrayBuffers.
 * @public
 */
export function extractTransferables(value: unknown): Transferable[] {
  const seen = new Set<ArrayBuffer>();
  function walk(v: unknown): void {
    if (v instanceof ArrayBuffer) {
      seen.add(v);
    } else if (ArrayBuffer.isView(v) && v.buffer instanceof ArrayBuffer) {
      seen.add(v.buffer);
    } else if (Array.isArray(v)) {
      for (const item of v) {
        walk(item);
      }
    } else if (v !== null && typeof v === 'object') {
      for (const property of Object.values(v)) {
        walk(property);
      }
    }
  }

  walk(value);
  return [...seen];
}

/**
 * Serializable error representation transmitted over the bridge wire protocol.
 * @public
 */
export type BridgeError = {
  message: string;
  name: string;
  stack?: string;
  code?: string;
  metadata?: Record<string, unknown>;
};

const broadcastEvent = 'broadcast';
const watchEvent = 'watch';

type BroadcastFrame = { event: string; data: unknown };

const wrapAsTransferables = <T>(value: T): WithTransferables<T> | T => {
  const transferables = extractTransferables(value);
  if (transferables.length === 0) {
    return value;
  }
  return { value, transferables } satisfies WithTransferables<T>;
};

const serializeBridgeError = (error: unknown): BridgeError => ({
  message: error instanceof Error ? error.message : String(error),
  name: error instanceof Error ? error.constructor.name : 'Error',
  stack: error instanceof Error ? error.stack : undefined,
  code: (error as NodeJS.ErrnoException).code,
  metadata: (error as Record<string, unknown>)['metadata'] as Record<string, unknown> | undefined,
});

const reconstructError = (
  bridgeError: BridgeError,
): Error & {
  code?: string;
  metadata?: Record<string, unknown>;
} => {
  const error = Object.assign(new Error(bridgeError.message), {
    name: bridgeError.name,
    code: bridgeError.code,
    metadata: bridgeError.metadata,
  });
  if (bridgeError.stack) {
    error.stack = bridgeError.stack;
  }
  return error;
};

const isBridgeErrorWire = (value: unknown): value is { __bridgeError: BridgeError } => {
  return value !== null && typeof value === 'object' && '__bridgeError' in (value as Record<string, unknown>);
};

/**
 * Async push queue used by the server-side broadcast/watch async iterators.
 * Items pushed before a `next()` call are buffered; `close()` ends the stream.
 */
type PushQueue<T> = {
  push: (value: T) => void;
  close: () => void;
  iterable: AsyncIterable<T>;
};

const createPushQueue = <T>(): PushQueue<T> => {
  const buffer: T[] = [];
  const waiters: Array<(result: IteratorResult<T>) => void> = [];
  let closed = false;

  const push = (value: T): void => {
    if (closed) {
      return;
    }
    const waiter = waiters.shift();
    if (waiter) {
      waiter({ value, done: false });
    } else {
      buffer.push(value);
    }
  };

  const close = (): void => {
    if (closed) {
      return;
    }
    closed = true;
    for (const waiter of waiters.splice(0)) {
      waiter({ value: undefined as unknown as T, done: true });
    }
  };

  const iterable: AsyncIterable<T> = {
    [Symbol.asyncIterator]() {
      return {
        next: async (): Promise<IteratorResult<T>> => {
          if (buffer.length > 0) {
            const value = buffer.shift() as T;
            return { value, done: false };
          }
          if (closed) {
            return { value: undefined as unknown as T, done: true };
          }
          return new Promise<IteratorResult<T>>((resolve) => {
            waiters.push(resolve);
          });
        },
        return: async (): Promise<IteratorResult<T>> => {
          close();
          return { value: undefined as unknown as T, done: true };
        },
      };
    },
  };

  return { push, close, iterable };
};

// --- Server ---

/**
 * Handle returned by {@link createBridgeServer}, providing an event emitter
 * for server-to-client push messages.
 * @public
 */
export type BridgeServerHandle = {
  emit: (event: string, data: unknown) => void;
};

/**
 * Serve an object's methods over a MessagePort using `@taucad/rpc`.
 *
 * @param handlers - Object whose methods are exposed over the port.
 * @param port - RPC {@link Port} (typically wrap a WHATWG/Electron-compatible
 *               `MessagePort` with {@link wrapMessagePort} — the bridge layer
 *               does **not** call `wrapMessagePort` for you anymore).
 * @param options - Optional callbacks for disconnect, watch, and unwatch.
 * @returns Handle with emit function for server-to-client push messages.
 * @public
 */
export function createBridgeServer<T extends StringKeyedObject>(
  handlers: T,
  port: Port<unknown>,
  options?: {
    onDisconnect?: () => void;
    onWatch?: (watchId: string, request: RuntimeWatchRequest) => void;
    onUnwatch?: (watchId: string) => void;
    /** Writer-side shared file pool. Binary readFile results are stored here after successful reads. */
    filePool?: FilePool;
  },
): BridgeServerHandle {
  const broadcastQueues = new Set<PushQueue<BroadcastFrame>>();
  const broadcastBuffer: BroadcastFrame[] = [];
  const broadcastBufferLimit = 32;
  const watchUnsubs = new Map<string, () => void>();
  let watchIdCounter = 0;

  const dispatchHandler = async (name: string, args: unknown[]): Promise<unknown> => {
    const handlerFunction = (handlers as Record<string, unknown>)[name] as
      | ((...functionArguments: unknown[]) => Promise<unknown>)
      | undefined;
    if (!handlerFunction) {
      throw new Error(`Unknown method: ${name}`);
    }
    const result: unknown = await handlerFunction.call(handlers, ...args);

    if (options?.filePool && name === 'readFile' && result instanceof Uint8Array) {
      const filePath = args[0] as string;
      options.filePool.store(filePath, result as Uint8Array<ArrayBuffer>);
    }

    return wrapAsTransferables(result);
  };

  const channelServer = createChannelServer({
    port,
    sessionKey: 'fs',
    impl: {
      call: async (_context, name, args) => {
        try {
          const argumentList = (Array.isArray(args) ? args : []) as unknown[];
          return await dispatchHandler(name, argumentList);
        } catch (error) {
          return { __bridgeError: serializeBridgeError(error) };
        }
      },
      // oxlint-disable-next-line max-params -- ChannelServer.listen impl signature is fixed at 4 params (context, eventName, args, signal)
      async *listen(_context, eventName, listenArgs, signal) {
        if (eventName === broadcastEvent) {
          yield* subscribeBroadcast(signal);
          return;
        }
        if (eventName === watchEvent) {
          yield* subscribeWatch(listenArgs, signal);
          return;
        }
        throw new Error(`Unknown listen event: ${eventName}`);
      },
    },
  });

  async function* subscribeBroadcast(signal?: AbortSignal): AsyncGenerator<BroadcastFrame> {
    const queue = createPushQueue<BroadcastFrame>();
    broadcastQueues.add(queue);
    for (const frame of broadcastBuffer) {
      queue.push(frame);
    }
    const onAbort = (): void => {
      queue.close();
    };
    if (signal) {
      if (signal.aborted) {
        queue.close();
      } else {
        signal.addEventListener('abort', onAbort, { once: true });
      }
    }
    try {
      for await (const frame of queue.iterable) {
        yield frame;
      }
    } finally {
      broadcastQueues.delete(queue);
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
    }
  }

  async function* subscribeWatch(
    listenArgs: unknown,
    signal?: AbortSignal,
  ): AsyncGenerator<RuntimeWatchEvent | WithTransferables<RuntimeWatchEvent>> {
    const request = (listenArgs as { request?: RuntimeWatchRequest } | undefined)?.request;
    if (!request) {
      return;
    }
    const watchFunction = (handlers as Record<string, unknown>)['watch'] as
      | ((watchRequest: RuntimeWatchRequest, handler: (event: RuntimeWatchEvent) => void) => () => void)
      | undefined;
    if (!watchFunction) {
      throw new Error('Bridge handlers do not implement watch()');
    }

    const watchId = `w_${watchIdCounter++}`;
    options?.onWatch?.(watchId, request);
    const queue = createPushQueue<RuntimeWatchEvent>();
    const unsubscribe = watchFunction.call(handlers, request, (event: RuntimeWatchEvent) => {
      queue.push(event);
    });
    watchUnsubs.set(watchId, unsubscribe);

    const cleanup = (): void => {
      const u = watchUnsubs.get(watchId);
      if (u) {
        u();
        watchUnsubs.delete(watchId);
      }
      options?.onUnwatch?.(watchId);
      queue.close();
    };
    if (signal) {
      if (signal.aborted) {
        cleanup();
      } else {
        signal.addEventListener('abort', cleanup, { once: true });
      }
    }

    try {
      for await (const event of queue.iterable) {
        yield wrapAsTransferables<RuntimeWatchEvent>(event);
      }
    } finally {
      cleanup();
      if (signal) {
        signal.removeEventListener('abort', cleanup);
      }
    }
  }

  // async-iife: bootstrap
  void (async (): Promise<void> => {
    try {
      await channelServer.closed;
    } catch {
      // Channel close errors are not actionable here.
    }
    options?.onDisconnect?.();
    for (const queue of broadcastQueues) {
      queue.close();
    }
    broadcastQueues.clear();
    for (const unsub of watchUnsubs.values()) {
      unsub();
    }
    watchUnsubs.clear();
  })();

  function emit(eventName: string, eventData: unknown): void {
    const frame = { event: eventName, data: eventData };
    for (const queue of broadcastQueues) {
      queue.push(frame);
    }
    broadcastBuffer.push(frame);
    if (broadcastBuffer.length > broadcastBufferLimit) {
      broadcastBuffer.shift();
    }
  }

  return { emit };
}

/**
 * Wraps the worker `fileSystemPort` for {@link createBridgeProxy} without
 * leaking `@taucad/rpc` into `framework/` (C4 layering).
 *
 * @param port - `MessagePort` from {@link RuntimeInitializeMemoryHandle.fileSystemPort}.
 * @returns Wrapped wire port for {@link createBridgeProxy}.
 * @public
 */
export function wrapWorkerFilesystemBridgePort(port: MessagePort): Port<unknown> {
  const wrapped = wrapMessagePort<unknown>(port, { label: 'kernel-fs-bridge' });
  if (wrapped.start !== undefined) {
    wrapped.start();
  }
  return wrapped;
}

// --- Client ---

/**
 * Handle returned by {@link createFileSystemBridge}: same-isolate {@link Port} for
 * {@link createBridgeProxy} / {@link createBridgeCall}. The port is already wrapped via
 * {@link wrapMessagePort}.
 *
 * @public
 */
export type FileSystemBridge = {
  /** Wire-agnostic port for RPC clients in this isolate. */
  port: Port<unknown>;
  dispose(): void;
};

/**
 * Handle returned by {@link createBridgePort}: client-side {@link MessagePort} for
 * structured-clone transfer via `postMessage(..., [port])`.
 *
 * @public
 */
export type BridgePort = {
  port: MessagePort;
  dispose(): void;
};

/**
 * Create a MessagePort that bridges to a filesystem implementation.
 *
 * @param handlers - Object whose methods are served over the bridge.
 * @returns Handle with port and dispose function.
 * @public
 */
export function createBridgePort<T extends Record<string, unknown>>(handlers: T): BridgePort {
  const channel = new MessageChannel();
  const serverWrapped = wrapMessagePort<unknown>(channel.port1, { label: 'bridge-port-server' });
  if (serverWrapped.start) {
    serverWrapped.start();
  }
  createBridgeServer(handlers, serverWrapped);
  return {
    port: channel.port2,
    dispose() {
      safeDispose(() => {
        channel.port1.close();
      });
      safeDispose(() => {
        channel.port2.close();
      });
    },
  };
}

/**
 * Proxy-based filesystem client backed by a MessagePort bridge, with watch subscription and disposal support.
 * @public
 */
export type FileSystemProxy = RuntimeFileSystemBase & {
  watch(request: RuntimeWatchRequest, handler: (event: RuntimeWatchEvent) => void): () => void;
  dispose(): void;
};

/**
 * Create a low-level RPC call/listen/dispose triple backed by a MessagePort.
 *
 * @param port - RPC {@link Port} ({@link wrapMessagePort} wraps raw `MessagePort`s).
 * @param options - Optional shared file pool for zero-IPC cached reads.
 * @returns Object with call, listen, watch, and dispose methods.
 * @public
 */
export function createBridgeCall(
  port: Port<unknown>,
  options?: {
    /** Reader-side shared file pool. readFile calls check here before sending RPC. */
    filePool?: FilePool;
  },
): {
  call: (method: string, args: unknown[]) => Promise<unknown>;
  listen: (event: string, handler: (data: unknown) => void) => () => void;
  watch: (request: RuntimeWatchRequest, handler: (event: RuntimeWatchEvent) => void) => () => void;
  dispose: () => void;
} {
  const channelClient = createChannelClient({ port, sessionKey: 'fs' });

  const eventListeners = new Map<string, Set<(data: unknown) => void>>();
  const pendingCalls = new Set<{ reject: (error: Error) => void; ac: AbortController }>();
  const needsBroadcastForPool = options?.filePool?.invalidate !== undefined;
  let disposed = false;
  let broadcastAbort: AbortController | undefined;

  const dispatchBroadcastFrame = (eventName: string, eventData: unknown): void => {
    if (eventName === 'fileChanged' && options?.filePool?.invalidate) {
      const payload = eventData as { path?: string };
      if (typeof payload.path === 'string') {
        options.filePool.invalidate(payload.path);
      }
    }
    const handlers = eventListeners.get(eventName);
    if (!handlers) {
      return;
    }
    for (const handler of handlers) {
      try {
        handler(eventData);
      } catch (error) {
        console.error(`[BridgeCall] Event listener error for '${eventName}':`, error);
      }
    }
  };

  const ensureBroadcastSubscription = (): void => {
    if (broadcastAbort !== undefined || disposed) {
      return;
    }
    const abort = new AbortController();
    broadcastAbort = abort;
    // async-iife: bootstrap
    void (async (): Promise<void> => {
      try {
        for await (const raw of channelClient.listen(broadcastEvent, undefined, abort.signal)) {
          const frame = raw as BroadcastFrame;
          dispatchBroadcastFrame(frame.event, frame.data);
        }
      } catch {
        // Aborted on dispose: nothing to do.
      }
    })();
  };

  if (needsBroadcastForPool) {
    ensureBroadcastSubscription();
  }

  const dispose = (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    broadcastAbort?.abort();
    eventListeners.clear();
    for (const entry of pendingCalls) {
      entry.ac.abort();
      entry.reject(new Error('Bridge proxy closed'));
    }
    pendingCalls.clear();
    safeDispose(() => {
      channelClient.close();
    });
  };

  const callMethod = async (method: string, args: unknown[]): Promise<unknown> => {
    if (disposed) {
      throw new Error('Bridge proxy closed');
    }
    if (options?.filePool && method === 'readFile') {
      const filePath = args[0] as string;
      const encoding = args[1] as string | undefined;
      const cached = options.filePool.resolveCopy(filePath);
      if (cached) {
        return encoding === 'utf8' ? new TextDecoder().decode(cached) : new Uint8Array(cached);
      }
    }

    const callArgs = wrapAsTransferables(args);
    const ac = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let entry: { reject: (error: Error) => void; ac: AbortController } | undefined;
    try {
      return await new Promise<unknown>((resolve, reject) => {
        entry = { reject, ac };
        pendingCalls.add(entry);
        timer = setTimeout(() => {
          if (pendingCalls.delete(entry!)) {
            ac.abort();
            reject(new Error(`Bridge call '${method}' timed out`));
          }
        }, messagePortCallTimeout);
        channelClient
          .call(method, callArgs, ac.signal)
          .then((result) => {
            if (!pendingCalls.delete(entry!)) {
              return;
            }
            if (isBridgeErrorWire(result)) {
              reject(reconstructError(result.__bridgeError));
              return;
            }
            resolve(result);
          })
          .catch((error: unknown) => {
            if (!pendingCalls.delete(entry!)) {
              return;
            }
            reject(error instanceof Error ? error : new Error(String(error)));
          });
      });
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  };

  return {
    call: callMethod,
    listen(eventName, handler) {
      ensureBroadcastSubscription();
      let handlers = eventListeners.get(eventName);
      if (!handlers) {
        handlers = new Set();
        eventListeners.set(eventName, handlers);
      }
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
        if (handlers.size === 0) {
          eventListeners.delete(eventName);
        }
      };
    },
    watch(request, handler) {
      const ac = new AbortController();
      // async-iife: bootstrap
      void (async (): Promise<void> => {
        try {
          for await (const raw of channelClient.listen(watchEvent, { request }, ac.signal)) {
            handler(raw as RuntimeWatchEvent);
          }
        } catch {
          // Aborted via the returned unsubscribe; nothing to surface.
        }
      })();
      return () => {
        ac.abort();
      };
    },
    dispose,
  };
}

/**
 * Create a generic `Proxy`-based RPC client backed by a MessagePort.
 *
 * @param port - RPC {@link Port} ({@link wrapMessagePort} wraps raw `MessagePort`s).
 * @param options - Optional shared file pool for zero-IPC cached reads.
 * @returns Proxy that forwards method calls over the bridge.
 * @public
 */
export function createBridgeProxy<T extends Record<string, unknown>>(
  port: Port<unknown>,
  options?: {
    /** Reader-side shared file pool for zero-IPC cached reads. */
    filePool?: FilePool;
  },
): T & {
  dispose(): void;
  listen(event: string, handler: (data: unknown) => void): () => void;
  watch(request: RuntimeWatchRequest, handler: (event: RuntimeWatchEvent) => void): () => void;
} {
  const { call, listen, watch, dispose } = createBridgeCall(port, { filePool: options?.filePool });
  let isDisposed = false;

  const wrappedDispose = (): void => {
    isDisposed = true;
    dispose();
  };

  return new Proxy(
    {} as T & {
      dispose(): void;
      listen(event: string, handler: (data: unknown) => void): () => void;
      watch(request: RuntimeWatchRequest, handler: (event: RuntimeWatchEvent) => void): () => void;
    },
    {
      get(_, method: string | symbol) {
        if (method === 'dispose') {
          return wrappedDispose;
        }
        if (method === 'listen') {
          return listen;
        }
        if (method === 'watch') {
          return watch;
        }
        if (method === 'then' || method === 'toJSON' || typeof method === 'symbol') {
          return undefined;
        }
        if (isDisposed) {
          throw new Error(`Bridge proxy has been disposed — cannot call '${method}'`);
        }
        return async (...args: unknown[]) => call(method, args);
      },
    },
  );
}

/**
 * Buffer incoming messages on a MessagePort during initialization.
 *
 * @param port - MessagePort to buffer messages from.
 * @returns Flush function that replays buffered messages and removes the buffer.
 * @public
 */
export function catchMessages(port: MessagePort): () => void {
  const buffered: MessageEvent[] = [];
  const handler = (event: MessageEvent): void => {
    buffered.push(event);
  };

  port.addEventListener('message', handler);
  port.start();

  return () => {
    port.removeEventListener('message', handler);
    for (const event of buffered) {
      port.dispatchEvent(new MessageEvent('message', { data: event.data as unknown }));
    }
  };
}
