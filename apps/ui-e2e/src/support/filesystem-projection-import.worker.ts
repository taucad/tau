/** Dedicated pre-discovery fixture authority; all bytes still pass through the production rooted filesystem. */
import { exposeFileSystem, workerReadyMessageType, workspaceBridgeService } from '@taucad/fs-bridge';
import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import { withReadContentOps } from '@taucad/filesystem/content-ops';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';

// The constructor name carries the actual persisted namespace before the first standard bridge connection.
const databasePrefix = self.name;
if (!databasePrefix || typeof document !== 'undefined') {
  throw new Error('Projection import requires a dedicated worker with its explicit database namespace.');
}
const eventBus = new ChangeEventBus();
const service = new WorkspaceFileService({
  providerRegistry: new ProviderRegistry({ databasePrefix }),
  mountTable: new MountTable(),
  resourceQueue: new ResourceQueue(),
  eventBus,
  policy: tauPathPolicy,
});
let exposure: ReturnType<typeof exposeFileSystem> | undefined;
const dispose = () => {
  exposure?.cleanup();
  exposure = undefined;
  service.dispose();
};
try {
  exposure = exposeFileSystem(workspaceBridgeService(service), {
    handlerForRoot: (root, context, consumer) => {
      if (consumer !== 'working-copy') {
        throw new Error('Projection import serves only its explicit rooted working-copy connection.');
      }
      return withReadContentOps(service.createRootedFileSystem(root, context), tauPathPolicy);
    },
    policy: tauPathPolicy,
    changeEventBus: eventBus,
  });
  // Failures invalidate existing channels; the owner also terminates the worker in its import finally.
  self.addEventListener('error', dispose);
  self.addEventListener('messageerror', dispose);
  self.addEventListener('unhandledrejection', dispose);
  self.postMessage({ type: workerReadyMessageType });
} catch (error) {
  dispose();
  throw error;
}
