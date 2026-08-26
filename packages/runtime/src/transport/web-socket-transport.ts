/* oxlint-disable no-barrel-files/no-barrel-files -- composition file: re-exports topology types from sibling files */

/**
 * Bundled WebSocket transport — composition file.
 *
 * Hosts the kernel in another process (or another machine) behind a
 * {@link webSocketHost}. Same client contract as the worker transports,
 * with `copy` geometry delivery and `wire-notify` aborts because a socket
 * carries neither transferables nor `SharedArrayBuffer`.
 *
 * Importable only from the browser-safe subpath
 * `@taucad/runtime/transport/websocket`; the host lives at
 * `@taucad/runtime/transport/websocket-host` so `ws` never reaches a
 * browser graph.
 *
 * Remote hosts are bound to the same build: the wire hello carries
 * `protocolVersion` and a mismatch is rejected at connect
 * (`TransportProtocolVersionError`). A cross-version compatibility matrix
 * is the add-when.
 *
 * @public
 *
 * @example <caption>Render against a remote kernel host</caption>
 * ```typescript
 * import type { AnyRuntimeDefinition } from '@taucad/runtime/worker';
 * import { createRuntimeClient } from '@taucad/runtime';
 * import { webSocketTransport } from '@taucad/runtime/transport/websocket';
 *
 * declare const runtime: AnyRuntimeDefinition;
 *
 * const client = createRuntimeClient<typeof runtime>({
 *   transport: webSocketTransport({ url: 'ws://127.0.0.1:8080' }),
 * });
 * ```
 *
 * @example <caption>Serve the consumer's own filesystem to the remote kernel</caption>
 * ```typescript
 * import { createRuntimeClient } from '@taucad/runtime';
 * import { fromMemoryFs } from '@taucad/runtime/filesystem';
 * import { webSocketTransport } from '@taucad/runtime/transport/websocket';
 *
 * const client = createRuntimeClient({
 *   transport: webSocketTransport({
 *     url: 'ws://127.0.0.1:8080',
 *     fileSystem: fromMemoryFs({ '/main.ts': 'export default () => true;' }),
 *   }),
 * });
 * ```
 */

import { defineRuntimeTransport } from '#transport/define-runtime-transport.js';
import { webSocketClient } from '#transport/web-socket-client.js';
import { webSocketClientOptionsSchema } from '#transport/web-socket-transport.schemas.js';
import { webSocketId } from '#transport/_internal/web-socket-wire.js';

export type { WebSocketTransportOptions } from '#transport/web-socket-transport.schemas.js';

/**
 * Bundled WebSocket client transport plugin (`webSocketTransport`).
 *
 * @public
 */
export const webSocketTransport = defineRuntimeTransport({
  id: webSocketId,
  clientOptionsSchema: webSocketClientOptionsSchema,
  client: webSocketClient,
});
