/* oxlint-disable no-barrel-files/no-barrel-files -- public topology subpath barrel */

/**
 * Remote transport entry — `@taucad/runtime/transport/websocket`.
 *
 * Hosts {@link webSocketTransport}, the client half of the WebSocket
 * topology: the kernel runs in another process (or on another machine)
 * behind {@link webSocketHost}, and this subpath dials it. Browser-safe by
 * construction — it uses the global `WebSocket` and only falls back to the
 * `ws` package through a bundler-opaque dynamic import, so no Node builtin
 * ever reaches a browser graph.
 *
 * The Node-only server half ships at
 * `@taucad/runtime/transport/websocket-host`, mirroring the
 * `/transport/web` ↔ `/transport/node` split: every concrete transport
 * signals its topology at import time, and the universal
 * `@taucad/runtime/transport` barrel stays author-API only.
 *
 * @public
 */

export { webSocketTransport } from '#transport/web-socket-transport.js';
export { webSocketClient, webSocketClientDescribe } from '#transport/web-socket-client.js';
export type { WebSocketTransportOptions } from '#transport/web-socket-transport.schemas.js';
