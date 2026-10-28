import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import { createMemoryProvider } from '@taucad/filesystem/backend';
import { createIsomorphicGitRevisionPort } from '@taucad/revisions';
import {
  createCheckoutRoutes,
  createWorkerRevisionRegistry,
  versionedChangePaths,
} from '#machines/file-manager.worker.revisions.js';

// Same browser revision root and Git adapter as the file manager, with an isolated in-memory authority.
// No project, credentials or filesystem capability from the application is handed to this worker.
const provider = await createMemoryProvider();
const mountTable = new MountTable();
const eventBus = new ChangeEventBus();
const service = new WorkspaceFileService({
  providerRegistry: new ProviderRegistry(),
  resourceQueue: new ResourceQueue(),
  eventBus,
  mountTable,
});
const registry = createWorkerRevisionRegistry({
  createPort: async (projectId) =>
    createIsomorphicGitRevisionPort({
      filesystem: service.createRootedFileSystem(`/projects/${projectId}`),
      checkouts: createCheckoutRoutes({ mountTable, fileService: service })(projectId),
    }),
  filesystem: (root) => service.createRootedFileSystem(root),
  completeChanges: true,
  observe: (root, onChanged) =>
    eventBus.subscribe((event) => {
      const paths = versionedChangePaths(event, root);
      if (paths.length > 0) {
        onChanged(paths);
      }
    }),
});
globalThis.addEventListener('message', ({ data }: MessageEvent<unknown>) => {
  if (
    typeof data !== 'object' ||
    data === null ||
    !('type' in data) ||
    data.type !== 'revisionsConnect' ||
    !('projectId' in data) ||
    typeof data.projectId !== 'string' ||
    !data.projectId.startsWith('observability-') ||
    !('port' in data) ||
    !(data.port instanceof MessagePort)
  ) {
    return;
  }
  mountTable.mount(`/projects/${data.projectId}`, provider, {
    class: 'authored',
    backend: 'memory',
    storageRootKey: `memory:${data.projectId}`,
  });
  registry.connect(data.port, data.projectId);
});
