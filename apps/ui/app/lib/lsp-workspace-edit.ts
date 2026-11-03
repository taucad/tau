import type * as LSP from 'vscode-languageserver-protocol';
import { URI } from 'vscode-uri';
import { WorkspacePathResolver } from '@taucad/fs-client/workspace-path-resolver';
import type { EditorDocument } from '#lib/editor-document.js';
import type { EditorLanguageEnvironment } from '#lib/editor-language-environment.js';
import { applyEditorWorkspaceEdits } from '#lib/editor-workspace-edits.js';
import type { EditorWorkspaceEdit } from '#lib/editor-workspace-edits.js';
import { decodeTextFile } from '#utils/filesystem.utils.js';

/** The request-time text and version of each source a language server edit may touch, keyed by file URI. */
export type LspEditBasis = ReadonlyMap<string, Readonly<{ version: number; text: string }>>;

/** Which project sources a language server reads, and the name its errors carry. */
export type LspEditSources = Readonly<{ language: string; extension: string; maximumFiles: number }>;

function offsetAt(text: string, position: LSP.Position): number {
  let offset = 0;
  for (let line = 0; line < position.line; line++) {
    const next = text.indexOf('\n', offset);
    if (next === -1) {
      return text.length;
    }
    offset = next + 1;
  }
  const end = text.indexOf('\n', offset);
  return Math.min(offset + position.character, end === -1 ? text.length : end);
}

/** Snapshot every project source of the language before a request, so an edit computed on other text is refused. */
export async function captureLspEditBasis(
  document: EditorDocument,
  environment: EditorLanguageEnvironment,
  { language, extension, maximumFiles }: LspEditSources,
): Promise<LspEditBasis> {
  const basis = new Map<string, { version: number; text: string }>([
    [document.uri, { version: document.version, text: document.text }],
  ]);
  const paths = new WorkspacePathResolver(environment.fileManagerRef.getSnapshot().context.rootDirectory);
  const files = await environment.treeService.searchFiles(extension, { maxResults: maximumFiles + 1 });
  if (files.length > maximumFiles) {
    throw new Error(`${language} workspace edit exceeds the bounded source snapshot`);
  }
  const pending: Array<Promise<void>> = [];
  for (const file of files) {
    const path = file.path.startsWith('/') ? paths.toRelativePath(file.path) : file.path;
    if (
      !path?.endsWith(extension) ||
      file.type !== 'file' ||
      (file.provenance && file.provenance.source !== 'project')
    ) {
      continue;
    }
    const loaded = environment.session.get(path);
    if (loaded) {
      basis.set(loaded.uri, { version: loaded.version, text: loaded.text });
      continue;
    }
    pending.push(
      (async () => {
        const result = await environment.contentService.resolve(path);
        if (result.kind === 'text') {
          basis.set(URI.file(`/${path}`).toString(), { version: 1, text: decodeTextFile(result.content) });
        }
      })(),
    );
  }
  await Promise.all(pending);
  if (document.version !== basis.get(document.uri)?.version) {
    throw new Error(`${language} source changed during snapshot`);
  }
  return basis;
}

/**
 * Apply a server `WorkspaceEdit` against its request-time sources: a versioned document change must match the
 * basis version, and every target must still hold the basis text, or no file changes.
 */
export async function applyLspWorkspaceEdit(
  edit: LSP.WorkspaceEdit,
  {
    environment,
    basis,
    language,
  }: Readonly<{ environment: EditorLanguageEnvironment; basis: LspEditBasis; language: string }>,
): Promise<void> {
  const entries: Array<{ uri: string; version?: number; edits: LSP.TextEdit[] }> =
    edit.documentChanges?.flatMap((change) =>
      'textDocument' in change
        ? [
            {
              uri: change.textDocument.uri,
              version: change.textDocument.version ?? undefined,
              edits: change.edits as LSP.TextEdit[],
            },
          ]
        : [],
    ) ?? Object.entries(edit.changes ?? {}).map(([uri, edits]) => ({ uri, version: undefined, edits }));
  const prepared = entries.map((entry): EditorWorkspaceEdit => {
    const requestBasis = basis.get(entry.uri);
    if (!requestBasis) {
      throw new Error(`${language} workspace edit lacks a request-time source snapshot: ${entry.uri}`);
    }
    if (entry.version !== undefined && entry.version !== requestBasis.version) {
      throw new Error(`${language} workspace edit has a stale document version: ${entry.uri}`);
    }
    return {
      uri: entry.uri,
      baseText: requestBasis.text,
      workerVersion: entry.version,
      changes: entry.edits
        .map((item) => ({
          from: offsetAt(requestBasis.text, item.range.start),
          to: offsetAt(requestBasis.text, item.range.end),
          insert: item.newText,
        }))
        .toSorted((left, right) => left.from - right.from),
    };
  });
  if (!(await applyEditorWorkspaceEdits(environment, prepared))) {
    throw new Error(`${language} workspace edit was refused by the filesystem authority`);
  }
}
