import { safeDispose } from '#topic.js';
import { wrapMessagePort } from '#port.js';
import { createBridgeServer } from '#bridge/bridge-server.js';
import type { BridgeProtocolSchemas, BridgeServerLongCall, StringKeyedObject } from '#bridge/bridge-protocol.js';

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
 * Create a MessagePort that bridges to an object implementation.
 *
 * @param handlers - Object whose methods are served over the bridge.
 * @param options - Optional channel hello payload.
 * @returns Handle with port and dispose function.
 * @public
 */
export function createBridgePort<T extends StringKeyedObject, Hello = unknown>(
  handlers: T,
  options?: {
    hello?: Hello;
    protocolSchemas?: BridgeProtocolSchemas<Hello>;
    bindLongCall?: (method: string, args: unknown[], longCall: BridgeServerLongCall) => unknown[];
  },
): BridgePort {
  const channel = new MessageChannel();
  const serverWrapped = wrapMessagePort<unknown>(channel.port1, { label: 'bridge-port-server' });
  if (serverWrapped.start) {
    serverWrapped.start();
  }
  const server = createBridgeServer(handlers, serverWrapped, {
    hello: options?.hello,
    protocolSchemas: options?.protocolSchemas,
    ...(options?.bindLongCall === undefined ? {} : { bindLongCall: options.bindLongCall }),
  });
  return {
    port: channel.port2,
    dispose() {
      safeDispose(() => {
        channel.port1.close();
      });
      safeDispose(() => {
        channel.port2.close();
      });
      /* Then release what the server holds (its watches): a browser fires no `close` event on a port its own
       * realm closed, so waiting for one would keep every watch registered for the authority's lifetime. The
       * ports are closed first, so the peer still learns of the closure from its port, not a hard-close frame. */
      safeDispose(() => {
        server.dispose();
      });
    },
  };
}
