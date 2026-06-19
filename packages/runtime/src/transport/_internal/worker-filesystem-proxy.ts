import type { WatchEvent, WatchRequest } from '@taucad/filesystem';
import { createFileSystemBridgeProxy } from '@taucad/fs-bridge';
import type { FileSystemBridgeFilePool } from '@taucad/fs-bridge';
import type { RuntimeFileSystemBase } from '#types/runtime-kernel.types.js';

export type WorkerFileSystemProxy = RuntimeFileSystemBase & {
  watch(request: WatchRequest, handler: (event: WatchEvent) => void): () => void;
  dispose(): void;
};

export const createWorkerFileSystemProxy = (
  port: MessagePort,
  options?: {
    filePool?: FileSystemBridgeFilePool;
  },
): WorkerFileSystemProxy =>
  createFileSystemBridgeProxy<RuntimeFileSystemBase>(
    {
      port,
      dispose() {
        port.close();
      },
    },
    {
      filePool: options?.filePool,
    },
  );
