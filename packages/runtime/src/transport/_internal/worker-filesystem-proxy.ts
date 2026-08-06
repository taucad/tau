import type { ProviderCapabilities, WatchEvent, WatchRequest } from '@taucad/filesystem';
import { createFileSystemBridgeProxy } from '@taucad/fs-bridge';
import type { RuntimeFileSystemBase } from '#types/runtime-kernel.types.js';

export type WorkerFileSystemProxy = RuntimeFileSystemBase & {
  watchReady?(
    request: WatchRequest,
    handler: (event: WatchEvent) => void,
  ): { unsubscribe: () => void; ready: Promise<void> };
  dispose(): void;
};

type FileSystemBridgeHello = {
  capabilities: ProviderCapabilities;
  watchable: boolean;
};

const isFileSystemBridgeHello = (value: unknown): value is FileSystemBridgeHello => {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  const { capabilities } = record;
  return (
    typeof record['watchable'] === 'boolean' &&
    capabilities !== null &&
    typeof capabilities === 'object' &&
    typeof (capabilities as Record<string, unknown>)['persistent'] === 'boolean' &&
    typeof (capabilities as Record<string, unknown>)['writable'] === 'boolean' &&
    typeof (capabilities as Record<string, unknown>)['quotaBased'] === 'boolean'
  );
};

export const createWorkerFileSystemProxy = async (port: MessagePort): Promise<WorkerFileSystemProxy> => {
  const bridge = createFileSystemBridgeProxy<RuntimeFileSystemBase>({
    port,
    dispose() {
      port.close();
    },
  });
  await bridge.ready;
  if (!isFileSystemBridgeHello(bridge.hello.payload)) {
    bridge.dispose();
    throw new Error('Filesystem bridge did not provide valid capabilities');
  }
  const { capabilities, watchable } = bridge.hello.payload;
  const fileSystem: WorkerFileSystemProxy = {
    id: 'runtime:filesystem-bridge',
    capabilities,
    dispose: bridge.dispose,
    readFile: bridge.readFile.bind(bridge),
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
