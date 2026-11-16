import { randomUuid } from '@taucad/utils/id';

type SyncAccessCapableFileHandle = FileSystemFileHandle & {
  createSyncAccessHandle?: () => Promise<{ close(): void }>;
};

const probeFileName = `.tau-opfs-probe-${randomUuid()}`;

globalThis.addEventListener('message', () => {
  // async-iife: bootstrap
  void (async () => {
    let supported = false;
    let root: FileSystemDirectoryHandle | undefined;
    try {
      root = await navigator.storage.getDirectory();
      const file = (await root.getFileHandle(probeFileName, { create: true })) as SyncAccessCapableFileHandle;
      if (typeof file.createSyncAccessHandle === 'function') {
        const access = await file.createSyncAccessHandle();
        access.close();
        supported = true;
      }
    } catch {
      supported = false;
    }
    try {
      await root?.removeEntry(probeFileName);
    } catch {
      // A failed best-effort cleanup does not change the capability result.
    }
    globalThis.postMessage(supported);
  })();
});
