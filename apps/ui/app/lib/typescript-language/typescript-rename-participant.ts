import { URI } from 'vscode-uri';
import type { ContentChangeEvent } from '@taucad/fs-client/file-content-service';
import type { TypeScriptEditBasis } from '@taucad/lsp/typescript-worker/typescript-service';
import type { EditorLanguageEnvironment } from '#lib/editor-language-environment.js';
import { applyEditorWorkspaceEdits } from '#lib/editor-workspace-edits.js';
import type { TypeScriptService } from '#lib/typescript-language/typescript-service.js';

const scriptExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'];

function isScript(path: string): boolean {
  return scriptExtensions.some((extension) => path.endsWith(extension));
}

function renamePairs(
  environment: EditorLanguageEnvironment,
  event: ContentChangeEvent,
): Array<Readonly<{ oldUri: string; newUri: string }>> {
  if (event.type === 'renamed') {
    return isScript(event.oldPath) || isScript(event.newPath)
      ? [{ oldUri: URI.file(`/${event.oldPath}`).toString(), newUri: URI.file(`/${event.newPath}`).toString() }]
      : [];
  }
  if (event.type !== 'directoryRenamed') {
    return [];
  }
  const prefix = `${event.newPath}/`;
  return [...environment.treeService.getTreeSnapshot().keys()]
    .filter((path) => path.startsWith(prefix) && isScript(path))
    .map((path) => ({
      oldUri: URI.file(`/${event.oldPath}${path.slice(event.newPath.length)}`).toString(),
      newUri: URI.file(`/${path}`).toString(),
    }));
}

/** Keep consumer imports checked and persisted after a project file or folder moves. */
export function registerTypeScriptRenameParticipant(
  environment: EditorLanguageEnvironment,
  service: TypeScriptService,
): () => void {
  let stopped = false;
  let queue = Promise.resolve();
  const handle = async (event: ContentChangeEvent): Promise<void> => {
    for (const pair of renamePairs(environment, event)) {
      try {
        // oxlint-disable-next-line eslint/no-await-in-loop -- each rename observes the preceding checked import rewrite.
        const edits = await service.client.request<readonly TypeScriptEditBasis[]>({
          kind: 'fileRenameEditsWithBases',
          oldUri: pair.oldUri,
          newUri: pair.newUri,
        });
        if (stopped) {
          return;
        }
        if (edits.length > 0) {
          // oxlint-disable-next-line eslint/no-await-in-loop -- each rename observes the preceding checked import rewrite.
          await applyEditorWorkspaceEdits(environment, edits);
        }
      } finally {
        const document = environment.session.get(URI.parse(pair.newUri).path.slice(1));
        if (document) {
          // oxlint-disable-next-line eslint/no-await-in-loop -- one file move updates one worker mirror at a time.
          await service.relocate(document);
        }
      }
    }
  };
  const enqueue = async (prior: Promise<void>, event: ContentChangeEvent): Promise<void> => {
    try {
      await prior;
      if (!stopped) {
        await handle(event);
      }
    } catch (error) {
      // The filesystem rename already succeeded. Keep editing alive and retain a visible diagnostic for repair.
      // oxlint-disable-next-line no-console -- a failed post-rename import rewrite needs operator visibility.
      console.warn('[typescript] import path rewrite after file rename failed', error);
    }
  };
  const unsubscribe = environment.contentService.onDidContentChange((event) => {
    if (event.type === 'renamed' || event.type === 'directoryRenamed') {
      queue = enqueue(queue, event);
    }
  });
  return () => {
    stopped = true;
    unsubscribe();
  };
}
