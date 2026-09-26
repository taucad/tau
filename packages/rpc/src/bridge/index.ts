export type { MessagePortLike, Port } from '#port.js';

export type {
  BridgeCallOptions,
  BridgeProtocolSchemas,
  BridgeWatchEvent,
  BridgeWatchRequest,
  StringKeyedObject,
} from '#bridge/bridge-protocol.js';

export { extractTransferables } from '#bridge/transferables.js';

export type { BridgeError } from '#bridge/bridge-errors.js';

export { createBridgeServer } from '#bridge/bridge-server.js';
export type { BridgeServerHandle } from '#bridge/bridge-server.js';

export { createBridgePort } from '#bridge/bridge-port.js';
export type { BridgePort } from '#bridge/bridge-port.js';

export { createBridgeCall } from '#bridge/bridge-call.js';

export { catchMessages, createBridgeProxy } from '#bridge/bridge-proxy.js';
