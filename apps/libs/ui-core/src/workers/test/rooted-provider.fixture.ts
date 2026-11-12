/** A watch-capable project root over the browser suites' real provider. */
import { afterEach } from 'vitest';
import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import type { FileSystemProvider, RootedFileSystem } from '@taucad/filesystem';
import { assertRootedPath } from '@taucad/utils/path';
import { randomUuid } from '@taucad/utils/id';

const authorities = new Map<
  FileSystemProvider,
  { service: WorkspaceFileService; mounts: MountTable; storageRootKey: string }
>();

afterEach(() => {
  for (const authority of authorities.values()) {
    authority.service.dispose();
  }
  authorities.clear();
});

/** Share mutation and watch ownership across every bridge to the same provider. */
export const rootedProvider = (source: FileSystemProvider, root: string): RootedFileSystem => {
  const backend = source.id;
  if (backend !== 'indexeddb' && backend !== 'opfs' && backend !== 'memory') {
    throw new Error(`Unsupported browser fixture provider: ${backend}`);
  }
  let authority = authorities.get(source);
  if (authority === undefined) {
    const mountTable = new MountTable();
    const service = new WorkspaceFileService({
      // The caller owns the supplied provider; this empty registry owns no provider to dispose.
      providerRegistry: new ProviderRegistry(),
      resourceQueue: new ResourceQueue(),
      eventBus: new ChangeEventBus(),
      mountTable,
    });
    authority = { service, mounts: mountTable, storageRootKey: `${backend}:${randomUuid()}` };
    authorities.set(source, authority);
  }
  const providerBasePath = assertRootedPath(root);
  const authorityRoot = `/${providerBasePath}`;
  if (authority.mounts.getExactMount(authorityRoot) === undefined) {
    authority.mounts.mount(authorityRoot, source, {
      class: 'authored',
      backend,
      storageRootKey: authority.storageRootKey,
      providerBasePath,
    });
  }
  return authority.service.createRootedFileSystem(authorityRoot);
};
