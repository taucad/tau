/**
 * Zod schemas for the WebSocket transport's client options.
 *
 * @internal
 */

import { z } from 'zod';
import type { WebSocketLike } from '@taucad/rpc';
import { isRuntimeFileSystem } from '#filesystem/runtime-filesystem.js';
import type { RuntimeFileSystem } from '#filesystem/runtime-filesystem.js';
import { resolveRuntimeFileSystem } from '#transport/_internal/runtime-filesystem-handle.js';

/**
 * A `bridged` handle (`fromFileSystemBridge`) would have to be opened on
 * the client side and re-served over the `/fs` socket — a `Port`-to-`Port`
 * relay with no consumer today, so the schema rejects it by name.
 */
const inlineRuntimeFileSystemSchema = z.custom<RuntimeFileSystem>(
  (value) => value === undefined || (isRuntimeFileSystem(value) && resolveRuntimeFileSystem(value).kind === 'inline'),
  {
    message:
      'webSocketTransport: `fileSystem` must be an inline handle (`fromNodeFs`, `fromMemoryFs`, `fromFsLike`). Add bridged-handle support when a consumer needs `fromFileSystemBridge` re-served over the `/fs` socket.',
  },
);

const createSocketSchema = z.custom<(url: string) => WebSocketLike>((value) => typeof value === 'function');

export const webSocketClientOptionsSchema = z
  .object({
    /**
     * Base URL of the runtime host, e.g. `ws://127.0.0.1:8080`. The
     * transport appends its own routes (`/runtime`, `/fs`) and a private
     * pairing id; a base carrying a path prefix is preserved.
     */
    url: z.union([z.string(), z.instanceof(URL)]),
    /**
     * Optional consumer-owned filesystem served to the remote kernel over a
     * second socket. Must be an inline handle produced by a `fromX` factory.
     */
    fileSystem: inlineRuntimeFileSystemSchema.optional(),
    /**
     * Override for socket construction — primary use is unit-test injection
     * of a fake socket pair. The transport owns socket construction on
     * purpose: a raw `{ socket }` option is Antipattern 5
     * (`docs/policy/library-api-policy.md`), and a socket handed in from
     * outside has already lost the server's hello frame.
     */
    createSocket: createSocketSchema.optional(),
  })
  .strict();

/** Consumer-facing options for `webSocketTransport`. @public */
export type WebSocketTransportOptions = z.input<typeof webSocketClientOptionsSchema>;
