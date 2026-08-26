import { safeDispose } from '@taucad/utils/dispose';
import { wrapMessagePort } from '#port.js';
import { createBridgeServer } from '#bridge/bridge-server.js';
import type { BridgeProtocolSchemas, StringKeyedObject } from '#bridge/bridge-protocol.js';

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
  options?: { hello?: Hello; protocolSchemas?: BridgeProtocolSchemas<Hello> },
): BridgePort {
  const channel = new MessageChannel();
  const serverWrapped = wrapMessagePort<unknown>(channel.port1, { label: 'bridge-port-server' });
  if (serverWrapped.start) {
    serverWrapped.start();
  }
  createBridgeServer(handlers, serverWrapped, {
    hello: options?.hello,
    protocolSchemas: options?.protocolSchemas,
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
    },
  };
}
