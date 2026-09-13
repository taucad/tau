import type * as Monaco from 'monaco-editor';
import type { FileStatEntry } from '@taucad/types';
import type { FileContentService, ContentChangeEvent } from '@taucad/fs-client/file-content-service';
import { getMonacoLanguage } from '#lib/monaco.constants.js';
import { decodeTextFile } from '#utils/filesystem.utils.js';
import { debugCmdClick } from '#lib/monaco-workspace-fs/cmd-click-diagnostic.js';
import { MonacoWorkspaceFileNotFoundError } from '#lib/monaco-workspace-fs/file-not-found-error.js';
import type { MonacoFileSystemProvider } from '#lib/monaco-workspace-fs/monaco-workspace-fs.types.js';
import { workspaceRelativePathFromFileUri } from '#lib/monaco-workspace-fs/workspace-path-from-uri.js';

export function isNodeModulesPath(path: string): boolean {
  return path.includes('/node_modules/') || path.startsWith('node_modules/');
}

export type WorkspaceFileSystemProviderOptions = Readonly<{
  monaco: typeof Monaco;
  contentService: FileContentService;
  /**
   * Filename search across the workspace tree (worker-backed). May be sync or async.
   */
  searchFiles?: (
    query: string,
    options?: { maxResults?: number; includeDirectories?: boolean },
  ) => Promise<readonly FileStatEntry[]> | readonly FileStatEntry[];
}>;

/**
 * `file://` workspace provider: Tau workspace-relative paths under a root `file:///` URI.
 */
export function createWorkspaceFileSystemProvider(
  options: WorkspaceFileSystemProviderOptions,
): MonacoFileSystemProvider {
  const { monaco, contentService } = options;

  const provider: MonacoFileSystemProvider = {
    scheme: 'file',

    async readText(uri: Monaco.Uri): Promise<string> {
      const path = workspaceRelativePathFromFileUri(uri.path);
      return readPathAsText(contentService, uri, path);
    },

    peekText(uri: Monaco.Uri): string | undefined {
      const path = workspaceRelativePathFromFileUri(uri.path);
      const outcome = contentService.peekOutcome(path);
      if (outcome.kind === 'text') {
        debugCmdClick('WorkspaceFileSystemProvider.peekText:text', { uri: uri.toString(), path });
        return decodeTextFile(outcome.content);
      }

      if (outcome.kind === 'binary' || outcome.kind === 'too-large') {
        debugCmdClick('WorkspaceFileSystemProvider.peekText:binary-or-too-large', {
          uri: uri.toString(),
          path,
          kind: outcome.kind,
        });
        return undefined;
      }

      debugCmdClick('WorkspaceFileSystemProvider.peekText:no-text', {
        uri: uri.toString(),
        path,
        outcomeKind: outcome.kind,
      });
      return undefined;
    },

    languageId(uri: Monaco.Uri): string | undefined {
      const path = workspaceRelativePathFromFileUri(uri.path);
      return getMonacoLanguage(path);
    },

    isReadOnly(uri: Monaco.Uri): boolean {
      const path = workspaceRelativePathFromFileUri(uri.path);
      return isNodeModulesPath(path);
    },

    /** Per-URI sync for `file://` is handled globally via {@link subscribeWorkspaceContentDispatch}. */
    onDidChange(_uri: Monaco.Uri, _listener: () => void): Monaco.IDisposable {
      // oxlint-disable-next-line eslint/no-empty-function -- Monaco.IDisposable contract; global sync handles `file:`
      return { dispose(): void {} };
    },
  };

  if (options.searchFiles) {
    const searchFilesFunction = options.searchFiles;
    return {
      ...provider,
      async findFiles(pattern: string, findOptions?: { maxResults?: number }) {
        const max = findOptions?.maxResults ?? 100;
        const seen = new Set<string>();
        const out: Monaco.Uri[] = [];

        const pushUri = (uri: Monaco.Uri): void => {
          const key = uri.toString();
          if (seen.has(key) || out.length >= max) {
            return;
          }

          seen.add(key);
          out.push(uri);
        };

        const entries = await Promise.resolve(
          searchFilesFunction(pattern, { maxResults: max, includeDirectories: false }),
        );
        for (const entry of entries) {
          if (out.length >= max) {
            break;
          }

          pushUri(monaco.Uri.file(entry.path.startsWith('/') ? entry.path : `/${entry.path}`));
        }

        return out;
      },
    };
  }

  return provider;
}

/**
 * Single `FileContentService` subscription for workspace-wide model sync (rename, delete, write).
 * Host wires this to {@link MonacoModelService.applyContentChange}.
 */
export function subscribeWorkspaceContentDispatch(
  contentService: FileContentService,
  dispatch: (event: ContentChangeEvent) => void,
): Monaco.IDisposable {
  const unsubscribe = contentService.onDidContentChange(dispatch);
  return { dispose: unsubscribe };
}

async function readPathAsText(contentService: FileContentService, uri: Monaco.Uri, path: string): Promise<string> {
  const uriString = uri.toString();
  debugCmdClick('WorkspaceFileSystemProvider.readPathAsText:enter', { uri: uriString, path });
  const outcome = await contentService.resolve(path);
  debugCmdClick('WorkspaceFileSystemProvider.readPathAsText:resolve-outcome', {
    uri: uriString,
    path,
    outcomeKind: outcome.kind,
  });
  if (outcome.kind === 'text') {
    return decodeTextFile(outcome.content);
  }

  if (outcome.kind === 'binary' || outcome.kind === 'too-large') {
    debugCmdClick('WorkspaceFileSystemProvider.readPathAsText:binary-or-too-large-throw', {
      uri: uriString,
      path,
      kind: outcome.kind,
    });
    throw new MonacoWorkspaceFileNotFoundError(uri);
  }

  debugCmdClick('WorkspaceFileSystemProvider.readPathAsText:not-found-throw', {
    uri: uriString,
    path,
    outcomeKind: outcome.kind,
  });
  throw new MonacoWorkspaceFileNotFoundError(uri);
}
