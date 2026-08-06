/**
 * Public filesystem surface (`@taucad/runtime/filesystem` subpath).
 *
 * Consumers compose an opaque {@link RuntimeFileSystem} via one of the
 * bundled `fromX` factories and hand it to a transport plugin. Bridge
 * primitives live in `@taucad/rpc/bridge` and `@taucad/fs-bridge`;
 * ordinary runtime consumers only pass opaque runtime filesystem values
 * to transports.
 */

// Public opaque `RuntimeFileSystem` and `fromX` factories.
export { fromMemoryFs, fromFsLike, fromFileSystemBridge, isRuntimeFileSystem } from '#filesystem/runtime-filesystem.js';
export type { FsLike, RuntimeFileSystem } from '#filesystem/runtime-filesystem.js';
export { fromBrowserFs } from '#filesystem/from-browser-fs.js';

export { runtimeFileSystemSchema } from '#filesystem/runtime-filesystem.schemas.js';
