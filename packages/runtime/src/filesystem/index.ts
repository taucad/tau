/**
 * Public filesystem surface (`@taucad/runtime/filesystem` subpath).
 *
 * Consumers compose an opaque {@link RuntimeFileSystem} via one of the
 * bundled `fromX` factories and hand it to a transport plugin. External
 * hosts open the bundled filesystem-specific bridge here; generic RPC
 * bridge primitives remain internal.
 */

// Public opaque `RuntimeFileSystem` and `fromX` factories.
export { fromMemoryFs, fromFsLike, fromFileSystemBridge, isRuntimeFileSystem } from '#filesystem/runtime-filesystem.js';
export type { FsLike, RuntimeFileSystem } from '#filesystem/runtime-filesystem.js';
export { fromBrowserFs } from '#filesystem/from-browser-fs.js';

export {
  createFileSystemBridge,
  createFileSystemBridgeProxy,
  exposeFileSystem,
  openFileSystemBridge,
} from '@taucad/fs-bridge';
export type {
  ExposeFileSystemHandle,
  FileSystemBridge,
  FileSystemBridgeConnection,
  FileSystemBridgeOptions,
} from '@taucad/fs-bridge';
export type { BridgePort, BridgeServerHandle } from '@taucad/rpc/bridge';

export { runtimeFileSystemSchema } from '#filesystem/runtime-filesystem.schemas.js';
