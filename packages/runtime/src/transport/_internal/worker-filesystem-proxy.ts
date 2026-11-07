import { RootedFileSystemError, watchByChangeSets } from '@taucad/filesystem';
import type { WatchEvent, WatchRequest } from '@taucad/filesystem';
import { createFileSystemBridgeProxy, createTransferredFileSystemBridgeProxy } from '@taucad/fs-bridge';
import type { FileSystemBridge } from '@taucad/fs-bridge';
import type { MessagePortLike } from '@taucad/rpc';
import type { RuntimeFileSystemBase } from '#types/runtime-kernel.types.js';

/**
 * The worker-facing filesystem over a filesystem bridge port: rooted reads and
 * writes, and watches carried on the connection's event channel (D14), or in
 * the change-set form (D6) where the host serves none.
 *
 * @public
 */
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
 * @returns The filesystem, once the bridge hello says the host is ready.
 * @public
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
    /* Both forms ride the connection's one event channel (charter D14): every
     * watch a kernel holds reads its own events off each change set of the
     * root, so a fifty-file turn reaches this connection as one frame however
     * many dependency watches it holds. A host with no event channel answers
     * the authority-scoped change-set form, and one with neither the per-path
     * form (D6). */
    fileSystem.watchReady = (request, handler) => watchByChangeSets(bridge, request, handler);
    fileSystem.watch = (request, handler) => {
      const watch = watchByChangeSets(bridge, request, handler);
      const observeReady = async (): Promise<void> => {
        try {
          await watch.ready;
        } catch {
          /* The synchronous form cannot observe a registration failure. */
        }
      };
      // async-iife: bootstrap
      void observeReady();
      return watch.unsubscribe;
    };
  }
  /* A host that predates `hashFiles` does not advertise it; revalidation then reads bodies. */
  if (hello.hashable === true) {
    fileSystem.hashFiles = bridge.hashFiles.bind(bridge);
  }
  return fileSystem;
};
