import { safeDispose } from '@taucad/utils/dispose';
import { createChannelClient } from '#channel.js';
import type { Port } from '#port.js';
import {
  broadcastEvent,
  isBridgeErrorWire,
  messagePortCallTimeout,
  reconstructError,
  watchEvent,
  wrapAsTransferables,
} from '#bridge/bridge-internal.js';
import type { BroadcastFrame } from '#bridge/bridge-internal.js';
import type { BridgeCallOptions, BridgeWatchEvent, BridgeWatchRequest } from '#bridge/bridge-protocol.js';

/**
 * Create a low-level RPC call/listen/dispose triple backed by a MessagePort.
 *
 * @param port - RPC {@link Port} ({@link wrapMessagePort} wraps raw `MessagePort`s).
 * @param options - Optional shared file pool for zero-IPC cached reads.
 * @returns Object with call, listen, watch, and dispose methods.
 * @public
 */
export function createBridgeCall<WatchRequestPayload = BridgeWatchRequest, WatchEventPayload = BridgeWatchEvent>(
  port: Port<unknown>,
  options?: BridgeCallOptions,
): {
  call: (method: string, args: unknown[]) => Promise<unknown>;
  listen: (event: string, handler: (data: unknown) => void) => () => void;
  watch: (request: WatchRequestPayload, handler: (event: WatchEventPayload) => void) => () => void;
  dispose: () => void;
} {
  const channelClient = createChannelClient({ port, sessionKey: 'bridge' });

  const eventListeners = new Map<string, Set<(data: unknown) => void>>();
  const pendingCalls = new Set<{ reject: (error: Error) => void; ac: AbortController }>();
  let disposed = false;
  let broadcastAbort: AbortController | undefined;

  const dispatchBroadcastFrame = (eventName: string, eventData: unknown): void => {
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

    const preparedArgs = options?.prepareCallArgs ? options.prepareCallArgs(method, args) : args;
    const callArgs = wrapAsTransferables(preparedArgs);
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
            handler(raw as WatchEventPayload);
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
