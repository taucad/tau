import { RootedFileSystemError } from '@taucad/filesystem';
import type { WatchEvent, WatchRequest } from '@taucad/filesystem';
import { createTransferredFileSystemBridgeProxy } from '@taucad/fs-bridge';
import type { RuntimeFileSystemBase } from '#types/runtime-kernel.types.js';

export type WorkerFileSystemProxy = RuntimeFileSystemBase & {
  watchReady?(
    request: WatchRequest,
    handler: (event: WatchEvent) => void,
  ): { unsubscribe: () => void; ready: Promise<void>; closed: Promise<void> };
  dispose(): void;
};

export const createWorkerFileSystemProxy = async (port: MessagePort): Promise<WorkerFileSystemProxy> => {
  const bridge = createTransferredFileSystemBridgeProxy(port);
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
