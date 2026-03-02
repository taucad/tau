/**
 * Monaco Navigation Service (Public API)
 *
 * Uses `monaco.editor.registerEditorOpener()` -- the official public API for
 * cross-model navigation. Eliminates all access to `_codeEditorService`
 * (undocumented internal Monaco API).
 *
 * Registered ONCE globally in the provider (not per-editor instance).
 * Dispatches navigation requests through registered handlers from
 * language contributions.
 */

import type * as Monaco from 'monaco-editor';
import type { AnyActorRef, Subscription } from 'xstate';
import type { MonacoModelService } from '#lib/monaco-model-service.js';
import type { NavigationHandler } from '#lib/monaco-language-registry.js';

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
  modelService: MonacoModelService;
  handlers: NavigationHandler[];
}): Monaco.IDisposable {
  const { monaco, editorRef, modelService, handlers } = options;

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
      // Only handle file:// scheme
      if (resource.scheme !== 'file') {
        return false;
      }

      // Extract relative path
      const relativePath = extractPathFromUri(resource.path);
      if (!relativePath) {
        return false;
      }

      // Find a handler that can handle this path
      const handler = handlers.find((h) => h.canHandle(relativePath));
      if (!handler) {
        return false;
      }

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

      // Ensure the target model exists (async, fire-and-forget)
      // eslint-disable-next-line promise/prefer-await-to-then, promise/prefer-catch -- cannot be async here
      void modelService.getOrEnsureModel(relativePath).then(
        () => {
          // Model loaded (or already existed), now open the file
          const isReadOnly = handler.isReadOnly?.(relativePath) ?? false;

          editorRef.send({
            type: 'openFile',
            path: relativePath,
            source: 'user',
            readOnly: isReadOnly,
            lineNumber,
            column,
          });
        },
        () => {
          // Model load failed -- clear pending navigation
          pendingNavigation = undefined;
          if (pendingTimerId !== undefined) {
            clearTimeout(pendingTimerId);
            pendingTimerId = undefined;
          }
        },
      );

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
