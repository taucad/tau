import { Topic } from '@taucad/events';
import { safeDispose } from '@taucad/utils/dispose';
import { createChannelClient } from '#channel.js';
import type { Port } from '#port.js';
import {
  broadcastEvent,
  isBridgeWatchReadyFrame,
  isBridgeErrorWire,
  messagePortCallTimeout,
  reconstructError,
  watchEvent,
  wrapAsTransferables,
} from '#bridge/bridge-internal.js';
import type { BroadcastFrame } from '#bridge/bridge-internal.js';
import type { BridgeCallOptions, BridgeWatchEvent, BridgeWatchRequest } from '#bridge/bridge-protocol.js';
import { createBridgeChannelSchemas } from '#bridge/bridge-schemas.js';
import type { BridgeRpcProtocol } from '#bridge/bridge-schemas.js';

/**
 * Create a low-level RPC call/listen/dispose triple backed by a MessagePort.
 *
 * @param port - RPC {@link Port} ({@link wrapMessagePort} wraps raw `MessagePort`s).
 * @param options - Optional call-argument and timeout hooks.
 * @returns Object with call, listen, watch, and dispose methods.
 * @public
 */
export function createBridgeCall<
  WatchRequestPayload = BridgeWatchRequest,
  WatchEventPayload = BridgeWatchEvent,
  HelloPayload = unknown,
>(
  port: Port<unknown>,
  options?: BridgeCallOptions<HelloPayload, WatchRequestPayload, WatchEventPayload>,
): {
  call: (method: string, args: unknown[]) => Promise<unknown>;
  listen: (event: string, handler: (data: unknown) => void) => () => void;
  watch: (request: WatchRequestPayload, handler: (event: WatchEventPayload) => void) => () => void;
  watchReady: (
    request: WatchRequestPayload,
    handler: (event: WatchEventPayload) => void,
  ) => { unsubscribe: () => void; ready: Promise<void>; closed: Promise<void> };
  ready: Promise<void>;
  hello: { readonly payload: HelloPayload };
  dispose: () => void;
} {
  const channelClient = createChannelClient<BridgeRpcProtocol<HelloPayload>>({
    port,
    sessionKey: 'bridge',
    protocolSchemas: createBridgeChannelSchemas(options?.protocolSchemas),
  });

  const eventTopics = new Map<string, Topic<unknown>>();
  const pendingCalls = new Set<{ reject: (error: Error) => void; ac: AbortController }>();
  const backgroundTasks = new Set<Promise<void>>();
  let disposed = false;
  let broadcastAbort: AbortController | undefined;

  const observeBackgroundTask = async (task: Promise<void>): Promise<void> => {
    try {
      await task;
    } finally {
      backgroundTasks.delete(task);
    }
  };

  const trackBackgroundTask = (task: Promise<void>): void => {
    backgroundTasks.add(task);
    void observeBackgroundTask(task);
  };

  const dispatchBroadcastFrame = (eventName: string, eventData: unknown): void => {
    eventTopics.get(eventName)?.emit(eventData);
  };

  const consumeBroadcastEvents = async (abort: AbortController): Promise<void> => {
    try {
      for await (const raw of channelClient.listen(broadcastEvent, undefined, abort.signal)) {
        const frame = raw as BroadcastFrame;
        dispatchBroadcastFrame(frame.event, frame.data);
      }
    } catch {
      // Aborted on dispose: nothing to do.
    }
  };

  const ensureBroadcastSubscription = (): void => {
    if (broadcastAbort !== undefined || disposed) {
      return;
    }
    const abort = new AbortController();
    broadcastAbort = abort;
    trackBackgroundTask(consumeBroadcastEvents(abort));
  };

  const dispose = (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    broadcastAbort?.abort();
    for (const topic of eventTopics.values()) {
      topic.dispose();
    }
    eventTopics.clear();
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
    const resolvedTimeout = options?.resolveCallTimeout?.(method);
    const callTimeout = resolvedTimeout ?? messagePortCallTimeout;
    if (callTimeout !== 'none' && (!Number.isFinite(callTimeout) || callTimeout < 0)) {
      throw new RangeError(
        `Bridge call timeout must be a finite non-negative number or 'none': ${String(callTimeout)}`,
      );
    }
    const ac = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let entry: { reject: (error: Error) => void; ac: AbortController } | undefined;
    try {
      return await new Promise<unknown>((resolve, reject) => {
        entry = { reject, ac };
        pendingCalls.add(entry);
        if (callTimeout !== 'none') {
          timer = setTimeout(() => {
            if (pendingCalls.delete(entry!)) {
              ac.abort();
              reject(new Error(`Bridge call '${method}' timed out`));
            }
          }, callTimeout);
        }
        const settleCall = async (): Promise<void> => {
          try {
            const result = await channelClient.call(method, callArgs, ac.signal);
            if (!pendingCalls.delete(entry!)) {
              return;
            }
            if (isBridgeErrorWire(result)) {
              reject(reconstructError(result.__bridgeError));
              return;
            }
            resolve(result);
          } catch (error) {
            if (!pendingCalls.delete(entry!)) {
              return;
            }
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        };
        trackBackgroundTask(settleCall());
      });
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  };

  const startWatch = (
    request: WatchRequestPayload,
    handler: (event: WatchEventPayload) => void,
  ): { unsubscribe: () => void; ready: Promise<void>; closed: Promise<void> } => {
    const ac = new AbortController();
    let resolveReady!: () => void;
    let rejectReady!: (error: Error) => void;
    let settled = false;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    let resolveClosed!: () => void;
    let rejectClosed!: (error: Error) => void;
    const closed = new Promise<void>((resolve, reject) => {
      resolveClosed = resolve;
      rejectClosed = reject;
    });
    const ignoreClosedFailure = async (): Promise<void> => {
      try {
        await closed;
      } catch {
        // The caller may observe this failure through the public `closed` promise.
      }
    };
    trackBackgroundTask(ignoreClosedFailure());
    const consumeWatchEvents = async (): Promise<void> => {
      try {
        for await (const raw of channelClient.listen(watchEvent, { request }, ac.signal)) {
          if (isBridgeWatchReadyFrame(raw)) {
            if (!settled) {
              settled = true;
              resolveReady();
            }
            continue;
          }
          handler(raw as WatchEventPayload);
        }
        if (!settled) {
          settled = true;
          rejectReady(new Error('Bridge watch closed before registration'));
        }
        resolveClosed();
      } catch (error) {
        const watchError = error instanceof Error ? error : new Error(String(error));
        if (!settled) {
          settled = true;
          rejectReady(watchError);
        }
        rejectClosed(watchError);
      }
    };
    trackBackgroundTask(consumeWatchEvents());
    return {
      unsubscribe() {
        ac.abort();
      },
      ready,
      closed,
    };
  };

  return {
    call: callMethod,
    listen(eventName, handler) {
      ensureBroadcastSubscription();
      const topic =
        eventTopics.get(eventName) ??
        new Topic<unknown>({
          name: `bridge:${eventName}`,
          onError: (error) => {
            console.error(`[BridgeCall] Event listener error for '${eventName}':`, error);
          },
        });
      eventTopics.set(eventName, topic);
      const unsubscribe = topic.subscribe(handler);
      return () => {
        unsubscribe();
        if (topic.size === 0) {
          topic.dispose();
          eventTopics.delete(eventName);
        }
      };
    },
    watch(request, handler) {
      const handle = startWatch(request, handler);
      const ignoreReadyFailure = async (): Promise<void> => {
        try {
          await handle.ready;
        } catch {
          // Legacy watch callers cannot observe registration failure.
        }
      };
      trackBackgroundTask(ignoreReadyFailure());
      return handle.unsubscribe;
    },
    watchReady: startWatch,
    ready: channelClient.ready,
    hello: channelClient.hello,
    dispose,
  };
}
