/**
 * TypeScript file-rename participant (R17).
 *
 * Subscribes to {@link FileContentService.onDidContentChange} and, on
 * every `renamed` / `directoryRenamed` event whose extension matches
 * `.ts` / `.tsx` / `.js` / `.jsx`, invokes the TS language-service
 * worker's `getEditsForFileRename` to compute the cascade of import-path
 * updates that need to land in every consumer file. The edits are
 * applied as a single Monaco `pushEditOperations` per affected model
 * so the user sees one undo step instead of N.
 *
 * Why participant pattern: the rename has already executed at the
 * filesystem layer by the time this fires — the
 * {@link MaterializingRenameAdapter} only handles in-place identifier
 * renames, not module relocation. By tapping the same `onDidContentChange`
 * channel as `MonacoModelService` we guarantee the participant sees
 * every rename (including drag-and-drop) and runs after the editor
 * model has already migrated to the new URI (the rename branch in
 * `MonacoModelService.applyContentChange` runs first because
 * subscribers are dispatched in registration order).
 *
 * @see docs/research/editor-filesystem-surface-audit.md R17
 * @see repos/vscode/extensions/typescript-language-features/src/languageFeatures/updatePathsOnRename.ts
 */

import type * as Monaco from 'monaco-editor';
import type { FileContentService, ContentChangeEvent } from '@taucad/fs-client/file-content-service';
import type { MonacoWorkspaceFs } from '#lib/monaco-workspace-fs/monaco-workspace-fs.types.js';
import type {
  FileTextChangesLike,
  TauTypeScriptLanguageServiceWorker,
} from '#lib/monaco-typescript-extras/ts-worker-extras.types.js';

const tsExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'] as const;

function isTypeScriptLikePath(path: string): boolean {
  return tsExtensions.some((extension) => path.endsWith(extension));
}

/**
 * Worker accessor matching Monaco's
 * `await monaco.languages.typescript.getTypeScriptWorker()` return
 * shape. Kept abstract so the participant is testable without standing
 * up the full Monaco typescript subsystem.
 *
 * @public
 */
export type TsRenameWorkerAccessor = (
  ...resources: readonly Monaco.Uri[]
) => Promise<TauTypeScriptLanguageServiceWorker>;

/**
 * Configuration for {@link registerTsRenameParticipant}.
 *
 * @public
 */
export type TsRenameParticipantConfig = Readonly<{
  monaco: typeof Monaco;
  contentService: FileContentService;
  workspaceFs: MonacoWorkspaceFs;
  getWorker: TsRenameWorkerAccessor;
  /**
   * Optional hook invoked once per applied edit batch (for telemetry
   * + tests). Receives the number of files whose models were updated.
   */
  onEditsApplied?: (filesUpdated: number) => void;
}>;

function workspacePathToFileUri(monaco: typeof Monaco, workspacePath: string): Monaco.Uri {
  return monaco.Uri.file(`/${workspacePath}`);
}

function rewritePathPrefix(path: string, oldPrefix: string, newPrefix: string): string {
  if (path === oldPrefix) {
    return newPrefix;
  }
  if (oldPrefix === '') {
    return path;
  }
  if (path.startsWith(`${oldPrefix}/`)) {
    return `${newPrefix}/${path.slice(oldPrefix.length + 1)}`;
  }
  return path;
}

/**
 * Apply a single worker-returned {@link FileTextChangesLike} batch to
 * the matching Monaco models. Each file's edits land as one
 * `pushEditOperations` so the user sees one undo entry per file.
 *
 * @returns The number of files whose models were updated.
 */
async function applyFileTextChanges(
  monaco: typeof Monaco,
  workspaceFs: MonacoWorkspaceFs,
  changes: readonly FileTextChangesLike[],
): Promise<number> {
  if (changes.length === 0) {
    return 0;
  }
  const uris = changes.map((change) => monaco.Uri.parse(change.fileName));
  await workspaceFs.materialiseUrisForWorkspaceEdit(uris);

  let filesUpdated = 0;
  for (const [index, change] of changes.entries()) {
    const uri = uris[index];
    if (uri === undefined) {
      continue;
    }
    const model = monaco.editor.getModel(uri);
    if (model === null) {
      continue;
    }
    const edits: Monaco.editor.IIdentifiedSingleEditOperation[] = change.textChanges.map((textChange) => {
      const startPosition = model.getPositionAt(textChange.span.start);
      const endPosition = model.getPositionAt(textChange.span.start + textChange.span.length);
      return {
        range: new monaco.Range(
          startPosition.lineNumber,
          startPosition.column,
          endPosition.lineNumber,
          endPosition.column,
        ),
        text: textChange.newText,
      };
    });
    if (edits.length > 0) {
      model.pushEditOperations([], edits, () => null);
      filesUpdated += 1;
    }
  }
  return filesUpdated;
}

/**
 * Compute the set of (oldFileUri → newFileUri) pairs to feed into the
 * worker. A directory rename expands into one pair per affected
 * descendant whose extension matches {@link isTypeScriptLikePath}.
 */
function pairsForEvent(
  monaco: typeof Monaco,
  event: ContentChangeEvent,
  knownPaths: readonly string[],
): ReadonlyArray<Readonly<{ oldUri: Monaco.Uri; newUri: Monaco.Uri }>> {
  if (event.type === 'renamed') {
    if (!isTypeScriptLikePath(event.oldPath) && !isTypeScriptLikePath(event.newPath)) {
      return [];
    }
    return [
      {
        oldUri: workspacePathToFileUri(monaco, event.oldPath),
        newUri: workspacePathToFileUri(monaco, event.newPath),
      },
    ];
  }

  if (event.type !== 'directoryRenamed') {
    return [];
  }

  const pairs: Array<Readonly<{ oldUri: Monaco.Uri; newUri: Monaco.Uri }>> = [];
  const oldPrefix = event.oldPath;
  const oldPrefixWithSlash = oldPrefix === '' ? '' : `${oldPrefix}/`;
  for (const path of knownPaths) {
    if (path !== oldPrefix && !path.startsWith(oldPrefixWithSlash)) {
      continue;
    }
    if (!isTypeScriptLikePath(path)) {
      continue;
    }
    const newPath = rewritePathPrefix(path, oldPrefix, event.newPath);
    pairs.push({
      oldUri: workspacePathToFileUri(monaco, path),
      newUri: workspacePathToFileUri(monaco, newPath),
    });
  }
  return pairs;
}

/**
 * Register the rename participant. Returns a disposer the host invokes
 * on Monaco teardown so we don't leak the
 * {@link FileContentService.onDidContentChange} subscription.
 *
 * @param config - See {@link TsRenameParticipantConfig}.
 * @returns A disposer that unsubscribes from `onDidContentChange`.
 * @public
 */
export function registerTsRenameParticipant(config: TsRenameParticipantConfig): { dispose(): void } {
  const { monaco, contentService, workspaceFs, getWorker, onEditsApplied } = config;
  const unsubscribe = contentService.onDidContentChange((event) => {
    if (event.type !== 'renamed' && event.type !== 'directoryRenamed') {
      return;
    }
    void handleEvent(event);
  });

  async function handleEvent(event: ContentChangeEvent): Promise<void> {
    const knownPaths = collectKnownModelPaths(monaco);
    const pairs = pairsForEvent(monaco, event, knownPaths);
    if (pairs.length === 0) {
      return;
    }

    try {
      let totalFilesUpdated = 0;
      for (const pair of pairs) {
        // oxlint-disable-next-line no-await-in-loop -- Sequential per pair so the worker sees the project graph in a deterministic state
        const worker = await getWorker(pair.newUri);
        // oxlint-disable-next-line no-await-in-loop -- Sequential per pair so each undo step lands cleanly
        const changes = await worker.getEditsForFileRename(pair.oldUri.toString(), pair.newUri.toString());
        if (changes === undefined || changes.length === 0) {
          continue;
        }
        // oxlint-disable-next-line no-await-in-loop -- Sequential apply to preserve undo grouping
        totalFilesUpdated += await applyFileTextChanges(monaco, workspaceFs, changes);
      }
      onEditsApplied?.(totalFilesUpdated);
    } catch (error) {
      // Non-fatal: a failure here means the import paths in other
      // consumer files weren't updated, but the rename itself has
      // already succeeded at the filesystem layer. Surface to the
      // console so devs can diagnose, but never throw.
      // oxlint-disable-next-line no-console -- intentional warn for non-fatal language-service failure
      console.warn('[ts-rename-participant] getEditsForFileRename failed; import paths may be stale', error);
    }
  }

  return {
    dispose(): void {
      unsubscribe();
    },
  };
}

function collectKnownModelPaths(monaco: typeof Monaco): readonly string[] {
  const models = monaco.editor.getModels();
  const paths: string[] = [];
  for (const model of models) {
    if (model.uri.scheme !== 'file') {
      continue;
    }
    paths.push(model.uri.path.startsWith('/') ? model.uri.path.slice(1) : model.uri.path);
  }
  return paths;
}
