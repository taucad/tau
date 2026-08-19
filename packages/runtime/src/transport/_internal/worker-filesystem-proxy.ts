import { RootedFileSystemError } from '@taucad/filesystem';
import type { WatchEvent, WatchRequest } from '@taucad/filesystem';
import { createFileSystemBridgeProxy, createTransferredFileSystemBridgeProxy } from '@taucad/fs-bridge';
import type { FileSystemBridge } from '@taucad/fs-bridge';
import type { MessagePortLike } from '@taucad/rpc';
import type { RuntimeFileSystemBase } from '#types/runtime-kernel.types.js';

export type WorkerFileSystemProxy = RuntimeFileSystemBase & {
  watchReady?(
    request: WatchRequest,
    handler: (event: WatchEvent) => void,
  ): { unsubscribe: () => void; ready: Promise<void>; closed: Promise<void> };
  dispose(): void;
};

/**
 * Upgrade a filesystem bridge into the worker-facing filesystem.
 *
 * @param source - Either a raw structured-clone `MessagePortLike` (worker
 * topologies) or an already-wired {@link FileSystemBridge} whose `port` is any
 * {@link Port} — a socket, for instance.
 */
export const createWorkerFileSystemProxy = async (
  source: MessagePortLike | FileSystemBridge,
): Promise<WorkerFileSystemProxy> => {
  const bridge =
    'port' in source ? createFileSystemBridgeProxy(source) : createTransferredFileSystemBridgeProxy(source);
  await bridge.ready;
  const hello = bridge.hello.payload;
  if (hello.state === 'unavailable') {
    bridge.dispose();
    throw new RootedFileSystemError(hello.error.code);
  }
  if (hello.state !== 'ready') {
    bridge.dispose();
    throw new Error('Runtime filesystem bridge requires a rooted filesystem');
  }
  const { capabilities, watchable } = hello;
  function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  function readFile(path: string, encoding: 'utf8'): Promise<string>;
  async function readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    return encoding === 'utf8' ? bridge.readFile(path, encoding) : bridge.readFile(path);
  }
  const fileSystem: WorkerFileSystemProxy = {
    id: 'runtime:filesystem-bridge',
    capabilities,
    dispose: bridge.dispose,
    readFile,
    writeFile: bridge.writeFile.bind(bridge),
    readdir: bridge.readdir.bind(bridge),
    stat: bridge.stat.bind(bridge),
    mkdir: bridge.mkdir.bind(bridge),
    unlink: bridge.unlink.bind(bridge),
    rmdir: bridge.rmdir.bind(bridge),
    rename: bridge.rename.bind(bridge),
    exists: bridge.exists.bind(bridge),
    lstat: bridge.lstat.bind(bridge),
  };
  if (watchable) {
    fileSystem.watch = bridge.watch;
    fileSystem.watchReady = bridge.watchReady;
  }
  return fileSystem;
};
