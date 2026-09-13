/**
 * Monaco Navigation Service (Public API)
 *
 * Uses `monaco.editor.registerEditorOpener()` -- the official public API for
 * cross-model navigation. Eliminates all access to `_codeEditorService`
 * (undocumented internal Monaco API).
 *
 * Registered ONCE globally in the provider (not per-editor instance).
 */

import type * as Monaco from 'monaco-editor';
import type { AnyActorRef, Subscription } from 'xstate';
import { debugCmdClick } from '#lib/monaco-workspace-fs/cmd-click-diagnostic.js';
import type { MonacoWorkspaceFs } from '#lib/monaco-workspace-fs/monaco-workspace-fs.types.js';

type PendingNavigation = {
  path: string;
  lineNumber: number;
  column: number;
};

/**
 * Extract the relative path from a root-level Monaco URI path.
 * Strips the leading slash from paths like /main.ts -> main.ts
 */
function extractPathFromUri(uriPath: string): string {
  return uriPath.startsWith('/') ? uriPath.slice(1) : uriPath;
}

/**
 * Register a global editor opener using Monaco's public API.
 * Called ONCE from the provider hook (not per-editor instance).
 *
 * The opener handles cross-model navigation (e.g., Cmd+Click on import).
 * Same-file navigation (e.g., Cmd+Click on local variable) is handled
 * natively by Monaco -- the opener is only called for cross-model navigation.
 */
export function registerMonacoNavigation(options: {
  monaco: typeof Monaco;
  editorRef: AnyActorRef;
  workspaceFs: MonacoWorkspaceFs;
}): Monaco.IDisposable {
  const { monaco, editorRef, workspaceFs } = options;

  let pendingNavigation: PendingNavigation | undefined;
  let fileOpenedSub: Subscription | undefined;
  let pendingTimerId: ReturnType<typeof setTimeout> | undefined;

  // Subscribe to fileOpened events for position jumping after file opens
  fileOpenedSub = editorRef.on('fileOpened', (event: { path: string; lineNumber?: number; column?: number }) => {
    if (event.path !== pendingNavigation?.path) {
      return;
    }

    const capturedNavigation = pendingNavigation;
    pendingNavigation = undefined;

    // Clear any pending timer
    if (pendingTimerId !== undefined) {
      clearTimeout(pendingTimerId);
      pendingTimerId = undefined;
    }

    // Defer Monaco navigation until after the layout has fully settled.
    // Double rAF ensures we wait for both React render and browser layout/paint cycles.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const targetUri = monaco.Uri.file(`/${capturedNavigation.path}`);
        const targetModel = monaco.editor.getModel(targetUri);

        if (targetModel) {
          const editors = monaco.editor.getEditors();
          const targetEditor = editors.find((editorInstance) => editorInstance.getModel() === targetModel);

          if (targetEditor) {
            const position = new monaco.Position(capturedNavigation.lineNumber, capturedNavigation.column);
            targetEditor.setPosition(position);
            targetEditor.revealPositionInCenter(position);
            targetEditor.focus();
          }
        }
      });
    });
  });

  // Register the global editor opener using public API
  const openerDisposable = monaco.editor.registerEditorOpener({
    openCodeEditor(
      _source: Monaco.editor.ICodeEditor,
      resource: Monaco.Uri,
      selectionOrPosition?: Monaco.IRange | Monaco.IPosition,
    ): boolean {
      const resourceString = resource.toString();
      debugCmdClick('registerMonacoNavigation.openCodeEditor:enter', {
        uri: resourceString,
        scheme: resource.scheme,
      });
      if (resource.scheme !== 'file') {
        debugCmdClick('registerMonacoNavigation.openCodeEditor:reject-non-file', {
          uri: resourceString,
          scheme: resource.scheme,
        });
        return false;
      }

      const relativePath = extractPathFromUri(resource.path);
      if (!relativePath) {
        debugCmdClick('registerMonacoNavigation.openCodeEditor:reject-empty-path', { uri: resourceString });
        return false;
      }

      const targetUri = monaco.Uri.file(`/${relativePath}`);
      if (!workspaceFs.canMaterialise(targetUri)) {
        debugCmdClick('registerMonacoNavigation.openCodeEditor:reject-cannot-materialise', {
          uri: resourceString,
          targetUri: targetUri.toString(),
        });
        return false;
      }
      debugCmdClick('registerMonacoNavigation.openCodeEditor:accept', {
        uri: resourceString,
        relativePath,
      });

      // Extract position from selection/position
      let lineNumber = 1;
      let column = 1;

      if (selectionOrPosition) {
        if ('startLineNumber' in selectionOrPosition) {
          // IRange
          lineNumber = selectionOrPosition.startLineNumber;
          column = selectionOrPosition.startColumn;
        } else if ('lineNumber' in selectionOrPosition) {
          // IPosition
          lineNumber = selectionOrPosition.lineNumber;
          column = selectionOrPosition.column;
        }
      }

      // Store pending navigation for position jumping
      pendingNavigation = { path: relativePath, lineNumber, column };

      // Clear any previous pending timer
      if (pendingTimerId !== undefined) {
        clearTimeout(pendingTimerId);
      }

      // Set a timeout to clear stale pending navigation (5 seconds)
      pendingTimerId = setTimeout(() => {
        pendingNavigation = undefined;
        pendingTimerId = undefined;
      }, 5000);

      const openTarget = (): void => {
        try {
          const fileFs = workspaceFs.getFileSystemProvider('file');
          const readOnly = fileFs?.isReadOnly?.(targetUri) ?? false;

          editorRef.send({
            type: 'openFile',
            path: relativePath,
            source: 'user',
            readOnly,
            lineNumber,
            column,
          });
        } catch {
          pendingNavigation = undefined;
          if (pendingTimerId !== undefined) {
            clearTimeout(pendingTimerId);
            pendingTimerId = undefined;
          }
        }
      };

      openTarget();

      // Return true to indicate we're handling this navigation
      return true;
    },
  });

  return {
    dispose() {
      openerDisposable.dispose();
      fileOpenedSub?.unsubscribe();
      fileOpenedSub = undefined;

      if (pendingTimerId !== undefined) {
        clearTimeout(pendingTimerId);
        pendingTimerId = undefined;
      }

      pendingNavigation = undefined;
    },
  };
}
