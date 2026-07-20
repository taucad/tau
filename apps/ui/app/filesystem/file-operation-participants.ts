/**
 * @fileoverview File-operation participants.
 *
 * Subscribes to {@link FileContentService.onDidContentChange} and
 * routes filesystem events into editor + project state machine
 * intents. This is the single funnel that keeps **every** UI store
 * (open tabs, geometry actors, parameter entries, main entry path
 * pointer) consistent with the filesystem.
 *
 * Design (mirrors VS Code's `IWorkingCopyFileService` participants):
 *
 * - Filesystem operations emit {@link ContentChangeEvent}s through
 *   `WorkspaceFileService` → `WorkerChangeChannel` → `FileContentService`.
 * - Participants observe those events and fan out into machine
 *   intents — no UI component is responsible for keeping the editor
 *   tabs, geometry actors, or main-entry pointer in sync.
 * - This module is **the** rename/delete handler. Direct calls to
 *   `editorRef.send({ type: 'renameFile' })` or `closeFile`-prefix
 *   loops from explorer components are obsolete and must be removed
 *   (otherwise the work double-fires).
 *
 * @see docs/research/editor-filesystem-surface-audit.md — section
 * R3 "Editor machine owns the tabs set; Dockview is a reconciler;
 * filesystem operations flow through participants".
 */

import type { ContentChangeEvent, FileContentService } from '@taucad/fs-client/file-content-service';
import type { ActorRefFrom } from 'xstate';
import type { editorMachine } from '#machines/editor.machine.js';
import type { ProjectFileActivityOperation, projectMachine } from '#machines/project.machine.js';

const sendProjectFileActivity = (
  projectRef: ActorRefFrom<typeof projectMachine>,
  operation: ProjectFileActivityOperation,
  paths: readonly string[],
): void => {
  projectRef.send({ type: 'projectFileActivity', operation, paths });
};

/**
 * Wire participants for a project's editor + project machine pair.
 *
 * Returns a disposer that unsubscribes from the content service. The
 * function is idempotent: calling the disposer twice is safe.
 *
 * Path translation: all paths arriving in {@link ContentChangeEvent}s
 * are already workspace-relative (translated upstream in
 * `WorkerChangeChannel`), so the participant performs raw string
 * comparison and `startsWith(prefix + '/')` for subtree matches.
 */
export function mountFileOperationParticipants(init: {
  readonly contentService: FileContentService;
  readonly editorRef: ActorRefFrom<typeof editorMachine>;
  readonly projectRef: ActorRefFrom<typeof projectMachine>;
}): () => void {
  const { contentService, editorRef, projectRef } = init;

  return contentService.onDidContentChange((event: ContentChangeEvent) => {
    switch (event.type) {
      case 'written': {
        sendProjectFileActivity(projectRef, 'written', [event.path]);
        return;
      }
      case 'batchWritten': {
        sendProjectFileActivity(projectRef, 'batchWritten', event.paths);
        return;
      }
      case 'directoryCreated': {
        sendProjectFileActivity(projectRef, 'directoryCreated', [event.path]);
        return;
      }
      case 'fileCopied': {
        sendProjectFileActivity(projectRef, 'fileCopied', [event.targetPath]);
        return;
      }
      case 'directoryCopied': {
        sendProjectFileActivity(projectRef, 'directoryCopied', [event.targetPath]);
        return;
      }
      case 'renamed':
      case 'directoryRenamed': {
        // Editor: re-write path in place on every affected tab. The
        // existing `renameFile` action handles both single-file and
        // prefix (directory) renames in one pass.
        editorRef.send({ type: 'renameFile', oldPath: event.oldPath, newPath: event.newPath });
        // Project: rewrite path-keyed maps and `mainEntryPath` so
        // open viewers / CAD actors / parameters survive the move.
        projectRef.send({ type: 'fileMoved', oldPath: event.oldPath, newPath: event.newPath });
        sendProjectFileActivity(projectRef, event.type, [event.oldPath, event.newPath]);
        return;
      }
      case 'deleted': {
        // Editor: close the matching tab if any. Path is exact, no
        // prefix scan needed for single-file deletes.
        editorRef.send({ type: 'closeFile', path: event.path });
        editorRef.send({ type: 'pruneComponentDisplayForDeletedPath', path: event.path });
        projectRef.send({ type: 'fileDeleted', path: event.path });
        sendProjectFileActivity(projectRef, 'deleted', [event.path]);
        return;
      }
      case 'directoryDeleted': {
        // Editor: close every tab whose path is *inside* the deleted
        // directory. The snapshot read is cheap; sending one close
        // intent per match keeps the existing single-file action
        // working without introducing a new prefix discriminator.
        const snapshot = editorRef.getSnapshot();
        const prefix = `${event.path}/`;
        for (const file of snapshot.context.openFiles) {
          if (file.path === event.path || file.path.startsWith(prefix)) {
            editorRef.send({ type: 'closeFile', path: file.path });
          }
        }
        editorRef.send({ type: 'pruneComponentDisplayForDeletedPath', path: event.path });
        projectRef.send({ type: 'directoryDeleted', path: event.path });
        sendProjectFileActivity(projectRef, 'directoryDeleted', [event.path]);
        return;
      }
      // 'read' does not represent a project mutation.
      default: {
        break;
      }
    }
  });
}
