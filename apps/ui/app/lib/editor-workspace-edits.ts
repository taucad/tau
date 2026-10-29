import { URI } from 'vscode-uri';
import type { EditorDocument, TextChange } from '#lib/editor-document.js';
import type { EditorLanguageEnvironment } from '#lib/editor-language-environment.js';
import { workspacePathFromFileUri } from '#lib/editor-workspace-fs/editor-workspace-fs.js';

/** Exact source text used by a language service when it computed these replacements. */
export type EditorWorkspaceEdit = Readonly<{
  uri: string;
  baseText: string;
  workerVersion?: number;
  changes: readonly TextChange[];
}>;

type PreparedEdit = Readonly<{
  path: string;
  document: EditorDocument;
  version: number;
  edit: EditorWorkspaceEdit;
}>;

function validChanges(changes: readonly TextChange[], length: number): boolean {
  let end = 0;
  for (const change of changes) {
    if (
      !Number.isInteger(change.from) ||
      !Number.isInteger(change.to) ||
      change.from < end ||
      change.to < change.from ||
      change.to > length
    ) {
      return false;
    }
    end = change.to;
  }
  return true;
}

/** Preflight every target against its worker basis, then persist through checked editor saves. */
export async function applyEditorWorkspaceEdits(
  environment: Pick<EditorLanguageEnvironment, 'session' | 'treeService'>,
  edits: readonly EditorWorkspaceEdit[],
): Promise<boolean> {
  const { session, treeService } = environment;
  const held = new Set<string>();
  const prepared: PreparedEdit[] = [];
  try {
    for (const edit of edits) {
      if (edit.changes.length === 0) {
        continue;
      }
      const uri = URI.parse(edit.uri);
      if (uri.scheme !== 'file' || uri.authority || uri.query || uri.fragment) {
        return false;
      }
      const path = workspacePathFromFileUri(uri);
      if (held.has(path) || !validChanges(edit.changes, edit.baseText.length)) {
        return false;
      }
      // oxlint-disable-next-line eslint/no-await-in-loop -- preflight retains one ordered lease per target.
      const entry = await treeService.getEntry(path);
      if (entry?.type !== 'file' || (entry.provenance && entry.provenance.source !== 'project')) {
        return false;
      }
      held.add(path);
      // oxlint-disable-next-line eslint/no-await-in-loop -- every acquired document is retained until all targets pass.
      const document = await session.acquire(path);
      if (!document || document.text !== edit.baseText) {
        return false;
      }
      prepared.push({ path, document, version: document.version, edit });
    }
    if (
      prepared.length === 0 ||
      prepared.some(
        ({ path, document, version, edit }) =>
          session.get(path) !== document || document.version !== version || document.text !== edit.baseText,
      )
    ) {
      return false;
    }
    // No await between the final preflight and document mutation: filesystem events cannot interleave.
    for (const { path, version, edit } of prepared) {
      const applied = session.apply(path, {
        changes: edit.changes,
        expectedVersion: version,
        origin: 'workspace-edit',
      });
      if (!applied) {
        throw new Error(`Workspace edit could not be applied to ${path}`);
      }
    }
    await Promise.all(prepared.map(async ({ path }) => session.save(path)));
    return true;
  } finally {
    for (const path of held) {
      session.release(path);
    }
  }
}
