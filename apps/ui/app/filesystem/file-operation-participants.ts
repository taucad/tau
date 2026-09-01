/**
 * @fileoverview File-operation participants.
 *
 * Subscribes to {@link FileContentService.onDidContentChange} and
 * routes filesystem events into editor + project state machine
 * intents. This is the single funnel that keeps **every** UI store
 * (open tabs, geometry actors, parameter entries, main entry file
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
import type { projectMachine } from '#machines/project.machine.js';

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
      case 'renamed':
      case 'directoryRenamed': {
        // Editor: re-write path in place on every affected tab. The
        // existing `renameFile` action handles both single-file and
        // prefix (directory) renames in one pass.
        editorRef.send({ type: 'renameFile', oldPath: event.oldPath, newPath: event.newPath });
        // Project: rewrite path-keyed maps and `mainEntryFile` so
        // open viewers / CAD actors / parameters survive the move.
        projectRef.send({ type: 'fileMoved', oldPath: event.oldPath, newPath: event.newPath });
        return;
      }
      case 'deleted': {
        // Editor: close the matching tab if any. Path is exact, no
        // prefix scan needed for single-file deletes.
        editorRef.send({ type: 'closeFile', path: event.path });
        projectRef.send({ type: 'fileDeleted', path: event.path });
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
        projectRef.send({ type: 'directoryDeleted', path: event.path });
        return;
      }
      // 'written' / 'read' / 'batchWritten' / 'directoryCreated' are
      // not in scope for participants — they do not invalidate any
      // tab identity or actor key.
      default: {
        break;
      }
    }
  });
}
