import type { Port } from '#port.js';
import { createBridgeCall } from '#bridge/bridge-call.js';
import type { BridgeCallOptions, BridgeWatchEvent, BridgeWatchRequest } from '#bridge/bridge-protocol.js';

/**
 * Create a generic `Proxy`-based RPC client backed by a MessagePort.
 *
 * @param port - RPC {@link Port} ({@link wrapMessagePort} wraps raw `MessagePort`s).
 * @param options - Optional call-argument and timeout hooks.
 * @returns Proxy that forwards method calls over the bridge.
 * @public
 */
export function createBridgeProxy<
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- proxy target types may be class/interface services without string index signatures.
  T extends object,
  WatchRequestPayload = BridgeWatchRequest,
  WatchEventPayload = BridgeWatchEvent,
>(
  port: Port<unknown>,
  options?: BridgeCallOptions,
): T & {
  dispose(): void;
  listen(event: string, handler: (data: unknown) => void): () => void;
  watch(request: WatchRequestPayload, handler: (event: WatchEventPayload) => void): () => void;
} {
  const { call, listen, watch, dispose } = createBridgeCall<WatchRequestPayload, WatchEventPayload>(port, options);
  let isDisposed = false;

  const wrappedDispose = (): void => {
    isDisposed = true;
    dispose();
  };

  return new Proxy(
    {} as T & {
      dispose(): void;
      listen(event: string, handler: (data: unknown) => void): () => void;
      watch(request: WatchRequestPayload, handler: (event: WatchEventPayload) => void): () => void;
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
