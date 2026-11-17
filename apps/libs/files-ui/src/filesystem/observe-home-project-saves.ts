import type { FileSystemBackend } from '@taucad/types';
import type { FileContentService } from '@taucad/fs-client/file-content-service';
import type { WorkerChangeChannel } from '@taucad/fs-client/worker-change-channel';
import { classify } from '@taucad/filesystem/path-registry';
import { requestHomeStoragePersistence } from '#filesystem/handle-store.js';

/**
 * Observe committed authored files in a mounted Home project, including editor
 * writes (whose bridge suppresses self-notifications) and agent/other-tab writes.
 * Reads, runtime caches and root-provider housekeeping are not meaningful saves.
 * @param input - The currently mounted project and its existing event owners.
 * @returns Remove both subscriptions when that project or backend changes.
 */
export function observeHomeProjectSaves(input: {
  projectId: string | undefined;
  backend: FileSystemBackend;
  contentService: Pick<FileContentService, 'onDidContentChange'>;
  channel: Pick<WorkerChangeChannel, 'onFileWritten'>;
}): () => void {
  if (!input.projectId || (input.backend !== 'opfs' && input.backend !== 'indexeddb')) {
    return () => undefined;
  }
  const isAuthored = (path: string): boolean => classify(path).versioned;
  const unsubscribeContent = input.contentService.onDidContentChange((event) => {
    if (
      (event.type === 'written' && isAuthored(event.path)) ||
      (event.type === 'batchWritten' && event.paths.some(isAuthored))
    ) {
      void requestHomeStoragePersistence();
    }
  });
  const unsubscribeChannel = input.channel.onFileWritten({
    interestedIn: isAuthored,
    handler: ({ backend }) => {
      if (backend === 'opfs' || backend === 'indexeddb') {
        void requestHomeStoragePersistence();
      }
    },
  });
  return () => {
    unsubscribeContent();
    unsubscribeChannel();
  };
}
