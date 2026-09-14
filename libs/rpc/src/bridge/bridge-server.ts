import { createChannelServer } from '#channel.js';
import type { WithTransferables } from '#channel.js';
import type { Port } from '#port.js';
import {
  bridgeWatchReadyMarker,
  broadcastEvent,
  serializeBridgeError,
  watchEvent,
  wrapAsTransferables,
} from '#bridge/bridge-internal.js';
import type { BroadcastFrame } from '#bridge/bridge-internal.js';
import type {
  BridgeProtocolSchemas,
  BridgeWatchEvent,
  BridgeWatchRequest,
  StringKeyedObject,
} from '#bridge/bridge-protocol.js';
import { createBridgeChannelSchemas } from '#bridge/bridge-schemas.js';
import type { BridgeRpcProtocol } from '#bridge/bridge-schemas.js';
import { createPushQueue } from '#bridge/push-queue.js';
import type { PushQueue } from '#bridge/push-queue.js';

/**
 * Handle returned by {@link createBridgeServer}, providing an event emitter
 * for server-to-client push messages.
 * @public
 */
export type BridgeServerHandle = {
  emit: (event: string, data: unknown) => void;
  dispose(): void;
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
export function createBridgeServer<
  T extends StringKeyedObject,
  WatchRequestPayload = BridgeWatchRequest,
  WatchEventPayload = BridgeWatchEvent,
  HelloPayload = unknown,
>(
  handlers: T,
  port: Port<unknown>,
  options?: {
    onDisconnect?: () => void;
    onWatch?: (watchId: string, request: WatchRequestPayload) => void;
    onUnwatch?: (watchId: string) => void;
    hello?: HelloPayload;
    protocolSchemas?: BridgeProtocolSchemas<HelloPayload, WatchRequestPayload, WatchEventPayload>;
  },
): BridgeServerHandle {
  const broadcastQueues = new Set<PushQueue<BroadcastFrame>>();
  const broadcastBuffer: BroadcastFrame[] = [];
  const broadcastBufferLimit = 32;
  const watchRegistrations = new Map<string, { cancel(): void; isCancelled(): boolean }>();
  let watchIdCounter = 0;

  const dispatchHandler = async (name: string, args: unknown[]): Promise<unknown> => {
    const handlerFunction = (handlers as Record<string, unknown>)[name] as
      | ((...functionArguments: unknown[]) => Promise<unknown>)
      | undefined;
    if (!handlerFunction) {
      throw new Error(`Unknown method: ${name}`);
    }
    return wrapAsTransferables(await handlerFunction.call(handlers, ...args));
  };

  const channelServer = createChannelServer<BridgeRpcProtocol>({
    port,
    sessionKey: 'bridge',
    hello: options?.hello,
    protocolSchemas: createBridgeChannelSchemas(options?.protocolSchemas),
    impl: {
      call: async (_context, name, args) => {
        try {
          const argumentList = Array.isArray(args) ? args : [];
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
  ): AsyncGenerator<WatchEventPayload | WithTransferables<WatchEventPayload> | { __tauBridgeWatchReady: true }> {
    const request = (listenArgs as { request?: WatchRequestPayload } | undefined)?.request;
    if (!request) {
      return;
    }
    const watchFunction = (handlers as Record<string, unknown>)['watch'] as
      | ((
          watchRequest: WatchRequestPayload,
          handler: (event: WatchEventPayload) => void,
        ) => (() => void) | Promise<() => void>)
      | undefined;
    if (!watchFunction) {
      throw new Error('Bridge handlers do not implement watch()');
    }

    const watchId = `w_${watchIdCounter++}`;
    const queue = createPushQueue<WatchEventPayload>();
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    let unwatchNotified = false;
    const registration = {
      isCancelled(): boolean {
        return cancelled;
      },
      cancel(): void {
        if (cancelled) {
          return;
        }
        cancelled = true;
        if (watchRegistrations.get(watchId) === registration) {
          watchRegistrations.delete(watchId);
        }
        const settledUnsubscribe = unsubscribe;
        unsubscribe = undefined;
        try {
          settledUnsubscribe?.();
        } catch {
          // A failing disposer must not escape an AbortSignal listener.
        } finally {
          try {
            if (!unwatchNotified) {
              unwatchNotified = true;
              options?.onUnwatch?.(watchId);
            }
          } catch {
            // Observer cleanup cannot retain the watch queue.
          } finally {
            queue.close();
          }
        }
      },
    };
    watchRegistrations.set(watchId, registration);
    const cleanup = (): void => {
      registration.cancel();
    };
    if (signal) {
      if (signal.aborted) {
        cleanup();
      } else {
        signal.addEventListener('abort', cleanup, { once: true });
      }
    }
    if (registration.isCancelled()) {
      return;
    }

    try {
      options?.onWatch?.(watchId, request);
      const settledUnsubscribe = await watchFunction.call(handlers, request, (event: WatchEventPayload) => {
        if (!registration.isCancelled()) {
          queue.push(event);
        }
      });
      if (registration.isCancelled()) {
        settledUnsubscribe();
        return;
      }
      unsubscribe = settledUnsubscribe;
      yield { [bridgeWatchReadyMarker]: true };
      for await (const event of queue.iterable) {
        yield wrapAsTransferables<WatchEventPayload>(event);
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
    try {
      options?.onDisconnect?.();
    } catch {
      // A disconnect observer cannot prevent owned bridge cleanup.
    }
    for (const queue of broadcastQueues) {
      queue.close();
    }
    broadcastQueues.clear();
    for (const registration of watchRegistrations.values()) {
      try {
        registration.cancel();
      } catch {
        // One failing disposer must not retain the remaining registrations.
      }
    }
    watchRegistrations.clear();
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

  return {
    emit,
    dispose() {
      channelServer.dispose('hard-close');
    },
  };
}
