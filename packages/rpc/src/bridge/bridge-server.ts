import { createChannelServer } from '#channel.js';
import type { WithTransferables } from '#channel.js';
import type { Port } from '#port.js';
import { broadcastEvent, serializeBridgeError, watchEvent, wrapAsTransferables } from '#bridge/bridge-internal.js';
import type { BroadcastFrame } from '#bridge/bridge-internal.js';
import type { BridgeWatchEvent, BridgeWatchRequest, StringKeyedObject } from '#bridge/bridge-protocol.js';
import { createPushQueue } from '#bridge/push-queue.js';
import type { PushQueue } from '#bridge/push-queue.js';

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
export function createBridgeServer<
  T extends StringKeyedObject,
  WatchRequestPayload = BridgeWatchRequest,
  WatchEventPayload = BridgeWatchEvent,
>(
  handlers: T,
  port: Port<unknown>,
  options?: {
    onDisconnect?: () => void;
    onWatch?: (watchId: string, request: WatchRequestPayload) => void;
    onUnwatch?: (watchId: string) => void;
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
    return wrapAsTransferables(await handlerFunction.call(handlers, ...args));
  };

  const channelServer = createChannelServer({
    port,
    sessionKey: 'bridge',
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
  ): AsyncGenerator<WatchEventPayload | WithTransferables<WatchEventPayload>> {
    const request = (listenArgs as { request?: WatchRequestPayload } | undefined)?.request;
    if (!request) {
      return;
    }
    const watchFunction = (handlers as Record<string, unknown>)['watch'] as
      | ((watchRequest: WatchRequestPayload, handler: (event: WatchEventPayload) => void) => () => void)
      | undefined;
    if (!watchFunction) {
      throw new Error('Bridge handlers do not implement watch()');
    }

    const watchId = `w_${watchIdCounter++}`;
    options?.onWatch?.(watchId, request);
    const queue = createPushQueue<WatchEventPayload>();
    const unsubscribe = watchFunction.call(handlers, request, (event: WatchEventPayload) => {
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
